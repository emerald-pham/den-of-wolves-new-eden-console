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
export const RESOURCE_IDS = [
  'ore', 'fuel', 'food', 'water', 'materials', 'securityTeams', 'scrap',
] as const;
export type ResourceId = typeof RESOURCE_IDS[number];

export const INITIAL_SHIP_RESOURCES: ShipResourceInventories = {
  aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
  dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 0, securityTeams: 2 },
  icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 3, securityTeams: 2 },
  shepherd: { ore: 0, fuel: 4, food: 10, water: 8, materials: 0, securityTeams: 2 },
  quellon: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 },
  'refinery-124': { ore: 12, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 },
  capybara: {
    ore: 0,
    fuel: 3,
    food: 9,
    water: 4,
    materials: 0,
    securityTeams: 2,
    scrap: 3,
  },
};

export const INITIAL_SHIP_UNREST: Readonly<Record<string, number>> =
  Object.fromEntries(Object.keys(INITIAL_SHIP_RESOURCES).map((shipId) => [shipId, 0]));

export function isResourceShipId(shipId: string): boolean {
  return Object.prototype.hasOwnProperty.call(INITIAL_SHIP_RESOURCES, shipId);
}

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
  const value = stored[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function shipResources(value: unknown): ShipResourceInventories {
  const storedShips = isRecord(value) ? value : {};
  return Object.fromEntries(Object.entries(INITIAL_SHIP_RESOURCES).map(([shipId, initial]) => {
    const stored = isRecord(storedShips[shipId]) ? storedShips[shipId] : {};
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

export function nextResourceAmount(current: number, delta: -1 | 1): number {
  return Math.max(0, current + delta);
}

export type UnrestChange =
  | { readonly kind: 'applied'; readonly amount: number }
  | { readonly kind: 'overflow'; readonly amount: 8 }
  | { readonly kind: 'blocked' };

export function unrestChange(current: number, delta: -1 | 1, alertPending: boolean): UnrestChange {
  if (alertPending) return { kind: 'blocked' };
  if (current === 7 && delta === 1) return { kind: 'overflow', amount: 8 };
  return { kind: 'applied', amount: Math.max(0, Math.min(10, current + delta)) };
}
