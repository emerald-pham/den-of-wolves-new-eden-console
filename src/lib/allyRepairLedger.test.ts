import { describe, expect, it } from 'vitest';
import { parseAllyRepairLedger } from './allyRepairLedger';

describe('parseAllyRepairLedger', () => {
  it('accepts only the Union host pair and canonical damage-deck IDs', () => {
    expect(parseAllyRepairLedger({
      cycle: 3, revision: 1,
      hosts: [{ shipId: 'shepherd', systemIds: ['reactor', 'storage'] }],
    })).toEqual({
      cycle: 3, revision: 1,
      hosts: [{ shipId: 'shepherd', systemIds: ['reactor', 'storage'] }],
    });
    expect(parseAllyRepairLedger({
      cycle: 3, revision: 1,
      hosts: [{ shipId: 'icebreaker', systemIds: ['fighter-bay-alpha'] }],
    })).toBeNull();
  });

  it('fails closed on unknown, duplicate, or cross-ship records', () => {
    for (const hosts of [
      [{ shipId: 'shepherd', systemIds: ['not-a-damage-card'] }],
      [{ shipId: 'shepherd', systemIds: ['reactor'] }, { shipId: 'shepherd', systemIds: ['storage'] }],
      [{ shipId: 'dione', systemIds: ['reactor'] }],
    ]) {
      expect(parseAllyRepairLedger({ cycle: 3, revision: 1, hosts })).toBeNull();
    }
  });
});
