import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaintenanceSystems from './MaintenanceSystems';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
const run = vi.hoisted(() => vi.fn());
vi.mock('@/lib/maintenanceService', () => ({ runMaintenance: run }));
const session: GameSession = { id: 's1', name: 'Test', joinCode: 'TEST', phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '' };
const me: Player = { uid: 'u1', sessionId: 's1', displayName: 'Engineer', role: 'player', seatId: null, activeConsoleRoleId: 'admiral', joinedAt: '' };
beforeEach(() => { useSessionStore.setState({ session, me, connection: 'live' }); run.mockReset(); });
it.each(['aegis', 'capybara'])('keeps %s controls visible and only unlocks the current step', async shipId => {
  render(<MaintenanceSystems name={shipId} shipId={shipId} systems={[]} renderSystem={() => null} rations={null} />);
  expect(screen.getByRole('button', { name: 'Check storage' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Proceed with rations' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'End maintenance cycle' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 1' }));
  expect(run).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: 'ARE YOU SURE?' });
  expect(confirm).toHaveStyle({ color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' });
  await userEvent.click(confirm);
  expect(run).toHaveBeenCalledWith(shipId, 'begin', 0, {});
  act(() => useSessionStore.setState({ session: { ...session, maintenanceCycles: { [shipId]: { step: 1, revision: 1, results: {}, charges: [], refuelled: [] } } } }));
  expect(screen.getByRole('button', { name: 'Check storage' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 1' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Food ration level' })).toBeDisabled();
  run.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Check storage' }));
  expect(run).toHaveBeenCalledWith(shipId, 'storage', 1, {});
});
it('keeps completed maintenance locked until the GM advances the turn', () => {
  useSessionStore.setState({ session: {
    ...session,
    currentTurn: 4,
    maintenanceCycles: { aegis: {
      step: 0, revision: 8, turn: 4, results: { '7': 'Maintenance cycle complete.' },
      charges: [], refuelled: [], completedAt: '2026-09-06T12:04:00.000Z',
    } },
  } });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);

  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 4' })).toBeDisabled();

  act(() => useSessionStore.setState({ session: { ...useSessionStore.getState().session!, currentTurn: 5 } }));
  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 5' })).toBeEnabled();
});
it('presents every maintenance command as a boxed CIC action', () => {
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);

  for (const button of screen.getAllByRole('button')) {
    expect(button).toHaveClass('cic-action-button');
    expect(button).not.toHaveClass('cic-text-button');
  }
});
it('sends separate ration choices and displays server results across remounts', async () => {
  useSessionStore.setState({ session: { ...session, maintenanceCycles: { aegis: { step: 2, revision: 2, results: { '1': 'Storage intact. No resources lost.' }, charges: [], refuelled: [] } } } });
  render(<MaintenanceSystems name="AEGIS" shipId="aegis" systems={[]} renderSystem={() => null} rations={null} />);
  expect(screen.getByText('Storage intact. No resources lost.')).toBeVisible();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Food ration level' }), '1');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Water ration level' }), '2');
  await userEvent.click(screen.getByRole('button', { name: 'Proceed with rations' }));
  expect(run).toHaveBeenCalledWith('aegis', 'rations', 2, { foodLevel: 1, waterLevel: 2 });
});

it('resets start confirmation when the ship or turn changes and on blur', async () => {
  const view = (shipId: string) => <MaintenanceSystems name={shipId} shipId={shipId} systems={[]} renderSystem={() => null} rations={null} />;
  const { rerender } = render(view('aegis'));
  await userEvent.click(screen.getByRole('button', { name: /Begin Maintenance/ }));
  rerender(view('capybara'));
  expect(screen.queryByRole('button', { name: 'ARE YOU SURE?' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Begin Maintenance/ }));
  act(() => useSessionStore.setState({ session: { ...session, currentTurn: 2 } }));
  expect(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Turn 2' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: /Begin Maintenance/ }));
  await userEvent.tab();
  expect(screen.queryByRole('button', { name: 'ARE YOU SURE?' })).not.toBeInTheDocument();
  expect(run).not.toHaveBeenCalled();
});
