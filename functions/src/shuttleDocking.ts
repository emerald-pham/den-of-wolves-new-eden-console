import { shipForRole } from './crewAccess';
import { shuttleDockingsAreParked, shuttleHostIsAllowed } from './craftOwnership';
import { isJointEngineeringRoleId } from './roleConfiguration';
import { replacementRoleFor } from './replacementRoles';

export interface AuthoritativeShuttleDocking {
  readonly shuttleId: string;
  readonly shipId: string;
  readonly dockedAt: string;
}

export interface ShuttleHolderLocation {
  readonly uid: string;
  readonly role: 'player';
  readonly assignedRoleId?: string | null;
  readonly activeConsoleRoleId?: string | null;
  readonly replacementRoleId?: string | null;
  readonly escapeState?: unknown;
}

const JOINT_ROLE_SHUTTLE: Readonly<Record<string, string>> = {
  'joint-engineering-quellon-refinery': 'wobbly',
  'joint-engineering-shepherd-icebreaker': 'ally',
};

function holderRoleId(holder: ShuttleHolderLocation): string | undefined {
  if (typeof holder.replacementRoleId === 'string' && holder.replacementRoleId.length > 0) {
    return holder.replacementRoleId;
  }
  if (typeof holder.assignedRoleId === 'string' && holder.assignedRoleId.length > 0) {
    return holder.assignedRoleId;
  }
  return holder.activeConsoleRoleId === 'press-officer' ? 'press-officer' : undefined;
}

function uniqueDockingHost(
  shuttleId: string,
  dockings: readonly AuthoritativeShuttleDocking[],
): string | undefined {
  const matches = dockings.filter((docking) => docking.shuttleId === shuttleId);
  return matches.length === 1 ? matches[0]!.shipId : undefined;
}

/** Resolve where a holder is physically standing from server-owned role state. */
export function authoritativeHolderShip(
  holder: ShuttleHolderLocation,
  dockings: readonly AuthoritativeShuttleDocking[],
  activeVesselIds: readonly string[],
): string {
  if (holder.role !== 'player' || holder.escapeState !== undefined && holder.escapeState !== null) {
    throw new Error('The shuttle holder has no legal ship location.');
  }
  const roleId = holderRoleId(holder);
  if (!roleId) throw new Error('The shuttle holder has no authoritative role location.');
  let shipId: string | undefined;
  if (typeof holder.replacementRoleId === 'string' && holder.replacementRoleId.length > 0) {
    shipId = replacementRoleFor(holder.replacementRoleId)?.vesselId;
  } else {
    shipId = shipForRole(roleId);
    if (roleId === 'press-officer') shipId = uniqueDockingHost('snn-press-shuttle', dockings);
    else if (isJointEngineeringRoleId(roleId)) {
      shipId = uniqueDockingHost(JOINT_ROLE_SHUTTLE[roleId]!, dockings);
    }
  }
  if (!shipId || !activeVesselIds.includes(shipId)) {
    throw new Error('The shuttle holder is not located at an active fleet ship.');
  }
  return shipId;
}

/**
 * Complete a holder-driven relocation without inventing transit or arrival
 * history. Those state transitions are owned by the later travel prompts.
 */
export function resolveHolderBasedDocking(options: Readonly<{
  shuttleId: string;
  holder: ShuttleHolderLocation;
  dockings: readonly AuthoritativeShuttleDocking[];
  activeVesselIds: readonly string[];
  occurredAt: string;
}>): Readonly<{
  previousHostShipId: string;
  hostShipId: string;
  dockings: readonly AuthoritativeShuttleDocking[];
}> {
  if (!options.occurredAt.trim() ||
      !shuttleDockingsAreParked(options.dockings, options.activeVesselIds)) {
    throw new Error('The authoritative shuttle docking state is unavailable.');
  }
  const current = options.dockings.filter((docking) => docking.shuttleId === options.shuttleId);
  if (current.length !== 1) throw new Error('The shuttle has no unique current dock.');
  const hostShipId = authoritativeHolderShip(
    options.holder,
    options.dockings,
    options.activeVesselIds,
  );
  if (!shuttleHostIsAllowed(options.shuttleId, hostShipId)) {
    throw new Error('That shuttle cannot dock at the holder\'s ship.');
  }
  return {
    previousHostShipId: current[0]!.shipId,
    hostShipId,
    dockings: options.dockings.map((docking) => docking.shuttleId === options.shuttleId
      ? { ...docking, shipId: hostShipId, dockedAt: options.occurredAt }
      : docking),
  };
}
