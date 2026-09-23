import { createHash } from 'node:crypto';
import type { TaskOptions } from 'firebase-admin/functions';
import type { TurnPhase } from './turnZero';

/** Leave retry/retention headroom below Cloud Tasks' 30-day scheduling horizon. */
export const AIRSPACE_CLOSURE_MAX_TASK_HORIZON_MS = 24 * 24 * 60 * 60_000;
export const AIRSPACE_CLOSURE_PAUSE_RECHECK_MS = 5 * 60_000;
const PAUSE_WAKE_INDEX_START = 1_000_000_000;
const RECONCILE_RECOVERY_WAKE_INDEX_START = 2_000_000_000;
const RECONCILE_RECOVERY_ID_WINDOW_MS = 24 * 60 * 60_000;

export type AirspaceClosureTask = Readonly<{
  sessionId: string;
  cycle: number;
  deadlineAt: string;
  wakeIndex: number;
}>;

export type AirspaceClosureTaskPlan = AirspaceClosureTask & Readonly<{
  taskId: string;
  scheduledAtMs: number;
}>;

export type AirspaceClosureTaskDecision =
  | Readonly<{ action: 'stale' }>
  | Readonly<{ action: 'park'; closedAt: string }>
  | Readonly<{ action: 'retry' }>
  | Readonly<{ action: 'reschedule'; plan: AirspaceClosureTaskPlan }>;

/**
 * Return the next bounded wake for an ordinary lifted-airspace deadline.
 * A long GM extension advances through bounded 24-day wakes, with the final task
 * scheduled for the exact authoritative deadline.
 */
export function airspaceClosureTaskPlan(
  sessionId: string,
  currentTurn: number,
  phase: TurnPhase | undefined,
  sessionPhase: string | undefined,
  nowMs = Date.now(),
): AirspaceClosureTaskPlan | undefined {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId) ||
      !Number.isSafeInteger(currentTurn) || currentTurn < 1 ||
      !Number.isSafeInteger(nowMs) || nowMs < 0 ||
      sessionPhase !== 'active' || !phase || phase.turn !== currentTurn ||
      phase.airspace.state !== 'lifted' || phase.timerPause !== undefined) {
    return undefined;
  }
  const deadlineMs = Date.parse(phase.openAirspaceEndsAt);
  if (!Number.isFinite(deadlineMs) || new Date(deadlineMs).toISOString() !== phase.openAirspaceEndsAt) {
    return undefined;
  }

  const delayMs = Math.max(0, deadlineMs - nowMs);
  const wakeIndex = Math.max(0, Math.ceil(delayMs / AIRSPACE_CLOSURE_MAX_TASK_HORIZON_MS) - 1);
  const scheduledAtMs = delayMs === 0
    ? nowMs
    : deadlineMs - wakeIndex * AIRSPACE_CLOSURE_MAX_TASK_HORIZON_MS;
  if (scheduledAtMs - nowMs > AIRSPACE_CLOSURE_MAX_TASK_HORIZON_MS) return undefined;

  const payload: AirspaceClosureTask = {
    sessionId,
    cycle: currentTurn,
    deadlineAt: phase.openAirspaceEndsAt,
    wakeIndex,
  };
  return { ...payload, taskId: airspaceClosureTaskId(payload), scheduledAtMs };
}

/**
 * Keep one bounded server wake alive while the phase timer is intentionally
 * paused. Resuming normally enqueues the exact shifted deadline; this watch
 * lets a task recover that deadline if the session-write trigger is delayed.
 */
export function airspaceClosurePauseWatchPlan(
  sessionId: string,
  currentTurn: number,
  phase: TurnPhase | undefined,
  sessionPhase: string | undefined,
  nowMs = Date.now(),
  previousWakeIndex?: number,
): AirspaceClosureTaskPlan | undefined {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId) ||
      !Number.isSafeInteger(currentTurn) || currentTurn < 1 ||
      !Number.isSafeInteger(nowMs) || nowMs < 0 ||
      sessionPhase !== 'active' || !phase || phase.turn !== currentTurn ||
      phase.airspace.state !== 'lifted' || phase.timerPause === undefined) {
    return undefined;
  }
  const deadlineMs = Date.parse(phase.openAirspaceEndsAt);
  if (!Number.isFinite(deadlineMs) || new Date(deadlineMs).toISOString() !== phase.openAirspaceEndsAt) {
    return undefined;
  }
  const wakeIndex = previousWakeIndex !== undefined && previousWakeIndex >= PAUSE_WAKE_INDEX_START
    ? previousWakeIndex + 1
    : PAUSE_WAKE_INDEX_START;
  const scheduledAtMs = nowMs + AIRSPACE_CLOSURE_PAUSE_RECHECK_MS;
  if (!Number.isSafeInteger(wakeIndex) || !Number.isSafeInteger(scheduledAtMs)) return undefined;
  const payload: AirspaceClosureTask = {
    sessionId,
    cycle: currentTurn,
    deadlineAt: phase.openAirspaceEndsAt,
    wakeIndex,
  };
  return { ...payload, taskId: airspaceClosureTaskId(payload), scheduledAtMs };
}

/**
 * Schedule missing ordinary tasks found by the periodic scanner. Due windows
 * use one deterministic recovery ID per day so a task that aged out of Cloud
 * Tasks' retention can be recreated after task-name deduplication expires.
 */
export function airspaceClosureReconcileTaskPlan(
  sessionId: string,
  currentTurn: number,
  phase: TurnPhase | undefined,
  sessionPhase: string | undefined,
  nowMs = Date.now(),
): AirspaceClosureTaskPlan | undefined {
  const ordinary = airspaceClosureTaskPlan(sessionId, currentTurn, phase, sessionPhase, nowMs);
  if (!ordinary) {
    return airspaceClosurePauseWatchPlan(sessionId, currentTurn, phase, sessionPhase, nowMs);
  }
  if (Date.parse(ordinary.deadlineAt) > nowMs) return ordinary;
  const recoveryWakeIndex = RECONCILE_RECOVERY_WAKE_INDEX_START +
    Math.floor(nowMs / RECONCILE_RECOVERY_ID_WINDOW_MS);
  const payload: AirspaceClosureTask = {
    sessionId: ordinary.sessionId,
    cycle: ordinary.cycle,
    deadlineAt: ordinary.deadlineAt,
    wakeIndex: recoveryWakeIndex,
  };
  return {
    ...payload,
    taskId: airspaceClosureTaskId(payload),
    scheduledAtMs: nowMs,
  };
}

export function parseAirspaceClosureTask(value: unknown): AirspaceClosureTask | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 4 ||
      Object.keys(value).some((key) => !['sessionId', 'cycle', 'deadlineAt', 'wakeIndex'].includes(key)) ||
      typeof value.sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.sessionId) ||
      typeof value.cycle !== 'number' || !Number.isSafeInteger(value.cycle) || value.cycle < 1 ||
      typeof value.deadlineAt !== 'string' || !Number.isFinite(Date.parse(value.deadlineAt)) ||
      new Date(value.deadlineAt).toISOString() !== value.deadlineAt ||
      typeof value.wakeIndex !== 'number' || !Number.isSafeInteger(value.wakeIndex) || value.wakeIndex < 0) {
    return undefined;
  }
  return {
    sessionId: value.sessionId,
    cycle: value.cycle,
    deadlineAt: value.deadlineAt,
    wakeIndex: value.wakeIndex,
  };
}

/**
 * Recheck a queued wake against the current session before it mutates state.
 * Extensions, pauses, attacks, and cycle changes invalidate old task payloads.
 */
export function airspaceClosureTaskDecision(
  task: AirspaceClosureTask,
  currentTaskId: string,
  phase: TurnPhase | undefined,
  currentTurn: number,
  sessionPhase: string | undefined,
  nowMs = Date.now(),
): AirspaceClosureTaskDecision {
  if (currentTaskId !== airspaceClosureTaskId(task) || !phase ||
      phase.turn !== currentTurn || currentTurn < 1 ||
      sessionPhase !== 'active' || phase.airspace.state !== 'lifted') {
    return { action: 'stale' };
  }
  const deadlineMs = Date.parse(phase.openAirspaceEndsAt);
  if (!Number.isFinite(deadlineMs) ||
      new Date(deadlineMs).toISOString() !== phase.openAirspaceEndsAt ||
      !Number.isFinite(Date.parse(task.deadlineAt)) ||
      new Date(Date.parse(task.deadlineAt)).toISOString() !== task.deadlineAt ||
      !Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { action: 'stale' };
  }
  if (task.cycle !== currentTurn) {
    const successor = phase.timerPause !== undefined
      ? airspaceClosurePauseWatchPlan(task.sessionId, currentTurn, phase, sessionPhase, nowMs)
      : airspaceClosureTaskPlan(task.sessionId, currentTurn, phase, sessionPhase, nowMs);
    return successor ? { action: 'reschedule', plan: successor } : { action: 'stale' };
  }
  if (phase.timerPause !== undefined) {
    const paused = airspaceClosurePauseWatchPlan(
      task.sessionId, currentTurn, phase, sessionPhase, nowMs, task.wakeIndex,
    );
    return paused ? { action: 'reschedule', plan: paused } : { action: 'stale' };
  }
  if (nowMs >= deadlineMs) return { action: 'park', closedAt: phase.openAirspaceEndsAt };

  const next = airspaceClosureTaskPlan(task.sessionId, currentTurn, phase, sessionPhase, nowMs);
  if (!next) return { action: 'stale' };
  if (next.taskId === currentTaskId) return { action: 'retry' };
  return { action: 'reschedule', plan: next };
}

export async function enqueueAirspaceClosureTask(
  queue: Pick<AirspaceClosureTaskQueue, 'enqueue'>,
  plan: AirspaceClosureTaskPlan,
): Promise<void> {
  try {
    await queue.enqueue({
      sessionId: plan.sessionId,
      cycle: plan.cycle,
      deadlineAt: plan.deadlineAt,
      wakeIndex: plan.wakeIndex,
    }, {
      id: plan.taskId,
      scheduleTime: new Date(plan.scheduledAtMs),
    });
  } catch (cause) {
    if (isRecord(cause) && cause.code === 'functions/task-already-exists') return;
    throw cause;
  }
}

export function airspaceClosureEventId(cycle: number, deadlineAt: string): string {
  const digest = createHash('sha256').update(deadlineAt).digest('hex').slice(0, 16);
  return `airspace-close-${cycle}-${digest}`;
}

export interface AirspaceClosureTaskQueue {
  enqueue(data: AirspaceClosureTask, options: Pick<TaskOptions, 'id' | 'scheduleTime'>): Promise<void>;
}

function airspaceClosureTaskId(task: AirspaceClosureTask): string {
  const digest = createHash('sha256')
    .update(`${task.sessionId}\0${task.cycle}\0${task.deadlineAt}\0${task.wakeIndex}`)
    .digest('hex')
    .slice(0, 40);
  return `airspace-close_${digest}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
