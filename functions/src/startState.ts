import { emptyMaintenanceCycle, parseMaintenanceCycle } from './maintenance';
import { pressDispatchState, type PressDispatchState } from './pressDispatchState';
import { SHIP_DAMAGE_DECKS, shipDamage, type ShipDamageState } from './shipDamage';
import { fighterWingCounts, type FighterWingCountState } from './fighterWings';

export interface AtomicStartState {
  readonly shipDamage: Record<string, ShipDamageState>;
  readonly maintenanceCycles: Record<string, unknown>;
  readonly fighterWingCounts?: Partial<Record<string, FighterWingCountState>>;
  readonly fleetRedAlert: { readonly active: boolean; readonly revision: number } | unknown;
  readonly pressDispatch: PressDispatchState | unknown;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Materialize the state that the first Turn 1 consumers expect.
 *
 * The create/confirm composition owns prepared stores. Start only fills fields
 * that are absent, so a retry or a deliberately edited lobby state cannot be
 * reset by this transition.
 */
export function atomicStartState(input: {
  readonly activeVesselIds: readonly string[];
  readonly shipDamage?: unknown;
  readonly maintenanceCycles?: unknown;
  readonly fighterWingCounts?: unknown;
  readonly fleetRedAlert?: unknown;
  readonly pressDispatch?: unknown;
}): AtomicStartState {
  const damage = shipDamage(input.shipDamage);
  for (const shipId of input.activeVesselIds) {
    if (damage[shipId] === undefined && Object.prototype.hasOwnProperty.call(SHIP_DAMAGE_DECKS, shipId)) {
      damage[shipId] = { damagedSystemIds: [], destroyed: false };
    }
  }

  const storedMaintenanceCycles = record(input.maintenanceCycles);
  const maintenanceCycles: Record<string, unknown> = Object.fromEntries(
    Object.keys(SHIP_DAMAGE_DECKS).flatMap((shipId) => {
      const parsed = parseMaintenanceCycle(storedMaintenanceCycles[shipId]);
      return parsed ? [[shipId, parsed]] : [];
    }),
  );
  for (const shipId of input.activeVesselIds) {
    if (!Object.prototype.hasOwnProperty.call(maintenanceCycles, shipId)) {
      maintenanceCycles[shipId] = emptyMaintenanceCycle();
    }
  }

  return {
    shipDamage: damage,
    maintenanceCycles,
    ...(input.fighterWingCounts === undefined
      ? {}
      : { fighterWingCounts: fighterWingCounts(input.fighterWingCounts) }),
    fleetRedAlert: input.fleetRedAlert === undefined
      ? { active: false, revision: 0 }
      : input.fleetRedAlert,
    pressDispatch: input.pressDispatch === undefined
      ? pressDispatchState(undefined)
      : input.pressDispatch,
  };
}
