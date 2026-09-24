import { describe, expect, it } from 'vitest';
import { parseWarriorRepairDronesLedger } from './warriorRepairDronesLedger';

describe('Warrior Repair Drones ledger', () => {
  it('defaults only a missing legacy ledger and parses a known one-use outcome', () => {
    expect(parseWarriorRepairDronesLedger(undefined)).toEqual({
      cycle: 0, revision: 0, hostShipId: '', systemIds: [],
    });
    expect(parseWarriorRepairDronesLedger({
      cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    })).toEqual({
      cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    });
  });

  it.each([
    ['extra fields', { cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage'], actorUid: 'secret' }],
    ['unreachable revision', { cycle: 1, revision: 2, hostShipId: 'icebreaker', systemIds: ['storage'] }],
    ['small ship host', { cycle: 3, revision: 1, hostShipId: 'warrior', systemIds: ['storage'] }],
    ['unknown console', { cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['unknown'] }],
    ['passive hull armor', { cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['armoured-hull-i'] }],
    ['duplicate console', { cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage', 'storage'] }],
    ['more than two consoles', { cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage', 'reactor', 'jump-drive'] }],
  ])('fails closed for %s', (_label, value) => {
    expect(parseWarriorRepairDronesLedger(value)).toBeNull();
  });
});
