import type { MotionOverride } from './motionPreference';

/** The motion choice is intentionally global to this browser, not tied to a session. */
export const MOTION_SAFETY_STORAGE_KEY = 'dow-new-eden-motion-safety';
export const MOTION_SAFETY_TTL_MS = 24 * 60 * 60 * 1000;

export type MotionSafetyChoice = Extract<MotionOverride, 'reduce' | 'full'>;

interface MotionSafetyRecord {
  readonly acknowledgedAt: number;
  readonly choice: MotionSafetyChoice;
}

type MotionSafetyStorage = Pick<Storage, 'getItem' | 'setItem'>;

function readRecord(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): MotionSafetyRecord | null {
  const raw = storage.getItem(MOTION_SAFETY_STORAGE_KEY);
  if (raw === null || raw.trim() === '') return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Partial<MotionSafetyRecord>;
    const { acknowledgedAt, choice } = record;
    if (typeof acknowledgedAt !== 'number' || !Number.isSafeInteger(acknowledgedAt) || acknowledgedAt < 0) {
      return null;
    }
    if (choice !== 'reduce' && choice !== 'full') return null;
    return {
      acknowledgedAt,
      choice,
    };
  } catch {
    return null;
  }
}

function isFresh(record: MotionSafetyRecord | null, now: number): record is MotionSafetyRecord {
  return record !== null
    && Number.isSafeInteger(now)
    && now >= record.acknowledgedAt
    && now - record.acknowledgedAt < MOTION_SAFETY_TTL_MS;
}

export function isMotionSafetyAcknowledged(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
  now = Date.now(),
): boolean {
  return isFresh(readRecord(storage), now);
}

export function readMotionSafetyChoice(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
  now = Date.now(),
): MotionSafetyChoice | null {
  const record = readRecord(storage);
  return isFresh(record, now) ? record.choice : null;
}

export function acknowledgeMotionSafety(
  choice: MotionSafetyChoice,
  storage: MotionSafetyStorage = window.localStorage,
  now = Date.now(),
): number {
  if (choice !== 'reduce' && choice !== 'full') {
    throw new RangeError('Motion safety choice must be reduced or normal motion.');
  }
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError('Motion safety acknowledgement time must be a non-negative integer.');
  }

  storage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({ acknowledgedAt: now, choice }));
  return now;
}
