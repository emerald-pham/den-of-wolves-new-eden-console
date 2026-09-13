import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import { discardPrivateMissionCard, openPrivateMissionDiscards } from '@/lib/sessionService';
import AwayMissionDiscardPanel from './AwayMissionDiscardPanel';

vi.mock('@/lib/sessionService', () => ({
  discardPrivateMissionCard: vi.fn(),
  openPrivateMissionDiscards: vi.fn(),
}));

beforeEach(() => {
  useSessionStore.getState().reset();
  vi.mocked(discardPrivateMissionCard).mockReset();
  vi.mocked(openPrivateMissionDiscards).mockReset();
});

afterEach(() => {
  cleanup();
  useSessionStore.getState().reset();
});

it('shows the participant-owned card and submits one private discard', async () => {
  const user = userEvent.setup();
  vi.mocked(discardPrivateMissionCard).mockResolvedValue({
    status: 'committed', sessionId: 's1', requestId: 'r1', missionId: 'mission-1', expectedSetupRevision: 1,
  });
  const store = useSessionStore.getState();
  store.setSession({ id: 's1', setupRevision: 1 } as never);
  store.setMe({ uid: 'alice', sessionId: 's1', role: 'player' } as never);
  store.setAwayMissionHandPointer({
    sessionId: 's1', participantUid: 'alice', missionId: 'mission-1', handId: 'hand-1',
    phase: 'discarding', revision: 1, discarded: false,
  });
  store.setAwayMissionHand({
    sessionId: 's1', participantUid: 'alice', missionId: 'mission-1', handId: 'hand-1',
    cardId: 'A♥', rank: 'A', suit: 'hearts', value: 10, discarded: false,
  });

  render(<AwayMissionDiscardPanel />);

  expect(screen.getByRole('region', { name: /private away mission card/i })).toHaveTextContent('A♥');
  await user.click(screen.getByRole('button', { name: /discard this card secretly/i }));
  expect(discardPrivateMissionCard).toHaveBeenCalledWith('mission-1', 'A♥');
});

it('shows the GM readiness control without exposing card content', async () => {
  const user = userEvent.setup();
  vi.mocked(openPrivateMissionDiscards).mockResolvedValue({
    status: 'committed', sessionId: 's1', requestId: 'r1', missionId: 'mission-1', expectedSetupRevision: 1,
  });
  const store = useSessionStore.getState();
  store.setSession({ id: 's1', setupRevision: 1 } as never);
  store.setMe({ uid: 'gm1', sessionId: 's1', role: 'gm' } as never);
  store.setGmInstance({ id: 'bridge', sessionId: 's1', uid: 'gm1' } as never);
  store.setGmAwayMissionHandPointers([
    {
      sessionId: 's1', participantUid: 'alice', missionId: 'mission-1', handId: 'hand-1',
      phase: 'awaiting-card-selection', revision: 0, discarded: false,
    },
  ]);

  render(<AwayMissionDiscardPanel />);

  const panel = screen.getByRole('region', { name: /away mission discard readiness/i });
  expect(panel).toHaveTextContent('Mission mission-1');
  expect(panel).not.toHaveTextContent('A♥');
  await user.click(within(panel).getByRole('button', { name: /open private discards/i }));
  expect(openPrivateMissionDiscards).toHaveBeenCalledWith('mission-1');
});

it('keeps two overlapping participant missions visible and isolated', async () => {
  const user = userEvent.setup();
  vi.mocked(discardPrivateMissionCard).mockResolvedValue({
    status: 'committed', sessionId: 's1', requestId: 'r1', missionId: 'mission-2', expectedSetupRevision: 1,
  });
  const store = useSessionStore.getState();
  store.setSession({ id: 's1', setupRevision: 1 } as never);
  store.setMe({ uid: 'alice', sessionId: 's1', role: 'player' } as never);
  store.setAwayMissionHandPointers([
    { sessionId: 's1', participantUid: 'alice', missionId: 'mission-1', handId: 'hand-1', phase: 'discarding', revision: 1, discarded: false },
    { sessionId: 's1', participantUid: 'alice', missionId: 'mission-2', handId: 'hand-2', phase: 'discarding', revision: 1, discarded: false },
  ]);
  store.setAwayMissionHands([
    { sessionId: 's1', participantUid: 'alice', missionId: 'mission-1', handId: 'hand-1', cardId: 'A♥', rank: 'A', suit: 'hearts', value: 10, discarded: false },
    { sessionId: 's1', participantUid: 'alice', missionId: 'mission-2', handId: 'hand-2', cardId: '4♥', rank: '4', suit: 'hearts', value: 4, discarded: false },
  ]);

  render(<AwayMissionDiscardPanel />);

  expect(screen.getByRole('article', { name: /mission-1/i })).toHaveTextContent('A♥');
  const second = screen.getByRole('article', { name: /mission-2/i });
  expect(second).toHaveTextContent('4♥');
  await user.click(within(second).getByRole('button', { name: /discard this card secretly/i }));
  expect(discardPrivateMissionCard).toHaveBeenCalledWith('mission-2', '4♥');
});
