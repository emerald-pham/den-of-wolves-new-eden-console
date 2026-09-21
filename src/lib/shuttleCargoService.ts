import { httpsCallable } from 'firebase/functions';
import type { ResourceId } from '@/data/resources';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

export async function transferShuttleCargo(
  shuttleId: string,
  resourceId: ResourceId,
  direction: 'load' | 'unload',
  amount: number,
  expectedControlRevision: number,
): Promise<void> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before transferring shuttle cargo.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    requestId: window.crypto.randomUUID(),
    shuttleId,
    resourceId,
    direction,
    amount,
    expectedControlRevision,
  };
  await httpsCallable<typeof payload, unknown>(functions(), 'transferShuttleCargoCommand')(payload);
}
