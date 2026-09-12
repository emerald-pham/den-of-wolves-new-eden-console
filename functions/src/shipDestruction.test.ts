import { describe, expect, it } from 'vitest';
import {
  catastropheEventIdForShip,
  destructionTransition,
  escapePodCapacityForShip,
  PRINTED_ESCAPE_POD_CAPACITIES,
} from './shipDestruction';

describe('printed escape-pod destruction state', () => {
  it('derives capacity from crew plus passengers for every damage-deck ship', () => {
    for (const [shipId, capacity] of Object.entries(PRINTED_ESCAPE_POD_CAPACITIES)) {
      expect(capacity.podCapacity).toBe(capacity.crewCapacity + capacity.passengerCapacity);
      expect(escapePodCapacityForShip(shipId)).toEqual(capacity);
    }
  });

  it('does not fabricate capacity for small or approaching vessels', () => {
    expect(escapePodCapacityForShip('gorgoneion')).toBeUndefined();
    expect(escapePodCapacityForShip('voyage-33-0')).toBeUndefined();
  });

  it('creates one stable event for a new destruction and repairs a missing legacy event', () => {
    expect(destructionTransition('aegis', false, false)).toEqual({
      eventId: 'damage-destroyed-aegis',
      capacity: { crewCapacity: 3_000, passengerCapacity: 100, podCapacity: 3_100 },
      createEvent: true,
    });
    expect(destructionTransition('aegis', true, false).createEvent).toBe(true);
    expect(destructionTransition('aegis', true, true).createEvent).toBe(false);
    expect(catastropheEventIdForShip('aegis')).toBe('damage-destroyed-aegis');
  });

  it('rejects a vessel without an independently printed capacity', () => {
    expect(() => destructionTransition('gorgoneion', true, false))
      .toThrow(/printed escape-pod capacity/i);
  });
});
