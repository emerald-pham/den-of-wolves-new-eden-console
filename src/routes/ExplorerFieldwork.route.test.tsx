import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SESSION_STORAGE_KEY, useSessionStore } from '@/store/useSessionStore';
import { restoreSessionRoute } from '@/lib/sessionRoute';
import type { HummingbirdHarvest as HummingbirdHarvestState, Player, WolfAttackMemberView } from '@/types/game';
import type * as FirebaseModule from '@/lib/firebase';
import type * as FirestoreModule from '@/lib/firestore';
import type * as SessionServiceModule from '@/lib/sessionService';
import ShipConsole from './ShipConsole';
import ShipRoleSelect from './ShipRoleSelect';
import SessionMode from './SessionMode';
import ShuttleConsole from './ShuttleConsole';
import RoleBrief from './RoleBrief';

// Mimics the private Firestore listener: every new subscription starts from the stored document.
const harvestFeed = vi.hoisted(() => ({
  stored: null as HummingbirdHarvestState | null,
  listener: undefined as ((harvest: HummingbirdHarvestState | null) => void) | undefined,
  publish(harvest: HummingbirdHarvestState | null): void {
    harvestFeed.stored = harvest;
    harvestFeed.listener?.(harvest);
  },
}));
const harvestService = vi.hoisted(() => ({ roll: vi.fn(), allocate: vi.fn() }));
const missionFeed = vi.hoisted(() => ({
  assign: vi.fn(),
  listener: undefined as ((state: unknown) => void) | undefined,
  latest: undefined as unknown,
  publish(state: unknown): void {
    missionFeed.latest = state;
    missionFeed.listener?.(state);
  },
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/lib/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof FirebaseModule>()),
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));
vi.mock('@/lib/sessionService', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionServiceModule>()),
  selectConsoleRole: vi.fn(),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof FirestoreModule>()),
  subscribeHummingbirdHarvest: vi.fn((_sessionId, _uid, onHarvest) => {
    harvestFeed.listener = onHarvest;
    onHarvest(harvestFeed.stored);
    return vi.fn();
  }),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeShipConfetti: vi.fn(() => vi.fn()),
  subscribeDamageDraws: vi.fn((_sessionId, onDraws: (draws: never[]) => void) => {
    onDraws([]);
    return vi.fn();
  }),
  subscribeVipCards: vi.fn(() => vi.fn()),
  subscribeWolfAttackMemberView: vi.fn((_sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
    onView(null);
    return vi.fn();
  }),
}));
vi.mock('@/lib/awayMissionLifecycleService', () => ({
  subscribeToOwnAwayMissionLifecycles: vi.fn((_sessionId, _uid, onState: (state: unknown) => void) => {
    missionFeed.listener = onState;
    if (missionFeed.latest) onState(missionFeed.latest);
    return vi.fn();
  }),
  createAwayMissionLifecycleActions: vi.fn(() => ({ assignCards: missionFeed.assign })),
  createCurrentAwayMissionLifecycleContext: vi.fn((mission, sessionId, actorUid) => ({
    sessionId, actorUid, authenticatedUid: actorUid, actorRole: 'player',
    missionId: mission.missionId, missionLeaderUid: 'u1', revision: mission.revision,
    sessionIsActive: true, hasFreshServerAuthority: true,
  })),
}));
vi.mock('@/lib/hummingbirdHarvestService', () => ({
  rollHummingbirdHarvest: harvestService.roll,
  allocateHummingbirdHarvest: harvestService.allocate,
}));

const { selectConsoleRole } = await import('@/lib/sessionService');

const docking = { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' } as const;
const pending: HummingbirdHarvestState = {
  sessionId: 's1', ownerUid: 'u1', turn: 2, hostShipId: 'quellon', revision: 1,
  status: 'pending', rolls: [2, 5], requestId: 'roll-1', createdAt: '2026-09-12T00:00:00.000Z',
};
const resolved: HummingbirdHarvestState = {
  ...pending, revision: 2, status: 'resolved', selectedFoodDieIndex: 0, food: 2, water: 5,
} as HummingbirdHarvestState;

const explorer: Player = {
  uid: 'u1', sessionId: 's1', displayName: 'Explorer', role: 'player', seatId: 'quellon-explorer',
  assignedRoleId: 'quellon-explorer', activeConsoleRoleId: null,
  joinedAt: '2026-09-12T00:00:00.000Z',
};

function seedExplorerSession(): void {
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
    currentTurn: 2, activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
    shuttleDockings: [docking], shuttleFuelled: { hummingbird: true },
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'u1',
      holderUid: 'u1', revision: 1,
    } },
    playerDiscovery: {
      groupId: 'fleet-1', shipId: 'quellon', currentCoordinate: '0000',
      knownCoordinates: ['0000', '5143', '9997'],
      knownSystems: { 'system-01': '0000', 'system-02': '5143', 'system-04': '9997' },
      pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z',
  } as never, explorer);
  state.setMode('console');
  state.setConnection('live');
  state.setSessionSnapshotFreshness('server');
}

function ExplorerRoutes({ initial }: { readonly initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} />
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/brief" element={<RoleBrief />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  harvestFeed.stored = null;
  harvestFeed.listener = undefined;
  missionFeed.assign.mockReset().mockResolvedValue(undefined);
  missionFeed.latest = undefined;
  missionFeed.listener = undefined;
  harvestService.roll.mockReset().mockResolvedValue(undefined);
  harvestService.allocate.mockReset().mockResolvedValue(undefined);
  vi.mocked(selectConsoleRole).mockReset().mockImplementation(async (roleId) => {
    const me = useSessionStore.getState().me;
    if (me) useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: roleId });
  });
  seedExplorerSession();
});

it('lets the Explorer enter from the station catalog, plan a route, harvest and return', async () => {
  const user = userEvent.setup();
  render(<ExplorerRoutes initial="/console" />);

  await user.click(screen.getByRole('link', { name: /quellon \/\/ explorer/i }));
  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('quellon-explorer'));
  await user.click(await screen.findByRole('button', { name: 'Navigation' }));
  const planner = screen.getByRole('region', { name: 'Explorer route planner' });
  await user.selectOptions(within(planner).getByLabelText('Known route destination'), '9997');
  expect(planner).toHaveTextContent('Planned route // 0000 → 5143 → 9997');

  await user.click(screen.getByRole('button', { name: 'Ship systems' }));
  await user.click(screen.getByRole('link', { name: /open hummingbird shuttle console/i }));
  expect(await screen.findByRole('heading', { name: 'P.S. Hummingbird' })).toBeInTheDocument();
  harvestService.roll.mockImplementation(async () => {
    act(() => harvestFeed.publish(pending));
    return undefined;
  });
  await user.click(screen.getByRole('button', { name: /roll 2d6/i }));
  harvestService.allocate.mockImplementation(async () => {
    act(() => harvestFeed.publish(resolved));
    return undefined;
  });
  await user.click(await screen.findByRole('button', { name: /die 1: 2 food \/ 5 water/i }));
  const harvestPanel = screen.getByRole('region', { name: 'Hummingbird resource harvesting' });
  expect(await within(harvestPanel).findByRole('status'))
    .toHaveTextContent(/resolved this cycle.*2 food and 5 water/i);

  await user.click(screen.getByRole('link', { name: /back to quellon explorer console/i }));
  await user.click(await screen.findByRole('link', { name: 'View ship consoles' }));
  expect(await screen.findByRole('heading', { name: /quellon \/\/ station overview/i })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Back to fleet' }));
  expect(await screen.findByRole('heading', { name: /stations and consoles/i })).toBeInTheDocument();
});

async function reloadAt(route: string, activeConsoleRoleId: string | null): Promise<string> {
  const state = useSessionStore.getState();
  state.setMe({ ...state.me!, activeConsoleRoleId });
  state.setLastRoute(route);
  const persisted = localStorage.getItem(SESSION_STORAGE_KEY);
  expect(persisted).toBeTruthy();
  useSessionStore.getState().reset();
  localStorage.setItem(SESSION_STORAGE_KEY, persisted!);
  await act(async () => { await useSessionStore.persist.rehydrate(); });
  return restoreSessionRoute(useSessionStore.getState().lastRoute);
}

function resumeLive(): void {
  act(() => {
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
  });
}

function harvestPanel(): HTMLElement {
  return screen.getByRole('region', { name: 'Hummingbird resource harvesting' });
}

it('restores the Explorer shuttle route and the same private harvest result after a reload', async () => {
  const route = await reloadAt('/shuttles/hummingbird', 'quellon-explorer');
  expect(route).toBe('/shuttles/hummingbird');

  render(<ExplorerRoutes initial={route} />);
  expect(await screen.findByRole('heading', { name: 'P.S. Hummingbird' })).toBeInTheDocument();
  resumeLive();
  act(() => harvestFeed.publish(resolved));

  expect(await within(harvestPanel()).findByRole('status'))
    .toHaveTextContent(/resolved this cycle.*2 food and 5 water/i);
  expect(harvestService.roll).not.toHaveBeenCalled();
  expect(harvestService.allocate).not.toHaveBeenCalled();
});

it('returns a reloaded Explorer who lost the station to the console, reselects and shows the same result', async () => {
  const user = userEvent.setup();
  const route = await reloadAt('/shuttles/hummingbird', null);

  render(<ExplorerRoutes initial={route} />);
  resumeLive();
  act(() => harvestFeed.publish(resolved));
  expect(within(harvestPanel()).getByText(/the active quellon explorer console is required/i)).toBeVisible();
  expect(within(harvestPanel()).queryByRole('button', { name: /roll 2d6/i })).not.toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: /back to quellon explorer console/i }));
  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('quellon-explorer'));
  expect(await screen.findByRole('heading', { name: 'Quellon' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Ship systems' }));
  await user.click(screen.getByRole('link', { name: /open hummingbird shuttle console/i }));
  expect(await within(harvestPanel()).findByRole('status'))
    .toHaveTextContent(/resolved this cycle.*2 food and 5 water/i);
  expect(harvestService.roll).not.toHaveBeenCalled();
});

const explorerBrief = {
  assignmentUid: 'u1', roleId: 'quellon-explorer', roleName: 'Explorer', vesselName: 'Quellon',
  text: 'Scout the chart.', commonRules: 'Keep this brief private.', setupRevision: 1,
};
const missionPublic = {
  missionId: 'mission-1', groupId: 'fleet-1', siteCode: 'D', revision: 3,
  phase: 'assignment-ready', status: 'active', overrun: false, missionLeaderUid: 'u1',
  participantCount: 1, opportunities: [{ id: 'D-1', label: 'Kitchen supplies' }],
  requestCounts: [], outcomes: null, rewards: null, specialRewards: null,
  custody: { status: 'mission-leader', holderUid: 'u1', shipId: null }, legalDropOffShipIds: [],
};
const missionHand = {
  missionId: 'mission-1', participantUid: 'u1', revision: 3, phase: 'assignment-ready',
  cards: [{ id: 'A♥', value: 10, status: 'remaining', opportunityId: null }], reclamatorSalvage: null,
};
const missionReady = (publicState: object, privateState: object) => ({
  status: 'ready', projectionMissing: false, missions: [{ publicState, privateState }],
});

it('lets the Explorer join a mission from the chooser and keeps the committed result after a reload', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setRoleBrief(explorerBrief);
  useSessionStore.getState().setMe({ ...explorer, activeConsoleRoleId: 'quellon-explorer' });
  missionFeed.publish(missionReady(missionPublic, missionHand));
  render(<ExplorerRoutes initial="/console" />);

  await user.click(screen.getByRole('link', { name: 'Open private brief' }));
  const mission = await screen.findByRole('region', { name: 'Away mission // mission-1' });
  await user.selectOptions(within(mission).getByLabelText('Opportunity for A♥'), 'D-1');
  missionFeed.assign.mockImplementation(async () => {
    act(() => missionFeed.publish(missionReady(
      { ...missionPublic, revision: 4, status: 'resolved', phase: 'resolved',
        outcomes: [{ opportunityId: 'D-1', contributorCount: 1, total: 13, bonusTotal: 3,
          difficulty: 10, criticalThreshold: 15, outcome: 'success' }],
        rewards: [{ opportunityId: 'D-1', resources: { food: 2 } }] },
      { ...missionHand, revision: 4, phase: 'resolved', assignmentCommitted: true,
        cards: [{ id: 'A♥', value: 10, status: 'assigned', opportunityId: 'D-1' }] },
    )));
  });
  await user.click(within(mission).getByRole('button', { name: 'Submit mission assignments' }));
  expect(missionFeed.assign).toHaveBeenCalledWith([{ cardId: 'A♥', opportunityId: 'D-1' }]);
  const settled = await screen.findByRole('region', { name: 'Away mission // mission-1' });
  await waitFor(() => expect(settled).toHaveTextContent(/success \/\/ total 13/i));
  expect(settled).toHaveTextContent(/reward \/\/ food 2/i);

  cleanup();
  const route = await reloadAt('/brief', 'quellon-explorer');
  expect(route).toBe('/console');
  render(<ExplorerRoutes initial={route} />);
  resumeLive();
  // The private brief is refreshed from the server on resume, never restored from storage.
  act(() => useSessionStore.getState().setRoleBrief(explorerBrief));
  await user.click(screen.getByRole('link', { name: 'Open private brief' }));
  const restored = await screen.findByRole('region', { name: 'Away mission // mission-1' });
  expect(restored).toHaveTextContent(/success \/\/ total 13/i);
  expect(missionFeed.assign).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('link', { name: /return to station catalog/i }));
  expect(await screen.findByRole('heading', { name: /stations and consoles/i })).toBeInTheDocument();
});
