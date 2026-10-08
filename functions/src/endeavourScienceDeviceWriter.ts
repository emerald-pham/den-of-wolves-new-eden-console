import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { auditedOnCall } from './securityCallable';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { boundCoreConsoleRole } from './consoleRolePolicy';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { ENDEAVOUR_RESEARCH_TRACKS } from './endeavourResearch';
import { parseEndeavourResearchCadenceState } from './endeavourResearchCadence';
import { parseEndeavourEcmDeviceState } from './endeavourEcmDevice';
import { resolveEndeavourScienceDeviceBuild, type EndeavourScienceDeviceId } from './endeavourScienceDevices';
import { fleetGroupRecord } from './fleetGroups';
import { parseShuttleControl } from './shuttleControl';
import { isPresenceStale } from './sessionLifecycle';
import { serviceRechargeResourceState } from './serviceShuttleRecharge';
import { isResourceShipId } from './resources';
import { ROLE_IDS } from './roleConfiguration';
import { turnPhaseDeadlinePassed, turnPhaseState } from './turnZero';
import { requirePursuitEmergencyWindowAbsent } from './pursuitEmergencyWindow';
import { requireCandidateCraftActionAvailable } from './candidateAvailability';

type Fields = Record<string, unknown>;
type BuildCommand = Readonly<{ sessionId: string; requestId: string; expectedCycle: number;
  expectedControlRevision: number; expectedResearchRevision: number; expectedDeviceRevision: number;
  deviceId: EndeavourScienceDeviceId }>;
const record = (value: unknown): value is Fields => typeof value === 'object' && value !== null &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const counter = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const commandKeys = ['sessionId', 'requestId', 'expectedCycle', 'expectedControlRevision',
  'expectedResearchRevision', 'expectedDeviceRevision', 'deviceId'];

function commandFor(value: unknown): BuildCommand {
  if (!record(value) || Object.keys(value).length !== commandKeys.length ||
      commandKeys.some((key) => !Object.hasOwn(value, key)) ||
      typeof value.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(value.sessionId) ||
      typeof value.requestId !== 'string' || !/^[\w-]{1,128}$/.test(value.requestId) ||
      !counter(value.expectedCycle) || value.expectedCycle < 1 ||
      !counter(value.expectedControlRevision) || !counter(value.expectedResearchRevision) ||
      value.expectedResearchRevision >= Number.MAX_SAFE_INTEGER || !counter(value.expectedDeviceRevision) ||
      value.expectedDeviceRevision > 2 || (value.deviceId !== 'ecm-device' && value.deviceId !== 'wolf-agent-detector')) {
    throw new HttpsError('invalid-argument', 'Invalid Endeavour science device purchase.');
  }
  return value as BuildCommand;
}

async function requireScientist(tx: Transaction, session: DocumentSnapshot, actor: DocumentSnapshot,
  sessionId: string, uid: string): Promise<number> {
  const lastSeen = actor.get('lastSeenAt');
  const rawEscape = actor.get('escapeState');
  if (!actor.exists || actor.get('role') !== 'player' || actor.get('connected') !== true || actor.get('kickedAt') != null ||
      actor.get('replacementRoleId') != null || actor.get('replacementStatus') != null ||
      boundCoreConsoleRole(actor.get('assignedRoleId'), actor.get('seatId')) !== 'shepherd-scientist' ||
      (actor.get('activeConsoleRoleId') != null && actor.get('activeConsoleRoleId') !== 'shepherd-scientist') ||
      (lastSeen !== undefined && (!(lastSeen instanceof Timestamp) || isPresenceStale(lastSeen.toDate(), new Date()))) ||
      rawEscape != null) {
    throw new HttpsError('permission-denied', 'Only the current connected Shepherd Scientist may build science devices.');
  }
  const roleIds = session.get('activeRoleIds');
  if (!Array.isArray(roleIds) || roleIds.some((role) => typeof role !== 'string' || !ROLE_IDS.includes(role as typeof ROLE_IDS[number])) ||
      new Set(roleIds).size !== roleIds.length || !roleIds.includes('shepherd-scientist')) {
    throw new HttpsError('permission-denied', 'The Shepherd Scientist role is unavailable.');
  }
  const control = parseShuttleControl(session.get('shuttleControl'))?.endeavour;
  if (!control || control.ownerRoleId !== 'shepherd-scientist' || control.holderUid !== uid) {
    throw new HttpsError('permission-denied', 'The current Scientist must hold Endeavour.');
  }
  const groupId = actor.get('fleetGroupId');
  const vesselIds = session.get('activeVesselIds');
  if (typeof groupId !== 'string' || !Array.isArray(vesselIds) ||
      vesselIds.some((id) => typeof id !== 'string' || !isResourceShipId(id)) ||
      new Set(vesselIds).size !== vesselIds.length || !vesselIds.includes('shepherd')) {
    throw new HttpsError('failed-precondition', 'The authoritative Shepherd fleet state is unavailable.');
  }
  const snapshot = await tx.get(getFirestore().doc(`sessions/${sessionId}/fleetGroups/${groupId}`));
  const group = snapshot.exists ? fleetGroupRecord(snapshot.data()) : undefined;
  if (!group || group.id !== groupId || !group.memberUids.includes(uid) || !group.vesselIds.includes('shepherd')) {
    throw new HttpsError('permission-denied', 'The Scientist is outside the current Shepherd group.');
  }
  return control.revision;
}

function safeResult(value: unknown, command: BuildCommand): value is Fields {
  const keys = ['status', 'sessionId', 'requestId', 'cycle', 'deviceId', 'deviceRevision', 'built', 'materialCost', 'shepherdMaterials'];
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)) &&
    value.status === 'committed' && value.sessionId === command.sessionId && value.requestId === command.requestId &&
    value.cycle === command.expectedCycle && value.deviceId === command.deviceId && value.built === true &&
    value.deviceRevision === command.expectedDeviceRevision + 1 && counter(value.shepherdMaterials) &&
    typeof value.materialCost === 'number' && ENDEAVOUR_RESEARCH_TRACKS[command.deviceId].materialCosts.includes(value.materialCost);
}

/** Pay the unlocked price and persist Built with the authoritative Shepherd debit in one transaction. */
export const buildEndeavourScienceDevice = auditedOnCall<Fields>('buildEndeavourScienceDevice', CALLABLE_RUNTIME_OPTIONS,
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in before purchasing an Endeavour science device.');
    const command = commandFor(request.data);
    const db = getFirestore();
    const sessionRef = db.doc(`sessions/${command.sessionId}`);
    const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
    const researchRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourResearch`);
    const cadenceRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourResearchCadence`);
    const devicesRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourScienceDevices`);
    const ecmRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourEcmDevice`);
    const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);
    const auditRef = db.doc(`sessions/${command.sessionId}/endeavourScienceDeviceAudits/${command.requestId}`);
    const legacyPaths = ['setupMutationRequests', 'gmResponsibilityRequests', 'seatMutationRequests', 'loyaltyAssignmentRequests']
      .map((collection) => `sessions/${command.sessionId}/${collection}/${command.requestId}`);
    legacyPaths.push(`sessionStartRequests/${command.sessionId}_${command.requestId}`,
      ...['', 'setup-confirm-', 'gm-responsibility-', 'start-', 'seat-claim-', 'seat-release-', 'press-availability-']
        .map((prefix) => `sessions/${command.sessionId}/events/${prefix}${command.requestId}`));
    const fingerprint: CommandFingerprint = { action: 'endeavour-science-device-build', sessionId: command.sessionId,
      requestId: command.requestId, actorUid: uid, instanceId: null, expectedRevision: command.expectedDeviceRevision,
      payload: { expectedCycle: command.expectedCycle, expectedControlRevision: command.expectedControlRevision,
        expectedResearchRevision: command.expectedResearchRevision, deviceId: command.deviceId } };

    return db.runTransaction(async (tx) => {
      const [session, actor, research, cadenceSnapshot, construction, ecm, prior, audit, ...legacy] = await Promise.all([
        tx.get(sessionRef), tx.get(actorRef), tx.get(researchRef), tx.get(cadenceRef), tx.get(devicesRef),
        tx.get(ecmRef), tx.get(receiptRef), tx.get(auditRef), ...legacyPaths.map((path) => tx.get(db.doc(path))),
      ]);
      if (!session.exists) throw new HttpsError('not-found', 'No such session.');
      const controlRevision = await requireScientist(tx, session, actor, command.sessionId, uid);
      if (legacy.some((row) => row.exists)) throw new HttpsError('failed-precondition', 'This request id belongs to a legacy command.');
      if (prior.exists) {
        const disposition = commandReceiptDisposition(prior.get('fingerprint'), fingerprint);
        if (disposition.kind !== 'replay') throw new HttpsError(disposition.kind === 'foreign-actor' ? 'permission-denied' : 'failed-precondition',
          'This science device request id belongs to another command.');
        const result = prior.get('result');
        if (!safeResult(result, command) || !audit.exists || audit.get('deviceId') !== command.deviceId ||
            audit.get('requestId') !== command.requestId || audit.get('actorUid') !== uid ||
            audit.get('materialCost') !== result.materialCost || audit.get('materialsAfter') !== result.shepherdMaterials) {
          throw new HttpsError('failed-precondition', 'This science device request has no safe replay result.');
        }
        return { ...result, status: 'replayed' as const };
      }
      if (audit.exists) throw new HttpsError('failed-precondition', 'This science device request id is already in use.');
      requireCandidateCraftActionAvailable(session, ['endeavour'], ['shepherd']);
      requirePursuitEmergencyWindowAbsent(session);
      const cycle = session.get('currentTurn');
      const phase = turnPhaseState(session.get('turnPhase'));
      if (session.get('phase') !== 'active' || cycle !== command.expectedCycle || !phase || phase.turn !== cycle ||
          phase.airspace.state !== 'restricted' || phase.timerPause !== undefined || turnPhaseDeadlinePassed(phase, 'team')) {
        throw new HttpsError('failed-precondition', 'Science device purchases require the current live Team Phase.');
      }
      const cadence = parseEndeavourResearchCadenceState(cadenceSnapshot.exists ? cadenceSnapshot.data() : undefined);
      if (controlRevision !== command.expectedControlRevision || !cadence || cadence.cycle > command.expectedCycle ||
          cadence.revision !== command.expectedResearchRevision) {
        throw new HttpsError('failed-precondition', 'Endeavour research or control changed; refresh before purchasing.');
      }
      const resources = serviceRechargeResourceState(session.get('shipResources'), 'shepherd');
      const ecmState = parseEndeavourEcmDeviceState(ecm.exists ? ecm.data() : undefined);
      if (!resources || !ecmState || (command.deviceId === 'ecm-device' && ecmState.status === 'used')) {
        throw new HttpsError('failed-precondition', 'The current Shepherd device or material state is unavailable.');
      }
      try {
        const result = resolveEndeavourScienceDeviceBuild({ state: construction.exists ? construction.data() : undefined,
          progress: research.exists ? research.data() : {}, deviceId: command.deviceId,
          expectedRevision: command.expectedDeviceRevision, shepherdMaterials: resources.materials });
        const reply = { status: 'committed' as const, sessionId: command.sessionId, requestId: command.requestId,
          cycle: command.expectedCycle, deviceId: command.deviceId, deviceRevision: result.state.revision,
          built: true as const, materialCost: result.materialCost, shepherdMaterials: result.shepherdMaterials };
        tx.update(sessionRef, { 'shipResources.shepherd.materials': result.shepherdMaterials, updatedAt: FieldValue.serverTimestamp() });
        tx.set(devicesRef, result.state);
        tx.set(auditRef, { type: 'endeavour-science-device-built', sourceId: 'endeavour-printed-device-purchase',
          requestId: command.requestId, actorUid: uid, cycle: command.expectedCycle, deviceId: command.deviceId,
          researchRevision: cadence.revision, deviceRevision: result.state.revision,
          materialCost: result.materialCost, materialsBefore: resources.materials, materialsAfter: result.shepherdMaterials,
          before: construction.exists ? construction.data() : { revision: 0, ecmBuilt: false, detectorBuilt: false },
          after: result.state, createdAt: FieldValue.serverTimestamp() });
        tx.set(receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
        return reply;
      } catch (cause) {
        throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Science device purchase was rejected.');
      }
    });
  });
