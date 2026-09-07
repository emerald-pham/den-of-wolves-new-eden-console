import { useCallback, useEffect, useRef, useState } from 'react';
import Intrusion from './Intrusion';
import { useMotionPreference } from '@/lib/motionPreference';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';
import { DradisAirspaceTimer } from './TurnPhaseTimer';

export const TURN_START_SLIDE_MS = 2_400;
export const TURN_START_EXIT_MS = 320;
export const TURN_START_EXIT_FADE_MS = 2_000;
export const TURN_ONE_CLOSING_SLIDE_MS = 3_000;
export const TURN_ONE_NARRATIVE_SLIDE_MS = 4_000;
export const TURN_ONE_TRAITORS_SLIDE_MS = 4_800;

type TurnStartTransmission = {
  readonly sessionId: string;
  readonly turn: number;
  readonly survivorPopulation: number;
  readonly revision: number;
  readonly localReplayToken?: number;
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
    revision: announcement.revision ?? 0,
  };
}

function slideDuration(isFirstTurn: boolean, slide: number): number {
  if (isFirstTurn && slide >= 6) return TURN_ONE_CLOSING_SLIDE_MS;
  if (isFirstTurn && slide === 5) return TURN_ONE_TRAITORS_SLIDE_MS;
  if (isFirstTurn && slide >= 2 && slide <= 4) return TURN_ONE_NARRATIVE_SLIDE_MS;
  return TURN_START_SLIDE_MS;
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
  const [populationLossShown, setPopulationLossShown] = useState(false);
  const [transmissionState, setTransmissionState] = useState<'active' | 'exiting'>('active');
  const { reducedMotion } = useMotionPreference();
  const phase = phaseForSession(useSessionStore((state) => state.session));
  const isFirstTurn = transmission.turn === 1;
  const slideCount = isFirstTurn ? 7 : 4;
  const isPopulationSlide = !isFirstTurn ? slide === 2 : slide === 6;
  const showsPopulationLoss = isPopulationSlide && populationLossShown;
  const survivorPopulation = new Intl.NumberFormat('en-US').format(
    showsPopulationLoss ? Math.max(0, transmission.survivorPopulation - 1) : transmission.survivorPopulation,
  );
  const transitionLabel = `TURN ${transmission.turn - 1} → TURN ${transmission.turn}`;
  const sequenceLabel = `${String(slide + 1).padStart(2, '0')} / ${String(slideCount).padStart(2, '0')}`;

  useEffect(() => {
    const duration = slideDuration(isFirstTurn, slide);
    const isLastSlide = slide === slideCount - 1;
    const transitionTimer = window.setTimeout(() => {
      if (isLastSlide) {
        setTransmissionState('exiting');
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
  }, [isFirstTurn, onComplete, slide, slideCount, transmission]);

  useEffect(() => {
    if (transmissionState !== 'exiting') return undefined;
    const completionTimer = window.setTimeout(
      () => onComplete(transmission),
      reducedMotion ? 0 : TURN_START_EXIT_FADE_MS,
    );
    return () => window.clearTimeout(completionTimer);
  }, [onComplete, reducedMotion, transmission, transmissionState]);

  useEffect(() => {
    if (!isPopulationSlide) return;
    setPopulationLossShown(false);
    const timer = window.setTimeout(
      () => setPopulationLossShown(true),
      slideDuration(isFirstTurn, slide) / 2,
    );
    return () => window.clearTimeout(timer);
  }, [isFirstTurn, isPopulationSlide, slide]);

  const message = !isFirstTurn ? (
    slide === 0
      ? <p className="turn-start-announcement__turn">TURN {transmission.turn}</p>
      : slide === 1
        ? <p className="turn-start-announcement__message">AIRSPACE CLOSED</p>
        : slide === 2
        ? <p className="turn-start-announcement__population">{survivorPopulation} SURVIVORS</p>
        : <p className="turn-start-announcement__survive">OBJECTIVE // SURVIVE.</p>
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
      THERE ARE <span className="turn-start-announcement__traitors">TRAITORS</span> AMONG US; THAT&apos;S KIND OF SUS.
    </p>
  ) : slide === 6 ? (
    <p className="turn-start-announcement__population">{survivorPopulation} SURVIVORS</p>
  ) : null;

  return (
    <>
      <Intrusion
        variant="fleet"
        state={transmissionState}
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
        {!isFirstTurn && <DradisAirspaceTimer phase={phase} />}
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
  const localReplay = useSessionStore((state) => state.turnStartReplay);
  const setTurnStartReplay = useSessionStore((state) => state.setTurnStartReplay);
  const previous = useRef<{
    readonly sessionId: string;
    readonly turn: number;
    readonly revision: number;
  } | null>(null);
  const [transmission, setTransmission] = useState<TurnStartTransmission | null>(null);

  const complete = useCallback((completed: TurnStartTransmission) => {
    setTransmission((current) =>
      current?.sessionId === completed.sessionId &&
      current.turn === completed.turn &&
      current.revision === completed.revision &&
      current.localReplayToken === completed.localReplayToken
        ? null
        : current,
    );
    if (
      completed.localReplayToken !== undefined &&
      useSessionStore.getState().turnStartReplay?.token === completed.localReplayToken
    ) setTurnStartReplay(null);
  }, [setTurnStartReplay]);

  useEffect(() => {
    if (!session) {
      previous.current = null;
      setTransmission(null);
      return;
    }
    const announcement = currentAnnouncement(session);
    const wasLiveTurnAdvance = Boolean(
      previous.current && previous.current.sessionId === session.id && announcement &&
      (
        announcement.turn > previous.current.turn ||
        (
          announcement.turn === previous.current.turn &&
          announcement.revision > previous.current.revision
        )
      ),
    );
    previous.current = {
      sessionId: session.id,
      turn: announcement?.turn ?? session.currentTurn ?? 1,
      revision: announcement?.revision ?? 0,
    };
    if (wasLiveTurnAdvance && announcement) setTransmission(announcement);
  }, [session]);

  useEffect(() => {
    if (!localReplay || localReplay.sessionId !== session?.id) return;
    setTransmission({
      sessionId: localReplay.sessionId,
      turn: localReplay.turn,
      survivorPopulation: localReplay.survivorPopulation,
      revision: localReplay.token,
      localReplayToken: localReplay.token,
    });
  }, [localReplay, session?.id]);

  if (!transmission || transmission.sessionId !== session?.id) return null;
  return <FleetTransmission
    key={`${transmission.sessionId}-${transmission.turn}-${transmission.revision}-${transmission.localReplayToken ?? 'server'}`}
    transmission={transmission}
    onComplete={complete}
  />;
}
