import { describe, expect, it } from 'vitest';
import { VESSEL_CONTRACT_FIXTURES } from '../../tests/fixtures/vesselContracts';
import { findVessel } from './ships';

describe('shared vessel contract fixtures: client catalog', () => {
  it.each(VESSEL_CONTRACT_FIXTURES)('$id matches the client vessel definition', (fixture) => {
    const vessel = findVessel(fixture.id);

    expect(vessel?.printedStatistics).toEqual(expect.objectContaining({
      population: fixture.population,
      reactorCapacity: fixture.reactorCapacity,
      maintenanceSteps: fixture.maintenanceSteps,
      ...('jumpCosts' in fixture ? { jumpCosts: fixture.jumpCosts } : {}),
    }));
    expect('resources' in fixture && fixture.kind === 'full' && vessel && 'resources' in vessel
      ? vessel.resources
      : undefined).toEqual('resources' in fixture ? fixture.resources : undefined);
  });

  it('keeps the alternate full ship and small ship materially distinct from AEGIS', () => {
    const [aegis, dione, gorgoneion] = VESSEL_CONTRACT_FIXTURES;
    expect(dione).not.toMatchObject({
      population: aegis.population,
      reactorCapacity: aegis.reactorCapacity,
      maintenanceSteps: aegis.maintenanceSteps,
      jumpCosts: aegis.jumpCosts,
      resources: aegis.resources,
    });
    expect(gorgoneion).toMatchObject({ kind: 'small', maintenanceSteps: [1, 2, 3, 4] });
    expect(gorgoneion).not.toHaveProperty('resources');
  });
});
