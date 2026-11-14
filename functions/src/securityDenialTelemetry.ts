import { createHash } from 'node:crypto';
import { warn } from 'firebase-functions/logger';
import { HttpsError, onCall as sdkOnCall, type CallableRequest } from 'firebase-functions/v2/https';

/**
 * Private security-denial telemetry for game callables (P634).
 *
 * A denial is written only to the Functions logger (Cloud Logging in
 * production), never to Firestore or the client response. The record keeps
 * permitted operational metadata: which callable, the error code and category,
 * whether auth and App Check were present, and one-way hashes that let an
 * operator correlate an actor, session or request they already know. A schema
 * denial also lists the request's top-level field names. It never
 * includes the request payload, error prose, headers or tokens, so credentials,
 * hands, loyalties and note bodies cannot enter it.
 */
const DENIAL_CATEGORIES = {
  unauthenticated: 'auth',
  'permission-denied': 'authorization',
  'invalid-argument': 'schema',
} as const;

type DeniedCode = keyof typeof DENIAL_CATEGORIES;
type AuditedRequest = Pick<CallableRequest, 'auth' | 'app' | 'data'>;

const SAFE_IDENTIFIER = /^[\w-]{1,128}$/;
const SAFE_CALLABLE_NAME = /^[\w.-]{1,128}$/;
const SAFE_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_REPORTED_FIELDS = 32;

function hashIdentifier(value: unknown, kind: 'actor' | 'session' | 'request'): string | undefined {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value)
    ? createHash('sha256').update(`dow-security-denial-${kind}\0${value}`).digest('hex')
    : undefined;
}

/** Cloud Functions names the deployed export in its runtime environment. */
function deployedCallableName(): string | undefined {
  const name = process.env.FUNCTION_TARGET ?? process.env.K_SERVICE;
  return typeof name === 'string' && SAFE_CALLABLE_NAME.test(name) ? name : undefined;
}

function isDeniedCode(code: string): code is DeniedCode {
  return Object.hasOwn(DENIAL_CATEGORIES, code);
}

function field(data: unknown, key: string): unknown {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Top-level request field names (never values) show which shape a malformed
 * request had. Odd or oversized names are dropped rather than echoed.
 */
function requestFieldNames(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  return Object.keys(data).filter(name => SAFE_FIELD_NAME.test(name)).sort().slice(0, MAX_REPORTED_FIELDS);
}

/** The permitted metadata for one denial, or undefined for a non-security failure. */
export function securityDenialRecord(request: AuditedRequest, error: unknown): Record<string, unknown> | undefined {
  if (!(error instanceof HttpsError) || !isDeniedCode(error.code)) return undefined;
  const callableName = deployedCallableName();
  const actorHash = hashIdentifier(request.auth?.uid, 'actor');
  const sessionHash = hashIdentifier(field(request.data, 'sessionId'), 'session');
  const requestHash = hashIdentifier(field(request.data, 'requestId'), 'request');
  return {
    type: 'security-denial',
    schemaVersion: 1,
    ...(callableName ? { callableName } : {}),
    code: error.code,
    category: DENIAL_CATEGORIES[error.code],
    authState: request.auth ? 'present' : 'absent',
    appCheck: request.app ? 'verified' : 'absent',
    ...(actorHash ? { actorHash } : {}),
    ...(sessionHash ? { sessionHash } : {}),
    ...(requestHash ? { requestHash } : {}),
    ...(error.code === 'invalid-argument' ? { requestFields: requestFieldNames(request.data) } : {}),
  };
}

export function recordSecurityDenial(request: AuditedRequest, error: unknown): void {
  try {
    const record = securityDenialRecord(request, error);
    if (record) warn('Callable security denial', record);
  } catch {
    // Telemetry must never replace or mask the original denial.
  }
}

/**
 * Drop-in replacement for the SDK `onCall`: same options, handler and
 * protocol, and the handler's own error is rethrown unchanged after the
 * private denial record is written.
 */
export const onCall = ((...args: unknown[]) => {
  const handler = args[args.length - 1] as (request: CallableRequest, response?: unknown) => unknown;
  const audited = (request: CallableRequest, response?: unknown): unknown => {
    let result: unknown;
    try {
      result = handler(request, response);
    } catch (error) {
      recordSecurityDenial(request, error);
      throw error;
    }
    if (typeof (result as PromiseLike<unknown> | undefined)?.then !== 'function') return result;
    return Promise.resolve(result).catch((error: unknown) => {
      recordSecurityDenial(request, error);
      throw error;
    });
  };
  return args.length > 1
    ? (sdkOnCall as (options: unknown, wrapped: typeof audited) => unknown)(args[0], audited)
    : (sdkOnCall as (wrapped: typeof audited) => unknown)(audited);
}) as typeof sdkOnCall;
