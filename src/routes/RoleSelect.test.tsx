import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import RoleSelect from './RoleSelect';

vi.mock('@/lib/sessionService', () => ({
  claimGmInstance: vi.fn(),
}));

const { claimGmInstance } = await import('@/lib/sessionService');

const session: GameSession = {
  id: 's1',
  name: 'Table one',
  joinCode: '4821',
  phase: 'lobby',
  ownerUid: 'gm1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const gm: Player = {
  uid: 'gm1',
  sessionId: 's1',
  displayName: 'GM',
  role: 'gm',
  seatId: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/roles']}>
      <Routes>
        <Route path="/" element={<p>Landing route</p>} />
        <Route path="/roles" element={<RoleSelect />} />
        <Route path="/gm" element={<p>GM route</p>} />
        <Route path="/setup" element={<p>Setup route</p>} />
        <Route path="/console" element={<p>Console route</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleSelect', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.mocked(claimGmInstance).mockReset();
  });

  it('returns to the landing page when no session is loaded', () => {
    renderRoute();
    expect(screen.getByText('Landing route')).toBeInTheDocument();
  });

  it('offers Claim GM, GM Console, Setup, and Roles', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    renderRoute();

    expect(screen.getByRole('heading', { name: /connect this device/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^claim gm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gm console/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /setup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /roles/i })).toBeInTheDocument();
    expect(screen.queryByText(/observer/i)).not.toBeInTheDocument();
  });

  it('requires an instance name before claiming GM and persists the claim', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    vi.mocked(claimGmInstance).mockImplementation(async (name) => {
      useSessionStore.getState().setGmInstance({
        id: 'instance-1', sessionId: 's1', uid: 'gm1', name,
        deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
      });
      useSessionStore.getState().setMe(gm);
      return 'applied';
    });
    renderRoute();

    const claim = screen.getByRole('button', { name: /^claim gm/i });
    expect(claim).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /gm instance name/i }), 'Bridge laptop');
    await user.click(claim);

    expect(claimGmInstance).toHaveBeenCalledWith('Bridge laptop');
    expect(screen.getByRole('button', { name: /gm claimed/i })).toBeDisabled();
    expect(useSessionStore.getState().gmInstance?.name).toBe('Bridge laptop');
  });

  it('blocks GM Console and Setup until this browser has claimed GM', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    renderRoute();

    expect(screen.getByRole('button', { name: /gm console/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /setup/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /roles/i }));

    expect(screen.getByText('Console route')).toBeInTheDocument();
    expect(useSessionStore.getState().mode).toBe('console');
  });

  it('opens GM Console and Setup after this browser claims GM', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'gm1', name: 'Bridge laptop',
      deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const { unmount } = renderRoute();

    await user.click(screen.getByRole('button', { name: /gm console/i }));
    expect(screen.getByText('GM route')).toBeInTheDocument();

    unmount();
    useSessionStore.getState().setMode(null);
    renderRoute();
    await user.click(screen.getByRole('button', { name: /setup/i }));
    expect(screen.getByText('Setup route')).toBeInTheDocument();
  });
});
