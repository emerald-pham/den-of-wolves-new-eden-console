import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import CandidatePreparationPanel from './CandidatePreparationPanel';
import { useSessionStore } from '@/store/useSessionStore';
import type { CandidateWorkspace } from '@/lib/candidateService';

const service = vi.hoisted(() => ({ read: vi.fn(), recover: vi.fn() }));
vi.mock('@/lib/sessionService', () => ({ setGmShipConsoleWriteGrant: vi.fn() }));
vi.mock('@/lib/candidateService', () => ({ readCandidateWorkspace: service.read,
  recoverCandidateAttempt: service.recover, createCandidateAttempt: vi.fn(), executeCandidateAttempt: vi.fn() }));
const gmInstance = { id: 'original-instance', uid: 'actor', sessionId: 's1', name: 'GM',
  deviceLabel: 'test', claimedAt: '2026-10-05T10:00:00.000Z' };
const privateWorkspace: CandidateWorkspace = { type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1',
  cycle: 6, revision: 1, edition: 'home', editionLocked: false, paths: [], privateCalculations: [{ requestId: 'private-audit', code: 'O', result: 'lost',
    calculation: { privateScoutBonus: 3 } }] };
const publicWorkspace: CandidateWorkspace = { type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1',
  cycle: 6, revision: 2, edition: 'home', editionLocked: false, paths: [] };
function deferred() {
  let resolve!: (value: CandidateWorkspace) => void;
  const promise = new Promise<CandidateWorkspace>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks(); service.recover.mockReturnValue(undefined);
  useSessionStore.setState({ session: { id: 's1', phase: 'active', currentTurn: 6, shipFleetGroupIds: { aegis: 'fleet-1' } } as never,
    me: { uid: 'actor', role: 'gm', sessionId: 's1', fleetGroupId: 'fleet-1' } as never,
    gmInstance, connection: 'live', sessionSnapshotFreshness: 'server' });
});
it('clears the loaded GM workspace when the same UID and group become a player', async () => {
  service.read.mockResolvedValueOnce(privateWorkspace).mockReturnValue(new Promise(() => undefined));
  render(<CandidatePreparationPanel />);
  expect(await screen.findByText(/privateScoutBonus/)).toBeInTheDocument();
  act(() => useSessionStore.setState(state => ({ me: { ...state.me!, role: 'player' } as never, gmInstance: null })));
  expect(screen.queryByText(/privateScoutBonus/)).not.toBeInTheDocument();
  expect(screen.queryByText(/candidate revision 1/)).not.toBeInTheDocument();
  await waitFor(() => expect(service.read).toHaveBeenCalledTimes(2));
});
it.each([
  ['instance', { id: 'replacement-instance' }],
  ['claim', { claimedAt: '2026-10-05T10:01:00.000Z' }],
])('synchronously clears a loaded private workspace when the GM %s changes', async (_kind, patch) => {
  service.read.mockResolvedValueOnce(privateWorkspace).mockReturnValue(new Promise(() => undefined));
  render(<CandidatePreparationPanel />);
  expect(await screen.findByText(/privateScoutBonus/)).toBeInTheDocument();
  act(() => useSessionStore.setState({ gmInstance: { ...gmInstance, ...patch } }));
  expect(screen.queryByText(/privateScoutBonus/)).not.toBeInTheDocument();
  expect(screen.queryByText(/candidate revision 1/)).not.toBeInTheDocument();
  await waitFor(() => expect(service.read).toHaveBeenCalledTimes(2));
});
it('ignores the original private read after a new audience starts its own public read', async () => {
  const oldRead = deferred();
  service.read.mockReturnValueOnce(oldRead.promise).mockResolvedValue(publicWorkspace);
  render(<CandidatePreparationPanel />);
  await waitFor(() => expect(service.read).toHaveBeenCalledTimes(1));
  act(() => useSessionStore.setState(state => ({ me: { ...state.me!, role: 'player' } as never, gmInstance: null })));
  await screen.findByText(/candidate revision 2/);
  await act(async () => { oldRead.resolve(privateWorkspace); await oldRead.promise; });
  expect(screen.queryByText(/candidate revision 1|privateScoutBonus/)).not.toBeInTheDocument();
});
it.each([
  ['owner', { uid: 'other-gm' }], ['session', { sessionId: 'other-session' }],
])('does not load a GM workspace under a foreign instance %s', async (_kind, patch) => {
  useSessionStore.setState({ gmInstance: { ...gmInstance, ...patch } });
  service.read.mockResolvedValue(privateWorkspace);
  render(<CandidatePreparationPanel />);
  expect(service.read).not.toHaveBeenCalled();
  expect(screen.queryByText(/privateScoutBonus/)).not.toBeInTheDocument();
  expect(screen.getByText(/Reconnect.*candidate/i)).toBeInTheDocument();
});
