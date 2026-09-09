import { describe, expect, it } from 'vitest';
import {
  jumpFuelCost,
  jumpLengthBetween,
  resolveJumpAttempt,
} from './jumpDrive';

const now = new Date('2026-09-07T13:04:09.000Z');

describe('authoritative jump-drive resolution', () => {
  it('derives the printed short, medium, and long fuel bands from chart distance', () => {
    expect(jumpLengthBetween('0000', '5143')).toBe('short');
    expect(jumpLengthBetween('0000', '9997')).toBe('medium');
    expect(jumpLengthBetween('0000', '4888')).toBe('long');
    expect(jumpFuelCost('aegis', 'short', false)).toBe(2);
    expect(jumpFuelCost('aegis', 'medium', false)).toBe(3);
    expect(jumpFuelCost('aegis', 'long', false)).toBe(6);
    expect(jumpFuelCost('aegis', 'short', true)).toBe(1);
    expect(jumpFuelCost('aegis', 'medium', true)).toBe(2);
    expect(jumpFuelCost('aegis', 'long', true)).toBe(5);
    expect(jumpFuelCost('shepherd', 'short', false)).toBe(3);
    expect(jumpFuelCost('shepherd', 'short', true)).toBe(2);

    const attempt = (overrides: Partial<Parameters<typeof resolveJumpAttempt>[0]> = {}) =>
      resolveJumpAttempt({
        shipId: 'aegis',
        origin: '0000',
        destination: '5143',
        currentTurn: 1,
        fuel: 4,
        charged: true,
        damaged: false,
        upgraded: false,
        now,
        transitionId: 'jump-matrix',
        ...overrides,
      });

    expect(attempt({ fuel: 2 })).toMatchObject({
      status: 'jumped',
      fuelCost: 2,
      remainingFuel: 0,
    });
    expect(() => attempt({ charged: false })).toThrow(/must be charged/i);
    expect(() => attempt({ fuel: 1 })).toThrow(/insufficient/i);
    expect(() => attempt({ state: { lastJumpTurn: 1 } })).toThrow(/already jumped/i);
    expect(attempt({ destination: '0101' })).toMatchObject({
      status: 'integrity-lockout',
      state: { integrityLockedUntil: expect.any(String) },
    });

    for (const integrityRoll of [2, 3]) {
      expect(attempt({
        fuel: 1,
        damaged: true,
        upgraded: true,
        integrityRoll,
      })).toMatchObject({
        status: 'jumped',
        fuelCost: 1,
        remainingFuel: 0,
      });
    }
    expect(attempt({ damaged: true, upgraded: true, integrityRoll: 1 })).toMatchObject({
      status: 'drive-failure',
    });
    for (const integrityRoll of [1, 2, 3]) {
      expect(attempt({ damaged: true, integrityRoll })).toMatchObject({
        status: 'drive-failure',
      });
    }
    expect(attempt({ damaged: true, integrityRoll: 4 })).toMatchObject({
      status: 'jumped',
    });
  });

  it('turns a wrong locked destination into a one-hour integrity lockout', () => {
    const result = resolveJumpAttempt({
      shipId: 'aegis',
      origin: '0000',
      destination: '0101',
      currentTurn: 1,
      fuel: 4,
      charged: true,
      damaged: false,
      upgraded: false,
      now,
      transitionId: 'jump-1',
    });

    expect(result).toMatchObject({
      status: 'integrity-lockout',
      destination: '0101',
      integrityLockedUntil: '2026-09-07T14:04:09.000Z',
    });
    expect(result.state.lastJumpTurn).toBeUndefined();
  });

  it('consumes the charged drive and fuel, then publishes one completed transition', () => {
    const result = resolveJumpAttempt({
      shipId: 'aegis',
      origin: '0000',
      destination: '5143',
      currentTurn: 1,
      fuel: 4,
      charged: true,
      damaged: false,
      upgraded: false,
      now,
      transitionId: 'jump-2',
    });

    expect(result).toMatchObject({
      status: 'jumped',
      origin: '0000',
      destination: '5143',
      length: 'short',
      fuelCost: 2,
      remainingFuel: 2,
      state: { lastJumpTurn: 1 },
      transition: {
        id: 'jump-2',
        shipId: 'aegis',
        origin: '0000',
        destination: '5143',
        occurredAt: now.toISOString(),
      },
    });
  });

  it('keeps an existing integrity lock authoritative until its expiry', () => {
    const result = resolveJumpAttempt({
      shipId: 'aegis',
      origin: '0000',
      destination: '5143',
      currentTurn: 1,
      fuel: 4,
      charged: true,
      damaged: false,
      upgraded: false,
      now,
      transitionId: 'jump-3',
      state: { integrityLockedUntil: '2026-09-07T13:30:00.000Z' },
    });

    expect(result).toMatchObject({
      status: 'integrity-locked',
      integrityLockedUntil: '2026-09-07T13:30:00.000Z',
    });
  });
});
