import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';

export async function setFleetRedAlert(active: boolean): Promise<void> {
  const { session, connection, gmInstance } = useSessionStore.getState();
  if (!session || connection !== 'live') throw new Error('Reconnect before commanding a fleet red alert.');
  await httpsCallable(functions(), 'setFleetRedAlert')({
    sessionId: session.id, active, expectedRevision: session.fleetRedAlert?.revision ?? 0,
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  });
}
