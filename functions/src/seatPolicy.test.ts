import { describe, expect, it } from 'vitest';
import { canClaimSeat, shouldClearSeatPointer } from './seatPolicy';

describe('seat policy', () => {
  it('allows a player without a seat to claim one', () => {
    expect(canClaimSeat(null)).toBe(true);
  });

  it('prevents a player from accumulating a second seat', () => {
    expect(canClaimSeat('seat-1')).toBe(false);
  });

  it('clears a player pointer only when it names the released seat', () => {
    expect(shouldClearSeatPointer('seat-1', 'seat-1')).toBe(true);
    expect(shouldClearSeatPointer('seat-2', 'seat-1')).toBe(false);
    expect(shouldClearSeatPointer(null, 'seat-1')).toBe(false);
  });
});
