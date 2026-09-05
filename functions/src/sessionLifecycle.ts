export const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const PRESENCE_LEASE_MS = 45_000;

export function deletionDeadline(disconnectedAt: Date): Date {
  return new Date(disconnectedAt.getTime() + SESSION_RETENTION_MS);
}

export function shouldDeleteSession(deadline: Date, now: Date): boolean {
  return deadline.getTime() <= now.getTime();
}

export function activeSessionConflicts(
  activeSessionId: string | undefined,
  requestedSessionId: string,
  active = true,
): boolean {
  return active && activeSessionId !== undefined && activeSessionId !== requestedSessionId;
}

export function isPresenceStale(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= PRESENCE_LEASE_MS;
}
