import { ADMIRAL_ALERT_PREFIX, DEFAULT_FLEET_ALERT_MESSAGE } from '@/lib/fleetAlertMessage';
import { normalizePressDispatch } from '@/lib/pressDispatchState';
import { fleetTickerState } from '@/lib/fleetTickerState';
import type { FleetTickerMessage as AuthoritativeFleetTickerMessage } from '@/types/game';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import FleetTicker from './FleetTicker';

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
  const turnZeroBulletin = session && session.currentTurn === 0
    ? {
        id: `${session.id}:turn-zero-console-lockout`,
        text: sourceBulletin('AEGIS', 'CONSOLES LOCKED OUT UNTIL IRIS AUTHENTICATION IS COMPLETE'),
        tone: 'normal' as const,
        gap: 'long' as const,
      }
    : undefined;
  const emergencyPauseBulletin = session && phase?.timerPause
    ? {
        id: `${session.id}:emergency-timer:${phase.turn}:${phase.timerPause.pausedAt}`,
        text: sourceBulletin(
          'AIRSPACE CONTROL',
          'EMERGENCY TIMER PAUSED // ALL FLEET CLOCKS ON HOLD // GM RESUME REQUIRED',
        ),
        tone: 'danger' as const,
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
  const standingMessage = turnZeroBulletin ?? emergencyPauseBulletin ?? airspaceBulletin ?? pressDispatch;
  if (!session || !me) return null;
  const authoritativeTicker = fleetTickerState(session.fleetTicker);
  if (session.fleetTicker && authoritativeTicker.revision > 0) {
    const streamMessage = authoritativeTicker.current
      ? displayFleetTickerMessage(authoritativeTicker.current) : undefined;
    const queue = authoritativeTicker.queued
      .map((entry) => displayFleetTickerMessage(entry));
    if (streamMessage || queue.length > 0) {
      return <FleetTicker
        {...(streamMessage ? { message: streamMessage } : {})}
        {...(queue.length > 0 ? { queue } : {})}
      />;
    }
    return null;
  }
  if (debriefMode.active) {
    return <FleetTicker message={{
      id: `${session.id}:finale-credits:${debriefMode.revision}`,
      text: FINALE_CREDITS,
      tone: 'normal',
    }} />;
  }
  if (!alert || alert.revision === 0) {
    return <FleetTicker {...(standingMessage ? { message: standingMessage } : {})} />;
  }
  return <FleetTicker message={{
    id: `${session.id}:red-alert:${alert.revision}`,
    text: alert.active
      ? formatAdmiralAlert(alert.text ?? DEFAULT_FLEET_ALERT_MESSAGE)
      : sourceBulletin('AEGIS', 'RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.'),
    tone: alert.active ? 'danger' : 'normal',
    ...(alert.active
      ? (dispatchText ? { pressText: dispatchText } : {})
      : { passes: 2 }),
  }} {...(standingMessage ? { fallback: standingMessage } : {})} />;
}
