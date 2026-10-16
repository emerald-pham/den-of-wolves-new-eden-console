import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { enforceExpensiveCallableRateLimit } from './callableRateLimitFirestore';

type Request = Readonly<{ auth?: Readonly<{ uid: string }>; data?: unknown }>;

/** Charge only a validated current member before the expensive projection collection scans. */
export function limitCurrentMemberSessionReader<R>({ db, read }: {
  readonly db: Firestore;
  readonly read: (request: Request) => Promise<R>;
}) {
  return async (request: Request): Promise<R> => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before reading this session.');
    const data = request.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1 ||
        typeof data.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(data.sessionId)) {
      throw new HttpsError('invalid-argument', 'A session ID is required.');
    }
    const sessionId = data.sessionId;
    const uid = request.auth.uid;
    await db.runTransaction(async tx => {
      const [session, actor] = await Promise.all([
        tx.get(db.doc(`sessions/${sessionId}`)), tx.get(db.doc(`sessions/${sessionId}/players/${uid}`)),
      ]);
      const closedHistory = session.exists && session.get('phase') === 'closed' &&
        actor.get('role') === 'player' && typeof actor.get('fleetGroupId') === 'string' &&
        actor.get('fleetGroupId').length > 0;
      if (!actor.exists || actor.get('kickedAt') || !['player', 'gm'].includes(String(actor.get('role'))) ||
          actor.get('connected') !== true && !closedHistory) {
        throw new HttpsError('permission-denied', 'Current session membership is required.');
      }
    }, { readOnly: true });
    await enforceExpensiveCallableRateLimit(db, { callableName: 'getCurrentMemberSession', sessionId, uid });
    // The ordinary reader rechecks membership and every entitlement atomically.
    return read(request);
  };
}
