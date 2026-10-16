import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { hasFreshSessionAuthority } from './sessionMutationAuthority';
import { parseAwayMissionProjectionSafetyFacts } from './awayMissionProjectionBarrier';
import type { AwayMissionProjectionMaintenanceReply } from '../../functions/src/awayMissionProjectionMaintenance';

type Step = AwayMissionProjectionMaintenanceReply['step'];
interface Context { readonly sessionId: string; readonly actorUid: string; readonly instanceId: string }
interface Attempt extends Context {
  readonly version: 1; readonly repairRunId: string; readonly sequence: number;
  readonly step: Step; readonly epoch: number | null;
}
export interface PreparationResult { readonly state: 'recorded' | 'changed'; readonly epoch: number }
export class PreparationBlockedError extends Error {
  constructor(message: string, readonly restart = false) { super(message); this.name = 'PreparationBlockedError'; }
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1_500 && !value.includes('/');
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function hasMissionPreparationAuthority(context: Context): boolean {
  try {
    const store = useSessionStore.getState();
    return hasFreshSessionAuthority() && auth().currentUser?.uid === context.actorUid &&
      store.session?.id === context.sessionId && store.session.phase !== 'closed' &&
      store.me?.uid === context.actorUid && store.me.sessionId === context.sessionId &&
      store.me.role === 'gm' && store.me.connected === true && store.gmInstance?.id === context.instanceId &&
      store.gmInstance.sessionId === context.sessionId && store.gmInstance.uid === context.actorUid;
  } catch { return false; }
}
function requireAuthority(context: Context) {
  if (!hasMissionPreparationAuthority(context)) throw new PreparationBlockedError(
    'Preparation blocked. Reconnect as the current facilitator before continuing.');
}
function parseAttempt(value: unknown, context: Context): Attempt | null {
  if (!record(value) || !exact(value, ['version', 'sessionId', 'actorUid', 'instanceId', 'repairRunId', 'sequence', 'step', 'epoch']) ||
      value.version !== 1 || value.sessionId !== context.sessionId || value.actorUid !== context.actorUid || value.instanceId !== context.instanceId ||
      !id(value.repairRunId) || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0 ||
      !['hold', 'repair', 'finalize'].includes(String(value.step)) ||
      !(value.epoch === null || Number.isSafeInteger(value.epoch) && Number(value.epoch) > 0) ||
      (value.step === 'hold' ? value.sequence !== 0 || value.epoch !== null : value.sequence === 0 || value.epoch === null)) return null;
  return value as unknown as Attempt;
}
function requireReply(value: unknown, attempt: Attempt): AwayMissionProjectionMaintenanceReply {
  const keys = ['status', 'sessionId', 'repairRunId', 'step', 'epoch', 'state', 'pointerCount', 'missionId'];
  if (!record(value) || !exact(value, keys) || !['committed', 'replayed', 'stale'].includes(String(value.status)) ||
      value.sessionId !== attempt.sessionId || value.repairRunId !== attempt.repairRunId || value.step !== attempt.step ||
      !Number.isSafeInteger(value.epoch) || Number(value.epoch) < 1 || attempt.epoch !== null && value.epoch !== attempt.epoch ||
      !Number.isSafeInteger(value.pointerCount) || Number(value.pointerCount) < 0 ||
      !(value.missionId === null || id(value.missionId)) ||
      (attempt.step === 'finalize'
        ? value.pointerCount !== 0 || value.missionId !== null ||
          !(value.state === 'ready' && value.status !== 'stale' || value.state === 'held' && value.status !== 'committed')
        : value.state !== 'held' || value.status === 'stale' ||
          (attempt.step === 'hold' ? value.pointerCount !== 0 || value.missionId !== null :
            !(value.pointerCount === 0 && value.missionId === null || Number(value.pointerCount) > 0 && id(value.missionId))))) {
    throw new PreparationBlockedError('Preparation could not be confirmed. Retry the saved request.');
  }
  return value as unknown as AwayMissionProjectionMaintenanceReply;
}

/** Storage carries retry identity only; current Auth/GM/lease and the server own every effect. */
export function createMissionPreparation(context: Context) {
  const key = `away-mission-preparation:${JSON.stringify([context.sessionId, context.actorUid, context.instanceId])}`;
  let attempt: Attempt | null = null;
  try { attempt = parseAttempt(JSON.parse(sessionStorage.getItem(key) ?? 'null'), context); } catch { /* No authority is recovered from storage. */ }
  let busy = false;
  const save = (next: Attempt) => {
    try { sessionStorage.setItem(key, JSON.stringify(next)); }
    catch { throw new PreparationBlockedError('This browser cannot preserve the retry identity. No preparation request was sent.'); }
    attempt = next;
  };
  const advance = (step: Step, epoch: number) => {
    if (!attempt || attempt.sequence === Number.MAX_SAFE_INTEGER) throw new PreparationBlockedError('Restart preparation with a new request identity.', true);
    save({ ...attempt, sequence: attempt.sequence + 1, step, epoch });
  };
  return {
    hasSavedAttempt: () => attempt !== null,
    restart: () => { requireAuthority(context); attempt = null; sessionStorage.removeItem(key); },
    async run(): Promise<PreparationResult> {
      if (busy) throw new PreparationBlockedError('Preparation is already pending.');
      requireAuthority(context); busy = true;
      try {
        if (!attempt) save({ ...context, version: 1, repairRunId: `k-privacy-${crypto.randomUUID()}`, sequence: 0, step: 'hold', epoch: null });
        while (attempt) {
          requireAuthority(context);
          const current = attempt;
          const marker = parseAwayMissionProjectionSafetyFacts(useSessionStore.getState().session?.awayMissionProjectionSafety);
          if (current.epoch !== null && marker && marker.epoch > current.epoch) {
            throw new PreparationBlockedError('Preparation was replaced by a newer session operation. Restart preparation.', true);
          }
          const payload = { sessionId: context.sessionId, instanceId: context.instanceId, repairRunId: current.repairRunId,
            requestId: `${current.repairRunId}-${current.sequence}-${current.step}`, step: current.step };
          const call = httpsCallable<typeof payload, unknown>(functions(), 'repairAwayMissionProjectionPrivacy');
          const reply = requireReply((await call(payload)).data, current);
          requireAuthority(context);
          const latest = parseAwayMissionProjectionSafetyFacts(useSessionStore.getState().session?.awayMissionProjectionSafety);
          if (latest && latest.epoch > reply.epoch) throw new PreparationBlockedError(
            'Preparation was replaced by a newer session operation. Restart preparation.', true);
          if (current.step === 'finalize') {
            if (reply.state === 'ready') return { state: 'recorded', epoch: reply.epoch };
            advance('repair', reply.epoch); return { state: 'changed', epoch: reply.epoch };
          }
          advance(current.step === 'repair' && reply.missionId === null ? 'finalize' : 'repair', reply.epoch);
        }
        throw new PreparationBlockedError('Restart preparation with a new request identity.', true);
      } catch (error) {
        if (error instanceof PreparationBlockedError) throw error;
        throw new PreparationBlockedError('Preparation is blocked or could not be confirmed. Retry the saved request after reconnecting.');
      } finally { busy = false; }
    },
  };
}
