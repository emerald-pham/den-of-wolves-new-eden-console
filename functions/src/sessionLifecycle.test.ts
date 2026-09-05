import { describe, expect, it } from 'vitest';
import {
  SESSION_RETENTION_MS,
  activeSessionConflicts,
  deletionDeadline,
  shouldDeleteSession,
} from './sessionLifecycle';

describe('session lifecycle policy', () => {
  it('retains an empty disconnected session for seven days', () => {
    const disconnectedAt = new Date('2026-01-01T00:00:00.000Z');
    expect(SESSION_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(deletionDeadline(disconnectedAt).toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('deletes only after the deadline has elapsed', () => {
    const deadline = new Date('2026-01-08T00:00:00.000Z');
    expect(shouldDeleteSession(deadline, new Date('2026-01-07T23:59:59.999Z'))).toBe(false);
    expect(shouldDeleteSession(deadline, new Date('2026-01-08T00:00:00.000Z'))).toBe(true);
  });

  it('prevents one identity from overlapping active sessions', () => {
    expect(activeSessionConflicts(undefined, 's2')).toBe(false);
    expect(activeSessionConflicts('s1', 's1')).toBe(false);
    expect(activeSessionConflicts('s1', 's2')).toBe(true);
  });
});
