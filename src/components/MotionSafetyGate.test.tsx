import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MotionSafetyGate from './MotionSafetyGate';
import {
  MOTION_SAFETY_STORAGE_KEY,
  MOTION_SAFETY_TTL_MS,
} from '@/lib/motionSafety';
import { setMotionOverride, useMotionPreference } from '@/lib/motionPreference';

function MotionProbe() {
  const { override, reducedMotion } = useMotionPreference();
  return (
    <p role="status">
      underlying motion: {reducedMotion ? 'reduced' : 'normal'} ({override})
    </p>
  );
}

describe('MotionSafetyGate', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('returns focus to the interrupted game control after renewed acknowledgement', async () => {
    const user = userEvent.setup();
    localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({
      acknowledgedAt: Date.now(), choice: 'full',
    }));
    render(<MotionSafetyGate><main><button type="button">Game control</button></main></MotionSafetyGate>);
    const control = screen.getByRole('button', { name: 'Game control' });
    control.focus();
    localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({
      acknowledgedAt: Date.now() - MOTION_SAFETY_TTL_MS, choice: 'full',
    }));
    fireEvent(window, new Event('focus'));
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /reduced motion/i }));
    expect(control).toHaveFocus();
    expect(control.closest('.motion-safety-content')).not.toHaveAttribute('aria-hidden');
  });

  it('requires a fresh choice when an open tab reaches the 24-hour boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000_000);
    localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({
      acknowledgedAt: Date.now() - MOTION_SAFETY_TTL_MS + 1000, choice: 'full',
    }));
    render(<MotionSafetyGate><MotionProbe /></MotionSafetyGate>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(999));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('dialog', { name: /motion safety check/i })).toBeVisible();
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('underlying motion: reduced');
    fireEvent.click(screen.getByRole('button', { name: /reduced motion/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(MOTION_SAFETY_TTL_MS));
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('rechecks expiry when returning to a suspended tab', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000_000);
    localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({
      acknowledgedAt: Date.now(), choice: 'reduce',
    }));
    render(<MotionSafetyGate><MotionProbe /></MotionSafetyGate>);
    vi.setSystemTime(Date.now() + MOTION_SAFETY_TTL_MS);
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('blocks the app on first load and forces reduced motion behind the prompt', () => {
    render(
      <MotionSafetyGate>
        <button type="button">Game control</button>
        <MotionProbe />
      </MotionSafetyGate>,
    );

    expect(screen.getByRole('dialog', { name: /motion safety check/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /motion safety check/i })).toBeInTheDocument();
    expect(screen.getByText(/a lot of motion, moving parts, and moving colors/i)).toBeInTheDocument();
    expect(screen.getByText(/normal motion is highly recommended/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /normal motion/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reduced motion/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('underlying motion: reduced');
    expect(screen.getByRole('button', { name: 'Game control', hidden: true })
      .closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('keeps keyboard focus in the safety choice and cannot be escaped', () => {
    render(<MotionSafetyGate><p>Game content</p></MotionSafetyGate>);

    const dialog = screen.getByRole('dialog', { name: /motion safety check/i });
    const normal = screen.getByRole('button', { name: /normal motion/i });
    const reduced = screen.getByRole('button', { name: /reduced motion/i });
    expect(document.activeElement).toBe(normal);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(reduced);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(normal);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(reduced);
  });

  it('dismisses into normal motion only when the recommended option is chosen', async () => {
    const user = userEvent.setup();
    render(<MotionSafetyGate><MotionProbe /></MotionSafetyGate>);

    await user.click(screen.getByRole('button', { name: /normal motion/i }));

    expect(screen.queryByRole('dialog', { name: /motion safety check/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('underlying motion: normal (full)');
    expect(JSON.parse(localStorage.getItem(MOTION_SAFETY_STORAGE_KEY) ?? '{}')).toMatchObject({
      choice: 'full',
    });

    act(() => setMotionOverride('reduce'));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('underlying motion: reduced (reduce)');
    });
  });

  it('dismisses into playable reduced motion when that option is chosen', async () => {
    const user = userEvent.setup();
    render(<MotionSafetyGate><MotionProbe /></MotionSafetyGate>);

    await user.click(screen.getByRole('button', { name: /reduced motion/i }));

    expect(screen.queryByRole('dialog', { name: /motion safety check/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('underlying motion: reduced (reduce)');
  });

  it('opens again when the saved choice is exactly 24 hours old', () => {
    localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({
      acknowledgedAt: Date.now() - MOTION_SAFETY_TTL_MS,
      choice: 'full',
    }));

    render(<MotionSafetyGate><MotionProbe /></MotionSafetyGate>);

    expect(screen.getByRole('dialog', { name: /motion safety check/i })).toBeVisible();
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('underlying motion: reduced');
  });

  it('restores a fresh saved choice before rendering the game', () => {
    localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({
      acknowledgedAt: Date.now(),
      choice: 'full',
    }));

    render(<MotionSafetyGate><MotionProbe /></MotionSafetyGate>);

    expect(screen.queryByRole('dialog', { name: /motion safety check/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('underlying motion: normal (full)');
  });

  it('does not overwrite a later Settings motion choice during the 24-hour window', () => {
    localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({
      acknowledgedAt: Date.now(),
      choice: 'full',
    }));
    setMotionOverride('reduce');

    render(<MotionSafetyGate><MotionProbe /></MotionSafetyGate>);

    expect(screen.queryByRole('dialog', { name: /motion safety check/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('underlying motion: reduced (reduce)');
  });
});
