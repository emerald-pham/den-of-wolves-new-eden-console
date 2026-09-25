import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ReplacementRoleWorkspace from './ReplacementRoleWorkspace';

const replacements = [
  ['comms-officer', 'Comms Officer', 'AEGIS'],
  ['vip-host', 'VIP Host', 'Dione'],
  ['commissar', 'Commissar', 'Icebreaker'],
  ['rosal-militia-leader', 'Rosal Militia Leader', 'Shepherd'],
  ['doctor', 'Doctor', 'Quellon'],
  ['pdf-fighter-ace', 'P.D.F. Fighter Ace', 'Refinery 124'],
  ['wolf-commander', 'Wolf Commander', 'Wolf Armada'],
] as const;

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm-1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Operator', role: 'player', seatId: null,
      assignedRoleId: 'admiral', replacementRoleId: null, activeConsoleRoleId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setMode('console');
});

function renderWorkspace(roleId: string) {
  return render(
    <MemoryRouter initialEntries={[`/replacement/${roleId}`]}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/replacement/:roleId" element={<ReplacementRoleWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
}

it.each(replacements)('loads the reassigned %s shell with only its printed controls', async (roleId, name, vessel) => {
  const me = useSessionStore.getState().me!;
  useSessionStore.getState().setMe({ ...me, replacementRoleId: roleId, activeConsoleRoleId: null });
  if (roleId === 'comms-officer') {
    const session = useSessionStore.getState().session!;
    useSessionStore.getState().setSession({
      ...session,
      activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
      activeVesselIds: ['aegis', 'quellon', 'shepherd'],
    });
  }

  renderWorkspace(roleId);

  const workspace = screen.getByRole('region', { name: `${name} replacement workspace` });
  expect(within(workspace).getByRole('heading', { name })).toBeVisible();
  expect(workspace).toHaveTextContent(vessel);
  expect(workspace).toHaveTextContent('Facilitator reassignment confirmed');
  if (roleId === 'comms-officer') {
    expect(await within(workspace).findByRole('region', { name: 'Comms Officer scouting request' })).toBeVisible();
  } else {
    expect(within(workspace).queryByRole('region', { name: /scouting request/i })).not.toBeInTheDocument();
    expect(within(workspace).queryByRole('button')).not.toBeInTheDocument();
  }
});

it('rejects a deep link for a replacement role that was not assigned', () => {
  const me = useSessionStore.getState().me!;
  useSessionStore.getState().setMe({ ...me, replacementRoleId: 'doctor', activeConsoleRoleId: null });

  renderWorkspace('wolf-commander');

  expect(screen.getByText('Fleet roster')).toBeVisible();
  expect(screen.queryByRole('region', { name: /replacement workspace/i })).not.toBeInTheDocument();
});

it('fails closed when stale core-console authority remains alongside a replacement role', () => {
  const me = useSessionStore.getState().me!;
  useSessionStore.getState().setMe({
    ...me, replacementRoleId: 'doctor', activeConsoleRoleId: 'quellon-captain',
  });

  renderWorkspace('doctor');

  expect(screen.getByText('Fleet roster')).toBeVisible();
});
