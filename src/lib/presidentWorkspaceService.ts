import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import type { PoliticalCapitalAction, PresidentActionKind } from '@/types/game';

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

export async function updatePoliticalCapital(action: PoliticalCapitalAction): Promise<void> {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before updating political capital.');
  requireFreshSessionAuthority();
  const crisis = session.resolvedCrisisOutcome;
  if (!crisis) throw new Error('A resolved crisis outcome is required.');
  await httpsCallable(functions(), 'updatePoliticalCapital')({
    sessionId: session.id,
    requestId: window.crypto.randomUUID(),
    action,
    crisisId: crisis.crisisId,
    crisisRevision: crisis.revision,
    expectedRevision: session.politicalCapital?.revision ?? 0,
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  });
}
