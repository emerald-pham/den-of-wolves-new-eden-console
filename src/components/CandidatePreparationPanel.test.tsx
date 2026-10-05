import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CandidatePreparationPanel from './CandidatePreparationPanel';
import { useSessionStore } from '@/store/useSessionStore';

const service = vi.hoisted(() => ({ read: vi.fn(), execute: vi.fn(), create: vi.fn(), recover: vi.fn(), grant: vi.fn() }));
vi.mock('@/lib/sessionService', () => ({ setGmShipConsoleWriteGrant: service.grant }));
vi.mock('@/lib/candidateService', () => ({ readCandidateWorkspace: service.read, executeCandidateAttempt: service.execute,
  createCandidateAttempt: service.create, recoverCandidateAttempt: service.recover }));
const path = (code: 'N' | 'O' | 'P') => ({ code, coordinate: code === 'N' ? '6798' : code === 'O' ? '0408' : '4888',
  title: code === 'N' ? 'Ancient Jump Ring' : code === 'O' ? 'Deep Nebula' : 'Ancient Space Station',
  blockers: code === 'N' ? ['Contribute 10 materials.'] : [], nextActor: 'Each ship crew chooses its next action.',
  materials: 0, materialsRequired: 10, researchCount: 0, researchRequired: 5, shuttleCommitted: false,
  repaired: code !== 'N', liberated: code === 'P', chargeCapacity: 0, requiredCapacity: 18,
  reactorShipIds: [], activated: false, sabotaged: false, completed: false, canSabotage: false,
  researchChoices: code === 'N' ? [{ id: 'reactor', name: 'Reactor' }] : [], engineeringShuttles: [],
  ships: [{ shipId: 'aegis', result: 'awaiting-choice', fuelCost: code === 'N' ? 5 : code === 'O' ? 6 : 0,
    reactorCapacity: code === 'P' ? 5 : 0, canAct: true, blocker: '' }],
});
beforeEach(() => {
  vi.clearAllMocks(); service.recover.mockReturnValue(undefined);
  service.read.mockResolvedValue({ type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1', cycle: 6, revision: 0,
    paths: [path('N'), path('O'), path('P')] });
  service.create.mockImplementation(choice => ({ sessionId: 's1', requestId: 'same-request', expectedRevision: 0, ...choice }));
  service.execute.mockResolvedValue({ status: 'committed', type: 'candidate-action-result', requestId: 'same-request',
    summary: 'Ring materials committed.' });
  useSessionStore.setState({ session: { id: 's1', phase: 'active', currentTurn: 6 } as never,
    me: { uid: 'u1', sessionId: 's1', role: 'player', fleetGroupId: 'fleet-1' } as never,
    connection: 'live', sessionSnapshotFreshness: 'server' });
});
it('explains the three distinct costs and next actor through connected operations', async () => {
  render(<CandidatePreparationPanel />);
  expect(await screen.findByRole('heading', { name: 'Ancient Jump Ring' })).toBeInTheDocument();
  expect(screen.getByText(/10 materials.*Engineering Shuttle.*five.*four crosses/i)).toBeInTheDocument();
  expect(screen.getByText(/six fuel|6 fuel/i)).toBeInTheDocument();
  expect(screen.getAllByText(/18.*charge capacity/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Each ship crew chooses its next action/)).toHaveLength(3);
  expect(screen.queryByText(/scout bonus|hidden modifier|wolf roster/i)).not.toBeInTheDocument();
});
it('offers safe Cycle 6 planning encouragement without revealing the private GM decision', async () => {
  render(<CandidatePreparationPanel />);
  expect(await screen.findByText(/Cycle 6.*agree.*New Eden plan/i)).toBeInTheDocument();
  expect(screen.queryByText(/GM.*plan.*missing|GM.*plan.*complete/i)).not.toBeInTheDocument();
});
it('sends the actual selected ship material choice and shows its committed receipt', async () => {
  const user = userEvent.setup(); render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Ancient Jump Ring' });
  await user.click(screen.getByRole('button', { name: /Contribute.*materials/i }));
  await waitFor(() => expect(service.execute).toHaveBeenCalledWith(expect.objectContaining({
    action: 'contribute-materials', shipId: 'aegis', amount: 1, requestId: 'same-request',
  })));
  expect(await screen.findByRole('status')).toHaveTextContent('Ring materials committed.');
});
it('retains one exact attempt after transport interruption and makes retry explicit', async () => {
  service.execute.mockRejectedValueOnce(new Error('Connection interrupted.'));
  const user = userEvent.setup(); render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Ancient Jump Ring' });
  await user.click(screen.getByRole('button', { name: /Contribute.*materials/i }));
  const retry = await screen.findByRole('button', { name: 'Retry original candidate request' });
  await user.click(retry);
  expect(service.execute.mock.calls[0]?.[0]).toBe(service.execute.mock.calls[1]?.[0]);
});
it('clears stale group presentation and disables mutations when live authority disappears', async () => {
  render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Ancient Jump Ring' });
  useSessionStore.setState({ sessionSnapshotFreshness: 'cache', connection: 'connecting' });
  await waitFor(() => expect(screen.queryByRole('button', { name: /Contribute.*materials/i })).not.toBeInTheDocument());
  expect(screen.getByText(/Reconnect.*candidate/i)).toBeInTheDocument();
});
it('refreshes current blockers when another actor commits a server session update', async () => {
  render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Ancient Jump Ring' });
  const updated = path('P'); updated.chargeCapacity = 17;
  service.read.mockResolvedValue({ type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1', cycle: 6,
    revision: 4, paths: [updated] });
  act(() => useSessionStore.setState(state => ({ session: { ...state.session!, updatedAt: '2026-10-05T13:00:00.000Z' } })));
  expect(await screen.findByText(/17\/18 charge capacity/)).toBeInTheDocument();
});
it('lets the GM explicitly enable the ordinary scoped ship grant before vessel candidate actions', async () => {
  useSessionStore.setState({ session: { id: 's1', phase: 'active', currentTurn: 6, shipFleetGroupIds: { aegis: 'fleet-1' } } as never,
    me: { uid: 'gm', sessionId: 's1', role: 'gm', fleetGroupId: 'fleet-1' } as never,
    gmInstance: { id: 'instance1', uid: 'gm', sessionId: 's1', claimedAt: '2026-10-05T12:00:00.000Z' } as never });
  const user = userEvent.setup(); render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Deep Nebula' });
  expect(screen.getByRole('button', { name: /Long jump into Nebula/ })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Enable GM candidate ship control' }));
  expect(service.grant).toHaveBeenCalledWith('aegis', true, {
    shipId: 'aegis', sessionId: 's1', uid: 'gm', instanceId: 'instance1', claimedAt: '2026-10-05T12:00:00.000Z' });
});
