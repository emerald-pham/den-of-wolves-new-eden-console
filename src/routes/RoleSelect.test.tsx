import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import RoleSelect from './RoleSelect';

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
        <Route path="/console" element={<p>Console route</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleSelect', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('returns to the landing page when no session is loaded', () => {
    renderRoute();
    expect(screen.getByText('Landing route')).toBeInTheDocument();
  });

  it('offers GM and Console modes but no observer mode', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    renderRoute();

    expect(screen.getByRole('heading', { name: /connect this device/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /game master/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /console/i })).toBeInTheDocument();
    expect(screen.queryByText(/observer/i)).not.toBeInTheDocument();
  });

  it('connects a GM-authorized player to the GM route', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    renderRoute();

    await user.click(screen.getByRole('button', { name: /game master/i }));

    expect(screen.getByText('GM route')).toBeInTheDocument();
    expect(useSessionStore.getState().mode).toBe('gm');
  });

  it('connects any session member to the Console route', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    renderRoute();

    expect(screen.getByRole('button', { name: /game master/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /console/i }));

    expect(screen.getByText('Console route')).toBeInTheDocument();
    expect(useSessionStore.getState().mode).toBe('console');
  });
});
