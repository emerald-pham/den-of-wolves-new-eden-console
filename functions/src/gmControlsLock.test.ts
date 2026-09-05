import { describe, expect, it } from 'vitest';
import { mayClaimGmInstance } from './gmControlsLock';

describe('GM registration failsafe', () => {
  it('allows claims while registration is unlocked', () => {
    expect(mayClaimGmInstance(false, 2)).toBe(true);
  });

  it('blocks subsequent claims while a GM is present and registration is locked', () => {
    expect(mayClaimGmInstance(true, 1)).toBe(false);
  });

  it('allows a recovery claim when no GM remains present', () => {
    expect(mayClaimGmInstance(true, 0)).toBe(true);
  });
});
