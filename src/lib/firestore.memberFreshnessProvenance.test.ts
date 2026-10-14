import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), connectFirestoreEmulator: vi.fn(), doc: vi.fn(), getDocFromServer: vi.fn(),
  getFirestore: vi.fn(), onSnapshot: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), query: vi.fn(), where: vi.fn(),
  Timestamp: class { toDate() { return new Date(0); } },
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ app: vi.fn(), functions: vi.fn() }));
vi.mock('./firebaseConfig', () => ({ emulatorPorts: { firestore: 8080 }, useEmulators: true }));

const firestoreModule = await import('./firestore');
const { subscribeSessionState } = firestoreModule;
const { doc, collection, onSnapshot } = await import('firebase/firestore');
const { httpsCallable } = await import('firebase/functions');
const nexts = new Map<string, (snapshot: unknown) => void>();
const errors = new Map<string, (error: unknown) => void>();
let stop: (() => void) | undefined;
const actor = { role: 'player', connected: true, fleetGroupId: 'fleet-1', connectionGeneration: 4,
  assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain', replacementRoleId: null,
  replacementStatus: null, displayName: 'PRIVATE DISPLAY', joinedAt: '2026-10-05T12:00:00.000Z' };
const authority = (change = {}) => ({ sessionId: 'trace-session', actorUid: 'private-uid', groupId: 'fleet-1',
  role: 'player', connectionGeneration: 4, assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
  replacementRoleId: null, replacementStatus: null, shipId: 'shepherd', ...change });
const header = { name: 'PRIVATE SESSION', joinCode: 'SECRET', phase: 'active', currentTurn: 1,
  createdAt: '2026-10-05T12:00:00.000Z', updatedAt: '2026-10-05T12:01:00.000Z',
  memberSessionScope: { groupId: 'fleet-1', vesselIds: ['shepherd', 'dione'], craftIds: [] },
  shuttleDockings: [], shuttleVisitLog: [] };
const reply = (change = {}) => ({ data: { type: 'current-member-session', sessionId: 'trace-session',
  actorUid: 'private-uid', groupId: 'fleet-1', connectionGeneration: 4, assignedRoleId: 'dione-captain',
  activeConsoleRoleId: 'dione-captain', currentActorBerthAuthority: authority(), session: header, ...change } });
type Event = { readonly event: string; readonly stage?: string; readonly [key: string]: unknown };

beforeEach(() => {
  nexts.clear(); errors.clear();
  const reference = ((_db: unknown, path: string) => ({ path })) as never;
  vi.mocked(doc).mockImplementation(reference); vi.mocked(collection).mockImplementation(reference);
  vi.mocked(onSnapshot).mockImplementation(((ref: { path?: string }, _opts: unknown,
    next: (snapshot: unknown) => void, error: (error: unknown) => void) => {
    if (ref?.path) { nexts.set(ref.path, next); errors.set(ref.path, error); }
    return vi.fn();
  }) as never);
});
afterEach(() => { stop?.(); stop = undefined; });
function publishPlayer(change = {}, fromCache = false) {
  const data = { ...actor, ...change };
  nexts.get('sessions/trace-session/players/private-uid')!({ exists: () => true,
    metadata: { fromCache }, data: () => data, get: (key: string) => data[key as keyof typeof data] });
}
function begin(response = reply(), sink?: (event: Event) => void) {
  const events: Event[] = [], order: string[] = [];
  const call = vi.fn().mockResolvedValue(response); vi.mocked(httpsCallable).mockReturnValue(call as never);
  const onSession = vi.fn(() => { order.push('session'); });
  const onFreshness = vi.fn((fresh: boolean) => { order.push(fresh ? 'fresh' : 'stale'); });
  const onError = vi.fn(() => { order.push('error'); }), onBrief = vi.fn();
  // This existing subscription accepts extra optional diagnostics before implementation;
  // baseline RED must be a missing source event, not a missing method/forced exception.
  const handlers = { sessionReadAudience: 'member' as const, onSession, onSessionFreshness: onFreshness,
    onPlayer: vi.fn(), onSeats: vi.fn(), onKicked: vi.fn(), onRoleBrief: onBrief, onError,
    onMemberFreshnessProvenance: (event: Event) => { events.push(event); sink?.(event); } };
  stop = subscribeSessionState('trace-session', 'private-uid', handlers);
  return { events, order, call, onSession, onFreshness, onError, onBrief };
}

it('tags the current member response signature mismatch before unchanged withdrawal', async () => {
  const feed = begin(); await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalledTimes(1));
  feed.call.mockResolvedValue(reply({ activeConsoleRoleId: 'admiral' }));
  publishPlayer();
  await vi.waitFor(() => expect(feed.onFreshness).toHaveBeenLastCalledWith(false));
  expect(feed.onSession).toHaveBeenCalledTimes(1); expect(feed.onError).not.toHaveBeenCalled();
  expect(feed.events).toContainEqual(expect.objectContaining({ event: 'member-signature-mismatch' }));
});

it.each([
  ['response-shape-or-scope', { actorUid: 'foreign-private-uid' }],
  ['berth-parse', { currentActorBerthAuthority: authority({ actorUid: 'foreign-private-uid' }) }],
])('tags %s rejection while preserving the current reader error decision', async (stage, change) => {
  const feed = begin(reply(change));
  await vi.waitFor(() => expect(feed.onError).toHaveBeenCalled());
  expect(feed.onSession).not.toHaveBeenCalled(); expect(feed.onFreshness).toHaveBeenLastCalledWith(false);
  expect(feed.events).toContainEqual(expect.objectContaining({ event: 'member-read-rejected', stage }));
});

it('tags a session-delivery exception without exposing its private error', async () => {
  const feed = begin();
  feed.onSession.mockImplementation(() => { throw new Error('PRIVATE CALLBACK PAYLOAD'); });
  await vi.waitFor(() => expect(feed.onError).toHaveBeenCalled());
  expect(feed.onFreshness).toHaveBeenLastCalledWith(false);
  expect(feed.events).toContainEqual(expect.objectContaining({ event: 'member-read-rejected', stage: 'session-delivery' }));
  expect(JSON.stringify(feed.events)).not.toContain('PRIVATE');
});

it('tags a server actor-signature change and preserves false-then-accepted ordering', async () => {
  const feed = begin(); await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  publishPlayer(); await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalledTimes(2));
  feed.events.length = 0; feed.order.length = 0;
  feed.call.mockResolvedValue(reply({ activeConsoleRoleId: 'admiral',
    currentActorBerthAuthority: authority({ activeConsoleRoleId: 'admiral' }) }));
  publishPlayer({ activeConsoleRoleId: 'admiral' });
  await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalledTimes(3));
  expect(feed.order).toEqual(['stale', 'session', 'fresh']); expect(feed.onError).not.toHaveBeenCalled();
  expect(feed.events).toContainEqual(expect.objectContaining({ event: 'actor-signature-change',
    firstConfirmed: false, firstAccepted: false }));
});

it('tags the current role-brief listener error without changing its clearing/error decisions', async () => {
  const feed = begin(); await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  feed.events.length = 0;
  errors.get('sessions/trace-session/roleBriefs/private-uid')!({ code: 'permission-denied', message: 'PRIVATE BRIEF' });
  expect(feed.onBrief).toHaveBeenLastCalledWith(null); expect(feed.onError).toHaveBeenCalledTimes(1);
  expect(feed.onFreshness).toHaveBeenLastCalledWith(true);
  expect(feed.events).toContainEqual(expect.objectContaining({ event: 'listener-error' }));
  expect(JSON.stringify(feed.events)).not.toContain('PRIVATE');
});

it('does not turn cached own-player or retired listener callbacks into current loss events', async () => {
  const feed = begin(); await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  const error = errors.get('sessions/trace-session/roleBriefs/private-uid')!;
  feed.events.length = 0;
  publishPlayer({ activeConsoleRoleId: 'admiral' }, true);
  expect(feed.events).toEqual([]); expect(feed.onFreshness).toHaveBeenLastCalledWith(true);
  stop!(); stop = undefined; feed.events.length = 0;
  error({ code: 'permission-denied' });
  expect(feed.events).toEqual([]); expect(feed.onError).not.toHaveBeenCalled();
});

it('contains diagnostic-sink failure without altering the actual source reader decisions or request count', async () => {
  const feed = begin(reply(), () => { throw new Error('PRIVATE DIAGNOSTIC FAILURE'); });
  await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalledTimes(1));
  expect(feed.onFreshness.mock.calls).toEqual([[true]]); expect(feed.onError).not.toHaveBeenCalled();
  expect(feed.call).toHaveBeenCalledTimes(1); expect(feed.order).toEqual(['session', 'fresh']);
});

it('retains only selected-member fixed facts in a bounded tape and stops collecting on close', async () => {
  type Tape = { read: () => { events: Event[]; dropped: number }; stop: () => void };
  const moduleWithTrace = firestoreModule as typeof firestoreModule & {
    startMemberFreshnessTrace?: (sessionId: string, uid: string) => Tape | undefined;
  };
  const tape = moduleWithTrace.startMemberFreshnessTrace?.('trace-session', 'private-uid');
  const feed = begin(); await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  expect(tape?.read().events ?? []).toContainEqual(expect.objectContaining({ event: 'member-read-accepted' }));
  const error = errors.get('sessions/trace-session/roleBriefs/private-uid')!;
  for (let i = 0; i < 80; i++) error({ code: 'permission-denied', message: 'PRIVATE BRIEF' });
  const snapshot = tape!.read();
  expect(snapshot.events).toHaveLength(64); expect(snapshot.dropped).toBeGreaterThan(0);
  for (const event of snapshot.events) {
    expect(Object.keys(event).sort()).toEqual(['actorEpoch', 'atMs', 'current', 'event', 'firstAccepted',
      'firstConfirmed', 'sequence', 'stage', 'subscription'].sort());
  }
  const serialized = JSON.stringify(snapshot);
  for (const value of ['PRIVATE', 'private-uid', 'trace-session', 'fleet-1', 'SECRET', 'dione-captain']) {
    expect(serialized).not.toContain(value);
  }
  tape!.stop(); error({ code: 'permission-denied' }); expect(tape!.read()).toEqual(snapshot);
});

it('keeps a foreign selected trace empty while the existing current member reader still accepts', async () => {
  const moduleWithTrace = firestoreModule as typeof firestoreModule & {
    startMemberFreshnessTrace?: (sessionId: string, uid: string) => { read: () => { events: Event[] }; stop: () => void } | undefined;
  };
  const tape = moduleWithTrace.startMemberFreshnessTrace?.('foreign-session', 'foreign-uid');
  const feed = begin(); await vi.waitFor(() => expect(feed.onSession).toHaveBeenCalled());
  expect(feed.onFreshness).toHaveBeenLastCalledWith(true); expect(feed.onError).not.toHaveBeenCalled();
  expect(tape?.read().events).toEqual([]); tape?.stop();
});

it('brackets the unchanged false-freshness and generic-error calls with ordered fixed facts', async () => {
  const observed: string[] = [];
  const feed = begin(reply({ actorUid: 'foreign-private-uid' }), event => { observed.push(event.event); });
  feed.onFreshness.mockImplementation(fresh => { observed.push('freshness:' + fresh); });
  feed.onError.mockImplementation(() => { observed.push('error'); });
  await vi.waitFor(() => expect(feed.onError).toHaveBeenCalled());
  expect(observed.filter(value => value !== 'listener-attached' && value !== 'member-read-start')).toEqual([
    'member-read-rejected', 'freshness:false', 'freshness-false-returned', 'listener-error', 'error', 'listener-error-returned',
  ]);
});
