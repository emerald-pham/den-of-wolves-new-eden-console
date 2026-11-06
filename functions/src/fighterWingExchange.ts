import { HttpsError } from 'firebase-functions/v2/https';
import {
  FIGHTER_WING_IDS,
  fighterWingCounts,
  type FighterWingCounts,
  type FighterWingId,
} from './fighterWings';
import { isCanonicalRequestId } from './requestGuards';

/**
 * Team Phase Fighter Wing exchange domain. The printed Fighter Wing sheet
 * lets the Wing Commander exchange fighters between Alpha and Bravo during
 * the Team Phase, with each wing holding at most 4 fighters (6 after the
 * Construction Bay upgrade). The callable in index.ts owns authority, phase
 * and persistence; this module owns the request, the arithmetic and the
 * replayable result shape.
 */

export type FighterWingExchangeRequest = Readonly<{
  sessionId: string;
  instanceId?: string;
  requestId: string;
  sourceWingId: FighterWingId;
  amount: number;
  expectedAlphaRevision: number;
  expectedBravoRevision: number;
}>;

/**
 * The outcome returned only to the acting console. A stale result carries the
 * current counts so the console can refresh without guessing; it never moves
 * fighters.
 */
export type FighterWingExchangeResult = Readonly<{
  status: 'committed' | 'stale';
  sessionId: string;
  requestId: string;
  sourceWingId: FighterWingId;
  targetWingId: FighterWingId;
  amount: number;
  capacity: 4 | 6;
  turn: number;
  counts: FighterWingCounts;
}>;

export type FighterWingExchangePlan =
  | Readonly<{ ok: true; counts: FighterWingCounts }>
  | Readonly<{ ok: false; reason: 'source-short' | 'target-full' }>;

const REQUEST_KEYS = [
  'sessionId', 'instanceId', 'requestId', 'sourceWingId', 'amount',
  'expectedAlphaRevision', 'expectedBravoRevision',
] as const;

function isWingId(value: unknown): value is FighterWingId {
  return (FIGHTER_WING_IDS as readonly unknown[]).includes(value);
}

function requireId(value: unknown, field: string): string {
  if (!isCanonicalRequestId(value)) throw new HttpsError('invalid-argument', `${field} is invalid.`);
  return value;
}

/**
 * Parse an exchange request. The expected wing revisions are the counts the
 * actor saw, so a concurrent change yields a stale result instead of moving
 * fighters the actor did not choose.
 */
export function requireFighterWingExchangeRequest(data: unknown): FighterWingExchangeRequest {
  if (typeof data !== 'object' || data === null || Array.isArray(data) ||
      Object.keys(data).some((key) => !(REQUEST_KEYS as readonly string[]).includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid Fighter Wing exchange request.');
  }
  const raw = data as Record<string, unknown>;
  if (!isWingId(raw.sourceWingId)) throw new HttpsError('invalid-argument', 'Unknown fighter wing.');
  if (!Number.isSafeInteger(raw.amount) || (raw.amount as number) < 1 || (raw.amount as number) > 6) {
    throw new HttpsError('invalid-argument', 'amount must be a whole number of fighters from 1 to 6.');
  }
  for (const key of ['expectedAlphaRevision', 'expectedBravoRevision'] as const) {
    if (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0) {
      throw new HttpsError('invalid-argument', `${key} must be a non-negative integer.`);
    }
  }
  return {
    sessionId: requireId(raw.sessionId, 'sessionId'),
    ...(raw.instanceId === undefined ? {} : { instanceId: requireId(raw.instanceId, 'instanceId') }),
    requestId: requireId(raw.requestId, 'requestId'),
    sourceWingId: raw.sourceWingId,
    amount: raw.amount as number,
    expectedAlphaRevision: raw.expectedAlphaRevision as number,
    expectedBravoRevision: raw.expectedBravoRevision as number,
  };
}

export function otherFighterWing(wingId: FighterWingId): FighterWingId {
  return wingId === 'fighter-wing-alpha' ? 'fighter-wing-bravo' : 'fighter-wing-alpha';
}

/**
 * Move fighters from one wing to the other within the current capacity. Both
 * wing revisions advance together so observers of either wing see the change.
 */
export function planFighterWingExchange(
  counts: FighterWingCounts,
  sourceWingId: FighterWingId,
  amount: number,
  capacity: 4 | 6,
): FighterWingExchangePlan {
  const targetWingId = otherFighterWing(sourceWingId);
  const source = counts[sourceWingId];
  const target = counts[targetWingId];
  if (amount > source.count) return { ok: false, reason: 'source-short' };
  if (target.count + amount > capacity) return { ok: false, reason: 'target-full' };
  const next = {
    [sourceWingId]: { count: source.count - amount, revision: source.revision + 1 },
    [targetWingId]: { count: target.count + amount, revision: target.revision + 1 },
  } as Record<FighterWingId, { count: number; revision: number }>;
  return { ok: true, counts: next };
}

/** Validate a stored exchange receipt before it is replayed to its actor. */
export function isFighterWingExchangeResult(value: unknown): value is FighterWingExchangeResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if ((result.status !== 'committed' && result.status !== 'stale') ||
      typeof result.sessionId !== 'string' || typeof result.requestId !== 'string' ||
      !isWingId(result.sourceWingId) || result.targetWingId !== otherFighterWing(result.sourceWingId) ||
      !Number.isSafeInteger(result.amount) || (result.amount as number) < 1 ||
      (result.capacity !== 4 && result.capacity !== 6) ||
      !Number.isSafeInteger(result.turn) || (result.turn as number) < 1) return false;
  const counts = fighterWingCounts(result.counts);
  return FIGHTER_WING_IDS.every((wingId) => counts[wingId] !== undefined);
}
