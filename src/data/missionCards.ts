import type { ResourceId } from './resources';
import type { ExplorationCode } from './starChart';

/**
 * Canonical source facts for the encoded away mission cards.
 *
 * This module is a catalog only. It does not deal cards, calculate totals, or
 * resolve a mission. The routed source does not establish B- or C-specific
 * trait-bonus values or score-failure consequences, so those fields remain
 * explicit unresolved values instead of acquiring permissive defaults.
 */

export const CANONICAL_MISSION_CARD_CODES = ['B', 'C'] as const;
export type CanonicalMissionCardCode = Extract<
  ExplorationCode,
  typeof CANONICAL_MISSION_CARD_CODES[number]
>;

export type MissionOpportunityTrait = 'exploration' | 'mining' | 'science';
export type MissionSourceGapField = 'traitBonus' | 'failure';

export interface MissionSourceGap<F extends MissionSourceGapField = MissionSourceGapField> {
  readonly status: 'unresolved';
  readonly field: F;
  readonly reason: string;
}

/**
 * `minerals` is a printed mission-card reward and is intentionally kept in
 * this catalog type rather than added to the ship inventory resource model.
 */
export type MissionRewardResourceId = ResourceId | 'minerals';
export type MissionRewardAmounts = Readonly<Partial<Record<MissionRewardResourceId, number>>>;

export interface MissionRewardEffect {
  readonly kind: 'crossOutResearchBoxes';
  readonly target: 'endeavour';
  readonly amount: number;
  readonly selection: 'choice';
}

export interface MissionReward {
  /** The reward on an ordinary success. */
  readonly success: MissionRewardAmounts;
  /** Non-resource effects on an ordinary success. */
  readonly successEffects: readonly MissionRewardEffect[];
  /** Additional reward granted when the critical threshold is met. */
  readonly criticalBonus: MissionRewardAmounts | null;
}

export interface MissionOpportunity {
  readonly id: `${CanonicalMissionCardCode}-${number}`;
  readonly description: string;
  readonly traits: readonly MissionOpportunityTrait[];
  readonly difficulty: number;
  readonly criticalThreshold: number | null;
  readonly traitBonus: MissionSourceGap<'traitBonus'>;
  readonly failure: MissionSourceGap<'failure'>;
  readonly reward: MissionReward;
}

export interface MissionCardDefinition {
  readonly code: CanonicalMissionCardCode;
  readonly name: string;
  readonly category: 'poor';
  readonly cardsDealt: 6;
  readonly opportunityCount: 2;
  readonly opportunities: readonly MissionOpportunity[];
  readonly sourceGaps: readonly MissionSourceGapField[];
}

const TRAIT_BONUS_GAP: MissionSourceGap<'traitBonus'> = {
  status: 'unresolved',
  field: 'traitBonus',
  reason: 'The routed source does not establish a B-specific trait-bonus value; do not infer one from generic contributing-shuttle bonuses.',
};

const FAILURE_GAP: MissionSourceGap<'failure'> = {
  status: 'unresolved',
  field: 'failure',
  reason: 'The routed source does not establish a B-specific score-failure consequence; do not infer a permissive or no-effect outcome.',
};

export const ICE_ASTEROIDS_B: MissionCardDefinition = {
  code: 'B',
  name: 'Ice Asteroids',
  category: 'poor',
  cardsDealt: 6,
  opportunityCount: 2,
  opportunities: [
    {
      id: 'B-1',
      description: 'Locate and tow in smaller ice asteroids.',
      traits: ['exploration'],
      difficulty: 17,
      criticalThreshold: null,
      traitBonus: TRAIT_BONUS_GAP,
      failure: FAILURE_GAP,
      reward: { success: { water: 6 }, successEffects: [], criticalBonus: null },
    },
    {
      id: 'B-2',
      description: 'Work a large mixed rock-and-ice body for a higher yield.',
      traits: ['mining'],
      difficulty: 24,
      criticalThreshold: 30,
      traitBonus: TRAIT_BONUS_GAP,
      failure: FAILURE_GAP,
      reward: {
        success: { water: 8 },
        successEffects: [],
        criticalBonus: { materials: 1 },
      },
    },
  ],
  sourceGaps: ['traitBonus', 'failure'],
};

const C_TRAIT_BONUS_GAP: MissionSourceGap<'traitBonus'> = {
  status: 'unresolved',
  field: 'traitBonus',
  reason: 'The routed source does not establish a C-specific trait-bonus value; do not infer one from generic contributing-shuttle bonuses.',
};

const C_FAILURE_GAP: MissionSourceGap<'failure'> = {
  status: 'unresolved',
  field: 'failure',
  reason: 'The routed source does not establish a C-specific score-failure consequence; do not infer a permissive or no-effect outcome.',
};

export const RARE_ELEMENT_MOON_C: MissionCardDefinition = {
  code: 'C',
  name: 'Rare Element Moon',
  category: 'poor',
  cardsDealt: 6,
  opportunityCount: 2,
  opportunities: [
    {
      id: 'C-1',
      description: 'Locate scarce but useful mineral deposits.',
      traits: ['mining', 'exploration'],
      difficulty: 20,
      criticalThreshold: null,
      traitBonus: C_TRAIT_BONUS_GAP,
      failure: C_FAILURE_GAP,
      reward: { success: { minerals: 2 }, successEffects: [], criticalBonus: null },
    },
    {
      id: 'C-2',
      description: 'Study the moon’s unusually scarce minerals.',
      traits: ['science'],
      difficulty: 25,
      criticalThreshold: null,
      traitBonus: C_TRAIT_BONUS_GAP,
      failure: C_FAILURE_GAP,
      reward: {
        success: {},
        successEffects: [{
          kind: 'crossOutResearchBoxes',
          target: 'endeavour',
          amount: 1,
          selection: 'choice',
        }],
        criticalBonus: null,
      },
    },
  ],
  sourceGaps: ['traitBonus', 'failure'],
};

export const CANONICAL_MISSION_CARDS: readonly MissionCardDefinition[] = [
  ICE_ASTEROIDS_B,
  RARE_ELEMENT_MOON_C,
];

export function missionCardForCode(
  code: string,
): MissionCardDefinition | undefined {
  return CANONICAL_MISSION_CARDS.find((card) => card.code === code);
}
