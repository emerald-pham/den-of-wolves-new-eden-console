import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

export const COMMAND_ERROR_KINDS = [
  'unauthenticated',
  'unauthorized',
  'invalid-phase',
  'stale-revision',
  'conflict',
  'malformed-input',
  'unavailable-service',
  'terminal-session',
] as const;

export type CommandErrorKind = (typeof COMMAND_ERROR_KINDS)[number];

/**
 * Attach a non-secret, machine-readable taxonomy discriminant to a callable
 * error. Human text remains useful for logs, while clients classify by this
 * stable detail instead of guessing from prose.
 */
export function commandError(
  code: FunctionsErrorCode,
  message: string,
  kind: CommandErrorKind,
): HttpsError {
  return new HttpsError(code, message, { commandError: kind });
}
