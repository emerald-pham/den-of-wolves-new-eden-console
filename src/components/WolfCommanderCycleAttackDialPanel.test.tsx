import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import WolfCommanderCycleAttackDialPanel from './WolfCommanderCycleAttackDialPanel';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ get: vi.fn(), commit: vi.fn() }));

vi.mock('@/lib/sessionService', () => ({
  getWolfCommanderCycleAttackDial: mocks.get,
  commitWolfCommanderAttackDial: mocks.commit,
}));

beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.get.mockReset().mockResolvedValue({
    type: 'wolf-commander-cycle-dial-view', sessionId: 's1', cycle: 4,
    navigationRevision: 8, status: 'available',
    groups: [
      { groupId: 'fleet-1', pursuitValue: 2 },
      { groupId: 'fleet-2', pursuitValue: 7 },
    ],
  });
  mocks.commit.mockReset().mockResolvedValue({
    status: 'committed', type: 'wolf-commander-cycle-attack', sessionId: 's1',
    requestId: 'r1', cycle: 4, groupId: 'fleet-2', targetGroupPursuit: 7,
    damageCapacity: 17, attackNumber: 4, navigationRevision: 8,
  });
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 4,
      ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { uid: 'u1', sessionId: 's1', displayName: 'Commander', role: 'player', seatId: null,
      assignedRoleId: null, replacementRoleId: 'wolf-commander', fleetGroupId: 'fleet-1',
      joinedAt: '2026-01-01T00:00:00.000Z' },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('lets the assigned Commander select a fleet group and commit only its current pursuit dial', async () => {
  const user = userEvent.setup();
  render(<WolfCommanderCycleAttackDialPanel />);

  expect(await screen.findByRole('heading', { name: 'Wolf fleet dial' })).toBeVisible();
  const group = screen.getByRole('combobox', { name: 'Target fleet group' });
  expect(group).toHaveDisplayValue('Fleet 1 // pursuit 2');
  await user.selectOptions(group, 'fleet-2');
  expect(screen.getByText('10 + 7 = 17 damage capacity')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Commit this cycle attack dial' }));

  await waitFor(() => expect(mocks.commit).toHaveBeenCalledWith('fleet-2', 4, 8));
  expect(await screen.findByText('Cycle 4 dial committed // attack 4 // 17 damage capacity')).toBeVisible();
  expect(screen.queryByText(/Battlestation|Strikecarrier|composition/i)).not.toBeInTheDocument();
});

it('does not query a Commander dial for a non-Commander identity', () => {
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementRoleId: null, assignedRoleId: 'wolf-commander',
  }));
  const { container } = render(<WolfCommanderCycleAttackDialPanel />);
  expect(container).toBeEmptyDOMElement();
  expect(mocks.get).not.toHaveBeenCalled();
});
