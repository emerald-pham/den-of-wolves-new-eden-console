import { expect, it } from 'vitest';
import { isPlayerGameplayLockedAtTurnZero } from './turnZero';

it('reserves Turn 0 gameplay commands for GMs', () => {
  expect(isPlayerGameplayLockedAtTurnZero(0, 'player')).toBe(true);
  expect(isPlayerGameplayLockedAtTurnZero(0, 'gm')).toBe(false);
  expect(isPlayerGameplayLockedAtTurnZero(1, 'player')).toBe(false);
  expect(isPlayerGameplayLockedAtTurnZero(undefined, 'player')).toBe(false);
});
