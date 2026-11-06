import { expect, it } from 'vitest';
import { planBoaMissionRewardDelivery, planMissionRewardDelivery } from './missionRewardDelivery';

const inventory = { ore: 2, fuel: 4, food: 5, water: 6, materials: 7, securityTeams: 8 };
const rewards = [{ opportunityId: 'A-1', branch: 'success' as const,
  resources: { food: 3, survivors: 2, minerals: 1 }, effects: [], bulkHaulageApplied: false }];

it('delivers every resource component once to one destination, preserving mineral cargo separately', () => {
  expect(planMissionRewardDelivery({ inventory, population: 1000, shipId: 'aegis', minerals: 4, rewards,
    specialRewards: [{ opportunityId: 'A-1', resources: { materials: 2, water: 1 } }] })).toEqual({
    inventory: { ...inventory, food: 8, water: 7, materials: 9 }, population: 1002, minerals: 5,
    deltas: { food: 3, survivors: 2, minerals: 1, materials: 2, water: 1 },
  });
  expect(inventory.food).toBe(5);
});

it('rejects malformed balances, unknown or negative rewards, and overflow instead of silently losing cargo', () => {
  const valid = { inventory, population: 1000, shipId: 'aegis', minerals: 0, rewards, specialRewards: [] };
  for (const invalid of [
    { ...valid, population: -1 }, { ...valid, population: 2500 }, { ...valid, minerals: 0.5 },
    { ...valid, inventory: { ...inventory, food: '5' } },
    { ...valid, inventory: { ...inventory, food: Number.MAX_SAFE_INTEGER } },
    { ...valid, rewards: [{ ...rewards[0], resources: { food: -1 } }] },
    { ...valid, rewards: [{ ...rewards[0], resources: { invented: 1 } }] },
  ]) expect(planMissionRewardDelivery(invalid)).toBeNull();
});

it('routes exactly the selected Boa Scrap to Boa cargo and keeps it out of the mission drop-off ship', () => {
  expect(planBoaMissionRewardDelivery({
    shipId: 'aegis', inventory, population: 1000, minerals: 4,
    rewards: [
      { opportunityId: 'G-3', branch: 'critical', resources: { scrap: 1 }, effects: [], bulkHaulageApplied: false },
      { opportunityId: 'G-2', branch: 'success', resources: { water: 2 }, effects: [], bulkHaulageApplied: false },
    ],
    specialRewards: [], boaReclamationOpportunityId: 'G-3', boaScrapCargo: { scrap: 2 },
  })).toEqual({
    inventory: { ...inventory, water: 8 }, population: 1000, minerals: 4,
    deltas: { water: 2 }, boaScrapAwarded: 1, boaScrapCargo: { scrap: 3 },
  });
});

it('does not mint Boa Scrap on failure and rejects any malformed replacement reward or cargo', () => {
  const valid = {
    shipId: 'aegis', inventory, population: 1000, minerals: 0, specialRewards: [],
    boaReclamationOpportunityId: 'G-3', boaScrapCargo: {},
  };
  expect(planBoaMissionRewardDelivery({ ...valid,
    rewards: [{ opportunityId: 'G-3', branch: 'none', resources: {}, effects: [], bulkHaulageApplied: false }],
  })).toMatchObject({ boaScrapAwarded: 0, boaScrapCargo: {} });
  expect(planBoaMissionRewardDelivery({ ...valid,
    rewards: [{ opportunityId: 'G-3', branch: 'critical', resources: { scrap: 2 }, effects: [], bulkHaulageApplied: false }],
  })).toBeNull();
  expect(planBoaMissionRewardDelivery({ ...valid,
    boaScrapCargo: { scrap: -1 },
    rewards: [{ opportunityId: 'G-3', branch: 'none', resources: {}, effects: [], bulkHaulageApplied: false }],
  })).toBeNull();
});

it('delivers the Boa Scrap alongside a kept non-reward effect but never alongside a reward effect', () => {
  const valid = {
    shipId: 'aegis', inventory, population: 1000, minerals: 0, specialRewards: [],
    boaReclamationOpportunityId: 'K-1', boaScrapCargo: {},
  };
  expect(planBoaMissionRewardDelivery({ ...valid, rewards: [{ opportunityId: 'K-1', branch: 'success',
    resources: { scrap: 1 }, effects: [{ kind: 'immediateWolfAttack', scope: 'group', unless: 'critical' }],
    bulkHaulageApplied: false }] })).toMatchObject({ boaScrapAwarded: 1, boaScrapCargo: { scrap: 1 } });
  expect(planBoaMissionRewardDelivery({ ...valid, rewards: [{ opportunityId: 'K-1', branch: 'success',
    resources: { scrap: 1 }, effects: [{ kind: 'upgradeConsoles', count: 1 }],
    bulkHaulageApplied: false }] })).toBeNull();
});
