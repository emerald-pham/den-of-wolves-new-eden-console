import {expect, it} from 'vitest';
import {parseMaliadesSnapshot, parseMaliadesState} from './maliadesLedger';

const operational = {
  type: 'maliades-operational-view', revision: 3, attackId: 'attack-2', attackCycle: 2,
  launched: true, damage: 2, destroyed: false, mediumResolved: true, shortResolved: true,
};

it('hydrates current damage, revision and completion markers without private targets or dice', () => {
  expect(parseMaliadesSnapshot(operational)).toEqual(operational);
  expect(parseMaliadesState(operational)).toBeUndefined();
});

it('keeps the distinct full GM/authorized receipt parser and legacy initial state', () => {
  const state = {revision: 2, attackId: 'attack-2', attackCycle: 2, launched: true,
    damage: 1, destroyed: false, medium: null, short: null};
  expect(parseMaliadesSnapshot(state)).toEqual(parseMaliadesState(state));
  expect(parseMaliadesSnapshot(undefined)).toEqual(parseMaliadesState(undefined));
});

it('rejects public DTOs with extra private fields or impossible operational markers', () => {
  for (const invalid of [{...operational, dice: [1]}, {...operational, targetId: 'secret-wolf'},
    {...operational, launched: false}, {...operational, damage: 3},
    {...operational, attackCycle: null}, {...operational, revision: 1},
    {...operational, mediumResolved: 1}]) {
    expect(parseMaliadesSnapshot(invalid)).toBeUndefined();
  }
});
