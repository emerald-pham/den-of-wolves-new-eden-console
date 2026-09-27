import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import HighwallMining from './HighwallMining';

const mocks = vi.hoisted(() => {
  class UncertainError extends Error {
    constructor(readonly retry: unknown) {
      super('The Highwall mining result is uncertain.');
    }
  }
  return {
    run: vi.fn(), retry: vi.fn(), canRetry: vi.fn(() => true), UncertainError,
  };
});

vi.mock('@/lib/highwallMiningService', () => ({
  runHighwallMining: mocks.run,
  retryHighwallMiningExactly: mocks.retry,
  canRetryHighwallMiningExactly: mocks.canRetry,
  HighwallMiningUncertainError: mocks.UncertainError,
}));

const control = {
  shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner', ownerUid: 'owner', holderUid: 'u1', revision: 4,
} as const;
const docking = { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' } as const;
const operation = { requestId: 'mine-existing', resource: 'materials' as const, rolls: [3], amount: 3 };
const staleReply = {
  status: 'stale', sessionId: 's1', requestId: 'mine-request', resource: 'ore',
  expectedRevision: 2, currentRevision: 3, expectedControlRevision: 4,
  currentControlRevision: 5, expectedCycle: 2, currentCycle: 2, hostShipId: 'icebreaker',
} as const;

function updateSession(patch: Record<string, unknown>): void {
  const current = useSessionStore.getState();
  act(() => current.setIdentity({ ...current.session!, ...patch } as never, current.me!));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.run.mockReset();
  mocks.retry.mockReset();
  mocks.canRetry.mockReset().mockReturnValue(true);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
    createdAt: '', updatedAt: '', currentTurn: 2,
    activeRoleIds: ['icebreaker-miner'], activeVesselIds: ['icebreaker'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2099-09-22T12:00:00.000Z', openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleControl: { highwall: control }, shuttleDockings: [docking], shuttleFuelled: { highwall: false },
    highwallMining: { cycle: 2, revision: 2, operations: [] },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['icebreaker'], revision: 0, knownCoordinates: [],
      knownSystems: {}, pursuitDistance: 0, navigationLogs: [],
    },
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Miner', role: 'player', seatId: null,
    assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner',
    fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('waits for the current server state and requires an explicit fresh-CAS retry', async () => {
  const user = userEvent.setup();
  const pending = deferred<typeof staleReply>();
  mocks.run.mockReturnValueOnce(pending.promise).mockResolvedValue({
    status: 'committed', operation: { requestId: 'new-request', resource: 'ore', rolls: [2, 5, 3], amount: 10 },
  });
  render(<HighwallMining control={control} docking={docking} fuelled={false} />);
  await user.click(screen.getByRole('button', { name: /roll 3d6 strytium ore/i }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));

  await act(async () => pending.resolve(staleReply));
  const retry = screen.getByRole('button', { name: /retry selected highwall operation/i });
  expect(retry).toBeDisabled();
  expect(mocks.run).toHaveBeenCalledTimes(1);

  updateSession({
    shuttleControl: { highwall: { ...control, revision: 5 } },
    highwallMining: { cycle: 2, revision: 3, operations: [operation] },
  });
  await waitFor(() => expect(retry).toBeEnabled());
  expect(mocks.run).toHaveBeenCalledTimes(1);
  await user.click(retry);
  await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(2));
  expect(mocks.run).toHaveBeenLastCalledWith('ore', 3, 5, 2);
  expect(screen.getByRole('status')).toHaveTextContent(/operation committed/i);
});

it('withholds fresh retry when the current Highwall holder changes', async () => {
  const user = userEvent.setup();
  mocks.run.mockResolvedValueOnce(staleReply);
  render(<HighwallMining control={control} docking={docking} fuelled={false} />);
  await user.click(screen.getByRole('button', { name: /roll 3d6 strytium ore/i }));
  const retry = await screen.findByRole('button', { name: /retry selected highwall operation/i });
  expect(retry).toBeDisabled();

  updateSession({
    shuttleControl: { highwall: { ...control, holderUid: 'other', revision: 5 } },
    highwallMining: { cycle: 2, revision: 3, operations: [operation] },
  });
  expect(retry).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(/authority changed/i);
  await user.click(retry);
  expect(mocks.run).toHaveBeenCalledTimes(1);
});

it('offers an exact replay after an uncertain response and preserves it across a cycle rollover', async () => {
  const user = userEvent.setup();
  const attempt = {
    command: {
      sessionId: 's1', requestId: 'mine-uncertain', resource: 'ore',
      expectedRevision: 2, expectedControlRevision: 4, expectedCycle: 2,
    },
    authority: {
      sessionId: 's1', uid: 'u1', role: 'player', assignedRoleId: 'icebreaker-miner',
      activeConsoleRoleId: 'icebreaker-miner', fleetGroupId: 'fleet-1',
      ownerRoleId: 'icebreaker-miner', ownerUid: 'owner', hostShipId: 'icebreaker',
      expectedControlRevision: 4, expectedCycle: 2,
    },
  };
  const uncertain = new mocks.UncertainError(attempt);
  mocks.run.mockRejectedValueOnce(uncertain);
  mocks.retry.mockResolvedValueOnce({
    status: 'replayed', operation: { requestId: 'mine-uncertain', resource: 'ore', rolls: [2, 5, 3], amount: 10 },
  });
  render(<HighwallMining control={control} docking={docking} fuelled={false} />);
  await user.click(screen.getByRole('button', { name: /roll 3d6 strytium ore/i }));
  const retry = await screen.findByRole('button', { name: /retry exact highwall request/i });

  updateSession({
    currentTurn: 3,
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-22T13:00:00.000Z', openAirspaceEndsAt: '2099-09-22T13:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: { highwall: { ...control, revision: 5 } },
    highwallMining: { cycle: 3, revision: 3, operations: [] },
  });
  expect(retry).toBeEnabled();
  await user.click(retry);
  await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith(attempt));
  expect(screen.getByRole('status')).toHaveTextContent(/operation replayed/i);
});
