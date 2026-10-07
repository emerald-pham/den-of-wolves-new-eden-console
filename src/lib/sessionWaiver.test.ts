import { beforeEach, describe, expect, it } from 'vitest';
import {
  acknowledgeSessionWaiver,
  isSessionWaiverAcknowledged,
  readSessionWaiverAcknowledgedAt,
  resetSessionWaiver,
  SESSION_WAIVER_STORAGE_KEY,
  SESSION_WAIVER_TERMS_VERSION,
  SESSION_WAIVER_TTL_MS,
} from './sessionWaiver';

const acknowledgedAt = Date.parse('2026-09-07T13:00:00.000Z');

describe('session waiver storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores a global acknowledgement timestamp without a session id', () => {
    expect(acknowledgeSessionWaiver(localStorage, acknowledgedAt)).toBe(acknowledgedAt);
    expect(JSON.parse(localStorage.getItem(SESSION_WAIVER_STORAGE_KEY)!)).toEqual({
      acknowledgedAt, termsVersion: SESSION_WAIVER_TERMS_VERSION,
    });
    expect(readSessionWaiverAcknowledgedAt(localStorage)).toBe(acknowledgedAt);
    expect(isSessionWaiverAcknowledged(localStorage, acknowledgedAt + 1)).toBe(true);
  });

  it('keeps all three regulation acknowledgements valid for seven days', () => {
    acknowledgeSessionWaiver(localStorage, acknowledgedAt);
    expect(SESSION_WAIVER_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);

    expect(isSessionWaiverAcknowledged(
      localStorage,
      acknowledgedAt + SESSION_WAIVER_TTL_MS - 1,
    )).toBe(true);
  });

  it('requires the waiver again at exactly seven days and rejects invalid values', () => {
    acknowledgeSessionWaiver(localStorage, acknowledgedAt);

    expect(isSessionWaiverAcknowledged(
      localStorage,
      acknowledgedAt + SESSION_WAIVER_TTL_MS,
    )).toBe(false);

    localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, 'not-a-timestamp');
    expect(readSessionWaiverAcknowledgedAt(localStorage)).toBeNull();
    expect(isSessionWaiverAcknowledged(localStorage, acknowledgedAt)).toBe(false);
  });

  it('does not accept a future timestamp as already acknowledged', () => {
    acknowledgeSessionWaiver(localStorage, acknowledgedAt + 1_000);

    expect(isSessionWaiverAcknowledged(localStorage, acknowledgedAt)).toBe(false);
  });

  it('clears the browser-local acknowledgement for an authenticated GM reset', () => {
    acknowledgeSessionWaiver(localStorage, acknowledgedAt);

    resetSessionWaiver(localStorage);

    expect(localStorage.getItem(SESSION_WAIVER_STORAGE_KEY)).toBeNull();
  });
});


it('requires real acknowledgement again for changed or unversioned terms', () => {
  for (const raw of [String(acknowledgedAt), JSON.stringify({ acknowledgedAt, termsVersion: 'old-terms' }),
    JSON.stringify({ acknowledgedAt, termsVersion: null })]) {
    localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, raw);
    expect(isSessionWaiverAcknowledged(localStorage, acknowledgedAt + 1)).toBe(false);
  }
});
