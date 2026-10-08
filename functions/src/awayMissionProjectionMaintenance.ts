import { HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { readAwayMissionProjectionRepairAuthority, type AwayMissionLifecycleCallableDatabase } from './awayMissionLifecycleCallable';
import { parseAwayMissionProjectionSafety, awayMissionPointerWriteSafetyPatch } from './awayMissionProjectionSafety';

type Data = Record<string, unknown>;
type Step = 'hold' | 'repair' | 'finalize';
interface Request { readonly auth?: { readonly uid?: string } | null; readonly data?: unknown }
interface Command { sessionId: string; instanceId: string; requestId: string; repairRunId: string; step: Step }
export interface AwayMissionProjectionMaintenanceReply {
  readonly status: 'committed' | 'replayed' | 'stale';
  readonly sessionId: string;
  readonly repairRunId: string;
  readonly step: Step;
  readonly epoch: number;
  readonly state: 'held' | 'ready';
  readonly pointerCount: number;
  readonly missionId: string | null;
}
interface Dependencies {
  readonly db: Firestore;
  readonly requireActiveGm: (transaction: unknown, sessionId: string, actorUid: string, instanceId: string) => Promise<void>;
  readonly serverTimestamp: () => unknown;
}
const isRecord = (value: unknown): value is Data => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1_500 && !value.includes('/');
const fail = (message: string): never => { throw new HttpsError('failed-precondition', message); };
const exactKeys = (value: Data, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function createAwayMissionProjectionMaintenance(dependencies: Dependencies) {
  return async (request: Request): Promise<AwayMissionProjectionMaintenanceReply> => {
    const actorUid = request.auth?.uid;
    if (!safeId(actorUid)) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const data = request.data;
    if (!isRecord(data) || !exactKeys(data, ['sessionId', 'instanceId', 'requestId', 'repairRunId', 'step']) ||
        !safeId(data.sessionId) || !safeId(data.instanceId) || !safeId(data.requestId) || !safeId(data.repairRunId) ||
        (data.step !== 'hold' && data.step !== 'repair' && data.step !== 'finalize')) {
      throw new HttpsError('invalid-argument', 'Choose the exact facilitator privacy maintenance operation.');
    }
    const command = data as unknown as Command;
    const fingerprint = createHash('sha256').update(JSON.stringify([actorUid, command.sessionId, command.instanceId,
      command.requestId, command.repairRunId, command.step])).digest('hex');
    const root = `sessions/${command.sessionId}`;
    const runPath = `${root}/serverState/awayMissionProjectionPrivacy/repairs/${command.repairRunId}`;
    return dependencies.db.runTransaction(async transaction => {
      // Authority is current even when a protected receipt is replayed.
      await dependencies.requireActiveGm(transaction, command.sessionId, actorUid, command.instanceId);
      const sessionRef = dependencies.db.doc(root);
      const runRef = dependencies.db.doc(runPath);
      const receiptRef = dependencies.db.doc(`${runPath}/commands/${command.requestId}`);
      const [session, runSnapshot, receipt] = await Promise.all([transaction.get(sessionRef), transaction.get(runRef), transaction.get(receiptRef)]);
      if (!session.exists) fail('The session is unavailable.');
      if (receipt.exists) {
        if (receipt.get('actorUid') !== actorUid) throw new HttpsError('permission-denied', 'The maintenance receipt belongs to another actor.');
        if (receipt.get('fingerprint') !== fingerprint) fail('The maintenance request is bound to a different operation.');
        const result = requireReply(receipt.get('result'), command);
        return { ...result, status: 'replayed' };
      }
      let epoch: number;
      const marker = parseAwayMissionProjectionSafety(session.get('awayMissionProjectionSafety'));
      const reply = (state: 'held' | 'ready', pointerCount = 0, missionId: string | null = null,
        status: 'committed' | 'stale' = 'committed'): AwayMissionProjectionMaintenanceReply => ({
        status, sessionId: command.sessionId, repairRunId: command.repairRunId, step: command.step, epoch, state, pointerCount, missionId,
      });
      let result: AwayMissionProjectionMaintenanceReply;
      if (command.step === 'hold') {
        if (runSnapshot.exists) fail('This repair run already has a different hold operation.');
        const raw = session.get('awayMissionProjectionSafety');
        const priorEpoch = marker?.epoch ?? (isRecord(raw) && Number.isSafeInteger(raw.epoch) && (raw.epoch as number) > 0 ? raw.epoch as number : 0);
        if (priorEpoch === Number.MAX_SAFE_INTEGER) fail('The privacy epoch cannot be advanced safely.');
        epoch = priorEpoch + 1;
        transaction.update(sessionRef, { awayMissionProjectionSafety: {
          policyVersion: 1, epoch, state: 'held', writeRevision: marker?.writeRevision ?? 0,
        } });
        transaction.create(runRef, { policyVersion: 1, repairRunId: command.repairRunId, actorUid, epoch,
          phase: 'held', verifiedGeneration: null, createdAt: dependencies.serverTimestamp() });
        result = reply('held');
      } else {
        const run = runSnapshot.data();
        if (!runSnapshot.exists || !isRecord(run) || !exactKeys(run, ['policyVersion', 'repairRunId', 'actorUid', 'epoch', 'phase', 'verifiedGeneration', 'createdAt']) ||
            run.policyVersion !== 1 || run.repairRunId !== command.repairRunId ||
            !Number.isSafeInteger(run.epoch) || (run.epoch as number) < 1 ||
            (run.phase !== 'held' && run.phase !== 'verified' && run.phase !== 'ready') ||
            !(run.verifiedGeneration === null || Number.isSafeInteger(run.verifiedGeneration) && (run.verifiedGeneration as number) >= 0)) {
          fail('The protected repair run is unavailable or malformed.');
        }
        if (run.actorUid !== actorUid) throw new HttpsError('permission-denied', 'This repair run belongs to another facilitator.');
        if (!marker || marker.state !== 'held' || marker.epoch !== run.epoch) fail('This repair run no longer owns the held session epoch.');
        epoch = marker.epoch;
        const inventory = await verifiedInventory(dependencies.db, transaction, command.sessionId);
        const pending = inventory.find(mission => mission.pointers.some(pointer => pointer.needsSanitation));
        if (command.step === 'repair') {
          if (pending) {
            for (const pointer of pending.pointers) {
              if (!pointer.publicState) fail('A legacy mission has no protected projection authority.');
              transaction.update(dependencies.db.doc(`${root}/awayMissionHandPointers/${pointer.handId}`), { lifecyclePublicState: pointer.publicState });
            }
            transaction.update(sessionRef, awayMissionPointerWriteSafetyPatch(marker));
            transaction.update(runRef, { phase: 'held', verifiedGeneration: null });
            result = reply('held', pending.pointers.length, pending.missionId);
          } else {
            transaction.update(runRef, { phase: 'verified', verifiedGeneration: marker.writeRevision });
            result = reply('held');
          }
        } else if (pending || run.phase !== 'verified' || run.verifiedGeneration !== marker.writeRevision) {
          result = reply('held', 0, null, 'stale');
        } else {
          // The complete query/record/hand/pointer scan and session read are in
          // this transaction. Every pointer writer also writes this session,
          // so a competing mutation causes CAS retry before readiness commits.
          transaction.update(sessionRef, { 'awayMissionProjectionSafety.state': 'ready' });
          transaction.update(runRef, { phase: 'ready' });
          result = reply('ready');
        }
      }
      transaction.create(receiptRef, { policyVersion: 1, actorUid, fingerprint, result,
        createdAt: dependencies.serverTimestamp() });
      return result;
    });
  };
}

async function verifiedInventory(db: Firestore, transaction: Transaction, sessionId: string) {
  const root = `sessions/${sessionId}`;
  const [missions, pointers, hands, deck] = await Promise.all([
    transaction.get(db.collection(`${root}/serverState/awayMissions/instances`)),
    transaction.get(db.collection(`${root}/awayMissionHandPointers`)),
    transaction.get(db.collection(`${root}/awayMissionHands`)),
    transaction.get(db.doc(`${root}/serverState/missionDeck`)),
  ]);
  const inventory = await Promise.all([...missions.docs].sort((a, b) => a.id.localeCompare(b.id)).map(mission =>
    readAwayMissionProjectionRepairAuthority({ db: db as unknown as AwayMissionLifecycleCallableDatabase,
      transaction, sessionId, mission, deck })));
  const expected = inventory.flatMap(mission => mission.handIds);
  if (new Set(expected).size !== expected.length || pointers.docs.length !== expected.length || hands.docs.length !== expected.length ||
      pointers.docs.some(pointer => !expected.includes(pointer.id)) || hands.docs.some(hand => !expected.includes(hand.id))) {
    fail('The complete mission namespace contains an orphan or missing participant document.');
  }
  // The canonical loader validated the matching documents read in this same
  // transaction; these unfiltered queries establish namespace completeness.
  return inventory;
}

function requireReply(value: unknown, command: Command): AwayMissionProjectionMaintenanceReply {
  if (!isRecord(value) || !exactKeys(value, ['status', 'sessionId', 'repairRunId', 'step', 'epoch', 'state', 'pointerCount', 'missionId']) ||
      (value.status !== 'committed' && value.status !== 'stale') || value.sessionId !== command.sessionId ||
      value.repairRunId !== command.repairRunId || value.step !== command.step ||
      !Number.isSafeInteger(value.epoch) || (value.epoch as number) < 1 ||
      (value.state !== 'held' && value.state !== 'ready') || !Number.isSafeInteger(value.pointerCount) || (value.pointerCount as number) < 0 ||
      !(value.missionId === null || safeId(value.missionId))) fail('The protected maintenance reply is malformed.');
  return value as unknown as AwayMissionProjectionMaintenanceReply;
}
