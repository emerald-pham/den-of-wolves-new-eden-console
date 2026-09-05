import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ShipConsole from './ShipConsole';

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setMode('console');
});

it('shows only the joined ship identity, nation marking, and fleet role', () => {
  render(
    <MemoryRouter initialEntries={['/ships/capybara']}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'Capybara' })).toBeInTheDocument();
  expect(screen.getByText(/south american nations/i)).toBeInTheDocument();
  expect(screen.getByText(/supplies the fleet with essential food, water, and materials/i)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /south american nations flag/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /leave ship/i })).toHaveAttribute('href', '/console');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText(/captain|engineer|recycler/i)).not.toBeInTheDocument();
});

it('returns to the fleet roster when the ship id is unknown', () => {
  render(
    <MemoryRouter initialEntries={['/ships/not-a-ship']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Fleet roster')).toBeInTheDocument();
});

it('leaves the ship through the visible return control', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/ships/quellon']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /leave ship/i }));
  expect(screen.getByText('Fleet roster')).toBeInTheDocument();
});
