import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';

vi.mock('@/lib/sessionService', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn(),
  joinSession: vi.fn(),
}));

const { connect } = await import('@/lib/sessionService');

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
      await screen.findByRole('heading', { name: /console connected/i }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/console');
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
      screen.getByRole('heading', { name: /Den of Wolves: New Eden/i }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
    expect(useSessionStore.getState().session).toBeNull();
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
  });
});
