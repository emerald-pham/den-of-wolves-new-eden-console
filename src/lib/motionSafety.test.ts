import { describe, expect, it } from 'vitest';
import {
  MOTION_SAFETY_TTL_MS,
  acknowledgeMotionSafety,
  isMotionSafetyAcknowledged,
  readMotionSafetyChoice,
} from './motionSafety';

function createStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('motion safety acknowledgement', () => {
  it('keeps the selected mode for less than 24 hours and expires at the boundary', () => {
    const storage = createStorage();
    const acknowledgedAt = 10_000;

    expect(isMotionSafetyAcknowledged(storage, acknowledgedAt)).toBe(false);
    acknowledgeMotionSafety('reduce', storage, acknowledgedAt);

    expect(isMotionSafetyAcknowledged(storage, acknowledgedAt)).toBe(true);
    expect(isMotionSafetyAcknowledged(storage, acknowledgedAt + MOTION_SAFETY_TTL_MS - 1)).toBe(true);
    expect(isMotionSafetyAcknowledged(storage, acknowledgedAt + MOTION_SAFETY_TTL_MS)).toBe(false);
    expect(isMotionSafetyAcknowledged(storage, acknowledgedAt - 1)).toBe(false);
    expect(readMotionSafetyChoice(storage, acknowledgedAt + 1)).toBe('reduce');
    expect(readMotionSafetyChoice(storage, acknowledgedAt + MOTION_SAFETY_TTL_MS)).toBeNull();
  });

  it('stores normal motion as an explicit choice and ignores malformed records', () => {
    const storage = createStorage();
    const acknowledgedAt = 20_000;

    acknowledgeMotionSafety('full', storage, acknowledgedAt);
    expect(readMotionSafetyChoice(storage, acknowledgedAt + 1)).toBe('full');

    storage.setItem('dow-new-eden-motion-safety', '{"choice":"normal","acknowledgedAt":20000}');
    expect(isMotionSafetyAcknowledged(storage, acknowledgedAt + 1)).toBe(false);
    expect(readMotionSafetyChoice(storage, acknowledgedAt + 1)).toBeNull();
  });
});
