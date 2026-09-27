import { createHash } from 'node:crypto';
import { resolveScoutChartResult } from './scoutChartResult';
import { SCOUT_ENTITLEMENTS, type ScoutEntitlementId } from './scoutEntitlements';
import type { PrivateScoutResult, ScoutResultViewerAuthority } from './scoutResultProjection';
import { STAR_CHART_COORDINATES } from './starChartGraph';

type RecordValue = Record<string, unknown>;

export interface ScoutResolutionInput {
  readonly request: unknown;
  readonly cadence: unknown;
  readonly session: unknown;
  readonly facilitator: ScoutResultViewerAuthority;
  readonly fleetGroupId: unknown;
  readonly recordedAt: unknown;
}

export interface ScoutResolutionPlan {
  /** Request-time server-derived docking host for the ship map projection. */
  readonly receivingShipId: string;
  readonly result: PrivateScoutResult;
  readonly note: Readonly<{
    type: 'player-discovery-note'; id: string; sessionId: string; requestId: string;
    requesterUid: string; sourceId: ScoutEntitlementId; shipId: string;
    fleetGroupId: string; cycle: number; targetCoordinate: string;
    systemFact: PrivateScoutResult['systemFact']; recordedAt: string;
  }>;
  readonly audit: Readonly<{
    type: 'scout-resolution-audit'; sessionId: string; requestId: string;
    requesterUid: string; facilitatorUid: string; sourceId: ScoutEntitlementId;
    originShipId: string; receivingShipId: string;
    originCoordinate: string | null; targetCoordinate: string;
    cycle: number; result: PrivateScoutResult['systemFact']; recordedAt: string;
  }>;
  readonly deepNebulaScan: Readonly<{
    type: 'deep-nebula-scan'; sessionId: string; requestId: string;
    cycle: number; shipId: string; targetCoordinate: string;
  }> | null;
}

const REQUEST_FIELDS = [
  'type', 'status', 'resolution', 'requestId', 'sessionId', 'actorUid', 'cycle',
  'entitlementId', 'source', 'ownerRoleId', 'anchorShipId', 'receivingShipId', 'targetCoordinate',
  'scan', 'createdAt',
] as const;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function iso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function equalJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function scoutDiscoveryNoteId(sessionId: string, requesterUid: string, requestId: string): string {
  if (!id(sessionId) || !id(requesterUid) || !id(requestId)) {
    throw new Error('Scout discovery note identity is malformed.');
  }
  return createHash('sha256').update(sessionId).update('\0')
    .update(requesterUid).update('\0').update(requestId).digest('hex');
}

function requirePendingRequest(input: ScoutResolutionInput): RecordValue {
  const { request, cadence, session } = input;
  if (!record(request) || !exact(request, REQUEST_FIELDS) ||
      request.type !== 'scout-request' || request.status !== 'requested' ||
      request.resolution !== 'pending' || !id(request.sessionId) || !id(request.requestId) ||
      !id(request.actorUid) || !id(request.receivingShipId) ||
      !Number.isSafeInteger(request.cycle) || (request.cycle as number) < 1 ||
      typeof request.entitlementId !== 'string' ||
      typeof request.targetCoordinate !== 'string' ||
      !STAR_CHART_COORDINATES.includes(request.targetCoordinate) ||
      request.createdAt === undefined || !record(request.scan) ||
      request.scan.sourceId !== request.entitlementId ||
      request.scan.targetCoordinate !== request.targetCoordinate) {
    throw new Error('The pending scout request is malformed.');
  }
  const entitlement = SCOUT_ENTITLEMENTS.find(({ id: entitlementId }) =>
    entitlementId === request.entitlementId);
  if (!entitlement || entitlement.source !== request.source ||
      entitlement.ownerRoleId !== request.ownerRoleId ||
      entitlement.anchorShipId !== request.anchorShipId) {
    throw new Error('The pending scout identity conflicts with printed authority.');
  }
  if (!record(cadence) || !exact(cadence, ['sessionId', 'entitlementId', 'cycle', 'scans']) ||
      cadence.sessionId !== request.sessionId || cadence.entitlementId !== request.entitlementId ||
      cadence.cycle !== request.cycle || !Array.isArray(cadence.scans) ||
      cadence.scans.length === 0 || cadence.scans.length > 2 ||
      cadence.scans.some((entry) => !record(entry) ||
        !exact(entry, ['requestId', 'actorUid', 'scan']) ||
        !id(entry.requestId) || !id(entry.actorUid) || !record(entry.scan)) ||
      new Set(cadence.scans.map((entry) => entry.requestId)).size !== cadence.scans.length ||
      cadence.scans.filter((entry) => entry.requestId === request.requestId &&
        entry.actorUid === request.actorUid && equalJson(entry.scan, request.scan)).length !== 1) {
    throw new Error('The pending scout request has no matching cadence receipt.');
  }
  if (!record(session) || !exact(session, [
    'sessionId', 'phase', 'chartId', 'chartSelectionLocked', 'currentCycle',
  ]) || session.sessionId !== request.sessionId || session.phase !== 'active' ||
      session.chartSelectionLocked !== true || session.currentCycle !== request.cycle) {
    throw new Error('The current chart or cycle does not match the scout request.');
  }
  return request;
}

/** Plan immutable, private writes; the caller owns one atomic Firestore transaction. */
export function buildScoutResolutionPlan(input: ScoutResolutionInput): ScoutResolutionPlan {
  const request = requirePendingRequest(input);
  if (!id(input.fleetGroupId) || !/^fleet-[1-9][0-9]*$/.test(input.fleetGroupId) ||
      !iso(input.recordedAt)) {
    throw new Error('The scout group or server timestamp is unavailable.');
  }
  const result = resolveScoutChartResult({
    type: 'scout-resolution-request', sessionId: request.sessionId,
    requestId: request.requestId, requesterUid: request.actorUid,
    sourceId: request.entitlementId, cycle: request.cycle,
    targetCoordinate: request.targetCoordinate,
  }, {
    sessionId: (input.session as RecordValue).sessionId,
    phase: (input.session as RecordValue).phase,
    chartId: (input.session as RecordValue).chartId,
    chartSelectionLocked: (input.session as RecordValue).chartSelectionLocked,
  }, input.facilitator);
  const recordedAt = input.recordedAt as string;
  const noteId = scoutDiscoveryNoteId(result.sessionId, result.requesterUid, result.requestId);
  const scan = request.scan as RecordValue;
  const plan: ScoutResolutionPlan = {
    receivingShipId: request.receivingShipId as string,
    result,
    note: Object.freeze({
      type: 'player-discovery-note', id: noteId, sessionId: result.sessionId,
      requestId: result.requestId, requesterUid: result.requesterUid,
      sourceId: result.sourceId, shipId: request.anchorShipId as string,
      fleetGroupId: input.fleetGroupId, cycle: result.cycle,
      targetCoordinate: result.targetCoordinate, systemFact: result.systemFact,
      recordedAt,
    }),
    audit: Object.freeze({
      type: 'scout-resolution-audit', sessionId: result.sessionId, requestId: result.requestId,
      requesterUid: result.requesterUid, facilitatorUid: input.facilitator.uid as string,
      sourceId: result.sourceId, originShipId: request.anchorShipId as string,
      receivingShipId: request.receivingShipId as string,
      originCoordinate: typeof scan.originCoordinate === 'string' ? scan.originCoordinate : null,
      targetCoordinate: result.targetCoordinate, cycle: result.cycle,
      result: result.systemFact, recordedAt,
    }),
    deepNebulaScan: result.systemFact.code === 'O' ? Object.freeze({
      type: 'deep-nebula-scan', sessionId: result.sessionId, requestId: result.requestId,
      cycle: result.cycle, shipId: request.anchorShipId as string,
      targetCoordinate: result.targetCoordinate,
    }) : null,
  };
  return Object.freeze(plan);
}
