import { expect, it } from 'vitest';
import { normalizePoliticalCapital } from './politicalCapitalState';

it('hydrates only an exact bounded political capital ledger', () => {
  const valid = { revision: 1, balance: 1, entries: [{
    id: 'one', action: 'gain', amount: 1, balanceAfter: 1, crisisId: 'crisis-1',
    crisisRevision: 4, crisisTitle: 'Approaching vessel', cycle: 2,
    recordedAt: '2026-09-21T22:00:00.000Z',
  }] };
  expect(normalizePoliticalCapital(valid)).toEqual(valid);
  expect(normalizePoliticalCapital({ ...valid, balance: -1 })).toEqual({ revision: 0, balance: 0, entries: [] });
  expect(normalizePoliticalCapital({ ...valid, extra: true })).toEqual({ revision: 0, balance: 0, entries: [] });
  expect(normalizePoliticalCapital({ ...valid, entries: [{ ...valid.entries[0], action: 'award' }] }))
    .toEqual({ revision: 0, balance: 0, entries: [] });
  expect(normalizePoliticalCapital({ ...valid, revision: 2 })).toEqual({ revision: 0, balance: 0, entries: [] });
  expect(normalizePoliticalCapital({ ...valid, entries: [{ ...valid.entries[0], action: 'spend' }] }))
    .toEqual({ revision: 0, balance: 0, entries: [] });
});
