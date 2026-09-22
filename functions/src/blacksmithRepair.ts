import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import type { ShipDamageState } from './shipDamage';
import { isResourceShipId } from './resources';

export const BLACKSMITH_REPAIR_COST = 4;
export const BLACKSMITH_MAX_CONSOLES_PER_SHIP = 2;

export interface BlacksmithRepairHostEntry {
  readonly shipId: string;
  readonly systemIds: readonly string[];
}

export interface BlacksmithRepairLedger {
  readonly cycle: number;
  readonly revision: number;
  readonly hosts: readonly BlacksmithRepairHostEntry[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function parseBlacksmithRepairLedger(value: unknown): BlacksmithRepairLedger | null {
  if (value === undefined) return { cycle: 0, revision: 0, hosts: [] };
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) => !['cycle', 'revision', 'hosts'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      !Array.isArray(raw.hosts) || raw.hosts.length < 1 || raw.hosts.length > 2) return null;
  const hosts: BlacksmithRepairHostEntry[] = [];
  for (const host of raw.hosts) {
    const entry = record(host);
    if (!entry || Object.keys(entry).some((key) => !['shipId', 'systemIds'].includes(key)) ||
        typeof entry.shipId !== 'string' || !isResourceShipId(entry.shipId) ||
        !Array.isArray(entry.systemIds) || entry.systemIds.length < 1 ||
        entry.systemIds.length > BLACKSMITH_MAX_CONSOLES_PER_SHIP ||
        entry.systemIds.some((id) => typeof id !== 'string' || id.length === 0) ||
        new Set(entry.systemIds).size !== entry.systemIds.length ||
        hosts.some((candidate) => candidate.shipId === entry.shipId)) return null;
    hosts.push({ shipId: entry.shipId, systemIds: entry.systemIds as string[] });
  }
  return { cycle: raw.cycle as number, revision: raw.revision as number, hosts };
}

export function resolveBlacksmithRepair(input: Readonly<{
  actorUid: string;
  currentCycle: number;
  expectedControlRevision: number;
  expectedRepairRevision: number;
  systemIds: readonly string[];
  control: ShuttleControlEntry;
  dockings: readonly AuthoritativeShuttleDocking[];
  fuelled: boolean;
  damage: ShipDamageState;
  materials: number;
  knownSystemIds: readonly string[];
  ledger: BlacksmithRepairLedger;
}>): Readonly<{
  hostShipId: string;
  damage: ShipDamageState;
  materials: number;
  ledger: BlacksmithRepairLedger;
  repairedSystemIds: readonly string[];
}> {
  if (input.control.shuttleId !== 'blacksmith' ||
      input.control.ownerRoleId !== 'icebreaker-engineer' ||
      input.control.holderUid !== input.actorUid) {
    throw new Error('Only the current Blacksmith holder may repair consoles.');
  }
  if (input.control.revision !== input.expectedControlRevision) {
    throw new Error('Blacksmith control changed; refresh before repairing.');
  }
  if (!Number.isSafeInteger(input.currentCycle) || input.currentCycle < 1) {
    throw new Error('A numbered cycle is required for Blacksmith repairs.');
  }
  if (input.ledger.revision !== input.expectedRepairRevision) {
    throw new Error('Blacksmith repair history changed; refresh before repairing.');
  }
  if (input.ledger.revision >= Number.MAX_SAFE_INTEGER || input.ledger.cycle > input.currentCycle) {
    throw new Error('Blacksmith repair history is outside the safe cycle range.');
  }
  if (input.systemIds.length < 1 || input.systemIds.length > BLACKSMITH_MAX_CONSOLES_PER_SHIP ||
      new Set(input.systemIds).size !== input.systemIds.length) {
    throw new Error('Choose one or two different damaged consoles.');
  }
  const currentDockings = input.dockings.filter((docking) => docking.shuttleId === 'blacksmith');
  if (currentDockings.length !== 1) {
    throw new Error('Blacksmith repairs require one authoritative docked host.');
  }
  const hostShipId = currentDockings[0]!.shipId;
  if (input.damage.destroyed) throw new Error('A destroyed ship cannot receive Blacksmith repairs.');
  const known = new Set(input.knownSystemIds);
  const damaged = new Set(input.damage.damagedSystemIds);
  if (input.systemIds.some((id) => !known.has(id) || !damaged.has(id))) {
    throw new Error('Choose only damaged consoles on the docked host.');
  }
  const priorHosts = input.ledger.cycle === input.currentCycle ? input.ledger.hosts : [];
  const priorHost = priorHosts.find((entry) => entry.shipId === hostShipId);
  const repairedOnHost = priorHost?.systemIds ?? [];
  if (repairedOnHost.length + input.systemIds.length > BLACKSMITH_MAX_CONSOLES_PER_SHIP) {
    throw new Error('Blacksmith may repair at most two consoles on one ship each cycle.');
  }
  if (!priorHost && priorHosts.length >= 1 && !input.fuelled) {
    throw new Error('Fuel Blacksmith before repairing a second ship this cycle.');
  }
  if (!priorHost && priorHosts.length >= 2) {
    throw new Error('Blacksmith may repair at most two ships each cycle.');
  }
  const cost = input.systemIds.length * BLACKSMITH_REPAIR_COST;
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
