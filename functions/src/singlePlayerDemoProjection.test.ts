import { expect, it } from 'vitest';
import { publicSinglePlayerDemoState } from './singlePlayerDemoPolicy';
it.each(['active', 'complete'] as const)('preserves the public %s Demo marker for membership recovery', (status) => {
  expect(publicSinglePlayerDemoState({status,finalCycle:1})).toEqual({status,finalCycle:1});
});
it.each([undefined,null,{},[],{status:'active'},{status:'active',finalCycle:2},{status:'later',finalCycle:1},{status:'active',finalCycle:1,privateSecret:'must not leak'}])('omits malformed or extended markers without copying unknown fields', value => {
  expect(publicSinglePlayerDemoState(value)).toBeNull();
});
