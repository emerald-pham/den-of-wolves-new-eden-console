import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { acceptServerSessionAuthority, sessionSnapshotAuthorityFor } from '@/lib/sessionSnapshotAuthority';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ functions: vi.fn(() => ({ kind: 'functions' })) }));
const { httpsCallable } = await import('firebase/functions');
import ScoutReportController from './ScoutReportController';

let fixture = 0, tick = 1000;
let sessionId: string;
const requestId = 'original-scout', noteId = 'a'.repeat(64);
const fact = { coordinate: '6798', code: 'N', title: 'Ancient Jump Ring' };
const report = { requestId, cycle: 1, entitlementId: 'endeavour', targetCoordinate: '6798', status: 'resolved', noteId };
const result = () => ({ type: 'private-scout-result', sessionId, requestId,
  requesterUid: 'original-scientist', sourceId: 'endeavour', cycle: 1, targetCoordinate: '6798', systemFact: fact });
const note = { type: 'player-discovery-note', id: noteId, cycle: 1, targetCoordinate: '6798', systemFact: fact,
  recordedAt: '2026-10-08T05:57:56.000Z' };
function deferred() {
  let resolve!: (value: { data: unknown }) => void;
  const promise = new Promise<{ data: unknown }>(done => { resolve = done; });
  return { promise, resolve };
}
function acceptNewServerProjection() {
  const store = useSessionStore.getState();
  const next = { ...store.session!, updatedAt: new Date(++tick * 1000).toISOString() };
  expect(acceptServerSessionAuthority(sessionSnapshotAuthorityFor(sessionId, 'original-scientist'),
    next, { seconds: tick, nanoseconds: 0 })).toBe(true);
  useSessionStore.setState({ session: next });
}
function wire(privateRead: ReturnType<typeof vi.fn>, noteRead = vi.fn().mockResolvedValue({ data: note })) {
  const index = vi.fn().mockImplementation(() => Promise.resolve({ data:
    useSessionStore.getState().me?.uid === 'original-scientist' ? [report] : [] }));
  vi.mocked(httpsCallable).mockImplementation((_functions, name) => {
    if (name === 'listMyScoutReports') return index as never;
    if (name === 'readPrivateScoutResult') return privateRead as never;
    if (name === 'readMyScoutDiscoveryNote') return noteRead as never;
    throw new Error(`Unexpected read ${name}`);
  });
  return { index, noteRead };
}
beforeEach(() => {
  fixture++; sessionId = `report-race-${fixture}`; tick = 1000;
  vi.mocked(httpsCallable).mockReset(); useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({ id: sessionId, name: 'Table', joinCode: '123456',
    phase: 'active', currentTurn: 1, ownerUid: 'ordinary-gm', createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: new Date(tick * 1000).toISOString() }, {
    uid: 'original-scientist', sessionId, displayName: 'Scientist', role: 'player',
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', seatId: 'shepherd-scientist',
    fleetGroupId: 'fleet-1', connectionGeneration: 2, joinedAt: '2026-10-08T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live'); useSessionStore.getState().setSessionSnapshotFreshness('server');
  expect(acceptServerSessionAuthority(sessionSnapshotAuthorityFor(sessionId, 'original-scientist'),
    useSessionStore.getState().session!, { seconds: tick, nanoseconds: 0 })).toBe(true);
});

it('discards an invalidated private reply, then renders only the guarded current retry and durable note', async () => {
  const old = deferred(), current = deferred();
  const privateRead = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const { noteRead } = wire(privateRead); render(<ScoutReportController refreshKey="original" />);
  await waitFor(() => expect(privateRead).toHaveBeenCalledTimes(1));
  await act(async () => { acceptNewServerProjection(); old.resolve({ data: result() }); });
  expect(screen.queryByText(fact.title)).not.toBeInTheDocument(); expect(noteRead).not.toHaveBeenCalled();
  await waitFor(() => expect(privateRead).toHaveBeenCalledTimes(2), { timeout: 2000 });
  expect(screen.queryByText(fact.title)).not.toBeInTheDocument();
  await act(async () => { current.resolve({ data: result() }); });
  await screen.findByText(fact.title); await screen.findByText('Discovery note saved for this station.');
  expect(privateRead).toHaveBeenNthCalledWith(2, { sessionId, requestId });
  expect(noteRead).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Scout reports could not load. Reconnect and refresh this station.')).not.toBeInTheDocument();
});

it('recovers a note invalidated after the private result without accepting the old note', async () => {
  const oldNote = deferred(), currentNote = deferred();
  const privateRead = vi.fn().mockResolvedValue({ data: result() });
  const noteRead = vi.fn().mockReturnValueOnce(oldNote.promise).mockReturnValueOnce(currentNote.promise);
  wire(privateRead, noteRead); render(<ScoutReportController refreshKey="original" />);
  await waitFor(() => expect(noteRead).toHaveBeenCalledTimes(1));
  await act(async () => { acceptNewServerProjection(); oldNote.resolve({ data: note }); });
  expect(screen.queryByText('Discovery note saved for this station.')).not.toBeInTheDocument();
  await waitFor(() => expect(noteRead).toHaveBeenCalledTimes(2), { timeout: 2000 });
  expect(privateRead).toHaveBeenCalledTimes(2);
  await act(async () => { currentNote.resolve({ data: note }); });
  await screen.findByText(fact.title); await screen.findByText('Discovery note saved for this station.');
  expect(screen.queryByText('The saved note is unavailable for this ship or fleet group.')).not.toBeInTheDocument();
});

it('stops after two stale-authority retries while retaining the offered refresh control', async () => {
  const privateRead = vi.fn().mockImplementation(async () => {
    acceptNewServerProjection(); return { data: result() };
  });
  wire(privateRead); render(<ScoutReportController refreshKey="original" />);
  await waitFor(() => expect(privateRead).toHaveBeenCalledTimes(3), { timeout: 3500 });
  await screen.findByText('Scout reports could not load. Reconnect and refresh this station.');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
  expect(privateRead).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('button', { name: 'Refresh reports' })).toBeEnabled();
  expect(screen.queryByText(fact.title)).not.toBeInTheDocument();
});

it('does not retry a late original private reply after a different actor becomes current', async () => {
  const old = deferred(), privateRead = vi.fn().mockReturnValue(old.promise), { noteRead } = wire(privateRead);
  render(<ScoutReportController refreshKey="original" />);
  await waitFor(() => expect(privateRead).toHaveBeenCalledTimes(1));
  await act(async () => {
    useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'ordinary-peer' });
    old.resolve({ data: result() });
  });
  await screen.findByText('No scouting requests recorded yet.');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
  expect(privateRead).toHaveBeenCalledTimes(1); expect(noteRead).not.toHaveBeenCalled();
  expect(screen.queryByText(fact.title)).not.toBeInTheDocument();
});

it('does not retry or display an invalid chart-bearing HTTP200 private payload', async () => {
  const privateRead = vi.fn().mockResolvedValue({ data: { ...result(), organiserSites: { N: '6798' } } });
  const { noteRead } = wire(privateRead); render(<ScoutReportController refreshKey="original" />);
  await screen.findByText('Scout reports could not load. Reconnect and refresh this station.');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
  expect(privateRead).toHaveBeenCalledTimes(1); expect(noteRead).not.toHaveBeenCalled();
  expect(screen.queryByText(fact.title)).not.toBeInTheDocument();
});
