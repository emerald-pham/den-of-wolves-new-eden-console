export const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function deletionDeadline(disconnectedAt: Date): Date {
  return new Date(disconnectedAt.getTime() + SESSION_RETENTION_MS);
}

export function shouldDeleteSession(deadline: Date, now: Date): boolean {
  return deadline.getTime() <= now.getTime();
}

export function activeSessionConflicts(
  activeSessionId: string | undefined,
  requestedSessionId: string,
): boolean {
  return activeSessionId !== undefined && activeSessionId !== requestedSessionId;
}
