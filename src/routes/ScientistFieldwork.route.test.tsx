import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SESSION_STORAGE_KEY, useSessionStore } from '@/store/useSessionStore';
import { restoreSessionRoute } from '@/lib/sessionRoute';
import type { Player } from '@/types/game';
import type * as FirebaseModule from '@/lib/firebase';
import type * as FirestoreModule from '@/lib/firestore';
import ShuttleConsole from './ShuttleConsole';

// A tiny in-memory Endeavour server at the callable boundary. It keeps the same
// receipts the real callables keep, so a repeated request id replays instead of
// charging again, and it answers every read from its stored state, as a reload would.
const server = vi.hoisted(() => {
  const state = {
    researchRevision: 0, reactorBoxes: 1, ore: 10, materials: 30,
    ecmBuilt: false, choices: [] as { trackId: string; funding: string; oreCost: number }[],
    receipts: new Map<string, Record<string, unknown>>(),
    delivered: [] as { name: string; requestId: string }[],
    dropNextBuildAcknowledgement: false,
  };
  const reactorCost = () => 8 - state.reactorBoxes;
  const workspace = () => ({
    status: 'ready', sessionId: 's1', cycle: 3, researchRevision: state.researchRevision,
    cadence: { cycle: 3, revision: state.researchRevision, choices: [...state.choices] },
    progress: { reactor: state.reactorBoxes },
    tracks: [{ trackId: 'reactor', name: 'Reactor', crossedBoxes: state.reactorBoxes, totalBoxes: 5,
      currentMaterialCost: reactorCost(), complete: false }],
    shepherdOre: state.ore,
    fieldUpgradeState: { upgradeRevision: 0, targetsUsedThisCycle: 0 },
    scienceDevices: { revision: state.ecmBuilt ? 1 : 0, ecmBuilt: state.ecmBuilt, detectorBuilt: false, ecmUsed: false,
      shepherdMaterials: state.materials, buildCosts: { 'ecm-device': state.ecmBuilt ? null : 13, 'wolf-agent-detector': null } },
  });
  const handlers: Record<string, (data: Record<string, unknown>) => unknown> = {
    readEndeavourResearchWorkspace: () => workspace(),
    advanceEndeavourResearchTrack: (data) => {
      const requestId = data.requestId as string;
      state.delivered.push({ name: 'advance', requestId });
      const prior = state.receipts.get(requestId);
      if (prior) return { ...prior, status: 'replayed' };
      const previousMaterialCost = reactorCost();
      const funding = data.funding as string;
      state.reactorBoxes += 1;
      state.researchRevision += 1;
      if (funding === 'shepherd-ore') state.ore -= 5;
      state.choices.push({ trackId: 'reactor', funding, oreCost: funding === 'standard' ? 0 : 5 });
      const reply = {
        status: 'committed', sessionId: 's1', requestId, cycle: 3, researchRevision: state.researchRevision,
        trackId: 'reactor', funding, oreCost: funding === 'standard' ? 0 : 5, previousMaterialCost,
        currentMaterialCost: reactorCost(), shepherdOre: state.ore, progress: { reactor: state.reactorBoxes },
        cadence: { cycle: 3, revision: state.researchRevision, choices: [...state.choices] },
      };
      state.receipts.set(requestId, reply);
      return reply;
    },
    buildEndeavourScienceDevice: (data) => {
      const requestId = data.requestId as string;
      state.delivered.push({ name: 'build', requestId });
      const prior = state.receipts.get(requestId);
      if (prior) return { ...prior, status: 'replayed' };
      state.materials -= 13;
      state.ecmBuilt = true;
      const reply = {
        status: 'committed', sessionId: 's1', requestId, cycle: 3, deviceId: 'ecm-device', deviceRevision: 1,
        built: true, materialCost: 13, shepherdMaterials: state.materials,
      };
      state.receipts.set(requestId, reply);
      if (state.dropNextBuildAcknowledgement) {
        state.dropNextBuildAcknowledgement = false;
        throw Object.assign(new Error('The connection dropped before the answer arrived.'), { code: 'unavailable' });
      }
      return reply;
    },
  };
  return {
    state,
    reset() {
      Object.assign(state, {
        researchRevision: 0, reactorBoxes: 1, ore: 10, materials: 30, ecmBuilt: false, choices: [],
        delivered: [], dropNextBuildAcknowledgement: false,
      });
      state.receipts.clear();
    },
    call: async (name: string, data: Record<string, unknown>) => {
      const handler = handlers[name];
      if (!handler) throw new Error(`Unexpected callable ${name}`);
      return { data: handler(data) };
    },
  };
});

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => (data: Record<string, unknown>) => server.call(name, data)),
}));
vi.mock('@/lib/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof FirebaseModule>()),
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));
vi.mock('@/lib/sessionService', () => ({
  getWolfBoardingDefenceChoice: vi.fn(async () => null),
  getWolfRangeActionChoice: vi.fn(async () => null),
  getWolfForceFieldChoice: vi.fn(async () => null),
  popShipConfetti: vi.fn(),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
  selectConsoleRole: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof FirestoreModule>()),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeShuttleDeparture: vi.fn((_sessionId, _shuttleId, onDeparture: (departure: null) => void) => {
    onDeparture(null);
    return vi.fn();
  }),
}));
// The scout request form is proven by its own component and emulator checks; keep this route to research and devices.
vi.mock('@/components/ScoutRequestControls', () => ({ default: () => null }));
vi.mock('@/lib/endeavourEcmDeviceService', () => ({
  readEndeavourEcmDeviceWorkspace: vi.fn(async () => ({
    status: 'ready', sessionId: 's1', cycle: 3, controlRevision: 4,
    researchComplete: false, device: { status: 'ready', revision: 0 }, pursuit: { groupId: 'fleet-1', current: 8 },
  })),
  createEndeavourEcmDeviceAttempt: vi.fn(),
  activateEndeavourEcmDevice: vi.fn(),
  retryEndeavourEcmDeviceAttempt: vi.fn(),
}));

const scientist: Player = {
  uid: 'u1', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: 'shepherd-scientist',
  assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', fleetGroupId: 'fleet-1',
  joinedAt: '2026-09-12T00:00:00.000Z',
};

function seedScientistSession(): void {
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist'], activeVesselIds: ['shepherd', 'aegis'],
    shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'SESSION START' }],
    shuttleControl: { endeavour: {
      shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'u1', holderUid: 'u1', revision: 4,
    } },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd', 'aegis'],
      knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    shipUpgrades: { shepherd: [], aegis: [] },
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z', openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z',
  } as never, scientist);
  state.setMode('console');
  state.setConnection('live');
  state.setSessionSnapshotFreshness('server');
}

function ScientistRoutes({ initial }: { readonly initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/shepherd/roles/shepherd-scientist" element={<p>Shepherd Scientist console</p>} />
      </Routes>
    </MemoryRouter>
  );
}

// A reload keeps only what the browser persisted; the shared result must come back from the server.
async function reload(route: string): Promise<string> {
  cleanup();
  const state = useSessionStore.getState();
  state.setLastRoute(route);
  const persisted = localStorage.getItem(SESSION_STORAGE_KEY);
  expect(persisted).toBeTruthy();
  useSessionStore.getState().reset();
  localStorage.setItem(SESSION_STORAGE_KEY, persisted!);
  await act(async () => { await useSessionStore.persist.rehydrate(); });
  act(() => {
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
  });
  return restoreSessionRoute(useSessionStore.getState().lastRoute);
}

const researchProgress = () => screen.getByRole('list', { name: 'Research progress' });

beforeEach(() => {
  localStorage.clear();
  server.reset();
  seedScientistSession();
});

it('shows the same committed research choice after a reload and sends it only once', async () => {
  const user = userEvent.setup();
  render(<ScientistRoutes initial="/shuttles/endeavour" />);
  await screen.findByRole('region', { name: 'Endeavour research controls' });
  expect(researchProgress()).toHaveTextContent('Reactor: 1 of 5 boxes crossed; next field-upgrade cost is 7 materials.');

  await user.click(screen.getByRole('button', { name: 'Advance standard research' }));
  await waitFor(() => expect(researchProgress()).toHaveTextContent(
    'Reactor: 2 of 5 boxes crossed; next field-upgrade cost is 6 materials. Chosen this cycle.'));

  const route = await reload('/shuttles/endeavour');
  expect(route).toBe('/shuttles/endeavour');
  render(<ScientistRoutes initial={route} />);
  await screen.findByRole('region', { name: 'Endeavour research controls' });
  await waitFor(() => expect(researchProgress()).toHaveTextContent(
    'Reactor: 2 of 5 boxes crossed; next field-upgrade cost is 6 materials. Chosen this cycle.'));
  expect(server.state.delivered.filter(({ name }) => name === 'advance')).toHaveLength(1);
  expect(server.state.ore).toBe(10);
});

it('charges a device once when its answer is lost, then shows it built at the same price after a reload', async () => {
  const user = userEvent.setup();
  server.state.dropNextBuildAcknowledgement = true;
  render(<ScientistRoutes initial="/shuttles/endeavour" />);
  const devices = await screen.findByRole('region', { name: 'Science device construction controls' });
  await user.click(within(devices).getByRole('button', { name: 'Build ECM Device for 13 materials' }));

  // The server committed but the answer never arrived: the console offers only the exact same request again.
  await user.click(await screen.findByRole('button', { name: 'Retry same science device purchase' }));
  expect(await screen.findByText('ECM Device built for 13 materials.')).toHaveAttribute('role', 'status');
  expect(server.state.materials).toBe(17);
  const requestIds = server.state.delivered.filter(({ name }) => name === 'build').map(({ requestId }) => requestId);
  expect(requestIds).toHaveLength(2);
  expect(new Set(requestIds).size).toBe(1);

  const route = await reload('/shuttles/endeavour');
  render(<ScientistRoutes initial={route} />);
  const restored = await screen.findByRole('region', { name: 'Science device construction controls' });
  await waitFor(() => expect(within(restored).getByText('ECM Device // Built')).toBeVisible());
  expect(within(restored).getByText('Shepherd // 17 materials available')).toBeVisible();
  expect(within(restored).queryByRole('button', { name: /Build ECM Device/ })).not.toBeInTheDocument();
  expect(server.state.delivered.filter(({ name }) => name === 'build')).toHaveLength(2);
  expect(server.state.materials).toBe(17);
});

it('shows a device built before a lost answer as built after a reload, without offering a second purchase', async () => {
  const user = userEvent.setup();
  server.state.dropNextBuildAcknowledgement = true;
  render(<ScientistRoutes initial="/shuttles/endeavour" />);
  const devices = await screen.findByRole('region', { name: 'Science device construction controls' });
  await user.click(within(devices).getByRole('button', { name: 'Build ECM Device for 13 materials' }));
  await screen.findByRole('button', { name: 'Retry same science device purchase' });

  // The browser reloads before the player retries; the pending request is gone from the page.
  const route = await reload('/shuttles/endeavour');
  render(<ScientistRoutes initial={route} />);
  const restored = await screen.findByRole('region', { name: 'Science device construction controls' });
  await waitFor(() => expect(within(restored).getByText('ECM Device // Built')).toBeVisible());
  expect(within(restored).getByText('Shepherd // 17 materials available')).toBeVisible();
  expect(within(restored).queryByRole('button', { name: /Build ECM Device/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry same science device purchase' })).not.toBeInTheDocument();
  expect(server.state.delivered.filter(({ name }) => name === 'build')).toHaveLength(1);
  expect(server.state.materials).toBe(17);
});
