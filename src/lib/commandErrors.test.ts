import { describe, expect, it } from 'vitest';
import { normalizeCommandError } from './commandErrors';

describe('normalizeCommandError', () => {
  it.each([
    ['unauthenticated', 'unauthenticated'],
    ['permission-denied', 'unauthorized'],
    ['invalid-argument', 'malformed-input'],
    ['already-exists', 'conflict'],
    ['aborted', 'conflict'],
    ['unavailable', 'unavailable-service'],
    ['deadline-exceeded', 'unavailable-service'],
  ] as const)('maps the Firebase %s code to %s', (code, kind) => {
    expect(normalizeCommandError({ code: `functions/${code}`, message: 'private server text' })).toMatchObject({
      code,
      kind,
    });
    expect(normalizeCommandError({ code: `functions/${code}`, message: 'private server text' }).message)
      .not.toContain('private server text');
  });

  it.each([
    ['invalid-phase', 'failed-precondition'],
    ['stale-revision', 'failed-precondition'],
    ['conflict', 'failed-precondition'],
    ['terminal-session', 'not-found'],
  ] as const)('uses the explicit %s detail for ambiguous %s failures', (kind, code) => {
    expect(normalizeCommandError({ code, details: { commandError: kind }, message: 'server detail' })).toMatchObject({
      code,
      kind,
    });
  });

  it('classifies a structured stale reply without reading its message', () => {
    const result = normalizeCommandError({ status: 'stale', message: 'revision 3' });
    expect(result.kind).toBe('stale-revision');
    expect(result.message).not.toContain('revision 3');
  });

  it('does not guess terminal session or phase from ambiguous transport codes', () => {
    expect(normalizeCommandError({ code: 'failed-precondition', message: 'This session is closed.' }).kind)
      .toBe('unknown');
    expect(normalizeCommandError({ code: 'not-found', message: 'No such ship.' }).kind)
      .toBe('unknown');
  });

  it('keeps local notices readable while callable unknowns stay generic', () => {
    expect(normalizeCommandError({ code: 'gm-event-log-link', message: 'The event log is offline.' }).message)
      .toBe('The event log is offline.');
    expect(normalizeCommandError({ code: 'functions/unknown', message: 'secret=wolf-password' }).message)
      .not.toContain('wolf-password');
  });

  it('does not trust a caller-supplied message when a stable kind is present', () => {
    expect(normalizeCommandError({
      code: 'failed-precondition', kind: 'terminal-session', message: 'secret=session-token',
    }).message).not.toContain('session-token');
  });
});
