import { SHIPS } from './ships';

export type ResourceId =
  | 'ore'
  | 'fuel'
  | 'food'
  | 'water'
  | 'materials'
  | 'securityTeams'
  | 'scrap';

export interface ResourceDefinition {
  readonly id: ResourceId;
  readonly label: string;
  readonly notes: string;
}

export interface ShipResourceInventory {
  readonly ore: number;
  readonly fuel: number;
  readonly food: number;
  readonly water: number;
  readonly materials: number;
  readonly securityTeams: number;
  readonly scrap?: number;
}

export type ShipResourceInventories = Readonly<Record<string, ShipResourceInventory>>;
export const RESOURCE_DEFINITIONS: readonly ResourceDefinition[] = [
  { id: 'ore', label: 'Strytium Ore', notes: 'Refined into fuel by Refinery 124 / Capybara' },
  { id: 'fuel', label: 'Strytium Fuel', notes: 'Jump drives, shuttle refuelling' },
  { id: 'food', label: 'Food', notes: 'Maintenance rations' },
  { id: 'water', label: 'Water', notes: 'Maintenance rations' },
  { id: 'materials', label: 'Materials', notes: 'Repairs, upgrades, fighters' },
  { id: 'securityTeams', label: 'Security Teams', notes: 'Boarding defence' },
  { id: 'scrap', label: 'Scrap', notes: 'Capybara expansion only' },
];

export const INITIAL_SHIP_RESOURCES: ShipResourceInventories =
  Object.fromEntries(SHIPS.map((ship) => [ship.id, ship.resources]));

export const INITIAL_SHIP_UNREST: Readonly<Record<string, number>> =
  Object.fromEntries(Object.keys(INITIAL_SHIP_RESOURCES).map((shipId) => [shipId, 0]));

export function shipUnrest(value: unknown): Readonly<Record<string, number>> {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_RESOURCES).map((shipId) => {
    const amount = stored[shipId];
    return [shipId, typeof amount === 'number' && Number.isFinite(amount)
      ? Math.max(0, Math.min(10, amount))
      : 0];
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function storedNumber(stored: Record<string, unknown>, key: string, fallback: number): number {
  if (!Object.prototype.hasOwnProperty.call(stored, key)) return fallback;
  const value = stored[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function emptyInventory(initial: ShipResourceInventory): ShipResourceInventory {
  return {
    ore: 0,
    fuel: 0,
    food: 0,
    water: 0,
    materials: 0,
    securityTeams: 0,
    ...(initial.scrap === undefined ? {} : { scrap: 0 }),
  };
}

export function shipResources(value: unknown): ShipResourceInventories {
  const rootPresent = value !== undefined;
  const storedShips = isRecord(value) ? value : {};
  const malformedRoot = rootPresent && !isRecord(value);
  return Object.fromEntries(Object.entries(INITIAL_SHIP_RESOURCES).map(([shipId, initial]) => {
    if (malformedRoot) return [shipId, emptyInventory(initial)];
    const shipPresent = Object.prototype.hasOwnProperty.call(storedShips, shipId);
    if (shipPresent && !isRecord(storedShips[shipId])) return [shipId, emptyInventory(initial)];
    const stored = shipPresent ? storedShips[shipId] as Record<string, unknown> : {};
    const inventory: ShipResourceInventory = {
      ore: storedNumber(stored, 'ore', initial.ore),
      fuel: storedNumber(stored, 'fuel', initial.fuel),
      food: storedNumber(stored, 'food', initial.food),
      water: storedNumber(stored, 'water', initial.water),
      materials: storedNumber(stored, 'materials', initial.materials),
      securityTeams: storedNumber(stored, 'securityTeams', initial.securityTeams),
      ...(initial.scrap === undefined
        ? {}
        : { scrap: storedNumber(stored, 'scrap', initial.scrap) }),
    };
    return [shipId, inventory];
  }));
}

export function resourcesForShip(
  shipId: string,
  stored?: unknown,
): ShipResourceInventory | undefined {
  return shipResources(stored)[shipId];
}
