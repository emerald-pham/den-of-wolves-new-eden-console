import { describe, expect, it } from 'vitest';
import type { MissionOpportunityResolution } from './missionLifecycle';
import {
  resolveMissionOpportunityRewards,
  resolveWarriorReclamatorHand,
} from './missionRewards';

function result(
  opportunityId: string,
  outcome: MissionOpportunityResolution['outcome'],
  rewardBranch: MissionOpportunityResolution['rewardBranch'],
): MissionOpportunityResolution {
  return {
    opportunityId,
    contributorCount: outcome === 'automatic-failure' ? 0 : 1,
    cardTotal: 20,
    bonusBreakdown: [],
    bonusTotal: 0,
    total: 20,
    difficulty: 14,
    criticalThreshold: 20,
    outcome,
    rewardBranch,
  };
}

describe('authoritative away-mission rewards', () => {
  it('mints the ordinary and critical branches once, adding one Bulk Haulage unit per won resource type', () => {
    const rewards = resolveMissionOpportunityRewards('D', [
      result('D-1', 'critical-success', 'critical'),
      result('D-2', 'success', 'success'),
      result('D-3', 'automatic-failure', 'none'),
    ], {
      bulkHaulageContributorUidsByOpportunity: {
        'D-1': ['capybara-captain'],
        'D-3': ['capybara-captain'],
      },
    });

    expect(rewards).toEqual([
      expect.objectContaining({
        opportunityId: 'D-1',
        branch: 'critical',
        resources: { food: 11, water: 9 },
        bulkHaulageApplied: true,
      }),
      expect.objectContaining({
        opportunityId: 'D-2',
        branch: 'success',
        resources: { ore: 6 },
        bulkHaulageApplied: false,
      }),
      expect.objectContaining({
        opportunityId: 'D-3',
        branch: 'none',
        resources: {},
        bulkHaulageApplied: false,
      }),
    ]);
    expect(rewards?.[2]?.effects).toEqual([]);
  });

  it('uses the trusted secret d6 for the printed variable K reward and fails closed when it is absent', () => {
    const outcome = result('K-1', 'success', 'success');
    expect(resolveMissionOpportunityRewards('K', [outcome], {
      secretD6Rolls: { 'K-1': 3 },
    })).toEqual([
      expect.objectContaining({
        opportunityId: 'K-1',
        branch: 'success',
        resources: { food: 6, water: 6, fuel: 6, materials: 3 },
      }),
    ]);
    expect(resolveMissionOpportunityRewards('K', [outcome])).toBeNull();
  });

  it('keeps printed non-resource effects in the exact success branch for their authorized producer', () => {
    const rewards = resolveMissionOpportunityRewards('E', [
      result('E-3', 'success', 'success'),
      result('E-1', 'failure', 'none'),
      result('E-2', 'failure', 'none'),
    ]);

    expect(rewards?.[0]).toMatchObject({
      opportunityId: 'E-3',
      branch: 'success',
      resources: {},
      effects: [{
        kind: 'exploreStarSystems',
        amount: 2,
        scope: 'wolf',
        allowedCodes: ['L', 'M'],
      }],
    });
    expect(rewards?.[1]?.resources).toEqual({});
    expect(rewards?.[1]?.effects).toEqual([]);
  });

  it('turns every Warrior Reclamator hand card into exactly one chosen food, water, or material', () => {
    expect(resolveWarriorReclamatorHand({
      participantUid: 'warrior',
      siteCode: 'G',
      opportunityId: 'G-3',
      handCardIds: ['A♥', '4♦', '5♣'],
      choices: [
        { cardId: 'A♥', resource: 'food' },
        { cardId: '4♦', resource: 'water' },
        { cardId: '5♣', resource: 'materials' },
      ],
    })).toEqual({
      participantUid: 'warrior',
      opportunityId: 'G-3',
      discardedCardIds: ['A♥', '4♦', '5♣'],
      resources: { food: 1, water: 1, materials: 1 },
    });
  });

  it('rejects a partial or duplicated Reclamator hand choice without consuming any card', () => {
    const input = {
      participantUid: 'warrior',
      siteCode: 'G',
      opportunityId: 'G-3',
      handCardIds: ['A♥', '4♦'],
      choices: [
        { cardId: 'A♥', resource: 'food' },
        { cardId: 'A♥', resource: 'water' },
      ],
    };
    expect(resolveWarriorReclamatorHand(input)).toBeNull();
    expect(resolveWarriorReclamatorHand({
      ...input,
      choices: [{ cardId: 'A♥', resource: 'food' }],
    })).toBeNull();
  });
});
