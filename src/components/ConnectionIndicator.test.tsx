import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ConnectionIndicator from './ConnectionIndicator';

describe('ConnectionIndicator', () => {
  it('reports the offline state in words, not colour alone', () => {
    render(<ConnectionIndicator status="red" />);
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
  });

  it('reports a fleet link without a session', () => {
    render(<ConnectionIndicator status="yellow" />);
    expect(screen.getByRole('status')).toHaveTextContent('CONNECTED');
    expect(screen.getByRole('status')).not.toHaveTextContent('SESSION AUTHORIZATION PENDING');
  });

  it('labels a connected session that is still waiting for its player projection', () => {
    render(<ConnectionIndicator status="yellow" sessionRecovery />);

    const indicator = screen.getByRole('status', { name: /reconnecting to the current session/i });
    expect(indicator).toHaveTextContent('RECONNECTING TO SESSION');
    expect(indicator).toHaveAttribute('title', 'Reconnecting to the current session');
  });

  it('reports being in a session', () => {
    render(<ConnectionIndicator status="green" />);
    expect(screen.getByRole('status')).toHaveTextContent(/in session/i);
  });

  it('uses the pending session-authorization label only for a joined session', () => {
    render(<ConnectionIndicator status="blue" />);
    expect(screen.getByRole('status')).toHaveTextContent('CONNECTED // SESSION AUTHORIZATION PENDING');
    expect(screen.getByRole('status')).toHaveAccessibleName('Fleet link connected // session authorization pending');
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Fleet link connected // session authorization pending');
  });

  it('exposes the status for styling without relying on it for meaning', () => {
    render(<ConnectionIndicator status="green" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'green');
  });

  it('uses the CIC blue instrumentation token for the uplink indicator', () => {
    const stylesheet = readFileSync('src/index.css', 'utf8');

    expect(stylesheet).toMatch(
      /\.indicator\[data-status=['"]blue['"]\]\s*\{[^}]*--dot:\s*var\(--cic-cyan-hot\)/,
    );
  });
});
