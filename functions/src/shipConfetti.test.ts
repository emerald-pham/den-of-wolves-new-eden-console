import { describe, expect, it } from 'vitest';
import {
  canPopShipConfetti,
  confettiSignalTargets,
  isFleetShipId,
  isShipDispenserSignal,
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

  it('also signals the bridge of the ship where the SNN shuttle is docked', () => {
    expect(confettiSignalTargets('snn-press-shuttle', [
      { shuttleId: 'snn-press-shuttle', shipId: 'dione' },
      { shuttleId: 'other-shuttle', shipId: 'aegis' },
    ])).toEqual(['snn-press-shuttle', 'dione']);
    expect(confettiSignalTargets('aegis', [])).toEqual(['aegis']);
  });

  it('does not spend a bridge dispenser when its signal came from SNN', () => {
    expect(isShipDispenserSignal('snn-press-shuttle', 'aegis')).toBe(false);
    expect(isShipDispenserSignal('aegis', 'aegis')).toBe(true);
  });
});
