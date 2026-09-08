export type CommandErrorKind =
  | 'unauthenticated'
  | 'unauthorized'
  | 'invalid-phase'
  | 'stale-revision'
  | 'conflict'
  | 'malformed-input'
  | 'unavailable-service'
  | 'terminal-session'
  | 'unknown';

function normalizeCode(code: string): string {
  return code.replace(/^functions\//, '');
}

/** Classify callable failures into stable client behavior, not server copy. */
export function classifyCommandError(code: string, message = ''): CommandErrorKind {
  const normalized = normalizeCode(code);
  const lowerMessage = message.toLowerCase();

  if (normalized === 'unauthenticated') return 'unauthenticated';
  if (normalized === 'permission-denied') return 'unauthorized';
  if (normalized === 'invalid-argument' || normalized === 'out-of-range') return 'malformed-input';
  if (normalized === 'already-exists' || normalized === 'aborted') return 'conflict';
  if (normalized === 'unavailable' || normalized === 'deadline-exceeded' ||
      normalized === 'internal' || normalized === 'unknown' || normalized === 'resource-exhausted') {
    return 'unavailable-service';
  }
  if (normalized === 'not-found') return 'terminal-session';

  if (normalized === 'failed-precondition') {
    if (/stale|revision|turn changed|refresh|live update/.test(lowerMessage)) return 'stale-revision';
    if (/phase|window|timer|action .*available/.test(lowerMessage)) return 'invalid-phase';
    if (/closed|retired|no longer exists|session .*gone/.test(lowerMessage)) return 'terminal-session';
    return 'conflict';
  }

  return 'unknown';
}

export function isRetryableCommandError(code: string): boolean {
  return classifyCommandError(code) === 'unavailable-service';
}
