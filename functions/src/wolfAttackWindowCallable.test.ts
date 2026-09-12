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

import { setWolfAttackWindow } from './index';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'wolf-1',
  expectedRevision: 0,
  status: 'due' as const,
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function session(fields: Fields = {}): void {
  put('sessions/s1', { phase: 'active', currentTurn: 1, ...fields });
}

function gm(uid = 'u1', instanceId = 'gm-1', fields: Fields = {}): void {
  put(`sessions/s1/players/${uid}`, { uid, role: 'gm', connected: true, ...fields });
  put(`sessions/s1/gmInstances/${instanceId}`, { uid, connected: true, lastSeenAt: new Date() });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  session();
  gm();
});

it('marks the private Turn 1 window with a monotonic revision and GM-only audit', async () => {
  await expect(setWolfAttackWindow.run(request())).resolves.toEqual({
    status: 'due', turn: 1, revision: 1,
  });

  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toMatchObject({
    status: 'due', turn: 1, revision: 1, updatedAt: 'server-time',
  });
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current/audit/wolf-1')).toMatchObject({
    type: 'wolf-attack-window', action: 'due', turn: 1, revision: 1, actorUid: 'u1',
  });
  expect(mock.documents.get('sessions/s1/commandReceipts/wolf-1')).toMatchObject({
    fingerprint: {
      action: 'set-wolf-attack-window', sessionId: 's1', requestId: 'wolf-1',
      actorUid: 'u1', instanceId: 'gm-1', expectedRevision: 0,
      payload: { status: 'due' },
    },
    result: { status: 'due', turn: 1, revision: 1 },
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('requires a due marker before resolving and permits deferred Turn 2 recovery', async () => {
  await expect(setWolfAttackWindow.run(request({ ...baseData, status: 'deferred', requestId: 'wolf-defer' })))
    .resolves.toEqual({ status: 'deferred', turn: 2, revision: 1 });

  session({ currentTurn: 2 });
  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-due-2', expectedRevision: 1,
  }))).resolves.toEqual({ status: 'due', turn: 2, revision: 2 });
  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-resolve-2', expectedRevision: 2, status: 'resolved',
  }))).resolves.toEqual({ status: 'resolved', turn: 2, revision: 3 });
});

it('replays an exact request without a second projection or audit write', async () => {
  await setWolfAttackWindow.run(request());
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(setWolfAttackWindow.run(request())).resolves.toEqual({
    status: 'due', turn: 1, revision: 1,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects stale opposite actions without changing the private marker', async () => {
  await setWolfAttackWindow.run(request());
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-stale', expectedRevision: 0, status: 'deferred',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1/wolfAttackWindow/current')).toMatchObject({
    status: 'due', turn: 1, revision: 1,
  });
});

it('rejects a stale same-status retry without writing a receipt', async () => {
  await setWolfAttackWindow.run(request());
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(setWolfAttackWindow.run(request({
    ...baseData, requestId: 'wolf-stale-same-status', expectedRevision: 0, status: 'due',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.documents.has('sessions/s1/commandReceipts/wolf-stale-same-status')).toBe(false);
});

it('rejects every legacy M1 request namespace collision before any write', async () => {
  const requestId = 'wolf-legacy-collision';
  const legacyPaths = [
    `sessions/s1/setupMutationRequests/${requestId}`,
    `sessions/s1/gmResponsibilityRequests/${requestId}`,
    `sessions/s1/seatMutationRequests/${requestId}`,
    `sessions/s1/loyaltyAssignmentRequests/${requestId}`,
    `sessionStartRequests/s1_${requestId}`,
    `sessions/s1/events/setup-confirm-${requestId}`,
    `sessions/s1/events/gm-responsibility-${requestId}`,
    `sessions/s1/events/start-${requestId}`,
    `sessions/s1/events/seat-claim-${requestId}`,
    `sessions/s1/events/seat-release-${requestId}`,
    `sessions/s1/events/${requestId}`,
    `sessions/s1/events/press-availability-${requestId}`,
  ];

  for (const path of legacyPaths) {
    mock.documents.clear();
    mock.update.mockClear();
    mock.set.mockClear();
    session();
    gm();
    put(path, { legacy: true });

    await expect(setWolfAttackWindow.run(request({ ...baseData, requestId })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.documents.has('sessions/s1/wolfAttackWindow/current')).toBe(false);
    expect(mock.documents.has(`sessions/s1/commandReceipts/${requestId}`)).toBe(false);
  }
});

it('denies non-GM, stale instances, malformed, closed, and out-of-window commands', async () => {
  await expect(setWolfAttackWindow.run(request({ ...baseData, status: 'later' }))).rejects
    .toMatchObject({ code: 'invalid-argument' });
  session({ phase: 'closed' });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  session({ phase: 'active', currentTurn: 0 });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  session({ currentTurn: 3 });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  session({ phase: 'lobby', currentTurn: 1 });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  session({ currentTurn: 1 });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u2', connected: true });
  await expect(setWolfAttackWindow.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(setWolfAttackWindow.run({ data: baseData } as CallableRequest<typeof baseData>))
    .rejects.toMatchObject({ code: 'unauthenticated' });
  expect(mock.update).not.toHaveBeenCalled();
});
