import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Landing from './Landing';
import AppHeader from '@/components/AppHeader';
import { useSessionStore } from '@/store/useSessionStore';
import { APP_VERSION } from '@/version';

// Firebase is a genuine boundary, so the service that wraps it is stubbed here.
// Everything below the mock -- form state, validation, status light, error
// reporting -- is exercised for real.
vi.mock('@/lib/sessionService', () => ({
  createSession: vi.fn(),
  getSurvivorPopulation: vi.fn().mockResolvedValue(232_501),
  joinSession: vi.fn(),
}));

const { createSession, getSurvivorPopulation, joinSession } = await import('@/lib/sessionService');

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

  it('includes the arrival display', () => {
    renderLanding();
    expect(screen.getByLabelText('Arrival readout 1')).toHaveTextContent('6');
  });

  it('loads the survivor count from the cloud after Firebase is live', async () => {
    useSessionStore.getState().setConnection('live');
    renderLanding();

    await waitFor(() => {
      expect(getSurvivorPopulation).toHaveBeenCalledOnce();
    });
    expect(screen.getByLabelText('Arrival readout 4')).toHaveTextContent('232,501');
  });

  it('offers the two ways in', () => {
    renderLanding();
    expect(screen.getByRole('button', { name: /create a session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join a session/i })).toBeInTheDocument();
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

  it('shows the status light as red before Firebase connects', () => {
    renderLanding();
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'red');
  });

  it('shows the status light as yellow once Firebase is live but no session is joined', async () => {
    useSessionStore.getState().setConnection('live');
    renderLanding();
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveAttribute('data-status', 'yellow');
    });
  });

  it('keeps join disabled until a full four-digit code is entered', async () => {
    const user = userEvent.setup();
    renderLanding();
    const join = screen.getByRole('button', { name: /join a session/i });
    expect(join).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: /code/i }), '123');
    expect(join).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: /code/i }), '4');
    expect(join).toBeEnabled();
  });

  it('ignores anything that is not a digit, and stops at four', async () => {
    const user = userEvent.setup();
    renderLanding();
    const code = screen.getByRole('textbox', { name: /code/i });

    await user.type(code, 'a1b2c3d4e5');
    expect(code).toHaveValue('1234');
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
