import { describe, expect, it } from 'vitest';
import { aggregateSurvivorOutcome } from './survivorOutcome';

describe('authoritative survivor outcome', () => {
  it('totals living ships, pod evacuations, losses, and admitted vessels', () => {
    expect(aggregateSurvivorOutcome({
      cycle: 6,
      occurredAt: '2026-09-20T18:00:00.000Z',
      activeFleetShipIds: ['dione', 'aegis'],
      shipPopulations: { aegis: 2_000, dione: 25_000 },
      destroyedShipIds: ['dione'],
      escapePodCapacities: { dione: 16_000 },
      smallVesselPopulations: { gorgoneion: 900 },
      admittedVesselPopulations: { 'voyage-33-0': 39_995 },
    })).toEqual({
      type: 'survivor-outcome',
      cycle: 6,
      occurredAt: '2026-09-20T18:00:00.000Z',
      fleetShipPopulation: 27_000,
      survivingShipPopulation: 2_000,
      evacuatedPopulation: 16_000,
      escapePodCapacity: 16_000,
      lostPopulation: 9_000,
      smallVesselPopulation: 900,
      admittedVesselPopulation: 39_995,
      finalSurvivors: 58_895,
      survivingShipIds: ['aegis'],
      lostOrDestroyedShipIds: ['dione'],
    });
  });

  it('counts only the population present when a pod has spare capacity', () => {
    expect(aggregateSurvivorOutcome({
      cycle: 0,
      occurredAt: '2026-09-20T18:00:00.000Z',
      activeFleetShipIds: ['aegis'],
      shipPopulations: { aegis: 2_000 },
      destroyedShipIds: ['aegis'],
      escapePodCapacities: { aegis: 3_100 },
    })).toMatchObject({
      evacuatedPopulation: 2_000,
      escapePodCapacity: 3_100,
      lostPopulation: 0,
      finalSurvivors: 2_000,
    });
  });

  it('cannot consume theatrical announcement population or adjustment fields', () => {
    const input = {
      cycle: 2,
      occurredAt: '2026-09-20T18:00:00.000Z',
      activeFleetShipIds: ['aegis'],
      shipPopulations: { aegis: 1_500 },
      destroyedShipIds: [],
      escapePodCapacities: {},
      turnStartAnnouncement: { survivorPopulation: 999_999 },
      fleetSurvivorPopulationAdjustment: 998_499,
    };
    expect(aggregateSurvivorOutcome(input)).toMatchObject({
      fleetShipPopulation: 1_500,
      finalSurvivors: 1_500,
    });
  });

  it('fails closed when a real ledger or destroyed-ship pod authority is malformed', () => {
    expect(aggregateSurvivorOutcome({
      cycle: 2, occurredAt: 'now', activeFleetShipIds: ['aegis'],
      shipPopulations: { aegis: -1 }, destroyedShipIds: [], escapePodCapacities: {},
    })).toBeUndefined();
    expect(aggregateSurvivorOutcome({
      cycle: 2, occurredAt: 'now', activeFleetShipIds: ['aegis'],
      shipPopulations: { aegis: 1_500 }, destroyedShipIds: ['aegis'], escapePodCapacities: {},
    })).toBeUndefined();
  });
});
