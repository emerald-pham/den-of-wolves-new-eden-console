import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import JointEngineeringConsole from './JointEngineeringConsole';

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

it('opens an enabled union station and returns to role selection', async () => {
  const user = userEvent.setup();
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
