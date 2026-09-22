import { describe, expect, it } from 'vitest';
import {
  parseEndeavourResearchCadenceState,
  resolveEndeavourResearchChoice,
  type EndeavourResearchCadenceState,
  type EndeavourResearchFunding,
} from './endeavourResearchCadence';
import type { EndeavourResearchTrackId } from './endeavourResearch';

const empty: EndeavourResearchCadenceState = { cycle: 0, revision: 0, choices: [] };

function choose(
  state: unknown,
  progress: unknown,
  trackId: EndeavourResearchTrackId,
  funding: EndeavourResearchFunding = 'standard',
  shepherdOre = 20,
  cycle = 2,
) {
  const revision = typeof state === 'object' && state !== null && 'revision' in state
    ? Number(state.revision)
    : 0;
  return resolveEndeavourResearchChoice({
    state, progress, cycle, expectedRevision: revision, trackId, funding, shepherdOre,
  });
}

describe('Endeavour research cadence', () => {
  it('allows exactly three distinct standard choices in one cycle', () => {
    const one = choose(empty, {}, 'reactor');
    const two = choose(one.state, one.progress, 'jump-drive');
    const three = choose(two.state, two.progress, 'hydroponics');

    expect(three.state).toEqual({
      cycle: 2, revision: 3,
      choices: [
        { trackId: 'reactor', funding: 'standard', oreCost: 0 },
        { trackId: 'jump-drive', funding: 'standard', oreCost: 0 },
        { trackId: 'hydroponics', funding: 'standard', oreCost: 0 },
      ],
    });
    expect(three.progress).toEqual({ reactor: 1, 'jump-drive': 1, hydroponics: 1 });
    expect(three.remainingShepherdOre).toBe(20);
    expect(() => choose(three.state, three.progress, 'water-reclamation')).toThrow(/all three standard/i);
  });

  it('allows no more than two additional distinct choices and spends five Shepherd ore each', () => {
    const one = choose(empty, {}, 'reactor', 'shepherd-ore', 12);
    expect(one.remainingShepherdOre).toBe(7);
    const two = choose(one.state, one.progress, 'jump-drive', 'shepherd-ore', one.remainingShepherdOre);
    expect(two.remainingShepherdOre).toBe(2);
    expect(() => choose(two.state, two.progress, 'hydroponics', 'shepherd-ore', 20))
      .toThrow(/both additional/i);
  });

  it('allows each track only once across standard and ore-funded choices', () => {
    const one = choose(empty, {}, 'reactor');
    expect(() => choose(one.state, one.progress, 'reactor', 'shepherd-ore'))
      .toThrow(/at most once per cycle/i);
  });

  it('requires five available ore before applying an additional choice', () => {
    expect(() => choose(empty, {}, 'reactor', 'shepherd-ore', 4)).toThrow(/needs 5 ore/i);
  });

  it('resets choice counts on a later cycle while preserving progress and monotonic revision', () => {
    const prior: EndeavourResearchCadenceState = {
      cycle: 2, revision: 5,
      choices: [
        { trackId: 'reactor', funding: 'standard', oreCost: 0 },
        { trackId: 'jump-drive', funding: 'standard', oreCost: 0 },
        { trackId: 'hydroponics', funding: 'standard', oreCost: 0 },
      ],
    };
    const result = choose(prior, { reactor: 1, 'jump-drive': 1, hydroponics: 1 }, 'reactor', 'standard', 20, 3);
    expect(result.state).toEqual({
      cycle: 3, revision: 6,
      choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }],
    });
    expect(result.progress).toEqual({ reactor: 2, 'jump-drive': 1, hydroponics: 1 });
  });

  it('rejects stale revisions, future-cycle state, invalid funding, ore, and completed tracks', () => {
    expect(() => resolveEndeavourResearchChoice({
      state: empty, progress: {}, cycle: 2, expectedRevision: 1,
      trackId: 'reactor', funding: 'standard', shepherdOre: 0,
    })).toThrow(/changed/i);
    expect(() => choose({
      cycle: 3, revision: 1,
      choices: [{ trackId: 'jump-drive', funding: 'standard', oreCost: 0 }],
    }, {}, 'reactor', 'standard', 0, 2))
      .toThrow(/ahead/i);
    expect(() => choose(empty, {}, 'reactor', 'invalid' as never)).toThrow(/unknown.*funding/i);
    expect(() => choose(empty, {}, 'reactor', 'standard', -1)).toThrow(/non-negative integer/i);
    expect(() => choose(empty, {}, 'reactor', 'standard', Number.MAX_SAFE_INTEGER + 1))
      .toThrow(/non-negative integer/i);
    expect(() => choose(empty, { reactor: 5 }, 'reactor')).toThrow(/already complete/i);
  });

  it('rejects an exhausted revision without changing state or research progress', () => {
    const state = Object.freeze({
      cycle: 2, revision: Number.MAX_SAFE_INTEGER,
      choices: Object.freeze([
        Object.freeze({ trackId: 'reactor' as const, funding: 'standard' as const, oreCost: 0 as const }),
      ]),
    });
    const progress = Object.freeze({ reactor: 1 });
    expect(() => choose(state, progress, 'jump-drive')).toThrow(/revision cannot advance safely/i);
    expect(state).toEqual({
      cycle: 2, revision: Number.MAX_SAFE_INTEGER,
      choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }],
    });
    expect(progress).toEqual({ reactor: 1 });
  });

  it('parses only canonical, distinct, in-limit cadence state', () => {
    expect(parseEndeavourResearchCadenceState(undefined)).toEqual(empty);
    const valid = {
      cycle: 2, revision: 4,
      choices: [
        { trackId: 'reactor', funding: 'standard', oreCost: 0 },
        { trackId: 'jump-drive', funding: 'shepherd-ore', oreCost: 5 },
      ],
    };
    expect(parseEndeavourResearchCadenceState(valid)).toEqual(valid);
    for (const malformed of [
      null, 0, [], new Date(),
      { ...valid, extra: true },
      { ...valid, choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 5 }] },
      { ...valid, choices: [...valid.choices, valid.choices[0]] },
      { cycle: 0, revision: 1, choices: valid.choices },
      { cycle: 0, revision: 5, choices: [] },
      { cycle: 2, revision: 0, choices: [valid.choices[0]] },
      { cycle: 2, revision: 5, choices: [] },
      { cycle: 2, revision: 1, choices: [
        { trackId: 'reactor', funding: 'standard', oreCost: 0 },
        { trackId: 'jump-drive', funding: 'standard', oreCost: 0 },
        { trackId: 'hydroponics', funding: 'standard', oreCost: 0 },
        { trackId: 'water-reclamation', funding: 'standard', oreCost: 0 },
      ] },
    ]) expect(parseEndeavourResearchCadenceState(malformed)).toBeNull();
  });
});
