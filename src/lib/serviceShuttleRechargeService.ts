import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

export async function rechargeHostConsoleFromShuttle(
  shuttleId: string,
  consoleId: string,
  expectedControlRevision: number,
  expectedMaintenanceRevision: number,
  expectedCycle: number,
  productionScrap?: boolean,
  productionOreAmount?: number,
): Promise<Readonly<{ immediate: boolean; message: string }>> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before recharging a host console.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    requestId: window.crypto.randomUUID(),
    shuttleId,
    consoleId,
    expectedControlRevision,
    expectedMaintenanceRevision,
    expectedCycle,
    ...(productionScrap === undefined ? {} : { productionScrap }),
    ...(productionOreAmount === undefined ? {} : { productionOreAmount }),
  };
  const response = await httpsCallable<typeof payload, { immediate: boolean; message: string }>(
    functions(), 'rechargeHostConsoleFromShuttle',
  )(payload);
  if (typeof response.data?.immediate !== 'boolean' || typeof response.data?.message !== 'string') {
    throw new Error('The service-shuttle recharge response was malformed.');
  }
  return response.data;
}
