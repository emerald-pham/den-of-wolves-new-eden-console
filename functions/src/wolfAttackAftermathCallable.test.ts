import { describe, expect, it } from 'vitest';
import { parseWolfAttackAftermathCommand } from './wolfAttackAftermathCallable';

describe('Wolf attack aftermath command contract', () => {
  it('accepts exact Doctor, salvage, and Scrap choices and rejects caller-owned results', () => {
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'doctor-7',
      action: 'doctor', selectedShipIds: ['aegis', 'dione'],
    })).toEqual({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'doctor-7',
      action: 'doctor', selectedShipIds: ['aegis', 'dione'],
    });
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'salvage-7', action: 'warrior-salvage',
    })?.action).toBe('warrior-salvage');
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'scrap-7', action: 'collect-scrap',
      shuttleId: 'macaw', targetShipId: 'aegis',
    })?.action).toBe('collect-scrap');
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'doctor-8', action: 'doctor',
      selectedShipIds: ['aegis'], damageDice: [6],
    })).toBeNull();
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'scrap-8', action: 'collect-scrap',
      shuttleId: 'boa', targetShipId: 'aegis', targetId: 'dione',
    })).toBeNull();
  });
});
