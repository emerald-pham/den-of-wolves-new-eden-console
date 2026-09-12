import { emptyMaintenanceCycle } from './maintenance';
import { pressDispatchState, type PressDispatchState } from './pressDispatchState';
import { SHIP_DAMAGE_DECKS, shipDamage, type ShipDamageState } from './shipDamage';

export interface AtomicStartState {
  readonly shipDamage: Record<string, ShipDamageState>;
  readonly maintenanceCycles: Record<string, unknown>;
  readonly fleetRedAlert: { readonly active: boolean; readonly revision: number } | unknown;
  readonly pressDispatch: PressDispatchState | unknown;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function stringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((item) => typeof item === 'string');
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isMaintenanceCycle(value: unknown): boolean {
  const cycle = record(value);
  if (
    !safeNonNegativeInteger(cycle.step) || cycle.step > 7 ||
    !safeNonNegativeInteger(cycle.revision) ||
    !stringRecord(cycle.results) || !stringArray(cycle.charges) || !stringArray(cycle.refuelled)
  ) return false;
  if (cycle.turn !== undefined && !safeNonNegativeInteger(cycle.turn)) return false;
  if (
    cycle.rationBonus !== undefined &&
    (typeof cycle.rationBonus !== 'number' || !Number.isFinite(cycle.rationBonus))
  ) return false;
  for (const key of ['startedAt', 'completedAt', 'damageDrawId']) {
    if (cycle[key] !== undefined && typeof cycle[key] !== 'string') return false;
  }
  return true;
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
  readonly fleetRedAlert?: unknown;
  readonly pressDispatch?: unknown;
}): AtomicStartState {
  const damage = shipDamage(input.shipDamage);
  for (const shipId of input.activeVesselIds) {
    if (damage[shipId] === undefined && Object.prototype.hasOwnProperty.call(SHIP_DAMAGE_DECKS, shipId)) {
      damage[shipId] = { damagedSystemIds: [], destroyed: false };
    }
  }

  const maintenanceCycles = { ...record(input.maintenanceCycles) };
  for (const shipId of input.activeVesselIds) {
    if (!isMaintenanceCycle(maintenanceCycles[shipId])) {
      maintenanceCycles[shipId] = emptyMaintenanceCycle();
    }
  }

  return {
    shipDamage: damage,
    maintenanceCycles,
    fleetRedAlert: input.fleetRedAlert === undefined
      ? { active: false, revision: 0 }
      : input.fleetRedAlert,
    pressDispatch: input.pressDispatch === undefined
      ? pressDispatchState(undefined)
      : input.pressDispatch,
  };
}
