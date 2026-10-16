import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AirspaceTimerControls, DradisAirspaceTimer } from './TurnPhaseTimer';

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

it('labels an automatic empty-session hold without implying GM intervention', () => {
  render(<DradisAirspaceTimer phase={{
    turn: 2,
    teamPhaseEndsAt: '2026-09-07T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-07T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    timerPause: { reason: 'empty-session', window: 'restricted', remainingMs: 180_000, pausedAt: '2026-09-07T12:02:00.000Z' },
  }} />);
  expect(screen.getByRole('status')).toHaveAccessibleName('Airspace closed // 03:00 remaining // awaiting reconnect');
  expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'blue');
  expect(screen.getByText('Resumes on reconnect')).toBeInTheDocument();
  expect(screen.queryByText('GM resume required')).not.toBeInTheDocument();
});

it('shows explicit manual phase control without a countdown in DRADIS or timing controls', () => {
  const phase = {
    turn: 2,
    teamPhaseEndsAt: '9999-12-31T23:59:59.999Z',
    openAirspaceEndsAt: '9999-12-31T23:59:59.999Z',
    progression: 'manual' as const,
    airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false },
  };

  const view = render(<>
    <DradisAirspaceTimer phase={phase} />
    <AirspaceTimerControls phase={phase} />
  </>);

  expect(screen.getByRole('status')).toHaveAccessibleName('Airspace closed // manual GM advance');
  expect(screen.getByText('MANUAL')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Airspace closed timer // MANUAL // GM advances' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Airspace open timer // STANDBY // GM advances' })).toBeDisabled();
  expect(view.container).not.toHaveTextContent(/\b\d{2}:\d{2}\b/);
});
