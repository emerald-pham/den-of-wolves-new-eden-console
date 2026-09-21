import { describe, expect, it } from 'vitest';
import { VESSEL_CONTRACT_FIXTURES } from '../../tests/fixtures/vesselContracts';
import { jumpFuelCost } from './jumpDrive';
import { MAINTENANCE_RULES } from './maintenance';
import { maintenanceOrderFor } from './maintenanceOrder';
import { INITIAL_SHIP_RESOURCES } from './resources';
import { INITIAL_SHIP_SURVIVORS } from './shipPopulation';
import { SMALL_SHIP_RULES } from './smallShip';

describe('shared vessel contract fixtures: server catalog', () => {
  it.each(VESSEL_CONTRACT_FIXTURES)('$id matches the server vessel authority', (fixture) => {
    expect(maintenanceOrderFor(fixture.id)).toHaveLength(fixture.maintenanceSteps.length);

    if (fixture.kind === 'small') {
      expect(SMALL_SHIP_RULES[fixture.id]).toMatchObject({
        population: fixture.population,
        reactorCapacity: fixture.reactorCapacity,
      });
      expect(INITIAL_SHIP_RESOURCES).not.toHaveProperty(fixture.id);
      expect(INITIAL_SHIP_SURVIVORS).not.toHaveProperty(fixture.id);
      return;
    }

    expect(INITIAL_SHIP_RESOURCES[fixture.id]).toEqual(fixture.resources);
    expect(INITIAL_SHIP_SURVIVORS[fixture.id]).toBe(fixture.population);
    expect(MAINTENANCE_RULES[fixture.id]?.reactor).toBe(fixture.reactorCapacity);
    expect({
      short: jumpFuelCost(fixture.id, 'short', false),
      medium: jumpFuelCost(fixture.id, 'medium', false),
      long: jumpFuelCost(fixture.id, 'long', false),
    }).toEqual(fixture.jumpCosts);
  });

  it('drives both layers from one reference, alternate-full, and small-vessel sample', () => {
    expect(VESSEL_CONTRACT_FIXTURES.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'aegis', kind: 'full' },
      { id: 'dione', kind: 'full' },
      { id: 'gorgoneion', kind: 'small' },
    ]);
  });
});
