import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession, GmInstance, Player } from '@/types/game';
import { isLiveSetupGm } from '../functions/src/gameSetup';
import { useSessionStore } from '@/store/useSessionStore';
import { MOTION_SAFETY_STORAGE_KEY } from '@/lib/motionSafety';
import { SESSION_WAIVER_STORAGE_KEY } from '@/lib/sessionWaiver';

const sdk = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'presence-actor' } },
  call: vi.fn(), listen: vi.fn(), read: vi.fn(),
}));

vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_service: unknown, name: string) =>
    (data: unknown) => sdk.call(name, data),
}));
vi.mock('@/lib/firebase', () => ({
  app: () => ({}), auth: () => sdk.auth, functions: () => ({}),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_database: unknown, path: string) => ({ path }),
  collection: (_database: unknown, path: string) => ({ path }),
  query: (reference: unknown) => reference,
  where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  getFirestore: () => ({}), connectFirestoreEmulator: vi.fn(),
  onSnapshot: (...args: unknown[]) => sdk.listen(...args),
  getDocFromServer: (reference: unknown) => sdk.read(reference),
  Timestamp: class { toDate() { return new Date(0); } },
}));
vi.mock('@/lib/firebaseConfig', () => ({
  useEmulators: false, emulatorPorts: { firestore: 8080 },
}));
vi.mock('@/lib/versionUpgrade', () => ({ startVersionUpgradeMonitor: () => () => undefined }));

// Keep the actual App connection effect, identity store, session service, and
// Firestore subscription. Unrelated gameplay/chrome readers do not participate
// in this lifecycle regression.
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/ShipPlot', () => ({ default: () => null }));
vi.mock('@/components/WolfHackingRuntime', () => ({ default: () => null }));
vi.mock('@/components/TurnPhaseCoordinator', () => ({ default: () => null }));
vi.mock('@/components/TurnStartAnnouncement', () => ({ default: () => null }));
vi.mock('@/components/CrisisReportPanel', () => ({ default: () => null }));
vi.mock('@/components/FleetGroupWorkspace', () => ({ default: () => null }));
vi.mock('@/routes/SessionMode', () => ({ default: () => <main>Stations</main> }));
vi.mock('@/routes/RoleSelect', () => ({ default: () => <main>Stations</main> }));
vi.mock('@/routes/DemoActorManager', () => ({ default: () => <main>Demo crew</main> }));

const { default: App } = await import('./App');
const { sessionFrom } = await import('@/lib/firestore');
const { setGmControlsLocked } = await import('@/lib/sessionService');

interface Listener {
  readonly path: string;
  readonly next: (value: DocumentSnapshotFixture) => void;
  readonly error: (error: { code: string }) => void;
  active: boolean;
}

function snapshot(path: string, data: Record<string, unknown> | null) {
  return {
    id: path.split('/').at(-1), metadata: { fromCache: false },
    exists: () => data !== null, data: () => data,
    get: (field: string) => data?.[field],
  };
}

type DocumentSnapshotFixture = ReturnType<typeof snapshot>;

let serial = 0;
let sessionId: string;
let sessionData: Record<string, unknown>;
let actor: Player;
let originalClaim: GmInstance;
let leaseSeenAt: string;
let briefData: Record<string, unknown> | null;
let claimVisible: boolean;
let memberReadUnavailableUntilResume: boolean;
let listeners: Listener[];
let unmount: (() => void) | undefined;

const rootPath = () => `sessions/${sessionId}`;
const actorPath = () => `${rootPath()}/players/${actor.uid}`;
const briefPath = () => `${rootPath()}/roleBriefs/${actor.uid}`;
const projectedSession = (): GameSession => sessionFrom(sessionId, {
  ...sessionData,
  ...(actor.role === 'player' ? {
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [] },
  } : {}),
});
const activeListeners = (path: string) => listeners.filter(listener => listener.active && listener.path === path);
const callCount = (name: string) => sdk.call.mock.calls.filter(call => call[0] === name).length;

function publishActor(next: Player) {
  actor = next;
  for (const listener of activeListeners(actorPath())) listener.next(snapshot(actorPath(), { ...actor }));
  if ((!actor.assignedRoleId && !actor.replacementRoleId) || actor.replacementStatus != null) {
    // Rules reauthorize the brief against its live player dependency. Losing
    // that entitlement terminates its SDK reader, even if the brief is unchanged.
    for (const listener of activeListeners(briefPath())) {
      listener.active = false;
      listener.error({ code: 'permission-denied' });
    }
  }
}

function publishSession(change: Record<string, unknown>) {
  sessionData = { ...sessionData, ...change };
  for (const listener of activeListeners(rootPath())) listener.next(snapshot(rootPath(), sessionData));
}

function assignedBrief(roleId: string) {
  return { type: 'role-brief', sessionId, assignmentUid: actor.uid,
    visibleToUids: [actor.uid], roleId, roleName: 'Fixture role', vesselName: 'AEGIS',
    text: 'Private fixture briefing.', commonRules: 'Fixture common rules.', setupRevision: 1 };
}

async function advance(ms: number) {
  // Separate timer turns let React finish each identity/listener replacement,
  // as it does between browser retry ticks. No emulator clock is changed.
  for (let remaining = ms; remaining > 0; remaining -= 100) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(100, remaining)); });
  }
}

async function mount(role: Player['role'], assignment?: string, replacement?: string) {
  actor = { ...actor, role, assignedRoleId: assignment ?? null, replacementRoleId: replacement ?? null,
    activeConsoleRoleId: assignment ?? null, seatId: assignment ?? null };
  briefData = assignment || replacement ? assignedBrief(replacement ?? assignment!) : null;
  const store = useSessionStore.getState();
  store.setIdentity(projectedSession(), actor);
  store.setConnection('live'); store.setSessionSnapshotFreshness('server');
  if (role === 'gm') store.setGmInstance(originalClaim);
  window.location.hash = role === 'gm' ? '#/console' : '#/demo-actors';
  unmount = render(<App />).unmount;
  await advance(100);
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime('2026-10-05T23:00:00.000Z');
  useSessionStore.getState().reset(); localStorage.clear();
  localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, String(Date.now()));
  sessionId = `role-brief-presence-${++serial}`;
  sessionData = { id: sessionId, name: 'Presence fixture', joinCode: '123456', phase: 'casting', currentTurn: 0,
    playerCount: 18, fullGameDemo: { status: 'active', progression: 'manual' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  actor = { uid: sdk.auth.currentUser.uid, sessionId, displayName: 'Presence actor', role: 'player', connected: true,
    fleetGroupId: 'fleet-1', connectionGeneration: 1, assignedRoleId: null, replacementRoleId: null,
    replacementStatus: null, activeConsoleRoleId: null, seatId: null, joinedAt: new Date().toISOString() };
  leaseSeenAt = new Date().toISOString(); claimVisible = true; briefData = null; memberReadUnavailableUntilResume = false; listeners = [];
  originalClaim = { id: 'original-gm-claim', sessionId, uid: actor.uid, name: 'Original GM', deviceLabel: 'Fixture',
    claimedAt: leaseSeenAt, responsibilities: ['main', 'assistant'] };
  sdk.read.mockReset().mockImplementation(async () => snapshot(rootPath(), sessionData));
  sdk.listen.mockReset().mockImplementation((reference, _options, next, error) => {
    const listener: Listener = { path: reference.path, next, error, active: true };
    listeners.push(listener);
    if (reference.path === rootPath() || reference.path === actorPath()) {
      setTimeout(() => {
        if (listener.active) next(snapshot(reference.path, reference.path === rootPath() ? sessionData : { ...actor }));
      }, 0);
    } else if (reference.path === briefPath()) {
      setTimeout(() => {
        if (!listener.active) return;
        // The rules require an existing, matching own-UID role brief. A fresh
        // GM and a genuinely admitted unassigned controller have no such doc.
        if (briefData) next(snapshot(reference.path, briefData));
        else {
          listener.active = false;
          error({ code: 'permission-denied' });
        }
      }, 25);
    }
    return () => { listener.active = false; };
  });
  sdk.call.mockReset().mockImplementation(async (name) => {
    switch (name) {
      case 'resumeSession':
        memberReadUnavailableUntilResume = false;
        actor = { ...actor, connectionGeneration: (actor.connectionGeneration ?? 1) + 1 };
        return { data: { session: projectedSession(), player: actor } };
      case 'getCurrentMemberSession':
        if (memberReadUnavailableUntilResume) {
          throw Object.assign(new Error('Fixture member read unavailable.'), { code: 'functions/unavailable' });
        }
        return { data: { type: 'current-member-session', sessionId, actorUid: actor.uid, groupId: 'fleet-1',
          connectionGeneration: actor.connectionGeneration, assignedRoleId: actor.assignedRoleId,
          activeConsoleRoleId: actor.activeConsoleRoleId, session: projectedSession() } };
      case 'listGmInstances':
        return { data: { instances: claimVisible && isLiveSetupGm({
          id: originalClaim.id, uid: actor.uid, connected: true, lastSeenAt: leaseSeenAt,
        }) ? [originalClaim] : [] } };
      case 'refreshPresence':
        leaseSeenAt = new Date().toISOString();
        return { data: { sessionId } };
      default: throw new Error(`Unexpected callable ${name}`);
    }
  });
});

afterEach(async () => {
  if (unmount) act(unmount);
  unmount = undefined;
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
});

describe('role-brief audience and presence recovery', () => {
  it('keeps the original GM claim live through Cycle 0 to 1 without a denied own brief reconnect loop', async () => {
    await mount('gm');
    act(() => publishSession({ phase: 'active', currentTurn: 1, updatedAt: new Date(Date.now() + 1).toISOString() }));
    await advance(50_000);

    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
      session: { id: sessionId, phase: 'active', currentTurn: 1 }, me: { uid: actor.uid, role: 'gm' },
      gmInstance: { id: originalClaim.id } });
    expect(callCount('resumeSession')).toBe(1);
    expect(callCount('refreshPresence')).toBe(5);
    expect(sdk.call.mock.calls.filter(call => call[0] === 'refreshPresence').every(call =>
      call[1].sessionId === sessionId && call[1].instanceId === originalClaim.id)).toBe(true);
    expect(listeners.filter(listener => listener.path === briefPath())).toHaveLength(0);
    expect(callCount('claimGmInstance')).toBe(0);
  });

  it('keeps an admitted unassigned demo controller live at the crew manager', async () => {
    await mount('player');
    await advance(20_000);

    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
      me: { uid: actor.uid, role: 'player', assignedRoleId: null, replacementRoleId: null }, roleBrief: null });
    expect(window.location.hash).toBe('#/demo-actors');
    expect(callCount('resumeSession')).toBe(1);
    expect(callCount('refreshPresence')).toBe(2);
    expect(listeners.filter(listener => listener.path === briefPath())).toHaveLength(0);
  });

  it.each([
    ['assigned', 'player', 'admiral', undefined], ['replacement', 'player', undefined, 'commissar'],
    ['assigned', 'gm', 'admiral', undefined], ['replacement', 'gm', undefined, 'commissar'],
  ] as const)('hydrates the %s %s brief and fails closed on its denied reader', async (_label, role, assignment, replacement) => {
    await mount(role, assignment, replacement);
    expect(useSessionStore.getState().roleBrief).toMatchObject({ assignmentUid: actor.uid,
      roleId: replacement ?? assignment });
    const listener = activeListeners(briefPath()).at(-1)!;
    act(() => listener.error({ code: 'permission-denied' }));
    expect(useSessionStore.getState()).toMatchObject({ roleBrief: null, connection: 'offline', sessionSnapshotFreshness: 'cache' });
    const before = callCount('setGmControlsLocked');
    await expect(setGmControlsLocked(true)).rejects.toThrow();
    expect(callCount('setGmControlsLocked')).toBe(before);
  });

  it.each(['unassigned', 'awaiting-re-role'] as const)(
    'clears an assigned private brief on becoming %s and rejects retired private callbacks', async (transition) => {
      await mount('player', 'admiral');
      const oldListener = activeListeners(briefPath()).at(-1)!;
      expect(useSessionStore.getState().roleBrief?.roleId).toBe('admiral');
      const next: Player = { ...actor, role: 'player',
        assignedRoleId: null, replacementRoleId: null,
        replacementStatus: transition === 'awaiting-re-role' ? 'awaiting-re-role' : null,
        activeConsoleRoleId: null, seatId: null };
      briefData = null;
      act(() => publishActor(next));
      expect(useSessionStore.getState().roleBrief).toBeNull();
      await advance(100);
      expect(activeListeners(briefPath())).toHaveLength(0);
      act(() => oldListener.next(snapshot(oldListener.path, assignedBrief('admiral'))));
      expect(useSessionStore.getState().roleBrief).toBeNull();
    },
  );

  it('preserves a Rules-authorized own brief when a GM retains the matching assignment', async () => {
    await mount('player', 'admiral');
    act(() => publishActor({ ...actor, role: 'gm' }));
    await advance(100);
    expect(useSessionStore.getState().roleBrief).toMatchObject({ roleId: 'admiral', assignmentUid: actor.uid });
    expect(activeListeners(briefPath())).toHaveLength(1);
  });

  it('recovers once after a genuine assigned-to-unassigned brief denial and stays live without that reader', async () => {
    await mount('player', 'shepherd-scientist');
    const oldListener = activeListeners(briefPath()).at(-1)!;
    briefData = null;
    // A healthy member feed may confirm the changed actor before the retry
    // tick. A transient feed outage until the next ordinary resume makes that
    // recovery path necessary, including serialized same-tick feed retries.
    memberReadUnavailableUntilResume = true;
    act(() => publishActor({ ...actor, assignedRoleId: null, activeConsoleRoleId: null, seatId: null }));
    expect(useSessionStore.getState()).toMatchObject({ roleBrief: null, connection: 'offline', sessionSnapshotFreshness: 'cache' });
    await advance(10_000);

    expect(useSessionStore.getState()).toMatchObject({ roleBrief: null, connection: 'live', sessionSnapshotFreshness: 'server',
      me: { uid: actor.uid, assignedRoleId: null } });
    expect(callCount('resumeSession')).toBe(2);
    expect(callCount('refreshPresence')).toBe(1);
    expect(activeListeners(briefPath())).toHaveLength(0);
    act(() => oldListener.next(snapshot(oldListener.path, assignedBrief('shepherd-scientist'))));
    expect(useSessionStore.getState().roleBrief).toBeNull();
  });

  it('accepts fresh member-feed recovery after assignment loss without an extra resume', async () => {
    await mount('player', 'shepherd-scientist');
    briefData = null;
    act(() => publishActor({ ...actor, assignedRoleId: null, activeConsoleRoleId: null, seatId: null }));
    expect(useSessionStore.getState()).toMatchObject({ roleBrief: null, connection: 'offline', sessionSnapshotFreshness: 'cache' });
    await advance(10_000);

    expect(useSessionStore.getState()).toMatchObject({ roleBrief: null, connection: 'live', sessionSnapshotFreshness: 'server',
      me: { uid: actor.uid, assignedRoleId: null } });
    expect(callCount('resumeSession')).toBe(1);
    expect(callCount('refreshPresence')).toBe(1);
    expect(activeListeners(briefPath())).toHaveLength(0);
  });

  it('binds a newly assigned controller brief from the current player projection', async () => {
    await mount('player');
    briefData = assignedBrief('shepherd-scientist');
    act(() => publishActor({ ...actor, assignedRoleId: 'shepherd-scientist' }));
    await advance(100);
    expect(useSessionStore.getState().roleBrief).toMatchObject({ roleId: 'shepherd-scientist', assignmentUid: actor.uid });
    expect(activeListeners(briefPath())).toHaveLength(1);
  });

  it('preserves real GM authority loss and never renews or elevates an offline claim', async () => {
    await mount('gm');
    claimVisible = false;
    await advance(5_000);
    expect(useSessionStore.getState().gmInstance).toBeNull();
    act(() => {
      useSessionStore.getState().setConnection('offline');
      useSessionStore.getState().setSessionSnapshotFreshness('cache');
    });
    await expect(setGmControlsLocked(true)).rejects.toThrow();
    expect(callCount('setGmControlsLocked')).toBe(0);
    expect(callCount('claimGmInstance')).toBe(0);
  });
});
