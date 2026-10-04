import { populationChange } from './shipPopulation';

export interface WolfAttackDamageDraw {
  readonly destroyed?: boolean;
  readonly casualty: boolean;
}

export interface WolfAttackDamageTargetResult {
  readonly target: string;
  readonly amount: number;
  readonly draws: readonly WolfAttackDamageDraw[];
  readonly population: number;
  readonly state: Readonly<{ damagedSystemIds: readonly string[]; destroyed: boolean }>;
}

export interface WolfAttackAftermathResources {
  readonly food: number;
  readonly water: number;
}

export interface DoctorMedicalAidResult {
  readonly populationByTarget: Readonly<Record<string, number>>;
  readonly resourcesByTarget: Readonly<Record<string, WolfAttackAftermathResources>>;
  readonly mitigated: readonly Readonly<{
    shipId: string;
    casualtiesBefore: number;
    casualtiesAfter: number;
    casualtiesPrevented: number;
    foodSpent: number;
    waterSpent: number;
  }>[];
}

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a record.`);
  }
}

function requireNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function movePopulation(shipId: string, current: number, delta: -1 | 1, count: number): number {
  let next = current;
  for (let index = 0; index < count; index += 1) {
    next = populationChange(shipId, next, delta, false).amount;
  }
  return next;
}

/** Apply the printed Doctor choice against the exact casualties in one attack receipt.
 * The first selected ship is free; each later selected ship pays from that
 * target ship's own food and water stores. */
export function resolveDoctorMedicalAid(input: Readonly<{
  shipResults: readonly WolfAttackDamageTargetResult[];
  populationBeforeByTarget: Readonly<Record<string, number>>;
  resourcesByTarget: Readonly<Record<string, WolfAttackAftermathResources>>;
  selectedShipIds: readonly string[];
}>): DoctorMedicalAidResult {
  if (!Array.isArray(input.shipResults) || !Array.isArray(input.selectedShipIds) ||
      input.selectedShipIds.length > input.shipResults.length ||
      new Set(input.selectedShipIds).size !== input.selectedShipIds.length) {
    throw new Error('Choose different ships for Doctor Medical Aid.');
  }
  requireRecord(input.populationBeforeByTarget, 'Population-before authority');
  requireRecord(input.resourcesByTarget, 'Ship-resource authority');

  const byTarget = new Map<string, WolfAttackDamageTargetResult>();
  for (const result of input.shipResults) {
    if (!result || typeof result.target !== 'string' || !result.target || byTarget.has(result.target) ||
        !Array.isArray(result.draws) || !result.state || !Array.isArray(result.state.damagedSystemIds)) {
      throw new Error('The Wolf damage receipt is malformed.');
    }
    requireNonNegativeInteger(result.amount, 'Wolf damage amount');
    requireNonNegativeInteger(result.population, 'Wolf damage population');
    if (result.draws.some((draw: WolfAttackDamageDraw) => !draw || typeof draw.casualty !== 'boolean')) {
      throw new Error('The Wolf damage receipt contains a malformed draw.');
    }
    byTarget.set(result.target, result);
  }

  const populationByTarget: Record<string, number> = {};
  for (const result of input.shipResults) populationByTarget[result.target] = result.population;
  const resourcesByTarget: Record<string, WolfAttackAftermathResources> = {};
  for (const [shipId, resources] of Object.entries(input.resourcesByTarget)) {
    requireRecord(resources, `Resources for ${shipId}`);
    requireNonNegativeInteger(resources.food, `${shipId} food`);
    requireNonNegativeInteger(resources.water, `${shipId} water`);
    resourcesByTarget[shipId] = { food: resources.food as number, water: resources.water as number };
  }

  const mitigated: DoctorMedicalAidResult['mitigated'][number][] = [];
  input.selectedShipIds.forEach((shipId, index) => {
    const result = byTarget.get(shipId);
    if (!result) throw new Error('Doctor Medical Aid can only select a ship in the resolved attack.');
    const casualtiesBefore = result.draws.filter((draw) => draw.casualty).length;
    if (casualtiesBefore < 1) throw new Error('This ship has no damage casualties for Doctor Medical Aid.');
    const before = input.populationBeforeByTarget[shipId];
    requireNonNegativeInteger(before, `${shipId} starting population`);
    const reconstructedBefore = movePopulation(shipId, result.population, 1, casualtiesBefore);
    if (reconstructedBefore !== before) {
      throw new Error('The casualty count no longer matches the authoritative population track.');
    }

    const casualtiesAfter = Math.floor(casualtiesBefore / 2);
    const casualtiesPrevented = casualtiesBefore - casualtiesAfter;
    populationByTarget[shipId] = movePopulation(shipId, result.population, 1, casualtiesPrevented);
    let foodSpent = 0;
    let waterSpent = 0;
    if (index > 0) {
      const resources = resourcesByTarget[shipId];
      if (!resources || resources.food < 3 || resources.water < 3) {
        throw new Error('Each additional ship needs 3 food and 3 water in that ship\'s stores.');
      }
      foodSpent = 3;
      waterSpent = 3;
      resourcesByTarget[shipId] = { food: resources.food - foodSpent, water: resources.water - waterSpent };
    }
    mitigated.push({ shipId, casualtiesBefore, casualtiesAfter, casualtiesPrevented, foodSpent, waterSpent });
  });

  return Object.freeze({
    populationByTarget: Object.freeze(populationByTarget),
    resourcesByTarget: Object.freeze(resourcesByTarget),
    mitigated: Object.freeze(mitigated.map((entry) => Object.freeze(entry))),
  });
}

export interface WolfAttackDamageByInstanceReceipt {
  readonly damageByInstance: Readonly<Record<string, number>>;
}

export interface WolfAttackSalvageResult {
  readonly damageDice: readonly number[];
  readonly materialsGained: number;
}

export interface WolfAttackSafeMemberResult {
  readonly sourceId: string;
  readonly outcome: Readonly<Record<string, unknown>>;
}

/** Resolve the charged Warrior Salvage Drones with server-owned d6 draws. */
export function resolveWarriorSalvage(input: Readonly<{
  ranges: readonly WolfAttackDamageByInstanceReceipt[];
  fleetDamage: readonly Readonly<{ target: string; amount: number }>[];
  /** Only the safe, committed Fighter Ace damage total supplements the private range receipt. */
  memberResults?: readonly WolfAttackSafeMemberResult[];
  randomInt: (upperBound: number) => number;
}>): WolfAttackSalvageResult {
  if (!Array.isArray(input.ranges) || !Array.isArray(input.fleetDamage) || typeof input.randomInt !== 'function') {
    throw new Error('Warrior Salvage Drones require the committed damage receipts and server randomness.');
  }
  let damagePoints = 0;
  for (const range of input.ranges) {
    requireRecord(range?.damageByInstance, 'Range damage receipt');
    for (const amount of Object.values(range.damageByInstance)) {
      requireNonNegativeInteger(amount, 'Damage dealt to a Wolf ship');
      damagePoints += amount;
    }
  }
  for (const target of input.fleetDamage) {
    if (!target || typeof target.target !== 'string' || target.target.length === 0) {
      throw new Error('The fleet damage receipt is malformed.');
    }
    requireNonNegativeInteger(target.amount, 'Damage dealt by surviving Wolf ships');
    damagePoints += target.amount;
  }
  for (const result of input.memberResults ?? []) {
    if (!result || typeof result.sourceId !== 'string') throw new Error('A member damage result is malformed.');
    if (result.sourceId !== 'pdf-fighter-ace') continue;
    requireRecord(result.outcome, 'Fighter Ace member result');
    requireNonNegativeInteger(result.outcome.damage, 'Fighter Ace damage dealt to Wolf ships');
    damagePoints += result.outcome.damage as number;
  }
  if (!Number.isSafeInteger(damagePoints)) throw new Error('The attack damage total is outside the safe range.');
  const damageDice: number[] = [];
  for (let index = 0; index < damagePoints; index += 1) {
    const sample = input.randomInt(6);
    if (!Number.isSafeInteger(sample) || sample < 0 || sample >= 6) {
      throw new Error('Server randomness returned an invalid Warrior salvage die.');
    }
    damageDice.push(sample + 1);
  }
  return Object.freeze({
    damageDice: Object.freeze(damageDice),
    materialsGained: damageDice.filter((roll) => roll >= 5).length,
  });
}

/** Derive the attack's single Scrap opportunity for each ship that took 3+ damage. */
export function wolfDamageScrapOpportunities(
  attackId: string,
  fleetDamage: readonly Readonly<{ target: string; amount: number; draws?: readonly WolfAttackDamageDraw[] }>[],
): readonly Readonly<{ attackId: string; shipId: string; scrap: 1 }>[] {
  if (typeof attackId !== 'string' || attackId.length < 1 || attackId.length > 160 ||
      !Array.isArray(fleetDamage)) {
    throw new Error('A canonical attack id and fleet damage receipts are required.');
  }
  const seen = new Set<string>();
  const opportunities = fleetDamage.flatMap(({ target, amount, draws }) => {
    if (typeof target !== 'string' || target.length === 0 || seen.has(target)) {
      throw new Error('Each ship must appear once in the attack damage receipt.');
    }
    requireNonNegativeInteger(amount, `${target} damage amount`);
    if (draws !== undefined && (!Array.isArray(draws) || draws.some((draw) =>
      !draw || typeof draw.casualty !== 'boolean'))) {
      throw new Error(`${target} damage draws are malformed.`);
    }
    // The attack spends the full damage amount even when its final draw
    // exhausts a deck and resolves through ship destruction.
    const damageTaken = amount;
    seen.add(target);
    return damageTaken >= 3 ? [{ attackId, shipId: target, scrap: 1 as const }] : [];
  });
  return Object.freeze(opportunities.map((entry) => Object.freeze(entry)));
}
