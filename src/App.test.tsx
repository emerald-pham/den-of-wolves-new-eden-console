import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  GM_ACCESS_TIMEOUT_MS,
  SESSION_STORAGE_KEY,
  useSessionStore,
} from '@/store/useSessionStore';
import type { GameSession, GmInstance, Player, RoleBrief } from '@/types/game';
import { SHIP_PLOT_RESIZE_MS } from '@/components/ShipPlot';
import { SESSION_WAIVER_STORAGE_KEY } from '@/lib/sessionWaiver';
import { MOTION_SAFETY_STORAGE_KEY } from '@/lib/motionSafety';
import { recommendedRoleIds } from '@/data/rolePresets';

vi.mock('@/lib/sessionService', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  beginOpenAirspacePhase: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn(),
  disconnectFromSession: vi.fn(),
  joinSession: vi.fn(),
  kickGmInstance: vi.fn(),
  loginGmAccess: vi.fn(),
  listGmInstances: vi.fn().mockResolvedValue([]),
  logoutGmAccess: vi.fn(),
  popShipConfetti: vi.fn(),
  reconcileGmAuthority: vi.fn().mockResolvedValue(undefined),
  refreshPresence: vi.fn().mockResolvedValue(undefined),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
  releaseGmInstance: vi.fn(),
  selectConsoleRole: vi.fn().mockResolvedValue(undefined),
  setGmControlsLocked: vi.fn(),
  triggerDradisContact: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  sessionSnapshotAuthorityFor: vi.fn(() => ({ hasServerSessionAuthority: false })),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeSessionState: vi.fn(() => vi.fn()),
  subscribeGmInstances: vi.fn((
    _sessionId: string,
    onInstances: (instances: readonly GmInstance[]) => void,
  ) => {
    onInstances([]);
    return vi.fn();
  }),
  subscribeShipConfetti: vi.fn(() => vi.fn()),
  subscribeSessionEvents: vi.fn((_sessionId: string, onEvents: (events: never[]) => void) => {
    onEvents([]);
    return vi.fn();
  }),
  subscribeDamageDraws: vi.fn((_sessionId: string, onDraws: (draws: never[]) => void) => {
    onDraws([]);
    return vi.fn();
  }),
}));

vi.mock('@/lib/versionUpgrade', () => ({
  startVersionUpgradeMonitor: vi.fn(() => vi.fn()),
}));

const {
  connect,
  disconnectFromSession,
  logoutGmAccess,
  reconcileGmAuthority,
  refreshPresence,
  releaseConsoleRole,
  selectConsoleRole,
} =
  await import('@/lib/sessionService');
const { sessionSnapshotAuthorityFor, subscribeSessionState } = await import('@/lib/firestore');
const { startVersionUpgradeMonitor } = await import('@/lib/versionUpgrade');

describe('App', () => {
  const session: GameSession = {
    id: 's1',
    name: 'Table one',
    joinCode: '4821',
    phase: 'lobby',
    ownerUid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const player: Player = {
    uid: 'u1',
    sessionId: 's1',
    displayName: 'GM',
    role: 'gm',
    seatId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    window.location.hash = '#/';
    useSessionStore.getState().reset();
    localStorage.clear();
    localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({
      acknowledgedAt: Date.now(),
      choice: 'reduce',
    }));
    localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, String(Date.now()));
    vi.mocked(startVersionUpgradeMonitor).mockClear();
    vi.mocked(disconnectFromSession).mockImplementation(async () => {
      useSessionStore.getState().disconnect();
      return 'applied';
    });
    vi.mocked(logoutGmAccess).mockResolvedValue('applied');
  });

  afterEach(() => {
    vi.mocked(connect).mockClear();
    vi.useRealTimers();
  });

  it('renders the landing route at the default hash', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /Den of Wolves: New Eden/i }),
    ).toBeInTheDocument();
  });

  it('requires a motion choice before exposing the game interface', async () => {
    localStorage.removeItem(MOTION_SAFETY_STORAGE_KEY);
    render(<App />);

    expect(screen.getByRole('dialog', { name: /motion safety check/i })).toBeVisible();
    expect(screen.getByRole('heading', {
      name: /Den of Wolves: New Eden/i,
      hidden: true,
    }).closest('[aria-hidden="true"]')).not.toBeNull();
    expect(connect).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: /normal motion/i }));

    expect(screen.queryByRole('dialog', { name: /motion safety check/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Den of Wolves: New Eden/i })).toBeVisible();
    await waitFor(() => expect(connect).toHaveBeenCalledOnce());
  });

  it('automatically logs out GM access after the safety timeout', async () => {
    const authenticatedAt = Date.now() - GM_ACCESS_TIMEOUT_MS - 1;
    useSessionStore.getState().setGmAccessAuthenticatedAt(authenticatedAt);
    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(logoutGmAccess).toHaveBeenCalledOnce();
    expect(useSessionStore.getState().gmAccessAuthenticatedAt).toBeNull();
  });

  it.each([
    '/roles',
    '/gm',
    '/console',
    '/press',
    '/ships/aegis/roles',
    '/ships/aegis/roles/admiral',
    '/ships/aegis/observer',
    '/union/roles/joint-engineering-quellon-refinery',
    '/shuttles/snn-press-shuttle',
  ])('returns a direct protected route without session identity to the landing page: %s', async (route) => {
    window.location.hash = '#' + route;

    render(<App />);

    expect(await screen.findByRole('heading', {
      name: /Den of Wolves: New Eden/i,
    })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
  });

  it('returns a non-GM direct GM route to the safe console roster', async () => {
    window.location.hash = '#/gm';
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setMode('console');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /select a role/i })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/console');
  });

  it('returns a player from a foreign console URL to their assigned station', async () => {
    window.location.hash = '#/ships/aegis/roles/admiral';
    useSessionStore.getState().setIdentity(session, {
      ...player,
      activeConsoleRoleId: 'dione-engineer',
    });
    useSessionStore.getState().setMode('console');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Dione' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/ships/dione/roles/dione-engineer');
  });

  it('requires a joined player to acknowledge the code of conduct before continuing', async () => {
    vi.useFakeTimers();
    window.location.hash = '#/roles';
    localStorage.removeItem(SESSION_WAIVER_STORAGE_KEY);
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setMode('console');

    render(<App />);

    expect(screen.getByRole('dialog', { name: /code of conduct/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /connect this device/i })).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(checkboxes[2]!);
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.click(screen.getByRole('button', {
      name: 'Acknowledge regulations and continue',
    }));

    expect(screen.queryByRole('dialog', { name: /code of conduct/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /connect this device/i })).toBeVisible();
    expect(localStorage.getItem(SESSION_WAIVER_STORAGE_KEY)).toEqual(expect.any(String));
  });

  it('keeps code of conduct reset out of the global settings dialog', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/roles';
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());

    render(<App />);

    await user.click(screen.getByRole('button', { name: /settings/i }));

    expect(screen.queryByRole('button', { name: /reset code of conduct checklist/i }))
      .not.toBeInTheDocument();
  });

  it('reaches for Firebase as soon as it mounts, so the light can leave red', async () => {
    render(<App />);
    await waitFor(() => {
      expect(connect).toHaveBeenCalledOnce();
    });
  });

  it('starts watching for a deployed version upgrade and stops on unmount', () => {
    const stop = vi.fn();
    vi.mocked(startVersionUpgradeMonitor).mockReturnValueOnce(stop);

    const { unmount } = render(<App />);

    expect(startVersionUpgradeMonitor).toHaveBeenCalledOnce();
    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('retries the Firebase connection every two seconds while offline', async () => {
    vi.useFakeTimers();
    useSessionStore.getState().setConnection('offline');
    render(<App />);

    await vi.advanceTimersByTimeAsync(2_000);

    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('retries Firebase as soon as a background tab becomes visible', async () => {
    render(<App />);
    await waitFor(() => expect(connect).toHaveBeenCalledOnce());
    vi.mocked(connect).mockClear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    act(() => document.dispatchEvent(new Event('visibilitychange')));

    await waitFor(() => expect(connect).toHaveBeenCalledOnce());
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('reconciles a claimed GM instance with the server every five seconds', async () => {
    vi.useFakeTimers();
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('live');
    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(reconcileGmAuthority).toHaveBeenCalled();
  });

  it('renews live presence every ten seconds', async () => {
    vi.useFakeTimers();
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setConnection('live');
    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(refreshPresence).toHaveBeenCalled();
  });

  it.each(['connect', 'heartbeat', 'reconcile'] as const)(
    'keeps slow %s checks to one pending request and resumes after settlement', async (kind) => {
      vi.useFakeTimers();
      const check = kind === 'connect' ? connect
        : kind === 'heartbeat' ? refreshPresence : reconcileGmAuthority;
      vi.mocked(check).mockClear();
      let finish: () => void = () => undefined;
      vi.mocked(check).mockImplementationOnce(() => new Promise<void>((resolve) => {
        finish = resolve;
      }));
      if (kind !== 'connect') {
        useSessionStore.getState().setIdentity(session, player);
        useSessionStore.getState().setGmInstance({
          id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge',
          deviceLabel: 'Phone', claimedAt: session.createdAt,
        });
        useSessionStore.getState().setConnection('live');
      }
      const { unmount } = render(<App />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
        if (kind === 'connect') window.dispatchEvent(new Event('online'));
      });
      expect(check).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish();
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(vi.mocked(check).mock.calls.length).toBeGreaterThan(1);
      unmount();
      const calls = vi.mocked(check).mock.calls.length;
      await vi.advanceTimersByTimeAsync(20_000);
      expect(check).toHaveBeenCalledTimes(calls);
    },
  );

  it('shows the active session code in the top-level header', () => {
    useSessionStore.getState().setSession(session);

    render(<App />);

    expect(screen.getByLabelText('Session code 4821')).toBeInTheDocument();
    expect(screen.getByText('4821')).toBeInTheDocument();
  });

  it('mounts the shared finale layer above every routed viewport', async () => {
    window.location.hash = '#/console';
    useSessionStore.getState().setIdentity({
      ...session,
      debriefMode: { active: true, revision: 1 },
    }, player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: /select a role/i })).toBeInTheDocument();
    expect(container.querySelector('.debrief-mode')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.debrief-mode__confetti-piece')).toHaveLength(72);
  });

  it('restores the last in-session page when a tab reopens at the root', async () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /select a role/i }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/console');
  });

  it('subscribes to authoritative session state while a player is connected', async () => {
    const authority = { hasServerSessionAuthority: true };
    vi.mocked(sessionSnapshotAuthorityFor).mockReturnValue(authority);
    useSessionStore.getState().setIdentity(session, player);

    render(<App />);

    await waitFor(() => {
      expect(sessionSnapshotAuthorityFor).toHaveBeenCalledWith('s1', 'u1');
      expect(subscribeSessionState).toHaveBeenCalledWith(
        's1', 'u1', expect.objectContaining({ sessionSnapshotAuthority: authority }),
      );
    });
  });

  it('holds a new own brief until the matching player assignment arrives', async () => {
    let handlers: Parameters<typeof subscribeSessionState>[2] | undefined;
    vi.mocked(subscribeSessionState).mockImplementation((_sessionId, _uid, nextHandlers) => {
      handlers = nextHandlers;
      return vi.fn();
    });
    const oldPlayer: Player = { ...player, assignedRoleId: 'admiral' };
    const nextPlayer: Player = { ...player, assignedRoleId: 'executive-officer' };
    const nextBrief: RoleBrief = {
      assignmentUid: 'u1',
      roleId: 'executive-officer',
      roleName: 'Executive Officer',
      vesselName: 'AEGIS',
      text: 'Run AEGIS maintenance.',
      commonRules: 'Follow the common rules.',
      setupRevision: 2,
    };
    useSessionStore.getState().setIdentity(session, oldPlayer);

    render(<App />);
    await waitFor(() => expect(handlers).toBeDefined());

    act(() => handlers?.onRoleBrief?.(nextBrief));
    expect(useSessionStore.getState().roleBrief).toBeNull();

    act(() => handlers?.onPlayer({ ...oldPlayer, assignedRoleId: 'icebreaker-miner' }));
    expect(useSessionStore.getState().roleBrief).toBeNull();

    act(() => handlers?.onPlayer(nextPlayer));
    expect(useSessionStore.getState().roleBrief).toBeNull();

    act(() => handlers?.onRoleBrief?.(nextBrief));
    expect(useSessionStore.getState().roleBrief).toEqual(nextBrief);
  });

  it('clears a pending or displayed brief when assignment authority is lost', async () => {
    let handlers: Parameters<typeof subscribeSessionState>[2] | undefined;
    vi.mocked(subscribeSessionState).mockImplementation((_sessionId, _uid, nextHandlers) => {
      handlers = nextHandlers;
      return vi.fn();
    });
    const assignedPlayer: Player = { ...player, assignedRoleId: 'admiral' };
    const brief: RoleBrief = {
      assignmentUid: 'u1',
      roleId: 'admiral',
      roleName: 'Admiral',
      vesselName: 'AEGIS',
      text: 'Coordinate AEGIS.',
      commonRules: 'Follow the common rules.',
      setupRevision: 1,
    };
    useSessionStore.getState().setIdentity(session, assignedPlayer);

    render(<App />);
    await waitFor(() => expect(handlers).toBeDefined());
    act(() => handlers?.onRoleBrief?.(brief));
    expect(useSessionStore.getState().roleBrief).toEqual(brief);

    act(() => handlers?.onRoleBrief?.({ ...brief, assignmentUid: 'u2' }));
    expect(useSessionStore.getState().roleBrief).toBeNull();

    act(() => handlers?.onPlayer({ ...assignedPlayer, assignedRoleId: null }));
    expect(useSessionStore.getState().roleBrief).toBeNull();

    act(() => handlers?.onRoleBrief?.(brief));
    expect(useSessionStore.getState().roleBrief).toBeNull();
    act(() => handlers?.onRoleBrief?.(null));
    expect(useSessionStore.getState().roleBrief).toBeNull();
  });

  it('renders cached session state while showing the existing red Offline indicator', async () => {
    let onFreshness: ((fresh: boolean) => void) | undefined;
    let onSession: ((next: GameSession) => void) | undefined;
    vi.mocked(subscribeSessionState).mockImplementation((_sessionId, _uid, handlers) => {
      onFreshness = handlers.onSessionFreshness;
      onSession = handlers.onSession;
      return vi.fn();
    });
    useSessionStore.getState().setIdentity(session, player);

    render(<App />);
    await waitFor(() => expect(onFreshness).toBeDefined());

    act(() => {
      onSession?.({ ...session, name: 'Cached table' });
      onFreshness?.(false);
    });

    expect(useSessionStore.getState().session).toMatchObject({ name: 'Cached table' });
    expect(useSessionStore.getState().connection).toBe('offline');
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'red');
    expect(screen.getByRole('status')).toHaveTextContent('Offline');

    act(() => {
      onSession?.({ ...session, name: 'Server table' });
      onFreshness?.(true);
    });

    expect(useSessionStore.getState().session).toMatchObject({ name: 'Server table' });
    expect(useSessionStore.getState().connection).toBe('live');
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'green');
  });

  it('returns a kicked browser to the launcher', async () => {
    let onKicked: (() => void) | undefined;
    vi.mocked(subscribeSessionState).mockImplementation((_sessionId, _uid, handlers) => {
      onKicked = handlers.onKicked;
      return vi.fn();
    });
    useSessionStore.getState().setIdentity(session, player);

    render(<App />);
    await waitFor(() => expect(onKicked).toBeDefined());

    act(() => onKicked?.());

    expect(await screen.findByRole('heading', { name: /Den of Wolves: New Eden/i }))
      .toBeInTheDocument();
    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().me).toBeNull();
  });

  it('never follows an unrecognized route restored from local storage', async () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setLastRoute('https://example.invalid/escape');

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /connect this device/i }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/roles');
  });

  it.each([
    ['/roles', /connect this device/i, 'console'],
    ['/console', /select a role/i, 'console'],
    ['/press', /snn.*system news network/i, 'press'],
  ] as const)('keeps the contact plot behind %s, not just the launcher', async (
    route,
    heading,
    mode,
  ) => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setMode(mode);
    useSessionStore.getState().setLastRoute(route);

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    // A decorative background layer has no role, name or text to query by.
    expect(container.querySelector('.contact-plot')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the header, the settings menu and the board out of the screen fade', () => {
    useSessionStore.getState().setSession(session);
    render(<App />);

    // The fade wrapper is chrome with no role, name or text of its own.
    const fade = document.querySelector('.screen-fade');
    expect(fade).toHaveAttribute('data-phase', 'in');
    // The board is the room the interface sits in; it never crosses with it.
    expect(fade?.querySelector('.contact-plot')).toBeNull();
    // Header chrome persists across screens, and the settings menu lives in it.
    expect(fade?.querySelector('.app-header')).toBeNull();
    expect(fade?.contains(screen.getByRole('button', { name: /settings/i }))).toBe(false);
  });

  it('shrinks the tactical display after joining a ship and zooms it with explicit controls', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/ships/capybara';
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/ships/capybara');

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: 'Capybara' })).toBeInTheDocument();
    const display = screen.getByRole('button', { name: /zoom into dradis panel/i });
    expect(screen.getByText('DRADIS // LOCAL PLOT')).toBeInTheDocument();
    const plot = container.querySelector('.contact-plot');
    expect(plot).toHaveAttribute('data-placement', 'widget');
    expect(plot).toHaveStyle({ '--plot-size': 'min(92cqi, 92cqb)' });

    await user.click(display);
    expect(screen.getByRole('button', { name: /close dradis/i })).toBeInTheDocument();
    expect(screen.getByText('DRADIS // ORIENTATION LOCKED')).toBeInTheDocument();
    expect(container.querySelector('.ship-plot')).toHaveAttribute('data-expanded', 'true');

    await user.click(screen.getByRole('button', { name: /close dradis/i }));
    expect(screen.getByRole('button', { name: /zoom into dradis panel/i })).toBeInTheDocument();
    expect(container.querySelector('.ship-plot')).toHaveAttribute('data-expanded', 'false');
    expect(SHIP_PLOT_RESIZE_MS).toBe(200);
    expect(container.querySelector('.ship-plot')).toHaveStyle({
      '--ship-plot-resize': '200ms',
    });
  });

  it('gives the SNN Press Shuttle the same minimized DRADIS instrument as ship consoles', async () => {
    window.location.hash = '#/press';
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/press');

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: /snn.*system news network/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom into dradis panel/i })).toBeInTheDocument();
    expect(container.querySelector('.contact-plot')).toHaveAttribute('data-placement', 'widget');
  });

  it('keeps the Press console aboard SNN while centering DRADIS on its docked host', async () => {
    window.location.hash = '#/press';
    useSessionStore.getState().setIdentity({
      ...session,
      shuttleDockings: [{
        shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: '2026-01-01T01:00:00.000Z',
      }],
    }, player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/press');

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: /snn.*system news network/i })).toBeInTheDocument();
    expect(screen.getByText(/shuttle location.*docked.*dione/i)).toBeInTheDocument();
    expect(container.querySelector('.contact-plot__origin')).toHaveTextContent('DIONE');
    expect(container.querySelectorAll('.contact-plot__tag')).not.toContain('SNN');
  });

  it.each([
    [8, 'AEGIS'],
    [11, 'AEGIS'],
    [12, 'DIONE'],
    [20, 'DIONE'],
  ] as const)(
    'rehydrates a legacy %i-player Press route with the roster-derived %s host projection',
    async (playerCount, hostName) => {
      window.location.hash = '#/press';
      const legacySession: GameSession = {
        ...session,
        playerCount,
        activeRoleIds: recommendedRoleIds(playerCount),
      };
      const pressPlayer: Player = {
        ...player,
        role: 'player',
        activeConsoleRoleId: 'press-officer',
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        version: 1,
        state: {
          session: legacySession,
          me: pressPlayer,
          gmInstance: null,
          mode: 'press',
          lastRoute: '/press',
        },
      }));

      await useSessionStore.persist.rehydrate();
      const { container } = render(<App />);

      expect(await screen.findByRole('heading', { name: /snn.*system news network/i }))
        .toBeInTheDocument();
      expect(screen.getByText(new RegExp(`shuttle location.*docked.*${hostName}`, 'i')))
        .toBeInTheDocument();
      expect(container.querySelector('.contact-plot__origin')).toHaveTextContent(hostName);
      expect(useSessionStore.getState().session?.shuttleDockings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            shuttleId: 'snn-press-shuttle',
            shipId: hostName.toLowerCase(),
          }),
        ]),
      );
    },
  );

  it('preserves a valid stored Press docking and visit history during composed rehydration', async () => {
    window.location.hash = '#/press';
    const storedDocking = {
      shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'TURN 3',
    } as const;
    const storedVisit = {
      id: 'snn-visit-3', shuttleId: 'snn-press-shuttle', shipId: 'aegis',
      action: 'docked' as const, occurredAt: 'TURN 3',
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      state: {
        session: {
          ...session,
          playerCount: 20,
          activeRoleIds: recommendedRoleIds(20),
          shuttleDockings: [storedDocking],
          shuttleVisitLog: [storedVisit],
        },
        me: { ...player, role: 'player', activeConsoleRoleId: 'press-officer' },
        gmInstance: null,
        mode: 'press',
        lastRoute: '/press',
      },
    }));

    await useSessionStore.persist.rehydrate();
    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: /snn.*system news network/i }))
      .toBeInTheDocument();
    expect(screen.getByText(/shuttle location.*docked.*aegis/i)).toBeInTheDocument();
    expect(container.querySelector('.contact-plot__origin')).toHaveTextContent('AEGIS');
    expect(useSessionStore.getState().session?.shuttleDockings).toEqual([storedDocking]);
    expect(useSessionStore.getState().session?.shuttleVisitLog).toEqual([storedVisit]);
  });

  it('rebases the named fleet contacts around the joined ship and returns to the AEGIS view', async () => {
    const user = userEvent.setup();
    vi.mocked(selectConsoleRole).mockImplementation(async (roleId: string) => {
      const me = useSessionStore.getState().me;
      if (me) useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: roleId });
    });
    vi.mocked(releaseConsoleRole).mockImplementation(async () => {
      const me = useSessionStore.getState().me;
      if (me) useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: null });
      useSessionStore.getState().setLastRoute('/console');
    });
    window.location.hash = '#/console';
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');

    const { container } = render(<App />);
    expect(await screen.findByRole('heading', { name: /select a role/i })).toBeInTheDocument();

    const center = () => container.querySelector('.contact-plot__origin')?.textContent;
    const contacts = () => Array.from(container.querySelectorAll('.contact-plot__contact .contact-plot__tag'))
      .map((tag) => tag.firstElementChild?.textContent);
    const fleetCombatRanges = () => Array.from(
      container.querySelectorAll('.contact-plot__contact:not([data-ambient="true"]) .contact-plot__range'),
    )
      .map((range) => range.textContent);

    expect(center()).toBe('AEGIS');
    expect(contacts()).toEqual(expect.arrayContaining([
      'DIONE', 'ICEBREAKER', 'CAPYBARA', 'SHEPHERD', 'QUELLON', 'REFINERY 124',
    ]));
    expect(fleetCombatRanges()).toHaveLength(0);
    expect(contacts()).not.toContain('AEGIS');

    await user.click(screen.getByRole('link', { name: /join quellon/i }));
    expect(await screen.findByRole('heading', { name: /select command role/i })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /^captain$/i }));
    expect(await screen.findByRole('heading', { name: 'Quellon' })).toBeInTheDocument();
    expect(center()).toBe('QUELLON');
    expect(contacts()).toContain('AEGIS');
    expect(contacts()).not.toContain('QUELLON');

    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(await screen.findByRole('button', { name: /release role/i }));
    expect(await screen.findByRole('heading', { name: /select a role/i })).toBeInTheDocument();
    expect(center()).toBe('AEGIS');
  });

  it('returns to the launcher immediately while disconnect finishes in the background', async () => {
    const user = userEvent.setup();
    let finishDisconnect!: () => void;
    vi.mocked(disconnectFromSession).mockImplementation(() => {
      useSessionStore.getState().disconnect();
      return new Promise((resolve) => {
        finishDisconnect = () => resolve('applied');
      });
    });
    window.location.hash = '#/console';
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');
    render(<App />);

    await user.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('dialog', { name: /session settings/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(disconnectFromSession).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /session settings/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /are you sure/i }));

    expect(
      await screen.findByRole('heading', { name: /Den of Wolves: New Eden/i }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
    expect(useSessionStore.getState().session).toBeNull();
    expect(screen.queryByRole('button', { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /session settings/i })).not.toBeInTheDocument();

    await act(async () => finishDisconnect());
  });
});
