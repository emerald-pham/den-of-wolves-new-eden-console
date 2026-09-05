import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ArrivalDisplay from './ArrivalDisplay';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

it('cycles the exact manifests every ten seconds with staggered starts and wraparound', () => {
  render(<ArrivalDisplay />);
  expect(screen.getByLabelText('Arrival readout 1')).toHaveTextContent('6');
  expect(screen.getByLabelText('Arrival readout 2')).toHaveTextContent('20');
  expect(screen.getByLabelText('Arrival readout 3')).toHaveTextContent('1');
  advance(10000);
  expect(screen.getByLabelText('Arrival readout 1')).toHaveTextContent('7');
  expect(screen.getByLabelText('Arrival readout 2')).toHaveTextContent('20');
  advance(3000);
  expect(screen.getByLabelText('Arrival readout 2')).toHaveTextContent('18');
  advance(3000);
  expect(screen.getByLabelText('Arrival readout 3')).toHaveTextContent('?');
  const ships = ['5', '0', '1', '3', '4', '6'];
  const crew = ['8', '6', '0', '21', '20', '18'];
  const wolves = ['2', '1', '?', '2', '1', '?'];
  ships.forEach((value, i) => {
    advance(10000);
    expect(screen.getByLabelText('Arrival readout 1').textContent).toBe(value);
    expect(screen.getByLabelText('Arrival readout 2').textContent).toBe(crew[i]);
    expect(screen.getByLabelText('Arrival readout 3').textContent).toBe(wolves[i]);
  });
});
it('transmits at twenty seconds for five seconds, then a different message each minute', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  render(<ArrivalDisplay />);
  advance(19999);
  expect(screen.queryByText('EARTH IS NOT FOR YOU')).not.toBeInTheDocument();
  advance(1);
  expect(screen.getByText('EARTH IS NOT FOR YOU')).toBeInTheDocument();
  advance(4999);
  expect(screen.getByText('EARTH IS NOT FOR YOU')).toBeInTheDocument();
  advance(1);
  expect(screen.queryByText('EARTH IS NOT FOR YOU')).not.toBeInTheDocument();
  advance(55000);
  expect(screen.getByText('BE AFRAID')).toBeInTheDocument();
});
it('lets users disable all effects and clears timers on unmount', () => {
  const { unmount } = render(<ArrivalDisplay />);
  advance(20000);
  fireEvent.click(screen.getByRole('button', { name: /pause effects/i }));
  expect(screen.queryByText('EARTH IS NOT FOR YOU')).not.toBeInTheDocument();
  const value = screen.getByLabelText('Arrival readout 1').textContent;
  advance(120000);
  expect(screen.getByLabelText('Arrival readout 1').textContent).toBe(value);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('defaults to still mode when reduced motion is requested', () => {
  vi.mocked(matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
  render(<ArrivalDisplay />);
  advance(80000);
  expect(screen.getByLabelText('Arrival readout 1').textContent).toBe('6');
  expect(screen.queryByText('EARTH IS NOT FOR YOU')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /resume effects/i })).toBeInTheDocument();
});

it('shows only live values inside readouts and no franchise-specific copy', () => {
  render(<ArrivalDisplay />);

  expect(screen.getByLabelText('Arrival readout 1')).toHaveTextContent('6');
  expect(screen.queryByText('DRADIS', { exact: false })).not.toBeInTheDocument();
  expect(screen.queryByText('SHIPS IN CONVOY')).not.toBeInTheDocument();
  expect(screen.queryByText('6 — 7 — 5 — 0 — 1 — 3 — 4')).not.toBeInTheDocument();
});
