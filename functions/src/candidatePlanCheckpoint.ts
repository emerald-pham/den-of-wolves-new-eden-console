/** The printed candidate-planning checkpoint is due by Cycle 6. */
export const CANDIDATE_PLAN_CHECKPOINT_CYCLE = 6 as const;

/**
 * A facilitator's answer to the Cycle 6 checkpoint.
 *
 * The plan itself is intentionally absent: the source asks facilitators to
 * track whether a plan exists, not to publish its hidden guidance or contents.
 */
export interface CandidatePlanCheckpoint {
  readonly cycle: typeof CANDIDATE_PLAN_CHECKPOINT_CYCLE;
  readonly planExists: boolean;
  readonly checkedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value;
}

/** Build the deliberately content-free facilitator checkpoint record. */
export function recordCandidatePlanCheckpoint(
  planExists: boolean,
  checkedAt: string,
): CandidatePlanCheckpoint | undefined {
  if (typeof planExists !== 'boolean' || !isCanonicalIsoTimestamp(checkedAt)) return undefined;
  return {
    cycle: CANDIDATE_PLAN_CHECKPOINT_CYCLE,
    planExists,
    checkedAt,
  };
}

/**
 * Parse only the exact checkpoint shape. Extra fields fail closed so hidden
 * guidance or plan contents cannot hitch a ride in a facilitator projection.
 */
export function parseCandidatePlanCheckpoint(
  value: unknown,
): CandidatePlanCheckpoint | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 3 ||
      !Object.hasOwn(value, 'cycle') || !Object.hasOwn(value, 'planExists') ||
      !Object.hasOwn(value, 'checkedAt') ||
      value.cycle !== CANDIDATE_PLAN_CHECKPOINT_CYCLE ||
      typeof value.planExists !== 'boolean' || !isCanonicalIsoTimestamp(value.checkedAt)) {
    return undefined;
  }
  return {
    cycle: CANDIDATE_PLAN_CHECKPOINT_CYCLE,
    planExists: value.planExists,
    checkedAt: value.checkedAt,
  };
}
