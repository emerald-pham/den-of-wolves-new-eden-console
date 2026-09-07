import { describe, expect, it } from 'vitest';
import { isGmAccessPassword } from './gmAccess';

describe('GM access password', () => {
  it('accepts the configured password and rejects other values', () => {
    expect(isGmAccessPassword('bananasplit')).toBe(true);
    expect(isGmAccessPassword('not-the-password')).toBe(false);
    expect(isGmAccessPassword('')).toBe(false);
    expect(isGmAccessPassword(null)).toBe(false);
  });
});
