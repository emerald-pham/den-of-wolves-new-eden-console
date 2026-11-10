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
 * Usage from a route test: `vi.mock` calls are hoisted and must stay in the
 * test file, but their factories live here (`stationLossMocks`), each loaded
 * with a dynamic import so the fixture never imports a module it mocks:
 *
 *   vi.mock('firebase/functions', async () =>
 *     (await import('@/test/stationLossReconnect')).stationLossMocks.callableBoundary());
 *
 * then `await prepareReturningScientist()` in `beforeEach`, and call
 * `reloadTab()` to model a same-tab reload: the persisted localStorage
 * snapshot is rehydrated and per-tab sessionStorage drafts survive, exactly
 * as in a browser.
 *
 * Scenarios: Shepherd Scientist (Endeavour scout draft), Quellon Explorer
 * (route plan) and Wing Commander (Fighter Wing exchange draft, own session id).
 * `stationLostResumeReply(session, player)` builds the lost-station answer for
 * any of them.
 *
 * Later slices (L3.2 clocks, T2.2 roster change, T2.3 stale clock, L3.3 sparse
 * roster) can set `stationLossServer.resumeReply` to another server answer and
 * add callable handlers with `stationLossServer.handlers[name] = ...`. Two
 * caveats: (1) the client's session-authority cursor is module state keyed by
 * session and UID, so within one test file a later scenario for the same
 * session must not move backwards in cycle, phase revision or airspace (use a
 * new session id instead), and resume replies are stamped with a strictly newer
 * `updatedAt` for the same reason; (2) unhandled callables throw, which the app
 * shows as a communication error, so add handlers for whatever the route reads.
 *
 * Evidence class: local jsdom route test with the real client reconnect path
 * and a scripted callable boundary. It is not emulator, browser or deployed
 * gameplay evidence; `tests/reconnect/stationLossReconnect.emulator.test.ts`
 * proves the same server reply through real callables.
 */
import { vi } from 'vitest';
import { SESSION_STORAGE_KEY, useSessionStore } from '@/store/useSessionStore';
import { acknowledgeSessionWaiver } from '@/lib/sessionWaiver';
import { MOTION_SAFETY_STORAGE_KEY } from '@/lib/motionSafety';
import { findConsoleRole } from '@/data/roles';
import { replacementRoleFor } from '@/data/replacementRoles';
import type { GameSession, Player, WolfAttackMemberView } from '@/types/game';
import type * as FirebaseModule from '@/lib/firebase';
import type * as FirestoreModule from '@/lib/firestore';
import type * as SessionServiceModule from '@/lib/sessionService';

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

export const explorerSession = {
  id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
  currentTurn: 3, activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
  shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
  shipResources: { quellon: { food: 10, water: 10, ore: 0, fuel: 6, materials: 0, securityTeams: 0 } },
  maintenanceCycles: { quellon: { step: 3, revision: 3, turn: 3, charges: ['jump-drive'], refuelled: [], results: {} } },
  vesselActionRevisions: { quellon: 4 },
  playerDiscovery: {
    groupId: 'fleet-1', shipId: 'quellon', currentCoordinate: '0000', knownCoordinates: ['0000', '5143', '9997'],
    knownSystems: { 'system-01': '0000', 'system-02': '5143', 'system-04': '9997' },
    pursuitDistance: 0, navigationLogs: [], revision: 1,
  },
  shipGalacticCoordinates: { quellon: '0000' },
  shipNavigationLogs: { quellon: [] },
  turnPhase: {
    turn: 3, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z', openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  },
  createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z',
} as unknown as GameSession;

// Same session id and cycle as `scientistSession`: the client's authority cursor
// refuses a lifecycle regression (an older cycle) for one session and UID.

/** The Quellon Explorer holding the station when they went away. */
export const returningExplorer: Player = {
  uid: 'u1', sessionId: 's1', displayName: 'Explorer', role: 'player', seatId: 'quellon-explorer',
  assignedRoleId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1',
  joinedAt: '2026-11-05T00:00:00.000Z',
};

/** The Explorer's per-tab route plan key (ExplorerRoutePlanner, scoped to session and ship). */
export const EXPLORER_ROUTE_PLAN_KEY = 'dow.explorerRoutePlan.s1:quellon';

// A separate session id gives this scenario its own client authority cursor,
// so its lifecycle never has to be ordered against the scenarios above.
export const wingCommanderSession = {
  id: 's-wing', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
  currentTurn: 3, activeRoleIds: ['wing-commander'], activeVesselIds: ['aegis'],
  shipUpgrades: { aegis: [] },
  shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
  fighterWingCounts: {
    'fighter-wing-alpha': { count: 1, revision: 2 },
    'fighter-wing-bravo': { count: 4, revision: 5 },
  },
  // Lifted, like the other scenarios: restricted airspace would make the turn
  // coordinator ask the server to open airspace, which is outside this proof.
  turnPhase: {
    turn: 3, teamPhaseEndsAt: '2026-09-12T00:00:00.000Z', openAirspaceEndsAt: '2099-01-01T00:30:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
  createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z',
} as unknown as GameSession;

/** The Wing Commander holding the station when they went away. */
export const returningWingCommander: Player = {
  uid: 'u1', sessionId: 's-wing', displayName: 'Wing Commander', role: 'player', seatId: 'wing-commander',
  assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1',
  joinedAt: '2026-11-05T00:00:00.000Z',
};

/** The Wing Commander's fighter exchange draft key (sessionDraftStorage, kind aegis-fighter-exchange-draft). */
export const WING_EXCHANGE_DRAFT_KEY = 'pc10:aegis-fighter-exchange-draft:s-wing:u1:aegis';

/** The Scientist's per-tab Endeavour scouting draft key (ScoutRequestControls). */
export const SCIENTIST_SCOUT_DRAFT_KEY = 'pc10:scout-draft:s1:u1:endeavour';

type Handler = (data: Record<string, unknown>) => unknown;

function stationSelectionRequired(): never {
  throw Object.assign(new Error('station unavailable'), {
    code: 'functions/permission-denied',
    details: { commandError: 'station-selection-required' },
  });
}

function unauthorized(): never {
  throw Object.assign(new Error('not your team'), {
    code: 'functions/permission-denied',
    details: { commandError: 'unauthorized' },
  });
}

/** The five team pairs printed on the Civil Unrest card (functions/src/civilUnrest.ts). */
const CIVIL_UNREST_SHIP_IDS: readonly string[] = ['dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];

/**
 * As the server's submitCivilUnrestGrievance: the member's current role on the
 * server record (a replacement role, else the active console, else the
 * assigned team role; none while awaiting a re-role) must belong to the
 * affected Civil Unrest team. The scripted server record is the player in the
 * current resume reply. Joint engineering roles are not modelled.
 */
function grievanceTeamShip(): string | undefined {
  const reply = stationLossServer.resumeReply as { player?: Player } | undefined;
  const player = reply?.player;
  if (!player || player.replacementStatus != null) return undefined;
  const roleId = player.replacementRoleId ?? player.activeConsoleRoleId ?? player.assignedRoleId ?? undefined;
  if (!roleId) return undefined;
  const shipId = findConsoleRole(roleId)?.shipId ?? replacementRoleFor(roleId)?.vesselId;
  return shipId && CIVIL_UNREST_SHIP_IDS.includes(shipId) ? shipId : undefined;
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
    // As on the server: a grievance is authorized by the member's current team.
    // A lost station keeps the assigned team role, so a replayed grievance
    // commits; a role on another ship is refused without a write.
    submitCivilUnrestGrievance: (data) => {
      const shipId = grievanceTeamShip();
      if (!shipId || data.affectedShipId !== shipId) unauthorized();
      return { status: 'committed', requestId: data.requestId };
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

/**
 * `vi.mock` factories shared by the station-loss and roster-change route
 * tests. The reconnect, resume, outbox and station-selection code is real;
 * only the callable boundary, Auth, Firestore listeners, the periodic
 * heartbeat and unrelated GM/Wolf reads are replaced.
 */
export const stationLossMocks = {
  callableBoundary: () => ({
    httpsCallable: vi.fn((_functions: unknown, name: string) =>
      (data: Record<string, unknown>) => stationLossServer.call(name, data)),
  }),
  firebase: (original: typeof FirebaseModule) => ({
    ...original,
    auth: () => ({ currentUser: { uid: 'u1' } }),
    functions: vi.fn(() => ({ kind: 'functions' })),
  }),
  /** `realPresence` keeps the real heartbeat so a test can count it at the callable boundary. */
  sessionService: (original: typeof SessionServiceModule, { realPresence = false } = {}) => ({
    ...original,
    ...(realPresence ? {} : { refreshPresence: vi.fn().mockResolvedValue(undefined) }),
    reconcileGmAuthority: vi.fn().mockResolvedValue(undefined),
    refreshCommissarPurgeAuthority: vi.fn().mockResolvedValue(null),
    listGmInstances: vi.fn().mockResolvedValue([]),
    releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
    getWolfBoardingDefenceChoice: vi.fn(async () => null),
    getWolfRangeActionChoice: vi.fn(async () => null),
    getWolfForceFieldChoice: vi.fn(async () => null),
    popShipConfetti: vi.fn(),
  }),
  firestore: (original: typeof FirestoreModule) => ({
    ...original,
    sessionSnapshotAuthorityFor: vi.fn(() => ({ hasServerSessionAuthority: false })),
    subscribeSessionState: vi.fn(() => vi.fn()),
    subscribeCrisisReport: vi.fn(() => vi.fn()),
    subscribeConnectedPlayers: vi.fn(() => vi.fn()),
    subscribeLoyaltyCensus: vi.fn(() => vi.fn()),
    subscribeGmWolfHackingAlerts: vi.fn(() => vi.fn()),
    subscribePlayerHackingNotices: vi.fn(() => vi.fn()),
    subscribeGmInstances: vi.fn(() => vi.fn()),
    subscribeShipConfetti: vi.fn(() => vi.fn()),
    subscribeSessionEvents: vi.fn((_sessionId: string, onEvents: (events: never[]) => void) => {
      onEvents([]);
      return vi.fn();
    }),
    subscribeDamageDraws: vi.fn((_sessionId: string, onDraws: (draws: never[]) => void) => {
      onDraws([]);
      return vi.fn();
    }),
    subscribeVipCards: vi.fn(() => vi.fn()),
    subscribeWolfAttackMemberView: vi.fn((_sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
      onView(null);
      return vi.fn();
    }),
    subscribeShuttleDeparture: vi.fn((_sessionId: string, _shuttleId: string, onDeparture: (departure: null) => void) => {
      onDeparture(null);
      return vi.fn();
    }),
  }),
  versionUpgrade: () => ({ startVersionUpgradeMonitor: vi.fn(() => vi.fn()) }),
  endeavourEcmDevice: () => ({
    readEndeavourEcmDeviceWorkspace: vi.fn(async () => ({
      status: 'ready', sessionId: 's1', cycle: 3, controlRevision: 4,
      researchComplete: false, device: { status: 'ready', revision: 0 }, pursuit: { groupId: 'fleet-1', current: 8 },
    })),
    createEndeavourEcmDeviceAttempt: vi.fn(),
    activateEndeavourEcmDevice: vi.fn(),
    retryEndeavourEcmDeviceAttempt: vi.fn(),
  }),
};

/**
 * Shared `beforeEach`: clean browser storage with the motion and waiver gates
 * acknowledged, a reset scripted server that still confirms the Scientist's
 * station, and the Scientist seated in console mode.
 */
export async function prepareReturningScientist(): Promise<void> {
  const { subscribeSessionState } = await import('@/lib/firestore');
  vi.mocked(subscribeSessionState).mockImplementation(() => vi.fn());
  window.location.hash = '#/';
  sessionStorage.clear();
  localStorage.clear();
  localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  acknowledgeSessionWaiver(localStorage, Date.now());
  stationLossServer.reset();
  // Before the member goes away the server still confirms their station.
  stationLossServer.resumeReply = { session: scientistSession, player: returningScientist };
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity(scientistSession, returningScientist);
  state.setMode('console');
}
