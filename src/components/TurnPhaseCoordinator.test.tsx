import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TurnPhaseCoordinator from './TurnPhaseCoordinator';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('@/lib/sessionService', () => ({ beginOpenAirspacePhase: vi.fn() }));
const { beginOpenAirspacePhase } = await import('@/lib/sessionService');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  vi.mocked(beginOpenAirspacePhase).mockReset();
  vi.mocked(beginOpenAirspacePhase).mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'u1',
    createdAt: '2026-09-06T12:00:00.000Z', updatedAt: '2026-09-06T12:00:00.000Z',
    currentTurn: 2,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
    joinedAt: '2026-09-06T12:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
});

afterEach(() => vi.useRealTimers());

it('asks the server to begin coordination exactly when the team window ends', async () => {
  render(<TurnPhaseCoordinator />);

  await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000 + 59_000); });
  expect(beginOpenAirspacePhase).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledWith(2);
});
