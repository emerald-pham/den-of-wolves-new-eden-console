import { describe, expect, it } from 'vitest';
import {
  CANONICAL_MISSION_CARDS,
  ICE_ASTEROIDS_B,
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
    ]);
    expect(CANONICAL_MISSION_CARDS).toHaveLength(3);
    for (const card of CANONICAL_MISSION_CARDS) {
      expect(card.category).toBe('poor');
      expect(card.cardsDealt).toBe(6);
      expect(card.opportunityCount).toBe(2);
      expect(card.opportunities).toHaveLength(2);
    }
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
    expect(missionCardForCode('D')).toBeUndefined();
    expect(missionCardForCode('unknown')).toBeUndefined();
  });
});
