import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';
import { isResourceShipId } from './resources';

export const MACAW_REPAIR_COST = 1;
export const MACAW_MAX_CONSOLES_PER_HOST = 2;
export const MACAW_MAX_HOSTS_PER_CYCLE = 2;

export interface MacawRepairHostEntry {
  readonly shipId: string;
  readonly systemIds: readonly string[];
}

export interface MacawRepairLedger {
  readonly cycle: number;
  readonly revision: number;
  readonly hosts: readonly MacawRepairHostEntry[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function parseMacawRepairLedger(value: unknown): MacawRepairLedger | null {
  if (value === undefined) return { cycle: 0, revision: 0, hosts: [] };
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) => !['cycle', 'revision', 'hosts'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      !Array.isArray(raw.hosts) || raw.hosts.length < 1 ||
      raw.hosts.length > MACAW_MAX_HOSTS_PER_CYCLE) return null;
  const hosts: MacawRepairHostEntry[] = [];
  for (const host of raw.hosts) {
    const entry = record(host);
    const knownSystemIds = entry && typeof entry.shipId === 'string'
      ? new Set((SHIP_DAMAGE_DECKS[entry.shipId] ?? []).map(({ systemId }) => systemId))
      : new Set<string>();
    if (!entry || Object.keys(entry).some((key) => !['shipId', 'systemIds'].includes(key)) ||
        typeof entry.shipId !== 'string' || !isResourceShipId(entry.shipId) ||
        !Array.isArray(entry.systemIds) || entry.systemIds.length < 1 ||
        entry.systemIds.length > MACAW_MAX_CONSOLES_PER_HOST ||
        entry.systemIds.some((id) => typeof id !== 'string' || id.length === 0) ||
        entry.systemIds.some((id) => typeof id !== 'string' || !knownSystemIds.has(id)) ||
        new Set(entry.systemIds).size !== entry.systemIds.length ||
        hosts.some((candidate) => candidate.shipId === entry.shipId)) return null;
    hosts.push({ shipId: entry.shipId, systemIds: entry.systemIds as string[] });
  }
  return { cycle: raw.cycle as number, revision: raw.revision as number, hosts };
}

export function resolveMacawRepair(input: Readonly<{
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
  scrap: number;
  knownSystemIds: readonly string[];
  ledger: MacawRepairLedger;
}>): Readonly<{
  hostShipId: string;
  damage: ShipDamageState;
  scrap: number;
  ledger: MacawRepairLedger;
  repairedSystemIds: readonly string[];
}> {
  if (input.control.shuttleId !== 'macaw' ||
      input.control.ownerRoleId !== 'capybara-captain' ||
      input.control.holderUid !== input.actorUid ||
      input.actorRoleId !== 'capybara-captain') {
    throw new Error('Only the current Capybara Captain holding Macaw may repair consoles.');
  }
  if (input.control.revision !== input.expectedControlRevision) {
    throw new Error('Macaw control changed; refresh before repairing.');
  }
  if (!Number.isSafeInteger(input.currentCycle) || input.currentCycle < 1) {
    throw new Error('A numbered cycle is required for Macaw repairs.');
  }
  if (input.expectedCycle !== input.currentCycle) {
    throw new Error('The Coordination cycle changed; refresh before repairing.');
  }
  if (!Number.isSafeInteger(input.expectedRepairRevision) || input.expectedRepairRevision < 0 ||
      input.ledger.revision !== input.expectedRepairRevision) {
    throw new Error('Macaw repair history changed; refresh before repairing.');
  }
  if (input.ledger.revision >= Number.MAX_SAFE_INTEGER || input.ledger.cycle > input.currentCycle) {
    throw new Error('Macaw repair history is outside the safe cycle range.');
  }
  if (input.systemIds.length < 1 || input.systemIds.length > MACAW_MAX_CONSOLES_PER_HOST ||
      input.systemIds.some((id) => typeof id !== 'string' || id.length === 0) ||
      new Set(input.systemIds).size !== input.systemIds.length) {
    throw new Error('Choose one or two different damaged consoles.');
  }

  const currentDockings = input.dockings.filter((docking) => docking.shuttleId === 'macaw');
  if (currentDockings.length !== 1) {
    throw new Error('Macaw repairs require one authoritative docked host.');
  }
  const hostShipId = currentDockings[0]!.shipId;
  if (!isResourceShipId(hostShipId) || hostShipId !== input.expectedHostShipId ||
      !input.fleetGroupVesselIds.includes(hostShipId)) {
    throw new Error('The expected docked host is outside the Capybara Captain’s current fleet group.');
  }
  if (input.damage.destroyed) throw new Error('A destroyed ship cannot receive Macaw repairs.');

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
  if (repairedOnHost.length + input.systemIds.length > MACAW_MAX_CONSOLES_PER_HOST) {
    throw new Error('Macaw may repair at most two consoles on one ship each cycle.');
  }
  if (!priorHost && priorHosts.length === 1 && !input.fuelled) {
    throw new Error('Fuel Macaw before repairing a second ship this cycle.');
  }
  if (!priorHost && priorHosts.length >= MACAW_MAX_HOSTS_PER_CYCLE) {
    throw new Error('Macaw may repair at most two ships each cycle.');
  }
  const cost = input.systemIds.length * MACAW_REPAIR_COST;
  if (!Number.isSafeInteger(input.scrap) || input.scrap < cost) {
    throw new Error(`The docked host needs ${cost} Scrap for this repair.`);
  }

  const nextHost = { shipId: hostShipId, systemIds: [...repairedOnHost, ...input.systemIds] };
  return {
    hostShipId,
    damage: {
      ...input.damage,
      damagedSystemIds: input.damage.damagedSystemIds.filter((id) => !input.systemIds.includes(id)),
    },
    scrap: input.scrap - cost,
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
