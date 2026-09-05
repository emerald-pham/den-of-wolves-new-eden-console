import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Intrusion from './Intrusion';
import {
  SIGNAL_GLITCH_INTERVAL_MS,
  SIGNAL_SCRAMBLE_CHANCE,
  scrambleSignalText,
} from './intrusionGlitch';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Intrusion', () => {
  it('shows the message it was handed', () => {
    render(<Intrusion message="A COLD GRAVE AWAITS YOU" />);
    expect(screen.getByText('A COLD GRAVE AWAITS YOU')).toBeInTheDocument();
  });

  it('is atmosphere, not a dialog: hidden from assistive technology and unable to take focus', () => {
    const { container } = render(<Intrusion message="BE AFRAID" />);
    const overlay = container.firstElementChild;

    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelectorAll('a, button, input, select, [tabindex]')).toHaveLength(0);
  });

  it('hands the message to the colour-split layers without repeating it in the DOM', () => {
    // The red and cyan ghosts are drawn from a data attribute by CSS. If they
    // ever become real elements the message is in the document three times and
    // every getByText against it breaks.
    render(<Intrusion message="EARTH IS NOT FOR YOU" />);

    expect(screen.getByText('EARTH IS NOT FOR YOU')).toHaveAttribute(
      'data-text',
      'EARTH IS NOT FOR YOU',
    );
  });

  it('scrambles eligible letters independently while preserving spacing', () => {
    expect(SIGNAL_SCRAMBLE_CHANCE).toBe(0.1);
    expect(scrambleSignalText('SIGNAL 42', () => 0)).not.toBe('SIGNAL 42');
    expect(scrambleSignalText('SIGNAL 42', () => 0)[6]).toBe(' ');
    expect(scrambleSignalText('SIGNAL 42', () => 0.5)).toBe('SIGNAL 42');
  });

  it('starts with distorted signal copy and refreshes it once per second', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { container } = render(<Intrusion message="BE AFRAID" />);
    const signalCopy = container.querySelectorAll('.intrusion__signal .cic-overline');

    expect(signalCopy[0]).not.toHaveTextContent('UNAUTHORIZED TRANSMISSION / SOURCE UNKNOWN');
    expect(signalCopy[1]).not.toHaveTextContent('SIGNAL INTEGRITY COMPROMISED');
    expect(screen.getByText('BE AFRAID')).toHaveAttribute('data-text', 'BE AFRAID');

    act(() => vi.advanceTimersByTime(SIGNAL_GLITCH_INTERVAL_MS));

    expect(signalCopy[0]).toHaveTextContent('UNAUTHORIZED TRANSMISSION / SOURCE UNKNOWN');
    expect(signalCopy[1]).toHaveTextContent('SIGNAL INTEGRITY COMPROMISED');
    expect(screen.getByText('BE AFRAID')).toHaveAttribute('data-text', 'BE AFRAID');
  });
});
