import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Landing from './Landing';
import { useSessionStore } from '@/store/useSessionStore';

// Firebase is a genuine boundary, so the service that wraps it is stubbed here.
// Everything below the mock -- form state, validation, status light, error
// reporting -- is exercised for real.
vi.mock('@/lib/sessionService', () => ({
  createSession: vi.fn(),
  joinSession: vi.fn(),
}));

const { createSession, joinSession } = await import('@/lib/sessionService');

describe('Landing', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.mocked(createSession).mockReset();
    vi.mocked(joinSession).mockReset();
  });

  it('names the project', () => {
    render(<Landing />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Den of Wolves: New Eden');
    expect(heading).toHaveTextContent('Unofficial Companion Console');
  });

  it('offers the two ways in', () => {
    render(<Landing />);
    expect(screen.getByRole('button', { name: /create a session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join a session/i })).toBeInTheDocument();
  });

  it('shows the status light as red before Firebase connects', () => {
    render(<Landing />);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'red');
  });

  it('shows the status light as yellow once Firebase is live but no session is joined', () => {
    useSessionStore.getState().setConnection('live');
    render(<Landing />);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'yellow');
  });

  it('keeps join disabled until a full four-digit code is entered', async () => {
    const user = userEvent.setup();
    render(<Landing />);
    const join = screen.getByRole('button', { name: /join a session/i });
    expect(join).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: /code/i }), '123');
    expect(join).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: /code/i }), '4');
    expect(join).toBeEnabled();
  });

  it('ignores anything that is not a digit, and stops at four', async () => {
    const user = userEvent.setup();
    render(<Landing />);
    const code = screen.getByRole('textbox', { name: /code/i });

    await user.type(code, 'a1b2c3d4e5');
    expect(code).toHaveValue('1234');
  });

  it('joins with the code that was typed', async () => {
    const user = userEvent.setup();
    vi.mocked(joinSession).mockResolvedValue(undefined);
    render(<Landing />);

    await user.type(screen.getByRole('textbox', { name: /code/i }), '4821');
    await user.click(screen.getByRole('button', { name: /join a session/i }));

    expect(joinSession).toHaveBeenCalledWith('4821');
  });

  it('creates a session when asked', async () => {
    const user = userEvent.setup();
    vi.mocked(createSession).mockResolvedValue(undefined);
    render(<Landing />);

    await user.click(screen.getByRole('button', { name: /create a session/i }));

    expect(createSession).toHaveBeenCalledOnce();
  });

  it('reports a failure to join instead of failing silently', async () => {
    const user = userEvent.setup();
    vi.mocked(joinSession).mockRejectedValue(new Error('No session with that code.'));
    render(<Landing />);

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
    render(<Landing />);

    await user.click(screen.getByRole('button', { name: /create a session/i }));
    expect(screen.getByRole('button', { name: /create a session/i })).toBeDisabled();

    release?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create a session/i })).toBeEnabled();
    });
  });
});
