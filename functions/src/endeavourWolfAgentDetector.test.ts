import { expect, it } from 'vitest';

import {
  parseWolfAgentDetectorState,
  reserveWolfAgentDetectorTest,
} from './endeavourWolfAgentDetector';

const reserve = (state: unknown, expectedRevision: number, cycle = 2) =>
  reserveWolfAgentDetectorTest({
    progress: { 'wolf-agent-detector': 4 }, state, expectedRevision, cycle,
  });

it('permits exactly three detector test authorizations in one cycle', () => {
  const first = reserve(undefined, 0);
  const second = reserve(first.state, 1);
  const third = reserve(second.state, 2);

  expect(first).toEqual({ state: { cycle: 2, revision: 1, testsUsed: 1 }, authorization: { cycle: 2, ordinal: 1 } });
  expect(second.authorization).toEqual({ cycle: 2, ordinal: 2 });
  expect(third).toEqual({ state: { cycle: 2, revision: 3, testsUsed: 3 }, authorization: { cycle: 2, ordinal: 3 } });
  expect(() => reserve(third.state, 3)).toThrow(/all three.*cycle/i);
});

it('starts a fresh three-test allowance in the next cycle without resetting revision', () => {
  const result = reserve({ cycle: 2, revision: 3, testsUsed: 3 }, 3, 3);
  expect(result).toEqual({
    state: { cycle: 3, revision: 4, testsUsed: 1 },
    authorization: { cycle: 3, ordinal: 1 },
  });
});

it('requires the canonical four-box detector research track to be complete', () => {
  expect(() => reserveWolfAgentDetectorTest({
    progress: { 'wolf-agent-detector': 3 }, state: undefined, expectedRevision: 0, cycle: 1,
  })).toThrow(/research.*complete/i);
});

it('rejects stale revisions, backward cycles, unsafe revisions, and malformed state', () => {
  expect(() => reserve({ cycle: 2, revision: 1, testsUsed: 1 }, 0)).toThrow(/changed/i);
  expect(() => reserve({ cycle: 3, revision: 1, testsUsed: 1 }, 1, 2)).toThrow(/ahead/i);
  const saturatedCycle = Math.ceil((Number.MAX_SAFE_INTEGER - 1) / 3) + 1;
  expect(() => reserve(
    { cycle: saturatedCycle, revision: Number.MAX_SAFE_INTEGER, testsUsed: 1 },
    Number.MAX_SAFE_INTEGER,
    saturatedCycle,
  ))
    .toThrow(/cannot advance safely/i);
  expect(() => reserve({ cycle: 2, revision: 1, testsUsed: 0 }, 1)).toThrow(/malformed/i);
});

it('parses only reachable detector allowance states', () => {
  expect(parseWolfAgentDetectorState(undefined)).toEqual({ cycle: 0, revision: 0, testsUsed: 0 });
  expect(parseWolfAgentDetectorState({ cycle: 2, revision: 3, testsUsed: 3 }))
    .toEqual({ cycle: 2, revision: 3, testsUsed: 3 });
  expect(parseWolfAgentDetectorState({ cycle: 0, revision: 1, testsUsed: 0 })).toBeNull();
  expect(parseWolfAgentDetectorState({ cycle: 2, revision: 1, testsUsed: 0 })).toBeNull();
  expect(parseWolfAgentDetectorState({ cycle: 2, revision: 2, testsUsed: 3 })).toBeNull();
  expect(parseWolfAgentDetectorState({ cycle: 2, revision: 5, testsUsed: 1 })).toBeNull();
  expect(parseWolfAgentDetectorState({ cycle: 2, revision: 4, testsUsed: 4 })).toBeNull();
  expect(parseWolfAgentDetectorState({ cycle: 2, revision: 3, testsUsed: 3, targetUid: 'private' })).toBeNull();
});

it('issues only an ordinal allowance and carries no target or randomized result', () => {
  const result = reserve(undefined, 0, 1);
  expect(result.authorization).toEqual({ cycle: 1, ordinal: 1 });
  expect(result).not.toHaveProperty('targetUid');
  expect(result).not.toHaveProperty('result');
  expect(result.state).not.toHaveProperty('targetUid');
  expect(result.state).not.toHaveProperty('result');
});
