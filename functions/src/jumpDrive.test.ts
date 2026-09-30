import { describe, expect, it } from 'vitest';
import {
  jumpFuelCost,
  jumpLengthBetween,
  resolveRamScoopOreGain,
  resolveJumpAttempt,
} from './jumpDrive';
import * as jumpDrive from './jumpDrive';

const now = new Date('2026-09-07T13:04:09.000Z');

describe('authoritative jump-drive resolution', () => {
  it.each([
    ['aegis', 2, 3, 6],
    ['dione', 2, 4, 8],
    ['icebreaker', 3, 6, 12],
    ['capybara', 3, 6, 12],
    ['shepherd', 3, 6, 12],
    ['quellon', 2, 4, 8],
    ['refinery-124', 2, 4, 8],
  ] as const)('uses the source-printed fuel bands for %s', (shipId, short, medium, long) => {
    expect([
      jumpFuelCost(shipId, 'short', false),
      jumpFuelCost(shipId, 'medium', false),
      jumpFuelCost(shipId, 'long', false),
    ]).toEqual([short, medium, long]);
    expect([
      jumpFuelCost(shipId, 'short', true),
      jumpFuelCost(shipId, 'medium', true),
      jumpFuelCost(shipId, 'long', true),
    ]).toEqual([Math.max(0, short - 1), Math.max(0, medium - 1), Math.max(0, long - 1)]);
  });

  it.each(['capybara-small', 'warrior', 'vulcan', 'voyage-33-0'] as const)(
    'uses the server catalog 1/1/2 fuel bands for the supplemental %s vessel',
    (shipId) => {
      expect([
        jumpFuelCost(shipId, 'short', false),
        jumpFuelCost(shipId, 'medium', false),
        jumpFuelCost(shipId, 'long', false),
      ]).toEqual([1, 1, 2]);
      expect([
        jumpFuelCost(shipId, 'short', true),
        jumpFuelCost(shipId, 'medium', true),
        jumpFuelCost(shipId, 'long', true),
      ]).toEqual([0, 0, 1]);
    },
  );

  it('keeps Gorgoneion short, medium, and long fuel costs at 1/1/2', () => {
    expect([
      jumpFuelCost('gorgoneion', 'short', false),
      jumpFuelCost('gorgoneion', 'medium', false),
      jumpFuelCost('gorgoneion', 'long', false),
    ]).toEqual([1, 1, 2]);
    expect([
      jumpFuelCost('gorgoneion', 'short', true),
      jumpFuelCost('gorgoneion', 'medium', true),
      jumpFuelCost('gorgoneion', 'long', true),
    ]).toEqual([1, 1, 2]);
  });

  it('allows one legal emergency jump without charge or fuel and persists the once-per-game marker', () => {
    const resolveEmergencyJump = (jumpDrive as unknown as Record<string, (
      input: Record<string, unknown>,
    ) => unknown>).resolveEmergencyJump;
    expect(resolveEmergencyJump).toBeTypeOf('function');
    const result = resolveEmergencyJump!({
      shipId: 'aegis', origin: '0000', destination: '5143', currentTurn: 1,
      fuel: 0, eligible: true, now, transitionId: 'emergency-jump-1',
    });
    expect(result).toMatchObject({
      status: 'jumped', emergency: true, length: 'short', fuelSpent: 0,
      remainingFuel: 0,
      state: { lastJumpTurn: 1, emergencyJumpUsed: true },
      transition: { id: 'emergency-jump-1', origin: '0000', destination: '5143' },
    });
    expect(() => resolveEmergencyJump!({
      shipId: 'aegis', origin: '0000', destination: '5143', currentTurn: 1,
      fuel: 4, eligible: true, now, transitionId: 'emergency-jump-2',
      state: { emergencyJumpUsed: true },
    })).toThrow(/already used/i);
    expect(() => resolveEmergencyJump!({
      shipId: 'aegis', origin: '0000', destination: '5143', currentTurn: 1,
      fuel: 4, eligible: false, now, transitionId: 'emergency-jump-3',
    })).toThrow(/not available/i);
  });

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
    expect(jumpFuelCost('capybara', 'short', false)).toBe(3);
    expect(jumpFuelCost('capybara', 'medium', false)).toBe(6);
    expect(jumpFuelCost('capybara', 'long', false)).toBe(12);
    expect(jumpFuelCost('capybara', 'long', true)).toBe(11);

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

  it('preserves the once-per-game emergency marker across an ordinary later jump', () => {
    const result = resolveJumpAttempt({
      shipId: 'aegis', origin: '5143', destination: '0000', currentTurn: 2,
      fuel: 4, charged: true, damaged: false, upgraded: false, now,
      transitionId: 'jump-after-emergency', state: { emergencyJumpUsed: true, lastJumpTurn: 1 },
    });

    expect(result).toMatchObject({
      status: 'jumped',
      state: { lastJumpTurn: 2, emergencyJumpUsed: true },
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

  it.each([
    ['short', '5143', 10],
    ['medium', '9997', 15],
    ['long', '4888', 20],
  ] as const)('awards the Icebreaker Ram Scoop output after a successful %s jump', (length, destination, ore) => {
    const result = resolveJumpAttempt({
      shipId: 'icebreaker', origin: '0000', destination, currentTurn: 1,
      fuel: 20, charged: true, damaged: false, upgraded: false, now,
      transitionId: `ram-scoop-${length}`,
    });

    expect(result).toMatchObject({ status: 'jumped', length });
    expect(resolveRamScoopOreGain(result, { charged: true, damaged: false, upgraded: false })).toBe(ore);
    expect(resolveRamScoopOreGain(result, { charged: true, damaged: false, upgraded: true })).toBe(ore + 5);
  });

  it('requires a successful Icebreaker jump with a charged, undamaged Ram Scoop', () => {
    const jump = (overrides: Partial<Parameters<typeof resolveJumpAttempt>[0]> = {}) =>
      resolveJumpAttempt({
        shipId: 'icebreaker', origin: '0000', destination: '5143', currentTurn: 1,
        fuel: 20, charged: true, damaged: false, upgraded: false, now,
        transitionId: 'ram-scoop-eligibility', ...overrides,
      });
    const successful = jump();
    const failed = jump({ damaged: true, integrityRoll: 1 });
    const wrongDestination = jump({ destination: '0101' });
    const otherShip = jump({ shipId: 'shepherd' });

    expect(resolveRamScoopOreGain(successful, { charged: false, damaged: false, upgraded: false })).toBe(0);
    expect(resolveRamScoopOreGain(successful, { charged: true, damaged: true, upgraded: true })).toBe(0);
    expect(resolveRamScoopOreGain(failed, { charged: true, damaged: false, upgraded: true })).toBe(0);
    expect(resolveRamScoopOreGain(wrongDestination, { charged: true, damaged: false, upgraded: true })).toBe(0);
    expect(resolveRamScoopOreGain(otherShip, { charged: true, damaged: false, upgraded: true })).toBe(0);
  });
});
