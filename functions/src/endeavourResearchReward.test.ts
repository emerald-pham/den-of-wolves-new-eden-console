import { expect, it } from 'vitest';
import { applyEndeavourResearchReward, endeavourResearchTrack } from './endeavourResearch';

it('applies mission marks through the same earned-mark progression and preserves unrelated research', () => {
  const before = { reactor: 3, 'wolf-agent-detector': 0, 'jump-drive': 1 };
  const result = applyEndeavourResearchReward(before, [
    { trackId: 'reactor', marks: 2 }, { trackId: 'wolf-agent-detector', marks: 2 },
  ]);
  expect(result).toEqual({ reactor: 4, 'wolf-agent-detector': 2, 'jump-drive': 1 });
  expect(endeavourResearchTrack(result, 'reactor')).toMatchObject({ complete: true, currentMaterialCost: 4 });
  expect(endeavourResearchTrack(result, 'wolf-agent-detector')).toMatchObject({ complete: false, currentMaterialCost: 18 });
  expect(before).toEqual({ reactor: 3, 'wolf-agent-detector': 0, 'jump-drive': 1 });
  expect(Object.isFrozen(result)).toBe(true);
});

it('fully unlocks fixed rewards without spending resources or inventing additional marks', () => {
  const result = applyEndeavourResearchReward({ 'ecm-device': 5, reactor: 1 }, [
    { trackId: 'ecm-device', marks: 'complete' }, { trackId: 'jump-drive', marks: 'complete' },
  ]);
  expect(result).toEqual({ 'ecm-device': 4, 'jump-drive': 4, reactor: 1 });
  expect(endeavourResearchTrack(result, 'ecm-device')).toMatchObject({ crossedBoxes: 5, currentMaterialCost: 5 });
});

it('rejects malformed unrelated progress and every noncanonical effect before returning a mutation', () => {
  expect(() => applyEndeavourResearchReward({ reactor: 6 }, [{ trackId: 'jump-drive', marks: 1 }])).toThrow();
  for (const effect of [null, [], { trackId: 'unknown', marks: 1 }, { trackId: 'reactor', marks: 3 },
    { trackId: 'reactor', marks: 0 }, { trackId: 'reactor', marks: 1, cost: 0 },
    Object.assign(Object.create(null), { trackId: 'reactor', marks: 1 })]) {
    expect(() => applyEndeavourResearchReward({}, [effect] as never)).toThrow();
  }
});
