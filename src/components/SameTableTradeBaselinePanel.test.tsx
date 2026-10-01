import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Player } from '@/types/game';
import { SameTableTradeBaselinePanel } from './SameTableTradeBaselinePanel';

afterEach(cleanup);

function player(overrides: Partial<Player> = {}): Player {
  return {
    uid: 'player-a',
    sessionId: 'session-1',
    displayName: 'Aster',
    role: 'player',
    seatId: null,
    joinedAt: '',
    connected: true,
    ...overrides,
  };
}

const RESOURCE_LABELS = ['Ore', 'Fuel', 'Food', 'Water', 'Materials', 'Security Teams'] as const;

function chooseTarget(uid: string) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Player to attest' }), {
    target: { value: uid },
  });
}

function fillBalances(values: readonly string[] = ['1', '2', '3', '4', '5', '6']) {
  RESOURCE_LABELS.forEach((label, index) => {
    fireEvent.change(screen.getByRole('spinbutton', { name: label }), {
      target: { value: values[index] },
    });
  });
}

function submitForm() {
  fireEvent.submit(screen.getByRole('form', { name: 'Physical tabletop baseline' }));
}

it('lists only active connected players with safe text labels and no held balance disclosure', () => {
  const onAttest = vi.fn().mockResolvedValue({ status: 'attested' as const });
  const roster = [
    Object.assign(player({ uid: 'pilot-1', displayName: '<img src=x onerror=alert(1)> Pilot' }), {
      balances: { ore: 987654 },
    }),
    player({ uid: 'offline', displayName: 'Offline Pilot', connected: false }),
    player({ uid: 'gm', displayName: 'Facilitator', role: 'gm' }),
    player({ uid: 'observer', displayName: 'Observer', role: 'observer' }),
  ];

  render(<SameTableTradeBaselinePanel players={roster} onAttest={onAttest} />);

  const selector = screen.getByRole('combobox', { name: 'Player to attest' });
  expect(screen.getByRole('option', { name: '<img src=x onerror=alert(1)> Pilot' })).toHaveValue('pilot-1');
  expect(screen.queryByRole('option', { name: 'Offline Pilot' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Facilitator' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Observer' })).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByText('987654')).not.toBeInTheDocument();
  expect(selector).toBeEnabled();
});

it('renders exactly six labelled integer fields and accepts zero in every balance', async () => {
  const onAttest = vi.fn().mockResolvedValue({ status: 'attested' as const });
  render(<SameTableTradeBaselinePanel players={[player()]} onAttest={onAttest} />);
  chooseTarget('player-a');

  const fields = screen.getAllByRole('spinbutton');
  expect(fields).toHaveLength(6);
  RESOURCE_LABELS.forEach((label) => {
    expect(screen.getByRole('spinbutton', { name: label })).toHaveAttribute('min', '0');
    expect(screen.getByRole('spinbutton', { name: label })).toHaveAttribute('step', '1');
  });
  fillBalances(['0', '0', '0', '0', '0', '0']);
  submitForm();

  await waitFor(() => expect(onAttest).toHaveBeenCalledTimes(1));
  expect(onAttest).toHaveBeenCalledWith({
    targetUid: 'player-a',
    balances: { ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 },
    attestationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  });
});

it.each([
  ['a blank count', '', 'Ore'],
  ['a fraction', '1.5', 'Fuel'],
  ['a negative count', '-1', 'Food'],
  ['an unsafe integer', '9007199254740992', 'Water'],
])('rejects %s without calling the attestation callback', (_description, value, label) => {
  const onAttest = vi.fn().mockResolvedValue({ status: 'attested' as const });
  render(<SameTableTradeBaselinePanel players={[player()]} onAttest={onAttest} />);
  chooseTarget('player-a');
  fillBalances();
  fireEvent.change(screen.getByRole('spinbutton', { name: label }), { target: { value } });

  submitForm();

  expect(onAttest).not.toHaveBeenCalled();
  expect(screen.getByRole('spinbutton', { name: label })).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

it('requires a target and focuses that control before a submission can run', () => {
  const onAttest = vi.fn().mockResolvedValue({ status: 'attested' as const });
  render(<SameTableTradeBaselinePanel players={[player()]} onAttest={onAttest} />);
  fillBalances();

  submitForm();

  expect(onAttest).not.toHaveBeenCalled();
  expect(screen.getByRole('combobox', { name: 'Player to attest' })).toHaveFocus();
  expect(screen.getByRole('combobox', { name: 'Player to attest' })).toHaveAttribute('aria-invalid', 'true');
});

it('focuses the first invalid count and disables entry when there are no active connected players', () => {
  const onAttest = vi.fn().mockResolvedValue({ status: 'attested' as const });
  const { unmount } = render(<SameTableTradeBaselinePanel players={[player()]} onAttest={onAttest} />);
  chooseTarget('player-a');
  fillBalances();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Ore' }), { target: { value: '' } });
  submitForm();
  expect(screen.getByRole('spinbutton', { name: 'Ore' })).toHaveFocus();

  unmount();
  render(<SameTableTradeBaselinePanel players={[player({ connected: false })]} onAttest={onAttest} />);
  expect(screen.getByRole('combobox', { name: 'Player to attest' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Record tabletop counts' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(/no connected players/i);
});

it('keeps one UUID for an ambiguous retry with the exact same target and six counts', async () => {
  const onAttest = vi.fn()
    .mockRejectedValueOnce(new Error('connection lost after sending'))
    .mockResolvedValueOnce({ status: 'replayed' as const });
  render(<SameTableTradeBaselinePanel players={[player()]} onAttest={onAttest} />);
  chooseTarget('player-a');
  fillBalances(['11', '12', '13', '14', '15', '16']);

  submitForm();
  await screen.findByRole('alert');
  expect(screen.getByRole('spinbutton', { name: 'Ore' })).toHaveValue(11);
  const firstId = onAttest.mock.calls[0]![0].attestationId;

  submitForm();
  await screen.findByRole('status', { name: /exact request replayed/i });

  expect(onAttest).toHaveBeenCalledTimes(2);
  expect(onAttest.mock.calls[1]![0].attestationId).toBe(firstId);
});

it('creates a new retry UUID after the target changes and after a count changes', async () => {
  const onAttest = vi.fn()
    .mockRejectedValueOnce(new Error('first attempt outcome is unknown'))
    .mockRejectedValueOnce(new Error('second attempt outcome is unknown'))
    .mockResolvedValueOnce({ status: 'attested' as const });
  render(<SameTableTradeBaselinePanel players={[player(), player({ uid: 'player-b', displayName: 'Beryl' })]} onAttest={onAttest} />);
  chooseTarget('player-a');
  fillBalances();

  submitForm();
  await screen.findByRole('alert');
  const firstId = onAttest.mock.calls[0]![0].attestationId;

  chooseTarget('player-b');
  submitForm();
  await waitFor(() => expect(onAttest).toHaveBeenCalledTimes(2));
  const secondId = onAttest.mock.calls[1]![0].attestationId;

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Materials' }), { target: { value: '7' } });
  submitForm();
  await screen.findByRole('status', { name: /baseline recorded/i });
  const thirdId = onAttest.mock.calls[2]![0].attestationId;

  expect(new Set([firstId, secondId, thirdId]).size).toBe(3);
});

it.each([
  ['attested', 'Physical tabletop counts recorded for Aster.'],
  ['replayed', 'These exact tabletop counts were already recorded for Aster.'],
] as const)('announces a confirmed %s result without repeating counts and clears the form', async (status, announcement) => {
  const onAttest = vi.fn().mockResolvedValue({ status });
  render(<SameTableTradeBaselinePanel players={[player()]} onAttest={onAttest} />);
  chooseTarget('player-a');
  fillBalances(['21', '22', '23', '24', '25', '26']);

  submitForm();

  const success = await screen.findByRole('status', { name: new RegExp(status === 'replayed' ? 'exact request replayed' : 'baseline recorded', 'i') });
  expect(success).toHaveTextContent(announcement);
  expect(success).not.toHaveTextContent(/21|22|23|24|25|26/);
  RESOURCE_LABELS.forEach((label) => expect(screen.getByRole('spinbutton', { name: label })).toHaveValue(null));
});
