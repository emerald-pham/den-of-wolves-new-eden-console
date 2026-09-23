import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import { shuttleMovementConflictError } from './shuttleMovementConflict';

function requestId(): string {
  return window.crypto.randomUUID();
}

async function callMovement<TPayload, TResult = unknown>(
  callableName: string,
  payload: TPayload,
  sessionId: string,
  shuttleId: string,
): Promise<{ readonly data: TResult }> {
  try {
    return await httpsCallable<TPayload, TResult>(functions(), callableName)(payload);
  } catch (cause) {
    const conflict = shuttleMovementConflictError(cause, sessionId, shuttleId);
    if (conflict) throw conflict;
    throw cause;
  }
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
  await callMovement('requestShuttleDeparture', payload, session.id, shuttleId);
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
  await callMovement('beginShuttleTransit', payload, session.id, shuttleId);
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
  await callMovement('retargetShuttleTransit', payload, session.id, shuttleId);
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
  const response = await callMovement<typeof payload, unknown>(
    'completeShuttleArrival', payload, session.id, shuttleId,
  );
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
