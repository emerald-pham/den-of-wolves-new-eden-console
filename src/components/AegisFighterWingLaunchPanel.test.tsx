import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AegisFighterWingLaunchPanelView } from './AegisFighterWingLaunchPanel';

const alpha = {
  type: 'aegis-fighter-wing-launch-view', sessionId: 's1', wingId: 'fighter-wing-alpha',
  turn: 1, attackId: 'wolf-1', revision: 4, wingRevision: 0, fighters: 4,
  launched: false, eligible: true,
} as const;
const bravo = {
  ...alpha, wingId: 'fighter-wing-bravo', eligible: false, reason: 'uncharged',
} as const;

it('keeps Alpha and Bravo launch choices independent and explains an uncharged bay', () => {
  const onLaunch = vi.fn();
  render(<AegisFighterWingLaunchPanelView views={{
    'fighter-wing-alpha': alpha,
    'fighter-wing-bravo': bravo,
  }} onLaunch={onLaunch} />);

  expect(screen.getByRole('region', { name: /aegis fighter wing launches/i })).toBeVisible();
  expect(screen.getByText('Fighter Wing Alpha')).toBeVisible();
  expect(screen.getByText('Fighter Wing Bravo')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /launch fighter wing alpha/i }));
  expect(onLaunch).toHaveBeenCalledWith('fighter-wing-alpha', alpha);
  expect(screen.getByRole('button', { name: /launch fighter wing bravo/i })).toBeDisabled();
  expect(screen.getByText(/charge Fighter Bay Bravo/i)).toBeVisible();
});
