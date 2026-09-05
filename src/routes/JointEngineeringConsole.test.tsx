import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import JointEngineeringConsole from './JointEngineeringConsole';

vi.mock('@/lib/sessionService', () => ({
  selectConsoleRole: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    activeRoleIds: ['joint-engineering-quellon-refinery'],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setMode('console');
});

it('lets a GM open an enabled union station and return to role selection', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });
  render(
    <MemoryRouter initialEntries={['/union/roles/joint-engineering-quellon-refinery']}>
      <Routes>
        <Route path="/console" element={<p>Role selection</p>} />
        <Route path="/union/roles/:roleId" element={<JointEngineeringConsole />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: /joint engineering union/i })).toBeInTheDocument();
  expect(screen.getByText(/quellon.*refinery engineer/i)).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: /back to role selection/i }));
  expect(screen.getByText('Role selection')).toBeInTheDocument();
});

it('keeps a non-GM engineer at the selected station until settings releases it', () => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({
    ...me,
    activeConsoleRoleId: 'joint-engineering-quellon-refinery',
  });

  render(
    <MemoryRouter initialEntries={['/union/roles/joint-engineering-quellon-refinery']}>
      <Routes>
        <Route path="/union/roles/:roleId" element={<JointEngineeringConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: /back to role selection/i })).not.toBeInTheDocument();
});

it('keeps an engineer at a held station if the GM disables it', () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected test session state.');
  useSessionStore.getState().setSession({ ...session, activeRoleIds: [] });
  useSessionStore.getState().setMe({
    ...me,
    activeConsoleRoleId: 'joint-engineering-quellon-refinery',
  });

  render(
    <MemoryRouter initialEntries={['/union/roles/joint-engineering-quellon-refinery']}>
      <Routes>
        <Route path="/console" element={<p>Role selection</p>} />
        <Route path="/union/roles/:roleId" element={<JointEngineeringConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: /joint engineering union/i })).toBeInTheDocument();
});
