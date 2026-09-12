import type {
  GameSession,
  MaintenanceCycle,
  ShipDamageState,
  ShipJumpState,
  ShipJumpTransition,
  ShipNavigationLogEntry,
  ShipNavigationLogs,
} from '@/types/game';
import { MAINTENANCE_EVENT_RESULT_STEPS } from '@/types/game';
import {
  resourcesForShip,
  type ShipResourceInventory,
} from '@/data/resources';
import { populationForShip } from '@/data/shipPopulation';

/**
 * The public operational state needed to render one ship console.
 *
 * This is deliberately a new allowlisted shape rather than a view of the
 * session object. Role briefs, loyalty, facilitator notes, and other hidden
 * records live on protected paths and have no place in a vessel projection.
 */
export interface ShipConsoleProjection {
  readonly shipId: string;
  readonly currentTurn?: number;
  readonly galacticCoordinate: string;
  readonly resources?: ShipResourceInventory;
  readonly damage?: ShipDamageState;
  readonly population?: number;
  readonly unrest: number;
  readonly navigationLogs: ShipNavigationLogs;
  readonly maintenanceCycle?: MaintenanceCycle;
  readonly upgrades: readonly string[];
  readonly fighterWingCounts?: GameSession['fighterWingCounts'];
  readonly jumpState?: ShipJumpState;
  readonly jumpTransition?: ShipJumpTransition;
  readonly consoleLocked: boolean;
}

type RecordValue = Readonly<Record<string, unknown>>;

function recordValue(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalTimestampString(value: unknown): string | undefined {
  const stringValue = optionalString(value);
  if (stringValue) return stringValue;
  if (typeof value !== 'object' || value === null || !('toDate' in value) ||
      typeof value.toDate !== 'function') return undefined;
  const date = value.toDate();
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function parseMaintenanceCycle(value: unknown): MaintenanceCycle | undefined {
  const raw = recordValue(value);
  const step = nonNegativeInteger(raw?.step);
  const revision = nonNegativeInteger(raw?.revision);
  if (step === undefined || revision === undefined) return undefined;

  const rawResults = recordValue(raw?.results);
  const turn = nonNegativeInteger(raw?.turn);
  const rationBonus = typeof raw?.rationBonus === 'number' && Number.isFinite(raw.rationBonus)
    ? raw.rationBonus
    : undefined;
  const startedAt = optionalTimestampString(raw?.startedAt);
  const completedAt = optionalTimestampString(raw?.completedAt);
  const damageDrawId = optionalString(raw?.damageDrawId);
  const results = Object.fromEntries(
    Object.entries(rawResults ?? {}).filter(([key, result]) =>
      MAINTENANCE_EVENT_RESULT_STEPS.includes(key as typeof MAINTENANCE_EVENT_RESULT_STEPS[number]) &&
      typeof result === 'string'),
  ) as Readonly<Record<string, string>>;
  const cycle: MaintenanceCycle = {
    step,
    revision,
    results,
    charges: stringArray(raw?.charges),
    refuelled: stringArray(raw?.refuelled),
    ...(turn === undefined ? {} : { turn }),
    ...(rationBonus === undefined ? {} : { rationBonus }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(damageDrawId === undefined ? {} : { damageDrawId }),
  };
  return cycle;
}

function damageState(value: unknown): ShipDamageState | undefined {
  const raw = recordValue(value);
  if (!raw || typeof raw.destroyed !== 'boolean' || !Array.isArray(raw.damagedSystemIds)) return undefined;
  return {
    damagedSystemIds: raw.damagedSystemIds.filter((id): id is string => typeof id === 'string'),
    destroyed: raw.destroyed,
  };
}

function jumpState(value: unknown): ShipJumpState | undefined {
  const raw = recordValue(value);
  if (!raw) return undefined;
  const lastJumpTurn = nonNegativeInteger(raw.lastJumpTurn);
  const integrityLockedUntil = optionalString(raw.integrityLockedUntil);
  if (lastJumpTurn === undefined && integrityLockedUntil === undefined) return undefined;
  return {
    ...(lastJumpTurn === undefined ? {} : { lastJumpTurn }),
    ...(integrityLockedUntil === undefined ? {} : { integrityLockedUntil }),
  };
}

function jumpTransition(value: unknown, shipId: string): ShipJumpTransition | undefined {
  const raw = recordValue(value);
  if (!raw || raw.shipId !== shipId) return undefined;
  const id = optionalString(raw.id);
  const origin = optionalString(raw.origin);
  const destination = optionalString(raw.destination);
  const occurredAt = optionalString(raw.occurredAt);
  if (!id || !origin || !destination || !occurredAt) return undefined;
  return { id, shipId, origin, destination, occurredAt } as ShipJumpTransition;
}

function navigationLogEntry(value: unknown, shipId: string): ShipNavigationLogEntry | undefined {
  const raw = recordValue(value);
  if (!raw || raw.shipId !== shipId) return undefined;
  const id = optionalString(raw.id);
  const type = raw.type;
  const origin = optionalString(raw.origin);
  const destination = optionalString(raw.destination);
  const occurredAt = optionalString(raw.occurredAt);
  const stardate = optionalString(raw.stardate);
  const subjectShipId = optionalString(raw.subjectShipId) as ShipNavigationLogEntry['subjectShipId'];
  const subjectShipName = optionalString(raw.subjectShipName);
  if (!id || (type !== 'self-jump' && type !== 'ship-jump-away' && type !== 'ship-jump-arrival') ||
      !origin || !destination || !occurredAt || !stardate) return undefined;
  return {
    id,
    shipId,
    type,
    origin,
    destination,
    occurredAt,
    stardate,
    ...(subjectShipId ? { subjectShipId } : {}),
    ...(subjectShipName ? { subjectShipName } : {}),
    ...(typeof raw.navigationalError === 'boolean' ? { navigationalError: raw.navigationalError } : {}),
  };
}

function navigationLogsForShip(session: GameSession, shipId: string): ShipNavigationLogs {
  const entries = session.shipNavigationLogs?.[shipId] ?? [];
  return {
    [shipId]: entries.flatMap((entry) => {
      const parsed = navigationLogEntry(entry, shipId);
      return parsed ? [parsed] : [];
    }),
  };
}

function upgradesForShip(session: GameSession, shipId: string): readonly string[] {
  const upgrades = session.shipUpgrades?.[shipId];
  return Array.isArray(upgrades) ? upgrades.filter((upgrade): upgrade is string => typeof upgrade === 'string') : [];
}

/** Select only the public operational state needed by one ship console. */
export function projectShipState(session: GameSession, shipId: string): ShipConsoleProjection {
  const storedPopulation = session.shipSurvivors?.[shipId];
  const storedUnrest = session.shipUnrest?.[shipId];
  const coordinate = session.shipGalacticCoordinates?.[shipId];
  const resources = resourcesForShip(shipId, session.shipResources);
  const damage = damageState(session.shipDamage?.[shipId]);
  const population = typeof storedPopulation === 'number' && Number.isFinite(storedPopulation)
    ? Math.max(0, storedPopulation)
    : populationForShip(shipId, undefined);
  const maintenance = parseMaintenanceCycle(session.maintenanceCycles?.[shipId]);
  const jumps = jumpState(session.shipJumpStates?.[shipId]);
  const transition = jumpTransition(session.shipJumpTransitions?.[shipId], shipId);
  return {
    shipId,
    ...(nonNegativeInteger(session.currentTurn) === undefined ? {} : { currentTurn: session.currentTurn }),
    galacticCoordinate: typeof coordinate === 'string' ? coordinate : '0000',
    ...(resources === undefined ? {} : { resources }),
    ...(damage === undefined ? {} : { damage }),
    ...(population === undefined ? {} : { population }),
    unrest: typeof storedUnrest === 'number' && Number.isFinite(storedUnrest)
      ? Math.max(0, Math.min(10, storedUnrest))
      : 0,
    navigationLogs: navigationLogsForShip(session, shipId),
    ...(maintenance === undefined ? {} : { maintenanceCycle: maintenance }),
    upgrades: upgradesForShip(session, shipId),
    ...(shipId === 'aegis' ? { fighterWingCounts: session.fighterWingCounts ?? {} } : {}),
    ...(jumps === undefined ? {} : { jumpState: jumps }),
    ...(transition === undefined ? {} : { jumpTransition: transition }),
    consoleLocked: session.shipConsoleLocks?.[shipId] === true,
  };
}
