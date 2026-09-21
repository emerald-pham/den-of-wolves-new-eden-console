import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import type { AdmiralDirectiveKind } from '@/types/game';

export async function publishAdmiralDirective(
  kind: AdmiralDirectiveKind,
  text: string,
): Promise<void> {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before publishing a fleet directive.');
  requireFreshSessionAuthority();
  await httpsCallable(functions(), 'publishAdmiralDirectiveCommand')({
    sessionId: session.id,
    requestId: window.crypto.randomUUID(),
    kind,
    text: text.trim(),
    expectedRevision: session.admiralDirectives?.revision ?? 0,
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  });
}
