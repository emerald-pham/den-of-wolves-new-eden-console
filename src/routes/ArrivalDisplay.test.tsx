import { act, render, screen, cleanup } from '@testing-library/react';
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

const readout = (n: number) => screen.getByLabelText(`Arrival readout ${n}`);
const shown = (n: number) => readout(n).textContent ?? '';

it('turns each readout over every five seconds on proportionally staggered beats', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  render(<ArrivalDisplay />);
  expect(readout(1)).toHaveTextContent('6');
  expect(readout(2)).toHaveTextContent('20');
  expect(readout(3)).toHaveTextContent('1');

  advance(5000);
  expect(shown(1)).not.toBe('6');
  expect(shown(2)).toBe('20');
  advance(1500);
  expect(shown(2)).not.toBe('20');
  advance(1500);
  expect(readout(3)).toHaveTextContent('?');
});

it('walks the wolves readout through its listed order', () => {
  render(<ArrivalDisplay />);
  expect(readout(3)).toHaveTextContent('1');
  advance(8000);
  expect(readout(3)).toHaveTextContent('?');
  advance(5000);
  expect(readout(3)).toHaveTextContent('2');
  advance(5000);
  expect(readout(3)).toHaveTextContent('1');
});

it('draws ships from one to seven and crew from eight to twenty-one', () => {
  render(<ArrivalDisplay />);
  const ships = [shown(1)];
  const crew = [shown(2)];

  // 6500ms lands on the first beat of both readouts; every 5000ms after that
  // moves both again, so consecutive samples are genuine consecutive values.
  advance(6500);
  ships.push(shown(1));
  crew.push(shown(2));
  for (let i = 0; i < 50; i += 1) {
    advance(5000);
    ships.push(shown(1));
    crew.push(shown(2));
  }

  expect(new Set(ships).size).toBeGreaterThan(1);
  expect(new Set(crew).size).toBeGreaterThan(1);
  for (const value of ships) {
    expect(Number(value)).toBeGreaterThanOrEqual(1);
    expect(Number(value)).toBeLessThanOrEqual(7);
  }
  for (const value of crew) {
    expect(Number(value)).toBeGreaterThanOrEqual(8);
    expect(Number(value)).toBeLessThanOrEqual(21);
  }
});

it('never redraws the value a readout is already showing', () => {
  // A readout that "changes" to what it already reads looks like a stuck panel.
  render(<ArrivalDisplay />);
  let ship = shown(1);
  let crew = shown(2);

  advance(6500);
  for (let i = 0; i < 60; i += 1) {
    expect(shown(1)).not.toBe(ship);
    expect(shown(2)).not.toBe(crew);
    ship = shown(1);
    crew = shown(2);
    advance(5000);
  }
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
it('draws from every hostile message, the newer threats included', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  render(<ArrivalDisplay />);

  advance(20000);

  expect(screen.getByText('WE CANNOT BE STOPPED')).toBeInTheDocument();
});

it('has no motion control and clears timers on unmount', () => {
  const { unmount } = render(<ArrivalDisplay />);
  expect(screen.queryByRole('button', { name: /pause effects|resume effects/i })).not.toBeInTheDocument();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('defaults to still mode when reduced motion is requested', () => {
  vi.mocked(matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
  render(<ArrivalDisplay />);
  advance(80000);
  expect(screen.getByLabelText('Arrival readout 1').textContent).toBe('6');
  expect(screen.queryByText('EARTH IS NOT FOR YOU')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /pause effects|resume effects/i })).not.toBeInTheDocument();
});

it('keeps descriptive labels visible while hiding sequences and franchise-specific copy', () => {
  render(<ArrivalDisplay />);

  expect(screen.getByLabelText('Arrival readout 1')).toHaveTextContent('6');
  expect(screen.queryByText('DRADIS', { exact: false })).not.toBeInTheDocument();
  for (const label of ['SHIPS IN CONVOY', 'CREW', 'WOLVES AMONG US']) {
    expect(screen.getByText(label)).toBeVisible();
  }
  expect(screen.queryByText('6 — 7 — 5 — 0 — 1 — 3 — 4')).not.toBeInTheDocument();
  expect(screen.queryByText('20 — 18 — 8 — 6 — 0 — 21')).not.toBeInTheDocument();
  expect(screen.queryByText('1 — ? — 2')).not.toBeInTheDocument();
});

it('omits the scenario signal footer', () => {
  render(<ArrivalDisplay />);

  expect(screen.queryByText(/SCENARIO SIGNAL/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/NOT LIVE SESSION DATA/i)).not.toBeInTheDocument();
});

it('reports an intrusion for as long as it is on screen so the plot can go hostile', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const onTransmission = vi.fn();
  const { unmount } = render(<ArrivalDisplay onTransmission={onTransmission} />);

  expect(onTransmission).toHaveBeenLastCalledWith(false);
  advance(20000);
  expect(onTransmission).toHaveBeenLastCalledWith(true);
  advance(5000);
  expect(onTransmission).toHaveBeenLastCalledWith(false);

  unmount();
  expect(onTransmission).toHaveBeenLastCalledWith(false);
});

it('never reports an intrusion when reduced motion has stood the display down', () => {
  vi.mocked(matchMedia).mockReturnValue({
    matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  const onTransmission = vi.fn();
  render(<ArrivalDisplay onTransmission={onTransmission} />);

  advance(80000);
  expect(onTransmission).not.toHaveBeenCalledWith(true);
});
