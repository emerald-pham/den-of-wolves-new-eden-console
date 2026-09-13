import { describe, expect, it } from 'vitest';
import {
  ABANDONED_EXPLORER_OUTPOST_D,
  ABANDONED_REFUELLING_STATION_F,
  CANONICAL_MISSION_CARDS,
  DERELICT_RESEARCH_VESSEL_H,
  ICSS_ATHENA_SURVIVORS_E,
  ICE_ASTEROIDS_B,
  ION_NEBULA_I,
  LEVEL_5_SURVIVABLE_PLANET_G,
  LICHEN_COVERED_ASTEROIDS_A,
  missionCardForCode,
  RARE_ELEMENT_MOON_C,
} from './missionCards';

describe('server-owned canonical away mission cards', () => {
  it('keeps the complete A/B/C catalog in the Functions project', () => {
    expect(CANONICAL_MISSION_CARDS).toEqual([
      LICHEN_COVERED_ASTEROIDS_A,
      ICE_ASTEROIDS_B,
      RARE_ELEMENT_MOON_C,
      ABANDONED_EXPLORER_OUTPOST_D,
      ICSS_ATHENA_SURVIVORS_E,
      ABANDONED_REFUELLING_STATION_F,
      LEVEL_5_SURVIVABLE_PLANET_G,
      DERELICT_RESEARCH_VESSEL_H,
      ION_NEBULA_I,
    ]);
    expect(CANONICAL_MISSION_CARDS).toHaveLength(9);
    for (const card of CANONICAL_MISSION_CARDS) {
      expect(card.category).toMatch(/poor|neutral|hostile/);
      expect([6, 8]).toContain(card.cardsDealt);
      expect(card.opportunities).toHaveLength(card.opportunityCount);
    }
    expect(CANONICAL_MISSION_CARDS.slice(0, 3).every((card) => card.category === 'poor')).toBe(true);
    expect(CANONICAL_MISSION_CARDS.slice(3, 8).every((card) => card.category === 'neutral')).toBe(true);
    expect(ION_NEBULA_I.category).toBe('hostile');
  });

  it('encodes Lichen-Covered Asteroids A opportunities and rewards', () => {
    expect(LICHEN_COVERED_ASTEROIDS_A).toMatchObject({
      code: 'A',
      name: 'Lichen-Covered Asteroids',
      opportunities: [
        {
          id: 'A-1',
          traits: ['exploration'],
          difficulty: 17,
          criticalThreshold: null,
          reward: { success: { food: 8 }, successEffects: [], criticalBonus: null },
        },
        {
          id: 'A-2',
          traits: ['mining'],
          difficulty: 24,
          criticalThreshold: null,
          reward: { success: { ore: 3 }, successEffects: [], criticalBonus: null },
        },
      ],
    });
  });

  it('encodes Ice Asteroids B opportunities and critical reward', () => {
    expect(ICE_ASTEROIDS_B.opportunities).toEqual([
      expect.objectContaining({
        id: 'B-1',
        traits: ['exploration'],
        difficulty: 17,
        criticalThreshold: null,
        reward: { success: { water: 6 }, successEffects: [], criticalBonus: null },
      }),
      expect.objectContaining({
        id: 'B-2',
        traits: ['mining'],
        difficulty: 24,
        criticalThreshold: 30,
        reward: { success: { water: 8 }, successEffects: [], criticalBonus: { materials: 1 } },
      }),
    ]);
  });

  it('encodes Rare Element Moon C opportunities and research effect', () => {
    expect(RARE_ELEMENT_MOON_C.opportunities).toEqual([
      expect.objectContaining({
        id: 'C-1',
        traits: ['mining', 'exploration'],
        difficulty: 20,
        criticalThreshold: null,
        reward: { success: { minerals: 2 }, successEffects: [], criticalBonus: null },
      }),
      expect.objectContaining({
        id: 'C-2',
        traits: ['science'],
        difficulty: 25,
        criticalThreshold: null,
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
      }),
    ]);
  });

  it('encodes Abandoned Explorer Outpost D opportunities and rewards', () => {
    expect(ABANDONED_EXPLORER_OUTPOST_D).toMatchObject({
      code: 'D',
      name: 'Abandoned Explorer Outpost',
      category: 'neutral',
      cardsDealt: 6,
      opportunityCount: 3,
      opportunities: [
        {
          id: 'D-1',
          traits: ['salvage'],
          difficulty: 14,
          criticalThreshold: 20,
          description: 'Salvage from the kitchen supplies.',
          reward: { success: { food: 10 }, successEffects: [], criticalBonus: { water: 8 } },
        },
        {
          id: 'D-2',
          traits: ['salvage'],
          difficulty: 14,
          criticalThreshold: 20,
          description: 'Salvage from the engineering supplies.',
          reward: { success: { ore: 6 }, successEffects: [], criticalBonus: { materials: 3 } },
        },
        {
          id: 'D-3',
          traits: ['science'],
          difficulty: 24,
          criticalThreshold: null,
          description: 'Download exploration data from the output computers.',
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
    });
  });

  it('encodes Athena Survivors E without leaking chart coordinates', () => {
    expect(ICSS_ATHENA_SURVIVORS_E).toMatchObject({
      code: 'E',
      name: 'I.C.S.S. Athena Survivors',
      category: 'neutral',
      cardsDealt: 6,
      opportunityCount: 3,
      opportunities: [
        {
          id: 'E-1',
          traits: ['searchAndRescue'],
          difficulty: 8,
          criticalThreshold: 15,
          reward: { success: { survivors: 750 }, successEffects: [], criticalBonus: { survivors: 500 } },
        },
        {
          id: 'E-2',
          traits: ['salvage'],
          difficulty: 14,
          criticalThreshold: 25,
          reward: { success: { materials: 4 }, successEffects: [], criticalBonus: { materials: 3 } },
        },
        {
          id: 'E-3',
          traits: ['science'],
          difficulty: 24,
          criticalThreshold: null,
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
    });
    const discovery = ICSS_ATHENA_SURVIVORS_E.opportunities[2]!.reward.successEffects[0];
    expect(discovery).toEqual(expect.objectContaining({ allowedCodes: ['L', 'M'] }));
    expect(JSON.stringify(discovery)).not.toMatch(/\d{4}/);
  });

  it('encodes Abandoned Refuelling Station F opportunities and console choice', () => {
    expect(ABANDONED_REFUELLING_STATION_F).toMatchObject({
      code: 'F',
      name: 'Abandoned Refuelling Station',
      category: 'neutral',
      cardsDealt: 6,
      opportunityCount: 3,
      opportunities: [
        {
          id: 'F-1',
          traits: ['engineering'],
          difficulty: 8,
          criticalThreshold: null,
          reward: { success: { fuel: 10 }, successEffects: [], criticalBonus: null },
        },
        {
          id: 'F-2',
          traits: ['salvage'],
          difficulty: 14,
          criticalThreshold: 25,
          reward: { success: { ore: 7 }, successEffects: [], criticalBonus: { ore: 4 } },
        },
        {
          id: 'F-3',
          traits: ['science'],
          difficulty: 14,
          criticalThreshold: null,
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
    });
  });

  it('encodes Level 5 Survivable Planet G and its pursuit exception', () => {
    expect(LEVEL_5_SURVIVABLE_PLANET_G).toMatchObject({
      code: 'G',
      name: 'Level 5 Survivable Planet',
      category: 'neutral',
      cardsDealt: 8,
      opportunityCount: 3,
      siteRules: { pursuit: { kind: 'jumpDoesNotReduce', scope: 'group' }, hazards: [] },
      opportunities: [
        {
          id: 'G-1',
          traits: ['searchAndRescue'],
          difficulty: 17,
          criticalThreshold: null,
          reward: { success: { food: 20 }, successEffects: [], criticalBonus: null },
        },
        {
          id: 'G-2',
          traits: ['engineering'],
          difficulty: 17,
          criticalThreshold: null,
          reward: { success: { water: 20 }, successEffects: [], criticalBonus: null },
        },
        {
          id: 'G-3',
          traits: ['salvage'],
          difficulty: 24,
          criticalThreshold: 30,
          reward: {
            success: { materials: 6 },
            successEffects: [],
            criticalEffects: [{ kind: 'upgradeConsoles', target: 'any', amount: 1 }],
            criticalBonus: null,
          },
        },
      ],
    });
  });

  it('encodes Derelict Research Vessel H science rewards', () => {
    expect(DERELICT_RESEARCH_VESSEL_H).toMatchObject({
      code: 'H',
      name: 'Derelict Research Vessel',
      category: 'neutral',
      cardsDealt: 8,
      opportunityCount: 3,
      siteRules: { pursuit: null, hazards: [] },
      opportunities: [
        {
          id: 'H-1',
          traits: ['salvage'],
          difficulty: 17,
          criticalThreshold: null,
          reward: { success: { materials: 6, fuel: 4 }, successEffects: [], criticalBonus: null },
        },
        {
          id: 'H-2',
          traits: ['science'],
          difficulty: 17,
          criticalThreshold: null,
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
          traits: ['science'],
          difficulty: 28,
          criticalThreshold: null,
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
    });
  });

  it('encodes Ion Nebula I hazards, pursuit suppression, and local rewards', () => {
    expect(ION_NEBULA_I).toMatchObject({
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
          traits: ['engineering'],
          difficulty: 17,
          criticalThreshold: null,
          reward: {
            success: {},
            successEffects: [{ kind: 'removeNebulaDamage', scope: 'group' }],
            criticalBonus: null,
          },
        },
        {
          id: 'I-2',
          traits: ['engineering'],
          difficulty: 17,
          criticalThreshold: null,
          reward: {
            success: {},
            successEffects: [{ kind: 'noFuelOnNebulaExit', scope: 'group' }],
            criticalBonus: null,
          },
        },
        {
          id: 'I-3',
          traits: ['science'],
          difficulty: 28,
          criticalThreshold: null,
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
    });
    expect(JSON.stringify(ION_NEBULA_I)).not.toMatch(/\d{4}/);
  });

  it('represents generic bonus and failure rules without inventing card-specific effects', () => {
    for (const card of CANONICAL_MISSION_CARDS) {
      for (const opportunity of card.opportunities) {
        expect(opportunity.traitBonus).toEqual({
          status: 'none',
          amount: null,
          source: 'mission-card',
          genericRule: 'contributing-shuttle',
          note: expect.stringMatching(/contributing shuttle/i),
        });
        expect(opportunity.failure).toEqual({
          status: 'generic',
          noCards: 'automatic-failure',
          belowDifficulty: 'possible-consequences',
          note: expect.stringMatching(/no placed card|below-difficulty/i),
        });
      }
    }
  });

  it('provides lookup without dealing or resolution', () => {
    expect(missionCardForCode('A')).toBe(LICHEN_COVERED_ASTEROIDS_A);
    expect(missionCardForCode('B')).toBe(ICE_ASTEROIDS_B);
    expect(missionCardForCode('C')).toBe(RARE_ELEMENT_MOON_C);
    expect(missionCardForCode('D')).toBe(ABANDONED_EXPLORER_OUTPOST_D);
    expect(missionCardForCode('E')).toBe(ICSS_ATHENA_SURVIVORS_E);
    expect(missionCardForCode('F')).toBe(ABANDONED_REFUELLING_STATION_F);
    expect(missionCardForCode('G')).toBe(LEVEL_5_SURVIVABLE_PLANET_G);
    expect(missionCardForCode('H')).toBe(DERELICT_RESEARCH_VESSEL_H);
    expect(missionCardForCode('I')).toBe(ION_NEBULA_I);
    expect(missionCardForCode('unknown')).toBeUndefined();
  });
});
