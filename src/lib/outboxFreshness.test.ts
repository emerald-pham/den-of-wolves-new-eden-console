// PC10.3 replay repair: a queued command is never dropped on the client
// because freshness or the connection flickers at flush time. After a reconnect
// the session listeners can report a cached snapshot while the resume is in
// flight; the App then marks the connection offline and an offline connection
// cannot hold server freshness. The outbox must keep the command queued and
// unsent, and replay it once with its original request ID when the live server
// snapshot returns. The age expiry still applies and is still shown.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { returningScientist, scientistSession } from '@/test/stationLossReconnect';

const server = vi.hoisted(() => ({
  calls: [] as { name: string; data: Record<string, unknown> }[],
  handlers: {} as Record<string, (data: Record<string, unknown>) => unknown>,
}));

vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn().mockResolvedValue(undefined) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => async (data: Record<string, unknown>) => {
    server.calls.push({ name, data });
    const handler = server.handlers[name];
    if (!handler) throw new Error(`Unexpected callable ${name}`);
    return { data: await handler(data) };
  }),
}));
vi.mock('./firebase', () => ({
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));

const { connectAutomatically } = await import('./sessionService');

let clock = Date.parse('2026-09-12T00:10:00.000Z');
const resumeReply = () => {
  clock += 1_000;
  return { session: { ...scientistSession, updatedAt: new Date(clock).toISOString() }, player: returningScientist };
};

function grievance(id: string, ageMs = 1_000) {
  return {
    id, kind: 'submitCivilUnrestGrievance' as const,
    payload: { sessionId: 's1', requestId: `req-${id}`, crisisId: 'unrest-1', expectedCrisisRevision: 2,
      expectedGrievanceRevision: 0, affectedShipId: 'shepherd', visibility: 'private' as const, text: `text ${id}` },
    createdAt: new Date(Date.now() - ageMs).toISOString(), queuedWithServerAuthority: true as const,
  };
}
const grievanceRequestIds = () =>
  server.calls.filter(({ name }) => name === 'submitCivilUnrestGrievance').map(({ data }) => data.requestId);

/** What the App's session listener does when it reports a cached (not fresh) snapshot. */
function listenerReportsCache() {
  const state = useSessionStore.getState();
  state.setConnection('offline');
  state.setSessionSnapshotFreshness('cache');
}
/** What the App's session listener does when it reports a fresh server snapshot. */
function listenerReportsServer() {
  const state = useSessionStore.getState();
  state.setConnection('live');
  state.setSessionSnapshotFreshness('server');
}

let stopOfflineAuthorityWatch: () => void = () => undefined;

beforeEach(() => {
  server.calls.length = 0;
  server.handlers = {
    resumeSession: () => resumeReply(),
    submitCivilUnrestGrievance: (data) => ({ status: 'committed', requestId: data.requestId }),
  };
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity(scientistSession, returningScientist);
  state.setConnection('offline');
  // As in the App runtime: an offline connection is not a current authority proof.
  stopOfflineAuthorityWatch = useSessionStore.subscribe((next) => {
    if (next.connection === 'offline' && next.sessionSnapshotFreshness === 'server') {
      next.setSessionSnapshotFreshness('cache');
    }
  });
});

afterEach(() => {
  stopOfflineAuthorityWatch();
  vi.useRealTimers();
});

it('keeps a queued command unsent when the listener reports a cached snapshot during the resume, then replays it once when freshness returns', async () => {
  useSessionStore.getState().enqueueCommand(grievance('flicker'));
  server.handlers.resumeSession = () => {
    listenerReportsCache();
    return resumeReply();
  };

  await connectAutomatically();

  expect(grievanceRequestIds()).toEqual([]);
  expect(useSessionStore.getState().pendingCommands.map(({ id }) => id)).toEqual(['flicker']);
  expect(useSessionStore.getState().communicationError).toBeNull();

  listenerReportsServer();

  await vi.waitFor(() => expect(useSessionStore.getState().pendingCommands).toEqual([]));
  expect(grievanceRequestIds()).toEqual(['req-flicker']);
  expect(useSessionStore.getState().communicationError).toBeNull();

  // Further listener flicker does not send it again.
  listenerReportsCache();
  listenerReportsServer();
  await Promise.resolve();
  expect(grievanceRequestIds()).toEqual(['req-flicker']);
});

it('does not send or drop a command a second time when a reconnect overlaps its in-flight replay', async () => {
  useSessionStore.getState().enqueueCommand(grievance('overlap'));
  let release: () => void = () => undefined;
  const committed = new Promise<void>((resolve) => { release = resolve; });
  server.handlers.submitCivilUnrestGrievance = async (data) => {
    await committed;
    return { status: 'committed', requestId: data.requestId };
  };

  const first = connectAutomatically();
  await vi.waitFor(() => expect(grievanceRequestIds()).toEqual(['req-overlap']));
  const second = connectAutomatically();
  await vi.waitFor(() => expect(server.calls.filter(({ name }) => name === 'resumeSession')).toHaveLength(2));
  release();
  await Promise.all([first, second]);

  expect(grievanceRequestIds()).toEqual(['req-overlap']);
  expect(useSessionStore.getState().pendingCommands).toEqual([]);
  expect(useSessionStore.getState().communicationError).toBeNull();
});

it('still expires a deferred command that outlives the reconnect window and tells the player', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  useSessionStore.getState().enqueueCommand(grievance('late'));
  server.handlers.resumeSession = () => {
    listenerReportsCache();
    return resumeReply();
  };

  await connectAutomatically();
  expect(useSessionStore.getState().pendingCommands.map(({ id }) => id)).toEqual(['late']);

  vi.setSystemTime(Date.now() + 20_000);
  listenerReportsServer();

  await vi.waitFor(() => expect(useSessionStore.getState().pendingCommands).toEqual([]));
  expect(grievanceRequestIds()).toEqual([]);
  expect(useSessionStore.getState().communicationError).toMatchObject({ code: 'Wolf Intercepted Request Timeout' });
});
