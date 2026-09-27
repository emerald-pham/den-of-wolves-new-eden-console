import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const api = vi.hoisted(() => ({
  listMyScoutReports: vi.fn(), readPrivateScoutResult: vi.fn(),
  readMyScoutDiscoveryNote: vi.fn(), listPendingScoutRequests: vi.fn(),
  resolvePendingScoutRequest: vi.fn(),
}));
vi.mock('@/lib/scoutResultService', () => api);

import ScoutReportController from './ScoutReportController';
import GmScoutRevealController from './GmScoutRevealController';

const result = {
  type: 'private-scout-result', sessionId: 's1', requestId: 'r1', requesterUid: 'u1',
  sourceId: 'endeavour', cycle: 2, targetCoordinate: '0408',
  systemFact: { coordinate: '0408', code: 'O', title: 'Deep Nebula' },
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
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
