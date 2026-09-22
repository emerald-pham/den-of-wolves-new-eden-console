import { findShip } from '@/data/ships';
import type { ChacauRepairLedger } from '@/types/game';
import { parseEntityId } from '@/types/identifiers';

const AEGIS_DAMAGE_SYSTEM_IDS = [
  'command-and-control', 'fighter-bay-alpha', 'fighter-bay-bravo',
  'missile-launchers', 'point-defence-lasers',
] as const;

/** The client-side copy of the canonical damage deck's system identity set. */
export function damageSystemIdsForShip(shipId: string): ReadonlySet<string> {
  const ship = findShip(shipId);
  const ids = new Set(ship?.systems?.map(({ id }) => id) ?? []);
  if (shipId === 'aegis') {
    // These combat consoles are in the AEGIS damage deck but are not part of
    // the Admiral ship-system list used by the printed console surface.
    AEGIS_DAMAGE_SYSTEM_IDS.forEach((id) => ids.add(id));
  }
  return ids;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Parse persisted Chacau history against the same canonical IDs as Macaw. */
export function parseChacauRepairLedger(value: unknown): ChacauRepairLedger | null {
  if (value === undefined) return { cycle: 0, revision: 0, hosts: [] };
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) => !['cycle', 'revision', 'hosts'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      !Array.isArray(raw.hosts) || raw.hosts.length < 1 || raw.hosts.length > 2) return null;

  const seenShips = new Set<string>();
  const hosts: ChacauRepairLedger['hosts'][number][] = [];
  for (const value of raw.hosts) {
    const host = record(value);
    const shipId = host ? parseEntityId('vessel', host.shipId) : undefined;
    const rawSystemIds = host?.systemIds;
    const systemIds = Array.isArray(rawSystemIds)
      ? rawSystemIds.filter((id): id is string => typeof id === 'string')
      : [];
    const knownSystemIds = shipId ? damageSystemIdsForShip(shipId) : new Set<string>();
    if (!host || !shipId || !findShip(shipId) || seenShips.has(shipId) ||
        Object.keys(host).some((key) => !['shipId', 'systemIds'].includes(key)) ||
        systemIds.length < 1 || systemIds.length > 2 ||
        !Array.isArray(rawSystemIds) || systemIds.length !== rawSystemIds.length ||
        new Set(systemIds).size !== systemIds.length ||
        systemIds.some((id) => !knownSystemIds.has(id))) return null;
    seenShips.add(shipId);
    hosts.push({ shipId, systemIds });
  }
  return { cycle: raw.cycle as number, revision: raw.revision as number, hosts };
}
