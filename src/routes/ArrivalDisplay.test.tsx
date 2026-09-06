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
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  render(<ArrivalDisplay survivorPopulation={222_501} />);
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

it('draws one fixed population estimate with no trailing zero or five', () => {
  render(<ArrivalDisplay survivorPopulation={222_501} />);

  expect(readout(4)).toHaveTextContent('222,501');
  expect(screen.getByText('POPULATION ESTIMATE AFTER INITIAL STARVATION')).toBeVisible();

  const population = shown(4);
  advance(60_000);
  expect(shown(4)).toBe(population);
  expect(Number(population.replaceAll(',', ''))).toBeGreaterThanOrEqual(222_500);
  expect(Number(population.replaceAll(',', ''))).toBeLessThanOrEqual(242_500);
  expect(population).not.toMatch(/[05]$/);
});

it('walks the wolves readout through its listed order', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  render(<ArrivalDisplay />);
  expect(readout(3)).toHaveTextContent('1');
  expect(screen.getByText('WOLF AMONG US')).toBeVisible();
  advance(8000);
  expect(readout(3)).toHaveTextContent('?');
  expect(screen.getByText('WOLVES AMONG US')).toBeVisible();
  advance(5000);
  expect(readout(3)).toHaveTextContent('2');
  advance(5000);
  expect(readout(3)).toHaveTextContent('1');
  expect(screen.getByText('WOLF AMONG US')).toBeVisible();
});

it('briefly replaces the wolves number with sus on a successful one-second roll', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  render(<ArrivalDisplay />);

  advance(999);
  expect(readout(3)).toHaveTextContent('1');
  advance(1);
  expect(readout(3)).toHaveTextContent('sus');
  advance(34);
  expect(readout(3)).toHaveTextContent('1');
});

it('leaves the wolves number alone when the one-second sus roll misses', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.01);
  render(<ArrivalDisplay />);

  advance(1000);
  expect(readout(3)).toHaveTextContent('1');
});

it('alternates the convoy between six and seven ships while personnel stays in range', () => {
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

  expect(ships.slice(0, 6)).toEqual(['6', '7', '6', '7', '6', '7']);
  expect(new Set(ships)).toEqual(new Set(['6', '7']));
  expect(new Set(crew).size).toBeGreaterThan(1);
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
it('does not show hostile hacking messages on the opening display', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  render(<ArrivalDisplay />);
  advance(80_000);

  expect(document.querySelector('.intrusion')).not.toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(
    /EARTH IS NOT FOR YOU|BE AFRAID|A COLD GRAVE AWAITS YOU|YOU WILL DIE A HORRIBLE DEATH|EVERYONE YOU KNOW IS A SPY|WE CANNOT BE STOPPED/i,
  );
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
  for (const label of [
    'SHIPS IN CONVOY',
    'PERSONNEL GRANTED CIC DATA ACCESS',
    'WOLF AMONG US',
  ]) {
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
