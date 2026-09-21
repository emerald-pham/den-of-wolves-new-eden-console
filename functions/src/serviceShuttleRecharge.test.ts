import { describe, expect, it } from 'vitest';
import {
  parseServiceShuttleRecharges,
  resolveServiceShuttleRecharge,
  serviceRechargeDamageState,
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
} as const;

describe('service shuttle recharge', () => {
  it('adds one host charge without resolving the console effect', () => {
    expect(resolveServiceShuttleRecharge(base)).toEqual({
      hostShipId: 'shepherd',
      maintenanceCycle: {
        ...base.maintenanceCycle, revision: 9, charges: ['jump-drive', 'water-reclamation'],
      },
      ledger: {
        cycle: 2, hostShipId: 'shepherd', consoleId: 'water-reclamation', revision: 1,
      },
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
});
