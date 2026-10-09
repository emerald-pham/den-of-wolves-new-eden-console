import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { legacyFailedKProjectionFixture } from '../../tests/fixtures/legacyFailedKProjection';
import { missionDeck } from '../../functions/src/missionDeck';
import type { GameSession } from '@/types/game';
import type * as StoreModule from '@/store/useSessionStore';
import type * as ServiceModule from './awayMissionLifecycleService';
import type * as FirestoreModule from './firestore';

type Data = Record<string, unknown>;
type Reference = { path: string; constraints?: readonly Data[] };
type Listener = { reference: Reference; next: (snapshot: unknown) => void; stop: ReturnType<typeof vi.fn> };
const mock = vi.hoisted(() => ({ listeners: [] as Listener[], uid: 'alice', memberReply: {} as Data,
  authListeners: [] as Array<(user: { uid: string } | null) => void> }));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ controlled: true })), connectFirestoreEmulator: vi.fn(),
  collection: (_db: unknown, path: string) => ({ path }), doc: (_db: unknown, path: string) => ({ path }),
  where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
  query: (reference: Reference, ...constraints: Data[]) => ({ ...reference, constraints }),
  orderBy: vi.fn(), limit: vi.fn(), getDocFromServer: vi.fn(),
  onSnapshot: vi.fn((reference: Reference, optionsOrNext: unknown, next?: unknown) => {
    const listener = { reference, next: (typeof optionsOrNext === 'function' ? optionsOrNext : next) as Listener['next'], stop: vi.fn() };
    mock.listeners.push(listener); return listener.stop;
  }),
  Timestamp: class { toDate() { return new Date('2026-10-09T00:00:00.000Z'); } },
}));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_auth: unknown, next: (user: { uid: string } | null) => void) => {
  mock.authListeners.push(next); next({ uid: mock.uid }); return vi.fn();
} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: mock.memberReply }) }));
vi.mock('./firebase', () => ({ app: () => ({ name: 'controlled-app' }),
  auth: () => ({ currentUser: { uid: mock.uid } }), functions: () => ({}) }));
vi.mock('./firebaseConfig', () => ({ emulatorPorts: { firestore: 8080 }, useEmulators: false }));

const intentKey = 'dow-away-mission-memory-cutover';
const constructions = ['global member feed', 'standalone mission workspace'] as const;
type Construction = typeof constructions[number];
let store: typeof StoreModule.useSessionStore;
let service: typeof ServiceModule;
let firestore: typeof FirestoreModule;
const stops: Array<() => void> = [];
const onPointers = vi.fn(); const onHands = vi.fn(); const onState = vi.fn(); const onGmPointers = vi.fn();
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); mock.listeners.length = 0; mock.authListeners.length = 0; mock.uid = 'alice';
  sessionStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(performance, 'getEntriesByType', { configurable: true, value: () => [{ type: 'reload' }] });
  // An intent is only useful in a newly loaded document and after fresh wire
  // confirmation. Tests below retain actual existing reader/closure behavior.
  sessionStorage.setItem(intentKey, JSON.stringify({ version: 1, appName: 'controlled-app', sessionId: 's1',
    uid: 'alice', policyVersion: 1, epoch: 3, previousBootId: 'previous-document' }));
  store = (await import('@/store/useSessionStore')).useSessionStore;
  firestore = await import('./firestore'); service = await import('./awayMissionLifecycleService');
  seed();
});
afterEach(() => {
  stops.splice(0).forEach(stop => stop());
  store.setState({ session: null, me: null, connection: 'offline', sessionSnapshotFreshness: 'unknown' });
});

function marker(epoch = 3, state: 'held' | 'ready' = 'ready') { return { policyVersion: 1, epoch, state }; }
function seed(role: 'player' | 'gm' = 'player') {
  const raw = { id: 's1', name: 'Controlled fresh table', phase: 'active', currentTurn: 2, playerCount: 8,
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [] },
    awayMissionProjectionSafety: marker(), createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z' };
  const session = { ...firestore.sessionFrom('s1', raw), awayMissionProjectionSafety: marker() };
  const me = { uid: 'alice', sessionId: 's1', role, connected: true, displayName: 'Alice', fleetGroupId: 'fleet-1',
    connectionGeneration: 4, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander' };
  store.setState({ session, me, connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1 });
  mock.memberReply = { type: 'current-member-session', sessionId: 's1', actorUid: 'alice', groupId: 'fleet-1',
    connectionGeneration: 4, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', session: raw };
}
async function start(construction: Construction, gmCallback = false) {
  stops.push(firestore.subscribeSessionState('s1', 'alice', {
    sessionReadAudience: 'member', initialMemberActor: () => store.getState().me,
    onSession: session => store.setState({ session }), onSessionFreshness: fresh => store.setState({ sessionSnapshotFreshness: fresh ? 'server' : 'unknown' }),
    onPlayer: me => store.setState({ me }), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
    ...(construction === 'global member feed' ? { onAwayMissionHandPointers: onPointers, onAwayMissionHands: onHands } : {}),
    ...(gmCallback ? { onGmAwayMissionHandPointers: onGmPointers } : {}),
  }));
  if (construction === 'standalone mission workspace') stops.push(service.subscribeToOwnAwayMissionLifecycles('s1', 'alice', onState));
  ownPlayer(); await settle();
}
function ownPlayer(patch: Data = {}, fromCache = false) {
  const fields = { ...store.getState().me, ...patch };
  mock.listeners.filter(listener => listener.reference.path === 'sessions/s1/players/alice').forEach(listener => listener.next({
    metadata: { fromCache }, exists: () => true, get: (field: string) => fields[field as keyof typeof fields], data: () => fields,
  }));
}
async function settle() { for (let i = 0; i < 8; i += 1) await Promise.resolve(); }
const ownerPointers = () => mock.listeners.filter(listener => listener.reference.path === 'sessions/s1/awayMissionHandPointers' &&
  listener.reference.constraints?.some(constraint => constraint.field === 'participantUid'));
const hands = () => mock.listeners.filter(listener => listener.reference.path.includes('/awayMissionHands/'));
function deliverMission() {
  const fixture = legacyFailedKProjectionFixture('s1'); const pointer = fixture.pointers[0]!;
  const physicalCard = missionDeck().find(card => card.id === fixture.hands[0]!.cardId)!;
  const hand = { ...fixture.hands[0]!, rank: physicalCard.rank, suit: physicalCard.suit, value: physicalCard.value };
  expect(pointer.lifecyclePublicState.outcomes?.[0]).toMatchObject({ total: 20, difficulty: 30, criticalThreshold: 40, outcome: 'failure' });
  ownerPointers().forEach(listener => listener.next({ metadata: { fromCache: false, hasPendingWrites: false },
    docs: [{ id: pointer.handId, data: () => pointer }] }));
  hands().forEach(listener => listener.next({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => hand }));
  return { pointer, hand };
}
function withdraw(defect: string) {
  const current = store.getState();
  if (defect === 'offline') {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline'));
  } else if (defect === 'Auth UID replacement') {
    mock.uid = 'foreign'; mock.authListeners.forEach(next => next({ uid: mock.uid }));
  } else if (defect === 'BFCache restoration') {
    const event = new Event('pageshow'); Object.defineProperty(event, 'persisted', { value: true }); window.dispatchEvent(event);
  } else if (defect === 'pagehide interruption') window.dispatchEvent(new Event('pagehide'));
  else if (defect === 'session replacement') store.setState({ session: { ...current.session!, id: 'other-session' } as GameSession });
  else if (defect === 'member disconnect') ownPlayer({ connected: false });
  else if (defect === 'membership demotion') ownPlayer({ role: 'observer' });
  else if (defect === 'cache freshness') store.setState({ sessionSnapshotFreshness: 'cache' });
  else {
    const value = defect === 'held' ? marker(3, 'held') : defect === 'epoch change' ? marker(4) :
      defect === 'malformed marker' ? { policyVersion: 1, epoch: 0, state: 'ready' } : null;
    store.setState({ session: { ...current.session!, awayMissionProjectionSafety: value } as GameSession });
  }
}

it('retains the strict server safety facts in the actual session parser without exposing the internal generation', () => {
  const parsed = firestore.sessionFrom('s1', { name: 'Controlled table', awayMissionProjectionSafety: marker() });
  expect(parsed).toHaveProperty('awayMissionProjectionSafety', marker());
  expect(parsed).not.toHaveProperty('awayMissionProjectionSafety.writeRevision');
});

it.each(constructions)('does not treat a GM callback as current GM authority in the actual %s', async construction => {
  await start(construction, true);
  expect(mock.listeners.filter(listener => listener.reference.path.includes('/awayMissionHandPointers') &&
    !listener.reference.constraints?.some(constraint => constraint.field === 'participantUid'))).toEqual([]);
});

it.each(constructions)('requires one full-page reload intent before the actual %s resumes on an old page', async construction => {
  // Loaded barrier modules cannot accept a later fabricated storage intent.
  sessionStorage.removeItem(intentKey);
  Object.defineProperty(performance, 'getEntriesByType', { configurable: true, value: () => [{ type: 'navigate' }] });
  await start(construction);
  expect(ownerPointers()).toEqual([]);
  const intent = JSON.parse(sessionStorage.getItem(intentKey) ?? 'null') as Data | null;
  expect(intent).toMatchObject({ appName: 'controlled-app', sessionId: 's1', uid: 'alice', epoch: 3 });
  expect(typeof intent?.previousBootId).toBe('string');
});

it.each(constructions.flatMap(construction => ['held', 'missing marker', 'malformed marker', 'epoch change', 'offline',
  'Auth UID replacement', 'session replacement', 'member disconnect', 'membership demotion', 'cache freshness',
  'BFCache restoration', 'pagehide interruption'].map(defect => [construction, defect] as const)))(
  'withdraws existing pointer/private-hand readers and rejects their late closures in the actual %s after %s', async (construction, defect) => {
    await start(construction); expect(ownerPointers()).toHaveLength(1);
    const oldPointers = [...ownerPointers()]; const delivered = deliverMission(); const oldHands = [...hands()];
    expect(oldHands).toHaveLength(1);
    if (construction === 'global member feed') expect(onHands.mock.lastCall?.[0]).toHaveLength(1);
    else expect(onState.mock.lastCall?.[0]).toMatchObject({ status: 'ready', missions: [expect.objectContaining({
      publicState: expect.objectContaining({ outcomes: [expect.objectContaining({ difficulty: null, criticalThreshold: null })] }),
    })] });
    withdraw(defect); await settle();
    expect(oldPointers[0]!.stop).toHaveBeenCalledOnce(); expect(oldHands[0]!.stop).toHaveBeenCalledOnce();
    oldPointers[0]!.next({ metadata: { fromCache: false, hasPendingWrites: false },
      docs: [{ id: delivered.pointer.handId, data: () => delivered.pointer }] });
    oldHands[0]!.next({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => delivered.hand });
    expect(hands()).toHaveLength(1);
    if (construction === 'global member feed') { expect(onPointers).toHaveBeenLastCalledWith([]); expect(onHands).toHaveBeenLastCalledWith([]); }
    else expect(onState.mock.lastCall?.[0].missions).toEqual([]);
  });
