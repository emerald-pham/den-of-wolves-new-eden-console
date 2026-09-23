import { isResourceShipId } from './resources';
import { BOA_RECYCLING_LIMIT_PER_CYCLE, type BoaRecyclingRecipeId } from './boaRecycling';

export interface BoaRecyclingCallableCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly recipeId: BoaRecyclingRecipeId;
  readonly expectedControlRevision: number;
  readonly expectedRecyclingRevision: number;
  readonly expectedCycle: number;
  readonly expectedHostShipId: string;
}

export interface BoaRecyclingCommandFingerprint {
  readonly action: 'boa-recycling';
  readonly sessionId: string;
  readonly requestId: string;
  readonly actorUid: string;
  readonly instanceId: null;
  readonly expectedRevision: number;
  readonly payload: Readonly<{
    recipeId: BoaRecyclingRecipeId;
    expectedControlRevision: number;
    expectedCycle: number;
    hostShipId: string;
  }>;
}

export interface BoaRecyclingCallableReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: 'boa';
  readonly hostShipId: string;
  readonly recipeId: BoaRecyclingRecipeId;
  readonly resourceId: 'food' | 'water' | 'ore' | 'materials' | 'fuel';
  readonly resourceCost: 3 | 6;
  readonly hostResourceRemaining: number;
  readonly scrapRemaining: number;
  readonly cycle: number;
  readonly recyclingRevision: number;
  readonly exchangesThisCycle: number;
}

const RECIPE_IDS: readonly BoaRecyclingRecipeId[] = ['food', 'water', 'ore', 'materials', 'fuel'];
const RECIPE_COSTS: Readonly<Record<BoaRecyclingRecipeId, Readonly<{ resourceId: string; cost: 3 | 6 }>>> = {
  food: { resourceId: 'food', cost: 6 },
  water: { resourceId: 'water', cost: 6 },
  ore: { resourceId: 'ore', cost: 6 },
  materials: { resourceId: 'materials', cost: 3 },
  fuel: { resourceId: 'fuel', cost: 6 },
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseBoaRecyclingCallableCommand(value: unknown): BoaRecyclingCallableCommand | null {
  const raw = record(value);
  const fields = [
    'sessionId', 'requestId', 'recipeId', 'expectedControlRevision',
    'expectedRecyclingRevision', 'expectedCycle', 'expectedHostShipId',
  ];
  if (!raw || Object.keys(raw).length !== fields.length || fields.some((key) => !Object.hasOwn(raw, key)) ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId) ||
      typeof raw.requestId !== 'string' || !/^[\w-]{1,128}$/.test(raw.requestId) ||
      !RECIPE_IDS.includes(raw.recipeId as BoaRecyclingRecipeId) ||
      !isSafeCounter(raw.expectedControlRevision) ||
      !Number.isSafeInteger(raw.expectedRecyclingRevision) || (raw.expectedRecyclingRevision as number) < 0 ||
      (raw.expectedRecyclingRevision as number) >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(raw.expectedCycle) || (raw.expectedCycle as number) < 1 ||
      typeof raw.expectedHostShipId !== 'string' || !isResourceShipId(raw.expectedHostShipId)) return null;
  return {
    sessionId: raw.sessionId,
    requestId: raw.requestId,
    recipeId: raw.recipeId as BoaRecyclingRecipeId,
    expectedControlRevision: raw.expectedControlRevision,
    expectedRecyclingRevision: raw.expectedRecyclingRevision as number,
    expectedCycle: raw.expectedCycle as number,
    expectedHostShipId: raw.expectedHostShipId,
  };
}

export function boaRecyclingCommandFingerprint(
  actorUid: string,
  command: BoaRecyclingCallableCommand,
): BoaRecyclingCommandFingerprint {
  if (!actorUid) throw new Error('A current actor is required to bind Boa recycling replay.');
  return {
    action: 'boa-recycling',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid,
    instanceId: null,
    expectedRevision: command.expectedRecyclingRevision,
    payload: {
      recipeId: command.recipeId,
      expectedControlRevision: command.expectedControlRevision,
      expectedCycle: command.expectedCycle,
      hostShipId: command.expectedHostShipId,
    },
  };
}

export function isBoaRecyclingCallableReply(
  value: unknown,
  fingerprint: BoaRecyclingCommandFingerprint,
): value is BoaRecyclingCallableReply {
  const raw = record(value);
  const fields = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId', 'recipeId',
    'resourceId', 'resourceCost', 'hostResourceRemaining', 'scrapRemaining',
    'cycle', 'recyclingRevision', 'exchangesThisCycle',
  ];
  return Boolean(raw && Object.keys(raw).length === fields.length && fields.every((key) => Object.hasOwn(raw, key)) &&
    (raw.status === 'committed' || raw.status === 'replayed') &&
    raw.sessionId === fingerprint.sessionId && raw.requestId === fingerprint.requestId &&
    raw.shuttleId === 'boa' && raw.hostShipId === fingerprint.payload.hostShipId &&
    raw.recipeId === fingerprint.payload.recipeId && RECIPE_IDS.includes(raw.recipeId as BoaRecyclingRecipeId) &&
    raw.resourceId === RECIPE_COSTS[fingerprint.payload.recipeId].resourceId &&
    raw.resourceCost === RECIPE_COSTS[fingerprint.payload.recipeId].cost &&
    isSafeCounter(raw.hostResourceRemaining) && isSafeCounter(raw.scrapRemaining) &&
    raw.cycle === fingerprint.payload.expectedCycle &&
    Number.isSafeInteger(raw.recyclingRevision) &&
    raw.recyclingRevision === fingerprint.expectedRevision + 1 &&
    Number.isSafeInteger(raw.exchangesThisCycle) &&
    (raw.exchangesThisCycle as number) >= 1 &&
    (raw.exchangesThisCycle as number) <= BOA_RECYCLING_LIMIT_PER_CYCLE);
}
