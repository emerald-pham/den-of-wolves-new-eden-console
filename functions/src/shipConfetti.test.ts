import { describe, expect, it } from 'vitest';
import { canPopShipConfetti, isFleetShipId } from './shipConfetti';

describe('Emergency Bridge Confetti Dispenser policy', () => {
  it('recognizes only ships in the fleet', () => {
    expect(isFleetShipId('aegis')).toBe(true);
    expect(isFleetShipId('snn-press-shuttle')).toBe(true);
    expect(isFleetShipId('not-a-ship')).toBe(false);
  });

  it('permits exactly one activation per ship', () => {
    expect(canPopShipConfetti([], 'aegis')).toBe(true);
    expect(canPopShipConfetti(['aegis'], 'aegis')).toBe(false);
  });
});
