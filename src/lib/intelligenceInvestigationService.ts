import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { IntelligenceInvestigation } from '@/types/game';

function commandId(): string {
  return window.crypto.randomUUID();
}

/** Ask the server for one private, server-randomized Intelligence Agent report. */
export async function investigatePlayer(
  targetUid: string,
  requestId = commandId(),
): Promise<IntelligenceInvestigation & { readonly status: 'committed' }> {
  const { session, me, privateLoyalty } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before investigating a player.');
  if (session.phase !== 'active' || !Number.isSafeInteger(session.currentTurn) ||
      (session.currentTurn as number) < 1) {
    throw new Error('Investigations are available only during active cycles.');
  }
  if (privateLoyalty?.kind !== 'intelligence-agent') {
    throw new Error('Only the Intelligence Agent can investigate a player.');
  }
  if (!targetUid || targetUid === me.uid) throw new Error('Choose another player to investigate.');
  requireFreshSessionAuthority();
  const call = httpsCallable<{
    sessionId: string; requestId: string; expectedCycle: number; targetUid: string;
  }, IntelligenceInvestigation & { readonly status: 'committed' }>(
    functions(), 'investigateAsIntelligenceAgent',
  );
  const response = await call({
    sessionId: session.id, requestId,
    expectedCycle: session.currentTurn as number, targetUid,
  });
  return response.data;
}
