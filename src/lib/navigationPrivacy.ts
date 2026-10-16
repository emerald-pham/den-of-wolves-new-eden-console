import type { GameSession } from '@/types/game';
import { publicFullGameDemoState } from '../../functions/src/memberSession';

// A cache is read before Firebase proves the next reader's audience. Unknown
// fields must not become durable just because a future/legacy client spread
// a private projection into its session object. New cached fields require an
// explicit audience decision here; private navigation always stays ephemeral.
const PERSISTED_SESSION_FIELDS = [
  'id', 'name', 'joinCode', 'phase', 'ownerUid', 'createdAt', 'updatedAt',
  'memberSessionScope', 'fleetPartitionRevision', 'singlePlayerDemo', 'fullGameDemo',
  'currentTurn', 'turnState', 'turnStartAnnouncement', 'turnPhase', 'fleetRedAlert',
  'admiralDirectives', 'presidentWorkspace', 'politicalCapital', 'resolvedCrisisOutcome',
  'presidentialElection', 'presidentialOffices', 'currentMemberIsPresident',
  'currentMemberBallotSubmitted', 'debriefMode', 'gameOutcome', 'survivorOutcome',
  'pressDispatch', 'fleetTicker', 'maintenanceCycles', 'smallShipStates',
  'baseCapybaraCargo', 'shuttleCargo', 'shuttleFuelled', 'shuttleControl',
  'shuttleEvacuations', 'serviceShuttleRecharges', 'blacksmithRepairs', 'philiaRepairs',
  'macawRepairs', 'boaRecycling', 'chacauRepairs', 'allyRepairs',
  'gorgoneionRepairDrones', 'warriorRepairDrones', 'maliadesState', 'highwallMining',
  'retainedShuttles', 'quarantineDocking', 'shipUpgrades', 'shipSurvivors',
  'populationAlerts', 'playerCount', 'chartId', 'expansion', 'turnLimit',
  'configurationLocked', 'setupConfirmed', 'chartSelectionLocked', 'setupRevision', 'setup',
  'activeVesselIds', 'admittedVesselIds', 'voyage33Admission', 'voyage33Maintenance',
  'capybaraEnabled', 'dioneEnabled', 'universalArbourEnabled', 'wolfCultEnabled',
  'pressEnabled', 'pressClaimed', 'pressAvailabilityRevision', 'shipConsoleLocks',
  'vesselActionRevisions', 'shipJumpStates', 'shipJumpTransitions', 'pursuitEmergencyWindow',
  'shipResources', 'shipDamage', 'fighterWingCounts', 'pdfEscortWing', 'shipUnrest',
  'shipMutinies', 'unrestAlerts', 'gmControlsLocked', 'activeRoleIds',
  'shuttleDockings', 'shuttleVisitLog', 'confettiUsedShipIds', 'dradisContactTriggeredAt',
] as const;

/** Discard the organiser chart while preserving entitled member projections. */
export function stripGmNavigationProjection(session: GameSession): GameSession {
  const next = { ...session };
  delete next.shipGalacticCoordinates;
  delete next.shipNavigationLogs;
  delete next.organiserSites;
  delete next.organiserSystems;
  delete next.organiserSystemHistory;
  delete next.pursuitDistances;
  delete next.pursuitGroups;
  delete next.shipFleetGroupIds;
  delete next.candidatePlanCheckpoint;
  delete next.pursuitEmergencyWindowAuthority;
  delete next.voyage33Movement;
  delete next.gmNavigationRevision;
  const own = next.playerDiscovery;
  if (own?.shipId) {
    if (own.currentCoordinate) next.shipGalacticCoordinates = { [own.shipId]: own.currentCoordinate };
    next.shipNavigationLogs = { [own.shipId]: own.navigationLogs };
  }
  return next;
}

/** A private player chart is safe in memory but cannot be bound to the next Firebase UID after reload. */
export function stripPersistedNavigationProjection(session: GameSession): GameSession {
  const root = session as unknown as Record<string, unknown>;
  const next = Object.fromEntries(PERSISTED_SESSION_FIELDS
    .filter(key => Object.hasOwn(root, key))
    .map(key => [key, root[key]]));
  const demo = publicFullGameDemoState(root.fullGameDemo);
  if (demo) next.fullGameDemo = demo;
  else delete next.fullGameDemo;
  return next as unknown as GameSession;
}
