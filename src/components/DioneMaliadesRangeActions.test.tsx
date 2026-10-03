import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DioneMaliadesRangeActionPanelView } from './DioneMaliadesRangeActions';

const mediumView = {
  type: 'dione-maliades-range-action-view', sessionId: 's1', attackId: 'wolf-1', turn: 1,
  revision: 7, range: 'medium-range', choiceStatus: 'pending', damage: 1, destroyed: false,
  targets: [
    { instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 1 },
    { instanceId: 'contact-2', label: 'Wolf contact 2', targetNumber: 4 },
  ],
} as const;

it('lets Maliades choose a target shift and a distinct Medium attack', async () => {
  const user = userEvent.setup();
  const onResolveMedium = vi.fn();
  render(<DioneMaliadesRangeActionPanelView view={mediumView} writable
    onResolveMedium={onResolveMedium} onResolveShort={vi.fn()} />);

  expect(screen.getByText('Maliades // damage 1 of 3')).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Maliades Medium attack target'), 'contact-2');
  await user.selectOptions(screen.getByLabelText('Maliades Medium target shift target'), 'contact-1');
  await user.selectOptions(screen.getByLabelText('Maliades Medium target shift'), '1');
  await user.click(screen.getByRole('button', { name: /commit maliades medium choices/i }));

  expect(onResolveMedium).toHaveBeenCalledWith([
    { kind: 'target-shift', targetInstanceId: 'contact-1', shift: 1 },
    { kind: 'attack', targetInstanceId: 'contact-2' },
  ]);
});

it('lets Maliades select two distinct Short targets and explicitly pass without a shift', async () => {
  const user = userEvent.setup();
  const onResolveShort = vi.fn();
  render(<DioneMaliadesRangeActionPanelView view={{ ...mediumView, range: 'short-range' }} writable
    onResolveMedium={vi.fn()} onResolveShort={onResolveShort} />);

  await user.selectOptions(screen.getByLabelText('Maliades Short attack 1 target'), 'contact-1');
  await user.selectOptions(screen.getByLabelText('Maliades Short attack 2 target'), 'contact-2');
  await user.click(screen.getByRole('button', { name: /resolve maliades short attacks/i }));
  expect(onResolveShort).toHaveBeenLastCalledWith(['contact-1', 'contact-2']);

  await user.click(screen.getByRole('button', { name: /pass maliades short range/i }));
  expect(onResolveShort).toHaveBeenLastCalledWith([]);
});

it('does not offer choices to an unlaunched or destroyed Maliades', () => {
  render(<DioneMaliadesRangeActionPanelView view={{ ...mediumView, launched: false }} writable
    onResolveMedium={vi.fn()} onResolveShort={vi.fn()} />);
  expect(screen.getByText(/launch Maliades before choosing range actions/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /commit maliades medium choices/i })).not.toBeInTheDocument();
});
