import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({
  read: vi.fn(), advance: vi.fn(), retry: vi.fn(), createAttempt: vi.fn(), purchaseUpgrade: vi.fn(), retryUpgrade: vi.fn(),
}));
vi.mock('@/lib/endeavourResearchService', () => ({
  readEndeavourResearchWorkspace: mocks.read,
  advanceEndeavourResearchTrack: mocks.advance,
  retryEndeavourResearchAttempt: mocks.retry,
  createEndeavourResearchAttempt: mocks.createAttempt,
}));
vi.mock('@/lib/endeavourFieldUpgradeService', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    purchaseEndeavourFieldTargets: mocks.purchaseUpgrade,
    retryUncertainEndeavourFieldUpgrade: mocks.retryUpgrade,
  };
});

import EndeavourResearchPanel from './EndeavourResearchPanel';
import { EndeavourFieldUpgradeUncertainError } from '@/lib/endeavourFieldUpgradeService';

const control = {
  shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'scientist',
  holderUid: 'scientist', revision: 4,
} as const;

const workspace = {
  status: 'ready' as const, sessionId: 's1', cycle: 3, researchRevision: 0,
  cadence: { cycle: 3, revision: 0, choices: [] },
  progress: { reactor: 1 },
  tracks: [
    { trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5, currentMaterialCost: 7, complete: false },
    { trackId: 'jump-drive', name: 'Jump Drive', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 14, complete: false },
  ],
  shepherdOre: 10,
  fieldUpgradeState: { upgradeRevision: 6, targetsUsedThisCycle: 0 },
};

function staleReply(attempt: {
  sessionId: string; requestId: string; expectedControlRevision: number;
  expectedResearchRevision: number; expectedCycle: number; trackId: string; funding: string;
}) {
  return {
    status: 'stale' as const, sessionId: attempt.sessionId, requestId: attempt.requestId,
    trackId: attempt.trackId, funding: attempt.funding,
    expected: {
      cycle: attempt.expectedCycle,
      controlRevision: attempt.expectedControlRevision,
      researchRevision: attempt.expectedResearchRevision,
    },
    current: {
      cycle: attempt.expectedCycle,
      controlRevision: attempt.expectedControlRevision,
      researchRevision: attempt.expectedResearchRevision + 1,
    },
  };
}

beforeEach(() => {
  mocks.read.mockReset();
  mocks.advance.mockReset();
  mocks.purchaseUpgrade.mockReset();
  mocks.retryUpgrade.mockReset();
  mocks.retry.mockReset();
  mocks.createAttempt.mockReset();
  mocks.read.mockResolvedValue(workspace);
  mocks.advance.mockResolvedValue({ status: 'committed' });
  mocks.retry.mockResolvedValue({ status: 'replayed' });
  let requestIndex = 0;
  mocks.createAttempt.mockImplementation(({ workspace: observed, trackId, funding }) => ({
    sessionId: observed.sessionId,
    requestId: `research-attempt-${++requestIndex}`,
    expectedControlRevision: control.revision,
    expectedResearchRevision: observed.researchRevision,
    expectedCycle: observed.cycle,
    trackId,
    funding,
  }));
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist'],
    activeVesselIds: ['shepherd'],
    shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'now' }],
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-23T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: { endeavour: control },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd'],
      knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    shipUpgrades: { shepherd: [] },
    createdAt: '', updatedAt: '',
  }, {
    uid: 'scientist', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist',
    fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('shows private left-most progress and field-upgrade cost to the current Scientist', async () => {
  render(<EndeavourResearchPanel control={control} />);
  expect(await screen.findByRole('region', { name: 'Endeavour research controls' })).toBeVisible();
  expect(screen.getByLabelText('Research track')).toHaveTextContent('Reactor');
  expect(screen.getByText(/cross the left-most research box.*reactor.*cost is 7 materials/i)).toBeVisible();
  expect(screen.getByRole('list', { name: 'Research progress' })).toHaveTextContent(
    'Reactor: 1 of 5 boxes crossed; next field-upgrade cost is 7 materials. Available for a research choice.',
  );
  expect(screen.getByText('Shepherd // 10 ore available')).toBeVisible();
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('region', { name: 'Endeavour field-upgrade purchase controls' })).toBeVisible();
  expect(screen.getByText('Purchases are available during the live Coordination window.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeDisabled();
});

it('requires the post-rejection parent refresh result before accepting a delayed private projection', async () => {
  const user = userEvent.setup();
  const earlierProjection = { ...workspace, researchRevision: 1, cadence: { ...workspace.cadence, revision: 1 } };
  const freshProjection = { ...workspace, researchRevision: 2, cadence: { ...workspace.cadence, revision: 2 } };
  let resolveEarlierRead!: (value: typeof workspace) => void;
  const earlierRead = new Promise<typeof workspace>((resolve) => { resolveEarlierRead = resolve; });
  mocks.read.mockResolvedValueOnce(workspace).mockImplementationOnce(() => earlierRead)
    .mockResolvedValueOnce(freshProjection);
  mocks.purchaseUpgrade.mockRejectedValueOnce(new EndeavourFieldUpgradeUncertainError('request-1'));
  mocks.retryUpgrade.mockRejectedValueOnce(new Error('The original request is no longer eligible.'));
  const session = useSessionStore.getState().session!;
  useSessionStore.setState({ session: {
    ...session,
    turnPhase: { ...session.turnPhase!, airspace: { state: 'lifted', tickerActive: false, pressAccess: false } },
  } });

  render(<EndeavourResearchPanel control={control} />);
  const target = await screen.findByLabelText('Shepherd // Reactor // 7 materials');
  await user.click(target);
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));
  await screen.findByText(/earlier request may have completed/i);
  await user.click(screen.getByRole('button', { name: 'Retry exact request' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The exact request was rejected.');

  await act(async () => { resolveEarlierRead(earlierProjection); await earlierRead; });
  expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Refresh Scientist workspace' })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: 'Refresh Scientist workspace' }));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeEnabled());
  expect(screen.getByText('Cycle purchases: 0 of 2 consoles used. Choose up to 2 more.')).toBeVisible();
});

it('submits the selected standard choice and refreshes from the server without an optimistic advance', async () => {
  const user = userEvent.setup();
  const after = {
    ...workspace,
    researchRevision: 1,
    cadence: { cycle: 3, revision: 1, choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }] },
    progress: { reactor: 2 },
    tracks: [
      { ...workspace.tracks[0]!, crossedBoxes: 2, currentMaterialCost: 6 },
      workspace.tracks[1]!,
    ],
  };
  mocks.read.mockResolvedValueOnce(workspace).mockResolvedValueOnce(after);
  render(<EndeavourResearchPanel control={control} />);
  await screen.findByRole('region', { name: 'Endeavour research controls' });
  await user.click(screen.getByRole('button', { name: 'Advance standard research' }));
  await waitFor(() => expect(mocks.advance).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'research-attempt-1', expectedControlRevision: 4,
    expectedResearchRevision: 0, expectedCycle: 3, trackId: 'reactor', funding: 'standard',
  }));
  expect(await screen.findByText(/reactor advanced one research box/i)).toHaveAttribute('role', 'status');
  expect(screen.getByRole('list', { name: 'Research progress' })).toHaveTextContent(
    'Reactor: 2 of 5 boxes crossed; next field-upgrade cost is 6 materials. Chosen this cycle.',
  );
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it('offers additional choices as explicit five-Shepherd-ore requests', async () => {
  const user = userEvent.setup();
  render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance with 5 Shepherd ore' }));
  await waitFor(() => expect(mocks.advance).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'research-attempt-1', expectedControlRevision: 4,
    expectedResearchRevision: 0, expectedCycle: 3, trackId: 'reactor', funding: 'shepherd-ore',
  }));
});

it('waits for the current workspace before an explicit fresh-ID stale retry', async () => {
  const user = userEvent.setup();
  const current = {
    ...workspace,
    researchRevision: 1,
    cadence: { cycle: 3, revision: 1, choices: [{ trackId: 'jump-drive', funding: 'standard' as const, oreCost: 0 as const }] },
    progress: { reactor: 1, 'jump-drive': 1 },
    tracks: [workspace.tracks[0]!, { ...workspace.tracks[1]!, crossedBoxes: 1 }],
  };
  mocks.read.mockResolvedValueOnce(workspace).mockResolvedValueOnce(workspace)
    .mockResolvedValueOnce(current).mockResolvedValueOnce(current);
  mocks.advance.mockImplementationOnce((attempt) => Promise.resolve(staleReply(attempt)));
  render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance standard research' }));

  const retry = await screen.findByRole('button', { name: 'Retry choice with current revisions' });
  expect(retry).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Refresh private research' }));
  await waitFor(() => expect(screen.getByRole('button', {
    name: 'Retry choice with current revisions',
  })).toBeEnabled());

  await user.click(screen.getByRole('button', { name: 'Retry choice with current revisions' }));
  await waitFor(() => expect(mocks.advance).toHaveBeenCalledTimes(2));
  expect(mocks.advance.mock.calls[0]![0]).toMatchObject({
    requestId: 'research-attempt-1', expectedResearchRevision: 0, trackId: 'reactor', funding: 'standard',
  });
  expect(mocks.advance.mock.calls[1]![0]).toMatchObject({
    requestId: 'research-attempt-2', expectedResearchRevision: 1, trackId: 'reactor', funding: 'standard',
  });
});

it('uses an already refreshed entitled workspace when the stale reply arrives later', async () => {
  const user = userEvent.setup();
  const current = {
    ...workspace,
    researchRevision: 1,
    cadence: { cycle: 3, revision: 1, choices: [{ trackId: 'jump-drive', funding: 'standard' as const, oreCost: 0 as const }] },
    progress: { reactor: 1, 'jump-drive': 1 },
    tracks: [workspace.tracks[0]!, { ...workspace.tracks[1]!, crossedBoxes: 1 }],
  };
  mocks.read.mockResolvedValueOnce(workspace).mockResolvedValueOnce(current).mockResolvedValueOnce(current);
  let resolve!: () => void;
  mocks.advance.mockImplementationOnce((attempt) => new Promise((done) => {
    resolve = () => done(staleReply(attempt));
  }));
  render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance standard research' }));

  await user.click(screen.getByRole('button', { name: 'Refresh private research' }));
  await screen.findByText(/Jump Drive: 1 of 5 boxes crossed/i);
  await act(async () => {
    resolve();
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.getByRole('button', {
    name: 'Retry choice with current revisions',
  })).toBeEnabled());
  expect(mocks.advance).toHaveBeenCalledTimes(1);
});

it('retries an uncertain transport with the exact same request ID and CAS values', async () => {
  const user = userEvent.setup();
  mocks.advance.mockRejectedValueOnce(new Error('connection interrupted'));
  mocks.retry.mockResolvedValueOnce({ status: 'replayed' });
  render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance standard research' }));
  await user.click(await screen.findByRole('button', { name: 'Retry same research request' }));
  await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(1));
  expect(mocks.advance).toHaveBeenCalledTimes(1);
  expect(mocks.advance.mock.calls[0]![0]).toEqual(mocks.retry.mock.calls[0]![0]);
  expect(mocks.retry.mock.calls[0]![0]).toMatchObject({
    requestId: 'research-attempt-1', expectedResearchRevision: 0, expectedControlRevision: 4,
  });
});

it('confirms the exact pending request after a same-holder cycle and control rollover', async () => {
  const user = userEvent.setup();
  const nextCycle = {
    ...workspace,
    cycle: 4,
    cadence: { cycle: 4, revision: 0, choices: [] },
  };
  mocks.read.mockResolvedValueOnce(workspace).mockResolvedValueOnce(workspace);
  mocks.advance.mockRejectedValueOnce(new Error('connection interrupted'));
  mocks.retry.mockResolvedValueOnce({ status: 'replayed' });
  render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance standard research' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry same research request' })).toBeEnabled());

  const { session, me } = useSessionStore.getState();
  act(() => useSessionStore.getState().setIdentity({
    ...session!,
    currentTurn: 4,
    turnPhase: { ...session!.turnPhase!, turn: 4 },
    shuttleControl: { endeavour: { ...session!.shuttleControl!.endeavour!, revision: 5 } },
  }, { ...me! }));
  mocks.read.mockResolvedValue(nextCycle);
  await user.click(screen.getByRole('button', { name: 'Refresh private research' }));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
  expect(screen.getByRole('button', { name: 'Retry same research request' })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: 'Retry same research request' }));
  await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(1));
  expect(mocks.advance).toHaveBeenCalledTimes(1);
  expect(mocks.retry).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'research-attempt-1', expectedControlRevision: 4,
    expectedResearchRevision: 0, expectedCycle: 3, trackId: 'reactor', funding: 'standard',
  });
  expect(await screen.findByRole('status')).toHaveTextContent(/reactor research request was confirmed/i);
});

it('removes exact retry access when the current holder changes', async () => {
  const user = userEvent.setup();
  mocks.advance.mockRejectedValueOnce(new Error('connection interrupted'));
  const { container, rerender } = render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance standard research' }));
  await screen.findByRole('button', { name: 'Retry same research request' });

  const { session, me } = useSessionStore.getState();
  const changedControl = { ...control, holderUid: 'new-scientist', revision: 5 };
  act(() => useSessionStore.getState().setIdentity({
    ...session!,
    shuttleControl: { endeavour: changedControl },
  }, { ...me! }));
  rerender(<EndeavourResearchPanel control={changedControl} />);

  await waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(mocks.retry).not.toHaveBeenCalled();
});

it('ignores an exact replay that settles after current Scientist authority is lost', async () => {
  const user = userEvent.setup();
  let resolveRetry!: (result: { status: 'replayed' }) => void;
  mocks.advance.mockRejectedValueOnce(new Error('connection interrupted'));
  mocks.retry.mockReturnValueOnce(new Promise((done) => { resolveRetry = done; }));
  const { container, rerender } = render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance standard research' }));
  await user.click(await screen.findByRole('button', { name: 'Retry same research request' }));
  await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(1));

  const { session, me } = useSessionStore.getState();
  const changedControl = { ...control, holderUid: 'new-scientist', revision: 5 };
  act(() => useSessionStore.getState().setIdentity({
    ...session!,
    shuttleControl: { endeavour: changedControl },
  }, { ...me! }));
  rerender(<EndeavourResearchPanel control={changedControl} />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());

  await act(async () => {
    resolveRetry({ status: 'replayed' });
    await Promise.resolve();
  });
  expect(screen.queryByText(/research request was confirmed/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Research progress' })).not.toBeInTheDocument();
});

it('keeps the ore-funded choice unavailable without five current Shepherd ore', async () => {
  mocks.read.mockResolvedValue({ ...workspace, shepherdOre: 4 });
  render(<EndeavourResearchPanel control={control} />);
  expect(await screen.findByRole('button', { name: 'Advance with 5 Shepherd ore' })).toBeDisabled();
  expect(mocks.advance).not.toHaveBeenCalled();
});

it('shows completed tracks without inventing another field-upgrade price', async () => {
  mocks.read.mockResolvedValue({
    ...workspace,
    progress: { reactor: 5 },
    tracks: [{ ...workspace.tracks[0]!, crossedBoxes: 5, totalBoxes: 5, currentMaterialCost: null, complete: true }],
  });
  render(<EndeavourResearchPanel control={control} />);
  expect(await screen.findByRole('list', { name: 'Research progress' })).toHaveTextContent(
    'Reactor: 5 of 5 boxes crossed; no further field-upgrade cost. Research complete.',
  );
});

it('does not show or retain private prices after the active console role changes during a read', async () => {
  let resolve!: (value: typeof workspace) => void;
  mocks.read.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { container } = render(<EndeavourResearchPanel control={control} />);
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  }));
  resolve(workspace);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(screen.queryByText(/costs 7 materials/i)).not.toBeInTheDocument();
});

it('hides one session private workspace immediately when an equally entitled Scientist switches sessions', async () => {
  mocks.read.mockResolvedValueOnce(workspace).mockRejectedValueOnce(new Error('Research is unavailable.'));
  render(<EndeavourResearchPanel control={control} />);
  expect(await screen.findByRole('list', { name: 'Research progress' })).toHaveTextContent(
    'Reactor: 1 of 5 boxes crossed; next field-upgrade cost is 7 materials.',
  );

  act(() => useSessionStore.getState().setIdentity({
    id: 's2', name: 'Second Fleet', joinCode: '5678', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist'],
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-23T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: { endeavour: control }, createdAt: '', updatedAt: '',
  }, {
    uid: 'scientist', sessionId: 's2', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', joinedAt: '',
  }));

  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('list', { name: 'Research progress' })).not.toBeInTheDocument();
  expect(screen.queryAllByText(/next field-upgrade cost is 7 materials/i)).toHaveLength(0);
  expect(await screen.findByRole('alert')).toHaveTextContent('Research is unavailable.');
});

it('clears a settled in-flight action after authority loss so a returning Scientist can continue', async () => {
  const user = userEvent.setup();
  let finish!: () => void;
  mocks.advance.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  const { container } = render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance standard research' }));
  expect(screen.getByRole('button', { name: 'Advancing research…' })).toBeDisabled();

  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  }));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
  await act(async () => {
    finish();
    await Promise.resolve();
  });

  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-scientist',
  }));
  expect(await screen.findByRole('button', { name: 'Advance standard research' })).toBeEnabled();
});

it('ignores a delayed stale reply after the Scientist loses Endeavour authority', async () => {
  const user = userEvent.setup();
  let finish!: () => void;
  mocks.advance.mockImplementationOnce((attempt) => new Promise((resolve) => {
    finish = () => resolve(staleReply(attempt));
  }));
  const { container } = render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance standard research' }));
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  }));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
  await act(async () => {
    finish();
    await Promise.resolve();
  });
  expect(screen.queryByRole('button', { name: 'Retry choice with current revisions' })).not.toBeInTheDocument();
  expect(screen.queryByText(/research changed while this choice was being checked/i)).not.toBeInTheDocument();
});
