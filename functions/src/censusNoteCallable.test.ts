import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const writes = { update: vi.fn(), set: vi.fn() };
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
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set }));
  return { documents, get, ...writes, update, set, runTransaction, db: { doc: ref, runTransaction } };
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

import { setFacilitatorCensusNote } from './index';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'note-1',
  expectedRevision: 3,
  targetUid: 'u2',
  note: 'Watch the transfer window',
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', { phase: 'active', currentTurn: 1 });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true });
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census',
    revision: 3,
    entries: [
      { uid: 'u2', kind: 'wolf-agent', suspicion: 5 },
      { uid: 'u3', kind: 'fleet-loyalist', suspicion: 0, note: 'Keep this note' },
    ],
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  provision();
});

it('writes a bounded GM-only note with a census revision and private audit', async () => {
  await expect(setFacilitatorCensusNote.run(request())).resolves.toEqual({
    sessionId: 's1', targetUid: 'u2', revision: 4, note: 'Watch the transfer window',
  });
  expect(mock.documents.get('sessions/s1/loyaltyCensus/current')).toMatchObject({
    type: 'loyalty-census', revision: 4,
    entries: expect.arrayContaining([
      { uid: 'u2', kind: 'wolf-agent', suspicion: 5, note: 'Watch the transfer window' },
      { uid: 'u3', kind: 'fleet-loyalist', suspicion: 0, note: 'Keep this note' },
    ]),
  });
  expect(mock.documents.get('sessions/s1/loyaltyCensus/current/audit/note-1')).toMatchObject({
    type: 'loyalty-census-note', action: 'set', targetUid: 'u2', revision: 4, actorUid: 'u1',
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('replays an exact request without a second census or audit write', async () => {
  await setFacilitatorCensusNote.run(request());
  mock.set.mockClear();
  await expect(setFacilitatorCensusNote.run(request())).resolves.toEqual({
    sessionId: 's1', targetUid: 'u2', revision: 4, note: 'Watch the transfer window',
  });
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a stale revision, unknown target, and non-GM before any write', async () => {
  await expect(setFacilitatorCensusNote.run(request({ ...baseData, requestId: 'stale', expectedRevision: 2 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(setFacilitatorCensusNote.run(request({ ...baseData, requestId: 'missing', targetUid: 'u9' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(setFacilitatorCensusNote.run(request({ ...baseData, requestId: 'player' }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('clears a note without changing another identity and rejects oversized input', async () => {
  await expect(setFacilitatorCensusNote.run(request({ ...baseData, note: '' }))).resolves.toEqual({
    sessionId: 's1', targetUid: 'u2', revision: 4, note: '',
  });
  const census = mock.documents.get('sessions/s1/loyaltyCensus/current');
  expect(census?.entries).toEqual([
    { uid: 'u2', kind: 'wolf-agent', suspicion: 5 },
    { uid: 'u3', kind: 'fleet-loyalist', suspicion: 0, note: 'Keep this note' },
  ]);
  await expect(setFacilitatorCensusNote.run(request({ ...baseData, requestId: 'too-long', note: 'x'.repeat(241) })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
});
