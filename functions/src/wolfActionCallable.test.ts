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
    callback({ get, set, update, delete: del }));
  return {
    documents, get, set, update, delete: del, runTransaction,
    db: { doc: ref, collection: ref, runTransaction },
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'deleted' },
  Timestamp: class MockTimestamp {
    private readonly value: Date;
    constructor(value: Date) { this.value = value; }
    toDate() { return this.value; }
    toMillis() { return this.value.getTime(); }
    static now() { return new MockTimestamp(new Date('2026-09-20T19:00:00.000Z')); }
    static fromDate(value: Date) { return new MockTimestamp(value); }
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

import { submitWolfAction } from './index';

const baseData = {
  sessionId: 's1', requestId: 'wolf-action-1', expectedCycle: 2,
  action: 'sabotage-console',
};

function request(data: Record<string, unknown> = baseData, uid = 'u2') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', { phase: 'active', currentTurn: 2 });
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: 'dione-engineer',
    replacementRoleId: null, escapeState: null,
  });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });
  put('sessions/s1/secrets/wolf-assignment', {
    visibleToUids: ['gm-1'],
    payload: { type: 'wolf-assignment', roleIds: ['dione-engineer'] },
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  mock.delete.mockClear();
  provision();
});

it('reserves one private source-defined action for the live Wolf cover role', async () => {
  await expect(submitWolfAction.run(request())).resolves.toEqual({
    status: 'committed', type: 'wolf-action-reservation', sessionId: 's1',
    requestId: 'wolf-action-1', cycle: 2, revision: 1,
    action: 'sabotage-console', coverRoleId: 'dione-engineer',
  });
  expect(mock.documents.get('sessions/s1/wolfActionState/u2')).toMatchObject({
    type: 'wolf-action-reservation', actorUid: 'u2', state: 'reserved',
    cycle: 2, revision: 1, action: 'sabotage-console', coverRoleId: 'dione-engineer',
  });
  expect(mock.documents.get('sessions/s1/wolfActionState/u2/audit/wolf-action-1'))
    .toMatchObject({ actorUid: 'u2', cycle: 2, action: 'sabotage-console' });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('replays the exact request without another reservation or audit write', async () => {
  await submitWolfAction.run(request());
  mock.set.mockClear();
  await expect(submitWolfAction.run(request())).resolves.toMatchObject({
    requestId: 'wolf-action-1', cycle: 2, revision: 1,
  });
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a second action in the same cycle and permits one in the next cycle', async () => {
  await submitWolfAction.run(request());
  await expect(submitWolfAction.run(request({
    ...baseData, requestId: 'wolf-action-2', action: 'provide-intel',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  put('sessions/s1', { phase: 'active', currentTurn: 3 });
  await expect(submitWolfAction.run(request({
    ...baseData, requestId: 'wolf-action-3', expectedCycle: 3, action: 'provide-intel',
  }))).resolves.toMatchObject({ cycle: 3, revision: 2, action: 'provide-intel' });
});

it.each([
  ['fleet loyalist', () => put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'], payload: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 0 },
  })],
  ['stale cover assignment', () => put('sessions/s1/secrets/wolf-assignment', {
    visibleToUids: ['gm-1'], payload: { type: 'wolf-assignment', roleIds: ['admiral'] },
  })],
  ['replacement role', () => put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: 'dione-engineer',
    replacementRoleId: 'wolf-commander', escapeState: null,
  })],
  ['destroyed-ship escape', () => put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: 'dione-engineer',
    replacementRoleId: null, escapeState: { status: 'pending' },
  })],
] as const)('rejects a %s without consuming the cycle slot', async (_label, mutate) => {
  mutate();
  await expect(submitWolfAction.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.documents.has('sessions/s1/wolfActionState/u2')).toBe(false);
});

it('rejects stale cycles, unknown actions, and request collisions without mutation', async () => {
  await expect(submitWolfAction.run(request({ ...baseData, expectedCycle: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(submitWolfAction.run(request({ ...baseData, action: 'investigate' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await submitWolfAction.run(request());
  mock.set.mockClear();
  await expect(submitWolfAction.run(request({ ...baseData, action: 'homing-beacon' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
});
