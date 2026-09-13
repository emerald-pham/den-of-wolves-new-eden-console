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

import { authorFacilitatorRuleCall } from './index';

const baseData = {
  sessionId: 's1', instanceId: 'gm-1', requestId: 'call-1', expectedRevision: 0,
  ambiguity: 'Does the shuttle count as docked before the movement step?',
  source: 'Facilitator reference, docking procedure',
  decision: 'Treat it as docked for this turn.', audience: 'gm-only',
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', { phase: 'active' });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/players/u2', { uid: 'u2', role: 'player', connected: true });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  mock.delete.mockClear();
  provision();
});

it('records a GM-only ruling in durable history and audit without a public event', async () => {
  await expect(authorFacilitatorRuleCall.run(request())).resolves.toMatchObject({
    status: 'committed', sessionId: 's1', callId: 'call-1', revision: 1,
    audience: 'gm-only', label: 'FACILITATOR RULE CALL', actorUid: 'u1',
  });
  expect(mock.documents.get('sessions/s1/facilitatorRuleCalls/gm-current')).toMatchObject({
    type: 'facilitator-rule-call', audience: 'gm-only', revision: 1,
  });
  expect(mock.documents.get('sessions/s1/facilitatorRuleCalls/history-call-1')).toMatchObject({
    type: 'facilitator-rule-call', decision: baseData.decision,
  });
  expect(mock.documents.get('sessions/s1/facilitatorRuleCalls/audit-call-1')).toMatchObject({
    type: 'facilitator-rule-call-audit', actorUid: 'u1',
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('writes only the selected player projection for a private audience', async () => {
  await expect(authorFacilitatorRuleCall.run(request({
    ...baseData, requestId: 'call-2', audience: 'selected-player', recipientUid: 'u2',
  }))).resolves.toMatchObject({ audience: 'selected-player', recipientUid: 'u2' });
  expect(mock.documents.get('sessions/s1/facilitatorRuleCalls/recipient-u2')).toMatchObject({
    type: 'facilitator-rule-call', audience: 'selected-player',
    recipientUid: 'u2', visibleToUids: ['u2'],
  });
  expect(mock.documents.get('sessions/s1/facilitatorRuleCalls/recipient-u2')).not.toHaveProperty('actorUid');
  expect(mock.documents.has('sessions/s1/facilitatorRuleCalls/recipient-u1')).toBe(false);
});

it('replays exactly, links supersession, and rejects wrong actor or stale revision', async () => {
  await authorFacilitatorRuleCall.run(request());
  mock.set.mockClear();
  await expect(authorFacilitatorRuleCall.run(request())).resolves.toMatchObject({
    status: 'committed', callId: 'call-1', revision: 1,
  });
  expect(mock.set).not.toHaveBeenCalled();

  await expect(authorFacilitatorRuleCall.run(request({
    ...baseData, requestId: 'call-2', expectedRevision: 1, audience: 'selected-player', recipientUid: 'u2',
    supersedesCallId: 'call-1', decision: 'Use the next movement step instead.',
  }))).resolves.toMatchObject({ status: 'committed', revision: 2, supersedesCallId: 'call-1' });
  expect(mock.documents.get('sessions/s1/facilitatorRuleCalls/history-call-1'))
    .toMatchObject({ supersededByCallId: 'call-2' });

  await expect(authorFacilitatorRuleCall.run(request({ ...baseData, requestId: 'wrong-actor' }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(authorFacilitatorRuleCall.run(request({ ...baseData, requestId: 'stale', expectedRevision: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('rejects a closed session and an inactive selected recipient before writes', async () => {
  put('sessions/s1', { phase: 'closed' });
  await expect(authorFacilitatorRuleCall.run(request({
    ...baseData, requestId: 'closed', audience: 'selected-player', recipientUid: 'u2',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1', { phase: 'active' });
  put('sessions/s1/players/u2', { uid: 'u2', role: 'player', connected: false });
  await expect(authorFacilitatorRuleCall.run(request({
    ...baseData, requestId: 'inactive', audience: 'selected-player', recipientUid: 'u2',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect([...mock.documents.keys()].filter((path) => path.includes('facilitatorRuleCalls'))).toHaveLength(0);
});

it.each([
  {
    name: 'an invalid revision',
    fields: {
      type: 'facilitator-rule-call', sessionId: 's1', callId: 'old', revision: 'one',
      ambiguity: 'Question', source: 'Reference', decision: 'Decision', audience: 'gm-only',
      actorUid: 'u1', label: 'FACILITATOR RULE CALL', createdAt: 'server-time',
    },
  },
  {
    name: 'an invalid supersession pointer',
    fields: {
      type: 'facilitator-rule-call', sessionId: 's1', callId: 'old', revision: 1,
      ambiguity: 'Question', source: 'Reference', decision: 'Decision', audience: 'gm-only',
      actorUid: 'u1', label: 'FACILITATOR RULE CALL', createdAt: 'server-time',
      supersedesCallId: 42,
    },
  },
])('fails closed without writes when current projection has $name', async ({ fields }) => {
  put('sessions/s1/facilitatorRuleCalls/gm-current', fields);
  const before = new Map(mock.documents);
  await expect(authorFacilitatorRuleCall.run(request({
    ...baseData, requestId: 'malformed-current', expectedRevision: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
  expect(mock.documents).toEqual(before);
});
