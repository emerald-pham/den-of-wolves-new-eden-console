import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import { CORE_WOLF_TARGET_RING, EXPANDED_WOLF_TARGET_RING } from './wolfCombatMath';
import { resolveWolfRange, resolveWolfTargeting, wolfCombatRoster } from './wolfCombatMath';
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
    target.path.endsWith('/players') || target.path.endsWith('/fleetGroups') || target.path.endsWith('/gmInstances')
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
  getWolfEscortRangeActionChoice,
  commitWolfEscortRangeActionChoice,
  getAegisEnrichedWarheadChoice,
  commitAegisEnrichedWarheadChoice,
  assignWolfRangeTargets,
  getAegisFighterWingLaunch,
  getWolfFighterRangeActionChoice,
  commitWolfFighterRangeActionChoice,
  launchAegisFighterWing,
  passWolfFighterLaunchChoice,
  commitWolfRangeActionChoice,
  getWolfRangeSupportActionChoice,
  commitWolfRangeSupportActionChoice,
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
import { beginPdfEscortWingAttack, initialPdfEscortWingState, launchPdfEscortWing } from './pdfEscortWingState';
import { initialMaliadesState, launchMaliades } from './maliadesState';
import { projectPdfEscortWingMemberView } from './pdfEscortWingProjection';

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

function admitEscortRange(): void {
  const session = testState.documents.get('sessions/s1')!;
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const attackId = attack.attackId as string;
  const pdf = launchPdfEscortWing(beginPdfEscortWingAttack(initialPdfEscortWingState(), {
    expectedRevision: 0, attackId, attackCycle: 1,
  }), { expectedRevision: 0, launchAllowed: true, bayCharged: true, bayDamaged: false });
  const maliades = launchMaliades(initialMaliadesState(), { expectedRevision: 0, attackId, attackCycle: 1, launchAllowed: true });
  put('sessions/s1/serverState/pdfEscortWing', { ...pdf });
  put('sessions/s1', { ...session, maliadesState: maliades,
    activeRoleIds: ['executive-officer', 'refinery-124-pdf-colonel', 'dione-engineer'],
    shuttleControl: { maliades: { shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'engineer-1', holderUid: 'engineer-1', revision: 0 } },
    shipDamage: { ...(session.shipDamage as Fields), 'refinery-124': { damagedSystemIds: [], destroyed: false }, dione: { damagedSystemIds: [], destroyed: false } } });
  for (const [uid, roleId] of [['colonel-1', 'refinery-124-pdf-colonel'], ['engineer-1', 'dione-engineer']]) {
    put(`sessions/s1/players/${uid}`, { uid, role: 'player', connected: true,
      assignedRoleId: roleId, activeConsoleRoleId: roleId, fleetGroupId: 'fleet-1' });
  }
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberUids: ['xo-1', 'colonel-1', 'engineer-1'],
    memberShipIds: { 'xo-1': 'aegis', 'colonel-1': 'refinery-124', 'engineer-1': 'dione' } });
  const targetSnapshot = (attack.combatRoster as Array<{ instanceId: string; target: string }>)
    .map(({ instanceId, target }) => ({ instanceId, target }));
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'medium-range',
    battleTableCraftActions: [{ craftId: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: 'refinery-124-pdf-colonel' },
      { craftId: 'maliades', kind: 'shuttle', ownerRoleId: 'dione-engineer' }],
    launchedCraftIds: ['pdf-escort-fighter-wing', 'maliades'],
    fighterLaunchChoices: Object.fromEntries(['pdf-escort-fighter-wing', 'maliades'].map((sourceId) => [sourceId, {
      type: 'wolf-fighter-launch-choice', status: 'launched', sourceId, attackId, turn: 1, revision: 4,
      actorUid: sourceId === 'maliades' ? 'engineer-1' : 'colonel-1',
      actorRoleId: sourceId === 'maliades' ? 'dione-engineer' : 'refinery-124-pdf-colonel', requestId: `launch-${sourceId}`,
    }])),
    rangeReceipts: [{ range: 'long-range', targetSnapshot, targetShifts: [], dice: [], assignments: [],
      unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) }] });
}

function admitRangeSupportChoices(): void {
  const session = testState.documents.get('sessions/s1')!;
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const supportTargeting = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, EXPANDED_WOLF_TARGET_RING, () => 0);
  const supportRoster = wolfCombatRoster(supportTargeting);
  const targetSnapshot = supportRoster
    .map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyReceipt = (range: string) => ({ range, targetSnapshot, targetShifts: [], dice: [], assignments: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map((target) => [target, 0])) });
  put('sessions/s1', { ...session,
    activeVesselIds: [...(session.activeVesselIds as string[]), 'capybara'],
    expansion: 'capybara', playerCount: 19,
    activeRoleIds: ['executive-officer', 'icebreaker-miner', 'capybara-recycler', 'gorgoneion-captain'],
    shuttleFuelled: { highwall: true, boa: false },
    shuttleDockings: [
      { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: '2026-10-02T12:00:00.000Z' },
      { shuttleId: 'boa', shipId: 'capybara', dockedAt: '2026-10-02T12:00:00.000Z' },
    ],
    shuttleControl: {
      highwall: { shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner', ownerUid: 'miner-1', holderUid: 'miner-1', revision: 2 },
      boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'recycler-1', holderUid: 'recycler-1', revision: 3 },
    },
    shuttleCargo: { boa: { scrap: 3 } }, capybaraEnabled: true,
    smallShipStates: { gorgoneion: { id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1,
      population: 1000, unrest: 0, cycle: { step: 5, revision: 4, results: { '4': 'Reactor charged.' },
        charges: ['missile-array'], turn: 1 } } },
  });
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group,
    vesselIds: [...(group.vesselIds as string[]), 'capybara'],
    memberUids: ['xo-1', 'miner-1', 'recycler-1', 'gorg-captain-1'],
    memberShipIds: { 'xo-1': 'aegis', 'miner-1': 'icebreaker', 'recycler-1': 'capybara', 'gorg-captain-1': 'aegis' },
  });
  put('sessions/s1/players/miner-1', { uid: 'miner-1', role: 'player', connected: true,
    assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner', fleetGroupId: 'fleet-1' });
  put('sessions/s1/players/recycler-1', { uid: 'recycler-1', role: 'player', connected: true,
    assignedRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler', fleetGroupId: 'fleet-1' });
  put('sessions/s1/players/gorg-captain-1', { uid: 'gorg-captain-1', role: 'player', connected: true,
    assignedRoleId: 'gorgoneion-captain', replacementRoleId: 'gorgoneion-captain', fleetGroupId: 'fleet-1' });
  const emptyLong = emptyReceipt('long-range');
  const emptyMedium = emptyReceipt('medium-range');
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'short-range', revision: 7,
    calculationReceipt: { type: 'wolf-combat-calculation-stage', version: 1, turn: 1, step: 'targeting',
      targeting: supportTargeting }, combatRoster: supportRoster,
    battleTableCraftActions: [
      { craftId: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner' },
      { craftId: 'boa', kind: 'shuttle', ownerRoleId: 'capybara-recycler' },
    ], rangeReceipts: [emptyLong, emptyMedium] });
}

it('returns only safe escort contacts and operational durability to the assigned current role', async () => {
  admitEscortRange();
  const pdf = await getWolfEscortRangeActionChoice.run(request({ sessionId: 's1', sourceId: 'pdf-escort-fighter-wing', range: 'medium-range' }, 'colonel-1'));
  expect(pdf).toMatchObject({ type: 'wolf-fighter-range-action-view', wingId: 'pdf-escort-fighter-wing',
    wingLabel: 'P.D.F. Escort Fighter Wing', launched: true, fighters: [{ fighterIndex: 0 }, { fighterIndex: 1 }, { fighterIndex: 2 }, { fighterIndex: 3 }] });
  expect(Object.keys(pdf).sort()).toEqual(['type', 'sessionId', 'attackId', 'turn', 'revision', 'wingId', 'wingLabel', 'range', 'choiceStatus', 'fighters', 'targets', 'launched'].sort());
  expect(pdf.targets[0]).toEqual({ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 1 });
  const m = await getWolfEscortRangeActionChoice.run(request({ sessionId: 's1', sourceId: 'maliades', range: 'medium-range' }, 'engineer-1'));
  expect(m).toMatchObject({ type: 'dione-maliades-range-action-view', damage: 0, destroyed: false, launched: true });
  expect(JSON.stringify(m)).not.toMatch(/privateNotes|wolf-ship|mediumAction|selfDamage|dice/);
  await expect(getWolfEscortRangeActionChoice.run(request({ sessionId: 's1', sourceId: 'maliades', range: 'medium-range' }, 'xo-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('commits fixed escort actions once, resolves no early dice, and rejects stale, forged and changed-authority requests', async () => {
  admitEscortRange();
  entropy.randomInt.mockClear();
  const payload = { sessionId: 's1', sourceId: 'pdf-escort-fighter-wing', range: 'medium-range',
    requestId: 'escort-medium-test', expectedTurn: 1, expectedRevision: 4,
    actions: [{ fighterIndex: 0, kind: 'attack', targetContactId: 'contact-1' }] };
  const result = await commitWolfEscortRangeActionChoice.run(request(payload, 'colonel-1'));
  expect(result).toMatchObject({ type: 'wolf-escort-range-action-choice', status: 'committed', sourceId: 'pdf-escort-fighter-wing', actionCount: 1, revision: 5 });
  expect(entropy.randomInt).not.toHaveBeenCalled();
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')?.escortRangeChoices)
    .toMatchObject({ 'medium-range': { 'pdf-escort-fighter-wing': { actions: [{ fighterIndex: 0, kind: 'attack', targetInstanceId: wolfCombatRoster(targeting)[0]!.instanceId }] } } });
  await expect(commitWolfEscortRangeActionChoice.run(request(payload, 'colonel-1'))).resolves.toMatchObject({ status: 'replayed', revision: 5 });
  await expect(commitWolfEscortRangeActionChoice.run(request({ ...payload, requestId: 'escort-medium-stale' }, 'colonel-1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(commitWolfEscortRangeActionChoice.run(request({ ...payload, requestId: 'escort-medium-forged', dice: [6] }, 'colonel-1'))).rejects.toMatchObject({ code: 'invalid-argument' });
  const colonel = testState.documents.get('sessions/s1/players/colonel-1')!;
  put('sessions/s1/players/colonel-1', { ...colonel, assignedRoleId: 'refinery-124-engineer' });
  await expect(commitWolfEscortRangeActionChoice.run(request(payload, 'colonel-1'))).rejects.toMatchObject({ code: 'permission-denied' });
});

it('requires current Maliades custody and rejects duplicate attack/shift targets without any writes', async () => {
  admitEscortRange();
  const payload = { sessionId: 's1', sourceId: 'maliades', range: 'medium-range', requestId: 'maliades-range-test', expectedTurn: 1, expectedRevision: 4,
    actions: [{ kind: 'attack', targetContactId: 'contact-1' }, { kind: 'target-shift', targetContactId: 'contact-1', shift: -1 }] };
  await expect(commitWolfEscortRangeActionChoice.run(request(payload, 'engineer-1'))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(testState.update).not.toHaveBeenCalled();
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, shuttleControl: { maliades: { ...(session.shuttleControl as Record<string, Fields>).maliades, holderUid: 'xo-1', revision: 1 } } });
  await expect(getWolfEscortRangeActionChoice.run(request({ sessionId: 's1', sourceId: 'maliades', range: 'medium-range' }, 'engineer-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(testState.update).not.toHaveBeenCalled();
});

it('joins committed PDF and Maliades Medium attacks into one EO lock and one range receipt', async () => {
  admitEscortRange();
  entropy.randomInt.mockClear();
  const pdfView = await getWolfEscortRangeActionChoice.run(request({
    sessionId: 's1', sourceId: 'pdf-escort-fighter-wing', range: 'medium-range',
  }, 'colonel-1'));
  const pdfChoice = await commitWolfEscortRangeActionChoice.run(request({
    sessionId: 's1', sourceId: 'pdf-escort-fighter-wing', range: 'medium-range', requestId: 'pdf-medium-aggregate',
    expectedTurn: 1, expectedRevision: pdfView.revision,
    actions: [{ fighterIndex: 0, kind: 'attack', targetContactId: 'contact-1' }],
  }, 'colonel-1'));
  expect(pdfChoice).toMatchObject({ choiceStatus: 'pending-resolution', actionCount: 1 });
  expect(entropy.randomInt).not.toHaveBeenCalled();

  const maliadesView = await getWolfEscortRangeActionChoice.run(request({
    sessionId: 's1', sourceId: 'maliades', range: 'medium-range',
  }, 'engineer-1'));
  const maliadesChoice = await commitWolfEscortRangeActionChoice.run(request({
    sessionId: 's1', sourceId: 'maliades', range: 'medium-range', requestId: 'maliades-medium-aggregate',
    expectedTurn: 1, expectedRevision: maliadesView.revision,
    actions: [{ kind: 'attack', targetContactId: 'contact-2' }],
  }, 'engineer-1'));
  expect(maliadesChoice).toMatchObject({ choiceStatus: 'pending-resolution', actionCount: 1 });
  expect(entropy.randomInt).not.toHaveBeenCalled();

  const eoView = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }, 'xo-1'));
  expect(eoView.eligibleActions.map(({ actionId }) => actionId)).not.toEqual(expect.arrayContaining([
    'pdf-escort-wing-medium-0', 'maliades-medium-0',
  ]));
  const committed = await commitWolfRangeActionChoice.run(request({
    sessionId: 's1', requestId: 'eo-medium-aggregate', expectedTurn: 1, expectedRevision: eoView.revision,
    range: 'medium-range', actionIds: [],
  }, 'xo-1'));
  expect(committed).toMatchObject({ choiceStatus: 'passed', currentStep: 'short-range' });
  expect(committed.hitSlots.map(({ actionId }) => actionId)).toEqual([
    'pdf-escort-wing-medium-0', 'maliades-medium-0',
  ]);
  expect(entropy.randomInt).toHaveBeenCalledTimes(2);
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(attack.rangeReceipts).toMatchObject([
    expect.objectContaining({ range: 'long-range' }),
    expect.objectContaining({ range: 'medium-range', dice: [
      expect.objectContaining({ actionId: 'pdf-escort-wing-medium-0', rolls: [6], successes: 1 }),
      expect.objectContaining({ actionId: 'maliades-medium-0', rolls: [6], successes: 1 }),
    ] }),
  ]);
  expect(testState.documents.get('sessions/s1/serverState/pdfEscortWing'))
    .toMatchObject({ mediumResolved: true, losses: 0 });
  expect(testState.documents.get('sessions/s1')?.maliadesState)
    .toMatchObject({ medium: { attack: { targetId: expect.any(String), hit: true } }, damage: 0 });
});

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

it('applies the Wing Commander Medium target and shift choices inside the EO range transaction', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['executive-officer', 'wing-commander'],
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      ...(session.maintenanceCycles as Fields).aegis as Fields,
      charges: ['missile-launchers', 'point-defence-lasers', 'fighter-bay-alpha'],
    } }, fighterWingCounts: initialFighterWingCounts() });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });
  const launchView = await getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId: 'fighter-wing-alpha' }, 'wc-1'));
  await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: 'eo-medium-wing-launch',
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

  const fighterView = await getWolfFighterRangeActionChoice.run(request({ sessionId: 's1', range: 'medium-range',
    sourceId: 'fighter-wing-alpha' }, 'wc-1'));
  const attackedContact = fighterView.targets[0]!.instanceId;
  const chosenTarget = (testState.documents.get('sessions/s1/wolfAttackState/current')!.combatRoster as Array<{ instanceId: string }>)[
    Number(attackedContact.replace('contact-', '')) - 1]!;
  await commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'eo-medium-wing-choice',
    expectedTurn: 1, expectedRevision: fighterView.revision, range: 'medium-range', sourceId: 'fighter-wing-alpha',
    actions: [
      { fighterIndex: 0, kind: 'attack', targetContactId: attackedContact },
      { fighterIndex: 1, kind: 'target-shift', targetContactId: attackedContact, shift: 1 },
    ] }, 'wc-1'));
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')!.currentStep).toBe('medium-range');

  const eoView = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  const weaponActionId = 'aegis-missile-launchers-medium';
  const locked = await commitWolfRangeActionChoice.run(request({ sessionId: 's1', requestId: 'eo-medium-weapons-lock',
    expectedTurn: 1, expectedRevision: eoView.revision, range: 'medium-range', actionIds: [weaponActionId] }));
  expect(locked).toMatchObject({ hitSlots: [
    { actionId: weaponActionId, count: 5 },
  ] });
  expect(locked).toMatchObject({ choiceStatus: 'targets-required', currentStep: 'medium-range' });
  const targetView = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  const assigned = await assignWolfRangeTargets.run(request({ sessionId: 's1', requestId: 'eo-medium-weapons-assign',
    expectedTurn: 1, expectedRevision: targetView.revision, range: 'medium-range', assignments: [
      { actionId: weaponActionId, contactIds: ['contact-1', 'contact-2', 'contact-3', 'contact-4', 'contact-5'] },
    ] }));
  expect(assigned).toMatchObject({ currentStep: 'short-range', committedContacts: 6 });
  const resolved = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const receipt = (resolved.rangeReceipts as Array<Fields>).at(-1)!;
  expect(resolved.currentStep).toBe('short-range');
  expect(receipt.dice).toEqual(expect.arrayContaining([
    expect.objectContaining({ actionId: 'aegis-alpha-wing-medium-0', sourceId: 'aegis-alpha-wing', rolls: [6], successes: 1, damage: 1 }),
    expect.objectContaining({ actionId: weaponActionId, sourceId: 'aegis-missile-launchers', successes: 5, damage: 5 }),
  ]));
  expect(receipt).toMatchObject({
    assignments: expect.arrayContaining([
      { actionId: 'aegis-alpha-wing-medium-0', targetInstanceIds: [chosenTarget.instanceId] },
      expect.objectContaining({ actionId: weaponActionId, targetInstanceIds: expect.arrayContaining([chosenTarget.instanceId]) }),
    ]),
    targetShifts: [{ sourceId: 'aegis-alpha-wing', choiceIndex: 1, rosterIndex: Number(attackedContact.replace('contact-', '')) - 1,
      shift: 1 }],
  });
  const resolvedTarget = (resolved.combatRoster as Array<Fields>).find(({ instanceId }) => instanceId === chosenTarget.instanceId)!;
  expect(resolvedTarget).toMatchObject({ damageTaken: 2 });
  expect(resolvedTarget.target).not.toBe(chosenTarget.target);
  const memberResults = resolved.memberResults as Array<Fields>;
  expect(memberResults.find(({ sourceId }) => sourceId === 'aegis-alpha-wing')).toMatchObject({
    targetId: resolvedTarget.target, effect: 'Alpha Fighter Wing attack hit', outcome: { damage: 1 },
  });
  expect(memberResults.find(({ sourceId, contactReference }) => sourceId === 'aegis-missile-launchers' &&
    contactReference === `Wolf contact ${Number(attackedContact.replace('contact-', ''))}`)).toMatchObject({
    targetId: resolvedTarget.target, effect: 'medium range AEGIS weapon hit', outcome: { damage: 1 },
  });
  expect(entropy.randomInt).toHaveBeenCalledTimes(6);
});

it('commits a fighter-only Medium target shift in the EO pass receipt', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['executive-officer', 'wing-commander'],
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      ...(session.maintenanceCycles as Fields).aegis as Fields,
      charges: ['missile-launchers', 'point-defence-lasers', 'fighter-bay-alpha'],
    } }, fighterWingCounts: initialFighterWingCounts() });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['xo-1', 'wc-1'], memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });
  const launchView = await getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId: 'fighter-wing-alpha' }, 'wc-1'));
  await launchAegisFighterWing.run(request({ sessionId: 's1', requestId: 'eo-shift-only-wing-launch',
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
  const fighterView = await getWolfFighterRangeActionChoice.run(request({ sessionId: 's1', range: 'medium-range',
    sourceId: 'fighter-wing-alpha' }, 'wc-1'));
  const shiftedContact = fighterView.targets[0]!.instanceId;
  const shiftedIndex = Number(shiftedContact.replace('contact-', '')) - 1;
  const startingTarget = (testState.documents.get('sessions/s1/wolfAttackState/current')!.combatRoster as Array<Fields>)[
    shiftedIndex]!.target;
  await commitWolfFighterRangeActionChoice.run(request({ sessionId: 's1', requestId: 'eo-shift-only-wing-choice',
    expectedTurn: 1, expectedRevision: fighterView.revision, range: 'medium-range', sourceId: 'fighter-wing-alpha',
    actions: [{ fighterIndex: 0, kind: 'target-shift', targetContactId: shiftedContact, shift: 1 }],
  }, 'wc-1'));

  const eoView = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  const passed = await commitWolfRangeActionChoice.run(request({ sessionId: 's1', requestId: 'eo-shift-only-pass',
    expectedTurn: 1, expectedRevision: eoView.revision, range: 'medium-range', actionIds: [] }));
  const resolved = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const receipt = (resolved.rangeReceipts as Array<Fields>).at(-1)!;
  expect(passed.choiceStatus).toBe('passed');
  expect(receipt).toMatchObject({ range: 'medium-range', dice: [], assignments: [], targetShifts: [
    { sourceId: 'aegis-alpha-wing', choiceIndex: 0, rosterIndex: shiftedIndex, shift: 1 },
  ] });
  expect((resolved.combatRoster as Array<Fields>)[shiftedIndex]!.target).not.toBe(startingTarget);
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

it.each([undefined, { aegis: { turn: 1, step: 7, revision: 2, results: {},
  charges: ['fighter-bay-alpha', 'fighter-bay-bravo'], refuelled: [] } }])(
  'reports destroyed AEGIS bays unavailable in a later cycle without requiring new maintenance: %j', async maintenanceCycles => {
    const session = testState.documents.get('sessions/s1')!;
    put('sessions/s1', { ...session, currentTurn: 2, activeRoleIds: ['wing-commander'], maintenanceCycles,
      turnPhase: { ...(session.turnPhase as Fields), turn: 2 }, fighterWingCounts: initialFighterWingCounts(),
      shipDamage: { aegis: { damagedSystemIds: [], destroyed: true } } });
    const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
    put('sessions/s1/wolfAttackState/current', { ...attack, turn: 2, currentStep: 'targeting',
      preparation: { ...(attack.preparation as Fields), turn: 2 },
      calculationReceipt: { ...(attack.calculationReceipt as Fields), turn: 2 } });
    put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
      assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
    const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
    put('sessions/s1/fleetGroups/fleet-1', { ...group, memberUids: ['wc-1'], memberShipIds: { 'wc-1': 'aegis' } });
    for (const wingId of ['fighter-wing-alpha', 'fighter-wing-bravo']) {
      await expect(getAegisFighterWingLaunch.run(request({ sessionId: 's1', wingId }, 'wc-1')))
        .resolves.toMatchObject({ eligible: false, launched: false, reason: 'destroyed' });
      await expect(launchAegisFighterWing.run(request({ sessionId: 's1', wingId, requestId: `wrecked-${wingId}`,
        expectedTurn: 2, expectedRevision: 4, expectedWingRevision: 0 }, 'wc-1')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
    }
    expect(entropy.randomInt).not.toHaveBeenCalled();
    expect(testState.update).not.toHaveBeenCalled();
    expect(testState.set).not.toHaveBeenCalled();
  });

it('auto-advances a destroyed AEGIS past ranges before current-cycle maintenance exists', async () => {
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, currentTurn: 2, activeRoleIds: [], maintenanceCycles: {},
    turnPhase: { ...(session.turnPhase as Fields), turn: 2 },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: true } } });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, turn: 2, currentStep: 'long-range', revision: 4,
    preparation: { ...(attack.preparation as Fields), turn: 2 },
    calculationReceipt: { ...(attack.calculationReceipt as Fields), turn: 2 } });

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });

  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'medium-range', revision: 5,
    rangeDecisions: { 'long-range': { status: 'auto-passed', range: 'long-range' } },
  });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current/audit/auto-long-range-2'))
    .toMatchObject({ type: 'wolf-range-automatic-no-action', range: 'long-range', toStep: 'medium-range' });
  expect(entropy.randomInt).not.toHaveBeenCalled();
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
  expect(testState.documents.get('sessions/s1')!.fighterWingCounts).toMatchObject({
    'fighter-wing-alpha': { count: 2, revision: 1 },
    'fighter-wing-bravo': { count: 4, revision: 0 },
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
  expect(lock.hitSlots).toEqual([{ actionId: 'aegis-missile-launchers-medium', count: 5, damagePerHit: 1 }]);
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
  expect(choice.hitSlots).toEqual([{ actionId: 'aegis-point-defence-lasers-short', count: 2, damagePerHit: 1 }]);
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

function openBoardingFixture(targetingReceipt = targeting): void {
  const targets = [...EXPANDED_WOLF_TARGET_RING];
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const roster = wolfCombatRoster(targetingReceipt);
  const targetSnapshot = roster.map(({ instanceId, target }) => ({ instanceId, target }));
  const emptyRange = (range: string) => ({ range, targetSnapshot, dice: [], assignments: [], targetShifts: [], unusedHitsByAction: [],
    damageByInstance: {}, destroyedInstanceIds: [], destructionDamageByTarget: Object.fromEntries(targets.map((id) => [id, 0])) });
  const current = new Date();
  const future = (milliseconds: number) => new Date(current.getTime() + milliseconds).toISOString();
  put('sessions/s1', {
    ...testState.documents.get('sessions/s1'),
    shipResources: {
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 4 },
      dione: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 },
    },
    shipSurvivors: { aegis: 2500, dione: 100000, icebreaker: 40000, quellon: 30000, shepherd: 30000, 'refinery-124': 20000 },
    shipDamage: Object.fromEntries(targets.map((id) => [id, { damagedSystemIds: [], destroyed: false }])),
    shipUnrest: Object.fromEntries(targets.map((id) => [id, 0])),
    turnPhase: { turn: 1, teamPhaseEndsAt: future(-1000), openAirspaceEndsAt: future(300000),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
  });
  put('sessions/s1/wolfAttackState/current', {
    ...attack, currentStep: 'boarding', revision: 10,
    calculationReceipt: { type: 'wolf-combat-calculation-stage', version: 1, turn: 1, step: 'targeting',
      targeting: targetingReceipt },
    combatRoster: roster,
    rangeReceipts: [
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

it('finalizes a source reroll on its own target when another attacked target follows', async () => {
  let targetingDraw = 0;
  const twoTargetReceipt = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, CORE_WOLF_TARGET_RING,
    () => targetingDraw++ === 10 ? 1 : 0);
  openBoardingFixture(twoTargetReceipt);
  put('sessions/s1/players/commander-1', {
    uid: 'commander-1', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });
  put('sessions/s1/players/dione-crew', {
    uid: 'dione-crew', role: 'player', connected: true, assignedRoleId: 'dione-captain',
    activeConsoleRoleId: 'dione-captain', seatId: 'dione-captain', fleetGroupId: 'fleet-1',
  });
  const fleetGroup = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', {
    ...fleetGroup, memberUids: [...(fleetGroup.memberUids as string[]), 'dione-crew'],
    memberShipIds: { ...(fleetGroup.memberShipIds as Fields), 'dione-crew': 'dione' },
  });

  const commanderView = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }, 'commander-1'));
  expect(commanderView).toMatchObject({ choice: { kind: 'commander', targets: [
    { targetShipId: 'aegis' }, { targetShipId: 'dione' },
  ] } });
  await commitWolfBoardingSpecialChoice.run(request({ sessionId: 's1', requestId: 'multi-target-commander',
    expectedTurn: 1, expectedRevision: 10, choice: { kind: 'commander', targetShipId: 'aegis' },
  }, 'commander-1'));

  for (const { targetShipId, uid } of [
    { targetShipId: 'aegis', uid: 'xo-1' }, { targetShipId: 'dione', uid: 'dione-crew' },
  ]) {
    const defence = await getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' }, uid));
    expect(defence).toMatchObject({ type: 'wolf-boarding-defence-choice-view', targetShipId, choiceStatus: 'pending' });
    await commitWolfBoardingDefenceChoice.run(request({ sessionId: 's1',
      requestId: `multi-target-defence-${targetShipId}`, expectedTurn: 1, expectedRevision: defence.revision,
      targetShipId, securityTeams: 1,
    }, uid));
  }
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const aegisReroll = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }, 'xo-1'));
  expect(aegisReroll).toMatchObject({ choice: { kind: 'reroll', source: 'aegis', targetShipId: 'aegis' } });
  await commitWolfBoardingSpecialChoice.run(request({ sessionId: 's1', requestId: 'multi-target-aegis-pass',
    expectedTurn: 1, expectedRevision: aegisReroll.revision,
    choice: { kind: 'reroll', source: 'aegis', targetShipId: 'aegis', dieIndexes: [] },
  }));
  const pallasReroll = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }, 'xo-1'));
  expect(pallasReroll).toMatchObject({ choice: { kind: 'reroll', source: 'pallas', targetShipId: 'aegis' } });
  await commitWolfBoardingSpecialChoice.run(request({ sessionId: 's1', requestId: 'multi-target-pallas-pass',
    expectedTurn: 1, expectedRevision: pallasReroll.revision,
    choice: { kind: 'reroll', source: 'pallas', targetShipId: 'aegis', dieIndexes: [] },
  }));

  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state).toMatchObject({ status: 'resolved', currentStep: 'resolved', airspaceLocked: false,
    calculationReceipt: { boarding: [
      expect.objectContaining({ target: 'aegis' }), expect.objectContaining({ target: 'dione' }),
    ] },
  });
});

it('finalizes the four-target max-team defence with Pallas rerolls at its relocated host', async () => {
  // Reproduce the committed dice pattern from the authenticated stall report,
  // with local actor identities and newly generated native range receipts.
  const targetingDice = [1, 6, 5, 4, 2, 4, 3, 3, 2, 6, 2, 2, 4, 6, 1, 2];
  let targetingDraw = 0;
  const receipt = resolveWolfTargeting(firstTurnWolfAttackComposition(), {
    commanderRerollIndexes: [0],
  }, CORE_WOLF_TARGET_RING, () => targetingDice[targetingDraw++]! - 1);
  openBoardingFixture(receipt);
  const statePath = 'sessions/s1/wolfAttackState/current';
  const before = testState.documents.get(statePath)!;
  const ranged = resolveWolfRange('long-range', [{
    actionId: 'aegis-missile-launchers-long', sourceId: 'aegis-missile-launchers',
    range: 'long-range', fixedDamage: 2, maxTargets: 1,
  }], [{ actionId: 'aegis-missile-launchers-long', targetInstanceIds: ['0:wolf-fighter-wing'] }],
  before.combatRoster as ReturnType<typeof wolfCombatRoster>);
  const beforeRanges = before.rangeReceipts as Array<Fields>;
  const afterSnapshot = ranged.roster.map(({ instanceId, target }) => ({ instanceId, target }));
  put(statePath, { ...before, combatRoster: ranged.roster,
    rangeReceipts: [ranged.receipt, ...beforeRanges.slice(1).map((range) => ({
      ...range, targetSnapshot: afterSnapshot,
    }))],
  });
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, shuttleFuelled: { pallas: true },
    shuttleControl: { pallas: { shuttleId: 'pallas', ownerRoleId: 'executive-officer',
      ownerUid: 'xo-1', holderUid: 'xo-1', revision: 0 } },
    shipResources: { ...(session.shipResources as Fields),
      aegis: { securityTeams: 9 }, dione: { securityTeams: 2 },
      quellon: { securityTeams: 2 }, 'refinery-124': { securityTeams: 6 },
    },
  });
  put('sessions/s1/players/commander-1', {
    uid: 'commander-1', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });
  const crew = [
    ['dione-crew', 'dione'], ['quellon-crew', 'quellon'], ['refinery-crew', 'refinery-124'],
  ] as const;
  for (const [uid, target] of crew) {
    const roleId = target === 'refinery-124' ? 'refinery-124-superintendent' : `${target}-captain`;
    put(`sessions/s1/players/${uid}`, { uid, role: 'player', connected: true,
      assignedRoleId: roleId, activeConsoleRoleId: roleId, fleetGroupId: 'fleet-1' });
  }
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group,
    memberUids: [...(group.memberUids as string[]), ...crew.map(([uid]) => uid)],
    memberShipIds: { ...(group.memberShipIds as Fields), ...Object.fromEntries(crew) },
  });
  await commitWolfBoardingSpecialChoice.run(request({ sessionId: 's1', requestId: 'four-target-commander',
    expectedTurn: 1, expectedRevision: 10, choice: { kind: 'commander', targetShipId: 'aegis' },
  }, 'commander-1'));
  const relocation = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }));
  expect(relocation).toMatchObject({ choice: { kind: 'relocation', craftId: 'pallas' } });
  await commitWolfBoardingSpecialChoice.run(request({ sessionId: 's1', requestId: 'four-target-pallas-move',
    expectedTurn: 1, expectedRevision: relocation.revision,
    choice: { kind: 'relocation', craftId: 'pallas', targetShipId: 'dione',
      expectedControlRevision: relocation.choice.controlRevision },
  }));
  for (const [uid, target, securityTeams] of [
    ['xo-1', 'aegis', 9], ['dione-crew', 'dione', 2],
    ['quellon-crew', 'quellon', 2], ['refinery-crew', 'refinery-124', 6],
  ] as const) {
    const view = await getWolfBoardingDefenceChoice.run(request({ sessionId: 's1' }, uid));
    expect(view).toMatchObject({ targetShipId: target, availableSecurityTeams: securityTeams });
    await commitWolfBoardingDefenceChoice.run(request({ sessionId: 's1', requestId: `four-target-defence-${target}`,
      expectedTurn: 1, expectedRevision: view.revision, targetShipId: target, securityTeams }, uid));
  }
  entropy.randomInt.mockReset().mockReturnValue(0);
  for (const die of [4, 1, 3, 2, 2, 1, 5, 2, 6, 2, 3, 4, 5, 5, 5, 3, 5, 5, 4, 2, 3, 1, 3, 6]) {
    entropy.randomInt.mockReturnValueOnce(die - 1);
  }
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  for (const [source, targetShipId, dieIndexes] of [
    ['aegis', 'aegis', [0, 1, 2]], ['pallas', 'dione', [0, 1]],
  ] as const) {
    const view = await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' }));
    expect(view).toMatchObject({ choice: { kind: 'reroll', source, targetShipId } });
    await commitWolfBoardingSpecialChoice.run(request({ sessionId: 's1', requestId: `four-target-${source}-reroll`,
      expectedTurn: 1, expectedRevision: view.revision, choice: { kind: 'reroll', source, targetShipId, dieIndexes } }));
  }
  expect(await getWolfBoardingSpecialChoice.run(request({ sessionId: 's1' })))
    .toMatchObject({ reason: 'no-special-choice' });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const resolved = testState.documents.get(statePath)!;
  expect(resolved).toMatchObject({ status: 'resolved', currentStep: 'resolved', airspaceLocked: false,
    calculationReceipt: { boarding: [
      expect.objectContaining({ target: 'aegis', survivingBoardingParties: 4,
        rerolls: [{ source: 'aegis', dieIndexes: [0, 1, 2], rolls: [2, 3, 1] }] }),
      expect.objectContaining({ target: 'dione', survivingBoardingParties: 7,
        rerolls: [{ source: 'pallas', dieIndexes: [0, 1], rolls: [3, 6] }] }),
      expect.objectContaining({ target: 'quellon', survivingBoardingParties: 2, rerolls: [] }),
      expect.objectContaining({ target: 'refinery-124', survivingBoardingParties: 0, rerolls: [] }),
    ], returningInstanceIds: Array.from({ length: 9 }, (_, index) => `${index + 1}:wolf-fighter-wing`) },
  });
  expect(resolved).not.toHaveProperty('boardingCommanderRulingRequiredTarget');
  expect(resolved).not.toHaveProperty('resolutionBlocker');
  const finalAudit = testState.documents.get(`${statePath}/audit/wolf-finalized-1`);
  const drawCount = entropy.randomInt.mock.calls.length;
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get(`${statePath}/audit/wolf-finalized-1`)).toEqual(finalAudit);
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

it('offers current Highwall, Gorgoneion and Boa choices through private actor views with Short Wing-first contacts', async () => {
  admitRangeSupportChoices();
  const highwall = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'highwall', range: 'short-range' }, 'miner-1'));
  expect(highwall).toMatchObject({ type: 'wolf-range-support-action-choice-view', sourceId: 'highwall',
    actorRoleId: 'icebreaker-miner', eligible: true, actionAvailable: true, choiceStatus: 'pending' });
  const gorgoneion = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'gorgoneion-missile-array', range: 'short-range' }, 'gorg-captain-1'));
  expect(gorgoneion).toMatchObject({ sourceId: 'gorgoneion-missile-array', actorRoleId: 'gorgoneion-captain',
    eligible: true, actionAvailable: true, choiceStatus: 'pending' });
  const boa = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'boa', range: 'short-range' }, 'recycler-1'));
  expect(boa).toMatchObject({ sourceId: 'boa', actorRoleId: 'capybara-recycler', eligible: true,
    actionAvailable: true, scrapAvailable: 3, choiceStatus: 'pending' });
  expect(boa.contacts.slice(0, 10).every((contact: Fields) => contact.available)).toBe(true);
  expect(boa.contacts.slice(10).every((contact: Fields) => !contact.available)).toBe(true);
  for (const view of [highwall, gorgoneion, boa]) {
    expect(Object.keys(view).sort()).toEqual([
      'type', 'sessionId', 'attackId', 'turn', 'revision', 'range', 'sourceId', 'actorRoleId',
      'choiceStatus', 'eligible', 'actionAvailable', 'deadlineAt', 'contacts',
      ...(view.sourceId === 'boa' ? ['scrapAvailable'] : []),
    ].sort());
    expect(view).not.toHaveProperty('combatRoster');
    expect(view).not.toHaveProperty('targetInstanceIds');
    expect(view).not.toHaveProperty('dice');
    expect(view).not.toHaveProperty('privateNotes');
  }
  await expect(getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'boa', range: 'short-range' }, 'xo-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('accepts an admitted replacement Gorgoneion Captain outside the core setup role roster', async () => {
  admitRangeSupportChoices();
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session,
    activeRoleIds: (session.activeRoleIds as string[]).filter(id => id !== 'gorgoneion-captain'),
  });
  const view = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1',
    sourceId: 'gorgoneion-missile-array', range: 'short-range' }, 'gorg-captain-1'));
  expect(view).toMatchObject({ eligible: true, actionAvailable: true, actorRoleId: 'gorgoneion-captain' });
  const payload = { sessionId: 's1', requestId: 'ordinary-extra-captain-pass', expectedTurn: 1,
    expectedRevision: view.revision, sourceId: 'gorgoneion-missile-array', range: 'short-range', use: false };
  await commitWolfRangeSupportActionChoice.run(request(payload, 'gorg-captain-1'));
  await expect(commitWolfRangeSupportActionChoice.run(request(payload, 'gorg-captain-1')))
    .resolves.toMatchObject({ status: 'replayed', choiceStatus: 'passed' });
  const captain = testState.documents.get('sessions/s1/players/gorg-captain-1')!;
  put('sessions/s1/players/gorg-captain-1', { ...captain, replacementRoleId: null });
  await expect(commitWolfRangeSupportActionChoice.run(request(payload, 'gorg-captain-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(entropy.randomInt).not.toHaveBeenCalled();
});

it('holds an entitled disconnected range-source owner until reconnect and a fresh explicit pass', async () => {
  admitRangeSupportChoices();
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, shuttleFuelled: { highwall: true, boa: false },
    shuttleCargo: { boa: { scrap: 0 } },
    smallShipStates: { gorgoneion: { id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1,
      population: 1000, unrest: 0, cycle: { step: 5, revision: 4, results: { '4': 'Reactor charged.' }, charges: [], turn: 1 } } },
  });
  const miner = testState.documents.get('sessions/s1/players/miner-1')!;
  put('sessions/s1/players/miner-1', { ...miner, connected: false, activeConsoleRoleId: undefined });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ currentStep: 'short-range' });
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')?.rangeDecisions).toBeUndefined();
  await expect(commitWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'highwall', range: 'short-range',
    requestId: 'offline-highwall', expectedTurn: 1, expectedRevision: 7, use: false }, 'miner-1')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  put('sessions/s1/players/miner-1', { ...miner, connected: true, activeConsoleRoleId: 'icebreaker-miner' });
  const view = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'highwall', range: 'short-range' }, 'miner-1'));
  await expect(commitWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'highwall', range: 'short-range',
    requestId: 'reconnected-highwall-pass', expectedTurn: 1, expectedRevision: view.revision, use: false }, 'miner-1')))
    .resolves.toMatchObject({ status: 'committed', choiceStatus: 'passed' });
  expect(entropy.randomInt).not.toHaveBeenCalled();
});

it('combines source choices in one locked range and guides Short Wing coverage after fixed Boa damage', async () => {
  admitRangeSupportChoices();
  const highwallView = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'highwall', range: 'short-range' }, 'miner-1'));
  await commitWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'highwall', range: 'short-range',
    requestId: 'highwall-short-use', expectedTurn: 1, expectedRevision: highwallView.revision, use: true }, 'miner-1'));
  const gorgView = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'gorgoneion-missile-array', range: 'short-range' }, 'gorg-captain-1'));
  await commitWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'gorgoneion-missile-array', range: 'short-range',
    requestId: 'gorg-short-use', expectedTurn: 1, expectedRevision: gorgView.revision, use: true }, 'gorg-captain-1'));
  const boaView = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'boa', range: 'short-range' }, 'recycler-1'));
  const payload = { sessionId: 's1', sourceId: 'boa', range: 'short-range', requestId: 'boa-short-use',
    expectedTurn: 1, expectedRevision: boaView.revision, use: true, targetContactId: 'contact-1' };
  await commitWolfRangeSupportActionChoice.run(request(payload, 'recycler-1'));
  await expect(commitWolfRangeSupportActionChoice.run(request(payload, 'recycler-1'))).resolves.toMatchObject({ status: 'replayed' });
  expect(testState.documents.get('sessions/s1')?.shuttleCargo).toMatchObject({ boa: { scrap: 2 } });
  expect(entropy.randomInt).not.toHaveBeenCalled();

  const eo = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  const locked = await commitWolfRangeActionChoice.run(request({ sessionId: 's1', requestId: 'eo-support-short-lock',
    expectedTurn: 1, expectedRevision: eo.revision, range: 'short-range', actionIds: [] }));
  expect(locked).toMatchObject({ choiceStatus: 'targets-required', hitSlots: [
    { actionId: 'highwall-short-range', count: 1, damagePerHit: 3 },
    { actionId: 'gorgoneion-missile-array-short', count: 3, damagePerHit: 1 },
  ] });
  expect(entropy.randomInt).toHaveBeenCalledTimes(4);
  const assignmentView = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  expect(assignmentView.hitSlots).toEqual(locked.hitSlots);
  expect(assignmentView.contacts[0]).toMatchObject({ contactId: 'contact-1', available: true, requiredCoverageDamage: 0 });
  expect(assignmentView.contacts[1]).toMatchObject({ contactId: 'contact-2', available: true, requiredCoverageDamage: 1 });
  expect(assignmentView.contacts[10]).toMatchObject({ contactId: 'contact-11', available: true, requiredCoverageDamage: null });
  const lockedDice = (testState.documents.get('sessions/s1/wolfAttackState/current')!.rangeDecisions as
    Record<string, { lock: { dice: Fields[] } }>)['short-range']!.lock.dice;
  expect(lockedDice).toContainEqual(expect.objectContaining({ actionId: 'boa-short-range', successes: 1 }));
  const assigned = await assignWolfRangeTargets.run(request({ sessionId: 's1', requestId: 'ordinary-support-short-assign',
    expectedTurn: 1, expectedRevision: assignmentView.revision, range: 'short-range',
    assignments: assignmentView.hitSlots.map(slot => ({ actionId: slot.actionId,
      contactIds: slot.actionId === 'highwall-short-range' ? ['contact-2'] : ['contact-3', 'contact-4', 'contact-5'] })),
  }));
  expect(assigned).toMatchObject({ currentStep: 'boarding' });
  const resolved = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const rangeReceipt = (resolved.rangeReceipts as Array<Fields>).at(-1)!;
  expect(rangeReceipt.dice).toEqual(lockedDice.map(die => ({ actionId: die.actionId, sourceId: die.sourceId,
    range: die.range, rolls: die.rolls, successes: die.successes, damage: die.damage })));
  expect(rangeReceipt.assignments).toContainEqual(expect.objectContaining({ actionId: 'boa-short-range',
    targetInstanceIds: [(resolved.combatRoster as Array<Fields>)[0]!.instanceId] }));
  expect(entropy.randomInt).toHaveBeenCalledTimes(4);
  expect(testState.documents.get('sessions/s1')!.shuttleCargo).toMatchObject({ boa: { scrap: 2 } });
});

async function commitSupportMisses(): Promise<unknown[]> {
  admitRangeSupportChoices();
  for (const [sourceId, uid] of [
    ['highwall', 'miner-1'], ['gorgoneion-missile-array', 'gorg-captain-1'], ['boa', 'recycler-1'],
  ] as const) {
    const view = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId,
      range: 'short-range' }, uid));
    await commitWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId,
      range: 'short-range', requestId: `miss-${sourceId}`, expectedTurn: 1,
      expectedRevision: view.revision, use: sourceId !== 'boa' }, uid));
  }
  entropy.randomInt.mockReturnValue(0);
  const view = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  const locked = await commitWolfRangeActionChoice.run(request({ sessionId: 's1',
    requestId: 'support-misses-lock', expectedTurn: 1, expectedRevision: view.revision,
    range: 'short-range', actionIds: [] }));
  expect(locked.hitSlots).toEqual([
    { actionId: 'highwall-short-range', count: 0, damagePerHit: 3 },
    { actionId: 'gorgoneion-missile-array-short', count: 0, damagePerHit: 1 },
  ]);
  await assignWolfRangeTargets.run(request({ sessionId: 's1', requestId: 'support-misses-assign',
    expectedTurn: 1, expectedRevision: locked.revision, range: 'short-range',
    assignments: locked.hitSlots.map(({ actionId }) => ({ actionId, contactIds: [] })) }));
  expect(entropy.randomInt).toHaveBeenCalledTimes(4);
  return testState.documents.get('sessions/s1/wolfAttackState/current')!.memberResults as unknown[];
}

it('projects actual support misses after the shared lock and zero-hit assignment', async () => {
  const results = await commitSupportMisses();
  expect(results).toEqual([
    expect.objectContaining({ sourceId: 'highwall', targetId: null, outcome: { damage: 0 } }),
    expect.objectContaining({ sourceId: 'gorgoneion-missile-array', targetId: null, outcome: { damage: 0 } }),
  ]);
  const view = projectWolfAttackMemberView({ sessionId: 's1',
    state: testState.documents.get('sessions/s1/wolfAttackState/current'), serverTime: new Date().toISOString() });
  expect(view.results).toHaveLength(2);
  expect(JSON.stringify(view)).not.toMatch(/rolls|actorUid|combatRoster|calculationReceipt/);
});

it('atomically finalizes boarding and reopens once with actual prior support misses', async () => {
  const misses = await commitSupportMisses();
  resetFixture();
  openBoardingFixture();
  const statePath = 'sessions/s1/wolfAttackState/current';
  put(statePath, { ...testState.documents.get(statePath), memberResults: misses });
  await commitWolfBoardingDefenceChoice.run(request({ sessionId: 's1', requestId: 'miss-boarding-defence',
    expectedTurn: 1, expectedRevision: 10, targetShipId: 'aegis', securityTeams: 0 }));
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  const resolved = testState.documents.get(statePath)!;
  expect(resolved).toMatchObject({ status: 'resolved', currentStep: 'resolved', airspaceLocked: false });
  expect(testState.documents.get('sessions/s1')).toMatchObject({ turnPhase: { airspace: { state: 'lifted' } } });
  const audience = testState.documents.get('sessions/s1/wolfAttackAudience/current')!;
  expect(audience).toMatchObject({ status: 'resolved', currentStep: 'resolved', results: expect.arrayContaining([
    expect.objectContaining({ sourceId: 'highwall', targetId: null, outcome: { damage: 0 } }),
    expect.objectContaining({ sourceId: 'gorgoneion-missile-array', targetId: null, outcome: { damage: 0 } }),
  ]) });
  expect(JSON.stringify(audience)).not.toMatch(/rolls|actorUid|combatRoster|calculationReceipt/);
  const finalAudit = testState.documents.get(`${statePath}/audit/wolf-finalized-1`);
  const draws = entropy.randomInt.mock.calls.length;
  await advanceWolfAttackLifecycle.run({ params: { sessionId: 's1' } });
  expect(testState.documents.get(`${statePath}/audit/wolf-finalized-1`)).toEqual(finalAudit);
  expect(testState.documents.get('sessions/s1/wolfAttackAudience/current')).toEqual(audience);
  expect(entropy.randomInt).toHaveBeenCalledTimes(draws);
});

it('rechecks the current support holder before returning an exact replay', async () => {
  admitRangeSupportChoices();
  const view = await getWolfRangeSupportActionChoice.run(request({
    sessionId: 's1', sourceId: 'highwall', range: 'short-range',
  }, 'miner-1'));
  const payload = { sessionId: 's1', requestId: 'highwall-bound-replay', expectedTurn: 1,
    expectedRevision: view.revision, sourceId: 'highwall', range: 'short-range', use: true };
  await commitWolfRangeSupportActionChoice.run(request(payload, 'miner-1'));
  const actor = testState.documents.get('sessions/s1/players/miner-1')!;
  put('sessions/s1/players/miner-1', { ...actor, replacementStatus: 'replaced' });

  await expect(commitWolfRangeSupportActionChoice.run(request(payload, 'miner-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('does not replay a support choice after the session advances to another cycle', async () => {
  admitRangeSupportChoices();
  const view = await getWolfRangeSupportActionChoice.run(request({
    sessionId: 's1', sourceId: 'highwall', range: 'short-range',
  }, 'miner-1'));
  const payload = { sessionId: 's1', requestId: 'highwall-old-cycle-replay', expectedTurn: 1,
    expectedRevision: view.revision, sourceId: 'highwall', range: 'short-range', use: true };
  await commitWolfRangeSupportActionChoice.run(request(payload, 'miner-1'));
  const updateCount = testState.update.mock.calls.length;
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, currentTurn: 2 });

  await expect(commitWolfRangeSupportActionChoice.run(request(payload, 'miner-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(testState.update).toHaveBeenCalledTimes(updateCount);
});

it('keeps a committed Highwall action applicable after its committed holder is removed', async () => {
  admitRangeSupportChoices();
  for (const [sourceId, uid, use] of [
    ['highwall', 'miner-1', true],
    ['gorgoneion-missile-array', 'gorg-captain-1', true],
    ['boa', 'recycler-1', false],
  ] as const) {
    const view = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId,
      range: 'short-range' }, uid));
    await commitWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId,
      range: 'short-range', requestId: `holder-removed-${sourceId}`, expectedTurn: 1,
      expectedRevision: view.revision, use }, uid));
  }
  const miner = testState.documents.get('sessions/s1/players/miner-1')!;
  put('sessions/s1/players/miner-1', { ...miner, replacementStatus: 'kicked' });
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group,
    memberUids: ['xo-1', 'recycler-1', 'gorg-captain-1'],
    memberShipIds: { 'xo-1': 'aegis', 'recycler-1': 'capybara', 'gorg-captain-1': 'aegis' },
  });

  const view = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));

  expect(view.eligibleActions).toContainEqual(expect.objectContaining({
    actionId: 'highwall-short-range', sourceId: 'highwall',
  }));
  expect(testState.documents.get('sessions/s1/wolfAttackState/current')?.rangeSupportChoices)
    .toMatchObject({ 'short-range': { highwall: { choice: 'used', actorUid: 'miner-1' } } });
});

it('does not replay a support choice after current shuttle custody changes revision', async () => {
  admitRangeSupportChoices();
  const view = await getWolfRangeSupportActionChoice.run(request({
    sessionId: 's1', sourceId: 'highwall', range: 'short-range',
  }, 'miner-1'));
  const payload = { sessionId: 's1', requestId: 'highwall-custody-revision-replay', expectedTurn: 1,
    expectedRevision: view.revision, sourceId: 'highwall', range: 'short-range', use: true };
  await commitWolfRangeSupportActionChoice.run(request(payload, 'miner-1'));
  const updateCount = testState.update.mock.calls.length;
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, shuttleControl: { ...session.shuttleControl,
    highwall: { ...(session.shuttleControl as Fields).highwall as Fields, revision: 3 } } });

  await expect(commitWolfRangeSupportActionChoice.run(request(payload, 'miner-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(testState.update).toHaveBeenCalledTimes(updateCount);
});

it('requires a fresh live source console to commit an otherwise valid support choice', async () => {
  admitRangeSupportChoices();
  const actor = testState.documents.get('sessions/s1/players/miner-1')!;
  put('sessions/s1/players/miner-1', { ...actor, activeConsoleRoleId: null });
  await expect(commitWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId: 'highwall',
    range: 'short-range', requestId: 'highwall-away-console', expectedTurn: 1, expectedRevision: 7,
    use: true }, 'miner-1'))).rejects.toMatchObject({ code: 'permission-denied' });
});

it('rejects a malformed support replay receipt without exposing added fields', async () => {
  admitRangeSupportChoices();
  const view = await getWolfRangeSupportActionChoice.run(request({
    sessionId: 's1', sourceId: 'highwall', range: 'short-range',
  }, 'miner-1'));
  const payload = { sessionId: 's1', requestId: 'highwall-shape-replay', expectedTurn: 1,
    expectedRevision: view.revision, sourceId: 'highwall', range: 'short-range', use: true };
  await commitWolfRangeSupportActionChoice.run(request(payload, 'miner-1'));
  const receiptPath = 'sessions/s1/commandReceipts/highwall-shape-replay';
  const receipt = testState.documents.get(receiptPath)!;
  put(receiptPath, { ...receipt, result: { ...(receipt.result as Fields), privateReceipt: 'must-not-leak' } });

  await expect(commitWolfRangeSupportActionChoice.run(request(payload, 'miner-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
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

it.each([
  ['wrong printed role', { actorRoleId: 'wing-commander' }],
  ['empty actor identity', { actorUid: '' }],
  ['unrecognized receipt field', { dice: [6] }],
])('rejects an otherwise attack-bound Enriched Warhead marker with %s', async (_label, invalid) => {
  enrichedWarheadFixture();
  await commitAegisEnrichedWarheadChoice.run(request({ sessionId: 's1', requestId: 'enrich-marker-bound',
    expectedTurn: 1, expectedRevision: 4, choice: 'enrich' }));
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...state, currentStep: 'long-range',
    enrichedWarheads: { ...(state.enrichedWarheads as Fields), ...invalid } });
  await expect(getWolfRangeActionChoice.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it.each([
  ['unrecognized status', { status: 'forged' }],
  ['mismatched action count', { actionCount: 4 }],
  ['mismatched revision', { revision: 90 }],
  ['unrecognized resolution status', { choiceStatus: 'resolved' }],
  ['unrecognized receipt field', { dice: [6] }],
])('rejects a fingerprint-matching Escort replay with %s without consuming another die', async (_label, invalid) => {
  admitEscortRange();
  const payload = { sessionId: 's1', sourceId: 'pdf-escort-fighter-wing', range: 'medium-range',
    requestId: 'escort-replay-bound', expectedTurn: 1, expectedRevision: 4,
    actions: [{ fighterIndex: 0, kind: 'attack', targetContactId: 'contact-1' }] };
  await commitWolfEscortRangeActionChoice.run(request(payload, 'colonel-1'));
  const path = 'sessions/s1/commandReceipts/escort-replay-bound';
  const receipt = testState.documents.get(path)!;
  put(path, { ...receipt, result: { ...(receipt.result as Fields), ...invalid } });
  entropy.randomInt.mockClear();
  testState.update.mockClear();
  await expect(commitWolfEscortRangeActionChoice.run(request(payload, 'colonel-1')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(entropy.randomInt).not.toHaveBeenCalled();
  expect(testState.update).not.toHaveBeenCalled();
});

it('publishes each assigned support hit once with its printed source label', async () => {
  admitRangeSupportChoices();
  for (const [sourceId, uid] of [
    ['highwall', 'miner-1'], ['gorgoneion-missile-array', 'gorg-captain-1'], ['boa', 'recycler-1'],
  ] as const) {
    const view = await getWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId,
      range: 'short-range' }, uid));
    await commitWolfRangeSupportActionChoice.run(request({ sessionId: 's1', sourceId,
      range: 'short-range', requestId: `support-results-${sourceId}`, expectedTurn: 1,
      expectedRevision: view.revision, use: sourceId !== 'boa' }, uid));
  }
  const view = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  const locked = await commitWolfRangeActionChoice.run(request({ sessionId: 's1',
    requestId: 'support-results-lock', expectedTurn: 1, expectedRevision: view.revision,
    range: 'short-range', actionIds: [] }));
  const payload = { sessionId: 's1', requestId: 'support-results-assign', expectedTurn: 1,
    expectedRevision: locked.revision, range: 'short-range', assignments: locked.hitSlots.map(slot => ({
      actionId: slot.actionId, contactIds: slot.actionId === 'highwall-short-range'
        ? ['contact-1'] : ['contact-2', 'contact-3', 'contact-4'],
    })) };
  const committed = await assignWolfRangeTargets.run(request(payload));
  const state = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const results = (state.memberResults as Fields[]).filter(row =>
    row.sourceId === 'highwall' || row.sourceId === 'gorgoneion-missile-array');
  expect(results.map(row => ({ sourceId: row.sourceId, effect: row.effect }))).toEqual([
    { sourceId: 'highwall', effect: 'Highwall Cannon hit' },
    ...Array.from({ length: 3 }, () => ({ sourceId: 'gorgoneion-missile-array', effect: 'Gorgoneion Missile Array hit' })),
  ]);
  expect(results.map(row => (row.outcome as Fields).damage)).toEqual([3, 1, 1, 1]);
  const saved = structuredClone([...testState.documents]);
  expect(await assignWolfRangeTargets.run(request(payload))).toEqual(committed);
  expect([...testState.documents]).toEqual(saved);
});

it('publishes each PDF Short editable hit once with its printed source label', async () => {
  admitEscortRange();
  for (const [sourceId, uid] of [['pdf-escort-fighter-wing', 'colonel-1'], ['maliades', 'engineer-1']]) {
    const view = await getWolfEscortRangeActionChoice.run(request({ sessionId: 's1', sourceId, range: 'medium-range' }, uid));
    await commitWolfEscortRangeActionChoice.run(request({ sessionId: 's1', sourceId, range: 'medium-range',
      requestId: `review-${sourceId}-medium-pass`, expectedTurn: 1, expectedRevision: view.revision, actions: [] }, uid));
  }
  const medium = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  await commitWolfRangeActionChoice.run(request({ sessionId: 's1', requestId: 'review-medium-eo-pass', expectedTurn: 1,
    expectedRevision: medium.revision, range: 'medium-range', actionIds: [] }));
  for (const [sourceId, uid] of [['pdf-escort-fighter-wing', 'colonel-1'], ['maliades', 'engineer-1']]) {
    const view = await getWolfEscortRangeActionChoice.run(request({ sessionId: 's1', sourceId, range: 'short-range' }, uid));
    await commitWolfEscortRangeActionChoice.run(request({ sessionId: 's1', sourceId, range: 'short-range',
      requestId: `review-${sourceId}-short`, expectedTurn: 1, expectedRevision: view.revision,
      ...(sourceId === 'maliades' ? { targetContactIds: [] } : { fighterIndexes: [0, 1] }) }, uid));
  }
  const short = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  entropy.randomInt.mockReset().mockReturnValueOnce(0).mockReturnValueOnce(5);
  const locked = await commitWolfRangeActionChoice.run(request({ sessionId: 's1', requestId: 'review-short-eo-pass', expectedTurn: 1,
    expectedRevision: short.revision, range: 'short-range', actionIds: [] }));
  expect(locked).toMatchObject({ choiceStatus: 'targets-required', hitSlots: [
    { actionId: 'pdf-escort-wing-short-0', count: 0 }, { actionId: 'pdf-escort-wing-short-1', count: 1 },
  ] });
  const payload = { sessionId: 's1', requestId: 'review-short-pdf-assign', expectedTurn: 1,
    expectedRevision: locked.revision, range: 'short-range', assignments: [
      { actionId: 'pdf-escort-wing-short-0', contactIds: [] },
      { actionId: 'pdf-escort-wing-short-1', contactIds: ['contact-1'] },
    ] };
  const committed = await assignWolfRangeTargets.run(request(payload));
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const receipt = (attack.rangeReceipts as Fields[]).at(-1)!;
  expect(receipt).toMatchObject({ dice: [
    { actionId: 'pdf-escort-wing-short-0', successes: 0, damage: 0, rolls: [1] },
    { actionId: 'pdf-escort-wing-short-1', successes: 1, damage: 1, rolls: [6] },
  ] });
  const results = (attack.memberResults as Fields[]).filter(result => result.sourceId === 'pdf-escort-wing' && result.range === 'short-range');
  const member = projectWolfAttackMemberView({ sessionId: 's1', state: attack, serverTime: new Date().toISOString() });
  const safeResults = member.results.filter(result => result.sourceId === 'pdf-escort-wing' && result.range === 'short');
  expect(safeResults).toHaveLength(1);
  expect(results).toEqual([expect.objectContaining({ effect: 'PDF Escort Wing attack hit', outcome: { damage: 1, destroyed: true } })]);
  expect(projectPdfEscortWingMemberView(testState.documents.get('sessions/s1/serverState/pdfEscortWing')))
    .toMatchObject({ fighters: 3, losses: 1, shortResolved: true, shortRollCount: 2 });
  expect(testState.documents.get('sessions/s1')!.pdfEscortWing).toEqual({
    type: 'pdf-escort-fighter-wing-view', revision: 3, cycle: 1, capacity: 4, fighters: 3,
    launched: true, mediumResolved: true, mediumActionCount: 0, shortResolved: true, shortRollCount: 2, losses: 1,
  });
  const saved = structuredClone([...testState.documents]);
  const draws = entropy.randomInt.mock.calls.length;
  expect(await assignWolfRangeTargets.run(request(payload))).toEqual(committed);
  expect([...testState.documents]).toEqual(saved);
  expect(entropy.randomInt).toHaveBeenCalledTimes(draws);
});

const reviewReplayKinds = ['enriched', 'fighter-launch', 'fighter-range', 'fighter-pass'] as const;
type ReviewReplayKind = typeof reviewReplayKinds[number];

async function commitReviewReplayChoice(kind: ReviewReplayKind) {
  if (kind === 'enriched') {
    enrichedWarheadFixture();
    const payload = { sessionId: 's1', requestId: 'review-enriched-replay', expectedTurn: 1,
      expectedRevision: 4, choice: 'enrich' };
    const replay = () => commitAegisEnrichedWarheadChoice.run(request(payload));
    return { committed: await replay(), replay };
  }
  const session = testState.documents.get('sessions/s1')!;
  put('sessions/s1', { ...session, activeRoleIds: ['executive-officer', 'wing-commander'],
    fighterWingCounts: initialFighterWingCounts(),
    maintenanceCycles: { ...(session.maintenanceCycles as Fields), aegis: {
      ...(session.maintenanceCycles as Fields).aegis as Fields,
      charges: ['fighter-bay-alpha', 'fighter-bay-bravo'],
    } } });
  put('sessions/s1/players/wc-1', { uid: 'wc-1', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  const group = testState.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  put('sessions/s1/fleetGroups/fleet-1', { ...group, memberUids: ['xo-1', 'wc-1'],
    memberShipIds: { 'xo-1': 'aegis', 'wc-1': 'aegis' } });
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'targeting' });
  if (kind === 'fighter-pass') {
    const payload = { sessionId: 's1', requestId: 'review-fighter-pass-replay', sourceId: 'fighter-wing-alpha',
      expectedTurn: 1, expectedRevision: 4, expectedWingRevision: 0 };
    const replay = () => passWolfFighterLaunchChoice.run(request(payload, 'wc-1'));
    return { committed: await replay(), replay };
  }
  const launchPayload = { sessionId: 's1', requestId: 'review-fighter-launch-replay', wingId: 'fighter-wing-alpha',
    expectedTurn: 1, expectedRevision: 4, expectedWingRevision: 0 };
  const launchReplay = () => launchAegisFighterWing.run(request(launchPayload, 'wc-1'));
  const launch = await launchReplay();
  if (kind === 'fighter-launch') return { committed: launch, replay: launchReplay };
  const current = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (current.combatRoster as Array<{ instanceId: string; target: string }>)
    .map(({ instanceId, target }) => ({ instanceId, target }));
  put('sessions/s1/wolfAttackState/current', { ...current, currentStep: 'short-range',
    rangeReceipts: ['long-range', 'medium-range'].map(range => ({ range, targetSnapshot, targetShifts: [],
      dice: [], assignments: [], unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
      destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map(target => [target, 0])),
    })) });
  const payload = { sessionId: 's1', requestId: 'review-fighter-range-replay', sourceId: 'fighter-wing-alpha',
    expectedTurn: 1, expectedRevision: current.revision, range: 'short-range', fighterIndexes: [0, 2] };
  const replay = () => commitWolfFighterRangeActionChoice.run(request(payload, 'wc-1'));
  return { committed: await replay(), replay };
}

it.each(reviewReplayKinds.flatMap(kind => ['session-cycle', 'attack-cycle', 'attack-identity']
  .map(drift => ({ kind, drift }))))('rejects a saved $kind receipt after $drift changes', async ({ kind, drift }) => {
  const { replay } = await commitReviewReplayChoice(kind);
  const session = testState.documents.get('sessions/s1')!;
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  if (drift === 'session-cycle') put('sessions/s1', { ...session, currentTurn: 2,
    turnPhase: { ...(session.turnPhase as Fields), turn: 2 } });
  else put('sessions/s1/wolfAttackState/current', { ...attack,
    ...(drift === 'attack-cycle' ? { turn: 2 } : { attackId: 'wolf-attack-replacement-same-cycle' }) });
  const saved = structuredClone([...testState.documents]);
  entropy.randomInt.mockClear(); testState.set.mockClear(); testState.update.mockClear(); testState.remove.mockClear();
  await expect(replay()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect([...testState.documents]).toEqual(saved);
  expect(entropy.randomInt).not.toHaveBeenCalled();
  expect(testState.set).not.toHaveBeenCalled(); expect(testState.update).not.toHaveBeenCalled();
  expect(testState.remove).not.toHaveBeenCalled();
});

it.each(reviewReplayKinds)('keeps an authorized %s exact retry after its attack resolves', async kind => {
  const { committed, replay } = await commitReviewReplayChoice(kind);
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  put('sessions/s1/wolfAttackState/current', { ...attack, status: 'resolved', currentStep: 'resolved', airspaceLocked: false });
  const saved = structuredClone([...testState.documents]);
  entropy.randomInt.mockClear(); testState.set.mockClear(); testState.update.mockClear(); testState.remove.mockClear();
  expect(await replay()).toEqual({ ...committed, status: kind === 'enriched' ? 'committed' : 'replayed' });
  expect([...testState.documents]).toEqual(saved);
  expect(entropy.randomInt).not.toHaveBeenCalled();
  expect(testState.set).not.toHaveBeenCalled(); expect(testState.update).not.toHaveBeenCalled();
  expect(testState.remove).not.toHaveBeenCalled();
});

const attackReplayDrifts = ['session-cycle', 'attack-cycle', 'attack-id'] as const;
type AttackReplayDrift = typeof attackReplayDrifts[number];

function driftCurrentAttackForReplay(drift: AttackReplayDrift): void {
  const session = testState.documents.get('sessions/s1')!;
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  if (drift === 'session-cycle') {
    put('sessions/s1', { ...session, currentTurn: 2,
      turnPhase: { ...(session.turnPhase as Fields), turn: 2 } });
  } else {
    put('sessions/s1/wolfAttackState/current', { ...attack,
      ...(drift === 'attack-cycle' ? { turn: 2 } : { attackId: 'wolf-attack-replacement-same-cycle' }) });
  }
}

it.each(attackReplayDrifts)('rejects a saved EO range pass after its %s changes, while preserving same-attack retries', async drift => {
  admitEscortRange();
  const escortView = await getWolfEscortRangeActionChoice.run(request({ sessionId: 's1',
    sourceId: 'pdf-escort-fighter-wing', range: 'medium-range' }, 'colonel-1'));
  await commitWolfEscortRangeActionChoice.run(request({ sessionId: 's1', requestId: `pdf-pass-replay-${drift}`,
    expectedTurn: 1, expectedRevision: escortView.revision, sourceId: 'pdf-escort-fighter-wing',
    range: 'medium-range', actions: [{ fighterIndex: 0, kind: 'attack', targetContactId: 'contact-1' }] }, 'colonel-1'));
  const maliadesView = await getWolfEscortRangeActionChoice.run(request({ sessionId: 's1',
    sourceId: 'maliades', range: 'medium-range' }, 'engineer-1'));
  await commitWolfEscortRangeActionChoice.run(request({ sessionId: 's1', requestId: `maliades-pass-replay-${drift}`,
    expectedTurn: 1, expectedRevision: maliadesView.revision, sourceId: 'maliades',
    range: 'medium-range', actions: [] }, 'engineer-1'));
  const eoView = await getWolfRangeActionChoice.run(request({ sessionId: 's1' }));
  expect(eoView).toMatchObject({ type: 'wolf-range-action-choice-view', range: 'medium-range', revision: expect.any(Number) });
  const payload = { sessionId: 's1', requestId: `eo-pass-replay-${drift}`, expectedTurn: 1,
    expectedRevision: eoView.revision, range: 'medium-range', actionIds: [] };
  const replay = () => commitWolfRangeActionChoice.run(request(payload));
  const committed = await replay();
  expect(await replay()).toEqual(committed);

  driftCurrentAttackForReplay(drift);
  const saved = structuredClone([...testState.documents]);
  const draws = entropy.randomInt.mock.calls.length;
  entropy.randomInt.mockClear(); testState.set.mockClear(); testState.update.mockClear(); testState.remove.mockClear();
  await expect(replay()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect([...testState.documents]).toEqual(saved);
  expect(entropy.randomInt).not.toHaveBeenCalled();
  expect(draws).toBeGreaterThan(0);
  expect(testState.set).not.toHaveBeenCalled(); expect(testState.update).not.toHaveBeenCalled();
  expect(testState.remove).not.toHaveBeenCalled();
});

it.each(attackReplayDrifts)('rejects a saved EO target assignment after its %s changes, without redrawing dice', async drift => {
  const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetSnapshot = (attack.combatRoster as Array<{ instanceId: string; target: string }>)
    .map(({ instanceId, target }) => ({ instanceId, target }));
  const longReceipt = { range: 'long-range', targetSnapshot, targetShifts: [], dice: [], assignments: [],
    unusedHitsByAction: [], damageByInstance: {}, destroyedInstanceIds: [],
    destructionDamageByTarget: Object.fromEntries(CORE_WOLF_TARGET_RING.map(target => [target, 0])) };
  put('sessions/s1/wolfAttackState/current', { ...attack, currentStep: 'medium-range', rangeReceipts: [longReceipt] });
  const lock = await commitWolfRangeActionChoice.run(request({ sessionId: 's1', requestId: `eo-lock-${drift}`,
    expectedTurn: 1, expectedRevision: 4, range: 'medium-range', actionIds: ['aegis-missile-launchers-medium'] }));
  const payload = { sessionId: 's1', requestId: `eo-assignment-${drift}`, expectedTurn: 1,
    expectedRevision: lock.revision, range: 'medium-range',
    assignments: [{ actionId: 'aegis-missile-launchers-medium', contactIds:
      Array.from({ length: lock.hitSlots[0]?.count ?? 0 }, (_, index) => `contact-${index + 1}`) }] };
  const replay = () => assignWolfRangeTargets.run(request(payload));
  const committed = await replay();
  expect(await replay()).toEqual(committed);

  driftCurrentAttackForReplay(drift);
  const saved = structuredClone([...testState.documents]);
  const draws = entropy.randomInt.mock.calls.length;
  entropy.randomInt.mockClear(); testState.set.mockClear(); testState.update.mockClear(); testState.remove.mockClear();
  await expect(replay()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect([...testState.documents]).toEqual(saved);
  expect(entropy.randomInt).not.toHaveBeenCalled();
  expect(draws).toBeGreaterThan(0);
  expect(testState.set).not.toHaveBeenCalled(); expect(testState.update).not.toHaveBeenCalled();
  expect(testState.remove).not.toHaveBeenCalled();
});

it.each(attackReplayDrifts)('rejects a saved boarding crew choice after its %s changes, without reserving teams twice', async drift => {
  openBoardingFixture();
  const payload = { sessionId: 's1', requestId: `boarding-choice-${drift}`, expectedTurn: 1,
    expectedRevision: 10, targetShipId: 'aegis', securityTeams: 2 };
  const replay = () => commitWolfBoardingDefenceChoice.run(request(payload));
  const committed = await replay();
  expect(await replay()).toEqual(committed);

  driftCurrentAttackForReplay(drift);
  const saved = structuredClone([...testState.documents]);
  entropy.randomInt.mockClear(); testState.set.mockClear(); testState.update.mockClear(); testState.remove.mockClear();
  await expect(replay()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect([...testState.documents]).toEqual(saved);
  expect(entropy.randomInt).not.toHaveBeenCalled();
  expect(testState.set).not.toHaveBeenCalled(); expect(testState.update).not.toHaveBeenCalled();
  expect(testState.remove).not.toHaveBeenCalled();
});

it.each(['missing', 'actor', 'request', 'range', 'revision'])(
  'rejects fighter range receipt replay with a %s committed choice binding', async drift => {
    const { replay } = await commitReviewReplayChoice('fighter-range');
    const attack = testState.documents.get('sessions/s1/wolfAttackState/current')!;
    const all = attack.fighterRangeChoices as Fields;
    const current = all['short-range'] as Fields;
    const choice = current['fighter-wing-alpha'] as Fields;
    const changed = drift === 'missing' ? {} : { 'fighter-wing-alpha': { ...choice,
      ...(drift === 'actor' ? { actorUid: 'another-commander' }
        : drift === 'request' ? { requestId: 'another-request' }
          : drift === 'range' ? { range: 'medium-range' } : { revision: 900 }),
    } };
    put('sessions/s1/wolfAttackState/current', { ...attack,
      fighterRangeChoices: { ...all, 'short-range': changed } });
    const saved = structuredClone([...testState.documents]);
    await expect(replay()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect([...testState.documents]).toEqual(saved);
  });
