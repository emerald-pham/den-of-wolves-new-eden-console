import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const cryptoMock = vi.hoisted(() => ({ randomInt: vi.fn() }));
vi.mock('node:crypto', () => cryptoMock);

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
      target.path.endsWith('/shuttleDepartures')
      ? querySnapshot(target.path)
      : snapshot(target.path));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const remove = vi.fn((target: { path: string }) => documents.delete(target.path));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set, delete: remove }));
  return { documents, get, update, set, remove, runTransaction, db: { doc: ref, collection, runTransaction } };
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
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { declareWolfAttack, getDioneMaliadesLaunch, launchDioneMaliades } from './index';
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

function resetFixture(): void {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.remove.mockClear();
  mock.runTransaction.mockClear();
  mock.runTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ get: mock.get, update: mock.update, set: mock.set, delete: mock.remove }));
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
    .toMatchObject({ type: 'maliades-launched', actorRoleId: 'dione-engineer', revision: 2 });

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(launchDioneMaliades.run(request(launchRequest))).resolves.toMatchObject({
    status: 'replayed', revision: 2, launched: true,
  });
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
  const now = Date.now();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
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
  put('sessions/s1/shuttleDepartures/starlight', {
    status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-1',
    shuttleId: 'starlight', holderUid: 'holder', fleetGroupId: 'fleet-1',
    originShipId: 'aegis', destinationShipId: 'dione', cycle: 1, controlRevision: 2,
    requestedAt: departedAt, revision: 1,
    originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0, y: 0, z: 0 },
    destinationPosition: { x: -0.32, y: 0.18, z: 0.22 },
    velocity: { x: -0.32 / 60, y: 0.18 / 60, z: 0.22 / 60 },
    departedAt, arrivesAt,
  });

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
  mock.runTransaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => {
    navigation({ revision: 9, pursuitGroups: { 'fleet-1': 8, 'fleet-2': 8 } });
    return callback({ get: mock.get, update: mock.update, set: mock.set });
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
  mock.runTransaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => {
    fleetGroup('fleet-1', {
      vesselIds: ['aegis', 'dione', 'quellon'],
      memberUids: ['u1'],
    });
    fleetGroup('fleet-2', {
      vesselIds: ['icebreaker', 'shepherd', 'refinery-124'],
      memberUids: ['u2'],
    });
    return callback({ get: mock.get, update: mock.update, set: mock.set });
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

it('replays an exact request without a second transaction write', async () => {
  const first = await declareWolfAttack.run(request());
  const generatedSamples = cryptoMock.randomInt.mock.calls.length;
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(declareWolfAttack.run(request())).resolves.toEqual(first);
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(generatedSamples);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
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
