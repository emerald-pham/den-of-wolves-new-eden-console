import { describe, expect, it } from 'vitest';
import { chooseWolfForceFieldTarget } from './wolfAttackLifecycle';

describe('pre-targeting Gorgoneion Force Field choice', () => {
  it('requires the charged Captain to choose an active fleet target before dice are rolled', () => {
    expect(chooseWolfForceFieldTarget({
      charged: true,
      targetShipId: 'dione',
      activeTargetIds: ['aegis', 'dione'],
    })).toEqual({ status: 'protected', targetShipId: 'dione' });
  });

  it('rejects an inactive target and does not fabricate a choice when the projector is not charged', () => {
    expect(() => chooseWolfForceFieldTarget({
      charged: true,
      targetShipId: 'capybara-small',
      activeTargetIds: ['aegis', 'dione'],
    })).toThrow(/active fleet target/i);
    expect(chooseWolfForceFieldTarget({
      charged: false,
      targetShipId: null,
      activeTargetIds: ['aegis', 'dione'],
    })).toEqual({ status: 'unavailable' });
    expect(() => chooseWolfForceFieldTarget({
      charged: true,
      targetShipId: null,
      activeTargetIds: ['aegis', 'dione'],
    })).toThrow(/choose one active fleet target/i);
  });
});
