import { ADMIRAL_ALERT_PREFIX, DEFAULT_FLEET_ALERT_MESSAGE } from '@/lib/fleetAlertMessage';
import { normalizePressDispatch } from '@/lib/pressDispatchState';
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
          ? 'AIRSPACE RESTRICTED'
          : 'AIRSPACE OPEN'),
        tone: 'normal' as const,
        gap: 'long' as const,
      }
    : undefined;
  const standingMessage = airspaceBulletin ?? pressDispatch;
  if (!session || !me) return null;
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
