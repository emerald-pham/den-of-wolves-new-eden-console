import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import {
  isScoutEntitlementHolder,
  isScoutingRequestPhaseAvailable,
  scoutEntitlementDefinition,
  type ScoutEntitlementId,
  type ScoutRequestSource,
} from './scoutRequestAuthority';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';

export interface ScoutRequestReply {
  readonly status: 'requested' | 'replayed';
  readonly resolution: 'pending';
  readonly requestId: string;
  readonly sessionId: string;
  readonly cycle: number;
  readonly entitlementId: ScoutEntitlementId;
  readonly source: ScoutRequestSource;
  readonly ownerRoleId: string;
  readonly anchorShipId: string;
  readonly targetCoordinate: string;
}

export interface ScoutRequestCommand {
  readonly entitlementId: ScoutEntitlementId;
  readonly targetCoordinate: string;
  /** Keep the same id and payload when retrying an unconfirmed call. */
  readonly requestId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => keys.includes(key));
}

function parseScoutRequestReply(
  value: unknown,
  expected: ScoutRequestCommand & { readonly sessionId: string; readonly cycle: number },
): ScoutRequestReply | null {
  const fields = [
    'status', 'resolution', 'requestId', 'sessionId', 'cycle', 'entitlementId', 'source',
    'ownerRoleId', 'anchorShipId', 'targetCoordinate',
  ];
  if (!isRecord(value) || !hasExactKeys(value, fields) ||
      (value.status !== 'requested' && value.status !== 'replayed') || value.resolution !== 'pending' ||
      value.requestId !== expected.requestId || value.sessionId !== expected.sessionId ||
      value.cycle !== expected.cycle || value.entitlementId !== expected.entitlementId ||
      value.targetCoordinate !== expected.targetCoordinate) return null;

  const entitlement = scoutEntitlementDefinition(expected.entitlementId);
  if (!entitlement || value.source !== entitlement.source ||
      value.ownerRoleId !== entitlement.ownerRoleId || value.anchorShipId !== entitlement.anchorShipId) {
    return null;
  }
  return {
    status: value.status,
    resolution: 'pending',
    requestId: expected.requestId,
    sessionId: expected.sessionId,
    cycle: expected.cycle,
    entitlementId: expected.entitlementId,
    source: entitlement.source,
    ownerRoleId: entitlement.ownerRoleId,
    anchorShipId: entitlement.anchorShipId,
    targetCoordinate: expected.targetCoordinate,
  };
}

export async function requestScout(command: ScoutRequestCommand): Promise<ScoutRequestReply> {
  const entitlement = scoutEntitlementDefinition(command.entitlementId);
  if (!entitlement || !isScoutEntitlementHolder(
    command.entitlementId, useSessionStore.getState().session, useSessionStore.getState().me,
  )) throw new Error('The current player does not hold this printed scouting identity.');
  if (!/^\d{4}$/.test(command.targetCoordinate)) {
    throw new Error('Enter a printed four-digit system coordinate.');
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(command.requestId)) {
    throw new Error('This scouting request has an invalid retry identity.');
  }

  const { session, me } = useSessionStore.getState();
  if (!session || !me?.uid || me.sessionId !== session.id) {
    throw new Error('Reconnect before recording a scouting request.');
  }
  requireFreshSessionAuthority();
  if (!isScoutingRequestPhaseAvailable(session)) {
    throw new Error('Scouting requests are available during an active Coordination phase.');
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before recording a scouting request.');

  const payload = {
    sessionId: session.id,
    requestId: command.requestId,
    entitlementId: command.entitlementId,
    targetCoordinate: command.targetCoordinate,
  };
  const response = await httpsCallable<typeof payload, unknown>(functions(), 'requestScout')(payload);
  const current = useSessionStore.getState();
  if (!isCurrentSessionAuthority(checkpoint) ||
      !isScoutEntitlementHolder(command.entitlementId, current.session, current.me)) {
    throw new Error('Scouting authority changed. Reconnect and refresh the console.');
  }

  const reply = parseScoutRequestReply(response.data, {
    ...command, sessionId: session.id, cycle: session.currentTurn!,
  });
  if (!reply) throw new Error('The server returned an invalid scouting request receipt.');
  return reply;
}
