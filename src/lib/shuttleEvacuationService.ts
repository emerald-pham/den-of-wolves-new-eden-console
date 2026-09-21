import { httpsCallable } from 'firebase/functions';
import { populationTrackForShip } from '@/data/shipPopulation';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

export const MAX_SHUTTLE_EVACUATION_PER_CYCLE = 5_000;

export function validShuttleEvacuationAmounts(input: Readonly<{
  sourceShipId: string;
  destinationShipId: string;
  sourcePopulation: number;
  destinationPopulation: number;
  remaining: number;
}>): readonly number[] {
  const source = populationTrackForShip(input.sourceShipId);
  const destination = populationTrackForShip(input.destinationShipId);
  if (!source?.steps.includes(input.sourcePopulation) ||
      !destination?.steps.includes(input.destinationPopulation) || input.remaining < 1) return [];
  const destinationIncreases = new Set(destination.steps
    .filter((population) => population > input.destinationPopulation)
    .map((population) => population - input.destinationPopulation));
  return source.steps
    .filter((population) => population < input.sourcePopulation)
    .map((population) => input.sourcePopulation - population)
    .filter((amount) => amount <= input.remaining && amount <= MAX_SHUTTLE_EVACUATION_PER_CYCLE &&
      destinationIncreases.has(amount))
    .sort((left, right) => left - right);
}

export async function evacuateShuttleSurvivors(
  shuttleId: string,
  destinationShipId: string,
  amount: number,
  expectedControlRevision: number,
  expectedEvacuationRevision: number,
): Promise<void> {
  const { session } = useSessionStore.getState();
  if (!session || !Number.isSafeInteger(session.currentTurn) || (session.currentTurn ?? 0) < 1) {
    throw new Error('Reconnect during an active cycle before evacuating survivors.');
  }
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id, requestId: window.crypto.randomUUID(), shuttleId,
    destinationShipId, amount, expectedControlRevision,
    expectedCycle: session.currentTurn!, expectedEvacuationRevision,
  };
  await httpsCallable<typeof payload, unknown>(functions(), 'evacuateShuttleSurvivorsCommand')(payload);
}
