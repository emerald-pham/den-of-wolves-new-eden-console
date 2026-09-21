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
): Promise<void> {
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
  };
  await httpsCallable<typeof payload, unknown>(functions(), 'rechargeHostConsoleFromShuttle')(payload);
}
