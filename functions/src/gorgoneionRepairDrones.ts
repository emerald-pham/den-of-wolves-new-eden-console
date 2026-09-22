import { phaseFromTurnPhase, type ActorScope } from './actionMetadata';
import { INITIAL_SHIP_RESOURCES, isResourceShipId, type ShipResourceInventory } from './resources';
import { replacementRoleFor } from './replacementRoles';
import { parseSmallShipState } from './smallShip';
import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';

const ROLE_ID = 'gorgoneion-captain' as const;
const REPAIR_COST = 3;

export interface GorgoneionRepairDronesState {
  readonly cycle: number;
  readonly revision: number;
  readonly hostShipId: string;
  readonly systemId: string;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = [...keys].sort();
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

export function parseGorgoneionRepairDronesState(value: unknown): GorgoneionRepairDronesState | null {
  if (value === undefined) return Object.freeze({ cycle: 0, revision: 0, hostShipId: '', systemId: '' });
  const raw = record(value);
  if (!raw || !exactKeys(raw, ['cycle', 'hostShipId', 'revision', 'systemId']) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      (raw.revision as number) > (raw.cycle as number) ||
      typeof raw.hostShipId !== 'string' || !isResourceShipId(raw.hostShipId) ||
      typeof raw.systemId !== 'string' ||
      !(SHIP_DAMAGE_DECKS[raw.hostShipId] ?? []).some((card) => card.systemId === raw.systemId)) return null;
  return Object.freeze({
    cycle: raw.cycle as number,
    revision: raw.revision as number,
    hostShipId: raw.hostShipId,
    systemId: raw.systemId,
  });
}

function requireCanonicalSmallShipState(value: unknown): ReturnType<typeof parseSmallShipState> {
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
      new Set(cycle.charges).size !== cycle.charges.length) {
    throw new Error('The Gorgoneion state is malformed.');
  }
  const parsed = parseSmallShipState(value, 'gorgoneion');
  if (!parsed) throw new Error('The Gorgoneion state is malformed.');
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

/** Resolve Gorgoneion's one-per-cycle repair-drone action without persistence. */
export function resolveGorgoneionRepairDrones(input: Readonly<{
  actorRoleId: unknown;
  actorScope: ActorScope;
  currentCycle: number;
  expectedRevision: number;
  turnPhase: unknown;
  smallShipState: unknown;
  hostResources: unknown;
  hostDamage: ShipDamageState;
  systemId: unknown;
  state: unknown;
}>): Readonly<{
  hostShipId: string;
  repairedSystemId: string;
  hostResources: ShipResourceInventory;
  hostDamage: ShipDamageState;
  state: GorgoneionRepairDronesState;
}> {
  const printedRole = replacementRoleFor(ROLE_ID);
  if (!printedRole || printedRole.kind !== 'extra-ship' || printedRole.vesselId !== 'gorgoneion' ||
      input.actorScope !== 'player' || input.actorRoleId !== ROLE_ID) {
    throw new Error('Only the active Gorgoneion Captain may use Repair Drones.');
  }
  const phase = phaseFromTurnPhase(input.turnPhase);
  if (phase === 'unknown') throw new Error('The current server phase is unavailable for Repair Drones.');
  if (phase !== 'coordination') throw new Error('Gorgoneion Repair Drones are available only during Coordination.');
  const rawPhase = record(input.turnPhase);
  if (!Number.isSafeInteger(input.currentCycle) || input.currentCycle < 1 ||
      !rawPhase || rawPhase.turn !== input.currentCycle) {
    throw new Error('Repair Drones require the current cycle authority.');
  }

  const smallShipState = requireCanonicalSmallShipState(input.smallShipState);
  if (smallShipState?.id !== 'gorgoneion') throw new Error('Only Gorgoneion has these Repair Drones.');
  const hostShipId = smallShipState.hostShipId;
  if (!hostShipId) throw new Error('Gorgoneion Repair Drones require one docked host.');
  if (!isResourceShipId(hostShipId)) throw new Error('Gorgoneion is not docked with an eligible host.');
  const hostResources = requireCanonicalInventory(input.hostResources, hostShipId);

  const damage = input.hostDamage;
  const knownSystems = new Set((SHIP_DAMAGE_DECKS[hostShipId] ?? []).map((card) => card.systemId));
  if (!damage || typeof damage.destroyed !== 'boolean' || !Array.isArray(damage.damagedSystemIds) ||
      damage.damagedSystemIds.some((id) => typeof id !== 'string' || !knownSystems.has(id)) ||
      new Set(damage.damagedSystemIds).size !== damage.damagedSystemIds.length) {
    throw new Error('The host damage authority is malformed.');
  }
  if (damage.destroyed) throw new Error('A destroyed host cannot receive Repair Drones.');
  if (typeof input.systemId !== 'string' || !knownSystems.has(input.systemId) ||
      !damage.damagedSystemIds.includes(input.systemId)) {
    throw new Error('Choose one damaged console on the docked host.');
  }
  if (hostResources.materials < REPAIR_COST) {
    throw new Error('Repair Drones require three host materials.');
  }

  const state = parseGorgoneionRepairDronesState(input.state);
  if (!state) throw new Error('The Repair Drones state is malformed.');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) {
    throw new Error('Repair Drones changed; refresh before repairing.');
  }
  if (state.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Repair Drones revision cannot advance safely.');
  if (state.cycle > input.currentCycle) throw new Error('Repair Drones state is ahead of the current cycle.');
  if (state.cycle === input.currentCycle) throw new Error('Repair Drones may be used only once per cycle.');

  return Object.freeze({
    hostShipId,
    repairedSystemId: input.systemId,
    hostResources: Object.freeze({ ...hostResources, materials: hostResources.materials - REPAIR_COST }),
    hostDamage: Object.freeze({
      ...damage,
      damagedSystemIds: Object.freeze(damage.damagedSystemIds.filter((id) => id !== input.systemId)),
    }),
    state: Object.freeze({
      cycle: input.currentCycle,
      revision: state.revision + 1,
      hostShipId,
      systemId: input.systemId,
    }),
  });
}
