import { chargeableConsoleIds, parseMaintenanceCycle, type MaintenanceCycle } from './maintenance';
import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';
import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import { isResourceShipId } from './resources';

export const SERVICE_SHUTTLE_IDS = ['black-sheep', 'condor', 'wobbly'] as const;
export type ServiceShuttleId = typeof SERVICE_SHUTTLE_IDS[number];

export interface ServiceShuttleRechargeEntry {
  readonly cycle: number;
  readonly hostShipId: string;
  readonly consoleId: string;
  readonly revision: number;
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
}>): Readonly<{
  hostShipId: string;
  maintenanceCycle: MaintenanceCycle;
  ledger: ServiceShuttleRechargeEntry;
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
  return {
    hostShipId,
    maintenanceCycle: {
      ...maintenanceCycle,
      revision: maintenanceCycle.revision + 1,
      charges: [...maintenanceCycle.charges, input.targetConsoleId],
    },
    ledger: {
      cycle: input.currentCycle,
      hostShipId,
      consoleId: input.targetConsoleId,
      revision,
    },
  };
}
