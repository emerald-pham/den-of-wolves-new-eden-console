import type { MissionOpportunityResolution } from './missionLifecycle';
import { halvedBoaReclamationDifficulty } from './boaMissionReclamationContract';
import { missionCardForCode } from './missionCards';

export { halvedBoaReclamationDifficulty };

/** Apply the Boa halving only to the player's selected mission-card opportunity. */
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
    const difficulty = halvedBoaReclamationDifficulty(entry.difficulty);
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

/** A stored pre-deal Boa choice that is structurally sound, whatever its current status or binding. */
export type StoredBoaReclamationChoice = Readonly<{
  status: 'selected' | 'lapsed' | 'consumed';
  opportunityId: string; groupId: string; chart: string; coordinate: string; siteCode: string;
  sourceCycle: number; actorUid: string; taskOpportunityId: string; controlRevision: number; revision: number;
}>;

/**
 * Parse a server-written Boa choice. Malformed data returns undefined so the
 * caller fails closed; a sound choice whose binding no longer matches is the
 * caller's to lapse.
 */
export function parseStoredBoaReclamationChoice(
  raw: unknown,
  sessionId: string,
): StoredBoaReclamationChoice | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const choice = raw as Record<string, unknown>;
  const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
  const definition = typeof choice.siteCode === 'string' ? missionCardForCode(choice.siteCode) : undefined;
  if (choice.type !== 'boa-mission-reclamation-choice' || choice.schemaVersion !== 1 ||
      !['selected', 'lapsed', 'consumed'].includes(String(choice.status)) || choice.sessionId !== sessionId ||
      !id(choice.opportunityId) || typeof choice.groupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(choice.groupId) ||
      !['A', 'B', 'C'].includes(String(choice.chart)) || typeof choice.coordinate !== 'string' ||
      !definition || !Number.isSafeInteger(choice.sourceCycle) || (choice.sourceCycle as number) < 0 ||
      !id(choice.actorUid) || choice.actorRoleId !== 'capybara-recycler' ||
      typeof choice.opportunityTaskId !== 'string' ||
      !definition.opportunities.some(({ id: taskId }) => taskId === choice.opportunityTaskId) ||
      !Number.isSafeInteger(choice.controlRevision) || (choice.controlRevision as number) < 0 ||
      !Number.isSafeInteger(choice.revision) || (choice.revision as number) < 1 ||
      typeof choice.requestId !== 'string') return undefined;
  return {
    status: choice.status as StoredBoaReclamationChoice['status'],
    opportunityId: choice.opportunityId, groupId: choice.groupId, chart: choice.chart as string,
    coordinate: choice.coordinate, siteCode: choice.siteCode as string, sourceCycle: choice.sourceCycle as number,
    actorUid: choice.actorUid, taskOpportunityId: choice.opportunityTaskId,
    controlRevision: choice.controlRevision as number, revision: choice.revision as number,
  };
}
