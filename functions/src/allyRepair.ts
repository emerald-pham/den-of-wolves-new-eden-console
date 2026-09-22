import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import type { ShipDamageState } from './shipDamage';
import { isResourceShipId } from './resources';

export const ALLY_REPAIR_COST = 4;
export const ALLY_MAX_CONSOLES_PER_HOST = 2;
export const ALLY_UNION_ROLE_ID = 'joint-engineering-shepherd-icebreaker';
export const ALLY_HOST_SHIP_IDS = ['shepherd', 'icebreaker'] as const;

export interface AllyRepairHostEntry {
  readonly shipId: typeof ALLY_HOST_SHIP_IDS[number];
  readonly systemIds: readonly string[];
}

export interface AllyRepairLedger {
  readonly cycle: number;
  readonly revision: number;
  readonly hosts: readonly AllyRepairHostEntry[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function parseAllyRepairLedger(value: unknown): AllyRepairLedger | null {
  if (value === undefined) return { cycle: 0, revision: 0, hosts: [] };
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) => !['cycle', 'revision', 'hosts'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      !Array.isArray(raw.hosts) || raw.hosts.length < 1 || raw.hosts.length > ALLY_HOST_SHIP_IDS.length) {
    return null;
  }
  const hosts: AllyRepairHostEntry[] = [];
  for (const host of raw.hosts) {
    const entry = record(host);
    if (!entry || Object.keys(entry).some((key) => !['shipId', 'systemIds'].includes(key)) ||
        typeof entry.shipId !== 'string' || !ALLY_HOST_SHIP_IDS.includes(entry.shipId as typeof ALLY_HOST_SHIP_IDS[number]) ||
        !isResourceShipId(entry.shipId) || !Array.isArray(entry.systemIds) ||
        entry.systemIds.length < 1 || entry.systemIds.length > ALLY_MAX_CONSOLES_PER_HOST ||
        entry.systemIds.some((id) => typeof id !== 'string' || id.length === 0) ||
        new Set(entry.systemIds).size !== entry.systemIds.length ||
        hosts.some((candidate) => candidate.shipId === entry.shipId)) return null;
    hosts.push({
      shipId: entry.shipId as AllyRepairHostEntry['shipId'],
      systemIds: entry.systemIds as string[],
    });
  }
  return { cycle: raw.cycle as number, revision: raw.revision as number, hosts };
}

/** Resolve repairs from the server-owned Ally control, current dock, fuel and host ledgers. */
export function resolveAllyRepair(input: Readonly<{
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
  ledger: AllyRepairLedger;
}>): Readonly<{
  hostShipId: AllyRepairHostEntry['shipId'];
  damage: ShipDamageState;
  materials: number;
  ledger: AllyRepairLedger;
  repairedSystemIds: readonly string[];
}> {
  if (input.control.shuttleId !== 'ally' ||
      input.control.ownerRoleId !== ALLY_UNION_ROLE_ID ||
      input.control.holderUid !== input.actorUid) {
    throw new Error('Only the current J.E.U. Ally holder may repair consoles.');
  }
  if (!Number.isSafeInteger(input.expectedControlRevision) || input.expectedControlRevision < 0 ||
      input.control.revision !== input.expectedControlRevision) {
    throw new Error('Ally control changed; refresh before repairing.');
  }
  if (!Number.isSafeInteger(input.currentCycle) || input.currentCycle < 1) {
    throw new Error('A numbered cycle is required for Ally repairs.');
  }
  if (!Number.isSafeInteger(input.expectedRepairRevision) || input.expectedRepairRevision < 0 ||
      input.ledger.revision !== input.expectedRepairRevision) {
    throw new Error('Ally repair history changed; refresh before repairing.');
  }
  if (input.ledger.revision >= Number.MAX_SAFE_INTEGER || input.ledger.cycle > input.currentCycle) {
    throw new Error('Ally repair history is outside the safe cycle range.');
  }
  if (input.systemIds.length < 1 || input.systemIds.length > ALLY_MAX_CONSOLES_PER_HOST ||
      input.systemIds.some((id) => typeof id !== 'string' || id.length === 0) ||
      new Set(input.systemIds).size !== input.systemIds.length) {
    throw new Error('Choose one or two different damaged consoles.');
  }
  const currentDockings = input.dockings.filter((docking) => docking.shuttleId === 'ally');
  if (currentDockings.length !== 1 ||
      !ALLY_HOST_SHIP_IDS.includes(currentDockings[0]!.shipId as AllyRepairHostEntry['shipId'])) {
    throw new Error('Ally repairs require one authoritative dock at Shepherd or Icebreaker.');
  }
  const hostShipId = currentDockings[0]!.shipId as AllyRepairHostEntry['shipId'];
  if (input.damage.destroyed) throw new Error('A destroyed ship cannot receive Ally repairs.');
  const known = new Set(input.knownSystemIds);
  const damaged = new Set(input.damage.damagedSystemIds);
  if (input.systemIds.some((id) => !known.has(id) || !damaged.has(id))) {
    throw new Error('Choose only damaged consoles on Ally’s docked host.');
  }

  const priorHosts = input.ledger.cycle === input.currentCycle ? input.ledger.hosts : [];
  const priorHost = priorHosts.find((entry) => entry.shipId === hostShipId);
  const repairedOnHost = priorHost?.systemIds ?? [];
  if (repairedOnHost.length + input.systemIds.length > ALLY_MAX_CONSOLES_PER_HOST) {
    throw new Error('Ally may repair at most two consoles on one ship each cycle.');
  }
  if (!priorHost && priorHosts.length >= 1 && !input.fuelled) {
    throw new Error('Fuel Ally before repairing a second ship this cycle.');
  }
  if (!priorHost && priorHosts.length >= ALLY_HOST_SHIP_IDS.length) {
    throw new Error('Ally may repair at most two Union ships each cycle.');
  }
  if (!Number.isSafeInteger(input.materials) || input.materials < input.systemIds.length * ALLY_REPAIR_COST) {
    throw new Error(`The docked host needs ${input.systemIds.length * ALLY_REPAIR_COST} materials for this repair.`);
  }

  const nextHost: AllyRepairHostEntry = {
    shipId: hostShipId,
    systemIds: [...repairedOnHost, ...input.systemIds],
  };
  return {
    hostShipId,
    damage: {
      ...input.damage,
      damagedSystemIds: input.damage.damagedSystemIds.filter((id) => !input.systemIds.includes(id)),
    },
    materials: input.materials - input.systemIds.length * ALLY_REPAIR_COST,
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
