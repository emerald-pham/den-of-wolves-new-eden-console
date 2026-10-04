import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import type { ApproachingVesselResponseInput } from '@/types/crisis';

export async function recordApproachingVesselResponse(
  response: ApproachingVesselResponseInput,
  expectedResponseRevision: number,
): Promise<void> {
  const { session, gmCrisisState, gmInstance } = useSessionStore.getState();
  if (!session || !gmCrisisState || !gmInstance || gmInstance.sessionId !== session.id ||
      gmCrisisState.crisisKind !== 'approaching-vessel' || gmCrisisState.state !== 'debated') {
    throw new Error('Record the response only for the current debated Approaching Vessel crisis.');
  }
  requireFreshSessionAuthority();
  await httpsCallable(functions(), 'recordApproachingVesselResponse')({
    sessionId: session.id, instanceId: gmInstance.id, requestId: window.crypto.randomUUID(),
    expectedCrisisRevision: gmCrisisState.revision, expectedResponseRevision, crisisId: gmCrisisState.crisisId,
    ...response,
  });
}
