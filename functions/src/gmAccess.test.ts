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
