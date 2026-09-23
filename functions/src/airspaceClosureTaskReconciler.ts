import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { turnPhaseState } from './turnZero';
import {
  airspaceClosureEventId,
  airspaceClosureReconcileTaskPlan,
  enqueueAirspaceClosureTask,
} from './airspaceClosureTasks';

export const AIRSPACE_CLOSURE_RECONCILE_PAGE_SIZE = 50;
const TASK_FUNCTION_NAME = 'parkShuttlesAtAirspaceClosure';
const RECONCILE_CURSOR_PATH = 'system/airspaceClosureReconciler';

/**
 * Backfill and repair deterministic deadline tasks for active sessions. The
 * page cursor advances only after every enqueue succeeds, so retries repeat a
 * safe idempotent page and the bounded scan eventually wraps to older sessions.
 */
export async function reconcileAirspaceClosureTaskPage(): Promise<Readonly<{
  scanned: number;
  enqueued: number;
  nextSessionId: string | null;
}>> {
  const db = getFirestore();
  const cursorRef = db.doc(RECONCILE_CURSOR_PATH);
  const cursorSnapshot = await cursorRef.get();
  const storedCursor = cursorSnapshot.get('afterSessionId');
  const afterSessionId = typeof storedCursor === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(storedCursor)
    ? storedCursor
    : undefined;

  let query = db.collection('sessions')
    .where('phase', '==', 'active')
    .orderBy(FieldPath.documentId())
    .limit(AIRSPACE_CLOSURE_RECONCILE_PAGE_SIZE);
  if (afterSessionId) query = query.startAfter(afterSessionId);
  const page = await query.get();
  const nowMs = Date.now();
  const queue = getFunctions().taskQueue(TASK_FUNCTION_NAME);
  let enqueued = 0;

  for (const session of page.docs) {
    const currentTurn = session.get('currentTurn');
    if (typeof currentTurn !== 'number' || !Number.isSafeInteger(currentTurn) || currentTurn < 1) continue;
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== currentTurn) continue;
    const plan = airspaceClosureReconcileTaskPlan(session.id, currentTurn, phase, 'active', nowMs);
    if (!plan) continue;

    if (!phase.timerPause && nowMs >= Date.parse(phase.openAirspaceEndsAt)) {
      const eventRef = db.doc(
        `${session.ref.path}/events/${airspaceClosureEventId(currentTurn, phase.openAirspaceEndsAt)}`,
      );
      const existingEvent = await eventRef.get();
      if (existingEvent.exists) {
        const event = existingEvent.data();
        const parkedShuttleCount = closureDockedVisitCount(
          session.get('shuttleVisitLog'), currentTurn, phase.openAirspaceEndsAt,
        );
        if (!isRecord(event) || event.type !== 'airspace-closure-parking' ||
            event.turn !== currentTurn || event.serverTime !== phase.openAirspaceEndsAt ||
            !Number.isSafeInteger(event.parkedShuttleCount) ||
            event.parkedShuttleCount !== parkedShuttleCount) {
          logger.error('Skipped an active session with conflicting airspace-closure event authority.', {
            sessionId: session.id,
            cycle: currentTurn,
            deadlineAt: phase.openAirspaceEndsAt,
          });
          continue;
        }
        continue;
      }
    }

    await enqueueAirspaceClosureTask(queue, plan);
    enqueued += 1;
  }

  const nextSessionId = page.docs.length === AIRSPACE_CLOSURE_RECONCILE_PAGE_SIZE
    ? page.docs.at(-1)?.id ?? null
    : null;
  await cursorRef.set({
    afterSessionId: nextSessionId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('Reconciled airspace-closure task page.', {
    scanned: page.docs.length,
    enqueued,
    nextSessionId,
  });
  return { scanned: page.docs.length, enqueued, nextSessionId };
}

/** Periodic safety net for pre-deploy windows and delayed/lost Firestore events. */
export const reconcileAirspaceClosureTasks = onSchedule({
  region: 'us-central1',
  schedule: 'every 5 minutes',
  timeZone: 'UTC',
  maxInstances: 1,
  concurrency: 1,
  timeoutSeconds: 120,
  retryCount: 3,
  maxRetrySeconds: 600,
  minBackoffSeconds: 30,
  maxBackoffSeconds: 300,
  maxDoublings: 3,
}, async () => {
  await reconcileAirspaceClosureTaskPage();
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function closureDockedVisitCount(value: unknown, cycle: number, closedAt: string): number | undefined {
  if (value === undefined) return 0;
  if (!Array.isArray(value)) return undefined;
  const prefix = `airspace-close-${cycle}-`;
  let count = 0;
  for (const visit of value) {
    if (!isRecord(visit)) return undefined;
    if (typeof visit.id !== 'string' || !visit.id.startsWith(prefix)) continue;
    if (typeof visit.shuttleId !== 'string' || typeof visit.shipId !== 'string' ||
        typeof visit.action !== 'string' || typeof visit.occurredAt !== 'string') return undefined;
    if (visit.id.endsWith('-docked') && visit.action === 'docked' && visit.occurredAt === closedAt) count += 1;
  }
  return count;
}
