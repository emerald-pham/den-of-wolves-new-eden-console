import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, GmInstance, Player } from '@/types/game';
import { SHIP_PLOT_RESIZE_MS } from '@/components/ShipPlot';

vi.mock('@/lib/sessionService', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn(),
  disconnectFromSession: vi.fn(),
  getSurvivorPopulation: vi.fn().mockResolvedValue(232_501),
  joinSession: vi.fn(),
  kickGmInstance: vi.fn(),
  listGmInstances: vi.fn().mockResolvedValue([]),
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
  reconcileGmAuthority,
  refreshPresence,
  releaseConsoleRole,
  selectConsoleRole,
} =
  await import('@/lib/sessionService');
const { subscribeSessionState } = await import('@/lib/firestore');
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
    vi.mocked(startVersionUpgradeMonitor).mockClear();
    vi.mocked(disconnectFromSession).mockImplementation(async () => {
      useSessionStore.getState().disconnect();
      return 'applied';
    });
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
    useSessionStore.getState().setIdentity(session, player);

    render(<App />);

    await waitFor(() => expect(subscribeSessionState).toHaveBeenCalledWith(
      's1', 'u1', expect.any(Object),
    ));
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
      .map((tag) => tag.textContent);

    expect(center()).toBe('AEGIS');
    expect(contacts()).toEqual(expect.arrayContaining([
      'DIONE', 'ICEBREAKER', 'CAPYBARA', 'SHEPHERD', 'QUELLON', 'REFINERY 124',
    ]));
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

    expect(
      await screen.findByRole('heading', { name: /Den of Wolves: New Eden/i }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
    expect(useSessionStore.getState().session).toBeNull();
    expect(screen.queryByRole('button', { name: /^settings$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /session settings/i })).not.toBeInTheDocument();

    await act(async () => finishDisconnect());
  });
});
