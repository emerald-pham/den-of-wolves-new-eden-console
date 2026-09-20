import { describe, expect, it } from 'vitest';
import {
  MAINTENANCE_ORDERS,
  maintenanceActionForStep,
  maintenanceOrderFor,
} from './maintenanceOrder';

const fullSixStepShips = [
  'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara',
] as const;
const supplementalFourStepShips = [
  'gorgoneion', 'capybara-small', 'warrior', 'vulcan', 'voyage-33-0',
] as const;

describe('registered vessel maintenance order', () => {
  it('registers all seven full-ship lanes in printed order', () => {
    expect(MAINTENANCE_ORDERS.aegis).toEqual([
      'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays',
    ]);
    for (const shipId of fullSixStepShips) {
      expect(maintenanceOrderFor(shipId)).toEqual([
        'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays',
      ]);
    }
    expect(Array.from({ length: 9 }, (_, step) => maintenanceActionForStep('aegis', step)))
      .toEqual(['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays', 'end']);
    for (const shipId of fullSixStepShips) {
      expect(Array.from({ length: 8 }, (_, step) => maintenanceActionForStep(shipId, step)))
        .toEqual(['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'end']);
    }
  });

  it('registers each small vessel and Voyage 33-0 with its four-step lane', () => {
    for (const shipId of supplementalFourStepShips) {
      expect(maintenanceOrderFor(shipId)).toEqual(['rations', 'unrest', 'riot', 'reactor']);
      expect([
        maintenanceActionForStep(shipId, 0),
        maintenanceActionForStep(shipId, 1),
        maintenanceActionForStep(shipId, 2),
        maintenanceActionForStep(shipId, 3),
        maintenanceActionForStep(shipId, 4),
        maintenanceActionForStep(shipId, 5),
      ]).toEqual(['begin', 'rations', 'unrest', 'riot', 'reactor', 'end']);
    }
  });

  it('rejects unknown vessels and steps outside a registered lane', () => {
    expect(maintenanceActionForStep('unregistered', 0)).toBeUndefined();
    expect(maintenanceActionForStep('aegis', -1)).toBeUndefined();
    expect(maintenanceActionForStep('aegis', 9)).toBeUndefined();
  });
});
