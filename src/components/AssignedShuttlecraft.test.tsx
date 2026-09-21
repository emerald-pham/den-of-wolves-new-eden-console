import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import AssignedShuttlecraft from './AssignedShuttlecraft';

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table', joinCode: '4821', phase: 'active',
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
        holderUid: 'miner', revision: 1,
      },
    },
    createdAt: '', updatedAt: '',
  }, {
    uid: 'miner', sessionId: 's1', displayName: 'Miner', role: 'player', seatId: null,
    assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner', joinedAt: '',
  });
});

it('links the current holder to a shuttle transferred from another printed role', () => {
  render(<MemoryRouter><AssignedShuttlecraft roleId="icebreaker-miner" /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Open Starlight shuttle console' }))
    .toHaveAttribute('href', '/shuttles/starlight');
});
