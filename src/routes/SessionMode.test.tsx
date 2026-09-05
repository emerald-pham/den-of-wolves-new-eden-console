import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import SessionMode from './SessionMode';

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setGmInstance({
    id: 'local-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
    deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setMode('setup');
});

it.each([
  ['setup', 'setup'],
  ['console', 'console'],
] as const)('returns from %s to the roles screen', async (_label, mode) => {
  const user = userEvent.setup();
  useSessionStore.getState().setMode(mode);
  render(
    <MemoryRouter initialEntries={[`/${mode}`]}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path={`/${mode}`} element={<SessionMode mode={mode} />} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /back to roles/i }));

  expect(screen.getByText('Roles route')).toBeInTheDocument();
});

it('groups every ship role by its world of origin without exposing ship actions', () => {
  useSessionStore.getState().setMode('console');
  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/ships/:shipId" element={<p>Joined ship</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const earth = screen.getByRole('region', { name: /old nations of earth/i });
  const colonies = screen.getByRole('region', { name: /new nations of the colonies/i });

  for (const ship of ['AEGIS', 'Dione', 'Icebreaker', 'Capybara']) {
    expect(within(earth).getByRole('article', { name: new RegExp(ship, 'i') })).toBeInTheDocument();
  }
  for (const ship of ['Shepherd', 'Quellon', 'Refinery 124']) {
    expect(within(colonies).getByRole('article', { name: new RegExp(ship, 'i') })).toBeInTheDocument();
  }

  expect(screen.getAllByRole('img')).toHaveLength(7);
  expect(screen.getByText(/main protector of the survivor fleet/i)).toBeInTheDocument();
  expect(screen.getByText(/produces food for the fleet/i)).toBeInTheDocument();
  expect(screen.getByText(/provides strytium fuel/i)).toBeInTheDocument();
});

it('joins a ship without assigning a shipboard subrole', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setMode('console');
  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/ships/:shipId" element={<p>Joined ship</p>} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /join capybara/i }));

  expect(screen.getByText('Joined ship')).toBeInTheDocument();
  expect(useSessionStore.getState().mode).toBe('console');
});

it('removes Capybara from the joinable fleet when the GM disables it', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, capybaraEnabled: false });
  useSessionStore.getState().setMode('console');

  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: /join capybara/i })).not.toBeInTheDocument();
  expect(screen.getAllByRole('img')).toHaveLength(6);
});
