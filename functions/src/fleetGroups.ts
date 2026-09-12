/**
 * Server-owned fleet-group identity. The initial game is deliberately one
 * stable group; later partitioning can add group IDs without changing the
 * membership invariants enforced here.
 */
export const INITIAL_FLEET_GROUP_ID = 'fleet-1';

export interface FleetGroupRecord {
  readonly id: string;
  readonly vesselIds: readonly string[];
  readonly memberUids: readonly string[];
}

function uniqueStrings(value: readonly string[], label: string): readonly string[] {
  if (value.length === 0 || value.some((entry) => typeof entry !== 'string' || entry.length === 0) ||
      new Set(value).size !== value.length) {
    throw new Error(`Fleet group ${label} must contain unique non-empty identifiers.`);
  }
  return [...value];
}

export function initialFleetGroup(
  vesselIds: readonly string[],
  memberUids: readonly string[],
): FleetGroupRecord {
  return {
    id: INITIAL_FLEET_GROUP_ID,
    vesselIds: uniqueStrings(vesselIds, 'vessels'),
    memberUids: memberUids.length === 0 ? [] : uniqueStrings(memberUids, 'members'),
  };
}

/** Parse a group document without widening malformed state into a default. */
export function fleetGroupRecord(value: unknown): FleetGroupRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !Array.isArray(raw.vesselIds) || !Array.isArray(raw.memberUids) ||
      raw.vesselIds.some((entry) => typeof entry !== 'string') ||
      raw.memberUids.some((entry) => typeof entry !== 'string')) return undefined;
  try {
    return {
      id: raw.id,
      vesselIds: uniqueStrings(raw.vesselIds as string[], 'vessels'),
      memberUids: raw.memberUids.length === 0
        ? []
        : uniqueStrings(raw.memberUids as string[], 'members'),
    };
  } catch {
    return undefined;
  }
}

export function sameStringTuple(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function addFleetGroupMember(group: FleetGroupRecord, uid: string): FleetGroupRecord {
  if (group.memberUids.includes(uid)) return group;
  return { ...group, memberUids: [...group.memberUids, uid] };
}

export function withFleetGroupVessels(
  group: FleetGroupRecord,
  vesselIds: readonly string[],
): FleetGroupRecord {
  return { ...group, vesselIds: uniqueStrings(vesselIds, 'vessels') };
}

export function assertFleetGroupMatches(
  group: FleetGroupRecord,
  vesselIds: readonly string[],
  memberUids: readonly string[],
): void {
  if (group.id !== INITIAL_FLEET_GROUP_ID ||
      !sameStringTuple(group.vesselIds, vesselIds) ||
      !sameStringTuple(group.memberUids, memberUids)) {
    throw new Error('Fleet group membership is not the canonical session tuple.');
  }
}
