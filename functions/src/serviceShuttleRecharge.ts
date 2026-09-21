import {
  chargeableConsoleIds,
  parseMaintenanceCycle,
  resolveMaintenanceProduction,
  type MaintenanceCycle,
  type MaintenanceInput,
} from './maintenance';
import { consoleMetadataFor } from './consoleMetadata';
import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';
import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import { INITIAL_SHIP_RESOURCES, isResourceShipId } from './resources';
import type { ShipResourceInventory } from './resources';

export const SERVICE_SHUTTLE_IDS = ['black-sheep', 'condor', 'wobbly'] as const;
export type ServiceShuttleId = typeof SERVICE_SHUTTLE_IDS[number];

export interface ServiceShuttleRechargeEntry {
  readonly cycle: number;
  readonly hostShipId: string;
  readonly consoleId: string;
  readonly revision: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Mutation-safe parser: unlike the read projection, it never supplies starting stock. */
export function serviceRechargeResourceState(
  value: unknown,
  hostShipId: string,
): ShipResourceInventory | null {
  const root = record(value);
  const initial = INITIAL_SHIP_RESOURCES[hostShipId];
  const raw = root && record(root[hostShipId]);
  if (!root || !initial || !raw) return null;
  const expectedKeys = Object.keys(initial);
  if (Object.keys(raw).length !== expectedKeys.length ||
      Object.keys(raw).some((key) => !expectedKeys.includes(key)) ||
      expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(raw, key) ||
        !Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0)) return null;
  return raw as unknown as ShipResourceInventory;
}

/** Absent legacy upgrade state means no upgrade; malformed present state fails closed. */
export function serviceRechargeUpgradeState(
  value: unknown,
  hostShipId: string,
): readonly string[] | null {
  if (value === undefined) return [];
  const root = record(value);
  if (!root) return null;
  const raw = root[hostShipId];
  if (raw === undefined) return [];
  const knownIds = new Set((SHIP_DAMAGE_DECKS[hostShipId] ?? []).map(({ systemId }) => systemId));
  if (!Array.isArray(raw) || raw.some((upgrade) => typeof upgrade !== 'string' || !knownIds.has(upgrade)) ||
      new Set(raw).size !== raw.length) return null;
  return raw as string[];
}

/** Fail closed for a present malformed host record while accepting absent legacy damage state. */
export function serviceRechargeDamageState(
  value: unknown,
  hostShipId: string,
): ShipDamageState | null {
  const fallback = { damagedSystemIds: [], destroyed: false } as const;
  if (value === undefined) return fallback;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[hostShipId];
  if (raw === undefined) return fallback;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const knownIds = new Set((SHIP_DAMAGE_DECKS[hostShipId] ?? []).map(({ systemId }) => systemId));
  if (Object.keys(record).some((key) => !['damagedSystemIds', 'destroyed'].includes(key)) ||
      !Array.isArray(record.damagedSystemIds) ||
      record.damagedSystemIds.some((id) => typeof id !== 'string' || !knownIds.has(id)) ||
      new Set(record.damagedSystemIds).size !== record.damagedSystemIds.length ||
      typeof record.destroyed !== 'boolean') return null;
  return {
    damagedSystemIds: record.damagedSystemIds as string[],
    destroyed: record.destroyed,
  };
}

export function parseServiceShuttleRecharges(
  value: unknown,
): Record<string, ServiceShuttleRechargeEntry> | null {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const result: Record<string, ServiceShuttleRechargeEntry> = {};
  for (const [shuttleId, entry] of Object.entries(value)) {
    if (!SERVICE_SHUTTLE_IDS.includes(shuttleId as ServiceShuttleId) ||
        typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
    const raw = entry as Record<string, unknown>;
    if (Object.keys(raw).some((key) => !['cycle', 'hostShipId', 'consoleId', 'revision'].includes(key)) ||
        !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
        typeof raw.hostShipId !== 'string' || !isResourceShipId(raw.hostShipId) ||
        typeof raw.consoleId !== 'string' || raw.consoleId.length === 0 ||
        !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1) return null;
    result[shuttleId] = {
      cycle: raw.cycle as number,
      hostShipId: raw.hostShipId,
      consoleId: raw.consoleId,
      revision: raw.revision as number,
    };
  }
  return result;
}

export function resolveServiceShuttleRecharge(input: Readonly<{
  actorUid: string;
  shuttleId: string;
  targetConsoleId: string;
  currentCycle: number;
  expectedControlRevision: number;
  expectedMaintenanceRevision: number;
  control: ShuttleControlEntry;
  dockings: readonly AuthoritativeShuttleDocking[];
  fuelled: Readonly<Record<string, boolean>>;
  maintenanceCycle: unknown;
  damage: ShipDamageState;
  rechargeLedger: Readonly<Record<string, ServiceShuttleRechargeEntry>>;
  resources: ShipResourceInventory;
  unrest: number;
  population: number;
  cargo: Record<string, Record<string, number>>;
  upgrades: readonly string[];
  now: string;
  productionScrap?: boolean;
  productionOreAmount?: number;
}>): Readonly<{
  hostShipId: string;
  maintenanceCycle: MaintenanceCycle;
  ledger: ServiceShuttleRechargeEntry;
  resources: ShipResourceInventory;
  damage: ShipDamageState;
  unrest: number;
  population: number;
  cargo: Record<string, Record<string, number>>;
  fuelled: Record<string, boolean>;
  immediate: boolean;
  message: string;
}> {
  if (!SERVICE_SHUTTLE_IDS.includes(input.shuttleId as ServiceShuttleId)) {
    throw new Error('That shuttle has no service-recharge procedure.');
  }
  if (input.control.shuttleId !== input.shuttleId || input.control.holderUid !== input.actorUid) {
    throw new Error('Only the current shuttle holder may recharge a console.');
  }
  if (input.control.revision !== input.expectedControlRevision) {
    throw new Error('Shuttle control changed; refresh before recharging.');
  }
  if (!Number.isSafeInteger(input.currentCycle) || input.currentCycle < 1) {
    throw new Error('A numbered cycle is required for service recharge.');
  }
  const currentDockings = input.dockings.filter((docking) => docking.shuttleId === input.shuttleId);
  if (currentDockings.length !== 1) {
    throw new Error('Service recharge requires one authoritative docked host.');
  }
  const hostShipId = currentDockings[0]!.shipId;
  if (input.fuelled[input.shuttleId] !== true) {
    throw new Error('Fuel this service shuttle before recharging a console.');
  }
  if (input.damage.destroyed) throw new Error('A destroyed host cannot receive a console charge.');
  const maintenanceCycle = parseMaintenanceCycle(input.maintenanceCycle);
  if (!maintenanceCycle || maintenanceCycle.turn !== input.currentCycle || !maintenanceCycle.completedAt) {
    throw new Error('The docked host must complete maintenance in the current cycle first.');
  }
  if (maintenanceCycle.revision !== input.expectedMaintenanceRevision) {
    throw new Error('Host maintenance changed; refresh before recharging.');
  }
  if (input.rechargeLedger[input.shuttleId]?.cycle === input.currentCycle) {
    throw new Error('This service shuttle already recharged a console this cycle.');
  }
  if (!chargeableConsoleIds(hostShipId).includes(input.targetConsoleId) ||
      (input.targetConsoleId !== 'jump-drive' &&
        input.damage.damagedSystemIds.includes(input.targetConsoleId))) {
    throw new Error('Choose an eligible undamaged console on the docked host.');
  }
  if (maintenanceCycle.charges.includes(input.targetConsoleId)) {
    throw new Error('That console is already charged.');
  }
  const revision = (input.rechargeLedger[input.shuttleId]?.revision ?? 0) + 1;
  const chargedCycle = {
    ...maintenanceCycle,
    revision: maintenanceCycle.revision + 1,
    charges: [...maintenanceCycle.charges, input.targetConsoleId],
  };
  const metadata = consoleMetadataFor(hostShipId, input.targetConsoleId);
  const production = metadata?.resolver.status === 'implemented' &&
    metadata.resolver.id === 'maintenance.production';
  const fuelRefinery = input.targetConsoleId === 'fuel-refinery' ||
    input.targetConsoleId === 'fuel-refinery-ii';
  if (!production && (input.productionScrap !== undefined || input.productionOreAmount !== undefined)) {
    throw new Error('That console has no immediate production choice.');
  }
  if (production && hostShipId !== 'capybara' && input.productionScrap !== undefined) {
    throw new Error('Scrap production is available only on Capybara.');
  }
  if (production && hostShipId === 'capybara' && input.targetConsoleId === 'scrap-refinery' &&
      input.productionScrap === undefined) {
    throw new Error('Choose a Scrap Refinery outcome.');
  }
  if (production && fuelRefinery !== (input.productionOreAmount !== undefined)) {
    throw new Error('Choose an ore amount only for a Fuel Refinery.');
  }
  let resolvedCycle = chargedCycle;
  let resources = input.resources;
  let damage = input.damage;
  let unrest = input.unrest;
  let population = input.population;
  let cargo = input.cargo;
  let fuelled = { ...input.fuelled };
  let message = `${metadata?.name ?? input.targetConsoleId} charged.`;
  if (production) {
    const resolved = resolveMaintenanceProduction({
      shipId: hostShipId,
      cycle: chargedCycle,
      currentTurn: input.currentCycle,
      expectedRevision: chargedCycle.revision,
      action: 'production',
      resources,
      damage,
      unrest,
      population,
      dockings: input.dockings,
      cargo,
      fuelled,
      rolls: [0, 0],
      entropy: 0,
      upgraded: input.upgrades,
      productionConsoleId: input.targetConsoleId,
      productionScrap: input.productionScrap,
      productionOreAmount: input.productionOreAmount,
      now: input.now,
    } satisfies MaintenanceInput);
    // Production is borrowed from the maintenance resolver, but this command runs
    // after maintenance has completed. Carry only the production-owned fields back
    // so an immediate recharge cannot reopen the completed maintenance sequence.
    resolvedCycle = {
      ...chargedCycle,
      revision: resolved.cycle.revision,
      results: { ...resolved.cycle.results },
      charges: [...resolved.cycle.charges],
    };
    resources = resolved.resources;
    damage = resolved.damage;
    unrest = resolved.unrest;
    population = resolved.population;
    cargo = resolved.cargo;
    fuelled = resolved.fuelled;
    message = resolved.cycle.results['5'] ?? `${metadata?.name ?? input.targetConsoleId} resolved.`;
  }
  return {
    hostShipId,
    maintenanceCycle: resolvedCycle,
    ledger: {
      cycle: input.currentCycle,
      hostShipId,
      consoleId: input.targetConsoleId,
      revision,
    },
    resources,
    damage,
    unrest,
    population,
    cargo,
    fuelled,
    immediate: production,
    message,
  };
}
