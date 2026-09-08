export const FLEET_SHIP_NAMES = {
  aegis: 'AEGIS',
  dione: 'Dione',
  icebreaker: 'Icebreaker',
  capybara: 'Capybara',
  shepherd: 'Shepherd',
  quellon: 'Quellon',
  'refinery-124': 'Refinery 124',
  'snn-press-shuttle': 'SNN Independent Press Shuttle',
} as const;

export function isFleetShipId(shipId: string): shipId is keyof typeof FLEET_SHIP_NAMES {
  return shipId in FLEET_SHIP_NAMES;
}

export function canPopShipConfetti(usedShipIds: readonly string[], shipId: string): boolean {
  return shipId !== 'aegis' && (
    shipId === 'snn-press-shuttle' || !usedShipIds.includes(shipId)
  );
}

export const isReusableConfettiSource = (shipId: string): boolean =>
  shipId === 'snn-press-shuttle';

export const shouldLogShipConfettiEvent = (shipId: string): boolean =>
  shipId !== 'snn-press-shuttle';

export const isShipDispenserSignal = (sourceShipId: string, shipId: string): boolean =>
  sourceShipId === shipId;

const CONFETTI_ROLES = {
  'press-officer': { name: 'Press Officer', shipId: 'snn-press-shuttle', authority: 'captain' },
  admiral: { name: 'Admiral', shipId: 'aegis', authority: 'captain' },
  'executive-officer': { name: 'Executive Officer', shipId: 'aegis', authority: 'officer' },
  'wing-commander': { name: 'Wing Commander', shipId: 'aegis', authority: 'officer' },
  'dione-captain': { name: 'Captain', shipId: 'dione', authority: 'captain' },
  'dione-engineer': { name: 'Engineer', shipId: 'dione', authority: 'officer' },
  'dione-president': { name: 'President', shipId: 'dione', authority: 'officer' },
  'icebreaker-captain': { name: 'Captain', shipId: 'icebreaker', authority: 'captain' },
  'icebreaker-engineer': { name: 'Engineer', shipId: 'icebreaker', authority: 'officer' },
  'icebreaker-miner': { name: 'Miner', shipId: 'icebreaker', authority: 'officer' },
  'quellon-captain': { name: 'Captain', shipId: 'quellon', authority: 'captain' },
  'quellon-engineer': { name: 'Engineer', shipId: 'quellon', authority: 'officer' },
  'quellon-explorer': { name: 'Explorer', shipId: 'quellon', authority: 'officer' },
  'shepherd-captain': { name: 'Captain', shipId: 'shepherd', authority: 'captain' },
  'shepherd-engineer': { name: 'Engineer', shipId: 'shepherd', authority: 'officer' },
  'shepherd-scientist': { name: 'Scientist', shipId: 'shepherd', authority: 'officer' },
  'refinery-124-captain': { name: 'Captain', shipId: 'refinery-124', authority: 'captain' },
  'refinery-124-engineer': { name: 'Engineer', shipId: 'refinery-124', authority: 'officer' },
  'refinery-124-pdf-colonel': { name: 'P.D.F. Colonel', shipId: 'refinery-124', authority: 'officer' },
  'capybara-captain': { name: 'Capybara Captain', shipId: 'capybara', authority: 'captain' },
  'capybara-recycler': { name: 'Capybara Recycler', shipId: 'capybara', authority: 'officer' },
} as const;

export interface ConfettiApproval {
  readonly uid: string;
  readonly roleId: string;
}

export type ConfettiActivationDecision =
  | { readonly kind: 'fire'; readonly actorRoleName: string }
  | { readonly kind: 'awaiting-officer'; readonly approvals: readonly ConfettiApproval[] };

export function confettiActivationDecision(
  shipId: string,
  roleId: string,
  uid: string,
  approvals: readonly ConfettiApproval[],
  connectedOfficerUids: readonly string[] = [],
): ConfettiActivationDecision {
  if (shipId === 'aegis') throw new Error('The AEGIS bridge dispenser is disabled.');
  const role = CONFETTI_ROLES[roleId as keyof typeof CONFETTI_ROLES];
  if (!role || role.shipId !== shipId) throw new Error('That role does not belong to this ship.');
  if (role.authority === 'captain' || shipId === 'capybara' || shipId === 'snn-press-shuttle') {
    return { kind: 'fire', actorRoleName: role.name };
  }
  if (new Set(connectedOfficerUids).size < 2) {
    return { kind: 'fire', actorRoleName: role.name };
  }
  const distinctApprovals = approvals.filter((approval) => approval.uid !== uid);
  const first = distinctApprovals[0];
  if (first) {
    const firstRole = CONFETTI_ROLES[first.roleId as keyof typeof CONFETTI_ROLES];
    return { kind: 'fire', actorRoleName: `${firstRole?.name ?? first.roleId} + ${role.name}` };
  }
  return {
    kind: 'awaiting-officer',
    approvals: approvals.some((approval) => approval.uid === uid)
      ? approvals
      : [...approvals, { uid, roleId }],
  };
}

export function isOfficerRoleForShip(roleId: unknown, shipId: string): boolean {
  if (typeof roleId !== 'string') return false;
  const role = CONFETTI_ROLES[roleId as keyof typeof CONFETTI_ROLES];
  return role?.shipId === shipId && role.authority === 'officer';
}

/** Keep only approvals that still describe the same live officer role. */
export function liveConfettiApprovals(
  shipId: string,
  approvals: readonly ConfettiApproval[],
  connectedOfficerRoles: readonly ConfettiApproval[],
): ConfettiApproval[] {
  const currentRoles = new Map(
    connectedOfficerRoles
      .filter((operator) => isOfficerRoleForShip(operator.roleId, shipId))
      .map((operator) => [operator.uid, operator.roleId]),
  );
  const seen = new Set<string>();
  return approvals.filter((approval) => {
    if (seen.has(approval.uid) || currentRoles.get(approval.uid) !== approval.roleId) {
      return false;
    }
    seen.add(approval.uid);
    return true;
  });
}

interface ShuttleDocking {
  readonly shuttleId: string;
  readonly shipId: string;
}

export function confettiSignalTargets(
  shipId: string,
  shuttleDockings: readonly ShuttleDocking[],
): string[] {
  if (shipId !== 'snn-press-shuttle') return [shipId];
  const hostShipId = shuttleDockings.find((docking) => docking.shuttleId === shipId)?.shipId;
  return hostShipId ? [shipId, hostShipId] : [shipId];
}
