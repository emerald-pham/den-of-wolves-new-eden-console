import type { DocumentReference, DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { shipForRole } from './crewAccess';
import { type NavigationLogEntry, type NavigationLogs } from './navigation';
import { discoverySystemsForCoordinates, pursuitDistanceForCoordinate } from './starChartProjection';

export interface NavigationState {
  readonly shipGalacticCoordinates: Readonly<Record<string, string>>;
  readonly shipNavigationLogs: NavigationLogs;
}

export interface PlayerDiscoveryProjection {
  readonly groupId: string;
  readonly shipId?: string;
  readonly currentCoordinate?: string;
  readonly knownCoordinates: readonly string[];
  readonly knownSystems: Readonly<Record<string, string>>;
  readonly pursuitDistance: number;
  readonly navigationLogs: readonly NavigationLogEntry[];
  readonly revision: number;
}

const INITIAL_COORDINATE = '0000';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validLog(value: unknown, shipId: string): value is NavigationLogEntry {
  if (!isRecord(value) || value.shipId !== shipId || typeof value.id !== 'string' ||
      (value.type !== 'self-jump' && value.type !== 'ship-jump-away' && value.type !== 'ship-jump-arrival') ||
      typeof value.origin !== 'string' || typeof value.destination !== 'string' ||
      typeof value.occurredAt !== 'string' || typeof value.stardate !== 'string') return false;
  return true;
}

function logsForShip(value: unknown, shipId: string): readonly NavigationLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is NavigationLogEntry => validLog(entry, shipId));
}

export function navigationState(value: unknown, activeVesselIds: readonly string[]): NavigationState {
  const raw = isRecord(value) ? value : {};
  const coordinates = isRecord(raw.shipGalacticCoordinates) ? raw.shipGalacticCoordinates : {};
  const logs = isRecord(raw.shipNavigationLogs) ? raw.shipNavigationLogs : {};
  return {
    shipGalacticCoordinates: Object.fromEntries(activeVesselIds.map((shipId) => [
      shipId,
      typeof coordinates[shipId] === 'string' ? coordinates[shipId] : INITIAL_COORDINATE,
    ])),
    shipNavigationLogs: Object.fromEntries(activeVesselIds.map((shipId) => [
      shipId,
      logsForShip(logs[shipId], shipId),
    ])),
  };
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
  return shipForRole(player.get('assignedRoleId'));
}

export function playerDiscoveryProjection(
  player: Pick<DocumentSnapshot, 'get'>,
  navigation: NavigationState,
  revision: number,
): PlayerDiscoveryProjection {
  const groupId = typeof player.get('fleetGroupId') === 'string' ? player.get('fleetGroupId') as string : '';
  const shipId = playerShipId(player);
  if (!shipId || !groupId) {
    return {
      groupId,
      knownCoordinates: [INITIAL_COORDINATE],
      knownSystems: discoverySystemsForCoordinates([INITIAL_COORDINATE]),
      pursuitDistance: 0,
      navigationLogs: [],
      revision,
    };
  }
  const currentCoordinate = navigation.shipGalacticCoordinates[shipId] ?? INITIAL_COORDINATE;
  const entries = navigation.shipNavigationLogs[shipId] ?? [];
  return {
    groupId,
    shipId,
    currentCoordinate,
    knownCoordinates: knownCoordinates(currentCoordinate, entries),
    knownSystems: discoverySystemsForCoordinates(knownCoordinates(currentCoordinate, entries)),
    pursuitDistance: pursuitDistanceForCoordinate(currentCoordinate),
    navigationLogs: entries,
    revision,
  };
}

export function writePlayerDiscoveryProjection(
  tx: Transaction,
  ref: DocumentReference,
  player: Pick<DocumentSnapshot, 'get'>,
  navigation: NavigationState,
  revision: number,
): void {
  tx.set(ref, playerDiscoveryProjection(player, navigation, revision));
}
