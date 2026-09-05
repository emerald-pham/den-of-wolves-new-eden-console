import { describe, expect, it } from 'vitest';
import {
  PRESENCE_LEASE_MS,
  SESSION_RETENTION_MS,
  activeSessionConflicts,
  deletionDeadline,
  isPresenceStale,
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
    expect(activeSessionConflicts('s1', 's2', false)).toBe(false);
  });

  it('expires presence only after a buffered heartbeat lease', () => {
    const lastSeen = new Date('2026-01-01T00:00:00.000Z');
    expect(PRESENCE_LEASE_MS).toBeGreaterThanOrEqual(30_000);
    expect(isPresenceStale(lastSeen, new Date(lastSeen.getTime() + PRESENCE_LEASE_MS - 1)))
      .toBe(false);
    expect(isPresenceStale(lastSeen, new Date(lastSeen.getTime() + PRESENCE_LEASE_MS)))
      .toBe(true);
  });
});
