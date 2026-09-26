import { describe, expect, it } from 'vitest';
import { parseMacawRepairLedger, resolveMacawRepair } from './macawRepair';

const base = {
  actorUid: 'holder', actorRoleId: 'capybara-captain', currentCycle: 3, expectedCycle: 3,
  expectedControlRevision: 2, expectedRepairRevision: 0, expectedHostShipId: 'capybara',
  fleetGroupVesselIds: ['capybara', 'aegis'], systemIds: ['reactor', 'storage'],
  control: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'captain', holderUid: 'holder', revision: 2 },
  dockings: [{ shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'start' }], fuelled: true,
  damage: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false }, scrap: 3,
  knownSystemIds: ['reactor', 'storage', 'jump-drive'], ledger: { cycle: 0, revision: 0, hosts: [] },
} as const;

describe('Macaw repairs', () => {
  it('spends one Scrap per selected console and records an idempotent cycle ledger', () => {
    const result = resolveMacawRepair(base);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a current Macaw repair to be ready.');
    expect(result.scrap).toBe(1);
    expect(result.damage.damagedSystemIds).toEqual(['jump-drive']);
    expect(result.ledger).toEqual({ cycle: 3, revision: 1, hosts: [{ shipId: 'capybara', systemIds: ['reactor', 'storage'] }] });
  });

  it('allows a fuelled second eligible ship and caps the ledger at two hosts', () => {
    const first = resolveMacawRepair(base);
    if (first.status !== 'ready') throw new Error('Expected the first Macaw repair to be ready.');
    const second = resolveMacawRepair({
      ...base, expectedRepairRevision: 1, expectedHostShipId: 'aegis', systemIds: ['jump-drive'],
      dockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'later' }],
      damage: { damagedSystemIds: ['jump-drive'], destroyed: false }, scrap: 2,
      ledger: first.ledger,
    });
    if (second.status !== 'ready') throw new Error('Expected the second Macaw repair to be ready.');
    expect(second.ledger.hosts).toEqual([
      { shipId: 'capybara', systemIds: ['reactor', 'storage'] },
      { shipId: 'aegis', systemIds: ['jump-drive'] },
    ]);
    expect(second.ledger.cycle).toBe(3);
    expect(second.ledger.hosts).toHaveLength(2);
    expect(() => resolveMacawRepair({
      ...base, expectedRepairRevision: 2, expectedHostShipId: 'shepherd',
      systemIds: ['reactor'],
      fleetGroupVesselIds: ['capybara', 'aegis', 'shepherd'],
      dockings: [{ shuttleId: 'macaw', shipId: 'shepherd', dockedAt: 'later' }],
      damage: { damagedSystemIds: ['reactor'], destroyed: false }, scrap: 1,
      ledger: second.ledger,
    })).toThrow(/at most two ships/i);
  });

  it.each([
    ['wrong holder role', { actorRoleId: 'capybara-recycler' }],
    ['wrong shuttle', { control: { ...base.control, shuttleId: 'boa' } }],
    ['wrong host group', { fleetGroupVesselIds: ['aegis'] }],
    ['insufficient Scrap', { scrap: 1 }],
    ['destroyed host', { damage: { damagedSystemIds: ['reactor'], destroyed: true } }],
  ])('rejects %s without a result', (_label, patch) => {
    expect(() => resolveMacawRepair({ ...base, ...patch } as never)).toThrow();
  });

  it('requires fuel for a second ship and rejects malformed history', () => {
    const first = resolveMacawRepair(base);
    expect(() => resolveMacawRepair({
      ...base, expectedRepairRevision: 1, expectedHostShipId: 'aegis', fuelled: false,
      systemIds: ['reactor'],
      dockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'later' }],
      damage: { damagedSystemIds: ['reactor'], destroyed: false }, ledger: first.ledger,
    })).toThrow(/Fuel Macaw/);
    expect(parseMacawRepairLedger({ cycle: 3, revision: 1, hosts: [{ shipId: 'capybara', systemIds: ['reactor', 'reactor'] }] })).toBeNull();
    expect(parseMacawRepairLedger({ cycle: 3, revision: 1, hosts: [{ shipId: 'aegis', systemIds: ['not-a-console'] }] })).toBeNull();
    expect(parseMacawRepairLedger({ cycle: 3, revision: 1, hosts: [{ shipId: 'aegis', systemIds: ['fighter-bay-alpha'] }] })).toEqual({
      cycle: 3, revision: 1, hosts: [{ shipId: 'aegis', systemIds: ['fighter-bay-alpha'] }],
    });
  });

  it.each([
    ['control', { control: { ...base.control, revision: 3 } }, 2, 0, 3, 3, 0, 3],
    ['repair ledger', {
      ledger: { cycle: 3, revision: 1, hosts: [{ shipId: 'capybara', systemIds: ['reactor'] }] },
      systemIds: ['storage'],
    }, 2, 0, 3, 2, 1, 3],
    ['cycle', { currentCycle: 4, expectedRepairRevision: 1,
      ledger: { cycle: 3, revision: 1, hosts: [{ shipId: 'capybara', systemIds: ['reactor'] }] } }, 2, 1, 3, 2, 1, 4],
  ])('returns fresh retry state for a stale %s after live repair limits pass', (
    _label, patch, controlRevision, repairRevision, cycle, currentControlRevision, currentRepairRevision, currentCycle,
  ) => {
    const result = resolveMacawRepair({
      ...base,
      ...patch,
      expectedControlRevision: controlRevision,
      expectedRepairRevision: repairRevision,
      expectedCycle: cycle,
    } as never);
    expect(result).toMatchObject({
      status: 'stale', currentControlRevision, currentRepairRevision, currentCycle,
    });
  });

  it('does not treat a future client revision as fresh retry state', () => {
    expect(() => resolveMacawRepair({
      ...base, expectedControlRevision: 3, expectedRepairRevision: 1, expectedCycle: 4,
    })).toThrow();
    expect(() => resolveMacawRepair({ ...base, expectedControlRevision: Number.NaN } as never)).toThrow();
    expect(() => resolveMacawRepair({ ...base, expectedCycle: Number.NaN } as never)).toThrow();
  });
});
