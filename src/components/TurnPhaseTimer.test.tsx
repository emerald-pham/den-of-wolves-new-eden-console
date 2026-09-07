import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DradisAirspaceTimer } from './TurnPhaseTimer';

it('shows a paused phase as a red, frozen emergency instrument', () => {
  const phase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-07T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-07T12:20:00.000Z',
    airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false },
    timerPause: {
      window: 'restricted' as const,
      remainingMs: 180_000,
      pausedAt: '2026-09-07T12:02:00.000Z',
    },
  };

  const timer = render(<DradisAirspaceTimer phase={phase} />).getByRole('status');

  expect(timer).toHaveAttribute(
    'aria-label',
    'Airspace closed // 03:00 remaining // emergency timer paused',
  );
  expect(timer).toHaveAttribute('data-tone', 'red');
  expect(screen.getByText('GM resume required')).toBeInTheDocument();
});
