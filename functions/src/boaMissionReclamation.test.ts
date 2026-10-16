import { describe, expect, it } from 'vitest';
import { applyBoaReclamationDifficulty } from './boaMissionReclamation';
import type { MissionOpportunityResolution } from './missionLifecycle';

function outcome(
  opportunityId: string,
  total: number,
  difficulty: number | null,
  criticalThreshold: number | null,
  initial: MissionOpportunityResolution['outcome'],
): MissionOpportunityResolution {
  return {
    opportunityId, contributorCount: initial === 'automatic-failure' ? 0 : 1,
    cardTotal: total, bonusBreakdown: [], bonusTotal: 0, total, difficulty, criticalThreshold,
    outcome: initial,
    rewardBranch: initial === 'critical-success' ? 'critical' : initial === 'success' ? 'success' : 'none',
  };
}

describe('Boa reclamation difficulty', () => {
  it('halves only the chosen opportunity and recomputes its success branch from the same server total', () => {
    const current = [
      outcome('D-1', 10, 14, 20, 'failure'),
      outcome('D-2', 10, 14, 20, 'failure'),
      outcome('D-3', 0, null, null, 'automatic-failure'),
    ];

    expect(applyBoaReclamationDifficulty(current, 'D-1')).toEqual([
      expect.objectContaining({ opportunityId: 'D-1', total: 10, difficulty: 7,
        criticalThreshold: 20, outcome: 'success', rewardBranch: 'success' }),
      current[1], current[2],
    ]);
  });

  it('keeps an odd printed difficulty exact and leaves the printed critical threshold unchanged', () => {
    const current = [outcome('E-2', 12, 15, 25, 'failure')];
    expect(applyBoaReclamationDifficulty(current, 'E-2')).toEqual([
      expect.objectContaining({ difficulty: 7.5, criticalThreshold: 25, outcome: 'success', rewardBranch: 'success' }),
    ]);
  });

  it('leaves automatic failures without assigned cards as failures', () => {
    const current = [outcome('D-1', 0, null, null, 'automatic-failure')];
    expect(applyBoaReclamationDifficulty(current, 'D-1')).toEqual(current);
  });

  it('fails closed for a missing or duplicated selected opportunity', () => {
    const current = [outcome('D-1', 10, 14, 20, 'failure')];
    expect(applyBoaReclamationDifficulty(current, 'D-2')).toBeNull();
    expect(applyBoaReclamationDifficulty([...current, ...current], 'D-1')).toBeNull();
  });

  it('fails closed instead of preserving a malformed selected calculation', () => {
    const current = [outcome('D-1', 10, -1, 20, 'failure')];
    expect(applyBoaReclamationDifficulty(current, 'D-1')).toBeNull();
  });
});
