import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import TurnStartAnnouncement, {
  TURN_START_EXIT_MS,
  TURN_ONE_NARRATIVE_SLIDE_MS,
  TURN_START_SLIDE_MS,
} from './TurnStartAnnouncement';

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    currentTurn: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

afterEach(() => vi.useRealTimers());

it('opens the Turn 1 briefing with iris authentication confirmation', () => {
  vi.useFakeTimers();
  render(<TurnStartAnnouncement />);

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500 },
  }));

  expect(screen.getByText('Iris Authentication Confirmed')).toBeInTheDocument();
  expect(screen.getByText('TURN 0 → TURN 1')).toBeInTheDocument();
  expect(screen.getByText('TRANSMISSION 01 / 08')).toBeInTheDocument();
  expect(screen.queryByText('TURN 1')).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('TURN 1')).toBeInTheDocument();
  expect(screen.getByText('TRANSMISSION 02 / 08')).toBeInTheDocument();
  expect(screen.queryByText('Iris Authentication Confirmed')).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText(/wolves destroyed your homes/i)).toBeInTheDocument();
  expect(screen.queryByText(/fleet is all that remains/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves are pursuing you thru the void/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/some of you/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_ONE_NARRATIVE_SLIDE_MS - 1));
  expect(screen.getByText(/wolves destroyed your homes/i)).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText(/fleet is all that remains/i)).toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves are pursuing you thru the void/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_ONE_NARRATIVE_SLIDE_MS));
  expect(screen.getByText('THE WOLVES ARE PURSUING YOU THRU THE VOID.')).toBeInTheDocument();
  expect(screen.queryByText(/fleet is all that remains/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_ONE_NARRATIVE_SLIDE_MS));
  const traitors = screen.getByText('TRAITORS');
  expect(traitors).toHaveClass('turn-start-announcement__traitors');
  const traitorMessage = traitors.parentElement;
  expect(traitorMessage).toHaveClass('turn-start-announcement__message');
  expect(traitorMessage).toHaveTextContent("THERE ARE TRAITORS AMONG US; THAT'S KIND OF SUS.");

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS / 2));
  expect(traitors.parentElement).toBe(traitorMessage);
  expect(traitorMessage).toHaveTextContent("THERE ARE TRAITORS AMONG US; THAT'S KIND OF SUS.");

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS / 2));
  const survivors = screen.getByText('242,500 PEOPLE —');
  expect(survivors).toHaveClass('turn-start-announcement__population');

  act(() => vi.advanceTimersByTime((TURN_START_SLIDE_MS / 2) - 1));
  expect(screen.getByText('242,500 PEOPLE —')).toBe(survivors);

  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText('242,499 PEOPLE —')).toHaveClass('turn-start-announcement__population');

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('SURVIVE.')).toBeInTheDocument();
});

it('uses only the survivor-count beat on every turn after Turn 1', () => {
  vi.useFakeTimers();
  render(<TurnStartAnnouncement />);

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 237_000 },
  }));

  expect(screen.getByText('TURN 2')).toBeInTheDocument();
  expect(screen.getByText('TURN 1 → TURN 2')).toBeInTheDocument();
  expect(screen.getByText('TRANSMISSION 01 / 03')).toBeInTheDocument();
  expect(screen.queryByText('237,000 PEOPLE —')).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/some of you/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('237,000 PEOPLE —')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS / 2));
  expect(screen.getByText('236,999 PEOPLE —')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('SURVIVE.')).toBeInTheDocument();
});

it('eases the current beat out before the next transmission beat enters', () => {
  vi.useFakeTimers();
  const view = render(<TurnStartAnnouncement />);

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 237_000 },
  }));

  const slide = view.container.querySelector('.turn-start-announcement__slide');
  expect(slide).toHaveAttribute('data-motion', 'in');

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS - TURN_START_EXIT_MS - 1));
  expect(slide).toHaveAttribute('data-motion', 'in');
  expect(screen.getByText('TURN 2')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(1));
  expect(slide).toHaveAttribute('data-motion', 'out');
  expect(screen.getByText('TURN 2')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_EXIT_MS));
  expect(screen.getByText('237,000 PEOPLE —')).toBeInTheDocument();
  expect(screen.getByText('237,000 PEOPLE —').parentElement).toHaveAttribute('data-motion', 'in');
});

it('does not replay the arrival transmission when a session first opens after Turn 1', () => {
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500 },
  });
  render(<TurnStartAnnouncement />);

  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();
});
