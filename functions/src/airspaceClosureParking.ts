import {
  ROLE_OWNED_CRAFT_CATALOG,
  roleOwnedCraftForRoles,
  shuttleDockingsAreParked,
  shuttleDockingsMatchRoleOwnedCraft,
  shuttleHostIsAllowed,
} from './craftOwnership';
import { fleetGroupRecord } from './fleetGroups';
import {
  parseShuttleArrivalVisitLog,
  type ShuttleArrivalVisit,
} from './shuttleArrival';
import {
  resolveWolfAttackShuttleParking,
  type WolfAttackParkingDecision,
  type WolfAttackParkingDocking,
} from './wolfAttackParking';
import { parseShuttleTransit, type ShuttleTransitState } from './shuttleTransit';

const KNOWN_SHUTTLE_IDS = new Set(ROLE_OWNED_CRAFT_CATALOG
  .filter((craft) => craft.kind === 'shuttle')
  .map((craft) => craft.id));

export type AirspaceClosureParkingResult = Readonly<{
  dockings: readonly WolfAttackParkingDocking[];
  visitLog: readonly ShuttleArrivalVisit[];
  decisions: readonly WolfAttackParkingDecision[];
  clearedTransitIds: readonly string[];
}>;

/**
 * Resolve every currently represented shuttle at an ordinary airspace
 * deadline. Transit position, legal-host filtering, and tie selection reuse
 * the already-authoritative Wolf-attack parking policy; this does not declare
 * or stage a Wolf attack.
 */
export function resolveAirspaceClosureShuttleParking(input: Readonly<{
  activeRoleIds: readonly string[];
  activeVesselIds: readonly string[];
  dockings: unknown;
  transits: readonly unknown[];
  fleetGroups: readonly unknown[];
  cycle: number;
  closedAt: string;
  visitLog: unknown;
}>): AirspaceClosureParkingResult {
  const closedAtMs = Date.parse(input.closedAt);
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 1 || !Number.isFinite(closedAtMs) ||
      input.activeRoleIds.length === 0 ||
      input.activeRoleIds.some((roleId) => typeof roleId !== 'string' || roleId.length === 0) ||
      new Set(input.activeRoleIds).size !== input.activeRoleIds.length ||
      input.activeVesselIds.length === 0 ||
      input.activeVesselIds.some((shipId) => typeof shipId !== 'string' || shipId.length === 0) ||
      new Set(input.activeVesselIds).size !== input.activeVesselIds.length) {
    throw new Error('Airspace-close shuttle parking authority is malformed.');
  }

  if (!Array.isArray(input.dockings)) {
    throw new Error('The shuttle docking ledger is unavailable at airspace closure.');
  }
  const dockings = input.dockings.map((value): WolfAttackParkingDocking => {
    if (!isRecord(value) || Object.keys(value).some((key) =>
      !['shuttleId', 'shipId', 'dockedAt'].includes(key)) ||
        typeof value.shuttleId !== 'string' || !KNOWN_SHUTTLE_IDS.has(value.shuttleId) ||
        typeof value.shipId !== 'string' || typeof value.dockedAt !== 'string' ||
        value.dockedAt.trim().length === 0 || !input.activeVesselIds.includes(value.shipId) ||
        !shuttleHostIsAllowed(value.shuttleId, value.shipId)) {
      throw new Error('The shuttle docking ledger is malformed at airspace closure.');
    }
    return { shuttleId: value.shuttleId, shipId: value.shipId, dockedAt: value.dockedAt };
  });

  const transits: ShuttleTransitState[] = input.transits.map((value) => {
    if (!isRecord(value) || typeof value.shuttleId !== 'string' ||
        !/^[\w-]{1,128}$/.test(value.transitRequestId as string ?? '') ||
        !KNOWN_SHUTTLE_IDS.has(value.shuttleId)) {
      throw new Error('Shuttle transit authority is malformed at airspace closure.');
    }
    const parsed = parseShuttleTransit(value, value.shuttleId);
    if (!parsed) throw new Error('Shuttle transit authority is malformed at airspace closure.');
    return parsed;
  });

  const currentShuttleIds = new Set([
    ...dockings.map((docking) => docking.shuttleId),
    ...transits.map((transit) => transit.shuttleId),
  ]);
  const enabledShuttles = roleOwnedCraftForRoles(input.activeRoleIds)
    .filter((craft) => craft.kind === 'shuttle')
    .filter((craft) => craft.enabledMode === 'standard' || currentShuttleIds.has(craft.id));
  const shuttleIds = enabledShuttles.map((craft) => craft.id);
  const activeShuttleIds = new Set(shuttleIds);
  if (shuttleIds.length === 0 || dockings.some((docking) => !activeShuttleIds.has(docking.shuttleId)) ||
      transits.some((transit) => !activeShuttleIds.has(transit.shuttleId))) {
    throw new Error('The airspace-close shuttle roster does not match the active role authority.');
  }

  const fleetGroups = input.fleetGroups.map((value) => {
    const group = fleetGroupRecord(value);
    if (!group || !group.id) {
      throw new Error('Fleet-group authority is malformed at airspace closure.');
    }
    return group;
  });

  let parking: ReturnType<typeof resolveWolfAttackShuttleParking>;
  try {
    parking = resolveWolfAttackShuttleParking({
      shuttleIds,
      activeVesselIds: input.activeVesselIds,
      dockings,
      transits,
      fleetGroups: fleetGroups.map(({ id, vesselIds }) => ({ id, vesselIds })),
      cycle: input.cycle,
      parkedAt: input.closedAt,
    });
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? cause.message
        : 'The shuttle parking route could not be resolved at airspace closure.',
    );
  }

  if (!shuttleDockingsAreParked(parking.dockings, input.activeVesselIds) ||
      !shuttleDockingsMatchRoleOwnedCraft(input.activeRoleIds, parking.dockings)) {
    throw new Error('The resulting shuttle docking ledger is incomplete at airspace closure.');
  }

  const visits = parseShuttleArrivalVisitLog(input.visitLog, dockings, input.activeVesselIds);
  if (!visits || visits.some((visit) => !activeShuttleIds.has(visit.shuttleId))) {
    throw new Error('The shuttle visit history is malformed at airspace closure.');
  }
  const latestVisitByShuttle = new Map<string, ShuttleArrivalVisit>();
  const visitIds = new Set<string>();
  for (const visit of visits) {
    latestVisitByShuttle.set(visit.shuttleId, visit);
    visitIds.add(visit.id);
  }
  const transitsById = new Map(transits.map((transit) => [transit.shuttleId, transit]));
  if ([...latestVisitByShuttle].some(([shuttleId, visit]) =>
    visit.action === 'departed' && !transitsById.has(shuttleId))) {
    throw new Error('A shuttle visit ends in transit without matching server transit authority.');
  }
  for (const [shuttleId, transit] of transitsById) {
    const latestVisit = latestVisitByShuttle.get(shuttleId);
    if (latestVisit?.action === 'departed' ||
        (latestVisit?.action === 'docked' && latestVisit.shipId !== transit.originShipId)) {
      throw new Error('The shuttle visit history does not match its current server transit origin.');
    }
  }

  const nextVisits: ShuttleArrivalVisit[] = [...visits];
  for (const shuttleId of parking.clearedTransitIds) {
    const transit = transitsById.get(shuttleId);
    const docking = parking.dockings.find((entry) => entry.shuttleId === shuttleId);
    if (!transit || !docking) {
      throw new Error('A parked shuttle has no matching transit receipt.');
    }
    const departedId = `airspace-close-${input.cycle}-${transit.transitRequestId}-departed`;
    const dockedId = `airspace-close-${input.cycle}-${transit.transitRequestId}-docked`;
    if (visitIds.has(dockedId)) {
      throw new Error('A shuttle airspace-close docking visit is already present.');
    }
    if (visitIds.has(departedId)) {
      throw new Error('A shuttle airspace-close departure visit is already present.');
    }
    nextVisits.push({
      id: departedId,
      shuttleId,
      shipId: transit.originShipId,
      action: 'departed',
      occurredAt: transit.originDepartedAt,
    });
    nextVisits.push({
      id: dockedId,
      shuttleId,
      shipId: docking.shipId,
      action: 'docked',
      occurredAt: input.closedAt,
    });
  }

  return {
    dockings: parking.dockings,
    visitLog: nextVisits,
    decisions: parking.decisions,
    clearedTransitIds: parking.clearedTransitIds,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
