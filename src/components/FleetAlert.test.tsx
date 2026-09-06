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
  expect(screen.getByRole('region', { name: 'Fleetwide red alert' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Raise fleetwide red alert' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Open red alert command cover' }));
  expect(screen.getByRole('button', { name: 'Raise fleetwide red alert' })).toHaveTextContent('Stand up');
  fireEvent.click(screen.getByRole('button', { name: 'Raise fleetwide red alert' }));
  await waitFor(() => expect(setFleetRedAlert).toHaveBeenCalledWith(true));
  expect(screen.queryByText(/wolf attack imminent/)).not.toBeInTheDocument();
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({ ...state.session!, fleetRedAlert: { active: true, revision: 1 } });
  });
  expect(screen.getByRole('status', { name: /wolf attack imminent/ })).toBeVisible();
  expect(screen.getByRole('status', { name: /wolf attack imminent/ }))
    .toHaveAccessibleName(/non-crew civilians must shelter in place until alert lifted/i);
  fireEvent.click(screen.getByRole('button', { name: 'Open red alert command cover' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stand down' }));
  await waitFor(() => expect(setFleetRedAlert).toHaveBeenCalledWith(false));
});
it('does not offer the command to other roles and shows fleet messages to them', () => {
  act(() => { const state = useSessionStore.getState(); state.setMe({ ...state.me!, activeConsoleRoleId: 'wing-commander' }); state.setSession({ ...state.session!, fleetRedAlert: { active: false, revision: 2 } }); });
  render(<><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={0} /><FleetBroadcast /></>);
  expect(screen.queryByRole('button', { name: 'Fleetwide red alert' })).not.toBeInTheDocument();
  expect(screen.getByRole('status', { name: /red alert cancelled by AEGIS/ })).toBeVisible();
});
it('disables offline commands and reports server failures', async () => {
  vi.mocked(setFleetRedAlert).mockRejectedValueOnce(new Error('Command rejected'));
  render(<FleetAlertControl />);
  fireEvent.click(screen.getByRole('button', { name: 'Open red alert command cover' }));
  fireEvent.click(screen.getByRole('button', { name: 'Raise fleetwide red alert' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Command rejected');
  act(() => useSessionStore.getState().setConnection('offline'));
  expect(screen.getByRole('button', { name: 'Raise fleetwide red alert' })).toBeDisabled();
});
