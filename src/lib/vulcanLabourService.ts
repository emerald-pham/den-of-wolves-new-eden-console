import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export async function runVulcanAdditionalLabour(
  sourceConsoleId: string,
  targetShipId: string,
  targetConsoleId: string,
  expectedRevision: number,
  targetExpectedRevision: number,
  productionScrap?: boolean,
  requestId = window.crypto.randomUUID(),
): Promise<unknown> {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before using Additional Labour.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id, requestId, sourceConsoleId, targetShipId, targetConsoleId,
    expectedRevision, targetExpectedRevision,
    ...(productionScrap === undefined ? {} : { productionScrap }),
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  };
  return (await httpsCallable<typeof payload, unknown>(functions(), 'runVulcanAdditionalLabour')(payload)).data;
}
