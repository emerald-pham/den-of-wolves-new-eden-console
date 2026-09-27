import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { boundCoreConsoleRole } from './consoleRolePolicy';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import {
  activateEndeavourEcmDevice as resolveEndeavourEcmDevice,
  parseEndeavourEcmDeviceState,
  type EndeavourEcmDeviceState,
} from './endeavourEcmDevice';
import { endeavourResearchTrack } from './endeavourResearch';
import { fleetGroupRecord, type FleetGroupRecord } from './fleetGroups';
import {
  isValidPursuitAuthority,
  navigationState,
  navigationStateDocumentPath,
  type NavigationState,
} from './navigationProjection';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { parsePlayerEscapeState } from './escapeState';
import { isPresenceStale } from './sessionLifecycle';
import { ROLE_IDS } from './roleConfiguration';
import { parseShuttleControl } from './shuttleControl';
import { isResourceShipId } from './resources';

type RecordValue = Record<string, unknown>;

export interface EndeavourEcmDeviceCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedControlRevision: number;
  readonly expectedDeviceRevision: number;
  readonly expectedCycle: number;
}

export interface EndeavourEcmDeviceReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly cycle: number;
  readonly deviceRevision: 1;
  readonly ownerGroupId: string;
  readonly pursuitBefore: number;
  readonly pursuitAfter: number;
}

export interface EndeavourEcmDeviceWorkspace {
  readonly status: 'ready';
  readonly sessionId: string;
  readonly cycle: number;
  readonly controlRevision: number;
  readonly researchComplete: boolean;
  readonly device: EndeavourEcmDeviceState;
  readonly pursuit: Readonly<{ groupId: string; current: number }>;
}

type EndeavourEcmFingerprint = CommandFingerprint & Readonly<{
  action: 'endeavour-ecm-device';
  sessionId: string;
  expectedRevision: number;
  payload: Readonly<{
    expectedControlRevision: number;
    expectedCycle: number;
  }>;
}>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function requireUid(auth: { uid?: string } | undefined): string {
  if (typeof auth?.uid !== 'string' || auth.uid.length === 0) {
    throw new HttpsError('unauthenticated', 'Sign in before using the Endeavour ECM Device.');
  }
  return auth.uid;
}

function validateReadRequest(raw: unknown): string {
  if (!isRecord(raw) || Object.keys(raw).length !== 1 ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId)) {
    throw new HttpsError('invalid-argument', 'Invalid Endeavour ECM Device workspace request.');
  }
  return raw.sessionId;
}

function validateCommand(raw: unknown): EndeavourEcmDeviceCommand {
  const fields = [
    'sessionId', 'requestId', 'expectedControlRevision', 'expectedDeviceRevision', 'expectedCycle',
  ];
  if (!isRecord(raw) || Object.keys(raw).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(raw, field)) ||
      Object.keys(raw).some((field) => !fields.includes(field)) ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId) ||
      typeof raw.requestId !== 'string' || !/^[\w-]{1,128}$/.test(raw.requestId) ||
      !isCounter(raw.expectedControlRevision) || raw.expectedDeviceRevision !== 0 ||
      !Number.isSafeInteger(raw.expectedCycle) || (raw.expectedCycle as number) < 1) {
    throw new HttpsError('invalid-argument', 'Invalid Endeavour ECM Device request.');
  }
  return {
    sessionId: raw.sessionId,
    requestId: raw.requestId,
    expectedControlRevision: raw.expectedControlRevision,
    expectedDeviceRevision: raw.expectedDeviceRevision,
    expectedCycle: raw.expectedCycle as number,
  };
}

function fingerprintFor(uid: string, command: EndeavourEcmDeviceCommand): EndeavourEcmFingerprint {
  return {
    action: 'endeavour-ecm-device',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: command.expectedDeviceRevision,
    payload: {
      expectedControlRevision: command.expectedControlRevision,
      expectedCycle: command.expectedCycle,
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
): Promise<Readonly<{ controlRevision: number; groupId: string; activeVesselIds: readonly string[] }>> {
  if (!activePlayer(actor) || actor.get('role') !== 'player' || actor.get('replacementRoleId') != null ||
      boundCoreConsoleRole(actor.get('assignedRoleId'), actor.get('seatId')) !== 'shepherd-scientist') {
    throw new HttpsError('permission-denied', 'Only the current connected Shepherd Scientist may use the ECM Device.');
  }
  const rawEscape = actor.get('escapeState');
  const escape = parsePlayerEscapeState(rawEscape);
  if ((rawEscape !== undefined && rawEscape !== null && !escape) || escape) {
    throw new HttpsError('permission-denied', 'An active Shepherd Scientist aboard a ship is required.');
  }

  const activeRoleIds = session.get('activeRoleIds');
  if (!Array.isArray(activeRoleIds) || activeRoleIds.some((roleId) =>
    typeof roleId !== 'string' || !ROLE_IDS.includes(roleId as typeof ROLE_IDS[number])) ||
      new Set(activeRoleIds).size !== activeRoleIds.length || !activeRoleIds.includes('shepherd-scientist')) {
    throw new HttpsError('permission-denied', 'The Shepherd Scientist role is not active in this session.');
  }
  const control = parseShuttleControl(session.get('shuttleControl'))?.endeavour;
  if (!control || control.ownerRoleId !== 'shepherd-scientist' || control.holderUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the current Endeavour holder may use the ECM Device.');
  }
  const activeVesselIds = session.get('activeVesselIds');
  const groupId = actor.get('fleetGroupId');
  if (typeof groupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(groupId) ||
      !Array.isArray(activeVesselIds) || activeVesselIds.some((shipId) =>
        typeof shipId !== 'string' || !isResourceShipId(shipId)) ||
      new Set(activeVesselIds).size !== activeVesselIds.length || !activeVesselIds.includes('shepherd')) {
    throw new HttpsError('failed-precondition', 'The authoritative Shepherd fleet state is unavailable.');
  }
  const groupSnapshot = await tx.get(getFirestore().doc(`sessions/${sessionId}/fleetGroups/${groupId}`));
  const group = groupSnapshot.exists ? fleetGroupRecord(groupSnapshot.data()) : undefined;
  if (!group || group.id !== groupId || !group.memberUids.includes(uid) || !group.vesselIds.includes('shepherd')) {
    throw new HttpsError('permission-denied', 'The Scientist is outside the current Shepherd fleet group.');
  }
  return { controlRevision: control.revision, groupId, activeVesselIds: activeVesselIds as string[] };
}

function canonicalFleetGroups(value: { docs: readonly DocumentSnapshot[] }): readonly FleetGroupRecord[] {
  const groups = value.docs.map((snapshot) => {
    const group = fleetGroupRecord(snapshot.data());
    return group?.id === snapshot.id ? group : undefined;
  });
  if (groups.length === 0 || groups.some((group) => group === undefined)) {
    throw new HttpsError('failed-precondition', 'The authoritative fleet-group roster is malformed.');
  }
  return groups as FleetGroupRecord[];
}

function currentNavigation(
  rawNavigation: DocumentSnapshot,
  session: DocumentSnapshot,
  activeVesselIds: readonly string[],
): NavigationState {
  const data = rawNavigation.exists ? rawNavigation.data() : undefined;
  return navigationState(data, activeVesselIds, session.get('pursuitGroups'));
}

function validatePursuitAuthority(
  rawNavigation: DocumentSnapshot,
  session: DocumentSnapshot,
  navigation: NavigationState,
  groups: readonly FleetGroupRecord[],
): void {
  const raw = rawNavigation.exists ? rawNavigation.data() : undefined;
  const authority = isRecord(raw) && Object.hasOwn(raw, 'pursuitGroups')
    ? raw.pursuitGroups
    : session.get('pursuitGroups');
  if (!isValidPursuitAuthority(authority)) {
    throw new HttpsError('failed-precondition', 'The authoritative fleet pursuit state is malformed.');
  }
  const groupIds = new Set(groups.map((group) => group.id));
  const pursuitIds = Object.keys(navigation.pursuitGroups);
  if (pursuitIds.length !== groupIds.size ||
      pursuitIds.some((groupId) => !groupIds.has(groupId)) ||
      [...groupIds].some((groupId) => !Number.isSafeInteger(navigation.pursuitGroups[groupId]))) {
    throw new HttpsError('failed-precondition', 'The authoritative fleet pursuit state is unavailable.');
  }
}

function nextNavigationRevision(rawNavigation: DocumentSnapshot): number {
  const stored = rawNavigation.get('revision');
  const current = stored === undefined ? 0 : stored;
  if (!isCounter(current) || current === Number.MAX_SAFE_INTEGER) {
    throw new HttpsError('failed-precondition', 'The authoritative navigation revision is unavailable.');
  }
  return current + 1;
}

function researchComplete(value: unknown): boolean {
  try {
    return endeavourResearchTrack(value, 'ecm-device').complete;
  } catch {
    throw new HttpsError('failed-precondition', 'The private ECM Device research state is malformed.');
  }
}

function deviceState(snapshot: DocumentSnapshot): EndeavourEcmDeviceState {
  const state = parseEndeavourEcmDeviceState(snapshot.exists ? snapshot.data() : undefined);
  if (!state) throw new HttpsError('failed-precondition', 'The private ECM Device state is malformed.');
  return state;
}

function isDeviceReply(value: unknown, fingerprint: EndeavourEcmFingerprint): value is EndeavourEcmDeviceReply {
  if (!isRecord(value)) return false;
  const fields = [
    'status', 'sessionId', 'requestId', 'cycle', 'deviceRevision',
    'ownerGroupId', 'pursuitBefore', 'pursuitAfter',
  ];
  return Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field)) &&
    Object.keys(value).every((field) => fields.includes(field)) && value.status === 'committed' &&
    value.sessionId === fingerprint.sessionId && value.requestId === fingerprint.requestId &&
    value.cycle === fingerprint.payload.expectedCycle && fingerprint.expectedRevision === 0 && value.deviceRevision === 1 &&
    typeof value.ownerGroupId === 'string' && /^fleet-[1-9][0-9]*$/.test(value.ownerGroupId) &&
    isCounter(value.pursuitBefore) && (value.pursuitBefore as number) <= 10 &&
    isCounter(value.pursuitAfter) && (value.pursuitAfter as number) === Math.max(0, (value.pursuitBefore as number) - 3);
}

function matchesDeviceEvent(value: unknown, reply: EndeavourEcmDeviceReply): boolean {
  return isRecord(value) && value.type === 'endeavour-ecm-device-used' &&
    value.sessionId === reply.sessionId && value.groupId === reply.ownerGroupId &&
    value.deviceRevision === reply.deviceRevision && value.pursuitBefore === reply.pursuitBefore &&
    value.pursuitAfter === reply.pursuitAfter;
}

function groupEventPath(sessionId: string, groupId: string, requestId: string): string {
  return `sessions/${sessionId}/fleetGroupEvents/${groupId}/events/endeavour-ecm-${requestId}`;
}

async function replayReply(
  tx: Transaction,
  receipt: DocumentSnapshot,
  fingerprint: EndeavourEcmFingerprint,
): Promise<EndeavourEcmDeviceReply | undefined> {
  if (!receipt.exists) return undefined;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', 'This ECM Device request belongs to a different actor.');
  }
  if (disposition.kind === 'collision') {
    throw new HttpsError('failed-precondition', 'This ECM Device request id is bound to a different command.');
  }
  const result = receipt.get('result');
  if (!isDeviceReply(result, fingerprint)) {
    throw new HttpsError('failed-precondition', 'This ECM Device request has no replayable result.');
  }
  const event = await tx.get(getFirestore().doc(groupEventPath(
    fingerprint.sessionId, result.ownerGroupId, fingerprint.requestId!,
  )));
  if (!event.exists || !matchesDeviceEvent(event.data(), result)) {
    throw new HttpsError('failed-precondition', 'This ECM Device request has no matching durable group event.');
  }
  return { ...result, status: 'replayed' };
}

function legacyRequestExists(snapshots: readonly DocumentSnapshot[]): boolean {
  return snapshots.some((snapshot) => snapshot.exists);
}

function buildWorkspace(
  sessionId: string,
  session: DocumentSnapshot,
  authority: Awaited<ReturnType<typeof requireCurrentScientist>>,
  research: DocumentSnapshot,
  device: DocumentSnapshot,
  navigationDoc: DocumentSnapshot,
  groupDocs: { docs: readonly DocumentSnapshot[] },
): EndeavourEcmDeviceWorkspace {
  const cycle = session.get('currentTurn');
  if (!Number.isSafeInteger(cycle) || (cycle as number) < 1) {
    throw new HttpsError('failed-precondition', 'The current ECM Device cycle is unavailable.');
  }
  const complete = researchComplete(research.exists ? research.data() : {});
  const groups = canonicalFleetGroups(groupDocs);
  const owners = groups.filter((group) => group.vesselIds.includes('shepherd'));
  if (owners.length !== 1 || owners[0]!.id !== authority.groupId) {
    throw new HttpsError('failed-precondition', 'Shepherd must belong to one current fleet group to use ECM.');
  }
  const navigation = currentNavigation(navigationDoc, session, authority.activeVesselIds);
  validatePursuitAuthority(navigationDoc, session, navigation, groups);
  const value = navigation.pursuitGroups[authority.groupId];
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10 ||
      Object.keys(navigation.pursuitGroups).length !== groups.length ||
      Object.keys(navigation.pursuitGroups).some((groupId) => !groups.some((group) => group.id === groupId))) {
    throw new HttpsError('failed-precondition', 'The authoritative fleet pursuit state is unavailable.');
  }
  return {
    status: 'ready', sessionId, cycle: cycle as number,
    controlRevision: authority.controlRevision,
    researchComplete: complete,
    device: deviceState(device),
    pursuit: { groupId: authority.groupId, current: value as number },
  };
}

export const readEndeavourEcmDeviceWorkspace = onCall<{ sessionId?: unknown }>(
  CALLABLE_RUNTIME_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth);
    const sessionId = validateReadRequest(request.data);
    const db = getFirestore();
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const actorRef = db.doc(`sessions/${sessionId}/players/${uid}`);
    const researchRef = db.doc(`sessions/${sessionId}/serverState/endeavourResearch`);
    const deviceRef = db.doc(`sessions/${sessionId}/serverState/endeavourEcmDevice`);
    const navigationRef = db.doc(navigationStateDocumentPath(sessionId));
    const groupsRef = db.collection(`sessions/${sessionId}/fleetGroups`);
    return db.runTransaction(async (tx) => {
      const [session, actor, research, device, navigation, groups] = await Promise.all([
        tx.get(sessionRef), tx.get(actorRef), tx.get(researchRef), tx.get(deviceRef),
        tx.get(navigationRef), tx.get(groupsRef),
      ]);
      if (!session.exists || session.get('phase') !== 'active') {
        throw new HttpsError('failed-precondition', 'The ECM Device is available only during active gameplay.');
      }
      const authority = await requireCurrentScientist(tx, session, actor, sessionId, uid);
      return buildWorkspace(sessionId, session, authority, research, device, navigation, groups);
    });
  },
);

export const activateEndeavourEcmDevice = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  expectedControlRevision?: unknown;
  expectedDeviceRevision?: unknown;
  expectedCycle?: unknown;
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
    const deviceRef = db.doc(`sessions/${command.sessionId}/serverState/endeavourEcmDevice`);
    const navigationRef = db.doc(navigationStateDocumentPath(command.sessionId));
    const gmProjectionRef = db.doc(`sessions/${command.sessionId}/gmDiscovery/current`);
    const playerProjectionsRef = db.collection(`sessions/${command.sessionId}/playerDiscoveries`);
    const groupsRef = db.collection(`sessions/${command.sessionId}/fleetGroups`);
    const legacyRefs = legacyMutationRefs(command.sessionId, command.requestId);

    return db.runTransaction(async (tx) => {
      const [session, actor, receipt, ...legacy] = await Promise.all([
        tx.get(sessionRef), tx.get(actorRef), tx.get(receiptRef), ...legacyRefs.map((ref) => tx.get(ref)),
      ]);
      if (!session.exists) throw new HttpsError('not-found', 'No such session.');
      const authority = await requireCurrentScientist(tx, session, actor, command.sessionId, uid);
      if (legacyRequestExists(legacy)) {
        throw new HttpsError('failed-precondition', 'This ECM Device request id is already bound to a legacy command.');
      }
      const replay = await replayReply(tx, receipt, fingerprint);
      if (replay) return replay;
      if (session.get('phase') !== 'active') {
        throw new HttpsError('failed-precondition', 'The ECM Device is available only during active gameplay.');
      }
      const currentCycle = session.get('currentTurn');
      if (!Number.isSafeInteger(currentCycle) || currentCycle !== command.expectedCycle) {
        throw new HttpsError('failed-precondition', 'The ECM Device cycle changed; refresh before use.');
      }
      if (authority.controlRevision !== command.expectedControlRevision) {
        throw new HttpsError('failed-precondition', 'Endeavour control changed; refresh before use.');
      }

      const [research, device, navigationDoc, groupDocs, gmProjection, playerProjections] = await Promise.all([
        tx.get(researchRef), tx.get(deviceRef), tx.get(navigationRef), tx.get(groupsRef),
        tx.get(gmProjectionRef), tx.get(playerProjectionsRef),
      ]);
      const state = deviceState(device);
      if (state.revision !== command.expectedDeviceRevision) {
        throw new HttpsError('failed-precondition', 'The ECM Device state changed; refresh before use.');
      }
      if (state.status === 'used') {
        throw new HttpsError('failed-precondition', 'The ECM Device has already been used.');
      }
      const progress = research.exists ? research.data() : {};
      if (!researchComplete(progress)) {
        throw new HttpsError('failed-precondition', 'ECM Device research must be complete before activation.');
      }
      const groups = canonicalFleetGroups(groupDocs);
      const navigation = currentNavigation(navigationDoc, session, authority.activeVesselIds);
      validatePursuitAuthority(navigationDoc, session, navigation, groups);
      if (!gmProjection.exists) {
        throw new HttpsError('failed-precondition', 'The current navigation projection is unavailable.');
      }
      const groupByMemberUid = new Map<string, string>();
      for (const group of groups) {
        for (const memberUid of group.memberUids) {
          const existingGroupId = groupByMemberUid.get(memberUid);
          if (existingGroupId !== undefined && existingGroupId !== group.id) {
            throw new HttpsError('failed-precondition', 'A player belongs to multiple authoritative fleet groups.');
          }
          groupByMemberUid.set(memberUid, group.id);
        }
      }
      const scientistProjection = playerProjections.docs.find((projection) => projection.id === uid);
      if (!scientistProjection || groupByMemberUid.get(uid) !== authority.groupId ||
          scientistProjection.get('groupId') !== authority.groupId) {
        throw new HttpsError('failed-precondition', 'The Scientist navigation projection is unavailable.');
      }
      const currentMemberProjections = playerProjections.docs.flatMap((projection) => {
        const groupId = groupByMemberUid.get(projection.id);
        if (groupId === undefined) return [];
        if (projection.get('groupId') !== groupId) {
          throw new HttpsError('failed-precondition', 'A current player navigation projection is stale.');
        }
        return [{ projection, groupId }];
      });
      const revision = nextNavigationRevision(navigationDoc);
      let result: ReturnType<typeof resolveEndeavourEcmDevice>;
      try {
        result = resolveEndeavourEcmDevice({
          progress,
          state,
          expectedRevision: command.expectedDeviceRevision,
          navigation,
          fleetGroups: groups,
        });
      } catch (cause) {
        throw new HttpsError('failed-precondition',
          cause instanceof Error ? cause.message : 'The ECM Device activation was rejected.');
      }
      if (result.state.status !== 'used' || result.state.ownerGroupId !== authority.groupId) {
        throw new HttpsError('failed-precondition', 'The ECM Device owner group changed; refresh before use.');
      }
      const reply: EndeavourEcmDeviceReply = {
        status: 'committed',
        sessionId: command.sessionId,
        requestId: command.requestId,
        cycle: currentCycle as number,
        deviceRevision: 1,
        ownerGroupId: result.state.ownerGroupId,
        pursuitBefore: result.state.pursuitBefore,
        pursuitAfter: result.state.pursuitAfter,
      };
      const eventRef = db.doc(groupEventPath(command.sessionId, result.state.ownerGroupId, command.requestId));
      tx.set(deviceRef, result.state);
      tx.set(navigationRef, {
        pursuitGroups: result.navigation.pursuitGroups,
        revision,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(gmProjectionRef, {
        pursuitGroups: result.navigation.pursuitGroups,
        revision,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      for (const { projection, groupId } of currentMemberProjections) {
        tx.set(projection.ref, {
          pursuitValue: result.navigation.pursuitGroups[groupId],
          revision,
        }, { merge: true });
      }
      tx.create(eventRef, {
        type: 'endeavour-ecm-device-used',
        sessionId: command.sessionId,
        groupId: result.state.ownerGroupId,
        deviceRevision: 1,
        pursuitBefore: result.state.pursuitBefore,
        pursuitAfter: result.state.pursuitAfter,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(receiptRef, {
        fingerprint,
        result: reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      return reply;
    });
  },
);
