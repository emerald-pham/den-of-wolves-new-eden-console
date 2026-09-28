import { expect, it } from 'vitest';
import { proceduresForRole } from './roleProcedures';

it('uses console terminology for procedures whose outcomes are tracked in the interface', () => {
  expect(proceduresForRole('icebreaker-engineer').find(({ name }) => name === 'Console upgrades')?.effect)
    .toBe('Coordinate research and material costs with the Shepherd Scientist. Resolve upgrades and repairs at the console.');
  expect(proceduresForRole('dione-president').find(({ name }) => name === 'Political capital')?.effect)
    .toBe('Track 0–8 at the console. Resolving a crisis grants 1 political capital, plus the resolution’s consequences.');
  expect(proceduresForRole('shepherd-scientist').find(({ name }) => name === 'Construction costs')?.effect)
    .toBe('Pay the left-most unlocked material cost from Shepherd’s hold. Research progress and built devices are tracked at the console.');
  expect(proceduresForRole('quellon-explorer').find(({ name }) => name === 'Exploration coordination')?.effect)
    .toBe('Coordinate scouting information and away missions with the fleet. Resolve mission opportunities at the console.');
});
