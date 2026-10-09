import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { legacyFailedKProjectionFixture } from '../../tests/fixtures/legacyFailedKProjection';
import { useSessionStore } from '@/store/useSessionStore';

type Data = Record<string, unknown>;
type Reference = { path: string; constraints?: readonly Data[] };
type Listener = { reference: Reference; next: (snapshot: unknown) => void; stop: ReturnType<typeof vi.fn> };
const mock = vi.hoisted(() => ({ listeners: [] as Listener[], uid: 'alice',
  database: { fixture: 'SDK-free controlled database' }, memberReply: {} as Data }));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => mock.database), connectFirestoreEmulator: vi.fn(),
  collection: (_db: unknown, path: string) => ({ path }), doc: (_db: unknown, path: string) => ({ path }),
  where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
  query: (reference: Reference, ...constraints: Data[]) => ({ ...reference, constraints }),
  orderBy: vi.fn(), limit: vi.fn(), getDocFromServer: vi.fn(),
  onSnapshot: vi.fn((reference: Reference, optionsOrNext: unknown, next?: unknown) => {
    const listener = { reference, next: (typeof optionsOrNext === 'function' ? optionsOrNext : next) as Listener['next'], stop: vi.fn() };
    mock.listeners.push(listener);
    return listener.stop;
  }),
  Timestamp: class { toDate() { return new Date('2026-10-08T12:00:00.000Z'); } },
}));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_auth: unknown, next: (user: { uid: string }) => void) => {
  next({ uid: mock.uid }); return vi.fn();
} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: mock.memberReply }) }));
vi.mock('./firebase', () => ({ app: () => ({ name: 'controlled-app' }),
  auth: () => ({ currentUser: { uid: mock.uid } }), functions: () => ({}) }));
vi.mock('./firebaseConfig', () => ({ emulatorPorts: { firestore: 8080 }, useEmulators: false }));

import { sessionFrom, subscribeSessionState } from './firestore';
import { subscribeToOwnAwayMissionLifecycles } from './awayMissionLifecycleService';

const stops: Array<() => void> = [];
beforeEach(() => {
  mock.listeners.length = 0;
  mock.uid = 'alice';
  sessionStorage.clear();
});
afterEach(() => { stops.splice(0).forEach(stop => stop()); useSessionStore.setState({ session: null, me: null }); });

it.each(['global member feed', 'standalone mission workspace'] as const)(
  'requires a held/fresh-memory barrier before the actual %s constructs any owner pointer listener', construction => {
    prepareMember('held');
    stops.push(start(construction));
    expect(mock.listeners.filter(listener => listener.reference.path.includes('/awayMissionHandPointers'))).toEqual([]);
  });

it.each(['global member feed', 'standalone mission workspace'] as const)(
  'requires a fresh page before the actual %s attaches owner pointers after server readiness', construction => {
    // Ready server storage is insufficient in this retained, pre-cutover page.
    prepareMember('ready');
    stops.push(start(construction));
    expect(mock.listeners.filter(listener => listener.reference.path.includes('/awayMissionHandPointers'))).toEqual([]);
  });

it.each(['global member feed', 'standalone mission workspace'] as const)(
  'does not attach an owner pointer listener without a safety marker in the actual %s', construction => {
    prepareMember(undefined);
    stops.push(start(construction));
    expect(mock.listeners.filter(listener => listener.reference.path.includes('/awayMissionHandPointers'))).toEqual([]);
  });

it.each(['global member feed', 'standalone mission workspace'] as const)(
  'does not let an accepted legacy K pointer attach an owner hand before cutover in the actual %s', construction => {
    prepareMember('held');
    const fixture = legacyFailedKProjectionFixture('s1');
    expect(fixture.record.outcomes?.[0]).toMatchObject({ contributorCount: 1, difficulty: 30, criticalThreshold: 40, outcome: 'failure' });
    stops.push(start(construction));
    const pointer = fixture.pointers[0]!;
    for (const listener of [...mock.listeners]) {
      if (listener.reference.path === 'sessions/s1/awayMissionHandPointers') listener.next({
        metadata: { fromCache: false, hasPendingWrites: false },
        docs: [{ id: pointer.handId, data: () => pointer }],
      });
    }
    expect(mock.listeners.filter(listener => listener.reference.path.includes('/awayMissionHands/'))).toEqual([]);
  });

function start(construction: 'global member feed' | 'standalone mission workspace') {
  return construction === 'standalone mission workspace'
    ? subscribeToOwnAwayMissionLifecycles('s1', 'alice', vi.fn())
    : subscribeSessionState('s1', 'alice', {
      sessionReadAudience: 'member', initialMemberActor: () => useSessionStore.getState().me,
      onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
      onAwayMissionHandPointers: vi.fn(), onAwayMissionHands: vi.fn(),
    });
}

function prepareMember(state: 'held' | 'ready' | undefined) {
  const marker = state ? { policyVersion: 1, epoch: 3, state } : undefined;
  const session = { ...sessionFrom('s1', { name: 'Controlled table', phase: 'active', currentTurn: 2, playerCount: 8,
    createdAt: '2026-10-08T12:00:00.000Z', updatedAt: '2026-10-08T12:00:00.000Z' }),
    ...(marker ? { awayMissionProjectionSafety: marker } : {}) };
  const me = { uid: 'alice', sessionId: 's1', role: 'player' as const, connected: true, displayName: 'Alice',
    fleetGroupId: 'fleet-1', connectionGeneration: 4, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander' };
  useSessionStore.setState({ session, me, connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1 });
  mock.memberReply = { type: 'current-member-session', sessionId: 's1', actorUid: 'alice',
    groupId: 'fleet-1', connectionGeneration: 4, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', session };
}
