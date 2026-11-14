import { warn } from 'firebase-functions/logger';
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import {
  DENIAL_CATEGORIES, hashDenialIdentifier, isDeniedHttpsError, reportingDenials,
} from './callableDenialReporting';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
const hash = (value: unknown, kind: string) => hashDenialIdentifier('casting-denial', kind, value);
// Casting-only policy; released game callables and their authorization stay intact.
export function castingCallableTransport(handler: (request: CallableRequest) => Promise<unknown>) {
  return onCall(CALLABLE_RUNTIME_OPTIONS, reportingDenials(handler, (request, error) => {
    if (!isDeniedHttpsError(error)) return;
    const payload = request.data?.payload;
    const actorHash = hash(request.auth?.uid, 'actor');
    const sessionHash = hash(payload?.sessionId, 'session');
    const requestHash = hash(payload?.attempt, 'request');
    // No payload, token, handle, names, answers or error prose enters logs.
    warn('Casting callable denial', { type: 'security-denial', schemaVersion: 1,
      callableName: 'castingCompanionCommand', code: error.code, category: DENIAL_CATEGORIES[error.code],
      ...(actorHash ? { actorHash } : {}), ...(sessionHash ? { sessionHash } : {}),
      ...(requestHash ? { requestHash } : {}), redactionPolicy: 'casting-denial-hashed-metadata-v1' });
  }));
}
