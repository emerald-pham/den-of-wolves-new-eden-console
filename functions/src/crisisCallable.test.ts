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
    callback({ get, set, update }));
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

import { transitionCrisis } from './index';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'crisis-1',
  expectedRevision: 0,
  crisisId: 'approaching-vessel',
  state: 'draft' as const,
  title: 'Approaching vessel',
  details: 'The facilitator records the table decision here.',
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
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  provision();
});

it('walks the manual crisis lifecycle and publishes only safe member summaries', async () => {
  await expect(transitionCrisis.run(request())).resolves.toMatchObject({
    status: 'committed', sessionId: 's1', crisisId: 'approaching-vessel', state: 'draft', revision: 1,
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
  expect(mock.documents.get('sessions/s1/crisisState/current/audit/crisis-1')).toMatchObject({
    title: baseData.title,
    details: baseData.details,
  });

  const transitions = [
    ['delivered', 1], ['debated', 2], ['resolved', 3], ['announced', 4], ['closed', 5],
  ] as const;
  for (const [state, expectedRevision] of transitions) {
    await expect(transitionCrisis.run(request({
      ...baseData, requestId: `crisis-${state}`, expectedRevision, state,
    }))).resolves.toMatchObject({ status: 'committed', state, revision: expectedRevision + 1 });
  }
  const event = [...mock.documents.entries()].filter(([path]) => path.includes('/events/'))
    .map(([, fields]) => fields)
    .find((fields) => fields.state === 'closed');
  expect(event).toMatchObject({ type: 'crisis-state', state: 'closed', title: baseData.title });
  expect(event).not.toHaveProperty('details');
  const debatedEvent = [...mock.documents.entries()].filter(([path]) => path.includes('/events/'))
    .map(([, fields]) => fields)
    .find((fields) => fields.state === 'debated');
  expect(debatedEvent).toMatchObject({ type: 'crisis-state', state: 'debated', title: baseData.title });
  expect(debatedEvent).not.toHaveProperty('details');
});

it('rejects crisis identifiers longer than the projection bound before any write', async () => {
  await expect(transitionCrisis.run(request({ ...baseData, crisisId: 'x'.repeat(81) })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.documents.has('sessions/s1/crisisState/current')).toBe(false);
});

it('permits an intentionally empty private note without publishing it', async () => {
  await expect(transitionCrisis.run(request({ ...baseData, details: '' }))).resolves.toMatchObject({
    status: 'committed', state: 'draft', revision: 1,
  });
  expect([...mock.documents.values()].some((fields) => fields.type === 'crisis-state' && fields.details === '')).toBe(true);
});

it('supports an explicit escalation branch without inventing an outcome', async () => {
  await transitionCrisis.run(request());
  await transitionCrisis.run(request({ ...baseData, requestId: 'delivered', expectedRevision: 1, state: 'delivered' }));
  await transitionCrisis.run(request({ ...baseData, requestId: 'debated', expectedRevision: 2, state: 'debated' }));
  await expect(transitionCrisis.run(request({
    ...baseData, requestId: 'escalated', expectedRevision: 3, state: 'escalated',
  }))).resolves.toMatchObject({ state: 'escalated', revision: 4 });
  await expect(transitionCrisis.run(request({
    ...baseData, requestId: 'debated-again', expectedRevision: 4, state: 'debated',
  }))).resolves.toMatchObject({ state: 'debated', revision: 5 });
});

it('replays an exact request without a second mutation and rejects authority or CAS violations', async () => {
  await transitionCrisis.run(request());
  mock.set.mockClear();
  await expect(transitionCrisis.run(request())).resolves.toMatchObject({ status: 'committed', state: 'draft', revision: 1 });
  expect(mock.set).not.toHaveBeenCalled();
  await expect(transitionCrisis.run(request({ ...baseData, requestId: 'wrong', expectedRevision: 0, state: 'delivered' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(transitionCrisis.run(request({ ...baseData, requestId: 'actor', expectedRevision: 1 }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(transitionCrisis.run(request({ ...baseData, requestId: 'invalid', expectedRevision: 1, state: 'closed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('starts a new draft only after the prior crisis is closed', async () => {
  await transitionCrisis.run(request());
  for (const [state, expectedRevision] of [
    ['delivered', 1], ['debated', 2], ['resolved', 3], ['announced', 4], ['closed', 5],
  ] as const) {
    await transitionCrisis.run(request({ ...baseData, requestId: `close-${state}`, expectedRevision, state }));
  }
  await expect(transitionCrisis.run(request({
    ...baseData, requestId: 'new-draft', expectedRevision: 6, crisisId: 'disease', state: 'draft',
    title: 'Disease outbreak', details: 'A facilitator-authored note.',
  }))).resolves.toMatchObject({ crisisId: 'disease', state: 'draft', revision: 7 });
  expect(mock.documents.get('sessions/s1/crisisState/current/audit/close-closed')).toMatchObject({
    crisisId: 'approaching-vessel',
    title: baseData.title,
    details: baseData.details,
  });
  expect(mock.documents.get('sessions/s1/crisisState/current/audit/new-draft')).toMatchObject({
    crisisId: 'disease',
    title: 'Disease outbreak',
    details: 'A facilitator-authored note.',
  });
});
