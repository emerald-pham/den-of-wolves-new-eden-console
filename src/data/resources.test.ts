import { describe, expect, it } from 'vitest';
import {
  INITIAL_SHIP_RESOURCES,
  RESOURCE_DEFINITIONS,
  resourcesForShip,
  shipUnrest,
} from './resources';

describe('fleet resources', () => {
  it('defines the printed resource names and uses without inventing mechanics', () => {
    expect(RESOURCE_DEFINITIONS).toEqual([
      { id: 'ore', label: 'Strytium Ore', notes: 'Refined into fuel by Refinery 124 / Capybara' },
      { id: 'fuel', label: 'Strytium Fuel', notes: 'Jump drives, shuttle refuelling' },
      { id: 'food', label: 'Food', notes: 'Maintenance rations' },
      { id: 'water', label: 'Water', notes: 'Maintenance rations' },
      { id: 'materials', label: 'Materials', notes: 'Repairs, upgrades, fighters' },
      { id: 'securityTeams', label: 'Security Teams', notes: 'Boarding defence' },
      { id: 'scrap', label: 'Scrap', notes: 'Capybara expansion only' },
    ]);
  });

  it('locks the printed starting stock to every fleet ship', () => {
    expect(INITIAL_SHIP_RESOURCES).toEqual({
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
      dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 0, securityTeams: 2 },
      icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 3, securityTeams: 2 },
      shepherd: { ore: 0, fuel: 4, food: 10, water: 8, materials: 0, securityTeams: 2 },
      quellon: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 },
      'refinery-124': { ore: 12, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 },
      capybara: {
        ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3,
      },
    });
  });

  it('uses starting stock for legacy sessions and overlays authoritative values', () => {
    expect(resourcesForShip('aegis')).toEqual(INITIAL_SHIP_RESOURCES.aegis);
    expect(resourcesForShip('aegis', { aegis: { fuel: 2, food: 7 } })).toEqual({
      ...INITIAL_SHIP_RESOURCES.aegis,
      fuel: 2,
      food: 7,
    });
  });

  it('keeps malformed persisted values out of the client projection', () => {
    expect(resourcesForShip('aegis', {
      aegis: { fuel: -2, food: 1.5, water: Number.POSITIVE_INFINITY },
    })).toMatchObject({ fuel: 0, food: 0, water: 0 });
    expect(resourcesForShip('capybara', { capybara: { scrap: -1 } })?.scrap).toBe(0);
  });

  it('does not restore stock from malformed root or ship containers', () => {
    expect(resourcesForShip('aegis', null)).toEqual({
      ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0,
    });
    expect(resourcesForShip('aegis', { aegis: null })).toEqual({
      ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0,
    });
    expect(resourcesForShip('aegis', {})).toEqual(INITIAL_SHIP_RESOURCES.aegis);
  });

  it('normalizes legacy unrest readings to the authoritative 0–10 range', () => {
    expect(shipUnrest({ aegis: -4, capybara: 14 })).toMatchObject({ aegis: 0, capybara: 10 });
  });
});
