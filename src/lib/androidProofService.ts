import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

function commandId(): string {
  return window.crypto.randomUUID();
}

export interface AndroidProofReply {
  readonly disclosed: boolean;
}

/** Voluntarily publish the current Android holder's own non-Wolf proof. */
export async function revealAndroidProof(): Promise<AndroidProofReply> {
  const { session, privateLoyalty } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before disclosing Android proof.');
  if (privateLoyalty?.kind !== 'android') {
    throw new Error('Only the Android holder can disclose Android proof.');
  }
  requireFreshSessionAuthority();
  const call = httpsCallable<{ sessionId: string; requestId: string }, AndroidProofReply>(
    functions(), 'revealAndroidProof',
  );
  const response = await call({ sessionId: session.id, requestId: commandId() });
  return response.data;
}
