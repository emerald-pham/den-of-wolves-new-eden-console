import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { AegisCommandAndControlView } from '@/types/game';
import type { WolfAttackMemberView } from '@/types/game';
import type { AegisCommandAndControlResult } from '@/types/game';
import AegisCommandAndControlPanel from './AegisCommandAndControlPanel';

const mocks = vi.hoisted(() => ({ get: vi.fn(), redirect: vi.fn(), pass: vi.fn(), subscribe: vi.fn() }));
vi.mock('@/lib/sessionService', () => ({
  getAegisCommandAndControl: mocks.get,
  applyAegisCommandAndControl: mocks.redirect,
  passAegisCommandAndControl: mocks.pass,
}));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: mocks.subscribe }));

let memberListener: ((view: WolfAttackMemberView | null) => void) | null = null;

function memberView(sessionId = 's1', revision = 5, currentStep: WolfAttackMemberView['currentStep'] = 'targeting'):
  WolfAttackMemberView {
  return {
    type: 'wolf-attack-member-view', schemaVersion: 1, sessionId, attackId: `attack-${revision}`,
    turn: 2, revision, status: 'declared', phase: 'active', currentStep,
    range: null, deadlineAt: '2026-10-03T12:10:00.000Z', serverTime: '2026-10-03T12:00:00.000Z',
    visibility: 'members', redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
    results: [],
  };
}

function publishMember(view: WolfAttackMemberView): void {
  memberListener?.(view);
}

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
  memberListener = null;
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
  mocks.pass.mockReset().mockResolvedValue({
    status: 'committed', type: 'aegis-command-and-control-pass-result', sessionId: 's1',
    requestId: 'pass-1', turn: 2, revision: 6, commanderCompletion: 'finished',
    view: {
      ...ready, revision: 6, eligible: false, reason: 'passed', targets: [],
    },
  });
  mocks.subscribe.mockReset().mockImplementation((sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
    memberListener = onView;
    onView(memberView(sessionId));
    return () => { if (memberListener === onView) memberListener = null; };
  });
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1', createdAt: '', updatedAt: '' },
    { uid: 'xo1', sessionId: 's1', displayName: 'Executive Officer', role: 'player', seatId: null, assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', fleetGroupId: 'fleet-a', joinedAt: '' },
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('offers one ship after targeting is finalized and sends only the selected roster index', async () => {
  const user = userEvent.setup();
  render(<AegisCommandAndControlPanel />);

  expect(await screen.findByRole('heading', { name: 'Command and Control' })).toBeVisible();
  expect(await screen.findByText('Wolf Fighter Wing 1')).toBeVisible();
  expect(screen.getByText('Wolf Fighter Wing 2')).toBeVisible();
  expect(screen.getByText('Wolf Cruiser')).toBeVisible();
  expect(screen.queryByText(/die|targeted at/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'Wolf Cruiser' }));
  await user.click(screen.getByRole('button', { name: /redirect selected ship/i }));

  await waitFor(() => expect(mocks.redirect).toHaveBeenCalledWith(2, 5, 2));
  expect(await screen.findByText(/wolf cruiser redirected to aegis/i)).toBeVisible();
});

it('offers an explicit pass and records that no target was redirected', async () => {
  const user = userEvent.setup();
  render(<AegisCommandAndControlPanel />);

  await screen.findByRole('radio', { name: 'Wolf Cruiser' });
  await user.click(screen.getByRole('button', { name: /pass command and control/i }));

  await waitFor(() => expect(mocks.pass).toHaveBeenCalledWith(2, 5));
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(await screen.findByText(/passed.*no redirect made/i)).toBeVisible();
  expect(screen.queryByRole('radio', { name: 'Wolf Cruiser' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /redirect selected ship/i })).toBeDisabled();
});

it('withdraws an old target list when the current EO identity changes', async () => {
  let resolveOld!: (value: AegisCommandAndControlView) => void;
  let resolveNew!: (value: AegisCommandAndControlView) => void;
  const oldRead = new Promise<AegisCommandAndControlView>((resolve) => { resolveOld = resolve; });
  const newRead = new Promise<AegisCommandAndControlView>((resolve) => { resolveNew = resolve; });
  mocks.get.mockReset().mockImplementationOnce(() => oldRead).mockImplementationOnce(() => newRead);
  const { container } = render(<AegisCommandAndControlPanel />);
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));

  act(() => useSessionStore.getState().setIdentity(
    useSessionStore.getState().session!,
    { ...useSessionStore.getState().me!, uid: 'xo2', fleetGroupId: 'fleet-b', connectionGeneration: 2 },
  ));
  expect(container.querySelector('[name="aegis-cnc-target"]')).not.toBeInTheDocument();
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  await act(async () => resolveOld(ready));
  expect(container.querySelector('[name="aegis-cnc-target"]')).not.toBeInTheDocument();

  const next = {
    ...ready,
    targets: [{ rosterIndex: 0, shipId: 'wolf-destroyer' }],
  } satisfies AegisCommandAndControlView;
  await act(async () => resolveNew(next));
  expect(await screen.findByRole('radio', { name: 'Wolf Destroyer' })).toBeVisible();
  expect(screen.queryByRole('radio', { name: 'Wolf Cruiser' })).not.toBeInTheDocument();
});

it('does not hydrate a late redirect after the current Executive Officer changes', async () => {
  let resolveRedirect!: (value: AegisCommandAndControlResult) => void;
  const redirect = new Promise<AegisCommandAndControlResult>((resolve) => { resolveRedirect = resolve; });
  mocks.redirect.mockReset().mockReturnValueOnce(redirect);
  mocks.get.mockReset().mockResolvedValue(ready);
  const user = userEvent.setup();
  render(<AegisCommandAndControlPanel />);
  await user.click(await screen.findByRole('radio', { name: 'Wolf Cruiser' }));
  await user.click(screen.getByRole('button', { name: /redirect selected ship/i }));
  await waitFor(() => expect(mocks.redirect).toHaveBeenCalledWith(2, 5, 2));

  act(() => useSessionStore.getState().setIdentity(
    useSessionStore.getState().session!,
    { ...useSessionStore.getState().me!, uid: 'xo2', fleetGroupId: 'fleet-b', connectionGeneration: 2 },
  ));
  await act(async () => resolveRedirect({
    status: 'committed', type: 'aegis-command-and-control-result', sessionId: 's1',
    requestId: 'late', turn: 2, revision: 6, rosterIndex: 2, shipId: 'wolf-cruiser',
    commanderCompletion: 'finished',
    view: { ...ready, revision: 6, eligible: false, reason: 'already-used', targets: [], redirectedShipId: 'wolf-cruiser' },
  }));

  expect(screen.queryByText(/wolf cruiser redirected to aegis/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'Wolf Cruiser' })).not.toBeInTheDocument();
});

it('withdraws the EO targets immediately when console authority is locked after a successful read', async () => {
  const { rerender } = render(<AegisCommandAndControlPanel />);
  await screen.findByRole('radio', { name: 'Wolf Cruiser' });

  rerender(<AegisCommandAndControlPanel consoleLocked />);

  expect(screen.queryByRole('radio', { name: 'Wolf Cruiser' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /redirect selected ship/i })).toBeDisabled();
});

it('withdraws private EO targets when the connection or snapshot freshness is lost', async () => {
  const { container } = render(<AegisCommandAndControlPanel />);
  await screen.findByRole('radio', { name: 'Wolf Cruiser' });

  act(() => useSessionStore.getState().setConnection('offline'));
  expect(container.querySelector('[name="aegis-cnc-target"]')).not.toBeInTheDocument();
  act(() => {
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
  });
  expect(container.querySelector('[name="aegis-cnc-target"]')).not.toBeInTheDocument();
});

it('withdraws EO targets when the server advances beyond targeting', async () => {
  const { container } = render(<AegisCommandAndControlPanel />);
  await screen.findByRole('radio', { name: 'Wolf Cruiser' });

  act(() => publishMember(memberView('s1', 6, 'long-range')));

  expect(container.querySelector('[name="aegis-cnc-target"]')).not.toBeInTheDocument();
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
