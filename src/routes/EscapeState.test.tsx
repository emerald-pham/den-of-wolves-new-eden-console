import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import EscapeState from './EscapeState';

vi.mock('@/lib/sessionService', () => ({ fleeDestroyedShip: vi.fn() }));
const { fleeDestroyedShip } = await import('@/lib/sessionService');

const session = {
  id: 's1', name: 'Table one', joinCode: '4821', phase: 'active' as const,
  ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const player = {
  uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player' as const, seatId: 'admiral',
  assignedRoleId: 'admiral', joinedAt: '2026-01-01T00:00:00.000Z',
  escapeState: {
    status: 'pending' as const, shipId: 'aegis', destructionEventId: 'damage-destroyed-aegis', revision: 1,
  },
};

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession(session);
  useSessionStore.getState().setMe(player);
  vi.mocked(fleeDestroyedShip).mockReset();
});

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/escape']}>
      <Routes>
        <Route path="/escape" element={<EscapeState />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

it('gives the affected player a flee action and retains identity copy', async () => {
  const user = userEvent.setup();
  vi.mocked(fleeDestroyedShip).mockResolvedValue({
    status: 'committed', sessionId: 's1', requestId: 'flee-1', targetUid: 'u1', shipId: 'aegis',
    setupRevision: 2,
    escapeState: { ...player.escapeState, status: 'fled', fleeRequestId: 'flee-1' },
  });
  renderRoute();

  expect(screen.getByRole('heading', { name: /escape state/i })).toBeVisible();
  expect(screen.getByText(/printed identity remains retained/i)).toBeVisible();
  await user.click(screen.getByRole('button', { name: /flee destroyed ship/i }));
  expect(fleeDestroyedShip).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/escape recorded/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /flee destroyed ship/i })).not.toBeInTheDocument();
});


it('keeps a replacement-role holder on the authoritative flee route', async () => {
  const user = userEvent.setup();
  vi.mocked(fleeDestroyedShip).mockResolvedValue({
    status: 'committed', sessionId: 's1', requestId: 'flee-vip', targetUid: 'u1', shipId: 'dione',
    setupRevision: 2,
    escapeState: { ...player.escapeState, shipId: 'dione', status: 'fled', fleeRequestId: 'flee-vip' },
  });
  useSessionStore.getState().setMe({
    ...player, replacementRoleId: 'vip-host',
    escapeState: { ...player.escapeState, shipId: 'dione' },
  });
  renderRoute();

  expect(screen.getByText('vip-host')).toBeVisible();
  await user.click(screen.getByRole('button', { name: /flee destroyed ship/i }));
  expect(fleeDestroyedShip).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/escape recorded/i)).toBeVisible();
});
