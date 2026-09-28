import { createHash } from 'node:crypto';
import { PRESIDENT_ACTION_KINDS, type PresidentActionKind } from './presidentWorkspace';

export const SURVIVOR_CHANGE_CAUSES = [
  'population-adjustment',
  'ship-damage',
  'ship-maintenance',
  'small-ship-maintenance',
  'voyage-33-maintenance',
] as const;

export type SurvivorChangeCause = typeof SURVIVOR_CHANGE_CAUSES[number];

export type PressLogEvent =
  | Readonly<{
    type: 'survivor-change';
    sourceId: string;
    cause: SurvivorChangeCause;
    vesselId: string;
    cycle: number;
    recordedAt: string;
    fromPopulation: number;
    toPopulation: number;
  }>
  | Readonly<{
    type: 'survivor-transfer';
    sourceId: string;
    shuttleId: string;
    sourceShipId: string;
    destinationShipId: string;
    cycle: number;
    recordedAt: string;
    amount: number;
    sourcePopulationBefore: number;
    sourcePopulationAfter: number;
    destinationPopulationBefore: number;
    destinationPopulationAfter: number;
  }>
  | Readonly<{
    type: 'commissar-purge';
    sourceId: string;
    shipId: string;
    cycle: number;
    recordedAt: string;
    survivorsRemoved: number;
    populationBefore: number;
    populationAfter: number;
    unrestBefore: number;
    unrestAfter: number;
  }>
  | Readonly<{
    type: 'president-action';
    sourceId: string;
    actionKind: PresidentActionKind;
    text: string;
    cycle: number;
    recordedAt: string;
  }>;

type EventEnvelopeInput = Readonly<{
  sourceId: string;
  cycle: number;
  recordedAt: string;
}>;

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must not be empty.`);
  return normalized;
}

function counter(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer.`);
  }
  return value;
}

function envelope(input: EventEnvelopeInput): EventEnvelopeInput {
  const sourceId = nonEmpty(input.sourceId, 'sourceId');
  const cycle = counter(input.cycle, 'cycle');
  if (Number.isNaN(Date.parse(input.recordedAt))) {
    throw new Error('recordedAt must be a valid timestamp.');
  }
  return { sourceId, cycle, recordedAt: input.recordedAt };
}

export function buildSurvivorChangePressLogEntry(input: EventEnvelopeInput & Readonly<{
  cause: SurvivorChangeCause;
  vesselId: string;
  fromPopulation: number;
  toPopulation: number;
}>): PressLogEvent {
  if (!SURVIVOR_CHANGE_CAUSES.includes(input.cause)) {
    throw new Error('Unknown survivor change cause.');
  }
  const fromPopulation = counter(input.fromPopulation, 'fromPopulation');
  const toPopulation = counter(input.toPopulation, 'toPopulation');
  if (fromPopulation === toPopulation) throw new Error('A survivor change must change the population.');
  return {
    type: 'survivor-change',
    ...envelope(input),
    cause: input.cause,
    vesselId: nonEmpty(input.vesselId, 'vesselId'),
    fromPopulation,
    toPopulation,
  };
}

export function buildShuttleSurvivorTransferPressLogEntry(input: EventEnvelopeInput & Readonly<{
  shuttleId: string;
  sourceShipId: string;
  destinationShipId: string;
  amount: number;
  sourcePopulationBefore: number;
  sourcePopulationAfter: number;
  destinationPopulationBefore: number;
  destinationPopulationAfter: number;
}>): PressLogEvent {
  const amount = counter(input.amount, 'amount');
  const sourcePopulationBefore = counter(input.sourcePopulationBefore, 'sourcePopulationBefore');
  const sourcePopulationAfter = counter(input.sourcePopulationAfter, 'sourcePopulationAfter');
  const destinationPopulationBefore = counter(input.destinationPopulationBefore, 'destinationPopulationBefore');
  const destinationPopulationAfter = counter(input.destinationPopulationAfter, 'destinationPopulationAfter');
  const sourceShipId = nonEmpty(input.sourceShipId, 'sourceShipId');
  const destinationShipId = nonEmpty(input.destinationShipId, 'destinationShipId');
  if (amount === 0 || sourceShipId === destinationShipId ||
      sourcePopulationBefore - sourcePopulationAfter !== amount ||
      destinationPopulationAfter - destinationPopulationBefore !== amount) {
    throw new Error('Survivor transfer must match both vessel population changes.');
  }
  return {
    type: 'survivor-transfer',
    ...envelope(input),
    shuttleId: nonEmpty(input.shuttleId, 'shuttleId'),
    sourceShipId,
    destinationShipId,
    amount,
    sourcePopulationBefore,
    sourcePopulationAfter,
    destinationPopulationBefore,
    destinationPopulationAfter,
  };
}

export function buildCommissarPurgePressLogEntry(input: EventEnvelopeInput & Readonly<{
  shipId: string;
  populationBefore: number;
  populationAfter: number;
  unrestBefore: number;
  unrestAfter: number;
}>): PressLogEvent {
  const populationBefore = counter(input.populationBefore, 'populationBefore');
  const populationAfter = counter(input.populationAfter, 'populationAfter');
  const unrestBefore = counter(input.unrestBefore, 'unrestBefore');
  const unrestAfter = counter(input.unrestAfter, 'unrestAfter');
  const survivorsRemoved = populationBefore - populationAfter;
  if (survivorsRemoved <= 0) throw new Error('A Commissar purge must remove survivors.');
  if (unrestBefore - unrestAfter !== 1) {
    throw new Error('A Commissar purge must record one point of unrest reduction.');
  }
  return {
    type: 'commissar-purge',
    ...envelope(input),
    shipId: nonEmpty(input.shipId, 'shipId'),
    survivorsRemoved,
    populationBefore,
    populationAfter,
    unrestBefore,
    unrestAfter,
  };
}

export function buildPresidentActionPressLogEntry(input: EventEnvelopeInput & Readonly<{
  actionKind: PresidentActionKind;
  text: string;
}>): PressLogEvent {
  const text = input.text.trim();
  if (!PRESIDENT_ACTION_KINDS.includes(input.actionKind) || !text || text.length > 500) {
    throw new Error('Invalid President action for the Press log.');
  }
  return {
    type: 'president-action',
    ...envelope(input),
    actionKind: input.actionKind,
    text,
  };
}

/** Stable per-source document IDs make retries and transaction recovery idempotent. */
export function pressLogDocumentId(event: PressLogEvent): string {
  const digest = createHash('sha256')
    .update(`${event.type}\u0000${event.sourceId}`, 'utf8')
    .digest('hex');
  return `press-${digest}`;
}
