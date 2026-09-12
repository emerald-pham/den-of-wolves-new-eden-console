import { drawShipDamage, SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';
import type { ShipResourceInventory } from './resources';
import { populationChange } from './shipPopulation';
import { MAINTENANCE_EVENT_RESULT_STEPS } from './maintenanceEvent';
import { maintenanceOrderFor } from './maintenanceOrder';

export interface MaintenanceCycle {
  step: number; revision: number; results: Record<string, string>; charges: string[];
  refuelled: string[]; turn?: number; rationBonus?: number; startedAt?: string; completedAt?: string;
  damageDrawId?: string;
}
export interface MaintenanceInput {
  shipId: string; cycle: MaintenanceCycle; currentTurn: number; expectedRevision: number; action: string;
  resources: ShipResourceInventory; damage: ShipDamageState; unrest: number; population: number;
  dockings: readonly { shipId: string; shuttleId: string }[];
  cargo: Record<string, Record<string, number>>; fuelled: Record<string, boolean>;
  rolls: number[]; entropy: number; foodLevel?: number; waterLevel?: number;
  consoles?: string[]; refuels?: Record<string, string>; productionConsoleId?: string;
  productionMode?: 'run' | 'skip';
  upgraded?: readonly string[]; now: string;
  damageDrawId?: string;
}
export const MAINTENANCE_RULES: Readonly<Record<string, { food: number[]; water: number[]; reactor: number; damagedPenalty: number }>> = {
  aegis: { food: [0,3,5,8], water: [0,2,3,6], reactor: 5, damagedPenalty: 3 },
  dione: { food: [0,6,12,18], water: [0,6,11,14], reactor: 4, damagedPenalty: 3 },
  icebreaker: { food: [0,4,9,13], water: [0,4,7,10], reactor: 4, damagedPenalty: 3 },
  shepherd: { food: [0,4,8,12], water: [0,3,6,9], reactor: 3, damagedPenalty: 2 },
  quellon: { food: [0,4,8,12], water: [0,3,6,9], reactor: 3, damagedPenalty: 2 },
  'refinery-124': { food: [0,3,7,11], water: [0,2,5,8], reactor: 4, damagedPenalty: 3 },
  capybara: { food: [0,3,7,11], water: [0,2,5,8], reactor: 3, damagedPenalty: 3 },
};
export { MAINTENANCE_ORDERS } from './maintenanceOrder';
export const emptyMaintenanceCycle = (): MaintenanceCycle => ({ step: 0, revision: 0, results: {}, charges: [], refuelled: [] });

const DIONE_PRODUCTION = {
  hydroponics: { waterCost: 1, foodYield: 3, upgradedFoodYield: 5 },
  'water-reclamation': { waterCost: 0, waterYield: 2, upgradedWaterYield: 4 },
} as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Parse the persisted cycle shape before it can be carried into a public write. */
export function parseMaintenanceCycle(value: unknown): MaintenanceCycle | undefined {
  const raw = record(value);
  const step = nonNegativeInteger(raw?.step);
  const revision = nonNegativeInteger(raw?.revision);
  if (step === undefined || step > 7 || revision === undefined) return undefined;
  const rawResults = record(raw?.results);
  const results: Record<string, string> = {};
  for (const [key, result] of Object.entries(rawResults ?? {})) {
    if (MAINTENANCE_EVENT_RESULT_STEPS.includes(key as typeof MAINTENANCE_EVENT_RESULT_STEPS[number]) &&
        typeof result === 'string') results[key] = result;
  }
  const charges = Array.isArray(raw?.charges)
    ? raw.charges.filter((charge): charge is string => typeof charge === 'string')
    : [];
  const refuelled = Array.isArray(raw?.refuelled)
    ? raw.refuelled.filter((shuttle): shuttle is string => typeof shuttle === 'string')
    : [];
  if (!Array.isArray(raw?.charges) || !Array.isArray(raw?.refuelled)) return undefined;
  if (raw.turn !== undefined && nonNegativeInteger(raw.turn) === undefined) return undefined;
  if (raw.rationBonus !== undefined &&
      (typeof raw.rationBonus !== 'number' || !Number.isFinite(raw.rationBonus))) return undefined;
  for (const key of ['startedAt', 'completedAt', 'damageDrawId']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') return undefined;
  }
  return {
    step,
    revision,
    results,
    charges,
    refuelled,
    ...(raw.turn === undefined ? {} : { turn: raw.turn as number }),
    ...(raw.rationBonus === undefined ? {} : { rationBonus: raw.rationBonus as number }),
    ...(raw.startedAt === undefined ? {} : { startedAt: raw.startedAt as string }),
    ...(raw.completedAt === undefined ? {} : { completedAt: raw.completedAt as string }),
    ...(raw.damageDrawId === undefined ? {} : { damageDrawId: raw.damageDrawId as string }),
  };
}

export function advanceMaintenance(input: MaintenanceInput) {
  const { shipId, action } = input;
  const cycleInput = parseMaintenanceCycle(input.cycle);
  if (!cycleInput) throw new Error('Malformed maintenance cycle.');
  const rules = MAINTENANCE_RULES[shipId];
  const order = maintenanceOrderFor(shipId);
  if (!rules || !order) throw new Error('Unknown maintenance ship.');
  if (input.damage.destroyed && action !== 'end') throw new Error('This ship is destroyed.');
  if (input.expectedRevision !== cycleInput.revision) throw new Error('Maintenance changed. Refresh before proceeding.');
  const aegisOmegaComplete = shipId === 'aegis' && cycleInput.step === 7 && cycleInput.results['7'] !== undefined;
  const expectedAction = cycleInput.step === 0
    ? 'begin'
    : aegisOmegaComplete || (input.damage.destroyed && cycleInput.step === 7)
      ? 'end'
      : order[cycleInput.step - 1] ?? (cycleInput.step === order.length + 1 ? 'end' : undefined);
  // Dione's production consoles branch from the powered Reactor before the
  // step-6 shuttle bay. They consume a charge but do not advance the lane.
  const isProduction = action === 'production';
  if ((!isProduction && expectedAction !== action) ||
      (isProduction && (shipId !== 'dione' || cycleInput.step !== 6))) {
    throw new Error('This action is not available at the current step.');
  }
  if (action === 'begin' && cycleInput.turn === input.currentTurn) {
    throw new Error('Maintenance can only be done once per turn.');
  }
  const cycle = { ...cycleInput, revision: cycleInput.revision + 1, results: { ...cycleInput.results } };
  let resources = { ...input.resources };
  let damage = input.damage;
  let unrest = input.unrest;
  let population = input.population;
  const cargo = { ...input.cargo };
  const fuelled = { ...input.fuelled };
  let damageDraw: ReturnType<typeof drawShipDamage> | undefined;
  if (action === 'begin') {
    cycle.turn = input.currentTurn;
    cycle.results = {};
    cycle.refuelled = [];
    cycle.rationBonus = 0;
    cycle.startedAt = input.now;
    delete cycle.completedAt;
    delete cycle.damageDrawId;
  } else if (action === 'storage') {
    if (damage.damagedSystemIds.includes('storage')) {
      const losses: string[] = [];
      resources = Object.fromEntries(Object.entries(resources).map(([key, value]) => {
        const loss = Math.floor(value / 2);
        if (loss) losses.push(`${loss} ${key}`);
        return [key, value - loss];
      })) as unknown as ShipResourceInventory;
      for (const dock of input.dockings.filter(d => d.shipId === shipId)) {
        if (cargo[dock.shuttleId]) cargo[dock.shuttleId] = Object.fromEntries(Object.entries(cargo[dock.shuttleId]!).map(([key, value]) => {
          const loss = Math.floor(value / 2);
          if (loss) losses.push(`${loss} ${key} (${dock.shuttleId})`);
          return [key, value - loss];
        }));
      }
      cycle.results['1'] = `Storage damaged. Lost: ${losses.join(', ') || 'no resources'}.`;
    } else cycle.results['1'] = 'Storage intact. No resources lost.';
  } else if (action === 'rations') {
    const food = rules.food[input.foodLevel ?? -1];
    const water = rules.water[input.waterLevel ?? -1];
    if (food === undefined || water === undefined) throw new Error('Select food and water ration levels.');
    if (resources.food < food) throw new Error('Insufficient food for these rations.');
    if (resources.water < water) throw new Error('Insufficient water for these rations.');
    resources = { ...resources, food: resources.food - food, water: resources.water - water };
    cycle.rationBonus = (input.foodLevel! + input.waterLevel!) * 3;
    cycle.results['2'] = `Spent ${food} food and ${water} water. Ration bonus +${cycle.rationBonus}.`;
  } else if (action === 'unrest') {
    const total = input.rolls[0]! + input.rolls[1]! + (cycle.rationBonus ?? 0);
    const gain = total < 12 ? 2 : total < 20 ? 1 : 0;
    unrest = Math.min(10, unrest + gain);
    cycle.results['3'] = `Rolled ${input.rolls[0]} + ${input.rolls[1]} + ${cycle.rationBonus ?? 0} = ${total}. Added ${gain} unrest; unrest ${unrest}.`;
  } else if (action === 'riot') {
    const roll = input.rolls[0]!;
    delete cycle.damageDrawId;
    cycle.results['4'] = `Rolled ${roll} against unrest ${unrest}. No riot.`;
    if (roll < unrest) {
      damageDraw = drawShipDamage(shipId, damage, upper => Math.floor(input.entropy * upper));
      damage = damageDraw.state;
      if (input.damageDrawId) cycle.damageDrawId = input.damageDrawId;
      if (!damageDraw.destroyed && !damageDraw.card.systemId.startsWith('armoured-hull') && population > 0) {
        population = populationChange(shipId, population, -1, false).amount;
        if (population === 0) unrest = Math.min(10, unrest + 2);
      }
      cycle.results['4'] = `Rolled ${roll} against unrest ${input.unrest}. Riot: ${damageDraw.destroyed ? 'ship destroyed' : damageDraw.card.systemName + (damageDraw.recycled ? ' absorbed damage' : ' damaged')}. Population ${population}.`;
    }
  } else if (action === 'reactor') {
    const capacity = Math.max(0, rules.reactor + (input.upgraded?.includes('reactor') ? 1 : 0) - (damage.damagedSystemIds.includes('reactor') ? rules.damagedPenalty : 0));
    const consoles = input.consoles ?? [];
    const eligible = SHIP_DAMAGE_DECKS[shipId]!.filter(c => !['storage', 'reactor'].includes(c.systemId) && !c.systemId.startsWith('shuttle-bay') && !c.systemId.startsWith('armoured-hull')).map(c => c.systemId);
    if (consoles.length > capacity) throw new Error('Reactor capacity exceeded.');
    // A damaged Jump Drive remains chargeable so its printed integrity check can run on departure.
    if (new Set(consoles).size !== consoles.length || consoles.some(id => !eligible.includes(id) || (id !== 'jump-drive' && damage.damagedSystemIds.includes(id)))) throw new Error('Invalid or damaged console selected.');
    cycle.charges = [...consoles];
    cycle.results['5'] = `Reactor powered up. Previous unused charge lost. Charged ${consoles.length}/${capacity} consoles.`;
    for (const dock of input.dockings.filter(d => d.shipId === shipId)) fuelled[dock.shuttleId] = false;
  } else if (action === 'production') {
    const consoleId = input.productionConsoleId;
    if (!consoleId || !(consoleId in DIONE_PRODUCTION)) throw new Error('Select a Dione production console.');
    if (!cycleInput.charges.includes(consoleId)) throw new Error('Production console is not charged.');
    const productionMode = input.productionMode ?? 'run';
    if (productionMode !== 'run' && productionMode !== 'skip') throw new Error('Invalid Dione production choice.');
    const priorProductionResult = cycleInput.results['5'] ?? '';
    if (productionMode === 'skip') {
      cycle.charges = cycleInput.charges.filter(id => id !== consoleId);
      const label = consoleId === 'hydroponics' ? 'Hydroponics' : 'Water Reclamation';
      cycle.results['5'] = `${priorProductionResult}${priorProductionResult ? ' ' : ''}${label} skipped.`;
    } else {
      if (damage.damagedSystemIds.includes(consoleId)) throw new Error('Damaged production console cannot be used.');
      if (consoleId === 'hydroponics' && priorProductionResult.includes('Water Reclamation:')) {
        throw new Error('Hydroponics must be resolved before Water Reclamation.');
      }
      if (consoleId === 'water-reclamation' && cycleInput.charges.includes('hydroponics') &&
          !damage.damagedSystemIds.includes('hydroponics') &&
          resources.water >= DIONE_PRODUCTION.hydroponics.waterCost) {
        throw new Error('Resolve Hydroponics before Water Reclamation, or skip it.');
      }
      const rule = DIONE_PRODUCTION[consoleId];
      const upgraded = input.upgraded?.includes(consoleId) ?? false;
      if (consoleId === 'hydroponics') {
        if (resources.water < rule.waterCost) throw new Error('Insufficient water for Hydroponics.');
        const foodYield = upgraded ? rule.upgradedFoodYield : rule.foodYield;
        resources = { ...resources, water: resources.water - rule.waterCost, food: resources.food + foodYield };
        cycle.results['5'] = `${priorProductionResult}${priorProductionResult ? ' ' : ''}Hydroponics: spent ${rule.waterCost} water, generated ${foodYield} food.`;
      } else {
        const waterYield = upgraded ? rule.upgradedWaterYield : rule.waterYield;
        resources = { ...resources, water: resources.water + waterYield };
        cycle.results['5'] = `${priorProductionResult}${priorProductionResult ? ' ' : ''}Water Reclamation: generated ${waterYield} water.`;
      }
      cycle.charges = cycleInput.charges.filter(id => id !== consoleId);
    }
  } else if (action === 'bays') {
    const refuels = input.refuels ?? {};
    const chosen = Object.values(refuels).filter(Boolean);
    if (new Set(chosen).size !== chosen.length) throw new Error('Refuel each shuttle only once per cycle.');
    if (chosen.some(shuttle => cycleInput.refuelled.includes(shuttle))) throw new Error('Refuel each shuttle only once per cycle.');
    if (chosen.length > resources.fuel) throw new Error('Insufficient fuel to refuel these shuttles.');
    const bays = SHIP_DAMAGE_DECKS[shipId]!.filter(c => c.systemId.startsWith('shuttle-bay')).map(c => c.systemId);
    const currentBays = shipId === 'aegis'
      ? [cycleInput.step === 6 ? 'shuttle-bay-zeta' : 'shuttle-bay-omega']
      : bays;
    if (Object.keys(refuels).some(bay => !currentBays.includes(bay))) throw new Error('Unknown or out-of-order shuttle bay.');
    for (const [bay, shuttle] of Object.entries(refuels)) {
      if (!bays.includes(bay)) throw new Error('Unknown shuttle bay.');
      if (!shuttle) continue;
      if (damage.damagedSystemIds.includes(bay)) throw new Error('Damaged shuttle bay cannot refuel.');
      if (!input.dockings.some(d => d.shipId === shipId && d.shuttleId === shuttle)) throw new Error('Shuttle must be docked at this ship.');
      fuelled[shuttle] = true;
    }
    resources = { ...resources, fuel: resources.fuel - chosen.length };
    cycle.refuelled = [...cycleInput.refuelled, ...chosen];
    const bayName = currentBays[0] === 'shuttle-bay-omega' ? 'Shuttle Bay Omega' : currentBays[0] === 'shuttle-bay-zeta' ? 'Shuttle Bay Zeta' : 'Shuttle Bay';
    cycle.results[String(cycleInput.step)] = chosen.length
      ? `${bayName}: refuelled ${chosen.join(', ')}. Spent ${chosen.length} fuel.`
      : `${bayName} powered up. No shuttles refuelled.`;
  }
  cycle.step = action === 'end' ? 0
    : isProduction ? cycleInput.step
    : damage.destroyed ? 7
      : shipId === 'aegis' && cycleInput.step === 7 ? 7
        : cycle.step + 1;
  if (action === 'end') {
    cycle.completedAt = input.now;
    if (cycle.results['7'] === undefined) cycle.results['7'] = 'Maintenance cycle complete.';
  }
  return { cycle, resources, damage, unrest, population, cargo, fuelled, damageDraw };
}
