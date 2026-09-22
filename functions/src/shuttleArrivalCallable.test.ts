import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { enterShuttleTransit } from './shuttleTransit';

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
    if (documents.has(target.path)) throw new Error('document already exists');
    documents.set(target.path, { ...fields });
  });
  const remove = vi.fn((target: { path: string }) => documents.delete(target.path));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, create, delete: remove }));
  return {
    documents, get, set, update, create, remove, runTransaction,
    db: { doc: ref, collection: ref, runTransaction },
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    toDate() { return this.value; }
  },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
  },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));

import { createCompleteShuttleArrivalCallable } from './shuttleArrivalCallable';

const completeShuttleArrival = createCompleteShuttleArrivalCallable();

const command = {
  sessionId: 's1',
  shuttleId: 'starlight',
  transitRequestId: 'transit-1',
  expectedControlRevision: 2,
};

function request(data: Fields = command, uid = 'holder') {
  return { data, auth: { uid } } as CallableRequest<Fields>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function seedTransit(overdueByMs = 10_000): Fields {
  const departedAt = Date.now() - 60_000 - overdueByMs;
  return enterShuttleTransit({
    transitRequestId: 'transit-1',
    actorUid: 'holder',
    expectedDepartureRequestId: 'departure-1',
    expectedControlRevision: 2,
    expectedCycle: 2,
    departure: {
      status: 'requested', requestId: 'departure-1', shuttleId: 'starlight',
      holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'icebreaker', cycle: 2, controlRevision: 2,
      requestedAt: new Date(departedAt - 60_000).toISOString(),
    },
    control: {
      shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    },
    dockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
      { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' },
    ],
    group: { id: 'fleet-1', vesselIds: ['aegis', 'icebreaker'], memberUids: ['holder', 'owner'] },
    phase: {
      turn: 2,
      teamPhaseEndsAt: new Date(departedAt - 300_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    now: departedAt,
  }).transit;
}

function baseVisitLog(): Fields[] {
  return [
    { id: 'snn-initial-aegis-docking', shuttleId: 'snn-press-shuttle', shipId: 'aegis', action: 'docked', occurredAt: 'SESSION START' },
    { id: 'starlight-initial-aegis-docking', shuttleId: 'starlight', shipId: 'aegis', action: 'docked', occurredAt: 'SESSION START' },
    { id: 'highwall-initial-icebreaker-docking', shuttleId: 'highwall', shipId: 'icebreaker', action: 'docked', occurredAt: 'SESSION START' },
  ];
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  mock.create.mockClear();
  mock.remove.mockClear();
  mock.runTransaction.mockClear();
  const transit = seedTransit();
  put('sessions/s1', {
    phase: 'active', currentTurn: 2,
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    activeVesselIds: ['aegis', 'icebreaker'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: new Date(Date.now() - 300_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
      { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' },
    ],
    shuttleVisitLog: baseVisitLog(),
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
        holderUid: 'holder', revision: 2,
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
  put('sessions/s1/shuttleDepartures/starlight', transit);
});

it('commits docking, history, event, transit deletion, and one replay receipt atomically', async () => {
  await expect(completeShuttleArrival.run(request())).resolves.toMatchObject({
    status: 'arrived', sessionId: 's1', requestId: 'arrival-transit-1',
    transitRequestId: 'transit-1', shuttleId: 'starlight', hostShipId: 'icebreaker',
  });
  const session = mock.documents.get('sessions/s1')!;
  expect(session.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'starlight', shipId: 'icebreaker' }),
  ]));
  expect(session.shuttleVisitLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'shuttle-arrival-transit-1-departed', shipId: 'aegis', action: 'departed' }),
    expect.objectContaining({ id: 'shuttle-arrival-transit-1-docked', shipId: 'icebreaker', action: 'docked' }),
  ]));
  expect(mock.documents.has('sessions/s1/shuttleDepartures/starlight')).toBe(false);
  const event = mock.documents.get('sessions/s1/events/shuttle-arrival-transit-1')!;
  expect(event).toMatchObject({ type: 'shuttle-arrival', shuttleId: 'starlight', visibility: 'member' });
  expect(event).not.toHaveProperty('actorUid');
  expect(event).not.toHaveProperty('actorRoleId');
  expect(event).not.toHaveProperty('originShipId');
  expect(event).not.toHaveProperty('destinationShipId');
  expect(event).not.toHaveProperty('fleetGroupId');
  expect(event).not.toHaveProperty('holderUid');
  const receiptPath = 'sessions/s1/commandReceipts/arrival-transit-1';
  expect(mock.documents.get(receiptPath)?.result).toMatchObject({ status: 'arrived', hostShipId: 'icebreaker' });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length +
    mock.create.mock.calls.length + mock.remove.mock.calls.length;

  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(completeShuttleArrival.run(request())).resolves.toMatchObject({
    status: 'replayed', hostShipId: 'icebreaker',
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length +
    mock.create.mock.calls.length + mock.remove.mock.calls.length).toBe(writes);
});

it('rejects a foreign holder and a same-trip command collision without writes', async () => {
  await completeShuttleArrival.run(request());
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length + mock.create.mock.calls.length;
  await expect(completeShuttleArrival.run(request(command, 'owner')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(completeShuttleArrival.run(request({ ...command, expectedControlRevision: 3 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length + mock.create.mock.calls.length).toBe(writes);
});

it('rejects early arrival, stale holder control, Wolf lock, and extra client authority fields', async () => {
  mock.documents.set('sessions/s1/shuttleDepartures/starlight', seedTransit(-50_000));
  await expect(completeShuttleArrival.run(request({ ...command, requestId: 'client-chosen' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(completeShuttleArrival.run(request()))
    .rejects.toMatchObject({ code: 'failed-precondition' });

  mock.documents.set('sessions/s1/shuttleDepartures/starlight', seedTransit());
  const session = mock.documents.get('sessions/s1')!;
  session.shuttleControl = {
    starlight: {
      shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
      holderUid: 'owner', revision: 3,
    },
  };
  await expect(completeShuttleArrival.run(request()))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session.shuttleControl = {
    starlight: {
      shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    },
  };
  put('sessions/s1/wolfAttackState/current', { status: 'declared', airspaceLocked: true });
  await expect(completeShuttleArrival.run(request()))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.create).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
});

it('rejects malformed public history and a pre-existing event without partial writes', async () => {
  mock.documents.get('sessions/s1')!.shuttleVisitLog = [{ id: 'secret', shuttleId: 'starlight' }];
  await expect(completeShuttleArrival.run(request()))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1')!.shuttleVisitLog = baseVisitLog();
  put('sessions/s1/events/shuttle-arrival-transit-1', { type: 'shuttle-arrival' });
  await expect(completeShuttleArrival.run(request()))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.create).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
});

it('fails closed on replay when the committed member event is missing or unsafe', async () => {
  await completeShuttleArrival.run(request());
  mock.documents.delete('sessions/s1/events/shuttle-arrival-transit-1');
  await expect(completeShuttleArrival.run(request()))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  const restoredEvent: Fields = {
    type: 'shuttle-arrival', sessionId: 's1', requestId: 'arrival-transit-1',
    visibility: 'member', shuttleId: 'starlight', actorUid: 'holder',
  };
  put('sessions/s1/events/shuttle-arrival-transit-1', restoredEvent);
  await expect(completeShuttleArrival.run(request()))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});
