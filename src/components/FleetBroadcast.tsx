import { useSessionStore } from '@/store/useSessionStore';
import FleetTicker from './FleetTicker';

const PRESS_STANDBY = {
  id: 'press-standby',
  text: 'SYSTEM NEWS NETWORK // NO ACTIVE BULLETINS',
  tone: 'normal' as const,
};

export default function FleetBroadcast() {
  const { session, me } = useSessionStore();
  const alert = session?.fleetRedAlert;
  const standby = session
    ? { ...PRESS_STANDBY, id: `${session.id}:${PRESS_STANDBY.id}` }
    : PRESS_STANDBY;
  if (!session || !me || !alert || alert.revision === 0) {
    return <FleetTicker message={standby} />;
  }
  return <FleetTicker message={{
    id: `${session.id}:red-alert:${alert.revision}`,
    text: alert.active
      ? 'RED ALERT FROM AEGIS ADMIRAL - WOLF ATTACK IMMINENT, ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED'
      : 'RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.',
    tone: alert.active ? 'danger' : 'normal',
    ...(alert.active ? {} : { passes: 2 }),
  }} fallback={standby} />;
}
