/** Four-digit codes remain valid for sessions created before the migration. */
export const LEGACY_JOIN_CODE_LENGTH = 4;
/** Newer clients opt into a larger, still table-readable code space. */
export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_VERSION = 2;

/** The single contract for generation, redemption, retirement, and lookup. */
export const JOIN_CODE_POLICY = {
  legacyLengths: [LEGACY_JOIN_CODE_LENGTH],
  currentLengths: [JOIN_CODE_LENGTH],
  alphabet: 'digits',
  lifetime: 'session-until-retirement',
  lookup: 'non-enumerating',
  collision: 'transactional-joinCodes-document',
} as const;

/** Six guesses per identity every ten minutes keeps ordinary mistypes painless. */
export const JOIN_CODE_ATTEMPT_LIMIT = 6;
export const JOIN_CODE_ATTEMPT_WINDOW_MS = 10 * 60 * 1_000;
/** Retain the small server-only limiter record briefly, then let Firestore TTL remove it. */
export const JOIN_CODE_ATTEMPT_RETENTION_MS = 60 * 60 * 1_000;

export interface JoinCodeAttemptState {
  readonly startedAt: Date;
  readonly attempts: number;
}

export interface JoinCodeAttemptResult {
  readonly allowed: boolean;
  readonly state: JoinCodeAttemptState;
  readonly expiresAt: Date;
  readonly retryAt?: Date;
}

export function isJoinCode(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const hasSupportedLength = value.length === LEGACY_JOIN_CODE_LENGTH ||
    value.length === JOIN_CODE_LENGTH;
  return hasSupportedLength && /^\d+$/.test(value);
}

/** Older cached clients omit this field and continue receiving four-digit codes. */
export function joinCodeLengthForCreateRequest(version: unknown): number {
  return version === JOIN_CODE_VERSION ? JOIN_CODE_LENGTH : LEGACY_JOIN_CODE_LENGTH;
}

function isUsableState(value: JoinCodeAttemptState | undefined): value is JoinCodeAttemptState {
  return value !== undefined &&
    value.startedAt instanceof Date &&
    Number.isFinite(value.startedAt.getTime()) &&
    Number.isSafeInteger(value.attempts) &&
    value.attempts >= 0;
}

/**
 * Determine the next server-owned identity bucket. The caller persists an
 * allowed decision in one Firestore transaction, so concurrent calls cannot
 * race around the cap.
 */
export function takeJoinCodeAttempt(
  prior: JoinCodeAttemptState | undefined,
  now: Date,
): JoinCodeAttemptResult {
  const priorIsCurrent = isUsableState(prior) &&
    prior.startedAt.getTime() <= now.getTime() &&
    now.getTime() - prior.startedAt.getTime() < JOIN_CODE_ATTEMPT_WINDOW_MS;
  const state = priorIsCurrent
    ? prior
    : { startedAt: now, attempts: 0 };
  const retryAt = new Date(state.startedAt.getTime() + JOIN_CODE_ATTEMPT_WINDOW_MS);
  const expiresAt = new Date(state.startedAt.getTime() + JOIN_CODE_ATTEMPT_RETENTION_MS);

  if (state.attempts >= JOIN_CODE_ATTEMPT_LIMIT) {
    return { allowed: false, state, retryAt, expiresAt };
  }

  return {
    allowed: true,
    state: { startedAt: state.startedAt, attempts: state.attempts + 1 },
    expiresAt,
  };
}
