import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { subscribeSessionState } from '@/lib/firestore';
import AegisConsoleWorkspace from './AegisConsoleWorkspace';
import AirspaceControl from './AirspaceControl';
import EmergencyTimerPauseControl from './EmergencyTimerPauseControl';
import FleetBroadcast from './FleetBroadcast';
import FleetAlertControl from './FleetAlertControl';
import { DradisAirspaceTimer } from './TurnPhaseTimer';
const firestoreMocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_database: unknown, path: string) => ({ path })),
  connectFirestoreEmulator: vi.fn(),
  doc: vi.fn((_database: unknown, path: string) => ({ path })),
  getFirestore: vi.fn(() => ({})),
  onSnapshot: firestoreMocks.onSnapshot,
  orderBy: vi.fn(),
  limit: vi.fn(),
  query: vi.fn((_collection: unknown) => _collection),
  where: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({ app: vi.fn(() => ({})) }));
vi.mock('@/lib/firebaseConfig', () => ({
  emulatorPorts: { firestore: 8080 },
  useEmulators: false,
}));
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

function ReconnectedPhaseSurface() {
  const phase = useSessionStore((state) => state.session?.turnPhase);
  const connection = useSessionStore((state) => state.connection);
  return <>
    <DradisAirspaceTimer phase={phase} />
    <EmergencyTimerPauseControl phase={phase} connection={connection} />
    <AirspaceControl />
  </>;
}

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
    name: 'ICSN ADMIRAL // RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED',
  })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }));
  fireEvent.click(screen.getByRole('button', { name: 'STAND DOWN' }));
  await waitFor(() => expect(setFleetRedAlert).toHaveBeenCalledWith(false));
});

it('holds the Admiral alert controls during Turn 0 for a player', () => {
  const state = useSessionStore.getState();
  state.setSession({ ...state.session!, currentTurn: 0 });
  render(<FleetAlertControl />);

  expect(screen.getByRole('textbox', { name: 'ALERT MESSAGE' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' })).toBeDisabled();
  expect(screen.getByText('FLEET COMMAND // TURN 0 // AWAITING IRIS AUTHENTICATION')).toBeVisible();
});
it('shows the latest press dispatch while no alert is active', () => {
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({
      ...state.session!,
      pressDispatch: {
        dispatches: [{ id: 'dispatch-1', text: 'Convoy arrival confirmed' }],
        revision: 1,
      },
    });
  });
  render(<FleetBroadcast />);
  expect(screen.getByRole('status', { name: 'SNN // Convoy arrival confirmed' })).toBeVisible();
});

it('warns about the Turn 0 console lockout and drains it when Turn 1 begins', () => {
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({ ...state.session!, currentTurn: 0 });
  });

  const view = render(<FleetBroadcast />);

  expect(screen.getByRole('status', {
    name: 'AEGIS // CONSOLES LOCKED OUT UNTIL IRIS AUTHENTICATION IS COMPLETE',
  })).toBeVisible();
  expect(screen.getByLabelText('Fleet broadcasts')).toHaveAttribute('data-gap', 'long');

  act(() => {
    const state = useSessionStore.getState();
    state.setSession({ ...state.session!, currentTurn: 1 });
  });

  expect(screen.getByRole('status', {
    name: 'AEGIS // CONSOLES LOCKED OUT UNTIL IRIS AUTHENTICATION IS COMPLETE',
  })).toBeVisible();
  view.container.querySelectorAll<HTMLElement>(
    '.fleet-ticker__group[data-message-id="s1:turn-zero-console-lockout"]',
  ).forEach((group) => fireEvent.animationEnd(group));
  expect(screen.queryByRole('status', {
    name: 'AEGIS // CONSOLES LOCKED OUT UNTIL IRIS AUTHENTICATION IS COMPLETE',
  })).not.toBeInTheDocument();
});

it('drains the Turn 0 lockout tail before replaying it when setup returns', () => {
  const lockoutId = 's1:turn-zero-console-lockout';
  const lockoutName = 'AEGIS // CONSOLES LOCKED OUT UNTIL IRIS AUTHENTICATION IS COMPLETE';
  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 0,
  }));
  const view = render(<FleetBroadcast />);

  expect(screen.getByRole('status', { name: lockoutName })).toBeVisible();
  const outgoing = [...view.container.querySelectorAll<HTMLElement>(
    `.fleet-ticker__group[data-message-id="${lockoutId}"]`,
  )];
  expect(outgoing).toHaveLength(2);

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 1,
  }));

  expect(view.container.querySelectorAll(
    `.fleet-ticker__group[data-message-id="${lockoutId}"]`,
  )).toHaveLength(2);
  expect(view.container.querySelector('.fleet-ticker')).toHaveTextContent(lockoutName);
  expect(screen.getByRole('status', { name: lockoutName })).toBeVisible();

  outgoing.forEach((group) => fireEvent.animationEnd(group));
  expect(view.container.querySelector('.fleet-ticker')).toBeNull();

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 0,
  }));

  expect(screen.getByRole('status', { name: lockoutName })).toBeVisible();
});

it('posts the current airspace window as a compact looping Airspace Control bulletin', () => {
  act(() => {
    const state = useSessionStore.getState();
    const now = new Date(Date.now());
    state.setSession({
      ...state.session!,
      currentTurn: 1,
      turnPhase: {
        turn: 1,
        teamPhaseEndsAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
        openAirspaceEndsAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
    } as never);
  });
  const { container } = render(<FleetBroadcast />);

  expect(screen.getByRole('status', {
    name: 'AIRSPACE CONTROL // AIRSPACE CLOSED // AIRSPACE LOCKDOWN, ALL CREW MUST RETURN TO ORIGIN SHIPS / STAY IN THEIR ORIGIN SHIPS // SHUTTLES MUST STAY AT CURRENT LOCATION.',
  })).toBeVisible();
  expect(container.querySelector('.fleet-ticker')).toHaveAttribute('data-gap', 'long');
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({
      ...state.session!,
      pressDispatch: {
        dispatches: [{ id: 'dispatch-1', text: 'SNN // Convoy arrival confirmed' }],
        revision: 1,
      },
      turnPhase: {
        ...state.session!.turnPhase!,
        airspace: { state: 'restricted', tickerActive: false, pressAccess: false },
      },
    } as never);
  });

  expect(screen.getByRole('status', {
    name: 'SNN // Convoy arrival confirmed',
  })).toBeVisible();
});

it('rehydrates the live timer and permitted actions from the same server phase after reconnect', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-09T17:10:00.000Z'));
  const listeners: Array<{ path: string; callback: (snapshot: unknown) => void }> = [];
  firestoreMocks.onSnapshot.mockImplementation((target: { path: string }, callback: (snapshot: unknown) => void) => {
    listeners.push({ path: target.path, callback });
    return vi.fn();
  });
  const authoritativeSnapshot = {
    name: 'Table',
    joinCode: '1234',
    phase: 'active',
    currentTurn: 1,
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-09T17:15:00.000Z',
      openAirspaceEndsAt: '2026-09-09T17:30:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    ownerUid: 'u1',
    createdAt: '2026-09-09T17:00:00.000Z',
    updatedAt: '2026-09-09T17:05:00.000Z',
  };
  const liftedSnapshot = {
    ...authoritativeSnapshot,
    updatedAt: '2026-09-09T17:06:00.000Z',
    turnPhase: {
      ...authoritativeSnapshot.turnPhase,
      teamPhaseEndsAt: '2026-09-09T17:05:00.000Z',
      airspace: { state: 'lifted' as const, tickerActive: true, pressAccess: false },
    },
  };
  const subscribeToAuthoritativeSession = () => {
    const start = listeners.length;
    const stop = subscribeSessionState('s1', 'u1', {
      onSession: (session) => useSessionStore.getState().setSession(session),
      onPlayer: vi.fn(),
      onKicked: vi.fn(),
      onSeats: vi.fn(),
      onError: vi.fn(),
    });
    const sessionListener = listeners.slice(start).find(({ path }) => path === 'sessions/s1');
    if (!sessionListener) throw new Error('Expected the session Firestore listener.');
    return { stop, sessionListener };
  };

  const feed = (listener: { callback: (snapshot: unknown) => void }, data: typeof authoritativeSnapshot) => {
    act(() => {
      listener.callback({
        exists: () => true,
        id: 's1',
        data: () => data,
      });
    });
  };

  const first = subscribeToAuthoritativeSession();
  feed(first.sessionListener, authoritativeSnapshot);
  const view = render(<><FleetBroadcast /><ReconnectedPhaseSurface /></>);
  expect(screen.getByRole('status', { name: 'Airspace closed // 05:00 remaining' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Disarm interlock // Pause timer' })).toBeEnabled();
  fireEvent.click(screen.getByText('Systems control'));
  expect(screen.getByRole('button', { name: 'Unlock airspace // Press' })).toBeEnabled();

  act(() => { vi.advanceTimersByTime(2 * 60_000); });
  expect(screen.getByRole('status', { name: 'Airspace closed // 03:00 remaining' })).toBeVisible();

  view.unmount();
  first.stop();
  listeners.length = 0;
  const reconnect = subscribeToAuthoritativeSession();
  feed(reconnect.sessionListener, authoritativeSnapshot);
  render(<><FleetBroadcast /><ReconnectedPhaseSurface /></>);

  expect(screen.getByRole('status', { name: 'Airspace closed // 03:00 remaining' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Disarm interlock // Pause timer' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Unlock airspace // Press' })).toBeEnabled();

  feed(reconnect.sessionListener, liftedSnapshot);
  expect(screen.getByRole('status', { name: 'Airspace open // 18:00 remaining' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Unlock airspace // Press' })).toBeDisabled();
  reconnect.stop();
});

it('broadcasts an emergency timer hold as a fleetwide Airspace Control bulletin', () => {
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({
      ...state.session!,
      currentTurn: 2,
      turnPhase: {
        turn: 2,
        teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
        openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
        timerPause: {
          window: 'restricted',
          remainingMs: 180_000,
          pausedAt: '2026-09-06T12:02:00.000Z',
        },
      },
    } as never);
  });

  render(<FleetBroadcast />);

  expect(screen.getByRole('status', {
    name: 'AIRSPACE CONTROL // EMERGENCY TIMER PAUSED // ALL FLEET CLOCKS ON HOLD // GM RESUME REQUIRED',
  })).toBeVisible();
});
it('lists the game and web app credits when the finale is live', () => {
  act(() => {
    const state = useSessionStore.getState();
    state.setSession({
      ...state.session!,
      fleetRedAlert: { active: true, revision: 4, text: 'Wolf attack imminent' },
      pressDispatch: {
        dispatches: [{ id: 'dispatch-1', text: 'Fleet status update' }],
        revision: 2,
      },
      debriefMode: { active: true, revision: 1 },
    });
  });

  render(<FleetBroadcast />);

  expect(screen.getByRole('status', {
    name: 'CREDITS // BASED ON THE ORIGINAL MEGAGAME DEN OF WOLVES BY JOHN MIZON (SOUTH WEST MEGAGAMES) // NEW EDEN GAME DESIGN: JOHN KEYWORTH (KIWI GAME DESIGN) // WEB APP LEAD: EMERALD FLEUR PHAM',
  })).toBeVisible();
});

it('drains finale credits before clearing the lane and replays only on a new revision', () => {
  const firstId = 's1:finale-credits:1';
  const credits = 'CREDITS // BASED ON THE ORIGINAL MEGAGAME DEN OF WOLVES BY JOHN MIZON (SOUTH WEST MEGAGAMES) // NEW EDEN GAME DESIGN: JOHN KEYWORTH (KIWI GAME DESIGN) // WEB APP LEAD: EMERALD FLEUR PHAM';
  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    debriefMode: { active: true, revision: 1 },
  }));
  const view = render(<FleetBroadcast />);

  expect(screen.getByRole('status', { name: credits })).toBeVisible();
  const outgoing = [...view.container.querySelectorAll<HTMLElement>(
    `.fleet-ticker__group[data-message-id="${firstId}"]`,
  )];
  expect(outgoing).toHaveLength(2);

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    debriefMode: { active: false, revision: 2 },
  }));
  expect(screen.getByRole('status', { name: credits })).toBeVisible();
  outgoing.forEach((group) => fireEvent.animationEnd(group));
  expect(screen.queryByRole('status', { name: credits })).not.toBeInTheDocument();

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    debriefMode: { active: true, revision: 2 },
  }));
  expect(screen.getByRole('status', { name: credits })).toBeVisible();
  expect(view.container.querySelector(
    '.fleet-ticker__group[data-message-id="s1:finale-credits:2"]',
  )).toBeInTheDocument();
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
    name: 'AEGIS // RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.',
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

it('prefixes and capitalizes custom Admiral alerts in the active warning sequence', () => {
  const state = useSessionStore.getState();
  state.setSession({ ...state.session!, fleetRedAlert: { active: true, revision: 1, text: 'hold position' }, pressDispatch: { dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }], revision: 1 } });
  render(<FleetBroadcast />);
  expect(screen.getByRole('status', { name: /ICSN ADMIRAL \/\/ HOLD POSITION.*SNN \/\/ First report/ })).toBeVisible();
  act(() => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, pressDispatch: { dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }, { id: 'dispatch-2', text: 'SNN // Updated report' }], revision: 2 } }));
  expect(screen.getByRole('status', { name: /ICSN ADMIRAL \/\/ HOLD POSITION.*Updated report/ })).toBeVisible();
});
it('converts the Admiral warning and default message to uppercase as it is written', async () => {
  render(<FleetAlertControl />);
  const input = screen.getByRole('textbox', { name: 'ALERT MESSAGE' });
  const original = (input as HTMLTextAreaElement).value;
  expect(original).toBe('ICSN ADMIRAL // RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED');
  fireEvent.change(input, { target: { value: 'Hold position' } });
  expect(input).toHaveValue('HOLD POSITION');
  fireEvent.click(screen.getByRole('button', { name: 'RESTORE DEFAULT' }));
  expect(input).toHaveValue(original);
  fireEvent.change(input, { target: { value: 'Hold position' } });
  fireEvent.click(screen.getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }));
  fireEvent.click(screen.getByRole('button', { name: 'RAISE FLEETWIDE RED ALERT' }));
  await waitFor(() => expect(setFleetRedAlert).toHaveBeenCalledWith(true, 'HOLD POSITION'));
});
