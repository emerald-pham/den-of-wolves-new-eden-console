import { beforeEach, describe, expect, it } from 'vitest';
import {
  acknowledgeSessionWaiver,
  isSessionWaiverAcknowledged,
  readSessionWaiverAcknowledgedAt,
  SESSION_WAIVER_STORAGE_KEY,
  SESSION_WAIVER_TTL_MS,
} from './sessionWaiver';

const acknowledgedAt = Date.parse('2026-09-07T13:00:00.000Z');

describe('session waiver storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores a global acknowledgement timestamp without a session id', () => {
    expect(acknowledgeSessionWaiver(localStorage, acknowledgedAt)).toBe(acknowledgedAt);
    expect(localStorage.getItem(SESSION_WAIVER_STORAGE_KEY)).toBe(String(acknowledgedAt));
    expect(readSessionWaiverAcknowledgedAt(localStorage)).toBe(acknowledgedAt);
    expect(isSessionWaiverAcknowledged(localStorage, acknowledgedAt + 1)).toBe(true);
  });

  it('keeps the acknowledgement valid for less than twenty four hours', () => {
    localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, String(acknowledgedAt));

    expect(isSessionWaiverAcknowledged(
      localStorage,
      acknowledgedAt + SESSION_WAIVER_TTL_MS - 1,
    )).toBe(true);
  });

  it('requires the waiver again at twenty four hours and rejects invalid values', () => {
    localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, String(acknowledgedAt));

    expect(isSessionWaiverAcknowledged(
      localStorage,
      acknowledgedAt + SESSION_WAIVER_TTL_MS,
    )).toBe(false);

    localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, 'not-a-timestamp');
    expect(readSessionWaiverAcknowledgedAt(localStorage)).toBeNull();
    expect(isSessionWaiverAcknowledged(localStorage, acknowledgedAt)).toBe(false);
  });

  it('does not accept a future timestamp as already acknowledged', () => {
    localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, String(acknowledgedAt + 1_000));

    expect(isSessionWaiverAcknowledged(localStorage, acknowledgedAt)).toBe(false);
  });
});
