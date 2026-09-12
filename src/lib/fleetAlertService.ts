import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

function commandId(): string {
  return window.crypto.randomUUID();
}

export async function setFleetRedAlert(active: boolean, text?: string): Promise<void> {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before commanding a fleet red alert.');
  requireFreshSessionAuthority();
  const requestId = commandId();
  await httpsCallable(functions(), 'setFleetRedAlert')({
    ...(active && text !== undefined ? { text: text.trim().toUpperCase() } : {}),
    sessionId: session.id, active, expectedRevision: session.fleetRedAlert?.revision ?? 0, requestId,
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  });
}
