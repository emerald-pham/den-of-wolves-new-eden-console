import type { FleetGroupRecord } from './fleetGroups';
import {
  missionCardForCode,
  type CanonicalMissionCardCode,
} from './missionCards';
import { organiserSitesForChart, type ChartId } from './starChartLookup';
import type { SystemHistory } from './systemHistory';
import { isCanonicalRequestId } from './requestGuards';
import { isFleetShipId } from './shipConfetti';

export interface MissionOpportunityEligibility {
  readonly type: 'mission-opportunity';
  readonly status: 'available';
  readonly id: string;
  readonly groupId: string;
  readonly chart: ChartId;
  readonly coordinate: string;
  readonly siteCode: CanonicalMissionCardCode;
  readonly sourceShipId: string;
  readonly sourceTransitionId: string;
  readonly sourceCycle: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissionTransitionId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const prefix = value.startsWith('navigation-')
    ? 'navigation-'
    : value.startsWith('jump-')
      ? 'jump-'
      : undefined;
  return prefix !== undefined && isCanonicalRequestId(value.slice(prefix.length));
}

/**
 * Validate the durable record that suppresses a later arrival. Historical
 * source metadata may differ from the current movement, but the record must
 * bind to the exact computed session, group, chart, coordinate, and mission.
 */
export function parseStoredMissionOpportunity(
  value: unknown,
  sessionId: string,
  expected: MissionOpportunityEligibility,
  sourceCyclePolicy: 'expected' | 'any' = expected.siteCode === 'J' ? 'expected' : 'any',
): MissionOpportunityEligibility {
  if (!isRecord(value) ||
    value.type !== 'mission-opportunity' ||
    value.status !== 'available' ||
    value.sessionId !== sessionId ||
    value.id !== expected.id ||
    value.groupId !== expected.groupId ||
    value.chart !== expected.chart ||
    value.coordinate !== expected.coordinate ||
    value.siteCode !== expected.siteCode ||
    typeof value.sourceShipId !== 'string' ||
    !isFleetShipId(value.sourceShipId) || value.sourceShipId === 'snn-press-shuttle' ||
    !isMissionTransitionId(value.sourceTransitionId) ||
    !Number.isSafeInteger(value.sourceCycle) || (value.sourceCycle as number) < 0 ||
    (sourceCyclePolicy === 'expected' && value.sourceCycle !== expected.sourceCycle)) {
    throw new Error('Stored mission opportunity is malformed or belongs to another arrival.');
  }
  return {
    type: expected.type,
    status: expected.status,
    id: expected.id,
    groupId: expected.groupId,
    chart: expected.chart,
    coordinate: expected.coordinate,
    siteCode: expected.siteCode,
    sourceShipId: value.sourceShipId as string,
    sourceTransitionId: value.sourceTransitionId as string,
    sourceCycle: value.sourceCycle as number,
  };
}

type FirstArrivalMissionOpportunityInput = Readonly<{
  chart: ChartId;
  group: FleetGroupRecord;
  coordinates: Readonly<Record<string, string>>;
  systemHistory: SystemHistory | undefined;
  movedShipId: string;
  destination: string;
  sourceTransitionId: string;
  cycle: number;
}>;

export function missionOpportunityDocumentPath(sessionId: string, opportunityId: string): string {
  return `sessions/${sessionId}/missionOpportunities/${opportunityId}`;
}

/**
 * Resolve the unsuffixed J identity written before cycle-scoped repeatability
 * shipped. Its validated source cycle decides whether it suppresses the
 * current cycle or represents an older, already-finished opportunity.
 */
export function legacyUnstableStarMissionOpportunity(
  opportunity: MissionOpportunityEligibility,
): MissionOpportunityEligibility | undefined {
  if (opportunity.siteCode !== 'J') return undefined;
  return {
    ...opportunity,
    id: `arrival-${opportunity.groupId}-${opportunity.chart}-${opportunity.coordinate}`,
  };
}

/**
 * Create the durable opportunity exposed by the first vessel in one canonical
 * fleet group to reach a printed A-M mission system. Existing group position
 * suppresses every duplicate arrival. Persisted discovery suppresses ordinary
 * systems, while Unstable Star J gets one cycle-scoped opportunity after the
 * group leaves and returns. Another group retains its own eligibility.
 */
export function firstArrivalMissionOpportunity(
  input: FirstArrivalMissionOpportunityInput,
): MissionOpportunityEligibility | undefined {
  if (!/^fleet-[1-9][0-9]*$/.test(input.group.id)) {
    throw new Error('Mission arrival requires a canonical fleet group.');
  }
  if (!input.group.vesselIds.includes(input.movedShipId)) {
    throw new Error('The moving ship is not part of the arriving fleet group.');
  }
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 0) {
    throw new Error('Mission arrival requires a valid cycle.');
  }
  if (input.sourceTransitionId.length === 0) {
    throw new Error('Mission arrival requires a source transition.');
  }

  const siteCode = organiserSitesForChart(input.chart)[input.destination]?.code;
  const mission = siteCode ? missionCardForCode(siteCode) : undefined;
  if (!mission) return undefined;

  const groupAlreadyPresent = input.group.vesselIds.some((shipId) =>
    input.coordinates[shipId] === input.destination);
  if (groupAlreadyPresent) return undefined;

  const previouslyDiscovered = input.group.vesselIds.some((shipId) =>
    input.systemHistory?.[shipId]?.[input.destination]?.discovery !== undefined);
  if (previouslyDiscovered && siteCode !== 'J') return undefined;

  const id = siteCode === 'J'
    ? `arrival-${input.group.id}-${input.chart}-${input.destination}-cycle-${input.cycle}`
    : `arrival-${input.group.id}-${input.chart}-${input.destination}`;
  return {
    type: 'mission-opportunity',
    status: 'available',
    id,
    groupId: input.group.id,
    chart: input.chart,
    coordinate: input.destination,
    siteCode: mission.code,
    sourceShipId: input.movedShipId,
    sourceTransitionId: input.sourceTransitionId,
    sourceCycle: input.cycle,
  };
}
