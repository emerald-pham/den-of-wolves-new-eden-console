import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { decideActionAuthorization } from './actionMetadata';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { parseEndeavourEcmDeviceState } from './endeavourEcmDevice';
import { endeavourScienceDeviceBuildCost, parseEndeavourScienceDevicesState,
  resolveEndeavourScienceDeviceBuild, type EndeavourScienceDeviceId } from './endeavourScienceDevices';
import { parseEndeavourResearchCadenceState } from './endeavourResearchCadence';
import { fleetGroupRecord } from './fleetGroups';
import { boundCoreConsoleRole } from './consoleRolePolicy';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { isPresenceStale } from './sessionLifecycle';
import { parseShuttleControl } from './shuttleControl';
import { turnPhaseState } from './turnZero';
import { serviceRechargeResourceState } from './serviceShuttleRecharge';
import { isResourceShipId } from './resources';
import { ROLE_IDS } from './roleConfiguration';
import { requirePursuitEmergencyWindowAbsent } from './pursuitEmergencyWindow';

type Fields = Record<string, unknown>;
type BuildCommand = Readonly<{
  sessionId: string;
  requestId: string;
  expectedCycle: number;
  expectedControlRevision: number;
  expectedResearchRevision: number;
  expectedDeviceRevision: number;
  deviceId: EndeavourScienceDeviceId;
}>;

function record(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function counter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

const COMMAND_FIELDS = [
  'sessionId', 'requestId', 'expectedCycle', 'expectedControlRevision', 'expectedResearchRevision',
  'expectedDeviceRevision', 'deviceId',
];

function commandFor(value: unknown): BuildCommand {
  if (!record(value) || Object.keys(value).length !== COMMAND_FIELDS.length ||
      COMMAND_FIELDS.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !COMMAND_FIELDS.includes(key)) ||
      typeof value.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(value.sessionId) ||
      typeof value.requestId !== 'string' || !/^[\w-]{1,128}$/.test(value.requestId) ||
      !counter(value.expectedCycle) || value.expectedCycle < 1 ||
      !counter(value.expectedControlRevision) || !counter(value.expectedResearchRevision) ||
      value.expectedResearchRevision >= Number.MAX_SAFE_INTEGER || !counter(value.expectedDeviceRevision) ||
      value.expectedDeviceRevision > 2 ||
      (value.deviceId !== 'ecm-device' && value.deviceId !== 'wolf-agent-detector')) {
    throw new HttpsError('invalid-argument', 'Invalid Endeavour science device purchase.');
  }
  return value as BuildCommand;
}

async function requireScientist(
  tx: Transaction,
  session: DocumentSnapshot,
  actor: DocumentSnapshot,
  sessionId: string,
  uid: string,
): Promise<number> {
  const lastSeen = actor.get('lastSeenAt');
  const rawEscape = actor.get('escapeState');
  if (!actor.exists || actor.get('role') !== 'player' || actor.get('connected') !== true || actor.get('kickedAt') != null ||
      actor.get('replacementRoleId') != null || actor.get('replacementStatus') != null ||
      boundCoreConsoleRole(actor.get('assignedRoleId'), actor.get('seatId')) !== 'shepherd-scientist' ||
      (actor.get('activeConsoleRoleId') != null && actor.get('activeConsoleRoleId') !== 'shepherd-scientist') ||
      (lastSeen !== undefined && (!(lastSeen instanceof Timestamp) || isPresenceStale(lastSeen.toDate(), new Date()))) ||
      (rawEscape !== undefined && rawEscape !== null)) {
    throw new HttpsError('permission-denied', 'Only the current connected Shepherd Scientist may build science devices.');
  }
  const roleIds = session.get('activeRoleIds');
  if (!Array.isArray(roleIds) || roleIds.some((role) =>
    typeof role !== 'string' || !ROLE_IDS.includes(role as typeof ROLE_IDS[number])) ||
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
  const groupSnapshot = await tx.get(getFirestore().doc(`sessions/${sessionId}/fleetGroups/${groupId}`));
  const group = groupSnapshot.exists ? fleetGroupRecord(groupSnapshot.data()) : undefined;
  if (!group || group.id !== groupId || !group.memberUids.includes(uid) || !group.vesselIds.includes('shepherd')) {
    throw new HttpsError('permission-denied', 'The Scientist is outside the current Shepherd group.');
  }
  return control.revision;
}

function legacyRequestPaths(sessionId: string, requestId: string): string[] {
  const paths = ['setupMutationRequests', 'gmResponsibilityRequests', 'seatMutationRequests', 'loyaltyAssignmentRequests']
    .map((collection) => `sessions/${sessionId}/${collection}/${requestId}`);
  paths.push(`sessionStartRequests/${sessionId}_${requestId}`,
    ...['', 'setup-confirm-', 'gm-responsibility-', 'start-', 'seat-claim-', 'seat-release-', 'press-availability-']
      .map((prefix) => `sessions/${sessionId}/events/${prefix}${requestId}`));
  return paths;
}

function fingerprintFor(uid: string, command: BuildCommand): CommandFingerprint {
  return {
    action: 'endeavour-science-device-build', sessionId: command.sessionId, requestId: command.requestId,
    actorUid: uid, instanceId: null, expectedRevision: command.expectedDeviceRevision,
    payload: {
      expectedCycle: command.expectedCycle, expectedControlRevision: command.expectedControlRevision,
      expectedResearchRevision: command.expectedResearchRevision, deviceId: command.deviceId,
    },
  };
}

function safeCommittedResult(value: unknown, command: BuildCommand): value is Fields {
  const fields = [
    'status', 'sessionId', 'requestId', 'cycle', 'deviceId', 'deviceRevision', 'built', 'materialCost',
    'shepherdMaterials',
  ];
  if (!record(value) || Object.keys(value).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(value, field)) ||
      Object.keys(value).some((field) => !fields.includes(field)) ||
      value.status !== 'committed' || value.sessionId !== command.sessionId || value.requestId !== command.requestId ||
      value.cycle !== command.expectedCycle || value.deviceId !== command.deviceId || value.built !== true ||
      value.deviceRevision !== command.expectedDeviceRevision + 1 || !counter(value.shepherdMaterials) ||
      !counter(value.materialCost)) return false;
  const validCosts = command.deviceId === 'ecm-device' ? [18, 13, 9, 7, 5] : [18, 12, 10];
  return validCosts.includes(value.materialCost as number);
}

/** Charge the printed construction price and persist Built in one private transaction. */
export const buildEndeavourScienceDevice = onCall<Fields>(CALLABLE_RUNTIME_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new HttpsError('unauthenticated', 'Sign in before purchasing an Endeavour science device.');
  }
  const command = commandFor(request.data);
  const fingerprint = fingerprintFor(uid, command);
  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
  const researchRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourResearch`);
  const cadenceRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourResearchCadence`);
  const constructionRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourScienceDevices`);
  const ecmRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourEcmDevice`);
  const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);
  const auditRef = db.doc(`sessions/${command.sessionId}/endeavourScienceDeviceAudits/${command.requestId}`);
  const legacyRefs = legacyRequestPaths(command.sessionId, command.requestId).map((path) => db.doc(path));

  return db.runTransaction(async (tx) => {
    const [session, actor, research, cadenceSnapshot, construction, ecm, prior, audit, ...legacy] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(researchRef), tx.get(cadenceRef), tx.get(constructionRef),
      tx.get(ecmRef), tx.get(receiptRef), tx.get(auditRef), ...legacyRefs.map((ref) => tx.get(ref)),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const controlRevision = await requireScientist(tx, session, actor, command.sessionId, uid);
    if (legacy.some((snapshot) => snapshot.exists)) {
      throw new HttpsError('failed-precondition', 'This request id belongs to a legacy command.');
    }
    if (prior.exists) {
      const disposition = commandReceiptDisposition(prior.get('fingerprint'), fingerprint);
      if (disposition.kind !== 'replay') {
        throw new HttpsError(disposition.kind === 'foreign-actor' ? 'permission-denied' : 'failed-precondition',
          'This science device request id belongs to another command.');
      }
      const result = prior.get('result');
      if (!safeCommittedResult(result, command) || !audit.exists || audit.get('deviceId') !== command.deviceId ||
          audit.get('requestId') !== command.requestId || audit.get('actorUid') !== uid ||
          audit.get('materialCost') !== result.materialCost || audit.get('materialsAfter') !== result.shepherdMaterials) {
        throw new HttpsError('failed-precondition', 'This science device request has no safe replay result.');
      }
      return { ...result, status: 'replayed' as const };
    }
    if (actor.get('activeConsoleRoleId') !== 'shepherd-scientist') {
      throw new HttpsError('permission-denied', 'Select the Shepherd Scientist console before building science devices.');
    }
    if (audit.exists) throw new HttpsError('failed-precondition', 'This science device request id is already in use.');
    requirePursuitEmergencyWindowAbsent(session);
    if (session.get('phase') !== 'active') {
      throw new HttpsError('failed-precondition', 'Endeavour science devices are available only during active gameplay.');
    }
    const cycle = session.get('currentTurn');
    const phase = turnPhaseState(session.get('turnPhase'));
    const authorization = decideActionAuthorization({
      action: 'research', actorScope: 'player', turnPhase: session.get('turnPhase'),
    });
    const deadline = phase ? Date.parse(phase.teamPhaseEndsAt) : NaN;
    if (!authorization.allowed || !phase || phase.turn !== cycle || cycle !== command.expectedCycle ||
        phase.airspace.state !== 'restricted' || phase.timerPause !== undefined ||
        !Number.isFinite(deadline) || Date.now() >= deadline) {
      throw new HttpsError('failed-precondition', 'Science device purchases require the current live Team Phase.');
    }
    const cadence = parseEndeavourResearchCadenceState(cadenceSnapshot.exists ? cadenceSnapshot.data() : undefined);
    if (!cadence || cadence.cycle > command.expectedCycle || cadence.revision !== command.expectedResearchRevision ||
        controlRevision !== command.expectedControlRevision) {
      throw new HttpsError('failed-precondition', 'Endeavour research or control changed; refresh before purchasing.');
    }
    const resources = serviceRechargeResourceState(session.get('shipResources'), 'shepherd');
    const constructionState = parseEndeavourScienceDevicesState(construction.exists ? construction.data() : undefined);
    const ecmState = parseEndeavourEcmDeviceState(ecm.exists ? ecm.data() : undefined);
    const legacyUsedEcm = !construction.exists && ecmState?.status === 'used';
    const constructionForBuild = legacyUsedEcm
      ? { revision: 1, ecmBuilt: true, detectorBuilt: false }
      : constructionState;
    if (!resources || !constructionState || !ecmState ||
        (ecmState.status === 'used' && !constructionState.ecmBuilt && !legacyUsedEcm) ||
        (command.deviceId === 'ecm-device' && ecmState.status === 'used')) {
      throw new HttpsError('failed-precondition', 'The current Shepherd device or material state is unavailable.');
    }
    const progress = research.exists ? research.data() : {};
    try {
      const build = resolveEndeavourScienceDeviceBuild({
        state: constructionForBuild,
        progress,
        deviceId: command.deviceId,
        expectedRevision: command.expectedDeviceRevision,
        shepherdMaterials: resources.materials,
      });
      const materialCost = endeavourScienceDeviceBuildCost(progress, command.deviceId);
      if (materialCost === null || materialCost !== build.materialCost) {
        throw new Error('The printed science device construction quote changed.');
      }
      const result = {
        status: 'committed' as const, sessionId: command.sessionId, requestId: command.requestId,
        cycle: command.expectedCycle, deviceId: command.deviceId, deviceRevision: build.state.revision,
        built: true as const, materialCost: build.materialCost, shepherdMaterials: build.shepherdMaterials,
      };
      tx.update(sessionRef, {
        'shipResources.shepherd.materials': build.shepherdMaterials,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(constructionRef, build.state);
      tx.set(auditRef, {
        type: 'endeavour-science-device-built', sourceId: 'endeavour-printed-device-purchase',
        requestId: command.requestId, actorUid: uid, cycle: command.expectedCycle, deviceId: command.deviceId,
        researchRevision: cadence.revision, deviceRevision: build.state.revision,
        materialCost: build.materialCost, materialsBefore: resources.materials,
        materialsAfter: build.shepherdMaterials,
        before: construction.exists ? construction.data() : constructionForBuild,
        after: build.state, createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
      return result;
    } catch (cause) {
      if (cause instanceof HttpsError) throw cause;
      throw new HttpsError('failed-precondition',
        cause instanceof Error ? cause.message : 'Science device purchase was rejected.');
    }
  });
});
