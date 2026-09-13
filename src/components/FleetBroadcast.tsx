import { useEffect, useRef, useState } from 'react';
import { ADMIRAL_ALERT_PREFIX, DEFAULT_FLEET_ALERT_MESSAGE } from '@/lib/fleetAlertMessage';
import { normalizePressDispatch } from '@/lib/pressDispatchState';
import { fleetTickerState } from '@/lib/fleetTickerState';
import type { FleetTickerMessage as AuthoritativeFleetTickerMessage } from '@/types/game';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import FleetTicker, { type FleetTickerProps } from './FleetTicker';

type BulletinSource = 'AEGIS' | 'AIRSPACE CONTROL' | 'SNN';

const FINALE_CREDITS =
  'CREDITS // BASED ON THE ORIGINAL MEGAGAME DEN OF WOLVES BY JOHN MIZON (SOUTH WEST MEGAGAMES) // NEW EDEN GAME DESIGN: JOHN KEYWORTH (KIWI GAME DESIGN) // WEB APP LEAD: EMERALD FLEUR PHAM';

function sourceBulletin(source: BulletinSource, text: string): string {
  const prefix = `${source} // `;
  return text.startsWith(prefix) ? text : `${prefix}${text}`;
}

function formatAdmiralAlert(text: string): string {
  const uppercaseText = text.toUpperCase();
  return uppercaseText.startsWith(ADMIRAL_ALERT_PREFIX)
    ? uppercaseText
    : `${ADMIRAL_ALERT_PREFIX}${uppercaseText}`;
}

function displayFleetTickerMessage(
  message: AuthoritativeFleetTickerMessage,
  pressText?: string,
) {
  return {
    id: message.id,
    text: message.text,
    tone: message.tone,
    gap: message.gap,
    ...(pressText ? { pressText } : {}),
    ...(message.passCount === undefined ? {} : { passes: message.passCount }),
    ...(message.expiresAt === undefined ? {} : { expiresAt: message.expiresAt }),
    serverAuthoritative: true as const,
  };
}

const NARROW_TICKER_QUERY = '(max-width: 48rem)';

function readNarrowViewport(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(NARROW_TICKER_QUERY).matches;
  }
  return window.innerWidth <= 768;
}

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(readNarrowViewport);

  useEffect(() => {
    const update = () => setNarrow(readNarrowViewport());
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia(NARROW_TICKER_QUERY)
      : undefined;
    update();
    media?.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      media?.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return narrow;
}

function FleetBroadcastSurface(tickerProps: FleetTickerProps) {
  const hasTickerProps = Boolean(tickerProps.message || tickerProps.fallback ||
    tickerProps.queue?.length);
  const narrow = useNarrowViewport();
  const [surfaceHeight, setSurfaceHeight] = useState<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hadTickerRef = useRef(false);
  if (hasTickerProps) hadTickerRef.current = true;

  useEffect(() => {
    if (!narrow) {
      setSurfaceHeight(null);
    }
  }, [narrow]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !narrow) return undefined;
    const measure = () => {
      const height = surface.getBoundingClientRect().height;
      if (height > 0) setSurfaceHeight(height);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [narrow]);

  const reserveStyle = narrow && surfaceHeight !== null
    ? { height: `${surfaceHeight}px` }
    : undefined;

  return <>
    {(hasTickerProps || hadTickerRef.current) && (
      <div className="fleet-broadcast__reserve" aria-hidden="true" style={reserveStyle} />
    )}
    <div ref={surfaceRef} className="fleet-broadcast"
      data-empty={hasTickerProps ? 'false' : 'true'}>
      <div className="fleet-broadcast__ticker">
        <FleetTicker {...tickerProps} />
      </div>
    </div>
  </>;
}

export default function FleetBroadcast() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const alert = session?.fleetRedAlert;
  const debriefMode = session?.debriefMode ?? { active: false, revision: 0 };
  const phase = phaseForSession(session);
  const dispatchState = normalizePressDispatch(session?.pressDispatch);
  const dispatchText = dispatchState.dispatches
    .map((dispatch) => sourceBulletin('SNN', dispatch.text))
    .join(' // ');
  const emergencyPauseBulletin = session && phase?.timerPause
    ? {
        id: `${session.id}:emergency-timer:${phase.turn}:${phase.timerPause.pausedAt}`,
        text: sourceBulletin(
          'AIRSPACE CONTROL',
          phase.timerPause.reason === 'empty-session'
            ? 'FLEET CLOCKS ON HOLD // RESUMES WHEN CREW RECONNECT'
            : 'EMERGENCY TIMER PAUSED // ALL FLEET CLOCKS ON HOLD // GM RESUME REQUIRED',
        ),
        tone: phase.timerPause.reason === 'empty-session' ? 'normal' as const : 'danger' as const,
        gap: 'long' as const,
      }
    : undefined;
  const pressDispatch = session && dispatchText
    ? {
        id: `${session.id}:press-dispatch:${dispatchState.revision}`,
        text: dispatchText,
        tone: 'normal' as const,
        gap: 'long' as const,
      }
    : undefined;
  const airspaceBulletin = session && phase?.airspace.tickerActive
    ? {
        id: `${session.id}:airspace:${phase.turn}:${phase.airspace.state}`,
        text: sourceBulletin('AIRSPACE CONTROL', phase.airspace.state === 'restricted'
          ? 'AIRSPACE CLOSED // AIRSPACE LOCKDOWN, ALL CREW MUST RETURN TO ORIGIN SHIPS / STAY IN THEIR ORIGIN SHIPS // SHUTTLES MUST STAY AT CURRENT LOCATION.'
          : 'AIRSPACE OPEN'),
        tone: 'normal' as const,
        gap: 'long' as const,
      }
    : undefined;
  const standingMessage = emergencyPauseBulletin ?? airspaceBulletin ?? pressDispatch;
  if (!session || !me) return null;
  // Keep the shared instrument present while a server projection is arriving.
  // This status never reconstructs dismissed news or guesses an airspace state.
  const awaitingDispatch = {
    id: `${session.id}:awaiting-fleet-dispatch`,
    text: sourceBulletin('AIRSPACE CONTROL', 'AWAITING DISPATCH'),
    tone: 'normal' as const,
    gap: 'long' as const,
  };
  const authoritativeTicker = fleetTickerState(session.fleetTicker);
  if (session.fleetTicker && authoritativeTicker.revision > 0) {
    const streamMessage = authoritativeTicker.current
      ? displayFleetTickerMessage(authoritativeTicker.current) : undefined;
    const queue = authoritativeTicker.queued
      .map((entry) => displayFleetTickerMessage(entry));
    if (streamMessage || queue.length > 0) {
      return <FleetBroadcastSurface
        {...(streamMessage ? { message: streamMessage } : {})}
        {...(queue.length > 0 ? { queue } : {})}
        fallback={queue[0] ?? awaitingDispatch}
      />;
    }
    return <FleetBroadcastSurface message={awaitingDispatch} />;
  }
  if (debriefMode.active) {
    return <FleetBroadcastSurface message={{
      id: `${session.id}:finale-credits:${debriefMode.revision}`,
      text: FINALE_CREDITS,
      tone: 'normal',
    }} />;
  }
  if (!alert || alert.revision === 0) {
    return <FleetBroadcastSurface
      message={standingMessage ?? awaitingDispatch}
    />;
  }
  return <FleetBroadcastSurface message={{
    id: `${session.id}:red-alert:${alert.revision}`,
    text: alert.active
      ? formatAdmiralAlert(alert.text ?? DEFAULT_FLEET_ALERT_MESSAGE)
      : sourceBulletin('AEGIS', 'RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.'),
    tone: alert.active ? 'danger' : 'normal',
    ...(alert.active
      ? (dispatchText ? { pressText: dispatchText } : {})
      : { passes: 2 }),
  }} fallback={standingMessage ?? awaitingDispatch} />;
}
