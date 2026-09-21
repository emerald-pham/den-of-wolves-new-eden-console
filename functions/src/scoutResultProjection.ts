import { STAR_CHART_COORDINATES } from './starChartGraph';
import type { ScoutEntitlementId } from './scoutEntitlements';
import { isLiveSetupGm } from './gameSetup';

export interface ScoutSystemFact {
  readonly coordinate: string;
  readonly code: string;
  readonly title: string;
}

export interface PrivateScoutResult {
  readonly type: 'private-scout-result';
  readonly sessionId: string;
  readonly requestId: string;
  readonly requesterUid: string;
  readonly sourceId: ScoutEntitlementId;
  readonly cycle: number;
  readonly targetCoordinate: string;
  readonly systemFact: ScoutSystemFact;
}

export interface ScoutResultViewerAuthority {
  readonly sessionId: unknown;
  readonly uid: unknown;
  readonly role: unknown;
  readonly active: unknown;
  readonly connected: unknown;
  readonly nowMs: unknown;
  readonly facilitatorInstance?: unknown;
}

const SOURCE_IDS = new Set<ScoutEntitlementId>([
  'starlight', 'hummingbird', 'endeavour', 'comms-officer',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function boundedIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function parseSystemFact(value: unknown, targetCoordinate: string): ScoutSystemFact | null {
  if (!isRecord(value) || !hasExactKeys(value, ['coordinate', 'code', 'title']) ||
      value.coordinate !== targetCoordinate || typeof value.code !== 'string' ||
      !/^[A-P]$/.test(value.code) || typeof value.title !== 'string' ||
      value.title.trim() !== value.title || value.title.length === 0 || value.title.length > 160) {
    return null;
  }
  return Object.freeze({
    coordinate: targetCoordinate,
    code: value.code,
    title: value.title,
  });
}

/** Parse one stored result without carrying extra organiser-chart fields into a reader projection. */
export function parsePrivateScoutResult(value: unknown): PrivateScoutResult | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'type', 'sessionId', 'requestId', 'requesterUid', 'sourceId', 'cycle',
    'targetCoordinate', 'systemFact',
  ]) || value.type !== 'private-scout-result' || !boundedIdentifier(value.sessionId) ||
      !boundedIdentifier(value.requestId) ||
      !boundedIdentifier(value.requesterUid) || typeof value.sourceId !== 'string' ||
      !SOURCE_IDS.has(value.sourceId as ScoutEntitlementId) ||
      !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
      typeof value.targetCoordinate !== 'string' ||
      !STAR_CHART_COORDINATES.includes(value.targetCoordinate)) {
    return null;
  }
  const systemFact = parseSystemFact(value.systemFact, value.targetCoordinate);
  if (!systemFact) return null;
  return Object.freeze({
    type: 'private-scout-result',
    sessionId: value.sessionId,
    requestId: value.requestId,
    requesterUid: value.requesterUid,
    sourceId: value.sourceId as ScoutEntitlementId,
    cycle: value.cycle as number,
    targetCoordinate: value.targetCoordinate,
    systemFact,
  });
}

export function isPermittedScoutFacilitator(
  viewer: ScoutResultViewerAuthority,
  sessionId: string,
): boolean {
  if (!boundedIdentifier(viewer.sessionId) || viewer.sessionId !== sessionId ||
      !boundedIdentifier(viewer.uid) || viewer.role !== 'gm' || viewer.active !== true ||
      viewer.connected !== true || !isRecord(viewer.facilitatorInstance) ||
      !hasExactKeys(viewer.facilitatorInstance, [
        'id', 'sessionId', 'uid', 'connected', 'lastSeenAt',
      ]) || !boundedIdentifier(viewer.facilitatorInstance.id) ||
      viewer.facilitatorInstance.sessionId !== viewer.sessionId ||
      viewer.facilitatorInstance.uid !== viewer.uid ||
      viewer.facilitatorInstance.lastSeenAt === undefined ||
      viewer.facilitatorInstance.lastSeenAt === null ||
      typeof viewer.nowMs !== 'number' || !Number.isFinite(viewer.nowMs)) return false;
  return isLiveSetupGm({
    id: viewer.facilitatorInstance.id,
    uid: viewer.facilitatorInstance.uid as string,
    connected: viewer.facilitatorInstance.connected === true,
    lastSeenAt: viewer.facilitatorInstance.lastSeenAt as string | number | Date,
  }, viewer.nowMs);
}

/**
 * Return exactly one requested system fact to its requester or a live facilitator reader.
 * Other members receive no shape, coordinate, code, or title hint.
 */
export function projectPrivateScoutResult(
  rawResult: unknown,
  viewer: ScoutResultViewerAuthority,
): PrivateScoutResult | null {
  const result = parsePrivateScoutResult(rawResult);
  if (!result || !boundedIdentifier(viewer.sessionId) ||
      viewer.sessionId !== result.sessionId || !boundedIdentifier(viewer.uid) ||
      viewer.active !== true ||
      viewer.connected !== true) return null;
  const requester = viewer.role === 'player' && viewer.uid === result.requesterUid;
  return requester || isPermittedScoutFacilitator(viewer, result.sessionId) ? result : null;
}
