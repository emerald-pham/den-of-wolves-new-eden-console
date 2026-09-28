import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GmMutinyRecovery from './GmMutinyRecovery';

const resolve = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/sessionService', () => ({ resolveShipMutiny: resolve }));

const candidates = [
  { uid: 'engineer', displayName: 'Engineer', roleId: 'dione-engineer' },
  { uid: 'president', displayName: 'President', roleId: 'dione-president' },
];

it('keeps mutiny visible and requires a chosen new captain before GM recovery', async () => {
  render(<GmMutinyRecovery shipId="dione" shipName="Dione" unrest={8}
    mutiny={{ status: 'active', revision: 1, triggerUnrest: 8, triggeredAt: 'now' }}
    candidates={candidates} expectedRevision={4} writable />);
  expect(screen.getByText(/Dione.*mutiny.*new captain/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Install replacement captain' })).toBeDisabled();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'New captain' }), 'engineer');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Unrest reduction' }), '3');
  await userEvent.click(screen.getByRole('button', { name: 'Install replacement captain' }));
  expect(resolve).toHaveBeenCalledWith('dione', 'engineer', 3, 4);
});

it('keeps the public mutiny resolved even if the selected reduction leaves unrest at eight or nine', () => {
  const { container } = render(<GmMutinyRecovery shipId="dione" shipName="Dione" unrest={9}
    mutiny={{ status: 'resolved', revision: 2, triggerUnrest: 10, triggeredAt: 'before',
      reduction: 1, recoveryRequestId: 'req', recoveredAt: 'now' }}
    candidates={candidates} expectedRevision={5} writable />);
  expect(container).toBeEmptyDOMElement();
});
