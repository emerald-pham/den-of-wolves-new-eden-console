import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { readFileSync } from 'node:fs';
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), connectFirestoreEmulator: vi.fn(), doc: vi.fn(),
  getDocFromServer: vi.fn(), getFirestore: vi.fn(), onSnapshot: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), query: vi.fn(), where: vi.fn(),
  Timestamp: class { toDate() { return new Date(0); } },
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
const authPort = vi.hoisted(() => ({ currentUser: { uid: 'gm1' } as { uid: string } | null }));
vi.mock('./firebase', () => ({ app: vi.fn(), functions: vi.fn(), auth: () => authPort }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn(() => vi.fn()) }));
vi.mock('./firebaseConfig', () => ({ emulatorPorts: { firestore: 8080 }, useEmulators: false }));
const { subscribeGmPlayerRemovalEvents, sessionFrom } = await import('./firestore');
const { onSnapshot, collection, query, where, orderBy, limit } = await import('firebase/firestore');
const privateEntry = { type: 'player-removal', sessionId: 's1', sourceId: 'damage-destroyed-icebreaker',
  playerUid: 'removed-player', playerName: 'Original player', roleId: 'icebreaker-miner', roleName: 'Icebreaker Miner',
  cause: 'ship-destroyed', shipId: 'icebreaker', cycle: 1, createdAt: '2026-10-15T06:53:19.000Z' };
let next: (value: unknown) => void, error: () => void, stop: (() => void) | undefined;
const sdkStop = vi.fn();
const snapshot = (value: unknown = privateEntry, fromCache = false, id = `player-removal-${'a'.repeat(64)}`) => ({
  metadata: { fromCache }, docs: [{ id, data: () => value }],
});
beforeEach(() => {
  vi.clearAllMocks(); authPort.currentUser = { uid: 'gm1' }; useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Session', phase: 'active', currentTurn: 1 } as never,
    { sessionId: 's1', uid: 'gm1', role: 'gm', connected: true, connectionGeneration: 4, displayName: 'GM' } as never);
  useSessionStore.getState().setGmInstance({ id: 'bridge', sessionId: 's1', uid: 'gm1', name: 'GM', deviceLabel: 'Device',
    claimedAt: '2026-10-15T06:00:00.000Z' });
  useSessionStore.getState().setConnection('live'); useSessionStore.getState().setSessionSnapshotFreshness('server');
  vi.mocked(collection).mockImplementation(((_db: unknown, path: string) => ({ path })) as never);
  vi.mocked(query).mockImplementation(((ref: unknown) => ref) as never);
  vi.mocked(onSnapshot).mockImplementation(((_ref: unknown, _options: unknown, receive: typeof next, fail: typeof error) => {
    next = receive; error = fail; return sdkStop;
  }) as never);
});
afterEach(() => { stop?.(); stop = undefined; });
it('queries only the existing GM-private typed procedure audit feed and admits bounded original identity', () => {
  const sink = vi.fn(); stop = subscribeGmPlayerRemovalEvents('s1', sink);
  expect(collection).toHaveBeenCalledWith(undefined, 'sessions/s1/procedureAudits');
  expect(where).toHaveBeenCalledWith('type', '==', 'player-removal');
  expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc'); expect(limit).toHaveBeenCalledWith(30);
  next(snapshot()); expect(sink).toHaveBeenLastCalledWith([{ ...privateEntry, id: `player-removal-${'a'.repeat(64)}` }]);
  next(snapshot(privateEntry, true)); expect(sink).toHaveBeenLastCalledWith([]);
  next(snapshot()); expect(sink.mock.lastCall?.[0]).toHaveLength(1);
  error(); expect(sink).toHaveBeenLastCalledWith([]); next(snapshot()); expect(sink).toHaveBeenLastCalledWith([]);
});
it.each(['role', 'uid', 'generation', 'instance', 'lease', 'recovery', 'cache', 'offline'])(
  'withdraws actual private payload and late callbacks after %s authority changes', mode => {
    const sink = vi.fn(); stop = subscribeGmPlayerRemovalEvents('s1', sink); next(snapshot());
    const state = useSessionStore.getState();
    if (mode === 'role') state.setMe({ ...state.me!, role: 'player' });
    if (mode === 'uid') state.setMe({ ...state.me!, uid: 'foreign' });
    if (mode === 'generation') state.setMe({ ...state.me!, connectionGeneration: 5 });
    if (mode === 'instance') state.setGmInstance({ ...state.gmInstance!, id: 'other' });
    if (mode === 'lease') state.setGmInstance({ ...state.gmInstance!, claimedAt: '2026-10-15T06:01:00.000Z' });
    if (mode === 'recovery') state.setGmRecoveryPending(true);
    if (mode === 'cache') state.setSessionSnapshotFreshness('cache');
    if (mode === 'offline') state.setConnection('offline');
    expect(sink).toHaveBeenLastCalledWith([]); const count = sink.mock.calls.length;
    next(snapshot()); expect(sink.mock.calls.length).toBe(count); expect(sdkStop).toHaveBeenCalled();
  });
it('does not open a private query for an ordinary player, even with a stale GM descriptor', () => {
  const state = useSessionStore.getState(); state.setMe({ ...state.me!, role: 'player' });
  const sink = vi.fn(); stop = subscribeGmPlayerRemovalEvents('s1', sink);
  expect(onSnapshot).not.toHaveBeenCalled(); expect(sink).toHaveBeenLastCalledWith([]);
});
it.each([
  { loyalty: 'PRIVATE_SENTINEL' }, { sessionId: 'foreign' }, { cause: 'PRIVATE_SENTINEL' },
  { cycle: -1 }, { roleName: '' }, { createdAt: 'invalid' },
])('rejects malformed or private fields without copying them to the event consumer %#', delta => {
  const sink = vi.fn(); stop = subscribeGmPlayerRemovalEvents('s1', sink); next(snapshot({ ...privateEntry, ...delta }));
  expect(sink).toHaveBeenLastCalledWith([]); expect(JSON.stringify(sink.mock.calls)).not.toContain('PRIVATE_SENTINEL');
});
it('retains the existing private rules boundary and the exact composite index without a new grant', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  expect(rules).toMatch(/match \/procedureAudits\/\{requestId\}\s*\{\s*allow get, list: if isGm\(sessionId\);\s*allow write: if false;/);
  expect(rules).toMatch(/function isGm\(sessionId\)\s*\{\s*return isMember\(sessionId\)/);
  expect(rules).toMatch(/data\.role == 'gm'/);
  const indexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
  expect(indexes.indexes).toContainEqual({ collectionGroup: 'procedureAudits', queryScope: 'COLLECTION',
    fields: [{ fieldPath: 'type', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' }] });
});
it('rejects malformed terminal loss before it can regenerate a current craft projection', () => {
  expect(() => sessionFrom('s1', { phase: 'active', lostShuttles: { highwall: { status: 'lost', holderUid: 'foreign' } } })).toThrow(/Lost shuttle/);
});
