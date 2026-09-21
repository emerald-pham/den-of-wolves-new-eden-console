import { describe, expect, it } from 'vitest';
import { parseHighwallMiningState, resolveHighwallMining } from './highwallMining';

const base = {
  state: { cycle: 2, revision: 0, operations: [] }, currentCycle: 2,
  expectedRevision: 0, fuelled: false, resource: 'materials' as const,
  requestId: 'mine-1', rolls: [4], cargo: { ore: 3, materials: 2 },
};

describe('Highwall mining', () => {
  it('adds one material die or three ore dice to Highwall cargo', () => {
    expect(resolveHighwallMining(base)).toMatchObject({
      cargo: { materials: 6, ore: 3 },
      operation: { resource: 'materials', rolls: [4], amount: 4 },
      state: { cycle: 2, revision: 1 },
    });
    expect(resolveHighwallMining({ ...base, resource: 'ore', rolls: [2, 5, 3] })).toMatchObject({
      cargo: { materials: 2, ore: 13 },
      operation: { resource: 'ore', amount: 10 },
    });
  });

  it('allows two operations normally and a third only while fuelled', () => {
    const state = {
      cycle: 2, revision: 2,
      operations: [
        { requestId: 'one', resource: 'materials' as const, rolls: [2], amount: 2 },
        { requestId: 'two', resource: 'ore' as const, rolls: [1, 2, 3], amount: 6 },
      ],
    };
    expect(() => resolveHighwallMining({ ...base, state, expectedRevision: 2 }))
      .toThrow(/fuel it.*third/i);
    expect(resolveHighwallMining({ ...base, state, expectedRevision: 2, fuelled: true }).state.operations)
      .toHaveLength(3);
  });

  it('resets operation count on a new cycle while preserving monotonic revision', () => {
    const result = resolveHighwallMining({
      ...base, currentCycle: 3, expectedRevision: 2,
      state: {
        cycle: 2, revision: 2,
        operations: [
          { requestId: 'one', resource: 'materials', rolls: [2], amount: 2 },
          { requestId: 'two', resource: 'materials', rolls: [3], amount: 3 },
        ],
      },
    });
    expect(result.state).toMatchObject({ cycle: 3, revision: 3, operations: [{ requestId: 'mine-1' }] });
  });

  it('rejects state from a future cycle', () => {
    expect(() => resolveHighwallMining({
      ...base, currentCycle: 2,
      state: { cycle: 3, revision: 0, operations: [] },
    })).toThrow(/ahead.*current cycle/i);
  });

  it('rejects stale revisions and wrong server dice', () => {
    expect(() => resolveHighwallMining({ ...base, expectedRevision: 1 })).toThrow(/changed/i);
    expect(() => resolveHighwallMining({ ...base, resource: 'ore', rolls: [6] })).toThrow(/3 server dice/i);
  });

  it('parses only exact internally consistent state', () => {
    const state = resolveHighwallMining(base).state;
    expect(parseHighwallMiningState(state)).toEqual(state);
    expect(parseHighwallMiningState(undefined)).toEqual({ cycle: 0, revision: 0, operations: [] });
    expect(parseHighwallMiningState({ ...state, extra: true })).toBeNull();
    expect(parseHighwallMiningState({ ...state, operations: [{ ...state.operations[0], amount: 5 }] }))
      .toBeNull();
    expect(parseHighwallMiningState({
      cycle: 2, revision: 2,
      operations: [state.operations[0], state.operations[0]],
    })).toBeNull();
  });
});
