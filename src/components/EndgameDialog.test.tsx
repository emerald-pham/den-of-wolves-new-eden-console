import { beforeEach, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import EndgameDialog from './EndgameDialog';

beforeEach(() => useSessionStore.getState().reset());

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
