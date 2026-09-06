import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import TurnStartAnnouncement, {
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
  expect(screen.queryByText('TURN 1')).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('TURN 1')).toBeInTheDocument();
  expect(screen.queryByText('Iris Authentication Confirmed')).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText(/wolves destroyed your homes/i)).toBeInTheDocument();
  expect(screen.queryByText(/fleet is all that remains/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/pursuing you through the void/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/some of you/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_ONE_NARRATIVE_SLIDE_MS - 1));
  expect(screen.getByText(/wolves destroyed your homes/i)).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText(/fleet is all that remains/i)).toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/pursuing you through the void/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_ONE_NARRATIVE_SLIDE_MS));
  expect(screen.getByText(/pursuing you through the void/i)).toBeInTheDocument();
  expect(screen.queryByText(/fleet is all that remains/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_ONE_NARRATIVE_SLIDE_MS));
  expect(screen.getByText(/some of you/i)).toBeInTheDocument();
  expect(screen.queryByText(/traitors/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  const traitors = screen.getByText('TRAITORS.');
  expect(traitors).toHaveClass('turn-start-announcement__traitors');

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('242,500 PEOPLE —')).toBeInTheDocument();

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
  expect(screen.queryByText('237,000 PEOPLE —')).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/some of you/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('237,000 PEOPLE —')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('SURVIVE.')).toBeInTheDocument();
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
