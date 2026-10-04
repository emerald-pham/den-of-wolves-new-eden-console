import { randomInt } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { commandReceiptDisposition } from './commandIdempotency';
import { endeavourResearchTrack } from './endeavourResearch';
import { reserveWolfAgentDetectorTest } from './endeavourWolfAgentDetector';
import { detectorReportedWolf } from './pc09SpecialistMechanics';
import { fleetGroupRecord } from './fleetGroups';
import { isPresenceStale } from './sessionLifecycle';
import { turnPhaseState } from './turnZero';

type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireUid(auth: { uid?: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before testing the Wolf Agent Detector.');
  return auth.uid;
}

function activePlayer(player: { exists: boolean; id: string; get(field: string): unknown }): boolean {
  if (!player.exists || player.get('connected') !== true || player.get('kickedAt') != null) return false;
  const lastSeen = player.get('lastSeenAt');
  return lastSeen === undefined ||
    (lastSeen instanceof Timestamp && !isPresenceStale(lastSeen.toDate(), new Date()));
}

function validateRequest(raw: unknown): Readonly<{
  sessionId: string; requestId: string; expectedCycle: number; expectedRevision: number; targetUid: string;
}> {
  const fields = ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'targetUid'];
  if (!record(raw) || Object.keys(raw).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(raw, field)) ||
      Object.keys(raw).some((field) => !fields.includes(field)) ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId) ||
      typeof raw.requestId !== 'string' || !/^[\w-]{1,128}$/.test(raw.requestId) ||
      typeof raw.targetUid !== 'string' || !/^[\w-]{1,128}$/.test(raw.targetUid) ||
      !Number.isSafeInteger(raw.expectedCycle) || (raw.expectedCycle as number) < 1 ||
      !Number.isSafeInteger(raw.expectedRevision) || (raw.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'Invalid Wolf Agent Detector test request.');
  }
  return raw as unknown as ReturnType<typeof validateRequest>;
}

function isSafeResult(value: unknown, request: ReturnType<typeof validateRequest>, uid: string): value is RecordValue {
  return record(value) &&
    Object.keys(value).sort().join(',') === [
      'cycle', 'investigatorUid', 'reportedWolf', 'requestId', 'revision', 'sessionId',
      'status', 'targetDisplayName', 'targetUid', 'type',
    ].sort().join(',') &&
    value.status === 'committed' && value.type === 'wolf-agent-detector-test' &&
    value.sessionId === request.sessionId && value.requestId === request.requestId &&
    value.investigatorUid === uid && value.targetUid === request.targetUid &&
    value.cycle === request.expectedCycle && value.revision === request.expectedRevision + 1 &&
    typeof value.targetDisplayName === 'string' && value.targetDisplayName.length > 0 &&
    typeof value.reportedWolf === 'boolean';
}

/**
 * Perform one private, server-randomized detector test. The hidden truth and
 * accuracy roll are recorded in a server-only audit document, separate from
 * the private report projection returned to the current Scientist.
 */
export const runWolfAgentDetectorTest = onCall<{
  sessionId?: unknown; requestId?: unknown; expectedCycle?: unknown;
  expectedRevision?: unknown; targetUid?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const command = validateRequest(request.data);
  if (command.targetUid === uid) throw new HttpsError('invalid-argument', 'Choose another player to test.');
  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
  const targetRef = db.doc(`sessions/${command.sessionId}/players/${command.targetUid}`);
  const targetSecretRef = db.doc(`sessions/${command.sessionId}/secrets/loyalty-${command.targetUid}`);
  const researchRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourResearch`);
  const stateRef = db.doc(`sessions/${command.sessionId}/wolfAgentDetectorStates/${uid}`);
  const reportRef = db.doc(`sessions/${command.sessionId}/wolfAgentDetectorReports/${uid}`);
  const auditRef = db.doc(`sessions/${command.sessionId}/wolfAgentDetectorAudits/${command.requestId}`);
  const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);
  const fingerprint = {
    action: 'wolf-agent-detector-test', sessionId: command.sessionId, requestId: command.requestId,
    actorUid: uid, instanceId: null, expectedRevision: command.expectedRevision,
    payload: { expectedCycle: command.expectedCycle, targetUid: command.targetUid },
  };
  let accuracyRoll: number | undefined;

  return db.runTransaction(async (tx) => {
    const [session, actor, target, secret, research, state, prior] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(targetRef), tx.get(targetSecretRef),
      tx.get(researchRef), tx.get(stateRef), tx.get(receiptRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!activePlayer(actor) || actor.get('role') !== 'player' || actor.get('replacementStatus') != null ||
        actor.get('assignedRoleId') !== 'shepherd-scientist' ||
        actor.get('activeConsoleRoleId') !== 'shepherd-scientist') {
      throw new HttpsError('permission-denied', 'Only the current Shepherd Scientist can use the detector.');
    }
    const controls = session.get('shuttleControl');
    const endeavour = record(controls) && record(controls.endeavour) ? controls.endeavour : undefined;
    if (!endeavour || endeavour.ownerRoleId !== 'shepherd-scientist' || endeavour.holderUid !== uid) {
      throw new HttpsError('permission-denied', 'The Scientist must hold the Endeavour.');
    }
    const groupId = actor.get('fleetGroupId');
    const activeVessels = session.get('activeVesselIds');
    if (typeof groupId !== 'string' || !Array.isArray(activeVessels) || !activeVessels.includes('shepherd')) {
      throw new HttpsError('failed-precondition', 'The current Shepherd fleet state is unavailable.');
    }
    const groupSnapshot = await tx.get(db.doc(`sessions/${command.sessionId}/fleetGroups/${groupId}`));
    const group = groupSnapshot.exists ? fleetGroupRecord(groupSnapshot.data()) : undefined;
    if (!group || group.id !== groupId || !group.memberUids.includes(uid) || !group.vesselIds.includes('shepherd')) {
      throw new HttpsError('permission-denied', 'The Scientist is outside the current Shepherd group.');
    }
    const currentTurn = session.get('currentTurn');
    if (session.get('phase') !== 'active' || !Number.isSafeInteger(currentTurn) ||
        currentTurn !== command.expectedCycle) {
      throw new HttpsError('failed-precondition', 'This detector request belongs to another cycle.');
    }
    const priorDisposition = prior.exists
      ? commandReceiptDisposition(prior.get('fingerprint'), fingerprint) : undefined;
    if (prior.exists && priorDisposition?.kind !== 'replay') {
      throw new HttpsError(priorDisposition?.kind === 'foreign-actor' ? 'permission-denied' : 'failed-precondition',
        'This detector request id is already bound to another command.');
    }
    if (prior.exists) {
      const result = prior.get('result');
      if (!isSafeResult(result, command, uid)) {
        throw new HttpsError('failed-precondition', 'This detector request has no safe replay result.');
      }
      return result;
    }
    const researchProgress = research.exists ? research.data() : {};
    try {
      if (!endeavourResearchTrack(researchProgress, 'wolf-agent-detector').complete) {
        throw new Error('Complete the Wolf Agent Detector research before testing.');
      }
    } catch (cause) {
      throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Detector research is unavailable.');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== currentTurn || phase.airspace.state !== 'restricted' || phase.timerPause ||
        Date.now() >= Date.parse(phase.teamPhaseEndsAt)) {
      throw new HttpsError('failed-precondition', 'Detector tests are available only during the current Team Phase.');
    }
    const targetName = target.get('displayName');
    const payload = secret.get('payload');
    const visibleTo = secret.get('visibleToUids');
    if (!activePlayer(target) || typeof targetName !== 'string' || !targetName.trim() ||
        targetName.trim().length > 40 || !Array.isArray(visibleTo) || visibleTo.length !== 1 ||
        visibleTo[0] !== command.targetUid || !record(payload) || payload.type !== 'loyalty' ||
        typeof payload.kind !== 'string') {
      throw new HttpsError('failed-precondition', 'That target has no current private loyalty record.');
    }
    try {
      const reservation = reserveWolfAgentDetectorTest({
        progress: researchProgress,
        state: state.exists ? state.data() : undefined,
        expectedRevision: command.expectedRevision,
        cycle: currentTurn as number,
      });
      const actualWolf = payload.kind === 'wolf-agent' || payload.kind === 'wolf-cult';
      accuracyRoll ??= randomInt(1, 6);
      const reportedWolf = detectorReportedWolf(actualWolf, accuracyRoll);
      const result = {
        status: 'committed' as const,
        type: 'wolf-agent-detector-test' as const,
        sessionId: command.sessionId,
        requestId: command.requestId,
        cycle: currentTurn as number,
        revision: reservation.state.revision,
        investigatorUid: uid,
        targetUid: command.targetUid,
        targetDisplayName: targetName.trim(),
        reportedWolf,
      };
      tx.set(stateRef, reservation.state);
      tx.set(reportRef, { ...result, visibleToUids: [uid], updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef, {
        type: 'wolf-agent-detector-audit', sessionId: command.sessionId,
        requestId: command.requestId, cycle: currentTurn, revision: reservation.state.revision,
        investigatorUid: uid, targetUid: command.targetUid, targetLoyaltyKind: payload.kind,
        actualWolf, reportedWolf, accuracyRoll, accurate: accuracyRoll <= 4,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
      return result;
    } catch (cause) {
      throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Detector test failed.');
    }
  });
});
