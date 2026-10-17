import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import PC10_1ReviewScene from './PC10_1ReviewScene';
import { useSessionStore } from '@/store/useSessionStore';

it('offers three numbered checks and returns to the station chooser when activated', async () => {
  const user = userEvent.setup();
  render(<PC10_1ReviewScene />);

  const navigation = screen.getByRole('navigation', { name: 'PC10.1 review checks' });
  const checks = within(navigation).getAllByRole('button');
  expect(checks).toHaveLength(3);
  for (const check of checks) {
    await user.click(check);
    expect(check).toHaveAttribute('aria-pressed', 'true');
  }

  const returnLink = screen.getByRole('link', { name: 'Return to station and console chooser' });
  expect(returnLink).toHaveAttribute('href', '/#/');
  expect(fireEvent.click(returnLink)).toBe(true);
});

it('uses the prepared research, device, private scout, route, harvest and Cycle 6 presenters locally', async () => {
  const user = userEvent.setup();
  const original = useSessionStore.getState();
  render(<PC10_1ReviewScene />);

  const research = screen.getByRole('region', { name: 'Endeavour research controls' });
  expect(research).toHaveTextContent('next field-upgrade cost is 14 materials');
  await user.click(within(research).getByRole('button', { name: 'Advance standard research' }));
  expect(research).toHaveTextContent('LOCAL SIMULATION // Standard research choice committed.');

  const devices = screen.getByRole('region', { name: 'Science device construction controls' });
  expect(devices).toHaveTextContent('Unlocked purchase price: 10 materials from Shepherd.');
  expect(within(devices).getByRole('button', { name: 'Build ECM Device for 10 materials' })).toBeEnabled();
  expect(within(devices).getByRole('button', { name: 'Build Wolf Agent Detector for 18 materials' })).toBeDisabled();
  await user.click(within(devices).getByRole('button', { name: 'Build ECM Device for 10 materials' }));
  expect(devices).toHaveTextContent('LOCAL SIMULATION // ECM Device built for 10 materials.');

  const scout = screen.getByRole('region', { name: 'Endeavour scout report' });
  expect(scout).toHaveTextContent('Site O');
  expect(scout).toHaveTextContent('Discovery note saved for this station.');

  await user.click(screen.getByRole('button', { name: '2 Explorer fieldwork' }));
  const route = screen.getByRole('region', { name: 'Explorer route planner' });
  await user.selectOptions(within(route).getByRole('combobox', { name: 'Known route destination' }), '5143');
  expect(route).toHaveTextContent('Planned route // 0000 → 5143 // 1 jumps');

  const harvest = screen.getByRole('region', { name: 'Hummingbird resource harvesting' });
  expect(harvest).toHaveTextContent('PENDING SAMPLE');
  await user.click(within(harvest).getByRole('button', { name: 'Die 2: 5 food / 2 water' }));
  expect(harvest).toHaveTextContent('LOCAL SIMULATION // Sample allocation committed.');
  expect(harvest).toHaveTextContent('5 food and 2 water added to Hummingbird cargo.');

  await user.click(screen.getByRole('button', { name: '3 Candidate preparation' }));
  const candidates = screen.getByRole('region', { name: 'Candidate discoveries' });
  expect(candidates).toHaveTextContent('Ancient Jump Ring');
  expect(candidates).toHaveTextContent('Deep Nebula');
  expect(candidates).toHaveTextContent('Station');
  expect(screen.getByRole('region', { name: 'Cycle 6 plan encouragement' }))
    .toHaveTextContent('Cycle 6 // Agree a New Eden plan');

  expect(useSessionStore.getState().session).toBe(original.session);
  expect(useSessionStore.getState().me).toBe(original.me);
  expect(useSessionStore.getState().gmInstance).toBe(original.gmInstance);
});
