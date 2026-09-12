import { describe, expect, it } from 'vitest';
import {
  CANONICAL_MISSION_CARDS,
  ICE_ASTEROIDS_B,
  missionCardForCode,
  RARE_ELEMENT_MOON_C,
} from './missionCards';

describe('canonical away mission cards', () => {
  it('encodes the routed B and C cards without implying mission execution', () => {
    expect(CANONICAL_MISSION_CARDS).toEqual([ICE_ASTEROIDS_B, RARE_ELEMENT_MOON_C]);
    expect(ICE_ASTEROIDS_B).toMatchObject({
      code: 'B',
      name: 'Ice Asteroids',
      category: 'poor',
      cardsDealt: 6,
      opportunityCount: 2,
    });
    expect(ICE_ASTEROIDS_B.opportunities).toHaveLength(2);
  });

  it('preserves each B opportunity, threshold, and reward exactly', () => {
    expect(ICE_ASTEROIDS_B.opportunities).toEqual([
      expect.objectContaining({
        id: 'B-1',
        description: 'Locate and tow in smaller ice asteroids.',
        traits: ['exploration'],
        difficulty: 17,
        criticalThreshold: null,
        reward: { success: { water: 6 }, successEffects: [], criticalBonus: null },
      }),
      expect.objectContaining({
        id: 'B-2',
        description: 'Work a large mixed rock-and-ice body for a higher yield.',
        traits: ['mining'],
        difficulty: 24,
        criticalThreshold: 30,
        reward: { success: { water: 8 }, successEffects: [], criticalBonus: { materials: 1 } },
      }),
    ]);
  });

  it('keeps missing B-specific trait and failure behavior unresolved', () => {
    expect(ICE_ASTEROIDS_B.sourceGaps).toEqual(['traitBonus', 'failure']);
    for (const opportunity of ICE_ASTEROIDS_B.opportunities) {
      expect(opportunity.traitBonus).toMatchObject({ status: 'unresolved', field: 'traitBonus' });
      expect(opportunity.failure).toMatchObject({ status: 'unresolved', field: 'failure' });
      expect(opportunity.traitBonus.reason).toMatch(/does not establish a B-specific/);
      expect(opportunity.failure.reason).toMatch(/does not establish a B-specific/);
    }
  });

  it('preserves every C opportunity, threshold, trait, and reward', () => {
    expect(RARE_ELEMENT_MOON_C).toMatchObject({
      code: 'C',
      name: 'Rare Element Moon',
      category: 'poor',
      cardsDealt: 6,
      opportunityCount: 2,
    });
    expect(RARE_ELEMENT_MOON_C.opportunities).toEqual([
      expect.objectContaining({
        id: 'C-1',
        description: 'Locate scarce but useful mineral deposits.',
        traits: ['mining', 'exploration'],
        difficulty: 20,
        criticalThreshold: null,
        reward: { success: { minerals: 2 }, successEffects: [], criticalBonus: null },
      }),
      expect.objectContaining({
        id: 'C-2',
        description: 'Study the moon’s unusually scarce minerals.',
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

  it('keeps missing C-specific trait and failure behavior unresolved', () => {
    expect(RARE_ELEMENT_MOON_C.sourceGaps).toEqual(['traitBonus', 'failure']);
    for (const opportunity of RARE_ELEMENT_MOON_C.opportunities) {
      expect(opportunity.traitBonus).toMatchObject({ status: 'unresolved', field: 'traitBonus' });
      expect(opportunity.failure).toMatchObject({ status: 'unresolved', field: 'failure' });
      expect(opportunity.traitBonus.reason).toMatch(/does not establish a C-specific/);
      expect(opportunity.failure.reason).toMatch(/does not establish a C-specific/);
    }
  });

  it('is a typed catalog lookup only; no resolution is implied', () => {
    expect(missionCardForCode('B')).toBe(ICE_ASTEROIDS_B);
    expect(missionCardForCode('C')).toBe(RARE_ELEMENT_MOON_C);
    expect(missionCardForCode('A')).toBeUndefined();
    expect(missionCardForCode('unknown')).toBeUndefined();
  });
});
