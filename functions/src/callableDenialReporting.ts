import { createHash } from 'node:crypto';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

/**
 * Shared pieces of the private callable denial records: the game callables'
 * security-denial telemetry and the casting transport's own record. Each
 * caller keeps its own record shape and hash domain.
 */
export const DENIAL_CATEGORIES = {
  unauthenticated: 'auth',
  'permission-denied': 'authorization',
  'invalid-argument': 'schema',
  'resource-exhausted': 'rate-limit',
} as const;

export type DeniedCode = keyof typeof DENIAL_CATEGORIES;

/** An `HttpsError` whose code is recorded as a security denial. */
export function isDeniedHttpsError(error: unknown): error is HttpsError & { code: DeniedCode } {
  return error instanceof HttpsError && Object.hasOwn(DENIAL_CATEGORIES, error.code);
}

const SAFE_IDENTIFIER = /^[\w-]{1,128}$/;

/**
 * Domain-separated SHA-256 of an identifier-shaped value
 * (`<domain>-<kind>\0<value>`); anything else is dropped rather than hashed.
 */
export function hashDenialIdentifier(domain: string, kind: string, value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value)
    ? createHash('sha256').update(`${domain}-${kind}\0${value}`).digest('hex')
    : undefined;
}

type CallableHandler = (request: CallableRequest, response?: unknown) => unknown;

/**
 * Wrap a callable handler so that an error it throws or rejects with is
 * reported and then rethrown unchanged. Sync and async results pass through
 * as they are, and a failing report never replaces the original error.
 */
export function reportingDenials<Handler extends CallableHandler>(
  handler: Handler,
  report: (request: CallableRequest, error: unknown) => void,
): Handler {
  const safeReport = (request: CallableRequest, error: unknown) => {
    try {
      report(request, error);
    } catch {
      // Telemetry must never replace or mask the original denial.
    }
  };
  const wrapped = (request: CallableRequest, response?: unknown): unknown => {
    let result: unknown;
    try {
      result = handler(request, response);
    } catch (error) {
      safeReport(request, error);
      throw error;
    }
    if (typeof (result as PromiseLike<unknown> | undefined)?.then !== 'function') return result;
    return Promise.resolve(result).catch((error: unknown) => {
      safeReport(request, error);
      throw error;
    });
  };
  return wrapped as Handler;
}
