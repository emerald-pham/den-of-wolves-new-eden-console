import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { BoaRecyclingRecipeId } from '../../functions/src/boaRecycling';

const RECIPE_COSTS: Readonly<Record<BoaRecyclingRecipeId, Readonly<{
  resourceId: BoaRecyclingResult['resourceId'];
  cost: 3 | 6;
}>>> = {
  food: { resourceId: 'food', cost: 6 },
  water: { resourceId: 'water', cost: 6 },
  ore: { resourceId: 'ore', cost: 6 },
  materials: { resourceId: 'materials', cost: 3 },
  fuel: { resourceId: 'fuel', cost: 6 },
};

export interface BoaRecyclingCommand {
  readonly requestId: string;
  readonly recipeId: BoaRecyclingRecipeId;
  readonly expectedControlRevision: number;
  readonly expectedRecyclingRevision: number;
  readonly expectedCycle: number;
  readonly expectedHostShipId: string;
}

export interface BoaRecyclingResult {
  readonly status: 'committed' | 'replayed';
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

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export async function recycleWithBoa(command: BoaRecyclingCommand): Promise<BoaRecyclingResult> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before recycling with Boa.');
  requireFreshSessionAuthority();
  if (!/^[\w-]{1,128}$/.test(command.requestId) ||
      !['food', 'water', 'ore', 'materials', 'fuel'].includes(command.recipeId) ||
      !isSafeCounter(command.expectedControlRevision) ||
      !Number.isSafeInteger(command.expectedRecyclingRevision) || command.expectedRecyclingRevision < 0 ||
      command.expectedRecyclingRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      !/^[\w-]{1,128}$/.test(command.expectedHostShipId)) {
    throw new Error('The Boa recycling request is invalid. Refresh the console and try again.');
  }
  const payload = {
    sessionId: session.id,
    requestId: command.requestId,
    recipeId: command.recipeId,
    expectedControlRevision: command.expectedControlRevision,
    expectedRecyclingRevision: command.expectedRecyclingRevision,
    expectedCycle: command.expectedCycle,
    expectedHostShipId: command.expectedHostShipId,
  };
  const response = await httpsCallable<typeof payload, unknown>(functions(), 'recycleWithBoa')(payload);
  const value = response.data;
  const fields = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId', 'recipeId',
    'resourceId', 'resourceCost', 'hostResourceRemaining', 'scrapRemaining',
    'cycle', 'recyclingRevision', 'exchangesThisCycle',
  ];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The Boa recycling response was malformed.');
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== fields.length || fields.some((key) => !Object.hasOwn(result, key)) ||
      (result.status !== 'committed' && result.status !== 'replayed') ||
      result.sessionId !== session.id || result.requestId !== command.requestId || result.shuttleId !== 'boa' ||
      result.hostShipId !== command.expectedHostShipId || result.recipeId !== command.recipeId ||
      result.resourceId !== RECIPE_COSTS[command.recipeId].resourceId ||
      result.resourceCost !== RECIPE_COSTS[command.recipeId].cost ||
      !isSafeCounter(result.hostResourceRemaining) || !isSafeCounter(result.scrapRemaining) ||
      result.cycle !== command.expectedCycle || !Number.isSafeInteger(result.recyclingRevision) ||
      result.recyclingRevision !== command.expectedRecyclingRevision + 1 ||
      !Number.isSafeInteger(result.exchangesThisCycle) ||
      (result.exchangesThisCycle as number) < 1 || (result.exchangesThisCycle as number) > 2) {
    throw new Error('The Boa recycling response was malformed.');
  }
  return {
    status: result.status,
    hostShipId: result.hostShipId as string,
    recipeId: result.recipeId as BoaRecyclingRecipeId,
    resourceId: result.resourceId as BoaRecyclingResult['resourceId'],
    resourceCost: result.resourceCost as 3 | 6,
    hostResourceRemaining: result.hostResourceRemaining as number,
    scrapRemaining: result.scrapRemaining as number,
    cycle: result.cycle as number,
    recyclingRevision: result.recyclingRevision as number,
    exchangesThisCycle: result.exchangesThisCycle as number,
  };
}
