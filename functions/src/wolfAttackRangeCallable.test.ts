import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import { CORE_WOLF_TARGET_RING, EXPANDED_WOLF_TARGET_RING } from './wolfCombatMath';
import { resolveWolfTargeting, wolfCombatRoster } from './wolfCombatMath';
import { projectWolfAttackMemberView } from './wolfAttackAudience';

type Fields = Record<string, unknown>;

const testState = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const value = documents.get(path);
    return { exists: value !== undefined, id: path.split('/').at(-1) ?? '', ref: { path },
      get: (field: string) => value?.[field], data: () => value };
  };
  const querySnapshot = (path: string) => ({ docs: [...documents.keys()]
    .filter((candidate) => candidate.startsWith(`${path}/`) &&
      !candidate.slice(path.length + 1).includes('/')).map(snapshot) });
  const get = vi.fn(async (target: { path: string }) =>
    target.path.endsWith('/players') || target.path.endsWith('/fleetGroups')
      ? querySnapshot(target.path) : snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const value = { ...(documents.get(target.path) ?? {}) };
    for (const [path, field] of Object.entries(fields)) {
      const parts = path.split('.');
      let cursor = value;
      for (const part of parts.slice(0, -1)) {
        const nested = cursor[part];
        cursor[part] = { ...(nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : {}) };
        cursor = cursor[part] as Fields;
      }
      cursor[parts.at(-1)!] = field;
    }
    documents.set(target.path, value);
  });
  const remove = vi.fn((target: { path: string }) => documents.delete(target.path));
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '', get: async () => snapshot(path) });
  const collection = (path: string) => ({ path, get: async () => querySnapshot(path) });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: remove }));
  return { documents, get, set, update, remove, runTransaction, db: { doc: ref, collection, runTransaction } };
});

const entropy = vi.hoisted(() => ({ randomInt: vi.fn() }));
vi.mock('node:crypto', async (importOriginal) => ({ ...await importOriginal(), ...entropy }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => testState.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_path: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }) }));

import {
  getAegisEnrichedWarheadChoice,
  commitAegisEnrichedWarheadChoice,
  assignWolfRangeTargets,
  getAegisFighterWingLaunch,
  getWolfFighterRangeActionChoice,
  commitWolfFighterRangeActionChoice,
  launchAegisFighterWing,
  commitWolfRangeActionChoice,
  advanceWolfAttackLifecycle,
  getWolfRangeActionChoice,
  getWolfBoardingDefenceChoice,
  commitWolfBoardingDefenceChoice,
  getWolfBoardingSpecialChoice,
  commitWolfBoardingSpecialChoice,
  getWolfForceFieldChoice,
  commitWolfForceFieldChoice,
} from './index';
import { initialFighterWingCounts } from './fighterWings';

const targeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, undefined, () => 0);

function request(data: Record<string, unknown>, uid = 'xo-1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void { testState.documents.set(path, { ...fields }); }

function resetFixture(): void {
  testState.documents.clear();
  testState.get.mockClear();
  testState.set.mockClear();
  testState.update.mockClear();
  testState.remove.mockClear();
  testState.runTransaction.mockClear();
  entropy.randomInt.mockReset().mockImplementation(() => 5);
  const roster = wolfCombatRoster(targeting);
  put('sessions/s1', {
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    activeRoleIds: ['executive-officer'],
    turnPhase: { turn: 1, teamPhaseEndsAt: '2026-10-02T12:00:00.000Z', openAirspaceEndsAt: '2026-10-02T12:10:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    maintenanceCycles: { aegis: { turn: 1, step: 7, revision: 2, results: { '5': 'Reactor powered up.' },
      charges: ['missile-launchers', 'point-defence-lasers'], refuelled: [] } },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    shipUpgrades: { aegis: ['missile-launchers'] },
  });
  put('sessions/s1/players/xo-1', { uid: 'xo-1', role: 'player', connected: true,
    assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1'], memberShipIds: { 'xo-1': 'aegis' },
  });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'declared', currentStep: 'long-range', airspaceLocked: true,
    turn: 1, revision: 4, attackId: 'wolf-attack-test-1', deadlineAt: '2026-10-02T12:10:00.000Z',
    commanderRerollIndexes: [],
    preparation: { turn: 1, revision: 1, shipIds: [...firstTurnWolfAttackComposition().shipIds],
      targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' },
    calculationReceipt: { type: 'wolf-combat-calculation-stage', version: 1, turn: 1, step: 'targeting', targeting },
    combatRoster: roster,
    privateNotes: 'never returned to AEGIS',
  });
}

beforeEach(resetFixture);

it('lets the current Wing Commander launch each charged, operational AEGIS bay independently', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['executive-officer', 'wing-commander'],
    maintenanceCycles: { aegis: { ...(session.maintenanceCycles as Fields).aegis as Fields,
      charges: ['missile-launchers', 'point-defence-lasers', 'fighter-bay-alpha', 'fighter-bay-bravo'] } },
    fighterWingCounts: initialFighterWingCounts() });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });
  const view = await getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId: 'fighter-wing-alpha' }, 'wc-1'));
  expect(view).toMatchObject({ type: 'aegis-fighter-wing-launch-view', wingId: 'fighter-wing-alpha',
    fighters: 4, launched: false, eligible: true });
  expect(view).not.toHaveProperty('reason');
  await expect(getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId: 'fighter-wing-alpha' }, 'xo-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });

  const launched = await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: 'launch-alpha-1',
    expectedTurn: 1, expectedRevision: view.revision, expectedWingRevision: view.wingRevision,
    wingId: 'fighter-wing-alpha' }, 'wc-1'));
  expect(launched).toMatchObject({ status: 'committed', wingId: 'fighter-wing-alpha', launched: true });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state.aegisFighterWingState).toMatchObject({
    attackId: 'wolf-attack-test-1', cycle: 1,
    wings: {
      'fighter-wing-alpha': { fighters: 4, launched: true },
      'fighter-wing-bravo': { fighters: 4, launched: false },
    },
  });
  const replay = await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: 'launch-alpha-1',
    expectedTurn: 1, expectedRevision: view.revision, expectedWingRevision: view.wingRevision,
    wingId: 'fighter-wing-alpha' }, 'wc-1'));
  expect(replay).toMatchObject({ status: 'replayed', launched: true });
  expect(state.revision).toBe(5);
});

it('commits an explicit Short subset for a launched wing without drawing its rolls early', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session,
    activeRoleIds: ['executive-officer', 'wing-commander'],
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      ...(session.maintenanceCycles as Fields).aegis as Fields,
      charges: ['fighter-bay-alpha', 'fighter-bay-bravo'],
    } },
    fighterWingCounts: initialFighterWingCounts(),
  });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });
  const launched = await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: 'launch-alpha-short',
    expectedTurn: 1, expectedRevision: 4, expectedWingRevision: 0, wingId: 'fighter-wing-alpha' }, 'wc-1'));
  expect(launched).toMatchObject({ launched: true });
  const stateAfterLaunch = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...stateAfterLaunch, currentStep: 'short-range' });
  const roster = stateAfterLaunch.combatRoster as Array<Fields>;
  const startSnapshot = roster.map(({ instanceId, target }) => ({ instanceId, target }));
  put('sessions/s1/wolfAttackState/current', {
    ...testState.documents.get('sessions/s1/wolfAttackState/current'),
    rangeReceipts: ['long-range', 'medium-range'].map((range) => ({
      range, targetSnapshot: startSnapshot, targetShifts: [], dice: [], assignments: [],
      unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])),
    })),
  });

  const view = await getWolfFighterRangeActionChoice.run(request({ sessionId: 's1', range: 'short-range',
    sourceId: 'fighter-wing-alpha' }, 'wc-1'));
  expect(view).toMatchObject({ type: 'wolf-fighter-range-action-view', range: 'short-range',
    wingId: 'fighter-wing-alpha', fighters: [{ fighterIndex: 0 }, { fighterIndex: 1 }, { fighterIndex: 2 }, { fighterIndex: 3 }] });
  await expect(getWolfFighterRangeActionChoice.run(request({ sessionId: 's1', range: 'short-range',
    sourceId: 'fighter-wing-alpha' }, 'xo-1'))).rejects.toMatchObject({ code: 'permission-denied' });
  const randomCallsBeforeChoice = entropy.randomInt.mock.calls.length;
  await expect(commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'alpha-short-duplicate',
    expectedTurn: 1, expectedRevision: view.revision, range: 'short-range', sourceId: 'fighter-wing-alpha',
    fighterIndexes: [0, 0] }, 'wc-1'))).rejects.toMatchObject({ code: 'invalid-argument' });
  const result = await commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'alpha-short-subset',
    expectedTurn: 1, expectedRevision: view.revision, range: 'short-range', sourceId: 'fighter-wing-alpha',
    fighterIndexes: [0, 2] }, 'wc-1'));
  expect(result).toMatchObject({ status: 'committed', choiceStatus: 'pending-resolution', selectedFighterIndexes: [0, 2] });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')?.fighterRangeChoices)
    .toMatchObject({ 'short-range': { 'fighter-wing-alpha': { fighterIndexes: [0, 2] } } });
  expect(entropy.randomInt).toHaveBeenCalledTimes(randomCallsBeforeChoice);
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')?.currentStep).toBe('short-range');
  const revisionAfterChoice = testState.documents.get('sessions/s1/wolfAttackState/current')?.revision;
  await expect(commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'alpha-short-subset',
    expectedTurn: 1, expectedRevision: view.revision, range: 'short-range', sourceId: 'fighter-wing-alpha',
    fighterIndexes: [0, 2] }, 'wc-1'))).resolves.toMatchObject({ status: 'replayed', selectedFighterIndexes: [0, 2] });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')?.revision).toBe(revisionAfterChoice);
  expect(entropy.randomInt).toHaveBeenCalledTimes(randomCallsBeforeChoice);
});

it('resolves an explicit whole-wing Medium pass without dice and advances the range', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['wing-commander'],
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      ...(session.maintenanceCycles as Fields).aegis as Fields,
      charges: ['fighter-bay-alpha'],
    } },
    fighterWingCounts: initialFighterWingCounts(),
  });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });

  const launchView = await getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId: 'fighter-wing-alpha' }, 'wc-1'));
  const launch = await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: 'medium-pass-launch',
    expectedTurn: 1, expectedRevision: launchView.revision, expectedWingRevision: launchView.wingRevision,
    wingId: 'fighter-wing-alpha' }, 'wc-1'));
  expect(launch).toMatchObject({ status: 'committed', launched: true });

  const launchedAttack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (launchedAttack.combatRoster as Array<{ instanceId: string; target: string }>)
    .map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyLongReceipt = { range: 'long-range', targetSnapshot, dice: [], assignments: [], targetShifts: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) };
  put('sessions/s1/wolfAttackState/current', { ...launchedAttack, currentStep: 'medium-range',
    rangeReceipts: [emptyLongReceipt] });
  const view = await getWolfFighterRangeActionChoice.run(request({ sessionId: 's1', range: 'medium-range',
    sourceId: 'fighter-wing-alpha' }, 'wc-1'));
  entropy.randomInt.mockClear();
  await commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'medium-pass-choice',
    expectedTurn: 1, expectedRevision: view.revision, range: 'medium-range', sourceId: 'fighter-wing-alpha',
    actions: [] }, 'wc-1'));

  const resolved = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(resolved.currentStep).toBe('short-range');
  expect((resolved.aegisFighterWingState as Fields).wings).toMatchObject({
    'fighter-wing-alpha': { mediumResolved: true, fighters: 4, losses: 0 },
  });
  expect((resolved.rangeReceipts as Array<Fields>).at(-1)).toMatchObject({ range: 'medium-range', dice: [],
    assignments: [], targetShifts: [] });
  expect(entropy.randomInt).not.toHaveBeenCalled();
});

it('rolls committed fighter Medium attacks against the chosen Wolf contact and records the receipt', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['wing-commander'],
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      ...(session.maintenanceCycles as Fields).aegis as Fields, charges: ['fighter-bay-alpha'],
    } }, fighterWingCounts: initialFighterWingCounts() });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });
  const launchView = await getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId: 'fighter-wing-alpha' }, 'wc-1'));
  await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: 'medium-attack-launch',
    expectedTurn: 1, expectedRevision: launchView.revision, expectedWingRevision: launchView.wingRevision,
    wingId: 'fighter-wing-alpha' }, 'wc-1'));

  const launchedAttack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (launchedAttack.combatRoster as Array<{ instanceId: string; target: string }>)
    .map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyLongReceipt = { range: 'long-range', targetSnapshot, dice: [], assignments: [], targetShifts: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) };
  put('sessions/s1/wolfAttackState/current', { ...launchedAttack, currentStep: 'medium-range',
    rangeReceipts: [emptyLongReceipt] });
  const view = await getWolfFighterRangeActionChoice.run(request({ sessionId: 's1', range: 'medium-range',
    sourceId: 'fighter-wing-alpha' }, 'wc-1'));
  entropy.randomInt.mockClear().mockReturnValue(5);
  await commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'medium-attack-choice',
    expectedTurn: 1, expectedRevision: view.revision, range: 'medium-range', sourceId: 'fighter-wing-alpha',
    actions: [{ fighterIndex: 0, kind: 'attack', targetContactId: view.targets[0]!.instanceId }] }, 'wc-1'));

  const resolved = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(resolved.currentStep).toBe('short-range');
  expect((resolved.combatRoster as Array<Fields>)[0]).toMatchObject({ damageTaken: 1, destroyed: true });
  expect((resolved.rangeReceipts as Array<Fields>).at(-1)).toMatchObject({
    range: 'medium-range',
    dice: [{ actionId: 'aegis-alpha-wing-medium-0', sourceId: 'aegis-alpha-wing', rolls: [6], successes: 1, damage: 1 }],
    assignments: [{ actionId: 'aegis-alpha-wing-medium-0', targetInstanceIds: [(resolved.combatRoster as Array<Fields>)[0]!.instanceId] }],
    damageByInstance: { [(resolved.combatRoster as Array<Fields>)[0]!.instanceId]: 1 },
  });
  expect(entropy.randomInt).toHaveBeenCalledTimes(1);
});

it('replays two independently chosen Medium shifts on one Wolf contact in source order', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['wing-commander'],
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      ...(session.maintenanceCycles as Fields).aegis as Fields,
      charges: ['fighter-bay-alpha', 'fighter-bay-bravo'],
    } }, fighterWingCounts: initialFighterWingCounts() });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });
  for (const wingId of ['fighter-wing-alpha', 'fighter-wing-bravo'] as const) {
    const launchView = await getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId }, 'wc-1'));
    await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: `shift-launch-${wingId}`,
      expectedTurn: 1, expectedRevision: launchView.revision, expectedWingRevision: launchView.wingRevision,
      wingId }, 'wc-1'));
  }
  const launchedAttack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (launchedAttack.combatRoster as Array<{ instanceId: string; target: string }>)
    .map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyLongReceipt = { range: 'long-range', targetSnapshot, dice: [], assignments: [], targetShifts: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) };
  put('sessions/s1/wolfAttackState/current', { ...launchedAttack, currentStep: 'medium-range',
    rangeReceipts: [emptyLongReceipt] });

  const alphaView = await getWolfFighterRangeActionChoice.run(request({ sessionId: 's1', range: 'medium-range',
    sourceId: 'fighter-wing-alpha' }, 'wc-1'));
  await commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'shift-alpha',
    expectedTurn: 1, expectedRevision: alphaView.revision, range: 'medium-range', sourceId: 'fighter-wing-alpha',
    actions: [{ fighterIndex: 0, kind: 'target-shift', targetContactId: alphaView.targets[0]!.instanceId, shift: -1 }],
  }, 'wc-1'));
  const bravoView = await getWolfFighterRangeActionChoice.run(request({ sessionId: 's1', range: 'medium-range',
    sourceId: 'fighter-wing-bravo' }, 'wc-1'));
  await commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'shift-bravo',
    expectedTurn: 1, expectedRevision: bravoView.revision, range: 'medium-range', sourceId: 'fighter-wing-bravo',
    actions: [{ fighterIndex: 0, kind: 'target-shift', targetContactId: bravoView.targets[0]!.instanceId, shift: 1 }],
  }, 'wc-1'));

  const resolved = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const receipt = (resolved.rangeReceipts as Array<Fields>).at(-1)!;
  expect(resolved.currentStep).toBe('short-range');
  expect((resolved.combatRoster as Array<Fields>)[0]!.target).toBe('aegis');
  expect(receipt.targetSnapshot).toHaveLength((resolved.combatRoster as Array<Fields>).length);
  expect((receipt.targetSnapshot as Array<Fields>)[0]!.target).toBe('aegis');
  expect(receipt.targetShifts).toEqual([
    { sourceId: 'aegis-alpha-wing', choiceIndex: 0, rosterIndex: 0, shift: -1, fromDie: 1, toDie: 0 },
    { sourceId: 'aegis-bravo-wing', choiceIndex: 0, rosterIndex: 0, shift: 1, fromDie: 0, toDie: 7 },
  ]);
  expect(entropy.randomInt).not.toHaveBeenCalled();
});

it('keeps a launched wing pending at Medium Range while its assigned commander is disconnected', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['wing-commander'],
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      ...(session.maintenanceCycles as Fields).aegis as Fields, charges: ['fighter-bay-alpha'],
    } }, fighterWingCounts: initialFighterWingCounts() });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });
  const launchView = await getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId: 'fighter-wing-alpha' }, 'wc-1'));
  await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: 'offline-medium-launch',
    expectedTurn: 1, expectedRevision: launchView.revision, expectedWingRevision: launchView.wingRevision,
    wingId: 'fighter-wing-alpha' }, 'wc-1'));

  const launchedAttack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (launchedAttack.combatRoster as Array<{ instanceId: string; target: string }>)
    .map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyLongReceipt = { range: 'long-range', targetSnapshot, dice: [], assignments: [], targetShifts: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) };
  put('sessions/s1/wolfAttackState/current', { ...launchedAttack, currentStep: 'medium-range',
    rangeReceipts: [emptyLongReceipt] });
  const commander = testState.documents.get('sessions/s1/players/wc-1')!;
  put('sessions/s1/players/wc-1', { ...commander, connected: false });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'medium-range', rangeReceipts: [expect.objectContaining({ range: 'long-range' })],
  });
});

it('holds completed targeting until each eligible AEGIS Fighter Bay is launched or passed', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['executive-officer', 'wing-commander'],
    maintenanceCycles: { aegis: { ...(session.maintenanceCycles as Fields).aegis as Fields,
      charges: ['missile-launchers', 'point-defence-lasers', 'fighter-bay-alpha', 'fighter-bay-bravo'] } },
    fighterWingCounts: initialFighterWingCounts() });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'targeting',
  });
});

it('keeps an assigned offline Wing Commander choice pending and accepts a reconnect retry', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session,
    activeRoleIds: ['executive-officer', 'wing-commander'],
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      turn: 1, step: 7, revision: 3, results: { '5': 'Reactor powered up.' },
      charges: ['missile-launchers', 'point-defence-lasers', 'fighter-bay-alpha', 'fighter-bay-bravo'], refuelled: [],
    } },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    fighterWingCounts: initialFighterWingCounts(),
  });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting', revision: 4 });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: false,
    assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeConsoleRoleId: null,
    fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'targeting', revision: 4,
  });
  expect((testState.documents.get('sessions/s1/wolfAttackState/current')!.fighterLaunchChoices as Fields | undefined)?.['fighter-wing-alpha'])
    .toBeUndefined();

  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeConsoleRoleId: 'wing-commander',
    fleetGroupId: 'fleet-1' });
  const view = await getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId: 'fighter-wing-alpha' }, 'wc-1'));
  expect(view).toMatchObject({ eligible: true, launched: false, revision: 4, wingRevision: 0 });
  const payload = { sessionId: 's1', requestId: 'reconnect-launch-alpha', expectedTurn: 1,
    expectedRevision: 4, expectedWingRevision: 0, wingId: 'fighter-wing-alpha' };
  await expect(launchAegisFighterWing.run(request(payload, 'wc-1'))).resolves.toMatchObject({
    status: 'committed', choiceStatus: 'launched', launched: true,
  });
  await expect(launchAegisFighterWing.run(request(payload, 'wc-1'))).resolves.toMatchObject({
    status: 'replayed', choiceStatus: 'launched', launched: true,
  });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'targeting', fighterLaunchChoices: {
      'fighter-wing-alpha': { sourceId: 'fighter-wing-alpha', status: 'launched', actorUid: 'wc-1' },
    },
  });
});

it('locks the selected Short fighter subset with the EO range pass and applies losses once', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['executive-officer', 'wing-commander'],
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      ...(session.maintenanceCycles as Fields).aegis as Fields, charges: ['fighter-bay-alpha'],
    } }, fighterWingCounts: initialFighterWingCounts() });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberUids: ['xo-1', 'wc-1'],
    memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });
  put('sessions/s1/wolfAttackState/current', {
    ...testState.documents.get('sessions/s1/wolfAttackState/current')!, currentStep: 'targeting',
  });
  const launchView = await getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId: 'fighter-wing-alpha' }, 'wc-1'));
  await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: 'launch-alpha-short-batch',
    expectedTurn: 1, expectedRevision: launchView.revision, expectedWingRevision: launchView.wingRevision,
    wingId: 'fighter-wing-alpha' }, 'wc-1'));

  const launchedAttack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const roster = launchedAttack.combatRoster as Array<Fields>;
  const targetSnapshot = roster.map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyReceipt = (range: string) => ({ range, targetSnapshot, dice: [], assignments: [], targetShifts: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) });
  put('sessions/s1/wolfAttackState/current', { ...launchedAttack, currentStep: 'short-range',
    rangeReceipts: [emptyReceipt('long-range'), emptyReceipt('medium-range')] });
  const ready = await getWolfFighterRangeActionChoice.run(request({ sessionId: 's1', range: 'short-range',
    sourceId: 'fighter-wing-alpha' }, 'wc-1'));
  await commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'select-alpha-short-subset',
    expectedTurn: 1, expectedRevision: ready.revision, range: 'short-range', sourceId: 'fighter-wing-alpha',
    fighterIndexes: [0, 1, 2],
  }, 'wc-1'));
  const choiceRevision = (testState.documents.get('sessions/s1/wolfAttackState/current')!.revision as number);
  entropy.randomInt.mockReset().mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValueOnce(2);
  const locked = await commitWolfRangeActionChoice.run(request({ sessionId: 's1', requestId: 'lock-alpha-short-subset',
    expectedTurn: 1, expectedRevision: choiceRevision, range: 'short-range', actionIds: [],
  }));
  expect(locked).toMatchObject({ choiceStatus: 'targets-required', hitSlots: [
    { actionId: 'aegis-alpha-wing-short-0', count: 0 },
    { actionId: 'aegis-alpha-wing-short-1', count: 0 },
    { actionId: 'aegis-alpha-wing-short-2', count: 1 },
  ] });
  const lockedState = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const assigned = await assignWolfRangeTargets.run(request({ sessionId: 's1', requestId: 'assign-alpha-short-subset',
    expectedTurn: 1, expectedRevision: locked.revision, range: 'short-range', assignments: [
      { actionId: 'aegis-alpha-wing-short-0', contactIds: [] },
      { actionId: 'aegis-alpha-wing-short-1', contactIds: [] },
      { actionId: 'aegis-alpha-wing-short-2', contactIds: ['contact-1'] },
    ],
  }));
  const resolved = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const receipt = (resolved.rangeReceipts as Array<Fields>).at(-1)!;
  expect(assigned).toMatchObject({ currentStep: 'boarding', committedContacts: 1 });
  expect(receipt).toMatchObject({
    dice: [
      { actionId: 'aegis-alpha-wing-short-0', rolls: [1], successes: 0, damage: 0 },
      { actionId: 'aegis-alpha-wing-short-1', rolls: [2], successes: 0, damage: 0 },
      { actionId: 'aegis-alpha-wing-short-2', rolls: [3], successes: 1, damage: 1 },
    ],
    assignments: [
      { actionId: 'aegis-alpha-wing-short-0', targetInstanceIds: [] },
      { actionId: 'aegis-alpha-wing-short-1', targetInstanceIds: [] },
      { actionId: 'aegis-alpha-wing-short-2', targetInstanceIds: [roster[0]!.instanceId] },
    ],
  });
  expect(resolved.aegisFighterWingState).toMatchObject({
    wings: { 'fighter-wing-alpha': { fighters: 2, losses: 2, shortResolved: true } },
  });
  expect(entropy.randomInt).toHaveBeenCalledTimes(3);
  expect(lockedState.rangeDecisions).toMatchObject({ 'short-range': { actionIds: [
    'aegis-alpha-wing-short-0', 'aegis-alpha-wing-short-1', 'aegis-alpha-wing-short-2',
  ] } });
});

it('returns only current source-derived actions and opaque target contacts to the entitled Executive Officer', async () => {
  const view = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  expect(view).toMatchObject({
    type: 'wolf-range-action-choice-view', sessionId: 's1', turn: 1, revision: 4,
    range: 'long-range', currentStep: 'long-range', choiceStatus: 'pending',
    eligibleActions: [{ actionId: 'aegis-missile-launchers-long', sourceId: 'aegis-missile-launchers', range: 'long-range' }],
  });
  expect(view).not.toHaveProperty('privateNotes');
  expect(view).not.toHaveProperty('targeting');
  expect(view).not.toHaveProperty('combatRoster');
  await expect(getWolfRangeActionChoice.run(request({ sessionId: 's1' }, 'other')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('publishes a private GM decision summary with configured-but-disconnected roles distinct from unavailable actions', async () => {
  put('sessions/s1/players/wolf-commander-1', {
    uid: 'wolf-commander-1', role: 'player', replacementRoleId: 'wolf-commander', connected: false,
  });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    decisionSummary: {
      commander: { status: 'pending', actors: [{ uid: 'wolf-commander-1', connected: false }] },
      commandAndControl: { status: 'waiting-for-commander', reason: 'waiting-for-commander' },
      forceField: { status: 'not-needed' },
    },
  });
  const summary = testState.documents.get('sessions/s1/wolfAttackState/current')!.decisionSummary as Fields;
  expect(summary).not.toHaveProperty('rolls');
  expect(summary).not.toHaveProperty('composition');
});

it('denies the EO range projection after the current berth moves away from AEGIS', async () => {
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: { 'xo-1': 'dione' } });

  await expect(getWolfRangeActionChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('denies use/pass writes after the EO has taxied away from AEGIS', async () => {
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: { 'xo-1': 'dione' } });

  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'taxied-eo-pass', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: [],
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(testState.documents.has('sessions/s1/commandReceipts/taxied-eo-pass')).toBe(false);
});

it('locks one server-generated Long Range attack once and assigns it without rerolling', async () => {
  const choice = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'lock-long-1', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: ['aegis-missile-launchers-long'],
  }));
  expect(choice).toMatchObject({ status: 'committed', choiceStatus: 'targets-required', hitSlots: [{ actionId: 'aegis-missile-launchers-long', count: 1 }] });
  expect(choice).not.toHaveProperty('rolls');
  expect(entropy.randomInt).not.toHaveBeenCalled();

  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state.rangeDecisions).toMatchObject({
    'long-range': { status: 'locked', actionIds: ['aegis-missile-launchers-long'], lock: { range: 'long-range' } },
  });
  const lockedRevision = state.revision as number;
  const applied = await assignWolfRangeTargets.run(request({
    sessionId: 's1', requestId: 'target-long-1', expectedTurn: 1, expectedRevision: lockedRevision,
    range: 'long-range', assignments: [{ actionId: 'aegis-missile-launchers-long', contactIds: ['contact-1'] }],
  }));
  expect(applied).toMatchObject({ status: 'committed', type: 'wolf-range-target-assignment', currentStep: 'medium-range' });
  expect(entropy.randomInt).not.toHaveBeenCalled();
  const after = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(after.rangeReceipts).toEqual(expect.arrayContaining([expect.objectContaining({ range: 'long-range' })]));
  expect(after.revision).toBe(lockedRevision + 1);
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/target-long-1'))
    .toMatchObject({ type: 'wolf-range-target-assignment', fromStep: 'long-range', toStep: 'medium-range' });
});

it('reconstructs a partially selected Medium Range lock after an entitled reconnect', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (attack.combatRoster as Array<{ instanceId: string; target: string }>).map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyLongReceipt = { range: 'long-range', targetSnapshot, dice: [], assignments: [], targetShifts: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) };
  put('sessions/s1/wolfAttackState/current', {
    ...attack, currentStep: 'medium-range', revision: 4, rangeReceipts: [emptyLongReceipt],
  });
  const initial = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  expect(initial).toMatchObject({ eligibleActions: [
    { actionId: 'aegis-missile-launchers-medium' },
    { actionId: 'aegis-point-defence-lasers-medium' },
  ] });

  const locked = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'lock-medium-missiles-only', expectedTurn: 1, expectedRevision: 4,
    range: 'medium-range', actionIds: ['aegis-missile-launchers-medium'],
  }));
  expect(locked).toMatchObject({ choiceStatus: 'targets-required', hitSlots: [
    { actionId: 'aegis-missile-launchers-medium', count: 5 },
  ] });

  const reconnected = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  expect(reconnected).toMatchObject({
    choiceStatus: 'targets-required',
    hitSlots: [{ actionId: 'aegis-missile-launchers-medium', count: 5 }],
  });
  expect(reconnected.hitSlots).not.toContainEqual(expect.objectContaining({ actionId: 'aegis-point-defence-lasers-medium' }));
});

it('rejects a range receipt whose pre-range target snapshot breaks target progression', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const roster = attack.combatRoster as Array<{ instanceId: string; target: string }>;
  const targetSnapshot = roster.map(({ instanceId, target }) => ({ instanceId, target }));
  targetSnapshot[0] = { ...targetSnapshot[0]!, target: targetSnapshot[0]!.target === 'aegis' ? 'dione' : 'aegis' };
  put('sessions/s1/wolfAttackState/current', {
    ...attack, currentStep: 'medium-range', revision: 4,
    rangeReceipts: [{ range: 'long-range', targetSnapshot, dice: [], assignments: [], targetShifts: [],
      unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) }],
  });

  await expect(getWolfRangeActionChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('accepts a contiguous legacy range prefix but rejects legacy receipts after a new snapshot', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (attack.combatRoster as Array<{ instanceId: string; target: string }>)
    .map(({ instanceId, target }) => ({ instanceId, target }));
  const legacyLongReceipt = { range: 'long-range', dice: [], assignments: [], targetShifts: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) };
  const newLongReceipt = { ...legacyLongReceipt, targetSnapshot };
  const newMediumReceipt = { ...newLongReceipt, range: 'medium-range' };
  const legacyMediumReceipt = { ...legacyLongReceipt, range: 'medium-range' };

  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'short-range', revision: 4,
    rangeReceipts: [legacyLongReceipt, newMediumReceipt] });
  await expect(getWolfRangeActionChoice.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    range: 'short-range', currentStep: 'short-range',
  });

  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'short-range', revision: 4,
    rangeReceipts: [newLongReceipt, legacyMediumReceipt] });
  await expect(getWolfRangeActionChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('caps excess server hits at the live distinct contacts and preserves the private full-hit receipt', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (attack.combatRoster as Array<{ instanceId: string; target: string }>).map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyRangeReceipt = (range: string) => ({ range, targetSnapshot, dice: [], assignments: [], targetShifts: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) });
  const roster = (attack.combatRoster as Array<Record<string, unknown>>).map((ship, index) => ({
    ...ship, destroyed: index !== 10,
  }));
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'medium-range', revision: 4, combatRoster: roster,
    rangeReceipts: [emptyRangeReceipt('long-range')] });

  const lock = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'lock-medium-overflow', expectedTurn: 1, expectedRevision: 4,
    range: 'medium-range', actionIds: ['aegis-missile-launchers-medium'],
  }));
  expect(lock.hitSlots).toEqual([{ actionId: 'aegis-missile-launchers-medium', count: 5 }]);
  const committed = await assignWolfRangeTargets.run(request({
    sessionId: 's1', requestId: 'assign-medium-overflow', expectedTurn: 1, expectedRevision: lock.revision,
    range: 'medium-range', assignments: [{ actionId: 'aegis-missile-launchers-medium', contactIds: ['contact-11'] }],
  }));

  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const receipt = (state.rangeReceipts as Array<Record<string, unknown>>).find(({ range }) => range === 'medium-range')!;
  expect(committed).toMatchObject({ currentStep: 'short-range', committedContacts: 1 });
  expect(receipt).toMatchObject({
    dice: [{ actionId: 'aegis-missile-launchers-medium', rolls: [6, 6, 6, 6, 6], successes: 5, damage: 5 }],
    assignments: [{ actionId: 'aegis-missile-launchers-medium', targetInstanceIds: ['10:wolf-assault-transport'] }],
    damageByInstance: { '10:wolf-assault-transport': 1 },
    unusedHitsByAction: [{ actionId: 'aegis-missile-launchers-medium', count: 4 }],
  });
  expect(entropy.randomInt).toHaveBeenCalledTimes(5);
});

it('commits an empty target assignment when Short Range has no legal live contacts', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (attack.combatRoster as Array<{ instanceId: string; target: string }>).map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyRangeReceipt = (range: string) => ({ range, targetSnapshot, dice: [], assignments: [], targetShifts: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) });
  const roster = (attack.combatRoster as Array<Record<string, unknown>>).map((ship) => ({ ...ship, destroyed: true }));
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'short-range', revision: 4, combatRoster: roster,
    rangeReceipts: [emptyRangeReceipt('long-range'), emptyRangeReceipt('medium-range')] });

  const choice = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'lock-short-no-contact', expectedTurn: 1, expectedRevision: 4,
    range: 'short-range', actionIds: ['aegis-point-defence-lasers-short'],
  }));
  expect(choice.hitSlots).toEqual([{ actionId: 'aegis-point-defence-lasers-short', count: 2 }]);
  const committed = await assignWolfRangeTargets.run(request({
    sessionId: 's1', requestId: 'assign-short-no-contact', expectedTurn: 1, expectedRevision: choice.revision,
    range: 'short-range', assignments: [{ actionId: 'aegis-point-defence-lasers-short', contactIds: [] }],
  }));

  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const receipt = (state.rangeReceipts as Array<Record<string, unknown>>).find(({ range }) => range === 'short-range')!;
  expect(committed).toMatchObject({ currentStep: 'boarding', committedContacts: 0 });
  expect(receipt).toMatchObject({
    dice: [{ actionId: 'aegis-point-defence-lasers-short', rolls: [6, 6], successes: 2, damage: 2 }],
    assignments: [{ actionId: 'aegis-point-defence-lasers-short', targetInstanceIds: [] }],
    damageByInstance: {},
    unusedHitsByAction: [{ actionId: 'aegis-point-defence-lasers-short', count: 2 }],
  });
});

it('records an explicit range pass in the final receipt and member-safe results', async () => {
  const pass = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'pass-long-1', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: [],
  }));
  expect(pass).toMatchObject({ status: 'committed', choiceStatus: 'passed' });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state.rangeReceipts).toEqual(expect.arrayContaining([expect.objectContaining({
    range: 'long-range', dice: [], assignments: [],
  })]));
  expect(state.memberResults).toEqual(expect.arrayContaining([expect.objectContaining({
    status: 'committed', range: 'long-range', sourceId: 'aegis-weapons',
    effect: 'AEGIS passed Long Range weapons', outcome: { damage: 0, destroyed: false },
  })]));
});

it('records an explicit pass, rejects stale/wrong-phase/wrong-actor writes, and honors pause', async () => {
  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'stale-long', expectedTurn: 1, expectedRevision: 3,
    range: 'long-range', actionIds: [],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'wrong-range', expectedTurn: 1, expectedRevision: 4,
    range: 'medium-range', actionIds: [],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'wrong-user', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: [],
  }, 'other'))).rejects.toMatchObject({ code: 'permission-denied' });

  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, turnPhase: { ...session.turnPhase as Fields,
    timerPause: { reason: 'turn-interstitial', pausedAt: '2026-10-02T12:00:00.000Z', remainingMs: 5000 } } });
  await expect(commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'paused-long', expectedTurn: 1, expectedRevision: 4,
    range: 'long-range', actionIds: [],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(testState.documents.has('sessions/s1/commandReceipts/paused-long')).toBe(false);
});

it('opens Long Range automatically when targeting has no Commander and no available C&C choice', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting', revision: 4 });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'long-range', revision: 5,
    commanderRerollCompletion: { status: 'no-commander', turn: 1, revision: 5, actorUid: 'server',
      requestId: 'wolf-no-commander-1' },
  });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/auto-targeting-1'))
    .toMatchObject({ type: 'wolf-attack-targeting-auto-advance', fromStep: 'targeting', toStep: 'long-range' });
});

it('continues a real five-ship targeting receipt into automatic unavailable EO ranges', async () => {
  const ring = CORE_WOLF_TARGET_RING.filter(target => target !== 'dione');
  const fiveTargeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, ring, () => 0);
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, playerCount: 8, expansion: 'base', dioneEnabled: false,
    activeVesselIds: [...ring], activeRoleIds: [] });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: [...ring], memberUids: ['xo-1'], memberShipIds: { 'xo-1': 'aegis' } });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...state, currentStep: 'targeting', revision: 4,
    calculationReceipt: { ...state.calculationReceipt as Fields, targeting: fiveTargeting }, combatRoster: wolfCombatRoster(fiveTargeting) });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ currentStep: 'long-range', revision: 5 });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const continued = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(continued).toMatchObject({ currentStep: 'medium-range', revision: 6,
    rangeDecisions: { 'long-range': { status: 'unavailable', reason: 'no-configured-executive-officer' } } });
  expect(projectWolfAttackMemberView({ sessionId: 's1', state: continued, serverTime: new Date().toISOString() }).results).toHaveLength(1);
});

it('does not run automatic attack progression through any current session pause', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting', revision: 4 });
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, turnPhase: { ...session.turnPhase as Fields,
    timerPause: { reason: 'turn-interstitial', pausedAt: '2026-10-02T12:00:00.000Z', remainingMs: 5000 } } });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'targeting', revision: 4 });
});

it('marks a charged range unavailable and continues when the fleet configuration has no Executive Officer', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'long-range', revision: 4 });
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: [] });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state).toMatchObject({ currentStep: 'medium-range', revision: 5,
    rangeDecisions: { 'long-range': { status: 'unavailable', reason: 'no-configured-executive-officer' } } });
  expect(testState.documents.get('sessions/s1').maintenanceCycles).toMatchObject({
    aegis: { charges: ['missile-launchers', 'point-defence-lasers'] },
  });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/auto-long-range-1'))
    .toMatchObject({ type: 'wolf-range-automatic-unavailable', range: 'long-range', toStep: 'medium-range' });
  expect(state.rangeReceipts).toMatchObject([
    { range: 'long-range', dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [] },
  ]);
  expect(projectWolfAttackMemberView({ sessionId: 's1', state, serverTime: new Date().toISOString() }).results)
    .toEqual([expect.objectContaining({ outcome: { damage: 0 }, effect: expect.stringMatching(/unavailable/i) })]);
});

it('keeps a charged range pending while the configured Executive Officer is disconnected', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'long-range', revision: 4 });
  const player = testState.documents.get('sessions/s1/players/xo-1')!;
  put('sessions/s1/players/xo-1', { ...player, connected: false });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'long-range', revision: 4 });
});

it('does not leave charged Command and Control ownerless when no Executive Officer is configured', async () => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting', revision: 4 });
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: [], maintenanceCycles: {
    ...session.maintenanceCycles as Fields,
    aegis: { ...((session.maintenanceCycles as Fields).aegis as Fields), charges: ['command-and-control'] },
  } });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'long-range', revision: 5,
    targetingCompletion: { commandAndControl: 'unavailable' },
  });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/auto-targeting-1'))
    .toMatchObject({ commandAndControl: 'unavailable', reason: 'no-configured-executive-officer' });
  expect(testState.documents.get('sessions/s1').maintenanceCycles).toMatchObject({
    aegis: { charges: ['command-and-control'] },
  });
});

function openBoardingFixture(): void {
  const targets = [...EXPANDED_WOLF_TARGET_RING];
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (attack.combatRoster as Array<{ instanceId: string; target: string }>).map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyRange = (range: string) => ({ range, targetSnapshot, dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [],
    damageByInstance: {}, destroyedInstanceIds: [], destructionDamageByTarget: Object.fromEntries(targets.map((id) => [id, 0])) });
  const current = new Date();
  const future = (milliseconds: number) => new Date(current.getTime() + milliseconds).toISOString();
  put('sessions/s1', {
    ...testState.documents.get('sessions/s1'),
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 4 } },
    shipSurvivors: { aegis: 2500, dione: 100000, icebreaker: 40000, quellon: 30000, shepherd: 30000, 'refinery-124': 20000 },
    shipDamage: Object.fromEntries(targets.map((id) => [id, { damagedSystemIds: [], destroyed: false }])),
    shipUnrest: Object.fromEntries(targets.map((id) => [id, 0])),
    turnPhase: { turn: 1, teamPhaseEndsAt: future(-1000), openAirspaceEndsAt: future(300000),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
  });
  put('sessions/s1/wolfAttackState/current', {
    ...attack, currentStep: 'boarding', revision: 10, rangeReceipts: [
      emptyRange('long-range'), emptyRange('medium-range'), emptyRange('short-range'),
    ],
    rangeDecisions: Object.fromEntries(['long-range', 'medium-range', 'short-range'].map((range) => [range, { status: 'committed' }])),
    boardingDefenceChoices: {},
  });
}

it('commits only the target ship crew boarding choice, reserves teams, then auto-resolves and reopens once', async () => {
  openBoardingFixture();
  const view = await getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' }));
  expect(view).toMatchObject({ type: 'wolf-boarding-defence-choice-view', turn: 1, revision: 10,
    targetShipId: 'aegis', boardingParties: 20, availableSecurityTeams: 4, choiceStatus: 'pending' });
  expect(view).not.toHaveProperty('combatRoster');
  expect(view).not.toHaveProperty('rolls');

  await expect(commitWolfBoardingDefenceChoice.run(request({
    sessionId: 's1', requestId: 'boarding-wrong-actor', expectedTurn: 1, expectedRevision: 10,
    targetShipId: 'dione', securityTeams: 2,
  }, 'not-seated'))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(commitWolfBoardingDefenceChoice.run(request({
    sessionId: 's1', requestId: 'boarding-stale', expectedTurn: 1, expectedRevision: 9,
    targetShipId: 'aegis', securityTeams: 2,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  const payload = { sessionId: 's1', requestId: 'boarding-aegis-1', expectedTurn: 1,
    expectedRevision: 10, targetShipId: 'aegis', securityTeams: 2 };
  const committed = await commitWolfBoardingDefenceChoice.run(request(payload));
  expect(committed).toMatchObject({ type: 'wolf-boarding-defence-choice', revision: 11,
    targetShipId: 'aegis', securityTeams: 2, currentStep: 'boarding' });
  expect((testState.documents.get('sessions/s1')!.shipResources as Fields).aegis)
    .toMatchObject({ securityTeams: 2 });
  expect(await commitWolfBoardingDefenceChoice.run(request(payload))).toEqual(committed);

  const priorOpenDeadline = ((testState.documents.get('sessions/s1')!.turnPhase as Fields).openAirspaceEndsAt);
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const lockedState = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(lockedState).toMatchObject({ status: 'declared', currentStep: 'boarding', revision: 12,
    boardingLockedDefence: [{ target: 'aegis', lockedRolls: [6, 6] }] });
  const rerollView = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }));
  expect(rerollView).toMatchObject({ type: 'wolf-boarding-special-choice-view', revision: 12,
    choice: { kind: 'reroll', source: 'aegis', targetShipId: 'aegis', dice: [
      { dieIndex: 0, value: 6 }, { dieIndex: 1, value: 6 },
    ] } });
  await commitWolfBoardingSpecialChoice.run(request({ sessionId: 's1', requestId: 'boarding-aegis-reroll-pass',
    expectedTurn: 1, expectedRevision: 12,
    choice: { kind: 'reroll', source: 'aegis', targetShipId: 'aegis', dieIndexes: [] } }));
  const pallasView = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }));
  expect(pallasView).toMatchObject({ type: 'wolf-boarding-special-choice-view', revision: 13,
    choice: { kind: 'reroll', source: 'pallas', targetShipId: 'aegis',
      dice: [{ dieIndex: 0, value: 6 }, { dieIndex: 1, value: 6 }], alreadyRerolled: [] } });
  await commitWolfBoardingSpecialChoice.run(request({ sessionId: 's1', requestId: 'boarding-pallas-reroll-one',
    expectedTurn: 1, expectedRevision: 13,
    choice: { kind: 'reroll', source: 'pallas', targetShipId: 'aegis', dieIndexes: [0] } }));
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const session = testState.documents.get('sessions/s1')!;
  expect(state).toMatchObject({ status: 'resolved', currentStep: 'resolved', airspaceLocked: false,
    parkingReleaseCondition: 'normal-movement-reopened', calculationReceipt: { type: 'wolf-combat-calculation',
      boarding: [{ target: 'aegis', boardingParties: 20, securityTeams: 2, survivingBoardingParties: 18 }] } });
  expect(session.turnPhase).toMatchObject({ turn: 1, airspace: { state: 'lifted', tickerActive: true } });
  expect((session.turnPhase as Fields).openAirspaceEndsAt).toBe(priorOpenDeadline);
  expect((session.shipResources as Fields).aegis).toMatchObject({ securityTeams: 4 });
  expect(testState.documents.has('sessions/s1/events/wolf-attack-airspace-reopened-1')).toBe(true);
  const revision = state.revision;
  const drawCount = entropy.randomInt.mock.calls.length;
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')!.revision).toBe(revision);
  expect(entropy.randomInt).toHaveBeenCalledTimes(drawCount);
});

it('keeps boarding pending through disconnect and scopes the projection to the current mapped berth', async () => {
  openBoardingFixture();
  const player = testState.documents.get('sessions/s1/players/xo-1')!;
  put('sessions/s1/players/xo-1', { ...player, connected: false });
  await expect(getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'boarding', revision: 10, boardingDefenceChoices: {} });
  put('sessions/s1/players/xo-1', player);
  expect(await getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' })))
    .toMatchObject({ type: 'wolf-boarding-defence-choice-view', choiceStatus: 'pending' });
  await commitWolfBoardingDefenceChoice.run(request({ sessionId: 's1', requestId: 'boarding-after-reconnect',
    expectedTurn: 1, expectedRevision: 10, targetShipId: 'aegis', securityTeams: 1 }));
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: {} });
  await expect(getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: { 'xo-1': 'dione' } });
  const otherBerth = await getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' }));
  expect(otherBerth).toMatchObject({ type: 'wolf-boarding-defence-choice-unavailable', reason: 'no-boarders' });
  expect(otherBerth).not.toHaveProperty('availableSecurityTeams');
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'boarding', boardingDefenceChoices: {} });
});

it('reads casualty alert audiences before any final boarding write under Firestore transaction ordering', async () => {
  openBoardingFixture();
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, shipSurvivors: { ...(session.shipSurvivors as Fields), aegis: 250 } });
  entropy.randomInt.mockReturnValue(0);
  await commitWolfBoardingDefenceChoice.run(request({ sessionId: 's1', requestId: 'boarding-alert-order',
    expectedTurn: 1, expectedRevision: 10, targetShipId: 'aegis', securityTeams: 0 }));
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  testState.runTransaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => {
    let wrote = false;
    return callback({
      get: async (target: { path: string }) => {
        if (wrote) throw new Error('Firestore transactions require all reads before all writes.');
        if (target.path.endsWith('/gmInstances')) return { docs: [{ id: 'gm-current' }] };
        return testState.get(target);
      },
      set: (target: { path: string }, fields: Fields) => { wrote = true; testState.set(target, fields); },
      update: (target: { path: string }, fields: Fields) => { wrote = true; testState.update(target, fields); },
      delete: (target: { path: string }) => { wrote = true; testState.remove(target); },
    });
  });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ status: 'resolved', currentStep: 'resolved', airspaceLocked: false });
  expect(testState.documents.get('sessions/s1')).toMatchObject({
    turnPhase: { airspace: { state: 'lifted' } },
    populationAlerts: { aegis: { targetGmInstanceIds: ['gm-current'] } },
  });
});

it('bounds the boarding choice by current resources and holds it during a session pause', async () => {
  openBoardingFixture();
  await expect(commitWolfBoardingDefenceChoice.run(request({
    sessionId: 's1', requestId: 'too-many-teams', expectedTurn: 1, expectedRevision: 10,
    targetShipId: 'aegis', securityTeams: 5,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, turnPhase: { ...session.turnPhase as Fields,
    timerPause: { reason: 'turn-interstitial', pausedAt: '2026-10-02T12:00:00.000Z', remainingMs: 5000 } } });
  await expect(getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect((testState.documents.get('sessions/s1').shipResources as Fields).aegis)
    .toMatchObject({ securityTeams: 4 });
});

function openForceFieldFixture(): void {
  const session = testState.documents.get('sessions/s1')!;
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const composition = firstTurnWolfAttackComposition();
  const turnPhase = session.turnPhase as Fields;
  put('sessions/s1', {
    ...session,
    activeRoleIds: [],
    turnPhase: { ...turnPhase, airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1, population: 1_000, unrest: 0,
        cycle: { step: 4, revision: 2, results: { '4': 'Reactor charged.' }, charges: ['force-field-projector'], turn: 1 },
      },
    },
  });
  put('sessions/s1/players/gorg-1', {
    uid: 'gorg-1', role: 'player', connected: true, replacementRoleId: 'gorgoneion-captain',
    replacementStatus: null, activeConsoleRoleId: null, seatId: null, fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: [...CORE_WOLF_TARGET_RING], memberUids: ['gorg-1'],
    memberShipIds: { 'gorg-1': 'aegis' },
  });
  put('sessions/s1/wolfAttackState/current', {
    ...attack, currentStep: 'targeting', revision: 4,
    calculationReceipt: {
      type: 'wolf-combat-calculation-stage', version: 1, turn: 1, step: 'pre-target-force-field',
      generatedAt: '2026-10-03T11:00:00.000Z', targetRing: [...CORE_WOLF_TARGET_RING],
      pursuitPressure: { navigationRevision: 1, groupValues: { 'fleet-1': 2 } },
      composition: { shipIds: [...composition.shipIds], counts: { ...composition.counts },
        damageCapacity: composition.damageCapacity },
    },
    forceFieldChoice: {
      status: 'pending', turn: 1, revision: 4, hostShipId: 'aegis', dockingRevision: 1,
      configuredCaptainUid: 'gorg-1',
    },
  });
}

it('requires the current Gorgoneion Captain to choose or pass before targeting rolls are exposed', async () => {
  openForceFieldFixture();
  const view = await getWolfForceFieldChoice.run(request({ sessionId: 's1' }, 'gorg-1'));
  expect(view).toMatchObject({
    type: 'wolf-force-field-choice-view', turn: 1, revision: 4, attackId: 'wolf-attack-test-1',
    hostShipId: 'aegis', dockingRevision: 1, choiceStatus: 'pending',
    targetShipIds: CORE_WOLF_TARGET_RING,
  });
  expect(view).not.toHaveProperty('targeting');
  expect(view).not.toHaveProperty('rolls');
  await expect(getWolfForceFieldChoice.run(request({ sessionId: 's1' }, 'xo-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });

  const payload = { sessionId: 's1', requestId: 'force-field-use', expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'aegis' };
  const result = await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'));
  expect(result).toMatchObject({ type: 'wolf-force-field-choice', status: 'committed', turn: 1,
    revision: 5, targetShipId: 'aegis', choiceStatus: 'selected' });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'targeting', calculationReceipt: { step: 'pre-target-force-field' },
      forceFieldChoice: { status: 'selected', targetShipId: 'aegis', actorUid: 'gorg-1' } });
  expect(await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'))).toEqual(result);
});

it('records an explicit Force Field pass and denies stale or lost-host writes', async () => {
  openForceFieldFixture();
  await expect(commitWolfForceFieldChoice.run(request({ sessionId: 's1', requestId: 'force-stale',
    expectedTurn: 1, expectedRevision: 3, targetShipId: null }, 'gorg-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: [...CORE_WOLF_TARGET_RING], memberUids: ['gorg-1'], memberShipIds: { 'gorg-1': 'dione' },
  });
  await expect(commitWolfForceFieldChoice.run(request({ sessionId: 's1', requestId: 'force-lost-host',
    expectedTurn: 1, expectedRevision: 4, targetShipId: 'aegis' }, 'gorg-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: [...CORE_WOLF_TARGET_RING], memberUids: ['gorg-1'], memberShipIds: { 'gorg-1': 'aegis' },
  });
  const result = await commitWolfForceFieldChoice.run(request({ sessionId: 's1', requestId: 'force-pass',
    expectedTurn: 1, expectedRevision: 4, targetShipId: null }, 'gorg-1'));
  expect(result).toMatchObject({ choiceStatus: 'passed', targetShipId: null, revision: 5 });
});

it('limits Force Field targets to active ships in the current Captain group', async () => {
  openForceFieldFixture();
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', {
    ...attack,
    preparation: { ...attack.preparation as Fields, notes: 'private facilitator text',
      modifiers: ['gorgoneion-force-field-projector'] },
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['gorg-1'],
    memberShipIds: { 'gorg-1': 'aegis' }, privateCoordinates: { aegis: 'secret-local-position' },
  });
  put('sessions/s1/fleetGroups/fleet-2', {
    id: 'fleet-2', vesselIds: ['icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['other-group-player'], memberShipIds: { 'other-group-player': 'icebreaker' },
    privateCoordinates: { icebreaker: 'secret-remote-position' },
  });

  const view = await getWolfForceFieldChoice.run(request({ sessionId: 's1' }, 'gorg-1'));
  expect(view).toMatchObject({ fleetGroupId: 'fleet-1', hostShipId: 'aegis', targetShipIds: ['aegis', 'dione'] });
  expect(JSON.stringify(view)).not.toContain('icebreaker');
  expect(JSON.stringify(view)).not.toContain('secret-remote-position');
  expect(JSON.stringify(view)).not.toContain('private facilitator text');

  await expect(commitWolfForceFieldChoice.run(request({
    sessionId: 's1', requestId: 'cross-group-force-field', expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'icebreaker',
  }, 'gorg-1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(testState.documents.has('sessions/s1/commandReceipts/cross-group-force-field')).toBe(false);
});

it.each([
  ['explicit small-ship destruction marker', { destroyed: true }],
  ['explicit damaged-system marker', { damagedSystemIds: ['force-field-projector'] }],
])('fails closed on an unsupported %s without spending or fabricating a projector use', async (_label, marker) => {
  openForceFieldFixture();
  const session = testState.documents.get('sessions/s1')!;
  const smallShips = session.smallShipStates as Fields;
  const gorgoneion = smallShips.gorgoneion as Fields;
  put('sessions/s1', {
    ...session,
    smallShipStates: { ...smallShips, gorgoneion: { ...gorgoneion, ...marker } },
  });

  await expect(commitWolfForceFieldChoice.run(request({
    sessionId: 's1', requestId: `unsupported-force-field-${_label.replaceAll(' ', '-')}`,
    expectedTurn: 1, expectedRevision: 4, targetShipId: 'aegis',
  }, 'gorg-1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ forceFieldChoice: { status: 'pending' } });
});

it('checks current Captain group authority before replaying an unchanged Force Field request', async () => {
  openForceFieldFixture();
  const payload = { sessionId: 's1', requestId: 'force-field-replay-after-move', expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'aegis' };
  const committed = await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'));
  expect(committed).toMatchObject({ choiceStatus: 'selected', targetShipId: 'aegis' });

  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: [...CORE_WOLF_TARGET_RING], memberUids: ['gorg-1'],
    memberShipIds: { 'gorg-1': 'dione' },
  });
  await expect(commitWolfForceFieldChoice.run(request(payload, 'gorg-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it.each(['targeting', 'long-range', 'resolved'])('replays a committed Captain choice after automatic %s progression without new writes or dice', async (step) => {
  openForceFieldFixture();
  const payload = { sessionId: 's1', requestId: `force-retry-${step}`, expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'aegis' };
  const committed = await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'));
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const progressed = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...progressed, currentStep: step,
    status: step === 'resolved' ? 'resolved' : 'declared', airspaceLocked: step !== 'resolved' });
  const savedDocuments = structuredClone([...testState.documents]);
  const drawCount = entropy.randomInt.mock.calls.length;
  testState.set.mockClear(); testState.update.mockClear(); testState.remove.mockClear();

  expect(await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'))).toEqual(committed);
  expect([...testState.documents]).toEqual(savedDocuments);
  expect(entropy.randomInt).toHaveBeenCalledTimes(drawCount);
  expect(testState.set).not.toHaveBeenCalled(); expect(testState.update).not.toHaveBeenCalled();
  expect(testState.remove).not.toHaveBeenCalled();

  await expect(commitWolfForceFieldChoice.run(request({ ...payload, requestId: `new-${step}` }, 'gorg-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberShipIds: { 'gorg-1': 'dione' } });
  await expect(commitWolfForceFieldChoice.run(request(payload, 'gorg-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('rolls targeting once after the committed Captain choice and continues from the server receipt', async () => {
  openForceFieldFixture();
  const payload = { sessionId: 's1', requestId: 'force-field-auto-targeting', expectedTurn: 1,
    expectedRevision: 4, targetShipId: 'aegis' };
  await commitWolfForceFieldChoice.run(request(payload, 'gorg-1'));

  const chosen = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(chosen).toMatchObject({ currentStep: 'targeting', revision: 5,
    calculationReceipt: { step: 'pre-target-force-field' },
    forceFieldChoice: { status: 'selected', targetShipId: 'aegis' } });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  const targeted = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(targeted).toMatchObject({ currentStep: 'targeting', revision: 6,
    calculationReceipt: { step: 'targeting', targeting: { ring: CORE_WOLF_TARGET_RING } },
    forceFieldChoice: { status: 'selected', targetShipId: 'aegis' } });
  const targetingReceipt = (targeted.calculationReceipt as Fields).targeting;
  const drawCount = entropy.randomInt.mock.calls.length;
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const afterProgress = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect((afterProgress.calculationReceipt as Fields).targeting).toEqual(targetingReceipt);
  expect(entropy.randomInt).toHaveBeenCalledTimes(drawCount);
});


function enrichedWarheadFixture(ore = 9): void {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, shipResources: { aegis: { ore, fuel: 4 } } });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
}

it('offers Enriched Warheads only at attack start without exposing private dice or roster', async () => {
  enrichedWarheadFixture();
  const view = await getAegisEnrichedWarheadChoice.run(request({ sessionId: 's1' }));
  expect(view).toEqual({ type: 'aegis-enriched-warhead-view', sessionId: 's1', attackId: 'wolf-attack-test-1',
    turn: 1, revision: 4, choiceStatus: 'pending', eligible: true, oreCost: 5 });
  expect(JSON.stringify(view)).not.toMatch(/rolls|privateNotes|combatRoster|damageTaken/);
});

it('charges Enriched Warheads once, preserves an exact retry and improves this attack Long Range', async () => {
  enrichedWarheadFixture();
  const payload = { sessionId: 's1', requestId: 'enrich-1', expectedTurn: 1, expectedRevision: 4, choice: 'enrich' };
  const result = await commitAegisEnrichedWarheadChoice.run(request(payload));
  expect(result).toMatchObject({ status: 'committed', requestId: 'enrich-1', revision: 5,
    view: { choiceStatus: 'enriched', eligible: false } });
  expect(testState.documents.get('sessions/s1')!.shipResources).toMatchObject({ aegis: { ore: 4, fuel: 4 } });
  expect(await commitAegisEnrichedWarheadChoice.run(request(payload))).toEqual(result);
  expect(testState.documents.get('sessions/s1')!.shipResources).toMatchObject({ aegis: { ore: 4 } });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...state, currentStep: 'long-range' });
  await commitWolfRangeActionChoice.run(request({ sessionId: 's1', requestId: 'enriched-long',
    expectedTurn: 1, expectedRevision: 5, range: 'long-range', actionIds: ['aegis-missile-launchers-long'] }));
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')!.rangeDecisions).toMatchObject({
    'long-range': { lock: { dice: [{ damage: 4 }] } } });
  expect(testState.documents.get('sessions/s1')!.shipResources).toMatchObject({ aegis: { ore: 4 } });
});

it('rejects insufficient Enriched Warhead funds and a stale or foreign-role purchase without writes', async () => {
  enrichedWarheadFixture(4);
  const payload = { sessionId: 's1', requestId: 'enrich-denied', expectedTurn: 1, expectedRevision: 4, choice: 'enrich' };
  expect(await getAegisEnrichedWarheadChoice.run(request({ sessionId: 's1' }))).toMatchObject({
    eligible: false, choiceStatus: 'unavailable' });
  await expect(commitAegisEnrichedWarheadChoice.run(request(payload))).rejects.toMatchObject({ code: 'failed-precondition' });
  enrichedWarheadFixture(9);
  await expect(commitAegisEnrichedWarheadChoice.run(request({ ...payload, expectedRevision: 3 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(commitAegisEnrichedWarheadChoice.run(request(payload, 'wrong-role')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(testState.update).not.toHaveBeenCalled();
});

it('keeps an offline entitled Executive Officer Enriched Warhead choice pending', async () => {
  enrichedWarheadFixture();
  put('sessions/s1/players/xo-1', { ...testState.documents.get('sessions/s1/players/xo-1')!, connected: false });
  for (let index = 0; index < 4; index += 1) await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ currentStep: 'targeting',
    decisionSummary: { enrichedWarheads: { status: 'pending', actors: [{ uid: 'xo-1', connected: false }] } } });
});

it('passes Enriched Warheads with no cost and cannot enrich after Long Range begins', async () => {
  enrichedWarheadFixture();
  await commitAegisEnrichedWarheadChoice.run(request({ sessionId: 's1', requestId: 'enrich-pass',
    expectedTurn: 1, expectedRevision: 4, choice: 'pass' }));
  expect(testState.documents.get('sessions/s1')!.shipResources).toMatchObject({ aegis: { ore: 9 } });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...state, currentStep: 'medium-range' });
  await expect(commitAegisEnrichedWarheadChoice.run(request({ sessionId: 's1', requestId: 'enrich-late',
    expectedTurn: 1, expectedRevision: 5, choice: 'enrich' }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('rejects a forged Enriched Warhead marker before returning range actions', async () => {
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...state, enrichedWarheads: {
    status: 'enriched', attackId: 'different-attack', turn: 1, oreCost: 0 } });
  await expect(getWolfRangeActionChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});
