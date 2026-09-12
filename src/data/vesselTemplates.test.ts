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
