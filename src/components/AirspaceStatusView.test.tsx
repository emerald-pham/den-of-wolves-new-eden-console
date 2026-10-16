import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { TurnPhase } from '@/types/game';
import AirspaceStatusView from './AirspaceStatusView';

const manualCoordination: TurnPhase = {
  turn: 2, progression: 'manual', teamPhaseEndsAt: '9999-12-31T23:59:59.999Z',
  openAirspaceEndsAt: '9999-12-31T23:59:59.999Z',
  airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
};

it('keeps an actual mission commitment blocker visible during manual Coordination', () => {
  render(<AirspaceStatusView phase={manualCoordination} current restriction="craft committed to an away mission" />);
  expect(screen.getByRole('status')).toHaveTextContent('Airspace restricted // craft committed to an away mission');
});

it('keeps briefing clearance visible when a paused phase still has a manual marker', () => {
  render(<AirspaceStatusView current phase={{ ...manualCoordination,
    timerPause: { reason: 'turn-interstitial', window: 'open', remainingMs: 0,
      pausedAt: '2026-10-05T12:00:00.000Z' } }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Cycle briefing clearance required');
});

it('explains unblocked manual movement without a countdown', () => {
  render(<AirspaceStatusView current phase={manualCoordination} />);
  expect(screen.getByRole('status')).toHaveTextContent('Airspace open // manual GM progression.');
});
