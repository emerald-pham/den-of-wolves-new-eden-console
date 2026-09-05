import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

vi.mock('@/lib/sessionService', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn(),
  joinSession: vi.fn(),
}));

const { connect } = await import('@/lib/sessionService');

describe('App', () => {
  beforeEach(() => {
    window.location.hash = '#/';
    useSessionStore.getState().reset();
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
    const session: GameSession = {
      id: 's1',
      name: 'Table one',
      joinCode: '4821',
      phase: 'lobby',
      ownerUid: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    useSessionStore.getState().setSession(session);

    render(<App />);

    expect(screen.getByLabelText('Session code 4821')).toBeInTheDocument();
    expect(screen.getByText('4821')).toBeInTheDocument();
  });
});
