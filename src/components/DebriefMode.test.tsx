import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DebriefMode from './DebriefMode';
import { useSessionStore } from '@/store/useSessionStore';

const session = {
  id: 's1',
  name: 'Table one',
  joinCode: '4821',
  phase: 'active' as const,
  ownerUid: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  debriefMode: { active: false, revision: 0 },
};

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession(session);
});

afterEach(() => {
  vi.useRealTimers();
});

it('lowers a non-interactive rotating finale ball, streams confetti, and removes new confetti on retraction', () => {
  const { container } = render(<DebriefMode />);

  expect(container.querySelector('.debrief-mode')).toBeNull();

  act(() => {
    useSessionStore.getState().setSession({
      ...session,
      debriefMode: { active: true, revision: 1 },
    });
  });

  expect(screen.getByRole('status')).toHaveTextContent('Debrief mode enabled');
  expect(container.querySelector('.debrief-mode')).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('.debrief-mode__ball')).toHaveAttribute('data-state', 'lowered');
  expect(container.querySelectorAll('.debrief-mode__confetti-piece')).toHaveLength(72);

  act(() => {
    useSessionStore.getState().setSession({
      ...session,
      debriefMode: { active: false, revision: 2 },
    });
  });

  expect(container.querySelectorAll('.debrief-mode__confetti-piece')).toHaveLength(0);
  expect(container.querySelector('.debrief-mode__ball')).toHaveAttribute('data-state', 'retracting');
});

it('does not replay the enabled toast when a browser opens after finale mode is already active', () => {
  useSessionStore.getState().setSession({
    ...session,
    debriefMode: { active: true, revision: 4 },
  });

  render(<DebriefMode />);

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
