import { shuttleHostIsAllowed } from './craftOwnership';
import { parseShuttleDepartures, type ShuttleDepartureRequestState } from './shuttleDeparture';
import {
  parseShuttleTransitPublic,
  type ShuttleTransitPublicState,
} from './shuttleTransit';

export interface ShuttleMovementConflictDocking {
  readonly shuttleId: string;
  readonly shipId: string;
  readonly dockedAt: string;
}

export type ShuttleMovementConflictCurrent =
  | Readonly<{ status: 'docked'; docking: ShuttleMovementConflictDocking }>
  | Readonly<{
      status: 'requested';
      docking: ShuttleMovementConflictDocking;
      departure: ShuttleDepartureRequestState;
    }>
  | Readonly<{ status: 'in-transit'; transit: ShuttleTransitPublicState }>;

export interface ShuttleMovementConflictResult {
  readonly type: 'shuttle-movement-conflict';
  readonly sessionId: string;
  readonly shuttleId: string;
  readonly current: ShuttleMovementConflictCurrent;
}

function safeDocking(value: unknown, shuttleId: string): ShuttleMovementConflictDocking | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const docking = value as Record<string, unknown>;
  if (Object.keys(docking).some((key) => !['shuttleId', 'shipId', 'dockedAt'].includes(key)) ||
      docking.shuttleId !== shuttleId || typeof docking.shipId !== 'string' ||
      !shuttleHostIsAllowed(shuttleId, docking.shipId) || typeof docking.dockedAt !== 'string' ||
      docking.dockedAt.length === 0) return null;
  return { shuttleId, shipId: docking.shipId, dockedAt: docking.dockedAt };
}

/** Build only a validated member-safe current location; malformed state stays a generic conflict. */
export function shuttleMovementConflictResult(input: Readonly<{
  sessionId: string;
  shuttleId: string;
  docking?: unknown;
  departure?: unknown;
  transit?: unknown;
}>): ShuttleMovementConflictResult | null {
  if (!/^[\w-]{1,128}$/.test(input.sessionId) ||
      !/^[\w-]{1,128}$/.test(input.shuttleId)) return null;

  if (input.transit !== undefined) {
    if (input.docking !== undefined || input.departure !== undefined) return null;
    const transit = parseShuttleTransitPublic(input.transit, input.shuttleId);
    if (!transit || !shuttleHostIsAllowed(input.shuttleId, transit.destinationShipId)) return null;
    return {
      type: 'shuttle-movement-conflict',
      sessionId: input.sessionId,
      shuttleId: input.shuttleId,
      current: { status: 'in-transit', transit },
    };
  }

  const docking = safeDocking(input.docking, input.shuttleId);
  if (!docking) return null;
  if (input.departure === undefined) {
    return {
      type: 'shuttle-movement-conflict',
      sessionId: input.sessionId,
      shuttleId: input.shuttleId,
      current: { status: 'docked', docking },
    };
  }

  const departures = parseShuttleDepartures({ [input.shuttleId]: input.departure });
  const departure = departures?.[input.shuttleId];
  if (!departure || departure.originShipId !== docking.shipId ||
      !shuttleHostIsAllowed(input.shuttleId, departure.destinationShipId)) return null;
  return {
    type: 'shuttle-movement-conflict',
    sessionId: input.sessionId,
    shuttleId: input.shuttleId,
    current: { status: 'requested', docking, departure },
  };
}

export function shuttleMovementConflictDetails(
  result: ShuttleMovementConflictResult,
): Readonly<{ commandError: 'conflict'; movementConflict: ShuttleMovementConflictResult }> {
  return { commandError: 'conflict', movementConflict: result };
}
