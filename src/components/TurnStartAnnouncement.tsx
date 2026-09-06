import { useCallback, useEffect, useRef, useState } from 'react';
import Intrusion from './Intrusion';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

export const TURN_START_SLIDE_MS = 2_400;
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
  const isFirstTurn = transmission.turn === 1;
  const slideCount = isFirstTurn ? 9 : 3;
  const survivorPopulation = new Intl.NumberFormat('en-US').format(transmission.survivorPopulation);

  useEffect(() => {
    const isNarrativeBeat = isFirstTurn && slide >= 2 && slide <= 4;
    const timer = window.setTimeout(() => {
      if (slide < slideCount - 1) {
        setSlide(slide + 1);
        return;
      }
      onComplete(transmission);
    }, isNarrativeBeat ? TURN_ONE_NARRATIVE_SLIDE_MS : TURN_START_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [isFirstTurn, onComplete, slide, slideCount, transmission]);

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
    <p className="turn-start-announcement__message">THEY ARE PURSUING YOU THROUGH THE VOID.</p>
  ) : slide === 5 ? (
    <p className="turn-start-announcement__message">SOME OF YOU —</p>
  ) : slide === 6 ? (
    <p className="turn-start-announcement__message">
      ARE <span className="turn-start-announcement__traitors">TRAITORS.</span>
    </p>
  ) : slide === 7 ? (
    <p className="turn-start-announcement__population">{survivorPopulation} PEOPLE —</p>
  ) : <p className="turn-start-announcement__survive">SURVIVE.</p>;

  return (
    <>
      <Intrusion
        variant="fleet"
        overlines={['FLEET TRANSMISSION // TURN INITIALIZATION', 'FLEET STATUS // STAND BY']}
      >
        <div className="turn-start-announcement__slide" key={slide}>{message}</div>
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
