import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import CommunicationError from './CommunicationError';

beforeEach(() => {
  vi.useFakeTimers();
  useSessionStore.getState().reset();
});

afterEach(() => vi.useRealTimers());

it('shows a dismissible Wolf Communications Interception Code and expires', () => {
  useSessionStore.getState().setCommunicationError({
    code: 'failed-precondition', message: 'That GM instance is already gone.',
  });
  const { rerender } = render(<CommunicationError />);

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Error — Wolf Communications Interception Code: failed-precondition',
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The command could not be completed. Refresh the live state and try again.',
  );

  fireEvent.click(screen.getByRole('button', { name: /dismiss error/i }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  act(() => {
    useSessionStore.getState().setCommunicationError({
      code: 'Wolf Intercepted Request Timeout',
      message: 'The queued command expired before the connection returned.',
    });
  });
  rerender(<CommunicationError />);
  expect(screen.getByRole('alert')).toHaveTextContent('Error — Wolf Intercepted Request Timeout');
  expect(screen.getByRole('alert')).toHaveTextContent('Reference: WCI-TIMEOUT-15000');
  act(() => vi.advanceTimersByTime(6_000));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
