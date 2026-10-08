import { assertCandidateAdmission } from './pc10-candidate-proof-helpers.mjs';

// Baseline: retain the existing full-roster admission contract until its
// failing small-cohort counterexample is observed.
export function qualifyMinimumCandidateActors(input) {
  return assertCandidateAdmission(input.legacyAdmission, input.legacyConfiguration);
}
