import { describe, expect, it } from 'vitest';
import { shouldLoadAwayMissionDiscardPanel } from './awayMissionVisibility';

describe('shouldLoadAwayMissionDiscardPanel', () => {
  it.each([
    ['landing', undefined, undefined, 0, 0, false],
    ['player without a mission', 'session-1', 'player', 0, 0, false],
    ['player mission', 'session-1', 'player', 1, 0, true],
    ['GM without a mission', 'session-1', 'gm', 0, 0, false],
    ['GM mission', 'session-1', 'gm', 0, 1, true],
    ['GM cannot use a participant pointer', 'session-1', 'gm', 1, 0, false],
  ] as const)('%s', (_label, sessionId, role, participantPointers, gmPointers, expected) => {
    expect(shouldLoadAwayMissionDiscardPanel(
      sessionId,
      role,
      participantPointers,
      gmPointers,
    )).toBe(expected);
  });
});
