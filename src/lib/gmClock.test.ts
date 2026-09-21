import { describe, expect, it } from 'vitest';
import { nextGmClockUpdate } from './gmClock';
import type { GameSession } from '@/types/game';

type ClockSession = Pick<GameSession, 'currentTurn' | 'turnPhase' | 'maintenanceCycles'>;

const maintenanceCycle = {
  step: 3,
  revision: 1,
  results: {},
  charges: [],
  refuelled: [],
} as const;

describe('GM clock scheduling', () => {
  it('wakes exactly when the active turn timer expires', () => {
    const session: ClockSession = {
      currentTurn: 2,
      turnPhase: {
        turn: 2,
        teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
        openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
    };

    expect(nextGmClockUpdate(session, Date.parse('2026-01-01T00:06:30.000Z')))
      .toBe(Date.parse('2026-01-01T00:20:00.000Z'));
  });

  it('wakes at the overdue threshold, then only when the displayed minute changes', () => {
    const session: ClockSession = {
      maintenanceCycles: {
        aegis: { ...maintenanceCycle, startedAt: '2026-01-01T00:00:00.000Z' },
      },
    };

    expect(nextGmClockUpdate(session, Date.parse('2026-01-01T00:04:12.000Z')))
      .toBe(Date.parse('2026-01-01T00:05:00.000Z'));
    expect(nextGmClockUpdate(session, Date.parse('2026-01-01T00:06:12.000Z')))
      .toBe(Date.parse('2026-01-01T00:07:00.000Z'));
  });

  it('does not wake on the original deadline while the emergency hold is active', () => {
    const session: ClockSession = {
      currentTurn: 2,
      turnPhase: {
        turn: 2,
        teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
        openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
        timerPause: {
          window: 'restricted',
          remainingMs: 180_000,
          pausedAt: '2026-01-01T00:02:00.000Z',
        },
      },
    };

    expect(nextGmClockUpdate(session, Date.parse('2026-01-01T00:25:00.000Z'))).toBeUndefined();
  });

  it('does not wake when neither the turn control nor maintenance alert can change', () => {
    expect(nextGmClockUpdate({}, Date.parse('2026-01-01T00:00:00.000Z'))).toBeUndefined();
  });

  it('wakes for the next additional interaction boundary', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    expect(nextGmClockUpdate({}, now, [now - 1, Number.NaN, now + 60_001, now + 10_000]))
      .toBe(now + 10_000);
    expect(nextGmClockUpdate({}, now + 10_000, [now + 10_000, now + 60_001]))
      .toBe(now + 60_001);
  });
});
