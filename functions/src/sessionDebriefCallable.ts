import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  closeSessionInTransaction,
  commitTerminal,
  sessionDebriefProjection,
  type SessionDebriefSnapshot,
} from './sessionDebrief';

interface CallableRequest {
  readonly auth?: { readonly uid: string };
  readonly data?: unknown;
}

interface DebriefCommand {
  readonly sessionId: string;
  readonly instanceId: string;
  readonly requestId: string;
}

interface DebriefReadRequest {
  readonly sessionId: string;
  readonly instanceId: string;
}

interface ActionResult {
  readonly phase: 'debrief' | 'closed';
  readonly committed: boolean;
  readonly cycle: number;
  readonly result: SessionDebriefSnapshot['result'];
}

function parseRequestRecord(value: unknown, expected: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'A valid session debrief request is required.');
  }
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== expected.length || Object.keys(data).some(key => !expected.includes(key))) {
    throw new HttpsError('invalid-argument', 'The session debrief request has unexpected fields.');
  }
  return data;
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
}

function parseCommand(value: unknown): DebriefCommand {
  const data = parseRequestRecord(value, ['sessionId', 'instanceId', 'requestId']);
  if (!boundedId(data.sessionId) || !boundedId(data.instanceId) || !boundedId(data.requestId)) {
    throw new HttpsError('invalid-argument', 'A session, active GM instance, and request ID are required.');
  }
  return { sessionId: data.sessionId, instanceId: data.instanceId, requestId: data.requestId };
}

function parseReadRequest(value: unknown): DebriefReadRequest {
  const data = parseRequestRecord(value, ['sessionId', 'instanceId']);
  if (!boundedId(data.sessionId) || !boundedId(data.instanceId)) {
    throw new HttpsError('invalid-argument', 'A session and active GM instance are required.');
  }
  return { sessionId: data.sessionId, instanceId: data.instanceId };
}

function authenticatedUid(request: CallableRequest): string {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before using session debrief controls.');
  return request.auth.uid;
}

function liveGm(instance: DocumentSnapshot, player: DocumentSnapshot, uid: string,
  checkLease: (instance: DocumentSnapshot, player: DocumentSnapshot, uid: string) => boolean): boolean {
  return player.exists && player.get('uid') === uid && player.get('role') === 'gm' &&
    player.get('connected') === true && checkLease(instance, player, uid);
}

function safeSnapshot(value: unknown, scope: { groupId: string; vesselIds: readonly string[]; gm: true }):
  SessionDebriefSnapshot | undefined {
  const projected = sessionDebriefProjection(value, scope);
  if (!projected || projected.type !== 'session-debrief' ||
      !['success', 'failure', 'completed'].includes(String(projected.result)) ||
      !Number.isSafeInteger(projected.cycle)) return undefined;
  return value as SessionDebriefSnapshot;
}

function actionResult(phase: 'debrief' | 'closed', committed: boolean, snapshot: SessionDebriefSnapshot): ActionResult {
  return { phase, committed, cycle: snapshot.cycle, result: snapshot.result };
}

function storedActionResult(value: unknown, phase: ActionResult['phase']): ActionResult | undefined {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
  const fields = ['phase', 'committed', 'cycle', 'result'];
  if (!raw || Object.keys(raw).length !== fields.length || Object.keys(raw).some(key => !fields.includes(key)) ||
      raw.phase !== phase || typeof raw.committed !== 'boolean' || !Number.isSafeInteger(raw.cycle) ||
      Number(raw.cycle) < 0 || !['success', 'failure', 'completed'].includes(String(raw.result))) return undefined;
  return { phase, committed: raw.committed, cycle: Number(raw.cycle),
    result: raw.result as SessionDebriefSnapshot['result'] };
}

function storedReceiptResult(
  value: unknown,
  uid: string,
  command: DebriefCommand,
  action: 'begin' | 'close',
): ActionResult | undefined {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
  const fields = ['actorUid', 'instanceId', 'action', 'requestId', 'result', 'createdAt'];
  if (!raw || Object.keys(raw).length !== fields.length || Object.keys(raw).some(key => !fields.includes(key)) ||
      raw.actorUid !== uid || raw.instanceId !== command.instanceId || raw.action !== action ||
      raw.requestId !== command.requestId || !Object.hasOwn(raw, 'createdAt')) return undefined;
  return storedActionResult(raw.result, action === 'begin' ? 'debrief' : 'closed');
}

/** Authenticated GM lifecycle commands and live-instance-only detailed history. */
export function createSessionDebriefCommands({ db, isLiveGmInstance }: {
  readonly db: Firestore;
  readonly isLiveGmInstance: (instance: DocumentSnapshot, player: DocumentSnapshot, uid: string) => boolean;
}) {
  async function transactCommand(request: CallableRequest, action: 'begin' | 'close'): Promise<ActionResult> {
    const uid = authenticatedUid(request);
    const command = parseCommand(request.data);
    const sessionRef = db.doc(`sessions/${command.sessionId}`);
    const playerRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
    const instanceRef = db.doc(`sessions/${command.sessionId}/gmInstances/${command.instanceId}`);
    const receiptRef = db.doc(`sessions/${command.sessionId}/debriefActions/${command.requestId}`);
    return db.runTransaction(async tx => {
      const [session, player, instance, receipt] = await Promise.all([
        tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef), tx.get(receiptRef),
      ]);
      if (!session.exists) throw new HttpsError('not-found', 'No such session.');
      if (receipt.exists) {
        const result = storedReceiptResult(receipt.data(), uid, command, action);
        if (!result) {
          throw new HttpsError('failed-precondition', 'This request ID belongs to a different debrief action.');
        }
        return result;
      }
      if (!liveGm(instance, player, uid, isLiveGmInstance)) {
        throw new HttpsError('permission-denied', 'A live GM instance is required for debrief controls.');
      }
      const phase = session.get('phase');
      let result: ActionResult;
      if (action === 'begin') {
        if (phase === 'debrief') {
          const existing = safeSnapshot(session.get('debriefSnapshot'), {
            groupId: 'gm', vesselIds: Array.isArray(session.get('activeVesselIds'))
              ? session.get('activeVesselIds') as string[] : [], gm: true,
          });
          if (!existing || existing.source !== 'failure-review') {
            throw new HttpsError('failed-precondition', 'This session does not have an enterable failure debrief.');
          }
          result = actionResult('debrief', false, existing);
        } else {
          if (phase !== 'failure') throw new HttpsError('failed-precondition', 'Only an authoritative failure can enter debrief.');
          try {
            const committed = commitTerminal(tx, sessionRef, session, {
              source: 'failure-review', committedAt: new Date().toISOString(),
            });
            result = actionResult('debrief', committed.committed, committed.snapshot);
          } catch (error) {
            throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'The failure debrief is invalid.');
          }
        }
      } else {
        try {
          const closed = closeSessionInTransaction(tx, sessionRef, session);
          result = actionResult('closed', closed.closed, closed.snapshot);
        } catch (error) {
          throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'A committed debrief is required.');
        }
      }
      tx.create(receiptRef, {
        actorUid: uid, instanceId: command.instanceId, action, requestId: command.requestId,
        result, createdAt: FieldValue.serverTimestamp(),
      });
      return result;
    });
  }

  return {
    begin: (request: CallableRequest) => transactCommand(request, 'begin'),
    close: (request: CallableRequest) => transactCommand(request, 'close'),
    read: async (request: CallableRequest) => {
      const uid = authenticatedUid(request);
      const input = parseReadRequest(request.data);
      const sessionRef = db.doc(`sessions/${input.sessionId}`);
      const playerRef = db.doc(`sessions/${input.sessionId}/players/${uid}`);
      const instanceRef = db.doc(`sessions/${input.sessionId}/gmInstances/${input.instanceId}`);
      return db.runTransaction(async tx => {
        const [session, player, instance] = await Promise.all([
          tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef),
        ]);
        if (!session.exists) throw new HttpsError('not-found', 'No such session.');
        if (!liveGm(instance, player, uid, isLiveGmInstance)) {
          throw new HttpsError('permission-denied', 'A live GM instance is required for facilitator debrief history.');
        }
        if (session.get('phase') !== 'debrief' && session.get('phase') !== 'closed') {
          throw new HttpsError('failed-precondition', 'Session debrief is not available yet.');
        }
        const vesselIds = Array.isArray(session.get('activeVesselIds'))
          ? session.get('activeVesselIds').filter((id: unknown): id is string => boundedId(id)) : [];
        const snapshot = safeSnapshot(session.get('debriefSnapshot'), { groupId: 'gm', vesselIds, gm: true });
        if (!snapshot) throw new HttpsError('failed-precondition', 'The committed debrief record is unavailable.');
        const projection = sessionDebriefProjection(snapshot, { groupId: 'gm', vesselIds, gm: true });
        return { type: 'session-debrief' as const, sessionId: input.sessionId, snapshot: projection };
      });
    },
  };
}
