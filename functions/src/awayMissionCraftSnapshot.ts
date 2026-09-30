import { isExtraShipAdmitted } from './extraShipAdmission';
import { awayMissionCraftForRole, AWAY_MISSION_ROLE_CRAFT } from './awayMissionCards';
import { replacementRoleFor } from './replacementRoles';
import { isResourceShipId } from './resources';
import { parseSmallShipState, SMALL_SHIP_IDS, type SmallShipId } from './smallShip';

export interface AwayMissionParticipantCraftSnapshot {
  readonly participantUid: string;
  readonly craftIds: readonly string[];
}

/**
 * The server-side facts available in the P403 transaction that admits a mission.
 * `availableCarrierCraftIds` remains a group-level carrier list; it does not
 * contain the base Capybara or imply that any participant owns a carrier.
 */
export interface AwayMissionP403CraftSnapshotInput {
  readonly participantSnapshots: unknown;
  readonly availableCarrierCraftIds: unknown;
  readonly activeVesselIds: unknown;
  readonly smallShipStates: unknown;
  readonly expansion: unknown;
  readonly capybaraEnabled: unknown;
  readonly opportunityGroupVesselIds: unknown;
  readonly opportunityCoordinate: unknown;
  readonly shipGalacticCoordinates: unknown;
}

const KNOWN_CARRIER_CRAFT_IDS = new Set<string>(Object.values(AWAY_MISSION_ROLE_CRAFT).flat());
const CAPYBARA_SMALL_ROLE_ID = 'capybara-small-captain';
const KNOWN_SMALL_SHIP_IDS = new Set<string>(SMALL_SHIP_IDS);

/**
 * Derive participant craft bindings once from trusted P403 transaction data.
 * Persist the result in the immutable mission-start record and later pass that
 * captured list to the mission lifecycle; do not reconstruct it from live roles
 * or session state when the mission resolves.
 */
export function deriveAwayMissionParticipantCraftSnapshots(
  value: AwayMissionP403CraftSnapshotInput | unknown,
): readonly AwayMissionParticipantCraftSnapshot[] | null {
  if (!isRecord(value) || !Array.isArray(value.participantSnapshots) || value.participantSnapshots.length === 0 ||
      !Array.isArray(value.availableCarrierCraftIds) || value.availableCarrierCraftIds.length === 0 ||
      !Array.isArray(value.activeVesselIds) || value.activeVesselIds.length === 0 ||
      !isRecord(value.smallShipStates) ||
      !['base', 'capybara', 'none'].includes(String(value.expansion)) ||
      typeof value.capybaraEnabled !== 'boolean' ||
      !Array.isArray(value.opportunityGroupVesselIds) || value.opportunityGroupVesselIds.length === 0 ||
      !isNonEmptyString(value.opportunityCoordinate) || !isRecord(value.shipGalacticCoordinates)) return null;

  const participantIds = new Set<string>();
  const participants: { uid: string; roleId: string }[] = [];
  for (const candidate of value.participantSnapshots) {
    if (!isRecord(candidate) || !isNonEmptyString(candidate.uid) || !isNonEmptyString(candidate.roleId) ||
        participantIds.has(candidate.uid)) return null;
    participantIds.add(candidate.uid);
    participants.push({ uid: candidate.uid, roleId: candidate.roleId });
  }

  const carrierIds = new Set<string>();
  for (const candidate of value.availableCarrierCraftIds) {
    if (!isNonEmptyString(candidate) || !KNOWN_CARRIER_CRAFT_IDS.has(candidate) || carrierIds.has(candidate)) {
      return null;
    }
    carrierIds.add(candidate);
  }

  const activeVesselIds = new Set<string>();
  for (const candidate of value.activeVesselIds) {
    if (!isResourceShipId(candidate) || activeVesselIds.has(candidate)) return null;
    activeVesselIds.add(candidate);
  }

  const groupVesselIds = new Set<string>();
  for (const candidate of value.opportunityGroupVesselIds) {
    if (!isResourceShipId(candidate) || !activeVesselIds.has(candidate) || groupVesselIds.has(candidate)) return null;
    groupVesselIds.add(candidate);
  }

  return Object.freeze(participants.map(({ uid, roleId }) => {
    const craftIds = awayMissionCraftForRole(roleId).filter((craftId) => carrierIds.has(craftId));
    const smallCraftId = admittedSmallCraftAtOpportunity(roleId, value, groupVesselIds);
    if (smallCraftId !== null) craftIds.push(smallCraftId);
    return Object.freeze({ participantUid: uid, craftIds: Object.freeze(craftIds) });
  }));
}

function admittedSmallCraftAtOpportunity(
  roleId: string,
  input: Record<string, unknown>,
  groupVesselIds: ReadonlySet<string>,
): SmallShipId | null {
  const smallShipStates = input.smallShipStates;
  const shipGalacticCoordinates = input.shipGalacticCoordinates;
  if (!isRecord(smallShipStates) || !isRecord(shipGalacticCoordinates)) return null;

  const role = replacementRoleFor(roleId);
  if (!role || role.kind !== 'extra-ship' || typeof role.vesselId !== 'string' ||
      !KNOWN_SMALL_SHIP_IDS.has(role.vesselId)) return null;

  // The printed/base Capybara may bind only its own explicitly marked role.
  // Its expansion is a different vessel and is never accepted for this role.
  if (roleId === CAPYBARA_SMALL_ROLE_ID) {
    if (!role.baseVesselOnly || role.vesselId !== 'capybara-small' ||
        input.expansion !== 'base' || input.capybaraEnabled !== true) return null;
  } else if (role.baseVesselOnly) {
    return null;
  }

  const smallShipId = role.vesselId as SmallShipId;
  if (!isExtraShipAdmitted({
    activeVesselIds: input.activeVesselIds,
    smallShipStates,
    smallShipId,
    expansion: input.expansion,
    capybaraEnabled: input.capybaraEnabled,
  })) return null;

  const state = parseSmallShipState(smallShipStates[smallShipId], smallShipId);
  const hostShipId = state?.hostShipId;
  if (typeof hostShipId !== 'string' || !groupVesselIds.has(hostShipId) ||
      shipGalacticCoordinates[hostShipId] !== input.opportunityCoordinate) return null;
  return smallShipId;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
