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
const replacementCandidates = [
  { uid: 'engineer', displayName: 'Engineer', roleId: 'dione-engineer', eligibilityRevision: 4 },
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

it('shows the current base-craft holder and transfers command only to a selected eligible player', async () => {
  render(<GmMutinyRecovery shipId="gorgoneion" shipName="Gorgoneion" unrest={8}
    mode="replacement-transfer"
    currentCaptain={{ uid: 'old', displayName: 'Old Captain', roleId: 'gorgoneion-captain' }}
    mutiny={{ status: 'active', revision: 2, triggerUnrest: 8, triggeredAt: 'now' }}
    candidates={replacementCandidates} expectedRevision={2} writable />);

  expect(screen.getByText(/Current captain.*Old Captain.*gorgoneion-captain/i)).toBeVisible();
  expect(screen.getByText(/replacement eligibility/i)).toBeVisible();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'New captain' }), 'engineer');
  await userEvent.click(screen.getByRole('button', { name: 'Install replacement captain' }));
  expect(resolve).toHaveBeenCalledWith(
    'gorgoneion', 'engineer', 2, 2, 'replacement-transfer', 4,
  );
});

it('records explicit Voyage 33-0 crew replacement without selecting or granting a player identity', async () => {
  render(<GmMutinyRecovery shipId="voyage-33-0" shipName="Voyage 33-0" unrest={9}
    mode="crew-attestation"
    mutiny={{ status: 'active', revision: 3, triggerUnrest: 9, triggeredAt: 'now' }}
    candidates={[]} expectedRevision={3} writable />);

  expect(screen.queryByRole('combobox', { name: 'New captain' })).not.toBeInTheDocument();
  expect(screen.getByText(/crew has installed a new in-world captain/i)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm crew captain replacement' }));
  expect(resolve).toHaveBeenCalledWith('voyage-33-0', null, 2, 3, 'crew-attestation');
});
