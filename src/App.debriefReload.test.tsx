import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { acknowledgeSessionWaiver } from '@/lib/sessionWaiver';

const sdk = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null, authStateReady: vi.fn() },
  call: vi.fn(), listen: vi.fn(), read: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_service: unknown, name: string) => (data: unknown) => sdk.call(name, data),
}));
vi.mock('@/lib/firebase', () => ({ auth: () => sdk.auth, functions: () => ({}), app: () => ({}) }));
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
// Unrelated chrome and routes are inert; App, persisted hydration, reconnect,
// EndgameDialog, service authority checks and callable parsing remain real.
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/ShipPlot', () => ({ default: () => null }));
vi.mock('@/components/WolfHackingRuntime', () => ({ default: () => null }));
vi.mock('@/components/TurnPhaseCoordinator', () => ({ default: () => null }));
vi.mock('@/components/TurnStartAnnouncement', () => ({ default: () => null }));
vi.mock('@/components/CrisisReportPanel', () => ({ default: () => null }));
vi.mock('@/components/FleetGroupWorkspace', () => ({ default: () => null }));
vi.mock('@/routes/SessionMode', () => ({ default: () => <main>Stations</main> }));
vi.mock('@/routes/RoleSelect', () => ({ default: () => <main>Stations</main> }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(accept => { resolve = accept; });
  return { promise, resolve };
}
const session = { id: 'cold-debrief-session', name: 'Cold reload', phase: 'debrief',
  ownerUid: 'original-gm', joinCode: '123456', currentTurn: 4,
  createdAt: '2026-10-15T12:00:00.000Z', updatedAt: '2026-10-15T12:01:00.000Z',
  gameOutcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete',
    candidateCode: 'N', cycle: 4, occurredAt: '2026-10-15T12:01:00.000Z' } };
const member = { uid: 'original-gm', sessionId: session.id, displayName: 'GM', role: 'gm',
  seatId: null, connected: true, connectionGeneration: 1, joinedAt: session.createdAt };
const instance = { id: 'original-instance', sessionId: session.id, uid: member.uid,
  name: 'GM', deviceLabel: 'test', claimedAt: session.createdAt };
const frozen = { type: 'session-debrief', version: 1, source: 'candidate', result: 'success',
  cause: 'candidate-complete', cycle: 4, occurredAt: session.updatedAt, committedAt: session.updatedAt,
  outcome: session.gameOutcome, candidate: { code: 'N', groups: [{ groupId: 'fleet-a',
    requirements: [], rolls: [], losses: [], humanCalls: [], path: [] }] } };

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  window.history.replaceState({}, '', '/#/console');
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  acknowledgeSessionWaiver();
  sdk.auth.currentUser = null;
  sdk.call.mockReset(); sdk.listen.mockReset().mockReturnValue(() => undefined);
});

it('cold GM reload waits for the original authenticated live authority before reading its committed debrief', async () => {
  const restoration = deferred();
  sdk.auth.authStateReady.mockReturnValue(restoration.promise);
  const requests: { name: string; uid: string | null }[] = [];
  sdk.call.mockImplementation(async (name, data) => {
    requests.push({ name, uid: sdk.auth.currentUser?.uid ?? null });
    if (!sdk.auth.currentUser) throw Object.assign(new Error('Sign in before reading the debrief.'), { code: 'functions/unauthenticated' });
    if (name === 'resumeSession') return { data: { session, player: member } };
    if (name === 'listGmInstances') return { data: { instances: [instance] } };
    if (name === 'getSessionDebrief') {
      expect(data).toEqual({ sessionId: session.id, instanceId: instance.id });
      return { data: { type: 'session-debrief', sessionId: session.id, snapshot: frozen } };
    }
    throw new Error(`Unexpected callable ${name}`);
  });
  const { SESSION_STORAGE_KEY, useSessionStore } = await import('@/store/useSessionStore');
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 1, state: {
    session, me: member, gmInstance: instance, mode: 'console', lastRoute: '/console', pendingCommands: [],
  } }));
  await useSessionStore.persist.rehydrate();
  const { default: App } = await import('./App');
  render(<StrictMode><App /></StrictMode>);
  await act(async () => { await Promise.resolve(); });

  expect(screen.getByRole('dialog', { name: 'Endgame evaluation' })).toBeVisible();
  expect(requests.filter(value => value.name === 'getSessionDebrief')).toEqual([]);

  await act(async () => {
    sdk.auth.currentUser = { uid: member.uid };
    restoration.resolve();
  });
  await waitFor(() => expect(useSessionStore.getState().connection).toBe('live'));
  expect(await screen.findByText('Server result // Success // Cycle 4')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Close session' })).toBeEnabled();
  expect(requests.filter(value => value.name === 'getSessionDebrief').length).toBeGreaterThan(0);
  expect(requests.every(value => value.uid === member.uid)).toBe(true);
});


it('keeps the authenticated immutable GM reader available after closed history detaches live feeds', async () => {
  sdk.auth.currentUser = { uid: member.uid };
  sdk.auth.authStateReady.mockResolvedValue(undefined);
  sdk.call.mockResolvedValue({ data: { type: 'session-debrief', sessionId: session.id, snapshot: frozen } });
  const { useSessionStore } = await import('@/store/useSessionStore');
  useSessionStore.getState().setIdentity({ ...session, phase: 'closed' } as never,
    { ...member, connected: false } as never);
  useSessionStore.getState().setGmInstance(instance);
  // Immutable reader authority comes from the authenticated server lease,
  // rather than an interactive gameplay feed or a connected member flag.
  useSessionStore.getState().setConnection('offline');
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  const { getSessionDebrief } = await import('@/lib/sessionService');
  await expect(getSessionDebrief()).resolves.toMatchObject({ result: 'success', cycle: 4 });
});

it('does not dispatch a restored GM private read under a different authenticated principal', async () => {
  sdk.auth.currentUser = { uid: 'different-principal' };
  sdk.auth.authStateReady.mockResolvedValue(undefined);
  sdk.call.mockResolvedValue({ data: { type: 'session-debrief', sessionId: session.id, snapshot: frozen } });
  const { useSessionStore } = await import('@/store/useSessionStore');
  useSessionStore.getState().setIdentity(session as never, member as never);
  useSessionStore.getState().setGmInstance(instance);
  const { getSessionDebrief } = await import('@/lib/sessionService');
  await expect(getSessionDebrief()).rejects.toThrow(/identity|account|GM/i);
  expect(sdk.call).not.toHaveBeenCalled();
});

it('does not move a waiting private read to another session or GM lease', async () => {
  const restoration = deferred();
  sdk.auth.authStateReady.mockReturnValue(restoration.promise);
  sdk.call.mockResolvedValue({ data: { type: 'session-debrief', sessionId: session.id, snapshot: frozen } });
  const { useSessionStore } = await import('@/store/useSessionStore');
  useSessionStore.getState().setIdentity(session as never, member as never);
  useSessionStore.getState().setGmInstance(instance);
  const { getSessionDebrief } = await import('@/lib/sessionService');
  const result = getSessionDebrief();
  const rejected = expect(result).rejects.toThrow(/identity|session|GM/i);
  useSessionStore.getState().setGmInstance({ ...instance, id: 'replacement-instance' });
  sdk.auth.currentUser = { uid: member.uid };
  restoration.resolve();
  await rejected;
  expect(sdk.call).not.toHaveBeenCalled();
});


it('ends a stalled Auth restoration visibly and retries the same committed debrief without replacing the GM', async () => {
  vi.useFakeTimers();
  try {
    const restoration = deferred();
    sdk.auth.authStateReady.mockReturnValue(restoration.promise);
    sdk.call.mockResolvedValue({ data: { type: 'session-debrief', sessionId: session.id, snapshot: frozen } });
    const { useSessionStore } = await import('@/store/useSessionStore');
    useSessionStore.getState().setIdentity(session as never, member as never);
    useSessionStore.getState().setGmInstance(instance);
    const { COMMAND_RECONNECT_WINDOW_MS } = await import('@/lib/sessionService');
    const { default: EndgameDialog } = await import('@/components/EndgameDialog');
    render(<EndgameDialog />);
    await act(async () => { await vi.advanceTimersByTimeAsync(COMMAND_RECONNECT_WINDOW_MS + 1); });

    expect(screen.getByRole('alert')).toHaveTextContent(/could not read.*debrief/i);
    expect(screen.queryByText('Reading the committed facilitator debrief…')).not.toBeInTheDocument();
    expect(sdk.call).not.toHaveBeenCalled();
    sdk.auth.currentUser = { uid: member.uid };
    restoration.resolve();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry facilitator debrief' })); });
    expect(screen.getByText('Server result // Success // Cycle 4')).toBeVisible();
    expect(sdk.call).toHaveBeenCalledWith('getSessionDebrief', { sessionId: session.id, instanceId: instance.id });
    const { signInAnonymously } = await import('firebase/auth');
    expect(signInAnonymously).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
