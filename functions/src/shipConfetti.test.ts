import { describe, expect, it } from 'vitest';
import {
  confettiActivationDecision,
  canPopShipConfetti,
  confettiSignalTargets,
  isFleetShipId,
  isShipDispenserSignal,
  shouldLogShipConfettiEvent,
} from './shipConfetti';

describe('Emergency Bridge Confetti Dispenser policy', () => {
  it('requires two distinct non-captains on an ordinary ship', () => {
    expect(confettiActivationDecision(
      'dione', 'dione-engineer', 'u1', [], ['u1', 'u2'],
    )).toEqual({
      kind: 'awaiting-officer',
      approvals: [{ roleId: 'dione-engineer', uid: 'u1' }],
    });
    expect(confettiActivationDecision('dione', 'dione-president', 'u2', [
      { roleId: 'dione-engineer', uid: 'u1' },
    ], ['u1', 'u2'])).toEqual({ kind: 'fire', actorRoleName: 'Engineer + President' });
    expect(confettiActivationDecision('dione', 'dione-president', 'u1', [
      { roleId: 'dione-engineer', uid: 'u1' },
    ], ['u1', 'u2'])).toEqual({
      kind: 'awaiting-officer',
      approvals: [{ roleId: 'dione-engineer', uid: 'u1' }],
    });
  });

  it('lets the only connected non-captain fire an ordinary ship', () => {
    expect(confettiActivationDecision('dione', 'dione-engineer', 'u1', [], ['u1']))
      .toEqual({ kind: 'fire', actorRoleName: 'Engineer' });
  });

  it('lets a captain, or Capybara single non-captain, fire immediately', () => {
    expect(confettiActivationDecision('dione', 'dione-captain', 'u1', []))
      .toEqual({ kind: 'fire', actorRoleName: 'Captain' });
    expect(confettiActivationDecision('capybara', 'capybara-recycler', 'u1', []))
      .toEqual({ kind: 'fire', actorRoleName: 'Capybara Recycler' });
  });

  it('rejects roles that do not belong to the ship', () => {
    expect(() => confettiActivationDecision('dione', 'quellon-engineer', 'u1', []))
      .toThrow(/role.*ship/i);
  });

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
