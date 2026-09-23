import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  CALLABLE_RATE_LIMIT_POLICIES,
  callableRateLimitDocumentId,
  evaluateCallableRateLimit,
  type ExpensiveCallableName,
} from './callableRateLimit';

/**
 * Record one authorized member request in a private per-session, per-UID bucket.
 * Call only after the callable has established the actor's session membership.
 */
export async function enforceExpensiveCallableRateLimit(
  firestore: Firestore,
  identity: Readonly<{
    callableName: ExpensiveCallableName;
    sessionId: string;
    uid: string;
  }>,
  nowMs = Date.now(),
): Promise<void> {
  const policy = CALLABLE_RATE_LIMIT_POLICIES[identity.callableName];
  const markerRef = firestore.doc(
    `sessions/${identity.sessionId}/serverState/callableRateLimit-${callableRateLimitDocumentId(identity)}`,
  );
  let rejection: Extract<ReturnType<typeof evaluateCallableRateLimit>, { allowed: false }> | undefined;

  await firestore.runTransaction(async transaction => {
    const marker = await transaction.get(markerRef);
    const decision = evaluateCallableRateLimit(
      marker.exists ? marker.data() : undefined,
      identity,
      policy,
      nowMs,
    );
    if (!decision.allowed) {
      rejection = decision;
      return;
    }
    transaction.set(markerRef, decision.state);
  });

  if (rejection) {
    const invalidMarker = rejection.reason === 'invalid-marker';
    const details = rejection.reason === 'limit-reached'
      ? { commandError: 'rate-limited', retryAfterMs: rejection.retryAfterMs }
      : { commandError: 'rate-limit-state-invalid' };
    throw new HttpsError(
      'resource-exhausted',
      invalidMarker
        ? 'This request is temporarily unavailable.'
        : 'Too many requests for this session. Please try again shortly.',
      details,
    );
  }
}
