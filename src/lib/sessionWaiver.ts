/** The acknowledgement is intentionally global to this browser, not tied to a session. */
export const SESSION_WAIVER_STORAGE_KEY = 'dow-new-eden-session-waiver';
export const SESSION_WAIVER_TERMS_VERSION = 'code-of-conduct-v1';
export const SESSION_WAIVER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_WAIVER_CONFIRM_DELAY_MS = 10_000;
export const SESSION_WAIVER_RESET_EVENT = 'dow-new-eden-session-waiver-reset';

type WaiverStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readSessionWaiverAcknowledgedAt(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): number | null {
  const raw = storage.getItem(SESSION_WAIVER_STORAGE_KEY);
  if (raw === null || raw.trim() === '') return null;
  let acknowledgement: unknown;
  try {
    acknowledgement = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof acknowledgement !== 'object' || acknowledgement === null ||
    Array.isArray(acknowledgement)) return null;

  const record = acknowledgement as Record<string, unknown>;
  const timestamp = record.acknowledgedAt;
  if (record.termsVersion !== SESSION_WAIVER_TERMS_VERSION ||
    typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    return null;
  }
  return timestamp;
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
  storage.setItem(SESSION_WAIVER_STORAGE_KEY, JSON.stringify({
    acknowledgedAt: now,
    termsVersion: SESSION_WAIVER_TERMS_VERSION,
  }));
  return now;
}

export function resetSessionWaiver(
  storage: Pick<Storage, 'removeItem'> = window.localStorage,
): void {
  storage.removeItem(SESSION_WAIVER_STORAGE_KEY);
}
