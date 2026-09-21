import type { DocumentReference, DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { shipForRole } from './crewAccess';
import { replacementRoleFor } from './replacementRoles';
import { isStarSystemCoordinate, type NavigationLogEntry, type NavigationLogs } from './navigation';
import { jumpDistanceBetween } from './starChartGraph';
import { discoverySystemsForCoordinates, pursuitDistanceForCoordinate } from './starChartProjection';
import { organiserSitesForChart, type ChartId } from './starChartLookup';
import {
  systemHistory,
  systemHistoryForShip,
  type SystemHistory,
  type SystemHistoryForShip,
} from './systemHistory';

export interface NavigationState {
  readonly shipGalacticCoordinates: Readonly<Record<string, string>>;
  readonly shipNavigationLogs: NavigationLogs;
  readonly systemHistory?: SystemHistory;
  readonly pursuitGroups: Readonly<Record<string, number>>;
}

export interface PursuitFleetGroup {
  readonly id: string;
  readonly vesselIds: readonly string[];
}

export interface PlayerDiscoveryProjection {
  readonly groupId: string;
  /** Server-owned vessel membership for this player's current fleet group. */
  readonly fleetGroupVesselIds: readonly string[];
  readonly shipId?: string;
  readonly currentCoordinate?: string;
  readonly knownCoordinates: readonly string[];
  readonly knownSystems: Readonly<Record<string, string>>;
  readonly pursuitDistance: number;
  readonly pursuitValue?: number;
  readonly navigationLogs: readonly NavigationLogEntry[];
  readonly systemHistory?: SystemHistoryForShip;
  readonly revision: number;
}

const INITIAL_COORDINATE = '0000';

export function navigationStateDocumentPath(sessionId: string): string {
  return `sessions/${sessionId}/serverState/navigation`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validLog(value: unknown, shipId: string): value is NavigationLogEntry {
  if (!isRecord(value) || value.shipId !== shipId || typeof value.id !== 'string' ||
      (value.type !== 'self-jump' && value.type !== 'ship-jump-away' && value.type !== 'ship-jump-arrival') ||
      typeof value.origin !== 'string' || typeof value.destination !== 'string' ||
      typeof value.occurredAt !== 'string' || typeof value.stardate !== 'string' ||
      !isStarSystemCoordinate(value.origin) || !isStarSystemCoordinate(value.destination)) return false;
  return true;
}

function logsForShip(value: unknown, shipId: string): readonly NavigationLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is NavigationLogEntry => validLog(entry, shipId));
}

function validPursuitValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10;
}

/** Validate a complete authority map before the tolerant snapshot parser normalizes it. */
export function isValidPursuitAuthority(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).length === 0) return false;
  return Object.entries(value).every(([groupId, amount]) =>
    (groupId === 'fleet' || /^fleet-[1-9][0-9]*$/.test(groupId)) && validPursuitValue(amount));
}

/**
 * Parse the protected group map, with a deterministic one-time fallback for
 * legacy session headers. A present canonical key always wins, even when it is
 * malformed, so an old `fleet` alias can never revive or overwrite it.
 */
export function pursuitGroups(
  value: unknown,
  legacyValue?: unknown,
): Readonly<Record<string, number>> {
  const protectedRecord = isRecord(value) ? value : undefined;
  const source = protectedRecord && Object.prototype.hasOwnProperty.call(protectedRecord, 'pursuitGroups')
    ? protectedRecord.pursuitGroups
    : legacyValue;
  if (!isRecord(source)) return {};
  const result: Record<string, number> = {};
  for (const [groupId, amount] of Object.entries(source)) {
    if (/^fleet-[1-9][0-9]*$/.test(groupId) && validPursuitValue(amount)) result[groupId] = amount;
  }
  const canonicalPresent = Object.prototype.hasOwnProperty.call(source, 'fleet-1');
  if (!canonicalPresent && validPursuitValue(source.fleet)) result['fleet-1'] = source.fleet;
  return result;
}

export function navigationState(
  value: unknown,
  activeVesselIds: readonly string[],
  legacyPursuitGroups?: unknown,
): NavigationState {
  const raw = isRecord(value) ? value : {};
  const coordinates = isRecord(raw.shipGalacticCoordinates) ? raw.shipGalacticCoordinates : {};
  const logs = isRecord(raw.shipNavigationLogs) ? raw.shipNavigationLogs : {};
  const shipNavigationLogs = Object.fromEntries(activeVesselIds.map((shipId) => [
    shipId,
    logsForShip(logs[shipId], shipId),
  ])) as NavigationLogs;
  const normalizedHistory = systemHistory(raw.systemHistory, activeVesselIds, shipNavigationLogs);
  return {
    // Keep a malformed current fix for the movement authority to reject with
    // its integrity guard; player projections sanitize it to the origin below.
    shipGalacticCoordinates: Object.fromEntries(activeVesselIds.map((shipId) => [
      shipId,
      typeof coordinates[shipId] === 'string' ? coordinates[shipId] : INITIAL_COORDINATE,
    ])),
    shipNavigationLogs,
    ...(normalizedHistory ? { systemHistory: normalizedHistory } : {}),
    pursuitGroups: pursuitGroups(raw, legacyPursuitGroups),
  };
}

/**
 * Apply the shared cycle clock to every authoritative fleet group. A group in
 * the Ion Nebula keeps its current score; every other group rises by two,
 * capped at the terminal track value. Missing group authority is rejected
 * instead of silently creating, dropping, or cross-applying pursuit state.
 */
export function advancePursuitForCycle(
  navigation: NavigationState,
  fleetGroups: readonly PursuitFleetGroup[],
  chart: ChartId,
): NavigationState {
  const groupsById = new Map(fleetGroups.map((group) => [group.id, group]));
  const ionNebulaCoordinates = new Set(Object.entries(organiserSitesForChart(chart))
    .filter(([, site]) => site.code === 'I')
    .map(([coordinate]) => coordinate));
  for (const group of fleetGroups) {
    if (navigation.pursuitGroups[group.id] === undefined) {
      throw new Error(`Fleet group ${group.id} has no pursuit authority.`);
    }
  }
  const pursuitGroups: Record<string, number> = {};
  for (const [groupId, value] of Object.entries(navigation.pursuitGroups)) {
    const group = groupsById.get(groupId);
    if (!group) throw new Error(`Pursuit group ${groupId} has no fleet-group authority.`);
    const inIonNebula = group.vesselIds.every((shipId) =>
      ionNebulaCoordinates.has(navigation.shipGalacticCoordinates[shipId] ?? ''));
    pursuitGroups[groupId] = inIonNebula ? value : Math.min(10, value + 2);
  }
  return { ...navigation, pursuitGroups };
}

/**
 * Reduce the moving ship's group by the destination's server-owned printed
 * shortest-path depth from 0000, except at the selected chart's Level 5
 * Planet. The existing bounded score carries prior cycle rises and modifiers;
 * movement never increases it and cannot change another group's authority.
 */
export function adjustPursuitForMovement(
  navigation: NavigationState,
  fleetGroups: readonly PursuitFleetGroup[],
  shipId: string,
  destination: string,
  chart: ChartId,
): NavigationState {
  const destinationDepth = jumpDistanceBetween('0000', destination);
  if (destinationDepth === null) {
    throw new Error('Movement pursuit destination contains an unprinted coordinate.');
  }
  const matches = fleetGroups.filter((group) => group.vesselIds.includes(shipId));
  if (matches.length !== 1) {
    throw new Error(`Ship ${shipId} must belong to exactly one fleet group.`);
  }
  const groupsById = new Map<string, PursuitFleetGroup>();
  for (const group of fleetGroups) {
    if (groupsById.has(group.id)) throw new Error(`Fleet group ${group.id} is duplicated.`);
    groupsById.set(group.id, group);
    if (navigation.pursuitGroups[group.id] === undefined) {
      throw new Error(`Fleet group ${group.id} has no pursuit authority.`);
    }
  }
  for (const groupId of Object.keys(navigation.pursuitGroups)) {
    if (!groupsById.has(groupId)) throw new Error(`Pursuit group ${groupId} has no fleet-group authority.`);
  }
  const groupId = matches[0]!.id;
  const current = navigation.pursuitGroups[groupId];
  if (current === undefined) throw new Error(`Fleet group ${groupId} has no pursuit authority.`);
  const destinationSite = organiserSitesForChart(chart)[destination];
  const reduction = destinationSite?.code === 'G' ? 0 : destinationDepth;
  const pursuitGroups = {
    ...navigation.pursuitGroups,
    [groupId]: Math.max(0, Math.min(10, current - reduction)),
  };
  return { ...navigation, pursuitGroups };
}

export function knownCoordinates(
  currentCoordinate: string,
  entries: readonly NavigationLogEntry[],
): readonly string[] {
  return [...new Set([
    INITIAL_COORDINATE,
    ...entries.filter((entry) => entry.type === 'self-jump').flatMap((entry) => [entry.origin, entry.destination]),
    currentCoordinate,
  ])];
}

export function playerShipId(player: Pick<DocumentSnapshot, 'get'>): string | undefined {
  const replacement = player.get('replacementRoleId');
  if (replacement !== undefined && replacement !== null) {
    return typeof replacement === 'string' ? replacementRoleFor(replacement)?.vesselId : undefined;
  }
  return shipForRole(player.get('assignedRoleId'));
}

export function playerDiscoveryProjection(
  player: Pick<DocumentSnapshot, 'get'>,
  navigation: NavigationState,
  revision: number,
  fleetGroupVesselIds: readonly string[] = [],
): PlayerDiscoveryProjection {
  const groupId = typeof player.get('fleetGroupId') === 'string' ? player.get('fleetGroupId') as string : '';
  const shipId = playerShipId(player);
  if (!shipId || !groupId) {
    return {
      groupId,
      fleetGroupVesselIds: [...fleetGroupVesselIds],
      knownCoordinates: [INITIAL_COORDINATE],
      knownSystems: discoverySystemsForCoordinates([INITIAL_COORDINATE]),
      pursuitDistance: 0,
      ...(navigation.pursuitGroups[groupId] !== undefined
        ? { pursuitValue: navigation.pursuitGroups[groupId] }
        : {}),
      navigationLogs: [],
      revision,
    };
  }
  const currentCoordinate = isStarSystemCoordinate(navigation.shipGalacticCoordinates[shipId] ?? '')
    ? navigation.shipGalacticCoordinates[shipId]!
    : INITIAL_COORDINATE;
  const entries = navigation.shipNavigationLogs[shipId] ?? [];
  const ownHistory = systemHistoryForShip(navigation.systemHistory, shipId);
  return {
    groupId,
    fleetGroupVesselIds: [...fleetGroupVesselIds],
    shipId,
    currentCoordinate,
    knownCoordinates: knownCoordinates(currentCoordinate, entries),
    knownSystems: discoverySystemsForCoordinates(knownCoordinates(currentCoordinate, entries)),
    pursuitDistance: pursuitDistanceForCoordinate(currentCoordinate),
    ...(navigation.pursuitGroups[groupId] !== undefined
      ? { pursuitValue: navigation.pursuitGroups[groupId] }
      : {}),
    navigationLogs: entries,
    ...(ownHistory ? { systemHistory: ownHistory } : {}),
    revision,
  };
}

export function writePlayerDiscoveryProjection(
  tx: Transaction,
  ref: DocumentReference,
  player: Pick<DocumentSnapshot, 'get'>,
  navigation: NavigationState,
  revision: number,
  fleetGroupVesselIds: readonly string[] = [],
): void {
  tx.set(ref, playerDiscoveryProjection(player, navigation, revision, fleetGroupVesselIds));
}
