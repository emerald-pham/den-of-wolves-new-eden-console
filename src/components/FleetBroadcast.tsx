import { useEffect, useRef, useState } from 'react';
import { ADMIRAL_ALERT_PREFIX, DEFAULT_FLEET_ALERT_MESSAGE } from '@/lib/fleetAlertMessage';
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
    const isCurrentAirspace = (entry: AuthoritativeFleetTickerMessage): boolean => {
      if (entry.source !== 'automatic') return true;
      const cycle = session.currentTurn ?? 0;
      if (entry.sourceId === 'turn-zero-atc') return cycle === 0;
      const match = /^airspace:([1-9]\d*):(restricted|lifted)$/.exec(entry.sourceId ?? '');
      if (!match) return true;
      return Number(match[1]) === cycle && (!phase || phase.airspace.state === match[2]);
    };
    const streamMessage = authoritativeTicker.current && isCurrentAirspace(authoritativeTicker.current)
      ? displayFleetTickerMessage(authoritativeTicker.current) : undefined;
    const queue = authoritativeTicker.queued.filter(isCurrentAirspace)
      .map((entry) => displayFleetTickerMessage(entry));
    const visibleMessage = streamMessage ?? queue[0];
    const visibleQueue = streamMessage ? queue : queue.slice(1);
    if (visibleMessage) {
      return <FleetBroadcastSurface
        message={visibleMessage}
        {...(visibleQueue.length > 0 ? { queue: visibleQueue } : {})}
        fallback={visibleQueue[0] ?? awaitingDispatch}
      />;
    }
    return <FleetBroadcastSurface message={awaitingDispatch} />;
  }
  // Only explicit active emergency/alert/finale state may bypass a pending
  // stream. Historical ordinary news and inactive alerts must not replay.
  if (debriefMode.active) {
    return <FleetBroadcastSurface message={{
      id: `${session.id}:finale-credits:${debriefMode.revision}`,
      text: FINALE_CREDITS,
      tone: 'normal',
    }} />;
  }
  if (emergencyPauseBulletin) {
    return <FleetBroadcastSurface message={emergencyPauseBulletin} />;
  }
  if (!alert?.active) {
    return <FleetBroadcastSurface message={awaitingDispatch} />;
  }
  return <FleetBroadcastSurface message={{
    id: `${session.id}:red-alert:${alert.revision}`,
    text: formatAdmiralAlert(alert.text ?? DEFAULT_FLEET_ALERT_MESSAGE),
    tone: 'danger',
  }} fallback={awaitingDispatch} />;
}
