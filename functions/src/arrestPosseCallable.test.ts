import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

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
  const collection = (path: string) => ({ ...ref(path), isCollection: true });
  const get = vi.fn(async (target: { path: string; isCollection?: boolean }) => {
    if (target.isCollection) {
      const prefix = target.path + '/';
      const docs = [...documents.keys()]
        .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(snapshot);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
    return snapshot(target.path);
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update: set, delete: (target: { path: string }) => documents.delete(target.path) }));
  return { documents, get, set, runTransaction, db: { doc: ref, collection, runTransaction } };
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

import { calculateArrestPosse } from './index';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'arrest-1',
  expectedRevision: 0,
  targetUid: 'u2',
  defenders: 2,
  adjustment: -1,
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', { phase: 'active', currentTurn: 3, playerCount: 8, activeRoleIds: ['admiral'] });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: 'admiral', replacementRoleId: null,
  });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 14 },
  });
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 9,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 14 }],
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  provision();
});

it('calculates from the server-owned private loyalty and stores only a GM projection', async () => {
  const protectedPaths = [
    'sessions/s1', 'sessions/s1/players/u1', 'sessions/s1/players/u2',
    'sessions/s1/secrets/loyalty-u2', 'sessions/s1/loyaltyCensus/current',
  ];
  const protectedBefore = Object.fromEntries(protectedPaths.map((path) => [
    path, { ...mock.documents.get(path) },
  ]));
  await expect(calculateArrestPosse.run(request())).resolves.toEqual({
    type: 'arrest-posse-calculation', sessionId: 's1', revision: 1,
    requestId: 'arrest-1', targetUid: 'u2', defenders: 2, adjustment: -1,
    requiredPlayers: 5, censusRevision: 9,
  });

  const projection = mock.documents.get('sessions/s1/arrestPosseCalculations/current');
  expect(projection).toEqual({
    type: 'arrest-posse-calculation', sessionId: 's1', revision: 1,
    requestId: 'arrest-1', targetUid: 'u2', defenders: 2, adjustment: -1,
    requiredPlayers: 5, censusRevision: 9,
  });
  const receipt = mock.documents.get('sessions/s1/commandReceipts/arrest-1');
  expect(receipt?.result).toEqual(projection);
  expect(JSON.stringify([projection, receipt])).not.toMatch(/suspicion|wolf-agent|loyalty-u2/);
  for (const [path, fields] of Object.entries(protectedBefore)) {
    expect(mock.documents.get(path)).toEqual(fields);
  }
  expect(mock.set.mock.calls.map(([target]) => target.path).sort()).toEqual([
    'sessions/s1/arrestPosseCalculations/current', 'sessions/s1/commandReceipts/arrest-1',
  ]);
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('replays the exact facilitator request without another write and rejects stale revisions', async () => {
  const committed = await calculateArrestPosse.run(request());
  mock.set.mockClear();
  await expect(calculateArrestPosse.run(request())).resolves.toEqual(committed);
  expect(mock.set).not.toHaveBeenCalled();

  await expect(calculateArrestPosse.run(request({ ...baseData, requestId: 'stale', defenders: 3 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a non-facilitator and a forged suspicion field before writing', async () => {
  await expect(calculateArrestPosse.run(request(baseData, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(calculateArrestPosse.run(request({ ...baseData, requestId: 'forged', suspicion: 0 })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.documents.has('sessions/s1/arrestPosseCalculations/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/forged')).toBe(false);
});

it.each([
  ['private audience mismatch', { visibleToUids: ['u1'], payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 14 } }],
  ['server secret mismatch', { visibleToUids: ['u2'], payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 13 } }],
  ['malformed private secret', { visibleToUids: ['u2'], payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: null } }],
])('fails closed when the %s', async (_label, secret) => {
  put('sessions/s1/secrets/loyalty-u2', secret);
  await expect(calculateArrestPosse.run(request({ ...baseData, requestId: 'malformed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/arrestPosseCalculations/current')).toBe(false);
});

it('fails closed when the GM census and private loyalty card disagree', async () => {
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 9,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 13 }],
  });
  await expect(calculateArrestPosse.run(request({ ...baseData, requestId: 'census-mismatch' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/arrestPosseCalculations/current')).toBe(false);
});

it('rejects a calculated count or projection revision that cannot advance safely', async () => {
  await expect(calculateArrestPosse.run(request({
    ...baseData, requestId: 'overflow-count', defenders: Number.MAX_SAFE_INTEGER,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/arrestPosseCalculations/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/commandReceipts/overflow-count')).toBe(false);

  put('sessions/s1/arrestPosseCalculations/current', {
    type: 'arrest-posse-calculation', sessionId: 's1', revision: Number.MAX_SAFE_INTEGER,
    requestId: 'old', targetUid: 'u2', defenders: 0, requiredPlayers: 3, censusRevision: 9,
  });
  await expect(calculateArrestPosse.run(request({
    ...baseData, requestId: 'overflow-revision', expectedRevision: Number.MAX_SAFE_INTEGER,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/arrestPosseCalculations/current')?.revision)
    .toBe(Number.MAX_SAFE_INTEGER);
  expect(mock.documents.has('sessions/s1/commandReceipts/overflow-revision')).toBe(false);
});

it('rejects a reused request id from another GM device and rejects malformed current state', async () => {
  await calculateArrestPosse.run(request());
  put('sessions/s1/players/u3', { uid: 'u3', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-2', { uid: 'u3', connected: true, lastSeenAt: new Date() });
  await expect(calculateArrestPosse.run(request({ ...baseData, instanceId: 'gm-2' }, 'u3')))
    .rejects.toMatchObject({ code: 'permission-denied' });

  put('sessions/s1/arrestPosseCalculations/current', { type: 'unknown', revision: 1 });
  await expect(calculateArrestPosse.run(request({ ...baseData, requestId: 'malformed-current' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});
