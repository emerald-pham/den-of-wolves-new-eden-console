import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GameSession } from '@/types/game';
import type { useSessionStore as SessionStore } from '@/store/useSessionStore';
import type * as SessionService from '@/lib/sessionService';

const sdk = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null, authStateReady: vi.fn() },
  call: vi.fn(), listen: vi.fn(), read: vi.fn(), signIn: vi.fn(),
}));

vi.mock('firebase/auth', () => ({ signInAnonymously: (...args: unknown[]) => sdk.signIn(...args) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_service: unknown, name: string) => (data: unknown) => sdk.call(name, data),
}));
vi.mock('@/lib/firebase', () => ({
  app: () => ({}), auth: () => sdk.auth, functions: () => ({}),
  demoActorServices: () => ({ auth: sdk.auth, functions: {} }),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_database: unknown, path: string) => ({ path }),
  collection: (_database: unknown, path: string) => ({ path }),
  query: (reference: unknown) => reference, where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  getFirestore: () => ({}), connectFirestoreEmulator: vi.fn(),
  onSnapshot: (...args: unknown[]) => sdk.listen(...args),
  getDocFromServer: (reference: unknown) => sdk.read(reference),
  Timestamp: class { toDate() { return new Date(0); } },
}));
vi.mock('@/lib/firebaseConfig', () => ({ useEmulators: false, emulatorPorts: { firestore: 8080 } }));
vi.mock('@/lib/versionUpgrade', () => ({ startVersionUpgradeMonitor: () => () => undefined }));

// Keep the actual App, join service, Firestore player listener, store, and
// CastingPreferencePanel. Replace only the unrelated full-game console tree.
vi.mock('@/routes/SessionMode', async () => {
  const { useSessionStore } = await vi.importActual<typeof import('@/store/useSessionStore')>('@/store/useSessionStore');
  const { default: CastingPreferencePanel } = await vi.importActual<typeof import('@/components/CastingPreferencePanel')>(
    '@/components/CastingPreferencePanel',
  );
  return { default: function CastingSurface() {
    const session = useSessionStore(state => state.session);
    const player = useSessionStore(state => state.me);
    const sessionSnapshotFreshness = useSessionStore(state => state.sessionSnapshotFreshness);
    return session && player
      ? <CastingPreferencePanel session={session} player={player} sessionSnapshotFreshness={sessionSnapshotFreshness} />
      : null;
  } };
});
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/ShipPlot', () => ({ default: () => null }));
vi.mock('@/components/WolfHackingRuntime', () => ({ default: () => null }));
vi.mock('@/components/TurnPhaseCoordinator', () => ({ default: () => null }));
vi.mock('@/components/TurnStartAnnouncement', () => ({ default: () => null }));
vi.mock('@/components/CrisisReportPanel', () => ({ default: () => null }));
vi.mock('@/components/FleetGroupWorkspace', () => ({ default: () => null }));
vi.mock('@/routes/RoleSelect', () => ({ default: () => <main>Stations</main> }));

function snapshot(path: string, data: Record<string, unknown> | null, fromCache = false) {
  return { id: path.split('/').at(-1), metadata: { fromCache },
    exists: () => data !== null, data: () => data, get: (field: string) => data?.[field] };
}

interface PlayerListener {
  readonly path: string;
  readonly next: (value: ReturnType<typeof snapshot>) => void;
  readonly error: (value: { code: string }) => void;
  active: boolean;
}

let sessionId: string;
let joinPlayer: Record<string, unknown>;
let joinedSession: GameSession;
let listeners: PlayerListener[];
let store: typeof SessionStore;
let service: typeof SessionService;
let appUnmount: (() => void) | undefined;
const playerPath = () => `sessions/${sessionId}/players/${joinPlayer.uid}`;
const currentPlayerListener = () => listeners.filter(value => value.active && value.path === playerPath()).at(-1);

async function flush(ms = 100) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function mountOrdinaryJoin() {
  window.history.replaceState({}, '', '/#/console');
  ({ useSessionStore: store } = await import('@/store/useSessionStore'));
  service = await import('@/lib/sessionService');
  const { sessionFrom } = await import('@/lib/firestore');
  // Resolve the real-route wrapper before App's lazy console route requests it.
  await import('@/routes/SessionMode');
  const { default: App } = await import('./App');
  const rawSession = {
    name: 'Primary casting readiness fixture', joinCode: '123456', phase: 'casting', currentTurn: 0,
    activeVesselIds: ['aegis'], activeRoleIds: [], playerCount: 1, setupRevision: 4,
    configurationLocked: false, pressEnabled: true, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [] },
  };
  joinedSession = sessionFrom(sessionId, rawSession);
  // This is the exact ordinary join response shape: Firestore writes connected
  // true, but the callable's player projection does not return that field.
  joinPlayer = {
    uid: 'ordinary-primary', sessionId, displayName: 'Primary guest', role: 'player', seatId: null,
    fleetGroupId: 'fleet-1', assignedRoleId: null, activeConsoleRoleId: null,
    connectionGeneration: 1, joinedAt: new Date().toISOString(),
  };
  sdk.call.mockImplementation((name: string) => {
    if (name === 'joinSession') return Promise.resolve({ data: { session: joinedSession, player: joinPlayer } });
    if (name === 'getCurrentMemberSession') return new Promise(() => undefined);
    if (name === 'refreshPresence') return Promise.resolve({ data: { sessionId } });
    throw new Error(`Unexpected callable ${name}`);
  });
  sdk.listen.mockImplementation((reference: { path: string }, _options: unknown,
    next: PlayerListener['next'], error: PlayerListener['error']) => {
    const listener = { path: reference.path, next, error, active: true };
    listeners.push(listener);
    return () => { listener.active = false; };
  });
  sdk.read.mockResolvedValue(snapshot(`sessions/${sessionId}`, rawSession));
  appUnmount = render(<App />).unmount;
  await flush();
  await act(async () => {
    await service.joinSession('123456');
    store.getState().setMode('console');
  });
  await flush();
  return screen.getByRole('region', { name: 'Casting preference' });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime('2026-10-06T11:00:00.000Z');
  localStorage.clear();
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
  window.history.replaceState({}, '', '/#/console');
  sessionId = 'ordinary-primary-casting-readiness';
  listeners = [];
  sdk.auth.currentUser = { uid: 'ordinary-primary' };
  sdk.auth.authStateReady.mockReset().mockResolvedValue(undefined);
  sdk.call.mockReset(); sdk.listen.mockReset(); sdk.read.mockReset();
  sdk.signIn.mockReset().mockRejectedValue(new Error('The ordinary Auth identity must not be replaced.'));
});

afterEach(async () => {
  if (appUnmount) act(appUnmount);
  appUnmount = undefined;
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
});

it('waits for the exact current player connection before enabling primary casting preferences', async () => {
  const panel = await mountOrdinaryJoin();
  expect(store.getState().me).not.toHaveProperty('connected');
  expect(store.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
    session: { id: sessionId, phase: 'casting' }, me: { uid: joinPlayer.uid, sessionId, role: 'player' } });

  const select = within(panel).getByRole('combobox', { name: 'Preferred ship' });
  expect(select).toBeDisabled();
  await expect(service.submitShipPreference('aegis')).rejects.toThrow(/current connected player/i);
  expect(sdk.call.mock.calls.filter(([name]) => name === 'setShipPreference')).toHaveLength(0);

  const reader = currentPlayerListener();
  expect(reader).toBeDefined();
  act(() => reader!.next(snapshot(playerPath(), { ...joinPlayer, connected: true })));
  await flush();
  expect(store.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
    me: { uid: joinPlayer.uid, sessionId, connected: true, connectionGeneration: 1 } });
  expect(select).toBeEnabled();

  act(() => reader!.next(snapshot(playerPath(), { ...joinPlayer, connected: false })));
  await flush();
  expect(store.getState()).toMatchObject({ connection: 'offline', sessionSnapshotFreshness: 'cache',
    me: { uid: joinPlayer.uid, sessionId, connected: false, connectionGeneration: 1 } });
  expect(select).toBeDisabled();
  await expect(service.submitShipPreference('aegis')).rejects.toThrow(/current connected player/i);
  expect(sdk.call.mock.calls.filter(([name]) => name === 'setShipPreference')).toHaveLength(0);

  act(() => reader!.next(snapshot(playerPath(), { ...joinPlayer, connected: true, connectionGeneration: 2 })));
  await flush();
  expect(store.getState()).toMatchObject({ connection: 'offline', sessionSnapshotFreshness: 'cache',
    me: { uid: joinPlayer.uid, sessionId, connected: true, connectionGeneration: 2 } });
  expect(select).toBeDisabled();
});
