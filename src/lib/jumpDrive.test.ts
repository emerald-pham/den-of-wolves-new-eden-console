import { describe, expect, it } from 'vitest';
import {
  adjustCoordinateDigit,
  coordinateDigits,
  formatJumpLockout,
} from './jumpDrive';

describe('jump-drive coordinate controls', () => {
  it('keeps every coordinate digit in the 0–9 ring', () => {
    expect(adjustCoordinateDigit('0000', 0, -1)).toBe('9000');
    expect(adjustCoordinateDigit('9999', 3, 1)).toBe('9990');
    expect(adjustCoordinateDigit('1234', 1, 1)).toBe('1334');
  });

  it('pads malformed local input into four editable digits', () => {
    expect(coordinateDigits('42')).toEqual([0, 0, 4, 2]);
    expect(coordinateDigits('abcd')).toEqual([0, 0, 0, 0]);
  });

  it('formats a server-owned integrity lockout for the console readout', () => {
    expect(formatJumpLockout('2026-09-07T14:04:09.000Z', Date.parse('2026-09-07T13:34:09.000Z')))
      .toBe('30:00 until drive integrity reestablishes');
    expect(formatJumpLockout('2026-09-07T13:34:00.000Z', Date.parse('2026-09-07T13:34:09.000Z')))
      .toBe('INTEGRITY RESTORED');
  });
});
