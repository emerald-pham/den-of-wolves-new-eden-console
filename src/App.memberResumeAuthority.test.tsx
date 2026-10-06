import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession, Player } from '@/types/game';
import type { useSessionStore as SessionStore } from '@/store/useSessionStore';
import type { sessionFrom as ParseSession } from '@/lib/firestore';
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

// App, immutable demo identity, normal Auth/resume, Firestore member callbacks,
// Zustand and the whole production fighter launch panel/controller are real.
// Only SDK transport and unrelated visual/gameplay leaves are substituted.
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/ShipPlot', () => ({ default: () => null }));
vi.mock('@/components/WolfHackingRuntime', () => ({ default: () => null }));
vi.mock('@/components/TurnPhaseCoordinator', () => ({ default: () => null }));
vi.mock('@/components/TurnStartAnnouncement', () => ({ default: () => null }));
vi.mock('@/components/CrisisReportPanel', () => ({ default: () => null }));
vi.mock('@/components/FleetGroupWorkspace', () => ({ default: () => null }));
vi.mock('@/routes/SessionMode', () => ({ default: () => <main>Stations</main> }));
vi.mock('@/routes/RoleSelect', () => ({ default: () => <main>Stations</main> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
}
function snapshot(path: string, data: Record<string, unknown> | null) {
  return { id: path.split('/').at(-1), metadata: { fromCache: false },
    exists: () => data !== null, data: () => data, get: (field: string) => data?.[field] };
}
interface Listener {
  readonly path: string;
  readonly next: (value: ReturnType<typeof snapshot>) => void;
  readonly error: (value: { code: string }) => void;
  active: boolean;
}
type ResumeReply = { data: { session: GameSession; player: Player } };
let serial = 0;
let sessionId: string;
let actor: Player;
let sessionData: Record<string, unknown>;
let listeners: Listener[];
let resumes: [ReturnType<typeof deferred<ResumeReply>>, ReturnType<typeof deferred<ResumeReply>>, ReturnType<typeof deferred<ResumeReply>>];
let useSessionStore: typeof SessionStore;
let sessionFrom: typeof ParseSession;
let service: typeof SessionService;
let unmount: (() => void) | undefined;
let legacy: boolean;
const rootPath = () => `sessions/${sessionId}`;
const actorPath = () => `${rootPath()}/players/${actor.uid}`;
const callCount = (name: string) => sdk.call.mock.calls.filter(call => call[0] === name).length;
const currentSession = () => sessionFrom(sessionId, { ...sessionData,
  ...(actor.role === 'player' ? { memberSessionScope: { groupId: actor.fleetGroupId, vesselIds: ['aegis'], craftIds: [] } } : {}),
});
const memberReply = () => ({ data: { type: 'current-member-session', sessionId, actorUid: actor.uid,
  groupId: actor.fleetGroupId, connectionGeneration: actor.connectionGeneration,
  assignedRoleId: actor.assignedRoleId, activeConsoleRoleId: actor.activeConsoleRoleId, session: currentSession(),
  ...(!legacy ? { currentActorBerthAuthority: actor.assignedRoleId ? {
    sessionId, actorUid: actor.uid, groupId: actor.fleetGroupId, role: actor.role,
    connectionGeneration: actor.connectionGeneration, assignedRoleId: actor.assignedRoleId,
    activeConsoleRoleId: actor.activeConsoleRoleId, replacementRoleId: actor.replacementRoleId ?? null,
    replacementStatus: actor.replacementStatus ?? null, shipId: 'aegis',
  } : null } : {}),
} });
const audience = () => ({
  type: 'wolf-attack-member-view', schemaVersion: 1, sessionId, attackId: 'original-wolf', turn: 1, revision: 1,
  status: 'declared', phase: 'active', currentStep: 'targeting', range: null,
  deadlineAt: '2026-10-06T07:05:00.000Z', serverTime: '2026-10-06T07:00:00.000Z', visibility: 'members',
  redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'], results: [],
});
const launch = (wingId: string) => ({
  type: 'aegis-fighter-wing-launch-view', sessionId, wingId, turn: 1, attackId: 'original-wolf', revision: 1,
  wingRevision: 0, fighters: 4, launched: false, eligible: true,
});

async function advance(ms = 100) {
  // Native React/SDK delivery only, never a game clock or proof deadline.
  for (let remaining = ms; remaining > 0; remaining -= 100) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(100, remaining)); });
  }
}
function publishPlayer(value: Player = actor) {
  if (value === actor && actor.replacementStatus === 'awaiting-re-role') {
    // index.ts replacement withdrawal and playerFrom both clear these three
    // station fields; an awaiting actor never keeps a held replacement berth.
    actor = { ...actor, activeConsoleRoleId: null, replacementRoleId: null, seatId: null };
    value = actor;
  }
  const reader = listeners.filter(listener => listener.active && listener.path === actorPath()).at(-1);
  expect(reader).toBeDefined();
  act(() => reader!.next(snapshot(actorPath(), { ...value })));
}
function commitResume(): ResumeReply {
  // Coupled to resumeSession's actual transaction and reply construction:
  // index.ts advances the lease before SDK delivery, omits connected, and
  // reads the member session separately after the player transaction.
  actor = { ...actor, connected: true, connectionGeneration: (actor.connectionGeneration ?? 0) + 1 };
  sessionData = { ...sessionData, updatedAt: new Date(Date.now() + actor.connectionGeneration!).toISOString() };
  const player = { ...actor };
  delete player.connected;
  return { data: { session: currentSession(), player } };
}
async function deliverResume(index: number, reply = commitResume()) {
  const pending = resumes[index];
  if (!pending) throw new Error('Unexpected fixture resume index.');
  pending.resolve(reply);
  await advance(300);
}
async function reconnect() {
  // The real App online listener calls its existing automatic connect path.
  act(() => window.dispatchEvent(new Event('online')));
  await advance();
}
function expectReadOnly() {
  expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
  expect(useSessionStore.getState().connection).not.toBe('live');
  // The real panel legitimately removes its buttons while authority waits.
  screen.queryAllByRole('button', { name: 'Launch Fighter Wing Alpha' })
    .forEach(button => expect(button).toBeDisabled());
}

async function mount(options: { press?: boolean; gm?: boolean; legacy?: boolean; closed?: boolean } = {}) {
  const roleId = options.press ? 'press-officer' : 'wing-commander';
  window.history.replaceState({}, '', options.gm || options.legacy ? '/#/console'
    : `/?demoActor=${sessionId}~${roleId}&demoJoin=123456#/demo-actors`);
  ({ useSessionStore } = await import('@/store/useSessionStore'));
  ({ sessionFrom } = await import('@/lib/firestore'));
  service = await import('@/lib/sessionService');
  const { SESSION_STORAGE_KEY } = await import('@/store/useSessionStore');
  const context = await import('@/lib/demoActorContext');
  legacy = options.legacy === true;
  if (legacy) delete sessionData.fullGameDemo;
  if (options.closed) sessionData.phase = 'closed';
  actor = { ...actor, role: options.gm ? 'gm' : 'player',
    assignedRoleId: options.gm || options.press ? null : roleId,
    seatId: options.gm || options.press ? null : roleId,
    activeConsoleRoleId: options.gm ? null : roleId };
  if (context.activeDemoActorProfile) {
    context.rememberDemoActorAccount(context.activeDemoActorProfile, actor.uid);
    localStorage.setItem(context.demoActorRosterStorageKey(sessionId), JSON.stringify([
      { sessionId, roleId, uid: actor.uid, label: 'Original actor' },
    ]));
  }
  localStorage.setItem(context.demoActorSessionStorageKey(SESSION_STORAGE_KEY), JSON.stringify({ version: 1,
    state: { session: currentSession(), me: actor, mode: 'console', pendingCommands: [], lastRoute: '/console' } }));
  await useSessionStore.persist.rehydrate();
  sdk.listen.mockImplementation((reference, _options, next, error) => {
    const denyPrivateBrief = () => {
      // Rules isMember/isAssignedRoleBrief revoke this independent private
      // reader as well. Deliver its actual permission error, rather than
      // inventing a synchronous player-to-brief clearing requirement in App.
      listeners.filter(reader => reader.active && reader.path === `${rootPath()}/roleBriefs/${actor.uid}`)
        .forEach(reader => reader.error({ code: 'permission-denied' }));
    };
    const listener: Listener = { path: reference.path, active: true,
      next: value => {
        next(value);
        if (reference.path === actorPath() && (!value.exists() || value.get('connected') === false)) denyPrivateBrief();
      },
      error: cause => {
        error(cause);
        if (reference.path === actorPath() && ['permission-denied', 'not-found'].includes(cause.code)) denyPrivateBrief();
      },
    };
    listeners.push(listener);
    const data = reference.path === actorPath() ? { ...actor }
      : reference.path === rootPath() && actor.role === 'gm' ? sessionData
      : reference.path === `${rootPath()}/wolfAttackAudience/current` ? audience()
      : reference.path === `${rootPath()}/roleBriefs/${actor.uid}` && actor.assignedRoleId ? {
        type: 'role-brief', sessionId, assignmentUid: actor.uid, visibleToUids: [actor.uid],
        roleId: actor.assignedRoleId, roleName: 'Wing Commander', vesselName: 'AEGIS',
        text: 'Original private briefing.', commonRules: 'Fixture common rules.', setupRevision: 1,
      } : undefined;
    if (data) setTimeout(() => { if (listener.active) next(snapshot(reference.path, data)); }, 0);
    return () => { listener.active = false; };
  });
  sdk.call.mockImplementation(async (name, data) => {
    if (name === 'resumeSession') {
      const pending = resumes[callCount('resumeSession') - 1];
      if (!pending) throw new Error('Unexpected extra normal resume request.');
      return pending.promise;
    }
    if (name === 'getCurrentMemberSession') {
      if (sdk.auth.currentUser?.uid !== actor.uid || data.sessionId !== sessionId) {
        throw Object.assign(new Error('Fixture Rules reject foreign Auth/session.'), { code: 'functions/permission-denied' });
      }
      return memberReply();
    }
    if (name === 'getAegisFighterWingLaunch') return { data: launch(data.wingId) };
    if (name === 'refreshPresence') return { data: { sessionId } };
    throw new Error(`Unexpected callable ${name}`);
  });
  const { default: App } = await import('./App');
  const { default: Panel } = await import('@/components/AegisFighterWingLaunchPanel');
  unmount = render(<><App /><Panel /></>).unmount;
  await advance();
  expect(callCount('resumeSession')).toBe(1);
  if (!options.gm) expect(callCount('getCurrentMemberSession')).toBe(0);
}
async function acceptedMember(options: Parameters<typeof mount>[0] = {}) {
  await mount(options); await deliverResume(0);
  expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
    identityHydrationRevision: 1, me: { uid: actor.uid, sessionId, connectionGeneration: 2 } });
  if (!options.press && !options.gm && !options.closed) {
    expect(screen.getByRole('button', { name: 'Launch Fighter Wing Alpha' })).toBeEnabled();
  }
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime('2026-10-06T07:00:00.000Z'); localStorage.clear();
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
  sessionId = `member-resume-${++serial}`; listeners = []; resumes = [deferred(), deferred(), deferred()]; legacy = false;
  sessionData = { name: 'Member resume fixture', joinCode: '123456', phase: 'active', currentTurn: 1,
    playerCount: 18, fullGameDemo: { status: 'active', progression: 'manual' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  actor = { uid: 'original-demo-uid', sessionId, displayName: 'Original actor', role: 'player', connected: true,
    fleetGroupId: 'fleet-1', connectionGeneration: 1, assignedRoleId: 'wing-commander', seatId: 'wing-commander',
    activeConsoleRoleId: 'wing-commander', replacementRoleId: null, replacementStatus: null, joinedAt: new Date().toISOString() };
  sdk.auth.currentUser = { uid: actor.uid }; sdk.auth.authStateReady.mockReset().mockResolvedValue(undefined);
  sdk.call.mockReset(); sdk.listen.mockReset(); sdk.read.mockReset().mockResolvedValue(snapshot(rootPath(), null));
  sdk.signIn.mockReset().mockRejectedValue(new Error('Original persona must never be replaced.'));
});
afterEach(async () => {
  if (unmount) act(unmount); unmount = undefined;
  resumes.forEach(pending => pending.resolve({ data: { session: currentSession(), player: actor } }));
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
});

describe('normal original member resume publication', () => {
  it('cannot republish old live authority or enable the real launch panel while the original SDK resume is pending', async () => {
    await acceptedMember(); await reconnect();
    expectReadOnly();
    publishPlayer(); await advance();
    expectReadOnly();
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1, me: { connectionGeneration: 2 } });
    expect(callCount('resumeSession')).toBe(2);
    expect(sdk.signIn).not.toHaveBeenCalled();
    await deliverResume(1);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
      identityHydrationRevision: 2, me: { uid: actor.uid, sessionId, connectionGeneration: 3 } });
    expect(screen.getByRole('button', { name: 'Launch Fighter Wing Alpha' })).toBeEnabled();
  });

  it('keeps the source transaction generation read-only before the matching original SDK identity arrives', async () => {
    await acceptedMember(); await reconnect();
    const reply = commitResume(); publishPlayer(); await advance();
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1, me: { connectionGeneration: 3 } });
    expectReadOnly();
    await deliverResume(1, reply);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', identityHydrationRevision: 2,
      me: { connectionGeneration: 3, connected: true } });
    expect(screen.getByRole('button', { name: 'Launch Fighter Wing Alpha' })).toBeEnabled();
  });

  it.each(['functions/unavailable', 'functions/cancelled'])('retains cache after %s and recovers through one existing normal retry', async code => {
    await acceptedMember(); await reconnect();
    resumes[1].reject(Object.assign(new Error('Original SDK did not accept a reply.'), { code })); await advance();
    publishPlayer(); await advance(); expectReadOnly();
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    await advance(2_000);
    expect(callCount('resumeSession')).toBe(3);
    await deliverResume(2);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', identityHydrationRevision: 2,
      me: { connectionGeneration: 3 } });
    expect(screen.getByRole('button', { name: 'Launch Fighter Wing Alpha' })).toBeEnabled();
  });

  it.each(['foreign', 'missing'])('cannot accept an original SDK reply after current Auth becomes %s', async kind => {
    await acceptedMember(); await reconnect();
    sdk.auth.currentUser = kind === 'missing' ? null : { uid: 'foreign-auth' };
    await deliverResume(1);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { uid: 'original-demo-uid', sessionId, connectionGeneration: 2 } });
    expectReadOnly(); expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it.each(['uid', 'sid'])('rejects a foreign reply %s without replacing or releasing the original identity', async field => {
    await acceptedMember(); await reconnect(); const reply = commitResume();
    reply.data.player = { ...reply.data.player, ...(field === 'uid' ? { uid: 'foreign-reply' } : { sessionId: 'foreign-session' }) };
    await deliverResume(1, reply);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { uid: 'original-demo-uid', sessionId, connectionGeneration: 2 } });
    publishPlayer({ ...actor, connectionGeneration: 2 }); await advance(); expectReadOnly();
  });

  it('cannot apply an old reply into a different displayed session', async () => {
    await acceptedMember(); await reconnect(); const reply = commitResume();
    act(() => useSessionStore.getState().setSession({ ...currentSession(), id: 'foreign-session' }));
    await deliverResume(1, reply);
    expect(useSessionStore.getState()).toMatchObject({ session: { id: 'foreign-session' }, identityHydrationRevision: 1,
      me: { uid: actor.uid, sessionId, connectionGeneration: 2 } });
    expectReadOnly();
  });

  it('does not let an older overlapping reply apply or clear the newer original pending token', async () => {
    await acceptedMember(); await reconnect(); const older = commitResume();
    const newer = service.resumeSession(sessionId); await advance();
    expect(callCount('resumeSession')).toBe(3);
    resumes[1].resolve(older); await advance();
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1, me: { connectionGeneration: 2 } });
    publishPlayer({ ...actor, connectionGeneration: 2 }); await advance(); expectReadOnly();
    await deliverResume(2); await expect(newer).resolves.toBe(true);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 2, me: { connectionGeneration: 4 } });
  });

  it('rejects an older transaction lease even when its later separate session read matches the newest accepted projection', async () => {
    await acceptedMember(); await reconnect(); const older = commitResume();
    const newer = service.resumeSession(sessionId); await advance();
    await deliverResume(2); await expect(newer).resolves.toBe(true);
    // Real Functions reply construction reads this session separately after
    // its transaction but preserves its own resumeResult generation.
    older.data.session = currentSession();
    resumes[1].resolve(older); await advance();
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 2,
      connection: 'live', me: { connectionGeneration: 4 } });
  });

  it('cannot restore its transaction lease after the real current player source reports a newer lease', async () => {
    await acceptedMember(); await reconnect(); const older = commitResume();
    commitResume(); publishPlayer(); await advance();
    expect(useSessionStore.getState().me?.connectionGeneration).toBe(4);
    older.data.session = currentSession();
    await deliverResume(1, older);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1, me: { connectionGeneration: 4 } });
    expectReadOnly();
  });

  it.each(['disconnected', 'missing', 'permission-denied', 'not-found'])('preserves immediate genuine %s source withdrawal while a resume is pending', async kind => {
    await acceptedMember(); await reconnect();
    const reader = listeners.filter(listener => listener.active && listener.path === actorPath()).at(-1)!;
    act(() => {
      if (kind === 'disconnected') reader.next(snapshot(actorPath(), { ...actor, connected: false }));
      else if (kind === 'missing') reader.next(snapshot(actorPath(), null));
      else reader.error({ code: kind });
    });
    expectReadOnly();
    expect(useSessionStore.getState().roleBrief).toBeNull();
    expect(useSessionStore.getState().session?.currentActorBerthAuthority).toBeNull();
    await deliverResume(1);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1, me: { connected: false } });
    expectReadOnly();
  });

  it.each(['group', 'assignment', 'replacement'])('cannot resurrect old private authority after genuine current %s replacement', async kind => {
    await acceptedMember(); await reconnect(); const reply = commitResume();
    actor = { ...actor, ...(kind === 'group' ? { fleetGroupId: 'fleet-2' }
      : kind === 'assignment' ? { assignedRoleId: 'executive-officer', activeConsoleRoleId: null, seatId: null }
      : { replacementRoleId: 'wolf-commander', replacementStatus: 'awaiting-re-role' as const }) };
    publishPlayer(); await advance();
    await deliverResume(1, reply);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    expect(useSessionStore.getState().me).toMatchObject(actor);
    expectReadOnly();
  });

  it.each([{ press: true }, { legacy: true }])('fences ordinary Press/legacy members without inventing a primary berth: %j', async options => {
    await acceptedMember(options); await reconnect(); publishPlayer(); await advance(); expectReadOnly();
    await deliverResume(1);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', identityHydrationRevision: 2 });
    if (options.press) expect(useSessionStore.getState().me).toMatchObject({ assignedRoleId: null, seatId: null, activeConsoleRoleId: 'press-officer' });
    if (options.legacy) expect(Object.hasOwn(useSessionStore.getState().session!, 'currentActorBerthAuthority')).toBe(false);
  });

  it('preserves the existing GM root live callback while its normal resume is pending', async () => {
    await acceptedMember({ gm: true }); await reconnect();
    const root = listeners.filter(listener => listener.active && listener.path === rootPath()).at(-1)!;
    act(() => root.next(snapshot(rootPath(), { ...sessionData, updatedAt: new Date(Date.now() + 1).toISOString() })));
    await advance();
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
      identityHydrationRevision: 1, me: { role: 'gm', connectionGeneration: 2 } });
    expect(callCount('getCurrentMemberSession')).toBe(0);
    await deliverResume(1);
  });

  it('retains completed member authority and cold-start normal hydration without extra resume calls', async () => {
    await acceptedMember(); publishPlayer(); await advance(2_100);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', identityHydrationRevision: 1,
      me: { uid: actor.uid, sessionId, connectionGeneration: 2 } });
    expect(callCount('resumeSession')).toBe(1); expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it('keeps closed history free of operational player callbacks', async () => {
    await mount({ closed: true });
    expect(listeners).toHaveLength(0); expect(callCount('getCurrentMemberSession')).toBe(0);
    await deliverResume(0);
    expect(useSessionStore.getState().session?.phase).toBe('closed');
    expect(callCount('resumeSession')).toBe(1);
  });
});
