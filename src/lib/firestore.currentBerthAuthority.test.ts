import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), connectFirestoreEmulator: vi.fn(), doc: vi.fn(), getDocFromServer: vi.fn(),
  getFirestore: vi.fn(), onSnapshot: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), query: vi.fn(), where: vi.fn(),
  Timestamp: class { toDate() { return new Date(0); } },
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ app: vi.fn(), functions: vi.fn() }));
vi.mock('./firebaseConfig', () => ({ emulatorPorts: { firestore: 8080 }, useEmulators: false }));

const { sessionFrom, subscribeSessionState } = await import('./firestore');
const { doc, onSnapshot } = await import('firebase/firestore');
const { httpsCallable } = await import('firebase/functions');
const subscriptions = new Map<string, (snapshot: unknown) => void>();
let stop: (() => void) | undefined;
const actor = { role: 'player', connected: true, fleetGroupId: 'fleet-1', connectionGeneration: 4,
  assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain', replacementRoleId: null, replacementStatus: null,
  displayName: 'Native', joinedAt: '2026-10-05T12:00:00.000Z' };
const authority = (change = {}) => ({ sessionId: 'current-berth', actorUid: 'u1', groupId: 'fleet-1', role: 'player',
  connectionGeneration: 4, assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
  replacementRoleId: null, replacementStatus: null, shipId: 'shepherd', ...change });
const header = { name: 'Native', joinCode: 'ABCD', phase: 'active', currentTurn: 1,
  createdAt: '2026-10-05T12:00:00.000Z', updatedAt: '2026-10-05T12:01:00.000Z',
  memberSessionScope: { groupId: 'fleet-1', vesselIds: ['shepherd', 'dione'], craftIds: [] },
  shuttleDockings: [], shuttleVisitLog: [] };
const discovery = { groupId: 'fleet-1', shipId: 'shepherd', fleetGroupVesselIds: ['shepherd', 'dione'],
  currentCoordinate: '1413', knownCoordinates: ['0000', '1413'], knownSystems: {}, pursuitDistance: 1,
  navigationLogs: [], revision: 3 };
const reply = (witness: unknown = authority(), change = {}) => ({ data: {
  type: 'current-member-session', sessionId: 'current-berth', actorUid: 'u1', groupId: 'fleet-1',
  connectionGeneration: 4, assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
  currentActorBerthAuthority: witness, session: header, ...change,
} });

beforeEach(() => {
  subscriptions.clear();
  vi.mocked(doc).mockImplementation(((_db: unknown, path: string) => ({ path })) as never);
  vi.mocked(onSnapshot).mockImplementation(((reference: { path?: string }, _options: unknown, next: (snapshot: unknown) => void) => {
    if (reference?.path) subscriptions.set(reference.path, next);
    return vi.fn();
  }) as never);
});
afterEach(() => { stop?.(); stop = undefined; });
function publish(path: string, data: Record<string, unknown>, fromCache = false) {
  subscriptions.get(`sessions/current-berth/${path}`)!({ exists: () => true, metadata: { fromCache },
    data: () => data, get: (key: string) => data[key] });
}
function begin(response = reply(), call = vi.fn().mockResolvedValue(response)) {
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  const onSession = vi.fn(), onDiscovery = vi.fn(), onError = vi.fn(), onFreshness = vi.fn();
  stop = subscribeSessionState('current-berth', 'u1', { sessionReadAudience: 'member',
    onSession, onPlayer: vi.fn(), onPlayerDiscovery: onDiscovery, onSessionFreshness: onFreshness,
    onKicked: vi.fn(), onSeats: vi.fn(), onError });
  return { onSession, onDiscovery, onError, onFreshness, call };
}

it('carries only a callable-derived current actor berth after independent member confirmation', async () => {
  const feed = begin();
  publish('playerDiscoveries/u1', discovery);
  expect(feed.onDiscovery).not.toHaveBeenCalled();
  publish('players/u1', actor);
  await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  expect(feed.onSession).toHaveBeenLastCalledWith(expect.objectContaining({ currentActorBerthAuthority: authority() }));
  expect(feed.onDiscovery).toHaveBeenLastCalledWith(expect.objectContaining({ shipId: 'shepherd', revision: 3 }));
  expect(feed.onError).not.toHaveBeenCalled();
});

it.each([
  ['foreign UID', { actorUid: 'other' }], ['foreign session', { sessionId: 'other-session' }],
  ['wrong group', { groupId: 'fleet-2' }], ['wrong generation', { connectionGeneration: 3 }],
  ['coerced generation', { connectionGeneration: '4' }], ['wrong player role', { role: 'gm' }],
  ['wrong assigned role', { assignedRoleId: 'admiral' }], ['wrong active console', { activeConsoleRoleId: null }],
  ['wrong replacement role', { replacementRoleId: 'comms-officer' }], ['suspended replacement', { replacementStatus: 'awaiting-re-role' }],
  ['foreign berth', { shipId: 'aegis' }], ['extra private map', { memberShipIds: { other: 'aegis' } }],
] as const)('withdraws malformed/mismatched %s witness before pending discovery can publish', async (_name, change) => {
  const feed = begin(reply(authority(change)));
  publish('players/u1', actor); publish('playerDiscoveries/u1', discovery);
  await vi.waitFor(() => expect(feed.onError).toHaveBeenCalled());
  expect(feed.onSession).not.toHaveBeenCalled();
  expect(feed.onDiscovery.mock.calls.every(([value]) => value === null)).toBe(true);
  expect(feed.onFreshness).toHaveBeenLastCalledWith(false);
});

it('keeps a present null witness distinct from legacy absence', async () => {
  const feed = begin(reply(null)); publish('players/u1', actor);
  await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  expect(feed.onSession).toHaveBeenLastCalledWith(expect.objectContaining({ currentActorBerthAuthority: null }));
  expect(feed.onError).not.toHaveBeenCalled();
});

it('never hydrates a current berth witness from an ordinary session document or private discovery payload', async () => {
  expect(sessionFrom('current-berth', { ...header, currentActorBerthAuthority: authority() }))
    .not.toHaveProperty('currentActorBerthAuthority');
  const feed = begin(); publish('players/u1', actor);
  await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  publish('playerDiscoveries/u1', { ...discovery, currentActorBerthAuthority: authority({ actorUid: 'other' }) });
  expect(feed.onDiscovery.mock.lastCall?.[0]).not.toHaveProperty('currentActorBerthAuthority');
});

it('does not carry a pre-change witness or retired discovery into a newer actor generation/console', async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise(done => { resolve = done; });
  const newAuthority = authority({ connectionGeneration: 5, activeConsoleRoleId: null });
  const call = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(reply(newAuthority, {
    connectionGeneration: 5, activeConsoleRoleId: null,
  }));
  const feed = begin(reply(), call);
  publish('players/u1', actor);
  const retired = subscriptions.get('sessions/current-berth/playerDiscoveries/u1')!;
  publish('playerDiscoveries/u1', discovery);
  publish('players/u1', { ...actor, connectionGeneration: 5, activeConsoleRoleId: null });
  retired({ exists: () => true, metadata: { fromCache: false }, data: () => discovery });
  resolve(reply());
  await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  expect(feed.onSession.mock.calls.every(([session]) => session.currentActorBerthAuthority?.connectionGeneration === 5)).toBe(true);
  expect(feed.onDiscovery.mock.calls.every(([value]) => value === null)).toBe(true);
  publish('playerDiscoveries/u1', { ...discovery, revision: 4 });
  expect(feed.onDiscovery).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 4 }));
});
