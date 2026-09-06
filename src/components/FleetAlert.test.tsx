import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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
afterEach(() => vi.useRealTimers());
it('runs the Admiral command, waits for authority, then offers stand down', async () => {
  render(<><FleetAlertControl /><FleetBroadcast /></>);
  expect(screen.queryByLabelText('Fleet broadcasts')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'FLEETWIDE RED ALERT' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }));
  expect(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' })).toHaveTextContent('STAND UP');
  fireEvent.click(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' }));
  await waitFor(() => expect(setFleetRedAlert).toHaveBeenCalledWith(true, expect.stringContaining('WOLF ATTACK IMMINENT')));
  expect(screen.queryByRole('status', { name: /WOLF ATTACK IMMINENT/ })).not.toBeInTheDocument();
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
      pressDispatch: {
        dispatches: [{ id: 'dispatch-1', text: 'SNN // Convoy arrival confirmed' }],
        revision: 1,
      },
    });
  });
  render(<FleetBroadcast />);
  expect(screen.getByRole('status', {
    name: 'SNN // Convoy arrival confirmed',
  })).toBeVisible();
});
it('keeps the last press copy moving until it clears the ticker window', () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    pressDispatch: {
      dispatches: [{ id: 'dispatch-1', text: 'SNN // Convoy arrival confirmed' }],
      revision: 1,
    },
  });
  const view = render(<FleetBroadcast />);

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    pressDispatch: { dispatches: [], revision: 2 },
  }));

  expect(screen.getByLabelText('Fleet broadcasts'))
    .toHaveTextContent('SNN // Convoy arrival confirmed');
  view.container.querySelectorAll<HTMLElement>(
    '.fleet-ticker__group[data-message-id="s1:press-dispatch:1"]',
  ).forEach((group) => fireEvent.animationEnd(group));
  expect(screen.queryByLabelText('Fleet broadcasts')).not.toBeInTheDocument();
});

it('shows every active press dispatch on the fleet ticker', () => {
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({
      ...state.session!,
      pressDispatch: {
        dispatches: [
          { id: 'dispatch-1', text: 'SNN // First report' },
          { id: 'dispatch-2', text: 'SNN // Second report' },
        ],
        revision: 2,
      },
    });
  });
  render(<FleetBroadcast />);
  expect(screen.getByRole('status', {
    name: 'SNN // First report // SNN // Second report',
  })).toBeVisible();
});
it('does not offer the command to other roles and shows fleet messages to them', () => {
  act(() => { const state = useSessionStore.getState(); state.setMe({ ...state.me!, activeConsoleRoleId: 'wing-commander' }); state.setSession({ ...state.session!, fleetRedAlert: { active: false, revision: 2 } }); });
  render(<MemoryRouter><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={0} /><FleetBroadcast /></MemoryRouter>);
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

it('shows the ten-minute cooldown and unlocks without requiring a session update', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  const state = useSessionStore.getState();
  state.setSession({ ...state.session!, fleetRedAlert: {
    active: false, revision: 2, raisedAt: '2026-09-06T11:55:00.000Z',
  } });
  render(<FleetAlertControl />);
  fireEvent.click(screen.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }));
  expect(screen.getByText('5 MINUTES REMAINING // FLEET ALERT COOLDOWN')).toBeVisible();
  expect(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' })).toBeDisabled();
  act(() => vi.advanceTimersByTime(5 * 60 * 1000));
  expect(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' })).toBeEnabled();
});

it('keeps new press dispatches in the active warning sequence', () => {
  const state = useSessionStore.getState();
  state.setSession({ ...state.session!, fleetRedAlert: { active: true, revision: 1, text: 'hold position' }, pressDispatch: { dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }], revision: 1 } });
  render(<FleetBroadcast />);
  expect(screen.getByRole('status', { name: /hold position.*SNN \/\/ First report/ })).toBeVisible();
  act(() => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, pressDispatch: { dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }, { id: 'dispatch-2', text: 'SNN // Updated report' }], revision: 2 } }));
  expect(screen.getByRole('status', { name: /hold position.*Updated report/ })).toBeVisible();
});
it('converts the Admiral warning and default message to uppercase as it is written', async () => {
  render(<FleetAlertControl />);
  const input = screen.getByRole('textbox', { name: 'ALERT MESSAGE' });
  const original = (input as HTMLTextAreaElement).value;
  expect(original).toContain('WOLF ATTACK IMMINENT');
  fireEvent.change(input, { target: { value: 'Hold position' } });
  expect(input).toHaveValue('HOLD POSITION');
  fireEvent.click(screen.getByRole('button', { name: 'RESTORE DEFAULT' }));
  expect(input).toHaveValue(original);
  fireEvent.change(input, { target: { value: 'Hold position' } });
  fireEvent.click(screen.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }));
  fireEvent.click(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' }));
  await waitFor(() => expect(setFleetRedAlert).toHaveBeenCalledWith(true, 'HOLD POSITION'));
});
