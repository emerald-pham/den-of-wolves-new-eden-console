import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({
  read: vi.fn(), createAttempt: vi.fn(), activate: vi.fn(), retry: vi.fn(),
}));
vi.mock('@/lib/endeavourEcmDeviceService', () => ({
  readEndeavourEcmDeviceWorkspace: mocks.read,
  createEndeavourEcmDeviceAttempt: mocks.createAttempt,
  activateEndeavourEcmDevice: mocks.activate,
  retryEndeavourEcmDeviceAttempt: mocks.retry,
}));

import EndeavourEcmDevicePanel, { EndeavourEcmDeviceView } from './EndeavourEcmDevicePanel';

const control = {
  shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'scientist',
  holderUid: 'scientist', revision: 4,
} as const;

const readyWorkspace = {
  status: 'ready' as const, sessionId: 's1', cycle: 3, controlRevision: 4,
  researchComplete: true,
  device: { status: 'ready' as const, revision: 0 },
  pursuit: { groupId: 'fleet-1', current: 8 },
};

const usedWorkspace = {
  ...readyWorkspace,
  device: {
    status: 'used' as const, revision: 1 as const, ownerGroupId: 'fleet-1',
    pursuitBefore: 8, pursuitAfter: 5,
  },
  pursuit: { groupId: 'fleet-1', current: 5 },
};

const committed = {
  status: 'committed' as const, sessionId: 's1', requestId: 'ecm-use-1', cycle: 3,
  deviceRevision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
};

function seedScientist(): void {
  const store = useSessionStore.getState();
  store.reset();
  store.setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist'], activeVesselIds: ['shepherd'],
    shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'now' }],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-23T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: { endeavour: control }, playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd'], knownCoordinates: [],
      knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 1,
    }, shipUpgrades: { shepherd: [] }, createdAt: '', updatedAt: '',
  }, {
    uid: 'scientist', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist',
    fleetGroupId: 'fleet-1', joinedAt: '',
  });
  store.setConnection('live');
  store.setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.read.mockReset();
  mocks.createAttempt.mockReset();
  mocks.activate.mockReset();
  mocks.retry.mockReset();
  mocks.read.mockResolvedValue(readyWorkspace);
  mocks.createAttempt.mockReturnValue({
    sessionId: 's1', requestId: 'ecm-use-1', expectedControlRevision: 4,
    expectedDeviceRevision: 0, expectedCycle: 3,
  });
  mocks.activate.mockResolvedValue(committed);
  mocks.retry.mockResolvedValue({ ...committed, status: 'replayed' });
  seedScientist();
});

it('renders every synthetic presentation state without calling a live service', () => {
  const { rerender } = render(<EndeavourEcmDeviceView state={{ status: 'unavailable' }} />);
  expect(screen.getByText('Status: Unavailable')).toBeVisible();
  rerender(<EndeavourEcmDeviceView state={{ status: 'ready', groupId: 'fleet-1', pursuit: 8 }} />);
  expect(screen.getByText('Status: Ready')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Use ECM Device' })).toBeDisabled();
  rerender(<EndeavourEcmDeviceView state={{ status: 'working', groupId: 'fleet-1', pursuit: 8 }} />);
  expect(screen.getByText('Status: Working')).toBeVisible();
  rerender(<EndeavourEcmDeviceView state={{
    status: 'successful', groupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
  }} />);
  expect(screen.getByText('Successful: Shepherd group pursuit reduced from 8 to 5.')).toBeVisible();
  rerender(<EndeavourEcmDeviceView state={{
    status: 'spent', groupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
  }} />);
  expect(screen.getByText('ECM Device spent; Shepherd group pursuit changed from 8 to 5.')).toBeVisible();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.activate).not.toHaveBeenCalled();
});

it('does not request private device state when the client is not the current Scientist', () => {
  const current = useSessionStore.getState().me!;
  useSessionStore.getState().setMe({ ...current, activeConsoleRoleId: 'admiral' });
  const { container } = render(<EndeavourEcmDevicePanel control={control} />);
  expect(container).toBeEmptyDOMElement();
  expect(mocks.read).not.toHaveBeenCalled();
});

it('shows the ready state, working feedback, success receipt, and persisted spent state', async () => {
  const user = userEvent.setup();
  mocks.read.mockResolvedValueOnce(readyWorkspace).mockResolvedValueOnce(usedWorkspace);
  let finish!: (value: typeof committed) => void;
  mocks.activate.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

  render(<EndeavourEcmDevicePanel control={control} />);
  expect(await screen.findByText('Status: Ready')).toBeVisible();
  expect(screen.getByText('Status: Ready')).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Use ECM Device' }));
  expect(screen.getByRole('status')).toHaveTextContent('Working');
  expect(screen.getByRole('button', { name: 'Using ECM Device…' })).toBeDisabled();
  expect(mocks.activate).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'ecm-use-1', expectedControlRevision: 4,
    expectedDeviceRevision: 0, expectedCycle: 3,
  });

  await act(async () => { finish(committed); });
  expect(await screen.findByText('Successful: Shepherd group pursuit reduced from 8 to 5.')).toBeVisible();
  await waitFor(() => expect(screen.getByText('Status: Spent')).toBeVisible());
  expect(screen.getByText('ECM Device spent; Shepherd group pursuit changed from 8 to 5.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Use ECM Device' })).not.toBeInTheDocument();
});

it('keeps an unfinished device unavailable and shows the persisted spent result after reopening', async () => {
  mocks.read.mockResolvedValueOnce({ ...readyWorkspace, researchComplete: false });
  const { unmount } = render(<EndeavourEcmDevicePanel control={control} />);
  expect(await screen.findByText('Status: Unavailable')).toBeVisible();
  expect(screen.getByText('Complete ECM Device research before use.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Use ECM Device' })).toBeDisabled();

  unmount();
  mocks.read.mockResolvedValueOnce(usedWorkspace);
  render(<EndeavourEcmDevicePanel control={control} />);
  expect(await screen.findByText('Status: Spent')).toBeVisible();
  expect(screen.getByText('ECM Device spent; Shepherd group pursuit changed from 8 to 5.')).toBeVisible();
});

it('retries an uncertain activation with the exact original request', async () => {
  const user = userEvent.setup();
  mocks.activate.mockRejectedValueOnce(new Error('Network response was lost.'));
  mocks.read.mockResolvedValueOnce(readyWorkspace).mockResolvedValueOnce(usedWorkspace);
  render(<EndeavourEcmDevicePanel control={control} />);

  await user.click(await screen.findByRole('button', { name: 'Use ECM Device' }));
  expect(await screen.findByRole('button', { name: 'Retry same ECM Device request' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Retry same ECM Device request' }));

  expect(mocks.retry).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'ecm-use-1', expectedControlRevision: 4,
    expectedDeviceRevision: 0, expectedCycle: 3,
  });
  expect(await screen.findByText('Status: Spent')).toBeVisible();
});

it('refreshes an uncertain request, then retries the same receipt after status shows spent', async () => {
  const user = userEvent.setup();
  mocks.activate.mockRejectedValueOnce(new Error('Network response was lost.'));
  mocks.read.mockResolvedValueOnce(readyWorkspace)
    .mockResolvedValueOnce(usedWorkspace)
    .mockResolvedValueOnce(usedWorkspace);
  render(<EndeavourEcmDevicePanel control={control} />);

  await user.click(await screen.findByRole('button', { name: 'Use ECM Device' }));
  expect(await screen.findByRole('button', { name: 'Retry same ECM Device request' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Refresh ECM Device status' }));

  expect(await screen.findByText('Status: Spent')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Retry same ECM Device request' }));
  expect(mocks.retry).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'ecm-use-1', expectedControlRevision: 4,
    expectedDeviceRevision: 0, expectedCycle: 3,
  });
  expect(await screen.findByText('Successful: Shepherd group pursuit reduced from 8 to 5.')).toBeVisible();
});

it('clears a definitively rejected stale request and refreshes the spent state', async () => {
  const user = userEvent.setup();
  const rejection = Object.assign(new Error('The ECM Device cycle changed; refresh before use.'), {
    code: 'functions/failed-precondition',
  });
  mocks.activate.mockRejectedValueOnce(rejection);
  mocks.read.mockResolvedValueOnce(readyWorkspace).mockResolvedValueOnce(usedWorkspace);
  render(<EndeavourEcmDevicePanel control={control} />);

  await user.click(await screen.findByRole('button', { name: 'Use ECM Device' }));

  expect(await screen.findByText('Status: Spent')).toBeVisible();
  expect(await screen.findByRole('alert'))
    .toHaveTextContent('The ECM Device cycle changed; refresh before use.');
  expect(screen.queryByRole('button', { name: 'Retry same ECM Device request' })).not.toBeInTheDocument();
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(mocks.retry).not.toHaveBeenCalled();
});
