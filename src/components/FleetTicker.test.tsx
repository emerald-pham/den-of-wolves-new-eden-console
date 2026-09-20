import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import FleetTicker from './FleetTicker';
import { setMotionOverride } from '@/lib/motionPreference';
const alert = { id: 'alert-1', text: 'red alert from AEGIS Admiral - wolf attack imminent, all hands to battle stations', tone: 'danger' as const };
const cancelled = { id: 'cancel-2', text: 'red alert cancelled by AEGIS, stand down, stand down all battlestations. repeat, stand down, stand down all battlestations. red alert cancelled by AEGIS.', tone: 'normal' as const, passes: 2 };
const finishMovingPasses = (container: HTMLElement, messageId: string) => {
  [...container.querySelectorAll<HTMLElement>(
    `.fleet-ticker__group[data-message-id="${messageId}"]`,
  )].forEach((group) => fireEvent.animationEnd(group));
};
let notifyResize: (() => void) | undefined;
class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {
    notifyResize = () => this.callback([], this as unknown as ResizeObserver);
  }
  observe() {}
  disconnect() {}
}
beforeEach(() => { sessionStorage.clear(); notifyResize = undefined; setMotionOverride('full'); });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  act(() => setMotionOverride('system'));
});
it('lets the old broadcast leave naturally while its replacement follows on the same lane', () => {
  const view = render(<FleetTicker message={alert} />);
  const track = view.container.querySelector('.fleet-ticker__track');
  const alertStatus = screen.getByRole('status', { name: alert.text });
  expect(alertStatus).toBeVisible();
  view.rerender(<FleetTicker message={cancelled} />);

  const cancellationStatus = screen.getByRole('status', { name: cancelled.text });
  expect(cancellationStatus.querySelector('.fleet-ticker__track')).toBe(track);
  expect(view.container.querySelector(
    `.fleet-ticker__group[data-message-id="${alert.id}"]`,
  )).toHaveTextContent(alert.text);
  expect(view.container.querySelector(
    `.fleet-ticker__group[data-message-id="${cancelled.id}"]`,
  )).toHaveTextContent(cancelled.text);

  finishMovingPasses(view.container, alert.id);
  expect(view.container.querySelector(
    `.fleet-ticker__group[data-message-id="${alert.id}"]`,
  )).not.toBeInTheDocument();
  expect(cancellationStatus).toBeVisible();
});
it('keeps the next lower-priority pass at the mobile right edge before appending Red Alert', () => {
  const press = {
    id: 'mobile-press-current', source: 'press' as const,
    text: 'SNN // CURRENT DISPATCH', tone: 'normal' as const,
  };
  const redAlert = {
    id: 'mobile-red-alert', source: 'admiral' as const,
    text: 'AEGIS // RED ALERT', tone: 'danger' as const,
  };
  const view = render(<FleetTicker message={press} />);
  const frame = view.container.querySelector<HTMLElement>('.fleet-ticker__window')!;
  frame.getBoundingClientRect = () => ({
    left: 0, right: 390, top: 0, bottom: 28, width: 390, height: 28,
    x: 0, y: 0, toJSON: () => undefined,
  });
  const pressGroups = [...view.container.querySelectorAll<HTMLElement>(
    `.fleet-ticker__group[data-message-id="${press.id}"]`,
  )];
  pressGroups.forEach((group, index) => {
    const left = index === 0 ? 390 : 900;
    group.getBoundingClientRect = () => ({
      left, right: left + 510, top: 0, bottom: 28, width: 510, height: 28,
      x: left, y: 0, toJSON: () => undefined,
    });
  });

  view.rerender(<FleetTicker message={redAlert} />);

  const retainedPress = view.container.querySelectorAll(
    `.fleet-ticker__group[data-message-id="${press.id}"]`,
  );
  const appendedAlert = view.container.querySelector<HTMLElement>(
    `.fleet-ticker__group[data-message-id="${redAlert.id}"]`,
  );
  expect(retainedPress).toHaveLength(1);
  expect(appendedAlert).toBeInTheDocument();
  expect(Number.parseFloat(appendedAlert!.style.getPropertyValue('--fleet-ticker-start-x')))
    .toBeGreaterThanOrEqual(900);
});
it('keeps queued identities singular while rapid updates append new tracks', () => {
  const firstQueued = {
    id: 'queued-press-1', text: 'SNN // FIRST REPORT', tone: 'normal' as const,
  };
  const secondQueued = {
    id: 'queued-press-2', text: 'SNN // SECOND REPORT', tone: 'normal' as const,
  };
  const view = render(<FleetTicker message={alert} queue={[firstQueued]} />);
  expect(view.container.querySelectorAll(
    `.fleet-ticker__group[data-message-id="${firstQueued.id}"]`,
  )).toHaveLength(2);
  expect(view.container.querySelectorAll('[role="status"]')).toHaveLength(1);

  view.rerender(<FleetTicker message={alert} queue={[firstQueued, secondQueued]} />);
  expect(view.container.querySelectorAll(
    `.fleet-ticker__group[data-message-id="${firstQueued.id}"]`,
  )).toHaveLength(2);
  expect(view.container.querySelectorAll(
    `.fleet-ticker__group[data-message-id="${secondQueued.id}"]`,
  )).toHaveLength(2);
  expect(view.container.querySelectorAll('[role="status"]')).toHaveLength(1);
});
it('rotates the authoritative Press pool while visible groups finish naturally', () => {
  const first = {
    id: 'press-pool-1', text: 'SNN // FIRST REPORT', tone: 'normal' as const, source: 'press' as const,
  };
  const second = {
    id: 'press-pool-2', text: 'SNN // SECOND REPORT', tone: 'normal' as const, source: 'press' as const,
  };
  const view = render(<FleetTicker message={first} queue={[second]} />);

  finishMovingPasses(view.container, first.id);
  expect(screen.getByRole('status', { name: second.text })).toBeVisible();

  finishMovingPasses(view.container, second.id);
  expect(screen.getByRole('status', { name: first.text })).toBeVisible();
});
it('keeps queued ATC as fallback while Press owns the moving pool', () => {
  const first = {
    id: 'press-pool-with-atc-1', text: 'SNN // FIRST REPORT', tone: 'normal' as const, source: 'press' as const,
  };
  const second = {
    id: 'press-pool-with-atc-2', text: 'SNN // SECOND REPORT', tone: 'normal' as const, source: 'press' as const,
  };
  const atc = {
    id: 'airspace-fallback', text: 'AIRSPACE CONTROL // AIRSPACE CLOSED', tone: 'normal' as const,
    source: 'automatic' as const,
  };
  const view = render(<FleetTicker message={first} queue={[second, atc]} />);

  expect(view.container.querySelectorAll(`[data-message-id="${atc.id}"]`)).toHaveLength(0);
  finishMovingPasses(view.container, first.id);
  finishMovingPasses(view.container, second.id);
  expect(screen.getByRole('status', { name: first.text })).toBeVisible();
  expect(view.container.querySelectorAll(`[data-message-id="${atc.id}"]`)).toHaveLength(0);
});
it('does not duplicate a queued identity when its current message is replaced', () => {
  const queued = {
    id: 'queued-press-replacement', text: 'SNN // QUEUED REPORT', tone: 'normal' as const,
  };
  const replacement = {
    id: 'replacement-alert', text: 'AEGIS // URGENT UPDATE', tone: 'danger' as const,
  };
  const view = render(<FleetTicker message={alert} queue={[queued]} />);
  view.rerender(<FleetTicker message={replacement} queue={[queued]} />);

  expect(view.container.querySelectorAll(
    `.fleet-ticker__group[data-message-id="${queued.id}"]`,
  )).toHaveLength(2);
  expect(view.container.querySelectorAll(
    `.fleet-ticker__group[data-message-id="${replacement.id}"]`,
  )).toHaveLength(2);
});
it('measures each queued identity against its own copy', () => {
  const queued = {
    id: 'queued-press-measurement', text: 'SNN // A LONGER QUEUED REPORT', tone: 'normal' as const,
  };
  const { container } = render(<FleetTicker message={alert} queue={[queued]} />);

  const probes = [...container.querySelectorAll('.fleet-ticker__probe')];
  expect(probes).toHaveLength(2);
  expect(probes.map((probe) => probe.textContent?.trim())).toEqual([
    `${alert.text} //`, `${queued.text} //`,
  ]);
});
it('extends a repeating tail across a widened frame without restarting existing groups', () => {
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  const { container } = render(<FleetTicker message={{
    id: 'resize-repeat', text: 'SNN // OK', tone: 'normal',
  }} />);
  const frame = container.querySelector<HTMLElement>('.fleet-ticker__window')!;
  Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 1416 });
  frame.getBoundingClientRect = () => ({
    left: 0, right: 1416, top: 0, bottom: 28, width: 1416, height: 28,
    x: 0, y: 0, toJSON: () => undefined,
  });
  [...container.querySelectorAll<HTMLElement>('.fleet-ticker__group')]
    .forEach((group, index) => {
      const left = index === 0 ? 320 : 784;
      group.getBoundingClientRect = () => ({
        left, right: left + 464, top: 0, bottom: 28, width: 464, height: 28,
        x: left, y: 0, toJSON: () => undefined,
      });
    });

  act(() => notifyResize?.());

  const groups = [...container.querySelectorAll<HTMLElement>('.fleet-ticker__group')];
  expect(groups).toHaveLength(3);
  expect(groups[0]).toHaveStyle('--fleet-ticker-start-x: 320px');
  expect(groups[2]).toHaveStyle('--fleet-ticker-start-x: 1248px');
});
it('rebases changed painted width with a negative delay that preserves the current tail position', () => {
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  const { container } = render(<FleetTicker message={{
    id: 'font-remeasure', text: 'SNN // FONT READY', tone: 'normal',
  }} />);
  const frame = container.querySelector<HTMLElement>('.fleet-ticker__window')!;
  frame.getBoundingClientRect = () => ({
    left: 0, right: 1000, top: 0, bottom: 28, width: 1000, height: 28,
    x: 0, y: 0, toJSON: () => undefined,
  });
  [...container.querySelectorAll<HTMLElement>('.fleet-ticker__group')]
    .forEach((group, index) => {
      const left = index === 0 ? 100 : 350;
      group.getBoundingClientRect = () => ({
        left, right: left + 250, top: 0, bottom: 28, width: 250, height: 28,
        x: left, y: 0, toJSON: () => undefined,
      });
    });

  act(() => notifyResize?.());

  const first = container.querySelector<HTMLElement>('.fleet-ticker__group')!;
  expect(first).toHaveStyle('--fleet-ticker-group-width: 250px');
  expect(Number.parseFloat(first.style.getPropertyValue('--fleet-ticker-delay'))).toBeLessThan(0);
});
it('plays a finite replacement for exactly its configured passes', () => {
  const view = render(<FleetTicker message={cancelled} />);
  finishMovingPasses(view.container, cancelled.id);
  expect(screen.queryByRole('status', { name: cancelled.text })).not.toBeInTheDocument();
  view.unmount(); render(<FleetTicker message={cancelled} />);
  expect(screen.queryByRole('status', { name: cancelled.text })).not.toBeInTheDocument();
});
it('does not let session storage overrule server-authoritative pass state', () => {
  sessionStorage.setItem('fleet-ticker:server-stand-down', '2');
  render(<FleetTicker message={{
    id: 'server-stand-down',
    text: 'AEGIS // STAND DOWN',
    tone: 'normal',
    passes: 2,
    serverAuthoritative: true,
  }} />);

  expect(screen.getByRole('status', { name: /AEGIS \/\/ STAND DOWN/ })).toBeVisible();
});
it('uses local pass completion only for the exact server message identity', () => {
  const first = { id: 'server-stand-down-a', text: 'AEGIS // STAND DOWN A', tone: 'normal' as const, passes: 2, serverAuthoritative: true };
  const second = { id: 'server-stand-down-b', text: 'AEGIS // STAND DOWN B', tone: 'normal' as const, passes: 2, serverAuthoritative: true };
  const view = render(<FleetTicker message={first} />);
  finishMovingPasses(view.container, first.id);
  expect(screen.queryByRole('status', { name: first.text })).not.toBeInTheDocument();

  view.rerender(<FleetTicker message={second} />);
  expect(screen.getByRole('status', { name: second.text })).toBeVisible();
  view.rerender(<FleetTicker message={first} />);
  expect(screen.queryByRole('status', { name: first.text })).not.toBeInTheDocument();
});
it('returns to the supplied standing copy when the server deadline expires', () => {
  vi.useFakeTimers(); setMotionOverride('reduce');
  vi.setSystemTime(new Date('2026-09-12T13:00:00.000Z'));
  render(<FleetTicker
    message={{
      id: 'server-stand-down-expiring', text: 'AEGIS // STAND DOWN', tone: 'normal',
      passes: 2, expiresAt: '2026-09-12T13:01:00.000Z', serverAuthoritative: true,
    }}
    fallback={{ id: 'airspace-standing', text: 'AIRSPACE CONTROL // AIRSPACE CLOSED', tone: 'normal' }}
  />);

  expect(screen.getByRole('status', { name: /AEGIS \/\/ STAND DOWN/ })).toBeVisible();
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByRole('status', { name: 'AIRSPACE CONTROL // AIRSPACE CLOSED' })).toBeVisible();
});
it('returns to a standing press bulletin after a finite broadcast completes', () => {
  const standby = {
    id: 'press-standby',
    text: 'SNN // Your Trusted Partner',
    tone: 'normal' as const,
    gap: 'long' as const,
  };
  const { container } = render(<FleetTicker message={cancelled} fallback={standby} />);
  finishMovingPasses(container, cancelled.id);
  expect(screen.getByRole('status', { name: standby.text })).toBeVisible();
});
it('lets the final broadcast slide away before clearing its instrument', () => {
  const view = render(<FleetTicker message={alert} />);
  view.rerender(<FleetTicker />);

  expect(screen.getByLabelText('Fleet broadcasts')).toHaveTextContent(alert.text);
  finishMovingPasses(view.container, alert.id);
  expect(screen.queryByLabelText('Fleet broadcasts')).not.toBeInTheDocument();
});
it('runs press copy on the same surface without pause controls', () => {
  render(<FleetTicker message={{ id: 'press-1', text: 'Press missive', tone: 'normal' }} />);
  expect(screen.getByRole('status', { name: 'Press missive' })).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('keeps moving broadcasts visible while the document font promise is pending', () => {
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  const ready = new Promise<void>(() => undefined);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { status: 'loading', ready },
  });
  try {
    render(<FleetTicker message={{
      id: 'font-pending', text: 'SNN // CURRENT SERVER BROADCAST', tone: 'normal',
    }} />);
    expect(screen.getByRole('status', { name: 'SNN // CURRENT SERVER BROADCAST' })).toBeVisible();
  } finally {
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else Reflect.deleteProperty(document, 'fonts');
  }
});
it('shows readable stationary copy in reduced motion and clears finite messages', () => {
  vi.useFakeTimers(); setMotionOverride('reduce');
  render(<FleetTicker message={cancelled} />);
  expect(screen.getByRole('status', { name: new RegExp(cancelled.text) })).toHaveTextContent(cancelled.text);
  act(() => vi.advanceTimersByTime(120000));
  expect(screen.queryByRole('status', { name: cancelled.text })).not.toBeInTheDocument();
});
it('announces two geometry-timed reduced-motion copies before advancing', () => {
  vi.useFakeTimers(); setMotionOverride('reduce');
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  const { container } = render(<FleetTicker message={{
    id: 'reduced-two-copy', text: 'AEGIS // SHORT', tone: 'normal', passes: 2,
  }} />);
  const frame = container.querySelector<HTMLElement>('.fleet-ticker__window')!;
  const message = container.querySelector<HTMLElement>('.fleet-ticker__message')!;
  Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 100 });
  Object.defineProperty(message, 'scrollWidth', { configurable: true, value: 100 });
  act(() => notifyResize?.());

  expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining('copy 1 of 2'));
  act(() => vi.advanceTimersByTime(5_000));
  expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining('copy 2 of 2'));
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('does not use a 30-second interval to shorten a long reduced-motion pass', () => {
  vi.useFakeTimers(); setMotionOverride('reduce');
  const longText = `AEGIS // ${'LONG COPY '.repeat(22)}`;
  render(<FleetTicker message={{ id: 'reduced-long-pass', text: longText, tone: 'normal', passes: 2 }} />);

  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining('copy 1 of 2'));
  act(() => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining('copy 2 of 2'));
  act(() => vi.advanceTimersByTime(50_000));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('rotates a queued Press identity in reduced motion without replaying the current copy', () => {
  vi.useFakeTimers(); setMotionOverride('reduce');
  render(<FleetTicker
    message={{ id: 'reduced-press-1', source: 'press', text: 'PRESS ONE', tone: 'normal' }}
    queue={[{ id: 'reduced-press-2', source: 'press', text: 'PRESS TWO', tone: 'normal' }]}
  />);
  expect(screen.getByRole('status', { name: 'PRESS ONE' })).toBeVisible();
  act(() => vi.advanceTimersByTime(4_000));
  expect(screen.getByRole('status', { name: 'PRESS TWO' })).toBeVisible();
  act(() => vi.advanceTimersByTime(4_000));
  expect(screen.getByRole('status', { name: 'PRESS ONE' })).toBeVisible();
});
it('keeps reduced Aegis visible while its suspended Press pool waits', () => {
  vi.useFakeTimers(); setMotionOverride('reduce');
  const aegis = {
    id: 'reduced-aegis', source: 'admiral' as const, text: 'AEGIS // RED ALERT', tone: 'danger' as const,
  };
  render(<FleetTicker message={aegis} queue={[{
    id: 'reduced-suspended-press', source: 'press', text: 'SNN // WAITING', tone: 'normal',
  }]} />);

  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByRole('status', { name: aegis.text })).toBeVisible();
});
it('wraps the stationary bulletin inside the reduced-motion ticker', () => {
  setMotionOverride('reduce');
  const { container } = render(<FleetTicker message={{
    id: 'long-reduced',
    text: 'AEGIS // CONSOLES LOCKED OUT UNTIL IRIS AUTHENTICATION IS COMPLETE',
    tone: 'normal',
    gap: 'long',
  }} />);
  const stylesheet = document.createElement('style');
  stylesheet.textContent = readFileSync('src/components/fleetTicker.css', 'utf8');
  document.head.append(stylesheet);
  try {
    const message = container.querySelector<HTMLElement>('.fleet-ticker__message');
    expect(message).toBeTruthy();
    expect(getComputedStyle(message!).whiteSpace).toBe('normal');
    expect(getComputedStyle(message!).overflowWrap).toBe('anywhere');
  } finally {
    stylesheet.remove();
  }
});
it('duplicates every moving broadcast into two seamless, screen-filling groups', () => {
  const { container } = render(<FleetTicker message={alert} />);
  const groups = container.querySelectorAll('.fleet-ticker__group');
  expect(groups).toHaveLength(2);
  expect(groups[0]?.querySelectorAll('.fleet-ticker__copy').length).toBeGreaterThanOrEqual(2);
  expect(groups[1]?.querySelectorAll('.fleet-ticker__copy').length)
    .toBe(groups[0]?.querySelectorAll('.fleet-ticker__copy').length);
});
it('uses all-capital lettering for fleet broadcasts', async () => {
  const css = readFileSync('src/components/fleetTicker.css', 'utf8');
  expect(css).toMatch(/\.fleet-ticker__message[^}]*text-transform:\s*uppercase/);
  expect(css).toMatch(/@keyframes fleet-broadcast-pass[^]*calc\(0px - var\(--fleet-ticker-group-width\)\)/);
  const tickerRule = css.match(/\.fleet-ticker\s*\{([^}]*)\}/)?.[1];
  expect(tickerRule).not.toMatch(/position:\s*fixed/);
  expect(tickerRule).not.toMatch(/bottom:/);
  expect(tickerRule).toMatch(/border:\s*1px solid var\(--cic-rule\)/);
});
it('reserves a vertically centred line box so SNN ticker text cannot clip at the bottom', () => {
  const css = readFileSync('src/components/fleetTicker.css', 'utf8');
  const windowRule = css.match(/\.fleet-ticker__window\s*\{([^}]*)\}/)?.[1] ?? '';
  const groupRule = css.match(/\.fleet-ticker__group\s*\{([^}]*)\}/)?.[1] ?? '';

  expect(windowRule).toContain('min-block-size: 1.75rem');
  expect(groupRule).toContain('inset-block: 0');
  expect(groupRule).toContain('align-items: center');
  expect(css).not.toContain('fleet-ticker__phase-timer');
  expect(css).not.toMatch(/min-height:\s*3\.5rem/);
});
it('leaves a long gap between repeated press dispatches', async () => {
  const { container } = render(<FleetTicker message={{
    id: 'press-1', text: 'SNN // Your Trusted Partner', tone: 'normal', gap: 'long',
  }} />);
  expect(container.querySelector('.fleet-ticker')).toHaveAttribute('data-gap', 'long');
  const css = readFileSync('src/components/fleetTicker.css', 'utf8');
  expect(css).toMatch(/\.fleet-ticker__group\[data-gap=["']long["']\][^}]*\.fleet-ticker__separator/);
});

it('moves every incoming tone at the shared linear ticker rate without downcasing alerts', () => {
  const { container } = render(<FleetTicker message={alert} />);
  expect(container.querySelector('.fleet-ticker__group')).toHaveAttribute(
    'data-tone', 'danger',
  );
  const css = readFileSync('src/components/fleetTicker.css', 'utf8');
  expect(css).toMatch(/animation:\s*fleet-broadcast-pass var\(--fleet-ticker-duration\) linear forwards/);
  expect(css).not.toContain('fleet-broadcast-enter');
  const stylesheet = document.createElement('style');
  stylesheet.textContent = css;
  document.head.append(stylesheet);
  try {
    expect(getComputedStyle(container.querySelector<HTMLElement>('.fleet-ticker__copy')!).textTransform)
      .toBe('uppercase');
  } finally {
    stylesheet.remove();
  }
});
