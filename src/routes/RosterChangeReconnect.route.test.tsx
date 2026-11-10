// PC10.3 T2.2 (#253): a member whose role was reassigned while they were away
// reloads the same tab. The real reconnect path (connectAutomatically ->
// resumeSession -> outbox) must show the current entitled role, never replay a
// command queued under the former role, and keep each role's safe draft with
// that role only. The server half (a former actor's retry is refused without a
// write after a replacement assignment) is retained T1.2 evidence in
// scripts/pc10-3-stale-action-proof.mjs (`proveGrievanceStaleRace`, t1_2).
// T2.3 (#254): a member reloads after the all-player hold with a cached cycle
// clock whose deadline already passed; the server-resumed remaining time
// replaces it without opening airspace early or restarting the window. The
// browser half with natural presence expiry is
// scripts/test-pc10-3-all-player-disconnect.emulator.mjs.
// Fixture and evidence class: src/test/stationLossReconnect.ts.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '@/App';
import { useSessionStore } from '@/store/useSessionStore';
import {
  explorerSession, prepareReturningScientist, reloadTab, returningExplorer, returningScientist, SCIENTIST_SCOUT_DRAFT_KEY,
  scientistSession, stationLossServer,
} from '@/test/stationLossReconnect';
import type { GameSession, Player } from '@/types/game';

vi.mock('firebase/functions', async () =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.callableBoundary());
vi.mock('@/lib/firebase', async (importOriginal) =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.firebase(await importOriginal()));
vi.mock('@/lib/sessionService', async (importOriginal) =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.sessionService(await importOriginal()));
vi.mock('@/lib/firestore', async (importOriginal) =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.firestore(await importOriginal()));
vi.mock('@/lib/versionUpgrade', async () =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.versionUpgrade());
vi.mock('@/lib/endeavourEcmDeviceService', async () =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.endeavourEcmDevice());

const slow = { timeout: 10_000 };
const COMMS_SCOUT_DRAFT_KEY = 'pc10:scout-draft:s1:u1:comms-officer';
const endeavourCoordinate = async () => within(
  await screen.findByRole('region', { name: 'Endeavour scouting request' }, slow),
).getByLabelText('Printed system coordinate');
const commsForm = () => screen.findByRole('region', { name: 'Comms Officer scouting request' }, slow);

/** The server's resume reply after the facilitator moved the Scientist to Comms Officer while away. */
const reassignedScientist: Player = {
  ...returningScientist, seatId: null, activeConsoleRoleId: null, replacementRoleId: 'comms-officer',
};

beforeEach(prepareReturningScientist);

it('drops a command queued under the former role when the member returns reassigned, and shows the current role', async () => {
  const user = userEvent.setup();
  // The Scientist types an Endeavour scouting draft, then the tab goes away.
  window.location.hash = '#/shuttles/endeavour';
  const first = render(<App />);
  await waitFor(() => expect(useSessionStore.getState().connection).toBe('live'));
  await user.type(await endeavourCoordinate(), '4888');
  first.unmount();
  // A Team Phase grievance was queued after a transient failure while the Scientist role was held.
  useSessionStore.getState().enqueueCommand({
    id: 'queued-grievance', kind: 'submitCivilUnrestGrievance',
    payload: { sessionId: 's1', requestId: 'grievance-before-reassignment', crisisId: 'unrest-1',
      expectedCrisisRevision: 2, expectedGrievanceRevision: 0, affectedShipId: 'shepherd',
      visibility: 'private', text: 'Rations are short on the Shepherd.' },
    createdAt: new Date().toISOString(), queuedWithServerAuthority: true,
  });

  // While away, the facilitator assigned the Comms Officer replacement role.
  // The server's resume reply carries no station-selection signal for this case.
  stationLossServer.resumeReply = { session: scientistSession, player: reassignedScientist };
  await reloadTab();
  window.location.hash = '#/console';
  render(<App />);

  await waitFor(() => expect(useSessionStore.getState()).toMatchObject({
    connection: 'live', sessionSnapshotFreshness: 'server',
    me: { uid: 'u1', seatId: null, activeConsoleRoleId: null, replacementRoleId: 'comms-officer' },
  }));
  expect(await screen.findByRole('heading', { name: 'Stations and consoles' }, slow)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Comms Officer' })).toHaveTextContent(/assigned to you/i);
  expect(stationLossServer.callsTo('submitCivilUnrestGrievance')).toEqual([]);
  expect(useSessionStore.getState().pendingCommands).toEqual([]);
  expect(stationLossServer.callsTo('resumeSession').length).toBeGreaterThan(0);
}, 60_000);

it('keeps the Comms Officer scouting draft to that role across a reassignment reload and never sends it', async () => {
  const user = userEvent.setup();
  // The Scientist leaves an unsent Endeavour draft before being reassigned.
  sessionStorage.setItem(SCIENTIST_SCOUT_DRAFT_KEY, JSON.stringify({
    version: 1, sessionId: 's1', uid: 'u1', entitlementId: 'endeavour', targetCoordinate: '4888',
  }));
  stationLossServer.resumeReply = { session: scientistSession, player: reassignedScientist };
  await reloadTab();
  window.location.hash = '#/console';
  const first = render(<App />);
  await waitFor(() => expect(useSessionStore.getState().me?.replacementRoleId).toBe('comms-officer'));

  // The new role opens through the visible chooser link with an empty form: no cross-role draft.
  await user.click(await screen.findByRole('link', { name: 'Comms Officer' }, slow));
  let coordinate = within(await commsForm()).getByLabelText('Printed system coordinate');
  expect(coordinate).toHaveValue('');
  expect(screen.queryByRole('region', { name: 'Endeavour scouting request' })).not.toBeInTheDocument();
  await user.type(coordinate, '5143');
  expect(JSON.parse(sessionStorage.getItem(COMMS_SCOUT_DRAFT_KEY) ?? 'null'))
    .toMatchObject({ entitlementId: 'comms-officer', targetCoordinate: '5143' });
  first.unmount();

  // A later reload of the same replacement role restores its own draft without sending it.
  await reloadTab();
  window.location.hash = '#/replacement/comms-officer';
  render(<App />);
  coordinate = within(await commsForm()).getByLabelText('Printed system coordinate');
  expect(coordinate).toHaveValue('5143');
  // The former role's draft stays in its own per-tab key, untouched and unsent.
  expect(JSON.parse(sessionStorage.getItem(SCIENTIST_SCOUT_DRAFT_KEY) ?? 'null'))
    .toMatchObject({ entitlementId: 'endeavour', targetCoordinate: '4888' });
  expect(stationLossServer.callsTo('requestScout')).toEqual([]);
}, 60_000);

it('replaces a cached clock whose deadline passed during the hold with the server-resumed remaining time', async () => {
  // The cache was written before every member disconnected: Team Phase, airspace closed.
  const cachedAt = Date.now();
  const clockSession = {
    ...explorerSession, id: 's-clock', currentTurn: 1,
    turnPhase: {
      turn: 1, teamPhaseEndsAt: new Date(cachedAt - 20_000).toISOString(),
      openAirspaceEndsAt: new Date(cachedAt - 20_000 + 1_200_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as unknown as GameSession;
  const explorer: Player = { ...returningExplorer, sessionId: 's-clock' };
  // Meanwhile the server held the clock with 40 s left, then this member's
  // resume released the hold by shifting both deadlines forward.
  const resumedPhase = {
    turn: 1, teamPhaseEndsAt: new Date(cachedAt + 40_000).toISOString(),
    openAirspaceEndsAt: new Date(cachedAt + 40_000 + 1_200_000).toISOString(),
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  let answerResume: (() => void) | undefined;
  const resumeAnswered = new Promise<void>((resolve) => { answerResume = resolve; });
  stationLossServer.resumeReply = { session: { ...clockSession, turnPhase: resumedPhase }, player: explorer };
  const resume = stationLossServer.handlers.resumeSession!;
  stationLossServer.handlers.resumeSession = async (data) => { await resumeAnswered; return resume(data); };
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity(clockSession, explorer);
  state.setMode('console');
  await reloadTab();
  window.location.hash = '#/ships/quellon/roles/quellon-explorer';
  render(<App />);

  // The cached render cannot act on its passed deadline while the resume is outstanding.
  await waitFor(() => expect(stationLossServer.callsTo('resumeSession')).toHaveLength(1));
  expect(useSessionStore.getState().sessionSnapshotFreshness).not.toBe('server');
  expect(screen.queryByRole('status', { name: /^Airspace closed/ })).not.toBeInTheDocument();
  answerResume?.();

  const timer = await screen.findByRole('status', { name: /^Airspace closed \/\/ \d\d:\d\d remaining$/ }, slow);
  const [, minutes, seconds] = /(\d\d):(\d\d) remaining/.exec(timer.getAttribute('aria-label') ?? '') ?? [];
  const remaining = Number(minutes) * 60 + Number(seconds);
  // The server's remaining window, neither restarted (10:00) nor expired.
  expect(remaining).toBeGreaterThan(30);
  expect(remaining).toBeLessThanOrEqual(40);
  expect(useSessionStore.getState()).toMatchObject({
    connection: 'live', sessionSnapshotFreshness: 'server',
    session: { id: 's-clock', turnPhase: { teamPhaseEndsAt: resumedPhase.teamPhaseEndsAt } },
  });
  const persisted = JSON.parse(localStorage.getItem('dow-new-eden-session') ?? '{}') as {
    state?: { session?: { turnPhase?: { teamPhaseEndsAt?: string } } };
  };
  expect(persisted.state?.session?.turnPhase?.teamPhaseEndsAt).toBe(resumedPhase.teamPhaseEndsAt);
  expect(stationLossServer.callsTo('beginOpenAirspacePhase')).toEqual([]);
}, 60_000);
