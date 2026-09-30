import {
  missionCardForCode,
  type MissionRewardEffect,
  type MissionRewardResourceId,
} from './missionCards';
import type { MissionOpportunityResolution } from './missionLifecycle';
import { missionDeck, type MissionCardId } from './missionDeck';

export interface MissionOpportunityRewardResult {
  readonly opportunityId: string;
  readonly branch: 'none' | 'success' | 'critical';
  readonly resources: Readonly<Partial<Record<MissionRewardResourceId, number>>>;
  readonly effects: readonly MissionRewardEffect[];
  readonly bulkHaulageApplied: boolean;
}

export interface MissionRewardOptions {
  /** Server-secret rolls used by the selected card's printed variable rules. */
  readonly secretD6Rolls?: Readonly<Record<string, number>>;
  /** Server-derived contributors whose base Capybara was admitted to this mission. */
  readonly bulkHaulageContributorUidsByOpportunity?: Readonly<Record<string, readonly string[]>>;
}

const CARD_IDS = new Set<string>(missionDeck().map(({ id }) => id));
const RESOURCE_IDS: readonly MissionRewardResourceId[] = [
  'ore', 'fuel', 'food', 'water', 'materials', 'securityTeams', 'scrap', 'minerals', 'survivors',
];

/**
 * Resolve only the printed reward branch for each server-calculated outcome.
 * Variable inputs and Capybara contributor membership must come from the
 * trusted server transaction; this function never accepts client arithmetic.
 */
export function resolveMissionOpportunityRewards(
  siteCode: string,
  outcomes: readonly MissionOpportunityResolution[],
  options: MissionRewardOptions = {},
): readonly MissionOpportunityRewardResult[] | null {
  const definition = missionCardForCode(siteCode);
  if (!definition || !Array.isArray(outcomes) || outcomes.length !== definition.opportunities.length) return null;
  const outcomeById = new Map<string, MissionOpportunityResolution>();
  for (const outcome of outcomes) {
    if (!isRecord(outcome) || !definition.opportunities.some(({ id }) => id === outcome.opportunityId) ||
        outcomeById.has(outcome.opportunityId) || !validOutcomeBranch(outcome)) return null;
    outcomeById.set(outcome.opportunityId, outcome);
  }
  if (outcomeById.size !== definition.opportunities.length) return null;

  const rolls = options.secretD6Rolls ?? {};
  if (!isRecord(rolls)) return null;
  const rollEligibleIds = new Set(definition.opportunities
    .filter(({ difficultyRule, reward }) => difficultyRule !== undefined || reward.successRule !== undefined)
    .map(({ id }) => id));
  const suppliedRollIds = Object.keys(rolls);
  if (suppliedRollIds.some((id) => !rollEligibleIds.has(id) || !isD6(rolls[id]))) return null;

  const haulage = options.bulkHaulageContributorUidsByOpportunity ?? {};
  if (!isRecord(haulage)) return null;
  const contributorsByOpportunity = new Map<string, readonly string[]>();
  for (const [opportunityId, rawUids] of Object.entries(haulage)) {
    if (!definition.opportunities.some(({ id }) => id === opportunityId) || !Array.isArray(rawUids) ||
        rawUids.some((uid) => !isNonEmptyString(uid)) || new Set(rawUids).size !== rawUids.length) return null;
    contributorsByOpportunity.set(opportunityId, rawUids as string[]);
  }

  const results: MissionOpportunityRewardResult[] = [];
  for (const opportunity of definition.opportunities) {
    const outcome = outcomeById.get(opportunity.id)!;
    const branch = outcome.rewardBranch;
    if (opportunity.reward.successRule && branch !== 'none' &&
        !isD6(rolls[opportunity.id])) return null;

    const resources: Partial<Record<MissionRewardResourceId, number>> = {};
    const effects: MissionRewardEffect[] = [];
    if (branch !== 'none') {
      mergeResources(resources, opportunity.reward.success);
      effects.push(...opportunity.reward.successEffects);
      if (opportunity.reward.successRule) {
        const roll = rolls[opportunity.id];
        if (!isD6(roll)) return null;
        for (const [resource, multiplier] of Object.entries(opportunity.reward.successRule.multipliers)) {
          resources[resource as MissionRewardResourceId] = (resources[resource as MissionRewardResourceId] ?? 0) +
            multiplier * roll;
        }
      }
      if (branch === 'critical') {
        if (opportunity.reward.criticalBonus) mergeResources(resources, opportunity.reward.criticalBonus);
        effects.push(...(opportunity.reward.criticalEffects ?? []));
      }
    }

    const hasBulkHaulageContributor = branch !== 'none' &&
      (contributorsByOpportunity.get(opportunity.id)?.length ?? 0) > 0;
    if (hasBulkHaulageContributor) {
      for (const resource of RESOURCE_IDS) {
        if ((resources[resource] ?? 0) > 0) resources[resource] = resources[resource]! + 1;
      }
    }
    results.push({
      opportunityId: opportunity.id,
      branch,
      resources,
      effects,
      bulkHaulageApplied: hasBulkHaulageContributor,
    });
  }
  return results;
}

export interface WarriorReclamatorHandInput {
  readonly participantUid: string;
  readonly roleId: string;
  readonly siteCode: string;
  readonly opportunityId: string;
  readonly handCardIds: readonly MissionCardId[];
  readonly choices: readonly Readonly<{ cardId: MissionCardId; resource: 'food' | 'water' | 'materials' }>[];
}

export interface WarriorReclamatorHandResult {
  readonly participantUid: string;
  readonly opportunityId: string;
  readonly discardedCardIds: readonly MissionCardId[];
  readonly resources: Readonly<Partial<Record<'food' | 'water' | 'materials', number>>>;
}

/** Convert every owned Warrior Reclamator card into one selected resource. */
export function resolveWarriorReclamatorHand(
  input: WarriorReclamatorHandInput,
): WarriorReclamatorHandResult | null {
  if (!isRecord(input) || !isNonEmptyString(input.participantUid) || input.roleId !== 'warrior-captain' ||
      !missionCardForCode(input.siteCode) || !Array.isArray(input.handCardIds) || input.handCardIds.length === 0 ||
      !Array.isArray(input.choices) || input.choices.length !== input.handCardIds.length ||
      !missionCardForCode(input.siteCode)?.opportunities.some(({ id }) => id === input.opportunityId)) return null;
  const cards = input.handCardIds;
  if (cards.some((cardId) => typeof cardId !== 'string' || !CARD_IDS.has(cardId)) ||
      new Set(cards).size !== cards.length) return null;
  const choicesByCard = new Map<string, 'food' | 'water' | 'materials'>();
  for (const choice of input.choices) {
    if (!isRecord(choice) || Object.keys(choice).some((key) => key !== 'cardId' && key !== 'resource') ||
        typeof choice.cardId !== 'string' || !cards.includes(choice.cardId as MissionCardId) ||
        !['food', 'water', 'materials'].includes(String(choice.resource)) || choicesByCard.has(choice.cardId)) return null;
    choicesByCard.set(choice.cardId, choice.resource as 'food' | 'water' | 'materials');
  }
  if (choicesByCard.size !== cards.length || cards.some((cardId) => !choicesByCard.has(cardId))) return null;
  const resources: Partial<Record<'food' | 'water' | 'materials', number>> = {};
  for (const resource of choicesByCard.values()) resources[resource] = (resources[resource] ?? 0) + 1;
  return {
    participantUid: input.participantUid,
    opportunityId: input.opportunityId,
    discardedCardIds: [...cards],
    resources,
  };
}

function validOutcomeBranch(outcome: MissionOpportunityResolution): boolean {
  if (!Number.isSafeInteger(outcome.contributorCount) || outcome.contributorCount < 0) return false;
  if (outcome.outcome === 'automatic-failure') {
    return outcome.contributorCount === 0 && outcome.rewardBranch === 'none';
  }
  if (outcome.outcome === 'failure') return outcome.contributorCount > 0 && outcome.rewardBranch === 'none';
  if (outcome.outcome === 'success') return outcome.contributorCount > 0 && outcome.rewardBranch === 'success';
  return outcome.outcome === 'critical-success' && outcome.contributorCount > 0 && outcome.rewardBranch === 'critical';
}

function mergeResources(
  target: Partial<Record<MissionRewardResourceId, number>>,
  source: Readonly<Partial<Record<MissionRewardResourceId, number>>>,
): void {
  for (const [resource, amount] of Object.entries(source)) {
    if (!RESOURCE_IDS.includes(resource as MissionRewardResourceId) || !Number.isSafeInteger(amount) ||
        (amount as number) < 0) throw new Error('Canonical mission reward catalog contains an invalid resource amount.');
    target[resource as MissionRewardResourceId] = (target[resource as MissionRewardResourceId] ?? 0) +
      (amount as number);
  }
}

function isD6(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 6;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
