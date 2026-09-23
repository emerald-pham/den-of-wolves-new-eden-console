import { parseEntityId } from '@/types/identifiers';
import type {
  ShuttleDepartureRequestState,
  ShuttleDocking,
  ShuttleTransitState,
} from '@/types/game';

export type ShuttleMovementConflictCurrent =
  | Readonly<{ status: 'docked'; docking: ShuttleDocking }>
  | Readonly<{
      status: 'requested';
      docking: ShuttleDocking;
      departure: ShuttleDepartureRequestState;
    }>
  | Readonly<{ status: 'in-transit'; transit: ShuttleTransitState }>;

export interface ShuttleMovementConflict {
  readonly type: 'shuttle-movement-conflict';
  readonly sessionId: string;
  readonly shuttleId: string;
  readonly current: ShuttleMovementConflictCurrent;
}

export class ShuttleMovementConflictError extends Error {
  readonly conflict: ShuttleMovementConflict;

  constructor(conflict: ShuttleMovementConflict) {
    super('Shuttle movement changed; the current server location is available.');
    this.name = 'ShuttleMovementConflictError';
    this.conflict = conflict;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function readErrorDetails(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.details)) return value.details;
  if (!isRecord(value.customData) || !isRecord(value.customData.serverResponse)) return null;
  const details = value.customData.serverResponse.details;
  return isRecord(details) ? details : null;
}

function parseDocking(value: unknown, shuttleId: string): ShuttleDocking | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['shuttleId', 'shipId', 'dockedAt']) ||
      value.shuttleId !== shuttleId || typeof value.dockedAt !== 'string' || value.dockedAt.length === 0) return null;
  const parsedShuttleId = parseEntityId('shuttle', value.shuttleId);
  const shipId = parseEntityId('vessel', value.shipId);
  if (!parsedShuttleId || !shipId) return null;
  return { shuttleId: parsedShuttleId, shipId, dockedAt: value.dockedAt };
}

function parseDeparture(value: unknown, shuttleId: string): ShuttleDepartureRequestState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'status', 'requestId', 'shuttleId', 'holderUid', 'fleetGroupId', 'originShipId',
    'destinationShipId', 'cycle', 'controlRevision', 'requestedAt',
  ]) || value.status !== 'requested' || value.shuttleId !== shuttleId ||
      typeof value.requestId !== 'string' || value.requestId.length === 0 ||
      !parseEntityId('player', value.holderUid) || !parseEntityId('group', value.fleetGroupId) ||
      !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
      !Number.isSafeInteger(value.controlRevision) || (value.controlRevision as number) < 0 ||
      typeof value.requestedAt !== 'string' || !Number.isFinite(Date.parse(value.requestedAt))) return null;
  const parsedShuttleId = parseEntityId('shuttle', value.shuttleId);
  const originShipId = parseEntityId('vessel', value.originShipId);
  const destinationShipId = parseEntityId('vessel', value.destinationShipId);
  const holderUid = parseEntityId('player', value.holderUid);
  const fleetGroupId = parseEntityId('group', value.fleetGroupId);
  if (!parsedShuttleId || !originShipId || !destinationShipId || !holderUid || !fleetGroupId) return null;
  return {
    status: 'requested', requestId: value.requestId, shuttleId: parsedShuttleId,
    holderUid, fleetGroupId,
    originShipId, destinationShipId, cycle: value.cycle as number,
    controlRevision: value.controlRevision as number, requestedAt: value.requestedAt,
  };
}

function parseTransit(value: unknown, shuttleId: string): ShuttleTransitState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'status', 'requestId', 'transitRequestId', 'shuttleId', 'holderUid', 'fleetGroupId',
    'destinationShipId', 'cycle', 'controlRevision', 'requestedAt', 'revision',
    'currentPosition', 'destinationPosition', 'velocity', 'departedAt', 'arrivesAt',
  ]) || value.status !== 'in-transit' || value.shuttleId !== shuttleId ||
      typeof value.requestId !== 'string' || value.requestId.length === 0 ||
      typeof value.transitRequestId !== 'string' || value.transitRequestId.length === 0 ||
      !parseEntityId('player', value.holderUid) || !parseEntityId('group', value.fleetGroupId) ||
      !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
      !Number.isSafeInteger(value.controlRevision) || (value.controlRevision as number) < 0 ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
      typeof value.requestedAt !== 'string' || !Number.isFinite(Date.parse(value.requestedAt)) ||
      typeof value.departedAt !== 'string' || !Number.isFinite(Date.parse(value.departedAt)) ||
      typeof value.arrivesAt !== 'string' || !Number.isFinite(Date.parse(value.arrivesAt)) ||
      Date.parse(value.arrivesAt) - Date.parse(value.departedAt) !== 60_000 ||
      Date.parse(value.requestedAt) > Date.parse(value.departedAt)) return null;
  const point = (candidate: unknown): { x: number; y: number; z: number } | null => {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ['x', 'y', 'z']) ||
        ![candidate.x, candidate.y, candidate.z].every((part) => typeof part === 'number' && Number.isFinite(part))) {
      return null;
    }
    return { x: candidate.x as number, y: candidate.y as number, z: candidate.z as number };
  };
  const parsedShuttleId = parseEntityId('shuttle', value.shuttleId);
  const destinationShipId = parseEntityId('vessel', value.destinationShipId);
  const holderUid = parseEntityId('player', value.holderUid);
  const fleetGroupId = parseEntityId('group', value.fleetGroupId);
  const currentPosition = point(value.currentPosition);
  const destinationPosition = point(value.destinationPosition);
  const velocity = point(value.velocity);
  if (!parsedShuttleId || !destinationShipId || !holderUid || !fleetGroupId ||
      !currentPosition || !destinationPosition || !velocity) return null;
  return {
    status: 'in-transit', requestId: value.requestId, transitRequestId: value.transitRequestId,
    shuttleId: parsedShuttleId, holderUid, fleetGroupId,
    destinationShipId, cycle: value.cycle as number, controlRevision: value.controlRevision as number,
    requestedAt: value.requestedAt, revision: value.revision as number, currentPosition,
    destinationPosition, velocity, departedAt: value.departedAt, arrivesAt: value.arrivesAt,
  };
}

/** Parse only an explicit conflict carrying current entitled state; unknown details remain ordinary errors. */
export function parseShuttleMovementConflict(
  value: unknown,
  expectedSessionId: string,
  expectedShuttleId: string,
): ShuttleMovementConflict | null {
  const details = readErrorDetails(value);
  if (!details || details.commandError !== 'conflict' || !isRecord(details.movementConflict)) return null;
  const conflict = details.movementConflict;
  if (!hasOnlyKeys(conflict, ['type', 'sessionId', 'shuttleId', 'current']) ||
      conflict.type !== 'shuttle-movement-conflict' || conflict.sessionId !== expectedSessionId ||
      conflict.shuttleId !== expectedShuttleId || !isRecord(conflict.current)) return null;
  const current = conflict.current;
  let parsedCurrent: ShuttleMovementConflictCurrent | null = null;
  if (current.status === 'docked' && hasOnlyKeys(current, ['status', 'docking'])) {
    const docking = parseDocking(current.docking, expectedShuttleId);
    if (docking) parsedCurrent = { status: 'docked', docking };
  } else if (current.status === 'requested' && hasOnlyKeys(current, ['status', 'docking', 'departure'])) {
    const docking = parseDocking(current.docking, expectedShuttleId);
    const departure = parseDeparture(current.departure, expectedShuttleId);
    if (docking && departure && docking.shipId === departure.originShipId) {
      parsedCurrent = { status: 'requested', docking, departure };
    }
  } else if (current.status === 'in-transit' && hasOnlyKeys(current, ['status', 'transit'])) {
    const transit = parseTransit(current.transit, expectedShuttleId);
    if (transit) parsedCurrent = { status: 'in-transit', transit };
  }
  if (!parsedCurrent) return null;
  return {
    type: 'shuttle-movement-conflict',
    sessionId: expectedSessionId,
    shuttleId: expectedShuttleId,
    current: parsedCurrent,
  };
}

export function shuttleMovementConflictError(cause: unknown, sessionId: string, shuttleId: string): Error | null {
  const conflict = parseShuttleMovementConflict(cause, sessionId, shuttleId);
  return conflict ? new ShuttleMovementConflictError(conflict) : null;
}
