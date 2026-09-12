import { act, fireEvent, render, screen } from '@testing-library/react';
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

it('keeps a narrow ticker pinned with hide/reveal and refolds after one alert pass', () => {
  setTicker(tickerMessage({
    id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
    text: 'SNN // ROUTE CONFIRMED', tone: 'normal',
  }));
  const view = render(<FleetBroadcast />);

  const surface = view.container.querySelector('.fleet-broadcast')!;
  expect(screen.getByRole('button', { name: 'Hide fleet broadcasts' })).toBeVisible();
  expect(surface).toHaveAttribute('data-hidden', 'false');

  fireEvent.click(screen.getByRole('button', { name: 'Hide fleet broadcasts' }));
  expect(screen.getByRole('button', { name: 'Reveal fleet broadcasts' })).toHaveAttribute(
    'aria-expanded', 'false',
  );
  expect(surface).toHaveAttribute('data-hidden', 'true');

  act(() => setTicker(tickerMessage({
    id: 's1:fleet-ticker:2', sequence: 2, source: 'admiral', priority: 80,
    text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger',
  })));
  expect(surface).toHaveAttribute('data-expanded', 'true');
  expect(surface).toHaveAttribute('data-hidden', 'false');

  const alertGroup = view.container.querySelector<HTMLElement>(
    '.fleet-ticker__group[data-message-id="s1:fleet-ticker:2"]',
  );
  expect(alertGroup).toBeInTheDocument();
  fireEvent.animationEnd(alertGroup!);
  expect(surface).toHaveAttribute('data-hidden', 'true');
  expect(surface).toHaveAttribute('data-expanded', 'false');
});

it('does not refold after a user reveals during an automatic expansion or after a wide crossing', () => {
  setTicker(tickerMessage({
    id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
    text: 'SNN // ROUTE CONFIRMED', tone: 'normal',
  }));
  const view = render(<FleetBroadcast />);
  const surface = view.container.querySelector('.fleet-broadcast')!;
  fireEvent.click(screen.getByRole('button', { name: 'Hide fleet broadcasts' }));

  act(() => setTicker(tickerMessage({
    id: 's1:fleet-ticker:2', sequence: 2, source: 'admiral', priority: 80,
    text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger',
  })));
  fireEvent.click(screen.getByRole('button', { name: 'Hide fleet broadcasts' }));
  expect(surface).toHaveAttribute('data-hidden', 'false');

  const alertGroup = view.container.querySelector<HTMLElement>(
    '.fleet-ticker__group[data-message-id="s1:fleet-ticker:2"]',
  );
  fireEvent.animationEnd(alertGroup!);
  expect(surface).toHaveAttribute('data-hidden', 'false');

  narrow = false;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.queryByRole('button', { name: /fleet broadcasts/i })).not.toBeInTheDocument();
  expect(surface).toHaveAttribute('data-hidden', 'false');

  narrow = true;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.getByRole('button', { name: 'Hide fleet broadcasts' })).toBeVisible();
});

it('waits for the newest queued restriction before refolding an expanded ticker', () => {
  setTicker(tickerMessage({
    id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
    text: 'SNN // ROUTE CONFIRMED', tone: 'normal',
  }));
  const view = render(<FleetBroadcast />);
  const surface = view.container.querySelector('.fleet-broadcast')!;
  fireEvent.click(screen.getByRole('button', { name: 'Hide fleet broadcasts' }));

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
  expect(surface).toHaveAttribute('data-expanded', 'true');

  fireEvent.animationEnd(view.container.querySelector<HTMLElement>(
    '.fleet-ticker__group[data-message-id="s1:fleet-ticker:2"]',
  )!);
  expect(surface).toHaveAttribute('data-hidden', 'false');
  fireEvent.animationEnd(view.container.querySelector<HTMLElement>(
    '.fleet-ticker__group[data-message-id="s1:fleet-ticker:3"]',
  )!);
  expect(surface).toHaveAttribute('data-hidden', 'true');
  expect(view.container.querySelectorAll('.fleet-broadcast__toggle')).toHaveLength(1);
});

it('uses an immediate readable reduced-motion expansion before refolding', () => {
  vi.useFakeTimers();
  setMotionOverride('reduce');
  setTicker(tickerMessage({
    id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
    text: 'SNN // ROUTE CONFIRMED', tone: 'normal',
  }));
  const view = render(<FleetBroadcast />);
  const surface = view.container.querySelector('.fleet-broadcast')!;
  fireEvent.click(screen.getByRole('button', { name: 'Hide fleet broadcasts' }));

  act(() => setTicker(tickerMessage({
    id: 's1:fleet-ticker:2', sequence: 2, source: 'admiral', priority: 80,
    text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger',
  })));
  expect(surface).toHaveAttribute('data-hidden', 'false');
  expect(screen.getByRole('status', { name: 'ICSN ADMIRAL // RED ALERT' })).toBeVisible();

  act(() => vi.advanceTimersByTime(4_000));
  expect(surface).toHaveAttribute('data-hidden', 'true');
  expect(screen.getByRole('button', { name: 'Reveal fleet broadcasts' })).toBeVisible();
});
