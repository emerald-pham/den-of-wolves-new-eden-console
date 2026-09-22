import { findConsoleRole } from '@/data/roles';
import { findShip, findVessel } from '@/data/ships';
import { SHUTTLECRAFT } from '@/data/shuttles';
import { replacementRoleFor } from '@/data/replacementRoles';
import { phaseForSession } from '@/lib/turnPhase';
import type { GameSession, GmInstance, Player, RoleBrief } from '@/types/game';
import type { CommunicationError } from '@/store/useSessionStore';

export interface PrimaryStatusContext {
  readonly pathname: string;
  readonly session: GameSession | null;
  readonly player: Player | null;
  readonly facilitatorActive: boolean;
  readonly facilitatorAccessAuthenticated: boolean;
  readonly facilitator: GmInstance | null;
  readonly roleBrief: RoleBrief | null;
  readonly communicationError: CommunicationError | null;
  readonly connection: 'idle' | 'connecting' | 'live' | 'offline';
  readonly snapshotFreshness: 'unknown' | 'cache' | 'server';
}

export interface PrimaryStatusModel {
  readonly cycle: string;
  readonly phase: string;
  readonly location: string;
  readonly authority: string;
  readonly nextAction: string;
  readonly failureState: string;
  readonly severity: 'normal' | 'warning' | 'failure';
}

function pathParts(pathname: string): string[] {
  return pathname.split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

function phaseLabel(context: PrimaryStatusContext): string {
  const session = context.session;
  if (!session) return 'SESSION NOT LOADED';
  if (session.debriefMode?.active || session.phase === 'debrief') return 'DEBRIEF ACTIVE';

  const base = session.phase.replaceAll('-', ' ').toUpperCase();
  const livePhase = phaseForSession(session);
  if (session.phase !== 'active' || !livePhase) return base;

  const stage = livePhase.airspace.state === 'restricted'
    ? 'TEAM PHASE // AIRSPACE RESTRICTED'
    : 'COORDINATION PHASE // AIRSPACE OPEN';
  return `${base} // ${stage}`;
}

function locationLabel(context: PrimaryStatusContext): string {
  const { pathname, session, player, roleBrief } = context;
  if (session?.debriefMode?.active || session?.phase === 'debrief') return 'DEBRIEF // SESSION OUTCOME';
  const parts = pathParts(pathname);

  if (parts.length === 1 && parts[0] === 'roles') return 'SESSION // ROLE SELECT';
  if (parts.length === 1 && parts[0] === 'console') return 'FLEET // CONSOLE SELECT';
  if (parts.length === 1 && parts[0] === 'gm') return 'FACILITATOR // SESSION CONSOLE';
  if (parts.length === 1 && parts[0] === 'brief') {
    return roleBrief
      ? `PRIVATE BRIEF // ${roleBrief.roleName} // ${roleBrief.vesselName}`
      : 'PRIVATE ROLE BRIEF // AWAITING ASSIGNMENT';
  }
  if (parts.length === 1 && parts[0] === 'escape') {
    const escapeState = player?.escapeState;
    const vessel = escapeState ? findVessel(escapeState.shipId) : undefined;
    return vessel && escapeState
      ? `ESCAPE STATUS // ${vessel.name} // ${escapeState.status.toUpperCase()}`
      : 'ESCAPE STATUS';
  }
  if (parts[0] === 'mission' || parts[0] === 'missions') {
    return parts[1] ? `MISSION // ${parts[1].toUpperCase()}` : 'MISSION // ACTIVE MISSION';
  }
  if (parts[0] === 'attack' || parts[0] === 'attacks') {
    return parts[1] ? `ATTACK // ${parts[1].toUpperCase()}` : 'ATTACK // ACTIVE ATTACK';
  }
  if (parts[0] === 'debrief') return 'DEBRIEF // SESSION OUTCOME';

  const shuttleId = parts[0] === 'press'
    ? 'snn-press-shuttle'
    : parts[0] === 'shuttles' ? parts[1] : undefined;
  if (shuttleId) {
    const shuttle = SHUTTLECRAFT.find((candidate) => candidate.id === shuttleId);
    return shuttle ? `SHUTTLE // ${shuttle.name}` : 'SHUTTLE // LOCATION NOT RECOGNIZED';
  }

  if (parts[0] === 'ships' && parts[1]) {
    const ship = findShip(parts[1]);
    if (!ship) return 'SHIP // LOCATION NOT RECOGNIZED';
    if (parts[2] === 'observer') return `SHIP // ${ship.name} // OBSERVER VIEW`;
    if (parts[2] === 'roles' && parts[3]) {
      const role = findConsoleRole(parts[3]);
      return role?.shipId === ship.id
        ? `${ship.name} // ${role.name}`
        : `${ship.name} // STATION NOT RECOGNIZED`;
    }
    if (parts[2] === 'roles') return `${ship.name} // STATION SELECT`;
    return `${ship.name} // SHIP CONSOLE`;
  }

  if (parts[0] === 'union' && parts[1] === 'roles' && parts[2]) {
    const role = findConsoleRole(parts[2]);
    return role?.shipId === 'joint-engineering-union'
      ? `JOINT ENGINEERING UNION // ${role.name}`
      : 'JOINT ENGINEERING UNION // STATION NOT RECOGNIZED';
  }

  if (parts[0] === 'replacement' && parts[1]) {
    const replacement = replacementRoleFor(parts[1]);
    return replacement
      ? `${replacement.vesselName} // ${replacement.name}`
      : 'REPLACEMENT WORKSPACE // ROLE NOT RECOGNIZED';
  }

  if (pathname === '/') return 'SESSION // HOME';
  return 'LOCATION // ROUTE NOT RECOGNIZED';
}

function authorityLabel(context: PrimaryStatusContext): string {
  const { pathname, player, facilitator, facilitatorActive } = context;
  const parts = pathParts(pathname);
  const observerShipId = parts[0] === 'ships' && parts[2] === 'observer' ? parts[1] : undefined;

  if (context.connection !== 'live' || context.snapshotFreshness !== 'server') {
    const activeRole = findConsoleRole(player?.activeConsoleRoleId ?? undefined);
    const replacement = player?.replacementRoleId
      ? replacementRoleFor(player.replacementRoleId)
      : undefined;
    const assignedRole = findConsoleRole(player?.assignedRoleId ?? undefined);
    const lastReported = facilitatorActive || player?.role === 'gm'
      ? `FACILITATOR // ${facilitator?.name ?? 'LAST REPORTED'}`
      : player?.role === 'observer'
        ? 'OBSERVER'
        : activeRole
          ? `PLAYER // ${activeRole.name}`
          : replacement
            ? `PLAYER // ${replacement.name}`
            : assignedRole
              ? `PLAYER // ${assignedRole.name}`
              : player ? 'PLAYER' : null;
    return lastReported
      ? `${lastReported} // LAST REPORTED // VERIFY LIVE AUTHORITY`
      : 'AUTHORITY // AWAITING LIVE PLAYER PROJECTION';
  }

  if (facilitatorActive) {
    if (observerShipId) {
      return facilitator?.shipConsoleWriteGrant?.shipId === observerShipId
        ? 'FACILITATOR OBSERVER // SHIP WRITE GRANT ACTIVE'
        : 'FACILITATOR OBSERVER // READ ONLY';
    }
    return facilitator?.name
      ? `FACILITATOR // ${facilitator.name}`
      : 'FACILITATOR // AUTHORITY NOT VERIFIED';
  }

  if (!player) return 'AUTHORITY // AWAITING PLAYER PROJECTION';
  if (player.role === 'gm') return 'FACILITATOR // AUTHORITY NOT VERIFIED';
  if (player.role === 'observer') return 'OBSERVER // READ ONLY';
  if (observerShipId) return 'OBSERVER // FACILITATOR AUTHORITY REQUIRED';

  const activeRole = findConsoleRole(player.activeConsoleRoleId ?? undefined);
  if (activeRole) return `PLAYER // ${activeRole.name} // ACTIVE COMMAND POST`;

  const replacement = player.replacementRoleId
    ? replacementRoleFor(player.replacementRoleId)
    : undefined;
  if (replacement) return `PLAYER // ${replacement.name} // REASSIGNED`;

  const assignedRole = findConsoleRole(player.assignedRoleId ?? undefined);
  if (assignedRole) return `PLAYER // ${assignedRole.name} // COMMAND POST NOT CLAIMED`;
  return 'PLAYER // NO ACTIVE COMMAND POST';
}

function nextActionLabel(context: PrimaryStatusContext): string {
  const { pathname, session, facilitatorActive, facilitatorAccessAuthenticated, roleBrief } = context;
  if (session?.debriefMode?.active || session?.phase === 'debrief') return 'REVIEW THE DEBRIEF';
  if (session?.gameOutcome) return 'REVIEW THE GAME OUTCOME';
  if (['success', 'failure', 'closed'].includes(session?.phase ?? '')) return 'REVIEW THE SESSION STATUS';

  const parts = pathParts(pathname);
  if (parts[0] === 'roles') {
    if (facilitatorActive) return 'SELECT A PLAYER MODE OR OPEN THE FACILITATOR CONSOLE';
    return facilitatorAccessAuthenticated
      ? 'SELECT A PLAYER MODE OR JOIN AS FACILITATOR'
      : 'SELECT A PLAYER MODE OR AUTHORIZE FACILITATOR ACCESS IN SETTINGS';
  }
  if (parts[0] === 'console') return 'SELECT A SHIP OR STATION';
  if (parts[0] === 'gm') {
    return facilitatorActive ? 'REVIEW FACILITATOR NEXT ACTIONS' : 'VERIFY FACILITATOR AUTHORITY';
  }
  if (parts[0] === 'brief') return roleBrief ? 'READ THE PRIVATE ROLE BRIEF' : 'WAIT FOR THE PRIVATE ASSIGNMENT';
  if (parts[0] === 'escape') return 'FOLLOW THE DISPLAYED ESCAPE STATUS';
  if (parts[0] === 'mission' || parts[0] === 'missions') return 'REVIEW THE MISSION STATUS';
  if (parts[0] === 'attack' || parts[0] === 'attacks') return 'REVIEW THE ATTACK STATUS';
  if (parts[0] === 'debrief') return 'REVIEW THE DEBRIEF';
  if (parts[0] === 'press' || parts[0] === 'shuttles') return 'REVIEW THE CURRENT SHUTTLE ACTIONS';
  if (parts[0] === 'ships' && parts[2] === 'roles' && !parts[3]) return 'SELECT A SHIP STATION';
  if (parts[0] === 'ships' && parts[2] === 'observer') {
    return facilitatorActive ? 'REVIEW SHIP STATUS' : 'RETURN TO AN AUTHORIZED CONSOLE';
  }
  if (parts[0] === 'ships') return 'REVIEW THE CURRENT SHIP STATION ACTIONS';
  if (parts[0] === 'union') return 'REVIEW JOINT ENGINEERING ACTIONS';
  if (parts[0] === 'replacement') return 'REVIEW THE ASSIGNED WORKSPACE';
  return 'FOLLOW THE CURRENT ROUTE CONTROLS';
}

function failureState(context: PrimaryStatusContext): Pick<PrimaryStatusModel, 'failureState' | 'severity'> {
  const { communicationError, connection, session, snapshotFreshness } = context;
  if (communicationError?.message) {
    const cycleSafeMessage = communicationError.message.replace(/\bturn\b/gi, (word) =>
      word === word.toUpperCase() ? 'CYCLE' : word[0] === word[0]?.toUpperCase() ? 'Cycle' : 'cycle');
    return { failureState: cycleSafeMessage, severity: 'failure' };
  }
  if (connection === 'offline') {
    return { failureState: 'SESSION OFFLINE // SAVED VIEW MAY BE STALE', severity: 'warning' };
  }
  if (connection === 'connecting') {
    return { failureState: 'SESSION RECONNECTING // AWAITING SERVER', severity: 'warning' };
  }
  if (connection !== 'live' || snapshotFreshness !== 'server') {
    return { failureState: 'SESSION STATUS // LIVE STATE NOT VERIFIED', severity: 'warning' };
  }
  if (session?.gameOutcome) {
    return {
      failureState: `GAME FAILURE // ${session.gameOutcome.cause.replaceAll('-', ' ').toUpperCase()} // CYCLE ${session.gameOutcome.cycle}`,
      severity: 'failure',
    };
  }
  if (session?.phase === 'success') {
    return { failureState: 'GAME COMPLETE // NO FAILURE RECORDED', severity: 'normal' };
  }
  if (session?.phase === 'failure') {
    return { failureState: 'GAME FAILURE // OUTCOME NOT REPORTED', severity: 'failure' };
  }
  if (session?.phase === 'closed') {
    return { failureState: 'SESSION CLOSED', severity: 'normal' };
  }
  return { failureState: 'NO ACTIVE FAILURE REPORTED', severity: 'normal' };
}

export function primaryStatusModel(context: PrimaryStatusContext): PrimaryStatusModel {
  const cycle = context.session?.currentTurn;
  const failure = failureState(context);
  return {
    cycle: Number.isSafeInteger(cycle) && (cycle ?? -1) >= 0
      ? `CYCLE ${cycle}`
      : 'CYCLE NOT REPORTED',
    phase: phaseLabel(context),
    location: locationLabel(context),
    authority: authorityLabel(context),
    nextAction: nextActionLabel(context),
    ...failure,
  };
}
