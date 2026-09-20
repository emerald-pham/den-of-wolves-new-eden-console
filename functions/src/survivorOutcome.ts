export interface SurvivorOutcomeInput {
  readonly cycle: number;
  readonly occurredAt: string;
  readonly activeFleetShipIds: readonly string[];
  readonly shipPopulations: Readonly<Record<string, number>>;
  readonly destroyedShipIds: readonly string[];
  readonly escapePodCapacities: Readonly<Record<string, number>>;
  readonly smallVesselPopulations?: Readonly<Record<string, number>>;
  readonly admittedVesselPopulations?: Readonly<Record<string, number>>;
}

export interface SurvivorOutcome {
  readonly type: 'survivor-outcome';
  readonly cycle: number;
  readonly occurredAt: string;
  /** Current population recorded across every active full fleet ship. */
  readonly fleetShipPopulation: number;
  /** Population still aboard full fleet ships that were not lost or destroyed. */
  readonly survivingShipPopulation: number;
  /** Population from lost or destroyed ships that fits in their printed pods. */
  readonly evacuatedPopulation: number;
  /** Total printed pod capacity exposed by lost or destroyed full fleet ships. */
  readonly escapePodCapacity: number;
  /** Population that cannot fit in the printed pods. */
  readonly lostPopulation: number;
  /** Population in admitted optional small vessels with their own ledgers. */
  readonly smallVesselPopulation: number;
  /** Population in other admitted vessels with their own ledgers. */
  readonly admittedVesselPopulation: number;
  readonly finalSurvivors: number;
  readonly survivingShipIds: readonly string[];
  readonly lostOrDestroyedShipIds: readonly string[];
}

function safePopulation(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function sumPopulation(populations: Readonly<Record<string, number>> | undefined): number | undefined {
  let total = 0;
  for (const value of Object.values(populations ?? {})) {
    if (!safePopulation(value) || !Number.isSafeInteger(total + value)) return undefined;
    total += value;
  }
  return total;
}

/**
 * Produce the privacy-safe terminal population result from real ledgers only.
 *
 * Announcement population and its theatrical adjustment are deliberately not
 * accepted as inputs. A destroyed ship's recorded population survives only up
 * to the printed pod capacity exposed by its catastrophe authority.
 */
export function aggregateSurvivorOutcome(input: SurvivorOutcomeInput): SurvivorOutcome | undefined {
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 0 || input.occurredAt.length === 0) {
    return undefined;
  }
  const fleet = [...new Set(input.activeFleetShipIds)].sort();
  if (fleet.length === 0 || fleet.some((shipId) => !safePopulation(input.shipPopulations[shipId]))) {
    return undefined;
  }
  const fleetSet = new Set(fleet);
  const destroyed = [...new Set(input.destroyedShipIds)].sort();
  if (destroyed.some((shipId) => !fleetSet.has(shipId) || !safePopulation(input.escapePodCapacities[shipId]))) {
    return undefined;
  }
  const destroyedSet = new Set(destroyed);
  const survivingShipIds = fleet.filter((shipId) => !destroyedSet.has(shipId));
  const smallVesselPopulation = sumPopulation(input.smallVesselPopulations);
  const admittedVesselPopulation = sumPopulation(input.admittedVesselPopulations);
  if (smallVesselPopulation === undefined || admittedVesselPopulation === undefined) return undefined;

  let fleetShipPopulation = 0;
  let survivingShipPopulation = 0;
  let evacuatedPopulation = 0;
  let escapePodCapacity = 0;
  let lostPopulation = 0;
  for (const shipId of fleet) {
    const population = input.shipPopulations[shipId]!;
    fleetShipPopulation += population;
    if (!Number.isSafeInteger(fleetShipPopulation)) return undefined;
    if (!destroyedSet.has(shipId)) {
      survivingShipPopulation += population;
      continue;
    }
    const capacity = input.escapePodCapacities[shipId]!;
    const evacuated = Math.min(population, capacity);
    escapePodCapacity += capacity;
    evacuatedPopulation += evacuated;
    lostPopulation += population - evacuated;
  }
  const finalSurvivors = survivingShipPopulation + evacuatedPopulation +
    smallVesselPopulation + admittedVesselPopulation;
  if (![survivingShipPopulation, evacuatedPopulation, escapePodCapacity, lostPopulation, finalSurvivors]
    .every(Number.isSafeInteger)) return undefined;

  return {
    type: 'survivor-outcome',
    cycle: input.cycle,
    occurredAt: input.occurredAt,
    fleetShipPopulation,
    survivingShipPopulation,
    evacuatedPopulation,
    escapePodCapacity,
    lostPopulation,
    smallVesselPopulation,
    admittedVesselPopulation,
    finalSurvivors,
    survivingShipIds,
    lostOrDestroyedShipIds: destroyed,
  };
}
