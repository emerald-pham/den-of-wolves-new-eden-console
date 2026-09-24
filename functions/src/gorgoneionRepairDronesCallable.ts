import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { buildAuthoritativeEventEnvelope, EventVisibility } from './eventEnvelope';
import { buildPrivacySafeEventRecord } from './eventRedaction';
import { MAINTENANCE_ORDERS } from './maintenanceOrder';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { isPresenceStale } from './sessionLifecycle';
import {
  resolveGorgoneionRepairDrones,
  type GorgoneionRepairDronesState,
} from './gorgoneionRepairDrones';
import { serviceRechargeDamageState, serviceRechargeResourceState } from './serviceShuttleRecharge';
import { turnPhaseState } from './turnZero';
import { isResourceShipId } from './resources';

const ROLE_ID = 'gorgoneion-captain' as const;
const SMALL_SHIP_ID = 'gorgoneion' as const;
const ACTION = 'gorgoneion-repair-drones' as const;
const EVENT_TYPE = 'gorgoneion-repair-drones' as const;
const REPAIR_COST = 3;

type RecordValue = Record<string, unknown>;

export interface GorgoneionRepairDronesCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedCycle: number;
  readonly expectedRepairRevision: number;
  readonly expectedDockingRevision: number;
  readonly expectedHostShipId: string;
  readonly systemId: string;
}

export interface GorgoneionRepairDronesReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly smallShipId: typeof SMALL_SHIP_ID;
  readonly hostShipId: string;
  readonly systemId: string;
  readonly materialsSpent: number;
  readonly materialsRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

const LEGACY_REQUEST_PATHS = [
  (sessionId: string, requestId: string) => `sessions/${sessionId}/setupMutationRequests/${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/gmResponsibilityRequests/${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/seatMutationRequests/${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/loyaltyAssignmentRequests/${requestId}`,
  (sessionId: string, requestId: string) => `sessionStartRequests/${sessionId}_${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/events/setup-confirm-${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/events/gm-responsibility-${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/events/start-${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/events/seat-claim-${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/events/seat-release-${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/events/${requestId}`,
  (sessionId: string, requestId: string) => `sessions/${sessionId}/events/press-availability-${requestId}`,
] as const;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeCounter(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function requireUid(auth: { uid?: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before using Repair Drones.');
  return auth.uid;
}

export function parseGorgoneionRepairDronesCommand(value: unknown): GorgoneionRepairDronesCommand | null {
  const raw = isRecord(value) ? value : undefined;
  const fields = [
    'sessionId', 'requestId', 'expectedCycle', 'expectedRepairRevision',
    'expectedDockingRevision', 'expectedHostShipId', 'systemId',
  ] as const;
  if (!raw || Object.keys(raw).length !== fields.length || fields.some((field) => !Object.hasOwn(raw, field)) ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId) ||
      typeof raw.requestId !== 'string' || !/^[\w-]{1,128}$/.test(raw.requestId) ||
      !safeCounter(raw.expectedCycle, 1) ||
      !safeCounter(raw.expectedRepairRevision, 0) || raw.expectedRepairRevision >= Number.MAX_SAFE_INTEGER ||
      !safeCounter(raw.expectedDockingRevision, 0) ||
      typeof raw.expectedHostShipId !== 'string' || !isResourceShipId(raw.expectedHostShipId) ||
      typeof raw.systemId !== 'string' || !/^[\w-]{1,128}$/.test(raw.systemId)) return null;
  return {
    sessionId: raw.sessionId,
    requestId: raw.requestId,
    expectedCycle: raw.expectedCycle,
    expectedRepairRevision: raw.expectedRepairRevision,
    expectedDockingRevision: raw.expectedDockingRevision,
    expectedHostShipId: raw.expectedHostShipId,
    systemId: raw.systemId,
  };
}

function activePlayer(player: DocumentSnapshot): boolean {
  if (!player.exists || player.get('role') !== 'player' || player.get('connected') !== true ||
      player.get('kickedAt') != null || player.get('escapeState') != null) return false;
  const lastSeenAt = player.get('lastSeenAt');
  if (lastSeenAt === undefined) return true;
  return lastSeenAt instanceof Timestamp && !isPresenceStale(lastSeenAt.toDate(), new Date());
}

function currentCaptainSeat(session: DocumentSnapshot, player: DocumentSnapshot, seat: DocumentSnapshot, uid: string): void {
  const activeRoleIds = session.get('activeRoleIds');
  if (!Array.isArray(activeRoleIds) || activeRoleIds.some((roleId) => typeof roleId !== 'string') ||
      new Set(activeRoleIds).size !== activeRoleIds.length || !activeRoleIds.includes(ROLE_ID) ||
      player.get('assignedRoleId') !== ROLE_ID || player.get('seatId') !== ROLE_ID ||
      (player.get('replacementRoleId') !== undefined && player.get('replacementRoleId') !== null) ||
      !seat.exists || seat.id !== ROLE_ID || seat.get('roleId') !== ROLE_ID ||
      seat.get('status') !== 'claimed' || seat.get('holderUid') !== uid) {
    throw new HttpsError('permission-denied', 'Only the current Gorgoneion Captain may use Repair Drones.');
  }
}

function fingerprintFor(uid: string, command: GorgoneionRepairDronesCommand): CommandFingerprint {
  return {
    action: ACTION,
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: command.expectedRepairRevision,
    payload: {
      expectedCycle: command.expectedCycle,
      expectedDockingRevision: command.expectedDockingRevision,
      expectedHostShipId: command.expectedHostShipId,
      systemId: command.systemId,
    },
  };
}

function replyMatchesFingerprint(value: unknown, fingerprint: CommandFingerprint): value is GorgoneionRepairDronesReply {
  if (!isRecord(value)) return false;
  const payload = fingerprint.payload;
  const keys = [
    'status', 'sessionId', 'requestId', 'smallShipId', 'hostShipId', 'systemId',
    'materialsSpent', 'materialsRemaining', 'cycle', 'repairRevision',
  ];
  return Object.keys(value).every((key) => keys.includes(key)) &&
    value.status === 'committed' && value.sessionId === fingerprint.sessionId &&
    value.requestId === fingerprint.requestId && value.smallShipId === SMALL_SHIP_ID &&
    value.hostShipId === payload.expectedHostShipId && value.systemId === payload.systemId &&
    value.materialsSpent === REPAIR_COST &&
    Number.isSafeInteger(value.materialsRemaining) && (value.materialsRemaining as number) >= 0 &&
    value.cycle === payload.expectedCycle &&
    Number.isSafeInteger(value.repairRevision) && value.repairRevision === fingerprint.expectedRevision! + 1;
}

function replayReply(
  receipt: DocumentSnapshot,
  fingerprint: CommandFingerprint,
): GorgoneionRepairDronesReply | undefined {
  if (!receipt.exists) return undefined;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', 'This Repair Drones request belongs to a different actor.');
  }
  if (disposition.kind === 'collision') {
    throw new HttpsError('failed-precondition', 'This Repair Drones request id is bound to a different command.');
  }
  const result = receipt.get('result');
  if (!replyMatchesFingerprint(result, fingerprint)) {
    throw new HttpsError('failed-precondition', 'This Repair Drones request has no replayable result.');
  }
  return { ...result, status: 'replayed' };
}

function activeVessels(session: DocumentSnapshot): readonly string[] {
  const ids = session.get('activeVesselIds');
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) =>
    typeof id !== 'string' || !Object.hasOwn(MAINTENANCE_ORDERS, id)) ||
      new Set(ids).size !== ids.length || !ids.includes(SMALL_SHIP_ID)) {
    throw new HttpsError('failed-precondition', 'The active vessel authority is unavailable.');
  }
  return ids as string[];
}

export const repairGorgoneionWithDrones = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  expectedCycle?: unknown;
  expectedRepairRevision?: unknown;
  expectedDockingRevision?: unknown;
  expectedHostShipId?: unknown;
  systemId?: unknown;
}>(CALLABLE_RUNTIME_OPTIONS, async (request) => {
  const uid = requireUid(request.auth);
  const command = parseGorgoneionRepairDronesCommand(request.data);
  if (!command) throw new HttpsError('invalid-argument', 'Invalid Gorgoneion Repair Drones request.');
  const fingerprint = fingerprintFor(uid, command);
  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
  const seatRef = db.doc(`sessions/${command.sessionId}/seats/${ROLE_ID}`);
  const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);
  const eventRef = db.doc(`sessions/${command.sessionId}/events/${EVENT_TYPE}-${command.requestId}`);
  const legacyRefs = LEGACY_REQUEST_PATHS.map((path) => db.doc(path(command.sessionId, command.requestId)));

  return db.runTransaction(async (tx) => {
    const [session, actor, seat, receipt, event, ...legacy] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(seatRef), tx.get(receiptRef), tx.get(eventRef),
      ...legacyRefs.map((ref) => tx.get(ref)),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!activePlayer(actor)) {
      throw new HttpsError('permission-denied', 'A connected Gorgoneion Captain is required.');
    }
    currentCaptainSeat(session, actor, seat, uid);
    const replay = replayReply(receipt, fingerprint);
    if (replay) return replay;
    if (legacy.some((snapshot) => snapshot.exists)) {
      throw new HttpsError('failed-precondition', 'This Repair Drones request id is already bound to another command.');
    }
    if (event.exists) {
      throw new HttpsError('failed-precondition', 'This Repair Drones request has an unbound event receipt.');
    }

    if (session.get('phase') !== 'active') {
      throw new HttpsError('failed-precondition', 'Repair Drones are available only during active gameplay.');
    }
    const currentCycle = session.get('currentTurn');
    const phase = turnPhaseState(session.get('turnPhase'));
    const openAirspaceEndsAt = phase ? Date.parse(phase.openAirspaceEndsAt) : Number.NaN;
    if (!Number.isSafeInteger(currentCycle) || currentCycle !== command.expectedCycle ||
        !phase || phase.turn !== currentCycle || phase.airspace.state !== 'lifted' ||
        phase.timerPause !== undefined || !Number.isFinite(openAirspaceEndsAt) || Date.now() >= openAirspaceEndsAt) {
      throw new HttpsError('failed-precondition', 'Repair Drones are available only during the current live Coordination cycle.');
    }

    const activeVesselIds = activeVessels(session);
    const smallShipStates = session.get('smallShipStates');
    const smallShipState = isRecord(smallShipStates) ? smallShipStates[SMALL_SHIP_ID] : undefined;
    if (!isRecord(smallShipState) || smallShipState.id !== SMALL_SHIP_ID ||
        smallShipState.dockingRevision !== command.expectedDockingRevision ||
        smallShipState.hostShipId !== command.expectedHostShipId) {
      throw new HttpsError('failed-precondition', 'Gorgoneion’s dock or state changed. Refresh before repairing.');
    }
    const hostShipId = smallShipState.hostShipId;
    if (typeof hostShipId !== 'string' || !isResourceShipId(hostShipId) ||
        !activeVesselIds.includes(hostShipId)) {
      throw new HttpsError('failed-precondition', 'Gorgoneion is not docked with a current eligible host.');
    }
    const hostResources = serviceRechargeResourceState(session.get('shipResources'), hostShipId);
    const hostDamage = serviceRechargeDamageState(session.get('shipDamage'), hostShipId);
    if (!hostResources || !hostDamage) {
      throw new HttpsError('failed-precondition', 'The current docked-host repair state is unavailable.');
    }

    let result: ReturnType<typeof resolveGorgoneionRepairDrones>;
    try {
      result = resolveGorgoneionRepairDrones({
        actorRoleId: actor.get('assignedRoleId'),
        actorScope: 'player',
        currentCycle: currentCycle as number,
        expectedRevision: command.expectedRepairRevision,
        turnPhase: session.get('turnPhase'),
        smallShipState,
        hostResources,
        hostDamage,
        systemId: command.systemId,
        state: session.get('gorgoneionRepairDrones'),
      });
    } catch (cause) {
      throw new HttpsError('failed-precondition', cause instanceof Error
        ? cause.message : 'Gorgoneion Repair Drones were rejected.');
    }

    const reply: GorgoneionRepairDronesReply = {
      status: 'committed', sessionId: command.sessionId, requestId: command.requestId,
      smallShipId: SMALL_SHIP_ID, hostShipId: result.hostShipId,
      systemId: result.repairedSystemId, materialsSpent: REPAIR_COST,
      materialsRemaining: result.hostResources.materials, cycle: currentCycle as number,
      repairRevision: result.state.revision,
    };
    tx.update(sessionRef, {
      [`shipDamage.${result.hostShipId}`]: result.hostDamage,
      [`shipResources.${result.hostShipId}.materials`]: result.hostResources.materials,
      gorgoneionRepairDrones: result.state satisfies GorgoneionRepairDronesState,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: EVENT_TYPE,
      envelope: buildAuthoritativeEventEnvelope({
        sessionId: command.sessionId, actorUid: uid, actorRoleId: ROLE_ID,
        turn: currentCycle as number, phase: 'active', type: EVENT_TYPE,
        requestId: command.requestId, revision: result.state.revision,
        serverTime: new Date(), visibility: EventVisibility.Member,
      }),
      payload: {
        smallShipId: SMALL_SHIP_ID, hostShipId: result.hostShipId,
        systemId: result.repairedSystemId, materialsSpent: REPAIR_COST,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, {
      fingerprint,
      result: reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
});
