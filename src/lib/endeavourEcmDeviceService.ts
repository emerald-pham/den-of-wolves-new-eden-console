import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export type EndeavourEcmDeviceState =
  | Readonly<{ status: 'ready'; revision: 0 }>
  | Readonly<{
      status: 'used';
      revision: 1;
      ownerGroupId: string;
      pursuitBefore: number;
      pursuitAfter: number;
    }>;

export interface EndeavourEcmDeviceWorkspace {
  readonly status: 'ready';
  readonly sessionId: string;
  readonly cycle: number;
  readonly controlRevision: number;
  readonly researchComplete: boolean;
  readonly device: EndeavourEcmDeviceState;
  readonly pursuit: Readonly<{ groupId: string; current: number }>;
}

export interface EndeavourEcmDeviceAttempt {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => keys.includes(key));
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPursuitValue(value: unknown): value is number {
  return isCounter(value) && value <= 10;
}

function isGroupId(value: unknown): value is string {
  return typeof value === 'string' && /^fleet-[1-9][0-9]*$/.test(value);
}

function parseDeviceState(value: unknown): EndeavourEcmDeviceState | null {
  if (!isRecord(value)) return null;
  if (value.status === 'ready') {
    return hasExactKeys(value, ['status', 'revision']) && value.revision === 0
      ? { status: 'ready', revision: 0 }
      : null;
  }
  if (value.status !== 'used' || !hasExactKeys(value, [
    'status', 'revision', 'ownerGroupId', 'pursuitBefore', 'pursuitAfter',
  ]) || value.revision !== 1 || !isGroupId(value.ownerGroupId) ||
      !isPursuitValue(value.pursuitBefore) || !isPursuitValue(value.pursuitAfter) ||
      value.pursuitAfter !== Math.max(0, value.pursuitBefore - 3)) return null;
  return {
    status: 'used', revision: 1, ownerGroupId: value.ownerGroupId,
    pursuitBefore: value.pursuitBefore, pursuitAfter: value.pursuitAfter,
  };
}

export function parseEndeavourEcmDeviceWorkspace(
  value: unknown,
  expectedSessionId: string,
): EndeavourEcmDeviceWorkspace | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'status', 'sessionId', 'cycle', 'controlRevision', 'researchComplete', 'device', 'pursuit',
  ]) || value.status !== 'ready' || value.sessionId !== expectedSessionId ||
      !isCounter(value.cycle) || value.cycle < 1 || !isCounter(value.controlRevision) ||
      typeof value.researchComplete !== 'boolean' || !isRecord(value.pursuit) ||
      !hasExactKeys(value.pursuit, ['groupId', 'current']) || !isGroupId(value.pursuit.groupId) ||
      !isPursuitValue(value.pursuit.current)) return null;
  const device = parseDeviceState(value.device);
  if (!device || (device.status === 'used' && !value.researchComplete)) return null;
  return {
    status: 'ready', sessionId: expectedSessionId, cycle: value.cycle,
    controlRevision: value.controlRevision, researchComplete: value.researchComplete,
    device, pursuit: { groupId: value.pursuit.groupId, current: value.pursuit.current },
  };
}

export function parseEndeavourEcmDeviceReply(
  value: unknown,
  attempt: EndeavourEcmDeviceAttempt,
): EndeavourEcmDeviceReply | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'status', 'sessionId', 'requestId', 'cycle', 'deviceRevision',
    'ownerGroupId', 'pursuitBefore', 'pursuitAfter',
  ]) || (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== attempt.sessionId || value.requestId !== attempt.requestId ||
      value.cycle !== attempt.expectedCycle || attempt.expectedDeviceRevision !== 0 || value.deviceRevision !== 1 ||
      !isGroupId(value.ownerGroupId) || !isPursuitValue(value.pursuitBefore) ||
      !isPursuitValue(value.pursuitAfter) || value.pursuitAfter !== Math.max(0, value.pursuitBefore - 3)) return null;
  return {
    status: value.status,
    sessionId: attempt.sessionId,
    requestId: attempt.requestId,
    cycle: attempt.expectedCycle,
    deviceRevision: 1,
    ownerGroupId: value.ownerGroupId,
    pursuitBefore: value.pursuitBefore,
    pursuitAfter: value.pursuitAfter,
  };
}

function currentScientistAuthority() {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  if (!session || !me?.uid || me.sessionId !== session.id || me.role !== 'player' ||
      me.activeConsoleRoleId !== 'shepherd-scientist' ||
      !session.activeRoleIds?.includes('shepherd-scientist') ||
      control?.shuttleId !== 'endeavour' || control.ownerRoleId !== 'shepherd-scientist' ||
      control.holderUid !== me.uid || !Number.isSafeInteger(control.revision) || control.revision < 0) {
    throw new Error('Reconnect as the current Shepherd Scientist holding Endeavour.');
  }
  requireFreshSessionAuthority();
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before viewing the Endeavour ECM Device.');
  return { session, me, control, checkpoint };
}

function assertCurrentScientistAuthority(sessionId: string, uid: string): void {
  requireFreshSessionAuthority();
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  if (!session || !me || session.id !== sessionId || me.sessionId !== sessionId || me.uid !== uid ||
      session.phase !== 'active' || me.role !== 'player' || me.activeConsoleRoleId !== 'shepherd-scientist' ||
      !session.activeRoleIds?.includes('shepherd-scientist') ||
      control?.ownerRoleId !== 'shepherd-scientist' || control.holderUid !== uid) {
    throw new Error('Endeavour authority changed. Reconnect and refresh the Scientist console.');
  }
}

function requestId(): string {
  return window.crypto.randomUUID();
}

export async function readEndeavourEcmDeviceWorkspace(): Promise<EndeavourEcmDeviceWorkspace> {
  const { session, me, checkpoint } = currentScientistAuthority();
  const response = await httpsCallable<{ sessionId: string }, unknown>(
    functions(), 'readEndeavourEcmDeviceWorkspace',
  )({ sessionId: session.id });
  if (!isCurrentSessionAuthority(checkpoint)) {
    throw new Error('Endeavour authority changed. Reconnect and refresh the Scientist console.');
  }
  assertCurrentScientistAuthority(session.id, me.uid);
  const workspace = parseEndeavourEcmDeviceWorkspace(response.data, session.id);
  if (!workspace) throw new Error('The server returned invalid ECM Device data.');
  return workspace;
}

export function createEndeavourEcmDeviceAttempt(
  workspace: EndeavourEcmDeviceWorkspace,
): EndeavourEcmDeviceAttempt {
  const { session, me, control } = currentScientistAuthority();
  if (workspace.sessionId !== session.id || workspace.cycle !== session.currentTurn ||
      workspace.controlRevision !== control.revision || !workspace.researchComplete ||
      workspace.device.status !== 'ready' || workspace.pursuit.groupId !== me.fleetGroupId ||
      workspace.device.revision !== 0) {
    throw new Error('Endeavour ECM Device state changed. Refresh before use.');
  }
  return Object.freeze({
    sessionId: session.id,
    requestId: requestId(),
    expectedControlRevision: control.revision,
    expectedDeviceRevision: workspace.device.revision,
    expectedCycle: workspace.cycle,
  });
}

function assertWellFormedAttempt(attempt: EndeavourEcmDeviceAttempt, sessionId: string): void {
  if (!attempt || attempt.sessionId !== sessionId ||
      typeof attempt.requestId !== 'string' || !/^[\w-]{1,128}$/.test(attempt.requestId) ||
      !isCounter(attempt.expectedControlRevision) || !isCounter(attempt.expectedDeviceRevision) ||
      attempt.expectedDeviceRevision !== 0 ||
      !isCounter(attempt.expectedCycle) || attempt.expectedCycle < 1) {
    throw new Error('Endeavour ECM Device state changed. Refresh before use.');
  }
}

function requestPayload(attempt: EndeavourEcmDeviceAttempt) {
  return {
    sessionId: attempt.sessionId,
    requestId: attempt.requestId,
    expectedControlRevision: attempt.expectedControlRevision,
    expectedDeviceRevision: attempt.expectedDeviceRevision,
    expectedCycle: attempt.expectedCycle,
  };
}

export async function activateEndeavourEcmDevice(
  attempt: EndeavourEcmDeviceAttempt,
): Promise<EndeavourEcmDeviceReply> {
  const { session, me, control } = currentScientistAuthority();
  assertWellFormedAttempt(attempt, session.id);
  if (attempt.expectedCycle !== session.currentTurn ||
      attempt.expectedControlRevision !== control.revision) {
    throw new Error('Endeavour ECM Device state changed. Refresh before use.');
  }
  const response = await httpsCallable<typeof attempt, unknown>(
    functions(), 'activateEndeavourEcmDevice',
  )(requestPayload(attempt));
  assertCurrentScientistAuthority(attempt.sessionId, me.uid);
  const result = parseEndeavourEcmDeviceReply(response.data, attempt);
  if (!result) throw new Error('The server returned an invalid ECM Device result.');
  return result;
}

export async function retryEndeavourEcmDeviceAttempt(
  attempt: EndeavourEcmDeviceAttempt,
): Promise<EndeavourEcmDeviceReply> {
  const { session, me } = currentScientistAuthority();
  assertWellFormedAttempt(attempt, session.id);
  const response = await httpsCallable<typeof attempt, unknown>(
    functions(), 'activateEndeavourEcmDevice',
  )(requestPayload(attempt));
  assertCurrentScientistAuthority(attempt.sessionId, me.uid);
  const result = parseEndeavourEcmDeviceReply(response.data, attempt);
  if (!result) throw new Error('The server returned an invalid ECM Device result.');
  return result;
}
