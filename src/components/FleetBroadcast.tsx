import { DEFAULT_FLEET_ALERT_MESSAGE } from '@/lib/fleetAlertMessage';
import { normalizePressDispatch } from '@/lib/pressDispatchState';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import FleetTicker from './FleetTicker';

type BulletinSource = 'AEGIS' | 'SNN';

function sourceBulletin(source: BulletinSource, text: string): string {
  const prefix = `${source} // `;
  return text.startsWith(prefix) ? text : `${prefix}${text}`;
}

export default function FleetBroadcast() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const alert = session?.fleetRedAlert;
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
  const airspaceDirective = session && phase?.airspace.tickerActive
    ? {
        id: `${session.id}:airspace:${phase.turn}:${phase.airspace.state}`,
        text: sourceBulletin('AEGIS', phase.airspace.state === 'restricted'
          ? 'AIRSPACE RESTRICTED'
          : 'AIRSPACE OPEN'),
        tone: 'normal' as const,
        gap: 'airspace' as const,
      }
    : undefined;
  const standingMessage = airspaceDirective ?? pressDispatch;
  if (!session || !me) return null;
  if (!alert || alert.revision === 0) {
    return <FleetTicker {...(standingMessage ? { message: standingMessage } : {})}
      {...(phase === undefined ? {} : { turnPhase: phase })} />;
  }
  return <FleetTicker message={{
    id: `${session.id}:red-alert:${alert.revision}`,
    text: sourceBulletin('AEGIS', alert.active
      ? (alert.text ?? DEFAULT_FLEET_ALERT_MESSAGE)
      : 'RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.'),
    tone: alert.active ? 'danger' : 'normal',
    ...(alert.active
      ? (dispatchText ? { pressText: dispatchText } : {})
      : { passes: 2 }),
  }} {...(standingMessage ? { fallback: standingMessage } : {})}
    {...(phase === undefined ? {} : { turnPhase: phase })} />;
}
