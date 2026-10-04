import { expect, it } from 'vitest';
import * as specialistFunctions from './index';

it('keeps Detector truth server-defined and applies four-in-five accuracy', () => {
  const detectorReportedWolf = specialistFunctions.detectorReportedWolf as
    (actualWolf: boolean, accuracyRoll: number) => boolean;
  expect(detectorReportedWolf(true, 4)).toBe(true);
  expect(detectorReportedWolf(true, 5)).toBe(false);
  expect(detectorReportedWolf(false, 5)).toBe(true);
  expect(() => detectorReportedWolf(true, 0)).toThrow();
});

it('compares attendance to the private posse calculation without returning suspicion', () => {
  const resolveArrestOutcome = specialistFunctions.resolveArrestOutcome as
    (requiredPlayers: number, presentPlayers: number) => 'arrested' | 'not-arrested';
  expect(resolveArrestOutcome(7, 7)).toBe('arrested');
  expect(resolveArrestOutcome(7, 6)).toBe('not-arrested');
  expect(() => resolveArrestOutcome(-1, 0)).toThrow();
});

it('resolves Fighter Ace dice and source-specific fighter and pilot outcomes', () => {
  const resolvePdfFighterAceCombat = specialistFunctions.resolvePdfFighterAceCombat as
    (input: Record<string, unknown>) => Record<string, unknown>;
  const cruiser = { instanceId: '2:wolf-cruiser', shipId: 'wolf-cruiser', damageTaken: 1, destroyed: false };
  expect(resolvePdfFighterAceCombat({ range: 'long', target: cruiser, rolls: [3, 2, 4] })).toMatchObject({
    damage: 2, targetDestroyed: true, fighterDestroyed: false, aceDied: false,
  });
  expect(resolvePdfFighterAceCombat({ range: 'long', target: cruiser, rolls: [2, 2, 2] })).toMatchObject({
    damage: 0, targetDestroyed: false, fighterDestroyed: true, aceDied: true,
  });
  expect(resolvePdfFighterAceCombat({ range: 'short', target: cruiser, extraTarget: null })).toMatchObject({
    damage: 1, fighterDestroyed: false, aceDied: false, escaped: false,
  });
  expect(resolvePdfFighterAceCombat({ range: 'short', target: cruiser, extraTarget: cruiser })).toMatchObject({
    damage: 2, fighterDestroyed: true, aceDied: false, escaped: true,
  });
});
