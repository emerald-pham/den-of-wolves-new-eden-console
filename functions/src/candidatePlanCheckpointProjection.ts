import {
  parseCandidatePlanCheckpoint,
  type CandidatePlanCheckpoint,
} from './candidatePlanCheckpoint';

export interface FacilitatorCandidatePlanProjection {
  readonly candidatePlanCheckpoint: CandidatePlanCheckpoint;
}

/** Allowlist the one safe checkpoint field in the facilitator-only view. */
export function facilitatorCandidatePlanProjection(
  value: unknown,
): FacilitatorCandidatePlanProjection | undefined {
  const checkpoint = parseCandidatePlanCheckpoint(value);
  return checkpoint ? { candidatePlanCheckpoint: checkpoint } : undefined;
}

/** Candidate planning state and guidance are not part of member projections. */
export function memberCandidatePlanProjection(): Readonly<Record<string, never>> {
  return {};
}
