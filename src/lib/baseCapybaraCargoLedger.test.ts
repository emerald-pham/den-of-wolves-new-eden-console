import { describe, expect, it } from 'vitest';
import { parseBaseCapybaraCargoState } from './baseCapybaraCargoLedger';

const zero = {
  securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0, materials: 0,
};

describe('base Capybara cargo ledger projection', () => {
  it('defaults a missing server ledger to a zero cargo track', () => {
    expect(parseBaseCapybaraCargoState(undefined)).toEqual({ revision: 0, inventory: zero });
  });

  it('accepts only the six nonnegative whole cargo tracks and a safe revision', () => {
    expect(parseBaseCapybaraCargoState({
      revision: 1,
      inventory: { ...zero, food: 4 },
    })).toEqual({ revision: 1, inventory: { ...zero, food: 4 } });
    expect(parseBaseCapybaraCargoState({
      revision: 1,
      inventory: { ...zero, scrap: 1 },
    })).toBeNull();
    expect(parseBaseCapybaraCargoState({
      revision: 1,
      inventory: { ...zero, food: 1.5 },
    })).toBeNull();
    expect(parseBaseCapybaraCargoState({ revision: Number.MAX_SAFE_INTEGER + 1, inventory: zero }))
      .toBeNull();
  });
});
