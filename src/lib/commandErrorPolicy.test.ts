import { describe, expect, it } from 'vitest';
import { classifyCommandError, isRetryableCommandError } from './commandErrorPolicy';

describe('command error taxonomy', () => {
  it.each([
    ['functions/unauthenticated', '', 'unauthenticated'],
    ['functions/permission-denied', 'Join the session first.', 'unauthorized'],
    ['functions/invalid-argument', 'Invalid maintenance request.', 'malformed-input'],
    ['functions/failed-precondition', 'The action is unavailable during Team Phase.', 'invalid-phase'],
    ['functions/failed-precondition', 'The turn changed. Refresh the live update.', 'stale-revision'],
    ['functions/aborted', 'That seat was just taken.', 'conflict'],
    ['functions/unavailable', 'Service is unavailable.', 'unavailable-service'],
    ['functions/not-found', 'That session no longer exists.', 'terminal-session'],
  ] as const)('classifies %s without exposing server internals', (code, message, expected) => {
    expect(classifyCommandError(code, message)).toBe(expected);
  });

  it('treats only retry-safe service failures as reconnect candidates', () => {
    expect(isRetryableCommandError('functions/unavailable')).toBe(true);
    expect(isRetryableCommandError('functions/resource-exhausted')).toBe(true);
    expect(isRetryableCommandError('functions/permission-denied')).toBe(false);
    expect(isRetryableCommandError('functions/failed-precondition')).toBe(false);
  });
});
