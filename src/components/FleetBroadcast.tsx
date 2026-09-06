import { useSessionStore } from '@/store/useSessionStore';
import FleetTicker from './FleetTicker';

export default function FleetBroadcast() {
  const { session, me } = useSessionStore();
  const alert = session?.fleetRedAlert;
  if (!session || !me || !alert || alert.revision === 0) return null;
  return <FleetTicker message={{
    id: `${session.id}:red-alert:${alert.revision}`,
    text: alert.active
      ? 'red alert from AEGIS Admiral - wolf attack imminent, all hands to battle stations'
      : 'red alert cancelled by AEGIS, stand down, stand down all battlestations. repeat, stand down, stand down all battlestations. red alert cancelled by AEGIS.',
    tone: alert.active ? 'danger' : 'normal',
    ...(alert.active ? {} : { passes: 2 }),
  }} />;
}
