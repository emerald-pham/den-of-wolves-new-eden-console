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
    const actor = await db.doc(`sessions/${sessionId}/players/${uid}`).get();
    if (!actor.exists || actor.get('connected') !== true || actor.get('kickedAt') ||
        !['player', 'gm'].includes(String(actor.get('role')))) {
      throw new HttpsError('permission-denied', 'Current session membership is required.');
    }
    await enforceExpensiveCallableRateLimit(db, { callableName: 'getCurrentMemberSession', sessionId, uid });
    // The ordinary reader rechecks membership and every entitlement atomically.
    return read(request);
  };
}
