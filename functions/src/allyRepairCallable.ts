import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { decideActionAuthorization } from './actionMetadata';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { fleetGroupRecord } from './fleetGroups';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { isPresenceStale } from './sessionLifecycle';
import { parseShuttleControl } from './shuttleControl';
import { shuttleDockingsAreParked } from './craftOwnership';
import { turnPhaseState } from './turnZero';
import { serviceRechargeDamageState, serviceRechargeResourceState } from './serviceShuttleRecharge';
import { isResourceShipId } from './resources';
import { SHIP_DAMAGE_DECKS } from './shipDamage';
import {
  ALLY_HOST_SHIP_IDS,
  ALLY_UNION_ROLE_ID,
  parseAllyRepairLedger,
  resolveAllyRepair,
} from './allyRepair';

type RecordValue = Record<string, unknown>;
type AllyRepairReply = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  requestId: string;
  shuttleId: 'ally';
  hostShipId: typeof ALLY_HOST_SHIP_IDS[number];
  systemIds: readonly string[];
  materialsRemaining: number;
  cycle: number;
  repairRevision: number;
}>;

const LEGACY_M1_PATHS = [
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

function requireUid(auth: { uid?: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before repairing consoles.');
  return auth.uid;
}

function activePlayer(player: DocumentSnapshot): boolean {
  if (!player.exists || player.get('connected') !== true || player.get('kickedAt') != null) return false;
  const lastSeenAt = player.get('lastSeenAt');
  if (lastSeenAt === undefined) return true;
  return lastSeenAt instanceof Timestamp && !isPresenceStale(lastSeenAt.toDate(), new Date());
}

function actualPlayerRole(player: DocumentSnapshot): string | undefined {
  for (const field of ['replacementRoleId', 'assignedRoleId', 'activeConsoleRoleId']) {
    const value = player.get(field);
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function activeUnionControl(session: DocumentSnapshot, player: DocumentSnapshot, uid: string): void {
  const activeRoleIds = session.get('activeRoleIds');
  if (!Array.isArray(activeRoleIds) || activeRoleIds.some((id) => typeof id !== 'string') ||
      !activeRoleIds.includes(ALLY_UNION_ROLE_ID) || actualPlayerRole(player) !== ALLY_UNION_ROLE_ID) {
    throw new HttpsError('permission-denied', 'An active Joint Engineering Union role is required for Ally repairs.');
  }
  const control = parseShuttleControl(session.get('shuttleControl'))?.ally;
  if (!control || control.shuttleId !== 'ally' || control.ownerRoleId !== ALLY_UNION_ROLE_ID ||
      control.holderUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the current J.E.U. Ally holder may repair consoles.');
  }
  if (player.get('role') !== 'player' ||
      (player.get('escapeState') !== undefined && player.get('escapeState') !== null)) {
    throw new HttpsError('permission-denied', 'An active Union player aboard a ship is required.');
  }
}

function validateRequest(raw: unknown): Readonly<{
  sessionId: string;
  requestId: string;
  expectedControlRevision: number;
  expectedRepairRevision: number;
  expectedCycle: number;
  expectedHostShipId: typeof ALLY_HOST_SHIP_IDS[number];
  systemIds: string[];
}> {
  const allowed = new Set([
    'sessionId', 'requestId', 'expectedControlRevision', 'expectedRepairRevision',
    'expectedCycle', 'expectedHostShipId', 'systemIds',
  ]);
  if (!isRecord(raw) || Object.keys(raw).some((key) => !allowed.has(key)) ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId) ||
      typeof raw.requestId !== 'string' || !/^[\w-]{1,128}$/.test(raw.requestId) ||
      !Number.isSafeInteger(raw.expectedControlRevision) || (raw.expectedControlRevision as number) < 0 ||
      !Number.isSafeInteger(raw.expectedRepairRevision) || (raw.expectedRepairRevision as number) < 0 ||
      !Number.isSafeInteger(raw.expectedCycle) || (raw.expectedCycle as number) < 1 ||
      typeof raw.expectedHostShipId !== 'string' ||
      !ALLY_HOST_SHIP_IDS.includes(raw.expectedHostShipId as typeof ALLY_HOST_SHIP_IDS[number]) ||
      !Array.isArray(raw.systemIds) || raw.systemIds.length < 1 || raw.systemIds.length > 2 ||
      raw.systemIds.some((id) => typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)) ||
      new Set(raw.systemIds).size !== raw.systemIds.length) {
    throw new HttpsError('invalid-argument', 'Invalid Ally repair request.');
  }
  return {
    sessionId: raw.sessionId,
    requestId: raw.requestId,
    expectedControlRevision: raw.expectedControlRevision as number,
    expectedRepairRevision: raw.expectedRepairRevision as number,
    expectedCycle: raw.expectedCycle as number,
    expectedHostShipId: raw.expectedHostShipId as typeof ALLY_HOST_SHIP_IDS[number],
    systemIds: [...raw.systemIds as string[]].sort(),
  };
}

function fingerprintFor(
  uid: string,
  request: ReturnType<typeof validateRequest>,
): CommandFingerprint {
  return {
    action: 'ally-repair',
    sessionId: request.sessionId,
    requestId: request.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: request.expectedRepairRevision,
    payload: {
      expectedControlRevision: request.expectedControlRevision,
      expectedCycle: request.expectedCycle,
      hostShipId: request.expectedHostShipId,
      systemIds: request.systemIds,
    },
  };
}

function isAllyRepairReply(value: unknown, fingerprint: CommandFingerprint): value is AllyRepairReply {
  if (!isRecord(value)) return false;
  const payload = fingerprint.payload;
  const systemIds = payload.systemIds;
  const hostShipId = payload.hostShipId;
  return Object.keys(value).every((key) => [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId', 'systemIds',
    'materialsRemaining', 'cycle', 'repairRevision',
  ].includes(key)) &&
    value.status === 'committed' && value.sessionId === fingerprint.sessionId &&
    value.requestId === fingerprint.requestId && value.shuttleId === 'ally' &&
    value.hostShipId === hostShipId && Array.isArray(value.systemIds) &&
    Array.isArray(systemIds) && value.systemIds.length === systemIds.length &&
    value.systemIds.every((id, index) => id === systemIds[index]) &&
    Number.isSafeInteger(value.materialsRemaining) && (value.materialsRemaining as number) >= 0 &&
    value.cycle === payload.expectedCycle &&
    Number.isSafeInteger(value.repairRevision) && value.repairRevision === fingerprint.expectedRevision! + 1;
}

function replayReply(
  receipt: DocumentSnapshot,
  fingerprint: CommandFingerprint,
): AllyRepairReply | undefined {
  if (!receipt.exists) return undefined;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', 'This Ally repair request belongs to a different actor.');
  }
  if (disposition.kind === 'collision') {
    throw new HttpsError('failed-precondition', 'This Ally repair request id is bound to a different command.');
  }
  const stored = receipt.get('result');
  if (!isAllyRepairReply(stored, fingerprint)) {
    throw new HttpsError('failed-precondition', 'This Ally repair request has no replayable result.');
  }
  return { ...stored, status: 'replayed' };
}

export const repairConsolesFromAlly = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  expectedControlRevision?: unknown;
  expectedRepairRevision?: unknown;
  expectedCycle?: unknown;
  expectedHostShipId?: unknown;
  systemIds?: unknown;
}>(CALLABLE_RUNTIME_OPTIONS, async (request) => {
  const uid = requireUid(request.auth);
  const command = validateRequest(request.data);
  const fingerprint = fingerprintFor(uid, command);
  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
  const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);
  const eventRef = db.doc(`sessions/${command.sessionId}/events/ally-repair-${command.requestId}`);
  const legacyRefs = LEGACY_M1_PATHS.map((path) => db.doc(path(command.sessionId, command.requestId)));

  return db.runTransaction(async (tx) => {
    const [session, actor, receipt, event, ...legacy] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(receiptRef), tx.get(eventRef),
      ...legacyRefs.map((ref) => tx.get(ref)),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!activePlayer(actor) || actor.get('role') !== 'player') {
      throw new HttpsError('permission-denied', 'Only a connected J.E.U. Ally holder may repair consoles.');
    }
    activeUnionControl(session, actor, uid);
    const groupId = actor.get('fleetGroupId');
    const activeVesselIds = session.get('activeVesselIds');
    if (typeof groupId !== 'string' || groupId.length === 0 || !Array.isArray(activeVesselIds) ||
        activeVesselIds.some((shipId) => typeof shipId !== 'string' || !isResourceShipId(shipId)) ||
        new Set(activeVesselIds).size !== activeVesselIds.length ||
        !ALLY_HOST_SHIP_IDS.every((shipId) => activeVesselIds.includes(shipId))) {
      throw new HttpsError('failed-precondition', 'The authoritative Union fleet state is unavailable.');
    }
    const groupSnapshot = await tx.get(db.doc(`sessions/${command.sessionId}/fleetGroups/${groupId}`));
    const group = groupSnapshot.exists ? fleetGroupRecord(groupSnapshot.data()) : undefined;
    if (!group || group.id !== groupId || !group.memberUids.includes(uid) ||
        !group.vesselIds.includes(command.expectedHostShipId) ||
        !activeVesselIds.includes(command.expectedHostShipId)) {
      throw new HttpsError('permission-denied', 'The Ally holder is outside the requested ship’s fleet group.');
    }
    if (legacy.some((snapshot) => snapshot.exists)) {
      throw new HttpsError('failed-precondition', 'This Ally repair request id is already bound to a legacy command.');
    }
    const replay = replayReply(receipt, fingerprint);
    if (replay) return replay;
    if (event.exists) {
      throw new HttpsError('failed-precondition', 'This Ally repair request has an unbound event receipt.');
    }

    if (session.get('phase') !== 'active') {
      throw new HttpsError('failed-precondition', 'Ally repair is available only during active gameplay.');
    }
    const currentCycle = session.get('currentTurn');
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!Number.isSafeInteger(currentCycle) || currentCycle !== command.expectedCycle ||
        !phase || phase.turn !== currentCycle) {
      throw new HttpsError('failed-precondition', 'The Coordination cycle changed. Refresh before repairing.');
    }
    const authorization = decideActionAuthorization({
      action: 'transfer', actorScope: 'player', turnPhase: session.get('turnPhase'),
    });
    const openAirspaceEndsAt = Date.parse(phase.openAirspaceEndsAt);
    if (!authorization.allowed || phase.airspace.state !== 'lifted' || phase.timerPause !== undefined ||
        !Number.isFinite(openAirspaceEndsAt) || Date.now() >= openAirspaceEndsAt) {
      throw new HttpsError('failed-precondition', 'Ally repair is available only during a live Coordination window.');
    }

    const dockings = session.get('shuttleDockings');
    const controls = parseShuttleControl(session.get('shuttleControl'));
    const fuelled = session.get('shuttleFuelled');
    const ledger = parseAllyRepairLedger(session.get('allyRepairs'));
    if (!Array.isArray(dockings) ||
        !shuttleDockingsAreParked(dockings, activeVesselIds as string[]) ||
        !controls?.ally || !isRecord(fuelled) || typeof fuelled.ally !== 'boolean' || !ledger) {
      throw new HttpsError('failed-precondition', 'The authoritative Ally repair state is unavailable.');
    }
    const allyDockings = dockings.filter((docking) => isRecord(docking) && docking.shuttleId === 'ally');
    if (allyDockings.length !== 1 || allyDockings[0]!.shipId !== command.expectedHostShipId ||
        !group.vesselIds.includes(command.expectedHostShipId)) {
      throw new HttpsError('failed-precondition', 'Ally’s current dock changed or is outside the holder’s fleet group.');
    }
    const hostShipId = command.expectedHostShipId;
    const damage = serviceRechargeDamageState(session.get('shipDamage'), hostShipId);
    const resources = serviceRechargeResourceState(session.get('shipResources'), hostShipId);
    const deck = SHIP_DAMAGE_DECKS[hostShipId];
    if (!damage || !resources || !deck) {
      throw new HttpsError('failed-precondition', 'The docked host repair state is unavailable.');
    }
    let result: ReturnType<typeof resolveAllyRepair>;
    try {
      result = resolveAllyRepair({
        actorUid: uid,
        currentCycle: currentCycle as number,
        expectedControlRevision: command.expectedControlRevision,
        expectedRepairRevision: command.expectedRepairRevision,
        systemIds: command.systemIds,
        control: controls.ally,
        dockings: dockings as { shuttleId: string; shipId: string; dockedAt: string }[],
        fuelled: fuelled.ally,
        damage,
        materials: resources.materials,
        knownSystemIds: deck.map(({ systemId }) => systemId),
        ledger,
      });
    } catch (cause) {
      throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Ally repair was rejected.');
    }
    const reply: AllyRepairReply = {
      status: 'committed', sessionId: command.sessionId, requestId: command.requestId,
      shuttleId: 'ally', hostShipId: result.hostShipId, systemIds: result.repairedSystemIds,
      materialsRemaining: result.materials, cycle: currentCycle as number,
      repairRevision: result.ledger.revision,
    };
    tx.update(sessionRef, {
      [`shipDamage.${result.hostShipId}`]: result.damage,
      [`shipResources.${result.hostShipId}.materials`]: result.materials,
      allyRepairs: result.ledger,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, {
      fingerprint,
      result: reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
});
