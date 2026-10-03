import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import EmergencyTimerPauseControl from './EmergencyTimerPauseControl';
const command = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sessionService', () => ({ setEmergencyTimerPaused: command }));
it('keeps emergency resume unavailable for a committed briefing hold', () => {
  render(<EmergencyTimerPauseControl connection="live" phase={{turn:2,
    teamPhaseEndsAt:'2026-10-03T01:05:00.000Z',openAirspaceEndsAt:'2026-10-03T01:20:00.000Z',
    airspace:{state:'restricted',tickerActive:true,pressAccess:false},
    timerPause:{reason:'turn-interstitial',window:'restricted',remainingMs:300000,pausedAt:'2026-10-03T01:00:00.000Z'}}} />);
  const button = screen.getByRole('button',{name:'Clear cycle briefing first'});
  expect(button).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Cycle clock held // briefing clearance required');
  fireEvent.click(button); fireEvent.click(button); fireEvent.click(button);
  expect(command).not.toHaveBeenCalled();
});
