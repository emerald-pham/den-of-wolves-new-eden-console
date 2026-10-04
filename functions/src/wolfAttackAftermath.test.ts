import { describe, expect, it, vi } from 'vitest';
import {
  resolveDoctorMedicalAid,
  resolveWarriorSalvage,
  wolfDamageScrapOpportunities,
} from './wolfAttackAftermath';

const damage = (target: string, casualtyFlags: readonly boolean[], population: number) => ({
  target,
  amount: casualtyFlags.length,
  draws: casualtyFlags.map((casualty) => ({ casualty, destroyed: false })),
  population,
  state: { damagedSystemIds: [], destroyed: false },
});

describe('wolf attack aftermath', () => {
  it('halves the first ship casualty count for free and charges 3 food plus 3 water per added ship', () => {
    const result = resolveDoctorMedicalAid({
      shipResults: [damage('aegis', [true, true, true], 750), damage('dione', [true, false, true, true], 8_000)],
      populationBeforeByTarget: { aegis: 1_500, dione: 11_000 },
      resourcesByTarget: {
        aegis: { food: 9, water: 9 },
        dione: { food: 6, water: 9 },
      },
      selectedShipIds: ['aegis', 'dione'],
    });

    expect(result.mitigated).toEqual([
      { shipId: 'aegis', casualtiesBefore: 3, casualtiesAfter: 1, casualtiesPrevented: 2, foodSpent: 0, waterSpent: 0 },
      { shipId: 'dione', casualtiesBefore: 3, casualtiesAfter: 1, casualtiesPrevented: 2, foodSpent: 3, waterSpent: 3 },
    ]);
    expect(result.populationByTarget).toEqual({ aegis: 1_250, dione: 10_000 });
    expect(result.resourcesByTarget.dione).toEqual({ food: 3, water: 6 });
  });

  it('rejects non-casualty targets and unaffordable additional ship choices without partial costs', () => {
    expect(() => resolveDoctorMedicalAid({
      shipResults: [damage('aegis', [false, true], 1_250)],
      populationBeforeByTarget: { aegis: 1_500 },
      resourcesByTarget: { aegis: { food: 2, water: 3 } },
      selectedShipIds: ['aegis', 'aegis'],
    })).toThrow(/different ships/i);

    expect(() => resolveDoctorMedicalAid({
      shipResults: [damage('aegis', [false, false], 1_500)],
      populationBeforeByTarget: { aegis: 1_500 },
      resourcesByTarget: { aegis: { food: 9, water: 9 } },
      selectedShipIds: ['aegis'],
    })).toThrow(/no damage casualties/i);

    expect(() => resolveDoctorMedicalAid({
      shipResults: [damage('aegis', [true], 1_250), damage('dione', [true], 10_000)],
      populationBeforeByTarget: { aegis: 1_500, dione: 11_000 },
      resourcesByTarget: { aegis: { food: 2, water: 3 }, dione: { food: 3, water: 2 } },
      selectedShipIds: ['aegis', 'dione'],
    })).toThrow(/3 food and 3 water/i);
  });

  it('rolls one server d6 per damage point dealt by either side and awards one material on each 5+', () => {
    const randomInt = vi.fn().mockReturnValueOnce(3).mockReturnValueOnce(4).mockReturnValueOnce(5);
    const result = resolveWarriorSalvage({
      ranges: [{ damageByInstance: { 'wing-1': 2, 'cruiser-1': 1 } }],
      fleetDamage: [{ target: 'aegis', amount: 2 }, { target: 'dione', amount: 1 }],
      randomInt,
    });

    expect(randomInt).toHaveBeenCalledTimes(6);
    expect(randomInt).toHaveBeenCalledWith(6);
    expect(result).toEqual({ damageDice: [4, 5, 6, 4, 5, 6], materialsGained: 4 });
  });

  it('creates exactly one Scrap opportunity for each ship at the three-damage threshold', () => {
    expect(wolfDamageScrapOpportunities('attack-7', [
      { target: 'aegis', amount: 2 },
      { target: 'dione', amount: 3 },
      { target: 'capybara', amount: 8 },
    ])).toEqual([
      { attackId: 'attack-7', shipId: 'dione', scrap: 1 },
      { attackId: 'attack-7', shipId: 'capybara', scrap: 1 },
    ]);
  });
});
