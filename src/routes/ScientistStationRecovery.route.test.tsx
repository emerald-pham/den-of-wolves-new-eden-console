import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '@/App';
import { useSessionStore } from '@/store/useSessionStore';
import { acknowledgeSessionWaiver } from '@/lib/sessionWaiver';
import { MOTION_SAFETY_STORAGE_KEY } from '@/lib/motionSafety';
import type { GameSession, Player, WolfAttackMemberView } from '@/types/game';
import type * as FirebaseModule from '@/lib/firebase';
import type * as FirestoreModule from '@/lib/firestore';
import type * as SessionServiceModule from '@/lib/sessionService';

// The callable boundary. The Scientist's scouting request is refused because the
// server no longer recognises the station; every Endeavour read answers normally.
const server = vi.hoisted(() => ({
  scoutRequests: [] as Record<string, unknown>[],
  call: async (name: string, data: Record<string, unknown>) => {
    switch (name) {
      case 'requestScout':
        server.scoutRequests.push(data);
        throw Object.assign(new Error('station unavailable'), {
          code: 'functions/permission-denied',
          details: { commandError: 'station-selection-required' },
        });
      case 'listMyScoutReports':
        return { data: [] };
      case 'readEndeavourResearchWorkspace':
        return { data: {
          status: 'ready', sessionId: 's1', cycle: 3, researchRevision: 0,
          cadence: { cycle: 3, revision: 0, choices: [] }, progress: { reactor: 1 },
          tracks: [{ trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5,
            currentMaterialCost: 7, complete: false }],
          shepherdOre: 10, fieldUpgradeState: { upgradeRevision: 0, targetsUsedThisCycle: 0 },
          scienceDevices: { revision: 0, ecmBuilt: false, detectorBuilt: false, ecmUsed: false,
            shepherdMaterials: 30, buildCosts: { 'ecm-device': 13, 'wolf-agent-detector': null } },
        } };
      default:
        throw new Error(`Unexpected callable ${name}`);
    }
  },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => (data: Record<string, unknown>) => server.call(name, data)),
}));
vi.mock('@/lib/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof FirebaseModule>()),
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));
// Keep the real station-loss handling; stub only network and presence side effects.
vi.mock('@/lib/sessionService', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionServiceModule>()),
  connectAutomatically: vi.fn().mockResolvedValue(undefined),
  refreshPresence: vi.fn().mockResolvedValue(undefined),
  reconcileGmAuthority: vi.fn().mockResolvedValue(undefined),
  refreshCommissarPurgeAuthority: vi.fn().mockResolvedValue(null),
  listGmInstances: vi.fn().mockResolvedValue([]),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
  selectConsoleRole: vi.fn(),
  getWolfBoardingDefenceChoice: vi.fn(async () => null),
  getWolfRangeActionChoice: vi.fn(async () => null),
  getWolfForceFieldChoice: vi.fn(async () => null),
  popShipConfetti: vi.fn(),
}));
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof FirestoreModule>()),
  sessionSnapshotAuthorityFor: vi.fn(() => ({ hasServerSessionAuthority: false })),
  subscribeSessionState: vi.fn(() => vi.fn()),
  subscribeCrisisReport: vi.fn(() => vi.fn()),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeLoyaltyCensus: vi.fn(() => vi.fn()),
  subscribeGmWolfHackingAlerts: vi.fn(() => vi.fn()),
  subscribePlayerHackingNotices: vi.fn(() => vi.fn()),
  subscribeGmInstances: vi.fn(() => vi.fn()),
  subscribeShipConfetti: vi.fn(() => vi.fn()),
  subscribeSessionEvents: vi.fn((_sessionId: string, onEvents: (events: never[]) => void) => {
    onEvents([]);
    return vi.fn();
  }),
  subscribeDamageDraws: vi.fn((_sessionId: string, onDraws: (draws: never[]) => void) => {
    onDraws([]);
    return vi.fn();
  }),
  subscribeVipCards: vi.fn(() => vi.fn()),
  subscribeWolfAttackMemberView: vi.fn((_sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
    onView(null);
    return vi.fn();
  }),
  subscribeShuttleDeparture: vi.fn((_sessionId, _shuttleId, onDeparture: (departure: null) => void) => {
    onDeparture(null);
    return vi.fn();
  }),
}));
vi.mock('@/lib/versionUpgrade', () => ({ startVersionUpgradeMonitor: vi.fn(() => vi.fn()) }));
vi.mock('@/lib/endeavourEcmDeviceService', () => ({
  readEndeavourEcmDeviceWorkspace: vi.fn(async () => ({
    status: 'ready', sessionId: 's1', cycle: 3, controlRevision: 4,
    researchComplete: false, device: { status: 'ready', revision: 0 }, pursuit: { groupId: 'fleet-1', current: 8 },
  })),
  createEndeavourEcmDeviceAttempt: vi.fn(),
  activateEndeavourEcmDevice: vi.fn(),
  retryEndeavourEcmDeviceAttempt: vi.fn(),
}));

const { selectConsoleRole } = await import('@/lib/sessionService');

const scientist: Player = {
  uid: 'u1', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: 'shepherd-scientist',
  assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', fleetGroupId: 'fleet-1',
  joinedAt: '2026-09-12T00:00:00.000Z',
};
const session = {
  id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
  currentTurn: 3, activeRoleIds: ['shepherd-scientist'], activeVesselIds: ['shepherd', 'aegis'],
  shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'SESSION START' }],
  shuttleControl: { endeavour: {
    shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'u1', holderUid: 'u1', revision: 4,
  } },
  playerDiscovery: {
    groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd', 'aegis'], shipId: 'shepherd', currentCoordinate: '0000',
    knownCoordinates: ['0000'], knownSystems: { 'system-01': '0000' }, pursuitDistance: 0, navigationLogs: [], revision: 1,
  },
  shipUpgrades: { shepherd: [], aegis: [] },
  turnPhase: {
    turn: 3, teamPhaseEndsAt: '2026-09-12T00:00:00.000Z', openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
  createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z',
} as unknown as GameSession;

// Lazy route chunks can load slowly when the whole suite runs in parallel.
const slow = { timeout: 10_000 };
const scoutForm = () => screen.findByRole('region', { name: 'Endeavour scouting request' }, slow);
const coordinate = async () => within(await scoutForm()).getByLabelText('Printed system coordinate');

beforeEach(() => {
  window.location.hash = '#/';
  sessionStorage.clear();
  localStorage.clear();
  localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  acknowledgeSessionWaiver(localStorage, Date.now());
  server.scoutRequests.length = 0;
  // As the real service does, a selection is ignored until the reselect notice has been dismissed.
  vi.mocked(selectConsoleRole).mockReset().mockImplementation(async (roleId) => {
    const { me, communicationError } = useSessionStore.getState();
    if (communicationError?.kind === 'station-selection-required') return;
    if (me) useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: roleId });
  });
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity(session, scientist);
  state.setMode('console');
  state.setConnection('live');
  state.setSessionSnapshotFreshness('server');
});

it('keeps the Scientist\'s scouting draft through Back and a lost station, returning to the chooser to reselect', async () => {
  const user = userEvent.setup();
  window.location.hash = '#/shuttles/endeavour';
  render(<App />);

  // Back: the draft coordinate survives a trip to the parent Scientist console and back.
  await user.type(await coordinate(), '4888');
  await user.click(screen.getByRole('link', { name: /back to shepherd scientist console/i }));
  expect(await screen.findByRole('heading', { name: 'Shepherd' }, slow)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ship systems' }));
  await user.click(screen.getByRole('link', { name: /open endeavour shuttle console/i }));
  expect(await coordinate()).toHaveValue('4888');

  // Lost station: the server refuses the request, the console returns to the chooser and asks for reselection.
  await user.click(within(await scoutForm()).getByRole('button', { name: 'Record request' }));
  expect(await screen.findByRole('heading', { name: 'Stations and consoles' }, slow)).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your previous station is no longer available. Return to station select and reselect your role.');
  expect(useSessionStore.getState().me).toMatchObject({ uid: 'u1', activeConsoleRoleId: null });
  expect(useSessionStore.getState().session?.id).toBe('s1');
  expect(server.scoutRequests).toEqual([
    expect.objectContaining({ entitlementId: 'endeavour', targetCoordinate: '4888' }),
  ]);

  // Reselect from the chooser: the same safe draft is waiting, and nothing was recorded twice.
  await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
  await user.click(screen.getByRole('link', { name: /shepherd \/\/ scientist/i }));
  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('shepherd-scientist'));
  expect(await screen.findByRole('heading', { name: 'Shepherd' }, slow)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ship systems' }));
  await user.click(screen.getByRole('link', { name: /open endeavour shuttle console/i }));
  expect(await coordinate()).toHaveValue('4888');
  expect(server.scoutRequests).toHaveLength(1);
}, 60_000);
