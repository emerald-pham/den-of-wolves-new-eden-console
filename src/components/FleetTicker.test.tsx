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
beforeEach(() => { sessionStorage.clear(); setMotionOverride('full'); });
afterEach(() => { vi.useRealTimers(); act(() => setMotionOverride('system')); });
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
it('plays a finite replacement for exactly its configured passes', () => {
  const view = render(<FleetTicker message={cancelled} />);
  finishMovingPasses(view.container, cancelled.id);
  expect(screen.queryByRole('status', { name: cancelled.text })).not.toBeInTheDocument();
  view.unmount(); render(<FleetTicker message={cancelled} />);
  expect(screen.queryByRole('status', { name: cancelled.text })).not.toBeInTheDocument();
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
it('shows readable stationary copy in reduced motion and clears finite messages', () => {
  vi.useFakeTimers(); setMotionOverride('reduce');
  render(<FleetTicker message={cancelled} />);
  expect(screen.getByRole('status', { name: cancelled.text })).toHaveTextContent(cancelled.text);
  act(() => vi.advanceTimersByTime(60000));
  expect(screen.queryByRole('status', { name: cancelled.text })).not.toBeInTheDocument();
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
