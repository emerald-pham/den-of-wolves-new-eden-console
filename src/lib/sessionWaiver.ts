/** The acknowledgement is intentionally global to this browser, not tied to a session. */
export const SESSION_WAIVER_STORAGE_KEY = 'dow-new-eden-session-waiver';
export const SESSION_WAIVER_TTL_MS = 24 * 60 * 60 * 1000;

type WaiverStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readSessionWaiverAcknowledgedAt(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): number | null {
  const raw = storage.getItem(SESSION_WAIVER_STORAGE_KEY);
  if (raw === null || raw.trim() === '') return null;
  const timestamp = Number(raw);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : null;
}

export function isSessionWaiverAcknowledged(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
  now = Date.now(),
): boolean {
  const acknowledgedAt = readSessionWaiverAcknowledgedAt(storage);
  return acknowledgedAt !== null && now >= acknowledgedAt &&
    now - acknowledgedAt < SESSION_WAIVER_TTL_MS;
}

export function acknowledgeSessionWaiver(
  storage: WaiverStorage = window.localStorage,
  now = Date.now(),
): number {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError('Session waiver acknowledgement time must be a non-negative integer.');
  }
  storage.setItem(SESSION_WAIVER_STORAGE_KEY, String(now));
  return now;
}
