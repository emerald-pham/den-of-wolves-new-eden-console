import { createHash } from 'node:crypto';
import { warn } from 'firebase-functions/logger';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
const categories = { unauthenticated: 'auth', 'permission-denied': 'authorization', 'invalid-argument': 'schema', 'resource-exhausted': 'rate-limit' } as const;
const hash = (value: unknown, kind: string) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value)
  ? createHash('sha256').update(`casting-denial-${kind}\0${value}`).digest('hex') : undefined;
// Casting-only policy; released game callables and their authorization stay intact.
export function castingCallableTransport(handler: (request: CallableRequest) => Promise<unknown>) {
  return onCall(CALLABLE_RUNTIME_OPTIONS, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError && Object.hasOwn(categories, error.code)) {
        const payload = request.data?.payload;
        const actorHash = hash(request.auth?.uid, 'actor');
        const sessionHash = hash(payload?.sessionId, 'session');
        const requestHash = hash(payload?.attempt, 'request');
        // No payload, token, handle, names, answers or error prose enters logs.
        try { warn('Casting callable denial', { type: 'security-denial', schemaVersion: 1,
          callableName: 'castingCompanionCommand', code: error.code,
          category: categories[error.code as keyof typeof categories],
          ...(actorHash ? { actorHash } : {}), ...(sessionHash ? { sessionHash } : {}),
          ...(requestHash ? { requestHash } : {}), redactionPolicy: 'casting-denial-hashed-metadata-v1' }); }
        catch { /* Logging cannot replace the original authorization response. */ }
      }
      throw error;
    }
  });
}
