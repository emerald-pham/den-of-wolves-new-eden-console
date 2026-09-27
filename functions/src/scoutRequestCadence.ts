import { resolveCommsOfficerScan } from './commsOfficerScout';
import { resolveEndeavourScan } from './endeavourScout';
import { resolveHummingbirdScan } from './hummingbirdScout';
import {
  requireScoutEntitlement,
  type ScoutEntitlementAuthorityInput,
  type ScoutEntitlementId,
} from './scoutEntitlements';
import { jumpDistanceBetween, STAR_CHART_COORDINATES } from './starChartGraph';
import { resolveStarlightFirstScan, resolveStarlightSecondScan } from './starlightScout';

export type AuthorizedScoutScan =
  | ReturnType<typeof resolveCommsOfficerScan>
  | ReturnType<typeof resolveEndeavourScan>
  | ReturnType<typeof resolveHummingbirdScan>
  | ReturnType<typeof resolveStarlightFirstScan>
  | ReturnType<typeof resolveStarlightSecondScan>;

export interface ScoutCadenceEntry {
  readonly requestId: string;
  readonly actorUid: string;
  readonly scan: AuthorizedScoutScan;
}

export interface ScoutCadence {
  readonly sessionId: string;
  readonly entitlementId: ScoutEntitlementId;
  readonly cycle: number;
  readonly scans: readonly ScoutCadenceEntry[];
}

const PRINTED_COORDINATES = new Set<string>(STAR_CHART_COORDINATES);
const SCAN_KEYS = {
  endeavour: ['type', 'sourceId', 'ownerRoleId', 'anchorShipId', 'attempt', 'cycle', 'targetCoordinate', 'range'],
  starlight: ['type', 'sourceId', 'ownerRoleId', 'anchorShipId', 'attempt', 'cycle', 'originCoordinate', 'targetCoordinate', 'distance'],
  hummingbird: ['type', 'sourceId', 'ownerRoleId', 'anchorShipId', 'attempt', 'cycle', 'originCoordinate', 'targetCoordinate', 'distance'],
  'comms-officer': ['type', 'sourceId', 'ownerRoleId', 'anchorShipId', 'attempt', 'cycle', 'originCoordinate', 'targetCoordinate', 'distance'],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    value.trim() === value && !value.includes('/');
}

function isStoredScan(value: unknown, entitlementId: ScoutEntitlementId, cycle: number): value is AuthorizedScoutScan {
  if (!isRecord(value) || value.type !== 'scout-request' || value.sourceId !== entitlementId ||
      value.cycle !== cycle || !PRINTED_COORDINATES.has(value.targetCoordinate as string)) return false;
  const keys = SCAN_KEYS[entitlementId];
  if (entitlementId === 'endeavour') {
    return hasExactKeys(value, keys) && value.attempt === 1 && value.range === 'unlimited' &&
      value.ownerRoleId === 'shepherd-scientist' && value.anchorShipId === 'shepherd';
  }
  const expectedRole = entitlementId === 'starlight' ? 'wing-commander'
    : entitlementId === 'hummingbird' ? 'quellon-explorer' : 'comms-officer';
  const expectedShip = entitlementId === 'hummingbird' ? 'quellon' : 'aegis';
  const limit = entitlementId === 'starlight' ? 2 : entitlementId === 'hummingbird' ? 3 : 1;
  const distance = typeof value.originCoordinate === 'string' && typeof value.targetCoordinate === 'string'
    ? jumpDistanceBetween(value.originCoordinate, value.targetCoordinate) : null;
  const second = entitlementId === 'starlight' && value.attempt === 2;
  return hasExactKeys(value, second ? [...keys, 'firstTargetCoordinate'] : keys) &&
    (value.attempt === 1 || second) && value.ownerRoleId === expectedRole &&
    value.anchorShipId === expectedShip && distance !== null && distance <= limit &&
    value.distance === distance && (!second ||
      (PRINTED_COORDINATES.has(value.firstTargetCoordinate as string) &&
        value.firstTargetCoordinate !== value.targetCoordinate));
}

/** Fail closed on malformed or cross-cycle server cadence before any new request. */
export function parseScoutCadence(
  raw: unknown,
  sessionId: string,
  entitlementId: ScoutEntitlementId,
  cycle: number,
): ScoutCadence {
  const empty: ScoutCadence = { sessionId, entitlementId, cycle, scans: [] };
  if (raw === undefined) return empty;
  if (!isRecord(raw) || !hasExactKeys(raw, ['sessionId', 'entitlementId', 'cycle', 'scans']) ||
      raw.sessionId !== sessionId || raw.entitlementId !== entitlementId || raw.cycle !== cycle ||
      !Array.isArray(raw.scans) || raw.scans.length < 1 || raw.scans.length > (entitlementId === 'starlight' ? 2 : 1)) {
    throw new Error('Stored scout cadence is malformed.');
  }
  const scans: ScoutCadenceEntry[] = [];
  for (const [index, rawEntry] of raw.scans.entries()) {
    if (!isRecord(rawEntry) || !hasExactKeys(rawEntry, ['requestId', 'actorUid', 'scan']) ||
        !boundedId(rawEntry.requestId) || !boundedId(rawEntry.actorUid) ||
        !isStoredScan(rawEntry.scan, entitlementId, cycle) ||
        rawEntry.scan.attempt !== index + 1 ||
        (index === 1 && (rawEntry.scan.sourceId !== 'starlight' ||
          rawEntry.scan.attempt !== 2 ||
          rawEntry.scan.firstTargetCoordinate !== scans[0]?.scan.targetCoordinate))) {
      throw new Error('Stored scout cadence contains an invalid scan.');
    }
    scans.push(rawEntry as unknown as ScoutCadenceEntry);
  }
  if (new Set(scans.map(({ requestId }) => requestId)).size !== scans.length) {
    throw new Error('Stored scout cadence repeats a request identity.');
  }
  return { sessionId, entitlementId, cycle, scans };
}

/** Resolve a printed scan from current server position, role, fuel, and cadence. */
export function authorizeCurrentScoutScan(input: Readonly<
  ScoutEntitlementAuthorityInput & {
    readonly entitlementId: ScoutEntitlementId;
    readonly cycle: number;
    readonly targetCoordinate: string;
    readonly shipGalacticCoordinates: unknown;
    readonly cadence: ScoutCadence;
    readonly maintenanceCycles: unknown;
    readonly shuttleFuelled: unknown;
  }
>): AuthorizedScoutScan {
  requireScoutEntitlement({ ...input, requestedEntitlementId: input.entitlementId });
  const priorScans = input.cadence.scans.map(({ scan }) => scan);
  if (input.entitlementId === 'endeavour') {
    return resolveEndeavourScan({ ...input, priorScans });
  }
  if (input.entitlementId === 'hummingbird') {
    return resolveHummingbirdScan({ ...input, priorScans });
  }
  if (input.entitlementId === 'comms-officer') {
    return resolveCommsOfficerScan({ ...input, priorScans });
  }
  return priorScans.length === 0
    ? resolveStarlightFirstScan(input)
    : resolveStarlightSecondScan({ ...input, priorScans });
}
