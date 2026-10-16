import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const api = vi.hoisted(() => ({
  listMyScoutReports: vi.fn(), readPrivateScoutResult: vi.fn(),
  readMyScoutDiscoveryNote: vi.fn(), listPendingScoutRequests: vi.fn(),
  resolvePendingScoutRequest: vi.fn(), listGmScoutResolutionLog: vi.fn(),
}));
vi.mock('@/lib/scoutResultService', () => api);

import ScoutReportController from './ScoutReportController';
import GmScoutRevealController from './GmScoutRevealController';
import type { SessionPhase } from '@/types/game';

const result = {
  type: 'private-scout-result', sessionId: 's1', requestId: 'r1', requesterUid: 'u1',
  sourceId: 'endeavour', cycle: 2, targetCoordinate: '0408',
  systemFact: { coordinate: '0408', code: 'O', title: 'Deep Nebula' },
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listGmScoutResolutionLog.mockResolvedValue([]);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table', joinCode: '4821', phase: 'active', currentTurn: 2,
    ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Scientist', role: 'player',
    seatId: 'shepherd-scientist', assignedRoleId: 'shepherd-scientist',
    joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('loads a resolved Scientist report and one saved note after reconnect', async () => {
  api.listMyScoutReports.mockResolvedValue([{ requestId: 'r1', cycle: 2,
    entitlementId: 'endeavour', targetCoordinate: '0408', status: 'resolved',
    noteId: 'a'.repeat(64) }]);
  api.readPrivateScoutResult.mockResolvedValue(result);
  api.readMyScoutDiscoveryNote.mockResolvedValue({
    type: 'player-discovery-note', id: 'a'.repeat(64), cycle: 2,
    targetCoordinate: '0408', systemFact: result.systemFact,
    recordedAt: '2026-09-27T21:40:00.000Z',
  });
  render(<ScoutReportController refreshKey="" />);
  await waitFor(() => expect(screen.getByRole('region', { name: 'Endeavour scout report' }))
    .toHaveTextContent('Deep Nebula'));
  expect(screen.getByText(/discovery note saved/i)).toBeVisible();
  expect(api.readPrivateScoutResult).toHaveBeenCalledWith('r1');
});

it('lets the Scientist revisit an older saved report one fact at a time', async () => {
  api.listMyScoutReports.mockResolvedValue([
    { requestId: 'r2', cycle: 3, entitlementId: 'endeavour',
      targetCoordinate: '5143', status: 'pending', noteId: null },
    { requestId: 'r1', cycle: 2, entitlementId: 'endeavour',
      targetCoordinate: '0408', status: 'resolved', noteId: 'a'.repeat(64) },
  ]);
  api.readPrivateScoutResult.mockResolvedValue(result);
  api.readMyScoutDiscoveryNote.mockResolvedValue({
    type: 'player-discovery-note', id: 'a'.repeat(64), cycle: 2,
    targetCoordinate: '0408', systemFact: result.systemFact,
    recordedAt: '2026-09-27T21:40:00.000Z',
  });
  render(<ScoutReportController refreshKey="" />);
  await screen.findByText(/awaiting automatic scout result/i);
  fireEvent.change(screen.getByRole('combobox', { name: /saved scout request/i }),
    { target: { value: 'r1' } });
  await waitFor(() => expect(screen.getByRole('region', { name: 'Endeavour scout report' }))
    .toHaveTextContent('Deep Nebula'));
  expect(api.readPrivateScoutResult).toHaveBeenCalledWith('r1');
});

it('lets the live GM reveal one pending request and refreshes the queue', async () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'gm1', role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'browser-1', sessionId: 's1', uid: 'gm1', name: 'GM', deviceLabel: 'Laptop',
    claimedAt: { toMillis: () => Date.now() } as never,
  });
  api.listPendingScoutRequests.mockResolvedValueOnce([{ requestId: 'r1', cycle: 2,
    entitlementId: 'endeavour', anchorShipId: 'shepherd', targetCoordinate: '0408' }])
    .mockResolvedValueOnce([]);
  api.resolvePendingScoutRequest.mockResolvedValue(result);
  render(<GmScoutRevealController />);
  const reveal = await screen.findByRole('button', { name: /reveal endeavour scout at 0408/i });
  fireEvent.click(reveal);
  await waitFor(() => expect(api.resolvePendingScoutRequest).toHaveBeenCalledWith('r1'));
  await waitFor(() => expect(screen.getByText(/deep nebula/i)).toBeVisible());
  expect(screen.getByText(/no scout requests are awaiting/i)).toBeVisible();
});

it('clears a previous unavailable message when an ordinary queue refresh succeeds', async () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'gm1', role: 'gm' });
  useSessionStore.getState().setGmInstance({ id: 'browser-1', sessionId: 's1', uid: 'gm1' } as never);
  api.listPendingScoutRequests.mockRejectedValueOnce(new Error('temporary read failure'))
    .mockResolvedValueOnce([{ requestId: 'r1', cycle: 2, entitlementId: 'endeavour',
      anchorShipId: 'shepherd', targetCoordinate: '0408' }]);
  render(<GmScoutRevealController />);
  await screen.findByText('Scout queue unavailable. Reconnect and refresh.');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh scout queue' }));
  await screen.findByRole('button', { name: /reveal endeavour scout at 0408/i });
  expect(screen.queryByText('Scout queue unavailable. Reconnect and refresh.')).not.toBeInTheDocument();
});


it('receives an automatic result without a player refresh or GM reveal', async () => {
  api.listMyScoutReports.mockResolvedValueOnce([{ requestId: 'r1', cycle: 2,
    entitlementId: 'endeavour', targetCoordinate: '0408', status: 'pending', noteId: null }])
    .mockResolvedValue([{ requestId: 'r1', cycle: 2, entitlementId: 'endeavour',
      targetCoordinate: '0408', status: 'resolved', noteId: 'a'.repeat(64) }]);
  api.readPrivateScoutResult.mockResolvedValue(result);
  api.readMyScoutDiscoveryNote.mockResolvedValue({ type: 'player-discovery-note',
    id: 'a'.repeat(64), cycle: 2, targetCoordinate: '0408', systemFact: result.systemFact,
    recordedAt: '2026-09-27T21:40:00.000Z' });
  render(<ScoutReportController refreshKey="" />);
  await screen.findByText(/awaiting automatic scout result/i);
  await waitFor(() => expect(screen.getByText('Deep Nebula')).toBeVisible(), { timeout: 2500 });
  expect(api.resolvePendingScoutRequest).not.toHaveBeenCalled();
});

it('shows the automatic GM result log and labels manual resolution as recovery', async () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'gm1', role: 'gm' });
  useSessionStore.getState().setGmInstance({ id: 'browser-1', sessionId: 's1', uid: 'gm1' } as never);
  api.listPendingScoutRequests.mockResolvedValue([]);
  api.listGmScoutResolutionLog.mockResolvedValue([{ requestId: 'r1', cycle: 2,
    sourceId: 'comms-officer', originShipId: 'aegis', receivingShipId: 'aegis',
    targetCoordinate: '0408', systemFact: result.systemFact,
    recordedAt: '2026-09-27T21:40:00.000Z', resolutionMode: 'automatic' }]);
  render(<GmScoutRevealController />);
  await waitFor(() => expect(screen.getByRole('region', { name: 'GM scouting result log' }))
    .toHaveTextContent('Comms Officer // 0408 // Deep Nebula'));
  expect(screen.getByText(/automatic server resolution/i)).toBeVisible();
  expect(screen.getByText(/use recovery only/i)).toBeVisible();
});


it('delivers the Comms Officer automatic report in its current replacement station', async () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementRoleId: 'comms-officer' });
  api.listMyScoutReports.mockResolvedValue([{ requestId: 'r1', cycle: 2,
    entitlementId: 'comms-officer', targetCoordinate: '0408', status: 'resolved', noteId: 'a'.repeat(64) }]);
  api.readPrivateScoutResult.mockResolvedValue({ ...result, sourceId: 'comms-officer' });
  api.readMyScoutDiscoveryNote.mockResolvedValue({ type: 'player-discovery-note',
    id: 'a'.repeat(64), cycle: 2, targetCoordinate: '0408', systemFact: result.systemFact,
    recordedAt: '2026-09-27T21:40:00.000Z' });
  render(<ScoutReportController refreshKey="" entitlementId="comms-officer" />);
  await waitFor(() => expect(screen.getByRole('region', { name: 'Comms Officer scout report' }))
    .toHaveTextContent('Deep Nebula'));
});

function ownedGm(phase: SessionPhase = 'active') {
  useSessionStore.setState(state => ({ session: { ...state.session!, phase },
    me: { ...state.me!, uid: 'gm1', role: 'gm' },
    gmInstance: { id: 'browser-1', sessionId: 's1', uid: 'gm1', name: 'GM', deviceLabel: 'Laptop',
      claimedAt: '2026-10-05T12:00:00.000Z' } }));
  api.listPendingScoutRequests.mockResolvedValue([]);
}

it.each(['lobby', 'casting', 'briefing'] as const)(
  'does not query or keep polling the active-only GM scouting lists during %s', async phase => {
    ownedGm(phase);
    useSessionStore.setState(state => ({ session: { ...state.session!, currentTurn: 0 } }));
    vi.useFakeTimers();
    try {
      render(<GmScoutRevealController />);
      await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });
      expect(api.listPendingScoutRequests).not.toHaveBeenCalled();
      expect(api.listGmScoutResolutionLog).not.toHaveBeenCalled();
      expect(screen.getByText(/Awaiting GM start.*scouting results/)).toBeVisible();
      expect(screen.queryByText('Scout queue unavailable. Reconnect and refresh.')).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  },
);

it.each(['success', 'failure', 'debrief', 'closed', 'retained-empty'] as const)(
  'does not issue the source-denied GM scouting reads after %s', async phase => {
    ownedGm(phase);
    render(<GmScoutRevealController />);
    await act(async () => {});
    expect(api.listPendingScoutRequests).not.toHaveBeenCalled();
    expect(api.listGmScoutResolutionLog).not.toHaveBeenCalled();
    expect(screen.getByText(/Game ended.*scout recovery.*unavailable/)).toBeVisible();
  },
);

it('starts both scouting reads under the same owned GM after the active phase arrives', async () => {
  ownedGm('casting');
  render(<GmScoutRevealController />);
  expect(api.listPendingScoutRequests).not.toHaveBeenCalled();
  await act(async () => useSessionStore.setState(state => ({ session: { ...state.session!, phase: 'active' } })));
  await screen.findByRole('region', { name: 'GM scouting result log' });
  expect(api.listPendingScoutRequests).toHaveBeenCalledTimes(1);
  expect(api.listGmScoutResolutionLog).toHaveBeenCalledTimes(1);
  expect(useSessionStore.getState().me?.uid).toBe('gm1');
});

it('retains the source-valid active-phase Cycle 0 reads instead of manufacturing a cycle restriction', async () => {
  ownedGm();
  useSessionStore.setState(state => ({ session: { ...state.session!, currentTurn: 0 } }));
  render(<GmScoutRevealController />);
  await screen.findByRole('region', { name: 'GM scouting result log' });
  expect(api.listPendingScoutRequests).toHaveBeenCalledTimes(1);
  expect(api.listGmScoutResolutionLog).toHaveBeenCalledTimes(1);
});

it('cannot paint late private GM log/queue replies after phase or owned-instance authority disappears', async () => {
  ownedGm();
  let resolvePending!: (value: unknown) => void;
  let resolveLog!: (value: unknown) => void;
  const pending = new Promise(resolve => { resolvePending = resolve; });
  const log = new Promise(resolve => { resolveLog = resolve; });
  api.listPendingScoutRequests.mockReturnValue(pending);
  api.listGmScoutResolutionLog.mockReturnValue(log);
  render(<GmScoutRevealController />);
  await act(async () => useSessionStore.setState(state => ({ session: { ...state.session!, phase: 'debrief' } })));
  await act(async () => {
    resolvePending([{ requestId: 'r1', cycle: 2, entitlementId: 'endeavour', anchorShipId: 'shepherd', targetCoordinate: '0408' }]);
    resolveLog([{ requestId: 'r1', cycle: 2, sourceId: 'endeavour', originShipId: 'shepherd', receivingShipId: 'shepherd',
      targetCoordinate: '0408', systemFact: result.systemFact, recordedAt: '2026-09-27T21:40:00.000Z', resolutionMode: 'automatic' }]);
    await Promise.all([pending, log]);
  });
  expect(screen.queryByText(/Deep Nebula/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Reveal Endeavour scout/ })).not.toBeInTheDocument();
  expect(api.listPendingScoutRequests).toHaveBeenCalledTimes(1);
});

it('does not start follow-up scouting reads when an in-flight reveal loses active authority', async () => {
  ownedGm();
  api.listPendingScoutRequests.mockResolvedValue([{ requestId: 'r1', cycle: 2,
    entitlementId: 'endeavour', anchorShipId: 'shepherd', targetCoordinate: '0408' }]);
  let resolveReveal!: (value: unknown) => void;
  const deferred = new Promise(resolve => { resolveReveal = resolve; });
  api.resolvePendingScoutRequest.mockReturnValue(deferred);
  render(<GmScoutRevealController />);
  fireEvent.click(await screen.findByRole('button', { name: /Reveal Endeavour scout/ }));
  await act(async () => useSessionStore.setState(state => ({ session: { ...state.session!, phase: 'debrief' } })));
  await act(async () => { resolveReveal(result); await deferred; });
  expect(api.listPendingScoutRequests).toHaveBeenCalledTimes(1);
  expect(api.listGmScoutResolutionLog).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Deep Nebula/)).not.toBeInTheDocument();
});

it('awaits reconnect rather than querying with a foreign GM-instance UID', async () => {
  ownedGm();
  useSessionStore.setState(state => ({ gmInstance: { ...state.gmInstance!, uid: 'other-gm' } }));
  render(<GmScoutRevealController />);
  await act(async () => {});
  expect(api.listPendingScoutRequests).not.toHaveBeenCalled();
  expect(api.listGmScoutResolutionLog).not.toHaveBeenCalled();
  expect(screen.getByText(/Reconnect.*scouting result log/)).toBeVisible();
});
