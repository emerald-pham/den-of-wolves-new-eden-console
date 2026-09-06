import { describe, expect, it } from 'vitest';
import { defineShip, defineShuttle } from './vessels/templates';
import { rolesForShip } from './roles';
import { SHIPS } from './ships';
import { INITIAL_SHIP_RESOURCES } from './resources';
import { SHIP_POPULATION_TRACKS, SHIP_SPECIFICATIONS } from './shipPopulation';
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
    }
  });

  it('does not inherit press equipment or initial docking into another shuttle', () => {
    const shuttle = defineShuttle({
      id: 'test-shuttle', name: 'Test Shuttle', shortName: 'Test', consoleName: 'Test Console',
      operator: 'Test Operator', operatorShort: 'TEST', vesselType: 'Shuttle',
      description: 'Test craft.', captainRoleId: 'test-captain',
    });
    expect(shuttle.capabilities).toEqual([]);
    expect(shuttle.initialDocking).toBeUndefined();
    expect(SHUTTLECRAFT[0]?.capabilities).toEqual(['newspaper-confetti']);
  });

  it('uses initial docking only when the server has no docking snapshot', () => {
    expect(dockingForShuttle({}, 'snn-press-shuttle')?.shipId).toBe('aegis');
    expect(dockingForShuttle({ shuttleDockings: [] }, 'snn-press-shuttle')).toBeUndefined();
    expect(dockingForShuttle({ shuttleDockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: 'NOW' },
    ] }, 'snn-press-shuttle')?.shipId).toBe('dione');
  });
});
