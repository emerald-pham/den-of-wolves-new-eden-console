import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Landing from './Landing';
import AppHeader from '@/components/AppHeader';
import { useSessionStore } from '@/store/useSessionStore';
import { APP_VERSION } from '@/version';

const session = {
  id: 's1',
  name: 'Table one',
  joinCode: '4821',
  phase: 'lobby' as const,
  ownerUid: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const player = {
  uid: 'u1',
  sessionId: 's1',
  displayName: 'GM',
  role: 'gm' as const,
  seatId: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

// Firebase is a genuine boundary, so the service that wraps it is stubbed here.
// Everything below the mock -- form state, validation, status light, error
// reporting -- is exercised for real.
vi.mock('@/lib/sessionService', () => ({
  createSession: vi.fn(),
  joinSession: vi.fn(),
}));

const { createSession, joinSession } = await import('@/lib/sessionService');

function LocationProbe() {
  return <div aria-label="Current route">{useLocation().pathname}</div>;
}

function renderLanding() {
  return render(
    <MemoryRouter>
      <AppHeader />
      <Landing />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('Landing', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.removeItem('new-eden-motion-override');
    vi.mocked(createSession).mockReset();
    vi.mocked(joinSession).mockReset();
  });

  it('names the project', () => {
    renderLanding();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Den of Wolves: New Eden');
    expect(heading).toHaveTextContent('Unofficial Companion Console');
    expect(screen.getByText('OPERATION NEW EDEN / CIC')).toBeInTheDocument();
    expect(screen.getByText('OPERATION NEW EDEN')).toBeInTheDocument();
    expect(screen.queryByText('NEW EDEN / CIC')).not.toBeInTheDocument();
  });

  it('shows the current build beside the system-interface footer label', () => {
    renderLanding();
    expect(screen.getByText(/SYSTEM INTERFACE \/ BUILD/)).toHaveTextContent(`SYSTEM INTERFACE / BUILD ${APP_VERSION}`);
  });

  it('shows a numeric local population estimate on boot', () => {
    renderLanding();
    expect(screen.getByLabelText('Arrival readout 4')).not.toHaveTextContent('—');
  });

  it('includes the arrival display', () => {
    renderLanding();
    expect(screen.getByLabelText('Arrival readout 1')).toHaveTextContent('6');
  });

  it('keeps the population estimate local when Firebase is live', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    useSessionStore.getState().setConnection('live');
    renderLanding();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Arrival readout 4')).toHaveTextContent('222,501');
  });

  it('offers the two ways in', () => {
    renderLanding();
    expect(screen.getByRole('button', { name: /create a session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join a session/i })).toBeInTheDocument();
  });

  it('uses a plain label for the session-code field', () => {
    renderLanding();

    expect(screen.getByLabelText('Session code')).toBeInTheDocument();
    expect(screen.queryByText(/4 or 6 digits/i)).not.toBeInTheDocument();
  });

  it('lets a player reduce motion from the launcher', async () => {
    const user = userEvent.setup();
    renderLanding();

    const control = screen.getByRole('button', { name: /reduce motion.*reduce awesomeness/i });
    expect(
      screen.getByRole('button', { name: /join a session/i }).compareDocumentPosition(control),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(control.parentElement?.tagName).toBe('FORM');
    expect(control).toHaveTextContent('Reduce motion (reduce awesomeness) 😞');

    await user.click(control);
    expect(screen.getByText(/motion is reduced/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore motion/i })).toHaveTextContent('Restore motion 😀');
  });

  it('lies optimistically for five seconds before showing the real disconnected state', () => {
    vi.useFakeTimers();
    renderLanding();

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAttribute('data-status', 'yellow');
    expect(indicator).toHaveTextContent('CONNECTED');

    act(() => vi.advanceTimersByTime(4_999));
    expect(indicator).toHaveAttribute('data-status', 'yellow');

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status', { name: 'No connection to Firebase' }))
      .toHaveAttribute('data-status', 'red');
  });

  it('shows the status light as yellow once Firebase is live but no session is joined', async () => {
    useSessionStore.getState().setConnection('live');
    renderLanding();
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Connected to Firebase, not in a session' }))
        .toHaveAttribute('data-status', 'yellow');
    });
  });

  it('keeps join disabled until a complete code is entered', async () => {
    const user = userEvent.setup();
    renderLanding();
    const join = screen.getByRole('button', { name: /join a session/i });
    expect(join).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: /code/i }), '123');
    expect(join).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: /code/i }), '4');
    expect(join).toBeEnabled();
  });

  it('ignores anything that is not a digit, and stops at six', async () => {
    const user = userEvent.setup();
    renderLanding();
    const code = screen.getByRole('textbox', { name: /code/i });

    expect(code).toHaveAttribute('maxLength', '6');
    await user.type(code, 'a1b2c3d4e5f6g7');
    expect(code).toHaveValue('123456');
  });

  it('accepts a complete code, but not an incomplete one', async () => {
    const user = userEvent.setup();
    renderLanding();
    const code = screen.getByRole('textbox', { name: /code/i });
    const join = screen.getByRole('button', { name: /join a session/i });

    await user.type(code, '4821');
    expect(join).toBeEnabled();

    await user.type(code, '0');
    expect(join).toBeDisabled();

    await user.type(code, '9');
    expect(join).toBeEnabled();
  });

  it('joins with the code that was typed', async () => {
    const user = userEvent.setup();
    vi.mocked(joinSession).mockResolvedValue(undefined);
    renderLanding();

    await user.type(screen.getByRole('textbox', { name: /code/i }), '4821');
    await user.click(screen.getByRole('button', { name: /join a session/i }));

    expect(joinSession).toHaveBeenCalledWith('4821');
    await waitFor(() => expect(screen.getByLabelText('Current route')).toHaveTextContent('/roles'));
  });

  it('creates a session when asked', async () => {
    const user = userEvent.setup();
    vi.mocked(createSession).mockResolvedValue(undefined);
    renderLanding();

    await user.click(screen.getByRole('button', { name: /create a session/i }));

    expect(createSession).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByLabelText('Current route')).toHaveTextContent('/roles'));
  });

  it('shows a truthful return link when a create attempt races with session recovery', async () => {
    const user = userEvent.setup();
    let rejectCreate: ((cause: Error) => void) | undefined;
    vi.mocked(createSession).mockReturnValue(new Promise<void>((_resolve, reject) => {
      rejectCreate = reject;
    }));
    renderLanding();

    await user.click(screen.getByRole('button', { name: /create a session/i }));
    act(() => {
      useSessionStore.getState().setIdentity({ ...session, id: 'recovered-session' }, {
        ...player,
        sessionId: 'recovered-session',
      });
      useSessionStore.getState().setLastRoute('/console');
    });
    rejectCreate?.(new Error('A session is already connected.'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('A session is already connected.');
      expect(screen.getByRole('link', { name: /return to the current session/i }))
        .toHaveAttribute('href', '/console');
    });
    expect(screen.queryByRole('button', { name: /create a session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join a session/i })).not.toBeInTheDocument();

    const recoveryLink = screen.getByRole('link', { name: /return to the current session/i });
    recoveryLink.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/console');
  });

  it('holds the launcher on a reconnecting state instead of creating or joining over a cached session', () => {
    useSessionStore.getState().setSession({ ...session, id: 'cached-session' });

    renderLanding();

    expect(screen.getByRole('status', { name: 'Session recovery' }))
      .toHaveTextContent(/reconnecting to the current session/i);
    expect(screen.queryByRole('button', { name: /create a session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join a session/i })).not.toBeInTheDocument();
  });

  it('reports a failure to join instead of failing silently', async () => {
    const user = userEvent.setup();
    vi.mocked(joinSession).mockRejectedValue(new Error('No session with that code.'));
    renderLanding();

    await user.type(screen.getByRole('textbox', { name: /code/i }), '0000');
    await user.click(screen.getByRole('button', { name: /join a session/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No session with that code.');
    });
  });

  it('does not leave the buttons live while a request is in flight', async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    vi.mocked(createSession).mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    renderLanding();

    await user.click(screen.getByRole('button', { name: /create a session/i }));
    expect(screen.getByRole('button', { name: /create a session/i })).toBeDisabled();

    release?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create a session/i })).toBeEnabled();
    });
  });
});
