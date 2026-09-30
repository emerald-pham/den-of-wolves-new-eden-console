import { expect, it } from 'vitest';
import { planMissionRewardDelivery } from './missionRewardDelivery';

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
