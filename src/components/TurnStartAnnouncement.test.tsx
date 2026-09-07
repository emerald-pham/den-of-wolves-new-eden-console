import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import TurnStartAnnouncement, {
  TURN_START_EXIT_MS,
  TURN_START_EXIT_FADE_MS,
  TURN_ONE_CLOSING_SLIDE_MS,
  TURN_ONE_NARRATIVE_SLIDE_MS,
  TURN_ONE_TRAITORS_SLIDE_MS,
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
  expect(screen.getByText('TRANSMISSION 01 / 07')).toBeInTheDocument();
  expect(screen.queryByText('TURN 1')).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('TURN 1')).toBeInTheDocument();
  expect(screen.getByText('TRANSMISSION 02 / 07')).toBeInTheDocument();
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

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(traitors.parentElement).toBe(traitorMessage);
  expect(traitorMessage).toHaveTextContent("THERE ARE TRAITORS AMONG US; THAT'S KIND OF SUS.");

  act(() => vi.advanceTimersByTime(TURN_ONE_TRAITORS_SLIDE_MS - TURN_START_SLIDE_MS));
  const survivors = screen.getByText('242,500 SURVIVORS');
  expect(survivors).toHaveClass('turn-start-announcement__population');
  expect(screen.queryByText('242,500 SURVIVORS —')).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime((TURN_ONE_CLOSING_SLIDE_MS / 2) - 1));
  expect(screen.getByText('242,500 SURVIVORS')).toBe(survivors);

  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText('242,499 SURVIVORS')).toHaveClass('turn-start-announcement__population');
  expect(screen.getByText('FLEET SURVIVORS').parentElement).toHaveTextContent('242,499');
  expect(screen.queryByText('SURVIVE.')).not.toBeInTheDocument();

  const overlay = document.querySelector('.intrusion--fleet');
  expect(overlay).toHaveAttribute('data-state', 'active');

  act(() => vi.advanceTimersByTime((TURN_ONE_CLOSING_SLIDE_MS / 2) - 1));
  expect(overlay).toHaveAttribute('data-state', 'active');

  act(() => vi.advanceTimersByTime(1));
  expect(overlay).toHaveAttribute('data-state', 'exiting');

  act(() => vi.advanceTimersByTime(TURN_START_EXIT_FADE_MS - 1));
  expect(document.querySelector('.intrusion--fleet')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(1));
  expect(document.querySelector('.intrusion--fleet')).not.toBeInTheDocument();
});

it('announces the next airspace state, survivors, and objective on every turn after Turn 1', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  render(<TurnStartAnnouncement />);

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 237_000 },
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  }));

  expect(screen.getByText('TURN 2')).toBeInTheDocument();
  expect(screen.getByText('TURN 1 → TURN 2')).toBeInTheDocument();
  expect(screen.getByText('TRANSMISSION 01 / 04')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: /Airspace closed/, hidden: true }))
    .toHaveTextContent('05:00');
  expect(screen.queryByText('237,000 SURVIVORS')).not.toBeInTheDocument();
  expect(screen.queryByText(/wolves destroyed your homes/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/some of you/i)).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('AIRSPACE CLOSED')).toBeInTheDocument();
  expect(screen.getByText('TRANSMISSION 02 / 04')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('237,000 SURVIVORS')).toBeInTheDocument();
  expect(screen.getByText('TRANSMISSION 03 / 04')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS / 2));
  expect(screen.getByText('236,999 SURVIVORS')).toBeInTheDocument();
  expect(screen.getByText('FLEET SURVIVORS').parentElement).toHaveTextContent('236,999');
  expect(screen.queryByText('OBJECTIVE // SURVIVE.')).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS / 2));
  expect(screen.getByText('OBJECTIVE // SURVIVE.')).toBeInTheDocument();
  expect(screen.getByText('TRANSMISSION 04 / 04')).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(1_000));
  expect(screen.getByRole('status', { name: /Airspace closed/, hidden: true }))
    .toHaveTextContent('04:52');

  const overlay = document.querySelector('.intrusion--fleet');
  expect(overlay).toHaveAttribute('data-state', 'active');
  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS - 1_000 - 1));
  expect(overlay).toHaveAttribute('data-state', 'active');
  act(() => vi.advanceTimersByTime(1));
  expect(overlay).toHaveAttribute('data-state', 'exiting');
  act(() => vi.advanceTimersByTime(TURN_START_EXIT_FADE_MS));
  expect(document.querySelector('.intrusion--fleet')).not.toBeInTheDocument();
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
  expect(screen.getByText('AIRSPACE CLOSED')).toBeInTheDocument();
  expect(screen.getByText('AIRSPACE CLOSED').parentElement).toHaveAttribute('data-motion', 'in');

  act(() => vi.advanceTimersByTime(TURN_START_SLIDE_MS));
  expect(screen.getByText('237,000 SURVIVORS')).toBeInTheDocument();
  expect(screen.getByText('237,000 SURVIVORS').parentElement).toHaveAttribute('data-motion', 'in');
});

it('replays a server revision of the current transmission without advancing the turn', () => {
  vi.useFakeTimers();
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500, revision: 0 },
  });
  render(<TurnStartAnnouncement />);

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500, revision: 1 },
  }));

  expect(screen.getByText('Iris Authentication Confirmed')).toBeInTheDocument();
  expect(screen.getByText('TURN 0 → TURN 1')).toBeInTheDocument();
});

it('replays a GM-only local transmission and clears the local trigger when it completes', () => {
  vi.useFakeTimers();
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500 },
  });
  render(<TurnStartAnnouncement />);

  act(() => useSessionStore.getState().setTurnStartReplay({
    sessionId: 's1',
    turn: 1,
    survivorPopulation: 242_500,
    token: 1,
  }));

  expect(screen.getByText('Iris Authentication Confirmed')).toBeInTheDocument();
  expect(screen.getByText('TURN 0 → TURN 1')).toBeInTheDocument();
  for (const duration of [
    TURN_START_SLIDE_MS,
    TURN_START_SLIDE_MS,
    TURN_ONE_NARRATIVE_SLIDE_MS,
    TURN_ONE_NARRATIVE_SLIDE_MS,
    TURN_ONE_NARRATIVE_SLIDE_MS,
    TURN_ONE_TRAITORS_SLIDE_MS,
    TURN_ONE_CLOSING_SLIDE_MS,
    TURN_ONE_CLOSING_SLIDE_MS,
    TURN_START_EXIT_FADE_MS,
  ]) act(() => vi.advanceTimersByTime(duration));
  expect(useSessionStore.getState().turnStartReplay).toBeNull();
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
