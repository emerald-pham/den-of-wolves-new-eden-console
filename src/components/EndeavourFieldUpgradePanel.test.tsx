import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ purchase: vi.fn(), retry: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/endeavourFieldUpgradeService', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    purchaseEndeavourFieldTargets: mocks.purchase,
    retryUncertainEndeavourFieldUpgrade: mocks.retry,
  };
});

import EndeavourFieldUpgradePanel from './EndeavourFieldUpgradePanel';
import type {
  EndeavourFieldUpgradePurchaseState,
} from '@/lib/endeavourFieldUpgradeService';
import { EndeavourFieldUpgradeUncertainError } from '@/lib/endeavourFieldUpgradeService';
import type { EndeavourResearchWorkspace } from '@/lib/endeavourResearchService';
import type { GameSession, ShuttleControlEntry } from '@/types/game';

const control: ShuttleControlEntry = {
  shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'scientist',
  holderUid: 'scientist', revision: 4,
};

const workspace: EndeavourResearchWorkspace = {
  status: 'ready', sessionId: 's1', cycle: 3, researchRevision: 2,
  cadence: { cycle: 3, revision: 2, choices: [] },
  progress: { reactor: 1, 'jump-drive': 0, hydroponics: 0, 'water-reclamation': 0 },
  tracks: [
    { trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5, currentMaterialCost: 7, complete: false },
    { trackId: 'jump-drive', name: 'Jump Drive', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 14, complete: false },
    { trackId: 'hydroponics', name: 'Hydroponics', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 8, complete: false },
    { trackId: 'water-reclamation', name: 'Water Reclamation', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 8, complete: false },
  ],
  shepherdOre: 10,
  fieldUpgradeState: { upgradeRevision: 6, targetsUsedThisCycle: 0 },
};

const purchaseState: EndeavourFieldUpgradePurchaseState = {
  status: 'ready', sessionId: 's1', cycle: 3, researchRevision: 2,
  upgradeRevision: 6, targetsUsedThisCycle: 0,
};

function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist', 'admiral'],
    activeVesselIds: ['shepherd', 'aegis', 'quellon'],
    shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'now' }],
    shuttleControl: { endeavour: control }, shuttleFuelled: { endeavour: false },
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-24T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: false, pressAccess: false },
    },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd', 'aegis', 'quellon'],
      knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    shipUpgrades: { shepherd: [], aegis: [], quellon: [] },
    createdAt: '', updatedAt: '',
    ...overrides,
  };
}

function setScientist(session = makeSession()): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid: 'scientist', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist',
    fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function renderPanel(state = purchaseState, session = makeSession(), currentWorkspace = workspace) {
  setScientist(session);
  return render(<EndeavourFieldUpgradePanel control={session.shuttleControl?.endeavour ?? control} workspace={currentWorkspace}
    purchaseState={state} onRefresh={mocks.refresh} />);
}

function staleReply(patch: Record<string, unknown> = {}) {
  return {
    status: 'stale', sessionId: 's1', requestId: 'request-1', shuttleId: 'endeavour',
    targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
    expectedControlRevision: 4, currentControlRevision: 5,
    expectedUpgradeRevision: 6, currentUpgradeRevision: 7,
    expectedCycle: 3, currentCycle: 3,
    ...patch,
  };
}

beforeEach(() => {
  mocks.purchase.mockReset();
  mocks.purchase.mockImplementation(async ({ targets }: { targets: readonly { shipId: string; systemId: string }[] }) => ({
    status: 'committed', sessionId: 's1', requestId: 'request-1', shuttleId: 'endeavour',
    cycle: 3, upgradeRevision: 7, appliedTargets: targets,
  }));
  mocks.retry.mockImplementation(async () => ({
    status: 'committed', sessionId: 's1', requestId: 'request-1', shuttleId: 'endeavour',
    cycle: 3, upgradeRevision: 7, appliedTargets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  }));
  mocks.refresh.mockReset();
  setScientist();
});

it('shows private per-target current costs and only systems on active ships in the Scientist fleet group', async () => {
  renderPanel(purchaseState, makeSession({
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd', 'aegis', 'quellon', 'dione'],
      knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    activeVesselIds: ['shepherd', 'aegis', 'quellon'],
  }));

  expect(await screen.findByRole('region', { name: 'Endeavour field-upgrade purchase controls' })).toBeVisible();
  expect(screen.getByLabelText('Shepherd // Reactor // 7 materials')).toBeVisible();
  expect(screen.getByLabelText('Quellon // Hydroponics // 8 materials')).toBeVisible();
  expect(screen.queryByLabelText(/Dione/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Storage/)).not.toBeInTheDocument();
});

it('limits an unfuelled cycle to two selected consoles and submits only the checked targets', async () => {
  const user = userEvent.setup();
  renderPanel();
  const reactor = await screen.findByLabelText('Shepherd // Reactor // 7 materials');
  const water = screen.getByLabelText('Shepherd // Water Reclamation // 8 materials');
  const jump = screen.getByLabelText('Shepherd // Jump Drive // 14 materials');
  await user.click(reactor);
  await user.click(water);
  expect(jump).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));
  await waitFor(() => expect(mocks.purchase).toHaveBeenCalledWith({
    workspace, purchaseState,
    targets: [
      { shipId: 'shepherd', systemId: 'reactor' },
      { shipId: 'shepherd', systemId: 'water-reclamation' },
    ],
  }));
  expect(await screen.findByRole('status')).toHaveTextContent('Installed 2 consoles for this cycle.');
});

it('preserves eligible selected target IDs until the current private projection arrives, then offers an explicit fresh-CAS retry', async () => {
  const user = userEvent.setup();
  mocks.purchase.mockResolvedValueOnce(staleReply());
  const view = renderPanel();
  const reactor = await screen.findByLabelText('Shepherd // Reactor // 7 materials');
  await user.click(reactor);
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));

  expect(await screen.findByText(/Waiting for the live purchase projection before retrying/i)).toBeVisible();
  expect(reactor).toBeChecked();
  expect(mocks.refresh).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Retry selected upgrades with current state/i })).toBeDisabled();

  const newerSession = makeSession({ shuttleControl: { endeavour: { ...control, revision: 5 } } });
  const currentPurchaseState = { ...purchaseState, upgradeRevision: 7 };
  act(() => setScientist(newerSession));
  view.rerender(<EndeavourFieldUpgradePanel control={newerSession.shuttleControl!.endeavour!}
    workspace={workspace} purchaseState={currentPurchaseState} onRefresh={mocks.refresh} />);
  expect(await screen.findByLabelText('Shepherd // Reactor // 7 materials')).toBeChecked();
  const retry = screen.getByRole('button', { name: /Retry selected upgrades with current state/i });
  expect(retry).toBeEnabled();
  await user.click(retry);
  await waitFor(() => expect(mocks.purchase).toHaveBeenCalledTimes(2));
  expect(mocks.purchase).toHaveBeenLastCalledWith({
    workspace, purchaseState: currentPurchaseState,
    targets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  });
});

it('accepts the stale response after a newer snapshot arrived first without rolling its CAS back', async () => {
  const user = userEvent.setup();
  let finish!: (value: ReturnType<typeof staleReply>) => void;
  mocks.purchase.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const view = renderPanel();
  await user.click(await screen.findByLabelText('Shepherd // Reactor // 7 materials'));
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));

  const newerSession = makeSession({ shuttleControl: { endeavour: { ...control, revision: 5 } } });
  const currentPurchaseState = { ...purchaseState, upgradeRevision: 7 };
  act(() => setScientist(newerSession));
  view.rerender(<EndeavourFieldUpgradePanel control={newerSession.shuttleControl!.endeavour!}
    workspace={workspace} purchaseState={currentPurchaseState} onRefresh={mocks.refresh} />);
  finish(staleReply());

  expect(await screen.findByRole('button', { name: /Retry selected upgrades with current state/i })).toBeEnabled();
  expect(screen.getByLabelText('Shepherd // Reactor // 7 materials')).toBeChecked();
  expect(useSessionStore.getState().session?.shuttleControl?.endeavour?.revision).toBe(5);
});

it('invalidates the stale selection retry when a checkbox edit changes the draft', async () => {
  const user = userEvent.setup();
  mocks.purchase.mockResolvedValueOnce(staleReply());
  const view = renderPanel();
  await user.click(await screen.findByLabelText('Shepherd // Reactor // 7 materials'));
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));
  await screen.findByText(/Waiting for the live purchase projection/i);

  const currentPurchaseState = { ...purchaseState, upgradeRevision: 7 };
  const newerSession = makeSession({ shuttleControl: { endeavour: { ...control, revision: 5 } } });
  act(() => setScientist(newerSession));
  view.rerender(<EndeavourFieldUpgradePanel control={newerSession.shuttleControl!.endeavour!}
    workspace={workspace} purchaseState={currentPurchaseState} onRefresh={mocks.refresh} />);
  expect(await screen.findByRole('button', { name: /Retry selected upgrades with current state/i })).toBeEnabled();

  await user.click(screen.getByLabelText('Shepherd // Reactor // 7 materials'));
  await user.click(screen.getByLabelText('Shepherd // Water Reclamation // 8 materials'));
  expect(screen.queryByRole('button', { name: /Retry selected upgrades with current state/i })).not.toBeInTheDocument();
  const freshPurchase = screen.getByRole('button', { name: /Purchase selected upgrades with current state/i });
  expect(freshPurchase).toBeEnabled();
  await user.click(freshPurchase);
  await waitFor(() => expect(mocks.purchase).toHaveBeenLastCalledWith({
    workspace, purchaseState: currentPurchaseState,
    targets: [{ shipId: 'shepherd', systemId: 'water-reclamation' }],
  }));
});

it('holds an uncertain request and exposes only an exact-ID retry until it resolves', async () => {
  const user = userEvent.setup();
  mocks.purchase.mockRejectedValueOnce(new EndeavourFieldUpgradeUncertainError('request-1'));
  renderPanel();
  await user.click(await screen.findByLabelText('Shepherd // Reactor // 7 materials'));
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));

  expect(await screen.findByText(/earlier request may have completed/i)).toBeVisible();
  expect(screen.getByLabelText('Shepherd // Reactor // 7 materials')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Retry exact request' }));
  await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith('request-1'));
  expect(await screen.findByRole('status')).toHaveTextContent('The earlier upgrade request was confirmed.');
});

it('retries the retained exact request after projection removes its target and Coordination closes', async () => {
  const user = userEvent.setup();
  mocks.purchase.mockRejectedValueOnce(new EndeavourFieldUpgradeUncertainError('request-1'));
  mocks.retry.mockResolvedValueOnce({
    status: 'replayed', sessionId: 's1', requestId: 'request-1', shuttleId: 'endeavour',
    cycle: 3, upgradeRevision: 7, appliedTargets: [{ shipId: 'shepherd', systemId: 'reactor' }],
  });
  const view = renderPanel();
  await user.click(await screen.findByLabelText('Shepherd // Reactor // 7 materials'));
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));
  await screen.findByText(/earlier request may have completed/i);

  const advancedSession = makeSession({
    currentTurn: 4,
    shuttleControl: { endeavour: { ...control, revision: 5 } },
    turnPhase: {
      turn: 4, teamPhaseEndsAt: '2099-09-24T13:00:00.000Z',
      openAirspaceEndsAt: '2099-09-24T13:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shipUpgrades: { shepherd: ['reactor'], aegis: [], quellon: [] },
  });
  const advancedWorkspace = { ...workspace, cycle: 4 };
  const advancedPurchaseState = { ...purchaseState, cycle: 4, upgradeRevision: 7 };
  act(() => setScientist(advancedSession));
  view.rerender(<EndeavourFieldUpgradePanel control={advancedSession.shuttleControl!.endeavour!}
    workspace={advancedWorkspace} purchaseState={advancedPurchaseState} onRefresh={mocks.refresh} />);

  expect(screen.queryByLabelText('Shepherd // Reactor // 7 materials')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeDisabled();
  const exactRetry = screen.getByRole('button', { name: 'Retry exact request' });
  expect(exactRetry).toBeEnabled();
  await user.click(exactRetry);
  await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith('request-1'));
  expect(await screen.findByRole('status')).toHaveTextContent('The earlier upgrade request was confirmed.');
  expect(screen.getByText('Cycle purchases: 0 of 2 consoles used. Choose up to 2 more.')).toBeVisible();
});

it('keeps new purchases blocked until a fresh workspace projection follows terminal retry rejection', async () => {
  const user = userEvent.setup();
  mocks.purchase.mockRejectedValueOnce(new EndeavourFieldUpgradeUncertainError('request-1'));
  mocks.retry.mockRejectedValueOnce(new Error('The original request is no longer eligible.'));
  const view = renderPanel();
  await user.click(await screen.findByLabelText('Shepherd // Reactor // 7 materials'));
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));
  await screen.findByText(/earlier request may have completed/i);

  await user.click(screen.getByRole('button', { name: 'Retry exact request' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The exact request was rejected.');
  expect(screen.queryByRole('button', { name: 'Retry exact request' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeDisabled();
  const refresh = screen.getByRole('button', { name: 'Refresh Scientist workspace' });
  expect(refresh).toBeEnabled();
  await user.click(refresh);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeDisabled();

  const refreshedWorkspace = { ...workspace };
  view.rerender(<EndeavourFieldUpgradePanel control={control} workspace={refreshedWorkspace}
    purchaseState={{ ...purchaseState }} onRefresh={mocks.refresh} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeEnabled());
  expect(await screen.findByRole('status')).toHaveTextContent('Scientist purchase state refreshed.');
});

it('discards a delayed stale result after the current Scientist authority changes', async () => {
  const user = userEvent.setup();
  let finish!: (value: ReturnType<typeof staleReply>) => void;
  mocks.purchase.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const view = renderPanel();
  await user.click(await screen.findByLabelText('Shepherd // Reactor // 7 materials'));
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));

  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementRoleId: 'warrior-captain',
  }));
  finish(staleReply());
  await waitFor(() => expect(view.container).toBeEmptyDOMElement());
  expect(screen.queryByRole('button', { name: /Retry selected upgrades/i })).not.toBeInTheDocument();
});

it('does not preserve or retry a selected target that became ineligible in the newer projection', async () => {
  const user = userEvent.setup();
  mocks.purchase.mockResolvedValueOnce(staleReply());
  const view = renderPanel();
  await user.click(await screen.findByLabelText('Shepherd // Reactor // 7 materials'));
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));
  await screen.findByText(/Waiting for the live purchase projection/i);

  const newerSession = makeSession({
    shuttleControl: { endeavour: { ...control, revision: 5 } },
    shipUpgrades: { shepherd: ['reactor'], aegis: ['storage'], quellon: [] },
  });
  act(() => setScientist(newerSession));
  view.rerender(<EndeavourFieldUpgradePanel control={newerSession.shuttleControl!.endeavour!}
    workspace={workspace} purchaseState={{ ...purchaseState, upgradeRevision: 7 }} onRefresh={mocks.refresh} />);
  expect(screen.queryByLabelText('Shepherd // Reactor // 7 materials')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Retry selected upgrades with current state/i })).not.toBeInTheDocument();
});

it('allows up to four console targets while fuelled and respects targets already used this cycle', async () => {
  const user = userEvent.setup();
  const session = makeSession({
    activeVesselIds: ['shepherd', 'aegis', 'quellon'],
    shuttleFuelled: { endeavour: true },
  });
  renderPanel({ ...purchaseState, targetsUsedThisCycle: 1 }, session);
  const reactor = await screen.findByLabelText('Shepherd // Reactor // 7 materials');
  const water = screen.getByLabelText('Shepherd // Water Reclamation // 8 materials');
  const jump = screen.getByLabelText('Shepherd // Jump Drive // 14 materials');
  const quellonHydroponics = screen.getByLabelText('Quellon // Hydroponics // 8 materials');
  await user.click(reactor);
  await user.click(water);
  await user.click(jump);
  expect(quellonHydroponics).toBeDisabled();
  expect(screen.getByText('Cycle purchases: 1 of 4 consoles used. Choose up to 3 more.')).toBeVisible();
});

it('keeps purchases unavailable outside a live Coordination window or when the server snapshot is stale', async () => {
  const { unmount } = renderPanel(purchaseState, makeSession({ turnPhase: {
    turn: 3, teamPhaseEndsAt: '2099-09-24T12:00:00.000Z',
    openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  } }));
  expect(await screen.findByText('Purchases are available during the live Coordination window.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeDisabled();

  unmount();
  renderPanel({ ...purchaseState, researchRevision: 1 });
  expect(screen.getByRole('alert')).toHaveTextContent('Research pricing changed. Refresh the Scientist workspace.');
  expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeDisabled();
});

it('hides field-upgrade prices immediately when Scientist authority changes', async () => {
  const { container } = renderPanel();
  await screen.findByLabelText('Shepherd // Reactor // 7 materials');
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  }));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});
