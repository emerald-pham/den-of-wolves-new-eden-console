import { useCallback, useEffect, useRef, useState } from 'react';
import Intrusion from './Intrusion';
import { useMotionPreference } from '@/lib/motionPreference';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';
import { DradisAirspaceTimer } from './TurnPhaseTimer';
import LiveChangeRegion from './LiveChangeRegion';
import { clearTurnAdvanceInterstitial, type ClearCycleBriefingRequest } from '@/lib/turnInterstitialService';
import CycleBriefingClearanceView from './CycleBriefingClearanceView';
import { TeamStartFormalAnnouncementsView } from './TeamStartFormalAnnouncementsView';

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
  readonly heldAt?: string;
  readonly formalAnnouncements: NonNullable<GameSession['turnStartAnnouncement']>['formalAnnouncements'];
  readonly formalOnly?: boolean;
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
    formalAnnouncements: announcement.formalAnnouncements,
    ...(announcement.formalOnly ? { formalOnly: true } : {}),
    ...(session.turnPhase?.timerPause?.reason === 'turn-interstitial'
      ? { heldAt: session.turnPhase.timerPause.pausedAt } : {}),
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
  const regularSlideCount = isFirstTurn ? 7 : 4;
  const formalAnnouncements = transmission.formalAnnouncements ?? [];
  const slideCount = transmission.formalOnly ? formalAnnouncements.length : regularSlideCount + formalAnnouncements.length;
  const isFormalSlide = transmission.formalOnly || slide >= regularSlideCount;
  const formalIndex = transmission.formalOnly ? slide : slide - regularSlideCount;
  const isPopulationSlide = !transmission.formalOnly && (!isFirstTurn ? slide === 2 : slide === 6);
  const showsPopulationLoss = isPopulationSlide && populationLossShown;
  const survivorPopulation = new Intl.NumberFormat('en-US').format(
    showsPopulationLoss ? Math.max(0, transmission.survivorPopulation - 1) : transmission.survivorPopulation,
  );
  const transitionLabel = `CYCLE ${transmission.turn - 1} → CYCLE ${transmission.turn}`;
  const sequenceLabel = `${String(slide + 1).padStart(2, '0')} / ${String(slideCount).padStart(2, '0')}`;

  useEffect(() => {
    const duration = slideDuration(isFirstTurn, slide);
    const isLastSlide = slide === slideCount - 1;
    const transitionTimer = window.setTimeout(() => {
      if (isLastSlide) {
        if (transmission.heldAt) return;
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

  const message = isFormalSlide ? (
    <TeamStartFormalAnnouncementsView announcements={formalAnnouncements[formalIndex]
      ? [formalAnnouncements[formalIndex]!] : []} />
  ) : !isFirstTurn ? (
    slide === 0
      ? <p className="turn-start-announcement__turn">CYCLE {transmission.turn}</p>
      : slide === 1
        ? <p className="turn-start-announcement__message">AIRSPACE CLOSED</p>
        : slide === 2
        ? <p className="turn-start-announcement__population">{survivorPopulation} SURVIVORS</p>
        : <p className="turn-start-announcement__survive">OBJECTIVE // SURVIVE.</p>
  ) : slide === 0 ? (
    <p className="turn-start-announcement__message">FLEET LINK AUTHORIZED</p>
  ) : slide === 1 ? (
    <p className="turn-start-announcement__turn">CYCLE {transmission.turn}</p>
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
        overlines={['FLEET TRANSMISSION // CYCLE INITIALIZATION', 'FLEET STATUS // STAND BY']}
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
    </>
  );
}

/** Shows a server-authorized transmission only when this browser sees a turn advance live. */
export default function TurnStartAnnouncement() {
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');
  const clearButton = useRef<HTMLButtonElement>(null);
  const clearRequest = useRef<{identity: string; request: ClearCycleBriefingRequest} | null>(null);
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
    if ((wasLiveTurnAdvance || announcement?.heldAt) && announcement) setTransmission((current) =>
      current?.sessionId === announcement.sessionId && current.turn === announcement.turn &&
      current.revision === announcement.revision && current.heldAt === announcement.heldAt ? current : announcement);
    if (!announcement?.heldAt) setTransmission((current) => current?.heldAt ? null : current);
  }, [session]);

  useEffect(() => {
    if (!localReplay || localReplay.sessionId !== session?.id) return;
    setTransmission({
      sessionId: localReplay.sessionId,
      turn: localReplay.turn,
      survivorPopulation: localReplay.survivorPopulation,
      revision: localReplay.token,
      localReplayToken: localReplay.token,
      formalAnnouncements: undefined,
    });
  }, [localReplay, session?.id]);

  const heldAt = session?.turnPhase?.timerPause?.reason === 'turn-interstitial'
    ? session.turnPhase.timerPause.pausedAt : undefined;
  const holdIdentity = heldAt ? `${session?.id}:${session?.currentTurn}:${heldAt}` : '';
  useEffect(() => {
    setClearError('');
    setClearing(false);
    if (!holdIdentity) { clearRequest.current = null; return; }
    const previousFocus = document.activeElement;
    clearButton.current?.focus();
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, [holdIdentity]);
  async function clearBriefing(): Promise<void> {
    if (!session || !heldAt || connection !== 'live' || clearing) return;
    if (clearRequest.current?.identity !== holdIdentity) clearRequest.current = {
      identity: holdIdentity, request: {expectedCycle: session.currentTurn ?? 1, expectedPausedAt: heldAt,
        requestId: crypto.randomUUID()},
    };
    const request = clearRequest.current.request;
    setClearing(true); setClearError('');
    try { await clearTurnAdvanceInterstitial(request); }
    catch (cause) { if (clearRequest.current?.identity === holdIdentity)
      setClearError(cause instanceof Error ? cause.message : 'CIC link unavailable. Reconnect and try again.'); }
    finally { if (clearRequest.current?.identity === holdIdentity) setClearing(false); }
  }

  const activeTransmission = transmission?.sessionId === session?.id ? transmission : null;
  const transmissionKey = activeTransmission
    ? `${activeTransmission.sessionId}:${activeTransmission.turn}:${activeTransmission.revision}:${activeTransmission.localReplayToken ?? 'server'}`
    : null;

  return (
    <>
      <LiveChangeRegion
        as="p"
        className="turn-start-announcement__sr"
        changeKey={transmissionKey}
        message={activeTransmission ? `Fleet transmission for Cycle ${activeTransmission.turn}.` : ''}
        politeness="assertive"
        announceInitial
      />
      <div className={heldAt ? 'turn-interstitial-layout' : undefined}>
      {heldAt && <CycleBriefingClearanceView online={connection === 'live'} clearing={clearing}
        error={clearError} buttonRef={clearButton} onClear={() => void clearBriefing()} />}
      {activeTransmission && (
        <FleetTransmission
          key={transmissionKey!}
          transmission={activeTransmission}
          onComplete={complete}
        />
      )}
      </div>
    </>
  );
}
