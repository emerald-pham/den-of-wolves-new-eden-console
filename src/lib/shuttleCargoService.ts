import { httpsCallable } from 'firebase/functions';
import type { ResourceId } from '@/data/resources';
import { dockingForShuttle } from '@/data/shuttles';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { hasFreshSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';

export interface ShuttleCargoStaleResult {
  readonly status: 'stale';
  readonly hostShipId: string;
  readonly currentControlRevision: number;
}

export type ShuttleCargoTransferResult =
  | Readonly<{ status: 'committed' | 'replayed' }>
  | ShuttleCargoStaleResult;

interface CargoAttemptAuthority {
  readonly sessionId: string;
  readonly uid: string;
  readonly role: string;
  readonly assignedRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly replacementRoleId: string | null | undefined;
  readonly seatId: string | null | undefined;
  readonly shuttleId: string;
  readonly ownerRoleId: string;
  readonly ownerUid: string;
  readonly holderUid: string;
  readonly hostShipId: string;
  readonly expectedControlRevision: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function currentAuthorityMatches(attempt: CargoAttemptAuthority): boolean {
  const current = useSessionStore.getState();
  const session = current.session;
  const me = current.me;
  const control = session?.shuttleControl?.[attempt.shuttleId];
  const docking = session ? dockingForShuttle(session, attempt.shuttleId) : undefined;
  return hasFreshSessionAuthority() && session?.id === attempt.sessionId &&
    me?.sessionId === attempt.sessionId && me.uid === attempt.uid &&
    me.role === attempt.role && me.assignedRoleId === attempt.assignedRoleId &&
    me.activeConsoleRoleId === attempt.activeConsoleRoleId &&
    me.replacementRoleId === attempt.replacementRoleId && me.seatId === attempt.seatId &&
    control?.shuttleId === attempt.shuttleId && control.ownerRoleId === attempt.ownerRoleId &&
    control.ownerUid === attempt.ownerUid && control.holderUid === attempt.uid &&
    Number.isSafeInteger(control.revision) && control.revision >= attempt.expectedControlRevision &&
    docking?.shipId === attempt.hostShipId;
}

function captureAttemptAuthority(
  shuttleId: string,
  expectedControlRevision: number,
): CargoAttemptAuthority {
  const { session, me } = useSessionStore.getState();
  if (!session || !me || me.role !== 'player' || me.sessionId !== session.id || !me.uid) {
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
    seatId: me.seatId,
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
  const requestId = window.crypto.randomUUID();
  const payload = {
    sessionId: session.id,
    requestId,
    shuttleId,
    resourceId,
    direction,
    amount,
    expectedControlRevision,
  };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'transferShuttleCargoCommand',
  )(payload);
  if (!currentAuthorityMatches(attempt)) {
    throw new Error('Shuttle cargo authority changed while the request was pending.');
  }
  if (!record(response.data)) return malformedReply();
  const result = response.data;
  if (result.status === 'stale') {
    const keys = [
      'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId', 'resourceId',
      'direction', 'amount', 'expectedControlRevision', 'currentControlRevision',
    ];
    if (!exactKeys(result, keys) || result.sessionId !== attempt.sessionId ||
        result.requestId !== requestId || result.shuttleId !== shuttleId ||
        result.hostShipId !== attempt.hostShipId || result.resourceId !== resourceId ||
        result.direction !== direction || result.amount !== amount ||
        result.expectedControlRevision !== expectedControlRevision ||
        !Number.isSafeInteger(result.currentControlRevision) ||
        (result.currentControlRevision as number) <= expectedControlRevision) {
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
      result.sessionId !== attempt.sessionId || result.requestId !== requestId ||
      result.shuttleId !== shuttleId || result.hostShipId !== attempt.hostShipId ||
      result.resourceId !== resourceId || result.direction !== direction || result.amount !== amount ||
      !Number.isSafeInteger(result.shipAmount) || (result.shipAmount as number) < 0 ||
      !Number.isSafeInteger(result.shuttleAmount) || (result.shuttleAmount as number) < 0) {
    return malformedReply();
  }
  return { status: result.status };
}
