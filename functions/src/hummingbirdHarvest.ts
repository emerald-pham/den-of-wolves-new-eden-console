import { addResourceAmount } from './resources';

export type HummingbirdHarvestStatus = 'pending' | 'resolved';

export interface HummingbirdHarvestState {
  readonly sessionId: string;
  readonly ownerUid: string;
  readonly turn: number;
  readonly hostShipId: string;
  readonly revision: number;
  readonly status: HummingbirdHarvestStatus;
  readonly rolls: readonly [number, number];
  readonly foodDieIndex?: 0 | 1;
  readonly food?: number;
  readonly water?: number;
  readonly requestId: string;
  readonly createdAt: string;
  readonly resolvedAt?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function die(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 6
    ? value : undefined;
}

/** Parse a private harvest state without widening malformed state into authority. */
export function parseHummingbirdHarvestState(value: unknown): HummingbirdHarvestState | undefined {
  const raw = record(value);
  const turn = nonNegativeInteger(raw?.turn);
  const revision = nonNegativeInteger(raw?.revision);
  const rolls = Array.isArray(raw?.rolls) && raw.rolls.length === 2
    ? [die(raw.rolls[0]), die(raw.rolls[1])] : undefined;
  const foodDieIndex = raw?.foodDieIndex === 0 || raw?.foodDieIndex === 1
    ? raw.foodDieIndex : undefined;
  const food = nonNegativeInteger(raw?.food);
  const water = nonNegativeInteger(raw?.water);
  if (
    typeof raw?.sessionId !== 'string' || typeof raw.ownerUid !== 'string' ||
    turn === undefined || revision === undefined ||
    !rolls || rolls[0] === undefined || rolls[1] === undefined ||
    typeof raw.hostShipId !== 'string' ||
    (raw.status !== 'pending' && raw.status !== 'resolved') ||
    typeof raw.requestId !== 'string' || typeof raw.createdAt !== 'string'
  ) return undefined;
  if (raw.status === 'pending' && (foodDieIndex !== undefined || food !== undefined || water !== undefined)) {
    return undefined;
  }
  if (raw.status === 'resolved' &&
      (foodDieIndex === undefined || food === undefined || water === undefined ||
       typeof raw.resolvedAt !== 'string' ||
       food !== rolls[foodDieIndex] || water !== rolls[foodDieIndex === 0 ? 1 : 0])) {
    return undefined;
  }
  return {
    sessionId: raw.sessionId,
    ownerUid: raw.ownerUid,
    turn,
    hostShipId: raw.hostShipId,
    revision,
    status: raw.status,
    rolls: [rolls[0], rolls[1]],
    ...(foodDieIndex === undefined ? {} : { foodDieIndex }),
    ...(food === undefined ? {} : { food }),
    ...(water === undefined ? {} : { water }),
    requestId: raw.requestId,
    createdAt: raw.createdAt,
    ...(typeof raw.resolvedAt === 'string' ? { resolvedAt: raw.resolvedAt } : {}),
  };
}

export function resolvedHarvestValues(
  rolls: readonly [number, number],
  foodDieIndex: 0 | 1,
): { readonly food: number; readonly water: number } {
  return {
    food: rolls[foodDieIndex],
    water: rolls[foodDieIndex === 0 ? 1 : 0],
  };
}

export function addHarvestToCargo(
  cargo: Readonly<{ readonly food: number; readonly water: number }>,
  rolls: readonly [number, number],
  foodDieIndex: 0 | 1,
): { readonly food: number; readonly water: number } {
  const values = resolvedHarvestValues(rolls, foodDieIndex);
  return {
    food: addResourceAmount(cargo.food, values.food),
    water: addResourceAmount(cargo.water, values.water),
  };
}
