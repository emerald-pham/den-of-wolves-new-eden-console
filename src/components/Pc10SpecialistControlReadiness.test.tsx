import { createHash, webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { constants, createContext, Script, SyntheticModule } from 'node:vm';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import ScoutRequestControls from './ScoutRequestControls';
import { SCOUT_ENTITLEMENTS } from '../../functions/src/scoutEntitlements';
import { shuttleDockingsAreKnownAndUnique, shuttleDockingsAreParked,
  shuttleDockingsMatchActiveRoleOwnedSubset } from '../../functions/src/craftOwnership';

// The production Scout control, authority/parser/service, Zustand store, public
// selector and specialist caller/driver all run. Only transport and the separately
// tested private report delivery adapter are inert. No browser, Auth or DB runs.
const transport = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => transport.call }));
vi.mock('@/lib/firebase', () => ({ functions: () => ({}) }));
vi.mock('./ScoutReportController', () => ({ default: () => null }));
const nativeScript = (name: string) => pathToFileURL(resolve(process.cwd(), 'scripts', name)).href;
const nativeImport = (name: string) => new Script('import(url)', {
  importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
}).runInNewContext({ url: nativeScript(name) });
const { createTwoBrowserGameplay } = await nativeImport('pc10-two-browser-gameplay.mjs');
const specialistModule = await nativeImport('pc10-specialist-gameplay.mjs');
const { createSpecialistGameplayDriver } = specialistModule;
const { runPc10SpecialistAction, PC10_SPECIALIST_ACTIONS } = await nativeImport('pc10-specialist-phases.mjs');
const { capybaraStageOutcome } = await nativeImport('pc10-capybara-full-gameplay.mjs');
// Bind the generic surface to its actual production callback rather than
// supplying fixture-only generation/HY/berth fields it does not return.
const observerFile = ts.createSourceFile('full-game-proof.mjs', readFileSync(resolve(process.cwd(),
  'scripts/pc10-full-game-demo-ui-proof.mjs'), 'utf8'), ts.ScriptTarget.Latest, true);
const observers: ts.FunctionDeclaration[] = [];
function findObserver(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'observe') observers.push(node);
  ts.forEachChild(node, findObserver);
}
findObserver(observerFile);
expect(observers).toHaveLength(1);
const returned = observers[0].body!.statements[0] as ts.ReturnStatement;
const genericCallbackSource = (returned.expression as ts.CallExpression).arguments[0].getText(observerFile);
const genericCallback = new Script(`(${genericCallbackSource})`).runInNewContext();
const sid = 'native-specialist-session', uid = 'private-native-wing', roleId = 'wing-commander';
const uidHash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

// Execute the current server's actual reply expression and receiving-host
// policy, followed by the real client parser/service. No invented revision DTO.
const serverFile = ts.createSourceFile('index.ts', readFileSync(resolve(process.cwd(),
  'functions/src/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
let replyExpression: ts.Expression | undefined, receivingFunction: ts.FunctionDeclaration | undefined;
function findServer(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.name.getText(serverFile) === 'reply' &&
      node.type?.getText(serverFile) === 'ScoutRequestReply') replyExpression = node.initializer;
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'scoutReceivingShipId') receivingFunction = node;
  ts.forEachChild(node, findServer);
}
findServer(serverFile);
expect(replyExpression).toBeDefined(); expect(receivingFunction).toBeDefined();
const serverJavaScript = ts.transpileModule(`${receivingFunction!.getText(serverFile)}\n` +
  `function sourceReply() { return ${replyExpression!.getText(serverFile)}; }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function actualServerReply(payload: Record<string, unknown>) {
  const session = useSessionStore.getState().session!;
  const entitlement = SCOUT_ENTITLEMENTS.find(item => item.id === payload.entitlementId)!;
  return plain(new Script(`${serverJavaScript}\n` +
    'receivingShipId = scoutReceivingShipId(session, entitlementId, activeRoleIds, activeVesselIds); sourceReply();')
    .runInNewContext({ ...payload, entitlement, entitlementId: entitlement.id, cycle: session.currentTurn,
      session: { get: (key: keyof typeof session) => session[key] }, receivingShipId: undefined,
      activeRoleIds: session.activeRoleIds, activeVesselIds: session.activeVesselIds,
      shuttleDockingsAreKnownAndUnique, shuttleDockingsAreParked, shuttleDockingsMatchActiveRoleOwnedSubset,
      commandError: (_code: string, message: string) => new Error(message) }));
}
function currentCapyCaller(bindings: Record<string, unknown>) {
  const file = ts.createSourceFile('capy.mjs', readFileSync(resolve(process.cwd(),
    'scripts/pc10-capybara-full-gameplay.mjs'), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['attemptSpecialist', 'runSpecialist', 'inspectRenderedAction'];
  const declarations: ts.FunctionDeclaration[] = [];
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')) declarations.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file); expect(declarations).toHaveLength(names.length);
  return new Script(`${declarations.map(node => node.getText(file)).join('\n')}\nrunSpecialist`)
    .runInNewContext({ assert, PC10_SPECIALIST_ACTIONS, runPc10SpecialistAction, capybaraStageOutcome,
      ...specialistModule, SUCCESS_RESULT_STATUSES: new Set(['requested', 'replayed']),
      updateCapybaraStage: () => { throw new Error('No native file write or stage fixture credit.'); }, ...bindings });
}

beforeEach(() => {
  transport.call.mockReset();
  const store = useSessionStore.getState();
  store.reset();
  store.setIdentity({ id: sid, name: 'Native table', joinCode: '4821', phase: 'active', currentTurn: 1,
    activeRoleIds: [roleId], activeVesselIds: ['aegis'], ownerUid: 'native-gm',
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: ['starlight'] },
    currentActorBerthAuthority: { sessionId: sid, actorUid: uid, groupId: 'fleet-1', role: 'player',
      connectionGeneration: 3, assignedRoleId: roleId, activeConsoleRoleId: roleId,
      replacementRoleId: null, replacementStatus: null, shipId: 'aegis' },
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z',
    turnPhase: { turn: 1, teamPhaseEndsAt: '2000-01-01T00:00:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:00:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
  }, { uid, sessionId: sid, displayName: 'Wing', role: 'player', connected: true,
    assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId, fleetGroupId: 'fleet-1',
    connectionGeneration: 3, replacementRoleId: null, replacementStatus: null,
    joinedAt: '2026-10-06T00:00:00.000Z' });
  store.setConnection('live'); store.setSessionSnapshotFreshness('server');
});

function fixture({ beforeCapture, beforeClick, afterFill, duringSecondSelection, replayDrift = false,
  capy = false, receivingShipId = 'aegis', replyChange, afterRecord }:
  { beforeCapture?: () => void; beforeClick?: () => void; afterFill?: () => void;
    duringSecondSelection?: () => void; replayDrift?: boolean; capy?: boolean; receivingShipId?: string;
    replyChange?: (reply: Record<string, unknown>) => void; afterRecord?: () => void } = {}) {
  if (capy) useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    fullGameDemo: { status: 'active', progression: 'manual' }, setupRevision: 999,
    activeVesselIds: ['aegis', 'capybara'],
    shuttleDockings: [{ shuttleId: 'starlight', shipId: receivingShipId, dockedAt: '2026-10-06T00:00:00.000Z' }] });
  const events: string[] = [], posts: Record<string, unknown>[] = [], replays: unknown[] = [];
  let path = '/ships/aegis/roles/wing-commander', authUid = uid, responseResolve: (value: unknown) => void;
  let issuedReply: Record<string, unknown>;
  let documentTimeOrigin = 1000;
  let selects = 0, fills = 0, clicks = 0, observers = 0, saved: unknown;
  function Path() { path = useLocation().pathname; return null; }
  render(<MemoryRouter initialEntries={[path]}><Path /><Routes>
    <Route path="/ships/aegis/roles/wing-commander" element={<Link to="/shuttles/starlight">Open Starlight shuttle console</Link>} />
    <Route path="/shuttles/starlight" element={<><Link to="/ships/aegis/roles/wing-commander">Back to AEGIS Wing Commander console</Link><ScoutRequestControls entitlementId="starlight" /></>} />
  </Routes></MemoryRouter>);
  const currentActor = async () => evaluate(genericCallback, '/src/store/useSessionStore.ts');
  let richSamplesInSelection = 0;
  async function evaluate(callback: (...args: never[]) => unknown, input: unknown) {
    // Execute the actual browser-serialized current-document callback, with no
    // Node globals or SDK/network module available to it.
    const browser = createContext({ input, crypto: webcrypto, TextEncoder, document, performance: { timeOrigin: documentTimeOrigin } });
    const modules = new Map<string, SyntheticModule>();
    for (const [name, exports] of [
      ['/src/store/useSessionStore.ts', { useSessionStore }],
      ['/src/lib/firebase.ts', { auth: () => ({ currentUser: authUid ? { uid: authUid } : null }) }],
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: { roleId, sessionId: sid } }],
    ] as const) {
      const module = new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context: browser });
      await module.link(() => { throw new Error('No extra import in the native selector.'); });
      await module.evaluate(); modules.set(name, module);
    }
    const value = plain(await new Script(`(${callback.toString()})(input)`, {
      importModuleDynamically: async name => {
        const module = modules.get(name); if (!module) throw new Error(`No SDK or extra source import ${name}`); return module;
      },
    }).runInContext(browser));
    if (callback.toString().includes('currentMemberBerthPresent')) {
      richSamplesInSelection++;
      if (selects === 2 && richSamplesInSelection === 1) await act(async () => { duringSecondSelection?.(); });
    }
    return value;
  }
  const locate = (query: () => HTMLElement[]) => ({
    isVisible: async () => query().length === 1 && !query()[0].hidden,
    isEnabled: async () => query().length === 1 && !query()[0].matches(':disabled'),
    first() { return this; },
    evaluateAll: async (callback: (nodes: HTMLElement[]) => unknown) => {
      const nodes = query();
      // jsdom supplies no layout. Only this inert native DOM boundary models
      // current visible layout; actual source predicates execute unchanged.
      for (const node of nodes) node.getClientRects = () => [{ width: 1, height: 1 }] as unknown as DOMRectList;
      return new Script(`(${callback.toString()})(nodes)`).runInNewContext({ nodes,
        getComputedStyle: (node: Element) => document.defaultView!.getComputedStyle(node) });
    },
    waitFor: async () => { expect(query()).toHaveLength(1); },
    click: async () => {
      const node = query()[0]; expect(node).toBeTruthy();
      if (node.tagName === 'BUTTON') {
        expect(node).toBeEnabled(); beforeClick?.(); expect(node.isConnected).toBe(true);
        clicks++; events.push('click');
      } else events.push('normal-route-link');
      await act(async () => { fireEvent.click(node); });
      if (node.tagName === 'BUTTON') {
        await act(async () => { await vi.waitFor(() => expect(posts).toHaveLength(1)); });
        await act(async () => { afterRecord?.(); });
      }
    },
    fill: async (value: string) => {
      fills++; events.push('fill'); const node = query()[0]; expect(node).toBeTruthy();
      await act(async () => { fireEvent.change(node, { target: { value } }); });
      await act(async () => { afterFill?.(); });
    },
  });
  const page = {
    url: () => `http://native.invalid/#${path}`,
    evaluate,
    waitForURL: async (predicate: (url: URL) => boolean) => expect(predicate(new URL(page.url()))).toBe(true),
    getByRole: (kind: 'region' | 'button' | 'link', options: { name: string | RegExp; exact?: boolean }) => {
      if (kind === 'region') return {
        getByRole: (childKind: 'button' | 'status', childOptions: { name?: string } = {}) => locate(() => {
          const region = screen.queryByRole('region', { name: options.name, exact: options.exact });
          return region ? within(region).queryAllByRole(childKind, { name: childOptions.name }) : [];
        }),
        getByLabel: (name: string) => locate(() => {
          const region = screen.queryByRole('region', { name: options.name, exact: options.exact });
          return region ? within(region).queryAllByLabelText(name) : [];
        }),
        locator: (selector: string) => locate(() => {
          const region = screen.queryByRole('region', { name: options.name, exact: options.exact });
          return region ? [...region.querySelectorAll<HTMLElement>(selector)] : [];
        }),
      };
      return locate(() => screen.queryAllByRole(kind, { name: options.name, exact: options.exact }));
    },
    waitForResponse: () => {
      observers++; events.push('arm-response');
      return new Promise(resolve => { responseResolve = resolve; });
    },
  };
  transport.call.mockImplementation(async payload => {
    events.push('ordinary-sdk'); posts.push(plain(payload));
    const result = capy ? actualServerReply(payload) : { status: 'requested', resolution: 'pending', requestId: payload.requestId,
      sessionId: sid, cycle: 1, entitlementId: 'starlight', source: 'craft', ownerRoleId: roleId,
      anchorShipId: 'aegis', receivingShipId: 'aegis', targetCoordinate: payload.targetCoordinate };
    replyChange?.(result);
    issuedReply = plain(result);
    responseResolve({ url: () => 'http://native.invalid/us-central1/requestScout',
      request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: plain(payload) }) }),
      json: async () => ({ result }), ok: () => true, status: () => 200 });
    return { data: result };
  });
  const crew = { page, observe: currentActor, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    until: async (_label: string, predicate: (actor: unknown) => boolean) => {
      const actor = await currentActor(); expect(predicate(actor)).toBe(true); return actor;
    },
    callable: async (endpoint: string, payload: Record<string, unknown>) => {
      expect(endpoint).toBe('requestScout'); replays.push(plain(payload));
      const result = capy ? { ...issuedReply, status: 'replayed' } : { status: 'replayed', resolution: 'pending', requestId: payload.requestId, sessionId: sid,
        cycle: 1, entitlementId: 'starlight', source: 'craft', ownerRoleId: roleId, anchorShipId: 'aegis',
        receivingShipId: 'aegis', targetCoordinate: replayDrift ? '9999' : payload.targetCoordinate };
      if (capy && replayDrift) result.targetCoordinate = '9999';
      return { status: 'committed', result };
    },
  };
  const gm = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts' }, context = { gm, crew, initial: { sessionId: sid, joinCode: 'NATIVE' },
    roster: [{ roleId, uidHash: uidHash(uid) }], started: { fullGameDemo: { status: 'active', progression: 'manual' } }, directory: '/tmp/native-specialist-no-files' };
  const actual = createTwoBrowserGameplay(context);
  const game = { ...actual,
    // The native-only deadline is finite; production's existing defaults are untouched.
    select: async (selectedRole: string) => { selects++; richSamplesInSelection = 0;
      return actual.select(selectedRole, { deadlineAt: Date.now() + 500 }); },
    state: capy ? actual.state : async () => ({ live: true, sessionId: sid, cycle: 1 }),
    save: async (_name: string, value: unknown) => { saved = value; },
  };
  const driver = createSpecialistGameplayDriver(game, { timeoutMs: 0, intervalMs: 0 });
  const capyCaller = capy ? currentCapyCaller({ a: game, gm, initial: context.initial, specialistDriver: driver }) : null;
  const runCapy = () => capyCaller('wing-scout', 'wing-starlight-scout', { roleId, targetCoordinate: '1413' },
    { roleId, record: false, cost: { resource: 'printed Starlight sortie fuel' } });
  const run = () => runPc10SpecialistAction({ game, driver: { capture: async (args: unknown) => {
    await act(async () => { beforeCapture?.(); }); return driver.capture(args);
  } }, actionId: 'wing-starlight-scout', targetCoordinate: '1413',
    inspect: async () => {
      expect(screen.getByRole('status')).toHaveTextContent(/request recorded/i);
      return { ready: true, gmRevision: 7, crewRevision: 7, renderedStatusCode: 'public-result-visible' };
    },
  });
  return { run, runCapy, events, posts, replays, game, changeAuth: (value: string) => { authUid = value; },
    replaceDocument: () => { documentTimeOrigin += 1000; },
    counts: () => ({ selects, fills, clicks, observers }), saved: () => saved };
}

it('keeps the original prepared Scout form through the real public selector and records one ordinary request', async () => {
  const f = fixture();
  const result = await f.run();
  expect(result.status).toBe('captured');
  expect(f.counts()).toEqual({ selects: 2, fills: 1, clicks: 1, observers: 1 });
  expect(f.events.indexOf('fill')).toBeLessThan(f.events.indexOf('arm-response'));
  expect(f.events.indexOf('arm-response')).toBeLessThan(f.events.indexOf('ordinary-sdk'));
  expect(f.posts).toHaveLength(1); expect(f.replays).toEqual(f.posts);
  expect(result.evidence.request.targetCoordinate).toBeUndefined();
  expect(result.evidence.request.targetCoordinateHash).toHaveLength(64);
  expect(JSON.stringify(result.evidence)).not.toContain(uid);
  expect(JSON.stringify(result.evidence)).not.toContain('1413');
});

it.each(['aegis', 'capybara'])('qualifies only the actual revision-less recorded Scout request at current host %s through the entire Capy caller', async receivingShipId => {
  const f = fixture({ capy: true, receivingShipId });
  const outcome = await f.runCapy();
  expect(outcome.status).toBe('captured');
  expect(Object.keys(outcome.result).sort()).toEqual(['status', 'resolution', 'requestId', 'sessionId', 'cycle',
    'entitlementId', 'source', 'ownerRoleId', 'anchorShipId', 'receivingShipId', 'targetCoordinate'].sort());
  expect(outcome.result.receivingShipId).toBe(receivingShipId);
  expect(outcome.result.revision).toBeUndefined(); expect(outcome.result.currentRevision).toBeUndefined();
  const stage = capybaraStageOutcome({ ...outcome, roleId });
  expect(stage).toMatchObject({ status: 'completed', endpoint: 'requestScout', roleId, cycle: 1,
    scope: 'request-recorded' });
  expect(stage.sourceRevision).toBeUndefined(); expect(stage.privateDelivery).toBeUndefined();
  expect(outcome.evidence.response.revision).toBeNull();
  expect(outcome.evidence.response.replayRevision).toBeNull();
  expect(outcome.evidence.response.projectionRevision).toBeNull();
  expect(outcome.evidence.projection.gm.revision).toBeUndefined();
  expect(outcome.evidence.projection.crew.revision).toBeUndefined();
  expect(f.counts()).toEqual({ selects: 2, fills: 1, clicks: 1, observers: 1 });
  expect(f.posts).toHaveLength(1); expect(f.replays).toEqual(f.posts);
  expect(JSON.stringify(outcome.evidence)).not.toContain(uid);
  expect(JSON.stringify(outcome.evidence)).not.toContain(sid);
  expect(JSON.stringify(outcome.evidence)).not.toContain('1413');
});

it.each([
  ['request identity', { requestId: 'unrelated-request' }], ['session identity', { sessionId: 'foreign-session' }],
  ['cycle', { cycle: 2 }], ['entitlement', { entitlementId: 'hummingbird' }], ['owner', { ownerRoleId: 'quellon-explorer' }],
  ['source', { source: 'replacement-role' }], ['anchor', { anchorShipId: 'quellon' }],
  ['receiver', { receivingShipId: 'capybara' }], ['coordinate', { targetCoordinate: '9999' }],
  ['result status', { status: 'resolved' }], ['resolution', { resolution: 'delivered' }],
  ['invented revision', { revision: 999 }],
] as const)('cannot qualify a wrong Scout %s from the actual parsed control and Capy caller', async (_name, patch) => {
  const f = fixture({ capy: true, replyChange: reply => Object.assign(reply, patch) });
  await expect(f.runCapy()).rejects.toThrow();
  expect(f.posts).toHaveLength(1); expect(f.replays).toHaveLength(1);
});

it.each([
  ['missing request-record notice', () => screen.getByRole('status').remove()],
  ['unrelated successful notice', () => { screen.getByRole('status').textContent = 'Research committed.'; }],
  ['hidden recorded notice', () => { screen.getByRole('status').style.visibility = 'hidden'; }],
  ['changed receiving host', () => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'capybara', dockedAt: '2026-10-06T00:00:00.000Z' }] })],
  ['changed source cycle', () => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, currentTurn: 2 })],
  ['withdrawn source phase', () => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, phase: 'closed' })],
  ['source cache', () => useSessionStore.getState().setSessionSnapshotFreshness('cache')],
] as const)('does not credit a recorded request after %s', async (_name, afterRecord) => {
  const f = fixture({ capy: true, afterRecord });
  await expect(f.runCapy()).rejects.toThrow();
  expect(f.posts).toHaveLength(1); expect(f.counts().clicks).toBe(1);
});

it('retains exact Scout SDK replay and rejects private delivery or fabricated projection revision credit', async () => {
  const drift = fixture({ capy: true, replayDrift: true });
  await expect(drift.runCapy()).rejects.toThrow(/replay must agree/i);
  expect(drift.posts).toHaveLength(1); expect(drift.replays).toHaveLength(1);
});

it('binds the Capy recorded-request stage to all public receipt and current visible projection fields', async () => {
  const f = fixture({ capy: true }), outcome = await f.runCapy();
  expect(capybaraStageOutcome({ ...outcome, roleId }).status).toBe('completed');
  for (const field of ['requestId', 'entitlementId', 'source', 'ownerRoleId', 'anchorShipId', 'receivingShipId',
    'targetCoordinateHash', 'resolution', 'cycle']) {
    const wrong = plain(outcome); wrong.evidence.response[field] = 'unrelated';
    expect(capybaraStageOutcome({ ...wrong, roleId }).status, field).toBe('pending');
  }
  for (const change of [
    (value: typeof outcome) => { value.evidence.response.revision = 999; },
    (value: typeof outcome) => { value.evidence.projection.gm.revision = 999; },
    (value: typeof outcome) => { value.evidence.projection.crew.cycle = 2; },
    (value: typeof outcome) => { value.evidence.projection.renderedStatus = 'private-result-visible'; },
    (value: typeof outcome) => { delete value.evidence.projection.scoutRequest; },
    (value: typeof outcome) => { value.evidence.actor.sessionIdHash = 'foreign'; },
    (value: typeof outcome) => { value.evidence.response.exactReplay = false; },
    (value: typeof outcome) => { value.evidence.response.replayStatus = 'committed'; },
  ]) {
    const wrong = plain(outcome); change(wrong);
    expect(capybaraStageOutcome({ ...wrong, roleId }).status).toBe('pending');
  }
});

it.each([
  ['UID', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'foreign-uid' })],
  ['SID', () => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, id: 'foreign-sid' })],
  ['console', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, activeConsoleRoleId: null })],
  ['assignment', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, assignedRoleId: 'comms-officer' })],
  ['replacement', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementStatus: 'awaiting-re-role' })],
  ['connection', () => useSessionStore.getState().setConnection('offline')],
  ['freshness', () => useSessionStore.getState().setSessionSnapshotFreshness('cache')],
  ['phase', () => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    turnPhase: { ...useSessionStore.getState().session!.turnPhase!, airspace: { state: 'restricted', tickerActive: false, pressAccess: false } } })],
] as const)('does not arm a mutation observer after original %s readiness is lost', async (_label, change) => {
  const f = fixture({ beforeCapture: change });
  await expect(f.run()).rejects.toThrow();
  expect(f.counts().clicks).toBe(0); expect(f.counts().observers).toBe(0);
  expect(f.posts).toHaveLength(0); expect(f.replays).toHaveLength(0);
});

it.each([
  ['generation', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, connectionGeneration: 4 })],
  ['hydration', () => useSessionStore.setState({ identityHydrationRevision: 2 })],
  ['group', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, fleetGroupId: 'fleet-2' })],
] as const)('retains the real rich selector original %s fence before final preparation', async (_label, change) => {
  const f = fixture({ duringSecondSelection: change });
  await expect(f.run()).rejects.toThrow(/changed/i);
  expect(f.counts().observers).toBe(0); expect(f.counts().clicks).toBe(0);
  expect(f.posts).toHaveLength(0); expect(f.replays).toHaveLength(0);
});

it('does not substitute a different exact SDK replay receipt', async () => {
  const f = fixture({ replayDrift: true });
  await expect(f.run()).rejects.toThrow(/replay must agree/i);
  expect(f.posts).toHaveLength(1); expect(f.replays).toHaveLength(1);
});

it.each(['Auth', 'document'] as const)('rejects the original %s changing during sole final preparation', async changed => {
  const f = fixture({ afterFill: () => changed === 'Auth' ? f.changeAuth('foreign-auth') : f.replaceDocument() });
  await expect(f.run()).rejects.toThrow(/actor|original/i);
  expect(f.counts().fills).toBe(1); expect(f.counts().observers).toBe(0);
  expect(f.counts().clicks).toBe(0); expect(f.posts).toHaveLength(0); expect(f.replays).toHaveLength(0);
});

it.each([
  ['restricted phase', () => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    turnPhase: { ...useSessionStore.getState().session!.turnPhase!, airspace: { state: 'restricted', tickerActive: false, pressAccess: false } } })],
  ['source cache', () => useSessionStore.getState().setSessionSnapshotFreshness('cache')],
  ['replaced holder', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementStatus: 'awaiting-re-role' })],
] as const)('fails the current ordinary control before arming if %s arrives during preparation', async (_name, afterFill) => {
  const f = fixture({ afterFill });
  await expect(f.run()).rejects.toThrow(/control/i);
  expect(f.counts().fills).toBe(1); expect(f.counts().observers).toBe(0);
  expect(f.counts().clicks).toBe(0); expect(f.posts).toHaveLength(0); expect(f.replays).toHaveLength(0);
});
