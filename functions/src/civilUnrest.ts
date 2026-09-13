import { jointEngineeringShipsForRole, isJointEngineeringRoleId } from './roleConfiguration';
import { shipForRole } from './crewAccess';
import { replacementRoleFor } from './replacementRoles';

/** The five team pairs printed on the Civil Unrest card. */
export const CIVIL_UNREST_SHIP_IDS = [
  'dione',
  'icebreaker',
  'shepherd',
  'quellon',
  'refinery-124',
] as const;

export type CivilUnrestShipId = (typeof CIVIL_UNREST_SHIP_IDS)[number];

export const CIVIL_UNREST_SHIP_NAMES: Readonly<Record<CivilUnrestShipId, string>> = {
  dione: 'Dione',
  icebreaker: 'Icebreaker',
  shepherd: 'Shepherd',
  quellon: 'Quellon',
  'refinery-124': 'Refinery 124',
};

export function civilUnrestShipsForRole(roleId: unknown): readonly string[] {
  if (typeof roleId !== 'string') return [];
  if (isJointEngineeringRoleId(roleId)) return jointEngineeringShipsForRole(roleId);
  const shipId = shipForRole(roleId);
  if (shipId && (CIVIL_UNREST_SHIP_IDS as readonly string[]).includes(shipId)) return [shipId];
  const replacement = replacementRoleFor(roleId);
  return replacement?.vesselId && (CIVIL_UNREST_SHIP_IDS as readonly string[]).includes(replacement.vesselId)
    ? [replacement.vesselId]
    : [];
}

export function civilUnrestShipId(value: unknown): value is CivilUnrestShipId {
  return typeof value === 'string' && (CIVIL_UNREST_SHIP_IDS as readonly string[]).includes(value);
}
