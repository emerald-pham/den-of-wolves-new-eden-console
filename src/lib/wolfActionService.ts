import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

function commandId(): string {
  return window.crypto.randomUUID();
}

export interface WolfIntelligenceReply {
  readonly status: 'committed';
  readonly type: 'wolf-intelligence';
  readonly sessionId: string;
  readonly requestId: string;
  readonly cycle: number;
  readonly revision: number;
  readonly coverRoleId: string;
  readonly message: string;
  readonly suspicion: number;
}

/** Send the current Wolf holder's short message to its private handler channel. */
export async function submitWolfIntelligence(
  message: string,
  requestId = commandId(),
): Promise<WolfIntelligenceReply> {
  const { session, privateLoyalty } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before sending Wolf intelligence.');
  if (session.phase !== 'active' || !Number.isSafeInteger(session.currentTurn) ||
      (session.currentTurn as number) < 1) {
    throw new Error('Wolf intelligence is available only during an active cycle.');
  }
  if (privateLoyalty?.kind !== 'wolf-agent' && privateLoyalty?.kind !== 'wolf-cult') {
    throw new Error('Only a Wolf holder can send Wolf intelligence.');
  }
  const text = message.trim();
  if (!text || text.length > 240) throw new Error('Enter a handler message of 240 characters or fewer.');
  requireFreshSessionAuthority();
  const call = httpsCallable<{
    sessionId: string; requestId: string; expectedCycle: number; message: string;
  }, WolfIntelligenceReply>(functions(), 'submitWolfIntelligence');
  const response = await call({
    sessionId: session.id,
    requestId,
    expectedCycle: session.currentTurn as number,
    message: text,
  });
  return response.data;
}
