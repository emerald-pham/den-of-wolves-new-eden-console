import { describe, expect, it } from 'vitest';
import { GM_ACCESS_TIMEOUT_MS, isGmAccessActive, isGmAccessPassword } from './gmAccess';

describe('GM access password', () => {
  it('accepts the configured password and rejects other values', () => {
    expect(isGmAccessPassword('bananasplit')).toBe(true);
    expect(isGmAccessPassword('not-the-password')).toBe(false);
    expect(isGmAccessPassword('')).toBe(false);
    expect(isGmAccessPassword(null)).toBe(false);
  });

  it('expires remembered GM access after the safety window', () => {
    const authenticatedAt = Date.now();
    expect(isGmAccessActive({ toMillis: () => authenticatedAt }, authenticatedAt + 1)).toBe(true);
    expect(isGmAccessActive(
      { toMillis: () => authenticatedAt },
      authenticatedAt + GM_ACCESS_TIMEOUT_MS,
    )).toBe(false);
  });
});


it('remembers server GM authorization for seven days and rejects future or invalid stamps', () => {
  const stamp = Date.parse('2026-10-01T00:00:00.000Z');
  expect(GM_ACCESS_TIMEOUT_MS).toBe(7 * 24 * 60 * 60 * 1000);
  expect(isGmAccessActive(stamp, stamp + 6 * 24 * 60 * 60 * 1000)).toBe(true);
  expect(isGmAccessActive(stamp, stamp + 7 * 24 * 60 * 60 * 1000)).toBe(false);
  expect(isGmAccessActive(stamp, stamp - 1)).toBe(false);
  expect(isGmAccessActive(NaN, stamp)).toBe(false);
});
