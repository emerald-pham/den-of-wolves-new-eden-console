import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import RoleBrief from './RoleBrief';

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'casting', ownerUid: 'gm1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
      assignedRoleId: 'admiral', joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setRoleBrief({
    assignmentUid: 'u1', roleId: 'admiral', roleName: 'Admiral', vesselName: 'AEGIS',
    text: 'Coordinate the fleet.', commonRules: 'Keep this brief private.',
    ownedCraftIds: ['fighter-wing-alpha'], setupRevision: 1,
  });
});

it('renders the assigned role brief, common rules, and visible return control', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'Admiral' })).toBeVisible();
  expect(screen.getByText('Coordinate the fleet.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Role-owned craft' })).toBeVisible();
  expect(screen.getByText('Fighter Wing Alpha')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Common rules' })).toBeVisible();
  await user.click(screen.getByRole('link', { name: /return to role selection/i }));
  expect(screen.getByText('Role selection')).toBeInTheDocument();
});

it('returns to role selection when the local assignment no longer matches', () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, assignedRoleId: null });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Role selection')).toBeInTheDocument();
});

it('does not render a brief assigned to another player', () => {
  useSessionStore.getState().setRoleBrief({
    ...useSessionStore.getState().roleBrief!,
    assignmentUid: 'other-player',
  });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Role selection')).toBeInTheDocument();
});
