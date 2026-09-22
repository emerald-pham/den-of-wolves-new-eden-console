import { describe, expect, it } from 'vitest';
import { parseAllyRepairLedger, resolveAllyRepair } from './allyRepair';

const base = {
  actorUid: 'union-holder', currentCycle: 3, expectedControlRevision: 2, expectedRepairRevision: 0,
  systemIds: ['reactor'],
  control: {
    shuttleId: 'ally', ownerRoleId: 'joint-engineering-shepherd-icebreaker',
    ownerUid: 'union-owner', holderUid: 'union-holder', revision: 2,
  },
  dockings: [{ shuttleId: 'ally', shipId: 'shepherd', dockedAt: 'facilitator-set' }],
  fuelled: false,
  damage: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false },
  materials: 12,
  knownSystemIds: ['reactor', 'storage', 'jump-drive'],
  ledger: { cycle: 0, revision: 0, hosts: [] },
} as const;

describe('Ally repair', () => {
  it('uses the real Ally and Joint Engineering Union identity on its live dock', () => {
    expect(resolveAllyRepair({ ...base, systemIds: ['reactor', 'storage'] })).toEqual({
      hostShipId: 'shepherd', materials: 4, repairedSystemIds: ['reactor', 'storage'],
      damage: { damagedSystemIds: ['jump-drive'], destroyed: false },
      ledger: { cycle: 3, revision: 1, hosts: [{ shipId: 'shepherd', systemIds: ['reactor', 'storage'] }] },
    });
  });

  it('allows the facilitator-set Icebreaker dock and never assumes a copied craft starting host', () => {
    expect(resolveAllyRepair({
      ...base,
      dockings: [{ shuttleId: 'ally', shipId: 'icebreaker', dockedAt: 'facilitator-set' }],
      systemIds: ['storage'],
      damage: { damagedSystemIds: ['storage'], destroyed: false },
      knownSystemIds: ['storage'],
    }).hostShipId).toBe('icebreaker');
  });

  it('requires recorded fuel for a second Union ship and rejects a third host', () => {
    const ledger = { cycle: 3, revision: 1, hosts: [{ shipId: 'shepherd', systemIds: ['reactor'] }] } as const;
    const second = {
      ...base,
      expectedRepairRevision: 1,
      ledger,
      dockings: [{ shuttleId: 'ally', shipId: 'icebreaker', dockedAt: 'later' }],
      damage: { damagedSystemIds: ['storage'], destroyed: false },
      knownSystemIds: ['storage'],
      systemIds: ['storage'],
    };
    expect(() => resolveAllyRepair(second)).toThrow(/Fuel Ally/);
    expect(resolveAllyRepair({ ...second, fuelled: true }).ledger.hosts).toEqual([
      { shipId: 'shepherd', systemIds: ['reactor'] },
      { shipId: 'icebreaker', systemIds: ['storage'] },
    ]);
    expect(() => resolveAllyRepair({
      ...second,
      expectedRepairRevision: 2,
      ledger: {
        cycle: 3, revision: 2,
        hosts: [{ shipId: 'shepherd', systemIds: ['reactor', 'storage'] }],
      },
      dockings: [{ shuttleId: 'ally', shipId: 'shepherd', dockedAt: 'second' }],
      systemIds: ['jump-drive'],
      knownSystemIds: ['jump-drive'],
      damage: { damagedSystemIds: ['jump-drive'], destroyed: false },
      fuelled: true,
    })).toThrow(/at most two consoles on one ship/);
  });

  it('resets per-cycle host allowance while keeping the revision monotonic', () => {
    expect(resolveAllyRepair({
      ...base,
      expectedRepairRevision: 7,
      ledger: { cycle: 2, revision: 7, hosts: [{ shipId: 'icebreaker', systemIds: ['reactor'] }] },
    }).ledger).toEqual({
      cycle: 3, revision: 8, hosts: [{ shipId: 'shepherd', systemIds: ['reactor'] }],
    });
  });

  it.each([
    ['Philía shuttle identity', { control: { ...base.control, shuttleId: 'philia' } }],
    ['Chacau shuttle identity', { control: { ...base.control, shuttleId: 'chacau' } }],
    ['wrong owner role', { control: { ...base.control, ownerRoleId: 'dione-engineer' } }],
    ['foreign holder', { actorUid: 'other' }],
    ['stale control revision', { expectedControlRevision: 1 }],
    ['stale repair revision', { expectedRepairRevision: 1 }],
    ['outside Union host pair', { dockings: [{ shuttleId: 'ally', shipId: 'dione', dockedAt: 'now' }] }],
    ['duplicate Ally docks', { dockings: [
      { shuttleId: 'ally', shipId: 'shepherd', dockedAt: 'now' },
      { shuttleId: 'ally', shipId: 'icebreaker', dockedAt: 'later' },
    ] }],
    ['unknown console', { systemIds: ['invented'] }],
    ['duplicate console', { systemIds: ['reactor', 'reactor'] }],
    ['more than two consoles', { systemIds: ['reactor', 'storage', 'jump-drive'] }],
    ['insufficient materials', { materials: 3 }],
    ['destroyed host', { damage: { damagedSystemIds: ['reactor'], destroyed: true } }],
    ['undamaged console', { systemIds: ['storage'], damage: { damagedSystemIds: ['reactor', 'jump-drive'], destroyed: false } }],
  ])('rejects %s before creating a result', (_label, change) => {
    expect(() => resolveAllyRepair({ ...base, ...change })).toThrow();
  });

  it('parses only bounded Ally-cycle repair history', () => {
    expect(parseAllyRepairLedger(undefined)).toEqual({ cycle: 0, revision: 0, hosts: [] });
    expect(parseAllyRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'shepherd', systemIds: ['reactor'] }],
    })).toMatchObject({ cycle: 3, revision: 1 });
    expect(parseAllyRepairLedger({
      cycle: 3, revision: 1, hosts: [{ shipId: 'dione', systemIds: ['reactor'] }],
    })).toBeNull();
    expect(parseAllyRepairLedger({
      cycle: 3, revision: 1, hosts: [
        { shipId: 'shepherd', systemIds: ['reactor'] },
        { shipId: 'shepherd', systemIds: ['storage'] },
      ],
    })).toBeNull();
    expect(parseAllyRepairLedger({
      cycle: 3, revision: 1, unexpected: true,
      hosts: [{ shipId: 'shepherd', systemIds: ['reactor'] }],
    })).toBeNull();
  });
});
