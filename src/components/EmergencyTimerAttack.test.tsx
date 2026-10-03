import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import EmergencyTimerPauseControl from './EmergencyTimerPauseControl';
import type { TurnPhase } from '@/types/game';
const command = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sessionService', () => ({ setEmergencyTimerPaused: command }));
const attack = { turn: 2, revision: 4, currentStep: 'long-range' as const };
function phase(): TurnPhase {
  return { turn: 2, teamPhaseEndsAt: new Date(Date.now()+300_000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now()+900_000).toISOString(),
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false } };
}
beforeEach(() => command.mockReset());

it('requires an attack reason and three deliberate confirmations bound to the attack revision', async () => {
  render(<EmergencyTimerPauseControl phase={phase()} connection="live" attack={attack} authorityKey="gm-one" />);
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  fireEvent.click(button);fireEvent.click(button);fireEvent.click(button);
  expect(command).not.toHaveBeenCalled();
  const reason = screen.getByRole('textbox', { name: 'Attack timer intervention reason' });
  fireEvent.change(reason, { target: { value: 'short' } });expect(button).toBeDisabled();
  fireEvent.change(reason, { target: { value: '  Safety pause during the attack.  ' } });
  expect(button).toBeEnabled();
  fireEvent.click(button);fireEvent.click(button);expect(command).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(command).toHaveBeenCalledWith(true, {
    expectedAttackRevision: 4, reason: 'Safety pause during the attack.', dangerConfirmed: true,
  }));
});

it('withdraws the old reason and confirmation sequence when revision or GM authority changes', () => {
  const current = phase();
  const { rerender } = render(<EmergencyTimerPauseControl phase={current} connection="live" attack={attack} authorityKey="gm-one" />);
  const reason = screen.getByRole('textbox', { name: 'Attack timer intervention reason' });
  fireEvent.change(reason, { target: { value: 'Safety pause during the attack.' } });
  fireEvent.click(screen.getByRole('button'));fireEvent.click(screen.getByRole('button'));
  rerender(<EmergencyTimerPauseControl phase={current} connection="live" attack={{...attack,revision:5}} authorityKey="gm-one" />);
  expect(reason).toHaveValue('');expect(screen.getByRole('button')).toBeDisabled();
  fireEvent.change(reason, { target: { value: 'Safety pause after fresh revision.' } });
  fireEvent.click(screen.getByRole('button'));fireEvent.click(screen.getByRole('button'));
  rerender(<EmergencyTimerPauseControl phase={current} connection="live" attack={{...attack,revision:5}} authorityKey="gm-two" />);
  expect(reason).toHaveValue('');expect(screen.getByRole('button')).toBeDisabled();
  expect(command).not.toHaveBeenCalled();
});

it('preserves the established three-confirmation non-attack command', async () => {
  render(<EmergencyTimerPauseControl phase={phase()} connection="live" />);
  expect(screen.queryByRole('textbox', { name: 'Attack timer intervention reason' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));fireEvent.click(screen.getByRole('button'));fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(command).toHaveBeenCalledWith(true));
});
