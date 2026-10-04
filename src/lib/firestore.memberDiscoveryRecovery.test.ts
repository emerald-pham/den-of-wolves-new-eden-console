import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PlayerDiscoveryProjection } from '@/types/game';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), connectFirestoreEmulator: vi.fn(), doc: vi.fn(), getDocFromServer: vi.fn(),
  getFirestore: vi.fn(), onSnapshot: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), query: vi.fn(), where: vi.fn(),
  Timestamp: class { toDate() { return new Date(0); } },
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ app: vi.fn(), functions: vi.fn() }));
vi.mock('./firebaseConfig', () => ({ emulatorPorts: { firestore: 8080 }, useEmulators: false }));

const { subscribeSessionState } = await import('./firestore');
const { doc, onSnapshot } = await import('firebase/firestore');
const { httpsCallable } = await import('firebase/functions');
const subscriptions = new Map<string, { next: (snapshot: unknown) => void; error?: (error: unknown) => void }>();
let stop: (() => void) | undefined;
const actor = { connected: true, role: 'player', fleetGroupId: 'fleet-1', connectionGeneration: 2,
  assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer',
  displayName: 'EO', joinedAt: '2026-10-04T12:00:00.000Z' };
const discovery = { groupId: 'fleet-1', fleetGroupVesselIds: ['aegis'], shipId: 'aegis', currentCoordinate: '0000',
  knownCoordinates: ['0000'], knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 3,
  candidateReveals: [] };

beforeEach(() => {
  subscriptions.clear();
  vi.mocked(doc).mockImplementation(((_db: unknown, path: string) => ({ path })) as never);
  vi.mocked(onSnapshot).mockImplementation(((reference: { path?: string }, _options: unknown,
    next: (snapshot: unknown) => void, error?: (error: unknown) => void) => {
    if (reference?.path) subscriptions.set(reference.path, { next, error });
    return vi.fn();
  }) as never);
});
afterEach(() => { stop?.(); stop = undefined; });

function publish(path: string, data: Record<string, unknown>, fromCache = false, exists = true) {
  subscriptions.get(`sessions/recovery/${path}`)!.next({ exists: () => exists, metadata: { fromCache },
    data: () => data, get: (key: string) => data[key] });
}

function begin() {
  let resolve!: (value: unknown) => void;
  const pending = new Promise(done => { resolve = done; });
  const reply = { data: { type: 'current-member-session', sessionId: 'recovery', actorUid: 'eo', groupId: 'fleet-1',
    connectionGeneration: 2, assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer',
    session: { name: 'Recovery', joinCode: 'ABCD', ownerUid: 'gm', phase: 'active', currentTurn: 1,
      createdAt: '2026-10-04T12:00:00.000Z', updatedAt: '2026-10-04T12:01:00.000Z',
      memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [] }, shuttleDockings: [], shuttleVisitLog: [] } } };
  const call = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(reply);
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  const events: string[] = [];
  let waiting: PlayerDiscoveryProjection | null | undefined;
  let visible: PlayerDiscoveryProjection | null | undefined;
  let fresh = false;
  const onDiscovery = vi.fn((next: PlayerDiscoveryProjection | null) => {
    events.push('discovery'); waiting = next; if (fresh) visible = next;
  });
  const onSession = vi.fn();
  stop = subscribeSessionState('recovery', 'eo', { sessionReadAudience: 'member', onSession,
    onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(), onPlayerDiscovery: onDiscovery,
    onSessionFreshness: next => {
      events.push(next ? 'server' : 'stale'); fresh = next;
      // The App withdraws an unconfirmed pending projection on authority loss.
      if (!next) { waiting = undefined; visible = undefined; }
      else if (waiting !== undefined) visible = waiting;
    },
  });
  return { resolve: () => resolve(reply), onDiscovery, onSession, events, visible: () => visible };
}

it('delivers fresh discovery after the resumed actor and member session are confirmed, regardless of snapshot order', async () => {
  const feed = begin();
  publish('playerDiscoveries/eo', discovery);
  expect(feed.onDiscovery).not.toHaveBeenCalled();
  publish('players/eo', actor);
  expect(feed.onDiscovery).not.toHaveBeenCalled();
  feed.resolve();
  await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  expect(feed.visible()).toMatchObject({ shipId: 'aegis', revision: 3 });
  expect(feed.events.at(-1)).toBe('discovery');
  expect(feed.events.indexOf('server')).toBeLessThan(feed.events.indexOf('discovery'));
});

it.each(['disconnected', 'missing', 'kicked'] as const)('does not release waiting discovery after membership becomes %s', async kind => {
  const feed = begin();
  publish('players/eo', actor);
  publish('playerDiscoveries/eo', discovery);
  publish('players/eo', { ...actor, connected: kind !== 'disconnected', ...(kind === 'kicked' ? { kickedAt: 'now' } : {}) }, false, kind !== 'missing');
  feed.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(feed.onDiscovery.mock.calls.every(([projection]) => projection === null)).toBe(true);
  expect(feed.onSession).not.toHaveBeenCalled();
  expect(feed.visible()).toBeUndefined();
});

it('does not publish a waiting projection for a different group after server confirmation', async () => {
  const feed = begin();
  publish('players/eo', actor);
  publish('playerDiscoveries/eo', { ...discovery, groupId: 'fleet-2' });
  feed.resolve();
  await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  expect(feed.onDiscovery.mock.calls.every(([projection]) => projection === null)).toBe(true);
});

it('does not release cached discovery as current authority after member confirmation', async () => {
  const feed = begin();
  publish('players/eo', actor);
  publish('playerDiscoveries/eo', discovery, true);
  feed.resolve();
  await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  expect(feed.onDiscovery.mock.calls.every(([projection]) => projection === null)).toBe(true);
  publish('playerDiscoveries/eo', discovery);
  expect(feed.visible()).toMatchObject({ shipId: 'aegis', revision: 3 });
});
