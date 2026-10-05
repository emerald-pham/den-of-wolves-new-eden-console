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
type Listener = { next: (snapshot: unknown) => void; active: boolean };
const listeners = new Map<string, Listener[]>();
const actor = { connected: true, role: 'player', fleetGroupId: 'fleet-1', connectionGeneration: 2,
  assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner',
  displayName: 'Miner', joinedAt: '2026-10-05T12:00:00.000Z' };
const discovery = { groupId: 'fleet-1', fleetGroupVesselIds: ['icebreaker'], shipId: 'icebreaker',
  currentCoordinate: '0000', knownCoordinates: ['0000'], knownSystems: {}, pursuitDistance: 0,
  navigationLogs: [], revision: 3, candidateReveals: [] };
let stop: (() => void) | undefined;

beforeEach(() => {
  listeners.clear();
  vi.mocked(doc).mockImplementation(((_db: unknown, path: string) => ({ path })) as never);
  vi.mocked(onSnapshot).mockImplementation(((reference: { path?: string }, _options: unknown,
    next: (snapshot: unknown) => void) => {
    const listener = { next, active: true };
    if (reference?.path) {
      const existing = listeners.get(reference.path) ?? [];
      listeners.set(reference.path, [...existing, listener]);
    }
    return () => { listener.active = false; };
  }) as never);
});
afterEach(() => { stop?.(); stop = undefined; });

function snapshot(data: Record<string, unknown>, fromCache = false) {
  return { exists: () => true, metadata: { fromCache }, data: () => data,
    get: (key: string) => data[key] };
}
function callbacks(path: string) {
  return listeners.get(`sessions/rebind/${path}`) ?? [];
}
function publish(path: string, data: Record<string, unknown>, fromCache = false) {
  callbacks(path).filter(listener => listener.active).forEach(listener => listener.next(snapshot(data, fromCache)));
}

function begin() {
  let generation = 2;
  const read = vi.fn(async (payload: { readonly sessionId: string }) => ({ data: {
    type: 'current-member-session', sessionId: payload.sessionId, actorUid: 'miner', groupId: 'fleet-1',
    connectionGeneration: generation, assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner',
    session: { name: 'Rebind', joinCode: 'ABCD', ownerUid: 'gm', phase: 'active', currentTurn: 1,
      createdAt: '2026-10-05T12:00:00.000Z', updatedAt: '2026-10-05T12:01:00.000Z',
      memberSessionScope: { groupId: 'fleet-1', vesselIds: ['icebreaker'], craftIds: ['highwall'] },
      shuttleDockings: [], shuttleVisitLog: [] },
  } }));
  vi.mocked(httpsCallable).mockReturnValue(read as never);
  let fresh = false;
  let waiting: PlayerDiscoveryProjection | null | undefined;
  let visible: PlayerDiscoveryProjection | null | undefined;
  const onDiscovery = vi.fn((projection: PlayerDiscoveryProjection | null) => {
    waiting = projection;
    if (fresh) visible = projection;
  });
  stop = subscribeSessionState('rebind', 'miner', {
    sessionReadAudience: 'member', onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(),
    onSeats: vi.fn(), onError: vi.fn(), onPlayerDiscovery: onDiscovery,
    onSessionFreshness: next => {
      fresh = next;
      if (!next) { waiting = undefined; visible = undefined; }
      else if (waiting !== undefined) visible = waiting;
    },
  });
  return { read, onDiscovery, visible: () => visible,
    reconnect: () => { generation = 3; publish('players/miner', { ...actor, connectionGeneration: 3 }); } };
}

async function originalProjection() {
  const feed = begin();
  publish('players/miner', actor);
  publish('playerDiscoveries/miner', discovery);
  await vi.waitFor(() => expect(feed.visible()).toMatchObject({ shipId: 'icebreaker', revision: 3 }));
  return feed;
}

it('rebinds the same-UID discovery reader after a new connection generation even when discovery bytes did not change', async () => {
  const feed = await originalProjection();
  feed.reconnect();
  await vi.waitFor(() => expect(callbacks('playerDiscoveries/miner')).toHaveLength(2));
  expect(callbacks('playerDiscoveries/miner')[0]!.active).toBe(false);
  expect(feed.visible()).toBeUndefined();
  publish('playerDiscoveries/miner', discovery);
  await vi.waitFor(() => expect(feed.visible()).toMatchObject({ shipId: 'icebreaker', revision: 3 }));
  expect(feed.read.mock.calls.every(([payload]) => payload.sessionId === 'rebind')).toBe(true);
});

it('rejects late discovery callbacks from the retired connection while the new reader waits for fresh authority', async () => {
  const feed = await originalProjection();
  const retired = callbacks('playerDiscoveries/miner')[0]!;
  feed.reconnect();
  await vi.waitFor(() => expect(callbacks('playerDiscoveries/miner')).toHaveLength(2));
  await vi.waitFor(() => expect(feed.read.mock.calls.length).toBeGreaterThan(1));
  const priorCalls = feed.onDiscovery.mock.calls.length;
  retired.next(snapshot({ ...discovery, revision: 999 }));
  expect(feed.onDiscovery).toHaveBeenCalledTimes(priorCalls);
  expect(feed.visible()).toBeUndefined();
  publish('playerDiscoveries/miner', discovery);
  await vi.waitFor(() => expect(feed.visible()).toMatchObject({ revision: 3 }));
});

it('keeps cache and foreign-group projections unavailable after reconnect until the new own reader is server authorized', async () => {
  const feed = await originalProjection();
  feed.reconnect();
  await vi.waitFor(() => expect(callbacks('playerDiscoveries/miner')).toHaveLength(2));
  publish('playerDiscoveries/miner', discovery, true);
  expect(feed.visible()).not.toMatchObject({ revision: 3 });
  publish('playerDiscoveries/miner', { ...discovery, groupId: 'fleet-2', revision: 999 });
  await vi.waitFor(() => expect(feed.read.mock.calls.length).toBeGreaterThan(1));
  expect(feed.visible()).not.toMatchObject({ groupId: 'fleet-2' });
  publish('playerDiscoveries/miner', discovery);
  await vi.waitFor(() => expect(feed.visible()).toMatchObject({ groupId: 'fleet-1', revision: 3 }));
});
