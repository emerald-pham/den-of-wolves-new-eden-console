import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import WolfCommanderTargetingPanel from './WolfCommanderTargetingPanel';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfCommanderTargetingView } from '@/types/game';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  apply: vi.fn(),
}));

vi.mock('@/lib/sessionService', () => ({
  getWolfCommanderTargeting: mocks.get,
  applyWolfCommanderTargetRerolls: mocks.apply,
}));

const view: WolfCommanderTargetingView = {
  type: 'wolf-commander-targeting-view', sessionId: 's1', turn: 1, revision: 2,
  currentStep: 'targeting',
  rolls: [
    { rosterIndex: 0, shipId: 'wolf-fighter-wing', die: 2, target: 'dione' },
    { rosterIndex: 1, shipId: 'wolf-assault-transport', die: 5, target: 'shepherd' },
  ],
  eligibleRerollIndexes: [0], rerolledIndexes: [1],
};

beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.get.mockClear();
  mocks.apply.mockClear();
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { uid: 'u1', sessionId: 's1', displayName: 'Commander', role: 'player', seatId: null, assignedRoleId: null, replacementRoleId: 'wolf-commander', joinedAt: '2026-01-01T00:00:00.000Z' },
  );
  mocks.get.mockResolvedValue(view);
  mocks.apply.mockResolvedValue({
    status: 'committed', type: 'wolf-commander-target-reroll', sessionId: 's1', requestId: 'r1',
    turn: 1, revision: 3, currentStep: 'targeting', rerolledIndexes: [0], view: {
      ...view, revision: 3, eligibleRerollIndexes: [], rerolledIndexes: [0, 1],
    },
  });
});

it('shows current dice, keeps used dice disabled, and submits only selected indexes', async () => {
  const user = userEvent.setup();
  render(<WolfCommanderTargetingPanel />);

  expect(await screen.findByRole('heading', { name: 'Targeting dice' })).toBeVisible();
  expect(screen.getByText('Die 2 // Dione')).toBeVisible();
  expect(screen.getByText('Die 5 // Shepherd')).toBeVisible();
  const checkboxes = screen.getAllByRole('checkbox');
  expect(checkboxes).toHaveLength(2);
  expect(checkboxes[0]).toBeEnabled();
  expect(checkboxes[1]).toBeDisabled();
  await user.click(checkboxes[0]!);
  await user.click(screen.getByRole('button', { name: /reroll selected dice/i }));
  await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(1, 2, [0]));
  expect(screen.getByText(/rerolls committed privately/i)).toBeVisible();
});

it('does not render for a historical role without the active replacement authority', () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementRoleId: null, assignedRoleId: 'wolf-commander' });
  const { container } = render(<WolfCommanderTargetingPanel />);
  expect(container).toBeEmptyDOMElement();
  expect(mocks.get).not.toHaveBeenCalled();
});
