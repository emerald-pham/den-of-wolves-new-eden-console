import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import FleetTicker from './FleetTicker';
import { setMotionOverride } from '@/lib/motionPreference';
const alert = { id: 'alert-1', text: 'red alert from AEGIS Admiral - wolf attack imminent, all hands to battle stations', tone: 'danger' as const };
const cancelled = { id: 'cancel-2', text: 'red alert cancelled by AEGIS, stand down, stand down all battlestations. repeat, stand down, stand down all battlestations. red alert cancelled by AEGIS.', tone: 'normal' as const, passes: 2 };
beforeEach(() => { sessionStorage.clear(); setMotionOverride('full'); });
afterEach(() => { vi.useRealTimers(); act(() => setMotionOverride('system')); });
it('repeats the alert indefinitely and replaces it with exactly two cancellation passes', () => {
  const view = render(<FleetTicker message={alert} />);
  const alertStatus = screen.getByRole('status', { name: alert.text });
  fireEvent.animationIteration(alertStatus.querySelector('.fleet-ticker__track')!);
  expect(alertStatus).toBeVisible();
  view.rerender(<FleetTicker message={cancelled} />);
  expect(screen.queryByRole('status', { name: alert.text })).not.toBeInTheDocument();
  const cancellationStatus = screen.getByRole('status', { name: cancelled.text });
  fireEvent.animationIteration(cancellationStatus.querySelector('.fleet-ticker__track')!);
  expect(cancellationStatus).toBeVisible();
  fireEvent.animationIteration(cancellationStatus.querySelector('.fleet-ticker__track')!);
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
  render(<FleetTicker message={cancelled} fallback={standby} />);
  const cancellationStatus = screen.getByRole('status', { name: cancelled.text });
  fireEvent.animationIteration(cancellationStatus.querySelector('.fleet-ticker__track')!);
  fireEvent.animationIteration(cancellationStatus.querySelector('.fleet-ticker__track')!);
  expect(screen.getByRole('status', { name: standby.text })).toBeVisible();
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
  expect(css).toMatch(/@keyframes fleet-broadcast-pass[^]*translateX\(-50%\)/);
  const tickerRule = css.match(/\.fleet-ticker\s*\{([^}]*)\}/)?.[1];
  expect(tickerRule).not.toMatch(/position:\s*fixed/);
  expect(tickerRule).not.toMatch(/bottom:/);
  expect(tickerRule).toMatch(/border:\s*1px solid var\(--cic-rule\)/);
});
it('leaves a long gap between repeated press dispatches', async () => {
  const { container } = render(<FleetTicker message={{
    id: 'press-1', text: 'SNN // Your Trusted Partner', tone: 'normal', gap: 'long',
  }} />);
  expect(container.querySelector('.fleet-ticker')).toHaveAttribute('data-gap', 'long');
  const css = readFileSync('src/components/fleetTicker.css', 'utf8');
  expect(css).toMatch(/\.fleet-ticker\[data-gap=["']long["']\][^}]*\.fleet-ticker__separator/);
});
