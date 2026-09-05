import { render, screen } from '@testing-library/react';
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

  it('shows the role assigned by the server without fake selection controls', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    renderRoute();

    expect(screen.getByRole('heading', { name: /session ready/i })).toBeInTheDocument();
    expect(screen.getByText('Game Master')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
