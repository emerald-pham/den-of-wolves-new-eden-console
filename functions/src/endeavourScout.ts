import {
  requireScoutEntitlement,
  type ScoutEntitlementAuthorityInput,
} from './scoutEntitlements';
import { STAR_CHART_COORDINATES } from './starChartGraph';

export interface EndeavourScanRequest {
  readonly type: 'scout-request';
  readonly sourceId: 'endeavour';
  readonly ownerRoleId: 'shepherd-scientist';
  readonly anchorShipId: 'shepherd';
  readonly attempt: 1;
  readonly cycle: number;
  readonly targetCoordinate: string;
  readonly range: 'unlimited';
}

/** Resolve Endeavour's one long-range sensor request for a cycle. */
export function resolveEndeavourScan(input: Readonly<
  ScoutEntitlementAuthorityInput & {
    readonly cycle: unknown;
    readonly priorScans: unknown;
    readonly targetCoordinate: unknown;
  }
>): EndeavourScanRequest {
  const entitlement = requireScoutEntitlement({ ...input, requestedEntitlementId: 'endeavour' });
  if (entitlement.id !== 'endeavour' || entitlement.source !== 'craft' ||
      entitlement.ownerRoleId !== 'shepherd-scientist' || entitlement.anchorShipId !== 'shepherd') {
    throw new Error('Endeavour scan entitlement is unavailable.');
  }
  if (!Number.isSafeInteger(input.cycle) || (input.cycle as number) < 1 ||
      !Array.isArray(input.priorScans) || input.priorScans.length !== 0 ||
      typeof input.targetCoordinate !== 'string' ||
      !(STAR_CHART_COORDINATES as readonly string[]).includes(input.targetCoordinate)) {
    throw new Error('Endeavour has already scanned or the request is malformed.');
  }
  return Object.freeze({
    type: 'scout-request', sourceId: 'endeavour', ownerRoleId: 'shepherd-scientist',
    anchorShipId: 'shepherd', attempt: 1, cycle: input.cycle as number,
    targetCoordinate: input.targetCoordinate, range: 'unlimited',
  });
}
