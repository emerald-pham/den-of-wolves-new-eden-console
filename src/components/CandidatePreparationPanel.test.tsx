import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import CandidatePreparationPanel from './CandidatePreparationPanel';
import type { CandidatePathView } from '@/lib/candidateService';
import { useSessionStore } from '@/store/useSessionStore';

const service = vi.hoisted(() => ({ read: vi.fn(), execute: vi.fn(), create: vi.fn(), recover: vi.fn(), grant: vi.fn(), edition: vi.fn() }));
vi.mock('@/lib/sessionService', () => ({ setGmShipConsoleWriteGrant: service.grant }));
vi.mock('@/lib/candidateService', () => ({ readCandidateWorkspace: service.read, executeCandidateAttempt: service.execute,
  createCandidateAttempt: service.create, recoverCandidateAttempt: service.recover,
  selectCandidateEdition: service.edition }));
const path = (code: 'N' | 'O' | 'P', edition: 'home' | 'deluxe' = 'home'): CandidatePathView => ({ code, coordinate: code === 'N' ? '6798' : code === 'O' ? '0408' : '4888',
  title: code === 'N' ? 'Ancient Jump Ring' : code === 'O' ? 'Deep Nebula' : 'Ancient Space Station',
  blockers: code === 'N' ? ['Contribute 10 materials.'] : [], nextActor: 'Each ship crew chooses its next action.',
  materials: 0, materialsRequired: edition === 'deluxe' ? 15 : 10, researchCount: 0, researchRequired: 5, shuttleCommitted: false,
  repaired: code !== 'N', liberated: code === 'P', chargeCapacity: 0, requiredCapacity: 18,
  reactorShipIds: [], activated: false, sabotaged: false, completed: false, canSabotage: false,
  researchChoices: code === 'N' ? [{ id: 'reactor', name: 'Reactor' }] : [], engineeringShuttles: [],
  ships: [{ shipId: 'aegis', result: 'awaiting-choice', fuelCost: code === 'N' ? 5 : code === 'O' ? 6 : 0,
    reactorCapacity: code === 'P' ? 5 : 0, canAct: true, blocker: '' }],
});
it('gives each Ring research choice a 44px checkbox activation target', async () => {
  const style = document.createElement('style');
  style.textContent = readFileSync('src/components/CandidatePreparationPanel.css', 'utf8');
  document.head.append(style);
  try {
    render(<CandidatePreparationPanel />);
    const checkbox = await screen.findByRole('checkbox', { name: 'Reactor' });
    const label = checkbox.closest('label');
    expect(label).not.toBeNull();
    expect(Number.parseFloat(getComputedStyle(label!).minHeight)).toBeGreaterThanOrEqual(44);
  } finally { style.remove(); }
});
beforeEach(() => {
  vi.clearAllMocks(); service.recover.mockReturnValue(undefined);
  service.read.mockResolvedValue({ type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1', cycle: 6, revision: 0,
    edition: 'home', editionLocked: false, paths: [path('N'), path('O'), path('P')] });
  service.edition.mockResolvedValue({ status: 'committed', edition: 'deluxe', revision: 1 });
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
  expect(screen.getByText(/one d6.*protected scouting.*nine.*earlier losses/i)).toBeInTheDocument();
  expect(screen.queryByText(/scout bonus|hidden modifier|wolf roster/i)).not.toBeInTheDocument();
});
it('retains a lost Nebula result while omitting the ship action from the mounted workspace', async () => {
  const lost = path('O');
  lost.ships = [{ shipId: 'aegis', result: 'lost', summary: 'Lost within the Deep Nebula.', fuelCost: 12,
    reactorCapacity: 0, canAct: false, blocker: 'Original result retained.' }];
  service.read.mockResolvedValueOnce({ type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1', cycle: 5,
    revision: 4, edition: 'home', editionLocked: true, paths: [lost] });
  useSessionStore.setState({ session: { id: 's1', phase: 'active', currentTurn: 5,
    shipFleetGroupIds: { aegis: 'fleet-1' } } as never,
    me: { uid: 'u1', sessionId: 's1', role: 'player', fleetGroupId: 'fleet-1', activeConsoleRoleId: 'executive-officer' } as never });
  render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Deep Nebula' });
  expect(screen.getByText(/Lost within the Deep Nebula.*Original result retained\./i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Long jump into Nebula \/\/ aegis \/\/ \d+ fuel$/ }))
    .not.toBeInTheDocument();
});
it('labels Home as the default and gives the GM a pre-outcome Deluxe alternative selector', async () => {
  useSessionStore.setState({ session: { id: 's1', phase: 'active', currentTurn: 6,
    shipFleetGroupIds: { aegis: 'fleet-1' } } as never,
    me: { uid: 'gm', sessionId: 's1', role: 'gm', fleetGroupId: 'fleet-1' } as never,
    gmInstance: { id: 'instance1', uid: 'gm', sessionId: 's1', claimedAt: '2026-10-05T12:00:00.000Z' } as never });
  render(<CandidatePreparationPanel />);
  const edition = await screen.findByRole('combobox', { name: 'Candidate edition' });
  expect(edition).toHaveValue('home');
  expect(edition).toBeEnabled();
  expect(screen.getByRole('option', { name: 'Home (default)' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Deluxe (alternative)' })).toBeInTheDocument();
  const user = userEvent.setup();
  await user.selectOptions(edition, 'deluxe');
  await waitFor(() => expect(service.edition).toHaveBeenCalledWith('fleet-1', 'deluxe', 0));
});
it('keeps the selected edition visible and locked to the GM after any fleet group starts N or O', async () => {
  service.read.mockResolvedValueOnce({ type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1', cycle: 6, revision: 3,
    edition: 'deluxe', editionLocked: true, paths: [path('N'), path('O')] });
  useSessionStore.setState({ session: { id: 's1', phase: 'active', currentTurn: 6,
    shipFleetGroupIds: { aegis: 'fleet-1', shepherd: 'fleet-2' } } as never,
    me: { uid: 'gm', sessionId: 's1', role: 'gm', fleetGroupId: 'fleet-1' } as never,
    gmInstance: { id: 'instance1', uid: 'gm', sessionId: 's1', claimedAt: '2026-10-05T12:00:00.000Z' } as never });
  render(<CandidatePreparationPanel />);
  const edition = await screen.findByRole('combobox', { name: 'Candidate edition' });
  expect(edition).toHaveValue('deluxe');
  expect(edition).toBeDisabled();
});
it('shows the selected N/O edition to players without exposing edition selection', async () => {
  render(<CandidatePreparationPanel />);
  expect(await screen.findByText(/N\/O rules.*Home.*default/i)).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Candidate edition' })).not.toBeInTheDocument();
});
it('renders Deluxe far-side sabotage without importing the Home-only Wolf-stop claim', async () => {
  const ring = path('N', 'deluxe');
  ring.repaired = true; ring.canSabotage = true;
  ring.nextActor = 'Each ship chooses passage; the GM may choose far-side sabotage.';
  service.read.mockResolvedValueOnce({ type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1', cycle: 6,
    revision: 2, edition: 'deluxe', editionLocked: true, paths: [ring, path('O', 'deluxe')] });
  useSessionStore.setState({ session: { id: 's1', phase: 'active', currentTurn: 6 } as never,
    me: { uid: 'gm', sessionId: 's1', role: 'gm', fleetGroupId: 'fleet-1' } as never,
    gmInstance: { id: 'instance1', uid: 'gm', sessionId: 's1', claimedAt: '2026-10-05T12:00:00.000Z' } as never });
  render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Ancient Jump Ring' });
  expect(screen.getByText(/15 materials.*Engineering Shuttle.*five distinct fully completed Endeavour technologies.*five fuel from each ship/i)).toBeInTheDocument();
  expect(screen.getByText(/one d6.*protected scouting.*eight.*prior losses do not add a bonus/i)).toBeInTheDocument();
  expect(screen.getByText(/GM may choose far-side sabotage after a paid crossing/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sabotage Ring from the far side' })).toBeInTheDocument();
  expect(screen.queryByText(/stop.*Wolf fleet|Wolf pursuit through the Ring/i)).not.toBeInTheDocument();
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
    revision: 4, edition: 'home', editionLocked: false, paths: [updated] });
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


it('explains the permanent Engineering Shuttle cost and why it cannot operate after Ring contribution', async () => {
  render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Ancient Jump Ring' });
  expect(screen.getByText(/permanently consumes.*Engineering Shuttle.*cannot.*launch.*mission/i)).toBeInTheDocument();
});

it.each(['lobby', 'casting', 'briefing'] as const)(
  'waits for a started candidate cycle during normal %s instead of querying on setup snapshots', async phase => {
    useSessionStore.setState(state => ({ session: { ...state.session!, phase, currentTurn: 0 },
      me: { ...state.me!, uid: 'gm', role: 'gm' },
      gmInstance: { id: 'instance1', uid: 'gm', sessionId: 's1', name: 'GM', deviceLabel: 'Laptop',
        claimedAt: '2026-10-05T12:00:00.000Z' } }));
    render(<CandidatePreparationPanel />);
    for (let update = 1; update <= 6; update += 1) {
      await act(async () => useSessionStore.setState(state => ({ session: { ...state.session!, updatedAt: String(update) } })));
    }
    expect(service.read).not.toHaveBeenCalled();
    expect(service.recover).not.toHaveBeenCalled();
    expect(screen.getByText(/Awaiting GM start.*candidate operations.*Cycle 1/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh candidate operations' })).toBeDisabled();
  },
);

it('begins candidate reads after the same original GM receives the real positive-cycle state', async () => {
  useSessionStore.setState(state => ({ session: { ...state.session!, phase: 'casting', currentTurn: 0 },
    me: { ...state.me!, uid: 'gm', role: 'gm' },
    gmInstance: { id: 'instance1', uid: 'gm', sessionId: 's1', name: 'GM', deviceLabel: 'Laptop',
      claimedAt: '2026-10-05T12:00:00.000Z' } }));
  render(<CandidatePreparationPanel />);
  expect(service.read).not.toHaveBeenCalled();
  await act(async () => useSessionStore.setState(state => ({ session: { ...state.session!, phase: 'active', currentTurn: 1 } })));
  await screen.findByRole('heading', { name: 'Ancient Jump Ring' });
  expect(service.read).toHaveBeenCalledTimes(1);
  expect(useSessionStore.getState().me?.uid).toBe('gm');
  expect(screen.queryByText(/Awaiting GM start/)).not.toBeInTheDocument();
});

it('keeps source-valid terminal candidate reads and exact receipt recovery while withholding new choices', async () => {
  const pending = { sessionId: 's1', requestId: 'original', expectedRevision: 0, expectedGroupId: 'fleet-1',
    code: 'O', coordinate: '0408', action: 'nebula-jump', shipId: 'aegis' };
  service.recover.mockReturnValue(pending);
  useSessionStore.setState(state => ({ session: { ...state.session!, phase: 'debrief' } }));
  const user = userEvent.setup();
  render(<CandidatePreparationPanel />);
  await screen.findByRole('heading', { name: 'Deep Nebula' });
  expect(service.read).toHaveBeenCalledWith('fleet-1');
  expect(screen.getByText(/Game ended.*original candidate results remain available/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Commit chosen research' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Contribute Ring materials/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry original candidate request' }));
  expect(service.execute).toHaveBeenCalledWith(pending);
});

it('cannot restore private candidate calculations from a late read after positive-cycle authority disappears', async () => {
  let resolveRead!: (value: unknown) => void;
  const deferred = new Promise(resolve => { resolveRead = resolve; });
  service.read.mockReturnValue(deferred);
  useSessionStore.setState(state => ({ me: { ...state.me!, uid: 'gm', role: 'gm' },
    gmInstance: { id: 'instance1', uid: 'gm', sessionId: 's1', name: 'GM', deviceLabel: 'Laptop',
      claimedAt: '2026-10-05T12:00:00.000Z' } }));
  render(<CandidatePreparationPanel />);
  expect(service.read).toHaveBeenCalledTimes(1);
  await act(async () => useSessionStore.setState(state => ({ session: { ...state.session!, phase: 'casting', currentTurn: 0 } })));
  await act(async () => {
    resolveRead({ type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1', cycle: 6, revision: 1,
      edition: 'home', editionLocked: false,
      paths: [path('O')], privateCalculations: [{ requestId: 'private-old', code: 'O', result: 'old-private-result', calculation: { total: 123 } }] });
    await deferred;
  });
  expect(service.read).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/old-private-result/)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Deep Nebula' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refresh candidate operations' })).toBeDisabled();
});
