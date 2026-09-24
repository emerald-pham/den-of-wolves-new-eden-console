import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ purchase: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/endeavourFieldUpgradeService', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, purchaseEndeavourFieldTargets: mocks.purchase };
});

import EndeavourFieldUpgradePanel from './EndeavourFieldUpgradePanel';
import type {
  EndeavourFieldUpgradePurchaseState,
} from '@/lib/endeavourFieldUpgradeService';
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

function renderPanel(state = purchaseState, session = makeSession()) {
  setScientist(session);
  return render(<EndeavourFieldUpgradePanel control={control} workspace={workspace}
    purchaseState={state} onRefresh={mocks.refresh} />);
}

beforeEach(() => {
  mocks.purchase.mockReset();
  mocks.purchase.mockImplementation(async ({ targets }: { targets: readonly { shipId: string; systemId: string }[] }) => ({
    status: 'committed', sessionId: 's1', requestId: 'request-1', shuttleId: 'endeavour',
    cycle: 3, upgradeRevision: 7, appliedTargets: targets,
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
