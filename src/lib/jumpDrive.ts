export const JUMP_FLASH_MS = 2_000;
export const JUMP_FLASH_HZ = 3;

export function coordinateDigits(value: string): [number, number, number, number] {
  if (!/^\d{1,4}$/.test(value)) return [0, 0, 0, 0];
  const padded = value.padStart(4, '0');
  return [
    Number(padded.charAt(0)), Number(padded.charAt(1)), Number(padded.charAt(2)), Number(padded.charAt(3)),
  ];
}

export function adjustCoordinateDigit(value: string, index: number, delta: -1 | 1): string {
  const digits = coordinateDigits(value);
  if (index < 0 || index > 3) return digits.join('');
  digits[index] = ((digits[index] ?? 0) + delta + 10) % 10;
  return digits.join('');
}

export function formatJumpLockout(until: string, now = Date.now()): string {
  const remaining = Date.parse(until) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return 'INTEGRITY RESTORED';
  const seconds = Math.ceil(remaining / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} until drive integrity reestablishes`;
}
