import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import PC01ReviewScene from './PC01ReviewScene';

it('lets the owner try the synthetic Team research and Coordination purchase without a session write', async () => {
  const user = userEvent.setup();
  render(<PC01ReviewScene />);

  expect(screen.getByRole('heading', { name: /PC01.*Shepherd science station/i })).toBeVisible();
  const sampleNotice = screen.getByRole('complementary', { name: 'Synthetic sample notice' });
  expect(within(sampleNotice).getByText('SAMPLE ONLY')).toBeVisible();
  expect(within(sampleNotice).getByText(/No live session is connected/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Return to console landing' })).toHaveAttribute('href', '/');

  await user.selectOptions(screen.getByRole('combobox', { name: 'Research track' }), 'jump-drive');
  await user.click(screen.getByRole('button', { name: 'Advance standard research' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Sample research choice recorded.');
  expect(screen.getByRole('list', { name: 'Research progress' })).toHaveTextContent('Jump Drive: 1 of 5 boxes crossed');

  await user.click(screen.getByRole('button', { name: 'Coordination upgrades' }));
  expect(screen.getByRole('checkbox', { name: 'DIONE // Jump Drive // 13 materials' })).toBeVisible();
  await user.click(screen.getByRole('checkbox', { name: 'DIONE // Jump Drive // 13 materials' }));
  await user.click(screen.getByRole('button', { name: 'Purchase sample upgrades' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Sample purchase successful.');

  await user.selectOptions(screen.getByRole('combobox', { name: 'Field-upgrade sample state' }), 'unavailable');
  expect(screen.getByRole('alert')).toHaveTextContent('Sample purchase unavailable');
  expect(screen.getByRole('button', { name: 'Purchase sample upgrades' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Refresh sample Scientist state' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Sample purchase state refreshed.');
});

it('shows the complete local ECM ready, working, success, and spent sequence', async () => {
  const user = userEvent.setup();
  render(<PC01ReviewScene />);
  await user.click(screen.getByRole('button', { name: 'ECM Device' }));

  expect(screen.getByText('Status: Ready')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Use ECM Device' }));
  expect(screen.getByText('Status: Working')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Complete sample ECM activation' }));
  expect(screen.getByText('Status: Successful')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Mark sample ECM device spent' }));
  expect(screen.getByText('Status: Spent')).toBeVisible();
});

it('walks from the pending request through the GM reveal to the private note and ship-limited map', async () => {
  const user = userEvent.setup();
  render(<PC01ReviewScene />);

  await user.click(screen.getByRole('button', { name: 'Scout report' }));
  expect(screen.getByRole('region', { name: 'Endeavour scout report' })).toHaveTextContent('Awaiting facilitator reveal.');

  await user.selectOptions(screen.getByRole('combobox', { name: 'Review perspective' }), 'gm');
  const chart = screen.getByRole('region', { name: 'GM scout chart' });
  expect(within(chart).getByRole('button', { name: 'System 8378 // O // Deep Nebula' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Reveal Endeavour scout at 8378' }));
  expect(await screen.findByText(/Sample report revealed/)).toBeVisible();

  await user.selectOptions(screen.getByRole('combobox', { name: 'Review perspective' }), 'scientist');
  const report = screen.getByRole('region', { name: 'Endeavour scout report' });
  expect(report).toHaveTextContent('Deep Nebula');
  expect(report).toHaveTextContent('Discovery note saved for this station.');
  expect(report).toHaveTextContent('The facilitator keeps the jump benefit private.');

  await user.click(screen.getByRole('button', { name: 'My ship map' }));
  const scientistMap = screen.getByRole('region', { name: 'Ship navigation map' });
  expect(scientistMap).toHaveTextContent('8378');

  await user.selectOptions(screen.getByRole('combobox', { name: 'Review perspective' }), 'second-ship');
  const secondShipMap = screen.getByRole('region', { name: 'Ship navigation map' });
  expect(secondShipMap).not.toHaveTextContent('8378');
  expect(secondShipMap.querySelector('[data-system-id="system-17"]')).not.toHaveAttribute('data-system-coordinate');
  expect(secondShipMap.querySelector('[data-system-id="system-17"]')).toHaveAttribute(
    'aria-label', 'Unknown system // coordinates unavailable',
  );
});
