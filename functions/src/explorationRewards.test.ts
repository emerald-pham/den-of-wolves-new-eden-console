import { describe, expect, it } from 'vitest';
import { discoverySystemId } from './starChartProjection';
import { planMissionExplorationReward } from './explorationRewards';
import type { MissionExplorationRewardInput } from './explorationRewards';

function input(overrides: Partial<MissionExplorationRewardInput> = {}): MissionExplorationRewardInput {
  return {
    missionId: 'mission-1',
    siteCode: 'D',
    opportunityId: 'D-3',
    rewardBranch: 'success',
    chart: 'A',
    targetCoordinates: ['5143', '4454'],
    audienceUids: ['player-1', 'player-2'],
    knownSystemsByUid: {
      'player-1': {},
      'player-2': {},
    },
    ...overrides,
  };
}

describe('mission exploration rewards', () => {
  it('plans exactly two chart-valid D discoveries for only the mission audience', () => {
    const result = planMissionExplorationReward(input());

    expect(result).toMatchObject({
      status: 'planned',
      receipt: {
        id: 'mission-exploration:mission-1:D-3',
        missionId: 'mission-1',
        siteCode: 'D',
        opportunityId: 'D-3',
        chart: 'A',
        targetCoordinates: ['4454', '5143'],
        audienceUids: ['player-1', 'player-2'],
      },
      newDiscoveriesByUid: {
        'player-1': {
          [discoverySystemId('4454')!]: '4454',
          [discoverySystemId('5143')!]: '5143',
        },
        'player-2': {
          [discoverySystemId('4454')!]: '4454',
          [discoverySystemId('5143')!]: '5143',
        },
      },
    });
    expect(result).not.toHaveProperty('shipPosition');
    expect(result).not.toHaveProperty('jumpReceipt');
    expect(result).not.toHaveProperty('arrivalEvent');
    expect(result).not.toHaveProperty('pursuit');
  });

  it('accepts D targets outside the Wolf codes while rejecting home, uncharted, duplicate, or missing targets', () => {
    expect(planMissionExplorationReward(input({
      targetCoordinates: ['1413', '3068'],
    }))?.receipt.targetCoordinates).toEqual(['1413', '3068']);
    expect(planMissionExplorationReward(input({ targetCoordinates: ['0000', '5143'] }))).toBeNull();
    expect(planMissionExplorationReward(input({ targetCoordinates: ['5143', '5143'] }))).toBeNull();
    expect(planMissionExplorationReward(input({ targetCoordinates: ['5143'] }))).toBeNull();
    expect(planMissionExplorationReward(input({ chart: 'Z' as 'A' }))).toBeNull();
  });

  it('reveals Athena systems only when both coordinates are L or M on the selected chart', () => {
    const result = planMissionExplorationReward(input({
      siteCode: 'E',
      opportunityId: 'E-3',
      targetCoordinates: ['5143', '4454'],
    }));
    expect(result?.status).toBe('planned');
    expect(result?.receipt.targetCoordinates).toEqual(['4454', '5143']);

    expect(planMissionExplorationReward(input({
      siteCode: 'E',
      opportunityId: 'E-3',
      chart: 'B',
      targetCoordinates: ['5143', '4454'],
    }))).toBeNull();
    expect(planMissionExplorationReward(input({
      siteCode: 'E',
      opportunityId: 'E-3',
      targetCoordinates: ['1413', '5143'],
    }))).toBeNull();
  });

  it('adds only discoveries missing from each entitled participant and rejects an out-of-audience projection', () => {
    const result = planMissionExplorationReward(input({
      knownSystemsByUid: {
        'player-1': { [discoverySystemId('5143')!]: '5143' },
        'player-2': {},
      },
    }));

    expect(result?.newDiscoveriesByUid['player-1']).toEqual({
      [discoverySystemId('4454')!]: '4454',
    });
    expect(result?.newDiscoveriesByUid['player-2']).toEqual({
      [discoverySystemId('4454')!]: '4454',
      [discoverySystemId('5143')!]: '5143',
    });
    expect(planMissionExplorationReward(input({
      knownSystemsByUid: {
        'player-1': {},
        'player-2': {},
        spectator: {},
      },
    }))).toBeNull();
  });

  it('uses a stable receipt id to replay the same reward without reapplying discoveries', () => {
    const first = planMissionExplorationReward(input());
    const replay = planMissionExplorationReward(input({ existingReceipt: first?.receipt }));

    expect(replay).toEqual({
      status: 'replayed',
      receipt: first?.receipt,
      newDiscoveriesByUid: { 'player-1': {}, 'player-2': {} },
    });
    expect(planMissionExplorationReward(input({
      targetCoordinates: ['1413', '4454'],
      existingReceipt: first?.receipt,
    }))).toBeNull();
  });

  it('does not issue a reward for a failed branch or a mission opportunity without the canonical exploration effect', () => {
    expect(planMissionExplorationReward(input({ rewardBranch: 'none' }))).toBeNull();
    expect(planMissionExplorationReward(input({ siteCode: 'C', opportunityId: 'C-1' }))).toBeNull();
    expect(planMissionExplorationReward(input({ opportunityId: 'E-3' }))).toBeNull();
  });
});
