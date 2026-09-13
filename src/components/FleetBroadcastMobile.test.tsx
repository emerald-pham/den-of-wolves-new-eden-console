import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setMotionOverride } from '@/lib/motionPreference';
import { useSessionStore } from '@/store/useSessionStore';
import FleetBroadcast from './FleetBroadcast';

const session = {
  id: 's1', name: 'Table', joinCode: '1234', phase: 'active' as const, ownerUid: 'u1',
  createdAt: '2026-09-12T13:00:00.000Z', updatedAt: '2026-09-12T13:00:00.000Z',
};
const player = {
  uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player' as const,
  seatId: null, activeConsoleRoleId: 'admiral', joinedAt: '2026-09-12T13:00:00.000Z',
};

let narrow = true;

function tickerMessage({
  id,
  sequence,
  source,
  priority,
  text,
  tone,
  sourceId,
}: {
  id: string;
  sequence: number;
  source: 'automatic' | 'admiral' | 'press';
  priority: number;
  text: string;
  tone: 'danger' | 'normal';
  sourceId?: string;
}) {
  return {
    id, sequence, source, priority, text, tone,
    gap: source === 'press' || source === 'automatic' ? 'long' as const : 'standard' as const,
    createdAt: '2026-09-12T13:00:00.000Z',
    ...(sourceId ? { sourceId } : {}),
  };
}

type TickerMessage = ReturnType<typeof tickerMessage>;

function setTicker(current: TickerMessage, queued: TickerMessage[] = []) {
  useSessionStore.getState().setSession({
    ...session,
    fleetTicker: {
      revision: current.sequence,
      nextSequence: Math.max(current.sequence, ...queued.map((message) => message.sequence)),
      replayCursor: current.sequence,
      current,
      queued,
      draining: [],
      dismissed: [],
    },
  } as never);
}

beforeEach(() => {
  narrow = true;
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(max-width: 48rem)' ? narrow : false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  setMotionOverride('full');
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, player);
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => setMotionOverride('system'));
});

it('keeps the narrow ticker visible with reserved space when an alert replaces standing copy', () => {
  setTicker(tickerMessage({
    id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
    text: 'SNN // ROUTE CONFIRMED', tone: 'normal',
  }));
  const view = render(<FleetBroadcast />);

  const surface = view.container.querySelector('.fleet-broadcast')!;
  expect(screen.queryByRole('button', { name: /fleet broadcasts/i })).not.toBeInTheDocument();
  expect(view.container.querySelector('.fleet-broadcast__reserve')).toBeInTheDocument();
  expect(surface).not.toHaveAttribute('data-hidden');
  expect(surface).not.toHaveAttribute('data-expanded');
  expect(screen.getByRole('status', { name: /route confirmed/i })).toBeVisible();

  act(() => setTicker(tickerMessage({
    id: 's1:fleet-ticker:2', sequence: 2, source: 'admiral', priority: 80,
    text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger',
  })));
  expect(screen.queryByRole('button', { name: /fleet broadcasts/i })).not.toBeInTheDocument();
  expect(surface).not.toHaveAttribute('data-hidden');
  expect(surface).not.toHaveAttribute('data-expanded');
  expect(screen.getByRole('status', { name: /red alert/i })).toBeVisible();

  act(() => window.dispatchEvent(new Event('scroll')));
  expect(screen.getByRole('status', { name: /red alert/i })).toBeVisible();
});

it('keeps the pinned ticker visible while crossing narrow and wide viewports', () => {
  setTicker(tickerMessage({
    id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
    text: 'SNN // ROUTE CONFIRMED', tone: 'normal',
  }));
  const view = render(<FleetBroadcast />);
  const surface = view.container.querySelector('.fleet-broadcast')!;

  narrow = false;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.queryByRole('button', { name: /fleet broadcasts/i })).not.toBeInTheDocument();
  expect(surface).not.toHaveAttribute('data-hidden');
  expect(screen.getByRole('status', { name: /route confirmed/i })).toBeVisible();

  narrow = true;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.queryByRole('button', { name: /fleet broadcasts/i })).not.toBeInTheDocument();
  expect(screen.getByRole('status', { name: /route confirmed/i })).toBeVisible();
});

it('keeps queued live alerts visible without temporary expansion or refolding state', () => {
  setTicker(tickerMessage({
    id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
    text: 'SNN // ROUTE CONFIRMED', tone: 'normal',
  }));
  const view = render(<FleetBroadcast />);
  const surface = view.container.querySelector('.fleet-broadcast')!;

  const alert = tickerMessage({
    id: 's1:fleet-ticker:2', sequence: 2, source: 'admiral', priority: 80,
    text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger',
  });
  const restriction = tickerMessage({
    id: 's1:fleet-ticker:3', sequence: 3, source: 'automatic', priority: 40,
    text: 'AIRSPACE CONTROL // AIRSPACE CLOSED', tone: 'normal',
    sourceId: 'airspace:1:restricted',
  });
  act(() => setTicker(alert, [restriction]));
  expect(surface).not.toHaveAttribute('data-hidden');
  expect(surface).not.toHaveAttribute('data-expanded');
  expect(screen.queryByRole('button', { name: /fleet broadcasts/i })).not.toBeInTheDocument();
  expect(view.container.querySelector('.fleet-ticker')).toHaveTextContent('RED ALERT');
  expect(view.container.querySelector('.fleet-ticker')).toHaveTextContent('AIRSPACE CLOSED');
});

it('keeps reduced-motion copy readable and visible without hidden-state restoration', () => {
  vi.useFakeTimers();
  setMotionOverride('reduce');
  setTicker(tickerMessage({
    id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
    text: 'SNN // ROUTE CONFIRMED', tone: 'normal',
  }));
  const view = render(<FleetBroadcast />);
  const surface = view.container.querySelector('.fleet-broadcast')!;
  expect(screen.queryByRole('button', { name: /fleet broadcasts/i })).not.toBeInTheDocument();
  expect(screen.getByRole('status', { name: /route confirmed/i })).toBeVisible();

  act(() => setTicker(tickerMessage({
    id: 's1:fleet-ticker:2', sequence: 2, source: 'admiral', priority: 80,
    text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger',
  })));
  expect(surface).not.toHaveAttribute('data-hidden');
  expect(surface).not.toHaveAttribute('data-expanded');
  expect(screen.getByRole('status', { name: 'ICSN ADMIRAL // RED ALERT' })).toBeVisible();

  act(() => vi.advanceTimersByTime(4_000));
  expect(screen.getByRole('status', { name: 'ICSN ADMIRAL // RED ALERT' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /fleet broadcasts/i })).not.toBeInTheDocument();
});
