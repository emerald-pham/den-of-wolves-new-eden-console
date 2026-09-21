import type { ShuttleWorldPoint } from './shuttleTransit';

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
  /** Canonically ordered hosts that were exactly equally near when this choice was made. */
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

/**
 * Select the nearest ship from an already authorized set of legal, active
 * candidates. Unknown positions or identities fail closed before a choice can
 * be persisted. Exact equal distances use the recorded product order above.
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
    .filter((candidate) => candidate.distanceSquared === nearestDistanceSquared)
    .sort((left, right) => hostRank.get(left.shipId)! - hostRank.get(right.shipId)!);
  const chosen = tied[0]!;
  return Object.freeze({
    shipId: chosen.shipId,
    position: Object.freeze({ ...chosen.position }),
    distanceSquared: nearestDistanceSquared,
    tiedHostIds: Object.freeze(tied.map((candidate) => candidate.shipId)),
  });
}
