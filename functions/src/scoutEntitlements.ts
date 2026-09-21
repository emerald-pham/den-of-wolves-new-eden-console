import { ROLE_OWNED_CRAFT_CATALOG } from './craftOwnership';
import { boundCoreConsoleRole } from './consoleRolePolicy';
import { activeVesselIdsForRoles } from './gameSetup';
import { replacementRoleFor } from './replacementRoles';
import { isValidRoleConfiguration } from './roleConfiguration';

export type ScoutEntitlementId = 'starlight' | 'hummingbird' | 'endeavour' | 'comms-officer';

export interface CraftScoutEntitlement {
  readonly id: Exclude<ScoutEntitlementId, 'comms-officer'>;
  readonly source: 'craft';
  readonly ownerRoleId: string;
  readonly anchorShipId: string;
}

export interface ReplacementScoutEntitlement {
  readonly id: 'comms-officer';
  readonly source: 'replacement-role';
  readonly ownerRoleId: 'comms-officer';
  readonly anchorShipId: 'aegis';
}

export type ScoutEntitlement = CraftScoutEntitlement | ReplacementScoutEntitlement;

/**
 * Printed identities that may originate a scouting request. Range, cadence,
 * fuel use, chart lookup, and result visibility belong to their later prompts.
 */
export const SCOUT_ENTITLEMENTS: readonly ScoutEntitlement[] = Object.freeze([
  Object.freeze({
    id: 'starlight', source: 'craft', ownerRoleId: 'wing-commander', anchorShipId: 'aegis',
  }),
  Object.freeze({
    id: 'hummingbird', source: 'craft', ownerRoleId: 'quellon-explorer', anchorShipId: 'quellon',
  }),
  Object.freeze({
    id: 'endeavour', source: 'craft', ownerRoleId: 'shepherd-scientist', anchorShipId: 'shepherd',
  }),
  Object.freeze({
    id: 'comms-officer', source: 'replacement-role', ownerRoleId: 'comms-officer', anchorShipId: 'aegis',
  }),
]);

export interface ScoutEntitlementAuthorityInput {
  readonly playerRole: unknown;
  readonly connected: unknown;
  readonly assignedRoleId: unknown;
  readonly seatId: unknown;
  readonly replacementRoleId: unknown;
  readonly activeRoleIds: unknown;
  readonly activeVesselIds: unknown;
}

function stringSet(value: unknown, label: string): ReadonlySet<string> {
  if (!Array.isArray(value) || value.some((entry) =>
    typeof entry !== 'string' || entry.length === 0) || new Set(value).size !== value.length) {
    throw new Error(`Scout ${label} authority is malformed.`);
  }
  return new Set(value);
}

/**
 * Resolve one requested scout identity from current server-owned membership.
 * Historical core assignments never survive a replacement assignment.
 */
export function requireScoutEntitlement(input: Readonly<{
  requestedEntitlementId: unknown;
} & ScoutEntitlementAuthorityInput>): ScoutEntitlement {
  const activeRoleIds = stringSet(input.activeRoleIds, 'role roster');
  const activeVesselIds = stringSet(input.activeVesselIds, 'vessel roster');
  if (!isValidRoleConfiguration([...activeRoleIds])) {
    throw new Error('Scout role roster authority is not a valid printed configuration.');
  }
  const expectedVesselIds = new Set(activeVesselIdsForRoles([...activeRoleIds]));
  if (expectedVesselIds.size !== activeVesselIds.size ||
      [...expectedVesselIds].some((vesselId) => !activeVesselIds.has(vesselId))) {
    throw new Error('Scout vessel roster authority does not match the active roles.');
  }
  if (typeof input.requestedEntitlementId !== 'string') {
    throw new Error('Scout entitlement identity is malformed.');
  }
  const entitlement = SCOUT_ENTITLEMENTS.find(({ id }) => id === input.requestedEntitlementId);
  if (!entitlement) throw new Error('This scouting request has no printed entitlement.');
  if (input.playerRole !== 'player' || input.connected !== true ||
      !activeVesselIds.has(entitlement.anchorShipId)) {
    throw new Error('The current player cannot use this scouting entitlement.');
  }

  if (entitlement.source === 'replacement-role') {
    const replacement = replacementRoleFor(entitlement.ownerRoleId);
    if (!replacement || replacement.kind !== 'role' ||
        replacement.vesselId !== entitlement.anchorShipId ||
        input.replacementRoleId !== entitlement.ownerRoleId) {
      throw new Error('Only the assigned Comms Officer may request that scan.');
    }
    return entitlement;
  }

  const craft = ROLE_OWNED_CRAFT_CATALOG.find(({ id }) => id === entitlement.id);
  if (!craft || craft.kind !== 'shuttle' || craft.ownerRoleId !== entitlement.ownerRoleId ||
      (input.replacementRoleId !== null && input.replacementRoleId !== undefined) ||
      boundCoreConsoleRole(input.assignedRoleId, input.seatId) !== entitlement.ownerRoleId ||
      !activeRoleIds.has(entitlement.ownerRoleId)) {
    throw new Error('Only the current printed craft owner may request that scout action.');
  }
  return entitlement;
}
