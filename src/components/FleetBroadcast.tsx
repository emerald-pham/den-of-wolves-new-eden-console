import { DEFAULT_FLEET_ALERT_MESSAGE } from '@/lib/fleetAlertMessage';
import { normalizePressDispatch } from '@/lib/pressDispatchState';
import { useSessionStore } from '@/store/useSessionStore';
import FleetTicker from './FleetTicker';

export default function FleetBroadcast() {
  const { session, me } = useSessionStore();
  const alert = session?.fleetRedAlert;
  const dispatchState = normalizePressDispatch(session?.pressDispatch);
  const dispatchText = dispatchState.dispatches.map((dispatch) => dispatch.text).join(' // ');
  const pressDispatch = session && dispatchText
    ? {
        id: `${session.id}:press-dispatch:${dispatchState.revision}`,
        text: dispatchText,
        tone: 'normal' as const,
        gap: 'long' as const,
      }
    : undefined;
  if (!session || !me) return null;
  if (!alert || alert.revision === 0) {
    return <FleetTicker {...(pressDispatch ? { message: pressDispatch } : {})} />;
  }
  return <FleetTicker message={{
    id: `${session.id}:red-alert:${alert.revision}`,
    text: alert.active
      ? (alert.text ?? DEFAULT_FLEET_ALERT_MESSAGE)
      : 'RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.',
    tone: alert.active ? 'danger' : 'normal',
    ...(alert.active
      ? (dispatchText ? { pressText: dispatchText } : {})
      : { passes: 2 }),
  }} {...(pressDispatch ? { fallback: pressDispatch } : {})} />;
}
