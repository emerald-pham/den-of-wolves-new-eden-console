import type { ShipResourceInventory } from './resources';

/**
 * Shared rules for the four optional base-game small ships.  A small ship is
 * a docked hybrid: it owns its survivor/unrest/charge state, while food and
 * water for its maintenance cycle are taken from the host ship's ledger.
 */
export const SMALL_SHIP_RULES = {
  gorgoneion: {
    name: 'Gorgoneion', population: 1_000, reactorCapacity: 2,
    food: [0, 3, 5, 8], water: [0, 2, 3, 6],
  },
  'capybara-small': {
    name: 'Capybara', population: 2_000, reactorCapacity: 2,
    food: [0, 3, 5, 8], water: [0, 2, 3, 6],
  },
  warrior: {
    name: 'Warrior', population: 2_000, reactorCapacity: 1,
    food: [0, 3, 5, 8], water: [0, 2, 3, 6],
  },
  vulcan: {
    name: 'Vulcan', population: 15_000, reactorCapacity: 2,
    food: [0, 3, 6, 10], water: [0, 2, 4, 7],
  },
} as const;

export type SmallShipId = keyof typeof SMALL_SHIP_RULES;
export const SMALL_SHIP_IDS: readonly SmallShipId[] = Object.keys(SMALL_SHIP_RULES) as SmallShipId[];

export interface SmallShipMaintenanceCycle {
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

export interface SmallShipState {
  id: SmallShipId;
  hostShipId: string | null;
  dockingRevision: number;
  population: number;
  unrest: number;
  cycle: SmallShipMaintenanceCycle;
}

export interface SmallShipMaintenanceInput {
  readonly state: SmallShipState;
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

export const emptySmallShipCycle = (): SmallShipMaintenanceCycle => ({
  step: 0, revision: 0, results: {}, charges: [],
});

export function emptySmallShipState(id: SmallShipId, hostShipId: string | null = null): SmallShipState {
  return {
    id,
    hostShipId,
    dockingRevision: 0,
    population: SMALL_SHIP_RULES[id].population,
    unrest: 0,
    cycle: emptySmallShipCycle(),
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

function parseCycle(value: unknown): SmallShipMaintenanceCycle | undefined {
  const raw = record(value);
  const step = safeNonNegative(raw?.step);
  const revision = safeNonNegative(raw?.revision);
  if (step === undefined || step > 5 || revision === undefined ||
      !Array.isArray(raw?.charges)) return undefined;
  const rawResults = record(raw?.results);
  if (!rawResults) return undefined;
  const results: Record<string, string> = {};
  for (const [key, result] of Object.entries(rawResults)) {
    if (/^[1-4]$/.test(key) && typeof result === 'string') results[key] = result;
  }
  const charges = raw.charges.filter((charge): charge is string => typeof charge === 'string');
  if (charges.length !== raw.charges.length) return undefined;
  if (raw.turn !== undefined && safeNonNegative(raw.turn) === undefined) return undefined;
  if (raw.rationBonus !== undefined &&
      (typeof raw.rationBonus !== 'number' || !Number.isFinite(raw.rationBonus))) return undefined;
  if (raw.chargingSkipped !== undefined && typeof raw.chargingSkipped !== 'boolean') return undefined;
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

/** Parse a public/server state without restoring malformed present values. */
export function parseSmallShipState(value: unknown, id: SmallShipId): SmallShipState | undefined {
  const raw = record(value);
  if (!raw || raw.id !== id || (raw.hostShipId !== null && typeof raw.hostShipId !== 'string')) return undefined;
  const dockingRevision = safeNonNegative(raw.dockingRevision);
  const population = safeNonNegative(raw.population);
  const unrest = safeNonNegative(raw.unrest);
  const cycle = parseCycle(raw.cycle);
  if (dockingRevision === undefined || population === undefined || population > SMALL_SHIP_RULES[id].population ||
      unrest === undefined || unrest > 10 || !cycle) return undefined;
  return {
    id,
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

/** Execute one revision-checked, server-rolled small-ship maintenance action. */
export function advanceSmallShipMaintenance(input: SmallShipMaintenanceInput): {
  readonly state: SmallShipState;
  readonly hostResources: ShipResourceInventory;
} {
  const { state, action } = input;
  const cycleInput = parseSmallShipState(state, state.id)?.cycle;
  if (!cycleInput) throw new Error('Malformed small-ship state.');
  if (!state.hostShipId) throw new Error('Small ship must be docked with a host ship.');
  if (input.expectedRevision !== cycleInput.revision) throw new Error('Small-ship maintenance changed. Refresh before proceeding.');
  const expectedAction = cycleInput.step === 0 ? 'begin'
    : cycleInput.step === 1 ? 'rations'
      : cycleInput.step === 2 ? 'unrest'
        : cycleInput.step === 3 ? 'riot'
          : cycleInput.step === 4 ? 'reactor' : 'end';
  if (expectedAction !== action) throw new Error('This small-ship action is not available at the current step.');
  if (action === 'begin' && cycleInput.turn === input.currentTurn) {
    throw new Error('Small-ship maintenance can only be done once per turn.');
  }
  const rules = SMALL_SHIP_RULES[state.id];
  const cycle: SmallShipMaintenanceCycle = {
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
    const food = rules.food[foodLevel];
    const water = rules.water[waterLevel];
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
      cycle.results['3'] = `Rolled ${roll} against unrest ${unrestBefore}. Population loss ${roll}; population ${population}${population === 0 ? `; unrest ${unrest}` : ''}. Small-ship charging is skipped.`;
    } else {
      cycle.results['3'] = `Rolled ${roll} against unrest ${unrestBefore}. No population loss.`;
    }
  } else if (action === 'reactor') {
    const consoles = [...(input.consoles ?? [])];
    if (new Set(consoles).size !== consoles.length || consoles.some((id) => typeof id !== 'string' || id.trim().length === 0)) {
      throw new Error('Choose unique named consoles.');
    }
    if (cycle.chargingSkipped) {
      if (consoles.length > 0) throw new Error('Charging was skipped after population loss.');
      cycle.charges = [];
      cycle.results['4'] = 'Reactor charging skipped after population loss.';
    } else {
      if (consoles.length > rules.reactorCapacity) throw new Error('Small-ship reactor capacity exceeded.');
      cycle.charges = consoles;
      cycle.results['4'] = `Reactor powered up. Charged ${consoles.length}/${rules.reactorCapacity} consoles.`;
    }
  } else if (action === 'end') {
    cycle.completedAt = input.now;
    cycle.charges = [];
  }
  cycle.step = action === 'end' ? 0 : cycle.step + 1;
  return {
    state: {
      ...state,
      population,
      unrest,
      cycle,
    },
    hostResources,
  };
}
