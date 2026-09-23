import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { decideActionAuthorization } from './actionMetadata';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import {
  ENDEAVOUR_RESEARCH_TRACKS,
  endeavourResearchTrack,
  type EndeavourResearchTrackId,
} from './endeavourResearch';
import {
  parseEndeavourResearchCadenceState,
  resolveEndeavourResearchChoice,
  type EndeavourResearchCadenceState,
  type EndeavourResearchFunding,
} from './endeavourResearchCadence';
import { fleetGroupRecord } from './fleetGroups';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { isPresenceStale } from './sessionLifecycle';
import { parseShuttleControl } from './shuttleControl';
import { turnPhaseState } from './turnZero';
import { serviceRechargeResourceState } from './serviceShuttleRecharge';
import { isResourceShipId } from './resources';
import { ROLE_IDS } from './roleConfiguration';
import { parsePlayerEscapeState } from './escapeState';

type RecordValue = Record<string, unknown>;

export type EndeavourResearchWriterCommand = Readonly<{
  sessionId: string;
  requestId: string;
  expectedControlRevision: number;
  expectedResearchRevision: number;
  expectedCycle: number;
  trackId: EndeavourResearchTrackId;
  funding: EndeavourResearchFunding;
}>;

export type EndeavourResearchWriterReply = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  requestId: string;
  cycle: number;
  researchRevision: number;
  trackId: EndeavourResearchTrackId;
  funding: EndeavourResearchFunding;
  oreCost: 0 | 5;
  previousMaterialCost: number;
  currentMaterialCost: number | null;
  shepherdOre: number;
  progress: Readonly<Record<string, number>>;
  cadence: EndeavourResearchCadenceState;
}>;

type EndeavourResearchWriterFingerprint = CommandFingerprint & Readonly<{
  action: 'endeavour-research';
  sessionId: string;
  expectedRevision: number;
  payload: Readonly<{
    expectedControlRevision: number;
    expectedCycle: number;
    trackId: EndeavourResearchTrackId;
    funding: EndeavourResearchFunding;
  }>;
}>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isTrackId(value: unknown): value is EndeavourResearchTrackId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ENDEAVOUR_RESEARCH_TRACKS, value);
}

function requireUid(auth: { uid?: string } | undefined): string {
  if (typeof auth?.uid !== 'string' || auth.uid.length === 0) {
    throw new HttpsError('unauthenticated', 'Sign in before resolving Endeavour research.');
  }
  return auth.uid;
}

function validateCommand(raw: unknown): EndeavourResearchWriterCommand {
  const fields = [
    'sessionId', 'requestId', 'expectedControlRevision', 'expectedResearchRevision',
    'expectedCycle', 'trackId', 'funding',
  ];
  if (!isRecord(raw) || Object.keys(raw).length !== fields.length ||
      fields.some((field) => !Object.prototype.hasOwnProperty.call(raw, field)) ||
      Object.keys(raw).some((field) => !fields.includes(field)) ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId) ||
      typeof raw.requestId !== 'string' || !/^[\w-]{1,128}$/.test(raw.requestId) ||
      !isSafeCounter(raw.expectedControlRevision) ||
      !isSafeCounter(raw.expectedResearchRevision) || raw.expectedResearchRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(raw.expectedCycle) || (raw.expectedCycle as number) < 1 ||
      !isTrackId(raw.trackId) || (raw.funding !== 'standard' && raw.funding !== 'shepherd-ore')) {
    throw new HttpsError('invalid-argument', 'Invalid Endeavour research request.');
  }
  return {
    sessionId: raw.sessionId,
    requestId: raw.requestId,
    expectedControlRevision: raw.expectedControlRevision,
    expectedResearchRevision: raw.expectedResearchRevision,
    expectedCycle: raw.expectedCycle as number,
    trackId: raw.trackId,
    funding: raw.funding,
  };
}

function validateReadRequest(raw: unknown): string {
  if (!isRecord(raw) || Object.keys(raw).length !== 1 ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId)) {
    throw new HttpsError('invalid-argument', 'Invalid Endeavour research workspace request.');
  }
  return raw.sessionId;
}

function fingerprintFor(
  uid: string,
  command: EndeavourResearchWriterCommand,
): EndeavourResearchWriterFingerprint {
  return {
    action: 'endeavour-research',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: command.expectedResearchRevision,
    payload: {
      expectedControlRevision: command.expectedControlRevision,
      expectedCycle: command.expectedCycle,
      trackId: command.trackId,
      funding: command.funding,
    },
  };
}

function legacyMutationRefs(sessionId: string, requestId: string) {
  return [
    `sessions/${sessionId}/setupMutationRequests/${requestId}`,
    `sessions/${sessionId}/gmResponsibilityRequests/${requestId}`,
    `sessions/${sessionId}/seatMutationRequests/${requestId}`,
    `sessions/${sessionId}/loyaltyAssignmentRequests/${requestId}`,
    `sessionStartRequests/${sessionId}_${requestId}`,
    `sessions/${sessionId}/events/setup-confirm-${requestId}`,
    `sessions/${sessionId}/events/gm-responsibility-${requestId}`,
    `sessions/${sessionId}/events/start-${requestId}`,
    `sessions/${sessionId}/events/seat-claim-${requestId}`,
    `sessions/${sessionId}/events/seat-release-${requestId}`,
    `sessions/${sessionId}/events/${requestId}`,
    `sessions/${sessionId}/events/press-availability-${requestId}`,
  ].map((path) => getFirestore().doc(path));
}

function isResearchProgress(value: unknown): value is Readonly<Record<string, number>> {
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  try {
    for (const trackId of Object.keys(ENDEAVOUR_RESEARCH_TRACKS) as EndeavourResearchTrackId[]) {
      endeavourResearchTrack(value, trackId);
    }
    return true;
  } catch {
    return false;
  }
}

function isWriterReply(
  value: unknown,
  fingerprint: EndeavourResearchWriterFingerprint,
): value is EndeavourResearchWriterReply {
  if (!isRecord(value)) return false;
  const fields = [
    'status', 'sessionId', 'requestId', 'cycle', 'researchRevision', 'trackId', 'funding',
    'oreCost', 'previousMaterialCost', 'currentMaterialCost', 'shepherdOre', 'progress', 'cadence',
  ];
  if (Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field)) ||
      Object.keys(value).some((field) => !fields.includes(field)) ||
      value.status !== 'committed' || value.sessionId !== fingerprint.sessionId ||
      value.requestId !== fingerprint.requestId || value.cycle !== fingerprint.payload.expectedCycle ||
      value.researchRevision !== fingerprint.expectedRevision! + 1 ||
      value.trackId !== fingerprint.payload.trackId || value.funding !== fingerprint.payload.funding ||
      value.oreCost !== (fingerprint.payload.funding === 'standard' ? 0 : 5) ||
      !isSafeCounter(value.previousMaterialCost) ||
      (value.currentMaterialCost !== null && !isSafeCounter(value.currentMaterialCost)) ||
      !isSafeCounter(value.shepherdOre) || !isResearchProgress(value.progress)) return false;
  const cadence = parseEndeavourResearchCadenceState(value.cadence);
  if (!cadence || cadence.cycle !== value.cycle || cadence.revision !== value.researchRevision ||
      cadence.choices.at(-1)?.trackId !== value.trackId || cadence.choices.at(-1)?.funding !== value.funding) {
    return false;
  }
  const track = endeavourResearchTrack(value.progress, fingerprint.payload.trackId);
  const expectedPreviousCost = ENDEAVOUR_RESEARCH_TRACKS[fingerprint.payload.trackId].materialCosts[track.crossedBoxes - 1];
  return expectedPreviousCost !== undefined && value.previousMaterialCost === expectedPreviousCost &&
    value.currentMaterialCost === track.currentMaterialCost;
}

function replayReply(
  receipt: DocumentSnapshot,
  fingerprint: EndeavourResearchWriterFingerprint,
): EndeavourResearchWriterReply | undefined {
  if (!receipt.exists) return undefined;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', 'This Endeavour research request belongs to a different actor.');
  }
  if (disposition.kind === 'collision') {
    throw new HttpsError('failed-precondition', 'This Endeavour research request id is bound to a different command.');
  }
  const stored = receipt.get('result');
  if (!isWriterReply(stored, fingerprint)) {
    throw new HttpsError('failed-precondition', 'This Endeavour research request has no replayable result.');
  }
  return { ...stored, status: 'replayed' };
}

function actualPlayerRole(player: DocumentSnapshot): string | undefined {
  for (const field of ['replacementRoleId', 'assignedRoleId', 'activeConsoleRoleId']) {
    const value = player.get(field);
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function activePlayer(player: DocumentSnapshot): boolean {
  if (!player.exists || player.get('connected') !== true || player.get('kickedAt') != null) return false;
  const lastSeenAt = player.get('lastSeenAt');
  return lastSeenAt === undefined ||
    (lastSeenAt instanceof Timestamp && !isPresenceStale(lastSeenAt.toDate(), new Date()));
}

async function requireCurrentScientist(
  tx: Transaction,
  session: DocumentSnapshot,
  actor: DocumentSnapshot,
  sessionId: string,
  uid: string,
): Promise<Readonly<{ controlRevision: number; shepherdOre: number }>> {
  if (!activePlayer(actor) || actor.get('role') !== 'player' || actualPlayerRole(actor) !== 'shepherd-scientist') {
    throw new HttpsError('permission-denied', 'Only the current connected Shepherd Scientist may resolve Endeavour research.');
  }
  const rawEscape = actor.get('escapeState');
  const escape = parsePlayerEscapeState(rawEscape);
  if ((rawEscape !== undefined && rawEscape !== null && !escape) || escape) {
    throw new HttpsError('permission-denied', 'An active Shepherd Scientist aboard a ship is required.');
  }

  const activeRoleIds = session.get('activeRoleIds');
  if (!Array.isArray(activeRoleIds) || activeRoleIds.some((roleId) =>
    typeof roleId !== 'string' || !ROLE_IDS.includes(roleId as typeof ROLE_IDS[number])) ||
      new Set(activeRoleIds).size !== activeRoleIds.length ||
      !activeRoleIds.includes('shepherd-scientist')) {
    throw new HttpsError('permission-denied', 'The Shepherd Scientist role is not active in this session.');
  }
  const controls = parseShuttleControl(session.get('shuttleControl'));
  const control = controls?.endeavour;
  if (!control || control.ownerRoleId !== 'shepherd-scientist' || control.holderUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the current Endeavour holder may resolve research.');
  }
  const activeVesselIds = session.get('activeVesselIds');
  const groupId = actor.get('fleetGroupId');
  if (typeof groupId !== 'string' || groupId.length === 0 || !Array.isArray(activeVesselIds) ||
      activeVesselIds.some((shipId) => typeof shipId !== 'string' || !isResourceShipId(shipId)) ||
      new Set(activeVesselIds).size !== activeVesselIds.length || !activeVesselIds.includes('shepherd')) {
    throw new HttpsError('failed-precondition', 'The authoritative Shepherd research state is unavailable.');
  }
  const groupSnapshot = await tx.get(getFirestore().doc(`sessions/${sessionId}/fleetGroups/${groupId}`));
  const group = groupSnapshot.exists ? fleetGroupRecord(groupSnapshot.data()) : undefined;
  if (!group || group.id !== groupId || !group.memberUids.includes(uid) || !group.vesselIds.includes('shepherd') ||
      !activeVesselIds.includes('shepherd')) {
    throw new HttpsError('permission-denied', 'The Scientist is outside the current Shepherd fleet group.');
  }
  const resources = serviceRechargeResourceState(session.get('shipResources'), 'shepherd');
  if (!resources) throw new HttpsError('failed-precondition', 'The authoritative Shepherd ore inventory is unavailable.');
  return { controlRevision: control.revision, shepherdOre: resources.ore };
}

function researchTracks(progress: unknown) {
  if (!isResearchProgress(progress)) {
    throw new HttpsError('failed-precondition', 'The private Endeavour research state is malformed.');
  }
  return Object.keys(ENDEAVOUR_RESEARCH_TRACKS).map((trackId) =>
    endeavourResearchTrack(progress, trackId as EndeavourResearchTrackId));
}

function readPrivateState(
  sessionId: string,
  session: DocumentSnapshot,
  research: DocumentSnapshot,
  cadenceSnapshot: DocumentSnapshot,
  shepherdOre: number,
) {
  const cycle = session.get('currentTurn');
  const turnPhase = turnPhaseState(session.get('turnPhase'));
  if (!Number.isSafeInteger(cycle) || (cycle as number) < 1 || !turnPhase || turnPhase.turn !== cycle) {
    throw new HttpsError('failed-precondition', 'The current research cycle is unavailable.');
  }
  const progress = research.exists ? research.data() : {};
  const cadence = parseEndeavourResearchCadenceState(
    cadenceSnapshot.exists ? cadenceSnapshot.data() : undefined,
  );
  if (!cadence || cadence.cycle > (cycle as number)) {
    throw new HttpsError('failed-precondition', 'The private Endeavour research cadence is malformed.');
  }
  const projectedCadence = cadence.cycle === cycle
    ? cadence
    : Object.freeze({ cycle: cycle as number, revision: cadence.revision, choices: Object.freeze([]) });
  return {
    status: 'ready' as const,
    sessionId,
    cycle: cycle as number,
    researchRevision: cadence.revision,
    cadence: projectedCadence,
    progress: isResearchProgress(progress) ? progress : (() => {
      throw new HttpsError('failed-precondition', 'The private Endeavour research state is malformed.');
    })(),
    tracks: researchTracks(progress),
    shepherdOre,
  };
}

export const readEndeavourResearchWorkspace = onCall<{ sessionId?: unknown }>(
  CALLABLE_RUNTIME_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth);
    const sessionId = validateReadRequest(request.data);
    const db = getFirestore();
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const actorRef = db.doc(`sessions/${sessionId}/players/${uid}`);
    const researchRef = db.doc(`sessions/${sessionId}/serverState/endeavourResearch`);
    const cadenceRef = db.doc(`sessions/${sessionId}/serverState/endeavourResearchCadence`);
    return db.runTransaction(async (tx) => {
      const [session, actor, research, cadence] = await Promise.all([
        tx.get(sessionRef), tx.get(actorRef), tx.get(researchRef), tx.get(cadenceRef),
      ]);
      if (!session.exists) throw new HttpsError('not-found', 'No such session.');
      if (session.get('phase') !== 'active') {
        throw new HttpsError('failed-precondition', 'Endeavour research is available only during active gameplay.');
      }
      const authority = await requireCurrentScientist(tx, session, actor, sessionId, uid);
      return readPrivateState(sessionId, session, research, cadence, authority.shepherdOre);
    });
  },
);

export const advanceEndeavourResearchTrack = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  expectedControlRevision?: unknown;
  expectedResearchRevision?: unknown;
  expectedCycle?: unknown;
  trackId?: unknown;
  funding?: unknown;
}>(
  CALLABLE_RUNTIME_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth);
    const command = validateCommand(request.data);
    const fingerprint = fingerprintFor(uid, command);
    const db = getFirestore();
    const sessionRef = db.doc(`sessions/${command.sessionId}`);
    const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
    const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);
    const researchRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourResearch`);
    const cadenceRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourResearchCadence`);
    const legacyRefs = legacyMutationRefs(command.sessionId, command.requestId);

    return db.runTransaction(async (tx) => {
      const [session, actor, receipt, research, cadenceSnapshot, ...legacy] = await Promise.all([
        tx.get(sessionRef), tx.get(actorRef), tx.get(receiptRef), tx.get(researchRef), tx.get(cadenceRef),
        ...legacyRefs.map((ref) => tx.get(ref)),
      ]);
      if (!session.exists) throw new HttpsError('not-found', 'No such session.');
      const authority = await requireCurrentScientist(tx, session, actor, command.sessionId, uid);
      if (legacy.some((snapshot) => snapshot.exists)) {
        throw new HttpsError('failed-precondition', 'This Endeavour research request id is already bound to a legacy command.');
      }
      const replay = replayReply(receipt, fingerprint);
      if (replay) return replay;
      if (session.get('phase') !== 'active') {
        throw new HttpsError('failed-precondition', 'Endeavour research is available only during active gameplay.');
      }
      const currentCycle = session.get('currentTurn');
      const phase = turnPhaseState(session.get('turnPhase'));
      if (!Number.isSafeInteger(currentCycle) || currentCycle !== command.expectedCycle ||
          !phase || phase.turn !== currentCycle) {
        throw new HttpsError('failed-precondition', 'The Team research cycle changed; refresh before choosing.');
      }
      if (authority.controlRevision !== command.expectedControlRevision) {
        throw new HttpsError('failed-precondition', 'Endeavour control changed; refresh before choosing.');
      }
      const authorization = decideActionAuthorization({
        action: 'research', actorScope: 'player', turnPhase: session.get('turnPhase'),
      });
      if (!authorization.allowed) {
        throw new HttpsError('failed-precondition', 'Endeavour research is available only during Team Phase.');
      }
      if (phase.airspace.state !== 'restricted') {
        throw new HttpsError('failed-precondition', 'Endeavour research is available only during Team Phase.');
      }

      const progress = research.exists ? research.data() : {};
      const cadence = parseEndeavourResearchCadenceState(
        cadenceSnapshot.exists ? cadenceSnapshot.data() : undefined,
      );
      if (!cadence) throw new HttpsError('failed-precondition', 'The private Endeavour research cadence is malformed.');
      const before = researchTracks(progress).find((track) => track.trackId === command.trackId)!;
      let result: ReturnType<typeof resolveEndeavourResearchChoice>;
      try {
        result = resolveEndeavourResearchChoice({
          state: cadence,
          progress,
          cycle: currentCycle as number,
          expectedRevision: command.expectedResearchRevision,
          trackId: command.trackId,
          funding: command.funding,
          shepherdOre: authority.shepherdOre,
          actorScope: 'player',
          turnPhase: session.get('turnPhase'),
        });
      } catch (cause) {
        throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Endeavour research was rejected.');
      }
      const after = endeavourResearchTrack(result.progress, command.trackId);
      if (before.currentMaterialCost === null) {
        throw new HttpsError('failed-precondition', 'The selected Endeavour research track is complete.');
      }
      const reply: EndeavourResearchWriterReply = {
        status: 'committed',
        sessionId: command.sessionId,
        requestId: command.requestId,
        cycle: currentCycle as number,
        researchRevision: result.state.revision,
        trackId: command.trackId,
        funding: command.funding,
        oreCost: result.choice.oreCost,
        previousMaterialCost: before.currentMaterialCost,
        currentMaterialCost: after.currentMaterialCost,
        shepherdOre: result.remainingShepherdOre,
        progress: result.progress,
        cadence: result.state,
      };
      const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (result.choice.oreCost > 0) updates['shipResources.shepherd.ore'] = result.remainingShepherdOre;
      tx.update(sessionRef, updates);
      tx.set(researchRef, result.progress);
      tx.set(cadenceRef, result.state);
      tx.set(receiptRef, {
        fingerprint,
        result: reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      return reply;
    });
  },
);
