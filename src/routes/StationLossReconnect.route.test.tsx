// PC10.3 L1.4 (#242) and T2.1 (#252): a returning member whose station was
// released and claimed while they were away reloads the same tab. The real
// reconnect path (connectAutomatically -> resumeSession -> outbox) must route
// them to the existing station chooser with the reselect instruction, keep the
// unsent draft for an explicit later submit, and never replay a former-station
// command. Fixture and evidence class: src/test/stationLossReconnect.ts.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '@/App';
import { useSessionStore } from '@/store/useSessionStore';
import { acknowledgeSessionWaiver } from '@/lib/sessionWaiver';
import { MOTION_SAFETY_STORAGE_KEY } from '@/lib/motionSafety';
import {
  EXPLORER_ROUTE_PLAN_KEY, explorerSession, reloadTab, returningExplorer, returningScientist, SCIENTIST_SCOUT_DRAFT_KEY, scientistSession, STATION_LOSS_NOTICE,
  stationLossServer, stationLostResumeReply, returningWingCommander, WING_EXCHANGE_DRAFT_KEY, wingCommanderSession,
} from '@/test/stationLossReconnect';
import type { WolfAttackMemberView } from '@/types/game';
import type * as FirebaseModule from '@/lib/firebase';
import type * as FirestoreModule from '@/lib/firestore';
import type * as SessionServiceModule from '@/lib/sessionService';

vi.mock('firebase/functions', async () => {
  const { stationLossServer: server } = await import('@/test/stationLossReconnect');
  return {
    httpsCallable: vi.fn((_functions: unknown, name: string) =>
      (data: Record<string, unknown>) => server.call(name, data)),
  };
});
vi.mock('@/lib/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof FirebaseModule>()),
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));
// The reconnect, resume, outbox and station-selection code is real. Only the
// periodic heartbeat and unrelated GM/Wolf reads are stubbed.
vi.mock('@/lib/sessionService', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionServiceModule>()),
  refreshPresence: vi.fn().mockResolvedValue(undefined),
  reconcileGmAuthority: vi.fn().mockResolvedValue(undefined),
  refreshCommissarPurgeAuthority: vi.fn().mockResolvedValue(null),
  listGmInstances: vi.fn().mockResolvedValue([]),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
  getWolfBoardingDefenceChoice: vi.fn(async () => null),
  getWolfRangeActionChoice: vi.fn(async () => null),
  getWolfForceFieldChoice: vi.fn(async () => null),
  popShipConfetti: vi.fn(),
}));
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof FirestoreModule>()),
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
  subscribeShuttleDeparture: vi.fn((_sessionId, _shuttleId, onDeparture: (departure: null) => void) => {
    onDeparture(null);
    return vi.fn();
  }),
}));
vi.mock('@/lib/versionUpgrade', () => ({ startVersionUpgradeMonitor: vi.fn(() => vi.fn()) }));
vi.mock('@/lib/endeavourEcmDeviceService', () => ({
  readEndeavourEcmDeviceWorkspace: vi.fn(async () => ({
    status: 'ready', sessionId: 's1', cycle: 3, controlRevision: 4,
    researchComplete: false, device: { status: 'ready', revision: 0 }, pursuit: { groupId: 'fleet-1', current: 8 },
  })),
  createEndeavourEcmDeviceAttempt: vi.fn(),
  activateEndeavourEcmDevice: vi.fn(),
  retryEndeavourEcmDeviceAttempt: vi.fn(),
}));

// Lazy route chunks can load slowly when the whole suite runs in parallel.
const slow = { timeout: 10_000 };
const { subscribeSessionState } = await import('@/lib/firestore');
const scoutForm = () => screen.findByRole('region', { name: 'Endeavour scouting request' }, slow);
const coordinate = async () => within(await scoutForm()).getByLabelText('Printed system coordinate');
const planner = () => screen.getByRole('region', { name: 'Explorer route planner' });
const storedDraft = () => JSON.parse(sessionStorage.getItem(SCIENTIST_SCOUT_DRAFT_KEY) ?? 'null') as unknown;

beforeEach(() => {
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
});

/** The Scientist types a coordinate on the Endeavour, then the tab goes away before submitting. */
async function typeDraftThenLeave(user: ReturnType<typeof userEvent.setup>) {
  window.location.hash = '#/shuttles/endeavour';
  const view = render(<App />);
  await waitFor(() => expect(useSessionStore.getState().connection).toBe('live'));
  await user.type(await coordinate(), '4888');
  expect(storedDraft()).toMatchObject({ targetCoordinate: '4888' });
  view.unmount();
}

/** Reselect the Scientist from the chooser and reopen the Endeavour through visible controls. */
async function reselectAndReopenEndeavour(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
  await user.click(screen.getByRole('link', { name: /shepherd \/\/ scientist/i }));
  expect(await screen.findByRole('heading', { name: 'Shepherd' }, slow)).toBeInTheDocument();
  await waitFor(() => expect(useSessionStore.getState().me?.activeConsoleRoleId).toBe('shepherd-scientist'));
  await user.click(screen.getByRole('button', { name: 'Ship systems' }));
  await user.click(screen.getByRole('link', { name: /open endeavour shuttle console/i }));
}

it('reloads a member who lost the station while away into the chooser and restores the unsent draft only after reselect', async () => {
  const user = userEvent.setup();
  await typeDraftThenLeave(user);

  // While away, the seat was released and claimed by another member.
  stationLossServer.resumeReply = stationLostResumeReply();
  await reloadTab();
  expect(useSessionStore.getState().lastRoute).toBe('/shuttles/endeavour');
  window.location.hash = '#/';
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Stations and consoles' }, slow)).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent(STATION_LOSS_NOTICE);
  expect(window.location.hash).toBe('#/console');
  expect(useSessionStore.getState()).toMatchObject({
    session: { id: 's1' },
    me: { uid: 'u1', sessionId: 's1', seatId: null, activeConsoleRoleId: null },
    connection: 'live',
    sessionSnapshotFreshness: 'server',
  });
  expect(screen.queryByRole('region', { name: 'Endeavour scouting request' })).not.toBeInTheDocument();
  expect(storedDraft()).toMatchObject({ targetCoordinate: '4888' });

  // The station is free again; a deliberate reselect refills the draft without sending it.
  await reselectAndReopenEndeavour(user);
  expect(await coordinate()).toHaveValue('4888');
  expect(stationLossServer.callsTo('refreshPresence')).toEqual([
    expect.objectContaining({ data: expect.objectContaining({ activeConsoleRoleId: 'shepherd-scientist' }) }),
  ]);
  expect(stationLossServer.callsTo('requestScout')).toEqual([]);
}, 60_000);

it('drops a former-station command queued before the station was lost instead of replaying it on reconnect', async () => {
  const user = userEvent.setup();
  await typeDraftThenLeave(user);

  // A Team Phase grievance was queued after a transient failure while the station was still held.
  useSessionStore.getState().enqueueCommand({
    id: 'queued-grievance', kind: 'submitCivilUnrestGrievance',
    payload: { sessionId: 's1', requestId: 'grievance-before-loss', crisisId: 'unrest-1',
      expectedCrisisRevision: 2, expectedGrievanceRevision: 0, affectedShipId: 'shepherd',
      visibility: 'private', text: 'Rations are short on the Shepherd.' },
    createdAt: new Date().toISOString(), queuedWithServerAuthority: true,
  });
  stationLossServer.resumeReply = stationLostResumeReply();
  await reloadTab();
  expect(useSessionStore.getState().pendingCommands).toHaveLength(1);
  window.location.hash = '#/';
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Stations and consoles' }, slow)).toBeInTheDocument();
  await waitFor(() => expect(useSessionStore.getState().connection).toBe('live'));
  expect(screen.getByRole('alert')).toHaveTextContent(STATION_LOSS_NOTICE);
  expect(useSessionStore.getState().communicationError?.kind).toBe('station-selection-required');
  expect(stationLossServer.callsTo('submitCivilUnrestGrievance')).toEqual([]);
  expect(useSessionStore.getState().pendingCommands).toEqual([]);
  expect(storedDraft()).toMatchObject({ targetCoordinate: '4888' });

  await reselectAndReopenEndeavour(user);
  expect(await coordinate()).toHaveValue('4888');
  expect(stationLossServer.callsTo('submitCivilUnrestGrievance')).toEqual([]);
  expect(stationLossServer.callsTo('requestScout')).toEqual([]);
}, 60_000);

// L3.1 (#247) targeted gap: the Quellon Explorer's per-tab route plan had no
// station-loss proof. The same reload path keeps it until a deliberate reselect.
it('keeps the Quellon Explorer route plan through a station loss reload and restores it after reselect', async () => {
  const user = userEvent.setup();
  stationLossServer.resumeReply = { session: explorerSession, player: returningExplorer };
  useSessionStore.getState().setIdentity(explorerSession, returningExplorer);
  window.location.hash = '#/ships/quellon/roles/quellon-explorer';
  const first = render(<App />);
  await waitFor(() => expect(useSessionStore.getState().connection).toBe('live'));
  await user.click(await screen.findByRole('button', { name: 'Navigation' }, slow));
  await user.selectOptions(within(planner()).getByLabelText('Known route destination'), '9997');
  expect(sessionStorage.getItem(EXPLORER_ROUTE_PLAN_KEY)).toBe('9997');
  first.unmount();

  stationLossServer.resumeReply = stationLostResumeReply(explorerSession, returningExplorer);
  await reloadTab();
  window.location.hash = '#/';
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Stations and consoles' }, slow)).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent(STATION_LOSS_NOTICE);
  expect(useSessionStore.getState().me).toMatchObject({ uid: 'u1', seatId: null, activeConsoleRoleId: null });
  expect(screen.queryByRole('region', { name: 'Explorer route planner' })).not.toBeInTheDocument();
  expect(sessionStorage.getItem(EXPLORER_ROUTE_PLAN_KEY)).toBe('9997');

  await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
  await user.click(screen.getByRole('link', { name: /quellon \/\/ explorer/i }));
  await waitFor(() => expect(useSessionStore.getState().me?.activeConsoleRoleId).toBe('quellon-explorer'));
  await user.click(await screen.findByRole('button', { name: 'Navigation' }, slow));
  expect(within(planner()).getByLabelText('Known route destination')).toHaveValue('9997');
  expect(stationLossServer.callsTo('jumpShip')).toEqual([]);
}, 60_000);

// L3.1 (#247) targeted gap: the Wing Commander's Fighter Wing exchange draft
// (sessionDraftStorage) had Back coverage only, not a station-loss reload.
it('keeps the Wing Commander fighter exchange draft through a station loss reload and restores it after reselect', async () => {
  const user = userEvent.setup();
  stationLossServer.resumeReply = { session: wingCommanderSession, player: returningWingCommander };
  useSessionStore.getState().setIdentity(wingCommanderSession, returningWingCommander);
  window.location.hash = '#/ships/aegis/roles/wing-commander';
  const first = render(<App />);
  await waitFor(() => expect(useSessionStore.getState().connection).toBe('live'));
  let exchange = await screen.findByRole('region', { name: 'Fighter Wing exchange' }, slow);
  await user.selectOptions(within(exchange).getByRole('combobox', { name: 'Move fighters from' }), 'fighter-wing-bravo');
  await user.selectOptions(within(exchange).getByRole('combobox', { name: 'Fighters to move' }), '2');
  expect(JSON.parse(sessionStorage.getItem(WING_EXCHANGE_DRAFT_KEY) ?? 'null'))
    .toMatchObject({ value: { sourceWingId: 'fighter-wing-bravo', amount: 2 } });
  first.unmount();

  stationLossServer.resumeReply = stationLostResumeReply(wingCommanderSession, returningWingCommander);
  await reloadTab();
  window.location.hash = '#/';
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Stations and consoles' }, slow)).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent(STATION_LOSS_NOTICE);
  expect(useSessionStore.getState().me).toMatchObject({ uid: 'u1', seatId: null, activeConsoleRoleId: null });
  expect(screen.queryByRole('region', { name: 'Fighter Wing exchange' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
  await user.click(screen.getByRole('link', { name: /aegis \/\/ wing commander/i }));
  await waitFor(() => expect(useSessionStore.getState().me?.activeConsoleRoleId).toBe('wing-commander'));
  exchange = await screen.findByRole('region', { name: 'Fighter Wing exchange' }, slow);
  expect(within(exchange).getByRole('combobox', { name: 'Move fighters from' })).toHaveValue('fighter-wing-bravo');
  expect(within(exchange).getByRole('combobox', { name: 'Fighters to move' })).toHaveValue('2');
  expect(stationLossServer.callsTo('exchangeAegisFighterWings')).toEqual([]);
}, 60_000);

// L1.4 (#242), reported by the L1.1-L1.3 browser proof: after a reload while
// the backend is unreachable, the live listeners can report a fresh server
// snapshot before the 2 s retry. The retry must still run resumeSession, whose
// reply carries the station-loss signal; listener freshness is not a resume.
it('still resumes after the listeners reconnect first, so a member who lost the station reaches the chooser', async () => {
  const user = userEvent.setup();
  await typeDraftThenLeave(user);

  let handlers: Parameters<typeof subscribeSessionState>[2] | undefined;
  vi.mocked(subscribeSessionState).mockImplementation((_sessionId, _uid, next) => {
    handlers = next;
    return vi.fn();
  });
  // The first resume after the reload cannot reach the backend; later ones answer that the station was lost.
  let resumeAttempts = 0;
  stationLossServer.resumeReply = stationLostResumeReply();
  const answerResume = stationLossServer.handlers.resumeSession!;
  stationLossServer.handlers.resumeSession = (data) => {
    resumeAttempts += 1;
    if (resumeAttempts === 1) {
      throw Object.assign(new Error('backend unreachable'), { code: 'functions/unavailable' });
    }
    return answerResume(data);
  };
  await reloadTab();
  window.location.hash = '#/';
  render(<App />);
  await waitFor(() => expect(resumeAttempts).toBe(1));
  await waitFor(() => expect(useSessionStore.getState().connection).toBe('offline'));
  await waitFor(() => expect(handlers).toBeDefined());

  // The listeners recover before the retry tick, with the player's cached station still on the server record.
  act(() => {
    handlers?.onSessionFreshness?.(true);
    handlers?.onPlayer?.({ ...returningScientist, seatId: null });
    handlers?.onPlayerFreshness?.(true);
  });
  expect(useSessionStore.getState().connection).toBe('live');

  await waitFor(() => expect(resumeAttempts).toBe(2), { timeout: 5_000 });
  expect(await screen.findByRole('heading', { name: 'Stations and consoles' }, slow)).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent(STATION_LOSS_NOTICE);
  expect(useSessionStore.getState().me).toMatchObject({ uid: 'u1', seatId: null, activeConsoleRoleId: null });
  expect(storedDraft()).toMatchObject({ targetCoordinate: '4888' });
}, 60_000);
