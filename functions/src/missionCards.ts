/**
 * Server-owned facts for the printed away-mission cards.
 *
 * The catalog is deliberately not imported by the browser application: it
 * contains the complete mission table, which should remain hidden until the
 * facilitator reveals a discovered system. This module does not deal cards,
 * calculate totals, or resolve a mission.
 */

export const CANONICAL_MISSION_CARD_CODES = ['A', 'B', 'C'] as const;
export type CanonicalMissionCardCode = typeof CANONICAL_MISSION_CARD_CODES[number];

export type MissionOpportunityTrait = 'exploration' | 'mining' | 'science';

/** The printed card has no numeric bonus of its own. */
export interface MissionTraitBonus {
  readonly status: 'none';
  readonly amount: null;
  readonly source: 'mission-card';
  readonly genericRule: 'contributing-shuttle';
  readonly note: string;
}

/** Generic away-mission failure rules that apply to every opportunity. */
export interface MissionFailure {
  readonly status: 'generic';
  readonly noCards: 'automatic-failure';
  readonly belowDifficulty: 'possible-consequences';
  readonly note: string;
}

/**
 * `minerals` is a printed mission reward and is intentionally kept in this
 * catalog type rather than added to the ship inventory resource model.
 */
export type MissionRewardResourceId =
  | 'ore'
  | 'fuel'
  | 'food'
  | 'water'
  | 'materials'
  | 'securityTeams'
  | 'scrap'
  | 'minerals';
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
  /** No card-specific numeric bonus; generic shuttle bonuses remain separate. */
  readonly traitBonus: MissionTraitBonus;
  /** Generic away-mission failure behavior, not a fabricated card-specific effect. */
  readonly failure: MissionFailure;
  readonly reward: MissionReward;
}

export interface MissionCardDefinition {
  readonly code: CanonicalMissionCardCode;
  readonly name: string;
  readonly category: 'poor';
  readonly cardsDealt: 6;
  readonly opportunityCount: 2;
  readonly opportunities: readonly MissionOpportunity[];
}

const NO_CARD_TRAIT_BONUS: MissionTraitBonus = {
  status: 'none',
  amount: null,
  source: 'mission-card',
  genericRule: 'contributing-shuttle',
  note: 'The printed card adds no numeric trait bonus; a contributing shuttle applies its own generic bonus separately.',
};

const GENERIC_FAILURE: MissionFailure = {
  status: 'generic',
  noCards: 'automatic-failure',
  belowDifficulty: 'possible-consequences',
  note: 'An opportunity with no placed card fails automatically; a below-difficulty result may have mission consequences set by the facilitator.',
};

export const LICHEN_COVERED_ASTEROIDS_A: MissionCardDefinition = {
  code: 'A',
  name: 'Lichen-Covered Asteroids',
  category: 'poor',
  cardsDealt: 6,
  opportunityCount: 2,
  opportunities: [
    {
      id: 'A-1',
      description: 'Harvest proto-lichen from the asteroids to feed the fleet.',
      traits: ['exploration'],
      difficulty: 17,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { food: 8 }, successEffects: [], criticalBonus: null },
    },
    {
      id: 'A-2',
      description: 'Work the poor asteroid deposits for a small strytium-ore yield.',
      traits: ['mining'],
      difficulty: 24,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { ore: 3 }, successEffects: [], criticalBonus: null },
    },
  ],
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
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { water: 6 }, successEffects: [], criticalBonus: null },
    },
    {
      id: 'B-2',
      description: 'Work a large mixed rock-and-ice body for a higher yield.',
      traits: ['mining'],
      difficulty: 24,
      criticalThreshold: 30,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: { water: 8 },
        successEffects: [],
        criticalBonus: { materials: 1 },
      },
    },
  ],
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
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { minerals: 2 }, successEffects: [], criticalBonus: null },
    },
    {
      id: 'C-2',
      description: 'Study the moon’s unusually scarce minerals.',
      traits: ['science'],
      difficulty: 25,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
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
};

export const CANONICAL_MISSION_CARDS: readonly MissionCardDefinition[] = [
  LICHEN_COVERED_ASTEROIDS_A,
  ICE_ASTEROIDS_B,
  RARE_ELEMENT_MOON_C,
];

export function missionCardForCode(
  code: string,
): MissionCardDefinition | undefined {
  return CANONICAL_MISSION_CARDS.find((card) => card.code === code);
}
