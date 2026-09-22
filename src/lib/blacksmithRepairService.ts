import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export async function repairConsolesFromBlacksmith(
  systemIds: readonly string[],
  expectedControlRevision: number,
  expectedRepairRevision: number,
  expectedCycle: number,
  expectedHostShipId: string,
): Promise<Readonly<{ readonly materialsRemaining: number; readonly repairRevision: number }>> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before repairing consoles with Blacksmith.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    requestId: window.crypto.randomUUID(),
    systemIds: [...systemIds],
    expectedControlRevision,
    expectedRepairRevision,
    expectedCycle,
    expectedHostShipId,
  };
  const response = await httpsCallable<typeof payload, {
    materialsRemaining: number; repairRevision: number;
  }>(functions(), 'repairConsolesFromBlacksmith')(payload);
  if (!Number.isSafeInteger(response.data?.materialsRemaining) || response.data.materialsRemaining < 0 ||
      !Number.isSafeInteger(response.data?.repairRevision) || response.data.repairRevision < 1) {
    throw new Error('The Blacksmith repair response was malformed.');
  }
  return response.data;
}
