import { shuttleHostIsAllowed } from './craftOwnership';
import type { FleetGroupRecord } from './fleetGroups';
import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import type { TurnPhase } from './turnZero';

export interface ShuttleDepartureRequestState {
  readonly status: 'requested';
  readonly requestId: string;
  readonly shuttleId: string;
  readonly holderUid: string;
  readonly fleetGroupId: string;
  readonly originShipId: string;
  readonly destinationShipId: string;
  readonly cycle: number;
  readonly controlRevision: number;
  readonly requestedAt: string;
}

/** AEGIS may open restricted airspace for the SNN Press shuttle only. */
export function shuttleMovementWindowOpen(
  shuttleId: string,
  phase: TurnPhase,
  now: number,
): boolean {
  if (phase.timerPause || now >= Date.parse(phase.openAirspaceEndsAt)) return false;
  if (phase.airspace.state === 'lifted') return true;
  return shuttleId === 'snn-press-shuttle' && phase.airspace.pressAccess;
}

export function parseShuttleDepartures(
  value: unknown,
): Readonly<Record<string, ShuttleDepartureRequestState>> | null {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const result: Record<string, ShuttleDepartureRequestState> = {};
  for (const [shuttleId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).some((key) => ![
      'status', 'requestId', 'shuttleId', 'holderUid', 'fleetGroupId', 'originShipId',
      'destinationShipId', 'cycle', 'controlRevision', 'requestedAt',
    ].includes(key)) || entry.status !== 'requested' || entry.shuttleId !== shuttleId ||
        typeof entry.requestId !== 'string' || entry.requestId.length === 0 ||
        typeof entry.holderUid !== 'string' || entry.holderUid.length === 0 ||
        typeof entry.fleetGroupId !== 'string' || entry.fleetGroupId.length === 0 ||
        typeof entry.originShipId !== 'string' || entry.originShipId.length === 0 ||
        typeof entry.destinationShipId !== 'string' || entry.destinationShipId.length === 0 ||
        !Number.isSafeInteger(entry.cycle) || (entry.cycle as number) < 1 ||
        !Number.isSafeInteger(entry.controlRevision) || (entry.controlRevision as number) < 0 ||
        typeof entry.requestedAt !== 'string' || !Number.isFinite(Date.parse(entry.requestedAt))) return null;
    result[shuttleId] = entry as unknown as ShuttleDepartureRequestState;
  }
  return result;
}

/** Approve a request without removing the shuttle from its current dock. */
export function authorizeShuttleDeparture(input: Readonly<{
  requestId: string;
  shuttleId: string;
  actorUid: string;
  destinationShipId: string;
  expectedControlRevision: number;
  expectedCycle: number;
  control: ShuttleControlEntry;
  dockings: readonly AuthoritativeShuttleDocking[];
  group: FleetGroupRecord;
  phase: TurnPhase;
  existing?: ShuttleDepartureRequestState;
  requestedAt: string;
  now: number;
}>): ShuttleDepartureRequestState {
  if (input.control.shuttleId !== input.shuttleId ||
      input.control.holderUid !== input.actorUid) {
    throw new Error('Only the current shuttle holder may request departure.');
  }
  if (input.control.revision !== input.expectedControlRevision) {
    throw new Error('Shuttle control changed; refresh before requesting departure.');
  }
  if (input.existing) throw new Error('This shuttle already has a pending departure request.');
  if (input.phase.turn !== input.expectedCycle ||
      !shuttleMovementWindowOpen(input.shuttleId, input.phase, input.now)) {
    throw new Error('Shuttle departure is available only while airspace is open.');
  }
  if (!input.group.memberUids.includes(input.actorUid)) {
    throw new Error('The shuttle holder is not a member of the authoritative fleet group.');
  }
  const current = input.dockings.filter((docking) => docking.shuttleId === input.shuttleId);
  if (current.length !== 1 || !input.group.vesselIds.includes(current[0]!.shipId)) {
    throw new Error('The shuttle has no legal local origin dock.');
  }
  if (input.destinationShipId === current[0]!.shipId ||
      !input.group.vesselIds.includes(input.destinationShipId)) {
    throw new Error('Choose a different ship in the holder’s current fleet group.');
  }
  if (!shuttleHostIsAllowed(input.shuttleId, input.destinationShipId)) {
    throw new Error('That shuttle cannot dock at the requested destination.');
  }
  if (!Number.isFinite(Date.parse(input.requestedAt))) {
    throw new Error('The server departure time is unavailable.');
  }
  return {
    status: 'requested',
    requestId: input.requestId,
    shuttleId: input.shuttleId,
    holderUid: input.actorUid,
    fleetGroupId: input.group.id,
    originShipId: current[0]!.shipId,
    destinationShipId: input.destinationShipId,
    cycle: input.expectedCycle,
    controlRevision: input.expectedControlRevision,
    requestedAt: input.requestedAt,
  };
}
