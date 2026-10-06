import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { evaluateProcedureCapture } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps, readActionState } from './pc10-pending-procedure-ui-recipes.mjs';

const SESSION = 'shuttle-member-craft-session';
const GROUP = 'fleet-shuttle-member';
const UID = 'shuttle-member-holder-uid';
const UID_HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const ROLE = 'quellon-explorer';
const SHUTTLE = 'blacksmith';
const HOST = 'quellon';
const DESTINATION = 'icebreaker';
const CYCLE = 2;
const CONTROL_REVISION = 7;
const ENDPOINTS = [
  'evacuateShuttleSurvivorsCommand',
  'rechargeHostConsoleFromShuttle',
  'transferShuttleCargoCommand',
];

const hashUid = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);

function rawState(endpoint, patch = {}) {
  const session = {
    id: SESSION, currentTurn: CYCLE, phase: 'active', playerDiscovery: { groupId: GROUP },
    activeRoleIds: [ROLE], activeVesselIds: [HOST, DESTINATION],
    memberSessionScope: { groupId: GROUP, vesselIds: [HOST, DESTINATION], craftIds: [SHUTTLE] },
    currentActorBerthAuthority: { sessionId: SESSION, actorUid: UID, groupId: GROUP, role: 'player',
      connectionGeneration: 6, assignedRoleId: ROLE, activeConsoleRoleId: ROLE,
      replacementRoleId: null, replacementStatus: null, shipId: HOST },
    shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID,
      ownerUid: 'printed-owner-uid', ownerRoleId: 'blacksmith-engineer', revision: CONTROL_REVISION } },
    shuttleDockings: [{ shuttleId: SHUTTLE, shipId: HOST, dockedAt: '2026-10-06T10:00:00.000Z' }],
    shipSurvivors: { [HOST]: 1000, [DESTINATION]: 500 },
    shuttleEvacuations: { [SHUTTLE]: { cycle: 1, moved: 500, revision: 3 } },
    shipResources: { [HOST]: { food: 5 }, [DESTINATION]: { food: 1 } },
    shuttleCargo: { [SHUTTLE]: { food: 0 } },
    shuttleFuelled: { [SHUTTLE]: true },
    shipDamage: { [HOST]: { destroyed: false } },
    turnPhase: { turn: CYCLE, airspace: { state: 'lifted' } },
    maintenanceCycles: { [HOST]: { turn: CYCLE, completedAt: '2026-10-06T11:00:00.000Z', revision: 9 } },
    serviceShuttleRecharges: { [SHUTTLE]: { cycle: 1, revision: 3 } },
  };
  Object.assign(session, patch.session ?? {});
  return {
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 11,
    me: { role: 'player', connected: true, replacementStatus: null, sessionId: SESSION, uid: UID,
      fleetGroupId: GROUP, activeConsoleRoleId: ROLE, assignedRoleId: ROLE, connectionGeneration: 6 },
    session,
    ...Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'session')),
  };
}

function makeLocator({ options = [], count = 1, onClick, onSelect, onFill } = {}) {
  let value = '';
  return {
    count: async () => count,
    isVisible: async () => count > 0,
    isEnabled: async () => count > 0,
    locator: () => ({ evaluateAll: async callback => callback(options.map(option => ({
      value: option.value, textContent: option.textContent ?? option.value, disabled: option.disabled === true,
    }))) }),
    selectOption: async selected => { value = selected; await onSelect?.(selected); },
    inputValue: async () => value,
    fill: async selected => { value = selected; await onFill?.(selected); },
    click: async () => { await onClick?.(); },
    allTextContents: async () => [],
  };
}

function memberHarness(endpoint, { initialState = rawState(endpoint), roleId = ROLE } = {}) {
  let state = structuredClone(initialState);
  let clicks = 0;
  let visibleStatus = '';
  const uidHash = hashUid(UID);
  const choices = {
    'Receiving ship': [{ value: DESTINATION, textContent: 'Icebreaker' }],
    Survivors: [{ value: '100', textContent: '100' }],
    'Host console': [{ value: 'hydroponics', textContent: 'Hydroponics' }],
    Resource: [{ value: 'food', textContent: 'Food' }],
  };
  const buttonNames = endpoint === 'evacuateShuttleSurvivorsCommand'
    ? ['Move survivors']
    : endpoint === 'rechargeHostConsoleFromShuttle' ? ['Recharge console'] : ['Load shuttle'];
  const panelNames = {
    evacuateShuttleSurvivorsCommand: 'Survivor evacuation',
    rechargeHostConsoleFromShuttle: 'Service shuttle recharge',
    transferShuttleCargoCommand: 'Shuttle cargo transfer',
  };
  const makeSurface = isGm => {
    const panel = {
      getByLabel: label => makeLocator({ options: choices[label] ?? [] }),
      getByRole: (role, options = {}) => role === 'button' && buttonNames.includes(options.name)
        ? makeLocator({ onClick: async () => { clicks += 1; } }) : makeLocator({ count: 0 }),
    };
    const page = {
      url: () => `http://localhost:5174/#/shuttles/${SHUTTLE}`,
      evaluate: async (callback, input = {}) => {
        const fixtureImport = async moduleUrl => {
          if (moduleUrl === '/src/store/useSessionStore.ts') return { useSessionStore: { getState: () => state } };
          if (moduleUrl === '/src/lib/firebase.ts') return { auth: () => ({ currentUser: { uid: UID } }) };
          throw new Error(`Unexpected serialized source import: ${String(moduleUrl)}`);
        };
        const source = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
        return new Function('fixtureImport', 'crypto', 'input', `return (${source})(input);`)(
          fixtureImport, webcrypto, input);
      },
      getByRole: (role, options = {}) => {
        if (role === 'region' && options.name === panelNames[endpoint]) return panel;
        if (role === 'status') return { allTextContents: async () => visibleStatus ? [visibleStatus] : [] };
        return makeLocator({ count: 0 });
      },
    };
    return {
      page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
      observe: async () => isGm ? { sameActor: true, sessionId: SESSION, uidHash: 'gm-holder',
        playerRole: 'gm', gmInstanceOwned: true, instanceId: 'gm-instance', connection: 'live', freshness: 'server' }
        : { sameActor: true, sessionId: SESSION, uidHash, playerRole: 'player', profileRoleId: roleId,
          activeConsoleRoleId: roleId, assignedRoleId: roleId, connection: 'live', freshness: 'server' },
    };
  };
  const player = makeSurface(false);
  const gm = makeSurface(true);
  const game = { select: async role => role === 'gm' ? gm : player };
  const context = { initial: { sessionId: SESSION }, roster: [{ roleId, uidHash }] };
  return { context, game, player, gm, baseState: structuredClone(initialState),
    setState: value => { state = structuredClone(value); }, setVisibleStatus: value => { visibleStatus = value; },
    clickCount: () => clicks };
}

function resultAndRequest(endpoint, expected, transitionBefore, transitionAfter) {
  const requestId = `${endpoint}-request`;
  if (endpoint === 'evacuateShuttleSurvivorsCommand') {
    const request = { sessionId: SESSION, requestId, shuttleId: SHUTTLE, destinationShipId: DESTINATION,
      amount: 100, expectedControlRevision: CONTROL_REVISION, expectedCycle: CYCLE, expectedEvacuationRevision: 3 };
    const result = { status: 'committed', sessionId: SESSION, requestId, shuttleId: SHUTTLE,
      sourceShipId: HOST, destinationShipId: DESTINATION, amount: 100, sourcePopulation: 900,
      destinationPopulation: 600, cycle: CYCLE, movedThisCycle: 100, evacuationRevision: 4 };
    return { request, result };
  }
  if (endpoint === 'rechargeHostConsoleFromShuttle') {
    const request = { sessionId: SESSION, requestId, expectedCycle: CYCLE, shuttleId: SHUTTLE,
      expectedControlRevision: CONTROL_REVISION, expectedMaintenanceRevision: 9, expectedHostShipId: HOST };
    const result = { status: 'committed', sessionId: SESSION, requestId, shuttleId: SHUTTLE,
      hostShipId: HOST, consoleId: 'hydroponics', cycle: CYCLE, maintenanceRevision: 9,
      rechargeRevision: 4, immediate: true, message: 'Host console recharged.' };
    return { request, result };
  }
  const request = { sessionId: SESSION, requestId, shuttleId: SHUTTLE, resourceId: 'food',
    direction: 'load', amount: 1, expectedControlRevision: CONTROL_REVISION };
  const result = { status: 'committed', sessionId: SESSION, requestId, shuttleId: SHUTTLE,
    hostShipId: HOST, resourceId: 'food', direction: 'load', amount: 1, shipAmount: 4, shuttleAmount: 1 };
  return { request, result };
}

test('serialized current-member projection authorizes each mounted shuttle craft recipe without a GM fleet map', async t => {
  for (const endpoint of ENDPOINTS) await t.test(endpoint, async () => {
    const harness = memberHarness(endpoint);
    const sourceState = await readActionState(harness.player, SHUTTLE);
    assert.equal(sourceState.currentMemberScope?.groupId, GROUP);
    assert.equal(sourceState.currentDocumentAuthority?.uidHash, UID_HASH);
    assert.equal(sourceState.currentDocumentAuthority?.shuttleAuthorized, true);
    assert.equal(sourceState.shipFleetGroupIds, undefined, 'the normal member view intentionally has no GM group map');
    const recipe = await createPendingProcedureDefaultSteps()[`core:${endpoint}`](harness);
    assert.equal(recipe?.expected.groupId, GROUP, 'capture must use only the validated current member group');
    assert.equal(recipe?.expected.sourceAuthority?.authorityHash, sourceState.currentDocumentAuthority.authorityHash);
    const prepared = await recipe.prepare({ surface: harness.player, actor: await harness.player.observe(),
      source: { live: true, sessionId: SESSION, cycle: CYCLE, phase: 'active', revision: recipe.expected.sourceRevision } });
    assert.equal(prepared.offered, true, prepared.reason);
    assert.equal(prepared.sourceAuthorityBefore?.authorityHash, sourceState.currentDocumentAuthority.authorityHash);
  });
});

test('the original serialized document authority and member audience remain required before each mounted click', async t => {
  const invalidProjections = [
    ['group changed', { session: { memberSessionScope: { groupId: 'foreign-fleet', vesselIds: [HOST, DESTINATION], craftIds: [SHUTTLE] } } }],
    ['craft omitted', { session: { memberSessionScope: { groupId: GROUP, vesselIds: [HOST, DESTINATION], craftIds: [] } } }],
    ['host omitted', { session: { memberSessionScope: { groupId: GROUP, vesselIds: [DESTINATION], craftIds: [SHUTTLE] } } }],
    ['document generation changed', { me: { connectionGeneration: 7 } }],
    ['document hydration changed', { identityHydrationRevision: 12 }],
    ['authenticated UID changed', { me: { uid: 'foreign-auth-uid' } }],
  ];
  for (const endpoint of ENDPOINTS) {
    const variants = endpoint === 'evacuateShuttleSurvivorsCommand'
      ? [...invalidProjections, ['destination omitted', { session: {
        memberSessionScope: { groupId: GROUP, vesselIds: [HOST], craftIds: [SHUTTLE] },
      } }]]
      : invalidProjections;
    for (const [label, patch] of variants) await t.test(`${endpoint}: ${label}`, async () => {
      const harness = memberHarness(endpoint);
      const recipe = await createPendingProcedureDefaultSteps()[`core:${endpoint}`](harness);
      const prepared = await recipe.prepare({ surface: harness.player, actor: await harness.player.observe(),
        source: { live: true, sessionId: SESSION, cycle: CYCLE, phase: 'active', revision: recipe.expected.sourceRevision } });
      assert.equal(prepared.offered, true, prepared.reason);
      harness.setState(rawState(endpoint, patch));
      await assert.rejects(prepared.click(), /group|source authority|changed before/i);
      assert.equal(harness.clickCount(), 0);
    });
  }
});

test('post-action cargo receipt carries the actual current member group and unchanged document authority', async () => {
  const endpoint = 'transferShuttleCargoCommand';
  const harness = memberHarness(endpoint);
  const recipe = await createPendingProcedureDefaultSteps()[`core:${endpoint}`](harness);
  const sourceBefore = await readActionState(harness.player, SHUTTLE);
  const prepared = await recipe.prepare({ surface: harness.player, actor: await harness.player.observe(),
    source: { live: true, sessionId: SESSION, cycle: CYCLE, phase: 'active', revision: recipe.expected.sourceRevision } });
  assert.equal(prepared.offered, true, prepared.reason);
  await prepared.click();
  const after = rawState(endpoint);
  after.session.shipResources[HOST].food = 4;
  after.session.shuttleCargo[SHUTTLE].food = 1;
  harness.setState(after);
  const { request, result } = resultAndRequest(endpoint, recipe.expected, prepared.transitionBefore);
  harness.setVisibleStatus('Cargo loaded.');
  const inspected = await recipe.inspect({ surface: harness.player, result, request });
  assert.equal(inspected.sourceAfter.live, true);
  assert.equal(inspected.sourceAfter.groupId, GROUP);
  assert.equal(inspected.sourceAuthorityAfter?.authorityHash, sourceBefore.currentDocumentAuthority.authorityHash);
  assert.equal(inspected.transitionAfter?.groupId, GROUP, 'the exact cargo witness must carry an actual source group');
  assert.equal(evaluateProcedureCapture({ caseId: `core:${endpoint}`, expected: recipe.expected,
    offered: true, mountedUi: true, actorBefore: await harness.player.observe(), actorAfter: await harness.player.observe(),
    sourceBefore: { live: true, sessionId: SESSION, cycle: CYCLE, revision: recipe.expected.sourceRevision, groupId: GROUP },
    sourceAfter: inspected.sourceAfter, transitionBefore: prepared.transitionBefore,
    transitionAfter: inspected.transitionAfter, request, response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } }, rendered: { visible: true, resultStatus: result.status } }).status,
  'completed');
});

function committedSourceState(endpoint) {
  const after = rawState(endpoint);
  if (endpoint === 'evacuateShuttleSurvivorsCommand') {
    after.session.shipSurvivors[HOST] = 900;
    after.session.shipSurvivors[DESTINATION] = 600;
    after.session.shuttleEvacuations[SHUTTLE] = { cycle: CYCLE, moved: 100, revision: 4 };
  } else if (endpoint === 'rechargeHostConsoleFromShuttle') {
    after.session.serviceShuttleRecharges[SHUTTLE] = { cycle: CYCLE, revision: 4 };
  } else {
    after.session.shipResources[HOST].food = 4;
    after.session.shuttleCargo[SHUTTLE].food = 1;
  }
  return after;
}

async function evaluateMemberCapture(endpoint, harness, recipe, prepared, inspected, request, result) {
  return evaluateProcedureCapture({ caseId: `core:${endpoint}`, expected: recipe.expected,
    offered: true, mountedUi: true, actorBefore: await harness.player.observe(), actorAfter: await harness.player.observe(),
    sourceBefore: { live: true, sessionId: SESSION, cycle: CYCLE,
      revision: recipe.expected.sourceRevision, groupId: GROUP },
    sourceAfter: inspected.sourceAfter, transitionBefore: prepared.transitionBefore,
    transitionAfter: inspected.transitionAfter,
    request, response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } }, rendered: inspected.rendered });
}

test('post-inspect member source and command receipts stay bound for all three mounted craft recipes', async t => {
  for (const endpoint of ENDPOINTS) await t.test(endpoint, async () => {
    const harness = memberHarness(endpoint);
    const sourceBefore = await readActionState(harness.player, SHUTTLE);
    const recipe = await createPendingProcedureDefaultSteps()[`core:${endpoint}`](harness);
    const prepared = await recipe.prepare({ surface: harness.player, actor: await harness.player.observe(),
      source: { live: true, sessionId: SESSION, cycle: CYCLE, phase: 'active', revision: recipe.expected.sourceRevision } });
    assert.equal(prepared.offered, true, prepared.reason);
    assert.equal(prepared.sourceAuthorityBefore?.authorityHash, sourceBefore.currentDocumentAuthority.authorityHash);
    await prepared.click();

    harness.setState(committedSourceState(endpoint));
    const { request, result } = resultAndRequest(endpoint, recipe.expected, prepared.transitionBefore);
    harness.setVisibleStatus(endpoint === 'evacuateShuttleSurvivorsCommand' ? 'Moved 100 survivors.'
      : endpoint === 'rechargeHostConsoleFromShuttle' ? 'Host console recharged.' : 'Cargo loaded.');
    const inspected = await recipe.inspect({ surface: harness.player, result, request });
    assert.equal(inspected.sourceAfter.live, true);
    assert.equal(inspected.sourceAfter.groupId, GROUP);
    assert.equal(inspected.sourceAuthorityAfter?.authorityHash, sourceBefore.currentDocumentAuthority.authorityHash);
    if (endpoint !== 'rechargeHostConsoleFromShuttle') {
      assert.equal(inspected.transitionAfter?.groupId, GROUP,
        'the command witness must use the actual same-sample member group');
    }
    const capture = await evaluateMemberCapture(endpoint, harness, recipe, prepared, inspected, request, result);
    assert.equal(capture.status, 'completed', capture.reason);
    assert.equal(capture.exactSdkRetry, 'same-original-request-receipt-confirmed');
  });
});

test('post-inspect member-scope or document-authority drift remains pending for each mounted craft command', async t => {
  for (const endpoint of ENDPOINTS) for (const [label, patch] of [
    ['member group changed', { session: { memberSessionScope: {
      groupId: 'foreign-fleet', vesselIds: [HOST, DESTINATION], craftIds: [SHUTTLE],
    } } }],
    ['document hydration changed', { identityHydrationRevision: 12 }],
  ]) await t.test(`${endpoint}: ${label}`, async () => {
    const harness = memberHarness(endpoint);
    const recipe = await createPendingProcedureDefaultSteps()[`core:${endpoint}`](harness);
    const prepared = await recipe.prepare({ surface: harness.player, actor: await harness.player.observe(),
      source: { live: true, sessionId: SESSION, cycle: CYCLE, phase: 'active', revision: recipe.expected.sourceRevision } });
    assert.equal(prepared.offered, true, prepared.reason);
    await prepared.click();

    harness.setState(rawState(endpoint, patch));
    const { request, result } = resultAndRequest(endpoint, recipe.expected, prepared.transitionBefore);
    harness.setVisibleStatus(endpoint === 'evacuateShuttleSurvivorsCommand' ? 'Moved 100 survivors.'
      : endpoint === 'rechargeHostConsoleFromShuttle' ? 'Host console recharged.' : 'Cargo loaded.');
    const inspected = await recipe.inspect({ surface: harness.player, result, request });
    assert.equal(inspected.sourceAfter.live, false);
    assert.notEqual(inspected.sourceAuthorityAfter?.authorityHash, recipe.expected.sourceAuthority.authorityHash);
    const capture = await evaluateMemberCapture(endpoint, harness, recipe, prepared, inspected, request, result);
    assert.equal(capture.status, 'pending');
  });
});
