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
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('shuttleDepartures.')) {
        const shuttleId = key.slice('shuttleDepartures.'.length);
        current.shuttleDepartures = {
          ...((current.shuttleDepartures as Fields | undefined) ?? {}),
          [shuttleId]: value,
        };
      } else current[key] = value;
    }
    documents.set(target.path, current);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update }));
  return { documents, get, set, update, runTransaction, db: { doc: ref, collection: ref, runTransaction } };
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

import { requestShuttleDeparture } from './index';

const command = {
  sessionId: 's1', requestId: 'depart-1', shuttleId: 'starlight',
  destinationShipId: 'icebreaker', expectedControlRevision: 0, expectedCycle: 2,
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
});

it('persists one holder departure request and replays without another write', async () => {
  const first = await requestShuttleDeparture.run(request(command));
  expect(first).toMatchObject({
    status: 'requested', shuttleId: 'starlight', holderUid: 'holder',
    originShipId: 'aegis', destinationShipId: 'icebreaker', cycle: 2, controlRevision: 0,
  });
  expect(mock.documents.get('sessions/s1/shuttleDepartures/starlight'))
    .toMatchObject({ status: 'requested', requestId: 'depart-1' });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(requestShuttleDeparture.run(request(command))).resolves.toMatchObject({
    status: 'replayed', requestId: 'depart-1',
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('persists the SNN departure during AEGIS-authorized restricted airspace without opening it to other craft', async () => {
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

  await expect(requestShuttleDeparture.run(request({
    ...command, requestId: 'press-restricted', shuttleId: 'snn-press-shuttle',
  }))).resolves.toMatchObject({
    status: 'requested', shuttleId: 'snn-press-shuttle', originShipId: 'aegis',
    destinationShipId: 'icebreaker',
  });
  await expect(requestShuttleDeparture.run(request({
    ...command, requestId: 'ordinary-restricted',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('rejects SNN departure when the Press station is disabled without writes', async () => {
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

  await expect(requestShuttleDeparture.run(request({
    ...command, requestId: 'disabled-press', shuttleId: 'snn-press-shuttle',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.documents.has('sessions/s1/shuttleDepartures/snn-press-shuttle')).toBe(false);
});

it('allows only one pending Coordination move for the current holder and cycle', async () => {
  await expect(requestShuttleDeparture.run(request(command))).resolves.toMatchObject({
    status: 'requested', holderUid: 'holder', originShipId: 'aegis',
    destinationShipId: 'icebreaker', cycle: 2, controlRevision: 0,
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;

  await expect(requestShuttleDeparture.run(request({
    ...command, requestId: 'depart-2',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
  expect(mock.documents.get('sessions/s1/shuttleDepartures/starlight')).toMatchObject({
    requestId: 'depart-1', holderUid: 'holder', originShipId: 'aegis',
    destinationShipId: 'icebreaker', cycle: 2,
  });
});

it('accepts departure while another enabled shuttle is already off the docking ledger', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.shuttleDockings = (session.shuttleDockings as Fields[])
    .filter((docking) => docking.shuttleId !== 'highwall');
  await expect(requestShuttleDeparture.run(request(command))).resolves.toMatchObject({
    status: 'requested', shuttleId: 'starlight',
  });
});

it.each([
  ['non-holder', 'owner', command],
  ['stale control', 'holder', { ...command, requestId: 'stale', expectedControlRevision: 4 }],
  ['same ship', 'holder', { ...command, requestId: 'same', destinationShipId: 'aegis' }],
] as const)('rejects %s without a pending departure', async (_label, uid, data) => {
  await expect(requestShuttleDeparture.run(request(data, uid))).rejects.toMatchObject({
    code: expect.stringMatching(/permission-denied|failed-precondition/),
  });
  expect(mock.documents.get('sessions/s1')?.shuttleDepartures).toBeUndefined();
});

it('rejects closed airspace, a cross-group destination, and unresolved Wolf movement', async () => {
  const session = mock.documents.get('sessions/s1')!;
  (session.turnPhase as Fields).airspace = { state: 'restricted', tickerActive: true, pressAccess: false };
  await expect(requestShuttleDeparture.run(request({ ...command, requestId: 'closed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  (session.turnPhase as Fields).airspace = { state: 'lifted', tickerActive: true, pressAccess: true };
  (mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds as string[]).splice(1, 1);
  await expect(requestShuttleDeparture.run(request({ ...command, requestId: 'foreign' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['aegis', 'icebreaker'];
  put('sessions/s1/wolfAttackState/current', { status: 'declared', airspaceLocked: true });
  await expect(requestShuttleDeparture.run(request({ ...command, requestId: 'wolf' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(session.shuttleDepartures).toBeUndefined();
});

it('rejects malformed stored departure state before mutation', async () => {
  put('sessions/s1/shuttleDepartures/starlight', { status: 'requested' });
  await expect(requestShuttleDeparture.run(request({ ...command, requestId: 'malformed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it.each(['lobby', 'casting'] as const)(
  'rejects a stale open phase while the session lifecycle is %s without writes',
  async phase => {
    mock.documents.get('sessions/s1')!.phase = phase;
    await expect(requestShuttleDeparture.run(request({ ...command, requestId: phase })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  },
);

it('rejects a current-cycle and phase-cycle mismatch without writes', async () => {
  mock.documents.get('sessions/s1')!.currentTurn = 3;
  await expect(requestShuttleDeparture.run(request({ ...command, requestId: 'cycle-mismatch' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});
