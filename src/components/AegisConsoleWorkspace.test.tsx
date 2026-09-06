import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import AegisConsoleWorkspace from './AegisConsoleWorkspace';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('@/lib/airspaceService', () => ({ unlockPressAirspace: vi.fn() }));
const { unlockPressAirspace } = await import('@/lib/airspaceService');

beforeEach(() => {
  const now = Date.now();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'u1',
    createdAt: '2026-09-06T12:00:00.000Z', updatedAt: '2026-09-06T12:00:00.000Z',
    currentTurn: 1,
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(now + 10 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 30 * 60_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as never, {
    uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player', seatId: null,
    activeConsoleRoleId: 'admiral', joinedAt: '2026-09-06T12:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
});

it('keeps the Press airspace exception under AEGIS systems control and makes timer authority read-only', async () => {
  const user = userEvent.setup();
  render(<AegisConsoleWorkspace roleId="admiral" galacticCoordinate="0000" fuel={3} />);

  await user.click(screen.getByText('Systems control'));
  const control = screen.getByRole('region', { name: 'Airspace control' });
  expect(screen.getByRole('button', { name: /unlock airspace.*press/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /team phase timer.*no manual control/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /coordination phase timer.*no manual control/i })).toBeDisabled();
  expect(control).toHaveTextContent(/non-affiliated vessels.*restricted/i);
  await user.click(screen.getByRole('button', { name: /unlock airspace.*press/i }));
  expect(unlockPressAirspace).toHaveBeenCalledOnce();
});

it('holds the Press exception at Turn 0 for a non-GM Admiral', async () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected a session.');
  useSessionStore.getState().setSession({ ...session, currentTurn: 0 });
  const user = userEvent.setup();
  render(<AegisConsoleWorkspace roleId="admiral" galacticCoordinate="0000" fuel={3} />);

  await user.click(screen.getByText('Systems control'));
  expect(screen.getByRole('button', { name: /unlock airspace.*press/i })).toBeDisabled();
});
