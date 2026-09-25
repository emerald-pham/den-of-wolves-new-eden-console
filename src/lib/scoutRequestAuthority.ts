import type { GameSession, Player } from '@/types/game';
import { phaseForSession } from './turnPhase';

export type ScoutEntitlementId = 'starlight' | 'hummingbird' | 'endeavour' | 'comms-officer';
export type ScoutRequestSource = 'craft' | 'replacement-role';

export interface ScoutEntitlementDefinition {
  readonly id: ScoutEntitlementId;
  readonly label: string;
  readonly source: ScoutRequestSource;
  readonly ownerRoleId: string;
  readonly anchorShipId: string;
}

export const SCOUT_REQUEST_ENTITLEMENTS: readonly ScoutEntitlementDefinition[] = Object.freeze([
  Object.freeze({
    id: 'starlight', label: 'Starlight', source: 'craft',
    ownerRoleId: 'wing-commander', anchorShipId: 'aegis',
  }),
  Object.freeze({
    id: 'hummingbird', label: 'Hummingbird', source: 'craft',
    ownerRoleId: 'quellon-explorer', anchorShipId: 'quellon',
  }),
  Object.freeze({
    id: 'endeavour', label: 'Endeavour', source: 'craft',
    ownerRoleId: 'shepherd-scientist', anchorShipId: 'shepherd',
  }),
  Object.freeze({
    id: 'comms-officer', label: 'Comms Officer', source: 'replacement-role',
    ownerRoleId: 'comms-officer', anchorShipId: 'aegis',
  }),
]);

export function scoutEntitlementDefinition(
  entitlementId: string,
): ScoutEntitlementDefinition | undefined {
  return SCOUT_REQUEST_ENTITLEMENTS.find((entitlement) => entitlement.id === entitlementId);
}

function boundCoreRoleMatches(me: Player, ownerRoleId: string): boolean {
  const assignedRoleId = me.assignedRoleId && me.assignedRoleId !== 'press-officer'
    ? me.assignedRoleId : undefined;
  const seatedRoleId = me.seatId && me.seatId !== 'press-officer' ? me.seatId : undefined;
  const pointersAgree = !(
    (me.assignedRoleId === 'press-officer' && seatedRoleId) ||
    (me.seatId === 'press-officer' && assignedRoleId)
  ) && (!assignedRoleId || !seatedRoleId || assignedRoleId === seatedRoleId);
  const boundRoleId = pointersAgree ? assignedRoleId ?? seatedRoleId : undefined;
  return boundRoleId === ownerRoleId;
}

/** Presentation guard mirroring only the exact P321 player identity binding. */
export function isScoutEntitlementHolder(
  entitlementId: string,
  session: GameSession | null | undefined,
  me: Player | null | undefined,
): boolean {
  const entitlement = scoutEntitlementDefinition(entitlementId);
  if (!entitlement || !session || !me || me.role !== 'player' || me.sessionId !== session.id ||
      !session.activeVesselIds?.includes(entitlement.anchorShipId)) return false;

  if (entitlement.source === 'replacement-role') {
    return me.replacementRoleId === entitlement.id && me.activeConsoleRoleId === null;
  }

  return !me.replacementRoleId &&
    session.activeRoleIds?.includes(entitlement.ownerRoleId) === true &&
    me.activeConsoleRoleId === entitlement.ownerRoleId &&
    boundCoreRoleMatches(me, entitlement.ownerRoleId);
}

export function isScoutingRequestPhaseAvailable(
  session: GameSession | null | undefined,
): boolean {
  return session?.phase === 'active' &&
    typeof session.currentTurn === 'number' && Number.isSafeInteger(session.currentTurn) &&
    session.currentTurn >= 1 &&
    phaseForSession(session)?.airspace.state === 'lifted';
}
