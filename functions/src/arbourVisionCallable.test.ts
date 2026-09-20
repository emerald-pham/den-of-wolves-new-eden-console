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
  const del = vi.fn((target: { path: string }) => documents.delete(target.path));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, delete: del, update: set }));
  return { documents, get, set, delete: del, runTransaction, db: { doc: ref, runTransaction } };
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

import { authorArbourVision } from './index';

const baseData = {
  sessionId: 's1', instanceId: 'gm-1', requestId: 'vision-1', expectedRevision: 0,
  targetUid: 'u2', kind: 'location', text: 'The fleet can find safety at the blue system.',
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', { phase: 'active', activeRoleIds: ['admiral'] });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: 'admiral',
  });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'universal-arbour', suspicion: 10 },
  });
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 1,
    entries: [{ uid: 'u2', kind: 'universal-arbour', suspicion: 10 }],
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.delete.mockClear();
  provision();
});

it('writes one labeled private projection and no public event', async () => {
  await expect(authorArbourVision.run(request())).resolves.toEqual({
    status: 'committed', sessionId: 's1', recipientUid: 'u2', revision: 1,
    kind: 'location', text: baseData.text, label: 'FACILITATOR CALL',
  });
  expect(mock.documents.get('sessions/s1/arbourVisions/u2')).toMatchObject({
    type: 'arbour-vision', visibleToUids: ['u2'], recipientUid: 'u2',
    kind: 'location', text: baseData.text, label: 'FACILITATOR CALL', revision: 1,
  });
  expect(mock.documents.get('sessions/s1/arbourVisions/current')).toMatchObject({
    type: 'arbour-visions', visibleToUids: ['u1'], actorUid: 'u1', revision: 1,
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('replays an exact request without a second projection or audit write', async () => {
  await authorArbourVision.run(request());
  mock.set.mockClear();
  await expect(authorArbourVision.run(request())).resolves.toEqual({
    status: 'committed', sessionId: 's1', recipientUid: 'u2', revision: 1,
    kind: 'location', text: baseData.text, label: 'FACILITATOR CALL',
  });
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects wrong actor, stale revision, and a non-Arbour holder before writes', async () => {
  await expect(authorArbourVision.run(request(baseData, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(authorArbourVision.run(request({ ...baseData, requestId: 'stale', expectedRevision: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'], payload: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 0 },
  });
  await expect(authorArbourVision.run(request({ ...baseData, requestId: 'wrong-loyalty' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('rejects malformed text, unknown recipients, and closed sessions', async () => {
  await expect(authorArbourVision.run(request({ ...baseData, requestId: 'blank', text: ' ' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(authorArbourVision.run(request({ ...baseData, requestId: 'missing', targetUid: 'u9' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1', { phase: 'closed', activeRoleIds: ['admiral'] });
  await expect(authorArbourVision.run(request({ ...baseData, requestId: 'closed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it.each(['failure', 'debrief', 'success'] as const)(
  'freezes facilitator calls during %s endgame evaluation',
  async (phase) => {
    put('sessions/s1', { phase, activeRoleIds: ['admiral'] });
    const before = new Map(mock.documents);

    await expect(authorArbourVision.run(request({
      ...baseData, requestId: `vision-${phase}`,
    }))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/endgame evaluation/i),
    });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.delete).not.toHaveBeenCalled();
    expect(mock.documents).toEqual(before);
  },
);
