import {
  missionCardForCode,
  type CanonicalMissionCardCode,
  type MissionExploreStarSystemsEffect,
} from './missionCards';
import { organiserSitesForChart, type ChartId } from './starChartLookup';
import { discoverySystemId, discoverySystemsForCoordinates } from './starChartProjection';

export interface MissionExplorationRewardInput {
  /** Server-owned identity of the active away mission. */
  readonly missionId: string;
  /** Server-owned printed mission card code. */
  readonly siteCode: CanonicalMissionCardCode;
  /** The opportunity whose canonical reward branch was resolved. */
  readonly opportunityId: string;
  readonly rewardBranch: 'none' | 'success' | 'critical';
  /** Locked chart captured by the server for this mission. */
  readonly chart: ChartId;
  /** The exact coordinates selected for the printed exploration effect. */
  readonly targetCoordinates: readonly string[];
  /** Server-derived participants entitled to this mission's private knowledge. */
  readonly audienceUids: readonly string[];
  /** Current authoritative known-system maps for exactly the entitled audience. */
  readonly knownSystemsByUid: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Existing durable receipt read by the caller's transaction, if present. */
  readonly existingReceipt?: unknown;
}

export interface MissionExplorationRewardReceipt {
  readonly id: string;
  readonly missionId: string;
  readonly siteCode: CanonicalMissionCardCode;
  readonly opportunityId: string;
  readonly chart: ChartId;
  readonly targetCoordinates: readonly string[];
  readonly audienceUids: readonly string[];
}

export interface MissionExplorationRewardPlan {
  readonly status: 'planned' | 'replayed';
  readonly receipt: MissionExplorationRewardReceipt;
  /** Merge these opaque system-id/coordinate pairs into each recipient's private map. */
  readonly newDiscoveriesByUid: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/**
 * Build the map-knowledge portion of a successful printed mission reward.
 * The caller supplies only server-derived mission, chart, audience and
 * projection state, then persists `receipt` with the returned map additions
 * in the same transaction. This function does not create travel or arrival
 * state; the stable receipt ID makes a repeated application a no-op.
 */
export function planMissionExplorationReward(
  input: MissionExplorationRewardInput,
): MissionExplorationRewardPlan | null {
  if (!isRecord(input) || !isNonEmptyString(input.missionId) ||
      !isChartId(input.chart) || !isArrayOfStrings(input.targetCoordinates) ||
      !isArrayOfStrings(input.audienceUids) || !isRecord(input.knownSystemsByUid)) return null;

  const card = missionCardForCode(input.siteCode);
  const opportunity = card?.opportunities.find(({ id }) => id === input.opportunityId);
  if (!card || !opportunity) return null;
  const effect = explorationEffectForBranch(opportunity, input.rewardBranch);
  if (!effect) return null;

  const audienceUids = [...input.audienceUids].sort();
  if (audienceUids.length === 0 || audienceUids.some((uid) => !isNonEmptyString(uid) || uid.trim() !== uid) ||
      new Set(audienceUids).size !== audienceUids.length) return null;
  const audienceSet = new Set(audienceUids);
  const projectionUids = Object.keys(input.knownSystemsByUid);
  if (projectionUids.length !== audienceUids.length ||
      projectionUids.some((uid) => !audienceSet.has(uid))) return null;

  const knownCoordinatesByUid = new Map<string, ReadonlySet<string>>();
  for (const uid of audienceUids) {
    if (!Object.prototype.hasOwnProperty.call(input.knownSystemsByUid, uid)) return null;
    const knownSystems = input.knownSystemsByUid[uid];
    if (!isRecord(knownSystems)) return null;
    const coordinates = new Set<string>();
    for (const [systemId, coordinate] of Object.entries(knownSystems)) {
      if (typeof coordinate !== 'string' || discoverySystemId(coordinate) !== systemId ||
          coordinates.has(coordinate)) return null;
      coordinates.add(coordinate);
    }
    knownCoordinatesByUid.set(uid, coordinates);
  }

  const targetCoordinates = [...input.targetCoordinates].sort();
  if (!Number.isSafeInteger(effect.amount) || effect.amount <= 0 ||
      targetCoordinates.length !== effect.amount ||
      targetCoordinates.some((coordinate) => !isNonEmptyString(coordinate)) ||
      new Set(targetCoordinates).size !== targetCoordinates.length) return null;

  const sites = organiserSitesForChart(input.chart);
  for (const coordinate of targetCoordinates) {
    const site = sites[coordinate];
    if (!site?.code || !discoverySystemId(coordinate)) return null;
    if (effect.allowedCodes && !effect.allowedCodes.some((code) => code === site.code)) return null;
    if (effect.scope === 'wolf' && site.code !== 'L' && site.code !== 'M') return null;
  }

  const receipt: MissionExplorationRewardReceipt = {
    id: explorationRewardId(input.missionId, input.opportunityId),
    missionId: input.missionId,
    siteCode: input.siteCode,
    opportunityId: input.opportunityId,
    chart: input.chart,
    targetCoordinates,
    audienceUids,
  };
  if (input.existingReceipt !== undefined && input.existingReceipt !== null) {
    if (!sameReceipt(input.existingReceipt, receipt)) return null;
    return {
      status: 'replayed',
      receipt,
      newDiscoveriesByUid: Object.fromEntries(audienceUids.map((uid) => [uid, {}])),
    };
  }

  const newDiscoveriesByUid = Object.fromEntries(audienceUids.map((uid) => {
    const knownCoordinates = knownCoordinatesByUid.get(uid)!;
    const newlyKnown = targetCoordinates.filter((coordinate) => !knownCoordinates.has(coordinate));
    return [uid, discoverySystemsForCoordinates(newlyKnown)];
  }));
  return { status: 'planned', receipt, newDiscoveriesByUid };
}

function explorationEffectForBranch(
  opportunity: NonNullable<ReturnType<typeof missionCardForCode>>['opportunities'][number],
  rewardBranch: MissionExplorationRewardInput['rewardBranch'],
): MissionExploreStarSystemsEffect | null {
  if (rewardBranch !== 'success' && rewardBranch !== 'critical') return null;
  if (rewardBranch === 'critical' && opportunity.criticalThreshold === null) return null;
  const effects = [
    ...opportunity.reward.successEffects,
    ...(rewardBranch === 'critical' ? opportunity.reward.criticalEffects ?? [] : []),
  ].filter((effect) => effect.kind === 'exploreStarSystems');
  if (effects.length !== 1) return null;
  const [effect] = effects;
  if (!effect || !Number.isSafeInteger(effect.amount) || effect.amount <= 0 ||
      (effect.scope !== 'any' && effect.scope !== 'wolf') ||
      (effect.allowedCodes !== null && !Array.isArray(effect.allowedCodes))) return null;
  return effect;
}

function explorationRewardId(missionId: string, opportunityId: string): string {
  return `mission-exploration:${encodeURIComponent(missionId)}:${opportunityId}`;
}

function sameReceipt(value: unknown, expected: MissionExplorationRewardReceipt): boolean {
  if (!isRecord(value) || value.id !== expected.id || value.missionId !== expected.missionId ||
      value.siteCode !== expected.siteCode || value.opportunityId !== expected.opportunityId ||
      value.chart !== expected.chart || !isArrayOfStrings(value.targetCoordinates) ||
      !isArrayOfStrings(value.audienceUids)) return false;
  const targetCoordinates = [...value.targetCoordinates].sort();
  const audienceUids = [...value.audienceUids].sort();
  return targetCoordinates.length === expected.targetCoordinates.length &&
    targetCoordinates.every((coordinate, index) => coordinate === expected.targetCoordinates[index]) &&
    audienceUids.length === expected.audienceUids.length &&
    audienceUids.every((uid, index) => uid === expected.audienceUids[index]);
}

function isChartId(value: unknown): value is ChartId {
  return value === 'A' || value === 'B' || value === 'C';
}

function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((candidate) => typeof candidate === 'string');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
