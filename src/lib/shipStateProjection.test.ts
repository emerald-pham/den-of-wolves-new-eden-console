import { describe, expect, it } from 'vitest';
import type { GameSession } from '@/types/game';
import { projectShipState } from './shipStateProjection';

describe('projectShipState', () => {
  it('selects one ship and allowlists operational fields', () => {
    const session = {
      id: 'session:s1',
      name: 'Test table',
      joinCode: '4821',
      phase: 'active',
      currentTurn: 2,
      createdAt: '2026-09-12T00:00:00.000Z',
      updatedAt: '2026-09-12T00:00:00.000Z',
      shipGalacticCoordinates: { aegis: '0102', capybara: '8378' },
      shipResources: {
        aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
        capybara: { ore: 0, fuel: 1, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
      },
      shipDamage: {
        aegis: { damagedSystemIds: ['reactor'], destroyed: false, privateNote: 'hidden' },
        capybara: { damagedSystemIds: ['storage'], destroyed: false },
      },
      shipSurvivors: { aegis: 220_000, capybara: 15_000 },
      shipUnrest: { aegis: 2, capybara: 8 },
      shipNavigationLogs: {
        aegis: [{
          id: 'event:jump-1', shipId: 'aegis', type: 'self-jump', origin: '0000', destination: '0102',
          occurredAt: '2026-09-12T00:00:00.000Z', stardate: '001.000000', privateNote: 'hidden',
        }],
        capybara: [{
          id: 'event:jump-2', shipId: 'capybara', type: 'self-jump', origin: '0000', destination: '8378',
          occurredAt: '2026-09-12T00:00:00.000Z', stardate: '001.000000',
        }],
      },
      maintenanceCycles: {
        aegis: {
          step: 2, revision: 4, results: { '1': 'ready', privateNote: 'hidden' },
          charges: ['jump-drive'], refuelled: [], turn: 2, privateBrief: 'hidden',
        },
        capybara: { step: 1, revision: 1, results: {}, charges: [], refuelled: [] },
      },
      shipUpgrades: { aegis: ['jump-drive', { private: 'loyalty' }], capybara: ['storage'] },
      fighterWingCounts: {
        'fighter-wing-alpha': { count: 4, revision: 1 },
        'fighter-wing-bravo': { count: 2, revision: 3 },
      },
      shipJumpStates: {
        aegis: { lastJumpTurn: 2, integrityLockedUntil: '2026-09-12T00:05:00.000Z', privateNote: 'hidden' },
        capybara: { lastJumpTurn: 1 },
      },
      shipJumpTransitions: {
        aegis: {
          id: 'event:jump-1', shipId: 'aegis', origin: '0000', destination: '0102',
          occurredAt: '2026-09-12T00:00:00.000Z', privateNote: 'hidden',
        },
        capybara: {
          id: 'event:jump-2', shipId: 'capybara', origin: '0000', destination: '8378',
          occurredAt: '2026-09-12T00:00:00.000Z',
        },
      },
      shipConsoleLocks: { aegis: true, capybara: false },
      roleBrief: { text: 'private role instructions' },
      privateLoyalty: { kind: 'wolf-agent', suspicion: 10 },
    } as unknown as GameSession;

    const projection = projectShipState(session, 'aegis');

    expect(projection).toMatchObject({
      shipId: 'aegis',
      currentTurn: 2,
      galacticCoordinate: '0102',
      population: 220_000,
      unrest: 2,
      upgrades: ['jump-drive'],
      consoleLocked: true,
      fighterWingCounts: {
        'fighter-wing-alpha': { count: 4, revision: 1 },
        'fighter-wing-bravo': { count: 2, revision: 3 },
      },
    });
    expect(projection.resources).toEqual({
      ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9,
    });
    expect(projection.damage).toEqual({ damagedSystemIds: ['reactor'], destroyed: false });
    expect(projection.navigationLogs).toEqual({
      aegis: [{
        id: 'event:jump-1', shipId: 'aegis', type: 'self-jump', origin: '0000', destination: '0102',
        occurredAt: '2026-09-12T00:00:00.000Z', stardate: '001.000000',
      }],
    });
    expect(projection.maintenanceCycle).toEqual({
      step: 2, revision: 4, results: { '1': 'ready' }, charges: ['jump-drive'], refuelled: [], turn: 2,
    });
    expect(projection.jumpState).toEqual({
      lastJumpTurn: 2, integrityLockedUntil: '2026-09-12T00:05:00.000Z',
    });
    expect(projection.jumpTransition).toEqual({
      id: 'event:jump-1', shipId: 'aegis', origin: '0000', destination: '0102',
      occurredAt: '2026-09-12T00:00:00.000Z',
    });
    expect(projection.navigationLogs).not.toHaveProperty('capybara');
    expect(projectShipState(session, 'capybara')).not.toHaveProperty('fighterWingCounts');
    expect(projection).not.toHaveProperty('roleBrief');
    expect(projection).not.toHaveProperty('privateLoyalty');
    expect(JSON.stringify(projection)).not.toMatch(/private|loyalty|wolf-agent/i);
  });
});
