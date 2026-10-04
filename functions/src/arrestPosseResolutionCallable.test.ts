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
      const prefix = `${target.path}/`;
      const docs = [...documents.keys()].filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(snapshot);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
    return snapshot(target.path);
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update: set }));
  return { documents, get, set, runTransaction, db: { doc: ref, collection, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'deleted' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { resolveArrestPosse } from './index';

const baseData = {
  sessionId: 's1', instanceId: 'gm-1', requestId: 'arrest-resolution-1',
  expectedCycle: 3, expectedRevision: 1, targetUid: 'u2',
  presentPlayerUids: ['u3', 'u4', 'u5', 'u6', 'u7'],
};
function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}
function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }
function player(uid: string): void { put(`sessions/s1/players/${uid}`, { uid, role: 'player', connected: true, displayName: uid }); }

function provision(): void {
  put('sessions/s1', { phase: 'active', currentTurn: 3, setupRevision: 2 });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  player('u2'); player('u3'); player('u4'); player('u5'); player('u6'); player('u7');
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'], payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 14 },
  });
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 9,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 14 }],
  });
  put('sessions/s1/arrestPosseCalculations/current', {
    type: 'arrest-posse-calculation', sessionId: 's1', revision: 1,
    requestId: 'arrest-1', targetUid: 'u2', defenders: 2, adjustment: -1,
    requiredPlayers: 5, censusRevision: 9,
  });
}

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear();
  mock.runTransaction.mockReset();
  mock.runTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ get: mock.get, set: mock.set, update: mock.set }));
  provision();
});

it('resolves attendance against only the current private calculation and opens a private deadline case', async () => {
  const result = await resolveArrestPosse.run(request());
  expect(result).toMatchObject({
    status: 'committed', type: 'arrest-posse-outcome', sessionId: 's1',
    requestId: 'arrest-resolution-1', turn: 3, revision: 1, targetUid: 'u2',
    requiredPlayers: 5, presentPlayers: 5, outcome: 'arrested', deadlineCycle: 4,
  });
  expect(result).not.toHaveProperty('suspicion');
  const kase = mock.documents.get('sessions/s1/arrestCases/u2');
  expect(kase).toMatchObject({ status: 'pending-resolution', outcome: 'arrested', deadlineCycle: 4 });
  expect(JSON.stringify(kase)).not.toMatch(/wolf-agent|suspicion|loyalty-u2/);
  expect(mock.documents.get('sessions/s1/commandReceipts/arrest-resolution-1')?.result).toEqual(result);
});

it('records a failed posse without creating prisoner status when attendance is short', async () => {
  const result = await resolveArrestPosse.run(request({ ...baseData, presentPlayerUids: ['u3', 'u4'] }));
  expect(result).toMatchObject({ outcome: 'not-arrested', presentPlayers: 2, requiredPlayers: 5 });
  expect(mock.documents.get('sessions/s1/arrestCases/u2')).toMatchObject({ status: 'not-arrested' });
});

it('rejects stale census, duplicate or target attendance, and any participant outside the live player roster', async () => {
  put('sessions/s1/loyaltyCensus/current', { type: 'loyalty-census', revision: 10, entries: [] });
  await expect(resolveArrestPosse.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/arrestCases/u2')).toBe(false);

  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 9, entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 14 }],
  });
  await expect(resolveArrestPosse.run(request({ ...baseData, presentPlayerUids: ['u3', 'u3'] })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(resolveArrestPosse.run(request({ ...baseData, presentPlayerUids: ['u2', 'u3'] })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(resolveArrestPosse.run(request({ ...baseData, presentPlayerUids: ['unknown'] })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('replays an exact result without changing the arrest case and rejects a different actor', async () => {
  const first = await resolveArrestPosse.run(request());
  mock.set.mockClear();
  await expect(resolveArrestPosse.run(request())).resolves.toEqual(first);
  expect(mock.set).not.toHaveBeenCalled();
  await expect(resolveArrestPosse.run(request(baseData, 'u8'))).rejects.toMatchObject({ code: 'permission-denied' });
});
