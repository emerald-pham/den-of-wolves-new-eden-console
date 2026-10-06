import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EndeavourResearchChoices from '@/components/EndeavourResearchChoices';
import { useSessionStore } from '@/store/useSessionStore';
import { readEndeavourResearchWorkspace, createEndeavourResearchAttempt,
  advanceEndeavourResearchTrack, type EndeavourResearchWorkspace } from './endeavourResearchService';
import { resolveEndeavourResearchChoice } from '../../functions/src/endeavourResearchCadence';
import { ENDEAVOUR_RESEARCH_TRACKS, endeavourResearchTrack } from '../../functions/src/endeavourResearch';
import type { GameSession, Player } from '@/types/game';

const transport = vi.hoisted(() => ({ callable: vi.fn(), invoke: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: transport.callable }));
vi.mock('./firebase', () => ({ functions: () => 'native-inert-transport' }));

type Row = Record<string, unknown>;
const root = resolve(import.meta.dirname, '../..');
function source(path: string) {
  const text = readFileSync(resolve(root, path), 'utf8');
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function find<T extends ts.Node>(tree: ts.Node, predicate: (node: ts.Node) => node is T): T {
  let result: T | undefined;
  function visit(node: ts.Node) {
    if (result) return;
    if (predicate(node)) result = node;
    else ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(result, 'The current original source boundary must exist.'); return result;
}
function functionText(tree: ts.SourceFile, name: string) {
  return find(tree, (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name).getText(tree).replace(/^export /, '');
}
function js(text: string) {
  return ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const ui = source('scripts/pc10-full-game-demo-ui-proof.mjs');
const capy = source('scripts/pc10-capybara-full-gameplay.mjs');
const writer = source('functions/src/endeavourResearchWriter.ts');
const helpers = source('scripts/pc10-base-combat-deduction-contracts.mjs');
const base = source('scripts/pc10-base-combat-deduction-ui-proof.mjs');
const receipts = source('scripts/pc10-browser-ui-receipt.mjs');
const runner = find(ui, (node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'runFreshFullGameDemoUi');
assert.ok(runner.body);
const firstIo = runner.body.statements.findIndex(statement =>
  ts.isVariableStatement(statement) && statement.declarationList.declarations.some(node => node.name.getText(ui) === 'baseUrl'));
assert.ok(firstIo > 0);
const config = new Function('assert', js(`return options => {
  ${runner.body.statements.slice(0, firstIo).map(node => node.getText(ui)).join('\n')}
  return { gameplayOnly, gameplayManagesPhases: options.gameplayManagesPhases === true };
};`))(assert) as (options: Row) => { gameplayOnly: boolean; gameplayManagesPhases: boolean };
const startedCall = find(runner, (node): node is ts.ExpressionStatement =>
  ts.isExpressionStatement(node) && node.getText(ui).startsWith('await options.onStarted?.('));
const endingCall = find(runner, (node): node is ts.ExpressionStatement =>
  ts.isExpressionStatement(node) && node.getText(ui).startsWith('await options.runEnding('));
const ordinaryLoop = find(runner, (node): node is ts.IfStatement =>
  ts.isIfStatement(node) && node.expression.getText(ui) === '!gameplayOnly' &&
  node.thenStatement.getText(ui).includes('for (const actor of roster)'));
assert.ok(ts.isBlock(ordinaryLoop.thenStatement));
const loopStatements = ordinaryLoop.thenStatement.statements;
const phaseStart = loopStatements.findIndex(node => node.getText(ui).includes('teamBeforeManualAdvance') ||
  node.getText(ui).startsWith("await mark('manual Team to Coordination"));
const afterPhase = loopStatements.findIndex((node, index) => index > phaseStart &&
  node.getText(ui) === 'await crew.page.reload();');
assert.ok(phaseStart >= 0 && afterPhase > phaseStart);
// Exact existing phase/control slice, not a reimplementation of its predicate.
const phaseBody = loopStatements.slice(phaseStart, afterPhase).map(node => node.getText(ui)).join('\n');
const produce = new Function('assert', js(`return async (options, context, mark, delay, evidence) => {
  const { gm, crew, initial, started, roster, directory } = context;
  const { gameplayOnly, gameplayManagesPhases } = options;
  let coordination;
  ${startedCall.getText(ui)}
  if (${ordinaryLoop.expression.getText(ui)}) { ${phaseBody} }
  if (options.runEnding) { ${endingCall.getText(ui)} }
  return { coordination, evidence };
};`))(assert) as (options: Row, context: Row, mark: (name: string) => void,
  delay: (ms: number) => Promise<void>, evidence: Row) => Promise<Row>;
const evaluateStage = new Function('SUCCESS_RESULT_STATUSES', js(
  `${functionText(capy, 'sourceActionStageOutcome')}\nreturn sourceActionStageOutcome;`,
))(new Set(['committed', 'replayed'])) as (input: Row) => Row;
const readPrivate = new Function('isResearchProgress', 'researchTracks', 'turnPhaseState',
  'parseEndeavourResearchCadenceState', 'parseEndeavourFieldUpgradeState', 'HttpsError', js(
    `${functionText(writer, 'readPrivateState')}\nreturn readPrivateState;`,
  ));
const isResearchProgress = new Function('isRecord', 'ENDEAVOUR_RESEARCH_TRACKS', 'endeavourResearchTrack', js(
  `${functionText(writer, 'isResearchProgress')}\nreturn isResearchProgress;`,
))((value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value),
  ENDEAVOUR_RESEARCH_TRACKS, endeavourResearchTrack) as
  (value: unknown) => boolean;
// Producer dependencies are actual pure source functions. Document access alone
// is inert. No server, browser, Auth actor, full-game fixture or acceptance exists.
const tracks = (progress: unknown) => Object.keys(ENDEAVOUR_RESEARCH_TRACKS).map(id =>
  endeavourResearchTrack(progress, id as keyof typeof ENDEAVOUR_RESEARCH_TRACKS));

import { parseEndeavourResearchCadenceState } from '../../functions/src/endeavourResearchCadence';
import { parseEndeavourFieldUpgradeState } from '../../functions/src/endeavourFieldUpgrades';
import { turnPhaseState } from '../../functions/src/turnZero';
const workspaceFromSource = readPrivate(isResearchProgress, tracks, turnPhaseState,
  parseEndeavourResearchCadenceState, parseEndeavourFieldUpgradeState, Error) as
  (sid: string, session: { get: (key: string) => unknown }, research: Row, cadence: Row, upgrades: Row, ore: number) => EndeavourResearchWorkspace;
const proofReceipt = new Function('assert', 'delay', js(
  `${functionText(helpers, 'assertOriginalIdentity')}\n${functionText(helpers, 'assertOriginalBaseActor')}\n` +
  `${functionText(helpers, 'waitForBaseResearchReceipt')}\nreturn waitForBaseResearchReceipt;`,
))(assert, async () => { assert.fail('Immediate native receipt must not need another sample or timer.'); }) as
  (input: Row) => Promise<unknown>;
const observeReceipt = new Function(js(`${functionText(receipts, 'observeUiReceipt')}\nreturn observeUiReceipt;`))() as
  (input: Row) => Promise<unknown>;
const originalActor = new Function('assert', js(`${functionText(helpers, 'assertOriginalIdentity')}\n` +
  `${functionText(helpers, 'assertOriginalBaseActor')}\nreturn assertOriginalBaseActor;`))(assert) as
  (current: Row, original: Row) => void;
const hash = (value: unknown) => JSON.stringify(value);
const captureReceipt = new Function('assert', 'assertOriginalBaseActor', 'observeUiReceipt', 'proofHash', js(
  `${functionText(helpers, 'captureBaseUiReceipt')}\nreturn captureBaseUiReceipt;`,
))(assert, originalActor, observeReceipt, hash) as (input: Row) => Promise<Reply>;
const paintMatches = new Function(js(`${functionText(helpers, 'baseResearchPaintMatches')}\nreturn baseResearchPaintMatches;`))() as
  (paint: Row, workspace: unknown, receipt?: unknown) => boolean;
const researchBody = find(base, (node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'researchAndDetector');
const researchChoice = find(researchBody, (node): node is ts.IfStatement =>
  ts.isIfStatement(node) && node.expression.getText(base) === 'options.researchDetector');
const rawRead = functionText(base, 'currentActorRead');
const renderedRead = functionText(base, 'renderedResearch');
const rpcBody = functionText(base, 'rpc');
const branchSource = ['branch', 'blocked', 'committed'].map(name => find(base,
  (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText(base) === name)).map(node =>
  `const ${node.getText(base)};`).join('\n');
const runResearchChoice = new Function('assert', 'assertOriginalBaseActor', 'captureBaseUiReceipt',
  'baseResearchPaintMatches', 'waitForBaseResearchReceipt', 'delay', 'proofHash', js(`return async input => {
  const { surface, research, report, initial, originalGm, gm, roster, save, state } = input;
  const options = { researchDetector: true };
  const role = 'shepherd-scientist';
  const recordRequest = async entry => { report.requests.push(entry); await save(); };
  ${branchSource}
  ${rawRead}
  ${rpcBody}
  ${renderedRead}
  ${researchChoice.getText(base)}
};`))(assert, originalActor, captureReceipt, paintMatches, proofReceipt,
  async () => assert.fail('Immediate loaded native paint needs no extra sampler or timer.'), hash) as
  (input: Row) => Promise<void>;
const emittedReply = find(writer, (node): node is ts.VariableDeclaration =>
  ts.isVariableDeclaration(node) && node.name.getText(writer) === 'reply' &&
  node.initializer?.getText(writer).includes("status: 'committed'") === true);
const makeReply = new Function('result', 'command', 'currentCycle', 'before', 'after', js(
  `return (${emittedReply.initializer!.getText(writer)});`,
)) as (...args: unknown[]) => Reply;

const sid = 'native-original-c1', uid = 'native-original-scientist';
const me: Player = { uid, sessionId: sid, displayName: 'Scientist', role: 'player', joinedAt: '',
  connected: true, assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist',
  fleetGroupId: 'fleet-1', connectionGeneration: 3, replacementStatus: null };
const session: GameSession = { id: sid, name: 'Native source composition', joinCode: 'NATIVE', ownerUid: 'native-gm',
  createdAt: '', updatedAt: '', phase: 'active', currentTurn: 1, activeRoleIds: ['shepherd-scientist'],
  activeVesselIds: ['shepherd'], fullGameDemo: { status: 'active', progression: 'manual' },
  turnPhase: { turn: 1, progression: 'manual', teamPhaseEndsAt: '2026-10-06T00:00:00.000Z',
    openAirspaceEndsAt: '2026-10-06T00:00:00.000Z',
    airspace: { state: 'restricted', tickerActive: false, pressAccess: false } },
  shuttleControl: { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: uid,
    holderUid: uid, revision: 2 } } };
function snapshot(data?: Row) {
  return { exists: data !== undefined, data: () => data, get: (key: string) => data?.[key] };
}
type Reply = { status: string; sessionId: string; cycle: number; researchRevision: number;
  trackId: string; funding: string; oreCost: number; shepherdOre: number;
  progress: unknown; cadence: unknown; requestId: string; previousMaterialCost: number; currentMaterialCost: number | null };
function fixture() {
  let progress: Row = {}, cadence: Row | undefined, ore = 8;
  let uiPhaseClicks = 0, uiResearchClicks = 0, exactReplays = 0, readCalls = 0;
  const requests: Row[] = [], replies = new Map<string, Reply>(), order: string[] = [];
  const report: Row = { cycle: 1, branches: {}, requests: [] };
  let responseDeliver: ((value: unknown) => void) | undefined;
  let displayed: EndeavourResearchWorkspace | undefined;
  const actor = () => ({ sessionId: useSessionStore.getState().session?.id, uidHash: 'native-original-scientist-hash',
    profileRoleId: 'shepherd-scientist', assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist',
    playerRole: 'player', phase: 'active', cycle: useSessionStore.getState().session?.currentTurn,
    hasAuth: true, sameActor: true, connection: useSessionStore.getState().connection,
    freshness: useSessionStore.getState().sessionSnapshotFreshness });
  function workspace() {
    const current = useSessionStore.getState().session!;
    return workspaceFromSource(sid, snapshot(current as unknown as Row), snapshot(progress), snapshot(cadence), snapshot(), ore);
  }
  transport.invoke.mockImplementation(async (request: Row) => {
    const endpoint = transport.callable.mock.calls.at(-1)?.[1];
    if (endpoint === 'readEndeavourResearchWorkspace') { readCalls++; return { data: workspace() }; }
    assert.equal(endpoint, 'advanceEndeavourResearchTrack');
    const id = request.requestId as string, prior = replies.get(id);
    if (prior) { assert.deepEqual(request, requests[0]); exactReplays++; return { data: { ...prior, status: 'replayed' } }; }
    const result = resolveEndeavourResearchChoice({ state: cadence, progress, cycle: 1,
      expectedRevision: request.expectedResearchRevision as number,
      trackId: request.trackId as 'wolf-agent-detector', funding: request.funding as 'standard',
      shepherdOre: ore, actorScope: 'player', turnPhase: useSessionStore.getState().session?.turnPhase });
    const before = endeavourResearchTrack(progress, 'wolf-agent-detector');
    progress = { ...result.progress }; cadence = { ...result.state }; ore = result.remainingShepherdOre;
    const after = endeavourResearchTrack(progress, 'wolf-agent-detector');
    const reply = makeReply(result, request, 1, before, after);
    requests.push({ ...request }); replies.set(id, reply); uiResearchClicks++;
    responseDeliver?.({ status: () => 200, json: async () => ({ result: reply }),
      url: () => 'https://native.invalid/us-central1/advanceEndeavourResearchTrack',
      request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: request }) }) });
    return { data: reply };
  });
  transport.callable.mockImplementation(() => transport.invoke);
  async function originalResearch() {
    order.push('original-research');
    displayed = await readEndeavourResearchWorkspace();
    let selectedTrackId = 'wolf-agent-detector', notice = '';
    const view = () => <EndeavourResearchChoices workspace={displayed!} selectedTrackId={selectedTrackId}
      liveTeamPhase={useSessionStore.getState().session?.turnPhase?.airspace.state === 'restricted'}
      notice={notice} onSelectTrack={id => { selectedTrackId = id; mounted.rerender(view()); }}
      onRefresh={() => assert.fail('No refill/retry.')} onAdvance={funding => {
        const attempt = createEndeavourResearchAttempt({ workspace: displayed!, trackId: selectedTrackId, funding });
        void advanceEndeavourResearchTrack(attempt).then(async () => {
          displayed = await readEndeavourResearchWorkspace();
          notice = 'Wolf Agent Detector advanced one research box.';
          mounted.rerender(view());
        });
      }} />;
    const mounted = render(view());
    const locator = (role: string, options: { name: string }) => {
      const element = () => within(mounted.container).queryByRole(role, { name: options.name });
      return { isVisible: async () => element() !== null,
        getAttribute: async (name: string) => element()?.getAttribute(name),
        innerText: async () => element()?.textContent ?? '',
        getByRole: (childRole: string, childOptions: { name: string }) => locator(childRole, childOptions),
        allTextContents: async () => Array.from(mounted.container.querySelectorAll('[aria-label="Research progress"] > li')).map(node => node.textContent),
        locator: (selector: string) => ({ evaluateAll: async (callback: (nodes: HTMLOptionElement[]) => unknown) =>
          callback(Array.from(element()?.querySelectorAll(selector) ?? []) as HTMLOptionElement[]) }),
        selectOption: async (value: string) => { await userEvent.selectOptions(element()!, value); },
        isEnabled: async () => (element() as HTMLButtonElement | null)?.disabled === false,
        click: async () => { await act(async () => { await userEvent.click(element()!); }); },
      };
    };
    const surface = { observe: async () => actor(), callable: async (endpoint: string, request: Row) => {
      transport.callable('native-inert-transport', endpoint);
      const reply = await transport.invoke(request);
      return { status: 'committed', result: reply.data };
    }, page: { getByRole: (role: string, options: { name: string }) => locator(role, options),
      waitForResponse: () => new Promise(resolve => { responseDeliver = resolve; }) } };
    await runResearchChoice({ surface, research: locator('region', { name: 'Endeavour research controls' }),
      report, initial: { sessionId: sid }, originalGm: { cycle: 1 }, gm: {},
      roster: [{ roleId: 'shepherd-scientist', uidHash: actor().uidHash }], save: async () => undefined,
      state: async () => ({ shuttleControl: useSessionStore.getState().session?.shuttleControl }) });
    mounted.unmount();
    const assertRequired = new Function('assert', js(`${functionText(helpers, 'assertRequiredBaseBranches')}\nreturn assertRequiredBaseBranches;`))(assert);
    assertRequired(report.branches, ['detector-research-cross']);
    return report;
  }
  const gm = { observe: async () => ({ cycle: useSessionStore.getState().session?.currentTurn,
    turnStatePhase: useSessionStore.getState().session?.turnPhase?.airspace.state === 'restricted' ? 'team' : 'coordination',
    airspace: useSessionStore.getState().session?.turnPhase?.airspace.state, phaseProgression: 'manual' }),
  page: { getByRole: (_role: string, options: { name: string; exact: boolean }) => ({ click: async () => {
    assert.deepEqual(options, { name: 'Open Coordination manually', exact: true }); uiPhaseClicks++;
    order.push('normal-manual-coordination'); const current = useSessionStore.getState().session!;
    useSessionStore.setState({ session: { ...current, turnPhase: { ...current.turnPhase!,
      airspace: { ...current.turnPhase!.airspace, state: 'lifted' } } } });
  } }) },
  until: async (_name: string, predicate: (value: Row) => boolean) => {
    const current = await gm.observe(); assert.equal(predicate(current), true); return current;
  } };
  const context = { gm, crew: {}, initial: { sessionId: sid }, started: {}, roster: [], directory: '/inert-native' };
  return { context, gm, order, report, originalResearch, workspace,
    counts: () => ({ uiPhaseClicks, uiResearchClicks, exactReplays, readCalls }),
    outcome: () => evaluateStage({ branch: (report.branches as Row)['detector-research-cross'],
      requests: report.requests, endpoint: 'advanceEndeavourResearchTrack', roleId: 'shepherd-scientist', cycle: 1 }) };
}
beforeEach(() => {
  transport.callable.mockReset(); transport.invoke.mockReset(); useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(structuredClone(session), structuredClone(me), 'console');
  useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
});

it('the source full role producer places onStarted before its normal phase advance and runEnding afterward', () => {
  expect(startedCall.end).toBeLessThan(ordinaryLoop.pos);
  expect(ordinaryLoop.end).toBeLessThan(endingCall.pos);
  expect(ordinaryLoop.getText(ui)).toContain('for (const actor of roster)');
  expect(ordinaryLoop.getText(ui)).toContain('restoredOriginalEnvelope');
  expect(ordinaryLoop.getText(ui)).toContain('evidence.repeatedActorSelections.push');
});
it('explicit callback phase ownership leaves Team1 for original research then uses one normal Coordination control', async () => {
  const f = fixture(), options = { gameplayOnly: false, gameplayManagesPhases: true,
    onStarted: async () => { f.order.push('seven-host-preparation'); }, runEnding: async () => {
      await f.originalResearch(); await f.gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }).click();
    } };
  config(options);
  await produce(options, f.context, () => undefined, async () => assert.fail('No generic delay in callback-owned phases.'), {});
  expect(f.order).toEqual(['seven-host-preparation', 'original-research', 'normal-manual-coordination']);
  expect(f.counts()).toEqual({ uiPhaseClicks: 1, uiResearchClicks: 1, exactReplays: 1, readCalls: 4 });
  expect(f.outcome()).toMatchObject({ status: 'completed', cycle: 1, sourceRevision: 1 });
});
it('default generic role mode preserves its original Coordination click and 2000ms delay', async () => {
  const f = fixture(), waits: number[] = [], phases: string[] = [];
  const options = { gameplayOnly: false, runEnding: async () => { phases.push((await f.gm.observe()).turnStatePhase); } };
  config(options);
  await produce(options, f.context, () => undefined, async ms => { waits.push(ms); }, {});
  expect(phases).toEqual(['coordination']); expect(waits).toEqual([2000]);
  expect(f.counts()).toEqual({ uiPhaseClicks: 1, uiResearchClicks: 0, exactReplays: 0, readCalls: 0 });
});
it('standalone gameplay retains Team1 and the existing original research without generic phase controls', async () => {
  const f = fixture(), options = { gameplayOnly: true, runEnding: f.originalResearch };
  config(options); await produce(options, f.context, () => undefined, async () => assert.fail('No role-loop delay.'), {});
  expect(f.counts()).toEqual({ uiPhaseClicks: 0, uiResearchClicks: 1, exactReplays: 1, readCalls: 4 });
  expect(f.outcome().status).toBe('completed');
});
it.each([undefined, null, true, 'ending'])('phase-owned role mode rejects missing/noncallable runEnding %s before I/O', runEnding => {
  expect(() => config({ gameplayOnly: false, gameplayManagesPhases: true, runEnding })).toThrow(/callback|function|ending/i);
});
it.each([null, 'true', 1, {}, []])('rejects malformed explicit phase option %j before I/O', value => {
  expect(() => config({ gameplayOnly: false, gameplayManagesPhases: value, runEnding: async () => undefined })).toThrow();
});
it('rejects phase ownership combined with a skipped ordinary role loop', () => {
  expect(() => config({ gameplayOnly: true, gameplayManagesPhases: true, runEnding: async () => undefined })).toThrow();
});
it('actual Coordination cannot be treated as original Team by the callback-owned mode', async () => {
  const f = fixture(); await f.gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }).click();
  await expect(produce({ gameplayOnly: false, gameplayManagesPhases: true, runEnding: f.originalResearch },
    f.context, () => undefined, async () => undefined, {})).rejects.toThrow();
  expect(f.counts().uiResearchClicks).toBe(0); expect(f.outcome().status).toBe('pending');
});
it('the real research engine rejects the former post-role-loop Coordination ordering without granting a cross', async () => {
  const f = fixture();
  await expect(produce({ gameplayOnly: false, runEnding: f.originalResearch }, f.context,
    () => undefined, async () => undefined, {})).rejects.toThrow(/detector-research-cross is uncredited/);
  expect(f.counts().uiPhaseClicks).toBe(1); expect(f.counts().uiResearchClicks).toBe(0);
  expect(f.outcome().status).toBe('pending');
});
it('a second research choice cannot manufacture another cross or receipt within the same Team', async () => {
  const f = fixture(); await f.originalResearch();
  await expect(f.originalResearch()).rejects.toThrow(/detector-research-cross is uncredited/);
  expect(f.counts().uiResearchClicks).toBe(1); expect(f.counts().exactReplays).toBe(1);
});
it('an interrupted original read does not manufacture a receipt or phase advance', async () => {
  const f = fixture(); transport.invoke.mockRejectedValueOnce(new Error('original workspace unavailable'));
  await expect(produce({ gameplayOnly: false, gameplayManagesPhases: true, runEnding: f.originalResearch },
    f.context, () => undefined, async () => undefined, {})).rejects.toThrow(/workspace unavailable/);
  expect(f.outcome().status).toBe('pending'); expect(f.counts().uiResearchClicks).toBe(0); expect(f.counts().uiPhaseClicks).toBe(0);
});
it('the actual Capy factory explicitly chooses full role plus callback phase ownership without moving its research producer', () => {
  const factory = new Function('assert', 'prepareCycleOneCapybaraFleet', 'runCapybaraFullGameGameplay', 'runPursuitLimitEnding', js(
    `${functionText(capy, 'capybaraFullGameDemoOptions')}\nreturn capybaraFullGameDemoOptions;`,
  ))(assert, async () => assert.fail('No maintenance setup in this config test.'),
    async () => assert.fail('No full game in this config test.'), async () => undefined) as (options?: Row) => Row;
  const standard = factory(); expect(standard.gameplayOnly).toBe(true);
  expect(factory({ fullRoleLoop: true })).toMatchObject({ gameplayOnly: false, gameplayManagesPhases: true });
  expect(factory({ fullRoleLoop: false })).toMatchObject({ gameplayOnly: true, gameplayManagesPhases: false });
  for (const value of [null, 'true', 1, {}, []]) expect(() => factory({ fullRoleLoop: value })).toThrow();
});

it.each(['uid', 'session', 'cache'] as const)('the actual client parser/service rejects an original read after %s authority withdrawal', async change => {
  const f = fixture(), originalInvoke = transport.invoke.getMockImplementation()!;
  transport.invoke.mockImplementationOnce(async (request: Row) => {
    const reply = await originalInvoke(request);
    const current = useSessionStore.getState();
    if (change === 'uid') useSessionStore.setState({ me: { ...current.me!, uid: 'foreign-current-uid' } });
    if (change === 'session') useSessionStore.setState({ session: { ...current.session!, id: 'foreign-current-session' } });
    if (change === 'cache') useSessionStore.setState({ sessionSnapshotFreshness: 'cache' });
    return reply;
  });
  await expect(f.originalResearch()).rejects.toThrow(/authority changed|live session state/);
  expect(f.counts().uiResearchClicks).toBe(0); expect(f.counts().exactReplays).toBe(0);
  expect(f.outcome().status).toBe('pending');
});

it.each(['stale', 'unpainted', 'wrong-cycle', 'wrong-role', 'no-exact-replay'] as const)(
  'the unchanged stage evaluator refuses a previously real receipt after %s evidence drift', async change => {
    const f = fixture(); await f.originalResearch();
    const branch = (f.report.branches as Row)['detector-research-cross'] as Row;
    const rows = f.report.requests as Row[], request = rows.find(row => row.exactOriginalSdkReplay === true)!;
    if (change === 'stale') branch.status = 'stale';
    if (change === 'unpainted') branch.exactSourceAndRenderedReceipt = false;
    if (change === 'wrong-cycle') request.cycle = 2;
    if (change === 'wrong-role') request.roleId = 'foreign-role';
    if (change === 'no-exact-replay') request.exactOriginalSdkReplay = false;
    expect(f.outcome().status).toBe('pending');
    expect(f.counts().uiResearchClicks).toBe(1); expect(f.counts().exactReplays).toBe(1);
  });

it('an interrupted original onStarted hook cannot run the supplied gameplay or generic phase control', async () => {
  const f = fixture(), options = { gameplayOnly: false, gameplayManagesPhases: true,
    onStarted: async () => { throw new Error('original Team preparation interrupted'); }, runEnding: f.originalResearch };
  await expect(produce(options, f.context, () => undefined, async () => undefined, {}))
    .rejects.toThrow(/original Team preparation interrupted/);
  expect(f.counts()).toEqual({ uiPhaseClicks: 0, uiResearchClicks: 0, exactReplays: 0, readCalls: 0 });
  expect(f.outcome().status).toBe('pending');
});

it('the actual Capy standalone factory retains original public callback ordering and ignores the former raw override', async () => {
  const calls: string[] = [];
  const factory = new Function('assert', 'prepareCycleOneCapybaraFleet', 'runCapybaraFullGameGameplay', 'runPursuitLimitEnding', js(
    `${functionText(capy, 'capybaraFullGameDemoOptions')}\nreturn capybaraFullGameDemoOptions;`,
  ))(assert, async () => { calls.push('seven-host-preparation'); return { status: 'completed' }; },
    async () => { calls.push('original-gameplay'); }, async () => undefined) as (options?: Row) =>
      { gameplayOnly: boolean; onStarted: (input: Row) => Promise<void>; runEnding: (input: Row) => Promise<void> };
  const options = factory({ gameplayOnly: false, onStarted: async () => { calls.push('original-caller-hook'); } });
  expect(options.gameplayOnly).toBe(true);
  await options.onStarted({}); await options.runEnding({});
  expect(calls).toEqual(['original-caller-hook', 'seven-host-preparation', 'original-gameplay']);
});
