import { describe, expect, it } from 'vitest';
import { resolveWolfSuspicionClue } from './wolfSuspicionClue';

describe('Wolf suspicion clue resolution', () => {
  it.each([
    [0, 5, 1, 6, 'none', 'Nothing.'],
    [4, 2, 1, 7, 'natural-change', 'Point the change out to someone, framed as natural or accidental.'],
    [8, 2, 2, 12, 'wolf-activity', 'Point out the wolf activity to someone.'],
    [12, 2, 2, 16, 'wolf-activity-hint', 'Point out the wolf activity, and give a hint.'],
    [17, 2, 1, 20, 'strong-hint', 'Give someone a strong hint.'],
    [18, 5, 1, 24, 'traitor-name', "Give someone the traitor's name."],
  ] as const)(
    'applies suspicion before mapping total %s + %s + %s = %s',
    (oldSuspicion, increment, roll, total, clueTier, facilitatorInstruction) => {
      expect(resolveWolfSuspicionClue(oldSuspicion, increment, roll)).toEqual({
        oldSuspicion,
        increment,
        newSuspicion: oldSuspicion + increment,
        roll,
        total,
        clueTier,
        facilitatorInstruction,
      });
    },
  );

  it.each([
    [-1, 2, 1],
    [0.5, 2, 1],
    [0, 0, 1],
    [0, 2, 0],
    [0, 2, 7],
    [Number.MAX_SAFE_INTEGER, 2, 1],
    [Number.MAX_SAFE_INTEGER - 2, 2, 1],
  ])('rejects malformed or overflowing inputs', (oldSuspicion, increment, roll) => {
    expect(() => resolveWolfSuspicionClue(oldSuspicion, increment, roll)).toThrow();
  });
});
