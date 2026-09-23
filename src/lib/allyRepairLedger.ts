import { findShip } from '@/data/ships';
import type { AllyRepairLedger } from '@/types/game';
import { parseEntityId } from '@/types/identifiers';
import { damageSystemIdsForShip } from './chacauRepairLedger';

export const ALLY_HOST_SHIP_IDS = ['shepherd', 'icebreaker'] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Parse Ally history against its printed Union host pair and damage decks. */
export function parseAllyRepairLedger(value: unknown): AllyRepairLedger | null {
  if (value === undefined) return { cycle: 0, revision: 0, hosts: [] };
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) => !['cycle', 'revision', 'hosts'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      !Array.isArray(raw.hosts) || raw.hosts.length < 1 || raw.hosts.length > ALLY_HOST_SHIP_IDS.length) {
    return null;
  }

  const seenShips = new Set<string>();
  const hosts: AllyRepairLedger['hosts'][number][] = [];
  for (const value of raw.hosts) {
    const host = record(value);
    const shipId = host ? parseEntityId('vessel', host.shipId) : undefined;
    const rawSystemIds = host?.systemIds;
    const systemIds = Array.isArray(rawSystemIds)
      ? rawSystemIds.filter((id): id is string => typeof id === 'string')
      : [];
    const knownSystemIds = shipId ? damageSystemIdsForShip(shipId) : new Set<string>();
    if (!host || !shipId || !findShip(shipId) ||
        !ALLY_HOST_SHIP_IDS.includes(shipId as typeof ALLY_HOST_SHIP_IDS[number]) ||
        seenShips.has(shipId) ||
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
