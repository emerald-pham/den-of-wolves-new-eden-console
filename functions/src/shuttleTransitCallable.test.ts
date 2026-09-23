import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: ref(path),
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const create = vi.fn((target: { path: string }, fields: Fields) => {
    if (documents.has(target.path)) throw new Error(`Document already exists: ${target.path}`);
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update, create }));
  return { documents, get, set, update, create, runTransaction, db: { doc: ref, collection: ref, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    static now() { return new MockTimestamp(new Date()); }
    toDate() { return this.value; }
    toMillis() { return this.value.getTime(); }
  },
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

import { beginShuttleTransit, retargetShuttleTransit } from './index';

const command = {
  sessionId: 's1', requestId: 'transit-1', shuttleId: 'starlight',
  expectedDepartureRequestId: 'depart-1', expectedControlRevision: 0, expectedCycle: 2,
};

function request(data: Fields, uid = 'holder') {
  return { data, auth: { uid } } as CallableRequest<Fields>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  mock.create.mockClear();
  const now = Date.now();
  put('sessions/s1', {
    phase: 'active', currentTurn: 2,
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    activeVesselIds: ['aegis', 'icebreaker'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: new Date(now - 60_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 600_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
      { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' },
    ],
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
        holderUid: 'holder', revision: 0,
      },
    },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'icebreaker-miner', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/owner', {
    role: 'player', connected: true, assignedRoleId: 'wing-commander', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['aegis', 'icebreaker'], memberUids: ['holder', 'owner'],
  });
  put('sessions/s1/shuttleDepartures/starlight', {
    status: 'requested', requestId: 'depart-1', shuttleId: 'starlight', holderUid: 'holder',
    fleetGroupId: 'fleet-1', originShipId: 'aegis', destinationShipId: 'icebreaker',
    cycle: 2, controlRevision: 0, requestedAt: new Date(now - 1_000).toISOString(),
  });
});

it('atomically enters transit, removes only the departing docking, and replays without writes', async () => {
  const first = await beginShuttleTransit.run(request(command));
  expect(first).toMatchObject({
    status: 'in-transit', shuttleId: 'starlight',
    destinationShipId: 'icebreaker', transitRequestId: 'transit-1', revision: 1,
  });
  const session = mock.documents.get('sessions/s1')!;
  expect(session.shuttleDockings).toEqual([
    expect.objectContaining({ shuttleId: 'snn-press-shuttle' }),
    expect.objectContaining({ shuttleId: 'highwall' }),
  ]);
  const transit = mock.documents.get('sessions/s1/shuttleDepartures/starlight')!;
  expect(Date.parse(transit.arrivesAt as string) - Date.parse(transit.departedAt as string)).toBe(60_000);
  expect(transit).not.toHaveProperty('routeLegs');
  expect(transit).not.toHaveProperty('originDepartedAt');
  expect(transit).not.toHaveProperty('originPosition');
  expect(mock.documents.get('sessions/s1/shuttleTransitChains/starlight')).toMatchObject({
    status: 'in-transit-chain', revision: 1, transitRequestId: 'transit-1',
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  session.phase = 'debrief';
  await expect(beginShuttleTransit.run(request(command))).resolves.toMatchObject({
    status: 'replayed', transitRequestId: 'transit-1',
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('retargets the active leg from server time, preserves transit identity, and replays safely', async () => {
  await beginShuttleTransit.run(request(command));
  const session = mock.documents.get('sessions/s1')!;
  session.activeVesselIds = ['aegis', 'icebreaker', 'dione'];
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['aegis', 'icebreaker', 'dione'];
  const retargetCommand = {
    sessionId: 's1', requestId: 'retarget-1', shuttleId: 'starlight',
    transitRequestId: 'transit-1', destinationShipId: 'dione',
    expectedControlRevision: 0, expectedCycle: 2,
  };
  const first = await retargetShuttleTransit.run(request(retargetCommand));
  expect(first).toMatchObject({
    status: 'in-transit', transitRequestId: 'transit-1', destinationShipId: 'dione', revision: 2,
  });
  const transit = mock.documents.get('sessions/s1/shuttleDepartures/starlight')!;
  expect(transit).not.toHaveProperty('originShipId');
  expect(transit).not.toHaveProperty('routeLegs');
  expect(transit).not.toHaveProperty('originDepartedAt');
  expect(transit).not.toHaveProperty('originPosition');
  expect(mock.documents.get('sessions/s1/shuttleTransitChains/starlight')).toMatchObject({
    status: 'in-transit-chain', revision: 2, transitRequestId: 'transit-1',
  });
  expect(transit.currentPosition).toEqual(expect.objectContaining({ x: expect.any(Number) }));
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length + mock.create.mock.calls.length;
  await expect(retargetShuttleTransit.run(request(retargetCommand))).resolves.toMatchObject({
    status: 'replayed', transitRequestId: 'transit-1', revision: 2,
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length + mock.create.mock.calls.length).toBe(writes);
  const eventPath = [...mock.documents.keys()].find((path) => path.includes('/events/shuttle-retarget-'));
  expect(eventPath).toBeDefined();
  const event = mock.documents.get(eventPath!);
  expect(event).toMatchObject({ type: 'shuttle-retarget', shuttleId: 'starlight' });
  expect(event).not.toHaveProperty('destinationShipId');
});

it('rejects SNN begin at the restricted Press deadline while the parking task is delayed', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T12:00:00.000Z'));
  try {
    const session = mock.documents.get('sessions/s1')!;
    session.pressEnabled = true;
    session.turnPhase = {
      turn: 2,
      teamPhaseEndsAt: '2026-09-23T11:59:00.000Z',
      openAirspaceEndsAt: '2026-09-23T12:00:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: true },
    };
    session.shuttleControl = {
      ...(session.shuttleControl as Fields),
      'snn-press-shuttle': {
        shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: 'owner',
        holderUid: 'holder', revision: 0,
      },
    };
    mock.documents.set('sessions/s1/shuttleDepartures/snn-press-shuttle', {
      status: 'requested', requestId: 'press-departure-1', shuttleId: 'snn-press-shuttle',
      holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'icebreaker', cycle: 2, controlRevision: 0,
      requestedAt: '2026-09-23T11:59:00.000Z',
    });
    const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;

    await expect(beginShuttleTransit.run(request({
      ...command, requestId: 'press-begin-at-deadline', shuttleId: 'snn-press-shuttle',
      expectedDepartureRequestId: 'press-departure-1',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mock.documents.get('sessions/s1/shuttleDepartures/snn-press-shuttle'))
      .toMatchObject({ status: 'requested', requestId: 'press-departure-1' });
    expect(mock.documents.get('sessions/s1/shuttleTransitChains/snn-press-shuttle')).toBeUndefined();
    expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
  } finally {
    vi.useRealTimers();
  }
});

it('rejects Press retarget at the restricted deadline while a shuttle is in transit', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T12:00:00.000Z'));
  try {
    const session = mock.documents.get('sessions/s1')!;
    session.pressEnabled = true;
    session.turnPhase = {
      turn: 2,
      teamPhaseEndsAt: '2026-09-23T11:59:00.000Z',
      openAirspaceEndsAt: '2026-09-23T12:00:30.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: true },
    };
    session.shuttleControl = {
      ...(session.shuttleControl as Fields),
      'snn-press-shuttle': {
        shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: 'owner',
        holderUid: 'holder', revision: 0,
      },
    };
    mock.documents.set('sessions/s1/shuttleDepartures/snn-press-shuttle', {
      status: 'requested', requestId: 'press-departure-1', shuttleId: 'snn-press-shuttle',
      holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'icebreaker', cycle: 2, controlRevision: 0,
      requestedAt: '2026-09-23T11:59:00.000Z',
    });
    await expect(beginShuttleTransit.run(request({
      ...command, requestId: 'press-begin-before-deadline', shuttleId: 'snn-press-shuttle',
      expectedDepartureRequestId: 'press-departure-1',
    }))).resolves.toMatchObject({ status: 'in-transit', shuttleId: 'snn-press-shuttle' });
    session.activeVesselIds = ['aegis', 'icebreaker', 'dione'];
    mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['aegis', 'icebreaker', 'dione'];
    const transitBefore = structuredClone(mock.documents.get('sessions/s1/shuttleDepartures/snn-press-shuttle'));
    const writes = mock.set.mock.calls.length + mock.update.mock.calls.length + mock.create.mock.calls.length;
    vi.setSystemTime(new Date('2026-09-23T12:00:30.000Z'));

    await expect(retargetShuttleTransit.run(request({
      sessionId: 's1', requestId: 'press-retarget-at-deadline', shuttleId: 'snn-press-shuttle',
      transitRequestId: 'transit-1', destinationShipId: 'dione',
      expectedControlRevision: 0, expectedCycle: 2,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mock.documents.get('sessions/s1/shuttleDepartures/snn-press-shuttle')).toEqual(transitBefore);
    expect(mock.set.mock.calls.length + mock.update.mock.calls.length + mock.create.mock.calls.length).toBe(writes);
  } finally {
    vi.useRealTimers();
  }
});

it('fails closed when a revisioned transit has no matching private chain', async () => {
  await beginShuttleTransit.run(request(command));
  const session = mock.documents.get('sessions/s1')!;
  session.activeVesselIds = ['aegis', 'icebreaker', 'dione'];
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['aegis', 'icebreaker', 'dione'];
  const retargetCommand = {
    sessionId: 's1', requestId: 'retarget-missing-chain', shuttleId: 'starlight',
    transitRequestId: 'transit-1', destinationShipId: 'dione',
    expectedControlRevision: 0, expectedCycle: 2,
  };
  mock.documents.get('sessions/s1/shuttleDepartures/starlight')!.revision = 2;
  mock.documents.delete('sessions/s1/shuttleTransitChains/starlight');
  await expect(retargetShuttleTransit.run(request(retargetCommand))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.documents.get('sessions/s1/shuttleDepartures/starlight')).not.toHaveProperty('routeLegs');
});

it('fails closed when the private chain identity does not match the public transit', async () => {
  await beginShuttleTransit.run(request(command));
  const session = mock.documents.get('sessions/s1')!;
  session.activeVesselIds = ['aegis', 'icebreaker', 'dione'];
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['aegis', 'icebreaker', 'dione'];
  const chain = mock.documents.get('sessions/s1/shuttleTransitChains/starlight')!;
  chain.transitRequestId = 'forged-transit';
  const retargetCommand = {
    sessionId: 's1', requestId: 'retarget-mismatched-chain', shuttleId: 'starlight',
    transitRequestId: 'transit-1', destinationShipId: 'dione',
    expectedControlRevision: 0, expectedCycle: 2,
  };
  await expect(retargetShuttleTransit.run(request(retargetCommand))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.documents.get('sessions/s1/shuttleDepartures/starlight')).toMatchObject({
    revision: 1, transitRequestId: 'transit-1',
  });
});

it('enters SNN transit during AEGIS-authorized restricted airspace', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.pressEnabled = true;
  (session.turnPhase as Fields).airspace = {
    state: 'restricted', tickerActive: true, pressAccess: true,
  };
  session.shuttleControl = {
    ...(session.shuttleControl as Fields),
    'snn-press-shuttle': {
      shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: 'owner',
      holderUid: 'holder', revision: 0,
    },
  };
  put('sessions/s1/shuttleDepartures/snn-press-shuttle', {
    status: 'requested', requestId: 'press-depart', shuttleId: 'snn-press-shuttle',
    holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
    destinationShipId: 'icebreaker', cycle: 2, controlRevision: 0,
    requestedAt: new Date(Date.now() - 1_000).toISOString(),
  });

  await expect(beginShuttleTransit.run(request({
    ...command, requestId: 'press-transit', shuttleId: 'snn-press-shuttle',
    expectedDepartureRequestId: 'press-depart',
  }))).resolves.toMatchObject({
    status: 'in-transit', shuttleId: 'snn-press-shuttle',
    destinationShipId: 'icebreaker',
  });
});

it('rejects SNN transit when the Press station is disabled without writes', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.pressEnabled = false;
  (session.turnPhase as Fields).airspace = {
    state: 'restricted', tickerActive: true, pressAccess: true,
  };
  session.shuttleControl = {
    ...(session.shuttleControl as Fields),
    'snn-press-shuttle': {
      shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: 'owner',
      holderUid: 'holder', revision: 0,
    },
  };
  const pending = {
    status: 'requested', requestId: 'press-depart', shuttleId: 'snn-press-shuttle',
    holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
    destinationShipId: 'icebreaker', cycle: 2, controlRevision: 0,
    requestedAt: new Date(Date.now() - 1_000).toISOString(),
  };
  put('sessions/s1/shuttleDepartures/snn-press-shuttle', pending);

  await expect(beginShuttleTransit.run(request({
    ...command, requestId: 'disabled-press-transit', shuttleId: 'snn-press-shuttle',
    expectedDepartureRequestId: 'press-depart',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1/shuttleDepartures/snn-press-shuttle')).toEqual(pending);
});

it.each([
  ['non-holder', 'owner', command],
  ['stale departure', 'holder', { ...command, requestId: 'stale-departure', expectedDepartureRequestId: 'wrong' }],
  ['stale control', 'holder', { ...command, requestId: 'stale-control', expectedControlRevision: 4 }],
  ['stale cycle', 'holder', { ...command, requestId: 'stale-cycle', expectedCycle: 3 }],
] as const)('rejects %s without entering transit', async (_label, uid, data) => {
  await expect(beginShuttleTransit.run(request(data, uid))).rejects.toMatchObject({
    code: expect.stringMatching(/permission-denied|failed-precondition/),
  });
  expect(mock.documents.get('sessions/s1/shuttleDepartures/starlight')).toMatchObject({ status: 'requested' });
  expect((mock.documents.get('sessions/s1')!.shuttleDockings as Fields[]))
    .toEqual(expect.arrayContaining([expect.objectContaining({ shuttleId: 'starlight' })]));
});

it('rejects closed airspace, changed fleet authority, and unresolved Wolf movement without writes', async () => {
  const session = mock.documents.get('sessions/s1')!;
  (session.turnPhase as Fields).airspace = { state: 'restricted', tickerActive: true, pressAccess: false };
  await expect(beginShuttleTransit.run(request({ ...command, requestId: 'closed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  (session.turnPhase as Fields).airspace = { state: 'lifted', tickerActive: true, pressAccess: true };
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['aegis'];
  await expect(beginShuttleTransit.run(request({ ...command, requestId: 'foreign' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['aegis', 'icebreaker'];
  put('sessions/s1/wolfAttackState/current', { status: 'declared', airspaceLocked: true });
  await expect(beginShuttleTransit.run(request({ ...command, requestId: 'wolf' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects malformed or already-transiting route state without mutation', async () => {
  put('sessions/s1/shuttleDepartures/starlight', { status: 'in-transit', shuttleId: 'starlight' });
  await expect(beginShuttleTransit.run(request({ ...command, requestId: 'malformed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});
