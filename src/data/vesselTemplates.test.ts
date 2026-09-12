import { describe, expect, it } from 'vitest';
import { defineShip, defineShuttle } from './vessels/templates';
import { rolesForShip } from './roles';
import {
  ALL_VESSEL_DEFINITIONS,
  CORE_SHIPS,
  findVessel,
  findVesselForMode,
  SHIPS,
  SMALL_SHIPS,
  VOYAGE_33_0,
} from './ships';
import { INITIAL_SHIP_RESOURCES } from './resources';
import { INITIAL_SHIP_SURVIVORS, SHIP_POPULATION_TRACKS, SHIP_SPECIFICATIONS } from './shipPopulation';
import { SHUTTLECRAFT, dockingForShuttle } from './shuttles';

describe('shared vessel templates', () => {
  it('inherits the common workspace while retaining explicit ship overrides', () => {
    const ship = SHIPS[0]!;
    const { workspace, ...identity } = ship;
    expect(workspace).toBe('aegis');
    expect(defineShip(identity).workspace).toBe('scaffold');
    expect(defineShip({ ...identity, workspace: 'aegis' }).workspace).toBe('aegis');
  });

  it('derives existing public catalogs from each vessel definition', () => {
    for (const ship of SHIPS) {
      expect(INITIAL_SHIP_RESOURCES[ship.id]).toEqual(ship.resources);
      expect(ship.roles).toEqual(rolesForShip(ship.id));
      expect(SHIP_POPULATION_TRACKS[ship.id]).toEqual(ship.populationTrack);
      expect(SHIP_SPECIFICATIONS[ship.id]).toEqual(ship.specifications);
      expect(INITIAL_SHIP_SURVIVORS[ship.id]).toBe(ship.initialSurvivors);
    }
  });

  it('defines dimensions, capacities, and current survivors for every fleet ship', () => {
    for (const ship of SHIPS) {
      expect(ship.specifications).toEqual({
        length: expect.any(String),
        tonnage: expect.any(Number),
        crewCapacity: expect.any(Number),
        passengerCapacity: expect.any(Number),
      });
      expect(ship.initialSurvivors).toEqual(expect.any(Number));
    }
  });

  it('matches the printed statistics for every full vessel sheet', () => {
    const expected = [
      { id: 'aegis', nation: 'Interstellar Council Service Navy', vesselType: 'Battleship / carrier',
        capacity: { length: '250m', tonnage: 80_000, crewCapacity: 3_000, passengerCapacity: 100 },
        population: 2_500, jumpCosts: { short: 2, medium: 3, long: 6 }, reactorCapacity: 5, steps: 7 },
      { id: 'dione', nation: 'Federated Atlantic Syndicate', vesselType: 'Luxury cruiser',
        capacity: { length: '550m', tonnage: 500_000, crewCapacity: 4_000, passengerCapacity: 12_000 },
        population: 100_000, jumpCosts: { short: 2, medium: 4, long: 8 }, reactorCapacity: 4, steps: 6 },
      { id: 'icebreaker', nation: 'Confederated People of Asia', vesselType: 'Mining vessel',
        capacity: { length: '800m', tonnage: 1_200_000, crewCapacity: 10_000, passengerCapacity: 100 },
        population: 40_000, jumpCosts: { short: 3, medium: 6, long: 12 }, reactorCapacity: 4, steps: 6 },
      { id: 'shepherd', nation: 'Rosal', vesselType: 'Supply vessel',
        capacity: { length: '700m', tonnage: 750_000, crewCapacity: 4_000, passengerCapacity: 4_000 },
        population: 30_000, jumpCosts: { short: 3, medium: 6, long: 12 }, reactorCapacity: 3, steps: 6 },
      { id: 'quellon', nation: 'Proxima', vesselType: 'Water hauler',
        capacity: { length: '600m', tonnage: 700_000, crewCapacity: 6_500, passengerCapacity: 10 },
        population: 30_000, jumpCosts: { short: 2, medium: 4, long: 8 }, reactorCapacity: 3, steps: 6 },
      { id: 'refinery-124', nation: 'Gliese', vesselType: 'Refinery station',
        capacity: { length: '500km', tonnage: 450_000, crewCapacity: 5_000, passengerCapacity: 0 },
        population: 20_000, jumpCosts: { short: 2, medium: 4, long: 8 }, reactorCapacity: 4, steps: 6 },
      { id: 'capybara', nation: 'South American Nations', vesselType: 'Supply ship',
        capacity: { length: '600m', tonnage: 800_000, crewCapacity: 5_000, passengerCapacity: 500 },
        population: 20_000, jumpCosts: { short: 3, medium: 6, long: 12 }, reactorCapacity: 3, steps: 6 },
    ] as const;

    for (const reference of expected) {
      const ship = SHIPS.find(candidate => candidate.id === reference.id);
      expect(ship).toBeDefined();
      expect(ship).toMatchObject({ nation: reference.nation, vesselType: reference.vesselType });
      expect(ship?.printedStatistics).toMatchObject({
        capacity: reference.capacity,
        population: reference.population,
        jumpCosts: reference.jumpCosts,
        reactorCapacity: reference.reactorCapacity,
        maintenanceSteps: Array.from({ length: reference.steps }, (_, index) => index + 1),
      });
      expect(SHIP_SPECIFICATIONS[reference.id]).toEqual(reference.capacity);
      expect(INITIAL_SHIP_SURVIVORS[reference.id]).toBe(reference.population);
    }
  });

  it('encodes the applicable statistics for supplemental vessels without setup capacity', () => {
    const expected = [
      { id: 'gorgoneion', nation: 'Interstellar Council Service Navy', vesselType: 'Frigate', population: 1_000, reactorCapacity: 2 },
      { id: 'capybara-small', nation: 'South American Nations', vesselType: 'Supply ship', population: 2_000, reactorCapacity: 2 },
      { id: 'warrior', nation: 'Rosal', vesselType: 'Salvage vessel', population: 2_000, reactorCapacity: 1 },
      { id: 'vulcan', nation: 'Proxima', vesselType: 'Prison ship', population: 15_000, reactorCapacity: 2 },
      { id: 'voyage-33-0', nation: 'Gliese', vesselType: 'Damaged star cruiser', population: 40_000, reactorCapacity: 1 },
    ] as const;

    for (const reference of expected) {
      const vessel = findVessel(reference.id);
      expect(vessel).toMatchObject({
        nation: reference.nation,
        vesselType: reference.vesselType,
        printedStatistics: {
          capacity: null,
          population: reference.population,
          jumpCosts: { short: 1, medium: 1, long: 2 },
          reactorCapacity: reference.reactorCapacity,
          maintenanceSteps: [1, 2, 3, 4],
        },
      });
    }
  });

  it('keeps damage cards and suits out of the client vessel catalog', () => {
    expect(JSON.stringify(SHIPS)).not.toMatch(/[♥♦♣♠]|damageDeck|"card"/);
  });

  it('registers every optional vessel as a distinct identity without adding it to core setup', () => {
    expect(CORE_SHIPS).toHaveLength(6);
    expect(SMALL_SHIPS.map((vessel) => vessel.id)).toEqual([
      'gorgoneion', 'capybara-small', 'warrior', 'vulcan',
    ]);
    expect(VOYAGE_33_0.id).toBe('voyage-33-0');
    expect(VOYAGE_33_0.kind).toBe('voyage');
    expect(new Set(ALL_VESSEL_DEFINITIONS.map((vessel) => vessel.id)).size)
      .toBe(ALL_VESSEL_DEFINITIONS.length);
    expect(SHIPS).not.toContain(VOYAGE_33_0);
    expect(findVessel('gorgoneion')).toBe(SMALL_SHIPS[0]);
  });

  it('keeps the base small-ship Capybara separate from expansion Capybara', () => {
    expect(findVessel('capybara-small')?.name).toBe('Capybara');
    expect(findVessel('capybara')?.name).toBe('Capybara');
    expect(findVessel('capybara-small')?.id).not.toBe(findVessel('capybara')?.id);
    expect(findVesselForMode('capybara-small', 'base-capybara')?.id).toBe('capybara-small');
    expect(findVesselForMode('capybara', 'expansion-capybara')?.id).toBe('capybara');
    expect(findVesselForMode('capybara-small', 'expansion-capybara')).toBeUndefined();
    expect(findVesselForMode('capybara', 'base-capybara')).toBeUndefined();
    expect(findVesselForMode('capybara', 'none')).toBeUndefined();
  });

  it('does not inherit press equipment or initial docking into another shuttle', () => {
    const shuttle = defineShuttle({
      id: 'test-shuttle', name: 'Test Shuttle', shortName: 'Test', consoleName: 'Test Console',
      operator: 'Test Operator', operatorShort: 'TEST', vesselType: 'Shuttle',
      description: 'Test craft.', captainRoleId: 'test-captain',
    });
    expect(shuttle.capabilities).toEqual([]);
    expect(shuttle.initialDocking).toBeUndefined();
    expect(SHUTTLECRAFT[0]?.capabilities).toEqual(['press-dispatches', 'newspaper-confetti']);
  });

  it('uses initial docking only when the server has no docking snapshot', () => {
    expect(dockingForShuttle({}, 'snn-press-shuttle')?.shipId).toBe('dione');
    expect(dockingForShuttle({ shuttleDockings: [] }, 'snn-press-shuttle')).toBeUndefined();
    expect(dockingForShuttle({ shuttleDockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: 'NOW' },
    ] }, 'snn-press-shuttle')?.shipId).toBe('dione');
  });
});
