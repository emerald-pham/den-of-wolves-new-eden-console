import { describe, expect, it } from 'vitest';
import { parsePhiliaRepairLedger, resolvePhiliaRepair } from './philiaRepair';

const base = {
  actorUid: 'holder', currentCycle: 3, expectedControlRevision: 2, expectedRepairRevision: 0,
  systemIds: ['reactor'],
  control: { shuttleId: 'philia', ownerRoleId: 'dione-engineer', ownerUid: 'owner', holderUid: 'holder', revision: 2 },
  dockings: [{ shuttleId: 'philia', shipId: 'dione', dockedAt: 'now' }],
  fuelled: false,
  damage: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false },
  materials: 12,
  knownSystemIds: ['reactor', 'storage', 'jump-drive'],
  ledger: { cycle: 0, revision: 0, hosts: [] },
} as const;

describe('Philia repair', () => {
  it('spends four materials per console and removes only the selected damage', () => {
    expect(resolvePhiliaRepair({ ...base, systemIds: ['reactor', 'storage'] })).toEqual({
      hostShipId: 'dione', materials: 4, repairedSystemIds: ['reactor', 'storage'],
      damage: { damagedSystemIds: ['jump-drive'], destroyed: false },
      ledger: { cycle: 3, revision: 1, hosts: [{ shipId: 'dione', systemIds: ['reactor', 'storage'] }] },
    });
  });

  it('requires fuel for a second ship, allows that one additional ship, and caps repairs at two consoles per host', () => {
    const ledger = { cycle: 3, revision: 1, hosts: [{ shipId: 'dione', systemIds: ['reactor'] }] } as const;
    const second = {
      ...base,
      expectedRepairRevision: 1,
      ledger,
      dockings: [{ shuttleId: 'philia', shipId: 'icebreaker', dockedAt: 'later' }],
      damage: { damagedSystemIds: ['storage'], destroyed: false },
      knownSystemIds: ['storage'],
      systemIds: ['storage'],
    };
    expect(() => resolvePhiliaRepair(second)).toThrow(/Fuel Philia/);
    const fuelledSecond = resolvePhiliaRepair({ ...second, fuelled: true });
    expect(fuelledSecond.ledger.hosts).toHaveLength(2);
    expect(fuelledSecond.ledger.hosts[1]).toEqual({ shipId: 'icebreaker', systemIds: ['storage'] });
    expect(() => resolvePhiliaRepair({
      ...base,
      expectedRepairRevision: 1,
      ledger: { cycle: 3, revision: 1, hosts: [{ shipId: 'dione', systemIds: ['reactor', 'storage'] }] },
      systemIds: ['jump-drive'],
    })).toThrow(/at most two consoles/);
    expect(() => resolvePhiliaRepair({
      ...base,
      expectedRepairRevision: 2,
      fuelled: true,
      ledger: {
        cycle: 3, revision: 2,
        hosts: [
          { shipId: 'dione', systemIds: ['reactor'] },
          { shipId: 'icebreaker', systemIds: ['storage'] },
        ],
      },
      dockings: [{ shuttleId: 'philia', shipId: 'shepherd', dockedAt: 'third' }],
      systemIds: ['jump-drive'],
    })).toThrow(/at most two ships/);
  });

  it('resets the per-cycle host allowance while keeping the monotonic revision', () => {
    const result = resolvePhiliaRepair({
      ...base,
      expectedRepairRevision: 7,
      ledger: { cycle: 2, revision: 7, hosts: [{ shipId: 'dione', systemIds: ['reactor'] }] },
    });
    expect(result.ledger).toEqual({
      cycle: 3, revision: 8, hosts: [{ shipId: 'dione', systemIds: ['reactor'] }],
    });
  });

  it.each([
    ['foreign holder', { actorUid: 'other' }],
    ['wrong owner', { control: { ...base.control, ownerRoleId: 'icebreaker-engineer' } }],
    ['stale control', { expectedControlRevision: 1 }],
    ['stale repair ledger', { expectedRepairRevision: 1 }],
    ['unknown console', { systemIds: ['invented'] }],
    ['duplicate console', { systemIds: ['reactor', 'reactor'] }],
    ['more than two consoles', { systemIds: ['reactor', 'storage', 'jump-drive'] }],
    ['insufficient materials', { materials: 3 }],
    ['destroyed host', { damage: { damagedSystemIds: ['reactor'], destroyed: true } }],
    ['undamaged console', {
      systemIds: ['storage'],
      damage: { damagedSystemIds: ['reactor', 'jump-drive'], destroyed: false },
    }],
    ['duplicate Philia dockings', { dockings: [
      { shuttleId: 'philia', shipId: 'dione', dockedAt: 'now' },
      { shuttleId: 'philia', shipId: 'icebreaker', dockedAt: 'later' },
    ] }],
  ])('rejects %s without producing a result', (_label, change) => {
    expect(() => resolvePhiliaRepair({ ...base, ...change })).toThrow();
  });

  it('parses only bounded unique repair history', () => {
    expect(parsePhiliaRepairLedger(undefined)).toEqual({ cycle: 0, revision: 0, hosts: [] });
    expect(parsePhiliaRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'dione', systemIds: ['reactor'] }],
    })).toMatchObject({ cycle: 3, revision: 1 });
    expect(parsePhiliaRepairLedger({
      cycle: 3, revision: 1, hosts: [
        { shipId: 'dione', systemIds: ['reactor'] },
        { shipId: 'dione', systemIds: ['storage'] },
      ],
    })).toBeNull();
    expect(parsePhiliaRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'unknown-ship', systemIds: ['reactor'] }],
    })).toBeNull();
    expect(parsePhiliaRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'dione', systemIds: ['reactor', 'reactor'] }],
    })).toBeNull();
    expect(parsePhiliaRepairLedger({
      cycle: 3, revision: 1, unexpected: true,
      hosts: [{ shipId: 'dione', systemIds: ['reactor'] }],
    })).toBeNull();
  });
});
