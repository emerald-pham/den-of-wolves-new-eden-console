import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import AegisConsoleWorkspace from './AegisConsoleWorkspace';
import FleetBroadcast from './FleetBroadcast';
import FleetAlertControl from './FleetAlertControl';
vi.mock('@/lib/fleetAlertService', () => ({ setFleetRedAlert: vi.fn() }));
const { setFleetRedAlert } = await import('@/lib/fleetAlertService');
beforeEach(() => {
  vi.mocked(setFleetRedAlert).mockReset();
  useSessionStore.getState().reset(); sessionStorage.clear();
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Table', joinCode: '1234', phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '' },
    { uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player', seatId: null, activeConsoleRoleId: 'admiral', joinedAt: '' });
  useSessionStore.getState().setConnection('live');
});
it('runs the Admiral command, waits for authority, then offers stand down', async () => {
  render(<><FleetAlertControl /><FleetBroadcast /></>);
  expect(screen.queryByLabelText('Fleet broadcasts')).not.toBeInTheDocument();
  const command = screen.getByRole('region', { name: 'FLEETWIDE RED ALERT' });
  expect(command.textContent).toBe(command.textContent?.toUpperCase());
  expect(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }));
  expect(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' })).toHaveTextContent('STAND UP');
  fireEvent.click(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' }));
  await waitFor(() => expect(setFleetRedAlert).toHaveBeenCalledWith(true));
  expect(screen.queryByText(/wolf attack imminent/)).not.toBeInTheDocument();
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({ ...state.session!, fleetRedAlert: { active: true, revision: 1 } });
  });
  expect(screen.getByRole('status', {
    name: 'RED ALERT FROM AEGIS ADMIRAL - WOLF ATTACK IMMINENT, ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED',
  })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }));
  fireEvent.click(screen.getByRole('button', { name: 'STAND DOWN' }));
  await waitFor(() => expect(setFleetRedAlert).toHaveBeenCalledWith(false));
});
it('shows the latest press dispatch while no alert is active', () => {
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({
      ...state.session!,
      pressDispatch: { text: 'SNN // Convoy arrival confirmed', revision: 1 },
    });
  });
  render(<FleetBroadcast />);
  expect(screen.getByRole('status', {
    name: 'SNN // Convoy arrival confirmed',
  })).toBeVisible();
});
it('does not offer the command to other roles and shows fleet messages to them', () => {
  act(() => { const state = useSessionStore.getState(); state.setMe({ ...state.me!, activeConsoleRoleId: 'wing-commander' }); state.setSession({ ...state.session!, fleetRedAlert: { active: false, revision: 2 } }); });
  render(<><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={0} /><FleetBroadcast /></>);
  expect(screen.queryByRole('button', { name: 'Fleetwide red alert' })).not.toBeInTheDocument();
  expect(screen.getByRole('status', {
    name: 'RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.',
  })).toBeVisible();
});
it('disables offline commands and reports server failures', async () => {
  vi.mocked(setFleetRedAlert).mockRejectedValueOnce(new Error('Command rejected'));
  render(<FleetAlertControl />);
  fireEvent.click(screen.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }));
  fireEvent.click(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('COMMAND REJECTED');
  act(() => useSessionStore.getState().setConnection('offline'));
  expect(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' })).toBeDisabled();
});
