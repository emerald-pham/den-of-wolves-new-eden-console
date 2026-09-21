import { describe, expect, it } from 'vitest';
import {
  parseServiceShuttleRecharges,
  resolveServiceShuttleRecharge,
  serviceRechargeDamageState,
  serviceRechargeResourceState,
  serviceRechargeUpgradeState,
} from './serviceShuttleRecharge';

const base = {
  actorUid: 'holder', shuttleId: 'black-sheep', targetConsoleId: 'water-reclamation',
  currentCycle: 2, expectedControlRevision: 3, expectedMaintenanceRevision: 8,
  control: {
    shuttleId: 'black-sheep', ownerRoleId: 'shepherd-engineer', ownerUid: 'owner',
    holderUid: 'holder', revision: 3,
  },
  dockings: [{ shuttleId: 'black-sheep', shipId: 'shepherd', dockedAt: 'now' }],
  fuelled: { 'black-sheep': true },
  maintenanceCycle: {
    step: 0, revision: 8, turn: 2, results: { '7': 'Maintenance cycle complete.' },
    charges: ['jump-drive'], refuelled: ['black-sheep'], completedAt: '2026-09-21T12:00:00.000Z',
  },
  damage: { damagedSystemIds: [], destroyed: false },
  rechargeLedger: {},
  resources: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 },
  unrest: 0,
  population: 30_000,
  cargo: {},
  upgrades: [],
  now: '2026-09-21T12:05:00.000Z',
} as const;

describe('service shuttle recharge', () => {
  it('resolves production while preserving the completed maintenance lifecycle', () => {
    expect(resolveServiceShuttleRecharge(base)).toMatchObject({
      hostShipId: 'shepherd',
      maintenanceCycle: {
        ...base.maintenanceCycle,
        step: 0,
        revision: 10,
        charges: ['jump-drive'],
        results: {
          ...base.maintenanceCycle.results,
          '5': 'Water Reclamation: generated 2 water.',
        },
      },
      ledger: {
        cycle: 2, hostShipId: 'shepherd', consoleId: 'water-reclamation', revision: 1,
      },
      immediate: true,
      resources: { water: 10 },
    });
    expect(resolveServiceShuttleRecharge(base).maintenanceCycle.completedAt)
      .toBe(base.maintenanceCycle.completedAt);
  });

  it('resolves an immediate production effect once and consumes its new charge', () => {
    const result = resolveServiceShuttleRecharge({
      ...base,
      shuttleId: 'condor', targetConsoleId: 'hydroponics',
      control: { ...base.control, shuttleId: 'condor' },
      dockings: [{ shuttleId: 'condor', shipId: 'quellon', dockedAt: 'now' }],
      fuelled: { condor: true },
    });
    expect(result).toMatchObject({
      immediate: true,
      message: 'Hydroponics: spent 1 water, generated 3 food.',
      maintenanceCycle: { revision: 10, charges: ['jump-drive'] },
      resources: { food: 13, water: 7 },
      ledger: { cycle: 2, hostShipId: 'quellon', consoleId: 'hydroponics', revision: 1 },
    });
  });

  it('leaves a deferred console charged without inventing an immediate effect', () => {
    const result = resolveServiceShuttleRecharge({
      ...base, targetConsoleId: 'jump-drive',
      maintenanceCycle: { ...base.maintenanceCycle, charges: [] },
    });
    expect(result).toMatchObject({
      immediate: false, message: 'Jump Drive charged.',
      maintenanceCycle: { revision: 9, charges: ['jump-drive'] },
      resources: base.resources,
    });
  });

  it('binds immediate production choices and rejects choices on deferred consoles', () => {
    expect(() => resolveServiceShuttleRecharge({
      ...base, targetConsoleId: 'jump-drive',
      maintenanceCycle: { ...base.maintenanceCycle, charges: [] },
      productionOreAmount: 1,
    })).toThrow(/no immediate production choice/i);
    expect(() => resolveServiceShuttleRecharge({
      ...base,
      shuttleId: 'wobbly', targetConsoleId: 'fuel-refinery',
      control: { ...base.control, shuttleId: 'wobbly' },
      dockings: [{ shuttleId: 'wobbly', shipId: 'refinery-124', dockedAt: 'now' }],
      fuelled: { wobbly: true },
      resources: { ...base.resources, ore: 5 },
    })).toThrow(/ore amount/i);
  });

  it('applies the selected Fuel Refinery amount exactly once in the resolved result', () => {
    const result = resolveServiceShuttleRecharge({
      ...base,
      shuttleId: 'wobbly', targetConsoleId: 'fuel-refinery',
      control: { ...base.control, shuttleId: 'wobbly' },
      dockings: [{ shuttleId: 'wobbly', shipId: 'refinery-124', dockedAt: 'now' }],
      fuelled: { wobbly: true },
      maintenanceCycle: { ...base.maintenanceCycle, charges: [] },
      resources: { ...base.resources, ore: 5 },
      productionOreAmount: 4,
    });
    expect(result).toMatchObject({
      immediate: true,
      message: 'Fuel Refinery: spent 4 ore, generated 4 fuel.',
      maintenanceCycle: { step: 0, revision: 10, charges: [] },
      resources: { ore: 1, fuel: 7 },
    });
  });

  it('requires and applies the selected Capybara Scrap Refinery outcome', () => {
    const result = resolveServiceShuttleRecharge({
      ...base,
      targetConsoleId: 'scrap-refinery',
      dockings: [{ shuttleId: 'black-sheep', shipId: 'capybara', dockedAt: 'now' }],
      maintenanceCycle: { ...base.maintenanceCycle, charges: [] },
      resources: { ...base.resources, scrap: 2 },
      productionScrap: true,
    });
    expect(result).toMatchObject({
      immediate: true,
      message: 'Scrap Refinery: spent 1 Scrap, generated 3 materials.',
      resources: { scrap: 1, materials: 3 },
    });
  });

  it.each(['black-sheep', 'condor', 'wobbly'] as const)('admits printed service shuttle %s', (shuttleId) => {
    expect(resolveServiceShuttleRecharge({
      ...base, shuttleId,
      control: { ...base.control, shuttleId },
      dockings: [{ shuttleId, shipId: 'shepherd', dockedAt: 'now' }],
      fuelled: { [shuttleId]: true },
    }).ledger.cycle).toBe(2);
  });

  it.each([
    ['wrong craft', { shuttleId: 'ally', control: { ...base.control, shuttleId: 'ally' } }],
    ['foreign holder', { actorUid: 'owner' }],
    ['stale custody', { expectedControlRevision: 2 }],
    ['in transit', { dockings: [] }],
    ['not fuelled', { fuelled: {} }],
    ['unfinished maintenance', { maintenanceCycle: { ...base.maintenanceCycle, completedAt: undefined } }],
    ['stale maintenance', { expectedMaintenanceRevision: 7 }],
    ['already used', { rechargeLedger: { 'black-sheep': { cycle: 2, hostShipId: 'shepherd', consoleId: 'jump-drive', revision: 1 } } }],
    ['already charged', { targetConsoleId: 'jump-drive' }],
    ['damaged console', { damage: { damagedSystemIds: ['water-reclamation'], destroyed: false } }],
    ['destroyed host', { damage: { damagedSystemIds: [], destroyed: true } }],
    ['non-console', { targetConsoleId: 'storage' }],
  ] as const)('rejects %s', (_label, patch) => {
    expect(() => resolveServiceShuttleRecharge({ ...base, ...patch })).toThrow();
  });

  it('allows a damaged Jump Drive to retain its printed departure integrity check', () => {
    expect(resolveServiceShuttleRecharge({
      ...base, targetConsoleId: 'jump-drive',
      maintenanceCycle: { ...base.maintenanceCycle, charges: [] },
      damage: { damagedSystemIds: ['jump-drive'], destroyed: false },
    }).maintenanceCycle.charges).toEqual(['jump-drive']);
  });

  it('parses only exact service-shuttle ledger entries', () => {
    const ledger = { condor: { cycle: 2, hostShipId: 'quellon', consoleId: 'hydroponics', revision: 1 } };
    expect(parseServiceShuttleRecharges(ledger)).toEqual(ledger);
    expect(parseServiceShuttleRecharges(undefined)).toEqual({});
    expect(parseServiceShuttleRecharges({ ally: ledger.condor })).toBeNull();
    expect(parseServiceShuttleRecharges({ condor: { ...ledger.condor, extra: true } })).toBeNull();
  });

  it('accepts absent legacy damage but rejects a present malformed host record', () => {
    expect(serviceRechargeDamageState(undefined, 'quellon')).toEqual({
      damagedSystemIds: [], destroyed: false,
    });
    expect(serviceRechargeDamageState({}, 'quellon')).toEqual({
      damagedSystemIds: [], destroyed: false,
    });
    expect(serviceRechargeDamageState({
      quellon: { damagedSystemIds: ['hydroponics'], destroyed: false },
    }, 'quellon')).toEqual({ damagedSystemIds: ['hydroponics'], destroyed: false });
    expect(serviceRechargeDamageState({
      quellon: { damagedSystemIds: 'hydroponics', destroyed: false },
    }, 'quellon')).toBeNull();
    expect(serviceRechargeDamageState({
      quellon: { damagedSystemIds: [], destroyed: 'true' },
    }, 'quellon')).toBeNull();
  });

  it('requires an exact selected-host resource ledger without starting-stock fallback', () => {
    expect(serviceRechargeResourceState({ shepherd: base.resources }, 'shepherd')).toEqual(base.resources);
    expect(serviceRechargeResourceState(undefined, 'shepherd')).toBeNull();
    expect(serviceRechargeResourceState({}, 'shepherd')).toBeNull();
    expect(serviceRechargeResourceState({ shepherd: { food: 10 } }, 'shepherd')).toBeNull();
    expect(serviceRechargeResourceState({ shepherd: { ...base.resources, scrap: 1 } }, 'shepherd'))
      .toBeNull();
    expect(serviceRechargeResourceState({ shepherd: { ...base.resources, water: -1 } }, 'shepherd'))
      .toBeNull();
  });

  it('accepts only known, unique string upgrades and treats absent legacy state as none', () => {
    expect(serviceRechargeUpgradeState(undefined, 'quellon')).toEqual([]);
    expect(serviceRechargeUpgradeState({}, 'quellon')).toEqual([]);
    expect(serviceRechargeUpgradeState({ quellon: ['hydroponics'] }, 'quellon'))
      .toEqual(['hydroponics']);
    expect(serviceRechargeUpgradeState({ quellon: ['invented-console'] }, 'quellon')).toBeNull();
    expect(serviceRechargeUpgradeState({ quellon: ['hydroponics', 'hydroponics'] }, 'quellon'))
      .toBeNull();
    expect(serviceRechargeUpgradeState({ quellon: [{ id: 'hydroponics' }] }, 'quellon'))
      .toBeNull();
  });
});
