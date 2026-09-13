/**
 * Server-owned facts for the printed away-mission cards.
 *
 * The catalog is deliberately not imported by the browser application: it
 * contains the complete mission table, which should remain hidden until the
 * facilitator reveals a discovered system. This module does not deal cards,
 * calculate totals, or resolve a mission.
 */

export const CANONICAL_MISSION_CARD_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const;
export type CanonicalMissionCardCode = typeof CANONICAL_MISSION_CARD_CODES[number];

export type MissionOpportunityTrait =
  | 'exploration'
  | 'mining'
  | 'science'
  | 'searchAndRescue'
  | 'salvage'
  | 'engineering';

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
 * `minerals` and `survivors` are printed mission rewards and are intentionally
 * kept in this catalog type rather than added to the ship inventory resource
 * model.
 */
export type MissionRewardResourceId =
  | 'ore'
  | 'fuel'
  | 'food'
  | 'water'
  | 'materials'
  | 'securityTeams'
  | 'scrap'
  | 'minerals'
  | 'survivors';
export type MissionRewardAmounts = Readonly<Partial<Record<MissionRewardResourceId, number>>>;

export interface MissionCrossOutResearchBoxesEffect {
  readonly kind: 'crossOutResearchBoxes';
  readonly target: 'endeavour';
  readonly amount: number;
  readonly selection: 'choice';
}

export interface MissionExploreStarSystemsEffect {
  readonly kind: 'exploreStarSystems';
  readonly amount: number;
  readonly scope: 'any' | 'wolf';
  /** The printed E reward names codes L or M without exposing chart coordinates. */
  readonly allowedCodes: readonly ('L' | 'M')[] | null;
}

export interface MissionConsoleRewardChoice {
  readonly action: 'upgrade' | 'repair';
  readonly amount: number;
}

export interface MissionUpgradeOrRepairConsolesEffect {
  readonly kind: 'upgradeOrRepairConsoles';
  readonly target: 'refinery-124';
  readonly choices: readonly MissionConsoleRewardChoice[];
  readonly selection: 'choice';
}

export interface MissionUpgradeConsolesEffect {
  readonly kind: 'upgradeConsoles';
  readonly target: 'any' | 'weapon';
  readonly amount: 1 | 2 | 3;
}

export interface MissionUnlockResearchEffect {
  readonly kind: 'unlockResearch';
  readonly target: 'endeavour';
  readonly amount: 1;
  readonly selection: 'choice';
}

export interface MissionUnlockNamedResearchEffect {
  readonly kind: 'unlockNamedResearch';
  readonly target: 'endeavour';
  readonly research: readonly ['ecm', 'jumpDrive'];
  readonly selection: 'fixed';
}

export interface MissionRemoveNebulaDamageEffect {
  readonly kind: 'removeNebulaDamage';
  readonly scope: 'group';
}

export interface MissionNoFuelOnNebulaExitEffect {
  readonly kind: 'noFuelOnNebulaExit';
  readonly scope: 'group';
}

export interface MissionImmediateWolfAttackEffect {
  readonly kind: 'immediateWolfAttack';
  readonly scope: 'group';
  readonly unless: 'critical';
}

export type MissionRewardEffect =
  | MissionCrossOutResearchBoxesEffect
  | MissionExploreStarSystemsEffect
  | MissionUpgradeOrRepairConsolesEffect
  | MissionUpgradeConsolesEffect
  | MissionUnlockResearchEffect
  | MissionUnlockNamedResearchEffect
  | MissionRemoveNebulaDamageEffect
  | MissionNoFuelOnNebulaExitEffect
  | MissionImmediateWolfAttackEffect;

export interface MissionSecretD6DifficultyRule {
  readonly kind: 'secretD6Difficulty';
  readonly variable: 'X';
  readonly successMultiplier: 5;
  readonly criticalOffset: 10;
}

export interface MissionSecretD6SuccessRule {
  readonly kind: 'secretD6Multipliers';
  readonly variable: 'X';
  readonly multipliers: Readonly<{
    readonly food: 2;
    readonly water: 2;
    readonly fuel: 2;
    readonly materials: 1;
  }>;
}

export interface MissionPursuitRule {
  readonly kind: 'jumpDoesNotReduce' | 'doesNotRiseWhilePresent';
  readonly scope: 'group';
}

export interface MissionMaintenanceHazard {
  readonly kind: 'maintenanceDamage';
  readonly threshold: 3 | 4;
  readonly scope: 'group';
}

export interface MissionWolfEntryAttackRule {
  readonly kind: 'immediateWolfAttackOnEntry';
  readonly minimumBattleStations: 1 | 2;
  readonly minimumOtherShipDamage: 20 | 25;
  readonly scope: 'group';
}

export interface MissionRecurringWolfAttackRule {
  readonly kind: 'wolfAttackWhileOperational';
  readonly endsWhen: readonly ['baseDestroyed', 'jumpAway'];
  readonly scope: 'group';
}

export interface MissionSiteRules {
  /** Printed pursuit exception, if the system has one. */
  readonly pursuit: MissionPursuitRule | null;
  /** Printed environmental hazards that apply while the group is present. */
  readonly hazards: readonly MissionMaintenanceHazard[];
  /** Printed missions that can be attempted again during each turn. */
  readonly repeatability?: 'everyTurn';
  /** Printed mission lock while an active Wolf base remains operational. */
  readonly missionAccess?: 'blockedWhileWolfBaseOperational';
  /** Printed attack pressure on entering an active Wolf base. */
  readonly entryAttack?: MissionWolfEntryAttackRule;
  /** Printed recurring attack pressure until the base is cleared or fleet leaves. */
  readonly recurringAttack?: MissionRecurringWolfAttackRule;
}

export interface MissionReward {
  /** The reward on an ordinary success. */
  readonly success: MissionRewardAmounts;
  /** A printed formula for a variable ordinary success reward. */
  readonly successRule?: MissionSecretD6SuccessRule;
  /** Non-resource effects on an ordinary success. */
  readonly successEffects: readonly MissionRewardEffect[];
  /** Additional reward granted when the critical threshold is met. */
  readonly criticalBonus: MissionRewardAmounts | null;
  /** Non-resource effects granted when the critical threshold is met. */
  readonly criticalEffects?: readonly MissionRewardEffect[];
}

export interface MissionOpportunity {
  readonly id: `${CanonicalMissionCardCode}-${number}`;
  readonly description: string;
  readonly traits: readonly MissionOpportunityTrait[];
  readonly difficulty: number | null;
  /** A printed facilitator-only rule for deriving an unknown difficulty. */
  readonly difficultyRule?: MissionSecretD6DifficultyRule;
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
  readonly category: 'poor' | 'neutral' | 'hostile';
  readonly cardsDealt: 3 | 6 | 8;
  readonly opportunityCount: 1 | 2 | 3;
  readonly siteRules: MissionSiteRules;
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
  siteRules: { pursuit: null, hazards: [] },
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
  siteRules: { pursuit: null, hazards: [] },
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
  siteRules: { pursuit: null, hazards: [] },
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

export const ABANDONED_EXPLORER_OUTPOST_D: MissionCardDefinition = {
  code: 'D',
  name: 'Abandoned Explorer Outpost',
  category: 'neutral',
  cardsDealt: 6,
  opportunityCount: 3,
  siteRules: { pursuit: null, hazards: [] },
  opportunities: [
    {
      id: 'D-1',
      description: 'Salvage from the kitchen supplies.',
      traits: ['salvage'],
      difficulty: 14,
      criticalThreshold: 20,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { food: 10 }, successEffects: [], criticalBonus: { water: 8 } },
    },
    {
      id: 'D-2',
      description: 'Salvage from the engineering supplies.',
      traits: ['salvage'],
      difficulty: 14,
      criticalThreshold: 20,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { ore: 6 }, successEffects: [], criticalBonus: { materials: 3 } },
    },
    {
      id: 'D-3',
      description: 'Download exploration data from the output computers.',
      traits: ['science'],
      difficulty: 24,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{
          kind: 'exploreStarSystems',
          amount: 2,
          scope: 'any',
          allowedCodes: null,
        }],
        criticalBonus: null,
      },
    },
  ],
};

export const ICSS_ATHENA_SURVIVORS_E: MissionCardDefinition = {
  code: 'E',
  name: 'I.C.S.S. Athena Survivors',
  category: 'neutral',
  cardsDealt: 6,
  opportunityCount: 3,
  siteRules: { pursuit: null, hazards: [] },
  opportunities: [
    {
      id: 'E-1',
      description: 'Rescue survivors from the wrecks.',
      traits: ['searchAndRescue'],
      difficulty: 8,
      criticalThreshold: 15,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { survivors: 750 }, successEffects: [], criticalBonus: { survivors: 500 } },
    },
    {
      id: 'E-2',
      description: 'Salvage materials from the wreckage.',
      traits: ['salvage'],
      difficulty: 14,
      criticalThreshold: 25,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { materials: 4 }, successEffects: [], criticalBonus: { materials: 3 } },
    },
    {
      id: 'E-3',
      description: 'Download military intel from the Athena’s computer cores.',
      traits: ['science'],
      difficulty: 24,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{
          kind: 'exploreStarSystems',
          amount: 2,
          scope: 'wolf',
          allowedCodes: ['L', 'M'],
        }],
        criticalBonus: null,
      },
    },
  ],
};

export const ABANDONED_REFUELLING_STATION_F: MissionCardDefinition = {
  code: 'F',
  name: 'Abandoned Refuelling Station',
  category: 'neutral',
  cardsDealt: 6,
  opportunityCount: 3,
  siteRules: { pursuit: null, hazards: [] },
  opportunities: [
    {
      id: 'F-1',
      description: 'Drain station fuel reserves.',
      traits: ['engineering'],
      difficulty: 8,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { fuel: 10 }, successEffects: [], criticalBonus: null },
    },
    {
      id: 'F-2',
      description: 'Extract raw ore from the refinery process.',
      traits: ['salvage'],
      difficulty: 14,
      criticalThreshold: 25,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { ore: 7 }, successEffects: [], criticalBonus: { ore: 4 } },
    },
    {
      id: 'F-3',
      description: 'Identify spare parts to repair damage on Refinery 124.',
      traits: ['science'],
      difficulty: 14,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{
          kind: 'upgradeOrRepairConsoles',
          target: 'refinery-124',
          choices: [
            { action: 'upgrade', amount: 1 },
            { action: 'repair', amount: 2 },
          ],
          selection: 'choice',
        }],
        criticalBonus: null,
      },
    },
  ],
};

export const LEVEL_5_SURVIVABLE_PLANET_G: MissionCardDefinition = {
  code: 'G',
  name: 'Level 5 Survivable Planet',
  category: 'neutral',
  cardsDealt: 8,
  opportunityCount: 3,
  siteRules: {
    pursuit: { kind: 'jumpDoesNotReduce', scope: 'group' },
    hazards: [],
  },
  opportunities: [
    {
      id: 'G-1',
      description: 'Forage the abundant food from the surface.',
      traits: ['searchAndRescue'],
      difficulty: 17,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { food: 20 }, successEffects: [], criticalBonus: null },
    },
    {
      id: 'G-2',
      description: 'Filter and store fresh water from the lakes.',
      traits: ['engineering'],
      difficulty: 17,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { water: 20 }, successEffects: [], criticalBonus: null },
    },
    {
      id: 'G-3',
      description: 'Salvage from the abandoned colony’s buildings and systems.',
      traits: ['salvage'],
      difficulty: 24,
      criticalThreshold: 30,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: { materials: 6 },
        successEffects: [],
        criticalEffects: [{ kind: 'upgradeConsoles', target: 'any', amount: 1 }],
        criticalBonus: null,
      },
    },
  ],
};

export const DERELICT_RESEARCH_VESSEL_H: MissionCardDefinition = {
  code: 'H',
  name: 'Derelict Research Vessel',
  category: 'neutral',
  cardsDealt: 8,
  opportunityCount: 3,
  siteRules: { pursuit: null, hazards: [] },
  opportunities: [
    {
      id: 'H-1',
      description: 'While old and derelict there are some salvageable materials here.',
      traits: ['salvage'],
      difficulty: 17,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { materials: 6, fuel: 4 }, successEffects: [], criticalBonus: null },
    },
    {
      id: 'H-2',
      description: 'Download research notes.',
      traits: ['science'],
      difficulty: 17,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{
          kind: 'crossOutResearchBoxes',
          target: 'endeavour',
          amount: 2,
          selection: 'choice',
        }],
        criticalBonus: null,
      },
    },
    {
      id: 'H-3',
      description: 'Download and decrypt their research data cores.',
      traits: ['science'],
      difficulty: 28,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{
          kind: 'unlockResearch',
          target: 'endeavour',
          amount: 1,
          selection: 'choice',
        }],
        criticalBonus: null,
      },
    },
  ],
};

export const ION_NEBULA_I: MissionCardDefinition = {
  code: 'I',
  name: 'Ion Nebula',
  category: 'hostile',
  cardsDealt: 8,
  opportunityCount: 3,
  siteRules: {
    pursuit: { kind: 'doesNotRiseWhilePresent', scope: 'group' },
    hazards: [{ kind: 'maintenanceDamage', threshold: 3, scope: 'group' }],
  },
  opportunities: [
    {
      id: 'I-1',
      description: 'Construct lightning rods to dissipate the energy.',
      traits: ['engineering'],
      difficulty: 17,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{ kind: 'removeNebulaDamage', scope: 'group' }],
        criticalBonus: null,
      },
    },
    {
      id: 'I-2',
      description: 'Harness the nebula’s energy for fuel.',
      traits: ['engineering'],
      difficulty: 17,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{ kind: 'noFuelOnNebulaExit', scope: 'group' }],
        criticalBonus: null,
      },
    },
    {
      id: 'I-3',
      description: 'Study the nebula’s unique physics.',
      traits: ['science'],
      difficulty: 28,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{
          kind: 'unlockNamedResearch',
          target: 'endeavour',
          research: ['ecm', 'jumpDrive'],
          selection: 'fixed',
        }],
        criticalBonus: null,
      },
    },
  ],
};

export const UNSTABLE_STAR_J: MissionCardDefinition = {
  code: 'J',
  name: 'Unstable Star',
  category: 'hostile',
  cardsDealt: 3,
  opportunityCount: 1,
  siteRules: {
    pursuit: null,
    hazards: [{ kind: 'maintenanceDamage', threshold: 4, scope: 'group' }],
    repeatability: 'everyTurn',
  },
  opportunities: [
    {
      id: 'J-1',
      description: 'Mine the rich Strytium Ore deposits from the system’s asteroids.',
      traits: ['mining'],
      difficulty: 14,
      criticalThreshold: 25,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: { ore: 12 },
        successEffects: [],
        criticalBonus: { ore: 10 },
      },
    },
  ],
};

export const ABANDONED_WOLF_SUPPLY_OUTPOST_K: MissionCardDefinition = {
  code: 'K',
  name: 'Abandoned Wolf Supply Outpost',
  category: 'hostile',
  cardsDealt: 3,
  opportunityCount: 1,
  siteRules: { pursuit: null, hazards: [], repeatability: 'everyTurn' },
  opportunities: [
    {
      id: 'K-1',
      description: 'It’s impossible to tell if danger lurks in the outpost, but there are plenty of supplies.',
      traits: ['searchAndRescue'],
      difficulty: null,
      difficultyRule: {
        kind: 'secretD6Difficulty',
        variable: 'X',
        successMultiplier: 5,
        criticalOffset: 10,
      },
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successRule: {
          kind: 'secretD6Multipliers',
          variable: 'X',
          multipliers: { food: 2, water: 2, fuel: 2, materials: 1 },
        },
        successEffects: [{ kind: 'immediateWolfAttack', scope: 'group', unless: 'critical' }],
        criticalBonus: null,
      },
    },
  ],
};

export const ACTIVE_WOLF_OUTPOST_L: MissionCardDefinition = {
  code: 'L',
  name: 'Active Wolf Outpost',
  category: 'hostile',
  cardsDealt: 6,
  opportunityCount: 3,
  siteRules: {
    pursuit: null,
    hazards: [],
    missionAccess: 'blockedWhileWolfBaseOperational',
    entryAttack: {
      kind: 'immediateWolfAttackOnEntry',
      minimumBattleStations: 1,
      minimumOtherShipDamage: 20,
      scope: 'group',
    },
    recurringAttack: {
      kind: 'wolfAttackWhileOperational',
      endsWhen: ['baseDestroyed', 'jumpAway'],
      scope: 'group',
    },
  },
  opportunities: [
    {
      id: 'L-1',
      description: 'Salvage materials from the wreckage of the Wolf station.',
      traits: ['salvage'],
      difficulty: 15,
      criticalThreshold: 20,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { materials: 10 }, successEffects: [], criticalBonus: { materials: 5 } },
    },
    {
      id: 'L-2',
      description: 'Raid the Wolf fuel depot.',
      traits: ['searchAndRescue'],
      difficulty: 15,
      criticalThreshold: 20,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { ore: 10 }, successEffects: [], criticalBonus: { ore: 5 } },
    },
    {
      id: 'L-3',
      description: 'Salvage advanced Wolf weaponry.',
      traits: ['science'],
      difficulty: 25,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{ kind: 'upgradeConsoles', target: 'weapon', amount: 2 }],
        criticalBonus: null,
      },
    },
  ],
};

export const ACTIVE_WOLF_FORTRESS_M: MissionCardDefinition = {
  code: 'M',
  name: 'Active Wolf Fortress',
  category: 'hostile',
  cardsDealt: 6,
  opportunityCount: 3,
  siteRules: {
    pursuit: null,
    hazards: [],
    missionAccess: 'blockedWhileWolfBaseOperational',
    entryAttack: {
      kind: 'immediateWolfAttackOnEntry',
      minimumBattleStations: 2,
      minimumOtherShipDamage: 25,
      scope: 'group',
    },
    recurringAttack: {
      kind: 'wolfAttackWhileOperational',
      endsWhen: ['baseDestroyed', 'jumpAway'],
      scope: 'group',
    },
  },
  opportunities: [
    {
      id: 'M-1',
      description: 'Salvage materials from the wreckage of the Wolf station.',
      traits: ['salvage'],
      difficulty: 15,
      criticalThreshold: 20,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { materials: 12 }, successEffects: [], criticalBonus: { materials: 6 } },
    },
    {
      id: 'M-2',
      description: 'Raid the Wolf fuel depot.',
      traits: ['searchAndRescue'],
      difficulty: 15,
      criticalThreshold: 20,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: { success: { ore: 12 }, successEffects: [], criticalBonus: { ore: 6 } },
    },
    {
      id: 'M-3',
      description: 'Salvage advanced Wolf weaponry.',
      traits: ['science'],
      difficulty: 25,
      criticalThreshold: null,
      traitBonus: NO_CARD_TRAIT_BONUS,
      failure: GENERIC_FAILURE,
      reward: {
        success: {},
        successEffects: [{ kind: 'upgradeConsoles', target: 'weapon', amount: 3 }],
        criticalBonus: null,
      },
    },
  ],
};

export const CANONICAL_MISSION_CARDS: readonly MissionCardDefinition[] = [
  LICHEN_COVERED_ASTEROIDS_A,
  ICE_ASTEROIDS_B,
  RARE_ELEMENT_MOON_C,
  ABANDONED_EXPLORER_OUTPOST_D,
  ICSS_ATHENA_SURVIVORS_E,
  ABANDONED_REFUELLING_STATION_F,
  LEVEL_5_SURVIVABLE_PLANET_G,
  DERELICT_RESEARCH_VESSEL_H,
  ION_NEBULA_I,
  UNSTABLE_STAR_J,
  ABANDONED_WOLF_SUPPLY_OUTPOST_K,
  ACTIVE_WOLF_OUTPOST_L,
  ACTIVE_WOLF_FORTRESS_M,
];

export function missionCardForCode(
  code: string,
): MissionCardDefinition | undefined {
  return CANONICAL_MISSION_CARDS.find((card) => card.code === code);
}
