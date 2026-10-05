import { expect, it } from 'vitest';
import * as lifecycle from './wolfAttackLifecycle';

const action = (range: 'long-range'|'medium-range'|'short-range', patch = {}) => {
  expect(lifecycle).toHaveProperty('vulcanWolfRangeActions');
  return (lifecycle as unknown as {vulcanWolfRangeActions: (input: unknown) => unknown[]})
    .vulcanWolfRangeActions({range,charged:true,damaged:false,destroyed:false,...patch});
};
it.each(['medium-range','short-range'] as const)('locks the printed two-dice4+ Vulcan source at %s without drawing dice early', range => {
  expect(action(range)).toEqual([{actionId:`vulcan-laser-cannon-${range.replace('-range','')}`,
    sourceId:'vulcan-laser-cannon',range,dice:{sides:6,count:2,successAt:4,damagePerSuccess:1},maxTargets:2}]);
});
it('offers no Long Range or uncharged/damaged/destroyed Vulcan action', () => {
  expect(action('long-range')).toEqual([]);
  for (const patch of [{charged:false},{damaged:true},{destroyed:true}]) expect(action('medium-range',patch)).toEqual([]);
});
