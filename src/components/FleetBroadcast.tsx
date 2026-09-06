import { DEFAULT_FLEET_ALERT_MESSAGE } from '@/lib/fleetAlertMessage';
import { useSessionStore } from '@/store/useSessionStore';
import FleetTicker from './FleetTicker';

export default function FleetBroadcast() {
  const { session, me } = useSessionStore();
  const alert = session?.fleetRedAlert;
  const dispatch = session?.pressDispatch;
  const pressDispatch = session && dispatch
    ? {
        id: `${session.id}:press-dispatch:${dispatch.revision}`,
        text: dispatch.text,
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
    ...(alert.active ? { pressText: dispatch?.text } : { passes: 2 }),
  }} {...(pressDispatch ? { fallback: pressDispatch } : {})} />;
}
