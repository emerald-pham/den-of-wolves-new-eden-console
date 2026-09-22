import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import type { ShipDamageState } from './shipDamage';
import { SHIP_DAMAGE_DECKS } from './shipDamage';
import { isResourceShipId } from './resources';

export const CHACAU_REPAIR_COST = 4;
export const CHACAU_MAX_CONSOLES_PER_HOST = 2;
export const CHACAU_MAX_HOSTS_PER_CYCLE = 2;

export interface ChacauRepairHostEntry {
  readonly shipId: string;
  readonly systemIds: readonly string[];
}

export interface ChacauRepairLedger {
  readonly cycle: number;
  readonly revision: number;
  readonly hosts: readonly ChacauRepairHostEntry[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function parseChacauRepairLedger(value: unknown): ChacauRepairLedger | null {
  if (value === undefined) return { cycle: 0, revision: 0, hosts: [] };
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) => !['cycle', 'revision', 'hosts'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      !Array.isArray(raw.hosts) || raw.hosts.length < 1 ||
      raw.hosts.length > CHACAU_MAX_HOSTS_PER_CYCLE) return null;

  const hosts: ChacauRepairHostEntry[] = [];
  for (const host of raw.hosts) {
    const entry = record(host);
    const knownSystemIds = entry && typeof entry.shipId === 'string'
      ? new Set((SHIP_DAMAGE_DECKS[entry.shipId] ?? []).map(({ systemId }) => systemId))
      : new Set<string>();
    if (!entry || Object.keys(entry).some((key) => !['shipId', 'systemIds'].includes(key)) ||
        typeof entry.shipId !== 'string' || !isResourceShipId(entry.shipId) ||
        !Array.isArray(entry.systemIds) || entry.systemIds.length < 1 ||
        entry.systemIds.length > CHACAU_MAX_CONSOLES_PER_HOST ||
        entry.systemIds.some((id) => typeof id !== 'string' || id.length === 0) ||
        entry.systemIds.some((id) => typeof id !== 'string' || !knownSystemIds.has(id)) ||
        new Set(entry.systemIds).size !== entry.systemIds.length ||
        hosts.some((candidate) => candidate.shipId === entry.shipId)) return null;
    hosts.push({ shipId: entry.shipId, systemIds: entry.systemIds as string[] });
  }
  return { cycle: raw.cycle as number, revision: raw.revision as number, hosts };
}

export function resolveChacauRepair(input: Readonly<{
  actorUid: string;
  actorRoleId: string;
  currentCycle: number;
  expectedCycle: number;
  expectedControlRevision: number;
  expectedRepairRevision: number;
  expectedHostShipId: string;
  fleetGroupVesselIds: readonly string[];
  systemIds: readonly string[];
  control: ShuttleControlEntry;
  dockings: readonly AuthoritativeShuttleDocking[];
  fuelled: boolean;
  damage: ShipDamageState;
  materials: number;
  knownSystemIds: readonly string[];
  ledger: ChacauRepairLedger;
}>): Readonly<{
  hostShipId: string;
  damage: ShipDamageState;
  materials: number;
  ledger: ChacauRepairLedger;
  repairedSystemIds: readonly string[];
}> {
  if (input.control.shuttleId !== 'chacau' ||
      input.control.ownerRoleId !== 'refinery-124-engineer' ||
      input.control.holderUid !== input.actorUid ||
      input.actorRoleId !== 'refinery-124-engineer') {
    throw new Error('Only the current Refinery 124 Engineer holding Chacau may repair consoles.');
  }
  if (input.control.revision !== input.expectedControlRevision) {
    throw new Error('Chacau control changed; refresh before repairing.');
  }
  if (!Number.isSafeInteger(input.currentCycle) || input.currentCycle < 1) {
    throw new Error('A numbered cycle is required for Chacau repairs.');
  }
  if (input.expectedCycle !== input.currentCycle) {
    throw new Error('The Coordination cycle changed; refresh before repairing.');
  }
  if (!Number.isSafeInteger(input.expectedRepairRevision) || input.expectedRepairRevision < 0 ||
      input.ledger.revision !== input.expectedRepairRevision) {
    throw new Error('Chacau repair history changed; refresh before repairing.');
  }
  if (input.ledger.revision >= Number.MAX_SAFE_INTEGER || input.ledger.cycle > input.currentCycle) {
    throw new Error('Chacau repair history is outside the safe cycle range.');
  }
  if (input.systemIds.length < 1 || input.systemIds.length > CHACAU_MAX_CONSOLES_PER_HOST ||
      input.systemIds.some((id) => typeof id !== 'string' || id.length === 0) ||
      new Set(input.systemIds).size !== input.systemIds.length) {
    throw new Error('Choose one or two different damaged consoles.');
  }

  const currentDockings = input.dockings.filter((docking) => docking.shuttleId === 'chacau');
  if (currentDockings.length !== 1) {
    throw new Error('Chacau repairs require one authoritative docked host.');
  }
  const hostShipId = currentDockings[0]!.shipId;
  if (!isResourceShipId(hostShipId) || hostShipId !== input.expectedHostShipId ||
      !input.fleetGroupVesselIds.includes(hostShipId)) {
    throw new Error('The expected docked host is outside the Refinery 124 Engineer’s current fleet group.');
  }
  if (input.damage.destroyed) throw new Error('A destroyed ship cannot receive Chacau repairs.');

  const known = new Set(input.knownSystemIds);
  const damaged = new Set(input.damage.damagedSystemIds);
  if (input.systemIds.some((id) => !known.has(id) || !damaged.has(id))) {
    throw new Error('Choose only damaged consoles on the docked host.');
  }

  const priorHosts = input.ledger.cycle === input.currentCycle ? input.ledger.hosts : [];
  const priorHost = priorHosts.find((entry) => entry.shipId === hostShipId);
  const repairedOnHost = priorHost?.systemIds ?? [];
  if (input.systemIds.some((id) => repairedOnHost.includes(id))) {
    throw new Error('A console already repaired this cycle cannot be selected again.');
  }
  if (repairedOnHost.length + input.systemIds.length > CHACAU_MAX_CONSOLES_PER_HOST) {
    throw new Error('Chacau may repair at most two consoles on one ship each cycle.');
  }
  if (!priorHost && priorHosts.length === 1 && !input.fuelled) {
    throw new Error('Fuel Chacau before repairing a second ship this cycle.');
  }
  if (!priorHost && priorHosts.length >= CHACAU_MAX_HOSTS_PER_CYCLE) {
    throw new Error('Chacau may repair at most two ships each cycle.');
  }

  const cost = input.systemIds.length * CHACAU_REPAIR_COST;
  if (!Number.isSafeInteger(input.materials) || input.materials < cost) {
    throw new Error(`The docked host needs ${cost} materials for this repair.`);
  }
  const nextHost = { shipId: hostShipId, systemIds: [...repairedOnHost, ...input.systemIds] };
  return {
    hostShipId,
    damage: {
      ...input.damage,
      damagedSystemIds: input.damage.damagedSystemIds.filter((id) => !input.systemIds.includes(id)),
    },
    materials: input.materials - cost,
    repairedSystemIds: [...input.systemIds],
    ledger: {
      cycle: input.currentCycle,
      revision: input.ledger.revision + 1,
      hosts: priorHost
        ? priorHosts.map((entry) => entry.shipId === hostShipId ? nextHost : entry)
        : [...priorHosts, nextHost],
    },
  };
}
