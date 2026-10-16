import type { ActorScope } from './actionMetadata';
import { INITIAL_SHIP_RESOURCES, isResourceShipId, type ShipResourceInventory } from './resources';
import { replacementRoleFor } from './replacementRoles';
import { isSmallShipInMutiny, parseSmallShipState } from './smallShip';
import { SHIP_DAMAGE_DECKS } from './shipDamage';
import { turnPhaseDeadlinePassed, turnPhaseState } from './turnZero';

export type SmallShipCargoId = 'capybara-small' | 'warrior';

export const BASE_CAPYBARA_CARGO_TYPES = [
  'securityTeams', 'ore', 'fuel', 'food', 'water', 'materials',
] as const;
export type BaseCapybaraCargoType = (typeof BASE_CAPYBARA_CARGO_TYPES)[number];

export interface BaseCapybaraCargoState {
  readonly revision: number;
  readonly inventory: Readonly<Record<BaseCapybaraCargoType, number>>;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function exactCargoInventory(value: unknown): BaseCapybaraCargoState['inventory'] | null {
  const raw = record(value);
  if (!raw || !exactKeys(raw, BASE_CAPYBARA_CARGO_TYPES) || Object.values(raw).some((amount) =>
    !Number.isSafeInteger(amount) || (amount as number) < 0)) return null;
  return Object.freeze({
    securityTeams: raw.securityTeams as number,
    ore: raw.ore as number,
    fuel: raw.fuel as number,
    food: raw.food as number,
    water: raw.water as number,
    materials: raw.materials as number,
  });
}

export function parseBaseCapybaraCargoState(value: unknown): BaseCapybaraCargoState | null {
  if (value === undefined) return Object.freeze({
    revision: 0,
    inventory: exactCargoInventory({
      securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0, materials: 0,
    })!,
  });
  const raw = record(value);
  const inventory = exactCargoInventory(raw?.inventory);
  if (!raw || !exactKeys(raw, ['inventory', 'revision']) ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 || !inventory) return null;
  return Object.freeze({ revision: raw.revision as number, inventory });
}

function requireCanonicalSmallShipState(value: unknown, smallShipId: SmallShipCargoId): NonNullable<ReturnType<typeof parseSmallShipState>> {
  const raw = record(value);
  const craftName = smallShipId === 'warrior' ? 'Warrior' : 'base Capybara';
  const cycle = record(raw?.cycle);
  const results = record(cycle?.results);
  const rootKeys = ['cycle', 'dockingRevision', 'hostShipId', 'id', 'population', 'unrest'];
  if (smallShipId === 'warrior' && raw && Object.hasOwn(raw, 'mutiny')) rootKeys.push('mutiny');
  const mutiny = record(raw?.mutiny);
  const mutinyKeys = mutiny?.status === 'active'
    ? ['status', 'revision', 'triggerUnrest', 'triggeredAt']
    : ['status', 'revision', 'triggerUnrest', 'triggeredAt', 'reduction', 'recoveryRequestId', 'recoveredAt'];
  if (!raw || !exactKeys(raw, rootKeys) ||
      (Object.hasOwn(raw, 'mutiny') && (!mutiny || !exactKeys(mutiny, mutinyKeys))) ||
      !cycle || Object.keys(cycle).some((key) => ![
        'step', 'revision', 'results', 'charges', 'turn', 'rationBonus',
        'chargingSkipped', 'startedAt', 'completedAt',
      ].includes(key)) || !results || Object.entries(results).some(([key, result]) =>
        !/^[1-5]$/.test(key) || typeof result !== 'string') ||
      !Array.isArray(cycle.charges) || cycle.charges.some((charge) =>
        typeof charge !== 'string' || charge.length === 0) ||
      new Set(cycle.charges).size !== cycle.charges.length) {
    throw new Error(`The ${craftName} state is malformed.`);
  }
  const parsed = parseSmallShipState(value, smallShipId);
  if (!parsed) throw new Error(`The ${craftName} state is malformed.`);
  return parsed;
}

function requireCanonicalHostInventory(value: unknown, hostShipId: string, smallShipId: SmallShipCargoId): ShipResourceInventory {
  const raw = record(value);
  const initial = INITIAL_SHIP_RESOURCES[hostShipId];
  if (!raw || !initial || (smallShipId === 'capybara-small' && 'scrap' in initial) || !exactKeys(raw, Object.keys(initial)) ||
      Object.values(raw).some((amount) => !Number.isSafeInteger(amount) || (amount as number) < 0)) {
    throw new Error('The docked host inventory is malformed.');
  }
  return value as ShipResourceInventory;
}

function requireUndestroyedHostDamage(value: unknown, hostShipId: string): void {
  const raw = record(value);
  const deck = SHIP_DAMAGE_DECKS[hostShipId];
  const knownSystemIds = new Set((deck ?? []).map(({ systemId }) => systemId));
  if (!raw || !deck || !exactKeys(raw, ['damagedSystemIds', 'destroyed']) ||
      typeof raw.destroyed !== 'boolean' || !Array.isArray(raw.damagedSystemIds) ||
      raw.damagedSystemIds.some((id) => typeof id !== 'string' || !knownSystemIds.has(id)) ||
      new Set(raw.damagedSystemIds).size !== raw.damagedSystemIds.length) {
    throw new Error('The docked-host damage authority is malformed.');
  }
  if (raw.destroyed) throw new Error('A destroyed host cannot transfer small-craft cargo.');
}

/** Resolve a printed six-track cargo move using a server-selected craft. */
export function resolveSmallShipCargoTransfer(input: Readonly<{
  actorUid: unknown;
  activeRoleHolderUid: unknown;
  actorRoleId: unknown;
  actorScope: ActorScope;
  currentCycle: number;
  currentTime: number;
  turnPhase: unknown;
  vesselMode: unknown;
  /** Server-derived from the strict optional-ship admission resolver. */
  isSmallShipAdmitted: unknown;
  activeVesselIds: unknown;
  smallShipState: unknown;
  resourceId: unknown;
  direction: unknown;
  amount: unknown;
  expectedRevision: unknown;
  cargoState: unknown;
  hostResources: unknown;
  hostDamage: unknown;
}>, smallShipId: SmallShipCargoId): Readonly<{
  hostShipId: string;
  resourceId: BaseCapybaraCargoType;
  direction: 'load' | 'unload';
  amount: number;
  hostResources: ShipResourceInventory;
  cargoState: BaseCapybaraCargoState;
}> {
  const craftName = smallShipId === 'warrior' ? 'Warrior' : 'base Capybara';
  const ROLE_ID = `${smallShipId}-captain`;
  const SMALL_SHIP_ID = smallShipId;
  const printedRole = replacementRoleFor(ROLE_ID);
  if (!printedRole || printedRole.kind !== 'extra-ship' || printedRole.vesselId !== SMALL_SHIP_ID ||
      (smallShipId === 'capybara-small' && printedRole.baseVesselOnly !== true) || input.actorScope !== 'player' || input.actorRoleId !== ROLE_ID ||
      typeof input.actorUid !== 'string' || input.actorUid.length === 0 ||
      input.activeRoleHolderUid !== input.actorUid) {
    throw new Error(`Only the current ${craftName} Captain may use Cargo Transfer.`);
  }

  const phase = turnPhaseState(input.turnPhase);
  if (!phase) throw new Error('The current server phase is unavailable for Cargo Transfer.');
  if (!Number.isSafeInteger(input.currentCycle) || input.currentCycle < 1 || phase.turn !== input.currentCycle) {
    throw new Error('Cargo Transfer requires the current cycle authority.');
  }
  if (phase.airspace.state !== 'lifted') {
    throw new Error(`${craftName} Cargo Transfer is available only during Coordination.`);
  }
  if (!Number.isSafeInteger(input.currentTime) || input.currentTime < 0 ||
      phase.timerPause !== undefined ||
      turnPhaseDeadlinePassed(phase, 'open', input.currentTime)) {
    throw new Error(`${craftName} Cargo Transfer requires the current live Coordination cycle.`);
  }

  if (!(input.vesselMode === 'base-capybara' || input.vesselMode === 'expansion-capybara' || input.vesselMode === 'none') ||
      (smallShipId === 'capybara-small' && input.vesselMode !== 'base-capybara')) {
    throw new Error(`Cargo Transfer requires the canonical ${craftName} vessel mode.`);
  }
  if (!Array.isArray(input.activeVesselIds) || input.activeVesselIds.length === 0 ||
      input.activeVesselIds.some((id) => typeof id !== 'string') ||
      new Set(input.activeVesselIds).size !== input.activeVesselIds.length ||
      input.activeVesselIds.some((id) => !isResourceShipId(id))) {
    throw new Error('The canonical core-fleet authority is malformed.');
  }
  if (input.activeVesselIds.includes(SMALL_SHIP_ID)) {
    throw new Error(`The ${craftName} must remain separate from the canonical core-fleet roster.`);
  }
  if (smallShipId === 'capybara-small' && input.activeVesselIds.includes('capybara')) {
    throw new Error(`Cargo Transfer requires the ${craftName} and excludes the expansion ship.`);
  }
  if (input.isSmallShipAdmitted !== true) {
    throw new Error(`Cargo Transfer requires server-owned admission for a docked ${craftName}.`);
  }

  const smallShipState = requireCanonicalSmallShipState(input.smallShipState, smallShipId);
  if (isSmallShipInMutiny(smallShipState)) {
    throw new Error(`${craftName} is in mutiny until a new Captain is installed.`);
  }
  const hostShipId = smallShipState.hostShipId;
  if (!hostShipId) throw new Error(`The ${craftName} must be docked with one host ship.`);
  if (!isResourceShipId(hostShipId) || (smallShipId === 'capybara-small' && hostShipId === 'capybara') ||
      !input.activeVesselIds.includes(hostShipId)) {
    throw new Error(`The ${craftName} must be docked with an active core host inventory.`);
  }
  const hostResources = requireCanonicalHostInventory(input.hostResources, hostShipId, smallShipId);
  requireUndestroyedHostDamage(input.hostDamage, hostShipId);

  if (!BASE_CAPYBARA_CARGO_TYPES.includes(input.resourceId as BaseCapybaraCargoType)) {
    throw new Error(`That resource is not permitted by the ${craftName} printed cargo rule.`);
  }
  if (input.direction !== 'load' && input.direction !== 'unload') {
    throw new Error(`Choose whether to load or unload ${craftName} cargo.`);
  }
  if (!Number.isSafeInteger(input.amount) || (input.amount as number) < 1) {
    throw new Error('Cargo amount must be a positive whole number.');
  }

  const cargoState = parseBaseCapybaraCargoState(input.cargoState);
  if (!cargoState) throw new Error(`The ${craftName} cargo state is malformed.`);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== cargoState.revision) {
    throw new Error(`${craftName} cargo changed; refresh before transferring.`);
  }
  if (cargoState.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error(`${craftName} cargo revision cannot advance safely.`);
  }

  const resourceId = input.resourceId as BaseCapybaraCargoType;
  const amount = input.amount as number;
  const hostAmount = hostResources[resourceId];
  const cargoAmount = cargoState.inventory[resourceId];
  const sourceAmount = input.direction === 'load' ? hostAmount : cargoAmount;
  const destinationAmount = input.direction === 'load' ? cargoAmount : hostAmount;
  if (sourceAmount < amount) throw new Error('The source inventory does not hold enough cargo.');
  if (destinationAmount > Number.MAX_SAFE_INTEGER - amount) {
    throw new Error('The destination inventory cannot safely hold that cargo.');
  }

  const nextHostAmount = hostAmount + (input.direction === 'load' ? -amount : amount);
  const nextCargoAmount = cargoAmount + (input.direction === 'load' ? amount : -amount);
  return Object.freeze({
    hostShipId,
    resourceId,
    direction: input.direction,
    amount,
    hostResources: Object.freeze({ ...hostResources, [resourceId]: nextHostAmount }),
    cargoState: Object.freeze({
      revision: cargoState.revision + 1,
      inventory: Object.freeze({ ...cargoState.inventory, [resourceId]: nextCargoAmount }),
    }),
  });
}

/** Existing base-game entry retains its exact craft and mode restrictions. */
export function resolveBaseCapybaraCargoTransfer(input: Parameters<typeof resolveSmallShipCargoTransfer>[0]) {
  return resolveSmallShipCargoTransfer(input, 'capybara-small');
}
