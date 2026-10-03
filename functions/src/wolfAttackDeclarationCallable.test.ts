import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const cryptoMock = vi.hoisted(() => ({ randomInt: vi.fn() }));
vi.mock('node:crypto', async (importOriginal) => ({
  ...await importOriginal(),
  ...cryptoMock,
}));

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: { path },
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const querySnapshot = (path: string) => ({
    docs: [...documents.keys()]
      .filter((candidate) => candidate.startsWith(`${path}/`) &&
        !candidate.slice(path.length + 1).includes('/'))
      .map((candidate) => snapshot(candidate)),
  });
  const ref = (path: string) => ({
    path,
    id: path.split('/').at(-1) ?? '',
    get: async () => snapshot(path),
  });
  const collection = (path: string) => ({ path, get: async () => querySnapshot(path) });
  const get = vi.fn(async (target: { path: string }) =>
    target.path.endsWith('/fleetGroups') || target.path.endsWith('/players') ||
      target.path.endsWith('/shuttleDepartures') || target.path.endsWith('/shuttleTransitChains')
      ? querySnapshot(target.path)
      : snapshot(target.path));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const rateLimitSet = vi.fn();
  const remove = vi.fn((target: { path: string }) => documents.delete(target.path));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set: (target: { path: string }, ...args: unknown[]) =>
      target.path.includes('/serverState/callableRateLimit-')
        ? rateLimitSet(target, ...args) : set(target, ...args), delete: remove }));
  return { documents, get, update, set, rateLimitSet, remove, runTransaction, db: { doc: ref, collection, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({
    run: maybeHandler ?? optionsOrHandler,
  }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import {
  advanceTurn,
  advanceWolfAttackToLongRange,
  declareWolfAttack,
  extendAirspaceWindow,
  finishWolfCommanderTargetingRerolls,
  getDioneMaliadesLaunch,
  getPdfEscortWingLaunch,
  launchDioneMaliades,
  launchPdfEscortWing,
  passWolfFighterLaunchChoice,
  setEmergencyTimerPaused,
} from './index';
import { parseMaliadesState, resolveMaliadesMedium as resolveMaliadesStateMedium,
  resolveMaliadesShort as resolveMaliadesStateShort } from './maliadesState';
import { initialFighterWingCounts } from './fighterWings';
import { initialShuttleDockingsForRoles } from './shuttlecraft';

const firstTurnCards = [
  ...Array<string>(10).fill('wolf-fighter-wing'),
  ...Array<string>(5).fill('wolf-assault-transport'),
];
const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'wolf-declare-1',
  expectedRevision: 1,
};
const activeRoleIds = [
  'admiral', 'wing-commander', 'dione-engineer', 'icebreaker-miner',
  'quellon-explorer', 'shepherd-scientist', 'refinery-124-engineer',
] as const;

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function patchSession(fields: Fields): void {
  put('sessions/s1', { ...mock.documents.get('sessions/s1'), ...fields });
}

function session(fields: Fields = {}): void {
  put('sessions/s1', {
    phase: 'active',
    configurationLocked: true,
    currentTurn: 1,
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    activeRoleIds,
    fighterWingCounts: initialFighterWingCounts(),
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(Date.now() - 2_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    ...fields,
  });
}

function gm(uid = 'u1', instanceId = 'gm-1', fields: Fields = {}): void {
  put(`sessions/s1/players/${uid}`, {
    uid, role: 'gm', connected: true, fleetGroupId: 'fleet-1', ...fields,
  });
  put(`sessions/s1/gmInstances/${instanceId}`, { uid, connected: true, lastSeenAt: new Date(), ...fields });
}

function preparation(fields: Fields = {}): void {
  put('sessions/s1/wolfAttackPreparation/current', {
    turn: 1,
    revision: 1,
    shipIds: firstTurnCards,
    targetMode: 'pre-rolled',
    targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
    modifiers: ['aegis-command-and-control'],
    notes: 'hidden GM note',
    ...fields,
  });
}

function dueWindow(fields: Fields = {}): void {
  put('sessions/s1/wolfAttackWindow/current', { status: 'due', turn: 1, revision: 1, ...fields });
}

function navigation(fields: Fields = {}): void {
  put('sessions/s1/serverState/navigation', {
    revision: 0,
    pursuitGroups: { 'fleet-1': 4 },
    ...fields,
  });
}

function splitFleet(): void {
  fleetGroup('fleet-1', {
    vesselIds: ['aegis', 'dione', 'icebreaker'],
    memberUids: ['u1'],
  });
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, fleetGroupId: 'fleet-2',
  });
  fleetGroup('fleet-2', {
    vesselIds: ['quellon', 'shepherd', 'refinery-124'],
    memberUids: ['u2'],
  });
}

function fleetGroup(id = 'fleet-1', fields: Fields = {}): void {
  put(`sessions/s1/fleetGroups/${id}`, {
    id,
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'],
    memberUids: ['u1'],
    ...fields,
  });
}

function inFlightStarlight(): { departedAt: string; arrivesAt: string } {
  const now = Date.now();
  const departedAt = new Date(now - 30_000).toISOString();
  const arrivesAt = new Date(now + 30_000).toISOString();
  const dockings = initialShuttleDockingsForRoles(activeRoleIds)
    .filter((docking) => docking.shuttleId !== 'starlight');
  session({
    shuttleDockings: dockings,
    shuttleVisitLog: [{
      id: 'starlight-departed', shuttleId: 'starlight', shipId: 'aegis',
      action: 'departed', occurredAt: departedAt,
    }],
  });
  const transit: Fields = {
    status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-1',
    shuttleId: 'starlight', holderUid: 'holder', fleetGroupId: 'fleet-1',
    originShipId: 'aegis', destinationShipId: 'dione', cycle: 1, controlRevision: 2,
    requestedAt: departedAt, revision: 1,
    originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0, y: 0, z: 0 },
    destinationPosition: { x: -0.32, y: 0.18, z: 0.22 },
    velocity: { x: -0.32 / 60, y: 0.18 / 60, z: 0.22 / 60 },
    departedAt, arrivesAt,
  };
  const publicTransit = Object.fromEntries(Object.entries(transit).filter(([key]) =>
    !['originShipId', 'originDepartedAt', 'routeLegs', 'originPosition'].includes(key)));
  put('sessions/s1/shuttleDepartures/starlight', publicTransit);
  put('sessions/s1/shuttleTransitChains/starlight', {
    status: 'in-transit-chain', shuttleId: 'starlight', transitRequestId: 'transit-1',
    revision: 1, originShipId: 'aegis', originDepartedAt: departedAt,
    originPosition: { x: 0, y: 0, z: 0 }, routeLegs: [{
      fromShipId: 'aegis', toShipId: 'dione', originPosition: { x: 0, y: 0, z: 0 },
      destinationPosition: { x: -0.32, y: 0.18, z: 0.22 }, departedAt, arrivesAt,
    }],
  });
  return { departedAt, arrivesAt };
}

function resetFixture(): void {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.rateLimitSet.mockClear();
  mock.remove.mockClear();
  mock.runTransaction.mockClear();
  mock.runTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ get: mock.get, update: mock.update, set: (target: { path: string }, fields: Fields) =>
      target.path.includes('/serverState/callableRateLimit-')
        ? mock.rateLimitSet(target, fields) : mock.set(target, fields), delete: mock.remove }));
  cryptoMock.randomInt.mockImplementation(() => 0);
  session();
  gm();
  preparation();
  dueWindow();
  navigation();
  fleetGroup();
}

beforeEach(resetFixture);
afterEach(() => vi.useRealTimers());

it('atomically locks airspace, snapshots parked craft, records a hidden stage receipt, and emits one safe announcement', async () => {
  const result = await declareWolfAttack.run(request());
  expect(result).toEqual(expect.objectContaining({
    status: 'committed', type: 'wolf-attack-declaration', turn: 1,
    currentStep: 'targeting', airspaceLocked: true, parkedCraftCount: expect.any(Number),
  }));
  expect(mock.documents.get('sessions/s1').turnPhase).toMatchObject({ airspace: { state: 'restricted' } });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toMatchObject({
    status: 'resolved', turn: 1, revision: 2,
  });
  const state = mock.documents.get('sessions/s1/wolfAttackState/current');
  expect(state).toMatchObject({
    type: 'wolf-attack-state', status: 'declared', currentStep: 'targeting',
    preparationRevision: 1, airspaceLocked: true,
    parkingReleaseCondition: 'normal-movement-reopened',
    battleTableCraftActions: [
      { craftId: 'fighter-wing-alpha', kind: 'fighter-wing', ownerRoleId: 'wing-commander' },
      { craftId: 'fighter-wing-bravo', kind: 'fighter-wing', ownerRoleId: 'wing-commander' },
      { craftId: 'maliades', kind: 'shuttle', ownerRoleId: 'dione-engineer' },
      { craftId: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner' },
    ],
    launchedCraftIds: [],
    preparation: { notes: 'hidden GM note' },
    calculationReceipt: {
      type: 'wolf-combat-calculation-stage',
      step: 'targeting',
      pursuitPressure: { navigationRevision: 0, groupValues: { 'fleet-1': 4 } },
    },
  });
  expect(state.parkedCraftIds).toEqual(expect.arrayContaining([
    'snn-press-shuttle', 'starlight', 'philia', 'hummingbird', 'endeavour', 'chacau',
  ]));
  expect(state.battleTableCraftActions.map((action: { craftId: string }) => action.craftId))
    .not.toEqual(expect.arrayContaining([
      'snn-press-shuttle', 'starlight', 'philia', 'hummingbird', 'endeavour',
    ]));
  const event = mock.documents.get('sessions/s1/events/wolf-attack-wolf-declare-1');
  expect(event).toMatchObject({
    type: 'wolf-attack-declared', status: 'declared', currentStep: 'targeting', airspace: 'locked',
  });
  expect(event).not.toHaveProperty('shipIds');
  expect(event).not.toHaveProperty('targetAssignments');
  expect(event).not.toHaveProperty('notes');
  expect(event).not.toHaveProperty('targeting');
  expect(event).not.toHaveProperty('calculationReceipt');
  expect(event).not.toHaveProperty('pursuitPressure');
  expect(event).not.toHaveProperty('damage');
  expect(event).not.toHaveProperty('casualties');
  expect([...mock.documents.keys()].filter((path) => path.includes('/events/'))).toEqual([
    'sessions/s1/events/wolf-attack-wolf-declare-1',
  ]);
});

it('declares against the five configured active vessels in an ordinary eight-player base roster', async () => {
  const eightPlayerRoles = [
    'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
    'quellon-explorer', 'refinery-124-pdf-colonel',
    'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
  ];
  const eightPlayerFleet = ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
  session({
    playerCount: 8, expansion: 'base', dioneEnabled: false,
    activeRoleIds: eightPlayerRoles, activeVesselIds: eightPlayerFleet,
  });
  fleetGroup('fleet-1', { vesselIds: eightPlayerFleet });

  const result = await declareWolfAttack.run(request({ ...baseData, requestId: 'wolf-declare-eight' }));
  const state = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  const targeting = (state.calculationReceipt as Fields).targeting as Fields;

  expect(result).toMatchObject({ status: 'committed', turn: 1 });
  const expectedRing = ['aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124'];
  expect(targeting.ring).toEqual(expectedRing);
  expect((targeting.rolls as Fields[]).every((roll) => expectedRing.includes(roll.target as string))).toBe(true);
  expect(cryptoMock.randomInt.mock.calls.filter(([upperBound]) => upperBound === 5)).toHaveLength(15);
});

it('parks targeting until the admitted charged Gorgoneion Captain records the pre-target choice', async () => {
  session({ smallShipStates: {
    gorgoneion: {
      id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1, population: 1_000, unrest: 0,
      cycle: { step: 5, revision: 5, results: { '1': 'Ready.' },
        charges: ['force-field-projector'], turn: 1 },
    },
  } });
  put('sessions/s1/players/gorg-1', {
    uid: 'gorg-1', role: 'player', connected: true, replacementRoleId: 'gorgoneion-captain',
    replacementStatus: null, fleetGroupId: 'fleet-1',
  });
  fleetGroup('fleet-1', { memberUids: ['u1', 'gorg-1'],
    memberShipIds: { 'u1': 'aegis', 'gorg-1': 'aegis' } });

  await declareWolfAttack.run(request());

  const state = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  expect(state).toMatchObject({ forceFieldChoice: { status: 'pending', configuredCaptainUid: 'gorg-1',
    hostShipId: 'aegis', dockingRevision: 1, fleetGroupId: 'fleet-1' },
    calculationReceipt: { step: 'pre-target-force-field', targetRing: expect.any(Array) } });
  expect(state.calculationReceipt).not.toHaveProperty('targeting');
});

it('advances targeting only after the assigned Commander finishes and preserves the private receipt and deadline', async () => {
  await declareWolfAttack.run(request());
  const declarationState = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  const targetingReceipt = declarationState.calculationReceipt;
  const deadlineAt = declarationState.deadlineAt;
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });

  const advance = (requestId: string, expectedRevision: number, uid = 'u1') => request({
    sessionId: 's1', instanceId: 'gm-1', requestId, expectedTurn: 1, expectedRevision,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  }, uid);
  await expect(advanceWolfAttackToLongRange.run(advance('advance-before-commander', 1)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'targeting', revision: 1 });

  await finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'finish-commander-targeting', expectedTurn: 1, expectedRevision: 1,
  }, 'u2'));
  const readyState = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  const readyRevision = readyState.revision as number;
  const result = await advanceWolfAttackToLongRange.run(advance('advance-targeting', readyRevision));

  expect(result).toEqual(expect.objectContaining({
    status: 'committed', type: 'wolf-attack-stage-advance', sessionId: 's1',
    requestId: 'advance-targeting', turn: 1, revision: readyRevision + 1,
    previousStep: 'targeting', currentStep: 'long-range', deadlineAt,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
    delta: {
      from: { revision: readyRevision, currentStep: 'targeting', deadlineAt },
      to: { revision: readyRevision + 1, currentStep: 'long-range', deadlineAt },
    },
    rollback: { allowed: false },
  }));
  expect(result).not.toHaveProperty('targeting');
  expect(result).not.toHaveProperty('calculationReceipt');
  expect(result).not.toHaveProperty('targetAssignments');
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'long-range', revision: readyRevision + 1, deadlineAt, airspaceLocked: true,
    calculationReceipt: targetingReceipt,
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/advance-targeting'))
    .toMatchObject({
      type: 'wolf-attack-stage-advance', action: 'recovery',
      fromStep: 'targeting', toStep: 'long-range',
      reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
      delta: {
        from: { revision: readyRevision, currentStep: 'targeting', deadlineAt },
        to: { revision: readyRevision + 1, currentStep: 'long-range', deadlineAt },
      },
      rollback: { allowed: false },
    });
  expect(mock.documents.get('sessions/s1/commandReceipts/advance-targeting'))
    .toMatchObject({ result });
  expect([...mock.documents.keys()].filter((path) => path.includes('/events/'))).toEqual([
    'sessions/s1/events/wolf-attack-wolf-declare-1',
  ]);

  const stateUpdateCount = mock.update.mock.calls.filter(([target]) =>
    target.path === 'sessions/s1/wolfAttackState/current').length;
  await expect(advanceWolfAttackToLongRange.run(advance('advance-targeting', readyRevision)))
    .resolves.toEqual(result);
  expect(mock.update.mock.calls.filter(([target]) =>
    target.path === 'sessions/s1/wolfAttackState/current')).toHaveLength(stateUpdateCount);
  await expect(advanceWolfAttackToLongRange.run(advance('advance-targeting', readyRevision, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('rejects client outcomes, a stale GM instance, and a stale targeting revision without writes', async () => {
  await declareWolfAttack.run(request());
  const validRequest = {
    sessionId: 's1', instanceId: 'gm-1', requestId: 'advance-stale', expectedTurn: 1, expectedRevision: 2,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  };

  await expect(advanceWolfAttackToLongRange.run(request({ ...validRequest, target: 'aegis' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u2', connected: true, lastSeenAt: new Date() });
  await expect(advanceWolfAttackToLongRange.run(request(validRequest)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  gm();
  await expect(advanceWolfAttackToLongRange.run(request(validRequest)))
    .rejects.toMatchObject({ code: 'failed-precondition' });

  expect(mock.documents.get('sessions/s1/wolfAttackState/current'))
    .toMatchObject({ currentStep: 'targeting', revision: 1 });
  expect(mock.documents.has('sessions/s1/commandReceipts/advance-stale')).toBe(false);
  expect(mock.documents.has('sessions/s1/wolfAttackState/current/audit/advance-stale')).toBe(false);
});

it('does not advance targeting while the current emergency timer is paused', async () => {
  await declareWolfAttack.run(request());
  const session = mock.documents.get('sessions/s1')!;
  put('sessions/s1', {
    ...session,
    turnPhase: {
      ...session.turnPhase as Fields,
      timerPause: {
        window: 'restricted', remainingMs: 60_000,
        pausedAt: '2026-09-24T19:00:00.000Z',
      },
    },
  });
  const stateBefore = structuredClone(mock.documents.get('sessions/s1/wolfAttackState/current'));

  await expect(advanceWolfAttackToLongRange.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'advance-paused',
    expectedTurn: 1, expectedRevision: 1,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toEqual(stateBefore);
  expect(mock.documents.has('sessions/s1/commandReceipts/advance-paused')).toBe(false);
  expect(mock.documents.has('sessions/s1/wolfAttackState/current/audit/advance-paused')).toBe(false);
});

it('requires a reason and danger confirmation, then replays only the same scoped recovery', async () => {
  await declareWolfAttack.run(request());
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });
  await finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'finish-recovery-targeting', expectedTurn: 1, expectedRevision: 1,
  }, 'u2'));
  const readyRevision = mock.documents.get('sessions/s1/wolfAttackState/current')!.revision as number;
  const payload = {
    sessionId: 's1', instanceId: 'gm-1', requestId: 'reasoned-recovery',
    expectedTurn: 1, expectedRevision: readyRevision,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  };

  await expect(advanceWolfAttackToLongRange.run(request({ ...payload, reason: '  ' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(advanceWolfAttackToLongRange.run(request({ ...payload, dangerConfirmed: false })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.documents.has('sessions/s1/commandReceipts/reasoned-recovery')).toBe(false);

  const committed = await advanceWolfAttackToLongRange.run(request(payload));
  const stateWriteCount = mock.update.mock.calls.filter(([target]) =>
    target.path === 'sessions/s1/wolfAttackState/current').length;
  await expect(advanceWolfAttackToLongRange.run(request(payload))).resolves.toEqual(committed);
  expect(mock.update.mock.calls.filter(([target]) =>
    target.path === 'sessions/s1/wolfAttackState/current')).toHaveLength(stateWriteCount);
  await expect(advanceWolfAttackToLongRange.run(request({
    ...payload, reason: 'The GM supplied a different recovery reason.',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/reasoned-recovery'))
    .toMatchObject({
      actorUid: 'u1', requestId: 'reasoned-recovery', reason: payload.reason,
      dangerConfirmed: true,
      delta: {
        from: { revision: readyRevision, currentStep: 'targeting' },
        to: { revision: readyRevision + 1, currentStep: 'long-range' },
      },
    });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/reasoned-recovery'))
    .not.toHaveProperty('calculationReceipt');
});

it('rejects a stored recovery receipt whose nested revision or rollback delta is malformed', async () => {
  await declareWolfAttack.run(request());
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });
  await finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'finish-malformed-recovery', expectedTurn: 1, expectedRevision: 1,
  }, 'u2'));
  const readyRevision = mock.documents.get('sessions/s1/wolfAttackState/current')!.revision as number;
  const payload = {
    sessionId: 's1', instanceId: 'gm-1', requestId: 'malformed-recovery-receipt',
    expectedTurn: 1, expectedRevision: readyRevision,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  };
  await advanceWolfAttackToLongRange.run(request(payload));

  const receiptPath = `sessions/s1/commandReceipts/${payload.requestId}`;
  const stored = mock.documents.get(receiptPath)!;
  const result = structuredClone(stored.result) as Fields;
  const delta = result.delta as Fields;
  const from = delta.from as Fields;
  result.delta = {
    ...delta,
    from: { ...from, revision: (from.revision as number) + 1, injected: true },
  };
  result.rollback = { allowed: false, scope: 'all-prior-results' };
  put(receiptPath, { ...stored, result });
  const stateWriteCount = mock.update.mock.calls.filter(([target]) =>
    target.path === 'sessions/s1/wolfAttackState/current').length;

  await expect(advanceWolfAttackToLongRange.run(request(payload)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update.mock.calls.filter(([target]) =>
    target.path === 'sessions/s1/wolfAttackState/current')).toHaveLength(stateWriteCount);
});

it('rejects a reasoned recovery after the authoritative Coordination deadline', async () => {
  await declareWolfAttack.run(request());
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });
  await finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'finish-expired-recovery', expectedTurn: 1, expectedRevision: 1,
  }, 'u2'));
  const phase = mock.documents.get('sessions/s1')!.turnPhase as Fields;
  const expiredDeadline = phase.openAirspaceEndsAt as string;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.parse(expiredDeadline) + 1));
  gm();
  const stateBefore = structuredClone(mock.documents.get('sessions/s1/wolfAttackState/current'));

  await expect(advanceWolfAttackToLongRange.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'recovery-after-deadline',
    expectedTurn: 1, expectedRevision: 2,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toEqual(stateBefore);
  expect(mock.documents.has('sessions/s1/commandReceipts/recovery-after-deadline')).toBe(false);
  expect(mock.documents.has('sessions/s1/wolfAttackState/current/audit/recovery-after-deadline')).toBe(false);
});

it('requires reasoned revision-bound replay for emergency pause and resume during an attack', async () => {
  session({
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(Date.now() + 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 120_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  });
  await declareWolfAttack.run(request());
  const pause = {
    sessionId: 's1', instanceId: 'gm-1', requestId: 'attack-clock-pause',
    expectedTurn: 1, expectedAttackRevision: 1, paused: true,
    reason: 'Hold targeting while checking the current player choice.', dangerConfirmed: true,
  };
  await expect(setEmergencyTimerPaused.run(request({ ...pause, reason: '' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(setEmergencyTimerPaused.run(request({ ...pause, dangerConfirmed: false })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.documents.has('sessions/s1/commandReceipts/attack-clock-pause')).toBe(false);

  const paused = await setEmergencyTimerPaused.run(request(pause));
  expect(paused).toMatchObject({
    status: 'committed', type: 'wolf-attack-timer-intervention', action: 'paused',
    sessionId: 's1', requestId: pause.requestId, turn: 1, revision: 2,
    reason: pause.reason, dangerConfirmed: true,
    delta: {
      from: { attackRevision: 1, timerPause: null },
      to: { attackRevision: 2, timerPause: { window: 'restricted' } },
    },
    rollback: { allowed: false },
  });
  const stateWriteCount = mock.update.mock.calls.filter(([target]) =>
    target.path === 'sessions/s1/wolfAttackState/current').length;
  await expect(setEmergencyTimerPaused.run(request(pause))).resolves.toEqual(paused);
  expect(mock.update.mock.calls.filter(([target]) =>
    target.path === 'sessions/s1/wolfAttackState/current')).toHaveLength(stateWriteCount);
  await expect(setEmergencyTimerPaused.run(request({
    ...pause, reason: 'The facilitator changed the reason under one request key.',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  const resume = {
    ...pause,
    requestId: 'attack-clock-resume',
    expectedAttackRevision: 2,
    paused: false,
    reason: 'Resume the shared Coordination clock after review.',
  };
  const resumed = await setEmergencyTimerPaused.run(request(resume));
  expect(resumed).toMatchObject({
    status: 'committed', action: 'resumed', revision: 3,
    delta: {
      from: { attackRevision: 2, timerPause: { window: 'restricted' } },
      to: { attackRevision: 3, timerPause: null },
    },
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/attack-clock-pause'))
    .toMatchObject({
      actorUid: 'u1', requestId: pause.requestId, reason: pause.reason,
      delta: { from: { attackRevision: 1 }, to: { attackRevision: 2 } },
    });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/attack-clock-resume'))
    .toMatchObject({
      actorUid: 'u1', requestId: resume.requestId, reason: resume.reason,
      delta: { from: { attackRevision: 2 }, to: { attackRevision: 3 } },
    });
});

it('rejects an attack-clock intervention from a stale attack revision without a receipt', async () => {
  await declareWolfAttack.run(request());
  const before = structuredClone(mock.documents.get('sessions/s1/wolfAttackState/current'));
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'stale-attack-clock-pause',
    expectedTurn: 1, expectedAttackRevision: 2, paused: true,
    reason: 'Hold the attack while checking the timing.', dangerConfirmed: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toEqual(before);
  expect(mock.documents.has('sessions/s1/commandReceipts/stale-attack-clock-pause')).toBe(false);
  expect(mock.documents.has('sessions/s1/wolfAttackState/current/audit/stale-attack-clock-pause')).toBe(false);
});

it('denies ordinary timer extension and cycle-skip controls while an attack is declared', async () => {
  session();
  gm();
  preparation();
  dueWindow();
  navigation();
  fleetGroup();
  await declareWolfAttack.run(request());
  const currentPhase = mock.documents.get('sessions/s1')!.turnPhase as Fields;
  patchSession({
    turnPhase: {
      ...currentPhase,
      teamPhaseEndsAt: new Date(Date.now() + 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 120_000).toISOString(),
    },
  });
  const phaseBefore = structuredClone(mock.documents.get('sessions/s1')!.turnPhase);
  const attackBefore = structuredClone(mock.documents.get('sessions/s1/wolfAttackState/current'));
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'gm-1', expectedTurn: 1, window: 'restricted',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/attack.*server|server.*attack/i),
  });
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'skip-during-wolf-attack',
    expectedTurn: 1, overridePhaseTimer: true, skipTurnStartAnnouncement: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/attack.*server|server.*attack/i),
  });

  expect(mock.documents.get('sessions/s1')!.turnPhase).toEqual(phaseBefore);
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toEqual(attackBefore);
  expect(mock.documents.has('sessions/s1/commandReceipts/skip-during-wolf-attack')).toBe(false);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('keeps the declaration clock authoritative and rejects post-declaration extension', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T19:00:00.000Z'));
  session({
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-24T18:59:58.000Z',
      openAirspaceEndsAt: '2026-09-24T19:01:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  });
  await declareWolfAttack.run(request());
  const declarationDeadline = mock.documents.get('sessions/s1/wolfAttackState/current')?.deadlineAt;
  const phaseBefore = structuredClone(mock.documents.get('sessions/s1')!.turnPhase);
  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'gm-1', expectedTurn: 1, window: 'restricted',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/attack.*server|server.*attack/i),
  });
  const currentDeadline = (mock.documents.get('sessions/s1')!.turnPhase as Fields).openAirspaceEndsAt;
  expect(currentDeadline).toBe(declarationDeadline);

  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });
  await finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'finish-locked-clock-targeting', expectedTurn: 1, expectedRevision: 1,
  }, 'u2'));
  const readyState = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  const readyRevision = readyState.revision as number;

  await expect(advanceWolfAttackToLongRange.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'advance-locked-clock-stale',
    expectedTurn: 1, expectedRevision: readyRevision - 1,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/commandReceipts/advance-locked-clock-stale')).toBe(false);
  expect(mock.documents.has('sessions/s1/wolfAttackState/current/audit/advance-locked-clock-stale')).toBe(false);

  const result = await advanceWolfAttackToLongRange.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'advance-after-locked-clock',
    expectedTurn: 1, expectedRevision: readyRevision,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  }));
  expect(result).toMatchObject({ currentStep: 'long-range', deadlineAt: currentDeadline });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'long-range', deadlineAt: currentDeadline,
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/advance-after-locked-clock'))
    .toMatchObject({ deadlineAt: currentDeadline });
  expect(mock.documents.get('sessions/s1/commandReceipts/advance-after-locked-clock'))
    .toMatchObject({ result: expect.objectContaining({ deadlineAt: currentDeadline }) });
  expect(mock.documents.get('sessions/s1')!.turnPhase).toEqual(phaseBefore);
});

it('uses the resumed server-owned airspace deadline and rejects a paused advance without writes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T19:00:00.000Z'));
  session({
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-24T18:59:58.000Z',
      openAirspaceEndsAt: '2026-09-24T19:01:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  });
  await declareWolfAttack.run(request());
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, replacementRoleId: 'wolf-commander',
  });
  await finishWolfCommanderTargetingRerolls.run(request({
    sessionId: 's1', requestId: 'finish-resume-targeting', expectedTurn: 1, expectedRevision: 1,
  }, 'u2'));
  const declarationDeadline = mock.documents.get('sessions/s1/wolfAttackState/current')?.deadlineAt;

  await setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resume-path-pause', expectedTurn: 1,
    expectedAttackRevision: 2, paused: true,
    reason: 'Hold the attack while verifying the current deadline.', dangerConfirmed: true,
  }));
  mock.update.mockClear();
  const stateWhilePaused = structuredClone(mock.documents.get('sessions/s1/wolfAttackState/current'));
  await expect(advanceWolfAttackToLongRange.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'advance-while-paused',
    expectedTurn: 1, expectedRevision: 3,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toEqual(stateWhilePaused);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.documents.has('sessions/s1/commandReceipts/advance-while-paused')).toBe(false);
  expect(mock.documents.has('sessions/s1/wolfAttackState/current/audit/advance-while-paused')).toBe(false);

  vi.setSystemTime(new Date('2026-09-24T19:02:00.000Z'));
  await setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resume-path-resume', expectedTurn: 1,
    expectedAttackRevision: 3, paused: false,
    reason: 'Resume the attack after verifying the current deadline.', dangerConfirmed: true,
  }));
  const resumedDeadline = mock.documents.get('sessions/s1')?.turnPhase &&
    (mock.documents.get('sessions/s1')?.turnPhase as Fields).openAirspaceEndsAt;
  expect(resumedDeadline).toBe('2026-09-24T19:03:00.000Z');
  expect(declarationDeadline).not.toBe(resumedDeadline);

  mock.update.mockClear();
  const result = await advanceWolfAttackToLongRange.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'advance-after-resume',
    expectedTurn: 1, expectedRevision: 4,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  }));
  expect(result).toMatchObject({ currentStep: 'long-range', deadlineAt: resumedDeadline });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    currentStep: 'long-range', deadlineAt: resumedDeadline,
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/advance-after-resume'))
    .toMatchObject({ deadlineAt: resumedDeadline });
  expect(mock.documents.get('sessions/s1/commandReceipts/advance-after-resume'))
    .toMatchObject({ result: expect.objectContaining({ deadlineAt: resumedDeadline }) });
});

it('does not overwrite a private targeting audit when its command receipt is missing', async () => {
  await declareWolfAttack.run(request());
  const audit = { type: 'prior-private-action', requestId: 'advance-audit-collision' };
  put('sessions/s1/wolfAttackState/current/audit/advance-audit-collision', audit);
  const stateBefore = structuredClone(mock.documents.get('sessions/s1/wolfAttackState/current'));

  await expect(advanceWolfAttackToLongRange.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'advance-audit-collision',
    expectedTurn: 1, expectedRevision: 1,
    reason: 'Recover the already-completed targeting step.', dangerConfirmed: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toEqual(stateBefore);
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/advance-audit-collision')).toEqual(audit);
  expect(mock.documents.has('sessions/s1/commandReceipts/advance-audit-collision')).toBe(false);
});

async function declareThenSeatDioneEngineer(fields: Fields = {}): Promise<void> {
  await declareWolfAttack.run(request());
  put('sessions/s1', {
    ...mock.documents.get('sessions/s1'),
    maintenanceCycles: {
      dione: {
        turn: 1, step: 7, revision: 4,
        results: { '5': 'Reactor powered up. Previous unused charge lost. Charged 1/4 consoles.' },
        charges: ['fighter-bay'], refuelled: [],
      },
    },
    shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
    ...fields,
  });
  put('sessions/s1/players/u1', {
    uid: 'u1', role: 'player', connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: 'dione-engineer', seatId: 'dione-engineer',
    activeConsoleRoleId: 'dione-engineer',
  });
}

async function declareThenSeatPdfColonel(options: Readonly<{
  charges?: readonly string[];
  damage?: Readonly<{ damagedSystemIds: readonly string[]; destroyed: boolean }>;
}> = {}): Promise<void> {
  const pdfRole = 'refinery-124-pdf-colonel';
  session({ activeRoleIds: [...activeRoleIds, pdfRole] });
  await declareWolfAttack.run(request());
  const currentSession = mock.documents.get('sessions/s1')!;
  put('sessions/s1', {
    ...currentSession,
    maintenanceCycles: {
      'refinery-124': {
        turn: 1, step: 0, revision: 9,
        results: { '5': 'Reactor powered up. Charged 1/4 consoles.', '7': 'Maintenance cycle complete.' },
        charges: options.charges ?? ['fighter-bay'], refuelled: [],
        completedAt: '2026-09-22T12:00:00.000Z',
      },
    },
    shipDamage: {
      'refinery-124': options.damage ?? { damagedSystemIds: [], destroyed: false },
    },
  });
  put('sessions/s1/players/u1', {
    uid: 'u1', role: 'player', connected: true,
    assignedRoleId: pdfRole, seatId: pdfRole, activeConsoleRoleId: pdfRole,
  });
}

it('launches the PDF Escort Wing through the current Wolf attack and charged Refinery bay transaction', async () => {
  const pdfRole = 'refinery-124-pdf-colonel';
  await declareThenSeatPdfColonel();

  const attack = mock.documents.get('sessions/s1/wolfAttackState/current');
  expect(attack?.battleTableCraftActions).toContainEqual({
    craftId: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: pdfRole,
  });
  expect(mock.documents.get('sessions/s1/serverState/pdfEscortWing')).toMatchObject({
    type: 'pdf-escort-fighter-wing-state',
    attackId: 'wolf-attack-wolf-declare-1', attackCycle: 1,
    capacity: 4, fighters: 4, revision: 0, launched: false,
  });

  await expect(getPdfEscortWingLaunch.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    type: 'pdf-escort-wing-launch-view', turn: 1, revision: 1,
    wingRevision: 0, launched: false, eligible: true,
  });
  const launchRequest = {
    sessionId: 's1', requestId: 'launch-pdf-1', expectedTurn: 1,
    expectedRevision: 1, expectedWingRevision: 0,
  };
  await expect(launchPdfEscortWing.run(request(launchRequest))).resolves.toMatchObject({
    status: 'committed', type: 'pdf-escort-wing-launch-view', turn: 1,
    revision: 2, wingRevision: 1, launched: true, eligible: false,
    reason: 'already-launched',
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    revision: 2, launchedCraftIds: ['pdf-escort-fighter-wing'],
  });
  expect(mock.documents.get('sessions/s1/serverState/pdfEscortWing')).toMatchObject({
    attackId: 'wolf-attack-wolf-declare-1', attackCycle: 1,
    revision: 1, launched: true, fighters: 4,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    pdfEscortWing: {
      type: 'pdf-escort-fighter-wing-view', cycle: 1, revision: 1,
      capacity: 4, fighters: 4, launched: true, losses: 0,
    },
  });
  expect(mock.documents.get('sessions/s1')).not.toHaveProperty('pdfEscortWing.attackId');
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/launch-pdf-1'))
    .toMatchObject({ craftId: 'pdf-escort-fighter-wing', actorRoleId: pdfRole, revision: 2 });

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(launchPdfEscortWing.run(request(launchRequest))).resolves.toMatchObject({
    status: 'replayed', revision: 2, wingRevision: 1, launched: true,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('records an explicit PDF fighter pass once and exposes the durable choice on retry', async () => {
  await declareThenSeatPdfColonel();
  const payload = {
    sessionId: 's1', requestId: 'pass-pdf-launch-1', sourceId: 'pdf-escort-fighter-wing',
    expectedTurn: 1, expectedRevision: 1, expectedWingRevision: 0,
  };

  await expect(passWolfFighterLaunchChoice.run(request(payload))).resolves.toMatchObject({
    status: 'committed', type: 'wolf-fighter-launch-choice', sourceId: 'pdf-escort-fighter-wing',
    choiceStatus: 'passed', turn: 1, revision: 2,
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    fighterLaunchChoices: {
      'pdf-escort-fighter-wing': {
        sourceId: 'pdf-escort-fighter-wing', status: 'passed', turn: 1,
        attackId: 'wolf-attack-wolf-declare-1', revision: 2,
        actorUid: 'u1', actorRoleId: 'refinery-124-pdf-colonel', requestId: payload.requestId,
      },
    },
  });
  await expect(getPdfEscortWingLaunch.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    choiceStatus: 'passed', eligible: false, reason: 'passed',
  });

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(passWolfFighterLaunchChoice.run(request(payload))).resolves.toMatchObject({
    status: 'replayed', choiceStatus: 'passed', revision: 2,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies fresh PDF launch while Refinery 124 is in mutiny', async () => {
  await declareThenSeatPdfColonel();
  mock.documents.get('sessions/s1')!.shipUnrest = { 'refinery-124': 8 };
  await expect(getPdfEscortWingLaunch.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(launchPdfEscortWing.run(request({
    sessionId: 's1', requestId: 'launch-pdf-mutiny', expectedTurn: 1,
    expectedRevision: 1, expectedWingRevision: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/serverState/pdfEscortWing')).toMatchObject({ launched: false });
});

it('rejects a non-Colonel and a stale P.D.F. launch view without writes', async () => {
  await declareThenSeatPdfColonel();
  const view = await getPdfEscortWingLaunch.run(request({ sessionId: 's1' }));
  const launchRequest = {
    sessionId: 's1', requestId: 'launch-pdf-wrong-actor', expectedTurn: 1,
    expectedRevision: view.revision, expectedWingRevision: view.wingRevision,
  };
  mock.documents.set('sessions/s1/players/u1', {
    ...mock.documents.get('sessions/s1/players/u1'), activeConsoleRoleId: 'refinery-124-engineer',
  });
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(launchPdfEscortWing.run(request(launchRequest)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.documents.set('sessions/s1/players/u1', {
    ...mock.documents.get('sessions/s1/players/u1'), activeConsoleRoleId: 'refinery-124-pdf-colonel',
  });
  await expect(launchPdfEscortWing.run(request({
    ...launchRequest, requestId: 'launch-pdf-stale', expectedRevision: view.revision + 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.documents.has('sessions/s1/commandReceipts/launch-pdf-stale')).toBe(false);
});

it.each([
  ['uncharged', { charges: [] }, 'uncharged'],
  ['damaged bay', { damage: { damagedSystemIds: ['fighter-bay'], destroyed: false } }, 'damaged'],
] as const)('denies a P.D.F. launch when the Refinery Fighter Bay is %s', async (_label, options, reason) => {
  await declareThenSeatPdfColonel(options);
  const view = await getPdfEscortWingLaunch.run(request({ sessionId: 's1' }));
  expect(view).toMatchObject({ eligible: false, reason });
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(launchPdfEscortWing.run(request({
    sessionId: 's1', requestId: `launch-pdf-${reason}`, expectedTurn: 1,
    expectedRevision: view.revision, expectedWingRevision: view.wingRevision,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('fails closed when no PDF Escort Wing fighters remain to launch', async () => {
  await declareThenSeatPdfColonel();
  const hiddenPath = 'sessions/s1/serverState/pdfEscortWing';
  const state = mock.documents.get(hiddenPath)!;
  mock.documents.set(hiddenPath, { ...state, revision: 1, fighters: 0, losses: 4 });

  const view = await getPdfEscortWingLaunch.run(request({ sessionId: 's1' }));
  expect(view).toMatchObject({ eligible: false, launched: false, reason: 'no-fighters' });
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(launchPdfEscortWing.run(request({
    sessionId: 's1', requestId: 'launch-pdf-empty', expectedTurn: 1,
    expectedRevision: view.revision, expectedWingRevision: view.wingRevision,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('lets only the active Dione Engineer launch Maliades from a charged operational 10♦ bay', async () => {
  await declareThenSeatDioneEngineer();
  await expect(getDioneMaliadesLaunch.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    type: 'dione-maliades-launch-view', turn: 1, revision: 1,
    launched: false, eligible: true,
  });

  const launchRequest = {
    sessionId: 's1', requestId: 'launch-maliades-1', expectedTurn: 1, expectedRevision: 1,
  };
  await expect(launchDioneMaliades.run(request(launchRequest))).resolves.toMatchObject({
    status: 'committed', turn: 1, revision: 2, launched: true,
    eligible: false, reason: 'already-launched',
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    revision: 2, launchedCraftIds: ['maliades'],
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current/audit/launch-maliades-1'))
    .toMatchObject({ craftId: 'maliades', actorRoleId: 'dione-engineer', revision: 2 });
  expect(mock.documents.get('sessions/s1/events/maliades-launch-launch-maliades-1'))
    .toMatchObject({ type: 'maliades-launched', craftId: 'maliades', status: 'launched', revision: 2 });
  expect(mock.documents.get('sessions/s1/events/maliades-launch-launch-maliades-1'))
    .not.toHaveProperty('actorRoleId');

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(launchDioneMaliades.run(request(launchRequest))).resolves.toMatchObject({
    status: 'replayed', revision: 2, launched: true,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies a fresh Maliades launch while Dione is in mutiny', async () => {
  await declareThenSeatDioneEngineer();
  mock.documents.get('sessions/s1')!.shipUnrest = { dione: 8 };
  await expect(getDioneMaliadesLaunch.run(request({ sessionId: 's1' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(launchDioneMaliades.run(request({
    sessionId: 's1', requestId: 'launch-maliades-mutiny', expectedTurn: 1, expectedRevision: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1')?.maliadesState).toMatchObject({ launched: false });
});

it('resets only per-attack Maliades action records across declarations while preserving durability', async () => {
  await declareThenSeatDioneEngineer({
    shuttleControl: {
      maliades: {
        shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'u1', holderUid: 'u1', revision: 1,
      },
    },
  });
  await expect(launchDioneMaliades.run(request({
    sessionId: 's1', requestId: 'lifecycle-launch-1', expectedTurn: 1, expectedRevision: 1,
  }))).resolves.toMatchObject({ status: 'committed', maliadesRevision: 2 });
  const launchedState = parseMaliadesState(mock.documents.get('sessions/s1').maliadesState);
  expect(launchedState).not.toBeNull();
  const priorMedium = resolveMaliadesStateMedium(launchedState!, {
    expectedRevision: 2, attackId: 'wolf-attack-wolf-declare-1', attackCycle: 1,
    choices: [{ kind: 'attack', targetId: 'wolf-cruiser' }], random: () => 0,
  });
  const priorShort = resolveMaliadesStateShort(priorMedium.state, {
    expectedRevision: 3, attackId: 'wolf-attack-wolf-declare-1', attackCycle: 1,
    targetIds: ['wolf-destroyer'], random: () => 1,
  });
  // Seed a valid state-domain result because no production lifecycle currently reaches range actions.
  patchSession({ maliadesState: priorShort.state });
  const firstState = mock.documents.get('sessions/s1').maliadesState as Fields;
  expect(firstState).toMatchObject({
    attackId: 'wolf-attack-wolf-declare-1', launched: true, damage: 1,
    medium: { attack: { targetId: 'wolf-cruiser', die: 1, hit: false, selfDamage: 1 } },
    short: { rolls: [{ targetId: 'wolf-destroyer', die: 2, hit: true, selfDamage: 0 }], selfDamage: 0 },
  });

  // The lifecycle owner removes the resolved declaration before the next cycle;
  // the new declaration transaction is responsible for resetting Maliades' per-attack fields.
  mock.documents.delete('sessions/s1/wolfAttackState/current');
  gm();
  patchSession({
    currentTurn: 2,
    turnPhase: {
      turn: 2, teamPhaseEndsAt: new Date(Date.now() - 2_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  });
  put('sessions/s1/wolfAttackWindow/current', { status: 'due', turn: 2, revision: 3 });
  put('sessions/s1/wolfAttackPreparation/current', {
    turn: 2, revision: 2, shipIds: firstTurnCards, targetMode: 'pre-rolled',
    targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }], modifiers: ['aegis-command-and-control'], notes: 'second attack',
  });
  await expect(declareWolfAttack.run(request({
    ...baseData, requestId: 'wolf-declare-2', expectedRevision: 2,
  }))).resolves.toMatchObject({ status: 'committed', turn: 2 });
  expect(mock.documents.get('sessions/s1').maliadesState).toMatchObject({
    attackId: 'wolf-attack-wolf-declare-2', attackCycle: 2, launched: false,
    damage: firstState.damage, medium: null, short: null,
  });

  put('sessions/s1', {
    ...mock.documents.get('sessions/s1'),
    maintenanceCycles: {
      dione: {
        turn: 2, step: 7, revision: 4,
        results: { '5': 'Reactor powered up. Previous unused charge lost. Charged 1/4 consoles.' },
        charges: ['fighter-bay'], refuelled: [],
      },
    },
    shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
  });
  put('sessions/s1/players/u1', {
    uid: 'u1', role: 'player', connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: 'dione-engineer', seatId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer',
  });
  const secondWolfState = mock.documents.get('sessions/s1/wolfAttackState/current') as Fields;
  const secondDeclarationState = mock.documents.get('sessions/s1').maliadesState as Fields;
  expect(secondDeclarationState).toMatchObject({
    attackId: 'wolf-attack-wolf-declare-2', attackCycle: 2, launched: false,
    damage: firstState.damage, medium: null, short: null,
  });
  expect(secondWolfState.maliadesRangeEffects).toEqual({
    attackId: 'wolf-attack-wolf-declare-2', cycle: 2, medium: null, short: null,
  });
  await expect(launchDioneMaliades.run(request({
    sessionId: 's1', requestId: 'lifecycle-launch-2', expectedTurn: 2,
    expectedRevision: secondWolfState.revision as number,
  }))).resolves.toMatchObject({ status: 'committed', maliadesRevision: 6 });
  expect(mock.documents.get('sessions/s1').maliadesState).toMatchObject({
    attackId: 'wolf-attack-wolf-declare-2', launched: true, damage: firstState.damage,
    medium: null, short: null,
  });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current') as Fields)
    .toMatchObject({ currentStep: 'targeting', maliadesRangeEffects: { medium: null, short: null } });
});

it('blocks a destroyed Maliades from the next attack launch view', async () => {
  await declareThenSeatDioneEngineer();
  patchSession({
    maliadesState: {
      revision: 2, attackId: 'wolf-attack-wolf-declare-1', attackCycle: 1,
      launched: false, damage: 3, destroyed: true, medium: null, short: null,
    },
  });
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(getDioneMaliadesLaunch.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    launched: false, eligible: false, reason: 'destroyed',
  });
  await expect(launchDioneMaliades.run(request({
    sessionId: 's1', requestId: 'destroyed-maliades', expectedTurn: 1, expectedRevision: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies stale, uncharged, damaged, malformed, and non-Engineer Maliades launches without writes', async () => {
  const cases: Array<{
    name: string;
    mutate: () => void;
    expected: RegExp;
    data?: Record<string, unknown>;
  }> = [
    {
      name: 'stale', mutate: () => {}, expected: /stale/i,
      data: { sessionId: 's1', requestId: 'launch-stale', expectedTurn: 1, expectedRevision: 99 },
    },
    {
      name: 'uncharged', mutate: () => patchSession({
        maintenanceCycles: { dione: {
          turn: 1, step: 7, revision: 4,
          results: { '5': 'Reactor powered up. Previous unused charge lost. Charged 0/4 consoles.' },
          charges: [], refuelled: [],
        } },
        shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
      }), expected: /charge.*Fighter Bay/i,
    },
    {
      name: 'damaged', mutate: () => patchSession({
        maintenanceCycles: { dione: {
          turn: 1, step: 7, revision: 4,
          results: { '5': 'Reactor powered up. Previous unused charge lost. Charged 1/4 consoles.' },
          charges: ['fighter-bay'], refuelled: [],
        } },
        shipDamage: { dione: { damagedSystemIds: ['fighter-bay'], destroyed: false } },
      }), expected: /damaged/i,
    },
    {
      name: 'malformed damage', mutate: () => patchSession({
        maintenanceCycles: { dione: {
          turn: 1, step: 7, revision: 4,
          results: { '5': 'Reactor powered up. Previous unused charge lost. Charged 1/4 consoles.' },
          charges: ['fighter-bay'], refuelled: [],
        } },
        shipDamage: { dione: { damagedSystemIds: 'clear', destroyed: false } },
      }), expected: /damage authority.*malformed/i,
    },
    {
      name: 'malformed launch ledger', mutate: () => put('sessions/s1/wolfAttackState/current', {
        ...mock.documents.get('sessions/s1/wolfAttackState/current'),
        launchedCraftIds: ['not-a-declared-action'],
      }), expected: /cannot authorize/i,
    },
    {
      name: 'wrong role', mutate: () => put('sessions/s1/players/u1', {
        uid: 'u1', role: 'player', connected: true,
        assignedRoleId: 'dione-captain', seatId: 'dione-captain',
        activeConsoleRoleId: 'dione-captain',
      }), expected: /Dione Engineer/i,
    },
    {
      name: 'stale Engineer pointer', mutate: () => put('sessions/s1/players/u1', {
        uid: 'u1', role: 'player', connected: true,
        assignedRoleId: 'dione-captain', seatId: 'dione-captain',
        activeConsoleRoleId: 'dione-engineer',
      }), expected: /Dione Engineer/i,
    },
    {
      name: 'pregame lifecycle', mutate: () => patchSession({ phase: 'briefing' }),
      expected: /active game.*Cycle 0/i,
    },
    {
      name: 'Cycle 0', mutate: () => {
        patchSession({ currentTurn: 0 });
        put('sessions/s1/wolfAttackState/current', {
          ...mock.documents.get('sessions/s1/wolfAttackState/current'), turn: 0,
        });
      }, expected: /active game.*Cycle 0/i,
    },
    {
      name: 'prior-cycle retained charge', mutate: () => patchSession({
        maintenanceCycles: { dione: {
          turn: 1, step: 1, revision: 5, results: {},
          charges: ['fighter-bay'], refuelled: [],
        } },
      }), expected: /maintenance authority.*malformed/i,
    },
    {
      name: 'malformed charge ledger', mutate: () => patchSession({
        maintenanceCycles: { dione: {
          turn: 1, step: 7, revision: 4,
          results: { '5': 'Reactor powered up. Previous unused charge lost. Charged 1/4 consoles.' },
          charges: ['fighter-bay', 7], refuelled: [],
        } },
      }), expected: /maintenance authority.*malformed/i,
    },
  ];
  for (const [index, testCase] of cases.entries()) {
    resetFixture();
    await declareThenSeatDioneEngineer();
    testCase.mutate();
    const stateBefore = structuredClone(mock.documents.get('sessions/s1/wolfAttackState/current'));
    mock.update.mockClear();
    mock.set.mockClear();
    const data = testCase.data ?? {
      sessionId: 's1', requestId: `launch-denied-${index}`, expectedTurn: 1, expectedRevision: 1,
    };
    await expect(launchDioneMaliades.run(request(data))).rejects.toThrow(testCase.expected);
    expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toEqual(stateBefore);
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  }
});

it('rejects every legacy M1 request namespace collision before a Maliades write', async () => {
  const requestId = 'maliades-legacy-collision';
  const legacyPaths = [
    `sessions/s1/setupMutationRequests/${requestId}`,
    `sessions/s1/gmResponsibilityRequests/${requestId}`,
    `sessions/s1/seatMutationRequests/${requestId}`,
    `sessions/s1/loyaltyAssignmentRequests/${requestId}`,
    `sessionStartRequests/s1_${requestId}`,
    `sessions/s1/events/setup-confirm-${requestId}`,
    `sessions/s1/events/gm-responsibility-${requestId}`,
    `sessions/s1/events/start-${requestId}`,
    `sessions/s1/events/seat-claim-${requestId}`,
    `sessions/s1/events/seat-release-${requestId}`,
    `sessions/s1/events/${requestId}`,
    `sessions/s1/events/press-availability-${requestId}`,
  ];

  for (const path of legacyPaths) {
    resetFixture();
    await declareThenSeatDioneEngineer();
    put(path, { legacy: true });
    const stateBefore = structuredClone(mock.documents.get('sessions/s1/wolfAttackState/current'));
    mock.update.mockClear();
    mock.set.mockClear();

    await expect(launchDioneMaliades.run(request({
      sessionId: 's1', requestId, expectedTurn: 1, expectedRevision: 1,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toEqual(stateBefore);
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.documents.has(`sessions/s1/commandReceipts/${requestId}`)).toBe(false);
  }
});

it('retains each authoritative shuttle host until normal movement reopens', async () => {
  const dockings = initialShuttleDockingsForRoles(activeRoleIds).map((docking) =>
    docking.shuttleId === 'starlight'
      ? { ...docking, shipId: 'dione', dockedAt: 'CYCLE 1 // RELOCATED' }
      : docking);
  session({ shuttleDockings: dockings });

  await declareWolfAttack.run(request({ ...baseData, requestId: 'retain-live-hosts' }));

  expect(mock.documents.get('sessions/s1').shuttleDockings).toEqual(dockings);
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    parkingReleaseCondition: 'normal-movement-reopened',
    parkedShuttleDockings: expect.arrayContaining([
      { shuttleId: 'starlight', shipId: 'dione', dockedAt: 'CYCLE 1 // RELOCATED' },
    ]),
  });
});

it('atomically parks an in-flight shuttle at the nearest legal host and clears transit', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now());
  inFlightStarlight();

  await declareWolfAttack.run(request({ ...baseData, requestId: 'park-transit' }));

  expect(mock.documents.get('sessions/s1').shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'starlight', shipId: 'aegis' }),
  ]));
  expect(mock.documents.get('sessions/s1').shuttleVisitLog).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'wolf-attack-park-transit-starlight-docking',
      shuttleId: 'starlight', shipId: 'aegis', action: 'docked',
    }),
  ]));
  expect(mock.documents.has('sessions/s1/shuttleDepartures/starlight')).toBe(false);
  expect(mock.documents.has('sessions/s1/shuttleTransitChains/starlight')).toBe(false);
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    parkingDecisions: expect.arrayContaining([expect.objectContaining({
      craftId: 'starlight', source: 'in-transit', hostShipId: 'aegis',
      tiedHostIds: ['aegis', 'dione'],
    })]),
    parkedShuttleDockings: expect.arrayContaining([
      expect.objectContaining({ shuttleId: 'starlight', shipId: 'aegis' }),
    ]),
  });
  vi.useRealTimers();
});

it('rejects an orphan private transit chain before parking or locking airspace', async () => {
  put('sessions/s1/shuttleTransitChains/starlight', {
    status: 'in-transit-chain', shuttleId: 'starlight', transitRequestId: 'transit-1',
    revision: 1,
  });

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'orphan-chain' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.documents.get('sessions/s1').turnPhase).toMatchObject({
    airspace: { state: 'lifted' },
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
});

it('rejects a private chain paired with a pending departure before any declaration write', async () => {
  put('sessions/s1/shuttleDepartures/starlight', {
    status: 'requested', requestId: 'departure-1', shuttleId: 'starlight',
    holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
    destinationShipId: 'dione', cycle: 1, controlRevision: 2,
    requestedAt: new Date().toISOString(),
  });
  put('sessions/s1/shuttleTransitChains/starlight', {
    status: 'in-transit-chain', shuttleId: 'starlight', transitRequestId: 'transit-1',
    revision: 1,
  });

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'pending-chain' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
});

it('rejects an extra private chain alongside an otherwise valid paired transit', async () => {
  inFlightStarlight();
  put('sessions/s1/shuttleTransitChains/highwall', {
    status: 'in-transit-chain', shuttleId: 'highwall', transitRequestId: 'extra', revision: 1,
  });

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'extra-chain' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
});

it('rejects a private chain whose identity mismatches its paired public transit', async () => {
  inFlightStarlight();
  mock.documents.get('sessions/s1/shuttleTransitChains/starlight')!.transitRequestId = 'forged';

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'mismatched-chain' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
});

it('uses only committed private pursuit authority and rejects malformed or changed snapshots', async () => {
  session({ pursuitGroups: { fleet: 2 } });
  navigation({ revision: 7, pursuitGroups: { 'fleet-1': 6, 'fleet-2': 8 } });
  splitFleet();
  await declareWolfAttack.run(request({ ...baseData, requestId: 'private-pursuit' }));
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    calculationReceipt: {
      pursuitPressure: { navigationRevision: 7, groupValues: { 'fleet-1': 6, 'fleet-2': 8 } },
    },
  });

  resetFixture();
  session({ pursuitGroups: { fleet: 2 } });
  navigation({ pursuitGroups: { 'fleet-1': 6, 'fleet-2': 'bad' } });
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'malformed-pursuit' })))
    .rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/pursuit authority is unavailable or malformed/i),
    });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  resetFixture();
  session({ pursuitGroups: { fleet: 2 } });
  navigation({ revision: 8, pursuitGroups: { 'fleet-1': 6, 'fleet-2': 8 } });
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'orphan-pursuit' })))
    .rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/pursuit authority is unavailable or malformed/i),
    });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  resetFixture();
  session({ pursuitGroups: { fleet: 2 } });
  navigation({ revision: 8, pursuitGroups: { 'fleet-1': 6, 'fleet-2': 8 } });
  splitFleet();
  mock.update.mockClear();
  mock.set.mockClear();
  let transactionCount = 0;
  mock.runTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
    transactionCount += 1;
    if (transactionCount === 2) navigation({ revision: 9, pursuitGroups: { 'fleet-1': 8, 'fleet-2': 8 } });
    return callback({
      get: mock.get,
      update: mock.update,
      set: (target: { path: string }, ...args: unknown[]) => target.path.includes('/serverState/callableRateLimit-')
        ? mock.rateLimitSet(target, ...args) : mock.set(target, ...args),
      delete: mock.remove,
    });
  });
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'changed-pursuit' })))
    .rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/authority or preparation changed/i),
  });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects noncanonical fleet membership before any declaration write', async () => {
  const corruptions = [
    () => {
      navigation({ pursuitGroups: { 'fleet-1': 4, 'fleet-2': 4 } });
    },
    () => {
      navigation({ pursuitGroups: { 'fleet-1': 4, 'fleet-2': 4 } });
      splitFleet();
      fleetGroup('fleet-2', {
        vesselIds: ['icebreaker', 'shepherd', 'refinery-124'],
        memberUids: ['u2'],
      });
    },
    () => {
      fleetGroup('fleet-1', { memberUids: ['missing-player'] });
    },
    () => {
      gm('u1', 'gm-1', { fleetGroupId: 'fleet-2' });
    },
  ];
  for (const [index, corrupt] of corruptions.entries()) {
    resetFixture();
    corrupt();
    mock.update.mockClear();
    mock.set.mockClear();
    await expect(declareWolfAttack.run(request({
      ...baseData, requestId: `noncanonical-${index}`,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  }
});

it('rejects a canonical group partition changed during declaration', async () => {
  navigation({ revision: 5, pursuitGroups: { 'fleet-1': 4, 'fleet-2': 4 } });
  splitFleet();
  let transactionCount = 0;
  mock.runTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
    transactionCount += 1;
    if (transactionCount === 2) {
      fleetGroup('fleet-1', { vesselIds: ['aegis', 'dione', 'quellon'], memberUids: ['u1'] });
      fleetGroup('fleet-2', { vesselIds: ['icebreaker', 'shepherd', 'refinery-124'], memberUids: ['u2'] });
    }
    return callback({
      get: mock.get,
      update: mock.update,
      set: (target: { path: string }, ...args: unknown[]) => target.path.includes('/serverState/callableRateLimit-')
        ? mock.rateLimitSet(target, ...args) : mock.set(target, ...args),
      delete: mock.remove,
    });
  });
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'changed-groups' })))
    .rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/authority or preparation changed/i),
    });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('records a fresh declaration in the authenticated rate bucket before fleet scans', async () => {
  await declareWolfAttack.run(request());
  expect(mock.rateLimitSet).toHaveBeenCalledTimes(1);
  const scanIndex = mock.get.mock.calls.findIndex(([target]) =>
    ['sessions/s1/fleetGroups', 'sessions/s1/players', 'sessions/s1/shuttleDepartures',
      'sessions/s1/shuttleTransitChains'].includes((target as { path?: string }).path ?? ''));
  expect(scanIndex).toBeGreaterThanOrEqual(0);
  expect(mock.rateLimitSet.mock.invocationCallOrder[0]).toBeLessThan(mock.get.mock.invocationCallOrder[scanIndex]!);
});

it('replays an exact request without a second transaction write', async () => {
  const first = await declareWolfAttack.run(request());
  expect(mock.rateLimitSet).toHaveBeenCalledTimes(1);
  const generatedSamples = cryptoMock.randomInt.mock.calls.length;
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(declareWolfAttack.run(request())).resolves.toEqual(first);
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(generatedSamples);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.rateLimitSet).toHaveBeenCalledTimes(1);
});

it('rejects stale preparation, wrong actor, client outcomes, and malformed phase without writes', async () => {
  await expect(declareWolfAttack.run(request({ ...baseData, expectedRevision: 2, requestId: 'stale' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'outcome', dice: [6], damage: 42 })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true });
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'player' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  gm();
  session({ activeVesselIds: undefined });
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'missing-fleet' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
});

it('rejects an incomplete parking snapshot without locking airspace or announcing an attack', async () => {
  session({
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
  });

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'unparked' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/events/wolf-attack-unparked')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/unparked')).toBe(false);
  expect(mock.documents.get('sessions/s1').turnPhase).toMatchObject({
    airspace: { state: 'lifted' },
  });
});

it('rejects a departed shuttle visit as in transit even when the docking projection is present', async () => {
  session({
    shuttleVisitLog: [{ shuttleId: 'starlight', action: 'departed', occurredAt: 'TURN 1' }],
  });

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'in-transit' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/events/wolf-attack-in-transit')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/in-transit')).toBe(false);
});

it('rejects malformed in-transit authority even when a stale docking is still present', async () => {
  put('sessions/s1/shuttleDepartures/starlight', {
    status: 'in-transit', shuttleId: 'starlight', forged: true,
  });

  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'malformed-transit' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/events/wolf-attack-malformed-transit')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/malformed-transit')).toBe(false);
});

it('rejects future transit and malformed pending authority without any declaration write', async () => {
  const now = Date.now();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const futureDeparture = new Date(now + 1_000).toISOString();
  const futureArrival = new Date(now + 61_000).toISOString();
  const corruptions: readonly [string, Fields][] = [
    ['future-transit', {
      status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-1',
      shuttleId: 'starlight', holderUid: 'holder', fleetGroupId: 'fleet-1',
      originShipId: 'aegis', destinationShipId: 'dione', cycle: 1, controlRevision: 2,
      requestedAt: new Date(now - 1_000).toISOString(), revision: 1,
      originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0, y: 0, z: 0 },
      destinationPosition: { x: -0.32, y: 0.18, z: 0.22 },
      velocity: { x: -0.32 / 60, y: 0.18 / 60, z: 0.22 / 60 },
      departedAt: futureDeparture, arrivesAt: futureArrival,
    }],
    ['malformed-pending', {
      status: 'requested', requestId: 'departure-1', shuttleId: 'starlight',
      holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'dione', cycle: 1, controlRevision: 2,
      requestedAt: new Date(now - 1_000).toISOString(), forged: true,
    }],
    ['unknown-status', { status: 'teleporting', shuttleId: 'starlight' }],
  ];

  for (const [requestId, departure] of corruptions) {
    resetFixture();
    put('sessions/s1/shuttleDepartures/starlight', departure);
    mock.update.mockClear();
    mock.set.mockClear();
    mock.remove.mockClear();

    await expect(declareWolfAttack.run(request({ ...baseData, requestId })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
    expect(mock.documents.has(`sessions/s1/events/wolf-attack-${requestId}`)).toBe(false);
    expect(mock.documents.has(`sessions/s1/commandReceipts/${requestId}`)).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  }
});

it('keeps an exact pending departure while parking its still-docked shuttle', async () => {
  const pending = {
    status: 'requested', requestId: 'departure-1', shuttleId: 'starlight',
    holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
    destinationShipId: 'dione', cycle: 1, controlRevision: 2,
    requestedAt: new Date().toISOString(),
  };
  put('sessions/s1/shuttleDepartures/starlight', pending);

  await declareWolfAttack.run(request({ ...baseData, requestId: 'pending-departure' }));

  expect(mock.documents.get('sessions/s1/shuttleDepartures/starlight')).toEqual(pending);
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    parkingDecisions: expect.arrayContaining([expect.objectContaining({
      craftId: 'starlight', source: 'docked', hostShipId: 'aegis',
    })]),
  });
});

it('uses the configured expansion target ring when full Capybara is active', async () => {
  session({ activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara'] });
  fleetGroup('fleet-1', {
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara'],
  });
  const result = await declareWolfAttack.run(request({ ...baseData, requestId: 'capybara' }));

  expect(result).toEqual(expect.objectContaining({ status: 'committed', requestId: 'capybara' }));
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({
    calculationReceipt: { targeting: { ring: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara'] } },
  });
});

it('records declaration-time base mapping, expansion rerolls, and excludes the small Capybara', async () => {
  const baseSamples = [0, 1, 2, 3, 4, 5, ...Array<number>(9).fill(0)];
  cryptoMock.randomInt.mockImplementation((upperBound: number) => {
    const sample = baseSamples.shift() ?? 0;
    if (sample >= upperBound) throw new Error(`sample ${sample} is outside ${upperBound}`);
    return sample;
  });
  await declareWolfAttack.run(request({ ...baseData, requestId: 'base-mapping' }));
  const baseReceipt = mock.documents.get('sessions/s1/wolfAttackState/current')?.calculationReceipt as {
    targeting: { ring: string[]; rolls: Array<{ target: string; initialDie: number }> };
  };
  expect(baseReceipt.targeting.ring).toEqual([
    'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
  ]);
  expect(baseReceipt.targeting.rolls.slice(0, 6).map((roll) => roll.target)).toEqual(baseReceipt.targeting.ring);
  expect(baseReceipt.targeting.rolls.slice(0, 6).map((roll) => roll.initialDie)).toEqual([1, 2, 3, 4, 5, 6]);

  mock.documents.delete('sessions/s1/wolfAttackState/current');
  mock.documents.delete('sessions/s1/wolfAttackState/current/audit/base-mapping');
  mock.documents.delete('sessions/s1/events/wolf-attack-base-mapping');
  mock.documents.delete('sessions/s1/commandReceipts/base-mapping');
  session({ activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara'] });
  fleetGroup('fleet-1', {
    vesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara'],
  });
  preparation();
  dueWindow();
  const expansionSamples = [6, 7, 0, ...Array<number>(12).fill(0)];
  cryptoMock.randomInt.mockImplementation((upperBound: number) => {
    const sample = expansionSamples.shift() ?? 0;
    if (sample >= upperBound) throw new Error(`sample ${sample} is outside ${upperBound}`);
    return sample;
  });
  await declareWolfAttack.run(request({ ...baseData, requestId: 'expansion-reroll' }));
  const expansionReceipt = mock.documents.get('sessions/s1/wolfAttackState/current')?.calculationReceipt as {
    targeting: { ring: string[]; rolls: Array<{ target: string; initialDie: number; printedRerolls?: number[] }> };
  };
  expect(expansionReceipt.targeting.ring).toEqual([
    'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara',
  ]);
  expect(expansionReceipt.targeting.rolls[0]).toMatchObject({ initialDie: 7, target: 'capybara' });
  expect(expansionReceipt.targeting.rolls[1]).toMatchObject({ initialDie: 1, target: 'aegis', printedRerolls: [8] });

  mock.documents.delete('sessions/s1/wolfAttackState/current');
  mock.documents.delete('sessions/s1/wolfAttackState/current/audit/expansion-reroll');
  mock.documents.delete('sessions/s1/events/wolf-attack-expansion-reroll');
  mock.documents.delete('sessions/s1/commandReceipts/expansion-reroll');
  session({ activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara-small'] });
  preparation();
  dueWindow();
  await expect(declareWolfAttack.run(request({ ...baseData, requestId: 'small-capybara' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
});

it('rejects a legacy request-id collision before an exact-replay shortcut', async () => {
  put('sessions/s1/events/wolf-legacy-collision', { legacy: true });
  await expect(declareWolfAttack.run(request({
    ...baseData, requestId: 'wolf-legacy-collision',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfAttackState/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/wolf-legacy-collision')).toBe(false);
});

it('holds an overrun-mission PDF Escort Wing out of a fresh launch and permits launch after release', async () => {
  await declareThenSeatPdfColonel();
  const session = mock.documents.get('sessions/s1')!;
  session.missionCraftCommitments = {
    'pdf-escort-fighter-wing': { missionId: 'overrun-1', sourceCycle: 1 },
  };
  const command = { sessionId: 's1', requestId: 'launch-pdf-mission-held', expectedTurn: 1,
    expectedRevision: 1, expectedWingRevision: 0 };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(launchPdfEscortWing.run(request(command)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1/serverState/pdfEscortWing')).toMatchObject({ launched: false, revision: 0 });
  session.missionCraftCommitments = {};
  await expect(launchPdfEscortWing.run(request(command)))
    .resolves.toMatchObject({ status: 'committed', launched: true });
  mock.documents.get('sessions/s1')!.missionCraftCommitments = {
    'pdf-escort-fighter-wing': { missionId: 'later-mission', sourceCycle: 1 },
  };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(launchPdfEscortWing.run(request(command)))
    .resolves.toMatchObject({ status: 'replayed', launched: true });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not let facilitator targeting recovery bypass a current EO enriched warhead choice', async () => {
  patchSession({ activeRoleIds: [...activeRoleIds, 'executive-officer'],
    shipResources: { aegis: { ore: 5 } },
    maintenanceCycles: { aegis: { turn: 1, step: 7, revision: 2, results: {},
      charges: ['missile-launchers'], refuelled: [] } },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } } });
  put('sessions/s1/players/xo-1', { uid: 'xo-1', role: 'player', connected: false,
    assignedRoleId: 'executive-officer', activeConsoleRoleId: null, fleetGroupId: 'fleet-1' });
  fleetGroup('fleet-1', { memberUids: ['u1', 'xo-1'], memberShipIds: { 'u1': 'aegis', 'xo-1': 'aegis' } });
  await declareWolfAttack.run(request());
  const state = mock.documents.get('sessions/s1/wolfAttackState/current')!;
  await expect(advanceWolfAttackToLongRange.run(request({ sessionId: 's1', instanceId: 'gm-1',
    requestId: 'no-bypass-enrichment', expectedTurn: 1, expectedRevision: state.revision,
    reason: 'Recover current targeting with the offline EO still assigned.', dangerConfirmed: true })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfAttackState/current')).toMatchObject({ currentStep: 'targeting' });
});
