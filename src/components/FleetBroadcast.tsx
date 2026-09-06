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
  if (!session || !me || !alert || alert.revision === 0) {
    return pressDispatch ? <FleetTicker message={pressDispatch} /> : null;
  }
  return <FleetTicker message={{
    id: `${session.id}:red-alert:${alert.revision}`,
    text: alert.active
      ? 'RED ALERT FROM AEGIS ADMIRAL - WOLF ATTACK IMMINENT, ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED'
      : 'RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.',
    tone: alert.active ? 'danger' : 'normal',
    ...(alert.active ? {} : { passes: 2 }),
  }} {...(pressDispatch ? { fallback: pressDispatch } : {})} />;
}
