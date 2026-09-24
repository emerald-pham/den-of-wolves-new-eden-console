import { INITIAL_SHIP_RESOURCES } from '@/data/resources';
import type { WarriorRepairDronesState } from '@/types/game';
import { parseEntityId } from '@/types/identifiers';
import { damageSystemIdsForShip } from './chacauRepairLedger';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

/** Validate the public current-use ledger against resource-host damage decks. */
export function parseWarriorRepairDronesLedger(
  value: unknown,
): WarriorRepairDronesState | null {
  if (value === undefined) return { cycle: 0, revision: 0, hostShipId: '', systemIds: [] };
  const raw = record(value);
  if (!raw || Object.keys(raw).length !== 4 ||
      Object.keys(raw).some((key) => !['cycle', 'hostShipId', 'revision', 'systemIds'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      (raw.revision as number) > (raw.cycle as number) ||
      typeof raw.hostShipId !== 'string' || !Array.isArray(raw.systemIds) ||
      raw.systemIds.length < 1 || raw.systemIds.length > 2 ||
      raw.systemIds.some((id) => typeof id !== 'string') ||
      new Set(raw.systemIds).size !== raw.systemIds.length) return null;
  const hostShipId = parseEntityId('vessel', raw.hostShipId);
  const knownSystems = hostShipId ? damageSystemIdsForShip(hostShipId) : new Set<string>();
  if (!hostShipId || !Object.hasOwn(INITIAL_SHIP_RESOURCES, hostShipId) ||
      raw.systemIds.some((id) => !knownSystems.has(id as string) || (id as string).startsWith('armoured-hull'))) {
    return null;
  }
  return {
    cycle: raw.cycle as number,
    revision: raw.revision as number,
    hostShipId,
    systemIds: [...raw.systemIds] as string[],
  };
}
