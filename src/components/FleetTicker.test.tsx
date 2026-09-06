import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FleetTicker from './FleetTicker';
import { setMotionOverride } from '@/lib/motionPreference';
const alert = { id: 'alert-1', text: 'red alert from AEGIS Admiral - wolf attack imminent, all hands to battle stations', tone: 'danger' as const };
const cancelled = { id: 'cancel-2', text: 'red alert cancelled by AEGIS, stand down, stand down all battlestations. repeat, stand down, stand down all battlestations. red alert cancelled by AEGIS.', tone: 'normal' as const, passes: 2 };
beforeEach(() => { sessionStorage.clear(); setMotionOverride('full'); });
afterEach(() => { vi.useRealTimers(); act(() => setMotionOverride('system')); });
it('repeats the alert indefinitely and replaces it with exactly two cancellation passes', () => {
  const view = render(<FleetTicker message={alert} />);
  fireEvent.animationIteration(screen.getByText(alert.text));
  expect(screen.getByText(alert.text)).toBeVisible();
  view.rerender(<FleetTicker message={cancelled} />);
  expect(screen.queryByText(alert.text)).not.toBeInTheDocument();
  fireEvent.animationIteration(screen.getByText(cancelled.text));
  expect(screen.getByText(cancelled.text)).toBeVisible();
  fireEvent.animationIteration(screen.getByText(cancelled.text));
  expect(screen.queryByText(cancelled.text)).not.toBeInTheDocument();
  view.unmount(); render(<FleetTicker message={cancelled} />);
  expect(screen.queryByText(cancelled.text)).not.toBeInTheDocument();
});
it('runs press copy on the same surface without pause controls', () => {
  render(<FleetTicker message={{ id: 'press-1', text: 'Press missive', tone: 'normal' }} />);
  expect(screen.getByText('Press missive')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('shows readable stationary copy in reduced motion and clears finite messages', () => {
  vi.useFakeTimers(); setMotionOverride('reduce');
  render(<FleetTicker message={cancelled} />);
  expect(screen.getByText(cancelled.text)).toHaveStyle({ animation: 'none' });
  act(() => vi.advanceTimersByTime(60000));
  expect(screen.queryByText(cancelled.text)).not.toBeInTheDocument();
});
it('uses all-capital lettering for fleet broadcasts', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync('src/components/fleetTicker.css', 'utf8');
  expect(css).toMatch(/\.fleet-ticker__message\s*\{[^}]*text-transform:\s*uppercase/);
});
