import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

export type WolfAttackAftermathChoice =
  | Readonly<{ action: 'doctor'; selectedShipIds: readonly string[] }>
  | Readonly<{ action: 'warrior-salvage' }>
  | Readonly<{ action: 'collect-scrap'; shuttleId: 'macaw' | 'boa'; targetShipId: string }>;

export interface WolfAttackAftermathReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly attackId: string;
  readonly requestId: string;
  readonly action: WolfAttackAftermathChoice['action'];
  readonly mitigated?: readonly Readonly<{
    shipId: string;
    casualtiesBefore: number;
    casualtiesAfter: number;
    casualtiesPrevented: number;
    foodSpent: number;
    waterSpent: number;
  }>[];
  readonly materialsGained?: number;
  readonly damageDice?: readonly number[];
  readonly targetShipId?: string;
  readonly shuttleId?: 'macaw' | 'boa';
  readonly scrapGained?: number;
}

export async function commitWolfAttackAftermath(
  attackId: string,
  choice: WolfAttackAftermathChoice,
  requestId: string = window.crypto.randomUUID(),
): Promise<WolfAttackAftermathReply> {
  const sessionId = useSessionStore.getState().session?.id;
  if (!sessionId) throw new Error('Reconnect before recording attack aftermath.');
  requireFreshSessionAuthority();
  const reply = await httpsCallable<Record<string, unknown>, WolfAttackAftermathReply>(
    functions(), 'resolveWolfAttackAftermath',
  )({ sessionId, attackId, requestId, ...choice });
  if (reply.data.status !== 'committed' && reply.data.status !== 'replayed' ||
      reply.data.sessionId !== sessionId || reply.data.attackId !== attackId || reply.data.requestId !== requestId ||
      reply.data.action !== choice.action) {
    throw new Error('The aftermath result does not match this session, attack, and request.');
  }
  return reply.data;
}
