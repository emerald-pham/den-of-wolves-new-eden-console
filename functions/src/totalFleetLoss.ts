import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';

export interface TotalFleetLossOutcome {
  readonly type: 'game-outcome';
  readonly result: 'failure';
  readonly cause: 'total-fleet-loss';
  readonly cycle: number;
  readonly occurredAt: string;
}

/**
 * Full fleet ships are the persisted active vessels with authoritative damage
 * decks. Small craft, shuttles, escape pods, and approaching vessels remain
 * readable after a loss and therefore never keep this outcome open.
 */
export function totalFleetLossOutcome(
  activeVesselIds: readonly string[],
  damage: Readonly<Record<string, ShipDamageState>>,
  cycle: number,
  occurredAt: string,
): TotalFleetLossOutcome | undefined {
  const fleet = [...new Set(activeVesselIds)];
  if (
    fleet.length === 0 ||
    !Number.isSafeInteger(cycle) || cycle < 0 ||
    typeof occurredAt !== 'string' || occurredAt.length === 0 ||
    fleet.some((shipId) => !Object.hasOwn(SHIP_DAMAGE_DECKS, shipId)) ||
    fleet.some((shipId) => damage[shipId]?.destroyed !== true)
  ) return undefined;

  return {
    type: 'game-outcome',
    result: 'failure',
    cause: 'total-fleet-loss',
    cycle,
    occurredAt,
  };
}
