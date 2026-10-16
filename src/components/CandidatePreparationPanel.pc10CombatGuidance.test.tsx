import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CandidateWorkspace } from '@/lib/candidateService';
import { useSessionStore } from '@/store/useSessionStore';
import CandidatePreparationPanel from './CandidatePreparationPanel';

const { candidateWorkspace } = await vi.importActual<{
  candidateWorkspace: (authority: unknown, state: unknown) => CandidateWorkspace;
}>('../../functions/src/candidatePaths');

const service = vi.hoisted(() => ({ read: vi.fn(), execute: vi.fn(), create: vi.fn(), recover: vi.fn(), grant: vi.fn() }));
vi.mock('@/lib/sessionService', () => ({ setGmShipConsoleWriteGrant: service.grant }));
vi.mock('@/lib/candidateService', () => ({ readCandidateWorkspace: service.read, executeCandidateAttempt: service.execute,
  createCandidateAttempt: service.create, recoverCandidateAttempt: service.recover }));

function sourceWorkspace(gm = false, liberated = false, code: 'N' | 'O' | 'P' = 'P') {
  const authority = { sessionId: 'guidance-session', cycle: 2, phase: 'active',
    coordination: true, now: '2026-10-06T12:00:00.000Z', groupId: 'fleet-1', vesselIds: ['aegis'],
    actor: { uid: gm ? 'original-gm' : 'original-member', gm, shipIds: ['aegis'], research: false, shuttleIds: [] },
    discovered: [{ code, coordinate: '4888' }], ships: { aegis: { fuel: 8, materials: 2,
      reactorCapacity: 5, destroyed: false, jumpCharged: true, jumpDamaged: false, longJumpCost: 6,
      atCandidate: true, jumpedThisCycle: false, coordinate: '4888' } }, research: {}, engineeringShuttles: [],
    hiddenScoutCount: 0, station: { coordinate: '4888', groupId: 'fleet-1', liberated, sourceId: 'original-attack' },
  };
  return candidateWorkspace(authority, { revision: 9, sites: {} });
}
function identity(gm = false) {
  useSessionStore.getState().setIdentity({ id: 'guidance-session', phase: 'active', currentTurn: 2,
    shipFleetGroupIds: { aegis: 'fleet-1' } } as never, {
    uid: gm ? 'original-gm' : 'original-member', sessionId: 'guidance-session', role: gm ? 'gm' : 'player',
    displayName: gm ? 'GM' : 'Member', seatId: null, fleetGroupId: 'fleet-1',
    connectionGeneration: 1, joinedAt: '2026-10-06T11:00:00.000Z',
  });
  if (gm) useSessionStore.getState().setGmInstance({ id: 'original-instance', uid: 'original-gm',
    sessionId: 'guidance-session', name: 'GM', deviceLabel: 'native', claimedAt: '2026-10-06T11:00:00.000Z' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}
beforeEach(() => {
  useSessionStore.getState().reset(); vi.clearAllMocks(); identity();
  service.recover.mockReturnValue(undefined); service.read.mockResolvedValue(sourceWorkspace());
  service.create.mockImplementation(choice => ({ sessionId: 'guidance-session', requestId: 'original-request', ...choice }));
  service.execute.mockResolvedValue({ status: 'committed', summary: 'Original Reactor contribution committed.' });
});
afterEach(() => { cleanup(); useSessionStore.getState().reset(); });

it('directs an occupied-P ordinary battle crew to its existing assigned combat console while preserving the server blocker', async () => {
  render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Ancient Space Station' });
  expect(screen.getByText('Station combat must defeat every remaining Wolf force.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Cannibalise Reactor/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Declare Wolf attack' })).not.toBeInTheDocument();
  expect(service.execute).not.toHaveBeenCalled(); expect(service.grant).not.toHaveBeenCalled();
  expect(screen.getByText(/Battle crews.*assigned ship.*combat console.*GM.*Wolf attack/i)).toBeVisible();
});

it('points the genuine GM reader to existing GM Console Wolf attack controls without adding an attack command to the candidate panel', async () => {
  identity(true); service.read.mockResolvedValue(sourceWorkspace(true));
  render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Ancient Space Station' });
  expect(screen.queryByRole('button', { name: 'Declare Wolf attack' })).not.toBeInTheDocument();
  expect(service.execute).not.toHaveBeenCalled(); expect(service.grant).not.toHaveBeenCalled();
  expect(screen.getByText(/GM.*GM Console.*Wolf attack.*battle crews.*assigned.*combat console/i)).toBeVisible();
});

it('removes the combat handoff on actual source liberation and preserves the original Reactor request revision and group', async () => {
  render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Ancient Space Station' });
  service.read.mockResolvedValue(sourceWorkspace(false, true));
  act(() => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    updatedAt: '2026-10-06T12:01:00.000Z' }));
  const contribute = await screen.findByRole('button', { name: /Cannibalise Reactor.*aegis.*5 capacity/ });
  await userEvent.click(contribute);
  expect(service.execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    requestId: 'original-request', expectedRevision: 9, expectedGroupId: 'fleet-1', action: 'contribute-reactor',
    shipId: 'aegis', code: 'P', coordinate: '4888',
  }));
  expect(screen.queryByText(/GM Console.*Wolf attack|Battle crews.*assigned ship.*combat console/i)).not.toBeInTheDocument();
});

it.each(['N', 'O'] as const)('does not add a Station combat handoff to the actual %s workspace', async code => {
  service.read.mockResolvedValue(sourceWorkspace(false, false, code)); render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: code === 'N' ? 'Ancient Jump Ring' : 'Deep Nebula' });
  expect(screen.queryByText(/GM Console.*Wolf attack|Battle crews.*assigned ship.*combat console/i)).not.toBeInTheDocument();
  expect(service.execute).not.toHaveBeenCalled();
});

it('clears the Station combat directions with the original candidate audience on cache/offline authority loss', async () => {
  render(<CandidatePreparationPanel />); await screen.findByRole('heading', { name: 'Ancient Space Station' });
  act(() => { useSessionStore.getState().setConnection('offline');
    useSessionStore.getState().setSessionSnapshotFreshness('cache'); });
  expect(screen.queryByRole('heading', { name: 'Ancient Space Station' })).not.toBeInTheDocument();
  expect(screen.queryByText(/GM Console.*Wolf attack|Battle crews.*assigned ship.*combat console/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refresh candidate operations' })).toBeDisabled();
  expect(service.execute).not.toHaveBeenCalled(); expect(service.grant).not.toHaveBeenCalled();
});
