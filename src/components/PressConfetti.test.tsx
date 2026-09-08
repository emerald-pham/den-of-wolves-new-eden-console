import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import PressConfetti from './PressConfetti';
import snnPressShuttle from '@/data/vessels/snn-press-shuttle';

vi.mock('@/lib/sessionService', () => ({ popShipConfetti: vi.fn() }));
vi.mock('@/lib/firestore', () => ({ subscribeShipConfetti: vi.fn() }));
const { popShipConfetti } = await import('@/lib/sessionService');
const { subscribeShipConfetti } = await import('@/lib/firestore');

beforeEach(() => {
  vi.mocked(popShipConfetti).mockReset().mockResolvedValue('applied');
  vi.mocked(subscribeShipConfetti).mockReset().mockReturnValue(vi.fn());
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Press Officer', role: 'player', seatId: null,
    activeConsoleRoleId: 'press-officer', joinedAt: '2026-01-01T00:00:00.000Z',
  });
});

it('fires newspaper confetti from the SNN shuttle dispenser', async () => {
  const user = userEvent.setup();
  let signal: ((sourceShipId: string) => void) | undefined;
  vi.mocked(subscribeShipConfetti).mockImplementation((_sessionId, _shipId, onPop) => {
    signal = onPop;
    return vi.fn();
  });
  const { container } = render(<PressConfetti shuttle={snnPressShuttle} />);
  expect(screen.getByText(/reusable evidence shredder/i)).toBeInTheDocument();
  expect(screen.getByText(
    /warning.*warning.*this will cause shredded paper to enter the bridge of any docked ship/i,
  )).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /open newspaper confetti cover/i }));
  await user.click(screen.getByRole('button', { name: /activate newspaper confetti/i }));
  expect(popShipConfetti).toHaveBeenCalledWith('snn-press-shuttle', 'press-officer');
  await waitFor(() => expect(subscribeShipConfetti).toHaveBeenCalledWith(
    's1', 'snn-press-shuttle', expect.any(Function), expect.any(Function),
  ));
  act(() => signal?.('snn-press-shuttle'));
  expect(container.querySelectorAll('.confetti-burst__piece--newspaper').length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: /open newspaper confetti cover/i }));
  await user.click(screen.getByRole('button', { name: /activate newspaper confetti/i }));
  expect(popShipConfetti).toHaveBeenCalledTimes(2);
});

it('binds reusable equipment to the configured craft and captain', async () => {
  const shuttle = { id: 'survey-shuttle', captainRoleId: 'survey-captain', operatorShort: 'SURVEY' };
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'survey-captain' });
  render(<PressConfetti shuttle={shuttle} />);
  expect(screen.getByRole('region', { name: 'SURVEY Newspaper Confetti Dispenser' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /open newspaper confetti cover/i }));
  await userEvent.click(screen.getByRole('button', { name: /activate newspaper confetti/i }));
  expect(popShipConfetti).toHaveBeenCalledWith('survey-shuttle', 'survey-captain');
  expect(subscribeShipConfetti).toHaveBeenCalledWith(
    's1', 'survey-shuttle', expect.any(Function), expect.any(Function),
  );
});

it('holds the evidence shredder at Turn 0 for a non-GM player', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected a session.');
  useSessionStore.getState().setSession({ ...session, currentTurn: 0 });

  render(<PressConfetti shuttle={snnPressShuttle} />);

  expect(screen.getByRole('button', { name: /open newspaper confetti cover/i })).toBeDisabled();
  expect(screen.getByText('TURN 0 // AWAITING IRIS AUTHENTICATION')).toBeVisible();
});
