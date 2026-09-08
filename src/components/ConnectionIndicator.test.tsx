import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ConnectionIndicator from './ConnectionIndicator';

describe('ConnectionIndicator', () => {
  it('reports the offline state in words, not colour alone', () => {
    render(<ConnectionIndicator status="red" />);
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
  });

  it('reports being connected to Firebase without a session', () => {
    render(<ConnectionIndicator status="yellow" />);
    expect(screen.getByRole('status')).toHaveTextContent('CONNECTED');
    expect(screen.getByRole('status')).not.toHaveTextContent('Connected, Awaiting Iris Authentication');
  });

  it('reports being in a session', () => {
    render(<ConnectionIndicator status="green" />);
    expect(screen.getByRole('status')).toHaveTextContent(/in session/i);
  });

  it('uses the exact Turn 0 Iris authentication label only for a joined session', () => {
    render(<ConnectionIndicator status="blue" />);
    expect(screen.getByRole('status')).toHaveTextContent('NOT CONNECTED — AWAITING IRIS AUTHENTICATION');
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
