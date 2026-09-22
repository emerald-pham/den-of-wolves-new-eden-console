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

export async function retargetShuttleTransit(
  shuttleId: string,
  transitRequestId: string,
  destinationShipId: string,
  expectedControlRevision: number,
  expectedCycle: number,
): Promise<void> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before retargeting shuttle transit.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    requestId: requestId(),
    shuttleId,
    transitRequestId,
    destinationShipId,
    expectedControlRevision,
    expectedCycle,
  };
  await httpsCallable<typeof payload, unknown>(functions(), 'retargetShuttleTransit')(payload);
}

export async function completeShuttleArrival(
  shuttleId: string,
  transitRequestId: string,
  expectedControlRevision: number,
): Promise<Readonly<{ hostShipId: string; arrivedAt: string }>> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before completing shuttle arrival.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id,
    shuttleId,
    transitRequestId,
    expectedControlRevision,
  };
  const response = await httpsCallable<typeof payload, unknown>(functions(), 'completeShuttleArrival')(payload);
  const result = response.data;
  if (typeof result !== 'object' || result === null || Array.isArray(result) ||
      typeof (result as Record<string, unknown>).hostShipId !== 'string' ||
      typeof (result as Record<string, unknown>).arrivedAt !== 'string') {
    throw new Error('The server did not confirm shuttle arrival. Reconnect and refresh the shuttle state.');
  }
  return {
    hostShipId: (result as Record<string, unknown>).hostShipId as string,
    arrivedAt: (result as Record<string, unknown>).arrivedAt as string,
  };
}
