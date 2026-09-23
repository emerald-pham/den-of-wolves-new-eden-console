import { beforeEach, expect, it, vi } from 'vitest';
import { activeVesselIdsForRoles } from './gameSetup';
import { initialShuttleDockingsForRoles, initialShuttleVisitsForDockings } from './shuttlecraft';
import { shuttleMovementWindowOpen } from './shuttleDeparture';
import {
  enterShuttleTransit,
  toPublicShuttleTransit,
  toShuttleTransitChain,
} from './shuttleTransit';
import {
  AIRSPACE_CLOSURE_PAUSE_RECHECK_MS,
  airspaceClosurePauseWatchPlan,
  airspaceClosureTaskPlan,
} from './airspaceClosureTasks';
import type { TurnPhase } from './turnZero';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const queue = { enqueue: vi.fn(async () => undefined) };
  const ref = (path: string, collection = false) => ({
    path,
    id: path.split('/').at(-1) ?? '',
    collection: (name: string) => ref(`${path}/${name}`, true),
    get: async () => snapshot(path),
    isCollection: collection,
  });
  const snapshot = (path: string, fields = documents.get(path)) => ({
    exists: fields !== undefined,
    id: path.split('/').at(-1) ?? '',
    ref: ref(path),
    get: (field: string) => fields?.[field],
    data: () => fields,
  });
  const querySnapshot = (path: string) => ({
    docs: [...documents.entries()]
      .filter(([candidate]) => candidate.startsWith(`${path}/`) && candidate.slice(path.length + 1).indexOf('/') < 0)
      .map(([candidate, fields]) => snapshot(candidate, fields)),
  });
  const get = vi.fn(async (target: { path: string; isCollection?: boolean }) =>
    target.isCollection ? querySnapshot(target.path) : snapshot(target.path));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const create = vi.fn((target: { path: string }, fields: Fields) => {
    if (documents.has(target.path)) throw new Error('document already exists');
    documents.set(target.path, { ...fields });
  });
  const remove = vi.fn((target: { path: string }) => documents.delete(target.path));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, create, delete: remove }));
  const db = {
    doc: (path: string) => ref(path),
    collection: (path: string) => ref(path, true),
    runTransaction,
  };
  return { documents, queue, get, update, create, remove, runTransaction, db, ref, snapshot };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
}));
vi.mock('firebase-admin/functions', () => ({
  getFunctions: () => ({ taskQueue: () => mock.queue }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (options: unknown, handler: (event: unknown) => unknown) => ({ options, run: handler }),
}));
vi.mock('firebase-functions/v2/tasks', () => ({
  onTaskDispatched: (options: unknown, handler: (request: unknown) => unknown) => ({ options, run: handler }),
}));

import {
  parkShuttlesAtAirspaceClosure,
  scheduleAirspaceClosureParking,
} from './airspaceClosureTaskHandlers';

const sessionId = 's1';
const roles = ['admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer', 'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker'];
const vessels = [...activeVesselIdsForRoles(roles)];
const group = { id: 'fleet-1', vesselIds: vessels, memberUids: ['holder', 'owner'] };
const closedAtMs = Date.parse('2026-09-23T12:30:00.000Z');
const closedAt = new Date(closedAtMs).toISOString();
const sessionPath = `sessions/${sessionId}`;
const transitPath = `${sessionPath}/shuttleDepartures/starlight`;
const chainPath = `${sessionPath}/shuttleTransitChains/starlight`;
const taskRequest = {
  sessionId, cycle: 2, deadlineAt: closedAt, wakeIndex: 0,
};

function phase(fields: Partial<TurnPhase> = {}): TurnPhase {
  return {
    turn: 2,
    teamPhaseEndsAt: '2026-09-23T12:10:00.000Z',
    openAirspaceEndsAt: closedAt,
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    ...fields,
  };
}

function transit(): ReturnType<typeof enterShuttleTransit>['transit'] {
  const dockings = initialShuttleDockingsForRoles(roles)
    .filter(docking => docking.shuttleId !== 'starlight');
  return enterShuttleTransit({
    transitRequestId: 'transit-1',
    actorUid: 'holder',
    expectedDepartureRequestId: 'departure-1',
    expectedControlRevision: 4,
    expectedCycle: 2,
    departure: {
      status: 'requested', requestId: 'departure-1', shuttleId: 'starlight',
      holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'icebreaker', cycle: 2, controlRevision: 4,
      requestedAt: '2026-09-23T12:00:00.000Z',
    },
    control: {
      shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
      holderUid: 'holder', revision: 4,
    },
    dockings: [...dockings, { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
    group,
    phase: phase(),
    now: closedAtMs - 60_000,
  }).transit;
}

function pressTransit(): ReturnType<typeof enterShuttleTransit> {
  const dockings = initialShuttleDockingsForRoles(roles);
  const originShipId = dockings.find(docking => docking.shuttleId === 'snn-press-shuttle')!.shipId;
  const destinationShipId = vessels.find(shipId => shipId !== originShipId)!;
  const requestedAt = new Date(closedAtMs - 3 * 60_000).toISOString();
  return enterShuttleTransit({
    transitRequestId: 'press-transit-1',
    actorUid: 'holder',
    expectedDepartureRequestId: 'press-departure-1',
    expectedControlRevision: 4,
    expectedCycle: 2,
    departure: {
      status: 'requested', requestId: 'press-departure-1', shuttleId: 'snn-press-shuttle',
      holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId, destinationShipId,
      cycle: 2, controlRevision: 4, requestedAt,
    },
    control: {
      shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: 'owner',
      holderUid: 'holder', revision: 4,
    },
    dockings,
    group,
    phase: phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: true } }),
    now: closedAtMs - 2 * 60_000,
  });
}

function seedSession(currentPhase: TurnPhase = phase()) {
  const dockings = initialShuttleDockingsForRoles(roles)
    .filter(docking => docking.shuttleId !== 'starlight');
  mock.documents.set(sessionPath, {
    phase: 'active', currentTurn: currentPhase.turn, playerCount: 8,
    activeRoleIds: roles, activeVesselIds: vessels,
    turnPhase: currentPhase,
    shuttleDockings: dockings,
    shuttleVisitLog: initialShuttleVisitsForDockings(dockings),
  });
  mock.documents.set(`${sessionPath}/fleetGroups/fleet-1`, group);
}

function seedTransit() {
  const stored = transit();
  mock.documents.set(transitPath, toPublicShuttleTransit(stored));
  mock.documents.set(chainPath, toShuttleTransitChain(stored));
}

function closureTaskPlan() {
  const task = airspaceClosureTaskPlan(sessionId, 2, phase(), 'active', closedAtMs - 60_000)!;
  return task;
}

function callableRequest(taskId = closureTaskPlan().taskId, data: unknown = taskRequest) {
  return { id: taskId, data };
}

function firestoreEvent(before: Fields | undefined, after: Fields | undefined) {
  return {
    params: { sessionId },
    data: {
      before: mock.snapshot(sessionPath, before),
      after: mock.snapshot(sessionPath, after),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(closedAtMs - 60_000));
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.create.mockClear();
  mock.remove.mockClear();
  mock.runTransaction.mockClear();
  mock.queue.enqueue.mockClear();
});

it('schedules the current due time when the ordinary airspace phase opens', async () => {
  const before = { phase: 'active', currentTurn: 2, turnPhase: phase({ airspace: { ...phase().airspace, state: 'restricted' } }) };
  seedSession();

  await (scheduleAirspaceClosureParking as { run: (event: unknown) => Promise<void> }).run(
    firestoreEvent(before, mock.documents.get(sessionPath)),
  );

  expect(mock.queue.enqueue).toHaveBeenCalledWith(taskRequest, {
    id: closureTaskPlan().taskId,
    scheduleTime: new Date(closedAtMs),
  });
});

it('schedules the restricted Press window when its server-owned access is granted', async () => {
  const restricted = phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: false } });
  const pressWindow = phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: true } });
  seedSession(pressWindow);

  await (scheduleAirspaceClosureParking as { run: (event: unknown) => Promise<void> }).run(
    firestoreEvent(
      { phase: 'active', currentTurn: 2, turnPhase: restricted },
      mock.documents.get(sessionPath),
    ),
  );

  const plan = airspaceClosureTaskPlan(sessionId, 2, pressWindow, 'active', closedAtMs - 60_000)!;
  expect(mock.queue.enqueue).toHaveBeenCalledWith(taskRequest, {
    id: plan.taskId,
    scheduleTime: new Date(closedAtMs),
  });
});

it('does not schedule the ordinary Press close when the Wolf-attack state is locked', async () => {
  const restricted = phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: false } });
  const pressWindow = phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: true } });
  seedSession(pressWindow);
  mock.documents.set(`${sessionPath}/wolfAttackState/current`, {
    status: 'declared', airspaceLocked: true,
    parkingReleaseCondition: 'normal-movement-reopened',
  });

  await (scheduleAirspaceClosureParking as { run: (event: unknown) => Promise<void> }).run(
    firestoreEvent(
      { phase: 'active', currentTurn: 2, turnPhase: restricted },
      mock.documents.get(sessionPath),
    ),
  );

  expect(mock.queue.enqueue).not.toHaveBeenCalled();
});

it('parks an SNN shuttle that used restricted Press access when the deadline task runs', async () => {
  const pressWindow = phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: true } });
  seedSession(pressWindow);
  const entered = pressTransit();
  mock.documents.set(sessionPath, {
    ...mock.documents.get(sessionPath)!,
    shuttleDockings: entered.dockings,
  });
  const pressTransitPath = `${sessionPath}/shuttleDepartures/snn-press-shuttle`;
  const pressChainPath = `${sessionPath}/shuttleTransitChains/snn-press-shuttle`;
  mock.documents.set(pressTransitPath, toPublicShuttleTransit(entered.transit));
  mock.documents.set(pressChainPath, toShuttleTransitChain(entered.transit));
  const plan = airspaceClosureTaskPlan(sessionId, 2, pressWindow, 'active', closedAtMs - 60_000)!;
  vi.setSystemTime(new Date(closedAtMs));

  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(plan.taskId),
  );

  const session = mock.documents.get(sessionPath)!;
  expect(session.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'snn-press-shuttle', dockedAt: closedAt }),
  ]));
  expect(session.shuttleVisitLog).toEqual(expect.arrayContaining([
    expect.objectContaining({
      shuttleId: 'snn-press-shuttle', action: 'docked', occurredAt: closedAt,
    }),
  ]));
  expect(mock.documents.has(pressTransitPath)).toBe(false);
  expect(mock.documents.has(pressChainPath)).toBe(false);
});

it('rejects an old ordinary deadline task while a Wolf attack owns the restricted Press lock', async () => {
  const pressWindow = phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: true } });
  seedSession(pressWindow);
  seedTransit();
  mock.documents.set(`${sessionPath}/wolfAttackState/current`, {
    status: 'declared', airspaceLocked: true,
    parkingReleaseCondition: 'normal-movement-reopened',
  });
  const task = airspaceClosureTaskPlan(sessionId, 2, pressWindow, 'active', closedAtMs - 60_000)!;
  vi.setSystemTime(new Date(closedAtMs));

  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(task.taskId),
  );

  expect(mock.documents.has(transitPath)).toBe(true);
  expect(mock.documents.has(chainPath)).toBe(true);
  expect(mock.documents.get(sessionPath)?.shuttleDockings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'starlight', dockedAt: closedAt }),
  ]));
  expect([...mock.documents.keys()].some(path => path.startsWith(`${sessionPath}/events/`))).toBe(false);
  expect(mock.queue.enqueue).not.toHaveBeenCalled();
});

it('keeps failed server deadline tasks retryable through Cloud Tasks retention', () => {
  expect((parkShuttlesAtAirspaceClosure as {
    options: {
      invoker: string;
      retryConfig: { maxAttempts: number; maxRetrySeconds: number };
    };
  }).options).toMatchObject({
    invoker: 'private',
    retryConfig: { maxAttempts: -1, maxRetrySeconds: 0 },
  });
});

it('reconciles extension and resume writes while invalidating pause, attack, and cycle tasks', async () => {
  seedSession();
  const original = mock.documents.get(sessionPath)!;
  const openTask = closureTaskPlan();

  const extendedPhase = phase({ openAirspaceEndsAt: new Date(closedAtMs + 5 * 60_000).toISOString() });
  mock.documents.set(sessionPath, { ...original, turnPhase: extendedPhase });
  await (scheduleAirspaceClosureParking as { run: (event: unknown) => Promise<void> }).run(
    firestoreEvent(original, mock.documents.get(sessionPath)),
  );
  expect(mock.queue.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({
    deadlineAt: extendedPhase.openAirspaceEndsAt,
  }), expect.objectContaining({ scheduleTime: new Date(extendedPhase.openAirspaceEndsAt) }));

  const extendedState = mock.documents.get(sessionPath)!;
  const pausedPhase = phase({
    openAirspaceEndsAt: extendedPhase.openAirspaceEndsAt,
    timerPause: {
      window: 'open', remainingMs: 60_000,
      pausedAt: new Date(closedAtMs - 60_000).toISOString(),
    },
  });
  mock.documents.set(sessionPath, { ...original, turnPhase: pausedPhase });
  const callsAfterExtension = mock.queue.enqueue.mock.calls.length;
  await (scheduleAirspaceClosureParking as { run: (event: unknown) => Promise<void> }).run(
    firestoreEvent(extendedState, mock.documents.get(sessionPath)),
  );
  const pauseWatch = airspaceClosurePauseWatchPlan(
    sessionId, 2, pausedPhase, 'active', closedAtMs - 60_000,
  )!;
  expect(mock.queue.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({
    deadlineAt: extendedPhase.openAirspaceEndsAt,
    wakeIndex: pauseWatch.wakeIndex,
  }), expect.objectContaining({ scheduleTime: new Date(pauseWatch.scheduledAtMs) }));
  expect(mock.queue.enqueue).toHaveBeenCalledTimes(callsAfterExtension + 1);
  vi.setSystemTime(new Date(closedAtMs));
  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(openTask.taskId),
  );
  expect(mock.queue.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({
    deadlineAt: extendedPhase.openAirspaceEndsAt,
    wakeIndex: pauseWatch.wakeIndex,
  }), expect.objectContaining({ scheduleTime: new Date(closedAtMs + AIRSPACE_CLOSURE_PAUSE_RECHECK_MS) }));
  expect(mock.documents.has(chainPath)).toBe(false);

  const pausedState = mock.documents.get(sessionPath)!;
  const resumedPhase = phase({
    openAirspaceEndsAt: new Date(closedAtMs + 15 * 60_000).toISOString(),
  });
  mock.documents.set(sessionPath, { ...original, turnPhase: resumedPhase });
  await (scheduleAirspaceClosureParking as { run: (event: unknown) => Promise<void> }).run(
    firestoreEvent(pausedState, mock.documents.get(sessionPath)),
  );
  expect(mock.queue.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({
    deadlineAt: resumedPhase.openAirspaceEndsAt,
  }), expect.objectContaining({ scheduleTime: new Date(resumedPhase.openAirspaceEndsAt) }));

  const resumedState = mock.documents.get(sessionPath)!;
  const attackPhase = phase({
    openAirspaceEndsAt: resumedPhase.openAirspaceEndsAt,
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  });
  mock.documents.set(sessionPath, { ...original, turnPhase: attackPhase });
  const callsAfterResume = mock.queue.enqueue.mock.calls.length;
  await (scheduleAirspaceClosureParking as { run: (event: unknown) => Promise<void> }).run(
    firestoreEvent(resumedState, mock.documents.get(sessionPath)),
  );
  expect(mock.queue.enqueue).toHaveBeenCalledTimes(callsAfterResume);

  const attackState = mock.documents.get(sessionPath)!;
  const nextCycle = phase({ turn: 3, airspace: { state: 'restricted', tickerActive: true, pressAccess: false } });
  mock.documents.set(sessionPath, { ...original, currentTurn: 3, turnPhase: nextCycle });
  await (scheduleAirspaceClosureParking as { run: (event: unknown) => Promise<void> }).run(
    firestoreEvent(attackState, mock.documents.get(sessionPath)),
  );
  expect(mock.queue.enqueue).toHaveBeenCalledTimes(callsAfterResume);
});

it('parks from the authoritative transit route atomically and safely replays the task', async () => {
  vi.setSystemTime(new Date(closedAtMs + 10_000));
  seedSession();
  seedTransit();
  const task = closureTaskPlan();

  expect(mock.documents.get(transitPath)?.status).toBe('in-transit');
  expect((mock.documents.get(sessionPath)?.turnPhase as TurnPhase).airspace.state).toBe('lifted');
  expect(shuttleMovementWindowOpen('starlight', phase(), Date.now())).toBe(false);

  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(task.taskId),
  );

  const savedSession = mock.documents.get(sessionPath)!;
  expect(savedSession.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'starlight', shipId: expect.any(String), dockedAt: closedAt }),
  ]));
  expect(mock.documents.has(transitPath)).toBe(false);
  expect(mock.documents.has(chainPath)).toBe(false);
  expect((savedSession.shuttleVisitLog as Fields[]).at(-1)).toMatchObject({
    shuttleId: 'starlight', action: 'docked', occurredAt: closedAt,
  });
  const events = [...mock.documents.entries()].filter(([path]) => path.startsWith(`${sessionPath}/events/`));
  expect(events).toHaveLength(1);
  expect(events[0]?.[1]).toMatchObject({
    type: 'airspace-closure-parking', turn: 2, serverTime: closedAt, parkedShuttleCount: 1,
  });
  expect(events[0]?.[1]).not.toHaveProperty('originShipId');
  expect(events[0]?.[1]).not.toHaveProperty('destinationShipId');
  expect(events[0]?.[1]).not.toHaveProperty('holderUid');

  const updates = mock.update.mock.calls.length;
  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(task.taskId),
  );
  expect(mock.documents.size).toBeGreaterThan(0);
  expect(mock.update).toHaveBeenCalledTimes(updates);
  expect([...mock.documents.entries()].filter(([path]) => path.startsWith(`${sessionPath}/events/`))).toHaveLength(1);

  const closureEvent = [...mock.documents.entries()].find(([path]) => path.startsWith(`${sessionPath}/events/`))?.[1];
  expect(closureEvent).toMatchObject({ parkedShuttleCount: 1 });
  closureEvent!.parkedShuttleCount = 2;
  await expect((parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(task.taskId),
  )).rejects.toThrow(/projection conflicts/i);
  expect(mock.documents.has(transitPath)).toBe(false);
});

it('reschedules a stale deadline task for a live extension without waiting for a client', async () => {
  seedSession(phase({ openAirspaceEndsAt: new Date(closedAtMs + 5 * 60_000).toISOString() }));
  const oldTask = closureTaskPlan();
  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(oldTask.taskId),
  );

  expect(mock.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    deadlineAt: new Date(closedAtMs + 5 * 60_000).toISOString(),
  }), expect.objectContaining({
    scheduleTime: new Date(closedAtMs + 5 * 60_000),
  }));
  expect(mock.documents.has(transitPath)).toBe(false);
});

it('recovers the exact resumed deadline from a pause watch if its write trigger was missed', async () => {
  const pausedPhase = phase({
    timerPause: {
      window: 'open', remainingMs: 60_000,
      pausedAt: new Date(closedAtMs - 60_000).toISOString(),
    },
  });
  seedSession(pausedPhase);
  const watch = airspaceClosurePauseWatchPlan(
    sessionId, 2, pausedPhase, 'active', closedAtMs - 60_000,
  )!;
  const resumedPhase = phase({ openAirspaceEndsAt: new Date(closedAtMs + 15 * 60_000).toISOString() });
  mock.documents.set(sessionPath, { ...mock.documents.get(sessionPath)!, turnPhase: resumedPhase });
  vi.setSystemTime(new Date(watch.scheduledAtMs));

  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(watch.taskId, {
      sessionId, cycle: watch.cycle, deadlineAt: watch.deadlineAt, wakeIndex: watch.wakeIndex,
    }),
  );

  expect(mock.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    deadlineAt: resumedPhase.openAirspaceEndsAt,
  }), expect.objectContaining({ scheduleTime: new Date(resumedPhase.openAirspaceEndsAt) }));
  expect(mock.documents.has(transitPath)).toBe(false);
});

it('does not park a Wolf-attack-restricted phase and requeues a new lifted cycle', async () => {
  const restricted = phase({ airspace: { state: 'restricted', tickerActive: true, pressAccess: false } });
  seedSession(restricted);
  seedTransit();
  const task = closureTaskPlan();
  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(task.taskId),
  );
  expect(mock.documents.has(transitPath)).toBe(true);
  expect(mock.queue.enqueue).not.toHaveBeenCalled();
  expect([...mock.documents.keys()].some(path => path.startsWith(`${sessionPath}/events/`))).toBe(false);

  const newCycleDeadline = new Date(closedAtMs + 5 * 60_000).toISOString();
  seedSession(phase({ turn: 3, openAirspaceEndsAt: newCycleDeadline }));
  vi.setSystemTime(new Date(closedAtMs + 1));
  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(task.taskId),
  );
  expect(mock.documents.has(transitPath)).toBe(true);
  expect(mock.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    cycle: 3, deadlineAt: newCycleDeadline,
  }), expect.objectContaining({ scheduleTime: new Date(newCycleDeadline) }));
});

it('retries on incomplete transit authority without partially changing the member projection', async () => {
  vi.setSystemTime(new Date(closedAtMs + 1));
  seedSession();
  const laterRevision = transit({ revision: 2 });
  mock.documents.set(transitPath, toPublicShuttleTransit(laterRevision));
  mock.documents.delete(chainPath);
  const beforeSession = mock.documents.get(sessionPath);
  const task = closureTaskPlan();

  await expect((parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(task.taskId),
  )).rejects.toThrow('does not match its authoritative transit chain');
  expect(mock.documents.get(sessionPath)).toEqual(beforeSession);
  expect(mock.documents.has(transitPath)).toBe(true);
  expect([...mock.documents.keys()].some(path => path.startsWith(`${sessionPath}/events/`))).toBe(false);
});

it('parks a canonical revision-one legacy transit whose private chain has not been migrated', async () => {
  vi.setSystemTime(new Date(closedAtMs + 1));
  seedSession();
  mock.documents.set(transitPath, transit());
  mock.documents.delete(chainPath);

  await (parkShuttlesAtAirspaceClosure as { run: (request: unknown) => Promise<void> }).run(
    callableRequest(closureTaskPlan().taskId),
  );

  expect(mock.documents.has(transitPath)).toBe(false);
  expect(mock.documents.has(chainPath)).toBe(false);
  expect(mock.documents.get(sessionPath)?.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'starlight', shipId: 'icebreaker', dockedAt: closedAt }),
  ]));
  expect([...mock.documents.entries()].find(([path]) => path.startsWith(`${sessionPath}/events/`))?.[1])
    .toMatchObject({ type: 'airspace-closure-parking', parkedShuttleCount: 1 });
});
