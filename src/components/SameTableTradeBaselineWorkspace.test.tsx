import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Player } from '@/types/game';

const mocks = vi.hoisted(() => ({ attest: vi.fn() }));

vi.mock('@/lib/sameTableTradeService', () => ({
  attestPlayerHeldTokenBaseline: mocks.attest,
}));

import SameTableTradeBaselineWorkspace from './SameTableTradeBaselineWorkspace';

const player = {
  uid: 'player-1', sessionId: 's1', role: 'player', displayName: 'Alice',
  connected: true, joinedAt: '2026-09-30T00:00:00.000Z',
} as Player;

it('routes a facilitator baseline entry through the authenticated service and reports its result', async () => {
  const user = userEvent.setup();
  mocks.attest.mockResolvedValue({ status: 'attested', sessionId: 's1' });
  render(<SameTableTradeBaselineWorkspace players={[player]} />);

  await user.selectOptions(screen.getByLabelText('Player to attest'), 'player-1');
  await user.type(screen.getByLabelText('Ore'), '3');
  await user.type(screen.getByLabelText('Fuel'), '2');
  await user.type(screen.getByLabelText('Food'), '1');
  await user.type(screen.getByLabelText('Water'), '0');
  await user.type(screen.getByLabelText('Materials'), '4');
  await user.type(screen.getByLabelText('Security Teams'), '0');
  await user.click(screen.getByRole('button', { name: 'Record tabletop counts' }));

  await waitFor(() => expect(mocks.attest).toHaveBeenCalledTimes(1));
  const [targetUid, balances, requestId] = mocks.attest.mock.calls[0] as [string, Record<string, number>, string];
  expect(targetUid).toBe('player-1');
  expect(balances).toEqual({ ore: 3, fuel: 2, food: 1, water: 0, materials: 4, securityTeams: 0 });
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(await screen.findByRole('status', { name: 'Baseline recorded' })).toHaveTextContent(/does not grant ship inventory/i);
});

it('keeps the panel retryable when the authorized baseline call fails', async () => {
  const user = userEvent.setup();
  mocks.attest.mockRejectedValue(new Error('failed-precondition'));
  render(<SameTableTradeBaselineWorkspace players={[player]} />);

  await user.selectOptions(screen.getByLabelText('Player to attest'), 'player-1');
  for (const label of ['Ore', 'Fuel', 'Food', 'Water', 'Materials', 'Security Teams']) {
    await user.type(screen.getByLabelText(label), '1');
  }
  await user.click(screen.getByRole('button', { name: 'Record tabletop counts' }));

  expect(await screen.findByRole('alert', { name: 'Baseline entry error' })).toHaveTextContent(/retry the same target and counts/i);
  expect(screen.getByRole('button', { name: 'Record tabletop counts' })).toBeEnabled();
});
