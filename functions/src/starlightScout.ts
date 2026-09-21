import {
  requireScoutEntitlement,
  type ScoutEntitlementAuthorityInput,
} from './scoutEntitlements';
import { jumpDistanceBetween, STAR_CHART_COORDINATES } from './starChartGraph';

export interface StarlightFirstScanRequest {
  readonly type: 'scout-request';
  readonly sourceId: 'starlight';
  readonly ownerRoleId: 'wing-commander';
  readonly anchorShipId: 'aegis';
  readonly attempt: 1;
  readonly cycle: number;
  readonly originCoordinate: string;
  readonly targetCoordinate: string;
  readonly distance: number;
}

function authoritativeCoordinates(
  value: unknown,
  activeVesselIds: unknown,
): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      !Array.isArray(activeVesselIds)) {
    throw new Error('Starlight scan position authority is malformed.');
  }
  const roster = activeVesselIds as readonly string[];
  const coordinates = value as Record<string, unknown>;
  const keys = Object.keys(coordinates);
  if (keys.length !== roster.length || keys.some((shipId) => !roster.includes(shipId)) ||
      roster.some((shipId) => typeof coordinates[shipId] !== 'string' ||
        !(STAR_CHART_COORDINATES as readonly string[]).includes(coordinates[shipId] as string))) {
    throw new Error('Starlight scan position authority does not cover the exact active fleet.');
  }
  return coordinates as Readonly<Record<string, string>>;
}

/** Resolve the first printed Starlight request without exposing chart content. */
export function resolveStarlightFirstScan(input: Readonly<
  ScoutEntitlementAuthorityInput & {
    readonly cycle: unknown;
    readonly targetCoordinate: unknown;
    readonly shipGalacticCoordinates: unknown;
  }
>): StarlightFirstScanRequest {
  const entitlement = requireScoutEntitlement({ ...input, requestedEntitlementId: 'starlight' });
  if (entitlement.id !== 'starlight' || entitlement.source !== 'craft' ||
      entitlement.ownerRoleId !== 'wing-commander' || entitlement.anchorShipId !== 'aegis') {
    throw new Error('Starlight scan entitlement is unavailable.');
  }
  if (!Number.isSafeInteger(input.cycle) || (input.cycle as number) < 1 ||
      typeof input.targetCoordinate !== 'string') {
    throw new Error('Starlight scan request is malformed.');
  }
  const coordinates = authoritativeCoordinates(input.shipGalacticCoordinates, input.activeVesselIds);
  const originCoordinate = coordinates.aegis;
  if (originCoordinate === undefined) {
    throw new Error('Starlight scan position authority is missing AEGIS.');
  }
  const distance = jumpDistanceBetween(originCoordinate, input.targetCoordinate);
  if (distance === null || distance > 2) {
    throw new Error('Starlight may scout only a printed system within two jumps of current AEGIS position.');
  }
  return Object.freeze({
    type: 'scout-request',
    sourceId: 'starlight',
    ownerRoleId: 'wing-commander',
    anchorShipId: 'aegis',
    attempt: 1,
    cycle: input.cycle as number,
    originCoordinate,
    targetCoordinate: input.targetCoordinate,
    distance,
  });
}
