import { describe, expect, it } from 'vitest';
import {
  hasActiveTurnTimer,
  turnPhaseReadout,
  turnPhaseState,
  turnStateState,
} from './turnPhase';

const phase = {
  turn: 3,
  teamPhaseEndsAt: '2026-09-07T12:05:00.000Z',
  openAirspaceEndsAt: '2026-09-07T12:20:00.000Z',
  airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false },
};

describe('emergency timer pause readout', () => {
  it('holds the active window at its frozen remaining time after the original deadline', () => {
    const paused = {
      ...phase,
      timerPause: {
        window: 'restricted' as const,
        remainingMs: 180_000,
        pausedAt: '2026-09-07T12:02:00.000Z',
      },
    };

    const parsed = turnPhaseState(paused);

    expect(parsed).toEqual(paused);
    expect(turnPhaseReadout(parsed, Date.parse('2026-09-07T12:30:00.000Z'))).toEqual({
      kind: 'team',
      remainingMs: 180_000,
    });
    expect(hasActiveTurnTimer(parsed, Date.parse('2026-09-07T12:30:00.000Z'))).toBe(true);
  });

  it('rejects an incomplete or invalid paused phase record', () => {
    expect(turnPhaseState({
      ...phase,
      timerPause: { window: 'restricted', remainingMs: 0 },
    })).toBeUndefined();
    expect(turnPhaseState({
      ...phase,
      timerPause: { window: 'closed', remainingMs: 10_000, pausedAt: phase.teamPhaseEndsAt },
    })).toBeUndefined();
    expect(turnPhaseState({
      ...phase,
      timerPause: { window: 'open', remainingMs: -1, pausedAt: phase.teamPhaseEndsAt },
    })).toBeUndefined();
  });
});

describe('persisted turn entity', () => {
  it('accepts the complete server-owned shape', () => {
    expect(turnStateState({
      currentTurn: 2,
      maxTurn: 8,
      phase: 'coordination',
      phaseRevision: 4,
      startedAt: '2026-09-07T12:05:00.000Z',
      endsAt: '2026-09-07T12:20:00.000Z',
    })).toEqual({
      currentTurn: 2,
      maxTurn: 8,
      phase: 'coordination',
      phaseRevision: 4,
      startedAt: '2026-09-07T12:05:00.000Z',
      endsAt: '2026-09-07T12:20:00.000Z',
    });
  });

  it('rejects malformed or out-of-range entity data', () => {
    expect(turnStateState({
      currentTurn: 2,
      maxTurn: 8,
      phase: 'coordination',
      phaseRevision: 4,
      startedAt: '2026-09-07T12:20:00.000Z',
      endsAt: '2026-09-07T12:05:00.000Z',
    })).toBeUndefined();
    expect(turnStateState({
      currentTurn: 9,
      maxTurn: 8,
      phase: 'team',
      phaseRevision: 1,
      startedAt: '2026-09-07T12:00:00.000Z',
      endsAt: '2026-09-07T12:05:00.000Z',
    })).toBeUndefined();
  });
});
