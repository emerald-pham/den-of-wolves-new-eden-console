import { HttpsError } from 'firebase-functions/v2/https';
import { WOLF_ROLE_IDS } from './wolfAssignment';
import { ROLE_IDS, recommendedRoleIds } from './roleConfiguration';
import { RESOURCE_IDS, type ResourceId } from './resources';
import { isStarSystemCoordinate } from './navigation';
import {
  normalizeSessionConfiguration,
  SUPPORTED_PLAYER_COUNTS,
  type SessionConfiguration,
} from './gameSetup';
import { commandError } from './commandErrors';
import { FIGHTER_WING_IDS, type FighterWingId } from './fighterWings';
import {
  WOLF_ATTACK_PREPARATION_MODIFIER_IDS,
  WOLF_ATTACK_TARGET_MODES,
  type WolfAttackPreparationModifierId,
  type WolfAttackTargetAssignment,
  type WolfAttackTargetMode,
} from './wolfAttackPreparation';
import { isReplacementEligibilityReason } from './replacementRoles';

export function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw commandError('unauthenticated', 'Sign in before joining a table.', 'unauthenticated');
  }
  return auth.uid;
}

export function requireSessionRequest(data: {
  sessionId?: unknown;
}): { sessionId: string } {
  return { sessionId: requiredId(data.sessionId, 'sessionId') };
}

export function requireAirspaceRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
}): { sessionId: string; instanceId?: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    ...(data.instanceId === undefined ? {} : { instanceId: requiredId(data.instanceId, 'instanceId') }),
  };
}

export function requireMaintenanceRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
  requestId?: unknown;
  instanceId?: unknown;
  action?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  shipId: string;
  requestId: string;
  instanceId?: string;
  action: string;
  expectedRevision: number;
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
    requestId: requiredId(data.requestId, 'requestId'),
    ...(data.instanceId === undefined ? {} : { instanceId: requiredId(data.instanceId, 'instanceId') }),
    action: requiredText(data.action, 'action', 32),
    expectedRevision: data.expectedRevision as number,
  };
}

export function requireVipCardDrawRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
  requestId?: unknown;
  instanceId?: unknown;
  consoleRoleId?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  shipId: string;
  requestId: string;
  instanceId?: string;
  consoleRoleId?: string;
  expectedRevision: number;
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
    requestId: requiredId(data.requestId, 'requestId'),
    ...(data.instanceId === undefined ? {} : { instanceId: requiredId(data.instanceId, 'instanceId') }),
    ...(data.consoleRoleId === undefined ? {} : { consoleRoleId: requiredId(data.consoleRoleId, 'consoleRoleId') }),
    expectedRevision: data.expectedRevision as number,
  };
}

export function requireVipCardTransferRequest(data: {
  sessionId?: unknown;
  requestId?: unknown;
  cardId?: unknown;
  targetUid?: unknown;
  instanceId?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  requestId: string;
  cardId: string;
  targetUid: string;
  instanceId?: string;
  expectedRevision: number;
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    requestId: requiredId(data.requestId, 'requestId'),
    cardId: requiredId(data.cardId, 'cardId'),
    targetUid: requiredId(data.targetUid, 'targetUid'),
    ...(data.instanceId === undefined ? {} : { instanceId: requiredId(data.instanceId, 'instanceId') }),
    expectedRevision: data.expectedRevision as number,
  };
}

export function requireSmallShipDockingRequest(data: {
  sessionId?: unknown;
  smallShipId?: unknown;
  hostShipId?: unknown;
  docked?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  smallShipId: string;
  hostShipId: string | null;
  docked: boolean;
  instanceId: string;
  requestId: string;
  expectedRevision: number;
} {
  if (typeof data.docked !== 'boolean') throw new HttpsError('invalid-argument', 'docked must be boolean.');
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    smallShipId: requiredId(data.smallShipId, 'smallShipId'),
    hostShipId: data.hostShipId === null ? null : requiredId(data.hostShipId, 'hostShipId'),
    docked: data.docked,
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedRevision: data.expectedRevision as number,
  };
}

export function requireSmallShipMaintenanceRequest(data: {
  sessionId?: unknown;
  smallShipId?: unknown;
  shipId?: unknown;
  requestId?: unknown;
  instanceId?: unknown;
  action?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  smallShipId: string;
  requestId: string;
  instanceId?: string;
  action: string;
  expectedRevision: number;
} {
  const smallShipId = data.smallShipId ?? data.shipId;
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    smallShipId: requiredId(smallShipId, 'smallShipId'),
    requestId: requiredId(data.requestId, 'requestId'),
    ...(data.instanceId === undefined ? {} : { instanceId: requiredId(data.instanceId, 'instanceId') }),
    action: requiredText(data.action, 'action', 32),
    expectedRevision: (() => {
      if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
        throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
      }
      return data.expectedRevision as number;
    })(),
  };
}

export function requireSessionCreationRequest(data: {
  requestId?: unknown;
  playerCount?: unknown;
  chartId?: unknown;
  expansion?: unknown;
  turnLimit?: unknown;
  dioneEnabled?: unknown;
  capybaraEnabled?: unknown;
  universalArbourEnabled?: unknown;
  wolfCultEnabled?: unknown;
  options?: unknown;
}): { requestId: string; configuration: SessionConfiguration } {
  let configuration: SessionConfiguration;
  try {
    configuration = normalizeSessionConfiguration(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid session configuration.';
    throw new HttpsError('invalid-argument', message);
  }
  return {
    requestId: requiredId(data.requestId, 'requestId'),
    configuration,
  };
}

export function requireCastingPreferenceRequest(data: {
  sessionId?: unknown;
  requestId?: unknown;
  shipId?: unknown;
}): { sessionId: string; requestId: string; shipId: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    requestId: requiredId(data.requestId, 'requestId'),
    shipId: requiredId(data.shipId, 'shipId'),
  };
}

export function requireRoleAssignmentRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
  roleId?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  targetUid: string;
  roleId: string;
} {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    targetUid: requiredId(data.targetUid, 'targetUid'),
    roleId: requiredId(data.roleId, 'roleId'),
  };
}

export function requireRoleReleaseRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
}): { sessionId: string; instanceId: string; requestId: string; targetUid: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    targetUid: requiredId(data.targetUid, 'targetUid'),
  };
}

export function requireReplacementEligibilityRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
  reason?: unknown;
  expectedRevision?: unknown;
  expectedSetupRevision?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  targetUid: string;
  reason: string;
  expectedRevision: number;
  expectedSetupRevision: number;
} {
  if (!isReplacementEligibilityReason(data.reason)) {
    throw new HttpsError('invalid-argument', 'reason must be dead, arrested, removed, or late.');
  }
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  if (!Number.isSafeInteger(data.expectedSetupRevision) || (data.expectedSetupRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedSetupRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    targetUid: requiredId(data.targetUid, 'targetUid'),
    reason: data.reason as string,
    expectedRevision: data.expectedRevision as number,
    expectedSetupRevision: data.expectedSetupRevision as number,
  };
}

export function requireReplacementAssignmentRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
  replacementRoleId?: unknown;
  expectedRevision?: unknown;
  expectedSetupRevision?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  targetUid: string;
  replacementRoleId: string;
  expectedRevision: number;
  expectedSetupRevision: number;
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  if (!Number.isSafeInteger(data.expectedSetupRevision) || (data.expectedSetupRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedSetupRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    targetUid: requiredId(data.targetUid, 'targetUid'),
    replacementRoleId: requiredId(data.replacementRoleId, 'replacementRoleId'),
    expectedRevision: data.expectedRevision as number,
    expectedSetupRevision: data.expectedSetupRevision as number,
  };
}

export function requireLoyaltyAssignmentRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
  kind?: unknown;
  suspicion?: unknown;
  partnerUid?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  targetUid: string;
  kind: string;
  suspicion: number | null;
  partnerUid?: string;
} {
  if (data.suspicion !== null && data.suspicion !== undefined &&
      (!Number.isSafeInteger(data.suspicion) || (data.suspicion as number) < 0)) {
    throw new HttpsError('invalid-argument', 'suspicion must be a non-negative integer or null.');
  }
  const partnerUid = data.partnerUid === undefined || data.partnerUid === null
    ? undefined
    : requiredId(data.partnerUid, 'partnerUid');
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    targetUid: requiredId(data.targetUid, 'targetUid'),
    kind: requiredId(data.kind, 'kind'),
    suspicion: data.suspicion === undefined || data.suspicion === null
      ? null : data.suspicion as number,
    ...(partnerUid === undefined ? {} : { partnerUid }),
  };
}

export function requireAndroidDisclosureRequest(data: {
  sessionId?: unknown;
  requestId?: unknown;
}): { sessionId: string; requestId: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    requestId: requiredId(data.requestId, 'requestId'),
  };
}

export function requireFacilitatorResponsibilityRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
  responsibility?: unknown;
  mode?: unknown;
  targetInstanceId?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  expectedSetupRevision: number;
  responsibility: 'main' | 'assistant';
  mode: 'share' | 'handoff' | 'drop';
  targetInstanceId?: string;
} {
  if (data.responsibility !== 'main' && data.responsibility !== 'assistant') {
    throw new HttpsError('invalid-argument', 'responsibility must be main or assistant.');
  }
  if (!Number.isSafeInteger(data.expectedSetupRevision) || (data.expectedSetupRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedSetupRevision must be a non-negative integer.');
  }
  if (data.mode !== undefined && data.mode !== 'share' && data.mode !== 'handoff' && data.mode !== 'drop') {
    throw new HttpsError('invalid-argument', 'mode must be share, handoff, or drop.');
  }
  const mode = data.mode === 'handoff' ? 'handoff' : data.mode === 'drop' ? 'drop' : 'share';
  const targetInstanceId = data.targetInstanceId === undefined || data.targetInstanceId === null
    ? undefined
    : requiredId(data.targetInstanceId, 'targetInstanceId');
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedSetupRevision: data.expectedSetupRevision as number,
    responsibility: data.responsibility,
    mode,
    ...(targetInstanceId === undefined ? {} : { targetInstanceId }),
  };
}

export function requireGameStartRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
}): { sessionId: string; instanceId: string; requestId: string; expectedSetupRevision: number } {
  if (!Number.isSafeInteger(data.expectedSetupRevision) || (data.expectedSetupRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedSetupRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedSetupRevision: data.expectedSetupRevision as number,
  };
}

export function requireAwayMissionCardDealRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
  missionId?: unknown;
  participantUids?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  expectedSetupRevision: number;
  missionId: string;
  participantUids: string[];
} {
  if (!Number.isSafeInteger(data.expectedSetupRevision) || (data.expectedSetupRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedSetupRevision must be a non-negative integer.');
  }
  if (!Array.isArray(data.participantUids) || data.participantUids.length === 0 || data.participantUids.length > 33) {
    throw new HttpsError('invalid-argument', 'participantUids must contain between 1 and 33 selected participants.');
  }
  const participantUids = data.participantUids.map((value) => requiredId(value, 'participantUids entry'));
  if (new Set(participantUids).size !== participantUids.length) {
    throw new HttpsError('invalid-argument', 'participantUids must not contain duplicates.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedSetupRevision: data.expectedSetupRevision as number,
    missionId: requiredId(data.missionId, 'missionId'),
    participantUids,
  };
}

export function requireSessionSeatRequest(data: {
  sessionId?: unknown;
  seatId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
  instanceId?: unknown;
  reason?: unknown;
}): {
  sessionId: string;
  seatId: string;
  requestId: string;
  expectedSetupRevision: number;
  instanceId?: string;
  reason?: string;
} {
  if (!Number.isSafeInteger(data.expectedSetupRevision) || (data.expectedSetupRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedSetupRevision must be a non-negative integer.');
  }
  const reason = data.reason === undefined ? undefined : requiredText(data.reason, 'reason', 240);
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    seatId: requiredId(data.seatId, 'seatId'),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedSetupRevision: data.expectedSetupRevision as number,
    ...(data.instanceId === undefined ? {} : { instanceId: requiredId(data.instanceId, 'instanceId') }),
    ...(reason === undefined ? {} : { reason }),
  };
}

export function requireElevationRequest(data: {
  sessionId?: unknown;
  targetUid?: unknown;
  instanceId?: unknown;
}): { sessionId: string; targetUid: string; instanceId?: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    targetUid: requiredId(data.targetUid, 'targetUid'),
    ...(data.instanceId === undefined ? {} : { instanceId: requiredId(data.instanceId, 'instanceId') }),
  };
}

function requiredText(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) {
    throw new HttpsError('invalid-argument', `${field} required (maximum ${max} characters).`);
  }
  return text;
}

function requiredId(value: unknown, field: string): string {
  const id = requiredText(value, field, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new HttpsError('invalid-argument', `${field} contains invalid characters.`);
  }
  return id;
}

/** Identity shared by vessel-console retries and the server-owned action envelope. */
export function requireVesselActionRequest(data: {
  requestId?: unknown;
  expectedRevision?: unknown;
}): { requestId: string; expectedRevision?: number } {
  if (data.expectedRevision !== undefined &&
      (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0)) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    requestId: requiredId(data.requestId, 'requestId'),
    ...(data.expectedRevision === undefined ? {} : { expectedRevision: data.expectedRevision as number }),
  };
}

export function requireHummingbirdHarvestRequest(data: {
  sessionId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  foodDieIndex?: unknown;
}): {
  sessionId: string;
  requestId: string;
  expectedRevision: number;
  foodDieIndex?: 0 | 1;
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  if (data.foodDieIndex !== undefined && data.foodDieIndex !== 0 && data.foodDieIndex !== 1) {
    throw new HttpsError('invalid-argument', 'foodDieIndex must be 0 or 1.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedRevision: data.expectedRevision as number,
    ...(data.foodDieIndex === undefined ? {} : { foodDieIndex: data.foodDieIndex as 0 | 1 }),
  };
}

export function requireGmClaimRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  name?: unknown;
  deviceLabel?: unknown;
}): { sessionId: string; instanceId: string; name: string; deviceLabel: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    name: requiredText(data.name, 'name', 40),
    deviceLabel: requiredText(data.deviceLabel, 'deviceLabel', 160),
  };
}

export function requireGmAccessLoginRequest(data: {
  password?: unknown;
}): { password: string } {
  return { password: requiredText(data.password, 'password', 128) };
}

export function requireGmAccessLogoutRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
}): { sessionId: string | undefined; instanceId: string | undefined } {
  const sessionId = data.sessionId === null || data.sessionId === undefined
    ? undefined
    : requiredId(data.sessionId, 'sessionId');
  const instanceId = data.instanceId === null || data.instanceId === undefined
    ? undefined
    : requiredId(data.instanceId, 'instanceId');
  if ((sessionId === undefined) !== (instanceId === undefined)) {
    throw new HttpsError('invalid-argument', 'sessionId and instanceId must be supplied together.');
  }
  return { sessionId, instanceId };
}

export function requireGmInstanceActionRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  targetInstanceId?: unknown;
}): { sessionId: string; instanceId: string; targetInstanceId: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    targetInstanceId: requiredId(data.targetInstanceId, 'targetInstanceId'),
  };
}

export function requirePlayerKickRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  targetUid?: unknown;
}): { sessionId: string; instanceId: string; targetUid: string } {
  return {
    ...requireGmInstanceRequest(data),
    targetUid: requiredId(data.targetUid, 'targetUid'),
  };
}

export function requireGmInstanceRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
}): { sessionId: string; instanceId: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
  };
}

export function requireTurnAdvanceRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedTurn?: unknown;
  overridePhaseTimer?: unknown;
  skipTurnStartAnnouncement?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  expectedTurn: number;
  overridePhaseTimer: boolean;
  skipTurnStartAnnouncement: boolean;
} {
  if (!Number.isSafeInteger(data.expectedTurn) || (data.expectedTurn as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedTurn must be a non-negative integer.');
  }
  const requestId = requiredId(data.requestId, 'requestId');
  if (data.overridePhaseTimer !== undefined && typeof data.overridePhaseTimer !== 'boolean') {
    throw new HttpsError('invalid-argument', 'overridePhaseTimer must be boolean.');
  }
  if (
    data.skipTurnStartAnnouncement !== undefined &&
    typeof data.skipTurnStartAnnouncement !== 'boolean'
  ) {
    throw new HttpsError('invalid-argument', 'skipTurnStartAnnouncement must be boolean.');
  }
  return {
    ...requireGmInstanceRequest(data),
    requestId,
    expectedTurn: data.expectedTurn as number,
    overridePhaseTimer: data.overridePhaseTimer === true,
    skipTurnStartAnnouncement: data.skipTurnStartAnnouncement === true,
  };
}

export function requireOpenAirspacePhaseRequest(data: {
  sessionId?: unknown;
  expectedTurn?: unknown;
}): { sessionId: string; expectedTurn: number } {
  if (!Number.isSafeInteger(data.expectedTurn) || (data.expectedTurn as number) < 1) {
    throw new HttpsError('invalid-argument', 'expectedTurn must be a positive integer.');
  }
  return { sessionId: requiredId(data.sessionId, 'sessionId'), expectedTurn: data.expectedTurn as number };
}

export function requireAirspaceWindowExtensionRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  expectedTurn?: unknown;
  window?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  expectedTurn: number;
  window: 'restricted' | 'open';
} {
  if (!Number.isSafeInteger(data.expectedTurn) || (data.expectedTurn as number) < 1) {
    throw new HttpsError('invalid-argument', 'expectedTurn must be a positive integer.');
  }
  if (data.window !== 'restricted' && data.window !== 'open') {
    throw new HttpsError('invalid-argument', 'window must be restricted or open.');
  }
  return {
    ...requireGmInstanceRequest(data),
    expectedTurn: data.expectedTurn as number,
    window: data.window,
  };
}

export function requireEmergencyTimerPauseRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  expectedTurn?: unknown;
  paused?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  expectedTurn: number;
  paused: boolean;
} {
  if (!Number.isSafeInteger(data.expectedTurn) || (data.expectedTurn as number) < 1) {
    throw new HttpsError('invalid-argument', 'expectedTurn must be a positive integer.');
  }
  if (typeof data.paused !== 'boolean') {
    throw new HttpsError('invalid-argument', 'paused must be boolean.');
  }
  return {
    ...requireGmInstanceRequest(data),
    expectedTurn: data.expectedTurn as number,
    paused: data.paused,
  };
}

export function requireWolfAttackWindowRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  status?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  expectedRevision: number;
  status: 'due' | 'resolved' | 'deferred';
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  if (data.status !== 'due' && data.status !== 'resolved' && data.status !== 'deferred') {
    throw new HttpsError('invalid-argument', 'status must be due, resolved, or deferred.');
  }
  return {
    ...requireGmInstanceRequest(data),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedRevision: data.expectedRevision as number,
    status: data.status,
  };
}

export function requireWolfAttackPreparationRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  turn?: unknown;
  shipIds?: unknown;
  targetMode?: unknown;
  targetAssignments?: unknown;
  modifiers?: unknown;
  notes?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  expectedRevision: number;
  turn: number;
  shipIds: string[];
  targetMode: WolfAttackTargetMode;
  targetAssignments: WolfAttackTargetAssignment[];
  modifiers: WolfAttackPreparationModifierId[];
  notes: string;
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  if (!Number.isSafeInteger(data.turn) || (data.turn as number) < 1) {
    throw new HttpsError('invalid-argument', 'turn must be a positive integer.');
  }
  if (!Array.isArray(data.shipIds) || data.shipIds.length < 1 || data.shipIds.length > 24 ||
      data.shipIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id))) {
    throw new HttpsError('invalid-argument', 'shipIds must contain one to twenty-four known card ids.');
  }
  if (!WOLF_ATTACK_TARGET_MODES.includes(data.targetMode as WolfAttackTargetMode)) {
    throw new HttpsError('invalid-argument', 'targetMode must be manual or pre-rolled.');
  }
  if (!Array.isArray(data.targetAssignments) || data.targetAssignments.length > 24) {
    throw new HttpsError('invalid-argument', 'targetAssignments must be a list of at most twenty-four assignments.');
  }
  const targetAssignments: WolfAttackTargetAssignment[] = data.targetAssignments.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new HttpsError('invalid-argument', 'Each target assignment must be an object.');
    }
    const assignment = value as Record<string, unknown>;
    if (!Number.isSafeInteger(assignment.cardIndex) || (assignment.cardIndex as number) < 0 ||
        typeof assignment.targetShipId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(assignment.targetShipId)) {
      throw new HttpsError('invalid-argument', 'Each target assignment requires a cardIndex and targetShipId.');
    }
    return {
      cardIndex: assignment.cardIndex as number,
      targetShipId: assignment.targetShipId as WolfAttackTargetAssignment['targetShipId'],
    };
  });
  if (new Set(targetAssignments.map((assignment) => assignment.cardIndex)).size !== targetAssignments.length) {
    throw new HttpsError('invalid-argument', 'Each card may have only one prepared target.');
  }
  if (!Array.isArray(data.modifiers) || data.modifiers.length > WOLF_ATTACK_PREPARATION_MODIFIER_IDS.length ||
      data.modifiers.some((modifier) => !(WOLF_ATTACK_PREPARATION_MODIFIER_IDS as readonly unknown[]).includes(modifier))) {
    throw new HttpsError('invalid-argument', 'modifiers contains an unsupported preparation marker.');
  }
  const modifiers = data.modifiers as WolfAttackPreparationModifierId[];
  if (new Set(modifiers).size !== modifiers.length) {
    throw new HttpsError('invalid-argument', 'modifiers cannot contain duplicates.');
  }
  if (data.notes !== undefined && typeof data.notes !== 'string') {
    throw new HttpsError('invalid-argument', 'notes must be text.');
  }
  const notes = typeof data.notes === 'string' ? data.notes.trim() : '';
  if (notes.length > 2_000) throw new HttpsError('invalid-argument', 'notes must be 2,000 characters or fewer.');
  return {
    ...requireGmInstanceRequest(data),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedRevision: data.expectedRevision as number,
    turn: data.turn as number,
    shipIds: [...data.shipIds] as string[],
    targetMode: data.targetMode as WolfAttackTargetMode,
    targetAssignments,
    modifiers: [...modifiers],
    notes,
  };
}

/** A GM declaration CAS binds to the private P427 preparation revision. */
export function requireWolfAttackDeclarationRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  expectedRevision: number;
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 1) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a positive preparation revision.');
  }
  return {
    ...requireGmInstanceRequest(data),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedRevision: data.expectedRevision as number,
  };
}

/** A live Wolf Commander submits only the targeting indexes it wants rerolled. */
export function requireWolfCommanderRerollRequest(data: {
  sessionId?: unknown;
  requestId?: unknown;
  expectedTurn?: unknown;
  expectedRevision?: unknown;
  rosterIndexes?: unknown;
}): {
  sessionId: string;
  requestId: string;
  expectedTurn: number;
  expectedRevision: number;
  rosterIndexes: number[];
} {
  if (!Number.isSafeInteger(data.expectedTurn) || (data.expectedTurn as number) < 1) {
    throw new HttpsError('invalid-argument', 'expectedTurn must be a positive integer.');
  }
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 1) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a positive integer.');
  }
  if (!Array.isArray(data.rosterIndexes) || data.rosterIndexes.length < 1 || data.rosterIndexes.length > 24 ||
      data.rosterIndexes.some((index) => !Number.isSafeInteger(index) || (index as number) < 0)) {
    throw new HttpsError('invalid-argument', 'rosterIndexes must contain one to twenty-four non-negative indexes.');
  }
  const rosterIndexes = data.rosterIndexes as number[];
  if (new Set(rosterIndexes).size !== rosterIndexes.length) {
    throw new HttpsError('invalid-argument', 'rosterIndexes must not contain duplicates.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedTurn: data.expectedTurn as number,
    expectedRevision: data.expectedRevision as number,
    rosterIndexes: [...rosterIndexes],
  };
}

/** A facilitator's private census annotation is revisioned and clearable. */
export function requireFacilitatorCensusNoteRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  targetUid?: unknown;
  note?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  expectedRevision: number;
  targetUid: string;
  note: string;
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  if (data.note !== undefined && typeof data.note !== 'string') {
    throw new HttpsError('invalid-argument', 'note must be text or empty.');
  }
  const note = typeof data.note === 'string' ? data.note.trim() : '';
  if (note.length > 240) {
    throw new HttpsError('invalid-argument', 'note must be 240 characters or fewer.');
  }
  return {
    ...requireGmInstanceRequest(data),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedRevision: data.expectedRevision as number,
    targetUid: requiredId(data.targetUid, 'targetUid'),
    note,
  };
}

export function requireShipAvailabilityRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  capybaraEnabled?: unknown;
}): { sessionId: string; instanceId: string; capybaraEnabled: boolean } {
  if (typeof data.capybaraEnabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'capybaraEnabled must be boolean.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    capybaraEnabled: data.capybaraEnabled,
  };
}

export function requireDioneAvailabilityRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  dioneEnabled?: unknown;
}): { sessionId: string; instanceId: string; dioneEnabled: boolean } {
  if (typeof data.dioneEnabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'dioneEnabled must be boolean.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    dioneEnabled: data.dioneEnabled,
  };
}

export function requirePressAvailabilityRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  pressEnabled?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  pressEnabled: boolean;
  expectedRevision: number;
} {
  if (typeof data.pressEnabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'pressEnabled must be boolean.');
  }
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    pressEnabled: data.pressEnabled,
    expectedRevision: data.expectedRevision as number,
  };
}

export function requireGmControlsLockRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  locked?: unknown;
}): { sessionId: string; instanceId: string; locked: boolean } {
  if (typeof data.locked !== 'boolean') {
    throw new HttpsError('invalid-argument', 'locked must be boolean.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    locked: data.locked,
  };
}

export function requireDebriefModeRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  active?: unknown;
}): { sessionId: string; instanceId: string; active: boolean } {
  if (typeof data.active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'active must be boolean.');
  }
  return {
    ...requireGmInstanceRequest(data),
    active: data.active,
  };
}

export function requireShipConfettiRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
  roleId?: unknown;
}): { sessionId: string; shipId: string; roleId: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
    roleId: requiredId(data.roleId, 'roleId'),
  };
}

export function requireShipDamageRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
  instanceId?: unknown;
}): { sessionId: string; shipId: string; instanceId: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
  };
}

export function requireMaintenanceRollbackRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  shipId: string;
  instanceId: string;
  requestId: string;
  expectedRevision: number;
} {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    ...requireShipDamageRequest(data),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedRevision: data.expectedRevision as number,
  };
}

export function requireShipNavigationMoveRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  shipId?: unknown;
  destination?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
}): { sessionId: string; instanceId: string; shipId: string; destination: string } {
  const destination = requiredText(data.destination, 'destination', 4);
  if (!isStarSystemCoordinate(destination)) {
    throw new HttpsError('invalid-argument', 'destination must be a printed star system.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    shipId: requiredId(data.shipId, 'shipId'),
    destination,
  };
}

export function requireShipJumpRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  shipId?: unknown;
  destination?: unknown;
}): { sessionId: string; instanceId?: string; shipId: string; destination: string } {
  const destination = requiredText(data.destination, 'destination', 4);
  if (!/^\d{4}$/.test(destination)) {
    throw new HttpsError('invalid-argument', 'destination must be exactly four digits.');
  }
  const result: { sessionId: string; instanceId?: string; shipId: string; destination: string } = {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
    destination,
  };
  if (data.instanceId !== undefined) result.instanceId = requiredId(data.instanceId, 'instanceId');
  return result;
}

export function requireShipConsoleLockRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
  instanceId?: unknown;
  locked?: unknown;
}): { sessionId: string; shipId: string; instanceId?: string; locked: boolean } {
  if (typeof data.locked !== 'boolean') {
    throw new HttpsError('invalid-argument', 'locked must be boolean.');
  }
  const result: { sessionId: string; shipId: string; instanceId?: string; locked: boolean } = {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
    locked: data.locked,
  };
  if (data.instanceId !== undefined) result.instanceId = requiredId(data.instanceId, 'instanceId');
  return result;
}

export function requireShipCounterRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
  resourceId?: unknown;
  delta?: unknown;
  instanceId?: unknown;
}): {
  sessionId: string; shipId: string; resourceId: ResourceId; delta: -1 | 1; instanceId?: string;
} {
  const resourceId = requiredId(data.resourceId, 'resourceId');
  if (!(RESOURCE_IDS as readonly string[]).includes(resourceId)) {
    throw new HttpsError('invalid-argument', 'Unknown resource.');
  }
  if (data.delta !== -1 && data.delta !== 1) {
    throw new HttpsError('invalid-argument', 'delta must be -1 or 1.');
  }
  const result: {
    sessionId: string; shipId: string; resourceId: ResourceId; delta: -1 | 1;
    instanceId?: string;
  } = {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
    resourceId: resourceId as ResourceId,
    delta: data.delta,
  };
  if (data.instanceId !== undefined) result.instanceId = requiredId(data.instanceId, 'instanceId');
  return result;
}

export function requireFighterWingCountRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  wingId?: unknown;
  count?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  wingId: FighterWingId;
  count: number;
  expectedRevision: number;
} {
  if (!(FIGHTER_WING_IDS as readonly string[]).includes(data.wingId as string)) {
    throw new HttpsError('invalid-argument', 'Unknown fighter wing.');
  }
  if (!Number.isSafeInteger(data.count) || (data.count as number) < 0 || (data.count as number) > 6) {
    throw new HttpsError('invalid-argument', 'count must be an integer from 0 through 6.');
  }
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    wingId: data.wingId as FighterWingId,
    count: data.count as number,
    expectedRevision: data.expectedRevision as number,
  };
}

export function requireFighterBuildRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  wingId?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  instanceId?: string;
  requestId: string;
  wingId: FighterWingId;
  expectedRevision: number;
} {
  if (!(FIGHTER_WING_IDS as readonly string[]).includes(data.wingId as string)) {
    throw new HttpsError('invalid-argument', 'Unknown fighter wing.');
  }
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    ...(data.instanceId === undefined ? {} : { instanceId: requiredId(data.instanceId, 'instanceId') }),
    requestId: requiredId(data.requestId, 'requestId'),
    wingId: data.wingId as FighterWingId,
    expectedRevision: data.expectedRevision as number,
  };
}

export type ShipCounterStep = -1 | 1;

export type ShipCounterBatchRequest = {
  readonly sessionId: string;
  readonly instanceId: string;
  readonly shipId: string;
  readonly counter: 'resource';
  readonly resourceId: ResourceId;
  readonly steps: readonly ShipCounterStep[];
} | {
  readonly sessionId: string;
  readonly instanceId: string;
  readonly shipId: string;
  readonly counter: 'unrest' | 'population';
  readonly steps: readonly ShipCounterStep[];
};

/** Validates a small, ordered command run from the GM counter controls. */
export function requireShipCounterBatchRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  shipId?: unknown;
  counter?: unknown;
  resourceId?: unknown;
  steps?: unknown;
}): ShipCounterBatchRequest {
  const rawCounter = requiredText(data.counter, 'counter', 16);
  if (!(['resource', 'unrest', 'population'] as readonly string[]).includes(rawCounter)) {
    throw new HttpsError('invalid-argument', 'Unknown counter.');
  }
  const counter = rawCounter as ShipCounterBatchRequest['counter'];
  if (!Array.isArray(data.steps) || data.steps.length === 0 || data.steps.length > 12 ||
    data.steps.some((step) => step !== -1 && step !== 1)) {
    throw new HttpsError('invalid-argument', 'steps must contain one to twelve -1 or 1 values.');
  }
  const base = {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    shipId: requiredId(data.shipId, 'shipId'),
    steps: [...data.steps] as ShipCounterStep[],
  };
  if (counter === 'resource') {
    const resourceId = requiredId(data.resourceId, 'resourceId');
    if (!(RESOURCE_IDS as readonly string[]).includes(resourceId)) {
      throw new HttpsError('invalid-argument', 'Unknown resource.');
    }
    return { ...base, counter, resourceId: resourceId as ResourceId };
  }
  if (data.resourceId !== undefined) {
    throw new HttpsError('invalid-argument', 'Only resource batches may include resourceId.');
  }
  return { ...base, counter };
}

export function requireShipUnrestRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
  delta?: unknown;
  instanceId?: unknown;
}): { sessionId: string; shipId: string; delta: -1 | 1; instanceId?: string } {
  if (data.delta !== -1 && data.delta !== 1) {
    throw new HttpsError('invalid-argument', 'delta must be -1 or 1.');
  }
  const result: { sessionId: string; shipId: string; delta: -1 | 1; instanceId?: string } = {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
    delta: data.delta,
  };
  if (data.instanceId !== undefined) result.instanceId = requiredId(data.instanceId, 'instanceId');
  return result;
}

export function requireUnrestDismissalRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
  instanceId?: unknown;
}): { sessionId: string; shipId: string; instanceId: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
  };
}

export function requireWolfAssignmentRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  count?: unknown;
}): { sessionId: string; instanceId: string; count: 1 | 2 } {
  if (data.count !== 1 && data.count !== 2) {
    throw new HttpsError('invalid-argument', 'count must be one or two.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    count: data.count,
  };
}

export function requireManualWolfAssignmentRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  roleIds?: unknown;
}): { sessionId: string; instanceId: string; roleIds: string[] } {
  if (!Array.isArray(data.roleIds) || data.roleIds.length < 1 || data.roleIds.length > 2) {
    throw new HttpsError('invalid-argument', 'Choose one or two wolves.');
  }
  const roleIds = data.roleIds.map((roleId) => requiredId(roleId, 'roleId'));
  if (
    new Set(roleIds).size !== roleIds.length ||
    roleIds.some((roleId) => !(WOLF_ROLE_IDS as readonly string[]).includes(roleId))
  ) {
    throw new HttpsError('invalid-argument', 'Unknown or duplicate wolf role.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    roleIds,
  };
}

export function requireActiveRoleSettingRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  roleId?: unknown;
  enabled?: unknown;
}): { sessionId: string; instanceId: string; roleId: string; enabled: boolean } {
  const roleId = requiredId(data.roleId, 'roleId');
  if (!(ROLE_IDS as readonly string[]).includes(roleId)) {
    throw new HttpsError('invalid-argument', 'Unknown role.');
  }
  if (typeof data.enabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'enabled must be boolean.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    roleId,
    enabled: data.enabled,
  };
}

/** A GM sends the whole roster only after locally reviewing its draft. */
export function requireRoleConfigurationRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  activeRoleIds?: unknown;
}): { sessionId: string; instanceId: string; activeRoleIds: string[] } {
  if (!Array.isArray(data.activeRoleIds) || data.activeRoleIds.length > ROLE_IDS.length) {
    throw new HttpsError('invalid-argument', 'activeRoleIds must be a bounded role list.');
  }
  const activeRoleIds = data.activeRoleIds.map((roleId) => requiredId(roleId, 'activeRoleId'));
  if (
    new Set(activeRoleIds).size !== activeRoleIds.length ||
    activeRoleIds.some((roleId) => !(ROLE_IDS as readonly string[]).includes(roleId))
  ) {
    throw new HttpsError('invalid-argument', 'Unknown or duplicate active role.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    activeRoleIds,
  };
}

export function requireRolePresetRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  playerCount?: unknown;
}): { sessionId: string; instanceId: string; playerCount: number } {
  if (
    typeof data.playerCount !== 'number' || !Number.isInteger(data.playerCount) ||
    !SUPPORTED_PLAYER_COUNTS.includes(data.playerCount as typeof SUPPORTED_PLAYER_COUNTS[number])
  ) {
    throw new HttpsError('invalid-argument', 'playerCount must be one of the supported core counts from 8 through 20.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    playerCount: data.playerCount,
  };
}

export function requireSetupConfirmationRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
  setup?: unknown;
  playerCount?: unknown;
  chartId?: unknown;
  lockChart?: unknown;
  expansion?: unknown;
  turnLimit?: unknown;
  dioneEnabled?: unknown;
  capybaraEnabled?: unknown;
  universalArbourEnabled?: unknown;
  wolfCultEnabled?: unknown;
  activeRoleIds?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  expectedSetupRevision: number;
  configuration: SessionConfiguration;
  lockChart: boolean;
  activeRoleIds: string[];
} {
  if (!Number.isSafeInteger(data.expectedSetupRevision) || (data.expectedSetupRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedSetupRevision must be a non-negative integer.');
  }
  const nested = typeof data.setup === 'object' && data.setup !== null && !Array.isArray(data.setup)
    ? data.setup as Record<string, unknown>
    : {};
  const input = { ...data, ...nested };
  if (input.lockChart !== undefined && typeof input.lockChart !== 'boolean') {
    throw new HttpsError('invalid-argument', 'lockChart must be a boolean.');
  }
  let configuration: SessionConfiguration;
  try {
    configuration = normalizeSessionConfiguration(input);
  } catch (error) {
    throw new HttpsError(
      'invalid-argument',
      error instanceof Error ? error.message : 'Invalid setup configuration.',
    );
  }
  const activeRoleIds = input.activeRoleIds === undefined
    ? [...recommendedRoleIds(configuration.playerCount)]
    : input.activeRoleIds;
  if (!Array.isArray(activeRoleIds) || activeRoleIds.some((roleId) => typeof roleId !== 'string')) {
    throw new HttpsError('invalid-argument', 'activeRoleIds must be an ordered role list.');
  }
  const printed = recommendedRoleIds(configuration.playerCount);
  if (activeRoleIds.length !== printed.length || activeRoleIds.some((roleId, index) => roleId !== printed[index])) {
    throw commandError(
      'failed-precondition',
      'The setup role order must match the printed player-count roster.',
      'malformed-input',
    );
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedSetupRevision: data.expectedSetupRevision as number,
    configuration,
    lockChart: input.lockChart === true,
    activeRoleIds: [...activeRoleIds],
  };
}

export function requirePressDispatchRequest(data: {
  sessionId?: unknown;
  requestId?: unknown;
  text?: unknown;
  expectedRevision?: unknown;
}): { sessionId: string; requestId?: string; text: string; expectedRevision: number } {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    ...(data.requestId === undefined ? {} : { requestId: requiredId(data.requestId, 'requestId') }),
    text: requiredText(data.text, 'text', 220),
    expectedRevision: data.expectedRevision as number,
  };
}

export function requirePressDispatchDismissalRequest(data: {
  sessionId?: unknown;
  requestId?: unknown;
  dispatchId?: unknown;
  expectedRevision?: unknown;
}): { sessionId: string; requestId?: string; dispatchId: string; expectedRevision: number } {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    ...(data.requestId === undefined ? {} : { requestId: requiredId(data.requestId, 'requestId') }),
    dispatchId: requiredId(data.dispatchId, 'dispatchId'),
    expectedRevision: data.expectedRevision as number,
  };
}

export function requireDiceRequest(data: {
  sessionId?: unknown;
  sides?: unknown;
  count?: unknown;
}): { sessionId: string; sides: number; count: number } {
  const { sides, count } = data;
  const sessionId = requiredId(data.sessionId, 'sessionId');
  if (typeof sides !== 'number' || !Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new HttpsError('invalid-argument', 'sides must be 2..1000.');
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 50) {
    throw new HttpsError('invalid-argument', 'count must be 1..50.');
  }
  return { sessionId, sides, count };
}
