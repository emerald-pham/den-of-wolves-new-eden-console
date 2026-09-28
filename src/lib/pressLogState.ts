const SURVIVOR_CHANGE_CAUSES = [
  'population-adjustment',
  'ship-damage',
  'ship-maintenance',
  'small-ship-maintenance',
  'voyage-33-maintenance',
] as const;

const PRESIDENT_ACTION_KINDS = [
  'fleet-policy', 'crisis', 'political-capital', 'address', 'visit', 'election',
] as const;

type PressLogBase = Readonly<{
  id: string;
  sourceId: string;
  cycle: number;
  recordedAt: string;
}>;

export type PressLogEntry =
  | (PressLogBase & Readonly<{
    type: 'survivor-change';
    cause: typeof SURVIVOR_CHANGE_CAUSES[number];
    vesselId: string;
    fromPopulation: number;
    toPopulation: number;
  }>)
  | (PressLogBase & Readonly<{
    type: 'survivor-transfer';
    shuttleId: string;
    sourceShipId: string;
    destinationShipId: string;
    amount: number;
    sourcePopulationBefore: number;
    sourcePopulationAfter: number;
    destinationPopulationBefore: number;
    destinationPopulationAfter: number;
  }>)
  | (PressLogBase & Readonly<{
    type: 'commissar-purge';
    shipId: string;
    survivorsRemoved: number;
    populationBefore: number;
    populationAfter: number;
    unrestBefore: number;
    unrestAfter: number;
  }>)
  | (PressLogBase & Readonly<{
    type: 'president-action';
    actionKind: typeof PRESIDENT_ACTION_KINDS[number];
    text: string;
  }>);

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function base(id: string, raw: Record<string, unknown>): PressLogBase | null {
  if (!nonEmpty(id) || id.includes('/') || !nonEmpty(raw.sourceId) ||
      !count(raw.cycle) || !nonEmpty(raw.recordedAt) ||
      Number.isNaN(Date.parse(raw.recordedAt))) return null;
  return {
    id,
    sourceId: raw.sourceId,
    cycle: raw.cycle,
    recordedAt: raw.recordedAt,
  };
}

/** Project only the Press-log contract; unexpected stored fields are discarded. */
export function parsePressLogEntry(id: string, value: unknown): PressLogEntry | null {
  const raw = object(value);
  if (!raw) return null;
  const shared = base(id, raw);
  if (!shared) return null;

  if (raw.type === 'survivor-change' &&
      SURVIVOR_CHANGE_CAUSES.includes(raw.cause as typeof SURVIVOR_CHANGE_CAUSES[number]) &&
      nonEmpty(raw.vesselId) && count(raw.fromPopulation) && count(raw.toPopulation) &&
      raw.fromPopulation !== raw.toPopulation) {
    return {
      ...shared,
      type: 'survivor-change',
      cause: raw.cause as typeof SURVIVOR_CHANGE_CAUSES[number],
      vesselId: raw.vesselId,
      fromPopulation: raw.fromPopulation,
      toPopulation: raw.toPopulation,
    };
  }

  if (raw.type === 'survivor-transfer' &&
      nonEmpty(raw.shuttleId) && nonEmpty(raw.sourceShipId) &&
      nonEmpty(raw.destinationShipId) && raw.sourceShipId !== raw.destinationShipId &&
      count(raw.amount) && raw.amount > 0 &&
      count(raw.sourcePopulationBefore) && count(raw.sourcePopulationAfter) &&
      count(raw.destinationPopulationBefore) && count(raw.destinationPopulationAfter) &&
      raw.sourcePopulationBefore - raw.sourcePopulationAfter === raw.amount &&
      raw.destinationPopulationAfter - raw.destinationPopulationBefore === raw.amount) {
    return {
      ...shared,
      type: 'survivor-transfer',
      shuttleId: raw.shuttleId,
      sourceShipId: raw.sourceShipId,
      destinationShipId: raw.destinationShipId,
      amount: raw.amount,
      sourcePopulationBefore: raw.sourcePopulationBefore,
      sourcePopulationAfter: raw.sourcePopulationAfter,
      destinationPopulationBefore: raw.destinationPopulationBefore,
      destinationPopulationAfter: raw.destinationPopulationAfter,
    };
  }

  if (raw.type === 'commissar-purge' && nonEmpty(raw.shipId) &&
      count(raw.survivorsRemoved) && count(raw.populationBefore) && count(raw.populationAfter) &&
      count(raw.unrestBefore) && count(raw.unrestAfter) &&
      raw.populationBefore - raw.populationAfter === raw.survivorsRemoved &&
      raw.survivorsRemoved > 0 && raw.unrestBefore - raw.unrestAfter === 1) {
    return {
      ...shared,
      type: 'commissar-purge',
      shipId: raw.shipId,
      survivorsRemoved: raw.survivorsRemoved,
      populationBefore: raw.populationBefore,
      populationAfter: raw.populationAfter,
      unrestBefore: raw.unrestBefore,
      unrestAfter: raw.unrestAfter,
    };
  }

  if (raw.type === 'president-action' &&
      PRESIDENT_ACTION_KINDS.includes(raw.actionKind as typeof PRESIDENT_ACTION_KINDS[number]) &&
      typeof raw.text === 'string' && raw.text.trim().length > 0 && raw.text.length <= 500) {
    return {
      ...shared,
      type: 'president-action',
      actionKind: raw.actionKind as typeof PRESIDENT_ACTION_KINDS[number],
      text: raw.text,
    };
  }

  return null;
}
