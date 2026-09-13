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
  const collection = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const get = vi.fn(async (target: { path: string }) => {
    if (target.path === 'sessions/s1/players' || target.path === 'sessions/s1/secrets') {
      const prefix = `${target.path}/`;
      const docs = [...documents.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path]) => snapshot(path));
      return { exists: true, docs };
    }
    return snapshot(target.path);
  });
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const del = vi.fn((target: { path: string }) => {
    documents.delete(target.path);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set, delete: del }));
  return { documents, get, update, set, delete: del, runTransaction, db: { doc: ref, collection, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    private readonly value: Date;
    constructor(value: Date) { this.value = value; }
    toDate() { return this.value; }
    static now() { return new MockTimestamp(new Date('2026-09-07T12:00:00.000Z')); }
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

import { deliverWolfCultIntelligence } from './index';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'cult-1',
  expectedRevision: 0,
  fortressCoordinate: '4454',
  suppliesCoordinate: '1964',
  agentUid: 'u3',
  codeWord: 'NIGHTFALL',
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', {
    phase: 'active',
    currentTurn: 1,
    wolfCultEnabled: true,
    playerCount: 14,
    activeRoleIds: ['admiral', 'icebreaker-miner'],
  });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/players/u2', { uid: 'u2', role: 'player', connected: true, assignedRoleId: 'admiral' });
  put('sessions/s1/players/u3', { uid: 'u3', role: 'player', connected: true, assignedRoleId: 'icebreaker-miner' });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'wolf-cult', suspicion: 15 },
  });
  put('sessions/s1/secrets/loyalty-u3', {
    visibleToUids: ['u3'],
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.delete.mockClear();
  provision();
});

it('delivers the four source-defined facts to the current Cult holder and the GM projection', async () => {
  await expect(deliverWolfCultIntelligence.run(request())).resolves.toEqual({
    status: 'committed',
    sessionId: 's1',
    recipientUid: 'u2',
    revision: 1,
    fortressCoordinate: '4454',
    suppliesCoordinate: '1964',
    agentUid: 'u3',
    codeWord: 'NIGHTFALL',
    label: 'WOLF INTEL',
  });
  expect(mock.documents.get('sessions/s1/wolfCultIntelligence/u2')).toMatchObject({
    type: 'wolf-cult-intelligence',
    recipientUid: 'u2',
    visibleToUids: ['u2'],
    fortressCoordinate: '4454',
    suppliesCoordinate: '1964',
    agentUid: 'u3',
    codeWord: 'NIGHTFALL',
  });
  expect(mock.documents.get('sessions/s1/wolfCultIntelligence/current')).toMatchObject({
    type: 'wolf-cult-intelligences',
    recipientUid: 'u2',
    visibleToUids: ['u1'],
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('replays an exact request without a second private projection write', async () => {
  await deliverWolfCultIntelligence.run(request());
  mock.set.mockClear();
  mock.delete.mockClear();
  await expect(deliverWolfCultIntelligence.run(request())).resolves.toMatchObject({
    status: 'replayed', revision: 1, recipientUid: 'u2',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('rejects non-facilitators, stale revisions, wrong agents, and malformed loyalty before mutation', async () => {
  await expect(deliverWolfCultIntelligence.run(request({ ...baseData, requestId: 'player' }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(deliverWolfCultIntelligence.run(request({ ...baseData, requestId: 'wrong-agent', agentUid: 'u2' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(deliverWolfCultIntelligence.run(request({ ...baseData, requestId: 'bad-coordinate', fortressCoordinate: '9999' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  put('sessions/s1/wolfCultIntelligence/current', {
    type: 'wolf-cult-intelligences', sessionId: 's1', recipientUid: 'u2', revision: 'spoofed',
  });
  await expect(deliverWolfCultIntelligence.run(request({ ...baseData, requestId: 'malformed-current' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.delete('sessions/s1/wolfCultIntelligence/current');
  await deliverWolfCultIntelligence.run(request());
  mock.set.mockClear();
  await expect(deliverWolfCultIntelligence.run(request({ ...baseData, requestId: 'stale', expectedRevision: 0 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();

  mock.documents.delete('sessions/s1/secrets/loyalty-u2');
  mock.set.mockClear();
  await expect(deliverWolfCultIntelligence.run(request({ ...baseData, requestId: 'missing-cult', expectedRevision: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
});
