import { describe, expect, it } from 'vitest';
import { maintenanceOrderFor } from '../../functions/src/maintenanceOrder';
import { INITIAL_SHIP_RESOURCES as SERVER_RESOURCES } from '../../functions/src/resources';
import {
  populationForShip as serverPopulationForShip,
  populationTrackForShip as serverPopulationTrackForShip,
} from '../../functions/src/shipPopulation';
import { AEGIS_ROLE_CONSOLES } from './aegisConsoles';
import { INITIAL_SHIP_RESOURCES } from './resources';
import { SHIPS } from './ships';

const fullShipLanes = [
  {
    id: 'aegis', survivors: 2_500, thresholds: [0],
    rations: { food: [0, 3, 5, 8], water: [0, 2, 3, 6] },
    resources: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
    actions: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays'],
  },
  {
    id: 'icebreaker', survivors: 40_000, thresholds: [34_000, 25_000, 15_000, 5_000, 0],
    rations: { food: [0, 4, 9, 13], water: [0, 4, 7, 10] },
    resources: { ore: 0, fuel: 4, food: 11, water: 9, materials: 3, securityTeams: 2 },
    actions: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  },
  {
    id: 'shepherd', survivors: 30_000, thresholds: [24_000, 15_000, 5_000, 0],
    rations: { food: [0, 4, 8, 12], water: [0, 3, 6, 9] },
    resources: { ore: 0, fuel: 4, food: 10, water: 8, materials: 0, securityTeams: 2 },
    actions: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  },
  {
    id: 'quellon', survivors: 30_000, thresholds: [24_000, 15_000, 5_000, 0],
    rations: { food: [0, 4, 8, 12], water: [0, 3, 6, 9] },
    resources: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 },
    actions: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  },
  {
    id: 'refinery-124', survivors: 20_000, thresholds: [15_000, 5_000, 0],
    rations: { food: [0, 3, 7, 11], water: [0, 2, 5, 8] },
    resources: { ore: 12, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 },
    actions: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  },
] as const;

describe('full-ship identity and maintenance contracts', () => {
  it.each(fullShipLanes)(
    'keeps $id rendering data and server resolution on one authoritative definition',
    ({ id, survivors, thresholds, rations, resources, actions }) => {
      const ship = SHIPS.find((candidate) => candidate.id === id);

      expect(ship).toBeDefined();
      expect(ship).toMatchObject({
        initialSurvivors: survivors,
        resources,
        printedStatistics: {
          population: survivors,
          maintenanceSteps: Array.from({ length: actions.length }, (_, index) => index + 1),
        },
        populationTrack: { thresholds },
      });
      const renderedRations = id === 'aegis'
        ? AEGIS_ROLE_CONSOLES.admiral.rations
        : ship?.maintenance;
      expect(renderedRations).toMatchObject(rations);
      expect(INITIAL_SHIP_RESOURCES[id]).toEqual(resources);
      expect(SERVER_RESOURCES[id]).toEqual(resources);
      expect(serverPopulationForShip(id)).toBe(survivors);
      expect(serverPopulationTrackForShip(id)?.thresholds).toEqual(thresholds);
      expect(maintenanceOrderFor(id)).toEqual(actions);
    },
  );
});
