import { endeavourResearchTrack } from './endeavourResearch';
import { fleetGroupRecord, type FleetGroupRecord } from './fleetGroups';
import type { NavigationState } from './navigationProjection';

export type EndeavourEcmDeviceState =
  | Readonly<{ status: 'ready'; revision: 0 }>
  | Readonly<{
      status: 'used';
      revision: 1;
      ownerGroupId: string;
      pursuitBefore: number;
      pursuitAfter: number;
    }>;

export interface EndeavourEcmDeviceResult {
  readonly state: EndeavourEcmDeviceState;
  readonly navigation: NavigationState;
}

const READY_KEYS = ['revision', 'status'];
const USED_KEYS = ['ownerGroupId', 'pursuitAfter', 'pursuitBefore', 'revision', 'status'];
const FLEET_GROUP_ID_PATTERN = /^fleet-[1-9][0-9]*$/;

const isCanonicalRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]) =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);

const isPursuitValue = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 10;

/** Parse only the two reachable states for the one-shot printed ECM effect. */
export function parseEndeavourEcmDeviceState(value: unknown): EndeavourEcmDeviceState | null {
  if (value === undefined) return Object.freeze({ status: 'ready', revision: 0 });
  if (!isCanonicalRecord(value)) return null;
  if (value.status === 'ready') {
    return hasExactKeys(value, READY_KEYS) && value.revision === 0
      ? Object.freeze({ status: 'ready', revision: 0 })
      : null;
  }
  if (value.status !== 'used' || !hasExactKeys(value, USED_KEYS) || value.revision !== 1 ||
    typeof value.ownerGroupId !== 'string' || !FLEET_GROUP_ID_PATTERN.test(value.ownerGroupId) ||
    !isPursuitValue(value.pursuitBefore) || !isPursuitValue(value.pursuitAfter) ||
    value.pursuitAfter !== Math.max(0, value.pursuitBefore - 3)) return null;
  return Object.freeze({
    status: 'used', revision: 1, ownerGroupId: value.ownerGroupId,
    pursuitBefore: value.pursuitBefore, pursuitAfter: value.pursuitAfter,
  });
}

function canonicalFleetGroups(value: readonly FleetGroupRecord[]): readonly FleetGroupRecord[] {
  const groups = value.map((candidate) => fleetGroupRecord(candidate));
  if (groups.some((candidate) => candidate === undefined)) {
    throw new Error('ECM fleet-group authority is malformed.');
  }
  const canonical = groups as FleetGroupRecord[];
  if (canonical.some((group) => !FLEET_GROUP_ID_PATTERN.test(group.id))) {
    throw new Error('ECM fleet-group authority contains a non-canonical group id.');
  }
  if (new Set(canonical.map((group) => group.id)).size !== canonical.length) {
    throw new Error('ECM fleet-group authority contains duplicate groups.');
  }
  return canonical;
}

/**
 * Consume the completed ECM Device exactly once and reduce only the fleet group
 * containing Shepherd, the Endeavour's printed owner vessel.
 */
export function activateEndeavourEcmDevice(input: Readonly<{
  progress: unknown;
  state: unknown;
  expectedRevision: number;
  navigation: NavigationState;
  fleetGroups: readonly FleetGroupRecord[];
}>): EndeavourEcmDeviceResult {
  if (!endeavourResearchTrack(input.progress, 'ecm-device').complete) {
    throw new Error('ECM Device research must be complete before activation.');
  }
  const state = parseEndeavourEcmDeviceState(input.state);
  if (!state) throw new Error('ECM Device state is malformed.');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) {
    throw new Error('ECM Device state changed; refresh before activation.');
  }
  if (state.status === 'used') throw new Error('The ECM Device has already been used.');

  const groups = canonicalFleetGroups(input.fleetGroups);
  const owners = groups.filter((group) => group.vesselIds.includes('shepherd'));
  if (owners.length !== 1) throw new Error('Shepherd must belong to exactly one fleet group to use ECM.');
  const groupIds = new Set(groups.map((group) => group.id));
  const pursuitEntries = Object.entries(input.navigation.pursuitGroups);
  if (pursuitEntries.length !== groups.length || pursuitEntries.some(([groupId, value]) =>
    !groupIds.has(groupId) || !isPursuitValue(value))) {
    throw new Error('ECM pursuit authority is missing or malformed.');
  }
  const ownerGroupId = owners[0]!.id;
  const pursuitBefore = input.navigation.pursuitGroups[ownerGroupId];
  if (!isPursuitValue(pursuitBefore)) throw new Error('The owning group has no valid pursuit authority.');
  const pursuitAfter = Math.max(0, pursuitBefore - 3);
  const navigation = Object.freeze({
    ...input.navigation,
    pursuitGroups: Object.freeze({
      ...input.navigation.pursuitGroups,
      [ownerGroupId]: pursuitAfter,
    }),
  });
  return {
    state: Object.freeze({
      status: 'used', revision: 1, ownerGroupId, pursuitBefore, pursuitAfter,
    }),
    navigation,
  };
}
