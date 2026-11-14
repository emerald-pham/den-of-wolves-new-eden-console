import { warn } from 'firebase-functions/logger';
import { onCall as sdkOnCall, type CallableRequest } from 'firebase-functions/v2/https';
import {
  DENIAL_CATEGORIES, hashDenialIdentifier, isDeniedHttpsError, reportingDenials,
} from './callableDenialReporting';
import { COMMAND_ERROR_KINDS } from './commandErrors';

/**
 * Private security-denial telemetry for game callables (P634).
 *
 * A denial is written only to the Functions logger (Cloud Logging in
 * production), never to Firestore or the client response. The record keeps
 * permitted operational metadata: which callable, the error code and category,
 * whether auth and App Check were present, the fixed command-error slug and
 * retry window the client already receives, and one-way hashes that let an
 * operator correlate an actor, session or request they already know. A schema
 * denial also lists the request's top-level field names. It never
 * includes the request payload, error prose, headers or tokens, so credentials,
 * hands, loyalties and note bodies cannot enter it.
 */

/**
 * Machine-readable denial kinds already sent to the client. Only these fixed
 * slugs are copied, so arbitrary detail values never reach the record.
 */
const REPORTED_COMMAND_ERRORS: ReadonlySet<string> = new Set([
  ...COMMAND_ERROR_KINDS,
  'rate-limited',
  'rate-limit-state-invalid',
]);
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

type AuditedRequest = Pick<CallableRequest, 'auth' | 'app' | 'data'>;

const SAFE_CALLABLE_NAME = /^[\w.-]{1,128}$/;
const SAFE_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_REPORTED_FIELDS = 32;
const MAX_EXAMINED_FIELDS = 256;

function hashIdentifier(value: unknown, kind: 'actor' | 'session' | 'request'): string | undefined {
  return hashDenialIdentifier('dow-security-denial', kind, value);
}

/** Cloud Functions names the deployed export in its runtime environment. */
function deployedCallableName(): string | undefined {
  const name = process.env.FUNCTION_TARGET ?? process.env.K_SERVICE;
  return typeof name === 'string' && SAFE_CALLABLE_NAME.test(name) ? name : undefined;
}

function field(data: unknown, key: string): unknown {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Top-level request field names (never values) show which shape a malformed
 * request had. Odd or oversized names are dropped rather than echoed, and only
 * the first keys are examined so a huge malformed body cannot amplify the work.
 */
function requestFieldNames(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  const names: string[] = [];
  let examined = 0;
  for (const name in data) {
    if (!Object.hasOwn(data, name)) continue;
    if (examined++ >= MAX_EXAMINED_FIELDS) break;
    if (SAFE_FIELD_NAME.test(name)) names.push(name);
  }
  return names.sort().slice(0, MAX_REPORTED_FIELDS);
}

function denialDetails(details: unknown): Record<string, unknown> {
  const commandError = field(details, 'commandError');
  const retryAfterSeconds = field(details, 'retryAfterSeconds');
  return {
    ...(typeof commandError === 'string' && REPORTED_COMMAND_ERRORS.has(commandError) ? { commandError } : {}),
    ...(typeof retryAfterSeconds === 'number' && Number.isInteger(retryAfterSeconds)
      && retryAfterSeconds >= 1 && retryAfterSeconds <= MAX_RETRY_AFTER_SECONDS ? { retryAfterSeconds } : {}),
  };
}

/** The permitted metadata for one denial, or undefined for a non-security failure. */
export function securityDenialRecord(request: AuditedRequest, error: unknown): Record<string, unknown> | undefined {
  if (!isDeniedHttpsError(error)) return undefined;
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
    ...denialDetails(error.details),
    authState: request.auth ? 'present' : 'absent',
    appCheck: request.app ? 'verified' : 'absent',
    ...(actorHash ? { actorHash } : {}),
    ...(sessionHash ? { sessionHash } : {}),
    ...(requestHash ? { requestHash } : {}),
    ...(error.code === 'invalid-argument' ? { requestFields: requestFieldNames(request.data) } : {}),
  };
}

function recordSecurityDenial(request: AuditedRequest, error: unknown): void {
  const record = securityDenialRecord(request, error);
  if (record) warn('Callable security denial', record);
}

/**
 * Drop-in replacement for the SDK `onCall`: same options, handler and
 * protocol, and the handler's own error is rethrown unchanged after the
 * private denial record is written.
 */
export const onCall = ((...args: unknown[]) => {
  const handler = args[args.length - 1] as (request: CallableRequest, response?: unknown) => unknown;
  const audited = reportingDenials(handler, recordSecurityDenial);
  return args.length > 1
    ? (sdkOnCall as (options: unknown, wrapped: typeof audited) => unknown)(args[0], audited)
    : (sdkOnCall as (wrapped: typeof audited) => unknown)(audited);
}) as typeof sdkOnCall;
