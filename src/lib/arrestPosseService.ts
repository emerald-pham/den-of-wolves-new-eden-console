import { httpsCallable } from 'firebase/functions';
import type { ArrestPosseOutcome } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { captureSessionAuthority, isCurrentSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolve an attendance count from the current GM's own physical attestation. */
export async function resolveArrestPosse(
  targetUid: string,
  presentPlayerUids: readonly string[],
  expectedCycle: number,
  expectedRevision: number,
): Promise<ArrestPosseOutcome> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || store.me.role !== 'gm' || !store.gmInstance ||
      store.me.sessionId !== store.session.id || store.gmInstance.sessionId !== store.session.id ||
      store.gmInstance.uid !== store.me.uid || store.session.currentTurn !== expectedCycle) {
    throw new Error('The current facilitator session is required to resolve this posse.');
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) || !Number.isSafeInteger(expectedCycle) || expectedCycle < 1 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      presentPlayerUids.length > 200 || presentPlayerUids.some((uid) => !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) ||
      new Set(presentPlayerUids).size !== presentPlayerUids.length || presentPlayerUids.includes(targetUid)) {
    throw new Error('Choose a current target and a unique set of present players.');
  }
  requireFreshSessionAuthority('Reconnect before resolving posse attendance.');
  const sessionId = store.session.id;
  const uid = store.me.uid;
  const checkpoint = captureSessionAuthority(sessionId, uid);
  if (!checkpoint) throw new Error('Reconnect before resolving posse attendance.');
  const requestId = window.crypto.randomUUID();
  const payload = {
    sessionId,
    instanceId: store.gmInstance.id,
    requestId,
    expectedCycle,
    expectedRevision,
    targetUid,
    presentPlayerUids: [...presentPlayerUids].sort(),
  };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'resolveArrestPosse');
  const result = (await call(payload)).data;
  requireFreshSessionAuthority();
  const current = useSessionStore.getState();
  if (!isCurrentSessionAuthority(checkpoint) || current.session?.currentTurn !== expectedCycle ||
      current.gmInstance?.id !== payload.instanceId) {
    throw new Error('The facilitator authority changed before the posse result arrived.');
  }
  if (!isRecord(result) || Object.keys(result).some((key) => ![
      'status', 'type', 'sessionId', 'requestId', 'turn', 'revision', 'targetUid',
      'requiredPlayers', 'presentPlayers', 'outcome', 'deadlineCycle',
    ].includes(key)) || result.status !== 'committed' || result.type !== 'arrest-posse-outcome' ||
      result.sessionId !== sessionId || result.requestId !== requestId || result.turn !== expectedCycle ||
      !Number.isSafeInteger(result.revision) || result.revision !== expectedRevision + 1 ||
      result.targetUid !== targetUid || !Number.isSafeInteger(result.requiredPlayers) ||
      (result.requiredPlayers as number) < 0 || result.presentPlayers !== presentPlayerUids.length ||
      (result.outcome !== 'arrested' && result.outcome !== 'not-arrested') ||
      (result.outcome === 'arrested'
        ? result.deadlineCycle !== expectedCycle + 1
        : result.deadlineCycle !== undefined)) {
    throw new Error('The server returned an invalid posse result.');
  }
  return result as unknown as ArrestPosseOutcome;
}
