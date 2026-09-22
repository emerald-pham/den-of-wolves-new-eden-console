import { phaseFromTurnPhase, type ActorScope } from './actionMetadata';
import { MAINTENANCE_ORDERS } from './maintenanceOrder';
import { INITIAL_SHIP_RESOURCES, isResourceShipId, type ShipResourceInventory } from './resources';
import { replacementRoleFor } from './replacementRoles';
import { parseSmallShipState, SMALL_SHIP_RULES } from './smallShip';
import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';

const ROLE_ID = 'warrior-captain' as const;
const SMALL_SHIP_ID = 'warrior' as const;
const CONSOLE_ID = 'repair-drones' as const;
const REPAIR_COST = 6;

export interface WarriorRepairDronesState {
  readonly cycle: number;
  readonly revision: number;
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function repairableConsoleIds(hostShipId: string): ReadonlySet<string> {
  return new Set((SHIP_DAMAGE_DECKS[hostShipId] ?? [])
    .filter((card) => !card.systemId.startsWith('armoured-hull'))
    .map((card) => card.systemId));
}

export function parseWarriorRepairDronesState(value: unknown): WarriorRepairDronesState | null {
  if (value === undefined) return Object.freeze({
    cycle: 0, revision: 0, hostShipId: '', systemIds: Object.freeze([]),
  });
  const raw = record(value);
  if (!raw || !exactKeys(raw, ['cycle', 'hostShipId', 'revision', 'systemIds']) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      (raw.revision as number) > (raw.cycle as number) ||
      typeof raw.hostShipId !== 'string' || !isResourceShipId(raw.hostShipId) ||
      !Array.isArray(raw.systemIds) || raw.systemIds.length < 1 || raw.systemIds.length > 2 ||
      raw.systemIds.some((id) => typeof id !== 'string') ||
      new Set(raw.systemIds).size !== raw.systemIds.length ||
      raw.systemIds.some((id) => !repairableConsoleIds(raw.hostShipId as string).has(id as string))) return null;
  return Object.freeze({
    cycle: raw.cycle as number,
    revision: raw.revision as number,
    hostShipId: raw.hostShipId,
    systemIds: Object.freeze([...(raw.systemIds as string[])]),
  });
}

function requireCanonicalSmallShipState(value: unknown): NonNullable<ReturnType<typeof parseSmallShipState>> {
  const raw = record(value);
  const cycle = record(raw?.cycle);
  const results = record(cycle?.results);
  if (!raw || !exactKeys(raw, ['cycle', 'dockingRevision', 'hostShipId', 'id', 'population', 'unrest']) ||
      !cycle || Object.keys(cycle).some((key) => ![
        'step', 'revision', 'results', 'charges', 'turn', 'rationBonus',
        'chargingSkipped', 'startedAt', 'completedAt',
      ].includes(key)) || !results || Object.entries(results).some(([key, result]) =>
        !/^[1-5]$/.test(key) || typeof result !== 'string') ||
      !Array.isArray(cycle.charges) || cycle.charges.some((charge) =>
        typeof charge !== 'string' || charge.length === 0) ||
      new Set(cycle.charges).size !== cycle.charges.length ||
      cycle.charges.length > SMALL_SHIP_RULES[SMALL_SHIP_ID].reactorCapacity) {
    throw new Error('The Warrior state is malformed.');
  }
  const parsed = parseSmallShipState(value, SMALL_SHIP_ID);
  if (!parsed) throw new Error('The Warrior state is malformed.');
  return parsed;
}

function requireCanonicalInventory(value: unknown, hostShipId: string): ShipResourceInventory {
  const raw = record(value);
  const initial = INITIAL_SHIP_RESOURCES[hostShipId];
  const keys = initial && 'scrap' in initial
    ? ['food', 'fuel', 'materials', 'ore', 'scrap', 'securityTeams', 'water']
    : ['food', 'fuel', 'materials', 'ore', 'securityTeams', 'water'];
  if (!raw || !initial || !exactKeys(raw, keys) || Object.values(raw).some((amount) =>
    !Number.isSafeInteger(amount) || (amount as number) < 0)) {
    throw new Error('The host resource authority is malformed.');
  }
  return value as ShipResourceInventory;
}

/** Resolve Warrior's charged, one-per-cycle repair-drone action without persistence. */
export function resolveWarriorRepairDrones(input: Readonly<{
  actorUid: unknown;
  activeRoleHolderUid: unknown;
  actorRoleId: unknown;
  actorScope: ActorScope;
  currentCycle: number;
  expectedRevision: number;
  turnPhase: unknown;
  activeVesselIds: unknown;
  smallShipState: unknown;
  hostResources: unknown;
  hostDamage: ShipDamageState;
  systemIds: unknown;
  state: unknown;
}>): Readonly<{
  hostShipId: string;
  repairedSystemIds: readonly string[];
  hostResources: ShipResourceInventory;
  hostDamage: ShipDamageState;
  state: WarriorRepairDronesState;
}> {
  const printedRole = replacementRoleFor(ROLE_ID);
  if (!printedRole || printedRole.kind !== 'extra-ship' || printedRole.vesselId !== SMALL_SHIP_ID ||
      input.actorScope !== 'player' || input.actorRoleId !== ROLE_ID ||
      typeof input.actorUid !== 'string' || input.actorUid.length === 0 ||
      input.activeRoleHolderUid !== input.actorUid) {
    throw new Error('Only the current Warrior Captain may use Repair Drones.');
  }
  const phase = phaseFromTurnPhase(input.turnPhase);
  if (phase === 'unknown') throw new Error('The current server phase is unavailable for Repair Drones.');
  if (phase !== 'coordination') throw new Error('Warrior Repair Drones are available only during Coordination.');
  const rawPhase = record(input.turnPhase);
  if (!Number.isSafeInteger(input.currentCycle) || input.currentCycle < 1 ||
      !rawPhase || rawPhase.turn !== input.currentCycle) {
    throw new Error('Repair Drones require the current cycle authority.');
  }

  if (!Array.isArray(input.activeVesselIds) || input.activeVesselIds.length === 0 ||
      input.activeVesselIds.some((id) => typeof id !== 'string') ||
      new Set(input.activeVesselIds).size !== input.activeVesselIds.length ||
      input.activeVesselIds.some((id) => !Object.prototype.hasOwnProperty.call(MAINTENANCE_ORDERS, id))) {
    throw new Error('The active vessel authority is malformed.');
  }
  if (!input.activeVesselIds.includes(SMALL_SHIP_ID)) {
    throw new Error('Repair Drones require the active Warrior.');
  }

  const smallShipState = requireCanonicalSmallShipState(input.smallShipState);
  const hostShipId = smallShipState.hostShipId;
  if (!hostShipId) throw new Error('Warrior Repair Drones require one docked host.');
  if (!isResourceShipId(hostShipId) || !input.activeVesselIds.includes(hostShipId)) {
    throw new Error('Warrior is not docked with an active eligible host.');
  }
  if (smallShipState.cycle.turn !== input.currentCycle || smallShipState.cycle.step !== 5 ||
      !exactKeys(smallShipState.cycle.results, ['1', '2', '3', '4']) ||
      smallShipState.cycle.chargingSkipped !== false ||
      typeof smallShipState.cycle.startedAt !== 'string' ||
      smallShipState.cycle.startedAt.length === 0 ||
      smallShipState.cycle.completedAt !== undefined) {
    throw new Error('Warrior Repair Drones require current completed Team maintenance.');
  }
  if (!smallShipState.cycle.charges.includes(CONSOLE_ID)) {
    throw new Error('Warrior Repair Drones must be charged.');
  }
  const hostResources = requireCanonicalInventory(input.hostResources, hostShipId);

  const damage = input.hostDamage;
  const damageRaw = record(damage);
  const knownSystems = new Set((SHIP_DAMAGE_DECKS[hostShipId] ?? []).map((card) => card.systemId));
  const eligibleConsoles = repairableConsoleIds(hostShipId);
  if (!damageRaw || !exactKeys(damageRaw, ['damagedSystemIds', 'destroyed']) ||
      typeof damage.destroyed !== 'boolean' || !Array.isArray(damage.damagedSystemIds) ||
      damage.damagedSystemIds.some((id) => typeof id !== 'string' || !knownSystems.has(id)) ||
      new Set(damage.damagedSystemIds).size !== damage.damagedSystemIds.length) {
    throw new Error('The host damage authority is malformed.');
  }
  if (damage.destroyed) throw new Error('A destroyed host cannot receive Repair Drones.');
  if (!Array.isArray(input.systemIds) || input.systemIds.length < 1 || input.systemIds.length > 2 ||
      input.systemIds.some((id) => typeof id !== 'string') ||
      new Set(input.systemIds).size !== input.systemIds.length ||
      input.systemIds.some((id) => !eligibleConsoles.has(id as string) ||
        !damage.damagedSystemIds.includes(id as string))) {
    throw new Error('Choose one or two distinct damaged consoles on the docked host.');
  }
  if (hostResources.materials < REPAIR_COST) {
    throw new Error('Warrior Repair Drones require six host materials.');
  }

  const state = parseWarriorRepairDronesState(input.state);
  if (!state) throw new Error('The Warrior Repair Drones state is malformed.');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) {
    throw new Error('Warrior Repair Drones changed; refresh before repairing.');
  }
  if (state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Warrior Repair Drones revision cannot advance safely.');
  }
  if (state.cycle > input.currentCycle) throw new Error('Warrior Repair Drones state is ahead of the current cycle.');
  if (state.cycle === input.currentCycle) throw new Error('Warrior Repair Drones may be used only once per cycle.');

  const repairedSystemIds = Object.freeze([...(input.systemIds as string[])]);
  const repairedSet = new Set(repairedSystemIds);
  return Object.freeze({
    hostShipId,
    repairedSystemIds,
    hostResources: Object.freeze({ ...hostResources, materials: hostResources.materials - REPAIR_COST }),
    hostDamage: Object.freeze({
      ...damage,
      damagedSystemIds: Object.freeze(damage.damagedSystemIds.filter((id) => !repairedSet.has(id))),
    }),
    state: Object.freeze({
      cycle: input.currentCycle,
      revision: state.revision + 1,
      hostShipId,
      systemIds: repairedSystemIds,
    }),
  });
}
