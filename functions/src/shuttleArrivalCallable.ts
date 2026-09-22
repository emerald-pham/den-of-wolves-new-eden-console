import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { commandError } from './commandErrors';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import {
  ROLE_OWNED_CRAFT_CATALOG,
  shuttleDockingsAreParked,
  shuttleDockingsMatchActiveRoleOwnedSubset,
} from './craftOwnership';
import { EventVisibility } from './eventEnvelope';
import { buildPrivacySafeEventRecord } from './eventRedaction';
import { fleetGroupRecord } from './fleetGroups';
import { isResourceShipId } from './resources';
import { ROLE_IDS, recommendedRoleIds } from './roleConfiguration';
import { isPresenceStale } from './sessionLifecycle';
import { parseShuttleControl } from './shuttleControl';
import { parseShuttleArrivalVisitLog, completeShuttleArrival as applyShuttleArrival } from './shuttleArrival';
import { parseShuttleTransitAuthority } from './shuttleTransit';
import { turnPhaseState } from './turnZero';
import { wolfAttackBlocksNormalMovement } from './wolfAttackDeclaration';

type ShuttleArrivalReply = Readonly<{
  status: 'arrived' | 'replayed';
  sessionId: string;
  requestId: string;
  transitRequestId: string;
  shuttleId: string;
  hostShipId: string;
  arrivedAt: string;
  transitRevision: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requestIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
}

function activeRoleIds(session: DocumentSnapshot): readonly string[] | null {
  const stored = session.get('activeRoleIds');
  if (stored !== undefined && (!Array.isArray(stored) ||
      stored.some((roleId) => typeof roleId !== 'string' || !ROLE_IDS.includes(roleId as typeof ROLE_IDS[number])))) {
    return null;
  }
  const playerCount = session.get('playerCount');
  const fallback = Number.isSafeInteger(playerCount) && (playerCount as number) >= 8 &&
    (playerCount as number) <= 20 ? playerCount as number : 18;
  const configured = Array.isArray(stored)
    ? ROLE_IDS.filter((roleId) => stored.includes(roleId))
    : recommendedRoleIds(fallback);
  return configured.filter((roleId) => roleId !== 'press-officer');
}

function activePlayer(snapshot: DocumentSnapshot, now: number): boolean {
  if (!snapshot.exists || snapshot.get('connected') !== true ||
      snapshot.get('role') !== 'player' ||
      snapshot.get('kickedAt') !== undefined && snapshot.get('kickedAt') !== null) return false;
  const escapeState = snapshot.get('escapeState');
  if (escapeState !== undefined && escapeState !== null) return false;
  const lastSeenAt = snapshot.get('lastSeenAt');
  if (lastSeenAt === undefined) return true;
  return lastSeenAt instanceof Timestamp && !isPresenceStale(lastSeenAt.toDate(), new Date(now));
}

function isShuttleArrivalReply(
  value: unknown,
  sessionId: string,
  requestId: string,
  transitRequestId: string,
  shuttleId: string,
): value is ShuttleArrivalReply {
  if (!isRecord(value)) return false;
  return (value.status === 'arrived' || value.status === 'replayed') &&
    value.sessionId === sessionId && value.requestId === requestId &&
    value.transitRequestId === transitRequestId && value.shuttleId === shuttleId &&
    typeof value.hostShipId === 'string' && typeof value.arrivedAt === 'string' &&
    Number.isFinite(Date.parse(value.arrivedAt)) &&
    Number.isSafeInteger(value.transitRevision) && (value.transitRevision as number) >= 1;
}

function isSafeArrivalEvent(
  value: unknown,
  sessionId: string,
  requestId: string,
  shuttleId: string,
): boolean {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    'sessionId', 'requestId', 'type', 'createdAt', 'turn', 'phase', 'revision',
    'serverTime', 'visibility', 'shuttleId',
  ]);
  return Object.keys(value).every((key) => allowed.has(key)) &&
    value.sessionId === sessionId && value.requestId === requestId &&
    value.type === 'shuttle-arrival' && value.visibility === EventVisibility.Member &&
    value.shuttleId === shuttleId && typeof value.serverTime === 'string' &&
    !Object.hasOwn(value, 'actorUid') && !Object.hasOwn(value, 'originShipId') &&
    !Object.hasOwn(value, 'destinationShipId') && !Object.hasOwn(value, 'fleetGroupId') &&
    !Object.hasOwn(value, 'holderUid');
}

function replayArrival(
  receipt: DocumentSnapshot,
  fingerprint: CommandFingerprint,
  sessionId: string,
  requestId: string,
  transitRequestId: string,
  shuttleId: string,
  eventId: unknown,
): ShuttleArrivalReply | null {
  if (!receipt.exists) return null;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', 'This shuttle arrival belongs to a different holder.');
  }
  if (disposition.kind === 'collision') {
    throw commandError('failed-precondition', 'This shuttle arrival request id is bound to another command.', 'conflict');
  }
  const result = receipt.get('result');
  if (!isShuttleArrivalReply(result, sessionId, requestId, transitRequestId, shuttleId)) {
    throw commandError('failed-precondition', 'This shuttle arrival has no replayable result.', 'conflict');
  }
  if (typeof eventId !== 'string' || !/^shuttle-arrival-[\w-]{36}$/.test(eventId)) {
    throw commandError('failed-precondition', 'This shuttle arrival has no replayable event.', 'conflict');
  }
  return result;
}

/** Complete one reached shuttle trip and publish only its docking/history result. */
export function createCompleteShuttleArrivalCallable() {
  return onCall<{
  sessionId?: unknown;
  shuttleId?: unknown;
  transitRequestId?: unknown;
  expectedControlRevision?: unknown;
  }>(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw commandError('unauthenticated', 'Sign in before completing shuttle arrival.', 'unauthenticated');
  const raw = request.data;
  const allowed = new Set(['sessionId', 'shuttleId', 'transitRequestId', 'expectedControlRevision']);
  if (!isRecord(raw) || Object.keys(raw).some((key) => !allowed.has(key)) ||
      !requestIdentifier(raw.sessionId) || !requestIdentifier(raw.transitRequestId) ||
      typeof raw.shuttleId !== 'string' ||
      !ROLE_OWNED_CRAFT_CATALOG.some((craft) => craft.id === raw.shuttleId && craft.kind === 'shuttle') ||
      !Number.isSafeInteger(raw.expectedControlRevision) || (raw.expectedControlRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'Invalid shuttle arrival request.');
  }
  const data = raw as {
    sessionId: string; shuttleId: string; transitRequestId: string; expectedControlRevision: number;
  };
  const requestId = `arrival-${data.transitRequestId}`;
  const fingerprint: CommandFingerprint = {
    action: 'complete-shuttle-arrival',
    sessionId: data.sessionId,
    requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: data.expectedControlRevision,
    payload: { shuttleId: data.shuttleId, transitRequestId: data.transitRequestId },
  };
  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${data.sessionId}`);
  const actorRef = db.doc(`sessions/${data.sessionId}/players/${uid}`);
  const receiptRef = db.doc(`sessions/${data.sessionId}/shuttleArrivalReceipts/${data.transitRequestId}`);
  const transitRef = db.doc(`sessions/${data.sessionId}/shuttleDepartures/${data.shuttleId}`);
  const transitChainRef = db.doc(`sessions/${data.sessionId}/shuttleTransitChains/${data.shuttleId}`);
  const attackStateRef = db.doc(`sessions/${data.sessionId}/wolfAttackState/current`);
  const proposedEventId = `shuttle-arrival-${randomUUID()}`;

  return db.runTransaction(async tx => {
    const [session, actor, receipt, transitSnapshot, transitChainSnapshot, attackState] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(receiptRef), tx.get(transitRef),
      tx.get(transitChainRef), tx.get(attackStateRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const now = Date.now();
    if (!activePlayer(actor, now)) {
      throw new HttpsError('permission-denied', 'Only a connected shuttle holder may complete arrival.');
    }
    const eventId = receipt.exists ? receipt.get('eventId') : proposedEventId;
    if (typeof eventId !== 'string' || !/^shuttle-arrival-[\w-]{36}$/.test(eventId)) {
      throw commandError('failed-precondition', 'This shuttle arrival has no replayable event.', 'conflict');
    }
    const eventRef = db.doc(`sessions/${data.sessionId}/events/${eventId}`);
    const eventSnapshot = await tx.get(eventRef);
    const replay = replayArrival(
      receipt, fingerprint, data.sessionId, requestId, data.transitRequestId, data.shuttleId, eventId,
    );
    if (replay) {
      const replayAuthority = transitSnapshot.exists
        ? parseShuttleTransitAuthority(
          transitSnapshot.data(), transitChainSnapshot.exists ? transitChainSnapshot.data() : undefined,
          data.shuttleId,
        )
        : null;
      if ((transitSnapshot.exists || transitChainSnapshot.exists) &&
          (!replayAuthority || replayAuthority.transit.transitRequestId !== data.transitRequestId ||
            replayAuthority.transit.revision !== replay.transitRevision)) {
        throw commandError('failed-precondition', 'The shuttle arrival chain is unavailable or stale.', 'conflict');
      }
      if (!eventSnapshot.exists || !isSafeArrivalEvent(eventSnapshot.data(), data.sessionId, requestId, data.shuttleId)) {
        throw commandError('failed-precondition', 'The shuttle arrival event is unavailable or unsafe.', 'conflict');
      }
      return { ...replay, status: 'replayed' as const };
    }
    if (eventSnapshot.exists) {
      throw commandError('failed-precondition', 'The shuttle arrival event already exists without its receipt.', 'conflict');
    }
    if (session.get('phase') !== 'active') {
      throw commandError('failed-precondition', 'Shuttle arrival is unavailable outside active gameplay.', 'invalid-phase');
    }
    if (attackState.exists && wolfAttackBlocksNormalMovement(attackState.data())) {
      throw commandError('failed-precondition', 'Shuttle arrival is locked during the unresolved Wolf attack.', 'invalid-phase');
    }
    const authority = transitSnapshot.exists
      ? parseShuttleTransitAuthority(
        transitSnapshot.data(), transitChainSnapshot.exists ? transitChainSnapshot.data() : undefined,
        data.shuttleId,
      )
      : null;
    const transit = authority?.transit;
    if (!transit || transit.transitRequestId !== data.transitRequestId) {
      throw commandError('failed-precondition', 'The shuttle transit is no longer available.', 'conflict');
    }
    if (data.shuttleId === 'snn-press-shuttle' && session.get('pressEnabled') === false) {
      throw new HttpsError('permission-denied', 'The SNN Press station is disabled.');
    }
    const actorGroupId = actor.get('fleetGroupId');
    if (typeof actorGroupId !== 'string' || actorGroupId !== transit.fleetGroupId) {
      throw new HttpsError('permission-denied', 'The shuttle holder no longer belongs to the transit fleet group.');
    }
    const [groupSnapshot] = await Promise.all([
      tx.get(db.doc(`sessions/${data.sessionId}/fleetGroups/${transit.fleetGroupId}`)),
    ]);
    const group = groupSnapshot.exists ? fleetGroupRecord(groupSnapshot.data()) : undefined;
    const roles = activeRoleIds(session);
    const activeVesselIds = session.get('activeVesselIds');
    const rawDockings = session.get('shuttleDockings');
    const controls = parseShuttleControl(session.get('shuttleControl'));
    const phase = turnPhaseState(session.get('turnPhase'));
    const currentCycle = session.get('currentTurn');
    if (!group || group.id !== transit.fleetGroupId || !roles ||
        !Array.isArray(activeVesselIds) || activeVesselIds.length === 0 ||
        activeVesselIds.some((shipId) => typeof shipId !== 'string' || !isResourceShipId(shipId)) ||
        new Set(activeVesselIds).size !== activeVesselIds.length ||
        group.vesselIds.some((shipId) => !activeVesselIds.includes(shipId)) ||
        !Array.isArray(rawDockings) || !shuttleDockingsAreParked(rawDockings, activeVesselIds as string[]) ||
        !shuttleDockingsMatchActiveRoleOwnedSubset(roles, rawDockings as { shuttleId: string; shipId: string }[]) ||
        !controls?.[data.shuttleId] || !phase || !Number.isSafeInteger(currentCycle) ||
        currentCycle !== phase.turn || (currentCycle as number) < transit.cycle) {
      throw commandError('failed-precondition', 'The authoritative shuttle arrival state is unavailable.', 'conflict');
    }
    const dockings = rawDockings as { shuttleId: string; shipId: string; dockedAt: string }[];
    const visitLog = parseShuttleArrivalVisitLog(session.get('shuttleVisitLog'), dockings, activeVesselIds as string[]);
    if (!visitLog) {
      throw commandError('failed-precondition', 'The shuttle visit history is malformed.', 'conflict');
    }
    let arrival: ReturnType<typeof applyShuttleArrival>;
    try {
      arrival = applyShuttleArrival({
        actorUid: uid,
        expectedTransitRequestId: data.transitRequestId,
        expectedControlRevision: data.expectedControlRevision,
        currentCycle: currentCycle as number,
        transit,
        control: controls[data.shuttleId]!,
        group,
        activeRoleIds: roles,
        activeVesselIds: activeVesselIds as string[],
        dockings,
        visitLog,
        now,
      });
    } catch (cause) {
      throw commandError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'Shuttle arrival was rejected.',
        'conflict',
      );
    }
    const reply: ShuttleArrivalReply = {
      status: 'arrived',
      sessionId: data.sessionId,
      requestId,
      transitRequestId: data.transitRequestId,
      shuttleId: data.shuttleId,
      hostShipId: arrival.result.hostShipId,
      arrivedAt: arrival.result.arrivedAt,
      transitRevision: arrival.result.transitRevision,
    };
    const event = buildPrivacySafeEventRecord({
      type: 'shuttle-arrival',
      envelope: {
        sessionId: data.sessionId,
        actorUid: uid,
        actorRoleId: null,
        turn: currentCycle,
        phase: 'active',
        requestId,
        revision: arrival.result.transitRevision + 1,
        serverTime: arrival.result.arrivedAt,
        visibility: EventVisibility.Member,
      },
      payload: {
        shuttleId: data.shuttleId,
        holderUid: uid,
        fleetGroupId: group.id,
        originShipId: transit.originShipId,
        destinationShipId: transit.destinationShipId,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(sessionRef, {
      shuttleDockings: arrival.dockings,
      shuttleVisitLog: arrival.visitLog,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(transitRef);
    tx.delete(transitChainRef);
    tx.create(eventRef, event);
    tx.create(receiptRef, {
      fingerprint,
      result: reply,
      eventId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
  });
}
