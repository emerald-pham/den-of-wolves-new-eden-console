import { beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, render, screen, within } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import EndgameDialog from './EndgameDialog';

const debriefMocks = vi.hoisted(() => ({
  begin: vi.fn(), close: vi.fn(), read: vi.fn(),
}));
vi.mock('@/lib/sessionService', () => ({
  beginSessionDebrief: debriefMocks.begin,
  closeSession: debriefMocks.close,
  getSessionDebrief: debriefMocks.read,
}));

beforeEach(() => {
  useSessionStore.getState().reset();
  debriefMocks.begin.mockReset().mockResolvedValue({ phase: 'debrief', committed: true, cycle: 4, result: 'failure' });
  debriefMocks.close.mockReset().mockResolvedValue({ phase: 'closed', committed: true, cycle: 4, result: 'failure' });
  debriefMocks.read.mockReset().mockResolvedValue(undefined);
});

it('announces the server-reported pursuit failure and restores the review control', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setSession({
    id: 's1', phase: 'failure',
    gameOutcome: {
      type: 'game-outcome', result: 'failure', cause: 'pursuit-limit', cycle: 4,
      navigationRevision: 12, occurredAt: '2026-09-23T12:00:00.000Z',
    },
  } as never);
  render(<main><button type="button">Continue route</button><EndgameDialog /></main>);

  const dialog = screen.getByRole('dialog', { name: 'Endgame evaluation' });
  expect(dialog).toHaveAccessibleDescription(/server-reported endgame state/i);
  expect(dialog).toHaveTextContent('Pursuit reached 10 in Cycle 4');
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Endgame evaluation' }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Continue' }));
  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog', { name: 'Endgame evaluation' })).not.toBeInTheDocument();
  const review = screen.getByRole('button', { name: 'Review endgame evaluation' });
  expect(review).toHaveFocus();
  await user.click(review);
  expect(screen.getByRole('dialog', { name: 'Endgame evaluation' })).toBeVisible();
});

it('uses the existing generic status when no authoritative outcome explains the terminal phase', () => {
  useSessionStore.getState().setSession({ id: 's1', phase: 'debrief' } as never);
  render(<main><EndgameDialog /></main>);

  expect(screen.getByRole('dialog', { name: 'Endgame evaluation' })).toHaveTextContent(
    'Final cycle complete // Endgame evaluation in progress. Gameplay controls are frozen.',
  );
});

it('does not announce an endgame before a terminal session phase', () => {
  useSessionStore.getState().setSession({ id: 's1', phase: 'active' } as never);
  render(<EndgameDialog />);

  expect(screen.queryByRole('dialog', { name: 'Endgame evaluation' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review endgame evaluation' })).not.toBeInTheDocument();
});

it('shows only the entitled candidate route, met requirements, rolls, losses, and recorded calls', () => {
  useSessionStore.getState().setSession({
    id: 's1', phase: 'closed',
    gameOutcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete',
      candidateCode: 'N', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z' },
    debriefSnapshot: { type: 'session-debrief', version: 1, source: 'candidate', result: 'success',
      cause: 'candidate-complete', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z',
      committedAt: '2026-10-05T12:01:00.000Z',
      outcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete',
        candidateCode: 'N', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z' },
      candidate: { code: 'N', groups: [{
        requirements: [{ id: 'paid-crossing', status: 'met' }],
        rolls: [{ id: 'passage', face: 4, result: 'success' }],
        losses: [{ shipId: 'aegis', reason: 'candidate-loss' }],
        humanCalls: [{ id: 'opposite-side-sabotage', cycle: 4 }],
        path: [{ action: 'ring-passage', result: 'crossed', shipId: 'aegis', fuelSpent: 2 }],
      }] },
    },
  } as never);
  render(<EndgameDialog />);

  const dialog = screen.getByRole('dialog', { name: 'Endgame evaluation' });
  expect(dialog).toHaveTextContent('Candidate N route');
  expect(dialog).toHaveTextContent('Paid crossing: met');
  expect(dialog).toHaveTextContent('Ring passage — crossed');
  expect(dialog).toHaveTextContent('Server roll: Passage');
  expect(dialog).toHaveTextContent('Recorded GM call: Opposite side sabotage (Cycle 4)');
  expect(dialog).toHaveTextContent('Aegis — Candidate loss');
  expect(dialog).not.toHaveTextContent('chart');
  expect(dialog).not.toHaveTextContent('loyalty');
  expect(debriefMocks.read).not.toHaveBeenCalled();
});

it('offers begin and close controls only to a GM instance and reads its private debrief projection', async () => {
  const user = userEvent.setup();
  const gm = { uid: 'gm1', sessionId: 's1', displayName: 'GM', role: 'gm' as const,
    seatId: null, connectionGeneration: 1, joinedAt: '2026-10-05T11:00:00.000Z' };
  const instance = { id: 'gm-1', sessionId: 's1', uid: 'gm1', name: 'GM', deviceLabel: 'test',
    claimedAt: '2026-10-05T11:00:00.000Z' };
  const failedSession = { id: 's1', phase: 'failure', gameOutcome: {
    type: 'game-outcome', result: 'failure', cause: 'pursuit-limit', cycle: 4,
    navigationRevision: 2, occurredAt: '2026-10-05T12:00:00.000Z',
  } };
  useSessionStore.getState().setIdentity(failedSession as never, gm);
  useSessionStore.getState().setGmInstance(instance);
  const first = render(<EndgameDialog />);
  await user.click(screen.getByRole('button', { name: 'Freeze failure into debrief' }));
  expect(debriefMocks.begin).toHaveBeenCalledTimes(1);
  first.unmount();

  useSessionStore.getState().setSession({ ...failedSession, phase: 'debrief', debriefSnapshot: {
    type: 'session-debrief', version: 1, source: 'failure-review', result: 'failure',
    cause: 'pursuit-limit', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z', committedAt: '2026-10-05T12:01:00.000Z',
    outcome: failedSession.gameOutcome,
  } } as never);
  debriefMocks.read.mockResolvedValue({
    type: 'session-debrief', version: 1, source: 'candidate', result: 'success',
    cause: 'candidate-complete', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z',
    committedAt: '2026-10-05T12:01:00.000Z',
    outcome: { type: 'game-outcome', result: 'success', cause: 'candidate-complete',
      candidateCode: 'N', cycle: 4, occurredAt: '2026-10-05T12:00:00.000Z' },
    candidate: { code: 'N', groups: [{ groupId: 'fleet-a',
      requirements: [], rolls: [], losses: [], humanCalls: [], path: [] }] },
  });
  render(<EndgameDialog />);
  expect(await screen.findByText('Group Fleet A')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Close session' }));
  expect(debriefMocks.close).toHaveBeenCalledTimes(1);
  expect(debriefMocks.read).toHaveBeenCalled();
});

it('does not expose GM lifecycle actions to a fleet member', () => {
  useSessionStore.getState().setIdentity({ id: 's1', phase: 'failure' } as never, {
    uid: 'player1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
    connectionGeneration: 1, joinedAt: '2026-10-05T11:00:00.000Z',
  });
  render(<EndgameDialog />);

  expect(screen.queryByRole('button', { name: 'Freeze failure into debrief' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close session' })).not.toBeInTheDocument();
  expect(debriefMocks.begin).not.toHaveBeenCalled();
  expect(debriefMocks.close).not.toHaveBeenCalled();
});

it.each(['candidate', 'failure-review'] as const)('closes %s debrief from the entitled GM read when the session observer omits its snapshot', async source => {
  const snapshot = { type: 'session-debrief', version: 1, source, result: source === 'candidate' ? 'success' : 'failure',
    cause: source === 'candidate' ? 'candidate-complete' : 'pursuit-limit', cycle: 4,
    occurredAt: '2026-10-08T03:21:05.655Z', committedAt: '2026-10-08T03:21:05.655Z',
    candidate: { code: 'N', groups: [] } };
  debriefMocks.read.mockResolvedValue(snapshot);
  useSessionStore.getState().setIdentity({ id: 's1', phase: 'debrief' } as never,
    { uid: 'gm1', sessionId: 's1', role: 'gm', connectionGeneration: 1 } as never);
  useSessionStore.getState().setGmInstance({ id: 'gm-1', sessionId: 's1', uid: 'gm1' } as never);
  render(<EndgameDialog />);
  expect(await screen.findByText(/Server result/)).toBeVisible();
  const close = screen.getByRole('button', { name: 'Close session' });
  expect(close).toBeEnabled();
  await userEvent.click(close);
  expect(debriefMocks.close).toHaveBeenCalledTimes(1);
});

it('keeps Close disabled when the live GM has neither observer nor entitled debrief', async () => {
  debriefMocks.read.mockRejectedValue(new Error('denied'));
  useSessionStore.getState().setIdentity({ id: 's1', phase: 'debrief' } as never,
    { uid: 'gm1', sessionId: 's1', role: 'gm', connectionGeneration: 1 } as never);
  useSessionStore.getState().setGmInstance({ id: 'gm-1', sessionId: 's1', uid: 'gm1' } as never);
  render(<EndgameDialog />);
  expect(screen.getByRole('button', { name: 'Close session' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Close session' }));
  expect(debriefMocks.close).not.toHaveBeenCalled();
});


it('reopens the Station debrief portal on cold remount and permits retained retry after ordinary Continue', async () => {
  const user = userEvent.setup(), retry = vi.fn();
  useSessionStore.getState().setIdentity({ id: 'station', phase: 'active', currentTurn: 2 } as never,
    { uid: 'same-crew', sessionId: 'station', role: 'player', fleetGroupId: 'fleet-1' } as never);
  const surface = () => <main>
    <button onClick={retry}>Retry original candidate request</button><EndgameDialog />
  </main>;
  const first = render(surface());
  expect(screen.queryByRole('dialog', { name: 'Endgame evaluation' })).not.toBeInTheDocument();
  const outcome = { type: 'game-outcome', result: 'success', cause: 'candidate-complete', candidateCode: 'P', cycle: 2 };
  await act(async () => useSessionStore.getState().setSession({ id: 'station', phase: 'debrief', currentTurn: 2,
    gameOutcome: outcome, fullGameDemo: { status: 'complete', progression: 'manual' },
    debriefSnapshot: { type: 'session-debrief', version: 1, source: 'candidate', result: 'success',
      cause: 'candidate-complete', cycle: 2, outcome, candidate: { code: 'P', groups: [] } } } as never));
  const dialog = screen.getByRole('dialog', { name: 'Endgame evaluation' });
  expect(within(dialog).getByRole('heading', { name: 'Candidate P route' })).toBeVisible();
  expect(dialog).toHaveTextContent('Server result // Success // Cycle 2');
  expect(document.querySelector('[data-focus-dialog-backdrop]')).toContainElement(dialog);
  expect(screen.getByRole('button', { name: 'Retry original candidate request' })).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Continue', exact: true }));
  expect(screen.queryByRole('dialog', { name: 'Endgame evaluation' })).not.toBeInTheDocument();
  first.unmount();
  render(surface());
  const reloaded = screen.getByRole('dialog', { name: 'Endgame evaluation' });
  expect(reloaded).toBeVisible();
  await user.click(within(reloaded).getByRole('button', { name: 'Continue', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Retry original candidate request' }));
  expect(retry).toHaveBeenCalledTimes(1);
});
