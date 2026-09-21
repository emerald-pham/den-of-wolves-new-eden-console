import {
  craftStartingManifestForSetup,
  craftStartingManifestMatches,
  roleOwnedCraftForRoles,
  shuttleDockingsAreParked,
  shuttleDockingsMatchActiveRoleOwnedSubset,
  shuttleHostIsAllowed,
} from './craftOwnership';
import { activeVesselIdsForRoles } from './gameSetup';
import { INITIAL_SHIP_RESOURCES, RESOURCE_IDS } from './resources';
import { parseRetainedShuttles } from './retainedShuttles';
import { isValidRoleConfiguration } from './roleConfiguration';
import { SHIP_DAMAGE_DECKS } from './shipDamage';
import { SHUTTLE_CARGO_TYPES } from './shuttleCargoTransfer';
import { parseShuttleControl } from './shuttleControl';

export interface BoardingSecurityTeamAuthority {
  readonly shipSecurityTeams: Readonly<Record<string, number>>;
  readonly shuttleSecurityTeams: Readonly<Record<string, number>>;
  readonly boardingSecurityTeamsByHost: Readonly<Record<string, number>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInventory(value: unknown, permittedKeys: readonly string[]): Record<string, number> | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !permittedKeys.includes(key)) ||
      Object.values(value).some((amount) => !Number.isSafeInteger(amount) || (amount as number) < 0)) {
    return null;
  }
  return value as Record<string, number>;
}

function exactUniqueIds(value: unknown, permitted: ReadonlySet<string>): readonly string[] | null {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !permitted.has(id)) ||
      new Set(value).size !== value.length) return null;
  return value as readonly string[];
}

function exactShipDamage(
  value: unknown,
  activeVesselIds: readonly string[],
): Readonly<Record<string, { readonly damagedSystemIds: readonly string[]; readonly destroyed: boolean }>> | null {
  if (!isRecord(value) || Object.keys(value).some((shipId) => !activeVesselIds.includes(shipId))) {
    return null;
  }
  const parsed: Record<string, { damagedSystemIds: readonly string[]; destroyed: boolean }> = {};
  for (const [shipId, raw] of Object.entries(value)) {
    if (!isRecord(raw) || Object.keys(raw).length !== 2 ||
        !Object.hasOwn(raw, 'damagedSystemIds') || !Object.hasOwn(raw, 'destroyed') ||
        !Array.isArray(raw.damagedSystemIds) || typeof raw.destroyed !== 'boolean') return null;
    const knownSystemIds = new Set((SHIP_DAMAGE_DECKS[shipId] ?? []).map((card) => card.systemId));
    if (raw.damagedSystemIds.some((systemId) =>
      typeof systemId !== 'string' || !knownSystemIds.has(systemId)) ||
        new Set(raw.damagedSystemIds).size !== raw.damagedSystemIds.length) return null;
    parsed[shipId] = {
      damagedSystemIds: raw.damagedSystemIds as readonly string[],
      destroyed: raw.destroyed,
    };
  }
  return parsed;
}

/**
 * Preserve every security team in its ship or shuttle ledger while allowing
 * boarding defence only at the shuttle's current authoritative docked host.
 */
export function boardingSecurityTeamAuthority(input: Readonly<{
  activeRoleIds: unknown;
  activeVesselIds: unknown;
  vesselMode: unknown;
  startingCraftManifest: unknown;
  shuttleVisitLog: unknown;
  retainedShuttles: unknown;
  shuttleControl: unknown;
  shipDamage: unknown;
  shipResources: unknown;
  shuttleCargo: unknown;
  shuttleDockings: unknown;
}>): BoardingSecurityTeamAuthority {
  const knownVessels = new Set(Object.keys(INITIAL_SHIP_RESOURCES));
  const activeRoleIds = Array.isArray(input.activeRoleIds) &&
      input.activeRoleIds.every((roleId) => typeof roleId === 'string') &&
      new Set(input.activeRoleIds).size === input.activeRoleIds.length
    ? input.activeRoleIds as readonly string[]
    : null;
  const activeVesselIds = exactUniqueIds(input.activeVesselIds, knownVessels);
  if (!activeRoleIds || !isValidRoleConfiguration(activeRoleIds) ||
      !activeVesselIds || activeVesselIds.length === 0 ||
      typeof input.vesselMode !== 'string' || input.vesselMode.length === 0 ||
      !isRecord(input.shipResources) || !isRecord(input.shuttleCargo) ||
      !Array.isArray(input.shuttleDockings) || !isRecord(input.startingCraftManifest) ||
      !Array.isArray(input.startingCraftManifest.entries) || !Array.isArray(input.shuttleVisitLog)) {
    throw new Error('Security-team location authority is malformed.');
  }
  const expectedVesselIds = activeVesselIdsForRoles(activeRoleIds);
  if (expectedVesselIds.length !== activeVesselIds.length ||
      expectedVesselIds.some((shipId) => !activeVesselIds.includes(shipId))) {
    throw new Error('Active vessels do not match the locked role roster.');
  }
  const roleOwnedShuttleIds = new Set(roleOwnedCraftForRoles(activeRoleIds)
    .filter((craft) => craft.kind === 'shuttle').map((craft) => craft.id));
  const startingDockings: Array<{ shuttleId: string; shipId: string }> = [];
  const latestVisit = new Map<string, { action: 'docked' | 'departed'; shipId: string }>();
  const visitIds = new Set<string>();
  for (const value of input.shuttleVisitLog) {
    if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 ||
        visitIds.has(value.id) ||
        typeof value.shuttleId !== 'string' || !roleOwnedShuttleIds.has(value.shuttleId) ||
        typeof value.shipId !== 'string' || !activeVesselIds.includes(value.shipId) ||
        !shuttleHostIsAllowed(value.shuttleId, value.shipId) ||
        (value.action !== 'docked' && value.action !== 'departed') ||
        typeof value.occurredAt !== 'string' || value.occurredAt.trim().length === 0) {
      throw new Error('The shuttle visit history is malformed or unauthorized.');
    }
    visitIds.add(value.id);
    const previous = latestVisit.get(value.shuttleId);
    if (!previous) {
      if (value.action !== 'docked') {
        throw new Error('Every enabled shuttle must begin with a docking visit.');
      }
      startingDockings.push({ shuttleId: value.shuttleId, shipId: value.shipId });
    } else if (value.action === previous.action ||
        value.action === 'departed' && value.shipId !== previous.shipId) {
      throw new Error('The shuttle visit history contains an impossible transition.');
    }
    latestVisit.set(value.shuttleId, { action: value.action, shipId: value.shipId });
  }
  const expectedStartingCraft = craftStartingManifestForSetup(
    activeRoleIds,
    input.vesselMode,
    startingDockings,
  );
  if (!craftStartingManifestMatches(
    input.startingCraftManifest,
    expectedStartingCraft,
    activeVesselIds,
  )) {
    throw new Error('Enabled craft do not match the canonical starting manifest.');
  }
  const enabledShuttleIds = expectedStartingCraft.entries
    .filter((craft) => craft.kind === 'shuttle')
    .map((craft) => craft.id);
  const enabledShuttles = new Map(expectedStartingCraft.entries
    .filter((craft) => craft.kind === 'shuttle').map((craft) => [craft.id, craft]));
  const retainedShuttles = parseRetainedShuttles(input.retainedShuttles);
  const shuttleControl = parseShuttleControl(input.shuttleControl);
  const currentDamage = exactShipDamage(input.shipDamage, activeVesselIds);
  if (!retainedShuttles || !shuttleControl || !currentDamage ||
      Object.entries(retainedShuttles).some(([shuttleId, retained]) =>
    !enabledShuttles.has(shuttleId) ||
    retained.ownerRoleId !== enabledShuttles.get(shuttleId)!.ownerRoleId ||
    !activeVesselIds.includes(retained.destroyedHostShipId) ||
    currentDamage[retained.destroyedHostShipId]?.destroyed !== true ||
    shuttleControl[shuttleId]?.ownerRoleId !== retained.ownerRoleId ||
    shuttleControl[shuttleId]?.holderUid !== retained.holderUid ||
    shuttleControl[shuttleId]?.revision !== retained.controlRevision)) {
    throw new Error('Retained shuttle custody does not match the enabled craft manifest.');
  }
  if (Object.keys(input.shipResources).length !== activeVesselIds.length ||
      Object.keys(input.shipResources).some((shipId) => !activeVesselIds.includes(shipId)) ||
      Object.keys(input.shuttleCargo).some((shuttleId) => !enabledShuttleIds.includes(shuttleId))) {
    throw new Error('Security-team ledgers do not match the active fleet and shuttle manifest.');
  }

  const shipSecurityTeams: Record<string, number> = {};
  for (const shipId of activeVesselIds) {
    const inventory = safeInventory(input.shipResources[shipId], RESOURCE_IDS);
    if (!inventory || !Object.prototype.hasOwnProperty.call(inventory, 'securityTeams')) {
      throw new Error('A host security-team ledger is malformed.');
    }
    shipSecurityTeams[shipId] = inventory.securityTeams!;
  }

  const shuttleSecurityTeams: Record<string, number> = {};
  for (const shuttleId of enabledShuttleIds) {
    const permitted = SHUTTLE_CARGO_TYPES[shuttleId] ?? [];
    const stored = input.shuttleCargo[shuttleId];
    const inventory = stored === undefined ? {} : safeInventory(stored, permitted);
    if (!inventory) throw new Error('A shuttle security-team ledger is malformed.');
    shuttleSecurityTeams[shuttleId] = inventory.securityTeams ?? 0;
  }

  if (!shuttleDockingsAreParked(input.shuttleDockings, activeVesselIds) ||
      !shuttleDockingsMatchActiveRoleOwnedSubset(
        activeRoleIds,
        input.shuttleDockings as readonly { shuttleId: string; shipId: string }[],
      )) {
    throw new Error('Authoritative shuttle docking is malformed or unauthorized.');
  }
  const hostByShuttle = new Map<string, string>();
  for (const value of input.shuttleDockings as readonly Record<string, unknown>[]) {
    hostByShuttle.set(value.shuttleId as string, value.shipId as string);
  }
  for (const shuttleId of enabledShuttleIds) {
    const currentHost = hostByShuttle.get(shuttleId);
    const latest = latestVisit.get(shuttleId);
    const retained = retainedShuttles[shuttleId];
    if (!latest || currentHost && (retained !== undefined ||
        latest.action !== 'docked' || latest.shipId !== currentHost) ||
        !currentHost && retained === undefined && latest.action !== 'departed' ||
        !currentHost && retained !== undefined &&
          (latest.action !== 'docked' || latest.shipId !== retained.destroyedHostShipId)) {
      throw new Error('Current shuttle location does not match its authoritative visit history.');
    }
  }

  const boardingSecurityTeamsByHost = { ...shipSecurityTeams };
  for (const [shuttleId, amount] of Object.entries(shuttleSecurityTeams)) {
    const host = hostByShuttle.get(shuttleId);
    if (!host || amount === 0) continue;
    const current = boardingSecurityTeamsByHost[host]!;
    if (current > Number.MAX_SAFE_INTEGER - amount) {
      throw new Error('Host security-team total exceeds the safe integer range.');
    }
    boardingSecurityTeamsByHost[host] = current + amount;
  }
  return Object.freeze({
    shipSecurityTeams: Object.freeze(shipSecurityTeams),
    shuttleSecurityTeams: Object.freeze(shuttleSecurityTeams),
    boardingSecurityTeamsByHost: Object.freeze(boardingSecurityTeamsByHost),
  });
}
