import { describe, expect, it } from 'vitest';
import { parseChacauRepairLedger, resolveChacauRepair } from './chacauRepair';

const base = {
  actorUid: 'holder', actorRoleId: 'refinery-124-engineer', currentCycle: 3, expectedCycle: 3,
  expectedControlRevision: 2, expectedRepairRevision: 0,
  expectedHostShipId: 'refinery-124', fleetGroupVesselIds: ['refinery-124', 'dione', 'aegis'],
  systemIds: ['reactor'],
  control: {
    shuttleId: 'chacau', ownerRoleId: 'refinery-124-engineer',
    ownerUid: 'owner', holderUid: 'holder', revision: 2,
  },
  dockings: [{ shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'now' }],
  fuelled: false,
  damage: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false },
  materials: 12,
  knownSystemIds: ['reactor', 'storage', 'jump-drive'],
  ledger: { cycle: 0, revision: 0, hosts: [] },
} as const;

describe('Chacau repair', () => {
  it('uses the Refinery 124 Engineer craft and repairs each console for four host materials', () => {
    expect(resolveChacauRepair({ ...base, systemIds: ['reactor', 'storage'] })).toEqual({
      hostShipId: 'refinery-124', materials: 4, repairedSystemIds: ['reactor', 'storage'],
      damage: { damagedSystemIds: ['jump-drive'], destroyed: false },
      ledger: {
        cycle: 3, revision: 1,
        hosts: [{ shipId: 'refinery-124', systemIds: ['reactor', 'storage'] }],
      },
    });
  });

  it('requires fuel for one second ship and caps each ship at two consoles', () => {
    const ledger = {
      cycle: 3, revision: 1,
      hosts: [{ shipId: 'refinery-124', systemIds: ['reactor'] }],
    } as const;
    const second = {
      ...base,
      expectedRepairRevision: 1,
      ledger,
      expectedHostShipId: 'dione',
      dockings: [{ shuttleId: 'chacau', shipId: 'dione', dockedAt: 'later' }],
      damage: { damagedSystemIds: ['storage'], destroyed: false },
      knownSystemIds: ['storage'],
      systemIds: ['storage'],
    };
    expect(() => resolveChacauRepair(second)).toThrow(/Fuel Chacau/);
    const fuelledSecond = resolveChacauRepair({ ...second, fuelled: true });
    expect(fuelledSecond.ledger.hosts).toHaveLength(2);
    expect(fuelledSecond.ledger.hosts[1]).toEqual({ shipId: 'dione', systemIds: ['storage'] });

    expect(() => resolveChacauRepair({
      ...base,
      expectedRepairRevision: 1,
      ledger: {
        cycle: 3, revision: 1,
        hosts: [{ shipId: 'refinery-124', systemIds: ['reactor', 'storage'] }],
      },
      systemIds: ['jump-drive'],
    })).toThrow(/at most two consoles/);
  });

  it('does not allow a third ship even when Chacau is fuelled', () => {
    expect(() => resolveChacauRepair({
      ...base,
      expectedRepairRevision: 2,
      fuelled: true,
      expectedHostShipId: 'aegis',
      ledger: {
        cycle: 3, revision: 2,
        hosts: [
          { shipId: 'refinery-124', systemIds: ['reactor'] },
          { shipId: 'dione', systemIds: ['storage'] },
        ],
      },
      dockings: [{ shuttleId: 'chacau', shipId: 'aegis', dockedAt: 'third' }],
      systemIds: ['jump-drive'],
    })).toThrow(/at most two ships/);
  });

  it('starts a new cycle allowance while keeping the repair revision monotonic', () => {
    expect(resolveChacauRepair({
      ...base,
      expectedRepairRevision: 7,
      ledger: { cycle: 2, revision: 7, hosts: [{ shipId: 'dione', systemIds: ['reactor'] }] },
    }).ledger).toEqual({
      cycle: 3, revision: 8,
      hosts: [{ shipId: 'refinery-124', systemIds: ['reactor'] }],
    });
  });

  it.each([
    ['foreign holder', { actorUid: 'other' }],
    ['wrong assigned role', { actorRoleId: 'dione-engineer' }],
    ['wrong shuttle identity', { control: { ...base.control, shuttleId: 'philia' } }],
    ['copied Philia owner', { control: { ...base.control, ownerRoleId: 'dione-engineer' } }],
    ['stale control', { expectedControlRevision: 1 }],
    ['stale cycle', { expectedCycle: 2 }],
    ['stale repair ledger', { expectedRepairRevision: 1 }],
    ['stale expected host', { expectedHostShipId: 'dione' }],
    ['host outside the current fleet group', { fleetGroupVesselIds: ['dione'] }],
    ['invalid repair revision', { expectedRepairRevision: -1 }],
    ['unknown console', { systemIds: ['invented'] }],
    ['duplicate console', { systemIds: ['reactor', 'reactor'] }],
    ['more than two consoles', { systemIds: ['reactor', 'storage', 'jump-drive'] }],
    ['insufficient materials', { materials: 3 }],
    ['destroyed host', { damage: { damagedSystemIds: ['reactor'], destroyed: true } }],
    ['undamaged console', {
      systemIds: ['storage'], damage: { damagedSystemIds: ['reactor', 'jump-drive'], destroyed: false },
    }],
    ['no Chacau docking', { dockings: [] }],
    ['duplicate Chacau dockings', { dockings: [
      { shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'now' },
      { shuttleId: 'chacau', shipId: 'dione', dockedAt: 'later' },
    ] }],
  ])('rejects %s without producing a result', (_label, change) => {
    expect(() => resolveChacauRepair({ ...base, ...change } as typeof base)).toThrow();
  });

  it('rejects selecting a console already recorded for this host and cycle', () => {
    expect(() => resolveChacauRepair({
      ...base,
      expectedRepairRevision: 1,
      expectedHostShipId: 'refinery-124',
      ledger: {
        cycle: 3, revision: 1,
        hosts: [{ shipId: 'refinery-124', systemIds: ['reactor'] }],
      },
      systemIds: ['reactor'],
    })).toThrow(/already repaired/);
  });

  it('parses only bounded, unique repair history', () => {
    expect(parseChacauRepairLedger(undefined)).toEqual({ cycle: 0, revision: 0, hosts: [] });
    expect(parseChacauRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'refinery-124', systemIds: ['reactor'] }],
    })).toMatchObject({ cycle: 3, revision: 1 });
    expect(parseChacauRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'aegis', systemIds: ['fighter-bay-alpha'] }],
    })).toMatchObject({ cycle: 3, revision: 1 });
    expect(parseChacauRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'aegis', systemIds: ['not-a-damage-card'] }],
    })).toBeNull();
    expect(parseChacauRepairLedger({
      cycle: 3, revision: 1, hosts: [
        { shipId: 'refinery-124', systemIds: ['reactor'] },
        { shipId: 'refinery-124', systemIds: ['storage'] },
      ],
    })).toBeNull();
    expect(parseChacauRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'unknown-ship', systemIds: ['reactor'] }],
    })).toBeNull();
    expect(parseChacauRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'refinery-124', systemIds: ['reactor', 'reactor'] }],
    })).toBeNull();
    expect(parseChacauRepairLedger({
      cycle: 3, revision: 1, unexpected: true,
      hosts: [{ shipId: 'refinery-124', systemIds: ['reactor'] }],
    })).toBeNull();
  });
});
