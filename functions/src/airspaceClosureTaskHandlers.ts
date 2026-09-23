import { getFirestore, FieldValue, type DocumentReference, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { activeVesselIdsForRoles } from './gameSetup';
import {
  shuttleDockingsAreParked,
  shuttleDockingsMatchRoleOwnedCraft,
} from './craftOwnership';
import { buildPrivacySafeEventRecord } from './eventRedaction';
import { EventVisibility } from './eventEnvelope';
import { fleetGroupRecord } from './fleetGroups';
import { ROLE_IDS, recommendedRoleIds } from './roleConfiguration';
import { initialShuttleDockingsForRoles } from './shuttlecraft';
import { parseShuttleDepartures } from './shuttleDeparture';
import { parseShuttleTransitAuthority } from './shuttleTransit';
import { turnPhaseState } from './turnZero';
import { resolveAirspaceClosureShuttleParking } from './airspaceClosureParking';
import {
  airspaceClosureEventId,
  airspaceClosureTaskDecision,
  airspaceClosurePauseWatchPlan,
  airspaceClosureTaskPlan,
  enqueueAirspaceClosureTask,
  parseAirspaceClosureTask,
  type AirspaceClosureTask,
  type AirspaceClosureTaskPlan,
} from './airspaceClosureTasks';

const TASK_FUNCTION_NAME = 'parkShuttlesAtAirspaceClosure';
const TASK_RETRY_CONFIG = {
  // Retry permission, transient Firestore failures, and temporary scheduler
  // errors until the Cloud Tasks 31-day retention limit removes the task.
  maxAttempts: -1,
  maxRetrySeconds: 0,
  minBackoffSeconds: 10,
  maxBackoffSeconds: 300,
  maxDoublings: 8,
};

type ParkingTransactionResult =
  | Readonly<{ action: 'stale' }>
  | Readonly<{ action: 'retry' }>
  | Readonly<{ action: 'reschedule'; plan: AirspaceClosureTaskPlan }>
  | Readonly<{ action: 'parked' }>;

/**
 * Reconcile every authoritative phase/deadline write into a durable task.
 * Stale Cloud Tasks are safe because the task worker re-reads the current
 * session transactionally and schedules a successor when a live deadline has
 * changed.
 */
export function createAirspaceClosureTaskScheduler() {
  return onDocumentWritten({
    document: 'sessions/{sessionId}',
    region: 'us-central1',
    retry: true,
  }, async event => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists || (before?.exists && closureScheduleKey(before) === closureScheduleKey(after))) {
      return;
    }
    const sessionId = event.params.sessionId;
    const session = await getFirestore().doc(`sessions/${sessionId}`).get();
    if (!session.exists) return;
    const turn = sessionTurn(session.get('currentTurn'));
    const phase = turnPhaseState(session.get('turnPhase'));
    const plan = airspaceClosureTaskPlan(sessionId, turn, phase, session.get('phase')) ??
      airspaceClosurePauseWatchPlan(sessionId, turn, phase, session.get('phase'));
    if (!plan) return;
    await enqueueAirspaceClosureTask(
      getFunctions().taskQueue(TASK_FUNCTION_NAME),
      plan,
    );
  });
}

/** Execute the ordinary deadline task using only current server session state. */
export function createAirspaceClosureParkingTask() {
  return onTaskDispatched<AirspaceClosureTask>({
    region: 'us-central1',
    invoker: 'private',
    retryConfig: TASK_RETRY_CONFIG,
  }, async request => {
    const task = parseAirspaceClosureTask(request.data);
    if (!task) throw new Error('The airspace-closure task payload is malformed.');
    const sessionRef = getFirestore().doc(`sessions/${task.sessionId}`);
    const result = await getFirestore().runTransaction(async tx => {
      const session = await tx.get(sessionRef);
      if (!session.exists) return { action: 'stale' } as const;
      const currentTurn = sessionTurn(session.get('currentTurn'));
      const phase = turnPhaseState(session.get('turnPhase'));
      const decision = airspaceClosureTaskDecision(
        task,
        request.id,
        phase,
        currentTurn,
        session.get('phase'),
        Date.now(),
      );
      if (decision.action === 'stale' || decision.action === 'retry') return decision;
      if (decision.action === 'reschedule') return decision;
      await parkAtOrdinaryAirspaceDeadline(tx, sessionRef, session, decision.closedAt);
      return { action: 'parked' } as const;
    }) as ParkingTransactionResult;

    if (result.action === 'retry') {
      throw new Error('Cloud Tasks delivered before the authoritative task wake time.');
    }
    if (result.action === 'reschedule') {
      await enqueueAirspaceClosureTask(
        getFunctions().taskQueue(TASK_FUNCTION_NAME),
        result.plan,
      );
    }
  });
}

/**
 * Resolve and atomically project a cycle's ordinary airspace close. The GM
 * `advanceTurn` path calls this same helper as a catch-up safety boundary.
 */
export async function parkAtOrdinaryAirspaceDeadline(
  tx: Transaction,
  sessionRef: DocumentReference,
  session: DocumentSnapshot,
  closedAt: string,
): Promise<void> {
  const currentTurn = sessionTurn(session.get('currentTurn'));
  const phase = turnPhaseState(session.get('turnPhase'));
  if (!session.exists || session.get('phase') !== 'active' || !phase ||
      phase.turn !== currentTurn || phase.airspace.state !== 'lifted' || phase.timerPause ||
      phase.openAirspaceEndsAt !== closedAt || Date.now() < Date.parse(closedAt)) {
    throw new Error('The ordinary airspace closure no longer matches current server phase authority.');
  }

  const db = getFirestore();
  const groupsRef = db.collection(`${sessionRef.path}/fleetGroups`);
  const departuresRef = db.collection(`${sessionRef.path}/shuttleDepartures`);
  const chainsRef = db.collection(`${sessionRef.path}/shuttleTransitChains`);
  const eventRef = db.doc(`${sessionRef.path}/events/${airspaceClosureEventId(currentTurn, closedAt)}`);
  const [groupsSnapshot, departuresSnapshot, chainsSnapshot, priorEvent] = await Promise.all([
    tx.get(groupsRef), tx.get(departuresRef), tx.get(chainsRef), tx.get(eventRef),
  ]);
  const roles = authoritativeActiveRoles(session);
  const vessels = authoritativeActiveVessels(session, roles);
  const storedDockings = session.get('shuttleDockings');
  const rawDockings = storedDockings === undefined
    ? initialShuttleDockingsForRoles(roles)
    : storedDockings;
  const departures = departuresSnapshot.docs;
  const chains = new Map(chainsSnapshot.docs.map(snapshot => [snapshot.id, snapshot]));
  const transits = [];

  for (const snapshot of departures) {
    const raw = snapshot.data();
    if (!isRecord(raw)) throw new Error('Shuttle departure authority is malformed at airspace closure.');
    const chain = chains.get(snapshot.id);
    if (raw.status === 'in-transit') {
      if (!chain?.exists) throw new Error('The in-transit shuttle is missing its server transit chain.');
      const authority = parseShuttleTransitAuthority(raw, chain.data(), snapshot.id);
      if (!authority || authority.transit.transitRequestId !== chain.get('transitRequestId') ||
          authority.transit.revision !== chain.get('revision')) {
        throw new Error('The in-transit shuttle does not match its authoritative transit chain.');
      }
      transits.push(authority.transit);
    } else {
      if (chain?.exists) throw new Error('A pending shuttle departure has an unexpected transit chain.');
      const pending = parseShuttleDepartures({ [snapshot.id]: raw });
      if (!pending?.[snapshot.id]) throw new Error('Shuttle departure authority is malformed at airspace closure.');
    }
  }
  for (const chain of chainsSnapshot.docs) {
    const departure = departures.find(snapshot => snapshot.id === chain.id);
    if (!departure || departure.get('status') !== 'in-transit') {
      throw new Error('An orphaned server shuttle transit chain exists at airspace closure.');
    }
  }
  // Pending departure requests remain inert. They are neither physical
  // transit nor a client-owned location and do not participate in parking.

  const groups = groupsSnapshot.docs.map(snapshot => {
    const group = fleetGroupRecord(snapshot.data());
    if (!group || group.id !== snapshot.id) {
      throw new Error('Fleet-group authority is malformed at airspace closure.');
    }
    return group;
  });
  let parking;
  try {
    parking = resolveAirspaceClosureShuttleParking({
      activeRoleIds: roles,
      activeVesselIds: vessels,
      dockings: rawDockings,
      transits,
      fleetGroups: groups,
      cycle: currentTurn,
      closedAt,
      visitLog: session.get('shuttleVisitLog'),
    });
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? cause.message
        : 'The airspace-close shuttle parking authority could not be resolved.',
    );
  }

  if (priorEvent.exists) {
    const event = priorEvent.data();
    if (!isRecord(event) || event.type !== 'airspace-closure-parking' ||
        event.turn !== currentTurn || event.serverTime !== closedAt ||
        event.parkedShuttleCount !== closureDockedVisitCount(parking.visitLog, currentTurn, closedAt) ||
        parking.clearedTransitIds.length > 0 ||
        !shuttleDockingsAreParked(parking.dockings, vessels) ||
        !shuttleDockingsMatchRoleOwnedCraft(roles, parking.dockings)) {
      throw new Error('The existing airspace-closure projection conflicts with live transit authority.');
    }
    return;
  }

  tx.update(sessionRef, {
    shuttleDockings: parking.dockings.map(docking => ({ ...docking })),
    shuttleVisitLog: parking.visitLog.map(visit => ({ ...visit })),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const shuttleId of parking.clearedTransitIds) {
    tx.delete(db.doc(`${sessionRef.path}/shuttleDepartures/${shuttleId}`));
    tx.delete(db.doc(`${sessionRef.path}/shuttleTransitChains/${shuttleId}`));
  }
  const eventId = airspaceClosureEventId(currentTurn, closedAt);
  tx.create(eventRef, buildPrivacySafeEventRecord({
    type: 'airspace-closure-parking',
    envelope: {
      sessionId: sessionRef.id,
      turn: currentTurn,
      phase: 'active',
      requestId: eventId,
      revision: 1,
      serverTime: closedAt,
      visibility: EventVisibility.Member,
    },
    payload: { parkedShuttleCount: parking.clearedTransitIds.length },
    createdAt: FieldValue.serverTimestamp(),
  }));
}

function closureScheduleKey(session: DocumentSnapshot): string {
  const phase = turnPhaseState(session.get('turnPhase'));
  return JSON.stringify({
    sessionPhase: session.get('phase'),
    currentTurn: session.get('currentTurn'),
    turn: phase?.turn,
    deadline: phase?.openAirspaceEndsAt,
    airspace: phase?.airspace.state,
    pause: phase?.timerPause ? [
      phase.timerPause.window,
      phase.timerPause.pausedAt,
      phase.timerPause.remainingMs,
      phase.timerPause.reason,
    ] : null,
  });
}

function authoritativeActiveRoles(session: DocumentSnapshot): readonly string[] {
  const stored = session.get('activeRoleIds');
  const count = session.get('playerCount');
  const fallbackCount = Number.isSafeInteger(count) && (count as number) >= 8 && (count as number) <= 20
    ? count as number
    : 18;
  if (stored === undefined) return recommendedRoleIds(fallbackCount).filter(role => role !== 'press-officer');
  if (!Array.isArray(stored) || stored.length === 0 ||
      stored.some(role => typeof role !== 'string' || !ROLE_IDS.includes(role as typeof ROLE_IDS[number])) ||
      new Set(stored).size !== stored.length) {
    throw new Error('The active role roster is malformed at airspace closure.');
  }
  return stored.filter((role): role is string => role !== 'press-officer');
}

function authoritativeActiveVessels(
  session: DocumentSnapshot,
  roles: readonly string[],
): readonly string[] {
  const expected = activeVesselIdsForRoles([...roles]);
  const stored = session.get('activeVesselIds');
  if (stored === undefined) return expected;
  if (!Array.isArray(stored) || stored.some(value => typeof value !== 'string') ||
      new Set(stored).size !== stored.length ||
      stored.length !== expected.length || expected.some(value => !stored.includes(value))) {
    throw new Error('The active vessel roster does not match the locked role roster.');
  }
  return stored;
}

function sessionTurn(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : -1;
}

function closureDockedVisitCount(
  visits: readonly { readonly id: string; readonly action: string; readonly occurredAt: string }[],
  cycle: number,
  closedAt: string,
): number {
  const prefix = `airspace-close-${cycle}-`;
  return visits.filter(visit => visit.id.startsWith(prefix) && visit.id.endsWith('-docked') &&
    visit.action === 'docked' && visit.occurredAt === closedAt).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const scheduleAirspaceClosureParking = createAirspaceClosureTaskScheduler();
export const parkShuttlesAtAirspaceClosure = createAirspaceClosureParkingTask();
