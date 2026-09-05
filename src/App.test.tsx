import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';

vi.mock('@/lib/sessionService', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn(),
  disconnectFromSession: vi.fn(),
  getSessionPresence: vi.fn().mockResolvedValue({ connectedPlayers: 2 }),
  joinSession: vi.fn(),
  kickGmInstance: vi.fn(),
  listGmInstances: vi.fn().mockResolvedValue([]),
  reconcileGmAuthority: vi.fn().mockResolvedValue(undefined),
  refreshPresence: vi.fn().mockResolvedValue(undefined),
  releaseGmInstance: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeSessionState: vi.fn(() => vi.fn()),
}));

const { connect, disconnectFromSession, reconcileGmAuthority, refreshPresence } =
  await import('@/lib/sessionService');
const { subscribeSessionState } = await import('@/lib/firestore');

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
      await screen.findByRole('heading', { name: /join a ship/i }),
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
    ['/roles', /connect this device/i],
    ['/console', /join a ship/i],
  ])('keeps the contact plot behind %s, not just the launcher', async (route, heading) => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setMode('console');
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

  it('shrinks the tactical display after joining a ship and toggles full-screen on activation', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/ships/capybara';
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/ships/capybara');

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: 'Capybara' })).toBeInTheDocument();
    const display = screen.getByRole('button', { name: /expand dradis display/i });
    expect(screen.getByText('DRADIS // FULL SCREEN')).toBeInTheDocument();
    const plot = container.querySelector('.contact-plot');
    expect(plot).toHaveAttribute('data-placement', 'widget');
    expect(plot).toHaveStyle({ '--plot-size': '92cqi' });

    await user.click(display);
    expect(screen.getByRole('button', { name: /collapse dradis display/i })).toBeInTheDocument();
    expect(screen.getByText('DRADIS // RETURN')).toBeInTheDocument();
    expect(container.querySelector('.ship-plot')).toHaveAttribute('data-expanded', 'true');

    await user.click(screen.getByRole('button', { name: /collapse dradis display/i }));
    expect(screen.getByRole('button', { name: /expand dradis display/i })).toBeInTheDocument();
    expect(container.querySelector('.ship-plot')).toHaveAttribute('data-expanded', 'false');
  });

  it('rebases the named fleet contacts around the joined ship and returns to the AEGIS view', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/console';
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');

    const { container } = render(<App />);
    expect(await screen.findByRole('heading', { name: /join a ship/i })).toBeInTheDocument();

    const center = () => container.querySelector('.contact-plot__origin')?.textContent;
    const contacts = () => Array.from(container.querySelectorAll('.contact-plot__contact .contact-plot__tag'))
      .map((tag) => tag.textContent);

    expect(center()).toBe('AEGIS');
    expect(contacts()).toEqual(expect.arrayContaining([
      'DIONE', 'ICEBREAKER', 'CAPYBARA', 'SHEPHERD', 'QUELLON', 'REFINERY 124',
    ]));
    expect(contacts()).not.toContain('AEGIS');

    await user.click(screen.getByRole('link', { name: /join quellon/i }));
    expect(await screen.findByRole('heading', { name: 'Quellon' })).toBeInTheDocument();
    expect(center()).toBe('QUELLON');
    expect(contacts()).toContain('AEGIS');
    expect(contacts()).not.toContain('QUELLON');

    await user.click(screen.getByRole('link', { name: /leave ship/i }));
    expect(await screen.findByRole('heading', { name: /join a ship/i })).toBeInTheDocument();
    expect(center()).toBe('AEGIS');
  });

  it('disconnects robustly from settings and returns home', async () => {
    const user = userEvent.setup();
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
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
  });
});
