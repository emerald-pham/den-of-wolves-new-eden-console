import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acknowledgeSessionWaiver, SESSION_WAIVER_TTL_MS } from '@/lib/sessionWaiver';
import { useSessionStore } from '@/store/useSessionStore';
import SessionWaiverGate from './SessionWaiverGate';

const now = Date.parse('2026-09-27T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  localStorage.clear();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 'session', name: 'Fleet', joinCode: '123456', phase: 'active', ownerUid: 'gm',
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  }, {
    uid: 'player', sessionId: 'session', displayName: 'Pilot', role: 'player',
    seatId: 'dione-pilot', joinedAt: new Date(now).toISOString(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

it('reopens all three regulations at the seven-day boundary in an active tab', () => {
  acknowledgeSessionWaiver(localStorage, now);
  render(<SessionWaiverGate />);
  expect(screen.queryByRole('dialog', { name: /code of conduct/i })).toBeNull();

  act(() => vi.advanceTimersByTime(SESSION_WAIVER_TTL_MS - 1));
  expect(screen.queryByRole('dialog', { name: /code of conduct/i })).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('dialog', { name: /code of conduct/i })).toBeVisible();
  expect(screen.getAllByRole('checkbox')).toHaveLength(3);
});

it('rechecks an expired acknowledgement when a suspended tab becomes visible', () => {
  acknowledgeSessionWaiver(localStorage, now);
  render(<SessionWaiverGate />);
  expect(screen.queryByRole('dialog', { name: /code of conduct/i })).toBeNull();

  vi.setSystemTime(now + SESSION_WAIVER_TTL_MS);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(screen.getByRole('dialog', { name: /code of conduct/i })).toBeVisible();
});
