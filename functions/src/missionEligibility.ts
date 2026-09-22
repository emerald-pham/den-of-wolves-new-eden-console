import type { FleetGroupRecord } from './fleetGroups';
import {
  missionCardForCode,
  type CanonicalMissionCardCode,
} from './missionCards';
import { organiserSitesForChart, type ChartId } from './starChartLookup';
import type { SystemHistory } from './systemHistory';

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
 * Create the durable opportunity exposed by the first vessel in one canonical
 * fleet group to reach a printed A-M mission system. Existing group position
 * and persisted discovery history both suppress repeat arrivals; another group
 * retains its own first arrival at the same coordinate.
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

  const previouslyReached = input.group.vesselIds.some((shipId) =>
    input.coordinates[shipId] === input.destination ||
    input.systemHistory?.[shipId]?.[input.destination]?.discovery !== undefined);
  if (previouslyReached) return undefined;

  const id = `arrival-${input.group.id}-${input.chart}-${input.destination}`;
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
