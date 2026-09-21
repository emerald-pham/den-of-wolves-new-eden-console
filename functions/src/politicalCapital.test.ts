import { describe, expect, it } from 'vitest';
import { applyPoliticalCapital, politicalCapitalState } from './politicalCapital';

const input = (current: unknown, expectedRevision: number, action: 'gain' | 'spend', crisisId = 'crisis-1') => ({
  current, expectedRevision, id: `entry-${expectedRevision + 1}`, action,
  crisisId, crisisRevision: 4, crisisTitle: 'Approaching vessel', cycle: 2,
  recordedAt: '2026-09-21T22:00:00.000Z',
});

describe('political capital ledger', () => {
  it('records exact crisis-linked gains and spends without falling below zero', () => {
    const gained = applyPoliticalCapital(input(undefined, 0, 'gain'));
    expect(gained).toMatchObject({ revision: 1, balance: 1, entries: [{
      action: 'gain', amount: 1, balanceAfter: 1, crisisId: 'crisis-1', crisisRevision: 4,
    }] });
    expect(applyPoliticalCapital(input(gained, 1, 'spend'))).toMatchObject({
      revision: 2, balance: 0, entries: [expect.any(Object), { action: 'spend', balanceAfter: 0 }],
    });
    expect(() => applyPoliticalCapital(input(undefined, 0, 'spend'))).toThrow(/below zero/i);
  });

  it('grants at most once per crisis and caps the ledger at eight', () => {
    let current: unknown;
    for (let index = 0; index < 8; index += 1) {
      current = applyPoliticalCapital(input(current, index, 'gain', `crisis-${index}`));
    }
    expect(politicalCapitalState(current).balance).toBe(8);
    expect(() => applyPoliticalCapital(input(current, 8, 'gain', 'crisis-9'))).toThrow(/exceed 8/i);
    expect(() => applyPoliticalCapital(input(current, 8, 'gain', 'crisis-1'))).toThrow(/already granted/i);
  });

  it('retains exactly 32 continuous rows after older history rolls off', () => {
    let current: unknown;
    for (let revision = 0; revision < 33; revision += 1) {
      current = applyPoliticalCapital(input(
        current, revision, revision % 2 === 0 ? 'gain' : 'spend', `crisis-${revision}`,
      ));
    }
    expect(politicalCapitalState(current)).toMatchObject({ revision: 33, balance: 1 });
    expect(politicalCapitalState(current).entries).toHaveLength(32);
    expect(politicalCapitalState(current).entries[0]).toMatchObject({ action: 'spend', balanceAfter: 0 });
  });

  it('fails closed for stale, malformed, duplicate, and overflow state', () => {
    const gained = applyPoliticalCapital(input(undefined, 0, 'gain'));
    expect(() => applyPoliticalCapital(input(gained, 0, 'spend'))).toThrow(/changed/i);
    expect(() => politicalCapitalState({ revision: 1, balance: -1, entries: [] })).toThrow();
    expect(() => politicalCapitalState({ revision: 2, balance: 1,
      entries: [gained.entries[0], gained.entries[0]] })).toThrow();
    expect(() => politicalCapitalState({ revision: 1, balance: 1, entries: [] })).toThrow();
    expect(() => politicalCapitalState({ revision: 0, balance: 1, entries: [{
      ...gained.entries[0], action: 'spend', balanceAfter: 1,
    }] })).toThrow();
    expect(() => politicalCapitalState({ revision: 1, balance: 1, entries: [{
      ...gained.entries[0], action: 'spend', balanceAfter: 1,
    }] })).toThrow();
    expect(() => applyPoliticalCapital(input(undefined, Number.MAX_SAFE_INTEGER, 'gain')))
      .toThrow(/cannot advance safely/i);
  });
});
