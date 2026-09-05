import { describe, expect, it } from 'vitest';
import {
  canPopShipConfetti,
  isFleetShipId,
  shouldLogShipConfettiEvent,
} from './shipConfetti';

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

  it('allows the SNN evidence shredder to fire repeatedly', () => {
    expect(canPopShipConfetti(['snn-press-shuttle'], 'snn-press-shuttle')).toBe(true);
  });

  it('keeps SNN evidence-shredder activations out of the GM activity log', () => {
    expect(shouldLogShipConfettiEvent('snn-press-shuttle')).toBe(false);
    expect(shouldLogShipConfettiEvent('aegis')).toBe(true);
  });
});
