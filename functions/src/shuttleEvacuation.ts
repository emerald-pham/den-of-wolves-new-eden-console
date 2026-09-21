import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import { SHUTTLE_CARGO_TYPES } from './shuttleCargoTransfer';
import { INITIAL_SHIP_SURVIVORS, populationTrackForShip } from './shipPopulation';

export const MAX_SHUTTLE_EVACUATION_PER_CYCLE = 5_000;

export interface ShuttleEvacuationLedgerEntry {
  readonly cycle: number;
  readonly moved: number;
  readonly revision: number;
}

export interface ShuttleEvacuationResult {
  readonly shuttleId: string;
  readonly sourceShipId: string;
  readonly destinationShipId: string;
  readonly amount: number;
  readonly sourcePopulation: number;
  readonly destinationPopulation: number;
  readonly ledger: ShuttleEvacuationLedgerEntry;
}

export function parseShuttleEvacuations(value: unknown): Record<string, ShuttleEvacuationLedgerEntry> | null {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const parsed: Record<string, ShuttleEvacuationLedgerEntry> = {};
  for (const [shuttleId, entry] of Object.entries(value)) {
    if (!SHUTTLE_CARGO_TYPES[shuttleId] || typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return null;
    }
    const raw = entry as Record<string, unknown>;
    if (Object.keys(raw).some((key) => !['cycle', 'moved', 'revision'].includes(key)) ||
        !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 0 ||
        !Number.isSafeInteger(raw.moved) || (raw.moved as number) < 0 ||
        (raw.moved as number) > MAX_SHUTTLE_EVACUATION_PER_CYCLE ||
        !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0) return null;
    parsed[shuttleId] = raw as unknown as ShuttleEvacuationLedgerEntry;
  }
  return parsed;
}

export function evacuateShuttleSurvivors(input: Readonly<{
  actorUid: string;
  shuttleId: string;
  destinationShipId: string;
  amount: number;
  cycle: number;
  expectedCycle: number;
  expectedControlRevision: number;
  expectedEvacuationRevision: number;
  control: ShuttleControlEntry;
  dockings: readonly AuthoritativeShuttleDocking[];
  groupVesselIds: readonly string[];
  activeVesselIds: readonly string[];
  shipSurvivors: unknown;
  evacuationLedger: unknown;
}>): ShuttleEvacuationResult {
  if (!SHUTTLE_CARGO_TYPES[input.shuttleId]) {
    throw new Error('Only a shuttle with Cargo Transfer may evacuate survivors.');
  }
  if (input.control?.shuttleId !== input.shuttleId || input.control.holderUid !== input.actorUid) {
    throw new Error('Only the current shuttle holder may evacuate survivors.');
  }
  if (input.control.revision !== input.expectedControlRevision) {
    throw new Error('Shuttle control changed; refresh before evacuating survivors.');
  }
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 1 || input.expectedCycle !== input.cycle) {
    throw new Error('The cycle changed; refresh before evacuating survivors.');
  }
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 ||
      input.amount > MAX_SHUTTLE_EVACUATION_PER_CYCLE) {
    throw new Error('Evacuation amount must be a positive whole number no greater than 5,000.');
  }
  const currentDockings = input.dockings.filter((docking) => docking.shuttleId === input.shuttleId);
  if (currentDockings.length !== 1) {
    throw new Error('Survivors may move only while the shuttle is docked at one host ship.');
  }
  const sourceShipId = currentDockings[0]!.shipId;
  if (sourceShipId === input.destinationShipId) throw new Error('Choose another ship to receive survivors.');
  if (!input.activeVesselIds.includes(sourceShipId) || !input.activeVesselIds.includes(input.destinationShipId) ||
      !input.groupVesselIds.includes(sourceShipId) || !input.groupVesselIds.includes(input.destinationShipId)) {
    throw new Error('Both ships must be active members of the shuttle holder’s fleet group.');
  }
  if (typeof input.shipSurvivors !== 'object' || input.shipSurvivors === null ||
      Array.isArray(input.shipSurvivors)) throw new Error('The survivor ledger is malformed.');
  const survivorRoot = input.shipSurvivors as Record<string, unknown>;
  const sourcePopulation = survivorRoot[sourceShipId];
  const destinationPopulation = survivorRoot[input.destinationShipId];
  if (!Number.isSafeInteger(sourcePopulation) || (sourcePopulation as number) < 0 ||
      !Number.isSafeInteger(destinationPopulation) || (destinationPopulation as number) < 0) {
    throw new Error('Both ships require an authoritative survivor count.');
  }
  const sourceTrack = populationTrackForShip(sourceShipId);
  const destinationTrack = populationTrackForShip(input.destinationShipId);
  const nextSource = (sourcePopulation as number) - input.amount;
  const nextDestination = (destinationPopulation as number) + input.amount;
  if (nextDestination > (INITIAL_SHIP_SURVIVORS[input.destinationShipId] ?? -1)) {
    throw new Error('The receiving ship cannot exceed its starting maximum population.');
  }
  if (!sourceTrack?.steps.includes(sourcePopulation as number) || !sourceTrack.steps.includes(nextSource) ||
      !destinationTrack?.steps.includes(destinationPopulation as number) ||
      !destinationTrack.steps.includes(nextDestination)) {
    throw new Error('The transfer must leave both survivor counters on their printed tracks.');
  }
  const ledger = parseShuttleEvacuations(input.evacuationLedger);
  if (!ledger) throw new Error('The shuttle evacuation ledger is malformed.');
  const previous = ledger[input.shuttleId];
  const revision = previous?.revision ?? 0;
  if (revision !== input.expectedEvacuationRevision) {
    throw new Error('Shuttle evacuation state changed; refresh before trying again.');
  }
  const alreadyMoved = previous?.cycle === input.cycle ? previous.moved : 0;
  if (alreadyMoved + input.amount > MAX_SHUTTLE_EVACUATION_PER_CYCLE) {
    throw new Error('This shuttle has already reached its 5,000-survivor limit for the cycle.');
  }
  return {
    shuttleId: input.shuttleId,
    sourceShipId,
    destinationShipId: input.destinationShipId,
    amount: input.amount,
    sourcePopulation: nextSource,
    destinationPopulation: nextDestination,
    ledger: { cycle: input.cycle, moved: alreadyMoved + input.amount, revision: revision + 1 },
  };
}
