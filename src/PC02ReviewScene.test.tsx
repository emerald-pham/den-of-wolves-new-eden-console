import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import PC02ReviewScene from './PC02ReviewScene';
import { CONSOLE_ROLES } from '@/data/roles';

it('shows the production role roster in the prepared lobby without connecting a session', () => {
  const { container } = render(<PC02ReviewScene />);
  expect(container.querySelector('.fleet-roster')).not.toBeNull();
  expect(screen.getByRole('heading', { name: 'Stations and consoles' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Press Officer' })).toBeVisible();
});

it('walks from setup guidance to a prepared first action and back to the briefing', async () => {
  const user = userEvent.setup();
  render(<PC02ReviewScene />);
  expect(screen.getByRole('heading', { name: 'Stations and consoles' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open assigned console' })).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Open assigned console' }));
  expect(screen.getByRole('button', { name: 'Return to briefing' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Return to briefing' }));
  expect(screen.getByRole('heading', { name: 'Stations and consoles' })).toBeVisible();
});

it('keeps production roster links inside a reversible sample station route', async () => {
  const user = userEvent.setup();
  render(<PC02ReviewScene />);
  await user.click(screen.getByRole('link', { name: 'AEGIS // Admiral // OPEN' }));
  expect(screen.getByRole('region', { name: 'Prepared station preview' })).toHaveTextContent('Admiral');
  await user.click(screen.getByRole('link', { name: 'Return to role lobby' }));
  expect(screen.getByRole('heading', { name: 'Stations and consoles' })).toBeVisible();
});

it('provides one clearly synthetic six-step PC02 sitting with every requested perspective', async () => {
  const user = userEvent.setup();
  render(<PC02ReviewScene />);

  expect(screen.getByRole('heading', { name: /PC02.*setup.*continuity/i })).toBeVisible();
  expect(within(screen.getByRole('complementary', { name: 'Synthetic sample notice' }))
    .getByText(/no live session/i)).toBeVisible();
  const steps = screen.getByRole('navigation', { name: 'PC02 review steps' });
  for (const name of ['Setup', 'Waiver', 'Fleet board', 'Press handoff', 'DRADIS', 'Leave and reconnect']) {
    expect(within(steps).getByRole('button', { name: new RegExp(name, 'i') })).toBeVisible();
  }
  const perspective = screen.getByRole('combobox', { name: 'Review perspective' });
  expect(within(perspective).getAllByRole('option').map((option) => option.textContent)).toEqual([
    expect.stringMatching(/GM/i),
    expect.stringMatching(/Press/i),
    expect.stringMatching(/President/i),
    expect.stringMatching(/Player/i),
  ]);
  await user.click(within(steps).getByRole('button', { name: /fleet board/i }));
  expect(screen.getByRole('region', { name: 'Pursuit tracker' }))
    .toHaveTextContent('Awaiting CIC handshake');
  expect(screen.getByRole('region', { name: 'Primary game status' })).toHaveTextContent('Cycle');
  await user.selectOptions(perspective, 'player');
  expect(screen.queryByRole('region', { name: 'Primary game status' })).toBeNull();
});

it('shows the real three-check gate at the synthetic seven-day boundary', async () => {
  const user = userEvent.setup();
  render(<PC02ReviewScene />);
  await user.click(screen.getByRole('button', { name: /waiver/i }));
  const sampleTime = screen.getByRole('combobox', { name: 'Waiver sample time' });
  expect(within(sampleTime).getByRole('option', { name: 'Before seven days // accepted' }))
    .toBeInTheDocument();
  expect(within(sampleTime).getByRole('option', { name: 'At seven days // checks required again' }))
    .toBeInTheDocument();
  await user.selectOptions(sampleTime, 'before-expiry');
  expect(screen.getByRole('status')).toHaveTextContent('No new checks are required before seven days.');
  expect(screen.queryByRole('dialog', { name: 'CODE OF CONDUCT' })).toBeNull();
  await user.selectOptions(sampleTime, 'expired');

  const gate = screen.getByRole('dialog', { name: 'CODE OF CONDUCT' });
  expect(within(gate).getAllByRole('checkbox')).toHaveLength(3);
  expect(gate).toHaveTextContent('seven days on this device');
});

it('uses the real plot for an interactive first-contact and repeat-sweep review', async () => {
  const user = userEvent.setup();
  const { container } = render(<PC02ReviewScene />);
  await user.click(screen.getByRole('button', { name: /DRADIS/i }));

  expect(container.querySelector('.contact-plot')).not.toBeNull();
  expect(screen.getByRole('button', { name: /repeat sweep/i })).toBeVisible();
  expect(screen.getByRole('button', { name: /after first sweep/i })).toBeVisible();
  expect(screen.getByText(/first contact enlargement/i)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Crowded contacts' }));
  expect(container.querySelectorAll('.contact-plot__contact')).toHaveLength(12);
  const plot = container.querySelector<HTMLElement>('.pc02-review__plot')!;
  await user.click(screen.getByRole('button', { name: 'Repeat sweep' }));
  expect(plot.dataset.scanStage).toBe('repeat');
  expect(screen.getByRole('status')).toHaveTextContent('800 ms');
  await user.click(screen.getByRole('button', { name: 'After first sweep' }));
  expect(plot.dataset.scanStage).toBe('after');
  expect(screen.getByRole('status')).toHaveTextContent('1120 ms');
});

it('shows committed sample reports on the actual Press desk before and after a local publish', async () => {
  const user = userEvent.setup();
  render(<PC02ReviewScene />);
  await user.click(screen.getByRole('button', { name: /press handoff/i }));
  expect(screen.queryByRole('region', { name: 'SNN Press log' })).toBeNull();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Review perspective' }), 'press');
  const log = screen.getByRole('region', { name: 'SNN Press log' });
  expect(log).toHaveTextContent('SURVIVORS');
  expect(log).toHaveTextContent('COMMISSAR PURGE');
  expect(log).toHaveTextContent('PRESIDENT');
  const desk = screen.getByRole('region', { name: 'Press dispatch desk' });
  expect(desk).toHaveTextContent('No active dispatches');
  await user.type(within(desk).getByLabelText('Dispatch'), 'The fleet holds course.');
  await user.click(within(desk).getByRole('button', { name: 'Publish dispatch' }));
  expect(desk).toHaveTextContent('The fleet holds course.');
  expect(desk).toHaveTextContent('SAMPLE ONLY');
  expect(log).toHaveTextContent('COMMISSAR PURGE');
});

it('keeps sample leave and reconnect controls local to the review scene', async () => {
  const user = userEvent.setup();
  render(<PC02ReviewScene />);
  await user.click(screen.getByRole('button', { name: /leave and reconnect/i }));
  const roleSelector = screen.getByRole('combobox', { name: 'Non-GM station' });
  expect(within(roleSelector).getAllByRole('option')).toHaveLength(CONSOLE_ROLES.length);
  expect(roleSelector).toHaveTextContent('Press Officer');
  expect(roleSelector).toHaveTextContent('President');
  expect(screen.getByRole('button', { name: 'Open sample settings' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Open sample settings' }));
  expect(screen.getByRole('dialog', { name: /session settings/i })).toHaveTextContent('Disconnect');
  expect(screen.getByRole('button', { name: 'Temporary disconnect' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Resume same role' })).toBeVisible();
});

it('does not present a voluntary leave as a resumable transient disconnect', async () => {
  const user = userEvent.setup();
  render(<PC02ReviewScene />);
  await user.click(screen.getByRole('button', { name: /leave and reconnect/i }));
  await user.click(screen.getByRole('button', { name: 'Open sample settings' }));
  await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  expect(screen.getByRole('button', { name: 'ARE YOU SURE?' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'ARE YOU SURE?' }));
  expect(screen.getByRole('button', { name: 'Resume same role' })).toBeDisabled();
});
