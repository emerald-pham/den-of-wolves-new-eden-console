import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

function commandId(): string {
  return window.crypto.randomUUID();
}

export async function drawVipCard(
  expectedRevision: number,
  consoleRoleId?: string,
): Promise<unknown> {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before drawing a VIP card.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    shipId: 'dione' as const,
    requestId: commandId(),
    expectedRevision,
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
    ...(consoleRoleId ? { consoleRoleId } : {}),
  };
  return (await httpsCallable<typeof payload, unknown>(functions(), 'drawVipCard')(payload)).data;
}

export async function transferVipCard(
  cardId: string,
  targetUid: string,
  expectedRevision: number,
): Promise<unknown> {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before transferring a VIP card.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    requestId: commandId(),
    cardId,
    targetUid,
    expectedRevision,
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  };
  return (await httpsCallable<typeof payload, unknown>(functions(), 'transferVipCard')(payload)).data;
}
