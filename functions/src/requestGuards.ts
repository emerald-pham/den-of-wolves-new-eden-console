import { HttpsError } from 'firebase-functions/v2/https';
import { WOLF_ROLE_IDS } from './wolfAssignment';
import { ROLE_IDS } from './roleConfiguration';
import { RESOURCE_IDS, type ResourceId } from './resources';
import { isStarSystemCoordinate } from './navigation';

export function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in before joining a table.');
  }
  return auth.uid;
}

export function requireSessionRequest(data: {
  sessionId?: unknown;
}): { sessionId: string } {
  return { sessionId: requiredId(data.sessionId, 'sessionId') };
}

export function requireSessionSeatRequest(data: {
  sessionId?: unknown;
  seatId?: unknown;
}): { sessionId: string; seatId: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    seatId: requiredId(data.seatId, 'seatId'),
  };
}

export function requireElevationRequest(data: {
  sessionId?: unknown;
  targetUid?: unknown;
}): { sessionId: string; targetUid: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    targetUid: requiredId(data.targetUid, 'targetUid'),
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
  expectedTurn?: unknown;
  overridePhaseTimer?: unknown;
}): { sessionId: string; instanceId: string; expectedTurn: number; overridePhaseTimer: boolean } {
  if (!Number.isSafeInteger(data.expectedTurn) || (data.expectedTurn as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedTurn must be a non-negative integer.');
  }
  if (data.overridePhaseTimer !== undefined && typeof data.overridePhaseTimer !== 'boolean') {
    throw new HttpsError('invalid-argument', 'overridePhaseTimer must be boolean.');
  }
  return {
    ...requireGmInstanceRequest(data),
    expectedTurn: data.expectedTurn as number,
    overridePhaseTimer: data.overridePhaseTimer === true,
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

export function requireShipNavigationMoveRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  shipId?: unknown;
  destination?: unknown;
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
    data.playerCount < 8 || data.playerCount > 21
  ) {
    throw new HttpsError('invalid-argument', 'playerCount must be an integer from 8 through 21.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    instanceId: requiredId(data.instanceId, 'instanceId'),
    playerCount: data.playerCount,
  };
}

export function requirePressDispatchRequest(data: {
  sessionId?: unknown;
  text?: unknown;
  expectedRevision?: unknown;
}): { sessionId: string; text: string; expectedRevision: number } {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    text: requiredText(data.text, 'text', 220),
    expectedRevision: data.expectedRevision as number,
  };
}

export function requirePressDispatchDismissalRequest(data: {
  sessionId?: unknown;
  dispatchId?: unknown;
  expectedRevision?: unknown;
}): { sessionId: string; dispatchId: string; expectedRevision: number } {
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
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
