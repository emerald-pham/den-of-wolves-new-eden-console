/**
 * PC10.3 station-loss reconnect fixture (L1.4 #242, T2.1 #252, L3.1 #247).
 *
 * A returning member is the real App, the real `src/lib/sessionService`
 * reconnect (`connectAutomatically` -> `resumeSession` -> outbox flush) and the
 * real persisted Zustand snapshot. Only the callable boundary
 * (`firebase/functions`), Auth and Firestore listeners are replaced. The
 * callable boundary answers like the server's `resumeSession` after the
 * member's seat was released and claimed by someone else while they were away:
 * membership kept, seat pointer and active console cleared,
 * `stationSelectionRequired: true`.
 *
 * Usage from a route test (vi.mock factories must stay in the test file):
 *
 *   vi.mock('firebase/functions', async () => {
 *     const { stationLossServer } = await import('@/test/stationLossReconnect');
 *     return { httpsCallable: vi.fn((_f: unknown, name: string) =>
 *       (data: Record<string, unknown>) => stationLossServer.call(name, data)) };
 *   });
 *
 * then `stationLossServer.reset()` in `beforeEach`, seed the store with
 * `returningScientist` / `scientistSession`, and call `reloadTab()` to model a
 * same-tab reload: the persisted localStorage snapshot is rehydrated and
 * per-tab sessionStorage drafts survive, exactly as in a browser.
 *
 * Later slices (L3.2 clocks, T2.2 roster change, T2.3 stale clock, L3.3 sparse
 * roster) can set `stationLossServer.resumeReply` to another server answer and
 * add callable handlers with `stationLossServer.handlers[name] = ...`.
 *
 * Evidence class: local jsdom route test with the real client reconnect path
 * and a scripted callable boundary. It is not emulator, browser or deployed
 * gameplay evidence; `tests/reconnect/stationLossReconnect.emulator.test.ts`
 * proves the same server reply through real callables.
 */
import { SESSION_STORAGE_KEY, useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';

export const STATION_LOSS_NOTICE =
  'Your previous station is no longer available. Return to station select and reselect your role.';

export const scientistSession = {
  id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
  currentTurn: 3, activeRoleIds: ['shepherd-scientist'], activeVesselIds: ['shepherd', 'aegis'],
  shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'SESSION START' }],
  shuttleControl: { endeavour: {
    shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'u1', holderUid: 'u1', revision: 4,
  } },
  playerDiscovery: {
    groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd', 'aegis'], shipId: 'shepherd', currentCoordinate: '0000',
    knownCoordinates: ['0000'], knownSystems: { 'system-01': '0000' }, pursuitDistance: 0, navigationLogs: [], revision: 1,
  },
  shipUpgrades: { shepherd: [], aegis: [] },
  turnPhase: {
    turn: 3, teamPhaseEndsAt: '2026-09-12T00:00:00.000Z', openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
  createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z',
} as unknown as GameSession;

/** The Shepherd Scientist holding the station when they went away. */
export const returningScientist: Player = {
  uid: 'u1', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: 'shepherd-scientist',
  assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', fleetGroupId: 'fleet-1',
  joinedAt: '2026-09-12T00:00:00.000Z',
};

/** The resume reply after the seat was released and claimed by another member. */
export function stationLostResumeReply(session = scientistSession, player = returningScientist) {
  return {
    session: { ...session, updatedAt: '2026-09-12T00:05:00.000Z' },
    player: { ...player, seatId: null, activeConsoleRoleId: null },
    stationSelectionRequired: true,
  };
}

/** The Scientist's per-tab Endeavour scouting draft key (ScoutRequestControls). */
export const SCIENTIST_SCOUT_DRAFT_KEY = 'pc10:scout-draft:s1:u1:endeavour';

type Handler = (data: Record<string, unknown>) => unknown;

function stationSelectionRequired(): never {
  throw Object.assign(new Error('station unavailable'), {
    code: 'functions/permission-denied',
    details: { commandError: 'station-selection-required' },
  });
}

const endeavourWorkspace = {
  status: 'ready', sessionId: 's1', cycle: 3, researchRevision: 0,
  cadence: { cycle: 3, revision: 0, choices: [] }, progress: { reactor: 1 },
  tracks: [{ trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5,
    currentMaterialCost: 7, complete: false }],
  shepherdOre: 10, fieldUpgradeState: { upgradeRevision: 0, targetsUsedThisCycle: 0 },
  scienceDevices: { revision: 0, ecmBuilt: false, detectorBuilt: false, ecmUsed: false,
    shepherdMaterials: 30, buildCosts: { 'ecm-device': 13, 'wolf-agent-detector': null } },
};

// The client's shared session-authority cursor (src/lib/sessionSnapshotAuthority)
// is module state and refuses an older server snapshot, so every scripted
// resume reply carries a strictly newer `updatedAt`, as the server's would.
let serverClock = Date.parse('2026-09-12T00:10:00.000Z');

function stampedResumeReply(): unknown {
  const reply = stationLossServer.resumeReply;
  if (typeof reply !== 'object' || reply === null || !('session' in reply)) return reply;
  serverClock += 1_000;
  const { session } = reply as { session: Record<string, unknown> };
  return { ...reply, session: { ...session, updatedAt: new Date(serverClock).toISOString() } };
}

function defaultHandlers(): Record<string, Handler> {
  return {
    resumeSession: () => stampedResumeReply(),
    // A deliberate reselect of the same station is accepted once the seat is free again.
    refreshPresence: (data) => ({ sessionId: data.sessionId }),
    // A craft scouting request needs the station selected on the server; a former holder is refused.
    requestScout: () => stationSelectionRequired(),
    // The server would refuse a former-station team action; a replay must not even be attempted.
    submitCivilUnrestGrievance: () => {
      throw Object.assign(new Error('not available'), {
        code: 'functions/permission-denied', details: { commandError: 'unauthorized' },
      });
    },
    listMyScoutReports: () => [],
    readEndeavourResearchWorkspace: () => endeavourWorkspace,
  };
}

/** Scripted callable boundary; every call is recorded by name in order. */
export const stationLossServer = {
  calls: [] as { readonly name: string; readonly data: Record<string, unknown> }[],
  resumeReply: stationLostResumeReply() as unknown,
  handlers: defaultHandlers(),
  reset(): void {
    this.calls.length = 0;
    this.resumeReply = stationLostResumeReply();
    this.handlers = defaultHandlers();
  },
  callsTo(name: string) {
    return this.calls.filter((call) => call.name === name);
  },
  async call(name: string, data: Record<string, unknown>): Promise<{ data: unknown }> {
    this.calls.push({ name, data });
    const handler = this.handlers[name];
    if (!handler) throw new Error(`Unexpected callable ${name}`);
    return { data: await handler(data) };
  },
};

/**
 * Model a same-tab reload: keep the persisted localStorage snapshot and the
 * per-tab sessionStorage drafts, drop every in-memory field, then rehydrate.
 * Unmount the previous render (RTL `cleanup`/`unmount`) before calling this.
 */
export async function reloadTab(): Promise<void> {
  const persisted = localStorage.getItem(SESSION_STORAGE_KEY);
  useSessionStore.getState().reset();
  if (persisted === null) localStorage.removeItem(SESSION_STORAGE_KEY);
  else localStorage.setItem(SESSION_STORAGE_KEY, persisted);
  await useSessionStore.persist.rehydrate();
}
