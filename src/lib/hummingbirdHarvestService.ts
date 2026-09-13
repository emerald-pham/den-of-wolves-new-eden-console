import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

function commandId(): string {
  return window.crypto.randomUUID();
}

function sessionId(): string {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Reconnect before operating Hummingbird harvesting.');
  requireFreshSessionAuthority();
  return session.id;
}

export async function rollHummingbirdHarvest(
  expectedRevision: number,
  requestId = commandId(),
): Promise<unknown> {
  const payload = { sessionId: sessionId(), expectedRevision, requestId };
  return (await httpsCallable<typeof payload, unknown>(functions(), 'rollHummingbirdHarvest')(payload)).data;
}

export async function allocateHummingbirdHarvest(
  expectedRevision: number,
  foodDieIndex: 0 | 1,
  requestId = commandId(),
): Promise<unknown> {
  const payload = { sessionId: sessionId(), expectedRevision, foodDieIndex, requestId };
  return (await httpsCallable<typeof payload, unknown>(functions(), 'allocateHummingbirdHarvest')(payload)).data;
}
