import { describe, expect, it } from 'vitest';
import { calculateArrestPosseSize } from './arrestPosse';

describe('arrest posse size', () => {
  it.each([
    [0, 0, undefined, 6],
    [4, 2, undefined, 8],
    [5, 0, undefined, 5],
    [9, 1, undefined, 6],
    [10, 0, undefined, 4],
    [14, 2, undefined, 6],
    [15, 0, undefined, 3],
    [24, 0, undefined, 2],
    [25, 0, undefined, 1],
    [30, 0, undefined, 0],
    [5, 2, -1, 6],
    [5, 2, 1, 8],
  ])(
    'uses one fewer required player per five suspicion, then adds defenders and adjustment',
    (suspicion, defenders, adjustment, expected) => {
      expect(calculateArrestPosseSize(suspicion, defenders, adjustment)).toBe(expected);
    },
  );

  it.each([
    [-1, 0, undefined],
    [0.5, 0, undefined],
    [Number.NaN, 0, undefined],
    [0, -1, undefined],
    [0, 0.5, undefined],
    [0, Number.NaN, undefined],
    [0, 0, 0],
    [0, 0, 2],
    [0, 0, '1'],
    [0, 0, null],
    [0, Number.MAX_SAFE_INTEGER, undefined],
  ])('rejects malformed or overflowing input', (suspicion, defenders, adjustment) => {
    expect(() => calculateArrestPosseSize(suspicion, defenders, adjustment)).toThrow();
  });
});
