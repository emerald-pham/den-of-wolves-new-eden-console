import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ShipConsole from './ShipConsole';

vi.mock('@/lib/sessionService', () => ({
  popShipConfetti: vi.fn(),
  selectConsoleRole: vi.fn(),
  setShipConsoleLock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeShipConfetti: vi.fn(() => vi.fn()),
  subscribeDamageDraws: vi.fn(() => vi.fn()),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
}));

const { setShipConsoleLock } = await import('@/lib/sessionService');

beforeEach(() => {
  vi.mocked(setShipConsoleLock).mockReset();
  vi.mocked(setShipConsoleLock).mockResolvedValue('applied');
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'u1', currentTurn: 1,
    createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z',
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 } },
    shipUnrest: { aegis: 2 }, shipSurvivors: { aegis: 2500 },
    shipConsoleLocks: { aegis: false }, shipNavigationLogs: { aegis: [] },
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player', seatId: null,
    activeConsoleRoleId: 'admiral', joinedAt: '2026-09-07T00:00:00.000Z',
  });
  useSessionStore.getState().setMode('console');
  useSessionStore.getState().setConnection('live');
});

function renderShip() {
  return render(<MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
    <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);
}

it('lets a ship hide resource stores and census independently in its local view', async () => {
  const user = userEvent.setup();
  renderShip();

  expect(screen.getByRole('region', { name: 'AEGIS resource stores' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'AEGIS census' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /hide resource stores/i }));
  expect(screen.getByText(/resource stores.*hidden from ship view/i)).toBeVisible();
  expect(screen.queryByRole('listitem', { name: 'Strytium Fuel: 4' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /hide unrest and population/i }));
  expect(screen.getByText(/unrest and population.*hidden from ship view/i)).toBeVisible();
  expect(screen.queryByText('2 / 7')).not.toBeInTheDocument();
});

it('shows the ICN travel lock and disables console actions while it is engaged', async () => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected session.');
  useSessionStore.getState().setSession({ ...session, shipConsoleLocks: { aegis: true } });
  renderShip();

  expect(screen.getByText(/ICN console lock.*engaged/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /release ICN console lock/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /begin maintenance/i })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: /release ICN console lock/i }));
  expect(setShipConsoleLock).toHaveBeenCalledWith('aegis', false);
});
