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
  const del = vi.fn((target: { path: string }) => documents.delete(target.path));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, delete: del, update }));
  return { documents, get, set, update, delete: del, runTransaction, db: { doc: ref, runTransaction } };
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

import { setCandidatePlanCheckpoint } from './index';

const baseData = {
  sessionId: 's1', instanceId: 'gm-1', requestId: 'checkpoint-1', planExists: true,
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', { phase: 'active', currentTurn: 6, activeVesselIds: ['aegis'], pursuitGroups: { 'fleet-1': 0 } });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  provision();
});

it('persists and projects only the Cycle 6 boolean checkpoint for an active facilitator', async () => {
  await expect(setCandidatePlanCheckpoint.run(request())).resolves.toMatchObject({
    status: 'committed', sessionId: 's1', cycle: 6, planExists: true, revision: 1,
    checkedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
  });
  expect(mock.documents.get('sessions/s1/serverState/navigation')).toMatchObject({
    candidatePlanCheckpoint: { cycle: 6, planExists: true }, revision: 1,
  });
  expect(mock.documents.get('sessions/s1/gmDiscovery/current')).toMatchObject({
    candidatePlanCheckpoint: { cycle: 6, planExists: true }, revision: 1,
  });
  expect(mock.documents.get('sessions/s1/serverState/navigation')).not.toHaveProperty('hiddenGuide');
});

it('replays exactly and rejects non-facilitators and terminal sessions', async () => {
  const committed = await setCandidatePlanCheckpoint.run(request());
  mock.set.mockClear();
  await expect(setCandidatePlanCheckpoint.run(request())).resolves.toEqual(committed);
  expect(mock.set).not.toHaveBeenCalled();

  await expect(setCandidatePlanCheckpoint.run(request({ ...baseData, requestId: 'member' }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  put('sessions/s1', { phase: 'debrief', activeVesselIds: ['aegis'], pursuitGroups: { 'fleet-1': 0 } });
  await expect(setCandidatePlanCheckpoint.run(request({ ...baseData, requestId: 'terminal' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it.each([
  { label: 'missing current cycle', currentTurn: undefined },
  { label: 'earlier cycle', currentTurn: 5 },
  { label: 'later cycle', currentTurn: 7 },
])('rejects the checkpoint outside authoritative Cycle 6 ($label)', async ({ currentTurn }) => {
  const session: Fields = {
    phase: 'active', activeVesselIds: ['aegis'], pursuitGroups: { 'fleet-1': 0 },
    ...(currentTurn === undefined ? {} : { currentTurn }),
  };
  put('sessions/s1', session);
  await expect(setCandidatePlanCheckpoint.run(request({
    ...baseData, requestId: `outside-${currentTurn ?? 'missing'}`,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/serverState/navigation')).toBe(false);
  expect(mock.documents.has('sessions/s1/gmDiscovery/current')).toBe(false);
});
