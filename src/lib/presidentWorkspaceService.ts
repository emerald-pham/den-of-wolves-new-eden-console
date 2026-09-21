import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import type { PresidentActionKind } from '@/types/game';

export async function recordPresidentAction(kind: PresidentActionKind, text: string): Promise<void> {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before recording a President action.');
  requireFreshSessionAuthority();
  await httpsCallable(functions(), 'recordPresidentActionCommand')({
    sessionId: session.id,
    requestId: window.crypto.randomUUID(),
    kind,
    text: text.trim(),
    expectedRevision: session.presidentWorkspace?.revision ?? 0,
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  });
}
