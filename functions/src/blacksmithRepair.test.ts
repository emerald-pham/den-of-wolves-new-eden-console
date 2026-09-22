import { describe, expect, it } from 'vitest';
import { parseBlacksmithRepairLedger, resolveBlacksmithRepair } from './blacksmithRepair';

const base = {
  actorUid: 'holder', currentCycle: 3, expectedControlRevision: 2, expectedRepairRevision: 0,
  systemIds: ['reactor'],
  control: { shuttleId: 'blacksmith', ownerRoleId: 'icebreaker-engineer', ownerUid: 'owner', holderUid: 'holder', revision: 2 },
  dockings: [{ shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'now' }],
  fuelled: false,
  damage: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false },
  materials: 12,
  knownSystemIds: ['reactor', 'storage', 'jump-drive'],
  ledger: { cycle: 0, revision: 0, hosts: [] },
} as const;

describe('Blacksmith repair', () => {
  it('spends four materials per console and removes only selected damage', () => {
    expect(resolveBlacksmithRepair({ ...base, systemIds: ['reactor', 'storage'] })).toEqual({
      hostShipId: 'icebreaker', materials: 4, repairedSystemIds: ['reactor', 'storage'],
      damage: { damagedSystemIds: ['jump-drive'], destroyed: false },
      ledger: { cycle: 3, revision: 1, hosts: [{ shipId: 'icebreaker', systemIds: ['reactor', 'storage'] }] },
    });
  });

  it('requires fuel for a second ship and still limits each host to two repairs', () => {
    const ledger = { cycle: 3, revision: 1, hosts: [{ shipId: 'icebreaker', systemIds: ['reactor'] }] } as const;
    const second = { ...base, expectedRepairRevision: 1, ledger,
      dockings: [{ shuttleId: 'blacksmith', shipId: 'dione', dockedAt: 'later' }],
      damage: { damagedSystemIds: ['storage'], destroyed: false }, knownSystemIds: ['storage'], systemIds: ['storage'] };
    expect(() => resolveBlacksmithRepair(second)).toThrow(/Fuel Blacksmith/);
    expect(resolveBlacksmithRepair({ ...second, fuelled: true }).ledger.hosts).toHaveLength(2);
    expect(() => resolveBlacksmithRepair({ ...base, expectedRepairRevision: 1,
      ledger: { cycle: 3, revision: 1, hosts: [{ shipId: 'icebreaker', systemIds: ['reactor', 'storage'] }] },
    })).toThrow(/at most two consoles/);
  });

  it.each([
    ['foreign holder', { actorUid: 'other' }],
    ['stale control', { expectedControlRevision: 1 }],
    ['stale repair ledger', { expectedRepairRevision: 1 }],
    ['unknown console', { systemIds: ['invented'] }],
    ['insufficient materials', { materials: 3 }],
    ['destroyed host', { damage: { damagedSystemIds: ['reactor'], destroyed: true } }],
  ])('rejects %s without producing a result', (_label, change) => {
    expect(() => resolveBlacksmithRepair({ ...base, ...change })).toThrow();
  });

  it('parses only bounded, unique repair history', () => {
    expect(parseBlacksmithRepairLedger(undefined)).toEqual({ cycle: 0, revision: 0, hosts: [] });
    expect(parseBlacksmithRepairLedger({ cycle: 3, revision: 1, hosts: [{ shipId: 'icebreaker', systemIds: ['reactor'] }] }))
      .toMatchObject({ cycle: 3, revision: 1 });
    expect(parseBlacksmithRepairLedger({ cycle: 3, revision: 1, hosts: [
      { shipId: 'icebreaker', systemIds: ['reactor'] }, { shipId: 'icebreaker', systemIds: ['storage'] },
    ] })).toBeNull();
  });
});
