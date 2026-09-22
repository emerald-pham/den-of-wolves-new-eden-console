import { ROLE_OWNED_CRAFT_CATALOG, shuttleHostIsAllowed } from './craftOwnership';
import {
  fleetWorldPositionForShip,
  SHUTTLE_TRANSIT_DURATION_MS,
  shuttlePositionAt,
  type ShuttleTransitState,
  type ShuttleWorldPoint,
} from './shuttleTransit';

/**
 * Product policy for equally near Wolf-attack parking hosts. This mirrors the
 * canonical vessel presentation order and must not depend on request order.
 */
export const WOLF_ATTACK_HOST_TIE_ORDER = Object.freeze([
  'aegis',
  'dione',
  'icebreaker',
  'capybara',
  'shepherd',
  'quellon',
  'refinery-124',
] as const);

export type WolfAttackHostId = (typeof WOLF_ATTACK_HOST_TIE_ORDER)[number];

export interface WolfAttackParkingHostCandidate {
  readonly shipId: string;
  readonly position: ShuttleWorldPoint;
}

export interface WolfAttackParkingSelection {
  readonly shipId: WolfAttackHostId;
  readonly position: ShuttleWorldPoint;
  readonly distanceSquared: number;
  /** Canonically ordered hosts equal within floating-point precision. */
  readonly tiedHostIds: readonly WolfAttackHostId[];
}

const hostRank = new Map<string, number>(
  WOLF_ATTACK_HOST_TIE_ORDER.map((shipId, index) => [shipId, index]),
);

function isKnownHostId(value: string): value is WolfAttackHostId {
  return hostRank.has(value);
}

function isWorldPoint(value: unknown): value is ShuttleWorldPoint {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return Object.keys(point).length === 3 &&
    ['x', 'y', 'z'].every((axis) => typeof point[axis] === 'number' && Number.isFinite(point[axis]));
}

function squaredDistance(left: ShuttleWorldPoint, right: ShuttleWorldPoint): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2;
}

function distancesAreEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 16;
}

function pointsAreEqual(left: ShuttleWorldPoint, right: ShuttleWorldPoint): boolean {
  return distancesAreEqual(left.x, right.x) &&
    distancesAreEqual(left.y, right.y) && distancesAreEqual(left.z, right.z);
}

/**
 * Select the nearest ship from an already authorized set of legal, active
 * candidates. Unknown positions or identities fail closed before a choice can
 * be persisted. Mathematically equal distances use the recorded product order
 * even when decimal route interpolation differs by machine precision.
 */
export function nearestWolfAttackHost(
  craftPosition: ShuttleWorldPoint,
  candidates: readonly WolfAttackParkingHostCandidate[],
): WolfAttackParkingSelection {
  if (!isWorldPoint(craftPosition)) throw new Error('Craft has an invalid authoritative position.');
  if (candidates.length === 0) throw new Error('Craft has no legal active parking host.');

  const seen = new Set<string>();
  const measured = candidates.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' ||
        typeof candidate.shipId !== 'string' || !isKnownHostId(candidate.shipId)) {
      throw new Error('Parking candidates contain an unknown host ship.');
    }
    if (seen.has(candidate.shipId)) throw new Error('Parking host candidates must be unique.');
    seen.add(candidate.shipId);
    if (!isWorldPoint(candidate.position)) throw new Error('Parking host has an invalid position.');
    const distanceSquared = squaredDistance(craftPosition, candidate.position);
    if (!Number.isFinite(distanceSquared)) throw new Error('Parking host distance is not finite.');
    return {
      shipId: candidate.shipId,
      position: candidate.position,
      distanceSquared,
    };
  });

  const nearestDistanceSquared = Math.min(...measured.map((candidate) => candidate.distanceSquared));
  const tied = measured
    .filter((candidate) => distancesAreEqual(candidate.distanceSquared, nearestDistanceSquared))
    .sort((left, right) => hostRank.get(left.shipId)! - hostRank.get(right.shipId)!);
  const chosen = tied[0]!;
  return Object.freeze({
    shipId: chosen.shipId,
    position: Object.freeze({ ...chosen.position }),
    distanceSquared: chosen.distanceSquared,
    tiedHostIds: Object.freeze(tied.map((candidate) => candidate.shipId)),
  });
}

export interface WolfAttackParkingDocking {
  readonly shuttleId: string;
  readonly shipId: string;
  readonly dockedAt: string;
}

export interface WolfAttackParkingGroup {
  readonly id: string;
  readonly vesselIds: readonly string[];
}

export interface WolfAttackParkingDecision {
  readonly craftId: string;
  readonly source: 'docked' | 'in-transit';
  readonly hostShipId: WolfAttackHostId;
  readonly distanceSquared: number;
  readonly tiedHostIds: readonly WolfAttackHostId[];
}

export interface WolfAttackParkingResolution {
  readonly dockings: readonly WolfAttackParkingDocking[];
  readonly decisions: readonly WolfAttackParkingDecision[];
  readonly clearedTransitIds: readonly string[];
}

const knownShuttleIds = new Set(
  ROLE_OWNED_CRAFT_CATALOG.filter((craft) => craft.kind === 'shuttle').map((craft) => craft.id),
);

/** Resolve the complete represented shuttle set to legal hosts at attack declaration time. */
export function resolveWolfAttackShuttleParking(input: Readonly<{
  shuttleIds: readonly string[];
  activeVesselIds: readonly string[];
  dockings: readonly WolfAttackParkingDocking[];
  transits: readonly ShuttleTransitState[];
  fleetGroups: readonly WolfAttackParkingGroup[];
  cycle: number;
  parkedAt: string;
}>): WolfAttackParkingResolution {
  const parkedAtMs = Date.parse(input.parkedAt);
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 1 || !Number.isFinite(parkedAtMs)) {
    throw new Error('Wolf attack parking cycle or server time is invalid.');
  }
  if (input.shuttleIds.length === 0 || new Set(input.shuttleIds).size !== input.shuttleIds.length ||
      input.shuttleIds.some((shuttleId) => !knownShuttleIds.has(shuttleId))) {
    throw new Error('Wolf attack shuttle roster is missing, duplicate, or unknown.');
  }
  const activeHosts = new Set(input.activeVesselIds);
  if (activeHosts.size === 0 || activeHosts.size !== input.activeVesselIds.length ||
      input.activeVesselIds.some((shipId) => !isKnownHostId(shipId))) {
    throw new Error('Wolf attack active host roster is missing, duplicate, or unknown.');
  }

  const groupsById = new Map<string, WolfAttackParkingGroup>();
  const groupsByHost = new Map<string, WolfAttackParkingGroup>();
  for (const group of input.fleetGroups) {
    if (!group.id || groupsById.has(group.id) || group.vesselIds.length === 0 ||
        new Set(group.vesselIds).size !== group.vesselIds.length) {
      throw new Error('Wolf attack fleet-group parking authority is malformed.');
    }
    groupsById.set(group.id, group);
    for (const shipId of group.vesselIds) {
      if (!activeHosts.has(shipId) || groupsByHost.has(shipId)) {
        throw new Error('Wolf attack fleet-group parking authority is malformed.');
      }
      groupsByHost.set(shipId, group);
    }
  }
  if (groupsByHost.size !== activeHosts.size) {
    throw new Error('Wolf attack fleet groups do not partition every active host.');
  }

  const expected = new Set(input.shuttleIds);
  const dockingByShuttle = new Map<string, WolfAttackParkingDocking>();
  for (const docking of input.dockings) {
    if (!expected.has(docking.shuttleId) || dockingByShuttle.has(docking.shuttleId) ||
        !activeHosts.has(docking.shipId) || !docking.dockedAt.trim()) {
      throw new Error('Wolf attack docking authority is malformed.');
    }
    dockingByShuttle.set(docking.shuttleId, docking);
  }
  const transitByShuttle = new Map<string, ShuttleTransitState>();
  for (const transit of input.transits) {
    if (!expected.has(transit.shuttleId) || transitByShuttle.has(transit.shuttleId)) {
      throw new Error('Wolf attack transit authority is malformed.');
    }
    transitByShuttle.set(transit.shuttleId, transit);
  }

  const dockings: WolfAttackParkingDocking[] = [];
  const decisions: WolfAttackParkingDecision[] = [];
  const clearedTransitIds: string[] = [];
  for (const shuttleId of input.shuttleIds) {
    const docking = dockingByShuttle.get(shuttleId);
    const transit = transitByShuttle.get(shuttleId);
    if ((docking ? 1 : 0) + (transit ? 1 : 0) !== 1) {
      throw new Error('Every represented shuttle must have exactly one parking source.');
    }

    let group: WolfAttackParkingGroup | undefined;
    let position: ShuttleWorldPoint | undefined;
    if (docking) {
      if (!shuttleHostIsAllowed(shuttleId, docking.shipId)) {
        throw new Error('A parked shuttle has an illegal current host.');
      }
      group = groupsByHost.get(docking.shipId);
      position = fleetWorldPositionForShip(docking.shipId);
    } else if (transit) {
      group = groupsById.get(transit.fleetGroupId);
      const departedAtMs = Date.parse(transit.departedAt);
      const originPosition = fleetWorldPositionForShip(transit.originShipId);
      const destinationPosition = fleetWorldPositionForShip(transit.destinationShipId);
      const durationSeconds = SHUTTLE_TRANSIT_DURATION_MS / 1_000;
      const expectedVelocity = destinationPosition && isWorldPoint(transit.currentPosition) ? {
        x: (destinationPosition.x - transit.currentPosition.x) / durationSeconds,
        y: (destinationPosition.y - transit.currentPosition.y) / durationSeconds,
        z: (destinationPosition.z - transit.currentPosition.z) / durationSeconds,
      } : undefined;
      if (!Number.isFinite(departedAtMs) || departedAtMs > parkedAtMs ||
          transit.cycle !== input.cycle || !group ||
          !group.vesselIds.includes(transit.originShipId) ||
          !group.vesselIds.includes(transit.destinationShipId) ||
          !shuttleHostIsAllowed(shuttleId, transit.originShipId) ||
          !shuttleHostIsAllowed(shuttleId, transit.destinationShipId) ||
          !originPosition || !destinationPosition || !expectedVelocity ||
          !isWorldPoint(transit.currentPosition) ||
          !pointsAreEqual(transit.originPosition, originPosition) ||
          !pointsAreEqual(transit.destinationPosition, destinationPosition) ||
          !pointsAreEqual(transit.velocity, expectedVelocity)) {
        throw new Error('A shuttle transit route is stale or illegal for its fleet group.');
      }
      position = shuttlePositionAt(transit, parkedAtMs);
    }
    if (!group || !position) throw new Error('Shuttle parking has no authoritative fleet position.');

    const selection = nearestWolfAttackHost(position, group.vesselIds
      .filter((shipId) => activeHosts.has(shipId) && shuttleHostIsAllowed(shuttleId, shipId))
      .map((shipId) => {
        const hostPosition = fleetWorldPositionForShip(shipId);
        if (!hostPosition) throw new Error('A legal parking host has no fleet position.');
        return { shipId, position: hostPosition };
      }));
    dockings.push(docking && docking.shipId === selection.shipId
      ? { ...docking }
      : { shuttleId, shipId: selection.shipId, dockedAt: input.parkedAt });
    decisions.push({
      craftId: shuttleId,
      source: docking ? 'docked' : 'in-transit',
      hostShipId: selection.shipId,
      distanceSquared: selection.distanceSquared,
      tiedHostIds: [...selection.tiedHostIds],
    });
    if (transit) clearedTransitIds.push(shuttleId);
  }
  return { dockings, decisions, clearedTransitIds };
}
