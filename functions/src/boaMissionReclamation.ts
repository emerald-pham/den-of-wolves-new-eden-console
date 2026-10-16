import type { MissionOpportunityResolution } from './missionLifecycle';

/**
 * Apply exact division for the printed Boa halving only to the player's
 * selected mission-card opportunity. The resulting threshold may be a
 * half-point; the separate printed critical threshold is left unchanged.
 */
export function applyBoaReclamationDifficulty(
  outcomes: readonly MissionOpportunityResolution[],
  opportunityId: string,
): readonly MissionOpportunityResolution[] | null {
  if (!Array.isArray(outcomes) || typeof opportunityId !== 'string' || opportunityId.trim().length === 0 ||
      outcomes.length === 0 || outcomes.some((entry) => !validResolution(entry)) ||
      new Set(outcomes.map(({ opportunityId: id }) => id)).size !== outcomes.length) return null;
  const matching = outcomes.filter(({ opportunityId: id }) => id === opportunityId);
  if (matching.length !== 1) return null;

  const selected = matching[0]!;
  if (selected.difficulty === null) {
    return selected.outcome === 'automatic-failure' && selected.rewardBranch === 'none'
      ? [...outcomes]
      : null;
  }
  if (selected.outcome === 'automatic-failure') return null;

  return outcomes.map((entry) => {
    if (entry.opportunityId !== opportunityId) return entry;
    const difficulty = entry.difficulty / 2;
    const critical = entry.criticalThreshold !== null && entry.total >= entry.criticalThreshold;
    const successful = entry.total >= difficulty;
    const outcome = !successful ? 'failure' : critical ? 'critical-success' : 'success';
    return {
      ...entry,
      difficulty,
      outcome,
      rewardBranch: !successful ? 'none' : critical ? 'critical' : 'success',
    } satisfies MissionOpportunityResolution;
  });
}

function validResolution(value: unknown): value is MissionOpportunityResolution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const malformedDifficultyPair = entry.difficulty !== null && entry.criticalThreshold !== null &&
    typeof entry.difficulty === 'number' && typeof entry.criticalThreshold === 'number' &&
    entry.criticalThreshold < entry.difficulty;
  return !malformedDifficultyPair && typeof entry.opportunityId === 'string' && entry.opportunityId.trim().length > 0 &&
    Number.isSafeInteger(entry.contributorCount) && (entry.contributorCount as number) >= 0 &&
    Number.isSafeInteger(entry.cardTotal) && Number.isSafeInteger(entry.total) &&
    Number.isSafeInteger(entry.bonusTotal) && Array.isArray(entry.bonusBreakdown) &&
    (entry.difficulty === null || Number.isSafeInteger(entry.difficulty) && (entry.difficulty as number) >= 0) &&
    (entry.criticalThreshold === null || Number.isSafeInteger(entry.criticalThreshold) &&
      (entry.criticalThreshold as number) >= 0) &&
    ['success', 'failure', 'critical-success', 'automatic-failure'].includes(String(entry.outcome)) &&
    ['none', 'success', 'critical'].includes(String(entry.rewardBranch)) &&
    (entry.difficulty === null
      ? entry.criticalThreshold === null && entry.outcome === 'automatic-failure' && entry.rewardBranch === 'none'
      : entry.outcome !== 'automatic-failure' &&
      (entry.criticalThreshold === null || (entry.criticalThreshold as number) >= (entry.difficulty as number)));
}
