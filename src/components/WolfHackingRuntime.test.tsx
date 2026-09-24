import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { HACKING_MESSAGE_DURATION_MS, hackingMessageForNoticeId } from '@/lib/hackingMessages';
import { MotionPreferenceProvider } from '@/lib/motionPreference';
import type { PendingWolfHackingAlert, PlayerHackingNotice } from '@/types/game';

vi.mock('@/lib/firestore', () => ({
  subscribeGmWolfHackingAlerts: vi.fn(),
  subscribePlayerHackingNotices: vi.fn(),
}));
vi.mock('@/lib/sessionService', () => ({ acknowledgeWolfHackingAlert: vi.fn() }));

const { subscribeGmWolfHackingAlerts, subscribePlayerHackingNotices } =
  await import('@/lib/firestore');
const { acknowledgeWolfHackingAlert } = await import('@/lib/sessionService');
const WolfHackingRuntime = (await import('./WolfHackingRuntime')).default;

let gmListener: ((alerts: readonly PendingWolfHackingAlert[] | null) => void) | undefined;
let playerListener: ((notices: readonly PlayerHackingNotice[] | null) => void) | undefined;

function setTrustedState(role: 'gm' | 'player' = 'gm') {
  const uid = role === 'gm' ? 'gm-uid' : 'player-uid';
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table', joinCode: '4821', phase: 'active', ownerUid: 'gm-uid',
    currentTurn: 3, createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
  }, {
    uid, sessionId: 's1', displayName: role === 'gm' ? 'GM' : 'Player',
    role, seatId: null, joinedAt: '2026-09-20T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  if (role === 'gm') {
    useSessionStore.getState().setGmInstance({
      id: 'gm-1', sessionId: 's1', uid, name: 'Bridge', deviceLabel: 'Test',
      claimedAt: '2026-09-20T00:00:00.000Z',
    });
  }
}

function consoleAlert(alertId: string, clueInstruction: string): PendingWolfHackingAlert {
  return {
    type: 'wolf-hacking-alert', state: 'pending', alertId,
    sessionId: 's1', requestId: alertId, action: 'sabotage-console',
    source: 'wolf-console-sabotage', cycle: 3, actorUid: 'wolf-uid',
    actorRoleId: 'dione-engineer', auditId: `wolf-console-sabotage-${alertId}`,
    revision: 1, visitId: `visit-${alertId}`, targetShipId: 'dione',
    targetSystemId: 'reactor', targetSystemName: 'Reactor', mode: 'chosen',
    clueTier: 'none', clueInstruction, createdAt: '2026-09-20T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.useRealTimers();
  useSessionStore.getState().reset();
  gmListener = undefined;
  playerListener = undefined;
  vi.mocked(subscribeGmWolfHackingAlerts).mockReset().mockImplementation((_sessionId, listener) => {
    gmListener = listener;
    return vi.fn();
  });
  vi.mocked(subscribePlayerHackingNotices).mockReset().mockImplementation((_sessionId, listener) => {
    playerListener = listener;
    return vi.fn();
  });
  vi.mocked(acknowledgeWolfHackingAlert).mockReset().mockImplementation(async (alert) => ({
    status: 'acknowledged', type: 'wolf-hacking-alert-acknowledgement', sessionId: 's1',
    requestId: 'ack-1', alertId: alert.alertId,
    noticeId: 'notice-000000000001', noticeSequence: 1, revision: 2,
  }));
});

it('keeps committed GM alerts visible and queues each until the exact clue instruction is handled', async () => {
  setTrustedState('gm');
  render(<WolfHackingRuntime />);
  expect(subscribeGmWolfHackingAlerts).toHaveBeenCalledWith('s1', expect.any(Function));
  const first = consoleAlert('alert-1', 'Nothing.');
  const second = consoleAlert('alert-2', 'Point out the wolf activity to someone.');
  act(() => gmListener?.([first, second]));
  expect(screen.getByText('Wolf sabotage committed')).toBeInTheDocument();
  expect(screen.getByText('Console sabotage damaged the Reactor on dione.')).toBeInTheDocument();
  expect(screen.getByLabelText('Facilitator sabotage alerts')).toHaveTextContent('Clue instruction: Nothing.');
  expect(screen.getByText('1 / 2 pending')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Acknowledge alert and clue instruction handled' }));
  expect(acknowledgeWolfHackingAlert).toHaveBeenCalledWith(first);
  expect(await screen.findByText('Point out the wolf activity to someone.')).toBeInTheDocument();
  expect(screen.getByText('1 / 1 pending')).toBeInTheDocument();
  act(() => gmListener?.([first, second]));
  expect(screen.queryByText('Nothing.')).not.toBeInTheDocument();
});

it('hides the fixed facilitator alert panel after the verified queue is empty', () => {
  setTrustedState('gm');
  render(<WolfHackingRuntime />);
  act(() => gmListener?.([]));
  expect(screen.queryByLabelText('Facilitator sabotage alerts')).not.toBeInTheDocument();
});

it('clears stale GM callbacks on role change and delivers the approved static notice to players', () => {
  vi.useFakeTimers();
  setTrustedState('gm');
  render(
    <MotionPreferenceProvider forceReducedMotion={false} safetyOverride="reduce">
      <WolfHackingRuntime />
    </MotionPreferenceProvider>,
  );
  const staleGmListener = gmListener;
  const gmAlert = consoleAlert('secret-alert', 'Secret clue instruction.');
  act(() => useSessionStore.getState().setMe({
    uid: 'player-uid', sessionId: 's1', displayName: 'Player', role: 'player',
    seatId: null, joinedAt: '2026-09-20T00:00:00.000Z',
  }));
  act(() => staleGmListener?.([gmAlert]));
  expect(screen.queryByText('Secret clue instruction.')).not.toBeInTheDocument();
  expect(subscribePlayerHackingNotices).toHaveBeenCalledWith('s1', expect.any(Function));

  const notices: readonly PlayerHackingNotice[] = [
    { id: 'notice-000000000001', type: 'wolf-hacking-overlay-notice', sessionId: 's1', sequence: 1, createdAt: '2026-09-20T00:00:00.000Z' },
    { id: 'notice-000000000002', type: 'wolf-hacking-overlay-notice', sessionId: 's1', sequence: 2, createdAt: '2026-09-20T00:00:01.000Z' },
  ];
  act(() => playerListener?.(notices));
  const firstMessage = hackingMessageForNoticeId('notice-000000000001');
  const overlay = document.querySelector('.intrusion');
  expect(overlay).toHaveAttribute('aria-hidden', 'true');
  expect(overlay).toHaveTextContent(firstMessage);
  expect(overlay?.textContent).not.toMatch(/secret-alert|wolf-uid|clue instruction|dione|reactor/i);
  expect(document.querySelector('.intrusion__message')).toHaveAttribute('data-text', firstMessage);

  act(() => vi.advanceTimersByTime(HACKING_MESSAGE_DURATION_MS));
  expect(document.querySelector('.intrusion')).toHaveTextContent(hackingMessageForNoticeId('notice-000000000002'));
  act(() => vi.advanceTimersByTime(HACKING_MESSAGE_DURATION_MS));
  expect(document.querySelector('.intrusion')).not.toBeInTheDocument();
});
