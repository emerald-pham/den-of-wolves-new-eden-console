import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { act, cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AwayMissionLifecyclePanel from './AwayMissionLifecyclePanel';
import {
  createCurrentAwayMissionLifecycleActions,
  parseAwayMissionLifecyclePublicState,
  type AwayMissionLifecycleCallablePayload,
  type AwayMissionLifecycleCallableReply,
} from '@/lib/awayMissionLifecycleService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import {
  applyAwayMissionLifecycleCommand,
  createAwayMissionLifecycleRecord,
  projectAwayMissionPrivateState,
  projectAwayMissionPublicState,
  type AwayMissionLifecycleCommand,
  type AwayMissionLifecycleRecord,
} from '../../functions/src/awayMissionLifecycleAdapter';
import { createMissionLifecycleState } from '../../functions/src/missionLifecycle';
import { missionDeck, missionDeckStateFromCards, type MissionCardId } from '../../functions/src/missionDeck';

const transport = vi.hoisted(() => ({ uid: '', callable: vi.fn(), invoke: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: transport.callable }));
vi.mock('@/lib/firebase', () => ({
  functions: () => 'native-only-transport',
  auth: () => ({ currentUser: { uid: transport.uid } }),
  app: () => 'unused-native-app',
}));

type Row = Record<string, unknown>;
const root = resolve(import.meta.dirname, '../..');
const sid = 'native-original-mission-session';
const group = 'native-original-mission-group';
const gm = 'native-original-gm';
const wing = 'native-original-wing';
const captain = 'native-original-capybara-small-captain';
const recycler = 'native-original-recycler';

function source(path: string) {
  return ts.createSourceFile(path, readFileSync(resolve(root, path), 'utf8'), ts.ScriptTarget.Latest, true,
    path.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
}
function find<T extends ts.Node>(node: ts.Node, predicate: (value: ts.Node) => value is T): T {
  let match: T | undefined;
  const visit = (value: ts.Node) => {
    if (match) return;
    if (predicate(value)) match = value;
    else ts.forEachChild(value, visit);
  };
  visit(node);
  assert.ok(match, 'The existing production caller/producer seam must exist.');
  return match;
}
function declaration(tree: ts.Node, name: string) {
  return find(tree, (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
}
function js(text: string) {
  return ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

// Extract executable production statements, not copies of the acceptance predicates.
const capySource = source('scripts/pc10-capybara-full-gameplay.mjs');
const capyCaller = declaration(capySource, 'runCapybaraFullGameGameplay');
const resolution = find(capyCaller, (node): node is ts.VariableStatement =>
  ts.isVariableStatement(node) && node.declarationList.declarations.some(value =>
    value.name.getText(capySource) === 'resolved'));
assert.ok(ts.isBlock(resolution.parent));
const callerStatements = [...resolution.parent.statements];
const begin = callerStatements.indexOf(resolution);
const end = callerStatements.findIndex(node => node.getText(capySource) ===
  'checks.serverMissionResolutionAndCustodyDelivery = true;');
assert.ok(begin >= 0 && end > begin);
const capyAcceptance = new Function('assert', 'missionUi', 'missionId', 'boaTaskOpportunityId',
  'capybaraStages', 'updateCapybaraStage', 'checks', `return (async () => {
    ${callerStatements.slice(begin, end + 1).map(node => node.getText(capySource)).join('\n')}
  })();`) as (assertion: typeof assert, ui: unknown, missionId: string, opportunityId: string | null,
    stages: Row, update: unknown, checks: Row) => Promise<void>;
const receiptSource = source('scripts/pc10-browser-ui-receipt.mjs');
const observeUiReceipt = new Function(`${declaration(receiptSource, 'observeUiReceipt')
  .getText(receiptSource).replace(/^export /, '')}; return observeUiReceipt;`)();
const capyUi = new Function('assert', 'missionPanel', 'observeUiReceipt', 'a',
  `${declaration(capyCaller, 'missionUi').getText(capySource)}; return missionUi;`);

const extraSource = source('scripts/pc10-extra-role-proof.mjs');
const extraCaller = declaration(extraSource, 'actualMission');
const resolveLoop = find(extraCaller, (node): node is ts.ForOfStatement =>
  ts.isForOfStatement(node) && ts.isArrayLiteralExpression(node.expression) &&
  node.expression.elements.some(value => ts.isStringLiteral(value) && value.text === 'Resolve away mission'));
const extraAcceptance = new Function('workspace', 'live', 'stage', 'matrix', 'recordExtraRoleResult',
  'mission', `return (async () => { ${resolveLoop.getText(extraSource)} })();`) as (...args: unknown[]) => Promise<void>;
const extraHelpers = source('scripts/pc10-extra-role-proof-helpers.mjs');
const recordExtraRoleResult = new Function('assert', `${declaration(extraHelpers, 'recordExtraRoleResult')
  .getText(extraHelpers).replace(/^export /, '')}; return recordExtraRoleResult;`)(assert);

// The native transport uses the actual server reply producer and privacy projection.
const callableSource = source('functions/src/awayMissionLifecycleCallable.ts');
const makeReply = new Function('projectAwayMissionPublicState', 'projectAwayMissionPrivateState', 'fail', js(
  ['safePublicProjection', 'safePrivateProjection', 'buildReply']
    .map(name => declaration(callableSource, name).getText(callableSource)).join('\n') + '\nreturn buildReply;',
))(projectAwayMissionPublicState, projectAwayMissionPrivateState, (_code: string, message: string) => {
  throw Error(message);
}) as (record: AwayMissionLifecycleRecord, status: 'committed' | 'replayed',
  request: AwayMissionLifecycleCallablePayload, actorUid: string) => AwayMissionLifecycleCallableReply;

interface FixtureOptions {
  bulk?: boolean;
  assigned?: MissionCardId;
  facilitator?: MissionCardId;
  noBulkCraft?: boolean;
}
function fixture(options: FixtureOptions = {}): AwayMissionLifecycleRecord {
  const bulk = options.bulk === true;
  const actor = bulk ? captain : recycler;
  const leader = bulk ? captain : wing;
  const initial = ['10♥', '10♦', options.assigned ?? 'A♥', options.facilitator ?? 'A♦'];
  const cards = missionDeck();
  const deck = missionDeckStateFromCards([
    ...initial.map(id => cards.find(card => card.id === id)!),
    ...cards.filter(card => !initial.includes(card.id)),
  ]);
  const lifecycle = createMissionLifecycleState({
    missionId: bulk ? 'native-bulk-mission' : 'native-boa-mission', siteCode: 'D', leaderUid: leader,
    participants: [{ uid: wing, roleId: 'wing-commander' },
      { uid: actor, roleId: bulk ? 'capybara-small-captain' : 'capybara-recycler' }],
    availableCarrierCraftIds: bulk ? ['starlight', 'capybara-small'] : ['starlight', 'boa'],
    deckState: deck, dealtCount: 2,
    initialCards: [{ participantUid: wing, cardId: '10♥' }, { participantUid: actor, cardId: '10♦' }],
  });
  assert.ok(lifecycle);
  let record = createAwayMissionLifecycleRecord({
    sessionId: sid, groupId: group, sourceCycle: 3, lifecycle,
    participantCrafts: [{ participantUid: wing, craftIds: ['starlight'] },
      { participantUid: actor, craftIds: bulk ? (options.noBulkCraft ? [] : ['capybara-small']) : ['boa'] }],
    ...(!bulk ? { boaReclamation: { actorUid: recycler, opportunityId: 'D-1' } } : {}),
  });
  assert.ok(record);
  const commit = (type: AwayMissionLifecycleCommand['type'], fields: Row, uid: string) => {
    const result = applyAwayMissionLifecycleCommand(record!, {
      type, requestId: `prepare-${type}-${record!.revision}`, expectedRevision: record!.revision, ...fields,
    } as AwayMissionLifecycleCommand, { actorUid: uid, isActiveGm: uid === gm,
      teamPhase: false, currentCycle: 3, legalDropOffShipIds: ['aegis'], randomIndex: () => 0 });
    assert.equal(result.status, 'committed'); assert.ok(result.record); record = result.record;
  };
  commit('requestExtraCards', { count: 1 }, actor);
  commit('distributeExtraCard', { participantUid: actor, opportunityId: 'D-1' }, leader);
  commit('openDiscards', {}, gm);
  commit('discardCard', { cardId: '10♥' }, wing);
  commit('discardCard', { cardId: '10♦' }, actor);
  commit('assignCards', { placements: [] }, wing);
  commit('assignCards', { placements: [{ cardId: options.assigned ?? 'A♥', opportunityId: 'D-1' }] }, actor);
  return record;
}

function nativeBridge(options: FixtureOptions = {}) {
  let record = fixture(options);
  let mutate = (_type: string, reply: AwayMissionLifecycleCallableReply) => reply;
  let replayMutate = (reply: AwayMissionLifecycleCallableReply) => reply;
  const requests: AwayMissionLifecycleCallablePayload[] = [];
  const actions: Row[] = [];
  let latest: AwayMissionLifecycleCallableReply | undefined;
  let observed: ((value: ReturnType<typeof response>) => void) | undefined;
  const leader = record.lifecycle.leaderUid;
  const missionId = record.lifecycle.missionId;
  const session = { id: sid, name: 'Native public mission bridge', phase: 'active', currentTurn: 3,
    ownerUid: gm, createdAt: '2026-10-06T15:00:00Z', updatedAt: '2026-10-06T15:00:00Z' } as GameSession;
  function acceptActor(uid: string) {
    transport.uid = uid;
    useSessionStore.setState({ session, me: { uid, sessionId: sid, role: uid === gm ? 'gm' : 'player',
      displayName: uid, joinedAt: session.createdAt, connected: true, fleetGroupId: group,
      connectionGeneration: 3, assignedRoleId: uid === wing ? 'wing-commander' : 'capybara-small-captain',
      activeConsoleRoleId: null, replacementStatus: null } as Player,
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1,
    gmInstance: uid === gm ? { id: 'native-original-gm-instance' } as never : null });
  }
  function command(request: AwayMissionLifecycleCallablePayload, uid: string) {
    assert.equal(request.sessionId, sid); assert.equal(request.missionId, missionId);
    const { sessionId: _sid, missionId: _missionId, instanceId: _instanceId, ...data } = request;
    const applied = applyAwayMissionLifecycleCommand(record, data as AwayMissionLifecycleCommand, {
      actorUid: uid, isActiveGm: uid === gm, teamPhase: false, currentCycle: 3,
      legalDropOffShipIds: ['aegis'], randomIndex: () => 0,
    });
    assert.notEqual(applied.status, 'denied'); assert.ok(applied.record); record = applied.record;
    return mutate(request.type, makeReply(record, applied.status, request, uid));
  }
  transport.callable.mockImplementation((_functions: unknown, name: string) => {
    assert.equal(name, 'commitAwayMissionLifecycleCommand'); return transport.invoke;
  });
  transport.invoke.mockImplementation(async (request: AwayMissionLifecycleCallablePayload) => {
    requests.push(structuredClone(request));
    latest = command(request, transport.uid);
    observed?.(response(request, latest));
    return { data: latest };
  });
  function response(request: AwayMissionLifecycleCallablePayload, result: AwayMissionLifecycleCallableReply) {
    return { ok: () => true, status: () => 200, json: async () => ({ result }),
      url: () => 'https://native.invalid/us-central1/commitAwayMissionLifecycleCommand',
      request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: request }) }) };
  }
  function panel(role: 'gm' | 'wing-commander') {
    cleanup(); const uid = role === 'gm' ? gm : leader; acceptActor(uid);
    const publicState = parseAwayMissionLifecyclePublicState(projectAwayMissionPublicState(record, uid), missionId);
    assert.ok(publicState);
    const service = createCurrentAwayMissionLifecycleActions(() => ({ missionId,
      missionLeaderUid: leader, revision: record.revision }), sid, uid);
    render(<AwayMissionLifecyclePanel actorUid={uid} isGm={role === 'gm'} isMissionLeader={uid === leader}
      publicState={publicState} privateState={projectAwayMissionPrivateState(record, uid)} actions={service} />);
    const region = within(document.body).getByRole('region', { name: `Away mission // ${missionId}` });
    const locator = { getByRole: (buttonRole: string, query: { name: string }) => {
      assert.equal(buttonRole, 'button');
      const button = () => within(region).getByRole('button', { name: query.name });
      return { count: async () => within(region).queryAllByRole('button', { name: query.name }).length,
        isEnabled: async () => !(button() as HTMLButtonElement).disabled,
        click: async () => { await userEvent.click(button()); } };
    } };
    const surface = { page: { waitForResponse: () => new Promise<ReturnType<typeof response>>(resolveResponse => {
      observed = resolveResponse;
    }) }, callable: async (name: string, request: AwayMissionLifecycleCallablePayload) => {
      assert.equal(name, 'commitAwayMissionLifecycleCommand');
      assert.equal(transport.uid, uid); assert.equal(useSessionStore.getState().me?.uid, uid);
      const reply = replayMutate(command(request, uid));
      return { status: 'committed', result: reply };
    } };
    return { panel: locator, surface };
  }
  const missionUi = capyUi(assert, async (role: 'gm' | 'wing-commander', id: string) => {
    assert.equal(id, missionId); return panel(role);
  }, observeUiReceipt, { actions });
  return {
    missionId, requests, actions, record: () => record,
    mutate: (change: typeof mutate) => { mutate = change; },
    mutateReplay: (change: typeof replayMutate) => { replayMutate = change; },
    prepareResolution: async () => {
      const view = panel('gm');
      await userEvent.click(within(document.body).getByRole('button', { name: 'Add facilitator cards' }));
      assert.equal(record.lifecycle.phase, 'facilitator-cards-added'); void view;
      requests.length = 0;
    },
    capy: async (opportunityId: string | null = 'D-1', reclaimed = true) => {
      const stages: Row[] = [], checks = {};
      await capyAcceptance(assert, missionUi, missionId, opportunityId,
        { 'boa-mission-reclamation': { status: reclaimed ? 'completed' : 'pending' } },
        async (id: string, result: Row) => { stages.push({ id, ...result }); }, checks);
      return { stages, checks };
    },
    extra: async () => {
      const matrix = [{ id: 'capybara-small-captain:bulk-haulage', status: 'pending', attempts: [],
        endpoint: 'commitAwayMissionLifecycleCommand' }];
      const workspace = { getByRole: (role: string, query: { name: string }) => panel('gm').panel.getByRole(role, query) };
      await extraAcceptance(workspace, { context: { gm: {} }, ui: async (_surface: unknown,
        _name: string, button: { click: () => Promise<void> }) => {
        latest = undefined; await button.click(); assert.ok(latest);
        assert.ok(parseAwayMissionLifecyclePublicState(latest.publicState, missionId));
        return { result: latest, receipt: { endpoint: 'commitAwayMissionLifecycleCommand', httpStatus: 200,
          logicalStatus: 'committed', identityVerified: true, exactBrowserSdkReplay: true,
          requestId: latest.requestId, revision: latest.revision } };
      } }, async () => undefined, matrix, recordExtraRoleResult, missionId);
      return matrix;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  act(() => useSessionStore.setState({ session: null, me: null, gmInstance: null,
    connection: 'offline', sessionSnapshotFreshness: 'unknown', identityHydrationRevision: 0 }));
});

describe('PC10 public mission caller mapping through real lifecycle, projection, client service and controls', () => {
  it.each([
    ['critical-success', 'A♥', 'A♦'], ['success', '6♥', 'A♦'],
  ] as const)('completes only the actual Boa %s task and delivered public Scrap reward', async (outcome, assigned, facilitator) => {
    const bridge = nativeBridge({ assigned, facilitator }); await bridge.prepareResolution();
    const result = await bridge.capy();
    expect(bridge.record().outcomes?.find(row => row.opportunityId === 'D-1')?.outcome).toBe(outcome);
    expect(projectAwayMissionPublicState(bridge.record())?.outcomes?.[0]).not.toHaveProperty('rewardBranch');
    expect(bridge.record().rewards?.find(row => row.opportunityId === 'D-1')?.resources).toEqual({ scrap: 1 });
    expect(bridge.record().custody).toEqual({ status: 'dropped-off', holderUid: wing, shipId: 'aegis' });
    expect(result.stages).toEqual([{ id: 'mission-successful-delivery', status: 'completed',
      roleId: 'wing-commander', endpoint: 'commitAwayMissionLifecycleCommand', cycle: 3 }]);
    expect(bridge.requests.map(request => request.type)).toEqual(['resolve', 'dropOff']);
    expect(bridge.actions).toHaveLength(2);
    expect(bridge.actions.every(row => row.exactBrowserSdkReplay === true)).toBe(true);
  });
  it('keeps a genuine failed Boa task pending despite completed custody delivery', async () => {
    const bridge = nativeBridge({ assigned: '2♥', facilitator: '2♦' }); await bridge.prepareResolution();
    const result = await bridge.capy();
    expect(bridge.record().outcomes?.[0]?.outcome).toBe('failure');
    expect(result.stages[0]?.status).toBe('pending');
  });
  it.each([['D-2', true], ['D-1', false], [null, true]] as const)(
    'keeps unrelated/uncommitted/unoffered Boa choice %s/%s pending', async (choice, reclaimed) => {
      const bridge = nativeBridge(); await bridge.prepareResolution();
      expect((await bridge.capy(choice, reclaimed)).stages[0]?.status).toBe('pending');
    });
  it.each(['missing-reward', 'wrong-reward-branch', 'missing-drop', 'foreign-holder', 'delivery-reward-drift'] as const)(
    'withholds completion for a parsed public %s counterexample', async kind => {
      const bridge = nativeBridge(); await bridge.prepareResolution();
      bridge.mutate((type, reply) => {
        const state = structuredClone(reply.publicState) as unknown as Row;
        if (kind === 'missing-reward') state.rewards = (state.rewards as Row[]).filter(row => row.opportunityId !== 'D-1');
        if (kind === 'wrong-reward-branch') (state.rewards as Row[])[0]!.branch = 'none';
        if (type === 'dropOff' && kind === 'missing-drop') state.custody = { status: 'mission-leader', holderUid: wing, shipId: null };
        if (type === 'dropOff' && kind === 'foreign-holder') (state.custody as Row).holderUid = 'foreign-holder';
        if (type === 'dropOff' && kind === 'delivery-reward-drift') (state.rewards as Row[])[0]!.resources = { scrap: 2 };
        // Explicit adversarial transport mutation of the real projection, never a positive fixture DTO.
        expect(parseAwayMissionLifecyclePublicState(state, bridge.missionId)).not.toBeNull();
        return { ...reply, publicState: state as unknown as AwayMissionLifecycleCallableReply['publicState'] };
      });
      expect((await bridge.capy()).stages[0]?.status).toBe('pending');
    });
  it('retains the original exact SDK replay public-state rejection', async () => {
    const bridge = nativeBridge(); await bridge.prepareResolution();
    bridge.mutateReplay(reply => ({ ...reply, publicState: { ...reply.publicState, revision: reply.revision + 1 } }));
    await expect(bridge.capy()).rejects.toThrow();
    expect(bridge.actions).toHaveLength(0);
  });
  it.each([
    ['critical-success', 'A♥', 'A♦'], ['success', '6♥', 'A♦'],
  ] as const)('credits the actual Capybara Small %s public Bulk Haulage resource reward', async (outcome, assigned, facilitator) => {
    const bridge = nativeBridge({ bulk: true, assigned, facilitator });
    const matrix = await bridge.extra();
    expect(bridge.record().outcomes?.[0]?.outcome).toBe(outcome);
    expect(bridge.record().rewards?.[0]?.bulkHaulageApplied).toBe(true);
    expect(matrix[0]?.status).toBe('committed');
    expect(matrix[0]?.attempts).toHaveLength(1);
    expect(bridge.requests.map(request => request.type)).toEqual(['addFacilitatorCards', 'resolve']);
  });
  it.each([{ assigned: '2♥', facilitator: '2♦' }, { noBulkCraft: true }] as const)(
    'does not credit actual non-winning or non-Capybara-craft rewards: %j', async options => {
      const bridge = nativeBridge({ bulk: true, ...options });
      expect((await bridge.extra())[0]?.status).toBe('pending');
      expect(bridge.record().rewards?.[0]?.bulkHaulageApplied).toBe(false);
    });
  it.each(['unrelated-opportunity', 'missing-reward', 'missing-outcome', 'failure-outcome', 'no-resource', 'not-resolved'] as const)(
    'withholds Bulk Haulage credit for a parsed public %s counterexample', async kind => {
      const bridge = nativeBridge({ bulk: true });
      bridge.mutate((type, reply) => {
        if (type !== 'resolve') return reply;
        const state = structuredClone(reply.publicState) as unknown as Row;
        if (kind === 'unrelated-opportunity') (state.rewards as Row[])[0]!.opportunityId = 'D-2';
        if (kind === 'missing-reward') state.rewards = [];
        if (kind === 'missing-outcome') state.outcomes = [];
        if (kind === 'failure-outcome') (state.outcomes as Row[])[0]!.outcome = 'failure';
        if (kind === 'no-resource') (state.rewards as Row[])[0]!.resources = {};
        if (kind === 'not-resolved') { state.status = 'complete'; state.phase = 'complete'; }
        expect(parseAwayMissionLifecyclePublicState(state, bridge.missionId)).not.toBeNull();
        return { ...reply, publicState: state as unknown as AwayMissionLifecycleCallableReply['publicState'] };
      });
      expect((await bridge.extra())[0]?.status).toBe('pending');
    });
  it('rejects foreign mission DTOs through the real parser rather than inventing fallback fields', () => {
    const record = fixture(); const state = projectAwayMissionPublicState(record);
    expect(parseAwayMissionLifecyclePublicState(state, 'foreign-mission')).toBeNull();
    expect(parseAwayMissionLifecyclePublicState({ ...state, rewardResults: [] }, record.lifecycle.missionId)).toBeNull();
  });
  it.each(['foreign-auth', 'cache', 'foreign-session'] as const)('retains real client-service %s authority rejection before command', async kind => {
    const bridge = nativeBridge(); await bridge.prepareResolution();
    transport.uid = gm;
    const store = useSessionStore.getState();
    if (kind === 'foreign-auth') transport.uid = 'foreign-auth';
    if (kind === 'cache') useSessionStore.setState({ sessionSnapshotFreshness: 'cache' });
    if (kind === 'foreign-session') useSessionStore.setState({ session: { ...store.session!, id: 'foreign-session' } });
    const service = createCurrentAwayMissionLifecycleActions(() => ({ missionId: bridge.missionId,
      missionLeaderUid: wing, revision: bridge.record().revision }), sid, gm);
    await expect(service.resolve()).rejects.toThrow();
    expect(bridge.requests).toHaveLength(0);
  });
});
