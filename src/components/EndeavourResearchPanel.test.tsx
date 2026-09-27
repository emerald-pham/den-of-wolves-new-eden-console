import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ read: vi.fn(), advance: vi.fn(), purchaseUpgrade: vi.fn(), retryUpgrade: vi.fn() }));
vi.mock('@/lib/endeavourResearchService', () => ({
  readEndeavourResearchWorkspace: mocks.read,
  advanceEndeavourResearchTrack: mocks.advance,
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

beforeEach(() => {
  mocks.read.mockReset();
  mocks.advance.mockReset();
  mocks.purchaseUpgrade.mockReset();
  mocks.retryUpgrade.mockReset();
  mocks.read.mockResolvedValue(workspace);
  mocks.advance.mockResolvedValue(undefined);
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
    workspace, trackId: 'reactor', funding: 'standard',
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
    workspace, trackId: 'reactor', funding: 'shepherd-ore',
  }));
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
