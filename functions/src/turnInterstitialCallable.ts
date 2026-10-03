import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { commandError } from './commandErrors';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { buildPrivacySafeEventRecord } from './eventRedaction';
import { clearHeldTurnAdvancePhase } from './turnInterstitial';
import { turnPhaseState, turnStateForPhaseContext, updateTurnStateForPhase, type TurnPhase, type TurnState } from './turnZero';

type Result = Readonly<{ status: 'cleared'; cycle: number; pausedAt: string; turnPhase: TurnPhase; turnState?: TurnState }>;
interface Dependencies {
  db: Pick<Firestore, 'doc' | 'runTransaction'>;
  requireUid: (auth: {uid: string} | undefined) => string;
  isActivePlayer: (player: DocumentSnapshot) => boolean;
  requireActiveGameplayPhase: (session: DocumentSnapshot) => void;
  serverTimestamp: () => unknown;
  now?: () => number;
}
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function identifier(v: unknown): v is string { return typeof v === 'string' && /^[\w-]{1,128}$/.test(v); }
function resultState(v: unknown, cycle: number, pausedAt: string): Result | undefined {
  if (!record(v) || v.status !== 'cleared' || v.cycle !== cycle || v.pausedAt !== pausedAt) return undefined;
  const phase = turnPhaseState(v.turnPhase);
  if (!phase || phase.turn !== cycle || phase.timerPause) return undefined;
  return v as unknown as Result;
}

/** Current member authority precedes receipt reads; one durable hold owns one clear. */
export function createTurnInterstitialHandler(deps: Dependencies) {
  return async (request: {auth?: {uid: string}; data?: unknown}): Promise<Result> => {
    const uid = deps.requireUid(request.auth);
    const data = request.data;
    if (!record(data) || Object.keys(data).some(k => !['sessionId','requestId','expectedCycle','expectedPausedAt'].includes(k)) ||
        !identifier(data.sessionId) || !identifier(data.requestId) || !Number.isSafeInteger(data.expectedCycle) ||
        (data.expectedCycle as number) < 1 || typeof data.expectedPausedAt !== 'string' ||
        !Number.isFinite(Date.parse(data.expectedPausedAt)) || new Date(data.expectedPausedAt).toISOString() !== data.expectedPausedAt) {
      throw new HttpsError('invalid-argument', 'A current cycle briefing and clear request are required.');
    }
    const sessionId = data.sessionId, requestId = data.requestId;
    const cycle = data.expectedCycle as number, pausedAt = data.expectedPausedAt;
    const sessionRef = deps.db.doc(`sessions/${sessionId}`);
    const playerRef = deps.db.doc(`sessions/${sessionId}/players/${uid}`);
    const holdRef = deps.db.doc(`sessions/${sessionId}/turnInterstitials/${cycle}`);
    const receiptRef = deps.db.doc(`sessions/${sessionId}/commandReceipts/${requestId}`);
    const fingerprint: CommandFingerprint = {action:'clear-turn-interstitial',sessionId,requestId,
      actorUid:uid,instanceId:null,expectedRevision:cycle,payload:{pausedAt}};
    return deps.db.runTransaction(async tx => {
      const [session,player,hold,receipt] = await Promise.all([tx.get(sessionRef),tx.get(playerRef),tx.get(holdRef),tx.get(receiptRef)]);
      if (!session.exists) throw new HttpsError('not-found','No such session.');
      if (!deps.isActivePlayer(player)) throw new HttpsError('permission-denied','Reconnect before clearing the cycle briefing.');
      deps.requireActiveGameplayPhase(session);
      if (session.get('currentTurn') !== cycle) throw commandError('failed-precondition','The cycle briefing changed.','stale-revision');
      const phase = turnPhaseState(session.get('turnPhase'));
      if (!phase || phase.turn !== cycle || !hold.exists || hold.get('cycle') !== cycle || hold.get('pausedAt') !== pausedAt)
        throw commandError('failed-precondition','The cycle briefing changed.','stale-revision');
      const storedEntity = session.get('turnState');
      const maxTurn = session.get('turnLimit') ?? 6;
      const currentEntity = turnStateForPhaseContext(storedEntity,phase,cycle,maxTurn);
      // Replays report the current clock as well as retaining the original private receipt.
      // A later extension or hold cannot be overwritten by an old clear response.
      const currentResult = (original: Result): Result => ({status:original.status,cycle:original.cycle,pausedAt:original.pausedAt,turnPhase:phase,
        ...(currentEntity ? {turnState:currentEntity} : {})});
      if (receipt.exists) {
        const disposition = commandReceiptDisposition(receipt.get('fingerprint'),fingerprint);
        if (disposition.kind === 'foreign-actor') throw new HttpsError('permission-denied','This clear request belongs to another console.');
        if (disposition.kind !== 'replay') throw commandError('failed-precondition','This clear request belongs to another action.','conflict');
        const original = resultState(receipt.get('result'),cycle,pausedAt);
        if (!original) throw commandError('failed-precondition','The briefing clear receipt is unavailable.','conflict');
        return currentResult(original);
      }
      if (hold.get('status') === 'cleared') {
        const original = resultState(hold.get('result'),cycle,pausedAt);
        if (!original) throw commandError('failed-precondition','The briefing clear receipt is unavailable.','conflict');
        return currentResult(original);
      }
      if (hold.get('status') !== 'held') throw commandError('failed-precondition','The cycle briefing changed.','stale-revision');
      const now = deps.now?.() ?? Date.now();
      const resumed = clearHeldTurnAdvancePhase(phase,cycle,pausedAt,now);
      if (!resumed) throw commandError('failed-precondition','Clear the current briefing before resuming the clock.','stale-revision');
      const entity = currentEntity ? updateTurnStateForPhase(resumed,currentEntity) : undefined;
      const result: Result = {status:'cleared',cycle,pausedAt,turnPhase:resumed,...(entity ? {turnState:entity} : {})};
      tx.update(sessionRef,{turnPhase:resumed,...(entity ? {turnState:entity} : {}),updatedAt:deps.serverTimestamp()});
      tx.update(holdRef,{status:'cleared',result,clearedAt:new Date(now).toISOString()});
      tx.set(receiptRef,{fingerprint,result,createdAt:deps.serverTimestamp()});
      tx.set(deps.db.doc(`sessions/${sessionId}/events/turn-interstitial-cleared-${cycle}`),buildPrivacySafeEventRecord({
        type:'timer-pause',payload:{action:'resumed',reason:'turn-interstitial',turn:cycle,window:'restricted'},createdAt:deps.serverTimestamp()}));
      return result;
    });
  };
}
