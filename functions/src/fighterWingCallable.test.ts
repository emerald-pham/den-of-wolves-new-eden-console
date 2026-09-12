import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  session: {
    activeVesselIds: ['aegis'],
    phase: 'active',
    shipUpgrades: { aegis: [] },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 4, revision: 0 },
      'fighter-wing-bravo': { count: 4, revision: 0 },
    },
  } as Record<string, unknown>,
  receipts: {} as Record<string, Record<string, unknown>>,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({
      get: mock.get, update: mock.update, set: mock.set,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { setFighterWingCount } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

const base = {
  sessionId: 's1', instanceId: 'gm1', requestId: 'wing-1',
  wingId: 'fighter-wing-alpha', count: 3, expectedRevision: 0,
};

function snapshot(fields: Record<string, unknown>) {
  return { exists: true, get: (key: string) => fields[key] };
}

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.connected = true;
  mock.session = {
    activeVesselIds: ['aegis'],
    phase: 'active',
    shipUpgrades: { aegis: [] },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 4, revision: 0 },
      'fighter-wing-bravo': { count: 4, revision: 0 },
    },
  };
  mock.receipts = {};
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/fighterWingCountRequests/')) {
      const fields = mock.receipts[path];
      return fields ? snapshot(fields) : { exists: false, get: () => undefined };
    }
    if (path.includes('/players/')) {
      return snapshot({ role: mock.role, connected: mock.connected });
    }
    if (path.includes('/gmInstances/')) return snapshot({ uid: mock.owner });
    return snapshot(mock.session);
  });
});

it('commits a GM correction with a new per-wing revision and private receipt', async () => {
  await expect(setFighterWingCount.run(request(base))).resolves.toEqual({
    status: 'committed', sessionId: 's1', requestId: 'wing-1',
    wingId: 'fighter-wing-alpha', count: 3, revision: 1, capacity: 4,
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'fighterWingCounts.fighter-wing-alpha': { count: 3, revision: 1 },
  }));
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/fighterWingCountRequests/wing-1',
    expect.objectContaining({ reply: expect.objectContaining({ status: 'committed' }) }),
  );
});

it('rejects a non-GM even when the request names a valid GM instance', async () => {
  mock.role = 'player';
  await expect(setFighterWingCount.run(request(base))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('returns stale without mutating when another correction advanced the revision', async () => {
  await expect(setFighterWingCount.run({
    ...request(base), data: { ...base, expectedRevision: 1, count: 2 },
  })).resolves.toMatchObject({ status: 'stale', currentRevision: 0, count: 4, capacity: 4 });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/fighterWingCountRequests/wing-1',
    expect.objectContaining({ reply: expect.objectContaining({ status: 'stale' }) }),
  );
});

it('replays the same request id without applying the correction twice', async () => {
  await setFighterWingCount.run(request(base));
  const receiptPath = 'sessions/s1/fighterWingCountRequests/wing-1';
  const receipt = mock.set.mock.calls[0]?.[1] as Record<string, unknown>;
  mock.receipts[receiptPath] = receipt;
  mock.update.mockReset();
  mock.set.mockReset();
  await expect(setFighterWingCount.run(request(base))).resolves.toMatchObject({
    status: 'replayed', count: 3, revision: 1,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('enforces effective capacity from the authoritative Construction Bay upgrade', async () => {
  await expect(setFighterWingCount.run(request({ ...base, count: 5 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.session.shipUpgrades = { aegis: ['construction-bay'] };
  await expect(setFighterWingCount.run(request({ ...base, requestId: 'wing-2', count: 5 })))
    .resolves.toMatchObject({ status: 'committed', count: 5, capacity: 6 });
});

