import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { AegisCommandAndControlView } from '@/types/game';
import type { AegisCommandAndControlResult } from '@/types/game';
import AegisCommandAndControlPanel from './AegisCommandAndControlPanel';

const mocks = vi.hoisted(() => ({ get: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/sessionService', () => ({
  getAegisCommandAndControl: mocks.get,
  applyAegisCommandAndControl: mocks.redirect,
}));

const ready: AegisCommandAndControlView = {
  type: 'aegis-command-and-control-view', sessionId: 's1', turn: 2, revision: 5,
  eligible: true, commanderAssigned: true, rerollsFinalized: true,
  targets: [
    { rosterIndex: 0, shipId: 'wolf-fighter-wing' },
    { rosterIndex: 1, shipId: 'wolf-fighter-wing' },
    { rosterIndex: 2, shipId: 'wolf-cruiser' },
  ],
};

beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.get.mockReset().mockResolvedValue(ready);
  mocks.redirect.mockReset().mockResolvedValue({
    status: 'committed', type: 'aegis-command-and-control-result', sessionId: 's1',
    requestId: 'r1', turn: 2, revision: 6, rosterIndex: 2, shipId: 'wolf-cruiser',
    commanderCompletion: 'finished',
    view: {
      ...ready, revision: 6, eligible: false, reason: 'already-used', targets: [],
      redirectedShipId: 'wolf-cruiser',
    },
  } satisfies AegisCommandAndControlResult);
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1', createdAt: '', updatedAt: '' },
    { uid: 'xo1', sessionId: 's1', displayName: 'Executive Officer', role: 'player', seatId: null, assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', joinedAt: '' },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('offers one ship after targeting is finalized and sends only the selected roster index', async () => {
  const user = userEvent.setup();
  render(<AegisCommandAndControlPanel />);

  expect(await screen.findByRole('heading', { name: 'Command and Control' })).toBeVisible();
  expect(screen.getByText('Wolf Fighter Wing 1')).toBeVisible();
  expect(screen.getByText('Wolf Fighter Wing 2')).toBeVisible();
  expect(screen.getByText('Wolf Cruiser')).toBeVisible();
  expect(screen.queryByText(/die|targeted at/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'Wolf Cruiser' }));
  await user.click(screen.getByRole('button', { name: /redirect selected ship/i }));

  await waitFor(() => expect(mocks.redirect).toHaveBeenCalledWith(2, 5, 2));
  expect(await screen.findByText(/wolf cruiser redirected to aegis/i)).toBeVisible();
});

it('keeps duplicate ship labels tied to the exact returned roster entry', async () => {
  mocks.redirect.mockResolvedValueOnce({
    status: 'committed', type: 'aegis-command-and-control-result', sessionId: 's1',
    requestId: 'r2', turn: 2, revision: 6, rosterIndex: 1, shipId: 'wolf-fighter-wing',
    commanderCompletion: 'finished',
    view: {
      ...ready, revision: 6, eligible: false, reason: 'already-used', targets: [],
      redirectedShipId: 'wolf-fighter-wing',
    },
  } satisfies AegisCommandAndControlResult);
  const user = userEvent.setup();
  render(<AegisCommandAndControlPanel />);

  await user.click(await screen.findByRole('radio', { name: 'Wolf Fighter Wing 2' }));
  await user.click(screen.getByRole('button', { name: /redirect selected ship/i }));

  await waitFor(() => expect(mocks.redirect).toHaveBeenCalledWith(2, 5, 1));
  expect(await screen.findByText(/wolf fighter wing 2 redirected to aegis/i)).toBeVisible();
});

it('discards a success reply that does not identify the selected roster entry', async () => {
  mocks.redirect.mockResolvedValueOnce({
    status: 'committed', type: 'aegis-command-and-control-result', sessionId: 's1',
    requestId: 'mismatched', turn: 2, revision: 6, rosterIndex: 1, shipId: 'wolf-cruiser',
    commanderCompletion: 'finished',
    view: {
      ...ready, revision: 6, eligible: false, reason: 'already-used', targets: [],
      redirectedShipId: 'wolf-cruiser',
    },
  } satisfies AegisCommandAndControlResult);
  const user = userEvent.setup();
  render(<AegisCommandAndControlPanel />);

  await user.click(await screen.findByRole('radio', { name: 'Wolf Cruiser' }));
  await user.click(screen.getByRole('button', { name: /redirect selected ship/i }));

  expect(await screen.findByText(/receipt did not match the selected ship/i)).toBeVisible();
  expect(screen.queryByRole('radio', { name: 'Wolf Cruiser' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /redirect selected ship/i })).toBeDisabled();
});

it('keeps the C&C window pending until an assigned disconnected Commander finishes', async () => {
  mocks.get.mockResolvedValue({
    ...ready, eligible: false, commanderAssigned: true, rerollsFinalized: false,
    reason: 'commander-pending', targets: [],
  });
  render(<AegisCommandAndControlPanel />);

  expect(await screen.findByText(/reconnect and finish rerolls/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /redirect selected ship/i })).toBeDisabled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it('explains when AEGIS damage status is unavailable', async () => {
  mocks.get.mockResolvedValue({
    ...ready, eligible: false, commanderAssigned: true, rerollsFinalized: true,
    reason: 'damage-unknown', targets: [],
  });
  render(<AegisCommandAndControlPanel />);
  expect(await screen.findByText(/damage status could not be verified/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /redirect selected ship/i })).toBeDisabled();
});

it('explains that the redirect records completion when no Commander is assigned', async () => {
  mocks.get.mockResolvedValue({ ...ready, commanderAssigned: false, rerollsFinalized: false });
  render(<AegisCommandAndControlPanel />);
  expect(await screen.findByText(/no wolf commander is assigned/i)).toBeVisible();
});

it('removes stale target choices after a rejected redirect until the officer refreshes', async () => {
  const user = userEvent.setup();
  mocks.redirect.mockRejectedValueOnce(new Error('stale revision'));
  render(<AegisCommandAndControlPanel />);

  await screen.findByRole('radio', { name: 'Wolf Cruiser' });
  await user.click(screen.getByRole('radio', { name: 'Wolf Cruiser' }));
  await user.click(screen.getByRole('button', { name: /redirect selected ship/i }));

  expect(await screen.findByText(/refresh the current targeting state/i)).toBeVisible();
  expect(screen.queryByRole('radio', { name: 'Wolf Cruiser' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /redirect selected ship/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /refresh command and control/i })).toBeEnabled();
});

it('does not read or render controls for a different active post', async () => {
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'admiral',
  }));
  const { container } = render(<AegisCommandAndControlPanel />);
  expect(container).toBeEmptyDOMElement();
  expect(mocks.get).not.toHaveBeenCalled();
});

it('does not render for a non-player with a stale Executive Officer role field', () => {
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, role: 'gm', activeConsoleRoleId: 'executive-officer',
  }));
  const { container } = render(<AegisCommandAndControlPanel />);
  expect(container).toBeEmptyDOMElement();
  expect(mocks.get).not.toHaveBeenCalled();
});
