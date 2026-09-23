import { expect, it, vi } from 'vitest';
import {
  AIRSPACE_CLOSURE_MAX_TASK_HORIZON_MS,
  AIRSPACE_CLOSURE_PAUSE_RECHECK_MS,
  airspaceClosurePauseWatchPlan,
  airspaceClosureTaskDecision,
  airspaceClosureTaskPlan,
  enqueueAirspaceClosureTask,
  parseAirspaceClosureTask,
} from './airspaceClosureTasks';
import type { TurnPhase } from './turnZero';

const cycle = 2;
const deadlineMs = Date.parse('2026-09-23T12:30:00.000Z');
const deadlineAt = new Date(deadlineMs).toISOString();

function phase(fields: Record<string, unknown> = {}): TurnPhase {
  return {
    turn: cycle,
    teamPhaseEndsAt: '2026-09-23T12:10:00.000Z',
    openAirspaceEndsAt: deadlineAt,
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    ...fields,
  } as TurnPhase;
}

it('schedules the ordinary closure task at the exact open-airspace deadline', () => {
  const plan = airspaceClosureTaskPlan('session-a', cycle, phase(), 'active', deadlineMs - 20 * 60_000);

  expect(plan).toMatchObject({
    sessionId: 'session-a',
    cycle,
    deadlineAt,
    scheduledAtMs: deadlineMs,
    wakeIndex: 0,
  });
  expect(plan?.taskId).toMatch(/^airspace-close_[a-f0-9]{40}$/);
});

it('rolls deadlines beyond the Cloud Tasks horizon forward in bounded wakes', () => {
  const longDeadlineMs = deadlineMs + 65 * 24 * 60 * 60_000;
  const longDeadlineAt = new Date(longDeadlineMs).toISOString();
  const first = airspaceClosureTaskPlan('session-a', cycle, phase({ openAirspaceEndsAt: longDeadlineAt }), 'active', deadlineMs);
  expect(first?.scheduledAtMs).toBeLessThanOrEqual(deadlineMs + AIRSPACE_CLOSURE_MAX_TASK_HORIZON_MS);
  expect(first?.scheduledAtMs).toBeGreaterThan(deadlineMs);

  const next = airspaceClosureTaskPlan(
    'session-a', cycle, phase({ openAirspaceEndsAt: longDeadlineAt }), 'active', first!.scheduledAtMs,
  );
  expect(next?.scheduledAtMs).toBeLessThanOrEqual(first!.scheduledAtMs + AIRSPACE_CLOSURE_MAX_TASK_HORIZON_MS);
  expect(next?.scheduledAtMs).toBeGreaterThan(first!.scheduledAtMs);
  expect(next?.wakeIndex).toBe(first!.wakeIndex - 1);
});

it.each([
  ['wrong cycle', phase(), 'active', cycle + 1],
  ['restricted airspace', phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: false } }), 'active', cycle],
  ['paused window', phase({ timerPause: { window: 'open', remainingMs: 1, pausedAt: deadlineAt } }), 'active', cycle],
  ['terminal session', phase(), 'debrief', cycle],
])('does not schedule for %s', (_label, currentPhase, sessionPhase, currentTurn) => {
  expect(airspaceClosureTaskPlan(
    'session-a', currentTurn as number, currentPhase, sessionPhase as string, deadlineMs - 60_000,
  )).toBeUndefined();
});

it('reconciles initial open, extension, pause/resume, attack override, and cycle changes', () => {
  const now = deadlineMs - 60_000;
  const restricted = phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: false } });
  expect(airspaceClosureTaskPlan('session-a', cycle, restricted, 'active', now)).toBeUndefined();

  const openTask = airspaceClosureTaskPlan('session-a', cycle, phase(), 'active', now)!;
  expect(openTask.scheduledAtMs).toBe(deadlineMs);

  const extended = phase({ openAirspaceEndsAt: new Date(deadlineMs + 5 * 60_000).toISOString() });
  const extendedTask = airspaceClosureTaskPlan('session-a', cycle, extended, 'active', now)!;
  expect(extendedTask.taskId).not.toBe(openTask.taskId);
  expect(airspaceClosureTaskDecision(
    openTask, openTask.taskId,
    phase({ timerPause: { window: 'open', remainingMs: 60_000, pausedAt: deadlineAt } }),
    cycle, 'active', deadlineMs,
  )).toMatchObject({ action: 'reschedule' });

  const resumed = phase({ openAirspaceEndsAt: new Date(deadlineMs + 10 * 60_000).toISOString() });
  const resumedTask = airspaceClosureTaskPlan('session-a', cycle, resumed, 'active', now)!;
  expect(resumedTask.taskId).not.toBe(extendedTask.taskId);
  expect(resumedTask.scheduledAtMs).toBe(Date.parse(resumed.openAirspaceEndsAt));

  const attackOverride = phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: false } });
  expect(airspaceClosureTaskPlan('session-a', cycle, attackOverride, 'active', now)).toBeUndefined();
  expect(airspaceClosureTaskPlan('session-a', cycle + 1, phase(), 'active', now)).toBeUndefined();
});

it('keeps a paused phase covered and restores the exact deadline if resume-trigger delivery is missed', () => {
  const pausedPhase = phase({
    timerPause: { window: 'open', remainingMs: 60_000, pausedAt: deadlineAt },
  });
  const original = airspaceClosureTaskPlan('session-a', cycle, phase(), 'active', deadlineMs - 60_000)!;
  const pauseDecision = airspaceClosureTaskDecision(
    original, original.taskId, pausedPhase, cycle, 'active', deadlineMs,
  );
  expect(pauseDecision.action).toBe('reschedule');
  if (pauseDecision.action !== 'reschedule') return;
  expect(pauseDecision.plan.wakeIndex).toBeGreaterThanOrEqual(1_000_000_000);
  expect(pauseDecision.plan.scheduledAtMs).toBe(deadlineMs + AIRSPACE_CLOSURE_PAUSE_RECHECK_MS);

  const resumedPhase = phase({ openAirspaceEndsAt: new Date(deadlineMs + 10 * 60_000).toISOString() });
  const resumeDecision = airspaceClosureTaskDecision(
    pauseDecision.plan, pauseDecision.plan.taskId,
    resumedPhase, cycle, 'active', pauseDecision.plan.scheduledAtMs,
  );
  expect(resumeDecision).toMatchObject({
    action: 'reschedule',
    plan: {
      deadlineAt: resumedPhase.openAirspaceEndsAt,
      scheduledAtMs: Date.parse(resumedPhase.openAirspaceEndsAt),
    },
  });
});

it('schedules the pause safety wake from a phase write', () => {
  const pausedPhase = phase({
    timerPause: { window: 'open', remainingMs: 60_000, pausedAt: deadlineAt },
  });
  const plan = airspaceClosurePauseWatchPlan('session-a', cycle, pausedPhase, 'active', deadlineMs);
  expect(plan).toMatchObject({
    sessionId: 'session-a', cycle, deadlineAt, scheduledAtMs: deadlineMs + AIRSPACE_CLOSURE_PAUSE_RECHECK_MS,
  });
});

it('requeues an obsolete deadline for the current phase and rejects old-cycle jobs', () => {
  const original = airspaceClosureTaskPlan('session-a', cycle, phase(), 'active', deadlineMs - 60_000)!;
  const extendedPhase = phase({ openAirspaceEndsAt: new Date(deadlineMs + 5 * 60_000).toISOString() });

  const extendedDecision = airspaceClosureTaskDecision(
    original, original.taskId, extendedPhase, cycle, 'active', deadlineMs,
  );
  expect(extendedDecision.action).toBe('reschedule');
  if (extendedDecision.action === 'reschedule') {
    expect(extendedDecision.plan.deadlineAt).toBe(extendedPhase.openAirspaceEndsAt);
    expect(extendedDecision.plan.scheduledAtMs).toBe(Date.parse(extendedPhase.openAirspaceEndsAt));
  }
  expect(airspaceClosureTaskDecision(
    original,
    original.taskId,
    extendedPhase,
    cycle,
    'active',
    Date.parse(extendedPhase.openAirspaceEndsAt) + 60_000,
  )).toEqual({ action: 'park', closedAt: extendedPhase.openAirspaceEndsAt });
  expect(airspaceClosureTaskDecision(
    original, original.taskId, phase(), cycle + 1, 'active', deadlineMs,
  )).toEqual({ action: 'stale' });
});

it('re-enqueues a bounded future wake when the current deadline exceeds Cloud Tasks limits', () => {
  const longDeadline = new Date(deadlineMs + 65 * 24 * 60 * 60_000).toISOString();
  const currentPhase = phase({ openAirspaceEndsAt: longDeadline });
  const first = airspaceClosureTaskPlan('session-a', cycle, currentPhase, 'active', deadlineMs)!;
  const decision = airspaceClosureTaskDecision(
    first, first.taskId, currentPhase, cycle, 'active', first.scheduledAtMs,
  );

  expect(decision.action).toBe('reschedule');
  if (decision.action === 'reschedule') {
    expect(decision.plan.wakeIndex).toBe(first.wakeIndex - 1);
    expect(decision.plan.scheduledAtMs).toBeLessThanOrEqual(
      first.scheduledAtMs + AIRSPACE_CLOSURE_MAX_TASK_HORIZON_MS,
    );
  }
});

it('parks when the task is late, using the authoritative phase due time', () => {
  const task = airspaceClosureTaskPlan('session-a', cycle, phase(), 'active', deadlineMs - 60_000)!;

  expect(airspaceClosureTaskDecision(task, task.taskId, phase(), cycle, 'active', deadlineMs + 60_000)).toEqual({
    action: 'park',
    closedAt: deadlineAt,
  });
});

it('retries a task that appears before its own scheduled wake rather than losing the deadline', () => {
  const task = airspaceClosureTaskPlan('session-a', cycle, phase(), 'active', deadlineMs - 60_000)!;

  expect(airspaceClosureTaskDecision(
    task, task.taskId, phase(), cycle, 'active', task.scheduledAtMs - 1,
  )).toEqual({
    action: 'retry',
  });
});

it('requires the exact, bounded task payload schema', () => {
  const plan = airspaceClosureTaskPlan('session-a', cycle, phase(), 'active', deadlineMs - 60_000)!;
  expect(parseAirspaceClosureTask({
    sessionId: 'session-a', cycle, deadlineAt, wakeIndex: plan.wakeIndex,
  })).toEqual({ sessionId: 'session-a', cycle, deadlineAt, wakeIndex: plan.wakeIndex });
  expect(parseAirspaceClosureTask({
    sessionId: 'session-a', cycle, deadlineAt, wakeIndex: plan.wakeIndex, userId: 'attacker',
  })).toBeUndefined();
  expect(parseAirspaceClosureTask({
    sessionId: '../other', cycle, deadlineAt, wakeIndex: plan.wakeIndex,
  })).toBeUndefined();
});

it('deduplicates duplicate task enqueue retries using Cloud Tasks task IDs', async () => {
  const plan = airspaceClosureTaskPlan('session-a', cycle, phase(), 'active', deadlineMs - 60_000)!;
  const queue = { enqueue: vi.fn().mockRejectedValue({ code: 'functions/task-already-exists' }) };

  await expect(enqueueAirspaceClosureTask(queue, plan)).resolves.toBeUndefined();
  expect(queue.enqueue).toHaveBeenCalledWith(
    { sessionId: 'session-a', cycle, deadlineAt, wakeIndex: plan.wakeIndex },
    { id: plan.taskId, scheduleTime: new Date(plan.scheduledAtMs) },
  );
});

it('propagates scheduler failures so Firestore event retries can repair missing tasks', async () => {
  const plan = airspaceClosureTaskPlan('session-a', cycle, phase(), 'active', deadlineMs - 60_000)!;
  const queue = { enqueue: vi.fn().mockRejectedValue({ code: 'functions/permission-denied' }) };

  await expect(enqueueAirspaceClosureTask(queue, plan)).rejects.toMatchObject({
    code: 'functions/permission-denied',
  });
});
