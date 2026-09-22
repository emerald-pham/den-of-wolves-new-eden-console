import {
  ROLE_OWNED_CRAFT_CATALOG,
  shuttleDockingsAreParked,
  shuttleDockingsMatchActiveRoleOwnedSubset,
  shuttleHostIsAllowed,
} from './craftOwnership';
import type { FleetGroupRecord } from './fleetGroups';
import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import { fleetWorldPositionForShip, parseShuttleTransit, shuttlePositionAt, type ShuttleTransitState } from './shuttleTransit';

export interface ShuttleArrivalVisit {
  readonly id: string;
  readonly shuttleId: string;
  readonly shipId: string;
  readonly action: 'docked' | 'departed';
  readonly occurredAt: string;
}

export interface ShuttleArrivalResult {
  readonly shuttleId: string;
  readonly hostShipId: string;
  readonly arrivedAt: string;
  readonly transitRequestId: string;
  readonly transitRevision: number;
}

const SHUTTLE_IDS = new Set(ROLE_OWNED_CRAFT_CATALOG
  .filter((craft) => craft.kind === 'shuttle')
  .map((craft) => craft.id));

function pointMatches(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function initialVisitsForDockings(
  dockings: readonly AuthoritativeShuttleDocking[],
): readonly ShuttleArrivalVisit[] {
  return dockings.map((docking) => ({
    id: docking.shuttleId === 'snn-press-shuttle'
      ? `snn-initial-${docking.shipId}-docking`
      : `${docking.shuttleId}-initial-${docking.shipId}-docking`,
    shuttleId: docking.shuttleId,
    shipId: docking.shipId,
    action: 'docked',
    occurredAt: 'SESSION START',
  }));
}

/** Parse the persisted public visit history without repairing malformed rows. */
export function parseShuttleArrivalVisitLog(
  value: unknown,
  dockings: readonly AuthoritativeShuttleDocking[],
  activeVesselIds: readonly string[],
): readonly ShuttleArrivalVisit[] | null {
  if (value === undefined) return initialVisitsForDockings(dockings);
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  const visits: ShuttleArrivalVisit[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
    const visit = entry as Record<string, unknown>;
    if (Object.keys(visit).some((key) =>
      !['id', 'shuttleId', 'shipId', 'action', 'occurredAt'].includes(key)) ||
        typeof visit.id !== 'string' || visit.id.length === 0 || ids.has(visit.id) ||
        typeof visit.shuttleId !== 'string' || !SHUTTLE_IDS.has(visit.shuttleId) ||
        typeof visit.shipId !== 'string' || !activeVesselIds.includes(visit.shipId) ||
        (visit.action !== 'docked' && visit.action !== 'departed') ||
        typeof visit.occurredAt !== 'string' || visit.occurredAt.trim().length === 0) return null;
    ids.add(visit.id);
    visits.push({
      id: visit.id,
      shuttleId: visit.shuttleId,
      shipId: visit.shipId,
      action: visit.action,
      occurredAt: visit.occurredAt,
    });
  }
  return visits;
}

/** Apply one server-authorized transit completion to public docking/history state. */
export function completeShuttleArrival(input: Readonly<{
  actorUid: string;
  expectedTransitRequestId: string;
  expectedControlRevision: number;
  currentCycle: number;
  transit: ShuttleTransitState;
  control: ShuttleControlEntry;
  group: FleetGroupRecord;
  activeRoleIds: readonly string[];
  activeVesselIds: readonly string[];
  dockings: readonly AuthoritativeShuttleDocking[];
  visitLog: readonly ShuttleArrivalVisit[];
  now: number;
}>): Readonly<{
  dockings: readonly AuthoritativeShuttleDocking[];
  visitLog: readonly ShuttleArrivalVisit[];
  result: ShuttleArrivalResult;
}> {
  const transit = parseShuttleTransit(input.transit, input.transit.shuttleId);
  const craft = ROLE_OWNED_CRAFT_CATALOG.find((entry) => entry.id === input.transit.shuttleId && entry.kind === 'shuttle');
  if (!transit || !craft || !/^[\w-]{1,128}$/.test(input.expectedTransitRequestId) ||
      input.expectedTransitRequestId !== transit.transitRequestId ||
      input.actorUid !== transit.holderUid || input.control.holderUid !== input.actorUid ||
      input.control.shuttleId !== transit.shuttleId ||
      input.expectedControlRevision !== transit.controlRevision ||
      input.control.revision !== input.expectedControlRevision ||
      !Number.isSafeInteger(input.currentCycle) || input.currentCycle !== transit.cycle ||
      !Number.isSafeInteger(input.now) || input.now < 0) {
    throw new Error('The shuttle arrival authority changed; refresh before completing arrival.');
  }
  if (craft.ownerRoleId !== input.control.ownerRoleId ||
      (craft.ownerRoleId !== 'press-officer' && !input.activeRoleIds.includes(craft.ownerRoleId))) {
    throw new Error('The shuttle is no longer part of the active role roster.');
  }
  if (input.group.id !== transit.fleetGroupId ||
      !input.group.memberUids.includes(input.actorUid) ||
      !input.group.vesselIds.includes(transit.originShipId) ||
      !input.group.vesselIds.includes(transit.destinationShipId) ||
      !input.activeVesselIds.includes(transit.originShipId) ||
      !input.activeVesselIds.includes(transit.destinationShipId) ||
      transit.originShipId === transit.destinationShipId ||
      !shuttleHostIsAllowed(transit.shuttleId, transit.destinationShipId)) {
    throw new Error('The shuttle route is no longer valid for its current fleet group.');
  }
  const expectedOrigin = fleetWorldPositionForShip(transit.originShipId);
  const expectedDestination = fleetWorldPositionForShip(transit.destinationShipId);
  if (!expectedOrigin || !expectedDestination ||
      !pointMatches(transit.originPosition, expectedOrigin) ||
      !pointMatches(transit.destinationPosition, expectedDestination)) {
    throw new Error('The authoritative shuttle world position is unavailable.');
  }
  if (input.now < Date.parse(transit.arrivesAt) ||
      !pointMatches(shuttlePositionAt(transit, input.now), expectedDestination)) {
    throw new Error('The shuttle has not reached its destination yet.');
  }
  if (!shuttleDockingsAreParked(input.dockings, input.activeVesselIds) ||
      !shuttleDockingsMatchActiveRoleOwnedSubset(input.activeRoleIds, input.dockings) ||
      input.dockings.some((docking) => docking.shuttleId === transit.shuttleId)) {
    throw new Error('The shuttle docking ledger is not ready for arrival.');
  }
  const dockings = [...input.dockings, {
    shuttleId: transit.shuttleId,
    shipId: transit.destinationShipId,
    dockedAt: new Date(input.now).toISOString(),
  }];
  if (!shuttleDockingsAreParked(dockings, input.activeVesselIds) ||
      !shuttleDockingsMatchActiveRoleOwnedSubset(input.activeRoleIds, dockings)) {
    throw new Error('The destination host is not a legal shuttle dock.');
  }
  const departedId = `shuttle-arrival-${transit.transitRequestId}-departed`;
  const dockedId = `shuttle-arrival-${transit.transitRequestId}-docked`;
  if (input.visitLog.some((visit) => visit.id === departedId || visit.id === dockedId)) {
    throw new Error('The shuttle arrival visit is already present without its command receipt.');
  }
  const arrivedAt = new Date(input.now).toISOString();
  const visitLog = [
    ...input.visitLog,
    {
      id: departedId,
      shuttleId: transit.shuttleId,
      shipId: transit.originShipId,
      action: 'departed' as const,
      occurredAt: transit.originDepartedAt,
    },
    {
      id: dockedId,
      shuttleId: transit.shuttleId,
      shipId: transit.destinationShipId,
      action: 'docked' as const,
      occurredAt: arrivedAt,
    },
  ];
  return {
    dockings,
    visitLog,
    result: {
      shuttleId: transit.shuttleId,
      hostShipId: transit.destinationShipId,
      arrivedAt,
      transitRequestId: transit.transitRequestId,
      transitRevision: transit.revision,
    },
  };
}
