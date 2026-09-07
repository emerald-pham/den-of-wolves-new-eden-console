import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SessionWaiver from './SessionWaiver';

describe('SessionWaiver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the two regulations together in a code-of-conduct layout', () => {
    render(<SessionWaiver onAcknowledge={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /code of conduct/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CODE OF CONDUCT' })).toBeInTheDocument();
    expect(screen.getByRole('article', {
      name: /ICNY registered vessel consoles cannot be removed from the tables/i,
    })).toHaveTextContent(/role-play.*table rule.*wireless commands are illegal/i);
    expect(screen.getByRole('article', {
      name: /CIC authorized personnel may hide resource counts/i,
    })).toHaveTextContent(/not compelled to share.*may lie about resource counts.*jump coordinates/i);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getAllByRole('checkbox').every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole('button', { name: 'Acknowledge regulations and continue' })).toBeDisabled();
    expect(screen.getByText(/saved for 24 hours on this device/i)).toBeInTheDocument();
  });

  it('requires every checkbox and a ten-second countdown before the final confirmation', () => {
    vi.useFakeTimers();
    const onAcknowledge = vi.fn();
    render(<SessionWaiver onAcknowledge={onAcknowledge} />);
    const checkboxes = screen.getAllByRole('checkbox');
    const confirm = screen.getByRole('button', { name: 'Acknowledge regulations and continue' });

    expect(screen.getByText(/10 seconds remaining/i)).toBeInTheDocument();
    fireEvent.click(checkboxes[0]!);
    expect(confirm).toBeDisabled();
    fireEvent.click(checkboxes[1]!);
    expect(confirm).toBeDisabled();

    act(() => vi.advanceTimersByTime(9_999));
    expect(confirm).toBeDisabled();

    act(() => vi.advanceTimersByTime(1));
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it('does not acknowledge when the final confirmation is clicked early', () => {
    const onAcknowledge = vi.fn();
    render(<SessionWaiver onAcknowledge={onAcknowledge} />);

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge regulations and continue' }));

    expect(onAcknowledge).not.toHaveBeenCalled();
  });
});
