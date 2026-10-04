import { httpsCallable } from 'firebase/functions';
import type { ArrestCaseDispositionResult, ArrestPrisonerDisposition } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

export interface ResolveArrestCaseDispositionInput {
  readonly targetUid: string;
  readonly expectedCycle: number;
  readonly expectedRevision: number;
  readonly expectedSetupRevision: number;
  readonly disposition: ArrestPrisonerDisposition;
  readonly ruling?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Submit the facilitator's private prisoner ruling against the current server snapshot. */
export async function resolveArrestCaseDisposition(
  input: ResolveArrestCaseDispositionInput,
): Promise<ArrestCaseDispositionResult> {
  const store = useSessionStore.getState();
  const { session, me, gmInstance } = store;
  if (!session || !me || me.role !== 'gm' || !gmInstance || me.sessionId !== session.id ||
      gmInstance.sessionId !== session.id || gmInstance.uid !== me.uid ||
      session.currentTurn !== input.expectedCycle || session.phase !== 'active') {
    throw new Error('The current facilitator session is required to rule on this prisoner case.');
  }
  const setupRevision = Number.isSafeInteger(session.setupRevision) && (session.setupRevision ?? 0) >= 0
    ? session.setupRevision ?? 0 : 0;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.targetUid) || input.targetUid === me.uid ||
      !Number.isSafeInteger(input.expectedCycle) || input.expectedCycle < 1 ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
      !Number.isSafeInteger(input.expectedSetupRevision) || input.expectedSetupRevision !== setupRevision ||
      !['released', 'executed', 'facilitator-resolution'].includes(input.disposition) ||
      (input.ruling !== undefined && (input.ruling.trim().length === 0 || input.ruling.trim().length > 240)) ||
      input.disposition === 'facilitator-resolution' && input.ruling === undefined ||
      input.disposition !== 'facilitator-resolution' && input.ruling !== undefined) {
    throw new Error('Refresh the facilitator session and prisoner case before recording a ruling.');
  }
  requireFreshSessionAuthority('Reconnect before ruling on the prisoner case.');
  const sessionId = session.id;
  const uid = me.uid;
  const instanceId = gmInstance.id;
  const requestId = window.crypto.randomUUID();
  const payload = {
    sessionId, instanceId, requestId, targetUid: input.targetUid,
    expectedCycle: input.expectedCycle, expectedRevision: input.expectedRevision,
    expectedSetupRevision: input.expectedSetupRevision, disposition: input.disposition,
    ...(input.ruling === undefined ? {} : { ruling: input.ruling.trim() }),
  };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'resolveArrestCaseDisposition');
  const reply = (await call(payload)).data;
  requireFreshSessionAuthority('Reconnect before accepting the prisoner ruling.');
  const current = useSessionStore.getState();
  const expectedSetupRevisionAfter = input.expectedSetupRevision + (input.disposition === 'executed' ? 1 : 0);
  const observedSetupRevision = current.session?.setupRevision ?? 0;
  if (current.session?.id !== sessionId || current.session.currentTurn !== input.expectedCycle ||
      current.session.phase !== 'active' || current.me?.uid !== uid || current.me.role !== 'gm' ||
      current.gmInstance?.id !== instanceId || current.gmInstance.uid !== uid ||
      (observedSetupRevision !== input.expectedSetupRevision && observedSetupRevision !== expectedSetupRevisionAfter)) {
    throw new Error('The facilitator authority changed before the prisoner ruling arrived.');
  }
  if (!isRecord(reply) || Object.keys(reply).some((key) => ![
      'status', 'type', 'sessionId', 'requestId', 'targetUid', 'turn', 'revision', 'deadlineCycle',
      'deadlineMet', 'disposition', 'setupRevision', 'replacementEligibilityRevision', 'ruling',
    ].includes(key)) || reply.status !== 'committed' || reply.type !== 'arrest-case-disposition' ||
      reply.sessionId !== sessionId || reply.requestId !== requestId || reply.targetUid !== input.targetUid ||
      reply.turn !== input.expectedCycle || !Number.isSafeInteger(reply.revision) ||
      (reply.revision as number) !== input.expectedRevision + 1 ||
      !Number.isSafeInteger(reply.deadlineCycle) || (reply.deadlineCycle as number) < 2 ||
      typeof reply.deadlineMet !== 'boolean' || reply.disposition !== input.disposition ||
      reply.setupRevision !== expectedSetupRevisionAfter ||
      (input.disposition === 'executed'
        ? !Number.isSafeInteger(reply.replacementEligibilityRevision) ||
          (reply.replacementEligibilityRevision as number) < 1
        : reply.replacementEligibilityRevision !== undefined) ||
      (input.ruling === undefined ? reply.ruling !== undefined : reply.ruling !== input.ruling.trim())) {
    throw new Error('The server returned an invalid prisoner ruling.');
  }
  if (observedSetupRevision !== expectedSetupRevisionAfter && current.session) {
    useSessionStore.getState().setSession({ ...current.session, setupRevision: expectedSetupRevisionAfter });
  }
  return reply as unknown as ArrestCaseDispositionResult;
}
