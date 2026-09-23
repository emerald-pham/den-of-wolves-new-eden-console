import { beforeEach, expect, it, vi } from 'vitest';
import { airspaceClosureEventId } from './airspaceClosureTasks';
import { AIRSPACE_CLOSURE_RECONCILE_PAGE_SIZE } from './airspaceClosureTaskReconciler';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const queue = { enqueue: vi.fn(async (_data: unknown, _options: unknown) => undefined) };
  const ref = (path: string, isCollection = false, query: {
    after?: string;
    limit?: number;
  } = {}) => ({
    path,
    id: path.split('/').at(-1) ?? '',
    isCollection,
    collection: (name: string) => ref(`${path}/${name}`, true),
    where: () => ref(path, true, query),
    orderBy: () => ref(path, true, query),
    startAfter: (after: string) => ref(path, true, { ...query, after }),
    limit: (limit: number) => ref(path, true, { ...query, limit }),
    get: async () => isCollection ? querySnapshot(path, query) : snapshot(path),
    set: async (fields: Fields) => documents.set(path, { ...fields }),
  });
  const snapshot = (path: string, fields = documents.get(path)) => ({
    exists: fields !== undefined,
    id: path.split('/').at(-1) ?? '',
    ref: ref(path),
    get: (field: string) => fields?.[field],
    data: () => fields,
  });
  const querySnapshot = (path: string, query: { after?: string; limit?: number } = {}) => ({
    docs: [...documents.entries()]
      .filter(([candidate]) => candidate.startsWith(`${path}/`) && candidate.slice(path.length + 1).indexOf('/') < 0)
      .filter(([, fields]) => path !== 'sessions' || fields.phase === 'active')
      .filter(([candidate]) => !query.after || candidate.slice(path.length + 1) > query.after)
      .sort(([left], [right]) => {
        const leftId = left.slice(path.length + 1);
        const rightId = right.slice(path.length + 1);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      })
      .slice(0, query.limit)
      .map(([candidate, fields]) => snapshot(candidate, fields)),
  });
  const db = {
    doc: (path: string) => ref(path),
    collection: (path: string) => ref(path, true),
  };
  return { documents, queue, db };
});

vi.mock('firebase-admin/firestore', () => ({
  FieldPath: { documentId: () => '__name__' },
  FieldValue: { serverTimestamp: () => 'server-time' },
  getFirestore: () => mock.db,
}));
vi.mock('firebase-admin/functions', () => ({
  getFunctions: () => ({ taskQueue: () => mock.queue }),
}));
vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (options: unknown, handler: () => unknown) => ({ options, run: handler }),
}));

import {
  reconcileAirspaceClosureTaskPage,
  reconcileAirspaceClosureTasks,
} from './airspaceClosureTaskReconciler';
import { airspaceClosureTaskPlan } from './airspaceClosureTasks';

const nowMs = Date.parse('2026-09-23T12:00:00.000Z');
const deadlineAt = new Date(nowMs + 15 * 60_000).toISOString();

function turnPhase(openAirspaceEndsAt = deadlineAt) {
  return {
    turn: 2,
    teamPhaseEndsAt: new Date(nowMs - 5 * 60_000).toISOString(),
    openAirspaceEndsAt,
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  };
}

function seedActiveSession(sessionId: string, openAirspaceEndsAt = deadlineAt) {
  mock.documents.set(`sessions/${sessionId}`, {
    phase: 'active',
    currentTurn: 2,
    turnPhase: turnPhase(openAirspaceEndsAt),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(nowMs));
  mock.documents.clear();
  mock.queue.enqueue.mockReset();
  mock.queue.enqueue.mockResolvedValue(undefined);
});

it('backfills an unchanged active window without waiting for a session write or client', async () => {
  seedActiveSession('session-live');
  const expected = airspaceClosureTaskPlan('session-live', 2, turnPhase(), 'active', nowMs)!;

  const result = await reconcileAirspaceClosureTaskPage();

  expect(result).toMatchObject({ scanned: 1, enqueued: 1, nextSessionId: null });
  expect(mock.queue.enqueue).toHaveBeenCalledWith({
    sessionId: 'session-live', cycle: 2, deadlineAt, wakeIndex: expected.wakeIndex,
  }, { id: expected.taskId, scheduleTime: new Date(expected.scheduledAtMs) });
});

it('uses deterministic task IDs so repeated scans are idempotent', async () => {
  seedActiveSession('session-live');
  const expected = airspaceClosureTaskPlan('session-live', 2, turnPhase(), 'active', nowMs)!;
  mock.queue.enqueue
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce({ code: 'functions/task-already-exists' });

  await expect(reconcileAirspaceClosureTaskPage()).resolves.toMatchObject({ enqueued: 1 });
  await expect(reconcileAirspaceClosureTaskPage()).resolves.toMatchObject({ enqueued: 1 });

  expect(mock.queue.enqueue).toHaveBeenCalledTimes(2);
  expect(mock.queue.enqueue.mock.calls.map(([, options]) => (options as { id: string }).id))
    .toEqual([expected.taskId, expected.taskId]);
});

it('drains active sessions through bounded pages and eventually wraps the backlog cursor', async () => {
  for (let index = 0; index <= AIRSPACE_CLOSURE_RECONCILE_PAGE_SIZE; index += 1) {
    seedActiveSession(`session-${String(index).padStart(3, '0')}`);
  }

  const first = await reconcileAirspaceClosureTaskPage();
  expect(first).toMatchObject({
    scanned: AIRSPACE_CLOSURE_RECONCILE_PAGE_SIZE,
    enqueued: AIRSPACE_CLOSURE_RECONCILE_PAGE_SIZE,
    nextSessionId: 'session-049',
  });
  expect(mock.queue.enqueue).toHaveBeenCalledTimes(AIRSPACE_CLOSURE_RECONCILE_PAGE_SIZE);

  const second = await reconcileAirspaceClosureTaskPage();
  expect(second).toMatchObject({ scanned: 1, enqueued: 1, nextSessionId: null });
  expect(mock.queue.enqueue).toHaveBeenCalledTimes(AIRSPACE_CLOSURE_RECONCILE_PAGE_SIZE + 1);
});

it('schedules a due unqueued session immediately and skips an already projected close', async () => {
  const dueAt = new Date(nowMs - 60_000).toISOString();
  seedActiveSession('session-due', dueAt);
  const plan = airspaceClosureTaskPlan('session-due', 2, turnPhase(dueAt), 'active', nowMs)!;

  const scheduled = await reconcileAirspaceClosureTaskPage();
  expect(scheduled.enqueued).toBe(1);
  expect(mock.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ deadlineAt: dueAt }), {
    id: plan.taskId,
    scheduleTime: new Date(nowMs),
  });

  mock.queue.enqueue.mockClear();
  mock.documents.set(`sessions/session-due/events/${airspaceClosureEventId(2, dueAt)}`, {
    type: 'airspace-closure-parking', turn: 2, serverTime: dueAt,
  });
  await expect(reconcileAirspaceClosureTaskPage()).resolves.toMatchObject({ scanned: 1, enqueued: 0 });
  expect(mock.queue.enqueue).not.toHaveBeenCalled();
});

it('does not advance its page cursor when task enqueue fails', async () => {
  seedActiveSession('session-live');
  mock.queue.enqueue.mockRejectedValueOnce({ code: 'functions/permission-denied' });

  await expect(reconcileAirspaceClosureTaskPage()).rejects.toMatchObject({
    code: 'functions/permission-denied',
  });
  expect(mock.documents.has('system/airspaceClosureReconciler')).toBe(false);

  mock.queue.enqueue.mockResolvedValueOnce(undefined);
  await expect(reconcileAirspaceClosureTaskPage()).resolves.toMatchObject({ scanned: 1, enqueued: 1 });
  expect(mock.documents.get('system/airspaceClosureReconciler')).toMatchObject({
    afterSessionId: null,
  });
});

it('runs on a bounded serial schedule for pre-deploy and delayed-trigger recovery', () => {
  expect((reconcileAirspaceClosureTasks as {
    options: Record<string, unknown>;
  }).options).toMatchObject({
    schedule: 'every 5 minutes',
    maxInstances: 1,
    concurrency: 1,
    timeoutSeconds: 120,
  });
});
