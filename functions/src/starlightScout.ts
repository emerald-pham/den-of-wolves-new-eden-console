import {
  requireScoutEntitlement,
  type ScoutEntitlementAuthorityInput,
} from './scoutEntitlements';
import { jumpDistanceBetween, STAR_CHART_COORDINATES } from './starChartGraph';
import { ROLE_OWNED_CRAFT_CATALOG } from './craftOwnership';
import { parseMaintenanceCycle } from './maintenance';

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

export interface StarlightSecondScanRequest extends Omit<StarlightFirstScanRequest, 'attempt'> {
  readonly attempt: 2;
  readonly firstTargetCoordinate: string;
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

function firstScanRequest(value: unknown, cycle: number): StarlightFirstScanRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Starlight first-scan authority is malformed.');
  }
  const request = value as Record<string, unknown>;
  const keys = [
    'type', 'sourceId', 'ownerRoleId', 'anchorShipId', 'attempt', 'cycle',
    'originCoordinate', 'targetCoordinate', 'distance',
  ];
  const distance = typeof request.originCoordinate === 'string' &&
    typeof request.targetCoordinate === 'string'
    ? jumpDistanceBetween(request.originCoordinate, request.targetCoordinate)
    : null;
  if (Object.keys(request).length !== keys.length ||
      Object.keys(request).some((key) => !keys.includes(key)) ||
      request.type !== 'scout-request' || request.sourceId !== 'starlight' ||
      request.ownerRoleId !== 'wing-commander' || request.anchorShipId !== 'aegis' ||
      request.attempt !== 1 || request.cycle !== cycle ||
      distance === null || distance > 2 || request.distance !== distance) {
    throw new Error('Starlight first-scan authority is malformed or stale.');
  }
  return request as unknown as StarlightFirstScanRequest;
}

function requireCurrentStarlightFuel(
  maintenanceCycles: unknown,
  shuttleFuelled: unknown,
  cycle: number,
): void {
  if (typeof maintenanceCycles !== 'object' || maintenanceCycles === null ||
      Array.isArray(maintenanceCycles) || typeof shuttleFuelled !== 'object' ||
      shuttleFuelled === null || Array.isArray(shuttleFuelled)) {
    throw new Error('Starlight fuel authority is malformed.');
  }
  const fuelled = shuttleFuelled as Record<string, unknown>;
  const knownShuttles = new Set(ROLE_OWNED_CRAFT_CATALOG
    .filter((craft) => craft.kind === 'shuttle').map((craft) => craft.id));
  if (Object.entries(fuelled).some(([shuttleId, value]) =>
    !knownShuttles.has(shuttleId) || typeof value !== 'boolean') || fuelled.starlight !== true) {
    throw new Error('Starlight requires authoritative current-cycle fuel for a second scan.');
  }
  const rawAegis = (maintenanceCycles as Record<string, unknown>).aegis;
  const maintenance = parseMaintenanceCycle(rawAegis);
  const rawRefuelled = typeof rawAegis === 'object' && rawAegis !== null && !Array.isArray(rawAegis)
    ? (rawAegis as Record<string, unknown>).refuelled
    : undefined;
  if (!maintenance || maintenance.turn !== cycle || maintenance.step !== 7 ||
      !Array.isArray(rawRefuelled) ||
      rawRefuelled.some((shuttleId) => typeof shuttleId !== 'string' ||
        !knownShuttles.has(shuttleId)) ||
      new Set(rawRefuelled).size !== rawRefuelled.length ||
      !maintenance.refuelled.includes('starlight')) {
    throw new Error('Starlight was not refuelled in the authoritative current maintenance cycle.');
  }
}

/** Resolve Starlight's one fuelled additional request from current authority. */
export function resolveStarlightSecondScan(input: Readonly<
  ScoutEntitlementAuthorityInput & {
    readonly cycle: unknown;
    readonly targetCoordinate: unknown;
    readonly shipGalacticCoordinates: unknown;
    readonly priorScans: unknown;
    readonly maintenanceCycles: unknown;
    readonly shuttleFuelled: unknown;
  }
>): StarlightSecondScanRequest {
  if (!Number.isSafeInteger(input.cycle) || (input.cycle as number) < 1) {
    throw new Error('Starlight second-scan cycle is malformed.');
  }
  const cycle = input.cycle as number;
  if (!Array.isArray(input.priorScans) || input.priorScans.length !== 1) {
    throw new Error('Starlight has already used or has not recorded its first scan this cycle.');
  }
  const first = firstScanRequest(input.priorScans[0], cycle);
  requireCurrentStarlightFuel(input.maintenanceCycles, input.shuttleFuelled, cycle);
  const candidate = resolveStarlightFirstScan(input);
  if (candidate.targetCoordinate === first.targetCoordinate) {
    throw new Error('Starlight second scan must select a distinct eligible system.');
  }
  return Object.freeze({
    ...candidate,
    attempt: 2,
    firstTargetCoordinate: first.targetCoordinate,
  });
}
