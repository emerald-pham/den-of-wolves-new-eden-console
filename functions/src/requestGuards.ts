import { HttpsError } from 'firebase-functions/v2/https';
import { WOLF_ROLE_IDS } from './wolfAssignment';
import { ROLE_IDS } from './roleConfiguration';

export function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in before joining a table.');
  }
  return auth.uid;
}

export function requireSessionRequest(data: {
  sessionId?: unknown;
}): { sessionId: string } {
  const { sessionId } = data;
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId required.');
  }
  return { sessionId };
}

export function requireSessionSeatRequest(data: {
  sessionId?: unknown;
  seatId?: unknown;
}): { sessionId: string; seatId: string } {
  const { sessionId, seatId } = data;
  if (typeof sessionId !== 'string' || !sessionId || typeof seatId !== 'string' || !seatId) {
    throw new HttpsError('invalid-argument', 'sessionId and seatId required.');
  }
  return { sessionId, seatId };
}

export function requireElevationRequest(data: {
  sessionId?: unknown;
  targetUid?: unknown;
}): { sessionId: string; targetUid: string } {
  const { sessionId, targetUid } = data;
  if (
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof targetUid !== 'string' ||
    !targetUid
  ) {
    throw new HttpsError('invalid-argument', 'sessionId and targetUid required.');
  }
  return { sessionId, targetUid };
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

export function requireShipConfettiRequest(data: {
  sessionId?: unknown;
  shipId?: unknown;
}): { sessionId: string; shipId: string } {
  return {
    sessionId: requiredId(data.sessionId, 'sessionId'),
    shipId: requiredId(data.shipId, 'shipId'),
  };
}

export function requireWolfRoleSettingRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  roleId?: unknown;
  enabled?: unknown;
}): { sessionId: string; instanceId: string; roleId: string; enabled: boolean } {
  const roleId = requiredId(data.roleId, 'roleId');
  if (!(WOLF_ROLE_IDS as readonly string[]).includes(roleId)) {
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

export function requireDiceRequest(data: {
  sessionId?: unknown;
  sides?: unknown;
  count?: unknown;
}): { sessionId: string; sides: number; count: number } {
  const { sessionId, sides, count } = data;
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId required.');
  }
  if (typeof sides !== 'number' || !Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new HttpsError('invalid-argument', 'sides must be 2..1000.');
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 50) {
    throw new HttpsError('invalid-argument', 'count must be 1..50.');
  }
  return { sessionId, sides, count };
}
