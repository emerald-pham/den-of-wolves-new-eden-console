import {
  requireScoutEntitlement,
  type ScoutEntitlementAuthorityInput,
} from './scoutEntitlements';
import { jumpDistanceBetween, STAR_CHART_COORDINATES } from './starChartGraph';

export interface HummingbirdScanRequest {
  readonly type: 'scout-request';
  readonly sourceId: 'hummingbird';
  readonly ownerRoleId: 'quellon-explorer';
  readonly anchorShipId: 'quellon';
  readonly attempt: 1;
  readonly cycle: number;
  readonly originCoordinate: string;
  readonly targetCoordinate: string;
  readonly distance: number;
}

function currentQuellonCoordinate(
  value: unknown,
  activeVesselIds: unknown,
): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      !Array.isArray(activeVesselIds)) {
    throw new Error('Hummingbird scan position authority is malformed.');
  }
  const roster = activeVesselIds as readonly string[];
  const coordinates = value as Record<string, unknown>;
  const keys = Object.keys(coordinates);
  if (keys.length !== roster.length || keys.some((shipId) => !roster.includes(shipId)) ||
      roster.some((shipId) => typeof coordinates[shipId] !== 'string' ||
        !(STAR_CHART_COORDINATES as readonly string[]).includes(coordinates[shipId] as string)) ||
      typeof coordinates.quellon !== 'string') {
    throw new Error('Hummingbird scan position authority does not cover the exact active fleet.');
  }
  return coordinates.quellon;
}

/** Resolve Hummingbird's only printed scan request for one cycle. */
export function resolveHummingbirdScan(input: Readonly<
  ScoutEntitlementAuthorityInput & {
    readonly cycle: unknown;
    readonly priorScans: unknown;
    readonly targetCoordinate: unknown;
    readonly shipGalacticCoordinates: unknown;
  }
>): HummingbirdScanRequest {
  const entitlement = requireScoutEntitlement({ ...input, requestedEntitlementId: 'hummingbird' });
  if (entitlement.id !== 'hummingbird' || entitlement.source !== 'craft' ||
      entitlement.ownerRoleId !== 'quellon-explorer' || entitlement.anchorShipId !== 'quellon') {
    throw new Error('Hummingbird scan entitlement is unavailable.');
  }
  if (!Number.isSafeInteger(input.cycle) || (input.cycle as number) < 1 ||
      !Array.isArray(input.priorScans) || input.priorScans.length !== 0 ||
      typeof input.targetCoordinate !== 'string') {
    throw new Error('Hummingbird has already scanned or the request is malformed.');
  }
  const originCoordinate = currentQuellonCoordinate(
    input.shipGalacticCoordinates,
    input.activeVesselIds,
  );
  const distance = jumpDistanceBetween(originCoordinate, input.targetCoordinate);
  if (distance === null || distance > 3) {
    throw new Error('Hummingbird may scout only a printed system within three jumps of current Quellon position.');
  }
  return Object.freeze({
    type: 'scout-request', sourceId: 'hummingbird', ownerRoleId: 'quellon-explorer',
    anchorShipId: 'quellon', attempt: 1, cycle: input.cycle as number,
    originCoordinate, targetCoordinate: input.targetCoordinate, distance,
  });
}
