import { describe, expect, it } from 'vitest';
import { normalizeDisplayName } from './displayName';

describe('normalizeDisplayName', () => {
  it('keeps roster labels readable when stored data is malformed or oversized', () => {
    expect(normalizeDisplayName({ name: 'not text' })).toBe('Player');
    expect(normalizeDisplayName('  ')).toBe('Player');
    expect(normalizeDisplayName(`  ${'A'.repeat(41)}  `)).toBe('A'.repeat(40));
  });
});
