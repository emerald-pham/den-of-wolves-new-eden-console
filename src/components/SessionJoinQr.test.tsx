import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import SessionJoinQr from './SessionJoinQr';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

it('keeps a usable code-only link when a custom host path exceeds local QR capacity', () => {
  window.history.replaceState({}, '', `/${'x'.repeat(120)}`);

  expect(() => render(<SessionJoinQr joinCode="4821" />)).not.toThrow();
  expect(screen.getByRole('link', { name: 'Open join screen for session 4821' }))
    .toHaveAttribute('href', expect.stringContaining('#/?joinCode=4821'));
  expect(screen.queryByRole('img', { name: 'QR code for session 4821' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(/too long for a QR code on this host/i);
});
