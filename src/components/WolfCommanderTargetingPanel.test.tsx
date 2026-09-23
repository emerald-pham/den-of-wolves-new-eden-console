import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import WolfCommanderTargetingPanel from './WolfCommanderTargetingPanel';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfCommanderTargetingView } from '@/types/game';
import type { WolfCommanderTargetRerollResult } from '@/lib/sessionService';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  apply: vi.fn(),
  finish: vi.fn(),
}));

vi.mock('@/lib/sessionService', () => ({
  getWolfCommanderTargeting: mocks.get,
  applyWolfCommanderTargetRerolls: mocks.apply,
  finishWolfCommanderTargetingRerolls: mocks.finish,
}));

const view: WolfCommanderTargetingView = {
  type: 'wolf-commander-targeting-view', sessionId: 's1', turn: 1, revision: 2,
  currentStep: 'targeting', rerollsFinalized: false,
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
  mocks.finish.mockClear();
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
  expect(screen.getByText(/selected dice rerolled/i)).toBeVisible();
});

it('lets the Commander explicitly finish an empty reroll window', async () => {
  const user = userEvent.setup();
  mocks.finish.mockResolvedValue({
    status: 'committed', type: 'wolf-commander-targeting-finish', sessionId: 's1', requestId: 'f1',
    turn: 1, revision: 3, currentStep: 'targeting', view: {
      ...view, revision: 3, rerollsFinalized: true,
    },
  });
  render(<WolfCommanderTargetingPanel />);

  await screen.findByText('Die 2 // Dione');
  await user.click(screen.getByRole('button', { name: /finish rerolls/i }));

  await waitFor(() => expect(mocks.finish).toHaveBeenCalledWith(1, 2));
  expect(screen.getByText(/reroll window is closed/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /finish rerolls/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /reroll selected dice/i })).toBeDisabled();
});

it('drops a stale targeting view after finish is rejected until refreshed', async () => {
  const user = userEvent.setup();
  mocks.finish.mockRejectedValueOnce(new Error('stale revision'));
  render(<WolfCommanderTargetingPanel />);

  await screen.findByText('Die 2 // Dione');
  await user.click(screen.getByRole('button', { name: /finish rerolls/i }));

  expect(await screen.findByText(/finish rejected.*refresh/i)).toBeVisible();
  expect(screen.queryByText('Die 2 // Dione')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /finish rerolls/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /refresh targeting/i })).toBeEnabled();
});

it('does not render for a historical role without the active replacement authority', () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementRoleId: null, assignedRoleId: 'wolf-commander' });
  const { container } = render(<WolfCommanderTargetingPanel />);
  expect(container).toBeEmptyDOMElement();
  expect(mocks.get).not.toHaveBeenCalled();
});

it('drops a delayed targeting read after the player changes sessions', async () => {
  let finishOldRead!: (value: WolfCommanderTargetingView) => void;
  const oldRead = new Promise<WolfCommanderTargetingView>((resolve) => { finishOldRead = resolve; });
  const newView: WolfCommanderTargetingView = {
    ...view,
    sessionId: 's2',
    rolls: [{ ...view.rolls[0]!, die: 6, target: 'aegis' }],
    eligibleRerollIndexes: [0], rerolledIndexes: [],
  };
  mocks.get.mockReset();
  mocks.get.mockImplementationOnce(() => oldRead).mockResolvedValueOnce(newView);
  render(<WolfCommanderTargetingPanel />);
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));

  act(() => useSessionStore.getState().setIdentity(
    { ...useSessionStore.getState().session!, id: 's2' },
    { ...useSessionStore.getState().me!, sessionId: 's2' },
  ));
  expect(await screen.findByText('Die 6 // Aegis')).toBeVisible();

  await act(async () => finishOldRead(view));
  expect(screen.queryByText('Die 2 // Dione')).not.toBeInTheDocument();
});

it('clears a delayed reroll result when Commander authority is removed', async () => {
  let finishReroll!: (value: WolfCommanderTargetRerollResult) => void;
  const oldReroll = new Promise<WolfCommanderTargetRerollResult>((resolve) => {
    finishReroll = resolve;
  });
  mocks.apply.mockReset();
  mocks.apply.mockReturnValueOnce(oldReroll);
  const { container } = render(<WolfCommanderTargetingPanel />);
  await screen.findByText('Die 2 // Dione');
  const user = userEvent.setup();
  await user.click(screen.getAllByRole('checkbox')[0]!);
  await user.click(screen.getByRole('button', { name: /reroll selected dice/i }));
  await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(1, 2, [0]));

  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementRoleId: null,
  }));
  expect(container).toBeEmptyDOMElement();

  await act(async () => finishReroll({
    status: 'committed', type: 'wolf-commander-target-reroll', sessionId: 's1', requestId: 'late',
    turn: 1, revision: 3, currentStep: 'targeting', rerolledIndexes: [0], view: {
      ...view, revision: 3, eligibleRerollIndexes: [], rerolledIndexes: [0, 1],
    },
  }));
  expect(container).toBeEmptyDOMElement();
});
