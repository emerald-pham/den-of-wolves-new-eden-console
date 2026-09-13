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
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update: set, delete: (target: { path: string }) => documents.delete(target.path) }));
  return { documents, get, set, runTransaction, db: { doc: ref, runTransaction } };
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

import { recordZealotryResponse } from './index';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'response-1',
  expectedRevision: 3,
  crisisId: 'zealotry-1',
  actions: ['pressure', 'investigate'],
  rationale: 'The facilitator wants to increase scrutiny without deciding a binding law.',
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', { phase: 'active', currentTurn: 2 });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/crisisState/current', {
    type: 'crisis-state', sessionId: 's1', crisisId: 'zealotry-1',
    crisisKind: 'religious-zealotry', state: 'debated', revision: 3,
    title: 'Religious zealotry', details: 'The movement is growing.',
  });
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 9,
    entries: [{ uid: 'u2', kind: 'universal-arbour', suspicion: 4 }],
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  provision();
});

it('records a source-approved combination in the GM-only projection and preserves history', async () => {
  await expect(recordZealotryResponse.run(request())).resolves.toEqual({
    status: 'committed', sessionId: 's1', crisisId: 'zealotry-1', crisisRevision: 3,
    revision: 1, actions: ['pressure', 'investigate'],
    rationale: baseData.rationale, loyaltyCensusRevision: 9, label: 'ZEALOTRY RESPONSE',
  });
  expect(mock.documents.get('sessions/s1/zealotryResponses/current')).toMatchObject({
    type: 'zealotry-response', state: 'debated', crisisId: 'zealotry-1',
    crisisRevision: 3, revision: 1, actions: ['pressure', 'investigate'],
    rationale: baseData.rationale, loyaltyCensusRevision: 9, actorUid: 'u1',
  });
  expect(mock.documents.get('sessions/s1/zealotryResponses/history-response-1')).toMatchObject({
    crisisId: 'zealotry-1', actions: ['pressure', 'investigate'],
  });
  expect(mock.documents.get('sessions/s1/zealotryResponses/audit-response-1')).toMatchObject({
    type: 'zealotry-response', action: 'record', requestId: 'response-1',
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('records a custom response without fabricating a census revision', async () => {
  mock.documents.delete('sessions/s1/loyaltyCensus/current');
  await expect(recordZealotryResponse.run(request({
    ...baseData, requestId: 'custom', actions: [],
    customResponse: 'Quietly ask the local councils to mediate.', rationale: '',
  }))).resolves.toMatchObject({
    status: 'committed', actions: [],
    customResponse: 'Quietly ask the local councils to mediate.',
    loyaltyCensusRevision: null,
  });
  expect(mock.documents.get('sessions/s1/zealotryResponses/current')).toMatchObject({ loyaltyCensusRevision: null });
});

it('replays the exact request and rejects malformed choices, wrong actor, stale crisis and non-debated stages', async () => {
  await recordZealotryResponse.run(request());
  mock.set.mockClear();
  await expect(recordZealotryResponse.run(request())).resolves.toMatchObject({ status: 'committed', revision: 1 });
  expect(mock.set).not.toHaveBeenCalled();
  await expect(recordZealotryResponse.run(request({ ...baseData, requestId: 'duplicate', actions: ['leave', 'leave'] })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(recordZealotryResponse.run(request({ ...baseData, requestId: 'empty', actions: [] })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(recordZealotryResponse.run(request({ ...baseData, requestId: 'actor' }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(recordZealotryResponse.run(request({ ...baseData, requestId: 'stale', expectedRevision: 2 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1/crisisState/current', {
    type: 'crisis-state', sessionId: 's1', crisisId: 'zealotry-1',
    crisisKind: 'religious-zealotry', state: 'resolved', revision: 4,
  });
  await expect(recordZealotryResponse.run(request({ ...baseData, requestId: 'resolved', expectedRevision: 4 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('does not copy census identities or suspicion into the response documents', async () => {
  await recordZealotryResponse.run(request());
  const serialized = JSON.stringify([
    mock.documents.get('sessions/s1/zealotryResponses/current'),
    mock.documents.get('sessions/s1/zealotryResponses/history-response-1'),
    mock.documents.get('sessions/s1/zealotryResponses/audit-response-1'),
  ]);
  expect(serialized).not.toContain('u2');
  expect(serialized).not.toContain('universal-arbour');
  expect(serialized).not.toContain('suspicion');
});
