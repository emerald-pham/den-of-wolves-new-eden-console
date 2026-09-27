import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import EndeavourFieldUpgradeChoices from './EndeavourFieldUpgradeChoices';
import type { EndeavourFieldUpgradeOption } from '@/lib/endeavourFieldUpgradeService';

const options: readonly EndeavourFieldUpgradeOption[] = [
  {
    shipId: 'aegis', shipName: 'AEGIS', systemId: 'reactor', systemName: 'Reactor',
    trackId: 'reactor', trackName: 'Reactor', materialCost: 8,
  },
  {
    shipId: 'endeavour', shipName: 'ENDEAVOUR', systemId: 'jump',
    systemName: 'Jump Drive', trackId: 'jump-drive', trackName: 'Jump Drive', materialCost: 14,
  },
];

it('renders the production target choices and forwards only the selected sample action', async () => {
  const user = userEvent.setup();
  const onTargetChange = vi.fn();
  const onPurchase = vi.fn();
  render(<EndeavourFieldUpgradeChoices
    options={options}
    selectedKeys={[]}
    remaining={2}
    showTargets
    selectionDisabled={false}
    purchaseDisabled={false}
    busy={false}
    purchaseLabel="Purchase selected upgrades"
    onTargetChange={onTargetChange}
    onPurchase={onPurchase}
    onRetryStale={vi.fn()}
    onRetryExact={vi.fn()}
    onRefresh={vi.fn()}
  />);

  const target = screen.getByRole('checkbox', { name: 'AEGIS // Reactor // 8 materials' });
  expect(target).toBeEnabled();
  await user.click(target);
  expect(onTargetChange).toHaveBeenCalledWith(options[0], true);
  await user.click(screen.getByRole('button', { name: 'Purchase selected upgrades' }));
  expect(onPurchase).toHaveBeenCalledOnce();
});

it('keeps unavailable purchase controls disabled while allowing a local refresh action', async () => {
  const user = userEvent.setup();
  const onRefresh = vi.fn();
  render(<EndeavourFieldUpgradeChoices
    options={options}
    selectedKeys={[]}
    remaining={2}
    showTargets={false}
    selectionDisabled
    purchaseDisabled
    busy={false}
    purchaseLabel="Purchase selected upgrades"
    onTargetChange={vi.fn()}
    onPurchase={vi.fn()}
    onRetryStale={vi.fn()}
    onRetryExact={vi.fn()}
    onRefresh={onRefresh}
  />);

  expect(screen.queryByRole('list', { name: 'Available Endeavour field upgrades' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Purchase selected upgrades' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Refresh private research and purchase state' }));
  expect(onRefresh).toHaveBeenCalledOnce();
});
