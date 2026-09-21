import {
  requireScoutEntitlement,
  type ScoutEntitlementAuthorityInput,
} from './scoutEntitlements';
import { jumpDistanceBetween, STAR_CHART_COORDINATES } from './starChartGraph';

export interface CommsOfficerScanRequest {
  readonly type: 'scout-request';
  readonly sourceId: 'comms-officer';
  readonly ownerRoleId: 'comms-officer';
  readonly anchorShipId: 'aegis';
  readonly attempt: 1;
  readonly cycle: number;
  readonly originCoordinate: string;
  readonly targetCoordinate: string;
  readonly distance: number;
}

function currentAegisCoordinate(value: unknown, activeVesselIds: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      !Array.isArray(activeVesselIds)) {
    throw new Error('Comms Officer scan position authority is malformed.');
  }
  const roster = activeVesselIds as readonly string[];
  const coordinates = value as Record<string, unknown>;
  const keys = Object.keys(coordinates);
  if (keys.length !== roster.length || keys.some((shipId) => !roster.includes(shipId)) ||
      roster.some((shipId) => typeof coordinates[shipId] !== 'string' ||
        !(STAR_CHART_COORDINATES as readonly string[]).includes(coordinates[shipId] as string)) ||
      typeof coordinates.aegis !== 'string') {
    throw new Error('Comms Officer scan position authority does not cover the exact active fleet.');
  }
  return coordinates.aegis;
}

/** Resolve the assigned Comms Officer's only short-range request for a cycle. */
export function resolveCommsOfficerScan(input: Readonly<
  ScoutEntitlementAuthorityInput & {
    readonly cycle: unknown;
    readonly priorScans: unknown;
    readonly targetCoordinate: unknown;
    readonly shipGalacticCoordinates: unknown;
  }
>): CommsOfficerScanRequest {
  const entitlement = requireScoutEntitlement({ ...input, requestedEntitlementId: 'comms-officer' });
  if (entitlement.id !== 'comms-officer' || entitlement.source !== 'replacement-role' ||
      entitlement.ownerRoleId !== 'comms-officer' || entitlement.anchorShipId !== 'aegis') {
    throw new Error('Comms Officer scan entitlement is unavailable.');
  }
  if (!Number.isSafeInteger(input.cycle) || (input.cycle as number) < 1 ||
      !Array.isArray(input.priorScans) || input.priorScans.length !== 0 ||
      typeof input.targetCoordinate !== 'string') {
    throw new Error('Comms Officer has already scanned or the request is malformed.');
  }
  const originCoordinate = currentAegisCoordinate(
    input.shipGalacticCoordinates,
    input.activeVesselIds,
  );
  const distance = jumpDistanceBetween(originCoordinate, input.targetCoordinate);
  if (distance === null || distance > 1) {
    throw new Error('Comms Officer may scout only a printed system within one jump of current AEGIS position.');
  }
  return Object.freeze({
    type: 'scout-request', sourceId: 'comms-officer', ownerRoleId: 'comms-officer',
    anchorShipId: 'aegis', attempt: 1, cycle: input.cycle as number,
    originCoordinate, targetCoordinate: input.targetCoordinate, distance,
  });
}
