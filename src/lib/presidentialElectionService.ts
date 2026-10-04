import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { PresidentialElectionPolicyInput } from '@/types/presidentialElection';

function sessionAuthority(): {
  readonly sessionId: string;
  readonly revision: number;
  readonly instanceId?: string;
} {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before using the election workspace.');
  requireFreshSessionAuthority();
  return { sessionId: session.id, revision: session.presidentialElection?.revision ?? 0,
    ...(gmInstance ? { instanceId: gmInstance.id } : {}) };
}

export async function configurePresidentialElection(policy: PresidentialElectionPolicyInput): Promise<void> {
  const authority = sessionAuthority();
  if (!authority.instanceId) throw new Error('Claim the facilitator console before fixing election procedure.');
  await httpsCallable(functions(), 'configurePresidentialElection')({
    sessionId: authority.sessionId, instanceId: authority.instanceId, requestId: window.crypto.randomUUID(),
    expectedRevision: authority.revision,
    policy: { ...policy, eligibleVoterUids: [...policy.eligibleVoterUids] },
  });
}

export async function castPresidentialBallot(ballot: {
  readonly presidentCandidateId: string;
  readonly vicePresidentCandidateId?: string;
}): Promise<void> {
  const authority = sessionAuthority();
  await httpsCallable(functions(), 'castPresidentialBallot')({
    sessionId: authority.sessionId, requestId: window.crypto.randomUUID(), expectedRevision: authority.revision,
    presidentCandidateId: ballot.presidentCandidateId,
    ...(ballot.vicePresidentCandidateId ? { vicePresidentCandidateId: ballot.vicePresidentCandidateId } : {}),
  });
}

export async function resolvePresidentialElection(decision?: {
  readonly presidentCandidateId?: string;
  readonly vicePresidentCandidateId?: string;
}): Promise<void> {
  const authority = sessionAuthority();
  if (!authority.instanceId) throw new Error('Claim the facilitator console before resolving an election.');
  await httpsCallable(functions(), 'resolvePresidentialElection')({
    sessionId: authority.sessionId, instanceId: authority.instanceId, requestId: window.crypto.randomUUID(),
    expectedRevision: authority.revision,
    ...(decision?.presidentCandidateId ? { presidentCandidateId: decision.presidentCandidateId } : {}),
    ...(decision?.vicePresidentCandidateId ? { vicePresidentCandidateId: decision.vicePresidentCandidateId } : {}),
  });
}
