import { useCallback, useEffect, useRef, useState } from 'react';
import Intrusion from './Intrusion';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

export const TURN_START_SLIDE_MS = 2_400;
export const TURN_START_EXIT_MS = 320;
export const TURN_ONE_NARRATIVE_SLIDE_MS = 4_000;

type TurnStartTransmission = {
  readonly sessionId: string;
  readonly turn: number;
  readonly survivorPopulation: number;
};

function currentAnnouncement(session: GameSession | null | undefined): TurnStartTransmission | null {
  const announcement = session?.turnStartAnnouncement;
  if (
    !session || !announcement || session.currentTurn !== announcement.turn ||
    !Number.isSafeInteger(announcement.turn) || announcement.turn < 1 ||
    !Number.isSafeInteger(announcement.survivorPopulation) || announcement.survivorPopulation < 0
  ) return null;
  return {
    sessionId: session.id,
    turn: announcement.turn,
    survivorPopulation: announcement.survivorPopulation,
  };
}

function FleetTransmission({
  transmission,
  onComplete,
}: {
  readonly transmission: TurnStartTransmission;
  readonly onComplete: (completed: TurnStartTransmission) => void;
}) {
  const [slide, setSlide] = useState(0);
  const [slideMotion, setSlideMotion] = useState<'in' | 'out'>('in');
  const [delayedBeat, setDelayedBeat] = useState<'traitors' | 'population' | null>(null);
  const isFirstTurn = transmission.turn === 1;
  const slideCount = isFirstTurn ? 8 : 3;
  const isTraitorReveal = isFirstTurn && slide === 5;
  const isPopulationSlide = !isFirstTurn ? slide === 1 : slide === 6;
  const showsTraitors = isTraitorReveal && delayedBeat === 'traitors';
  const showsPopulationLoss = isPopulationSlide && delayedBeat === 'population';
  const survivorPopulation = new Intl.NumberFormat('en-US').format(
    showsPopulationLoss ? Math.max(0, transmission.survivorPopulation - 1) : transmission.survivorPopulation,
  );
  const transitionLabel = `TURN ${transmission.turn - 1} → TURN ${transmission.turn}`;
  const sequenceLabel = `${String(slide + 1).padStart(2, '0')} / ${String(slideCount).padStart(2, '0')}`;

  useEffect(() => {
    const isNarrativeBeat = isFirstTurn && slide >= 2 && slide <= 4;
    const duration = isNarrativeBeat
      ? TURN_ONE_NARRATIVE_SLIDE_MS
      : isTraitorReveal ? TURN_START_SLIDE_MS * 2 : TURN_START_SLIDE_MS;
    const isLastSlide = slide === slideCount - 1;
    const transitionTimer = window.setTimeout(() => {
      if (isLastSlide) {
        onComplete(transmission);
        return;
      }
      setSlideMotion('out');
    }, isLastSlide ? duration : duration - TURN_START_EXIT_MS);
    const nextSlideTimer = isLastSlide ? undefined : window.setTimeout(() => {
      setSlide(slide + 1);
      setSlideMotion('in');
    }, duration);
    return () => {
      window.clearTimeout(transitionTimer);
      if (nextSlideTimer !== undefined) window.clearTimeout(nextSlideTimer);
    };
  }, [isFirstTurn, isTraitorReveal, onComplete, slide, slideCount, transmission]);

  useEffect(() => {
    const delay = isTraitorReveal
      ? TURN_START_SLIDE_MS
      : isPopulationSlide ? TURN_START_SLIDE_MS / 2 : null;
    if (delay === null) return;
    const beat = isTraitorReveal ? 'traitors' : 'population';
    const timer = window.setTimeout(() => setDelayedBeat(beat), delay);
    return () => window.clearTimeout(timer);
  }, [isPopulationSlide, isTraitorReveal]);

  const message = !isFirstTurn ? (
    slide === 0
      ? <p className="turn-start-announcement__turn">TURN {transmission.turn}</p>
      : slide === 1
        ? <p className="turn-start-announcement__population">{survivorPopulation} PEOPLE —</p>
        : <p className="turn-start-announcement__survive">SURVIVE.</p>
  ) : slide === 0 ? (
    <p className="turn-start-announcement__message">Iris Authentication Confirmed</p>
  ) : slide === 1 ? (
    <p className="turn-start-announcement__turn">TURN {transmission.turn}</p>
  ) : slide === 2 ? (
    <p className="turn-start-announcement__message">THE WOLVES DESTROYED YOUR HOMES.</p>
  ) : slide === 3 ? (
    <p className="turn-start-announcement__message">THE FLEET IS ALL THAT REMAINS.</p>
  ) : slide === 4 ? (
    <p className="turn-start-announcement__message">THE WOLVES ARE PURSUING YOU THRU THE VOID.</p>
  ) : slide === 5 ? (
    <p className="turn-start-announcement__message">
      SOME OF YOU — {showsTraitors && <>ARE <span className="turn-start-announcement__traitors">TRAITORS.</span></>}
    </p>
  ) : slide === 6 ? (
    <p className="turn-start-announcement__population">{survivorPopulation} PEOPLE —</p>
  ) : <p className="turn-start-announcement__survive">SURVIVE.</p>;

  return (
    <>
      <Intrusion
        variant="fleet"
        overlines={['FLEET TRANSMISSION // TURN INITIALIZATION', 'FLEET STATUS // STAND BY']}
      >
        <div
          className="turn-start-announcement__console cic-frame"
          data-slide={slide}
          data-slide-count={slideCount}
        >
          <div className="turn-start-announcement__header">
            <span className="turn-start-announcement__transition">{transitionLabel}</span>
            <span className="turn-start-announcement__sequence">TRANSMISSION {sequenceLabel}</span>
          </div>
          <div className="turn-start-announcement__ticks cic-ticks" aria-hidden="true" />
          <div
            className="turn-start-announcement__slide"
            data-motion={slideMotion}
            key={slide}
          >
            {message}
          </div>
          <div className="turn-start-announcement__readouts">
            <span className="turn-start-announcement__readout">
              <span className="turn-start-announcement__readout-label">FLEET SURVIVORS</span>
              <strong className="turn-start-announcement__readout-value">{survivorPopulation}</strong>
            </span>
            <span className="turn-start-announcement__readout">
              <span className="turn-start-announcement__readout-label">WOLF PURSUIT</span>
              <strong className="turn-start-announcement__readout-value">ACTIVE</strong>
            </span>
          </div>
        </div>
      </Intrusion>
      <p className="turn-start-announcement__sr" aria-live="assertive" aria-atomic="true">
        Fleet transmission for Turn {transmission.turn}.
      </p>
    </>
  );
}

/** Shows a server-authorized transmission only when this browser sees a turn advance live. */
export default function TurnStartAnnouncement() {
  const session = useSessionStore((state) => state.session);
  const previous = useRef<{ readonly sessionId: string; readonly turn: number } | null>(null);
  const [transmission, setTransmission] = useState<TurnStartTransmission | null>(null);

  useEffect(() => {
    if (!session) {
      previous.current = null;
      setTransmission(null);
      return;
    }
    const announcement = currentAnnouncement(session);
    const wasLiveTurnAdvance = Boolean(
      previous.current && previous.current.sessionId === session.id && announcement &&
      announcement.turn > previous.current.turn,
    );
    previous.current = { sessionId: session.id, turn: session.currentTurn ?? 1 };
    if (wasLiveTurnAdvance && announcement) setTransmission(announcement);
  }, [session]);

  const complete = useCallback((completed: TurnStartTransmission) => {
    setTransmission((current) => current?.sessionId === completed.sessionId && current.turn === completed.turn
      ? null
      : current);
  }, []);

  if (!transmission || transmission.sessionId !== session?.id) return null;
  return <FleetTransmission
    key={`${transmission.sessionId}-${transmission.turn}`}
    transmission={transmission}
    onComplete={complete}
  />;
}
