import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

function requestId(): string {
  return window.crypto.randomUUID();
}

export async function requestShuttleDeparture(
  shuttleId: string,
  destinationShipId: string,
  expectedControlRevision: number,
  expectedCycle: number,
): Promise<void> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before requesting shuttle departure.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    requestId: requestId(),
    shuttleId,
    destinationShipId,
    expectedControlRevision,
    expectedCycle,
  };
  await httpsCallable<typeof payload, unknown>(functions(), 'requestShuttleDeparture')(payload);
}

export async function beginShuttleTransit(
  shuttleId: string,
  expectedDepartureRequestId: string,
  expectedControlRevision: number,
  expectedCycle: number,
): Promise<void> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before beginning shuttle transit.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    requestId: requestId(),
    shuttleId,
    expectedDepartureRequestId,
    expectedControlRevision,
    expectedCycle,
  };
  await httpsCallable<typeof payload, unknown>(functions(), 'beginShuttleTransit')(payload);
}
