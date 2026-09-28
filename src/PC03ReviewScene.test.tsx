import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import PC03ReviewScene from './PC03ReviewScene';

it('presents the five PC03 checks as one clearly synthetic solo sitting', () => {
  render(<PC03ReviewScene />);

  expect(screen.getByRole('heading', { name: /PC03.*navigation.*shuttle/i })).toBeVisible();
  expect(within(screen.getByRole('complementary', { name: 'Synthetic sample notice' }))
    .getByText(/no live session is connected/i)).toBeVisible();
  const steps = screen.getByRole('navigation', { name: 'PC03 review steps' });
  for (const label of ['Chart and return', 'Jump Drive', 'Shuttle route', 'Stores and service', 'Reconnect']) {
    expect(within(steps).getByRole('button', { name: new RegExp(label, 'i') })).toBeVisible();
  }
});

it('opens the production ship map and log, then returns through systems to the fleet board', async () => {
  const user = userEvent.setup();
  render(<PC03ReviewScene />);

  expect(screen.getByRole('region', { name: 'Prepared assigned station' })).toHaveTextContent('AEGIS');
  await user.click(screen.getByRole('button', { name: 'Navigation' }));
  const map = screen.getByRole('region', { name: 'Ship navigation map' });
  expect(map).toBeVisible();
  expect(map).toHaveTextContent(/Current ship.*5143/i);
  expect(screen.getByRole('region', { name: 'AEGIS ship log' })).toHaveTextContent(/0000.*5143/i);

  await user.click(screen.getByRole('button', { name: 'Systems' }));
  await user.click(screen.getByRole('button', { name: 'Return to Fleet Board' }));
  expect(screen.getByRole('region', { name: 'Prepared fleet board' })).toHaveTextContent('AEGIS');
  await user.click(screen.getByRole('button', { name: 'Return to assigned station' }));
  expect(screen.getByRole('region', { name: 'Prepared assigned station' })).toBeVisible();
});

it('shows the Drive state matrix while keeping the production jump control inert', async () => {
  const user = userEvent.setup();
  render(<PC03ReviewScene />);
  await user.click(screen.getByRole('button', { name: /2\. Jump Drive/i }));

  const states = screen.getByRole('group', { name: 'Prepared Jump Drive states' });
  for (const label of ['Ready', 'Not charged', 'Fuel starved', 'Damaged', 'Integrity locked', 'Pending', 'Committed', 'Stale reply']) {
    expect(within(states).getByRole('button', { name: label })).toBeVisible();
  }
  expect(screen.getByRole('region', { name: 'Jump Drive sample control' })).toBeVisible();
  expect(screen.getByRole('button', { name: /Jump to 5143/i })).toBeDisabled();

  await user.click(within(states).getByRole('button', { name: 'Stale reply' }));
  expect(screen.getByRole('status', { name: 'Prepared drive outcome' }))
    .toHaveTextContent(/stale.*refresh the sample before retry/i);
  expect(screen.getByRole('button', { name: /Jump to 5143/i })).toBeDisabled();
});

it('walks the production shuttle presentation through docking, transit, retarget, airspace, and arrival', async () => {
  const user = userEvent.setup();
  render(<PC03ReviewScene />);
  await user.click(screen.getByRole('button', { name: /Shuttle route/i }));

  const states = screen.getByRole('group', { name: 'Prepared shuttle states' });
  for (const label of ['Docked', 'Departing', 'In transit', 'Retargeted', 'Airspace closed', 'Arrived']) {
    expect(within(states).getByRole('button', { name: label })).toBeVisible();
  }
  expect(screen.getByRole('region', { name: 'Black Sheep shuttle console preview' })).toBeVisible();
  await user.click(within(states).getByRole('button', { name: 'In transit' }));
  expect(screen.getByText(/Shuttle location.*In transit/i)).toBeVisible();
  await user.click(within(states).getByRole('button', { name: 'Retargeted' }));
  expect(screen.getByRole('status', { name: 'Prepared shuttle outcome' }))
    .toHaveTextContent(/retargeted.*current destination/i);
  await user.click(screen.getByRole('button', { name: 'Return to owning station' }));
  expect(screen.getByRole('region', { name: 'Prepared assigned station' })).toBeVisible();
});

it('separates ship stores, shuttle cargo, and read-only repair or recharge outcomes', async () => {
  const user = userEvent.setup();
  render(<PC03ReviewScene />);
  await user.click(screen.getByRole('button', { name: /Stores and service/i }));

  expect(screen.getByRole('region', { name: 'AEGIS resource stores' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Black Sheep shuttle cargo' }))
    .toHaveTextContent(/Fuel|Materials|Security Teams/i);
  expect(screen.getByRole('region', { name: 'Prepared service sample' })).toBeVisible();
  const states = screen.getByRole('group', { name: 'Prepared stores and service states' });
  for (const label of ['Stocked', 'Depleted', 'Undocked host', 'Already used', 'Wrong phase', 'Pending service', 'Committed service']) {
    expect(within(states).getByRole('button', { name: label })).toBeVisible();
  }
  await user.click(within(states).getByRole('button', { name: 'Undocked host' }));
  expect(screen.getByRole('status', { name: 'Prepared service outcome' }))
    .toHaveTextContent(/blocked.*current dock/i);
  expect(screen.getByRole('button', { name: 'Repair sample' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Recharge sample' })).toBeDisabled();
});

it('shows stale and recovered samples across navigation, drive, shuttle, stores, and service without retrying actions', async () => {
  const user = userEvent.setup();
  render(<PC03ReviewScene />);
  await user.click(screen.getByRole('button', { name: /Reconnect/i }));

  expect(screen.getByRole('heading', { name: 'Stale and reconnect samples' })).toBeVisible();
  for (const label of ['Navigation sample', 'Jump Drive sample', 'Shuttle sample', 'Ship stores sample', 'Cargo and service sample']) {
    expect(screen.getByRole('region', { name: label })).toBeVisible();
  }
  expect(screen.getByRole('button', { name: 'Retry sample jump' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Repeat sample cargo move' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Repeat sample repair' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Apply prepared reconnect snapshot' }));
  expect(screen.getByRole('status', { name: 'Prepared reconnect result' }))
    .toHaveTextContent(/recovered.*sample snapshot/i);
  expect(screen.getByRole('button', { name: 'Retry sample jump' })).toBeDisabled();
});
