import { expect, it } from 'vitest';
import { applyPdfFighterAceResults, resolvePdfFighterAceCombat } from './pc09SpecialistMechanics';
import { resolveWolfRange, type WolfCombatShip } from './wolfCombatMath';

function longRangeRoster(): readonly WolfCombatShip[] {
  const roster: WolfCombatShip[] = [
    { instanceId: 'wing', shipId: 'wolf-fighter-wing', target: 'aegis', damageTaken: 0, destroyed: false },
    { instanceId: 'cruiser', shipId: 'wolf-cruiser', target: 'aegis', damageTaken: 0, destroyed: false },
  ];
  return resolveWolfRange('long-range',
    [{ actionId: 'enriched-hit', sourceId: 'aegis-missile-launchers', range: 'long-range',
      maxTargets: 1, fixedDamage: 3 }],
    [{ actionId: 'enriched-hit', targetInstanceIds: ['wing'] }],
    roster,
  ).roster;
}

it('accepts ordinary Long Range overkill on a destroyed contact while the Ace damages a different live contact', () => {
  const roster = longRangeRoster();
  expect(roster[0]).toMatchObject({ damageTaken: 3, destroyed: true });
  const combat = resolvePdfFighterAceCombat({ range: 'medium', target: roster[1] });
  const result = applyPdfFighterAceResults(roster, combat.targetResults);
  expect(result[0]).toBe(roster[0]);
  expect(result[1]).toMatchObject({ damageTaken: 1, destroyed: false });
  expect(roster[1]?.damageTaken).toBe(0);
});

it('does not let an Ace result target the already destroyed overkill contact', () => {
  expect(() => applyPdfFighterAceResults(longRangeRoster(), [
    { instanceId: 'wing', shipId: 'wolf-fighter-wing', damage: 1, destroyed: true },
  ])).toThrow(/live combat contact/i);
});

it.each([
  { damageTaken: 3, destroyed: false },
  { damageTaken: 0, destroyed: true },
  { damageTaken: -1, destroyed: true },
])('rejects inconsistent prior damage and destruction $damageTaken/$destroyed', invalid => {
  const roster = longRangeRoster();
  expect(() => applyPdfFighterAceResults([{ ...roster[0]!, ...invalid }, roster[1]!], []))
    .toThrow(/roster|damage|destruction/i);
});

it('retains the exact capped Ace damage contract for a live contact', () => {
  const roster = longRangeRoster();
  expect(() => applyPdfFighterAceResults(roster, [
    { instanceId: 'cruiser', shipId: 'wolf-cruiser', damage: 4, destroyed: true },
  ])).toThrow(/damage|capacity/i);
});
