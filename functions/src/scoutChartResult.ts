import { organiserSitesForChart, type ChartId } from './starChartLookup';
import {
  isPermittedScoutFacilitator,
  parsePrivateScoutResult,
  type PrivateScoutResult,
  type ScoutResultViewerAuthority,
} from './scoutResultProjection';
import type { ScoutEntitlementId } from './scoutEntitlements';
import { STAR_CHART_COORDINATES } from './starChartGraph';

interface ScoutResolutionRequest {
  readonly type: 'scout-resolution-request';
  readonly sessionId: string;
  readonly requestId: string;
  readonly requesterUid: string;
  readonly sourceId: ScoutEntitlementId;
  readonly cycle: number;
  readonly targetCoordinate: string;
}

interface ScoutChartAuthority {
  readonly sessionId: string;
  readonly phase: 'active';
  readonly chartId: ChartId;
  readonly chartSelectionLocked: true;
}

const SOURCE_IDS = new Set<ScoutEntitlementId>([
  'starlight', 'hummingbird', 'endeavour', 'comms-officer',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function parseResolutionRequest(value: unknown): ScoutResolutionRequest | null {
  if (!isRecord(value)) return null;
  const keys = [
    'type', 'sessionId', 'requestId', 'requesterUid', 'sourceId', 'cycle', 'targetCoordinate',
  ];
  if (Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key)) ||
      value.type !== 'scout-resolution-request' || !boundedIdentifier(value.sessionId) ||
      !boundedIdentifier(value.requestId) || !boundedIdentifier(value.requesterUid) ||
      typeof value.sourceId !== 'string' ||
      !SOURCE_IDS.has(value.sourceId as ScoutEntitlementId) ||
      !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
      typeof value.targetCoordinate !== 'string' ||
      !STAR_CHART_COORDINATES.includes(value.targetCoordinate)) return null;
  return value as unknown as ScoutResolutionRequest;
}

function parseChartAuthority(value: unknown, sessionId: string): ScoutChartAuthority | null {
  if (!isRecord(value)) return null;
  const keys = ['sessionId', 'phase', 'chartId', 'chartSelectionLocked'];
  if (Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key)) ||
      value.sessionId !== sessionId || value.phase !== 'active' ||
      (value.chartId !== 'A' && value.chartId !== 'B' && value.chartId !== 'C') ||
      value.chartSelectionLocked !== true) return null;
  return value as unknown as ScoutChartAuthority;
}

/** Resolve exactly one requested booklet fact without returning the selected chart or site catalog. */
export function resolveScoutChartResult(
  rawRequest: unknown,
  rawChartAuthority: unknown,
  facilitator: ScoutResultViewerAuthority,
): PrivateScoutResult {
  const request = parseResolutionRequest(rawRequest);
  const chartAuthority = request ? parseChartAuthority(rawChartAuthority, request.sessionId) : null;
  if (!request || !chartAuthority) {
    throw new Error('Scout chart resolution request is malformed.');
  }
  if (!isPermittedScoutFacilitator(facilitator, request.sessionId)) {
    throw new Error('A live same-session facilitator instance is required.');
  }
  const site = organiserSitesForChart(chartAuthority.chartId)[request.targetCoordinate];
  if (!site || !/^[A-P]$/.test(site.code) || !site.name) {
    throw new Error('The requested coordinate has no booklet entry on the selected chart.');
  }
  const result = parsePrivateScoutResult({
    type: 'private-scout-result',
    sessionId: request.sessionId,
    requestId: request.requestId,
    requesterUid: request.requesterUid,
    sourceId: request.sourceId,
    cycle: request.cycle,
    targetCoordinate: request.targetCoordinate,
    systemFact: {
      coordinate: request.targetCoordinate,
      code: site.code,
      title: site.name,
    },
  });
  if (!result) throw new Error('The selected chart entry cannot be projected safely.');
  return result;
}
