import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ConnectionIndicator from './ConnectionIndicator';

describe('ConnectionIndicator', () => {
  it('reports the offline state in words, not colour alone', () => {
    render(<ConnectionIndicator status="red" />);
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
  });

  it('reports being connected to Firebase without a session', () => {
    render(<ConnectionIndicator status="yellow" />);
    expect(screen.getByRole('status')).toHaveTextContent(/connected/i);
  });

  it('reports being in a session', () => {
    render(<ConnectionIndicator status="green" />);
    expect(screen.getByRole('status')).toHaveTextContent(/in session/i);
  });

  it('exposes the status for styling without relying on it for meaning', () => {
    render(<ConnectionIndicator status="green" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'green');
  });
});
