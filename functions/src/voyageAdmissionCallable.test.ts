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
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: (target: { path: string }) => documents.delete(target.path) }));
  return { documents, get, set, update, runTransaction, db: { doc: ref, runTransaction } };
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

import { admitVoyage33 } from './index';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'admit-1',
  expectedRevision: 2,
  crisisId: 'approach-1',
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeVesselIds: ['aegis', 'dione'] });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/crisisState/current', {
    type: 'crisis-state', sessionId: 's1', crisisId: 'approach-1',
    crisisKind: 'approaching-vessel', state: 'resolved', revision: 2,
    title: 'Approaching vessel', details: 'Facilitator notes remain private.',
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  provision();
});

it('admits Voyage 33-0 with printed population and host commitments without selecting a host', async () => {
  await expect(admitVoyage33.run(request())).resolves.toMatchObject({
    status: 'committed', sessionId: 's1', crisisId: 'approach-1', crisisRevision: 2,
    admission: {
      id: 'voyage-33-0', population: 40_000, unrest: 0, hostShipId: null,
      commitments: {
        requiresHostDocking: true, hostProvidesResources: true,
        maintenanceSteps: [1, 2, 3, 4], maxConsoleCharges: 1,
      },
    },
  });
  expect(mock.documents.get('sessions/s1/voyage33Admission/current')).toMatchObject({
    type: 'voyage-admission', crisisId: 'approach-1', actorUid: 'u1', requestId: 'admit-1',
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({ admittedVesselIds: ['voyage-33-0'] });
  const event = mock.documents.get('sessions/s1/events/voyage-admitted-admit-1');
  expect(event).toMatchObject({ type: 'voyage-admitted', vesselId: 'voyage-33-0', population: 40_000 });
  expect(event).not.toHaveProperty('details');
});

it('replays an exact retry and treats another request for the same admission as already admitted', async () => {
  await admitVoyage33.run(request());
  mock.set.mockClear();
  await expect(admitVoyage33.run(request())).resolves.toMatchObject({ status: 'committed' });
  expect(mock.set).not.toHaveBeenCalled();
  await expect(admitVoyage33.run(request({ ...baseData, requestId: 'admit-2' })))
    .resolves.toMatchObject({ status: 'replayed', admission: { crisisId: 'approach-1' } });
});

it('rejects a stale, wrong-kind, closed, or non-facilitator admission without writing state', async () => {
  await expect(admitVoyage33.run(request({ ...baseData, expectedRevision: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/voyage33Admission/current')).toBe(false);
  put('sessions/s1/crisisState/current', {
    type: 'crisis-state', sessionId: 's1', crisisId: 'approach-1',
    crisisKind: 'custom', state: 'resolved', revision: 2,
  });
  await expect(admitVoyage33.run(request({ ...baseData, requestId: 'wrong-kind' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1/crisisState/current', {
    type: 'crisis-state', sessionId: 's1', crisisId: 'approach-1',
    crisisKind: 'approaching-vessel', state: 'closed', revision: 3,
  });
  await expect(admitVoyage33.run(request({ ...baseData, requestId: 'closed', expectedRevision: 3 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(admitVoyage33.run(request({ ...baseData, requestId: 'actor' }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.documents.has('sessions/s1/voyage33Admission/current')).toBe(false);
});
