import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { recommendedRoleIds } from '@/data/rolePresets';
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
  useSessionStore.getState().setMode('console');
});

it('returns from role selection to the intermediate screen', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/roles" element={<p>Intermediate route</p>} />
        <Route path="/console" element={<SessionMode mode="console" />} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /back to roles/i }));
  expect(screen.getByText('Intermediate route')).toBeInTheDocument();
});

it('identifies the unaffiliated SNN press shuttle', () => {
  useSessionStore.getState().setMode('press');
  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/press" element={<SessionMode mode="press" />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: /snn.*system news network/i }))
    .toBeInTheDocument();
  expect(screen.getByText(/unaffiliated independent press shuttle/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /leave shuttle/i }))
    .toHaveAttribute('href', '/console');
  expect(document.querySelector('.ship-console.shuttle-console')).toBeInTheDocument();
});

it('offers Press Officer and the GM Console from Select a role', async () => {
  const user = userEvent.setup();
  const pressView = render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/press" element={<p>SNN console</p>} />
        <Route path="/gm" element={<p>GM console</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: /select a role/i })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: /press officer/i }));
  expect(screen.getByText('SNN console')).toBeInTheDocument();
  expect(useSessionStore.getState().mode).toBe('console');
  pressView.unmount();

  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/gm" element={<p>GM console</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('link', { name: /gm console/i }));
  expect(screen.getByText('GM console')).toBeInTheDocument();
});

it('hides the GM Console from non-GM role selection', () => {
  const state = useSessionStore.getState();
  state.setMe({ ...state.me!, role: 'player' });
  state.setGmInstance(null);
  state.setMode('console');

  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes><Route path="/console" element={<SessionMode mode="console" />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: /gm console/i })).not.toBeInTheDocument();
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

  expect(screen.getByRole('heading', { name: 'Old Nations of Earth' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /old nations of earth.*council/i }))
    .not.toBeInTheDocument();

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
  expect(screen.getByRole('link', { name: /join aegis/i }))
    .toHaveAttribute('href', '/ships/aegis/roles');
  expect(screen.getByRole('img', { name: /interstellar council service navy flag/i }))
    .toHaveAttribute('data-shared-flag', 'aegis');
});

it('sends every staffed ship through its role picker', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setMode('console');
  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/ships/:shipId/roles" element={<p>Ship roles</p>} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /join capybara/i }));

  expect(screen.getByText('Ship roles')).toBeInTheDocument();
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

it('removes Dione from the joinable fleet when the GM disables it', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, dioneEnabled: false });
  useSessionStore.getState().setMode('console');

  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: /join dione/i })).not.toBeInTheDocument();
  expect(screen.getAllByRole('img')).toHaveLength(6);
});

it('hides disabled roles and offers enabled Joint Engineering Union stations', () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected the test session.');
  useSessionStore.getState().setGmInstance(null);
  useSessionStore.getState().setMe({ ...me, role: 'player' });
  useSessionStore.getState().setSession({
    ...session,
    activeRoleIds: recommendedRoleIds(9),
  });

  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes><Route path="/console" element={<SessionMode mode="console" />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: /press officer/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /join dione/i })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /quellon.*refinery engineer/i }))
    .toHaveAttribute('href', '/union/roles/joint-engineering-quellon-refinery');
});

it('does not advertise a Union station when its paired engineers are also active', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...session,
    activeRoleIds: [
      'admiral',
      'quellon-engineer',
      'refinery-124-engineer',
      'joint-engineering-quellon-refinery',
    ],
  });

  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes><Route path="/console" element={<SessionMode mode="console" />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: /quellon.*refinery engineer/i })).not.toBeInTheDocument();
});

it('returns a non-GM directly to their active command role', () => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setGmInstance(null);
  useSessionStore.getState().setMe({
    ...me,
    role: 'player',
    activeConsoleRoleId: 'dione-engineer',
  });

  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/ships/dione/roles/dione-engineer" element={<p>Locked role</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Locked role')).toBeInTheDocument();
});

it('does not redirect a player back into Dione after the GM disables it', () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected the test session.');
  useSessionStore.getState().setGmInstance(null);
  useSessionStore.getState().setMe({
    ...me,
    role: 'player',
    activeConsoleRoleId: 'dione-engineer',
  });
  useSessionStore.getState().setSession({ ...session, dioneEnabled: false });

  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/ships/dione/roles/dione-engineer" element={<p>Dione console</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: /select a role/i })).toBeInTheDocument();
  expect(screen.queryByText('Dione console')).not.toBeInTheDocument();
});

it('lets a GM reach every ship observer when command roles are disabled', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, activeRoleIds: [] });

  render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes><Route path="/console" element={<SessionMode mode="console" />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: /join aegis/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /join refinery 124/i })).toBeInTheDocument();
});
