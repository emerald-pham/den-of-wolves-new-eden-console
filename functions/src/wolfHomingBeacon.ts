import { isStarSystemCoordinate } from './navigation';
import type { FleetGroupRecord } from './fleetGroups';

export const HOMING_BEACON_SUSPICION_INCREMENT = 5;
export const HOMING_BEACON_ARRIVAL_TIMING = 'after-cycle-start' as const;

export interface WolfHomingBeaconTarget {
  readonly groupId: string;
  readonly coordinate: string;
  readonly sourceCycle: number;
  readonly dueCycle: number;
  readonly arrivalTiming: typeof HOMING_BEACON_ARRIVAL_TIMING;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolve the server-owned system that receives next-cycle pressure. Every
 * vessel in the actor's canonical fleet group must share one valid current
 * coordinate; malformed or partly split authority fails closed.
 */
export function resolveWolfHomingBeaconTarget(input: {
  readonly actorUid: string;
  readonly actorGroupId: unknown;
  readonly group: FleetGroupRecord | undefined;
  readonly activeVesselIds: readonly string[];
  readonly navigation: unknown;
  readonly sourceCycle: number;
}): WolfHomingBeaconTarget {
  if (!Number.isSafeInteger(input.sourceCycle) || input.sourceCycle < 1 ||
      input.sourceCycle >= Number.MAX_SAFE_INTEGER) {
    throw new Error('The current cycle cannot schedule next-cycle pressure.');
  }
  if (typeof input.actorGroupId !== 'string' || !input.actorGroupId ||
      !input.group || input.group.id !== input.actorGroupId ||
      !input.group.memberUids.includes(input.actorUid)) {
    throw new Error('The Wolf holder has no canonical fleet-group authority.');
  }
  const activeVessels = new Set(input.activeVesselIds);
  if (input.group.vesselIds.length === 0 ||
      input.group.vesselIds.some((vesselId) => !activeVessels.has(vesselId))) {
    throw new Error('The Wolf holder fleet group has malformed vessel authority.');
  }
  if (!isRecord(input.navigation) || !isRecord(input.navigation.shipGalacticCoordinates)) {
    throw new Error('The protected navigation authority is missing or malformed.');
  }
  const navigation = input.navigation;
  const coordinates = input.group.vesselIds.map((vesselId) =>
    (navigation.shipGalacticCoordinates as Record<string, unknown>)[vesselId]);
  if (coordinates.some((coordinate) =>
    typeof coordinate !== 'string' || !isStarSystemCoordinate(coordinate))) {
    throw new Error('The protected navigation authority has no valid current fleet system.');
  }
  const coordinate = coordinates[0] as string;
  if (coordinates.some((candidate) => candidate !== coordinate)) {
    throw new Error('A homing beacon requires every vessel in the fleet group to share one system.');
  }
  return {
    groupId: input.group.id,
    coordinate,
    sourceCycle: input.sourceCycle,
    dueCycle: input.sourceCycle + 1,
    arrivalTiming: HOMING_BEACON_ARRIVAL_TIMING,
  };
}
