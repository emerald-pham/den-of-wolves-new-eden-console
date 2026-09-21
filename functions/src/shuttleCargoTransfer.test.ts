import { expect, it } from 'vitest';
import { INITIAL_SHIP_RESOURCES } from './resources';
import { SHUTTLE_CARGO_TYPES, transferShuttleCargo } from './shuttleCargoTransfer';

const base = {
  actorUid: 'holder', shuttleId: 'hummingbird', resourceId: 'food' as const,
  direction: 'load' as const, amount: 2, expectedControlRevision: 3,
  control: {
    shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'owner',
    holderUid: 'holder', revision: 3,
  },
  dockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'now' }],
  shipResources: INITIAL_SHIP_RESOURCES,
  shuttleCargo: { hummingbird: { food: 1, water: 2 } },
};

it('matches the exact printed cargo allowlists', () => {
  expect(SHUTTLE_CARGO_TYPES).toEqual({
    pallas: ['securityTeams'],
    philia: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
    highwall: ['ore', 'materials'],
    blacksmith: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
    macaw: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials', 'scrap'],
    boa: ['scrap'],
    'black-sheep': ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
    hummingbird: ['food', 'water'],
    condor: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
    chacau: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
    chepu: ['securityTeams'],
    wobbly: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
    ally: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
  });
});

it('loads and unloads only between the shuttle and its docked host', () => {
  const loaded = transferShuttleCargo(base);
  expect(loaded).toMatchObject({ hostShipId: 'quellon', shipAmount: 8, shuttleAmount: 3 });
  expect(transferShuttleCargo({
    ...base, direction: 'unload', amount: 1,
  })).toMatchObject({ shipAmount: 11, shuttleAmount: 0 });
});

it.each([
  ['foreign holder', { actorUid: 'other' }],
  ['stale custody', { expectedControlRevision: 2 }],
  ['not docked', { dockings: [] }],
  ['duplicate dock', { dockings: [...base.dockings, ...base.dockings] }],
  ['forbidden type', { resourceId: 'ore' }],
  ['insufficient source', { amount: 11 }],
  ['fractional amount', { amount: 1.5 }],
  ['missing host ledger', { shipResources: {} }],
  ['malformed host ledger', { shipResources: { quellon: { food: '10' } } }],
] as const)('rejects %s', (_label, patch) => {
  expect(() => transferShuttleCargo({ ...base, ...patch } as typeof base)).toThrow();
});

it('rejects Scrap at a host without a Scrap inventory', () => {
  expect(() => transferShuttleCargo({
    ...base, shuttleId: 'boa', resourceId: 'scrap',
    control: { ...base.control, shuttleId: 'boa' },
    dockings: [{ shuttleId: 'boa', shipId: 'aegis', dockedAt: 'now' }],
    shuttleCargo: { boa: { scrap: 1 } },
  })).toThrow(/host has no permitted inventory/i);
});
