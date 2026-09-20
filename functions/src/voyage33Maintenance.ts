import { VOYAGE_33_ID, VOYAGE_33_POPULATION } from './voyageAdmission';
import type { ShipResourceInventory } from './resources';
import { maintenanceActionForStep } from './maintenanceOrder';

/**
 * Voyage 33-0 uses the shared docked-vessel maintenance lane, but remains a
 * distinct state from the four optional base small ships.  The source gives
 * this vessel one reactor charge and the existing P234 host-ledger ration
 * table supplies the common four-step host funding contract.
 */
export const VOYAGE_33_MAINTENANCE_RULES = {
  reactorCapacity: 1,
  food: [0, 3, 5, 8] as const,
  water: [0, 2, 3, 6] as const,
} as const;

export interface Voyage33MaintenanceCycle {
  step: number;
  revision: number;
  results: Record<string, string>;
  charges: string[];
  turn?: number;
  rationBonus?: number;
  chargingSkipped?: boolean;
  startedAt?: string;
  completedAt?: string;
}

export interface Voyage33MaintenanceState {
  id: typeof VOYAGE_33_ID;
  hostShipId: string | null;
  dockingRevision: number;
  population: number;
  unrest: number;
  cycle: Voyage33MaintenanceCycle;
}

export interface Voyage33MaintenanceInput {
  readonly state: Voyage33MaintenanceState;
  readonly action: string;
  readonly expectedRevision: number;
  readonly currentTurn: number;
  readonly hostResources: ShipResourceInventory;
  readonly rolls: readonly number[];
  readonly foodLevel?: number;
  readonly waterLevel?: number;
  readonly consoles?: readonly string[];
  readonly now: string;
}

export const emptyVoyage33MaintenanceCycle = (): Voyage33MaintenanceCycle => ({
  step: 0, revision: 0, results: {}, charges: [],
});

export function emptyVoyage33MaintenanceState(hostShipId: string | null = null): Voyage33MaintenanceState {
  return {
    id: VOYAGE_33_ID,
    hostShipId,
    dockingRevision: 0,
    population: VOYAGE_33_POPULATION,
    unrest: 0,
    cycle: emptyVoyage33MaintenanceCycle(),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function safeNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function parseCycle(value: unknown): Voyage33MaintenanceCycle | undefined {
  const raw = record(value);
  const step = safeNonNegative(raw?.step);
  const revision = safeNonNegative(raw?.revision);
  const rawResults = record(raw?.results);
  if (step === undefined || step > 5 || revision === undefined || !rawResults || !Array.isArray(raw?.charges)) {
    return undefined;
  }
  const results: Record<string, string> = {};
  for (const [key, result] of Object.entries(rawResults)) {
    if (/^[1-5]$/.test(key) && typeof result === 'string') results[key] = result;
  }
  const charges = raw.charges.filter((charge): charge is string => typeof charge === 'string');
  if (charges.length !== raw.charges.length ||
      (raw.turn !== undefined && safeNonNegative(raw.turn) === undefined) ||
      (raw.rationBonus !== undefined && (typeof raw.rationBonus !== 'number' || !Number.isFinite(raw.rationBonus))) ||
      (raw.chargingSkipped !== undefined && typeof raw.chargingSkipped !== 'boolean')) return undefined;
  for (const key of ['startedAt', 'completedAt']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') return undefined;
  }
  return {
    step, revision, results, charges,
    ...(raw.turn === undefined ? {} : { turn: raw.turn as number }),
    ...(raw.rationBonus === undefined ? {} : { rationBonus: raw.rationBonus as number }),
    ...(raw.chargingSkipped === undefined ? {} : { chargingSkipped: raw.chargingSkipped as boolean }),
    ...(raw.startedAt === undefined ? {} : { startedAt: raw.startedAt as string }),
    ...(raw.completedAt === undefined ? {} : { completedAt: raw.completedAt as string }),
  };
}

/** Parse a server-owned state, rejecting a forged or incomplete projection. */
export function parseVoyage33MaintenanceState(value: unknown): Voyage33MaintenanceState | undefined {
  const raw = record(value);
  const dockingRevision = safeNonNegative(raw?.dockingRevision);
  const population = safeNonNegative(raw?.population);
  const unrest = safeNonNegative(raw?.unrest);
  const cycle = parseCycle(raw?.cycle);
  if (!raw || raw.id !== VOYAGE_33_ID ||
      (raw.hostShipId !== null && typeof raw.hostShipId !== 'string') ||
      dockingRevision === undefined || population === undefined || population > VOYAGE_33_POPULATION ||
      unrest === undefined || unrest > 10 || !cycle) return undefined;
  return {
    id: VOYAGE_33_ID,
    hostShipId: raw.hostShipId as string | null,
    dockingRevision,
    population,
    unrest,
    cycle,
  };
}

function requireRolls(rolls: readonly number[], count: number): void {
  if (rolls.length < count || rolls.slice(0, count).some((roll) => !Number.isInteger(roll) || roll < 1 || roll > 6)) {
    throw new Error('Server rolls are unavailable.');
  }
}

/** Resolve one Voyage 33-0 maintenance action against its docked host. */
export function advanceVoyage33Maintenance(input: Voyage33MaintenanceInput): {
  readonly state: Voyage33MaintenanceState;
  readonly hostResources: ShipResourceInventory;
} {
  const { state, action } = input;
  const cycleInput = parseVoyage33MaintenanceState(state)?.cycle;
  if (!cycleInput) throw new Error('Malformed Voyage 33-0 maintenance state.');
  if (!state.hostShipId) throw new Error('Voyage 33-0 must be docked with a host ship.');
  if (input.expectedRevision !== cycleInput.revision) throw new Error('Voyage 33-0 maintenance changed. Refresh before proceeding.');
  const expectedAction = maintenanceActionForStep(VOYAGE_33_ID, cycleInput.step);
  if (expectedAction !== action) throw new Error('This Voyage 33-0 action is not available at the current step.');
  if (action === 'begin' && cycleInput.turn === input.currentTurn) {
    throw new Error('Voyage 33-0 maintenance can only be done once per cycle.');
  }
  const cycle: Voyage33MaintenanceCycle = {
    ...cycleInput,
    revision: cycleInput.revision + 1,
    results: { ...cycleInput.results },
    charges: [...cycleInput.charges],
  };
  let hostResources = { ...input.hostResources };
  let population = state.population;
  let unrest = state.unrest;
  if (action === 'begin') {
    cycle.turn = input.currentTurn;
    cycle.results = {};
    cycle.charges = [];
    cycle.rationBonus = 0;
    cycle.chargingSkipped = false;
    cycle.startedAt = input.now;
    delete cycle.completedAt;
  } else if (action === 'rations') {
    const foodLevel = input.foodLevel ?? -1;
    const waterLevel = input.waterLevel ?? -1;
    const food = VOYAGE_33_MAINTENANCE_RULES.food[foodLevel];
    const water = VOYAGE_33_MAINTENANCE_RULES.water[waterLevel];
    if (food === undefined || water === undefined) throw new Error('Select food and water ration levels.');
    if (hostResources.food < food || hostResources.water < water) throw new Error('Host ship cannot fund these rations.');
    hostResources = { ...hostResources, food: hostResources.food - food, water: hostResources.water - water };
    cycle.rationBonus = (foodLevel + waterLevel) * 3;
    cycle.results['1'] = `Spent ${food} food and ${water} water from ${state.hostShipId}. Ration bonus +${cycle.rationBonus}.`;
  } else if (action === 'unrest') {
    requireRolls(input.rolls, 2);
    const total = input.rolls[0]! + input.rolls[1]! + (cycle.rationBonus ?? 0);
    const gain = total < 12 ? 2 : total < 20 ? 1 : 0;
    unrest = Math.min(10, unrest + gain);
    cycle.results['2'] = `Rolled ${input.rolls[0]} + ${input.rolls[1]} + ${cycle.rationBonus ?? 0} = ${total}. Added ${gain} unrest; unrest ${unrest}.`;
  } else if (action === 'riot') {
    requireRolls(input.rolls, 1);
    const roll = input.rolls[0]!;
    const unrestBefore = unrest;
    cycle.chargingSkipped = roll < unrest;
    if (cycle.chargingSkipped) {
      population = Math.max(0, population - roll);
      if (population === 0) unrest = Math.min(10, unrest + 2);
      cycle.results['3'] = `Rolled ${roll} against unrest ${unrestBefore}. Population loss ${roll}; population ${population}${population === 0 ? `; unrest ${unrest}` : ''}. Voyage 33-0 charging is skipped.`;
    } else {
      cycle.results['3'] = `Rolled ${roll} against unrest ${unrestBefore}. No population loss.`;
    }
  } else if (action === 'reactor') {
    const consoles = [...(input.consoles ?? [])];
    if (new Set(consoles).size !== consoles.length || consoles.some((id) => typeof id !== 'string' || id.trim().length === 0)) {
      throw new Error('Choose unique named consoles.');
    }
    if (consoles.length > VOYAGE_33_MAINTENANCE_RULES.reactorCapacity) {
      throw new Error('Voyage 33-0 reactor capacity exceeded.');
    }
    if (cycle.chargingSkipped) {
      if (consoles.length > 0) throw new Error('Charging was skipped after population loss.');
      cycle.charges = [];
      cycle.results['4'] = 'Reactor charging skipped after population loss.';
    } else {
      cycle.charges = consoles;
      cycle.results['4'] = `Reactor powered up. Charged ${consoles.length}/${VOYAGE_33_MAINTENANCE_RULES.reactorCapacity} console.`;
    }
  } else {
    cycle.completedAt = input.now;
    cycle.charges = [];
  }
  cycle.step = action === 'end' ? 0 : cycle.step + 1;
  return {
    state: { ...state, population, unrest, cycle },
    hostResources,
  };
}
