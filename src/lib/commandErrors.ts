/**
 * Stable client-facing classification for callable command failures.
 *
 * Firebase's transport code remains available in `code` for diagnostics and
 * compatibility. The UI uses `kind` and the static guidance below so server
 * messages or details never become player-facing copy by accident.
 */
export const COMMAND_ERROR_KINDS = [
  'unauthenticated',
  'unauthorized',
  'invalid-phase',
  'stale-revision',
  'conflict',
  'malformed-input',
  'unavailable-service',
  'terminal-session',
  'unknown',
] as const;

export type CommandErrorKind = (typeof COMMAND_ERROR_KINDS)[number];

export interface NormalizedCommandError {
  readonly kind: CommandErrorKind;
  /** Canonical Firebase code, with the `functions/` prefix removed. */
  readonly code: string;
  /** Safe, static guidance suitable for player-facing rendering. */
  readonly message: string;
}

export interface CommandErrorDetails {
  readonly commandError?: unknown;
  readonly kind?: unknown;
}

const GUIDANCE: Readonly<Record<CommandErrorKind, string>> = {
  unauthenticated: 'Sign in again before sending this command.',
  unauthorized: 'This command is not available to the current station.',
  'invalid-phase': 'This command is unavailable during the current phase. Wait for the live state and retry.',
  'stale-revision': 'The live session changed before this command committed. Refresh the live state and retry.',
  conflict: 'Another command won this update. Refresh the live state and retry.',
  'malformed-input': 'The command could not be understood. Check the entered values and try again.',
  'unavailable-service': 'The fleet service is temporarily unavailable. Reconnect and retry.',
  'terminal-session': 'This session is no longer available. Return to the landing screen to join another table.',
  unknown: 'The command could not be completed. Refresh the live state and try again.',
};

const FIREBASE_CODES = new Set([
  'ok',
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
  'unauthenticated',
]);

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function rawCode(cause: unknown): string {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return 'unknown';
  const code = readString(cause.code) ?? 'unknown';
  return code.replace(/^functions\//, '');
}

function details(cause: unknown): CommandErrorDetails | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  const direct = 'details' in cause ? cause.details : undefined;
  const customData = 'customData' in cause && typeof cause.customData === 'object' &&
    cause.customData !== null ? cause.customData as Record<string, unknown> : undefined;
  const serverResponse = customData?.serverResponse;
  const nested = typeof serverResponse === 'object' && serverResponse !== null
    ? (serverResponse as Record<string, unknown>).details
    : undefined;
  const value = direct ?? nested;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as CommandErrorDetails;
}

function detailKind(cause: unknown): CommandErrorKind | undefined {
  const value = details(cause);
  const direct = typeof cause === 'object' && cause !== null && 'kind' in cause
    ? cause.kind
    : undefined;
  const candidate = value?.commandError ?? value?.kind ?? direct;
  return typeof candidate === 'string' &&
    (COMMAND_ERROR_KINDS as readonly string[]).includes(candidate)
    ? candidate as CommandErrorKind
    : undefined;
}

function codeKind(code: string): CommandErrorKind {
  switch (code) {
    case 'unauthenticated': return 'unauthenticated';
    case 'permission-denied': return 'unauthorized';
    case 'invalid-argument': return 'malformed-input';
    case 'already-exists':
    case 'aborted': return 'conflict';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'resource-exhausted':
    case 'internal':
    case 'unknown': return 'unavailable-service';
    default: return 'unknown';
  }
}

/** Return the canonical transport code for retry/queue decisions. */
export function commandErrorCode(cause: unknown): string {
  return rawCode(cause);
}

/**
 * Normalize a callable error or a structured stale reply without inspecting
 * free-form server text. Failed-precondition and not-found remain unknown
 * unless the server supplies an explicit taxonomy detail; a missing session,
 * ship, seat, or phase must not be guessed from a message.
 */
export function normalizeCommandError(cause: unknown): NormalizedCommandError {
  const code = rawCode(cause);
  const explicit = detailKind(cause);
  const structured = typeof cause === 'object' && cause !== null &&
    'status' in cause && cause.status === 'stale';
  const kind = explicit ?? (structured ? 'stale-revision' : codeKind(code));
  const isFirebaseCode = FIREBASE_CODES.has(code) || code.startsWith('functions/');
  const message = kind === 'unknown' && !isFirebaseCode &&
    typeof cause === 'object' && cause !== null && 'message' in cause &&
    typeof cause.message === 'string'
    ? cause.message.slice(0, 240)
    : GUIDANCE[kind];
  return { kind, code, message };
}

export function commandErrorGuidance(kind: CommandErrorKind): string {
  return GUIDANCE[kind];
}
