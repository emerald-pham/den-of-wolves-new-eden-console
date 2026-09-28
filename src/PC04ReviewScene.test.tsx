import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import PC04ReviewScene from './PC04ReviewScene';

it('labels the scene synthetic and exposes the five PC04 checks in one sitting', () => {
  render(<PC04ReviewScene />);

  expect(screen.getByRole('heading', { name: /PC04.*exploration and split-fleet map/i })).toBeVisible();
  expect(screen.getByText(/prepared synthetic states.*no live session writes/i)).toBeVisible();
  const steps = screen.getByRole('navigation', { name: 'PC04 review steps' });
  for (const label of ['1 Enter once', '2 Read the console', '3 Follow a mission', '4 Follow a split', '5 Recover safely']) {
    expect(within(steps).getByRole('button', { name: label })).toBeVisible();
  }
});

it('keeps ordinary station entry and authenticated GM Role Select distinct', async () => {
  const user = userEvent.setup();
  render(<PC04ReviewScene />);

  const entry = screen.getByRole('region', { name: 'Prepared unified console entry' });
  expect(entry).toHaveTextContent('Assigned console');
  expect(entry).toHaveTextContent('Open console');
  expect(entry).toHaveTextContent('View only');
  expect(entry).toHaveTextContent('GM join // Role Select');
  expect(within(entry).queryByRole('button', { name: /^Select a role$/i })).not.toBeInTheDocument();
  await user.click(within(entry).getByRole('button', { name: /enter assigned console/i }));
  expect(screen.getByRole('status', { name: 'Prepared entry result' }))
    .toHaveTextContent(/single server-authorized console claim/i);
});

it('shows the exact default alert and current console terminology', async () => {
  const user = userEvent.setup();
  render(<PC04ReviewScene />);
  await user.click(screen.getByRole('button', { name: '2 Read the console' }));

  const typography = screen.getByRole('region', { name: 'Prepared typography and copy check' });
  expect(typography).toHaveTextContent(
    'RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED',
  );
  expect(typography).toHaveTextContent('UPGRADES AND PROCEDURE OUTCOMES ARE TRACKED AT THE CONSOLE');
  expect(typography).not.toHaveTextContent(/TRACKED AT THE TABLE/i);
});

it('follows one group-bound mission and its automated GM log receipt', async () => {
  const user = userEvent.setup();
  render(<PC04ReviewScene />);
  await user.click(screen.getByRole('button', { name: '3 Follow a mission' }));

  const mission = screen.getByRole('region', { name: 'Prepared away mission' });
  expect(mission).toHaveTextContent('FLEET-2');
  expect(mission).toHaveTextContent('6798');
  expect(mission).toHaveTextContent('Mission Leader // Dione Engineer');
  expect(mission).toHaveTextContent('Craft // Starlight');
  expect(mission).toHaveTextContent('Your private hand');
  expect(mission).toHaveTextContent('Opportunity // Explore');

  const log = screen.getByRole('region', { name: 'Prepared automated GM log' });
  for (const label of ['Source', 'Inputs', 'Modifiers', 'Outcome', 'State delta', 'Revision and replay', 'Recovery']) {
    expect(log).toHaveTextContent(label);
  }
  expect(log).toHaveTextContent(/automatic.*no GM transcription/i);
});

it('keeps split locations, pursuit, communications, and taxi state separate', async () => {
  const user = userEvent.setup();
  render(<PC04ReviewScene />);
  await user.click(screen.getByRole('button', { name: '4 Follow a split' }));

  const split = screen.getByRole('region', { name: 'Prepared split fleet' });
  const first = within(split).getByRole('region', { name: 'FLEET-1 status' });
  const second = within(split).getByRole('region', { name: 'FLEET-2 status' });
  expect(first).toHaveTextContent('5143');
  expect(first).toHaveTextContent('4 / 10');
  expect(second).toHaveTextContent('6798');
  expect(second).toHaveTextContent('7 / 10');
  expect(split).toHaveTextContent(/ordinary communications.*within each group/i);

  await user.click(within(split).getByRole('button', { name: 'Scout taxi' }));
  expect(screen.getByRole('status', { name: 'Prepared split state' }))
    .toHaveTextContent(/separate authority.*range check.*two players or two fuel/i);
  await user.click(within(split).getByRole('button', { name: 'Pending rejoin' }));
  expect(screen.getByRole('status', { name: 'Prepared split state' }))
    .toHaveTextContent(/pursuit values remain separate.*no invented merge/i);
});

it('shows stale and replay recovery without enabling a duplicate procedure', async () => {
  const user = userEvent.setup();
  render(<PC04ReviewScene />);
  await user.click(screen.getByRole('button', { name: '5 Recover safely' }));

  const recovery = screen.getByRole('region', { name: 'Prepared PC04 recovery' });
  expect(recovery).toHaveTextContent(/stale revision.*refresh/i);
  expect(recovery).toHaveTextContent(/lost acknowledgement.*same request/i);
  expect(within(recovery).getByRole('button', { name: /repeat automated mission start/i })).toBeDisabled();
});
