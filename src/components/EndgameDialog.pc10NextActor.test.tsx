import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';
import EndgameDialog from './EndgameDialog';

const service = vi.hoisted(() => ({ begin: vi.fn(), close: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/sessionService', () => ({ beginSessionDebrief: service.begin,
  closeSession: service.close, getSessionDebrief: service.read }));

beforeEach(() => {
  useSessionStore.getState().reset();
  service.begin.mockReset().mockResolvedValue({ phase: 'debrief', committed: true, cycle: 2, result: 'failure' });
  service.close.mockReset().mockResolvedValue({ phase: 'closed', committed: true, cycle: 2, result: 'failure' });
  service.read.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); useSessionStore.getState().reset(); });

function identity(phase: GameSession['phase'], gm = false, ownsClaim = false) {
  const outcome = { type: 'game-outcome', result: 'failure', cause: 'pursuit-limit', cycle: 2,
    navigationRevision: 1, occurredAt: '2026-10-06T12:00:00.000Z' };
  useSessionStore.getState().setIdentity({ id: 'guidance-session', phase, gameOutcome: outcome,
    ...((phase === 'debrief' || phase === 'closed') ? { debriefSnapshot: {
      type: 'session-debrief', version: 1, source: 'failure-review', result: 'failure',
      cause: 'pursuit-limit', cycle: 2, occurredAt: outcome.occurredAt,
      committedAt: '2026-10-06T12:01:00.000Z', outcome,
    } } : {}),
  } as unknown as GameSession, { uid: gm ? 'original-gm' : 'original-member', sessionId: 'guidance-session',
    displayName: gm ? 'GM' : 'Member', role: gm ? 'gm' : 'player', seatId: null,
    connectionGeneration: 1, joinedAt: '2026-10-06T11:00:00.000Z' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  if (ownsClaim) useSessionStore.getState().setGmInstance({ id: 'original-instance', uid: 'original-gm',
    sessionId: 'guidance-session', name: 'GM', deviceLabel: 'native', claimedAt: '2026-10-06T11:00:00.000Z' });
}

it('tells an ordinary failure reader that a live GM freezes the debrief without offering that reader a mutation', () => {
  identity('failure'); render(<EndgameDialog />);
  const dialog = screen.getByRole('dialog', { name: 'Endgame evaluation' });
  expect(dialog).toHaveTextContent(/Pursuit reached 10.*Gameplay controls are frozen/);
  expect(screen.queryByRole('button', { name: 'Freeze failure into debrief' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close session' })).not.toBeInTheDocument();
  expect(service.begin).not.toHaveBeenCalled(); expect(service.close).not.toHaveBeenCalled();
  expect(dialog).toHaveTextContent(/Next actor.*live GM.*freeze.*debrief/i);
});

it('tells an ordinary committed-debrief reader who closes the session and retains normal review navigation', async () => {
  identity('debrief'); render(<EndgameDialog />);
  const dialog = screen.getByRole('dialog', { name: 'Endgame evaluation' });
  expect(dialog).toHaveTextContent(/Server result.*Failure.*Cycle 2/);
  expect(screen.queryByRole('button', { name: 'Close session' })).not.toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('button', { name: 'Review endgame evaluation' })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: 'Review endgame evaluation' }));
  expect(service.close).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Endgame evaluation' })).toHaveTextContent(/Next actor.*live GM.*close.*review/i);
});

it('leaves the existing freeze action with the original GM claim rather than showing that GM an ordinary wait handoff', async () => {
  identity('failure', true, true); render(<EndgameDialog />);
  await userEvent.click(screen.getByRole('button', { name: 'Freeze failure into debrief' }));
  expect(service.begin).toHaveBeenCalledTimes(1);
  expect(service.close).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Endgame evaluation' })).not.toHaveTextContent(/Next actor.*live GM.*freeze/i);
});

it('leaves the existing close action with the original GM claim and exact committed debrief prerequisite', async () => {
  identity('debrief', true, true); render(<EndgameDialog />);
  await userEvent.click(screen.getByRole('button', { name: 'Close session' }));
  expect(service.close).toHaveBeenCalledTimes(1);
  expect(service.begin).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Endgame evaluation' })).not.toHaveTextContent(/Next actor.*live GM.*close/i);
});

it('withholds GM mutations after claim loss and points to a genuinely owned live GM instead', () => {
  identity('failure', true, false); render(<EndgameDialog />);
  expect(screen.queryByRole('button', { name: 'Freeze failure into debrief' })).not.toBeInTheDocument();
  expect(service.begin).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Endgame evaluation' })).toHaveTextContent(/Next actor.*live GM.*freeze/i);
});

it.each(['success', 'closed'] as const)('does not invent a failure-freeze or close handoff in the existing %s phase', phase => {
  identity(phase); render(<EndgameDialog />);
  expect(screen.queryByRole('button', { name: 'Freeze failure into debrief' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close session' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Endgame evaluation' })).not.toHaveTextContent(/Next actor.*live GM.*(?:freeze|close)/i);
  expect(service.begin).not.toHaveBeenCalled(); expect(service.close).not.toHaveBeenCalled();
});
