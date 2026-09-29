import { httpsCallable } from 'firebase/functions';
import { RESOURCE_DEFINITIONS, type ResourceId } from '@/data/resources';
import { dockingForShuttle } from '@/data/shuttles';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { hasFreshSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { normalizeCommandError } from './commandErrors';

export interface ShuttleCargoStaleResult {
  readonly status: 'stale';
  readonly hostShipId: string;
  readonly currentControlRevision: number;
}

export type ShuttleCargoTransferResult =
  | Readonly<{ status: 'committed' | 'replayed' }>
  | ShuttleCargoStaleResult;

export interface ShuttleCargoTransferCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: string;
  readonly resourceId: ResourceId;
  readonly direction: 'load' | 'unload';
  readonly amount: number;
  readonly expectedControlRevision: number;
}

export interface ShuttleCargoTransferAuthorityBinding {
  readonly sessionId: string;
  readonly uid: string;
  readonly role: string;
  readonly assignedRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly replacementRoleId: string | null | undefined;
  readonly replacementStatus: 'awaiting-re-role' | null | undefined;
  readonly seatId: string | null | undefined;
  readonly fleetGroupId: string;
  readonly shuttleId: string;
  readonly ownerRoleId: string;
  readonly ownerUid: string;
  readonly holderUid: string;
  readonly hostShipId: string;
  readonly expectedControlRevision: number;
}

export interface ShuttleCargoTransferAttempt {
  readonly command: ShuttleCargoTransferCommand;
  readonly authority: ShuttleCargoTransferAuthorityBinding;
}

export class ShuttleCargoTransferUncertainError extends Error {
  constructor(readonly attempt: ShuttleCargoTransferAttempt, message?: string) {
    super(message ?? 'The shuttle cargo result is uncertain. Retry the exact request while the same holder authority remains active.');
    this.name = 'ShuttleCargoTransferUncertainError';
  }
}

export class ShuttleCargoTransferRejectedError extends Error {
  constructor(readonly attempt: ShuttleCargoTransferAttempt, cause: unknown) {
    super(normalizeCommandError(cause).message);
    this.name = 'ShuttleCargoTransferRejectedError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function currentAuthorityMatches(attempt: ShuttleCargoTransferAuthorityBinding): boolean {
  const current = useSessionStore.getState();
  const session = current.session;
  const me = current.me;
  const control = session?.shuttleControl?.[attempt.shuttleId];
  const docking = session ? dockingForShuttle(session, attempt.shuttleId) : undefined;
  return hasFreshSessionAuthority() && attempt.role === 'player' && me?.role === 'player' &&
    session?.id === attempt.sessionId &&
    me?.sessionId === attempt.sessionId && me.uid === attempt.uid &&
    me.role === attempt.role && me.assignedRoleId === attempt.assignedRoleId &&
    me.activeConsoleRoleId === attempt.activeConsoleRoleId &&
    me.replacementRoleId === attempt.replacementRoleId &&
    me.replacementStatus === attempt.replacementStatus && me.replacementStatus == null &&
    me.seatId === attempt.seatId &&
    me.fleetGroupId === attempt.fleetGroupId &&
    control?.shuttleId === attempt.shuttleId && control.ownerRoleId === attempt.ownerRoleId &&
    control.ownerUid === attempt.ownerUid && control.holderUid === attempt.holderUid &&
    attempt.holderUid === attempt.uid &&
    Number.isSafeInteger(control.revision) && control.revision >= attempt.expectedControlRevision &&
    docking?.shipId === attempt.hostShipId;
}

function captureAttemptAuthority(
  shuttleId: string,
  expectedControlRevision: number,
): ShuttleCargoTransferAuthorityBinding {
  const { session, me } = useSessionStore.getState();
  if (!session || !me || me.role !== 'player' || me.sessionId !== session.id || !me.uid ||
      me.replacementStatus != null || typeof me.fleetGroupId !== 'string' || !me.fleetGroupId.trim()) {
    throw new Error('Only the current shuttle holder may transfer cargo.');
  }
  const control = session.shuttleControl?.[shuttleId];
  const docking = dockingForShuttle(session, shuttleId);
  if (!control || control.shuttleId !== shuttleId || control.holderUid !== me.uid) {
    throw new Error('Only the current shuttle holder may transfer cargo.');
  }
  if (control.revision !== expectedControlRevision || !docking?.shipId) {
    throw new Error('Refresh the current shuttle control and docking state before transferring cargo.');
  }
  return {
    sessionId: session.id,
    uid: me.uid,
    role: me.role,
    assignedRoleId: me.assignedRoleId,
    activeConsoleRoleId: me.activeConsoleRoleId,
    replacementRoleId: me.replacementRoleId,
    replacementStatus: me.replacementStatus,
    seatId: me.seatId,
    fleetGroupId: me.fleetGroupId,
    shuttleId,
    ownerRoleId: control.ownerRoleId,
    ownerUid: control.ownerUid,
    holderUid: control.holderUid,
    hostShipId: docking.shipId,
    expectedControlRevision,
  };
}

function malformedReply(): never {
  throw new Error('The shuttle cargo response was malformed.');
}

const UNCERTAIN_TRANSPORT_CODES = new Set([
  'cancelled', 'deadline-exceeded', 'internal', 'unknown', 'unavailable',
]);
const CONFIRMED_REJECTION_CODES = new Set([
  'aborted', 'already-exists', 'failed-precondition', 'invalid-argument', 'not-found',
  'out-of-range', 'permission-denied', 'resource-exhausted', 'unauthenticated', 'unimplemented',
]);

function callableCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause) ||
      typeof cause.code !== 'string') return undefined;
  return cause.code.replace(/^functions\//, '');
}

function isUncertainTransportOutcome(cause: unknown): boolean {
  if (!record(cause)) return false;
  const raw = cause;
  const code = callableCode(cause);
  if (!code || !UNCERTAIN_TRANSPORT_CODES.has(code)) return false;

  // Server-declared errors are confirmed rejections, even if their transport
  // wrapper uses a code that can also describe a dropped response.
  if (raw.kind !== undefined) return false;
  if (raw.details !== undefined) return false;
  if (typeof raw.customData !== 'object' || raw.customData === null) {
    return true;
  }
  return (raw.customData as Record<string, unknown>).serverResponse === undefined;
}

function isConfirmedServerRejection(cause: unknown): boolean {
  const code = callableCode(cause);
  if (code !== undefined && CONFIRMED_REJECTION_CODES.has(code)) return true;
  if (!code || !UNCERTAIN_TRANSPORT_CODES.has(code) || typeof cause !== 'object' || cause === null) {
    return false;
  }
  if ('kind' in cause && cause.kind !== undefined) return true;
  if ('details' in cause && cause.details !== undefined) return true;
  return 'customData' in cause && typeof cause.customData === 'object' && cause.customData !== null &&
    (cause.customData as Record<string, unknown>).serverResponse !== undefined;
}

function validAttempt(attempt: ShuttleCargoTransferAttempt): boolean {
  if (!record(attempt) || !record(attempt.command) || !record(attempt.authority)) return false;
  const { command, authority } = attempt;
  return typeof command.sessionId === 'string' && /^[\w-]{1,128}$/.test(command.sessionId) &&
    typeof command.requestId === 'string' && /^[\w-]{1,128}$/.test(command.requestId) &&
    typeof command.shuttleId === 'string' && /^[\w-]{1,128}$/.test(command.shuttleId) &&
    typeof command.resourceId === 'string' && RESOURCE_DEFINITIONS.some((resource) => resource.id === command.resourceId) &&
    (command.direction === 'load' || command.direction === 'unload') &&
    Number.isSafeInteger(command.amount) && command.amount > 0 &&
    Number.isSafeInteger(command.expectedControlRevision) && command.expectedControlRevision >= 0 &&
    typeof authority.sessionId === 'string' && authority.sessionId === command.sessionId &&
    typeof authority.uid === 'string' && authority.uid.length > 0 && authority.role === 'player' &&
    authority.replacementStatus == null &&
    typeof authority.fleetGroupId === 'string' && authority.fleetGroupId.trim().length > 0 &&
    typeof authority.ownerRoleId === 'string' && typeof authority.ownerUid === 'string' &&
    authority.holderUid === authority.uid && typeof authority.hostShipId === 'string' &&
    authority.shuttleId === command.shuttleId &&
    command.expectedControlRevision === authority.expectedControlRevision;
}

function parseReply(
  value: unknown,
  attempt: ShuttleCargoTransferAttempt,
): ShuttleCargoTransferResult {
  const { command, authority } = attempt;
  if (!record(value)) return malformedReply();
  const result = value;
  if (result.status === 'stale') {
    const keys = [
      'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId', 'resourceId',
      'direction', 'amount', 'expectedControlRevision', 'currentControlRevision',
    ];
    if (!exactKeys(result, keys) || result.sessionId !== command.sessionId ||
        result.requestId !== command.requestId || result.shuttleId !== command.shuttleId ||
        result.hostShipId !== authority.hostShipId || result.resourceId !== command.resourceId ||
        result.direction !== command.direction || result.amount !== command.amount ||
        result.expectedControlRevision !== command.expectedControlRevision ||
        !Number.isSafeInteger(result.currentControlRevision) ||
        (result.currentControlRevision as number) <= command.expectedControlRevision) {
      return malformedReply();
    }
    return {
      status: 'stale',
      hostShipId: result.hostShipId,
      currentControlRevision: result.currentControlRevision as number,
    };
  }

  const committedKeys = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId', 'resourceId',
    'direction', 'amount', 'shipAmount', 'shuttleAmount',
  ];
  if (!exactKeys(result, committedKeys) ||
      result.status !== 'committed' && result.status !== 'replayed' ||
      result.sessionId !== command.sessionId || result.requestId !== command.requestId ||
      result.shuttleId !== command.shuttleId || result.hostShipId !== authority.hostShipId ||
      result.resourceId !== command.resourceId || result.direction !== command.direction ||
      result.amount !== command.amount || !Number.isSafeInteger(result.shipAmount) ||
      (result.shipAmount as number) < 0 || !Number.isSafeInteger(result.shuttleAmount) ||
      (result.shuttleAmount as number) < 0) {
    return malformedReply();
  }
  return { status: result.status };
}

async function sendAttempt(
  attempt: ShuttleCargoTransferAttempt,
): Promise<ShuttleCargoTransferResult> {
  if (!validAttempt(attempt) || !currentAuthorityMatches(attempt.authority)) {
    throw new Error('Refresh the current shuttle holder and session authority before transferring cargo.');
  }
  const { command } = attempt;
  const payload = {
    sessionId: command.sessionId,
    requestId: command.requestId,
    shuttleId: command.shuttleId,
    resourceId: command.resourceId,
    direction: command.direction,
    amount: command.amount,
    expectedControlRevision: command.expectedControlRevision,
  };
  let response: { readonly data: unknown };
  try {
    response = await httpsCallable<typeof payload, unknown>(
      functions(), 'transferShuttleCargoCommand',
    )(payload);
  } catch (cause) {
    if (isUncertainTransportOutcome(cause)) {
      throw new ShuttleCargoTransferUncertainError(attempt);
    }
    if (isConfirmedServerRejection(cause)) {
      throw new ShuttleCargoTransferRejectedError(attempt, cause);
    }
    // A failure without a recognized server rejection does not prove that the
    // callable never committed. Keep the receipt so recovery can replay it.
    throw new ShuttleCargoTransferUncertainError(attempt);
  }
  if (!currentAuthorityMatches(attempt.authority)) {
    throw new ShuttleCargoTransferUncertainError(
      attempt,
      'Shuttle cargo authority changed while the request was pending. Restore the same holder authority before retrying the exact request.',
    );
  }
  try {
    return parseReply(response.data, attempt);
  } catch (cause) {
    // An unreadable reply is not proof that the server rejected the command.
    // Keep the request ID so a retry can read the authoritative receipt.
    const reason = cause instanceof Error ? cause.message : 'The shuttle cargo response was malformed.';
    throw new ShuttleCargoTransferUncertainError(
      attempt,
      `${reason} The server outcome is still unconfirmed. Retry the exact request while the same holder authority remains active.`,
    );
  }
}

export async function transferShuttleCargo(
  shuttleId: string,
  resourceId: ResourceId,
  direction: 'load' | 'unload',
  amount: number,
  expectedControlRevision: number,
): Promise<ShuttleCargoTransferResult> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before transferring shuttle cargo.');
  requireFreshSessionAuthority();
  if (!/^[\w-]{1,128}$/.test(shuttleId) || !/^[\w-]{1,128}$/.test(resourceId) ||
      (direction !== 'load' && direction !== 'unload') ||
      !Number.isSafeInteger(amount) || amount < 1 ||
      !Number.isSafeInteger(expectedControlRevision) || expectedControlRevision < 0) {
    throw new Error('The shuttle cargo selection is invalid. Refresh the console and try again.');
  }
  const attempt = captureAttemptAuthority(shuttleId, expectedControlRevision);
  const command: ShuttleCargoTransferCommand = {
    sessionId: session.id,
    requestId: window.crypto.randomUUID(),
    shuttleId,
    resourceId,
    direction,
    amount,
    expectedControlRevision,
  };
  return sendAttempt({ command, authority: attempt });
}

export function canReplayShuttleCargoTransfer(attempt: ShuttleCargoTransferAttempt): boolean {
  return validAttempt(attempt) && currentAuthorityMatches(attempt.authority);
}

export async function replayShuttleCargoTransfer(
  attempt: ShuttleCargoTransferAttempt,
): Promise<ShuttleCargoTransferResult> {
  requireFreshSessionAuthority();
  if (!validAttempt(attempt)) {
    throw new Error('The saved shuttle cargo request is invalid. Refresh the console before retrying.');
  }
  return sendAttempt(attempt);
}
