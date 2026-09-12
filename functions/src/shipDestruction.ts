/**
 * The printed capacity that survives a fleet ship's destruction.
 *
 * The small ships and the approaching vessel do not have an independent
 * crew/passenger capacity printed on their sheets, so they deliberately do
 * not appear in this table.  Callers must not turn their population into a
 * fabricated pod capacity.
 */
export interface EscapePodCapacity {
  readonly crewCapacity: number;
  readonly passengerCapacity: number;
  readonly podCapacity: number;
}

export const PRINTED_ESCAPE_POD_CAPACITIES: Readonly<Record<string, EscapePodCapacity>> = Object.freeze({
  aegis: { crewCapacity: 3_000, passengerCapacity: 100, podCapacity: 3_100 },
  dione: { crewCapacity: 4_000, passengerCapacity: 12_000, podCapacity: 16_000 },
  icebreaker: { crewCapacity: 10_000, passengerCapacity: 100, podCapacity: 10_100 },
  shepherd: { crewCapacity: 4_000, passengerCapacity: 4_000, podCapacity: 8_000 },
  quellon: { crewCapacity: 6_500, passengerCapacity: 10, podCapacity: 6_510 },
  'refinery-124': { crewCapacity: 5_000, passengerCapacity: 0, podCapacity: 5_000 },
  capybara: { crewCapacity: 5_000, passengerCapacity: 500, podCapacity: 5_500 },
});

export function escapePodCapacityForShip(shipId: string): EscapePodCapacity | undefined {
  return PRINTED_ESCAPE_POD_CAPACITIES[shipId];
}

/** The stable member-readable event id for a ship's one catastrophe. */
export function catastropheEventIdForShip(shipId: string): string {
  return `damage-destroyed-${shipId}`;
}

export interface DestructionTransition {
  readonly eventId: string;
  readonly capacity: EscapePodCapacity;
  /** True only when this transaction must create the durable catastrophe. */
  readonly createEvent: boolean;
}

/**
 * Decide the one destruction transition from the transaction's current state.
 *
 * A missing old catastrophe record is repaired without incrementing any game
 * revision.  Once the stable event exists, repeated draws are a read-only
 * terminal result and cannot create another catastrophe.
 */
export function destructionTransition(
  shipId: string,
  alreadyDestroyed: boolean,
  catastropheEventExists: boolean,
): DestructionTransition {
  const capacity = escapePodCapacityForShip(shipId);
  if (!capacity) throw new Error('This vessel has no printed escape-pod capacity.');
  return {
    eventId: catastropheEventIdForShip(shipId),
    capacity,
    createEvent: !alreadyDestroyed || !catastropheEventExists,
  };
}
