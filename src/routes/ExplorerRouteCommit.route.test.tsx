import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SESSION_STORAGE_KEY, useSessionStore } from '@/store/useSessionStore';
import { restoreSessionRoute } from '@/lib/sessionRoute';
import type { GameSession, Player, PlayerDiscoveryProjection, ShipNavigationLogEntry, WolfAttackMemberView } from '@/types/game';
import type * as FirebaseModule from '@/lib/firebase';
import type * as FirestoreModule from '@/lib/firestore';
import type * as SessionServiceModule from '@/lib/sessionService';
import ShipConsole from './ShipConsole';
import ShipRoleSelect from './ShipRoleSelect';
import SessionMode from './SessionMode';

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
  jumpShip: vi.fn(),
}));
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof FirestoreModule>()),
  subscribeHummingbirdHarvest: vi.fn((_sessionId, _uid, onHarvest: (harvest: null) => void) => {
    onHarvest(null);
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
  subscribeToOwnAwayMissionLifecycles: vi.fn(() => vi.fn()),
  createAwayMissionLifecycleActions: vi.fn(() => ({ assignCards: vi.fn() })),
  createCurrentAwayMissionLifecycleContext: vi.fn(),
}));

const { selectConsoleRole, jumpShip } = await import('@/lib/sessionService');

const explorer: Player = {
  uid: 'u1', sessionId: 's1', displayName: 'Explorer', role: 'player', seatId: 'quellon-explorer',
  assignedRoleId: 'quellon-explorer', activeConsoleRoleId: null,
  joinedAt: '2026-11-05T00:00:00.000Z',
};

const committedJump: ShipNavigationLogEntry = {
  id: 'jump-r1-0', shipId: 'quellon', type: 'self-jump', origin: '0000', destination: '9997',
  navigationalError: false, occurredAt: '2026-11-05T10:00:00.000Z', stardate: '2026.309.100000',
};

function discovery(currentCoordinate: string, navigationLogs: readonly ShipNavigationLogEntry[]): PlayerDiscoveryProjection {
  return {
    groupId: 'fleet-1', shipId: 'quellon', currentCoordinate,
    knownCoordinates: ['0000', '5143', '9997'],
    knownSystems: { 'system-01': '0000', 'system-02': '5143', 'system-04': '9997' },
    pursuitDistance: 0, navigationLogs, revision: navigationLogs.length + 1,
  };
}

/** Mirrors App.tsx: the entitled navigation projection lands in the session view state. */
function deliverProjection(projection: PlayerDiscoveryProjection, patch: Partial<GameSession> = {}): void {
  const store = useSessionStore.getState();
  store.setSession({
    ...store.session!,
    ...patch,
    playerDiscovery: projection,
    shipGalacticCoordinates: { quellon: projection.currentCoordinate! },
    shipNavigationLogs: { quellon: projection.navigationLogs },
  });
}

function seedExplorerSession(): void {
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
    currentTurn: 2, activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
    shipResources: { quellon: { food: 10, water: 10, ore: 0, fuel: 6, materials: 0 } },
    maintenanceCycles: { quellon: { turn: 2, charges: ['jump-drive'], results: {} } },
    vesselActionRevisions: { quellon: 4 },
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z',
  } as never, explorer);
  state.setMode('console');
  state.setConnection('live');
  state.setSessionSnapshotFreshness('server');
  deliverProjection(discovery('0000', []));
}

function ExplorerRoutes({ initial }: { readonly initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} />
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>
  );
}

async function reloadAt(route: string): Promise<string> {
  const state = useSessionStore.getState();
  state.setLastRoute(route);
  const persisted = localStorage.getItem(SESSION_STORAGE_KEY);
  expect(persisted).toBeTruthy();
  useSessionStore.getState().reset();
  localStorage.setItem(SESSION_STORAGE_KEY, persisted!);
  await act(async () => { await useSessionStore.persist.rehydrate(); });
  return restoreSessionRoute(useSessionStore.getState().lastRoute);
}

function planner(): HTMLElement {
  return screen.getByRole('region', { name: 'Explorer route planner' });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(selectConsoleRole).mockReset().mockImplementation(async (roleId) => {
    const me = useSessionStore.getState().me;
    if (me) useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: roleId });
  });
  vi.mocked(jumpShip).mockReset();
  seedExplorerSession();
});

describe('Explorer route commit and arrival', () => {
  it('plans from live state, commits through the Jump Drive and keeps the arrival after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ExplorerRoutes initial="/console" />);

    await user.click(screen.getByRole('link', { name: /quellon \/\/ explorer/i }));
    await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('quellon-explorer'));
    await user.click(await screen.findByRole('button', { name: 'Navigation' }));
    await user.selectOptions(within(planner()).getByLabelText('Known route destination'), '9997');
    expect(within(planner()).getByLabelText('Jump estimate'))
      .toHaveTextContent('One jump // MEDIUM at most // up to 4 fuel // Quellon holds 6');
    expect(within(planner()).getByLabelText('Jump readiness')).toHaveTextContent(/jump drive charged/i);
    expect(within(planner()).getByLabelText('Committed movement')).toHaveTextContent(/no jump committed yet/i);

    // The Explorer is a Quellon crew member, so the ship's Jump Drive is the entitled commit action.
    await user.click(screen.getByRole('button', { name: 'Ship systems' }));
    const drive = screen.getByRole('region', { name: 'Quellon Jump Drive control' });
    for (const digit of [1, 2, 3]) {
      await user.click(within(drive).getByRole('button', { name: `Decrease coordinate digit ${digit}` }));
    }
    for (let step = 0; step < 3; step += 1) {
      await user.click(within(drive).getByRole('button', { name: 'Decrease coordinate digit 4' }));
    }
    await user.click(within(drive).getByRole('button', { name: 'Lock destination coordinates' }));
    fireEvent.change(within(drive).getByRole('slider', { name: 'Jump drive power' }), { target: { value: '100' } });
    vi.mocked(jumpShip).mockImplementation(async (attempt) => {
      expect(attempt).toMatchObject({ sessionId: 's1', shipId: 'quellon', destination: '9997', expectedRevision: 4 });
      act(() => deliverProjection(discovery('9997', [committedJump]), {
        shipResources: { quellon: { food: 10, water: 10, ore: 0, fuel: 2, materials: 0 } },
        maintenanceCycles: { quellon: { turn: 2, charges: [], results: {} } },
        shipJumpStates: { quellon: { lastJumpTurn: 2 } },
        vesselActionRevisions: { quellon: 5 },
      } as Partial<GameSession>));
      return { status: 'jumped', shipId: 'quellon', origin: '0000', destination: '9997', length: 'medium', fuelCost: 4 };
    });
    await user.click(within(drive).getByRole('button', { name: 'Jump to 9997' }));
    expect(await within(drive).findByText(/jump complete \/\/ 0000 → 9997 \/\/ medium \/\/ 4 fuel burned/i))
      .toBeVisible();
    expect(jumpShip).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Navigation' }));
    expect(planner()).toHaveTextContent('Arrived // 9997 is the committed position of the Quellon');
    expect(within(planner()).getByLabelText('Committed movement'))
      .toHaveTextContent('Last committed jump // 0000 → 9997 // stardate 2026.309.100000');

    unmount();
    const route = await reloadAt('/ships/quellon/roles/quellon-explorer');
    expect(route).toBe('/ships/quellon/roles/quellon-explorer');
    render(<ExplorerRoutes initial={route} />);
    await user.click(await screen.findByRole('button', { name: 'Navigation' }));
    // A cached snapshot never presents fuel or charge as current.
    expect(within(planner()).getByLabelText('Jump readiness')).toHaveTextContent(/live ship state unavailable/i);

    act(() => {
      useSessionStore.getState().setConnection('live');
      useSessionStore.getState().setSessionSnapshotFreshness('server');
      deliverProjection(discovery('9997', [committedJump]));
    });
    expect(planner()).toHaveTextContent('Arrived // 9997 is the committed position of the Quellon');
    expect(within(planner()).getByLabelText('Committed movement'))
      .toHaveTextContent('Last committed jump // 0000 → 9997');
    expect(within(planner()).getByLabelText('Jump readiness'))
      .toHaveTextContent(/quellon already jumped this cycle/i);
    expect(jumpShip).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('link', { name: 'Back to fleet' }));
    expect(await screen.findByRole('heading', { name: /stations and consoles/i })).toBeInTheDocument();
  });
});
