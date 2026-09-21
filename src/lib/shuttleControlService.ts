import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

function requestId(): string {
  return window.crypto.randomUUID();
}

export async function transferShuttleControl(
  shuttleId: string,
  action: 'handoff' | 'reclaim',
  expectedRevision: number,
  targetUid?: string,
): Promise<void> {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before transferring shuttle control.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    requestId: requestId(),
    shuttleId,
    action,
    expectedRevision,
    ...(targetUid ? { targetUid } : {}),
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  };
  await httpsCallable<typeof payload, unknown>(functions(), 'transferShuttleControlCommand')(payload);
}
