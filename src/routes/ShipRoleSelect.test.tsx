import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ShipRoleSelect from './ShipRoleSelect';

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

it('offers the three AEGIS command roles with the ship flag and no repeated console copy', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles']}>
      <Routes>
        <Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} />
        <Route path="/ships/:shipId/roles/:roleId" element={<p>AEGIS console</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: /^admiral$/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /^executive officer$/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /^wing commander$/i })).toBeInTheDocument();
  expect(screen.queryByText(/wolf/i)).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: /interstellar council service navy flag/i })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /interstellar council service navy flag/i }))
    .toHaveStyle({ viewTransitionName: 'shared-ship-flag' });
  expect(screen.queryByText(/shared aegis command/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: /^executive officer$/i }));
  expect(screen.getByText('AEGIS console')).toBeInTheDocument();
});

it('returns to the fleet roster through a visible control', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /back to fleet/i }));
  expect(screen.getByText('Fleet roster')).toBeInTheDocument();
});

it('offers only roles the GM has enabled', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, activeRoleIds: ['admiral'] });

  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles']}>
      <Routes><Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: /^admiral$/i })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /executive officer/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /wing commander/i })).not.toBeInTheDocument();
});

it('hides Observer from players and offers it on every ship to the GM', () => {
  const { unmount } = render(
    <MemoryRouter initialEntries={['/ships/aegis/roles']}>
      <Routes><Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: /^observer$/i })).not.toBeInTheDocument();
  unmount();

  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });

  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles']}>
      <Routes><Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: /^observer$/i }))
    .toHaveAttribute('href', '/ships/aegis/observer');
});

it('keeps Observer available to the GM when every command role is disabled', () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected test session state.');
  useSessionStore.getState().setSession({ ...session, activeRoleIds: [] });
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });

  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: /^observer$/i })).toBeInTheDocument();
});
