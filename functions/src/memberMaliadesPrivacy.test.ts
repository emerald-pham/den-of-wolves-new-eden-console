import {expect, it} from 'vitest';
import {memberSessionProjection} from './memberSession';

const state = {
  revision: 3, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 2, destroyed: false,
  medium: {targetShift: {targetId: 'private-wolf-a', shift: 1},
    attack: {targetId: 'private-wolf-b', die: 2, hit: false, selfDamage: 1}},
  short: {rolls: [{targetId: 'private-wolf-c', die: 1, hit: false, selfDamage: 1}], selfDamage: 1},
};
const operational = {
  type: 'maliades-operational-view', revision: 3, attackId: 'attack-2', attackCycle: 2,
  launched: true, damage: 2, destroyed: false, mediumResolved: true, shortResolved: true,
};
const root = {id: 's1', activeVesselIds: ['aegis', 'dione'],
  shuttleDockings: [{shuttleId: 'maliades', shipId: 'dione'}], maliadesState: state};
const local = {groupId: 'fleet-2', vesselIds: ['dione']};

it('provides only validated Maliades operational state to an entitled member', () => {
  const result = memberSessionProjection(root, local);
  expect(result.maliadesState).toEqual(operational);
  expect(JSON.stringify(result)).not.toContain('private-wolf');
  expect(result.maliadesState).not.toHaveProperty('medium');
  expect(result.maliadesState).not.toHaveProperty('short');
});

it('retains the same operational state when the member DTO is filtered again on hydration', () => {
  const result = memberSessionProjection({...root, maliadesState: operational}, local);
  expect(memberSessionProjection(result, local).maliadesState).toEqual(operational);
});

it('preserves the private result for GM and withdraws it from a foreign group', () => {
  expect(memberSessionProjection(root, {groupId: 'gm', vesselIds: ['aegis', 'dione']}).maliadesState).toEqual(state);
  expect(memberSessionProjection(root, {groupId: 'fleet-1', vesselIds: ['aegis']})).not.toHaveProperty('maliadesState');
});

it('does not publish malformed private or operational Maliades state', () => {
  for (const malformed of [{...state, extraPrivateResult: 'hidden'}, {...state, damage: 3},
    {...operational, medium: state.medium}, {...operational, launched: false}]) {
    expect(memberSessionProjection({...root, maliadesState: malformed}, local)).not.toHaveProperty('maliadesState');
  }
});
