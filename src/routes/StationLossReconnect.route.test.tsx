// PC10.3 L1.4 (#242) and T2.1 (#252): a returning member whose station was
// released and claimed while they were away reloads the same tab. The real
// reconnect path (connectAutomatically -> resumeSession -> outbox) must route
// them to the existing station chooser with the reselect instruction, keep the
// unsent draft for an explicit later submit, replay a queued command only by
// its original receipt for the server to re-authorize, and never let the
// outbox replace the reselect instruction (src/lib/stationLossOutbox.test.ts).
// Fixture and evidence class: src/test/stationLossReconnect.ts.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '@/App';
import { useSessionStore } from '@/store/useSessionStore';
import {
  EXPLORER_ROUTE_PLAN_KEY, explorerSession, prepareReturningScientist, reloadTab, returningExplorer, returningScientist,
  SCIENTIST_SCOUT_DRAFT_KEY, STATION_LOSS_NOTICE, stationLossServer, stationLostResumeReply, returningWingCommander,
  WING_EXCHANGE_DRAFT_KEY, wingCommanderSession,
} from '@/test/stationLossReconnect';

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

// Lazy route chunks can load slowly when the whole suite runs in parallel.
const slow = { timeout: 10_000 };
const { subscribeSessionState } = await import('@/lib/firestore');
const scoutForm = () => screen.findByRole('region', { name: 'Endeavour scouting request' }, slow);
const coordinate = async () => within(await scoutForm()).getByLabelText('Printed system coordinate');
const planner = () => screen.getByRole('region', { name: 'Explorer route planner' });
const storedDraft = () => JSON.parse(sessionStorage.getItem(SCIENTIST_SCOUT_DRAFT_KEY) ?? 'null') as unknown;

beforeEach(prepareReturningScientist);

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

it('replays a receipt-backed command queued before the station loss for the server to re-authorize, keeping the reselect instruction', async () => {
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
  expect(useSessionStore.getState().communicationError).toMatchObject({
    kind: 'station-selection-required', message: STATION_LOSS_NOTICE,
  });
  // Exactly one replay with the original request ID; the server re-authorized it through the team role.
  expect(stationLossServer.callsTo('submitCivilUnrestGrievance')).toEqual([
    expect.objectContaining({ data: expect.objectContaining({ requestId: 'grievance-before-loss' }) }),
  ]);
  expect(useSessionStore.getState().pendingCommands).toEqual([]);
  expect(storedDraft()).toMatchObject({ targetCoordinate: '4888' });

  await reselectAndReopenEndeavour(user);
  expect(await coordinate()).toHaveValue('4888');
  expect(stationLossServer.callsTo('submitCivilUnrestGrievance')).toHaveLength(1);
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
  // The App's retry and heartbeat intervals run on fake time from this render
  // on; waits for rendering still pass because fake time follows the real clock.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
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

    // The outstanding resume is retried at the slower 6 s pace while the listeners are live.
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    await waitFor(() => expect(resumeAttempts).toBe(2));
    expect(await screen.findByRole('heading', { name: 'Stations and consoles' }, slow)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(STATION_LOSS_NOTICE);
    expect(useSessionStore.getState().me).toMatchObject({ uid: 'u1', seatId: null, activeConsoleRoleId: null });
    expect(storedDraft()).toMatchObject({ targetCoordinate: '4888' });

    // The accepted resume ends the retry: no further resume over more than one retry interval.
    await act(async () => { await vi.advanceTimersByTimeAsync(7_000); });
    expect(resumeAttempts).toBe(2);
  } finally {
    vi.useRealTimers();
  }
}, 60_000);
