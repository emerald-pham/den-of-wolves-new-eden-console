import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const cryptoMock = vi.hoisted(() => ({ randomInt: vi.fn(), randomUUID: vi.fn() }));
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
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'shuttleCargo.hummingbird') {
        current.shuttleCargo = { ...(current.shuttleCargo as Fields ?? {}), hummingbird: value };
      } else current[key] = value;
    }
    documents.set(target.path, current);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, update, set }));
  return { documents, get, update, set, runTransaction, db: { doc: ref, runTransaction } };
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

import { allocateHummingbirdHarvest, rollHummingbirdHarvest } from './index';

const rollRequest = {
  sessionId: 's1', requestId: 'hummingbird-roll-1', expectedRevision: 0,
};

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function resetFixture(): void {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.runTransaction.mockClear();
  cryptoMock.randomInt.mockReset();
  cryptoMock.randomUUID.mockReset();
  cryptoMock.randomInt.mockReturnValueOnce(2).mockReturnValueOnce(5);
  put('sessions/s1', {
    phase: 'active', currentTurn: 1,
    activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
    shuttleFuelled: { hummingbird: true },
    shuttleCargo: { hummingbird: { food: 3, water: 4 } },
    turnPhase: {
      turn: 1, teamPhaseEndsAt: new Date(Date.now() - 2_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    shipResources: { quellon: { food: 10, water: 8, fuel: 3, ore: 0, materials: 0, securityTeams: 2 } },
  });
  put('sessions/s1/players/u1', {
    uid: 'u1', role: 'player', connected: true, assignedRoleId: 'quellon-explorer',
    activeConsoleRoleId: 'quellon-explorer', replacementRoleId: null,
  });
}

beforeEach(resetFixture);

it('rolls private server dice once and replays the exact roll without new randomness', async () => {
  const first = await rollHummingbirdHarvest.run(request(rollRequest));
  expect(first).toMatchObject({
    status: 'committed', harvest: { status: 'pending', rolls: [2, 5], revision: 1, hostShipId: 'quellon' },
  });
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(2);
  cryptoMock.randomInt.mockClear();

  const replay = await rollHummingbirdHarvest.run(request(rollRequest));
  expect(replay).toMatchObject({ status: 'replayed', harvest: { rolls: [2, 5], revision: 1 } });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1/hummingbirdHarvests/u1')).toMatchObject({
    status: 'pending', rolls: [2, 5], ownerUid: 'u1',
  });
});

it('allocates only Hummingbird cargo, leaves host resources unchanged, and replays once', async () => {
  await rollHummingbirdHarvest.run(request(rollRequest));
  const result = await allocateHummingbirdHarvest.run(request({
    sessionId: 's1', requestId: 'hummingbird-allocate-1', expectedRevision: 1, foodDieIndex: 0,
  }));
  expect(result).toMatchObject({
    status: 'committed', cargo: { food: 5, water: 9 },
    harvest: { status: 'resolved', food: 2, water: 5, foodDieIndex: 0, revision: 2 },
  });
  expect(mock.documents.get('sessions/s1')?.shipResources).toEqual({
    quellon: { food: 10, water: 8, fuel: 3, ore: 0, materials: 0, securityTeams: 2 },
  });
  const writesAfterCommit = mock.update.mock.calls.length + mock.set.mock.calls.length;
  const replay = await allocateHummingbirdHarvest.run(request({
    sessionId: 's1', requestId: 'hummingbird-allocate-1', expectedRevision: 1, foodDieIndex: 0,
  }));
  expect(replay).toMatchObject({ status: 'replayed', cargo: { food: 5, water: 9 } });
  expect(mock.update.mock.calls.length + mock.set.mock.calls.length).toBe(writesAfterCommit);
  cryptoMock.randomInt.mockClear();
  await expect(rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: 'second-after-resolve' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});

it('denies wrong actor, wrong phase, stale docking, and a second same-turn harvest without writes', async () => {
  await expect(rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: 'stale-initial', expectedRevision: 4 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/hummingbirdHarvests/u1')).toBeUndefined();
  await expect(rollHummingbirdHarvest.run(request(rollRequest, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  mock.documents.get('sessions/s1/players/u1')!.activeConsoleRoleId = 'quellon-captain';
  await expect(rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: 'wrong-role' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  mock.documents.get('sessions/s1/players/u1')!.activeConsoleRoleId = 'quellon-explorer';
  mock.documents.get('sessions/s1')!.turnPhase = { airspace: { state: 'restricted' } };
  await expect(rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: 'wrong-phase' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1')!.turnPhase = {
    airspace: { state: 'lifted' }, turn: 1,
  };
  await rollHummingbirdHarvest.run(request(rollRequest));
  mock.documents.get('sessions/s1')!.shuttleDockings = [
    { shuttleId: 'hummingbird', shipId: 'dione', dockedAt: 'NOW' },
  ];
  await expect(allocateHummingbirdHarvest.run(request({
    sessionId: 's1', requestId: 'stale-docking', expectedRevision: 1, foodDieIndex: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1')!.shuttleDockings = [
    { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'NOW' },
  ];
  await expect(rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: 'second-roll' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('checks the action phase before sampling or writing a new roll', async () => {
  mock.documents.get('sessions/s1')!.turnPhase = { airspace: { state: 'restricted' } };
  cryptoMock.randomInt.mockClear();

  await expect(rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: 'outside-phase' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1/hummingbirdHarvests/u1')).toBeUndefined();
  expect(mock.documents.get('sessions/s1/hummingbirdHarvestRequests/outside-phase')).toBeUndefined();
});

it('checks the action phase before allocating a pending roll', async () => {
  await rollHummingbirdHarvest.run(request(rollRequest));
  const writesBefore = mock.update.mock.calls.length + mock.set.mock.calls.length;
  const cargoBefore = mock.documents.get('sessions/s1')?.shuttleCargo;
  mock.documents.get('sessions/s1')!.turnPhase = { airspace: { state: 'restricted' } };

  await expect(allocateHummingbirdHarvest.run(request({
    sessionId: 's1', requestId: 'outside-phase-allocation', expectedRevision: 1, foodDieIndex: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update.mock.calls.length + mock.set.mock.calls.length).toBe(writesBefore);
  expect(mock.documents.get('sessions/s1')?.shuttleCargo).toEqual(cargoBefore);
});

it.each([
  ['missing dockedAt', (row: Record<string, unknown>) => { delete row.dockedAt; }],
  ['blank dockedAt', (row: Record<string, unknown>) => { row.dockedAt = '  '; }],
  ['in transit', (row: Record<string, unknown>) => { row.inTransit = true; }],
  ['duplicate Hummingbird row', (row: Record<string, unknown>, rows: unknown[]) => { rows.push({ ...row }); }],
] as const)('rejects a Hummingbird docking row with %s before writing or rolling', async (_label, mutate) => {
  const session = mock.documents.get('sessions/s1')!;
  const rows = session.shuttleDockings as unknown[];
  const row = { ...(rows[0] as Record<string, unknown>) };
  mutate(row, rows);
  rows[0] = row;
  cryptoMock.randomInt.mockClear();

  await expect(rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: `malformed-${String(_label).replaceAll(' ', '-')}` })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1/hummingbirdHarvests/u1')).toBeUndefined();
});

it('fails closed on malformed cargo without changing the harvest receipt', async () => {
  mock.documents.get('sessions/s1')!.shuttleCargo = { hummingbird: { ore: 2 } };
  await rollHummingbirdHarvest.run(request(rollRequest));
  const before = { ...(mock.documents.get('sessions/s1/hummingbirdHarvests/u1') ?? {}) };
  await expect(allocateHummingbirdHarvest.run(request({
    sessionId: 's1', requestId: 'malformed-cargo', expectedRevision: 1, foodDieIndex: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/hummingbirdHarvests/u1')).toEqual(before);
  expect(mock.update).not.toHaveBeenCalled();

  resetFixture();
  put('sessions/s1/hummingbirdHarvests/u1', {
    sessionId: 's1', ownerUid: 'u2', turn: 1, hostShipId: 'quellon', revision: 1,
    status: 'pending', rolls: [2, 5], requestId: 'foreign-roll', createdAt: '2026-09-12T00:00:00.000Z',
  });
  cryptoMock.randomInt.mockClear();
  await expect(rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: 'foreign-state' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});

it('uses the current active docking host and denies a removed host before writing', async () => {
  mock.documents.get('sessions/s1')!.activeVesselIds = ['quellon', 'dione'];
  mock.documents.get('sessions/s1')!.shuttleDockings = [
    { shuttleId: 'hummingbird', shipId: 'dione', dockedAt: 'NOW' },
  ];
  const currentHost = await rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: 'dione-roll' }));
  expect(currentHost).toMatchObject({ harvest: { hostShipId: 'dione' } });

  resetFixture();
  mock.documents.get('sessions/s1')!.shuttleDockings = [
    { shuttleId: 'hummingbird', shipId: 'dione', dockedAt: 'NOW' },
  ];
  await expect(rollHummingbirdHarvest.run(request({ ...rollRequest, requestId: 'removed-host' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/hummingbirdHarvests/u1')).toBeUndefined();
});
