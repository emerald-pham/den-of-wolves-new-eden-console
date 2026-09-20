import { captureMaintenanceUndo, restoreMaintenanceUndo, type MaintenanceUndoField } from './maintenanceRollback';
import { projectMaintenanceEvent } from './maintenanceEvent';
import { canOperateRole, shipForRole } from './crewAccess';
import {
  escapeStateForDestruction,
  fleePlayerEscapeState,
  parsePlayerEscapeState,
  type PlayerEscapeState,
} from './escapeState';
import { advanceMaintenance, MAINTENANCE_RULES, emptyMaintenanceCycle, parseMaintenanceCycle, type MaintenanceCycle } from './maintenance';
import { applyVulcanAdditionalLabour, emptyTargetMaintenanceCycle, VULCAN_ADDITIONAL_LABOUR_CONSOLES, type VulcanAdditionalLabourConsole } from './vulcanLabour';
import {
  INITIAL_SHIP_SURVIVORS,
  acknowledgePopulationAlert,
  populationChange,
  populationForShip,
  populationTrackForShip,
} from './shipPopulation';
import { randomInt, randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { commandError } from './commandErrors';
import { isWireSafeEntityId } from './identifiers';
import { canClaimSeat, shouldClearSeatPointer } from './seatPolicy';
import { canSelectConsoleRole, disconnectedRoleState } from './consoleRolePolicy';
import { isGmAccessActive, isGmAccessPassword } from './gmAccess';
import {
  FLEET_SHIP_NAMES,
  canPopShipConfetti,
  confettiActivationDecision,
  confettiSignalTargets,
  isFleetShipId,
  isReusableConfettiSource,
  isOfficerRoleForShip,
  isShipDispenserSignal,
  liveConfettiApprovals,
  shouldLogShipConfettiEvent,
} from './shipConfetti';
import {
  requireDiceRequest,
  requireDebriefModeRequest,
  requirePressAvailabilityRequest,
  requireElevationRequest,
  requireGmAccessLoginRequest,
  requireGmAccessLogoutRequest,
  requireGmClaimRequest,
  requireGmControlsLockRequest,
  requireGmShipConsoleWriteGrantRequest,
  requireGmInstanceActionRequest,
  requireGmInstanceRequest,
  requireAirspaceWindowExtensionRequest,
  requireEmergencyTimerPauseRequest,
  requireWolfAttackWindowRequest,
  requireWolfAttackPreparationRequest,
  requireWolfAttackDeclarationRequest,
  requireWolfCommanderRerollRequest,
  requireFacilitatorCensusNoteRequest,
  requireWolfCultIntelligenceRequest,
  requireArbourVisionRequest,
  requireFacilitatorRuleCallRequest,
  isCanonicalRequestId,
  requireCrisisTransitionRequest,
  requireVoyage33AdmissionRequest,
  requireZealotryResponseRequest,
  requireCivilUnrestGrievanceRequest,
  requireCivilUnrestResolutionRequest,
  requirePlayerKickRequest,
  requireOpenAirspacePhaseRequest,
  requireTurnAdvanceRequest,
  requireShipConfettiRequest,
  requireShipCounterBatchRequest,
  requireShipCounterRequest,
  requireFighterWingCountRequest,
  requireFighterBuildRequest,
  requireShipDamageRequest,
  requireMaintenanceRollbackRequest,
  requireShipJumpRequest,
  requireShipNavigationMoveRequest,
  requireShipConsoleLockRequest,
  requireShipUnrestRequest,
  requireUnrestDismissalRequest,
  requireSessionRequest,
  requireEscapeRequest,
  requireShipStoreScavengeRequest,
  requireAirspaceRequest,
  requireDisconnectRequest,
  requirePresenceRequest,
  requireBoundedIdList,
  requireBoundedIdMap,
  requireMaintenanceRequest,
  requireVipCardDrawRequest,
  requireVipCardTransferRequest,
  requireSmallShipDockingRequest,
  requireSmallShipMaintenanceRequest,
  requireVulcanAdditionalLabourRequest,
  requireSessionCreationRequest,
  requireCastingPreferenceRequest,
  requireRoleAssignmentRequest,
  requireRoleReleaseRequest,
  requireReplacementEligibilityRequest,
  requireReplacementAssignmentRequest,
  requireLoyaltyAssignmentRequest,
  requireAndroidDisclosureRequest,
  requireFacilitatorResponsibilityRequest,
  requireGameStartRequest,
  requireAwayMissionCardDealRequest,
  requireAwayMissionDiscardReadyRequest,
  requireAwayMissionCardDiscardRequest,
  requireSessionSeatRequest,
  requireUid,
  requireSetupConfirmationRequest,
  requirePressDispatchDismissalRequest,
  requirePressDispatchRequest,
  requireVesselActionRequest,
  requireHummingbirdHarvestRequest,
  requireCommissarPurgeRequest,
} from './requestGuards';
import {
  CIVIL_UNREST_SHIP_IDS,
  civilUnrestShipId,
  civilUnrestShipsForRole,
} from './civilUnrest';
import {
  replacementRoleFor,
  replacementRoleAvailable,
  replacementAuthorityAllowsRole,
  type ReplacementRoleDefinition,
} from './replacementRoles';
import {
  applyShipNavigationMove,
  type NavigationLogEntry,
  type NavigationLogs,
} from './navigation';
import {
  adjustPursuitForMovement,
  advancePursuitForCycle,
  isValidPursuitAuthority,
  navigationState,
  navigationStateDocumentPath,
  playerDiscoveryProjection,
  pursuitGroups,
  writePlayerDiscoveryProjection,
  type NavigationState,
} from './navigationProjection';
import {
  resolveJumpAttempt,
  type JumpAttemptResult,
  type JumpDriveState,
  type JumpTransition,
} from './jumpDrive';
import { deriveRoutineWolfAssignment } from './wolfAssignment';
import { scheduledWolfAttackComposition } from './wolfAttackComposition';
import { expireTurnScopedResources } from './turnTransition';
import {
  DEFAULT_ACTIVE_ROLE_IDS,
  isJointEngineeringRoleAvailable,
  isJointEngineeringRoleId,
  jointEngineeringShipsForRole,
  ROLE_IDS,
  recommendedRoleIds,
} from './roleConfiguration';
import {
  canonicalSessionSetup,
  composeDefaultLoyaltyAssignments,
  defaultSuspicionForLoyalty,
  activeVesselIdsForRoles,
  isLiveSetupGm,
  loyaltyAssignmentDecision,
  normalizeSessionConfiguration,
  normalizePersistedSessionConfiguration,
  optionalLoyaltyAssignmentDecision,
  readinessForSetup,
  roleAssignmentDecision,
  stableSeatsForRoles,
  validateExplicitLoyaltySetup,
  vesselModeForConfiguration,
  type LoyaltyKind,
} from './gameSetup';
import { serializedRoleBrief } from './roleBriefs';
import {
  arrivalActivationForAdmission,
  parseVoyage33ArrivalActivation,
  voyage33MotivationForRole,
  type Voyage33MotivatedRoleId,
} from './voyageArrival';
import {
  INITIAL_SHIP_RESOURCES,
  canAdjustShipCounter,
  isResourceShipId,
  nextResourceAmount,
  shipResources,
  shipUnrest,
  unrestChange,
} from './resources';
import { planShipStoreScavenge, requireScavengeInventories } from './shipStoreScavenge';
import { activeVesselRecord, initialSessionComposition } from './sessionComposition';
import {
  INITIAL_FLEET_GROUP_ID,
  fleetGroupRecord,
  initialFleetGroup,
  withFleetGroupVessels,
  type FleetGroupRecord,
} from './fleetGroups';
import {
  ROLE_OWNED_CRAFT_CATALOG,
  battleTableCraftActionsForParkedCraft,
  type BattleTableCraftActionRegistration,
  craftStartingManifestForSetup,
  craftStartingManifestHasUnresolvedHosts,
  craftStartingManifestMatches,
  roleOwnedCraftForRoles,
  roleOwnedCraftManifestForSetup,
  roleOwnedCraftManifestMatches,
  shuttleDockingsAreParked,
  shuttleDockingsMatchRoleOwnedCraft,
} from './craftOwnership';
import {
  PRESENCE_LEASE_MS,
  activeSessionConflicts,
  deletionDeadline,
  isPresenceStale,
  PRESENCE_RECONCILIATION_INTERVAL_MS,
} from './sessionLifecycle';
import { SHIP_DAMAGE_DECKS, drawShipDamage, shipDamage } from './shipDamage';
import { destructionTransition, escapePodCapacityForShip } from './shipDestruction';
import { totalFleetLossOutcome } from './totalFleetLoss';
import { aggregateSurvivorOutcome, type SurvivorOutcome } from './survivorOutcome';
import {
  missionDeckStateFromCards,
  parseMissionDeckState,
  shuffledMissionDeck,
  type MissionDeckState,
} from './missionDeck';
import { atomicStartState } from './startState';
import {
  fighterWingCapacity,
  fighterWingCounts,
  type FighterWingCountState,
  type FighterWingId,
} from './fighterWings';
import {
  applyPopulationSteps,
  applyResourceSteps,
  applyUnrestSteps,
} from './shipCounterBatch';
import { pressDispatchState } from './pressDispatchState';
import {
  INITIAL_SHUTTLE_DOCKINGS,
  activeShuttleDockingsForVessels,
  activeShuttleVisitsForDockings,
  initialShuttleDockingsForRoles,
  initialShuttleVisitsForDockings,
  sanitizeShuttleCargo,
} from './shuttlecraft';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import {
  isJoinCode,
  joinCodeLengthForCreateRequest,
  takeJoinCodeAttempt,
  type JoinCodeAttemptState,
} from './joinCodeSecurity';
import {
  extendActiveTurnPhase,
  isTurnPhaseTimerActive,
  pauseActiveTurnPhase,
  resumePausedTurnPhase,
  startTurnPhase,
  turnStateForPhaseContext,
  turnStateForPhase,
  turnStateState,
  turnPhaseState,
  updateTurnStateForPhase,
} from './turnZero';
import {
  ACTION_METADATA,
  decideActionAuthorization,
  type ActionId,
  type ActorScope,
} from './actionMetadata';
import {
  EventVisibility,
  buildAuthoritativeEventEnvelope,
} from './eventEnvelope';
import { buildPrivacySafeEventRecord } from './eventRedaction';
import { parseStoredZealotryResponse, type ZealotryResponseAction } from './zealotryResponse';
import {
  CIVIL_UNREST_RESOLUTION_SHIP_IDS,
  parseStoredCivilUnrestResolution,
} from './civilUnrestResolution';
import { civilUnrestReport, diseaseOutbreakReport, parseDiseaseOutbreak, APPROACHING_VESSEL_REPORT, PRESIDENTIAL_ELECTION_REPORT, RELIGIOUS_ZEALOTRY_REPORT, canTransitionCrisis, crisisConfigurationBlocker, isCrisisKind, isCrisisState, type CrisisStateName } from './crisisState';
import { buildVesselActionEnvelope, type VesselActionEnvelope } from './vesselActionEnvelope';
import {
  VOYAGE_33_COMMITMENTS,
  VOYAGE_33_ID,
  VOYAGE_33_POPULATION,
  VOYAGE_33_UNREST,
  parseVoyage33Admission,
  type Voyage33Admission,
} from './voyageAdmission';
import {
  availableVipCards,
  drawVipCardState,
  emptyVipDeckState,
  parseVipDeckState,
  transferVipCardState,
  vipHandForState,
  type VipDeckState,
} from './vipCards';
import { organiserSitesForChart } from './starChartLookup';
import { allDiscoverySystems } from './starChartProjection';
import { discoverySystemsForCoordinates } from './starChartProjection';
import { pursuitDistancesForCoordinates } from './starChartProjection';
import type { LifecyclePhase } from './lifecycle';
import {
  allocateMissionCards,
  awayMissionCraftForRole,
  awayMissionHandId,
  missionDeckDealtCount,
  type AwayMissionParticipantSnapshot,
} from './awayMissionCards';
import { wolfAttackWindowState, type WolfAttackWindow } from './wolfAttackWindow';
import {
  validateWolfAttackPreparation,
  wolfAttackPreparationState,
  type WolfAttackPreparation,
} from './wolfAttackPreparation';
import {
  WOLF_ATTACK_PARKING_RELEASE,
  WOLF_ATTACK_DECLARATION_STEP,
  type WolfAttackStageState,
  wolfAttackBlocksNormalMovement,
} from './wolfAttackDeclaration';
import {
  CORE_WOLF_TARGET_RING,
  EXPANDED_WOLF_TARGET_RING,
  resolveWolfTargeting,
  type WolfTargetRing,
  type WolfTargetingReceipt,
} from './wolfCombatMath';
import {
  applyWolfCommanderRerolls,
  commanderTargetingView,
  parseWolfTargetingReceipt,
  type WolfCommanderTargetingView,
} from './wolfCommanderRerolls';
import {
  commandReceiptDisposition,
  type CommandFingerprint,
  type CommandPayloadValue,
} from './commandIdempotency';
import {
  dismissFleetTickerSource,
  emptyFleetTickerState,
  FLEET_TICKER_PRIORITIES,
  publishFleetTicker,
  recoverActivePressMessages,
  retireAirspaceFleetTicker,
  reconcileFleetTicker,
  fleetTickerState,
  type FleetTickerMessage,
  type FleetTickerState,
  type FleetTickerTransmission,
} from './fleetTickerState';
import {
  advanceSmallShipMaintenance,
  emptySmallShipState,
  parseSmallShipState,
  SMALL_SHIP_IDS,
  SMALL_SHIP_RULES,
  type SmallShipId,
  type SmallShipState,
} from './smallShip';
import {
  advanceVoyage33Maintenance,
  parseVoyage33MaintenanceState,
  VOYAGE_33_MAINTENANCE_RULES,
  type Voyage33MaintenanceState,
} from './voyage33Maintenance';
import {
  addHarvestToCargo,
  parseHummingbirdHarvestState,
  resolvedHarvestValues,
  type HummingbirdHarvestState,
} from './hummingbirdHarvest';

/**
 * Server-side authority for the companion console.
 *
 * Firestore rules deny every client write that a player could benefit from
 * lying about. Those mutations land here instead, where they run with admin
 * privileges inside a transaction. Cloud Functions 2nd gen, Node 22.
 */

initializeApp();
setGlobalOptions(CALLABLE_RUNTIME_OPTIONS);

const db = getFirestore();

// Keep request bounds tied to the printed/domain catalogs. The resolver still
// decides whether each canonical id is valid for the selected vessel.
const MAX_MAINTENANCE_CONSOLES = Math.max(
  ...Object.values(MAINTENANCE_RULES).map(({ reactor }) => reactor + 1),
);
const MAX_MAINTENANCE_REFUELS = Math.max(
  ...Object.values(SHIP_DAMAGE_DECKS).map((deck) => deck.filter(({ systemId }) => systemId.startsWith('shuttle-bay')).length),
);
const MAX_SMALL_SHIP_CONSOLES = Math.max(
  ...Object.values(SMALL_SHIP_RULES).map(({ reactorCapacity }) => reactorCapacity),
);
const MAX_VOYAGE_33_CONSOLES = VOYAGE_33_MAINTENANCE_RULES.reactorCapacity;

type ActiveTurnPhase = NonNullable<ReturnType<typeof turnPhaseState>>;
type ActiveTurnState = NonNullable<ReturnType<typeof turnStateState>>;

const FLEET_TICKER_COPY = {
  turnZero: 'AIRSPACE CONTROL // AIRSPACE CLOSED',
  airspaceClosed: 'AIRSPACE CONTROL // AIRSPACE CLOSED',
  airspaceOpen: 'AIRSPACE CONTROL // AIRSPACE OPEN',
  emergency: 'AIRSPACE CONTROL // EMERGENCY TIMER PAUSED // ALL FLEET CLOCKS ON HOLD // GM RESUME REQUIRED',
  emptySession: 'AIRSPACE CONTROL // FLEET CLOCKS ON HOLD // RESUMES WHEN CREW RECONNECT',
  standDown: 'AEGIS // RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.',
  finale: 'CREDITS // BASED ON THE ORIGINAL MEGAGAME DEN OF WOLVES BY JOHN MIZON (SOUTH WEST MEGAGAMES) // NEW EDEN GAME DESIGN: JOHN KEYWORTH (KIWI GAME DESIGN) // WEB APP LEAD: EMERALD FLEUR PHAM',
} as const;

const TURN_ZERO_ATC_SOURCE_ID = 'turn-zero-atc';

function turnZeroFleetTicker(sessionId: string, now: string): FleetTickerState {
  return publishFleetTicker(sessionId, emptyFleetTickerState(), {
    source: 'automatic', priority: FLEET_TICKER_PRIORITIES.turnZero,
    text: FLEET_TICKER_COPY.turnZero, tone: 'normal', gap: 'long',
    sourceId: TURN_ZERO_ATC_SOURCE_ID,
  }, now);
}

function fleetTickerStateFromLegacy(
  sessionId: string,
  session: DocumentSnapshot,
  now: string,
): FleetTickerState {
  let state = emptyFleetTickerState();
  const phase = turnPhaseState(session.get('turnPhase'));
  if (phase?.timerPause) {
    state = publishFleetTicker(sessionId, state, {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.emergency,
      text: phase.timerPause.reason === 'empty-session' ? FLEET_TICKER_COPY.emptySession : FLEET_TICKER_COPY.emergency,
      tone: phase.timerPause.reason === 'empty-session' ? 'normal' : 'danger', gap: 'long',
      sourceId: `${phase.timerPause.reason ?? 'emergency'}:${phase.turn}:${phase.timerPause.pausedAt}`,
    }, now);
  } else if (phase?.airspace.tickerActive) {
    state = publishFleetTicker(sessionId, state, {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace, passCount: 1,
      text: phase.airspace.state === 'restricted'
        ? FLEET_TICKER_COPY.airspaceClosed : FLEET_TICKER_COPY.airspaceOpen,
      tone: 'normal', gap: 'long', sourceId: `airspace:${phase.turn}:${phase.airspace.state}`,
    }, now);
  }
  const dispatches = pressDispatchState(session.get('pressDispatch')).dispatches;
  for (const dispatch of dispatches) {
    state = publishFleetTicker(sessionId, state, {
      source: 'press', priority: FLEET_TICKER_PRIORITIES.press,
      text: dispatch.text.startsWith('SNN //') ? dispatch.text : `SNN // ${dispatch.text}`,
      tone: 'normal', gap: 'long', sourceId: dispatch.id,
    }, now);
  }
  const alert = session.get('fleetRedAlert') as Record<string, unknown> | undefined;
  const alertRevision = typeof alert?.revision === 'number' && Number.isSafeInteger(alert.revision)
    ? alert.revision : 0;
  // A legacy inactive alert has no persisted server deadline. Keep it
  // streamless until its next authoritative command supplies one.
  if (alertRevision > 0 && alert?.active === true) {
    state = publishFleetTicker(sessionId, state, {
      source: 'admiral', priority: FLEET_TICKER_PRIORITIES.admiral,
      text: `ICSN ADMIRAL // ${(typeof alert?.text === 'string' && alert.text.length > 0
        ? alert.text : 'RED ALERT // WOLF ATTACK IMMINENT, ALL HANDS TO BATTLE STATIONS').toUpperCase()}`,
      tone: 'danger', sourceId: `red-alert:${alertRevision}`,
    }, now);
  }
  const debrief = session.get('debriefMode') as Record<string, unknown> | undefined;
  const debriefRevision = typeof debrief?.revision === 'number' && Number.isSafeInteger(debrief.revision)
    ? debrief.revision : 0;
  if (debrief?.active === true) {
    state = publishFleetTicker(sessionId, state, {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.debrief,
      text: FLEET_TICKER_COPY.finale, tone: 'normal', sourceId: `debrief:${debriefRevision}`,
    }, now);
  }
  return state;
}

function fleetTickerForSession(
  sessionId: string,
  session: DocumentSnapshot,
): FleetTickerState {
  const stored = session.get('fleetTicker');
  if (stored === undefined) return emptyFleetTickerState();
  return recoverActivePressMessages(
    stored,
    pressDispatchState(session.get('pressDispatch')).dispatches.map(({ id }) => id),
    new Date().toISOString(),
  );
}

/**
 * Mutations may migrate the still-legacy producer fields as part of their
 * source transaction. Public responses stay streamless until that write so a
 * reconnect cannot invent a new finite deadline from its local request time.
 */
function fleetTickerForMutation(
  sessionId: string,
  session: DocumentSnapshot,
  now: string,
): FleetTickerState {
  const stored = session.get('fleetTicker');
  const state = stored === undefined
    ? fleetTickerStateFromLegacy(sessionId, session, now)
    : fleetTickerState(stored);
  const recovered = recoverActivePressMessages(
    state,
    pressDispatchState(session.get('pressDispatch')).dispatches.map(({ id }) => id),
    now,
  );
  const turn = sessionTurn(session.get('currentTurn'));
  const phase = turnPhaseState(session.get('turnPhase'));
  const currentSourceId = turn === 0 ? TURN_ZERO_ATC_SOURCE_ID
    : phase?.turn === turn ? `airspace:${turn}:${phase.airspace.state}` : undefined;
  const currentState = currentSourceId
    ? reconcileFleetTicker(retireAirspaceFleetTicker(recovered, now, currentSourceId), now) : recovered;
  let changed = false;
  const updateCopy = (entry: FleetTickerMessage): FleetTickerMessage => {
    if (entry.source !== 'automatic') return entry;
    const text = entry.sourceId === TURN_ZERO_ATC_SOURCE_ID ? FLEET_TICKER_COPY.turnZero
      : /^airspace:[1-9]\d*:restricted$/.test(entry.sourceId ?? '') ? FLEET_TICKER_COPY.airspaceClosed
      : /^airspace:[1-9]\d*:lifted$/.test(entry.sourceId ?? '') ? FLEET_TICKER_COPY.airspaceOpen
      : entry.text;
    if (text === entry.text) return entry;
    changed = true;
    return { ...entry, text };
  };
  const current = currentState.current ? updateCopy(currentState.current) : null;
  const queued = currentState.queued.map(updateCopy);
  return changed ? { ...currentState, current, queued, revision: currentState.revision + 1 } : currentState;
}

function fleetTickerBaseline(
  sessionId: string,
  session: DocumentSnapshot,
  state: FleetTickerState,
  now: string,
): FleetTickerState {
  if (state.current !== null || state.queued.length > 0 || session.get('phase') === 'closed') {
    return state;
  }
  const phase = turnPhaseState(session.get('turnPhase'));
  if (phase?.timerPause) return state;
  const redAlert = session.get('fleetRedAlert') as { active?: unknown } | undefined;
  if (redAlert?.active === true) return state;
  const debrief = session.get('debriefMode') as { active?: unknown } | undefined;
  if (debrief?.active === true) return state;

  const turn = sessionTurn(session.get('currentTurn'));
  if (turn === 0) {
    return publishFleetTicker(sessionId, state, {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.turnZero,
      text: FLEET_TICKER_COPY.turnZero, tone: 'normal', gap: 'long',
      sourceId: TURN_ZERO_ATC_SOURCE_ID,
    }, now);
  }
  if (!phase || phase.turn !== turn) return state;
  return publishFleetTicker(sessionId, state, {
    source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace, passCount: 1,
    text: phase.airspace.state === 'restricted'
      ? FLEET_TICKER_COPY.airspaceClosed : FLEET_TICKER_COPY.airspaceOpen,
    tone: 'normal', gap: 'long', sourceId: `airspace:${turn}:${phase.airspace.state}`,
  }, now);
}

/**
 * A finite server notice still needs a truthful next copy when its local
 * presentation finishes. Keep that fallback in the authoritative stream so a
 * reconnect never has to guess an airspace bulletin. An eligible Press
 * dispatch always wins this slot; a dismissed dispatch is never recreated.
 */
function fleetTickerFiniteFallback(
  sessionId: string,
  session: DocumentSnapshot,
  state: FleetTickerState,
  now: string,
): FleetTickerState {
  const current = state.current;
  if (current?.source !== 'automatic' || current.passCount === undefined ||
      !current.sourceId?.startsWith('red-alert:')) return state;
  if ([current, ...state.queued].some(entry => entry?.source === 'press')) return state;

  const phase = turnPhaseState(session.get('turnPhase'));
  const turn = sessionTurn(session.get('currentTurn'));
  const fallback = turn === 0
    ? {
      source: 'automatic' as const, priority: FLEET_TICKER_PRIORITIES.turnZero,
      text: FLEET_TICKER_COPY.turnZero, tone: 'normal' as const, gap: 'long' as const,
      sourceId: TURN_ZERO_ATC_SOURCE_ID,
    }
    : phase?.turn === turn
      ? {
        source: 'automatic' as const, priority: FLEET_TICKER_PRIORITIES.airspace, passCount: 1,
        text: phase.airspace.state === 'restricted'
          ? FLEET_TICKER_COPY.airspaceClosed : FLEET_TICKER_COPY.airspaceOpen,
        tone: 'normal' as const, gap: 'long' as const,
        sourceId: `airspace:${turn}:${phase.airspace.state}`,
      }
      : undefined;
  if (fallback === undefined) return state;
  return publishFleetTicker(sessionId, state, fallback, now);
}

/** Seed an authoritative ATC baseline without disturbing an active stream. */
function ensureFleetTickerBaseline(
  tx: Transaction,
  sessionRef: DocumentReference,
  session: DocumentSnapshot,
  now: string,
): FleetTickerState {
  const stored = session.get('fleetTicker');
  const state = fleetTickerForMutation(sessionRef.id, session, now);
  const next = fleetTickerFiniteFallback(
    sessionRef.id,
    session,
    fleetTickerBaseline(sessionRef.id, session, state, now),
    now,
  );
  const previous = stored === undefined ? emptyFleetTickerState() : fleetTickerState(stored);
  if (JSON.stringify(previous) !== JSON.stringify(next)) {
    tx.update(sessionRef, { fleetTicker: next, updatedAt: FieldValue.serverTimestamp() });
  }
  return next;
}

function publishSessionFleetTicker(
  sessionId: string,
  session: DocumentSnapshot,
  input: FleetTickerTransmission,
  now: string,
): FleetTickerState {
  return publishFleetTicker(sessionId, fleetTickerForMutation(sessionId, session, now), input, now);
}

function publishPressFleetTicker(
  sessionId: string,
  session: DocumentSnapshot,
  input: FleetTickerTransmission,
  now: string,
): FleetTickerState {
  const state = fleetTickerForMutation(sessionId, session, now);
  return publishFleetTicker(
    sessionId,
    retireAirspaceFleetTicker(state, now),
    input,
    now,
  );
}

function pressMessageIds(state: FleetTickerState): ReadonlySet<string> {
  return new Set(
    [state.current, ...state.queued]
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.source === 'press' && entry.sourceId !== undefined)
      .map((entry) => entry.id),
  );
}

/** Persist recovery of active press copy stranded by the pre-queue reducer. */
function persistActivePressRecovery(
  tx: Transaction,
  sessionRef: DocumentReference,
  session: DocumentSnapshot,
  now: string,
): void {
  const stored = session.get('fleetTicker');
  if (stored === undefined) return;
  const before = fleetTickerState(stored);
  const recovered = recoverActivePressMessages(
    stored,
    pressDispatchState(session.get('pressDispatch')).dispatches.map(({ id }) => id),
    now,
  );
  const beforePress = pressMessageIds(before);
  const hasNewPress = [...pressMessageIds(recovered)].some((messageId) => !beforePress.has(messageId));
  if (hasNewPress) {
    tx.update(sessionRef, { fleetTicker: recovered, updatedAt: FieldValue.serverTimestamp() });
  }
}

/** Every clock path shares the same private attack-state interlock. */
function preserveWolfAttackAirspaceRestriction(
  phase: ActiveTurnPhase,
  attackState: DocumentSnapshot | undefined,
): ActiveTurnPhase {
  if (!attackState?.exists || !wolfAttackBlocksNormalMovement(attackState.data())) return phase;
  if (phase.airspace.state === 'restricted') return phase;
  return {
    ...phase,
    airspace: { ...phase.airspace, state: 'restricted', tickerActive: true },
  };
}

function requireWolfAttackMovementReleased(attackState: DocumentSnapshot): void {
  if (!attackState.exists || !wolfAttackBlocksNormalMovement(attackState.data())) return;
  throw commandError(
    'failed-precondition',
    'The Wolf attack awaits facilitator resolution; normal movement remains blocked.',
    'invalid-phase',
  );
}

/** Presence and clock changes commit together, so rejoin/expiry races retry on
 * the same session version. A reconnect can release only an automatic hold. */
function reconcilePresenceTimer(
  tx: Transaction,
  sessionRef: DocumentReference,
  session: DocumentSnapshot,
  attackState: DocumentSnapshot | undefined,
  connected: boolean,
): void {
  const debrief = session.get('debriefMode') as { active?: unknown } | undefined;
  if (session.get('phase') !== 'active' || debrief?.active === true) {
    persistActivePressRecovery(tx, sessionRef, session, new Date().toISOString());
    return;
  }
  const phase = turnPhaseState(session.get('turnPhase'));
  if (!phase || phase.turn !== sessionTurn(session.get('currentTurn'))) {
    persistActivePressRecovery(tx, sessionRef, session, new Date().toISOString());
    return;
  }
  const now = Date.now();
  let next: ActiveTurnPhase | undefined;
  if (connected) {
    if (phase.timerPause?.reason !== 'empty-session') {
      persistActivePressRecovery(tx, sessionRef, session, new Date(now).toISOString());
      return;
    }
    next = resumePausedTurnPhase(phase, now);
  } else {
    if (phase.timerPause) {
      persistActivePressRecovery(tx, sessionRef, session, new Date(now).toISOString());
      return;
    }
    const paused = pauseActiveTurnPhase(phase, now);
    if (paused?.timerPause) {
      next = { ...paused, timerPause: { ...paused.timerPause, reason: 'empty-session' } };
    }
  }
  if (!next) {
    persistActivePressRecovery(tx, sessionRef, session, new Date(now).toISOString());
    return;
  }
  next = preserveWolfAttackAirspaceRestriction(next, attackState);
  const serverTime = new Date(now).toISOString();
  const turnState = updatedTurnState(session, next);
  const priorTicker = fleetTickerForMutation(sessionRef.id, session, serverTime);
  const resumedTicker = !next.timerPause && phase.timerPause?.reason === 'empty-session'
    ? dismissFleetTickerSource(sessionRef.id, priorTicker,
      `empty-session:${phase.turn}:${phase.timerPause.pausedAt}`, serverTime)
    : priorTicker;
  const fleetTicker = publishFleetTicker(sessionRef.id, resumedTicker, next.timerPause ? {
    source: 'automatic', priority: FLEET_TICKER_PRIORITIES.emergency,
    text: FLEET_TICKER_COPY.emptySession, tone: 'normal', gap: 'long',
    sourceId: `empty-session:${next.turn}:${next.timerPause.pausedAt}`,
  } : {
    source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace, passCount: 1,
    text: next.airspace.state === 'restricted'
      ? FLEET_TICKER_COPY.airspaceClosed : FLEET_TICKER_COPY.airspaceOpen,
    tone: 'normal', gap: 'long', sourceId: `airspace:${next.turn}:${next.airspace.state}`,
  }, serverTime);
  tx.update(sessionRef, {
    turnPhase: next,
    ...(turnState ? { turnState } : {}),
    fleetTicker,
    updatedAt: FieldValue.serverTimestamp(),
  });
  // If the Team deadline won the race, preserve the ordinary expiry event
  // before holding the remaining Coordination window.
  if (phase.airspace.state === 'restricted' && next.airspace.state === 'lifted') {
    writeAirspaceOpenedEvent(tx, sessionRef.id, phase, serverTime);
  }
  const pause = next.timerPause ?? phase.timerPause;
  tx.set(db.doc(`sessions/${sessionRef.id}/events/presence-timer-${randomUUID()}`), buildPrivacySafeEventRecord({
    type: 'timer-pause',
    payload: { action: connected ? 'resumed' : 'paused', reason: 'empty-session', turn: next.turn, window: pause?.window, actorName: 'Session presence' },
    createdAt: FieldValue.serverTimestamp(),
  }));
}

type TurnAdvanceEvent = Readonly<{
  actorUid: string;
  transitionServerTime: string;
  reason: 'expiry' | 'override';
}>;

function txSetIfSupported(
  tx: Transaction,
  reference: DocumentReference,
  value: Record<string, unknown>,
): void {
  // A few legacy unit fixtures model only update/get transactions. Production
  // Firestore transactions always expose set; keeping the compatibility guard
  // lets those fixtures continue to exercise the authority path.
  const setter = (tx as unknown as { set?: (ref: DocumentReference, data: Record<string, unknown>) => void }).set;
  if (typeof setter === 'function') setter.call(tx, reference, value);
}

function writeFleetTickerAudit(
  tx: Transaction,
  sessionId: string,
  action: string,
  stream: FleetTickerState,
  messageId: string | undefined,
  serverTime: string,
): void {
  txSetIfSupported(tx, db.doc(`sessions/${sessionId}/events/fleet-ticker-${stream.revision}`),
    buildPrivacySafeEventRecord({
      type: 'fleet-ticker',
      payload: {
        action,
        ...(messageId ? { messageId } : {}),
        revision: stream.revision,
        sequence: stream.replayCursor,
        serverTime,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
}

function isFleetAlertResult(value: unknown): value is { active: boolean; revision: number } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.active === 'boolean' &&
    typeof result.revision === 'number' && Number.isSafeInteger(result.revision) &&
    result.revision >= 0;
}

function isPressDispatchResult(value: unknown): value is { dispatches: readonly unknown[]; revision: number } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return Array.isArray(result.dispatches) &&
    typeof result.revision === 'number' && Number.isSafeInteger(result.revision) &&
    result.revision >= 0;
}

function writeAirspaceOpenedEvent(
  tx: Transaction,
  sessionId: string,
  phase: ActiveTurnPhase,
  transitionServerTime: string,
): void {
  // Lifecycle event ordinals are shared across the two phases: Team is
  // 2*turn-1 and Coordination is 2*turn. They are envelope ordinals, not a
  // stored TurnPhase revision; the logical transition ID remains per-turn.
  const eventId = `airspace-opened-${phase.turn}`;
  tx.set(db.doc(`sessions/${sessionId}/events/${eventId}`), buildPrivacySafeEventRecord({
    type: 'airspace-opened',
    envelope: buildAuthoritativeEventEnvelope({
      sessionId,
      actorUid: 'system',
      actorRoleId: null,
      turn: phase.turn,
      phase: 'active',
      type: 'airspace-opened',
      requestId: eventId,
      revision: (2 * phase.turn) - 1,
      serverTime: transitionServerTime,
      visibility: EventVisibility.Member,
    }),
    payload: { transition: 'restricted-to-lifted' },
    createdAt: FieldValue.serverTimestamp(),
  }));
}

function writeTurnAdvancedEvent(
  tx: Transaction,
  sessionId: string,
  fromTurn: number,
  toTurn: number,
  transition: TurnAdvanceEvent,
): void {
  const eventId = `turn-advanced-${fromTurn}`;
  tx.set(db.doc(`sessions/${sessionId}/events/${eventId}`), buildPrivacySafeEventRecord({
    type: 'turn-advanced',
    envelope: buildAuthoritativeEventEnvelope({
      sessionId,
      actorUid: transition.actorUid,
      actorRoleId: null,
      turn: fromTurn,
      phase: 'active',
      type: 'turn-advanced',
      requestId: eventId,
      revision: 2 * fromTurn,
      serverTime: transition.transitionServerTime,
      visibility: EventVisibility.Member,
    }),
    payload: {
      transition: 'coordination-to-next-turn',
      fromTurn,
      toTurn,
      reason: transition.reason,
    },
    createdAt: FieldValue.serverTimestamp(),
  }));
}

const INITIAL_SHIP_GALACTIC_COORDINATES = {
  aegis: '0000',
  dione: '0000',
  icebreaker: '0000',
  capybara: '0000',
  shepherd: '0000',
  quellon: '0000',
  'refinery-124': '0000',
};
const INITIAL_SHIP_CONSOLE_LOCKS = Object.fromEntries(
  Object.keys(INITIAL_SHIP_GALACTIC_COORDINATES).map((shipId) => [shipId, false]),
);
const INITIAL_SHIP_NAVIGATION_LOGS = Object.fromEntries(
  Object.keys(INITIAL_SHIP_GALACTIC_COORDINATES).map((shipId) => [shipId, []]),
);
const INITIAL_SHIP_JUMP_STATES = Object.fromEntries(
  Object.keys(INITIAL_SHIP_GALACTIC_COORDINATES).map((shipId) => [shipId, {}]),
);
const INITIAL_SHIP_JUMP_TRANSITIONS = Object.fromEntries(
  Object.keys(INITIAL_SHIP_GALACTIC_COORDINATES).map((shipId) => [shipId, undefined]),
);
const AUTHORIZED_SHUTTLE_IDS: ReadonlySet<string> = new Set(
  ROLE_OWNED_CRAFT_CATALOG.filter((craft) => craft.kind === 'shuttle').map((craft) => craft.id),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function activeVesselIdsForSession(session: DocumentSnapshot): readonly string[] {
  const stored = session.get('activeVesselIds');
  if (Array.isArray(stored)) {
    return [...new Set(stored.filter((value): value is string => typeof value === 'string'))];
  }
  return activeVesselIdsForRoles(configuredRoleIds(session));
}

function survivorOutcomeForSession(
  sessionId: string,
  session: DocumentSnapshot,
  damage: ReturnType<typeof shipDamage>,
  cycle: number,
  occurredAt: string,
): SurvivorOutcome {
  const activeFleetShipIds = activeVesselIdsForSession(session);
  const rawPopulations = isRecord(session.get('shipSurvivors'))
    ? session.get('shipSurvivors') as Readonly<Record<string, unknown>>
    : {};
  const shipPopulations = Object.fromEntries(activeFleetShipIds.map((shipId) => {
    const stored = rawPopulations[shipId];
    const population = stored === undefined ? INITIAL_SHIP_SURVIVORS[shipId] : stored;
    return [shipId, population];
  })) as Record<string, number>;
  const lostOrDestroyedShipIds = activeFleetShipIds.filter((shipId) => damage[shipId]?.destroyed === true);
  const escapePodCapacities = Object.fromEntries(lostOrDestroyedShipIds.flatMap((shipId) => {
    const capacity = escapePodCapacityForShip(shipId)?.podCapacity;
    return capacity === undefined ? [] : [[shipId, capacity]];
  }));
  const storedSmallShips = isRecord(session.get('smallShipStates')) ? session.get('smallShipStates') : {};
  const smallVesselPopulations = Object.fromEntries(SMALL_SHIP_IDS.flatMap((id) => {
    const state = parseSmallShipState((storedSmallShips as Record<string, unknown>)[id], id);
    return state ? [[id, state.population]] : [];
  }));
  const rawAdmission = session.get('voyage33Admission');
  const admission = parseVoyage33Admission(rawAdmission, sessionId);
  const rawVoyageMaintenance = session.get('voyage33Maintenance');
  const voyageMaintenance = admission
    ? parseVoyage33MaintenanceState(rawVoyageMaintenance)
    : undefined;
  const admittedVesselPopulations: Record<string, number> = admission
    ? { [VOYAGE_33_ID]: voyageMaintenance?.population ?? admission.population }
    : {};
  const outcome = aggregateSurvivorOutcome({
    cycle,
    occurredAt,
    activeFleetShipIds,
    shipPopulations,
    destroyedShipIds: lostOrDestroyedShipIds,
    escapePodCapacities,
    smallVesselPopulations,
    admittedVesselPopulations,
  });
  if (!outcome) throw new Error('Authoritative survivor ledgers cannot be aggregated.');
  return outcome;
}

function totalFleetLossTerminalPatch(
  sessionId: string,
  session: DocumentSnapshot,
  destroyedShipId: string,
  destroyedShipState: ReturnType<typeof shipDamage>[string],
  occurredAt: string,
): Record<string, unknown> {
  const nextDamage = {
    ...shipDamage(session.get('shipDamage')),
    [destroyedShipId]: destroyedShipState,
  };
  const gameOutcome = totalFleetLossOutcome(
    activeVesselIdsForSession(session),
    nextDamage,
    sessionTurn(session.get('currentTurn')),
    occurredAt,
  );
  if (!gameOutcome) return {};
  return {
    phase: 'failure',
    gameOutcome,
    survivorOutcome: survivorOutcomeForSession(
      sessionId,
      session,
      nextDamage,
      gameOutcome.cycle,
      gameOutcome.occurredAt,
    ),
    turnPhase: FieldValue.delete(),
    turnState: FieldValue.delete(),
    turnStartAnnouncement: FieldValue.delete(),
  };
}

/** Destruction removes a full ship from navigation while retaining its
 * survivors, pods, resources, and shuttle records for their own callables. */
function requireNavigableShip(session: DocumentSnapshot, shipId: string): void {
  if (shipDamage(session.get('shipDamage'))[shipId]?.destroyed === true) {
    throw commandError(
      'failed-precondition',
      'Destroyed ships cannot move or jump.',
      'conflict',
    );
  }
}

function playerAuthoritativeVesselIds(player: DocumentSnapshot): readonly string[] {
  const vesselIds = [
    typeof player.get('replacementRoleId') === 'string'
      ? replacementRoleFor(player.get('replacementRoleId') as string)?.vesselId
      : undefined,
    shipForRole(player.get('assignedRoleId')),
    shipForRole(player.get('activeConsoleRoleId')),
  ];
  return [...new Set(vesselIds.filter((vesselId): vesselId is string => vesselId !== undefined))];
}

function playerHoldsDestroyedShip(player: DocumentSnapshot, shipId: string): boolean {
  return player.exists && player.get('role') === 'player' &&
    playerAuthoritativeVesselIds(player).includes(shipId);
}

function markPlayersForShipEscape(
  tx: Transaction,
  players: readonly DocumentSnapshot[],
  shipId: string,
  destructionEventId: string,
  revision: number,
): void {
  for (const player of players) {
    if (!playerHoldsDestroyedShip(player, shipId)) continue;
    const existing = playerEscapeState(player);
    // A repeated catastrophe is terminal and must not create a second escape
    // transition. A player with an existing escape state is already awaiting
    // the same explicit flee/reassignment path.
    if (existing) continue;
    tx.update(player.ref, {
      escapeState: escapeStateForDestruction(shipId, destructionEventId, revision),
      activeConsoleRoleId: null,
    });
  }
}

/** Wolf preparation must use the persisted setup tuple; role defaults are not authoritative here. */
function authoritativeActiveVesselIdsForWolfPreparation(session: DocumentSnapshot): readonly string[] {
  const stored = session.get('activeVesselIds');
  if (!Array.isArray(stored) || stored.length === 0 ||
      stored.some((value) => typeof value !== 'string' || !isResourceShipId(value)) ||
      new Set(stored).size !== stored.length) {
    throw commandError(
      'failed-precondition',
      'The session has no valid persisted active fleet tuple for Wolf preparation.',
      'invalid-phase',
    );
  }
  return [...stored] as string[];
}

function fleetGroupRef(sessionId: string) {
  return db.doc(`sessions/${sessionId}/fleetGroups/${INITIAL_FLEET_GROUP_ID}`);
}

function presenceReconciliationRef(sessionId: string, uid: string) {
  return db.doc(`sessions/${sessionId}/presenceReconciliations/${uid}`);
}

function presenceReconciliationTimestamp() {
  const timestamp = Timestamp as unknown as { fromMillis?: (milliseconds: number) => unknown };
  return typeof timestamp.fromMillis === 'function'
    ? timestamp.fromMillis(Date.now())
    : FieldValue.serverTimestamp();
}

function navigationStateRef(sessionId: string) {
  return db.doc(navigationStateDocumentPath(sessionId));
}

function gmDiscoveryProjectionRef(sessionId: string) {
  return db.doc(`sessions/${sessionId}/gmDiscovery/current`);
}

function playerDiscoveryProjectionRef(sessionId: string, uid: string) {
  return db.doc(`sessions/${sessionId}/playerDiscoveries/${uid}`);
}

function navigationStateForSession(
  navigationDoc: DocumentSnapshot,
  session: Pick<DocumentSnapshot, 'get'>,
  activeVesselIds: readonly string[],
): NavigationState {
  // A few callers/tests use lightweight snapshots that expose only `get`.
  // Treat those as an absent private document so legacy migration remains
  // compatible while real Admin snapshots still take the private path.
  if (navigationDoc.exists && typeof (navigationDoc as unknown as { data?: unknown }).data === 'function') {
    return navigationState(navigationDoc.data(), activeVesselIds, session.get('pursuitGroups'));
  }
  // Legacy sessions predate the private navigation state. This is a bounded
  // migration source only; callers persist the normalized state before the
  // next navigation mutation and never publish these fields to members.
  return navigationState({
    shipGalacticCoordinates: session.get('shipGalacticCoordinates'),
    shipNavigationLogs: session.get('shipNavigationLogs'),
  }, activeVesselIds, session.get('pursuitGroups'));
}

function navigationProjectionFields(navigation: NavigationState): Record<string, unknown> {
  return {
    shipGalacticCoordinates: navigation.shipGalacticCoordinates,
    shipNavigationLogs: navigation.shipNavigationLogs,
    pursuitGroups: navigation.pursuitGroups,
    ...(navigation.systemHistory ? { systemHistory: navigation.systemHistory } : {}),
  };
}

interface TurnPursuitAuthority {
  readonly navigation: NavigationState;
  readonly navigationRevision: number;
  readonly fleetGroups: readonly FleetGroupRecord[];
  readonly players: readonly DocumentSnapshot[];
  readonly chart: 'A' | 'B' | 'C';
  readonly legacyHeaderPresent: boolean;
  readonly legacyMigration: boolean;
}

function requireTurnPursuitMembership(
  activeVesselIds: readonly string[],
  fleetGroups: readonly FleetGroupRecord[],
  players: readonly DocumentSnapshot[],
): void {
  const activeVesselSet = new Set(activeVesselIds);
  const vesselGroups = new Map<string, string>();
  const memberGroups = new Map<string, string>();
  const activePlayers = players.filter((player) => player.exists && !isKickedPlayer(player));
  const activePlayerIds = new Set(activePlayers.map((player) => player.id));
  for (const group of fleetGroups) {
    for (const vesselId of group.vesselIds) {
      if (!activeVesselSet.has(vesselId) || vesselGroups.has(vesselId)) {
        throw commandError(
          'failed-precondition',
          'The stored fleet-group vessel authority is malformed; pursuit cannot advance.',
          'malformed-input',
        );
      }
      vesselGroups.set(vesselId, group.id);
    }
    for (const uid of group.memberUids) {
      if (!activePlayerIds.has(uid) || memberGroups.has(uid)) {
        throw commandError(
          'failed-precondition',
          'The stored fleet-group member authority is malformed; pursuit cannot advance.',
          'malformed-input',
        );
      }
      memberGroups.set(uid, group.id);
    }
  }
  if (vesselGroups.size !== activeVesselSet.size ||
      activeVesselIds.some((vesselId) => !vesselGroups.has(vesselId)) ||
      memberGroups.size !== activePlayerIds.size ||
      activePlayers.some((player) =>
        player.get('fleetGroupId') !== memberGroups.get(player.id))) {
    throw commandError(
      'failed-precondition',
      'The stored fleet-group authority is incomplete or mismatched; pursuit cannot advance.',
      'malformed-input',
    );
  }
}

function movementPursuitFleetGroups(
  activeVesselIds: readonly string[],
  groupSnapshots: { readonly docs?: readonly DocumentSnapshot[] },
  playerSnapshots: { readonly docs?: readonly DocumentSnapshot[] },
): readonly FleetGroupRecord[] {
  const groups = (groupSnapshots.docs ?? []).map((snapshot) => {
    const group = fleetGroupRecord(snapshot.data());
    if (!group || group.id !== snapshot.id) {
      throw commandError(
        'failed-precondition',
        'The stored fleet-group authority is malformed; movement cannot adjust pursuit.',
        'malformed-input',
      );
    }
    return group;
  });
  requireTurnPursuitMembership(activeVesselIds, groups, playerSnapshots.docs ?? []);
  return groups;
}

function requireMovementPursuitAuthority(
  storedNavigation: DocumentSnapshot,
  session: Pick<DocumentSnapshot, 'get'>,
): void {
  const rawNavigation = storedNavigation.exists &&
    typeof (storedNavigation as unknown as { data?: unknown }).data === 'function'
    ? storedNavigation.data()
    : undefined;
  const privatePursuitPresent = isRecord(rawNavigation) &&
    Object.prototype.hasOwnProperty.call(rawNavigation, 'pursuitGroups');
  const legacyPursuitPresent = session.get('pursuitGroups') !== undefined;
  const rawPursuitAuthority = privatePursuitPresent
    ? (rawNavigation as Record<string, unknown>).pursuitGroups
    : session.get('pursuitGroups');
  if ((!privatePursuitPresent && !legacyPursuitPresent) ||
      !isValidPursuitAuthority(rawPursuitAuthority)) {
    throw commandError(
      'failed-precondition',
      'Pursuit authority is missing or malformed; movement cannot adjust pursuit.',
      'malformed-input',
    );
  }
}

function movementPursuitNavigation(
  navigation: NavigationState,
  fleetGroups: readonly FleetGroupRecord[],
  shipId: string,
  destination: string,
  chart: 'A' | 'B' | 'C',
): NavigationState {
  try {
    return adjustPursuitForMovement(navigation, fleetGroups, shipId, destination, chart);
  } catch (cause) {
    throw commandError(
      'failed-precondition',
      cause instanceof Error ? cause.message : 'Movement could not adjust pursuit.',
      'malformed-input',
    );
  }
}

async function readTurnPursuitAuthority(
  tx: Transaction,
  sessionId: string,
  session: DocumentSnapshot,
): Promise<TurnPursuitAuthority | undefined> {
  const [storedNavigation, groups, players] = await Promise.all([
    tx.get(navigationStateRef(sessionId)),
    tx.get(db.collection(`sessions/${sessionId}/fleetGroups`)),
    tx.get(db.collection(`sessions/${sessionId}/players`)),
  ]);
  const rawNavigation = storedNavigation.exists &&
    typeof (storedNavigation as unknown as { data?: unknown }).data === 'function'
    ? storedNavigation.data()
    : undefined;
  const privatePursuitPresent = isRecord(rawNavigation) &&
    Object.prototype.hasOwnProperty.call(rawNavigation, 'pursuitGroups');
  const legacyHeaderPresent = session.get('pursuitGroups') !== undefined;
  const rawPursuitAuthority = privatePursuitPresent
    ? (rawNavigation as Record<string, unknown>).pursuitGroups
    : session.get('pursuitGroups');
  if ((privatePursuitPresent || legacyHeaderPresent) &&
      !isValidPursuitAuthority(rawPursuitAuthority)) {
    throw commandError(
      'failed-precondition',
      'Pursuit authority is malformed; the cycle cannot advance.',
      'malformed-input',
    );
  }
  const activeVesselIds = activeVesselIdsForSession(session);
  const navigation = navigationStateForSession(
    storedNavigation,
    session,
    activeVesselIds,
  );
  if (Object.keys(navigation.pursuitGroups).length === 0) {
    if (privatePursuitPresent || legacyHeaderPresent) {
      throw commandError(
        'failed-precondition',
        'Pursuit authority is malformed; the cycle cannot advance.',
        'malformed-input',
      );
    }
    // Sessions created before pursuit authority existed can continue without
    // inventing a score. Their trackers remain pending until migrated.
    return undefined;
  }
  const fleetGroups = groups.docs.map((snapshot) => {
    const group = fleetGroupRecord(snapshot.data());
    if (!group || group.id !== snapshot.id) {
      throw commandError(
        'failed-precondition',
        'The stored fleet-group authority is malformed; pursuit cannot advance.',
        'malformed-input',
      );
    }
    return group;
  });
  requireTurnPursuitMembership(activeVesselIds, fleetGroups, players.docs);
  const rawRevision = storedNavigation.get('revision');
  const navigationRevision = Number.isSafeInteger(rawRevision) && (rawRevision as number) >= 0
    ? rawRevision as number
    : 0;
  const chartId = session.get('chartId');
  return {
    navigation,
    navigationRevision,
    fleetGroups,
    players: players.docs,
    chart: chartId === 'B' || chartId === 'C' ? chartId : 'A',
    legacyHeaderPresent,
    legacyMigration: legacyHeaderPresent && !privatePursuitPresent,
  };
}

function writeTurnPursuitState(
  tx: Transaction,
  sessionId: string,
  authority: TurnPursuitAuthority | undefined,
  advance: boolean,
): { readonly navigation: NavigationState; readonly revision: number } | undefined {
  if (!authority) return undefined;
  let navigation = authority.navigation;
  try {
    if (advance) {
      navigation = advancePursuitForCycle(
        authority.navigation,
        authority.fleetGroups,
        authority.chart,
      );
    }
  } catch (cause) {
    throw commandError(
      'failed-precondition',
      cause instanceof Error ? cause.message : 'Pursuit cannot advance from malformed group authority.',
      'malformed-input',
    );
  }
  const revision = authority.navigationRevision + 1;
  const protectedNavigation = {
    ...navigationProjectionFields(navigation),
    revision,
    updatedAt: FieldValue.serverTimestamp(),
  };
  tx.set(
    navigationStateRef(sessionId),
    protectedNavigation,
    { mergeFields: Object.keys(protectedNavigation) },
  );
  publishDiscoveryProjections(
    tx,
    sessionId,
    authority.players,
    navigation,
    revision,
    authority.chart,
    authority.fleetGroups,
    true,
  );
  return { navigation, revision };
}

function removeLegacyNavigationField(): unknown {
  const deleteField = (FieldValue as unknown as { delete?: () => unknown }).delete;
  return typeof deleteField === 'function' ? deleteField() : null;
}

function activeFleetGroupMemberUids(players: readonly DocumentSnapshot[]): readonly string[] {
  const memberUids = players
    .filter((player) => player.exists && !isKickedPlayer(player))
    .map((player) => player.id)
    .filter((uid) => uid.length > 0);
  if (new Set(memberUids).size !== memberUids.length) {
    throw commandError(
      'failed-precondition',
      'The session contains duplicate player identities; fleet-group membership is unavailable.',
      'conflict',
    );
  }
  return memberUids;
}

/**
 * Reconcile the one initial group from authoritative session/player records.
 * This is migration-safe for legacy sessions while keeping all future split
 * mechanics outside this prompt.
 */
function ensureInitialFleetGroup(
  tx: Transaction,
  sessionId: string,
  activeVesselIds: readonly string[],
  memberUids: readonly string[],
  storedGroup: DocumentSnapshot,
  players: readonly DocumentSnapshot[] = [],
): FleetGroupRecord {
  if (new Set(memberUids).size !== memberUids.length || memberUids.some((uid) => uid.length === 0)) {
    throw commandError(
      'failed-precondition',
      'The session contains duplicate player identities; fleet-group membership is unavailable.',
      'conflict',
    );
  }
  const parsed = storedGroup.exists ? fleetGroupRecord(storedGroup.data()) : undefined;
  if (storedGroup.exists && !parsed) {
    throw commandError(
      'failed-precondition',
      'The stored fleet-group identity is malformed; refresh before continuing.',
      'malformed-input',
    );
  }
  if (parsed && parsed.id !== INITIAL_FLEET_GROUP_ID) {
    throw commandError(
      'failed-precondition',
      'The stored initial fleet-group identity is invalid; refresh before continuing.',
      'malformed-input',
    );
  }
  let group = parsed ?? initialFleetGroup(activeVesselIds, memberUids);
  if (parsed && JSON.stringify(parsed.vesselIds) !== JSON.stringify(activeVesselIds)) {
    group = withFleetGroupVessels(group, activeVesselIds);
  }
  if (JSON.stringify(group.memberUids) !== JSON.stringify(memberUids)) {
    group = { ...group, memberUids: [...memberUids] };
  }
  const changed = !storedGroup.exists || JSON.stringify(parsed) !== JSON.stringify(group);
  if (!storedGroup.exists) {
    tx.set(fleetGroupRef(sessionId), {
      ...group,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else if (changed) {
    tx.update(fleetGroupRef(sessionId), {
      id: group.id,
      vesselIds: [...group.vesselIds],
      memberUids: [...group.memberUids],
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  for (const player of players) {
    if (!player.exists || isKickedPlayer(player) || group.memberUids.includes(player.id) === false) continue;
    if (player.get('fleetGroupId') !== group.id) {
      tx.update(db.doc(`sessions/${sessionId}/players/${player.id}`), {
        fleetGroupId: group.id,
      });
    }
  }
  return group;
}

/** Publish only each member's own ship history into their group entitlement. */
function publishDiscoveryProjections(
  tx: Transaction,
  sessionId: string,
  players: readonly DocumentSnapshot[],
  navigation: NavigationState,
  revision: number,
  chart: 'A' | 'B' | 'C' = 'A',
  fleetGroups: readonly FleetGroupRecord[] = [],
  replaceProjectionMaps = false,
): void {
  const shipFleetGroupIds = Object.fromEntries(fleetGroups.flatMap((group) =>
    group.vesselIds.map((shipId) => [shipId, group.id])));
  const gmProjection = {
    ...navigationProjectionFields(navigation),
    knownSystems: allDiscoverySystems(),
    pursuitDistances: pursuitDistancesForCoordinates(navigation.shipGalacticCoordinates),
    organiserSites: organiserSitesForChart(chart),
    ...(Object.keys(shipFleetGroupIds).length > 0 ? { shipFleetGroupIds } : {}),
    revision,
    updatedAt: FieldValue.serverTimestamp(),
  };
  tx.set(
    gmDiscoveryProjectionRef(sessionId),
    gmProjection,
    replaceProjectionMaps ? { mergeFields: Object.keys(gmProjection) } : { merge: true },
  );
  for (const player of players) {
    if (!player.exists || isKickedPlayer(player) || typeof player.id !== 'string' || player.id.length === 0) continue;
    const groupId = player.get('fleetGroupId');
    // ensureInitialFleetGroup backfills legacy pointers in the same
    // transaction, but the snapshot read before that write is necessarily
    // stale. Use the canonical initial group for that migration snapshot so
    // every non-kicked member receives a projection in this commit.
    const effectiveGroupId = typeof groupId === 'string' && groupId.length > 0
      ? groupId : INITIAL_FLEET_GROUP_ID;
    const projectionPlayer = {
      get: (field: string) => field === 'fleetGroupId' ? effectiveGroupId : player.get(field),
    };
    writePlayerDiscoveryProjection(
      tx,
      playerDiscoveryProjectionRef(sessionId, player.id),
      projectionPlayer,
      navigation,
      revision,
    );
  }
}

function activeShipSurvivors(value: unknown, activeVesselIds: readonly string[]): Record<string, number> {
  const stored: Record<string, number> = {};
  if (isRecord(value)) {
    for (const [shipId, amount] of Object.entries(value)) {
      if (typeof amount === 'number') stored[shipId] = amount;
    }
  }
  return activeVesselRecord({ ...INITIAL_SHIP_SURVIVORS, ...stored }, activeVesselIds);
}

type StoredCommissarPurgeConsent = Readonly<{
  turn: number;
  captainUid: string;
  captainRoleId: string;
  vesselRevision: number;
}>;

type StoredCommissarPurgeLedger = Readonly<{
  turn: number;
  revision: number;
}>;

type StoredCommissarPurgeState = Readonly<{
  consents: Record<string, StoredCommissarPurgeConsent>;
  ledger: Record<string, StoredCommissarPurgeLedger>;
}>;

function commissarPurgeConsents(value: unknown): Record<string, StoredCommissarPurgeConsent> {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(Object.entries(stored).flatMap(([shipId, consent]) => {
    if (!isResourceShipId(shipId) || !isRecord(consent) ||
        !Number.isSafeInteger(consent.turn) || (consent.turn as number) < 1 ||
        typeof consent.captainUid !== 'string' || consent.captainUid.length === 0 ||
        typeof consent.captainRoleId !== 'string' || consent.captainRoleId.length === 0 ||
        !Number.isSafeInteger(consent.vesselRevision) || (consent.vesselRevision as number) < 0) return [];
    return [[shipId, {
      turn: consent.turn as number,
      captainUid: consent.captainUid,
      captainRoleId: consent.captainRoleId,
      vesselRevision: consent.vesselRevision as number,
    }]];
  }));
}

function commissarPurgeLedger(value: unknown): Record<string, StoredCommissarPurgeLedger> {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(Object.entries(stored).flatMap(([shipId, entry]) => {
    if (!isResourceShipId(shipId) || !isRecord(entry) ||
        !Number.isSafeInteger(entry.turn) || (entry.turn as number) < 1 ||
        !Number.isSafeInteger(entry.revision) || (entry.revision as number) < 0) return [];
    return [[shipId, { turn: entry.turn as number, revision: entry.revision as number }]];
  }));
}

function commissarPurgeState(value: unknown): StoredCommissarPurgeState {
  const stored = isRecord(value) ? value : {};
  return {
    consents: commissarPurgeConsents(stored.consents),
    ledger: commissarPurgeLedger(stored.ledger),
  };
}

function publicSmallShipStates(
  value: unknown,
  activeVesselIds: readonly string[],
): Record<string, SmallShipState> {
  const stored = isRecord(value) ? value : {};
  const activeHosts = new Set(activeVesselIds.filter(isResourceShipId));
  return Object.fromEntries(SMALL_SHIP_IDS.flatMap((smallShipId) => {
    const state = parseSmallShipState(stored[smallShipId], smallShipId);
    if (!state || (state.hostShipId !== null && !activeHosts.has(state.hostShipId))) return [];
    return [[smallShipId, state]];
  }));
}

function publicVoyage33Admission(value: unknown, sessionId: string): Voyage33Admission | undefined {
  return parseVoyage33Admission(value, sessionId);
}

function publicVoyage33Maintenance(
  value: unknown,
  admission: Voyage33Admission | undefined,
  activeVesselIds: readonly string[],
): Voyage33MaintenanceState | undefined {
  if (!admission) return undefined;
  const state = parseVoyage33MaintenanceState(value);
  if (!state) return undefined;
  if (state.hostShipId !== null && !activeVesselIds.includes(state.hostShipId)) return undefined;
  return state;
}

function reconcileActiveVesselMap<T>(
  stored: unknown,
  currentActiveVesselIds: readonly string[],
  nextActiveVesselIds: readonly string[],
  normalize: (value: unknown) => Readonly<Record<string, T>>,
  defaults: Readonly<Record<string, T>>,
): Record<string, T> {
  const current = activeVesselRecord(normalize(stored), currentActiveVesselIds);
  const seeded = activeVesselRecord(defaults, nextActiveVesselIds);
  return Object.fromEntries(nextActiveVesselIds.map((shipId) => [
    shipId,
    Object.prototype.hasOwnProperty.call(current, shipId) ? current[shipId]! : seeded[shipId]!,
  ]));
}

function shipGalacticCoordinates(value: unknown): Record<string, string> {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_GALACTIC_COORDINATES).map((shipId) => [
    shipId,
    typeof stored[shipId] === 'string' ? stored[shipId] : INITIAL_SHIP_GALACTIC_COORDINATES[shipId as keyof typeof INITIAL_SHIP_GALACTIC_COORDINATES] ?? '0000',
  ]));
}

function shipConsoleLocks(value: unknown): Record<string, boolean> {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_CONSOLE_LOCKS).map((shipId) => [
    shipId,
    stored[shipId] === true,
  ]));
}

function shipJumpStates(value: unknown): Record<string, JumpDriveState> {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_JUMP_STATES).map((shipId) => {
    const raw = stored[shipId];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [shipId, {}];
    const state = raw as Record<string, unknown>;
    return [shipId, {
      ...(typeof state.lastJumpTurn === 'number' && Number.isSafeInteger(state.lastJumpTurn) && state.lastJumpTurn >= 1
        ? { lastJumpTurn: state.lastJumpTurn }
        : {}),
      ...(typeof state.integrityLockedUntil === 'string'
        ? { integrityLockedUntil: state.integrityLockedUntil }
        : {}),
    }];
  }));
}

function shipJumpTransitions(value: unknown): Record<string, JumpTransition> {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_JUMP_TRANSITIONS).flatMap((shipId) => {
    const raw = isRecord(stored[shipId]) ? stored[shipId] : undefined;
    if (!raw || typeof raw.id !== 'string' || raw.shipId !== shipId ||
        typeof raw.origin !== 'string' || typeof raw.destination !== 'string' ||
        typeof raw.occurredAt !== 'string') return [];
    return [[shipId, {
      id: raw.id, shipId, origin: raw.origin, destination: raw.destination, occurredAt: raw.occurredAt,
    }]];
  }));
}

function shipNavigationLogs(value: unknown): NavigationLogs {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_NAVIGATION_LOGS).map((shipId) => [
    shipId,
    Array.isArray(stored[shipId])
      ? stored[shipId].flatMap((value) => {
        const raw = isRecord(value) ? value : undefined;
        if (!raw || raw.shipId !== shipId || typeof raw.id !== 'string' ||
            !['self-jump', 'ship-jump-away', 'ship-jump-arrival'].includes(String(raw.type)) ||
            typeof raw.origin !== 'string' || typeof raw.destination !== 'string' ||
            typeof raw.occurredAt !== 'string' || typeof raw.stardate !== 'string') return [];
        return [{
          id: raw.id, shipId, type: raw.type as NavigationLogEntry['type'],
          origin: raw.origin, destination: raw.destination,
          ...(typeof raw.subjectShipId === 'string' ? { subjectShipId: raw.subjectShipId } : {}),
          ...(typeof raw.subjectShipName === 'string' ? { subjectShipName: raw.subjectShipName } : {}),
          ...(typeof raw.navigationalError === 'boolean' ? { navigationalError: raw.navigationalError } : {}),
          occurredAt: raw.occurredAt, stardate: raw.stardate,
        } satisfies NavigationLogEntry];
      }) : [],
  ]));
}

function publicMaintenanceCycles(value: unknown, activeVesselIds: readonly string[]): Record<string, MaintenanceCycle> {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(activeVesselIds.flatMap((shipId) => {
    const cycle = parseMaintenanceCycle(stored[shipId]);
    return cycle ? [[shipId, cycle]] : [];
  }));
}

function publicShuttleCargo(
  value: unknown,
  activeRoleIds: readonly string[],
): Record<string, Record<string, number>> {
  return sanitizeShuttleCargo(value, activeRoleIds);
}

function publicShuttleFuelled(value: unknown): Record<string, boolean> {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(Object.entries(stored).flatMap(([shuttleId, fuelled]) =>
    AUTHORIZED_SHUTTLE_IDS.has(shuttleId) && typeof fuelled === 'boolean' ? [[shuttleId, fuelled]] : []));
}

type PublicShuttleDocking = Readonly<{
  shuttleId: string;
  shipId: string;
  dockedAt: string;
}>;

type PublicShuttleVisit = Readonly<{
  id: string;
  shuttleId: string;
  shipId: string;
  action: 'docked' | 'departed';
  occurredAt: string;
}>;

function publicShuttleDockings(
  value: unknown,
  activeVesselIds: readonly string[],
  activeRoleIds: readonly string[],
): readonly PublicShuttleDocking[] {
  const source = Array.isArray(value) ? value : initialShuttleDockingsForRoles(activeRoleIds);
  const active = new Set(activeVesselIds);
  return source.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.shuttleId !== 'string' ||
        !AUTHORIZED_SHUTTLE_IDS.has(entry.shuttleId) ||
        typeof entry.shipId !== 'string' || typeof entry.dockedAt !== 'string' ||
        !active.has(entry.shipId)) return [];
    return [{ shuttleId: entry.shuttleId, shipId: entry.shipId, dockedAt: entry.dockedAt }];
  });
}

type WolfAttackParkingSnapshot = Readonly<{
  parkedCraftIds: readonly string[];
  battleTableCraftActions: readonly BattleTableCraftActionRegistration[];
  parkedShuttleDockings: readonly PublicShuttleDocking[];
}>;

/**
 * A declaration may snapshot the current parking arrangement only when every
 * represented craft is already in a server-known location. Projection helpers
 * intentionally drop malformed rows for player reads; declaration authority
 * must reject those rows instead of silently treating them as parked.
 */
function requireWolfAttackParking(
  session: DocumentSnapshot,
  activeVesselIds: readonly string[],
  activeRoleIds: readonly string[],
): WolfAttackParkingSnapshot {
  const initialDockings = initialShuttleDockingsForRoles(activeRoleIds);
  const storedDockings = session.get('shuttleDockings');
  const dockingIds = new Set(
    Array.isArray(storedDockings)
      ? storedDockings.flatMap((entry) =>
        isRecord(entry) && typeof entry.shuttleId === 'string' ? [entry.shuttleId] : [])
      : initialDockings.map((docking) => docking.shuttleId),
  );
  const ownedCraft = roleOwnedCraftForRoles(activeRoleIds)
    .filter((craft) => craft.enabledMode === 'standard' || dockingIds.has(craft.id));
  const expectedShuttles = ownedCraft.filter((craft) => craft.kind === 'shuttle');
  // The locked vessel roster represents every shuttle initially docked with
  // an active ship, while the role catalog adds optional Union craft that need
  // an explicit authoritative docking before declaration.
  const expectedShuttleIds = new Set([
    ...initialDockings.map((docking) => docking.shuttleId),
    ...expectedShuttles.map((craft) => craft.id),
  ]);
  const source = storedDockings === undefined
    ? initialDockings
    : storedDockings;
  if (!Array.isArray(source)) {
    throw commandError(
      'failed-precondition',
      'The Wolf attack cannot be declared while craft parking is incomplete.',
      'conflict',
    );
  }
  if (!shuttleDockingsAreParked(source, activeVesselIds)) {
    throw commandError(
      'failed-precondition',
      'The Wolf attack cannot be declared while craft parking is incomplete.',
      'conflict',
    );
  }

  const activeHosts = new Set(activeVesselIds);
  const seen = new Set<string>();
  const parkedShuttleDockings: PublicShuttleDocking[] = [];
  for (const entry of source) {
    if (!isRecord(entry) || typeof entry.shuttleId !== 'string' ||
        !expectedShuttleIds.has(entry.shuttleId) || seen.has(entry.shuttleId) ||
        typeof entry.shipId !== 'string' || !activeHosts.has(entry.shipId) ||
        typeof entry.dockedAt !== 'string' || entry.dockedAt.trim().length === 0 ||
        entry.inTransit === true || entry.transit === true ||
        entry.status === 'in-transit' || entry.state === 'in-transit' ||
        entry.dockingState === 'in-transit') {
      throw commandError(
        'failed-precondition',
        'The Wolf attack cannot be declared while craft parking is incomplete.',
        'conflict',
      );
    }
    seen.add(entry.shuttleId);
    parkedShuttleDockings.push({
      shuttleId: entry.shuttleId,
      shipId: entry.shipId,
      dockedAt: entry.dockedAt,
    });
  }
  if (seen.size !== expectedShuttleIds.size ||
      [...expectedShuttleIds].some((shuttleId) => !seen.has(shuttleId))) {
    throw commandError(
      'failed-precondition',
      'The Wolf attack cannot be declared while craft parking is incomplete.',
      'conflict',
    );
  }

  const rawVisitLog = session.get('shuttleVisitLog');
  if (rawVisitLog !== undefined) {
    if (!Array.isArray(rawVisitLog)) {
      throw commandError(
        'failed-precondition',
        'The Wolf attack cannot be declared while craft parking is incomplete.',
        'conflict',
      );
    }
    const latestVisit = new Map<string, 'docked' | 'departed'>();
    for (const entry of rawVisitLog) {
      if (!isRecord(entry) || typeof entry.shuttleId !== 'string' ||
          !expectedShuttleIds.has(entry.shuttleId) ||
          (entry.action !== 'docked' && entry.action !== 'departed')) {
        throw commandError(
          'failed-precondition',
          'The Wolf attack cannot be declared while craft parking is incomplete.',
          'conflict',
        );
      }
      latestVisit.set(entry.shuttleId, entry.action);
    }
    if ([...latestVisit.values()].some((action) => action === 'departed')) {
      throw commandError(
        'failed-precondition',
        'The Wolf attack cannot be declared while craft parking is incomplete.',
        'conflict',
      );
    }
  }

  const fighterWings = ownedCraft.filter((craft) => craft.kind === 'fighter-wing');
  const rawWingCounts = session.get('fighterWingCounts');
  if (fighterWings.length > 0) {
    const parsedWingCounts = fighterWingCounts(rawWingCounts);
    if (rawWingCounts === undefined || fighterWings.some((craft) => {
      const wing = parsedWingCounts[craft.id as FighterWingId] as FighterWingCountState | undefined;
      return wing === undefined;
    })) {
      throw commandError(
        'failed-precondition',
        'The Wolf attack cannot be declared while fighter-wing bay state is incomplete.',
        'conflict',
      );
    }
  }

  const parkedCraftIds = ownedCraft.map((craft) => craft.id);
  return {
    parkedCraftIds,
    battleTableCraftActions: battleTableCraftActionsForParkedCraft(parkedCraftIds),
    parkedShuttleDockings,
  };
}

function publicShuttleVisitLog(
  value: unknown,
  dockings: readonly PublicShuttleDocking[],
  activeVesselIds: readonly string[],
): readonly PublicShuttleVisit[] {
  if (!Array.isArray(value)) return initialShuttleVisitsForDockings(dockings);
  const visibleShuttles = new Set(dockings.map((docking) => docking.shuttleId));
  const activeVessels = new Set(activeVesselIds);
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.shuttleId !== 'string' ||
        typeof entry.shipId !== 'string' ||
        (entry.action !== 'docked' && entry.action !== 'departed') ||
        typeof entry.occurredAt !== 'string' || !visibleShuttles.has(entry.shuttleId) ||
        !activeVessels.has(entry.shipId)) return [];
    return [{
      id: entry.id,
      shuttleId: entry.shuttleId,
      shipId: entry.shipId,
      action: entry.action,
      occurredAt: entry.occurredAt,
    }];
  });
}

function publicConfettiUsedShipIds(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((shipId): shipId is string => typeof shipId === 'string' && isFleetShipId(shipId))
    : [];
}

function publicShipUpgrades(value: unknown, activeVesselIds: readonly string[]): Record<string, readonly string[]> {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(activeVesselIds.flatMap((shipId) =>
    Array.isArray(stored[shipId])
      ? [[shipId, stored[shipId].filter((upgrade): upgrade is string => typeof upgrade === 'string')]]
      : []));
}

function publicFighterWingCounts(value: unknown): ReturnType<typeof fighterWingCounts> | undefined {
  return value === undefined ? undefined : fighterWingCounts(value);
}

function publicAlertMap<T extends { shipId: string; shipName: string; targetGmInstanceIds: readonly string[]; createdAt: string }>(
  value: unknown,
  activeVesselIds: readonly string[],
  population: boolean,
): Record<string, T> {
  const stored = isRecord(value) ? value : {};
  const active = new Set(activeVesselIds);
  return Object.fromEntries(Object.entries(stored).flatMap(([shipId, alert]) => {
    if (!active.has(shipId) || !isRecord(alert) || alert.shipId !== shipId ||
        typeof alert.shipName !== 'string' || !Array.isArray(alert.targetGmInstanceIds) ||
        alert.targetGmInstanceIds.some((id) => typeof id !== 'string') ||
        typeof alert.createdAt !== 'string' || (population && typeof alert.population !== 'number')) return [];
    return [[shipId, {
      shipId,
      shipName: alert.shipName,
      targetGmInstanceIds: [...alert.targetGmInstanceIds] as string[],
      createdAt: alert.createdAt,
      ...(population ? { population: alert.population as number } : {}),
    } as unknown as T]];
  }));
}

function isConnectedPlayer(player: DocumentSnapshot): boolean {
  return player.exists && player.get('connected') === true && !player.get('kickedAt');
}

function isKickedPlayer(player: DocumentSnapshot): boolean {
  return player.exists && player.get('kickedAt') !== undefined && player.get('kickedAt') !== null;
}

function isActivePlayer(player: DocumentSnapshot): boolean {
  if (!isConnectedPlayer(player)) return false;
  const lastSeenAt = player.get('lastSeenAt');
  // All current player records carry this timestamp. Keeping old records
  // without it usable avoids evicting a legacy table during migration.
  if (lastSeenAt === undefined) return true;
  return lastSeenAt instanceof Timestamp &&
    !isPresenceStale(lastSeenAt.toDate(), new Date());
}

/**
 * A reconnect gets a new identity generation so an older queued disconnect
 * cannot clean up the membership created by that reconnect. Legacy player
 * documents without a generation start at one when they next join.
 */
function nextConnectionGeneration(player: DocumentSnapshot): number {
  const current = player.get('connectionGeneration');
  if (current === undefined) return 1;
  if (!Number.isSafeInteger(current) || (current as number) < 1 ||
      current === Number.MAX_SAFE_INTEGER) {
    // Never wrap or reuse a generation that could still be present in an old
    // queued cleanup. Malformed legacy state remains safely non-reconnectable.
    throw new HttpsError('failed-precondition', 'This session connection identity is invalid. Refresh before reconnecting.');
  }
  return (current as number) + 1;
}

function playerEscapeState(player: Pick<DocumentSnapshot, 'get'>): PlayerEscapeState | undefined {
  const raw = player.get('escapeState');
  const parsed = parsePlayerEscapeState(raw);
  if (raw !== undefined && raw !== null && !parsed) {
    throw commandError(
      'failed-precondition',
      'This player escape state is malformed; refresh the live session before trying again.',
      'malformed-input',
    );
  }
  return parsed;
}

/** Player ship actions are revoked by the authoritative escape transition. */
function requirePlayerShipActionAuthority(player: DocumentSnapshot): void {
  if (player.get('role') !== 'player') return;
  if (playerEscapeState(player)) {
    throw commandError(
      'failed-precondition',
      'Flee the destroyed ship before taking another ship action.',
      'conflict',
    );
  }
}

function isCanonicalAndroidPayload(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const allowedKeys = new Set(['type', 'kind', 'suspicion', 'proofRevealed']);
  return Object.keys(payload).every((key) => allowedKeys.has(key)) &&
    payload.type === 'loyalty' &&
    payload.kind === 'android' &&
    payload.suspicion === null &&
    (payload.proofRevealed === undefined || payload.proofRevealed === true);
}

/** A GM browser owns its own lease; legacy records use their immutable claim time. */
function gmInstanceLeaseTimestamp(instance: Pick<DocumentSnapshot, 'get'>): string | number | Date | null | undefined {
  // An absent timestamp is an old, unverifiable claim. The empty sentinel is
  // intentional: isLiveSetupGm treats undefined as a legacy-live value, so a
  // malformed/missing lease must reach its invalid-timestamp path instead.
  const value = instance.get('lastSeenAt') ?? instance.get('claimedAt');
  return (value === undefined ? '' : value) as string | number | Date | null | undefined;
}

/** Return only GM browser claims that can currently carry facilitator authority. */
function liveGmInstanceDocs(
  instances: readonly DocumentSnapshot[],
  players: readonly DocumentSnapshot[],
): readonly DocumentSnapshot[] {
  const playersByUid = new Map(players.flatMap((player) => {
    const uid = player.id || player.get('uid');
    return typeof uid === 'string' ? [[uid, player] as const] : [];
  }));
  return instances.filter((instance) => {
    const uid = instance.get('uid');
    if (typeof uid !== 'string') return false;
    const owner = playersByUid.get(uid);
    if (!owner || !isActivePlayer(owner) || owner.get('role') !== 'gm') return false;
    return isLiveSetupGm({
      id: instance.id,
      uid,
      connected: instance.get('connected') !== false,
      lastSeenAt: gmInstanceLeaseTimestamp(instance),
    });
  });
}

function isLiveGmInstance(
  instance: DocumentSnapshot,
  player: DocumentSnapshot,
  uid: string,
): boolean {
  if (!instance.exists || instance.get('uid') !== uid ||
      !isActivePlayer(player) || player.get('role') !== 'gm') return false;
  return isLiveSetupGm({
    id: typeof instance.id === 'string' ? instance.id : '',
    uid,
    connected: instance.get('connected') !== false,
    lastSeenAt: gmInstanceLeaseTimestamp(instance),
  });
}

function hasCoreAssignment(player: DocumentSnapshot): boolean {
  const assignedRoleId = player.get('assignedRoleId');
  return typeof assignedRoleId === 'string' && assignedRoleId.trim().length > 0 &&
    assignedRoleId !== 'press-officer';
}

function hasCoreSeat(player: DocumentSnapshot): boolean {
  const seatId = player.get('seatId');
  return typeof seatId === 'string' && seatId.trim().length > 0 && seatId !== 'press-officer';
}

function hasPressSeat(player: DocumentSnapshot): boolean {
  return player.get('seatId') === 'press-officer';
}

function isAuthoritativePressHolder(player: DocumentSnapshot): boolean {
  return isActivePlayer(player) && player.get('role') === 'player' &&
    player.get('activeConsoleRoleId') === 'press-officer' && !hasCoreAssignment(player);
}

function hasPressState(player: DocumentSnapshot): boolean {
  return player.get('activeConsoleRoleId') === 'press-officer' ||
    player.get('assignedRoleId') === 'press-officer';
}

function releasedPressFields(player: DocumentSnapshot): Record<string, unknown> {
  return {
    activeConsoleRoleId: null,
    ...(player.get('assignedRoleId') === 'press-officer' ? { assignedRoleId: null } : {}),
  };
}

function removePressWolfRole(
  tx: Transaction,
  wolfSecretRef: DocumentReference,
  wolfSecret: DocumentSnapshot,
): void {
  const payload = wolfSecret.get('payload');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const roleIds = (payload as { roleIds?: unknown }).roleIds;
  if (!Array.isArray(roleIds) || !roleIds.includes('press-officer')) return;
  const remainingRoleIds = roleIds.filter((roleId) => roleId !== 'press-officer');
  if (remainingRoleIds.length === 0) tx.delete(wolfSecretRef);
  else {
    tx.update(wolfSecretRef, {
      payload: { ...(payload as Record<string, unknown>), roleIds: remainingRoleIds },
    });
  }
}

function clearPressPrivateState(
  tx: Transaction,
  sessionId: string,
  player: DocumentSnapshot,
  wolfSecretRef: DocumentReference,
  wolfSecret: DocumentSnapshot,
  removeWolfRole: boolean,
): boolean {
  const removedLoyalty = !hasCoreAssignment(player);
  if (!hasCoreAssignment(player)) {
    tx.delete(db.doc(`sessions/${sessionId}/secrets/loyalty-${player.id}`));
  }
  if (removeWolfRole) removePressWolfRole(tx, wolfSecretRef, wolfSecret);
  return removedLoyalty;
}

type ReturningSeat = Readonly<{
  seatId: string | null;
  clearPointer: boolean;
  claimSeat: boolean;
}>;

/**
 * A presence lease expires a device, not the player's membership. A returning
 * player reclaims a recorded seat if it is still open, and loses only that
 * pointer if someone else has since taken it.
 */
async function reconcileReturningSeat(
  tx: Transaction,
  sessionId: string,
  uid: string,
  player: DocumentSnapshot,
  canonicalSeatIds: readonly string[],
): Promise<ReturningSeat> {
  const storedSeatId = player.get('seatId');
  if (storedSeatId === null || storedSeatId === undefined) {
    return { seatId: null, clearPointer: false, claimSeat: false };
  }
  if (typeof storedSeatId !== 'string' || storedSeatId.length === 0) {
    return { seatId: null, clearPointer: true, claimSeat: false };
  }

  const seatRef = db.doc('sessions/' + sessionId + '/seats/' + storedSeatId);
  const seat = await tx.get(seatRef);
  if (playerEscapeState(player)) {
    // A pending/fled player may retain the historical seat pointer while the
    // facilitator adjudicates the escape, but reconnect must never reclaim an
    // open seat or turn that pointer back into console authority.
    if (seat.exists && seat.get('status') === 'claimed' && seat.get('holderUid') === uid) {
      return { seatId: storedSeatId, clearPointer: false, claimSeat: false };
    }
    return { seatId: null, clearPointer: true, claimSeat: false };
  }
  if (!seat.exists && canonicalSeatIds.includes(storedSeatId)) {
    // Canonical setup hydration may be repairing this role-keyed seat in the
    // same transaction. Preserve a validated pointer and apply its claim only
    // after hydration has materialized the missing document.
    return { seatId: storedSeatId, clearPointer: false, claimSeat: true };
  }
  if (
    seat.exists &&
    seat.get('status') === 'claimed' &&
    seat.get('holderUid') === uid
  ) {
    return { seatId: storedSeatId, clearPointer: false, claimSeat: false };
  }
  if (seat.exists && seat.get('status') === 'open') {
    // Defer this write until the caller has completed every transaction read.
    // Firestore rejects a read after any write in the same transaction, and
    // resumeSession still needs to hydrate the canonical setup after this
    // seat check.
    return { seatId: storedSeatId, clearPointer: false, claimSeat: true };
  }
  return { seatId: null, clearPointer: true, claimSeat: false };
}

function sessionTurn(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 1;
}

function pressAvailabilityRevision(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

type TurnStartAnnouncement = {
  readonly turn: number;
  readonly survivorPopulation: number;
  readonly revision?: number;
};

function turnStartAnnouncement(value: unknown): TurnStartAnnouncement | undefined {
  if (
    typeof value !== 'object' || value === null || Array.isArray(value) ||
    !('turn' in value) || !('survivorPopulation' in value) ||
    typeof value.turn !== 'number' || !Number.isSafeInteger(value.turn) || value.turn < 1 ||
    typeof value.survivorPopulation !== 'number' ||
    !Number.isSafeInteger(value.survivorPopulation) || value.survivorPopulation < 0
  ) return undefined;
  if ('revision' in value && value.revision !== undefined) {
    if (
      typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0
    ) return undefined;
    return {
      turn: value.turn,
      survivorPopulation: value.survivorPopulation,
      revision: value.revision,
    };
  }
  return {
    turn: value.turn,
    survivorPopulation: value.survivorPopulation,
  };
}

type DebriefMode = { readonly active: boolean; readonly revision: number };

function debriefModeState(value: unknown): DebriefMode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { active: false, revision: 0 };
  }
  const state = value as Readonly<Record<string, unknown>>;
  if (
    typeof state.active !== 'boolean' ||
    typeof state.revision !== 'number' || !Number.isSafeInteger(state.revision) ||
    state.revision < 0
  ) return { active: false, revision: 0 };
  return { active: state.active, revision: state.revision };
}

function fleetShipSurvivorPopulation(session: DocumentSnapshot): number {
  const rawSurvivors = session.get('shipSurvivors');
  const survivors = typeof rawSurvivors === 'object' && rawSurvivors !== null &&
    !Array.isArray(rawSurvivors)
    ? rawSurvivors as Readonly<Record<string, unknown>>
    : {};
  return Object.entries(INITIAL_SHIP_SURVIVORS).reduce((population, [shipId, initial]) => {
    if (
      (shipId === 'capybara' && session.get('capybaraEnabled') === false) ||
      (shipId === 'dione' && session.get('dioneEnabled') === false)
    ) return population;
    const stored = survivors[shipId];
    return population + (
      typeof stored === 'number' && Number.isSafeInteger(stored) && stored >= 0
        ? stored
        : initial
    );
  }, 0);
}

function fleetSurvivorPopulation(session: DocumentSnapshot): number {
  const adjustment = session.get('fleetSurvivorPopulationAdjustment');
  const basePopulation = fleetShipSurvivorPopulation(session);
  const adjustedPopulation = basePopulation + (
    typeof adjustment === 'number' && Number.isSafeInteger(adjustment) ? adjustment : 0
  );
  return Number.isSafeInteger(adjustedPopulation) ? Math.max(0, adjustedPopulation) : basePopulation;
}

function requireTurnOneForGameplay(session: DocumentSnapshot): void {
  if (sessionTurn(session.get('currentTurn')) === 0) {
    throw commandError(
      'failed-precondition',
      'Cycle 0 is for setup. Wait for the GM to advance to Cycle 1.',
      'invalid-phase',
    );
  }
}

function requireLiveAirspaceWindow(phase: ActiveTurnPhase): void {
  if (phase.airspace.state === 'restricted' && Date.now() >= Date.parse(phase.openAirspaceEndsAt)) {
    throw commandError(
      'failed-precondition',
      'The airspace window has closed. Wait for the next cycle.',
      'invalid-phase',
    );
  }
}

/**
 * Enforce the shared Team/Coordination policy when a session has a phase
 * clock. Legacy sessions predate that field and retain their existing
 * callable behavior until the next authoritative turn transition supplies it.
 */
function requireActiveGameplayPhase(session: DocumentSnapshot): void {
  const lifecyclePhase = session.get('phase');
  if (lifecyclePhase === 'closed' || lifecyclePhase === 'retained-empty') {
    throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
  }
  if (lifecyclePhase === 'debrief' || lifecyclePhase === 'success' || lifecyclePhase === 'failure') {
    throw commandError(
      'failed-precondition',
      'Gameplay actions are unavailable during endgame evaluation.',
      'invalid-phase',
    );
  }
}

function requireActionPhase(
  session: DocumentSnapshot,
  action: ActionId,
  actorScope: ActorScope,
): void {
  requireActiveGameplayPhase(session);
  if (session.get('turnPhase') === undefined) return;
  const decision = decideActionAuthorization({
    action,
    actorScope,
    turnPhase: session.get('turnPhase'),
  });
  if (decision.allowed) return;
  if (decision.reason === 'unknown-phase') {
    throw commandError('failed-precondition', 'No current server phase is available.', 'invalid-phase');
  }
  const label = ACTION_METADATA[action].requiredPhase === 'team' ? 'Team' : 'Coordination';
  throw commandError(
    'failed-precondition',
    `${action} is only available during ${label} Phase.`,
    'invalid-phase',
  );
}

type TurnAdvanceResult = {
  readonly currentTurn: number;
  readonly phase?: 'debrief' | 'failure';
  readonly gameOutcome?: PursuitFailureOutcome;
  readonly turnState?: ActiveTurnState;
  readonly turnStartAnnouncement?: TurnStartAnnouncement;
  readonly turnPhase?: ReturnType<typeof startTurnPhase>;
  readonly maintenanceCycles?: Record<string, MaintenanceCycle>;
  readonly shuttleFuelled?: Record<string, boolean>;
};

type PursuitFailureOutcome = {
  readonly type: 'game-outcome';
  readonly result: 'failure';
  readonly cause: 'pursuit-limit';
  readonly cycle: number;
  readonly navigationRevision: number;
  readonly occurredAt: string;
};

function isPursuitFailureOutcome(value: unknown): value is PursuitFailureOutcome {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const outcome = value as Record<string, unknown>;
  return outcome.type === 'game-outcome' && outcome.result === 'failure' &&
    outcome.cause === 'pursuit-limit' && Number.isSafeInteger(outcome.cycle) &&
    (outcome.cycle as number) >= 1 && Number.isSafeInteger(outcome.navigationRevision) &&
    (outcome.navigationRevision as number) >= 1 && typeof outcome.occurredAt === 'string';
}

function isTurnAdvanceResult(value: unknown): value is TurnAdvanceResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!Number.isSafeInteger(result.currentTurn) || (result.currentTurn as number) < 0) return false;
  if (result.phase === 'debrief') return result.turnPhase === undefined;
  if (result.phase === 'failure') {
    return result.turnPhase === undefined && isPursuitFailureOutcome(result.gameOutcome);
  }
  return result.phase === undefined && turnPhaseState(result.turnPhase) !== undefined;
}

function sessionTurnLimit(session: DocumentSnapshot): 6 | 7 | 8 | undefined {
  const direct = session.get('turnLimit');
  if (direct === 6 || direct === 7 || direct === 8) return direct;
  const setup = session.get('setup');
  if (typeof setup === 'object' && setup !== null && !Array.isArray(setup)) {
    const nested = (setup as Record<string, unknown>).turnLimit;
    if (nested === 6 || nested === 7 || nested === 8) return nested;
  }
  // `normalizeSessionConfiguration` already gives legacy empty sessions the
  // printed six-turn default; keep this entity projection aligned with that
  // existing compatibility behavior.
  return 6;
}

function nextTurnState(
  session: DocumentSnapshot,
  phase: ActiveTurnPhase,
  startedAt: string,
): ActiveTurnState | undefined {
  const maxTurn = sessionTurnLimit(session);
  if (!maxTurn) return undefined;
  const current = turnStateForPhaseContext(
    session.get('turnState'),
    turnPhaseState(session.get('turnPhase')),
    sessionTurn(session.get('currentTurn')),
    maxTurn,
  );
  const phaseRevision = current && current.currentTurn < phase.turn
    ? current.phaseRevision + 1
    : 1;
  return turnStateForPhase(phase, maxTurn, phaseRevision, startedAt);
}

function sessionTurnState(
  session: DocumentSnapshot,
  phase: ActiveTurnPhase | undefined,
): ActiveTurnState | undefined {
  return turnStateForPhaseContext(
    session.get('turnState'),
    phase,
    sessionTurn(session.get('currentTurn')),
    sessionTurnLimit(session),
  );
}

function updatedTurnState(
  session: DocumentSnapshot,
  phase: ActiveTurnPhase,
): ActiveTurnState | undefined {
  const current = turnStateForPhaseContext(
    session.get('turnState'),
    turnPhaseState(session.get('turnPhase')),
    sessionTurn(session.get('currentTurn')),
    sessionTurnLimit(session),
  );
  if (!current || current.currentTurn !== phase.turn) return undefined;
  return updateTurnStateForPhase(phase, current);
}

/** Backfill a missing entity only at a real Team-to-Coordination boundary. */
function phaseTransitionTurnState(
  session: DocumentSnapshot,
  phase: ActiveTurnPhase,
): ActiveTurnState | undefined {
  const current = updatedTurnState(session, phase);
  if (current) return current;
  const previous = turnStateForPhaseContext(
    session.get('turnState'),
    turnPhaseState(session.get('turnPhase')),
    sessionTurn(session.get('currentTurn')),
    sessionTurnLimit(session),
  );
  if (previous && previous.currentTurn === phase.turn) {
    return updateTurnStateForPhase(phase, previous);
  }
  const maxTurn = sessionTurnLimit(session);
  if (!maxTurn || phase.airspace.state !== 'lifted') return undefined;
  return turnStateForPhase(phase, maxTurn, 2, phase.teamPhaseEndsAt);
}

function advanceTurnInTransaction(
  tx: Transaction,
  sessionRef: DocumentReference,
  sessionId: string,
  session: DocumentSnapshot,
  skipTurnStartAnnouncement: boolean,
  additionalFields: Record<string, unknown> = {},
  transition?: TurnAdvanceEvent,
  pursuitAuthority?: TurnPursuitAuthority,
): TurnAdvanceResult {
  const currentTurn = sessionTurn(session.get('currentTurn'));
  if (currentTurn >= 1) requireSmallShipsDockedAtBoundary(session, 'Team');
  const nextTurn = currentTurn + 1;
  const maxTurn = sessionTurnLimit(session);
  const currentFleetPopulation = fleetSurvivorPopulation(session);
  const announcementPopulation = currentFleetPopulation % 10 === 0 || currentFleetPopulation % 10 === 5
    ? currentFleetPopulation + 42
    : currentFleetPopulation;
  const nextFleetPopulation = Math.max(0, announcementPopulation - 1);
  const announcement = {
    turn: nextTurn,
    survivorPopulation: announcementPopulation,
  };
  const turnPhase = startTurnPhase(nextTurn);
  const tickerTime = transition?.transitionServerTime ?? new Date().toISOString();
  const fleetTicker = maxTurn !== undefined && currentTurn >= maxTurn
    ? publishFleetTicker(sessionId, fleetTickerForMutation(sessionId, session, tickerTime), {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.debrief,
      text: FLEET_TICKER_COPY.finale, tone: 'normal', gap: 'long',
      sourceId: 'debrief:1',
    }, tickerTime)
    : publishFleetTicker(sessionId, fleetTickerForMutation(sessionId, session, tickerTime), {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace, passCount: 1,
      text: FLEET_TICKER_COPY.airspaceClosed, tone: 'normal', gap: 'long',
      sourceId: `airspace:${nextTurn}:restricted`,
    }, tickerTime);
  const turnState = nextTurnState(session, turnPhase, new Date().toISOString());
  const expiredTurnResources = currentTurn >= 1
    ? expireTurnScopedResources(
      (session.get('maintenanceCycles') ?? {}) as Record<string, MaintenanceCycle>,
      (session.get('shuttleFuelled') ?? {}) as Record<string, boolean>,
    )
    : undefined;
  if (maxTurn !== undefined && currentTurn >= maxTurn) {
    if (pursuitAuthority?.legacyMigration) {
      writeTurnPursuitState(tx, sessionId, pursuitAuthority, false);
    }
    tx.update(sessionRef, {
      currentTurn: maxTurn,
      phase: 'debrief',
      turnPhase: FieldValue.delete(),
      turnState: FieldValue.delete(),
      turnStartAnnouncement: FieldValue.delete(),
      fleetTicker,
      survivorOutcome: survivorOutcomeForSession(
        sessionId,
        session,
        shipDamage(session.get('shipDamage')),
        maxTurn,
        tickerTime,
      ),
      ...(expiredTurnResources
        ? {
          maintenanceCycles: expiredTurnResources.maintenanceCycles,
          shuttleFuelled: expiredTurnResources.shuttleFuelled,
        }
        : {}),
      ...additionalFields,
      ...(pursuitAuthority?.legacyHeaderPresent
        ? { pursuitGroups: removeLegacyNavigationField() }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      currentTurn: maxTurn,
      phase: 'debrief',
      ...(expiredTurnResources
        ? {
          maintenanceCycles: expiredTurnResources.maintenanceCycles,
          shuttleFuelled: expiredTurnResources.shuttleFuelled,
        }
        : {}),
    };
  }
  const pursuitWrite = writeTurnPursuitState(tx, sessionId, pursuitAuthority, true);
  const pursuitFailed = pursuitWrite !== undefined &&
    Object.values(pursuitWrite.navigation.pursuitGroups).some((value) => value >= 10);
  if (pursuitFailed) {
    const gameOutcome: PursuitFailureOutcome = {
      type: 'game-outcome',
      result: 'failure',
      cause: 'pursuit-limit',
      cycle: nextTurn,
      navigationRevision: pursuitWrite.revision,
      occurredAt: transition?.transitionServerTime ?? new Date().toISOString(),
    };
    tx.update(sessionRef, {
      currentTurn: nextTurn,
      phase: 'failure',
      gameOutcome,
      survivorOutcome: survivorOutcomeForSession(
        sessionId,
        session,
        shipDamage(session.get('shipDamage')),
        gameOutcome.cycle,
        gameOutcome.occurredAt,
      ),
      turnPhase: FieldValue.delete(),
      turnState: FieldValue.delete(),
      turnStartAnnouncement: FieldValue.delete(),
      ...(expiredTurnResources
        ? {
          maintenanceCycles: expiredTurnResources.maintenanceCycles,
          shuttleFuelled: expiredTurnResources.shuttleFuelled,
        }
        : {}),
      ...additionalFields,
      ...(pursuitAuthority?.legacyHeaderPresent
        ? { pursuitGroups: removeLegacyNavigationField() }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      currentTurn: nextTurn,
      phase: 'failure',
      gameOutcome,
      ...(expiredTurnResources
        ? {
          maintenanceCycles: expiredTurnResources.maintenanceCycles,
          shuttleFuelled: expiredTurnResources.shuttleFuelled,
        }
        : {}),
    };
  }
  tx.update(sessionRef, {
    currentTurn: nextTurn,
    turnStartAnnouncement: skipTurnStartAnnouncement
      ? FieldValue.delete()
      : announcement,
    fleetSurvivorPopulationAdjustment: nextFleetPopulation - fleetShipSurvivorPopulation(session),
    turnPhase,
    ...(turnState ? { turnState } : {}),
    fleetTicker,
    ...(expiredTurnResources
      ? {
        maintenanceCycles: expiredTurnResources.maintenanceCycles,
        shuttleFuelled: expiredTurnResources.shuttleFuelled,
      }
      : {}),
    ...additionalFields,
    ...(pursuitAuthority?.legacyHeaderPresent
      ? { pursuitGroups: removeLegacyNavigationField() }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (transition && currentTurn >= 1) {
    writeTurnAdvancedEvent(tx, sessionId, currentTurn, nextTurn, transition);
  }
  return {
    currentTurn: nextTurn,
    ...(turnState ? { turnState } : {}),
    ...(skipTurnStartAnnouncement ? {} : { turnStartAnnouncement: announcement }),
    turnPhase,
    ...(expiredTurnResources
      ? {
        maintenanceCycles: expiredTurnResources.maintenanceCycles,
        shuttleFuelled: expiredTurnResources.shuttleFuelled,
      }
      : {}),
  };
}

async function membershipIsActive(
  tx: Transaction,
  membership: DocumentSnapshot,
  uid: string,
): Promise<boolean> {
  if (!membership.exists) return false;
  const sessionId = membership.get('sessionId') as string | undefined;
  if (!sessionId) return false;
  const player = await tx.get(db.doc(`sessions/${sessionId}/players/${uid}`));
  const lastSeenAt = player.get('lastSeenAt') as Timestamp | undefined;
  return isActivePlayer(player) && (
    lastSeenAt === undefined ||
    (lastSeenAt instanceof Timestamp && !isPresenceStale(lastSeenAt.toDate(), new Date()))
  );
}

function isoOf(value: unknown): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date().toISOString();
}

function optionalIsoOf(value: unknown): { dradisContactTriggeredAt: string } | Record<string, never> {
  return value instanceof Timestamp
    ? { dradisContactTriggeredAt: value.toDate().toISOString() }
    : {};
}

function cleanName(value: unknown, fallback: string, max: number): string {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text.length > 0 ? text : fallback;
}

/** Keep codes short enough to read aloud while newer clients use a larger space. */
function makeJoinCode(length: number): string {
  return String(randomInt(0, 10 ** length)).padStart(length, '0');
}

function joinCodeAttemptState(snapshot: DocumentSnapshot): JoinCodeAttemptState | undefined {
  const startedAt = snapshot.get('windowStartedAt');
  const attempts = snapshot.get('attempts');
  return startedAt instanceof Timestamp && typeof attempts === 'number'
    ? { startedAt: startedAt.toDate(), attempts }
    : undefined;
}

/**
 * Meter code submissions by Firebase Auth identity, never by IP address: a
 * single convention venue can legitimately put every player behind one NAT.
 */
async function consumeJoinCodeAttempt(uid: string): Promise<void> {
  const rateRef = db.doc(`joinAttemptLimits/${uid}`);
  const decision = await db.runTransaction(async (tx) => {
    const rate = await tx.get(rateRef);
    const next = takeJoinCodeAttempt(joinCodeAttemptState(rate), new Date());
    if (next.allowed) {
      tx.set(rateRef, {
        windowStartedAt: Timestamp.fromDate(next.state.startedAt),
        attempts: next.state.attempts,
        expiresAt: Timestamp.fromDate(next.expiresAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return next;
  });
  if (decision.allowed) return;

  const retryAt = decision.retryAt ?? new Date();
  const minutes = Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 60_000));
  const retryAfterSeconds = Math.min(
    10 * 60,
    Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1_000)),
  );
  throw new HttpsError(
    'resource-exhausted',
    `Too many session-code attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    { commandError: 'unavailable-service', retryAfterSeconds },
  );
}

/**
 * Legacy four-digit codes share a ten-thousand-code space, while current
 * six-digit codes use a million. `joinCodes/{code}` is a uniqueness lock:
 * creating it inside the same transaction as the session is what makes "pick a
 * code" safe against two tables being made at the same instant. It also lives
 * outside `sessions`, which the rules deny to clients entirely -- so a code can
 * be redeemed but never enumerated.
 */
const CODE_ATTEMPTS = 12;

const REQUEST_RECOVERY_GUIDANCE =
  'Refresh or resume the authoritative result before retrying; start a new action only after confirming the intended action was not applied.';

function isSessionCreationReply(value: unknown, uid: string): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const reply = value as Record<string, unknown>;
  if (typeof reply.session !== 'object' || reply.session === null ||
      typeof reply.player !== 'object' || reply.player === null) return false;
  const session = reply.session as Record<string, unknown>;
  const player = reply.player as Record<string, unknown>;
  return typeof session.id === 'string' && session.id.length > 0 &&
    typeof session.joinCode === 'string' && session.joinCode.length > 0 &&
    player.uid === uid && player.sessionId === session.id;
}

export const createSession = onCall<{
  name?: string;
  displayName?: string;
  joinCodeVersion?: unknown;
  requestId?: unknown;
  playerCount?: unknown;
  chartId?: unknown;
  expansion?: unknown;
  turnLimit?: unknown;
  dioneEnabled?: unknown;
  capybaraEnabled?: unknown;
  universalArbourEnabled?: unknown;
  wolfCultEnabled?: unknown;
  options?: unknown;
}>(
  async (request) => {
    const uid = requireUid(request.auth);
    const creation = requireSessionCreationRequest(request.data ?? {});
    const name = cleanName(request.data?.name, 'New session', 80);
    const displayName = cleanName(request.data?.displayName, 'GM', 40);
    const joinCodeLength = joinCodeLengthForCreateRequest(request.data?.joinCodeVersion);
    const membershipRef = db.doc(`activeMemberships/${uid}`);
    const creationRequestRef = db.doc(`sessionCreationRequests/${uid}_${creation.requestId}`);
    const creationFingerprint: CommandFingerprint = {
      action: 'create-session',
      sessionId: null,
      requestId: creation.requestId,
      actorUid: uid,
      instanceId: null,
      expectedRevision: null,
      payload: {
        name,
        displayName,
        joinCodeLength,
        playerCount: creation.configuration.playerCount,
        chartId: creation.configuration.chartId,
        expansion: creation.configuration.expansion,
        turnLimit: creation.configuration.turnLimit,
        dioneEnabled: creation.configuration.dioneEnabled,
        capybaraEnabled: creation.configuration.capybaraEnabled,
        universalArbourEnabled: creation.configuration.universalArbourEnabled,
        wolfCultEnabled: creation.configuration.wolfCultEnabled,
      },
    };

    // Receipt discovery precedes every random draw. It makes an ordinary retry
    // a read-only operation and keeps the original code/session result stable.
    const priorReply = await db.runTransaction(async (tx) => {
      const priorRequest = await tx.get(creationRequestRef);
      if (!priorRequest.exists) return null;
      const disposition = commandReceiptDisposition(priorRequest.get('fingerprint'), creationFingerprint);
      if (disposition.kind === 'foreign-actor') {
        throw new HttpsError('permission-denied', 'This creation request belongs to a different actor.');
      }
      if (disposition.kind === 'collision') {
        throw commandError(
          'failed-precondition',
          `This creation request id is bound to a different command. ${REQUEST_RECOVERY_GUIDANCE}`,
          'conflict',
        );
      }
      const reply = priorRequest.get('reply');
      if (!isSessionCreationReply(reply, uid)) {
        throw commandError(
          'failed-precondition',
          `This creation request has no replayable result. ${REQUEST_RECOVERY_GUIDANCE}`,
          'conflict',
        );
      }
      return reply;
    });
    if (priorReply) return priorReply;

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const joinCode = makeJoinCode(joinCodeLength);
      const codeRef = db.doc(`joinCodes/${joinCode}`);
      const sessionRef = db.collection('sessions').doc();
      const eventRef = db.doc(`sessions/${sessionRef.id}/events/create-${creation.requestId}`);
      const now = new Date().toISOString();
      const initialFleetTicker = turnZeroFleetTicker(sessionRef.id, now);
      // The expansion mode is persisted now, but its two-role composition is
      // deliberately resolved by the casting/start slice. Adding both roles
      // here would silently create more role holders than configured players
      // and would mix base and expansion Capybara rules.
      const activeRoleIds = [...recommendedRoleIds(creation.configuration.playerCount)];
      const setup = canonicalSessionSetup(creation.configuration, activeRoleIds);
      const stableSeats = stableSeatsForRoles(activeRoleIds);
      const composition = initialSessionComposition(setup);
      const startingCraftManifest = craftStartingManifestForSetup(
        setup.activeRoleIds,
        vesselModeForConfiguration(setup),
        composition.shuttleDockings,
      );
      if (!shuttleDockingsAreParked(composition.shuttleDockings, setup.activeVesselIds)) {
        throw commandError(
          'failed-precondition',
          'The selected setup has unresolved craft starting hosts.',
          'malformed-input',
        );
      }
      const group = initialFleetGroup(setup.activeVesselIds, [uid]);
      const shipGalacticCoordinates = activeVesselRecord(
        INITIAL_SHIP_GALACTIC_COORDINATES,
        setup.activeVesselIds,
      );
      const shipNavigationLogs = activeVesselRecord(INITIAL_SHIP_NAVIGATION_LOGS, setup.activeVesselIds);
      const shipConsoleLocks = activeVesselRecord(INITIAL_SHIP_CONSOLE_LOCKS, setup.activeVesselIds);
      const shipJumpStates = activeVesselRecord(INITIAL_SHIP_JUMP_STATES, setup.activeVesselIds);
      const reply = {
        session: {
          id: sessionRef.id,
          name,
          joinCode,
          phase: 'lobby',
          currentTurn: 0,
          playerCount: creation.configuration.playerCount,
          chartId: creation.configuration.chartId,
          expansion: creation.configuration.expansion,
          turnLimit: creation.configuration.turnLimit,
          capybaraEnabled: creation.configuration.capybaraEnabled,
          dioneEnabled: creation.configuration.dioneEnabled,
          universalArbourEnabled: creation.configuration.universalArbourEnabled,
          wolfCultEnabled: creation.configuration.wolfCultEnabled,
          setup,
          activeVesselIds: setup.activeVesselIds,
          playerDiscovery: {
            groupId: group.id,
            knownCoordinates: ['0000'],
            knownSystems: discoverySystemsForCoordinates(['0000']),
            pursuitDistance: 0,
            navigationLogs: [],
            revision: 0,
          },
          pressEnabled: true,
          pressClaimed: false,
          pressAvailabilityRevision: 0,
          pressHolderUid: null,
          shipConsoleLocks,
          shipJumpStates,
          vesselActionRevisions: Object.fromEntries(setup.activeVesselIds.map((shipId) => [shipId, 0])),
          shipJumpTransitions: {},
          shipResources: composition.shipResources,
          shipDamage: {},
          smallShipStates: {},
          fighterWingCounts: composition.fighterWingCounts,
          shipUnrest: composition.shipUnrest,
          unrestAlerts: {},
          shipSurvivors: composition.shipSurvivors,
          fleetSurvivorPopulationAdjustment: 0,
          populationAlerts: {},
          gmControlsLocked: false,
          fleetTicker: initialFleetTicker,
          debriefMode: { active: false, revision: 0 },
          activeRoleIds,
          shuttleDockings: composition.shuttleDockings,
          shuttleVisitLog: composition.shuttleVisitLog,
          confettiUsedShipIds: [],
          ownerUid: uid,
          createdAt: now,
          updatedAt: now,
        },
        player: {
          uid,
          sessionId: sessionRef.id,
          displayName,
          role: 'player',
          seatId: null,
          activeConsoleRoleId: null,
          connectionGeneration: 1,
          assignedRoleId: null,
          shipPreferenceId: null,
          fleetGroupId: group.id,
          joinedAt: now,
        },
      };

      const created = await db.runTransaction(async (tx) => {
        const [code, membership, priorRequest] = await Promise.all([
          tx.get(codeRef),
          tx.get(membershipRef),
          tx.get(creationRequestRef),
        ]);
        if (priorRequest.exists) {
          const disposition = commandReceiptDisposition(priorRequest.get('fingerprint'), creationFingerprint);
          if (disposition.kind === 'foreign-actor') {
            throw new HttpsError('permission-denied', 'This creation request belongs to a different actor.');
          }
          if (disposition.kind === 'collision') {
            throw commandError(
              'failed-precondition',
              `This creation request id is bound to a different command. ${REQUEST_RECOVERY_GUIDANCE}`,
              'conflict',
            );
          }
          const replay = priorRequest.get('reply');
          if (!isSessionCreationReply(replay, uid)) {
            throw commandError(
              'failed-precondition',
              `This creation request has no replayable result. ${REQUEST_RECOVERY_GUIDANCE}`,
              'conflict',
            );
          }
          return replay as typeof reply;
        }
        const membershipActive = await membershipIsActive(tx, membership, uid);
        if (activeSessionConflicts(
          membership.exists ? membership.get('sessionId') as string : undefined,
          sessionRef.id,
          membershipActive,
        )) {
          throw commandError(
            'failed-precondition',
            'Disconnect from the current session before creating another.',
            'conflict',
          );
        }
        if (membership.exists && !membershipActive) tx.delete(membershipRef);
        if (code.exists) return false as const;

        tx.set(codeRef, {
          sessionId: sessionRef.id,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(sessionRef, {
          name,
          joinCode,
          phase: 'lobby',
          currentTurn: 0,
          playerCount: creation.configuration.playerCount,
          chartId: creation.configuration.chartId,
          expansion: creation.configuration.expansion,
          turnLimit: creation.configuration.turnLimit,
          configurationLocked: false,
          setupRevision: 0,
          capybaraEnabled: creation.configuration.capybaraEnabled,
          dioneEnabled: creation.configuration.dioneEnabled,
          universalArbourEnabled: creation.configuration.universalArbourEnabled,
          wolfCultEnabled: creation.configuration.wolfCultEnabled,
          setup,
          activeVesselIds: setup.activeVesselIds,
          pressEnabled: true,
          pressAvailabilityRevision: 0,
          pressHolderUid: null,
          shipConsoleLocks,
          shipJumpStates,
          vesselActionRevisions: Object.fromEntries(setup.activeVesselIds.map((shipId) => [shipId, 0])),
          shipJumpTransitions: {},
          shipResources: composition.shipResources,
          shipDamage: {},
          smallShipStates: {},
          fighterWingCounts: composition.fighterWingCounts,
          shipUnrest: composition.shipUnrest,
          unrestAlerts: {},
          shipSurvivors: composition.shipSurvivors,
          fleetSurvivorPopulationAdjustment: 0,
          populationAlerts: {},
          gmControlsLocked: false,
          fleetTicker: initialFleetTicker,
          debriefMode: { active: false, revision: 0 },
          activeRoleIds,
          shuttleDockings: composition.shuttleDockings,
          shuttleVisitLog: composition.shuttleVisitLog,
          confettiUsedShipIds: [],
          ownerUid: uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          deleteAfter: null,
          deletingAt: null,
        });
        tx.set(db.doc(`sessions/${sessionRef.id}/craftOwnership/manifest`), {
          ...roleOwnedCraftManifestForSetup(
            setup.activeRoleIds,
            vesselModeForConfiguration(setup),
          ),
          startingCraft: startingCraftManifest,
          setupRevision: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(fleetGroupRef(sessionRef.id), {
          ...group,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        const navigation = navigationState({ shipGalacticCoordinates, shipNavigationLogs }, setup.activeVesselIds);
        tx.set(navigationStateRef(sessionRef.id), {
          ...navigationProjectionFields(navigation),
          revision: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(gmDiscoveryProjectionRef(sessionRef.id), {
          ...navigationProjectionFields(navigation),
          knownSystems: allDiscoverySystems(),
          pursuitDistances: pursuitDistancesForCoordinates(navigation.shipGalacticCoordinates),
          organiserSites: organiserSitesForChart(creation.configuration.chartId),
          revision: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        for (const seat of stableSeats) {
          tx.set(db.doc(`sessions/${sessionRef.id}/seats/${seat.id}`), {
            ...seat,
            sessionId: sessionRef.id,
          });
        }
        // GM authority is claimed per named browser instance after creation.
        tx.set(db.doc(`sessions/${sessionRef.id}/players/${uid}`), {
          uid,
          sessionId: sessionRef.id,
          displayName,
          role: 'player',
          seatId: null,
          activeConsoleRoleId: null,
          assignedRoleId: null,
          shipPreferenceId: null,
          fleetGroupId: group.id,
          joinedAt: FieldValue.serverTimestamp(),
          connected: true,
          connectionGeneration: 1,
          lastSeenAt: FieldValue.serverTimestamp(),
        });
        tx.set(playerDiscoveryProjectionRef(sessionRef.id, uid), {
          groupId: group.id,
          knownCoordinates: ['0000'],
          knownSystems: discoverySystemsForCoordinates(['0000']),
          pursuitDistance: 0,
          navigationLogs: [],
          revision: 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(membershipRef, { sessionId: sessionRef.id, connectedAt: FieldValue.serverTimestamp() });
        tx.set(creationRequestRef, {
          sessionId: sessionRef.id,
          requestId: creation.requestId,
          fingerprint: creationFingerprint,
          reply,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(eventRef, buildPrivacySafeEventRecord({
          type: 'session.created',
          envelope: buildAuthoritativeEventEnvelope({
            sessionId: sessionRef.id,
            actorUid: uid,
            actorRoleId: null,
            turn: 0,
            phase: 'lobby',
            type: 'session.created',
            requestId: creation.requestId,
            revision: 0,
            serverTime: now,
            visibility: EventVisibility.Member,
          }),
          createdAt: FieldValue.serverTimestamp(),
        }));
        return reply;
      });

      if (created !== false) return created;
    }

    throw new HttpsError(
      'resource-exhausted',
      'Could not find a free session code. Please try again.',
    );
  },
);

type CastingMutationResult = {
  readonly sessionId: string;
  readonly setupRevision: number;
};

function commandReceiptRef(sessionId: string, requestId: string): DocumentReference {
  return db.doc(`sessions/${sessionId}/commandReceipts/${requestId}`);
}

function commissarPurgeStateRef(sessionId: string): DocumentReference {
  return db.doc(`sessions/${sessionId}/commissarPurgeState/current`);
}

function commissarPurgeAuthorityRef(sessionId: string, uid: string): DocumentReference {
  return db.doc(`sessions/${sessionId}/commissarPurgeAuthority/${uid}`);
}

function vesselActionRevision(session: DocumentSnapshot, vesselId: string): number {
  const revisions = session.get('vesselActionRevisions');
  if (isRecord(revisions) && Number.isSafeInteger(revisions[vesselId]) &&
      (revisions[vesselId] as number) >= 0) return revisions[vesselId] as number;
  return 0;
}

function vesselActionRevisionPatch(vesselId: string, revision: number): Record<string, number> {
  return { [`vesselActionRevisions.${vesselId}`]: revision };
}

const LIFECYCLE_PHASES = [
  'lobby', 'casting', 'briefing', 'active', 'success', 'failure',
  'debrief', 'closed', 'retained-empty',
] as const satisfies readonly LifecyclePhase[];

function vesselActionPhase(session: DocumentSnapshot): LifecyclePhase {
  const phase = session.get('phase');
  if (LIFECYCLE_PHASES.includes(phase as LifecyclePhase)) return phase as LifecyclePhase;
  // Existing test and legacy fixtures omit phase while the gameplay guards
  // already establish the active window. Keep that compatibility explicit.
  return 'active';
}

function vesselActorRoleId(player: DocumentSnapshot): string | null {
  return typeof player.get('activeConsoleRoleId') === 'string'
    ? player.get('activeConsoleRoleId') as string : null;
}

function vesselActionEnvelope(
  session: DocumentSnapshot,
  player: DocumentSnapshot,
  actorUid: string,
  vesselId: string,
  revision: number,
  requestId: string,
  action: string,
  hostShipId?: string,
): VesselActionEnvelope {
  return buildVesselActionEnvelope({
    actorUid,
    actorRoleId: vesselActorRoleId(player),
    vesselId,
    ...(hostShipId === undefined ? {} : { hostShipId }),
    turn: sessionTurn(session.get('currentTurn')),
    phase: vesselActionPhase(session),
    revision,
    idempotencyKey: requestId,
    auditId: `${action}-${requestId}`,
  });
}

function isVesselActionResult(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.idempotencyKey === 'string' && result.idempotencyKey.length > 0 &&
    typeof result.auditId === 'string' && result.auditId.length > 0 &&
    typeof result.vesselId === 'string' && result.vesselId.length > 0 &&
    typeof result.actorUid === 'string' && result.actorUid.length > 0 &&
    (typeof result.actorRoleId === 'string' || result.actorRoleId === null) &&
    typeof result.turn === 'number' && Number.isSafeInteger(result.turn) && result.turn >= 0 &&
    typeof result.phase === 'string' && LIFECYCLE_PHASES.includes(result.phase as LifecyclePhase) &&
    typeof result.revision === 'number' && Number.isSafeInteger(result.revision) && result.revision >= 0 &&
    // Small-ship docking retains its legacy nullable domain field; the
    // flattened envelope omits hostShipId when an undock has no host.
    (result.hostShipId === undefined || result.hostShipId === null ||
      (typeof result.hostShipId === 'string' && result.hostShipId.length > 0));
}

function vesselActionFingerprint(
  action: string,
  sessionId: string,
  requestId: string,
  actorUid: string,
  instanceId: string | null,
  expectedRevision: number | null,
  payload: Record<string, CommandPayloadValue>,
): CommandFingerprint {
  return { action, sessionId, requestId, actorUid, instanceId, expectedRevision, payload };
}

function vesselActionReceiptReply(
  receipt: DocumentSnapshot,
  fingerprint: CommandFingerprint,
  label: string,
): Record<string, unknown> | undefined {
  return replayBoundCommand(receipt, fingerprint, isVesselActionResult, label) ?? undefined;
}

/**
 * Before commandReceipts existed, M1 callables stored replay state in several
 * action-specific collections (or only in a public event). A request ID is a
 * single namespace across those actions, so a new callable must fail closed
 * when any foreign legacy record already owns it. The caller may allow its own
 * legacy receipt/event so the retained, fully bound domain replay can run.
 */
function legacyM1CommandRefs(sessionId: string, requestId: string): readonly DocumentReference[] {
  return [
    db.doc(`sessions/${sessionId}/setupMutationRequests/${requestId}`),
    db.doc(`sessions/${sessionId}/gmResponsibilityRequests/${requestId}`),
    db.doc(`sessions/${sessionId}/seatMutationRequests/${requestId}`),
    db.doc(`sessions/${sessionId}/loyaltyAssignmentRequests/${requestId}`),
    db.doc(`sessionStartRequests/${sessionId}_${requestId}`),
    db.doc(`sessions/${sessionId}/events/setup-confirm-${requestId}`),
    db.doc(`sessions/${sessionId}/events/gm-responsibility-${requestId}`),
    db.doc(`sessions/${sessionId}/events/start-${requestId}`),
    db.doc(`sessions/${sessionId}/events/seat-claim-${requestId}`),
    db.doc(`sessions/${sessionId}/events/seat-release-${requestId}`),
    db.doc(`sessions/${sessionId}/events/${requestId}`),
    db.doc(`sessions/${sessionId}/events/press-availability-${requestId}`),
  ];
}

async function rejectForeignLegacyM1Command(
  tx: Transaction,
  sessionId: string,
  requestId: string,
  label: string,
  allowedPaths: readonly string[],
): Promise<void> {
  const allowed = new Set(allowedPaths);
  const refs = legacyM1CommandRefs(sessionId, requestId);
  const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
  if (snapshots.some((snapshot, index) => snapshot.exists && !allowed.has(refs[index]!.path))) {
    throw commandError(
      'failed-precondition',
      `This ${label} request id is already bound to a legacy command. ${REQUEST_RECOVERY_GUIDANCE}`,
      'conflict',
    );
  }
}

async function rejectForeignLegacyM1CommandBeforeReplay(
  sessionId: string,
  requestId: string,
  label: string,
  allowedPaths: readonly string[],
): Promise<void> {
  const allowed = new Set(allowedPaths);
  const refs = legacyM1CommandRefs(sessionId, requestId);
  const snapshots = await Promise.all(refs.map((ref) => ref.get()));
  if (snapshots.some((snapshot, index) => snapshot.exists && !allowed.has(refs[index]!.path))) {
    throw commandError(
      'failed-precondition',
      `This ${label} request id is already bound to a legacy command. ${REQUEST_RECOVERY_GUIDANCE}`,
      'conflict',
    );
  }
}

function rejectLegacyEventReplay(label: string): never {
  throw commandError(
    'failed-precondition',
    `This ${label} request has a legacy unbound receipt. ${REQUEST_RECOVERY_GUIDANCE}`,
    'conflict',
  );
}

function isCastingMutationResult(value: unknown, sessionId: string): value is CastingMutationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.sessionId === sessionId &&
    Number.isSafeInteger(result.setupRevision) && (result.setupRevision as number) >= 0;
}

function replayBoundCommand<T>(
  receipt: DocumentSnapshot,
  fingerprint: CommandFingerprint,
  isResult: (value: unknown) => value is T,
  label: string,
): T | null {
  if (!receipt.exists) return null;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', `This ${label} request belongs to a different actor.`);
  }
  if (disposition.kind === 'collision') {
    throw commandError('failed-precondition', `This ${label} request id is bound to a different command.`, 'conflict');
  }
  const result = receipt.get('result');
  if (isResult(result)) return result;
  throw commandError('failed-precondition', `This ${label} request has no replayable result.`, 'conflict');
}

/**
 * Established M1 commands retain their domain receipts, but every new receipt
 * also occupies the shared request-id namespace. A compatible marker lets the
 * domain receipt control the exact replay shape; a different marker is always
 * rejected before any mutation or private result can be reached.
 */
function hasCompatibleCommandMarker(
  receipt: DocumentSnapshot,
  fingerprint: CommandFingerprint,
  label: string,
): boolean {
  if (!receipt.exists) return false;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', `This ${label} request belongs to a different actor.`);
  }
  if (disposition.kind === 'collision') {
    throw commandError('failed-precondition', `This ${label} request id is bound to a different command.`, 'conflict');
  }
  return true;
}

function setupRevision(session: DocumentSnapshot): number {
  const value = session.get('setupRevision');
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function requireCastingWindow(session: DocumentSnapshot): void {
  if (session.get('configurationLocked') === true ||
      !['lobby', 'casting'].includes(String(session.get('phase')))) {
    throw commandError('failed-precondition', 'Casting is locked after setup begins.', 'invalid-phase');
  }
}

function canonicalSetupForSession(
  session: DocumentSnapshot,
  activeRoleIds: readonly string[],
  playerCountOverride?: number,
) {
  const playerCount = playerCountOverride ?? (
    Number.isSafeInteger(session.get('playerCount')) ? session.get('playerCount') as number : 18
  );
  const persistedExpansion = session.get('expansion');
  const expansion = playerCountOverride === undefined
    ? persistedExpansion === undefined
      ? (playerCount >= 19 ? 'capybara' : 'base')
      : persistedExpansion
    : playerCount >= 19
      ? 'capybara'
      : persistedExpansion === 'none' ? 'none' : 'base';
  const configurationInput = {
    playerCount,
    chartId: session.get('chartId'),
    expansion,
    turnLimit: session.get('turnLimit'),
    dioneEnabled: session.get('dioneEnabled') !== false && playerCount >= 12,
    capybaraEnabled: expansion !== 'none' && (playerCount >= 19 || session.get('capybaraEnabled') !== false),
    universalArbourEnabled: session.get('universalArbourEnabled') === true,
    wolfCultEnabled: session.get('wolfCultEnabled') === true,
  };
  try {
    const configuration = playerCountOverride === undefined
      ? normalizePersistedSessionConfiguration(configurationInput)
      : normalizeSessionConfiguration(configurationInput);
    return canonicalSessionSetup(configuration, activeRoleIds);
  } catch {
    throw commandError(
      'failed-precondition',
      'Stored setup configuration is invalid; refresh the session before retrying.',
      'malformed-input',
    );
  }
}

/** Keep the selected vessel definition immutable as soon as casting begins. */
function requireVesselModeUnchanged(
  session: DocumentSnapshot,
  nextConfiguration: Parameters<typeof vesselModeForConfiguration>[0],
): void {
  if (String(session.get('phase')) !== 'casting') return;
  const currentSetup = canonicalSetupForSession(session, sessionActiveRoleIds(session));
  const currentMode = vesselModeForConfiguration(currentSetup);
  const nextMode = vesselModeForConfiguration(nextConfiguration);
  if (currentMode !== nextMode) {
    throw commandError(
      'failed-precondition',
      'Vessel mode is locked once casting begins.',
      'conflict',
    );
  }
}

/** Reconcile role-keyed seats before writing the tuple that advertises them. */
async function reconcileStableSeats(
  tx: Transaction,
  sessionId: string,
  currentRoleIds: readonly string[],
  nextRoleIds: readonly string[],
): Promise<void> {
  const next = new Set(nextRoleIds);
  const current = new Set(currentRoleIds);
  const roleIds = [...new Set([...currentRoleIds, ...nextRoleIds])];
  const snapshots = await Promise.all(roleIds.map(async (roleId) => ({
    roleId,
    snapshot: await tx.get(db.doc(`sessions/${sessionId}/seats/${roleId}`)),
  })));
  const byRole = new Map(snapshots.map(({ roleId, snapshot }) => [roleId, snapshot]));
  const removed = currentRoleIds.filter((roleId) => !next.has(roleId));
  const claimedSeat = removed
    .map((roleId) => ({ roleId, snapshot: byRole.get(roleId)! }))
    .find(({ snapshot }) =>
      snapshot.exists && snapshot.get('status') === 'claimed' && snapshot.get('holderUid'));
  if (claimedSeat) {
    throw commandError(
      'failed-precondition',
      `Seat ${claimedSeat.roleId} is claimed and cannot be removed from the setup.`,
      'conflict',
    );
  }

  for (const roleId of removed) {
    if (byRole.get(roleId)?.exists) {
      tx.update(db.doc(`sessions/${sessionId}/seats/${roleId}`), {
        status: 'locked',
        holderUid: null,
        claimedAt: null,
      });
    }
  }
  for (const seat of stableSeatsForRoles(nextRoleIds)) {
    const stored = byRole.get(seat.id);
    if (stored?.exists && current.has(seat.id)) {
      const canonicalFields = {
        roleId: seat.roleId,
        label: seat.label,
        factionId: seat.factionId,
      };
      if (
        stored.get('roleId') !== canonicalFields.roleId ||
        stored.get('label') !== canonicalFields.label ||
        stored.get('factionId') !== canonicalFields.factionId
      ) {
        tx.update(db.doc(`sessions/${sessionId}/seats/${seat.id}`), canonicalFields);
      }
      continue;
    }
    if (stored?.exists) {
      tx.update(db.doc(`sessions/${sessionId}/seats/${seat.id}`), {
        ...seat,
        sessionId,
      });
      continue;
    }
    tx.set(db.doc(`sessions/${sessionId}/seats/${seat.id}`), {
      ...seat,
      sessionId,
    });
  }
}

/** Heal legacy sessions into the canonical setup/seat shape during join or resume. */
async function hydrateCanonicalSessionSetup(
  tx: Transaction,
  sessionId: string,
  session: DocumentSnapshot,
): Promise<ReturnType<typeof canonicalSetupForSession>> {
  const activeRoleIds = sessionActiveRoleIds(session);
  const setup = canonicalSetupForSession(session, activeRoleIds);
  await reconcileStableSeats(tx, sessionId, activeRoleIds, activeRoleIds);
  const storedSetup = session.get('setup');
  const hasSetup = typeof storedSetup === 'object' && storedSetup !== null &&
    Array.isArray(session.get('activeVesselIds'));
  if (!hasSetup) {
    tx.update(db.doc(`sessions/${sessionId}`), {
      ...setupWriteFields(setup),
      setupRevision: setupRevision(session),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return setup;
}

function setupWriteFields(setup: ReturnType<typeof canonicalSetupForSession>) {
  return {
    setup,
    playerCount: setup.playerCount,
    chartId: setup.chartId,
    expansion: setup.expansion,
    turnLimit: setup.turnLimit,
    dioneEnabled: setup.dioneEnabled,
    capybaraEnabled: setup.capybaraEnabled,
    universalArbourEnabled: setup.universalArbourEnabled,
    wolfCultEnabled: setup.wolfCultEnabled,
    activeRoleIds: [...setup.activeRoleIds],
    activeVesselIds: [...setup.activeVesselIds],
  };
}

type SetupCommandFingerprint = {
  readonly playerCount: number;
  readonly chartId: string;
  readonly lockChart: boolean;
  readonly expansion: string;
  readonly turnLimit: number;
  readonly dioneEnabled: boolean;
  readonly capybaraEnabled: boolean;
  readonly universalArbourEnabled: boolean;
  readonly wolfCultEnabled: boolean;
  readonly activeRoleIds: readonly string[];
  readonly expectedSetupRevision: number;
};

function setupCommandFingerprint(
  configuration: ReturnType<typeof normalizeSessionConfiguration>,
  activeRoleIds: readonly string[],
  expectedSetupRevision: number,
  lockChart = false,
): SetupCommandFingerprint {
  return {
    playerCount: configuration.playerCount,
    chartId: configuration.chartId,
    lockChart,
    expansion: configuration.expansion,
    turnLimit: configuration.turnLimit,
    dioneEnabled: configuration.dioneEnabled,
    capybaraEnabled: configuration.capybaraEnabled,
    universalArbourEnabled: configuration.universalArbourEnabled,
    wolfCultEnabled: configuration.wolfCultEnabled,
    activeRoleIds: [...activeRoleIds],
    expectedSetupRevision,
  };
}

function sameSetupCommandFingerprint(
  value: unknown,
  expected: SetupCommandFingerprint,
): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.playerCount === expected.playerCount &&
    candidate.chartId === expected.chartId &&
    (candidate.lockChart === true) === expected.lockChart &&
    candidate.expansion === expected.expansion &&
    candidate.turnLimit === expected.turnLimit &&
    candidate.dioneEnabled === expected.dioneEnabled &&
    candidate.capybaraEnabled === expected.capybaraEnabled &&
    (candidate.universalArbourEnabled === undefined
      ? false
      : candidate.universalArbourEnabled) === expected.universalArbourEnabled &&
    (candidate.wolfCultEnabled === undefined
      ? false
      : candidate.wolfCultEnabled) === expected.wolfCultEnabled &&
    candidate.expectedSetupRevision === expected.expectedSetupRevision &&
    Array.isArray(candidate.activeRoleIds) &&
    candidate.activeRoleIds.length === expected.activeRoleIds.length &&
    candidate.activeRoleIds.every((roleId, index) => roleId === expected.activeRoleIds[index]);
}

function rejectLegacySetupMutation(): never {
  throw commandError(
    'failed-precondition',
    'Legacy setup mutations are disabled; submit the complete tuple through confirmSetup.',
    'malformed-input',
  );
}

/** Confirm the complete setup tuple in one authoritative, replayable write. */
export const confirmSetup = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
  setup?: unknown;
  playerCount?: unknown;
  chartId?: unknown;
  lockChart?: unknown;
  expansion?: unknown;
  turnLimit?: unknown;
  dioneEnabled?: unknown;
  capybaraEnabled?: unknown;
  universalArbourEnabled?: unknown;
  wolfCultEnabled?: unknown;
  activeRoleIds?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const command = requireSetupConfirmationRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const requestRef = db.doc(`sessions/${command.sessionId}/setupMutationRequests/${command.requestId}`);
  const markerRef = commandReceiptRef(command.sessionId, command.requestId);
  const eventRef = db.doc(`sessions/${command.sessionId}/events/setup-confirm-${command.requestId}`);
  const groupRef = fleetGroupRef(command.sessionId);
  const markerFingerprint: CommandFingerprint = {
    action: 'confirm-setup',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid: uid,
    instanceId: command.instanceId,
    expectedRevision: command.expectedSetupRevision,
    payload: {
      playerCount: command.configuration.playerCount,
      chartId: command.configuration.chartId,
      ...(command.lockChart ? { lockChart: true } : {}),
      expansion: command.configuration.expansion,
      turnLimit: command.configuration.turnLimit,
      dioneEnabled: command.configuration.dioneEnabled,
      capybaraEnabled: command.configuration.capybaraEnabled,
      universalArbourEnabled: command.configuration.universalArbourEnabled,
      wolfCultEnabled: command.configuration.wolfCultEnabled,
      activeRoleIds: command.activeRoleIds,
    },
  };

  return db.runTransaction(async (tx) => {
    const fingerprint = setupCommandFingerprint(
      command.configuration,
      command.activeRoleIds,
      command.expectedSetupRevision,
      command.lockChart,
    );
    const [prior, marker, authority, legacyEvent, storedGroup, storedNavigation, players] = await Promise.all([
      tx.get(requestRef),
      tx.get(markerRef),
      requireFacilitatorInstance(tx, command.sessionId, uid, command.instanceId),
      tx.get(eventRef),
      tx.get(groupRef),
      tx.get(navigationStateRef(command.sessionId)),
      tx.get(db.collection(`sessions/${command.sessionId}/players`)),
    ]);
    const playerDocs = Array.isArray(players?.docs) ? players.docs : [];
    await rejectForeignLegacyM1Command(
      tx, command.sessionId, command.requestId, 'setup', [requestRef.path, eventRef.path],
    );
    if (hasCompatibleCommandMarker(marker, markerFingerprint, 'setup') && !prior.exists) {
      throw commandError('failed-precondition', 'This setup request has a marker without a replayable receipt.', 'conflict');
    }
    if (!prior.exists && legacyEvent.exists) rejectLegacyEventReplay('setup');
    if (prior.exists) {
      if (
        prior.get('action') !== 'confirm-setup' ||
        prior.get('sessionId') !== command.sessionId ||
        prior.get('actorUid') !== uid ||
        prior.get('instanceId') !== command.instanceId
      ) {
        throw commandError('failed-precondition', 'This request id belongs to a different setup command.', 'conflict');
      }
      const expectedFingerprint = setupCommandFingerprint(
        command.configuration,
        command.activeRoleIds,
        command.expectedSetupRevision,
        command.lockChart,
      );
      if (!sameSetupCommandFingerprint(prior.get('fingerprint'), expectedFingerprint)) {
        throw commandError('failed-precondition', 'This request id was already used for a different setup tuple.', 'conflict');
      }
      const reply = prior.get('reply');
      if (typeof reply !== 'object' || reply === null) {
        throw commandError('failed-precondition', 'This setup request has no replayable result.', 'conflict');
      }
      if (reply.status === 'stale') return reply;
      return { ...(reply as Record<string, unknown>), status: 'replayed' };
    }
    if (setupRevision(authority.session) !== command.expectedSetupRevision) {
      const reply = {
        status: 'stale' as const,
        requestId: command.requestId,
        entity: 'setup' as const,
        expectedRevision: command.expectedSetupRevision,
        currentRevision: setupRevision(authority.session),
      };
      tx.set(requestRef, {
        action: 'confirm-setup', requestId: command.requestId,
        sessionId: command.sessionId, actorUid: uid, instanceId: command.instanceId,
        fingerprint, reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(markerRef, { fingerprint: markerFingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }
    requireCastingWindow(authority.session);
    requireVesselModeUnchanged(authority.session, command.configuration);
    if (authority.session.get('chartSelectionLocked') === true &&
        canonicalSetupForSession(authority.session, sessionActiveRoleIds(authority.session)).chartId !== command.configuration.chartId) {
      throw commandError('failed-precondition', 'The star chart is locked.', 'conflict');
    }
    const currentRoleIds = sessionActiveRoleIds(authority.session);
    const setup = canonicalSessionSetup(command.configuration, command.activeRoleIds);
    const currentActiveVesselIds = activeVesselIdsForSession(authority.session);
    const storedDockings = authority.session.get('shuttleDockings');
    const rawCurrentDockings = Array.isArray(storedDockings)
      ? storedDockings as Array<typeof INITIAL_SHUTTLE_DOCKINGS[number]>
      : initialShuttleDockingsForRoles(currentRoleIds);
    // Validate the persisted tuple before projection filtering can hide a
    // moved craft whose current host is being removed from the next roster.
    if (!shuttleDockingsAreParked(rawCurrentDockings, currentActiveVesselIds) ||
        !shuttleDockingsMatchRoleOwnedCraft(currentRoleIds, rawCurrentDockings)) {
      throw commandError(
        'failed-precondition',
        'The selected setup has malformed craft docking state.',
        'malformed-input',
      );
    }
    const nextActiveVessels = new Set(setup.activeVesselIds);
    const nextEnabledShuttleIds = new Set(roleOwnedCraftForRoles(command.activeRoleIds)
      .filter((craft) => craft.kind === 'shuttle')
      .map((craft) => craft.id));
    if (rawCurrentDockings.some((docking) =>
      docking.shuttleId !== 'snn-press-shuttle' &&
      nextEnabledShuttleIds.has(docking.shuttleId) &&
      !nextActiveVessels.has(docking.shipId))) {
      throw commandError(
        'failed-precondition',
        'The selected setup removes a host for an enabled craft; relocate it before changing the roster.',
        'conflict',
      );
    }
    await reconcileStableSeats(tx, command.sessionId, currentRoleIds, command.activeRoleIds);
    ensureInitialFleetGroup(
      tx,
      command.sessionId,
      setup.activeVesselIds,
      activeFleetGroupMemberUids(playerDocs),
      storedGroup,
      playerDocs,
    );
    const nextActiveVesselIds = setup.activeVesselIds;
    const nextShipResources = reconcileActiveVesselMap(
      authority.session.get('shipResources'),
      currentActiveVesselIds,
      nextActiveVesselIds,
      shipResources,
      INITIAL_SHIP_RESOURCES,
    );
    const nextShipUnrest = reconcileActiveVesselMap(
      authority.session.get('shipUnrest'),
      currentActiveVesselIds,
      nextActiveVesselIds,
      shipUnrest,
      Object.fromEntries(nextActiveVesselIds.map((shipId) => [shipId, 0])),
    );
    const nextShipSurvivors = reconcileActiveVesselMap(
      authority.session.get('shipSurvivors'),
      currentActiveVesselIds,
      nextActiveVesselIds,
      (value) => activeShipSurvivors(value, Object.keys(INITIAL_SHIP_SURVIVORS)),
      INITIAL_SHIP_SURVIVORS,
    );
    const currentNavigation = navigationStateForSession(
      storedNavigation,
      authority.session,
      currentActiveVesselIds,
    );
    const nextShipGalacticCoordinates = reconcileActiveVesselMap(
      currentNavigation.shipGalacticCoordinates,
      currentActiveVesselIds,
      nextActiveVesselIds,
      shipGalacticCoordinates,
      INITIAL_SHIP_GALACTIC_COORDINATES,
    );
    const nextShipNavigationLogs = reconcileActiveVesselMap(
      currentNavigation.shipNavigationLogs,
      currentActiveVesselIds,
      nextActiveVesselIds,
      shipNavigationLogs,
      INITIAL_SHIP_NAVIGATION_LOGS,
    );
    const nextShipConsoleLocks = reconcileActiveVesselMap(
      authority.session.get('shipConsoleLocks'),
      currentActiveVesselIds,
      nextActiveVesselIds,
      shipConsoleLocks,
      INITIAL_SHIP_CONSOLE_LOCKS,
    );
    const nextShipJumpStates = reconcileActiveVesselMap(
      authority.session.get('shipJumpStates'),
      currentActiveVesselIds,
      nextActiveVesselIds,
      shipJumpStates,
      INITIAL_SHIP_JUMP_STATES,
    );
    const retainedDockings = activeShuttleDockingsForVessels(rawCurrentDockings, nextActiveVesselIds)
      .filter((docking) => nextEnabledShuttleIds.has(docking.shuttleId));
    const seededDockings = initialShuttleDockingsForRoles(setup.activeRoleIds);
    const retainedByShuttleId = new Map(retainedDockings.map((docking) => [docking.shuttleId, docking]));
    const seededShuttleIds = new Set(seededDockings.map((docking) => docking.shuttleId));
    const nextDockings = [
      ...seededDockings.map((docking) => docking.shuttleId === 'snn-press-shuttle'
        ? docking
        : retainedByShuttleId.get(docking.shuttleId) ?? docking),
      ...retainedDockings.filter((docking) => !seededShuttleIds.has(docking.shuttleId)),
    ];
    const storedVisits = authority.session.get('shuttleVisitLog') as Array<{ shuttleId: string }> | undefined;
    const nextVisits = storedVisits
      ? [...activeShuttleVisitsForDockings(
        storedVisits,
        nextDockings.filter((docking) => docking.shuttleId !== 'snn-press-shuttle'),
      )]
      : [];
    const existingVisitShuttles = new Set(nextVisits.map((visit) => visit.shuttleId));
    for (const visit of initialShuttleVisitsForDockings(nextDockings)) {
      if (!existingVisitShuttles.has(visit.shuttleId)) nextVisits.push(visit);
    }
    const nextCraftManifest = roleOwnedCraftManifestForSetup(
      setup.activeRoleIds,
      vesselModeForConfiguration(setup),
    );
    const nextStartingCraftManifest = craftStartingManifestForSetup(
      setup.activeRoleIds,
      vesselModeForConfiguration(setup),
      nextDockings,
    );
    if (!shuttleDockingsAreParked(nextDockings, nextActiveVesselIds) ||
        !shuttleDockingsMatchRoleOwnedCraft(command.activeRoleIds, nextDockings)) {
      throw commandError(
        'failed-precondition',
        'The selected setup has unresolved craft starting hosts.',
        'malformed-input',
      );
    }
    const reply = {
      status: 'committed' as const,
      chartSelectionLocked: authority.session.get('chartSelectionLocked') === true || command.lockChart,
      requestId: command.requestId,
      setupRevision: command.expectedSetupRevision + 1,
      setup,
      activeRoleIds: [...setup.activeRoleIds],
      activeVesselIds: [...setup.activeVesselIds],
    };
    tx.update(sessionRef, {
      ...setupWriteFields(setup),
      chartSelectionLocked: reply.chartSelectionLocked,
      shipResources: nextShipResources,
      shipUnrest: nextShipUnrest,
      shipSurvivors: nextShipSurvivors,
      shipGalacticCoordinates: removeLegacyNavigationField(),
      shipNavigationLogs: removeLegacyNavigationField(),
      shipConsoleLocks: nextShipConsoleLocks,
      shipJumpStates: nextShipJumpStates,
      shuttleDockings: nextDockings,
      shuttleVisitLog: nextVisits,
      setupRevision: reply.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const nextNavigation = navigationState({
      shipGalacticCoordinates: nextShipGalacticCoordinates,
      shipNavigationLogs: nextShipNavigationLogs,
      systemHistory: currentNavigation.systemHistory,
      pursuitGroups: currentNavigation.pursuitGroups,
    }, nextActiveVesselIds);
    tx.set(navigationStateRef(command.sessionId), {
      ...navigationProjectionFields(nextNavigation),
      revision: reply.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    publishDiscoveryProjections(
      tx, command.sessionId, playerDocs, nextNavigation, reply.setupRevision,
      command.configuration.chartId,
    );
    tx.set(db.doc(`sessions/${command.sessionId}/craftOwnership/manifest`), {
      ...nextCraftManifest,
      startingCraft: nextStartingCraftManifest,
      setupRevision: reply.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'setup-confirm',
      payload: {
        action: 'confirm-setup', requestId: command.requestId,
        actorUid: uid, instanceId: command.instanceId, revision: reply.setupRevision,
        activeRoleIds: [...setup.activeRoleIds],
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(requestRef, {
      action: 'confirm-setup', requestId: command.requestId,
      sessionId: command.sessionId, actorUid: uid, instanceId: command.instanceId,
      fingerprint, reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(markerRef, { fingerprint: markerFingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

async function requireFacilitatorInstance(
  tx: Transaction,
  sessionId: string,
  uid: string,
  instanceId: string,
): Promise<{ session: DocumentSnapshot; player: DocumentSnapshot; instance: DocumentSnapshot }> {
  const [session, player, instance] = await Promise.all([
    tx.get(db.doc(`sessions/${sessionId}`)),
    tx.get(db.doc(`sessions/${sessionId}/players/${uid}`)),
    tx.get(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`)),
  ]);
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  const liveInstance = instance.exists
    ? {
      id: instance.id,
      uid: typeof instance.get('uid') === 'string' ? instance.get('uid') as string : '',
      connected: instance.get('connected') !== false,
      lastSeenAt: gmInstanceLeaseTimestamp(instance),
    }
    : null;
  if (
    !isActivePlayer(player) || player.get('role') !== 'gm' ||
    liveInstance === null || liveInstance.uid !== uid ||
    !isLiveSetupGm(liveInstance)
  ) {
    throw new HttpsError('permission-denied', 'An active facilitator instance is required.');
  }
  return { session, player, instance };
}

/** Record which of the two physical facilitator responsibilities an instance owns. */
type FacilitatorResponsibility = 'main' | 'assistant';

function normalizedResponsibilities(instance: Pick<DocumentSnapshot, 'get'>): FacilitatorResponsibility[] {
  const stored = instance.get('responsibilities');
  if (Array.isArray(stored)) {
    return ['main', 'assistant'].filter((responsibility) =>
      stored.includes(responsibility)) as FacilitatorResponsibility[];
  }
  const legacy = instance.get('responsibility');
  return legacy === 'main' || legacy === 'assistant' ? [legacy] : [];
}

function responsibilityCoverage(instances: readonly DocumentSnapshot[]) {
  return {
    main: instances.filter((instance) => normalizedResponsibilities(instance).includes('main')).map((instance) => instance.id),
    assistant: instances.filter((instance) => normalizedResponsibilities(instance).includes('assistant')).map((instance) => instance.id),
  };
}

export const setFacilitatorResponsibility = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
  responsibility?: unknown;
  mode?: unknown;
  targetInstanceId?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const responsibility = requireFacilitatorResponsibilityRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${responsibility.sessionId}`);
  const instanceRef = db.doc(`sessions/${responsibility.sessionId}/gmInstances/${responsibility.instanceId}`);
  const instancesRef = db.collection(`sessions/${responsibility.sessionId}/gmInstances`);
  const requestRef = db.doc(
    `sessions/${responsibility.sessionId}/gmResponsibilityRequests/${responsibility.requestId}`,
  );
  const markerRef = commandReceiptRef(responsibility.sessionId, responsibility.requestId);
  const eventRef = db.doc(
    `sessions/${responsibility.sessionId}/events/gm-responsibility-${responsibility.requestId}`,
  );
  const markerFingerprint: CommandFingerprint = {
    action: 'set-facilitator-responsibility',
    sessionId: responsibility.sessionId,
    requestId: responsibility.requestId,
    actorUid: uid,
    instanceId: responsibility.instanceId,
    expectedRevision: responsibility.expectedSetupRevision,
    payload: {
      responsibility: responsibility.responsibility,
      mode: responsibility.mode,
      targetInstanceId: responsibility.targetInstanceId ?? null,
    },
  };
  return db.runTransaction(async (tx) => {
    const fingerprint = {
      action: 'set-facilitator-responsibility',
      sessionId: responsibility.sessionId,
      instanceId: responsibility.instanceId,
      actorUid: uid,
      responsibility: responsibility.responsibility,
      mode: responsibility.mode,
      targetInstanceId: responsibility.targetInstanceId ?? null,
      expectedSetupRevision: responsibility.expectedSetupRevision,
    } as const;
    const [authority, prior, marker, legacyEvent] = await Promise.all([
      requireFacilitatorInstance(tx, responsibility.sessionId, uid, responsibility.instanceId),
      tx.get(requestRef),
      tx.get(markerRef),
      tx.get(eventRef),
    ]);
    await rejectForeignLegacyM1Command(
      tx, responsibility.sessionId, responsibility.requestId, 'responsibility',
      [requestRef.path, eventRef.path],
    );
    if (hasCompatibleCommandMarker(marker, markerFingerprint, 'responsibility') && !prior.exists) {
      throw commandError('failed-precondition', 'This responsibility request has a marker without a replayable receipt.', 'conflict');
    }
    if (!prior.exists && legacyEvent.exists) rejectLegacyEventReplay('responsibility');
    if (prior.exists) {
      const stored = prior.get('fingerprint');
      const same = typeof stored === 'object' && stored !== null &&
        Object.entries(fingerprint).every(([key, value]) =>
          (stored as Record<string, unknown>)[key] === value);
      if (!same) {
        throw commandError('failed-precondition', 'This request id was already used for a different responsibility command.', 'conflict');
      }
      const reply = prior.get('reply');
      if (typeof reply !== 'object' || reply === null) {
        throw commandError('failed-precondition', 'This responsibility request has no replayable result.', 'conflict');
      }
      if (reply.status === 'stale') return reply;
      return { ...(reply as Record<string, unknown>), status: 'replayed' };
    }

    const [instance, instances, players] = await Promise.all([
      tx.get(instanceRef), tx.get(instancesRef), tx.get(db.collection(`sessions/${responsibility.sessionId}/players`)),
    ]);
    requireCastingWindow(authority.session);
    if (!instance.exists) throw new HttpsError('not-found', 'No such facilitator instance.');
    const liveInstances = liveGmInstanceDocs(instances.docs, players.docs);
    if (setupRevision(authority.session) !== responsibility.expectedSetupRevision) {
      const reply = {
        status: 'stale' as const,
        requestId: responsibility.requestId,
        entity: 'facilitator' as const,
        expectedRevision: responsibility.expectedSetupRevision,
        currentRevision: setupRevision(authority.session),
      };
      tx.set(requestRef, {
        ...fingerprint,
        requestId: responsibility.requestId,
        expectedSetupRevision: responsibility.expectedSetupRevision,
        fingerprint, reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(markerRef, { fingerprint: markerFingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }

    const targetInstanceId = responsibility.targetInstanceId ?? responsibility.instanceId;
    if (
      liveInstances.length > 1 &&
      (responsibility.mode === 'share' || responsibility.mode === 'handoff') &&
      responsibility.targetInstanceId === undefined
    ) {
      throw new HttpsError('invalid-argument', 'targetInstanceId is required when multiple facilitator instances are active.');
    }
    const targetRecord = instances.docs.find((candidate) => candidate.id === targetInstanceId);
    if (!targetRecord) throw new HttpsError('not-found', 'No such target facilitator instance.');
    const target = liveInstances.find((candidate) => candidate.id === targetInstanceId);
    if (!target) {
      throw commandError('failed-precondition', 'The target facilitator instance is no longer active.', 'conflict');
    }
    const onlyInstance = liveInstances.length === 1;
    if (onlyInstance && responsibility.mode === 'drop') {
      throw commandError('failed-precondition', 'The sole active facilitator must carry both printed responsibilities.', 'conflict');
    }

    const nextByInstance = new Map<string, FacilitatorResponsibility[]>(
      liveInstances.map((candidate) => [candidate.id, normalizedResponsibilities(candidate)]),
    );
    const current = nextByInstance.get(instance.id) ?? [];
    if (onlyInstance) {
      nextByInstance.set(instance.id, ['main', 'assistant']);
    } else if (responsibility.mode === 'drop') {
      nextByInstance.set(
        instance.id,
        current.filter((lane) => lane !== responsibility.responsibility),
      );
    } else if (responsibility.mode === 'share') {
      const targetResponsibilities = nextByInstance.get(target.id) ?? [];
      nextByInstance.set(target.id, [...new Set([...targetResponsibilities, responsibility.responsibility])]);
    } else {
      for (const [candidateId, lanes] of nextByInstance) {
        nextByInstance.set(candidateId, lanes.filter((lane) => lane !== responsibility.responsibility));
      }
      nextByInstance.set(target.id, [
        ...new Set([...(nextByInstance.get(target.id) ?? []), responsibility.responsibility]),
      ]);
    }

    for (const candidate of liveInstances) {
      const responsibilities = nextByInstance.get(candidate.id) ?? [];
      const legacyResponsibility = responsibilities[0] ?? null;
      tx.update(candidate.ref, {
        responsibilities,
        // Keep the singular field for legacy clients; the array is authoritative.
        responsibility: legacyResponsibility,
      });
    }

    const nextRevision = responsibility.expectedSetupRevision + 1;
    const nextInstances = liveInstances.map((candidate) => ({
      ...candidate,
      get: (field: string) => field === 'responsibilities'
        ? nextByInstance.get(candidate.id) ?? []
        : field === 'responsibility'
          ? (nextByInstance.get(candidate.id)?.[0] ?? null)
          : candidate.get(field),
    } as DocumentSnapshot));
    const reply = {
      status: 'committed' as const,
      requestId: responsibility.requestId,
      setupRevision: nextRevision,
      responsibilities: nextByInstance.get(instance.id) ?? [],
      coverage: responsibilityCoverage(nextInstances),
    };
    tx.update(sessionRef, {
      setupRevision: nextRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'gm-responsibility',
      payload: {
        action: 'set-facilitator-responsibility',
        actorUid: uid,
        requestId: responsibility.requestId,
        expectedSetupRevision: responsibility.expectedSetupRevision,
        revision: nextRevision,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(requestRef, {
      ...fingerprint,
      requestId: responsibility.requestId,
      expectedSetupRevision: responsibility.expectedSetupRevision,
      fingerprint,
      reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(markerRef, { fingerprint: markerFingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

/** Start a ready casting roster exactly once through an active facilitator. */
type StartRequestFingerprint = {
  readonly sessionId: string;
  readonly requestId: string;
  readonly actorUid: string;
  readonly instanceId: string;
  readonly expectedSetupRevision: number;
};

function sameStartRequestFingerprint(
  value: unknown,
  expected: StartRequestFingerprint,
): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Object.entries(expected).every(([key, item]) => candidate[key] === item);
}

function startLoyaltyRecord(
  secret: DocumentSnapshot,
  uid: string,
  roleId: string,
) {
  const payload = secret.get('payload');
  if (!hasExactPrivateSecretAudience(secret, uid) ||
      typeof payload !== 'object' || payload === null || Array.isArray(payload) ||
      (payload as Record<string, unknown>).type !== 'loyalty') {
    return { uid, roleId, kind: '', suspicion: null };
  }
  const value = payload as Record<string, unknown>;
  return {
    uid,
    roleId,
    kind: typeof value.kind === 'string' ? value.kind : '',
    suspicion: typeof value.suspicion === 'number' || value.suspicion === null
      ? value.suspicion
      : null,
    ...(typeof value.partnerUid === 'string' ? { partnerUid: value.partnerUid } : {}),
  };
}

/** Start a ready casting roster exactly once through an active facilitator. */
export const startGame = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const start = requireGameStartRequest(request.data ?? {});
  const fingerprint: StartRequestFingerprint = {
    sessionId: start.sessionId,
    requestId: start.requestId,
    actorUid: uid,
    instanceId: start.instanceId,
    expectedSetupRevision: start.expectedSetupRevision,
  };
  const sessionRef = db.doc(`sessions/${start.sessionId}`);
  const startRequestRef = db.doc(`sessionStartRequests/${start.sessionId}_${start.requestId}`);
  const markerRef = commandReceiptRef(start.sessionId, start.requestId);
  const eventRef = db.doc(`sessions/${start.sessionId}/events/start-${start.requestId}`);
  const playersRef = db.collection(`sessions/${start.sessionId}/players`);
  const instancesRef = db.collection(`sessions/${start.sessionId}/gmInstances`);
  const seatsRef = db.collection(`sessions/${start.sessionId}/seats`);
  const secretsRef = db.collection(`sessions/${start.sessionId}/secrets`);
  const fleetGroupRefForStart = fleetGroupRef(start.sessionId);
  const censusRef = db.doc(`sessions/${start.sessionId}/loyaltyCensus/current`);
  const missionDeckRef = db.doc(`sessions/${start.sessionId}/serverState/missionDeck`);
  const craftOwnershipManifestRef = db.doc(`sessions/${start.sessionId}/craftOwnership/manifest`);
  const markerFingerprint: CommandFingerprint = {
    action: 'start-game',
    sessionId: start.sessionId,
    requestId: start.requestId,
    actorUid: uid,
    instanceId: start.instanceId,
    expectedRevision: start.expectedSetupRevision,
    payload: {},
  };
  // Keep one candidate for the whole transaction invocation. Firestore may
  // retry a transaction callback; retries must not manufacture a new order.
  let candidateMissionDeck: MissionDeckState | undefined;

  return db.runTransaction(async (tx) => {
    const [prior, marker, authority, players, instances, seats, secrets, legacyEvent, craftOwnershipManifest, census, missionDeckSnapshot, storedGroup] = await Promise.all([
      tx.get(startRequestRef),
      tx.get(markerRef),
      requireFacilitatorInstance(tx, start.sessionId, uid, start.instanceId),
      tx.get(playersRef),
      tx.get(instancesRef),
      tx.get(seatsRef),
      tx.get(secretsRef),
      tx.get(eventRef),
      tx.get(craftOwnershipManifestRef),
      tx.get(censusRef),
      tx.get(missionDeckRef),
      tx.get(fleetGroupRefForStart),
    ]);
    await rejectForeignLegacyM1Command(
      tx, start.sessionId, start.requestId, 'start', [startRequestRef.path, eventRef.path],
    );
    if (hasCompatibleCommandMarker(marker, markerFingerprint, 'start') && !prior.exists) {
      throw commandError('failed-precondition', 'This start request has a marker without a replayable receipt.', 'conflict');
    }
    if (!prior.exists && legacyEvent.exists) rejectLegacyEventReplay('start');
    if (prior.exists) {
      if (!sameStartRequestFingerprint(prior.get('fingerprint'), fingerprint)) {
        throw commandError('failed-precondition', 'This request id was already used for a different start payload or actor.', 'conflict');
      }
      const result = prior.get('reply');
      if (typeof result === 'object' && result !== null) {
        if ((result as Record<string, unknown>).status === 'stale') return result;
        // A replay is the same committed result with a truthful disposition.
        // Never recompute private identities, clocks, or setup writes here.
        return { ...(result as Record<string, unknown>), status: 'replayed' };
      }
      throw commandError('failed-precondition', 'This start request has no replayable result.', 'conflict');
    }
    if (setupRevision(authority.session) !== start.expectedSetupRevision) {
      const reply = {
        status: 'stale' as const,
        sessionId: start.sessionId,
        requestId: start.requestId,
        expectedSetupRevision: start.expectedSetupRevision,
        currentSetupRevision: setupRevision(authority.session),
      };
      tx.set(startRequestRef, {
        sessionId: start.sessionId,
        requestId: start.requestId,
        actorUid: uid,
        instanceId: start.instanceId,
        expectedSetupRevision: start.expectedSetupRevision,
        fingerprint,
        reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(markerRef, { fingerprint: markerFingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }
    const persistedMissionDeck = missionDeckSnapshot.exists
      ? parseMissionDeckState(missionDeckSnapshot.data())
      : null;
    if (missionDeckSnapshot.exists && !persistedMissionDeck) {
      throw commandError('failed-precondition', 'Start blocked: mission-deck.', 'conflict');
    }
    requireCastingWindow(authority.session);
    const persistedActiveRoleIds = authority.session.get('activeRoleIds');
    const activeRoleIds = Array.isArray(persistedActiveRoleIds)
      ? configuredRoleIds(authority.session)
      : [];
    const lockedSetup = canonicalSetupForSession(authority.session, activeRoleIds);
    const expectedCraftManifest = roleOwnedCraftManifestForSetup(
      lockedSetup.activeRoleIds,
      vesselModeForConfiguration(lockedSetup),
    );
    if (craftOwnershipManifest.exists &&
        !roleOwnedCraftManifestMatches(craftOwnershipManifest.data(), expectedCraftManifest)) {
      throw commandError(
        'failed-precondition',
        'Start blocked: craft-ownership.',
        'conflict',
      );
    }
    const connectedPlayerDocs = players.docs.filter(isActivePlayer);
    const connectedPlayers = connectedPlayerDocs.map((player) => player.id);
    const activePressHolders = connectedPlayerDocs.filter(isAuthoritativePressHolder);
    const storedPressHolderUid = authority.session.get('pressHolderUid');
    const pressPlayerUids = activePressHolders.map((player) => player.id);
    const facilitatorPlayerUids = connectedPlayerDocs
      .filter((player) => player.get('role') === 'gm')
      .map((player) => player.id);
    const assignments = players.docs.flatMap((player) => {
      const roleId = player.get('assignedRoleId');
      return typeof roleId === 'string' ? [{ uid: player.id, roleId }] : [];
    });
    const pressEnabled = authority.session.get('pressEnabled') !== false;
    const claimedPressPlayerUids = pressEnabled && pressPlayerUids.length === 1 &&
      (storedPressHolderUid === undefined || storedPressHolderUid === pressPlayerUids[0])
      ? pressPlayerUids
      : [];
    const coreAssignments = assignments.filter((assignment) =>
      assignment.roleId !== 'press-officer' && !facilitatorPlayerUids.includes(assignment.uid));
    const holderByUid = new Map(coreAssignments.map((assignment) => [assignment.uid, assignment.roleId]));
    for (const pressUid of claimedPressPlayerUids) holderByUid.set(pressUid, 'press-officer');
    const holders = [...holderByUid.entries()].map(([holderUid, roleId]) => ({ uid: holderUid, roleId }));
    const loyaltySecrets = secrets.docs.filter((secret) => secret.id.startsWith('loyalty-'));
    const loyaltyUids = loyaltySecrets.map((secret) => secret.id.slice('loyalty-'.length));
    const seatDocuments = (seats.docs ?? []).map((seat) => ({
      id: seat.id,
      roleId: seat.get('roleId'),
      label: seat.get('label'),
      factionId: seat.get('factionId'),
      status: seat.get('status'),
      holderUid: seat.get('holderUid'),
      claimedAt: seat.get('claimedAt'),
    })).filter((seat): seat is {
      id: string; roleId: string; label: string; factionId: string;
      status: 'open' | 'claimed' | 'locked'; holderUid: string | null;
      claimedAt: string | number | Date | null | undefined;
    } => typeof seat.roleId === 'string' &&
      typeof seat.label === 'string' && typeof seat.factionId === 'string' &&
      (seat.status === 'open' || seat.status === 'claimed' || seat.status === 'locked') &&
      (typeof seat.holderUid === 'string' || seat.holderUid === null));
    const playerSeatPointers = connectedPlayerDocs
      .filter((player) => !facilitatorPlayerUids.includes(player.id) && !pressPlayerUids.includes(player.id))
      .map((player) => ({ uid: player.id, seatId: typeof player.get('seatId') === 'string' ? player.get('seatId') : null }));
    const liveGmInstances = instances.docs.map((instance) => {
      const owner = connectedPlayerDocs.find((player) => player.id === instance.get('uid'));
      const storedLastSeen = gmInstanceLeaseTimestamp(instance);
      return {
        id: instance.id,
        uid: typeof instance.get('uid') === 'string' ? instance.get('uid') as string : '',
        connected: instance.get('connected') !== false && owner?.get('role') === 'gm',
        lastSeenAt: storedLastSeen,
        responsibilities: normalizedResponsibilities(instance),
      };
    });
    const playerCount = lockedSetup.playerCount;
    const canonicalRosterIds = [...recommendedRoleIds(playerCount)];
    const configuredVesselIds = authority.session.get('activeVesselIds');
    const activeVesselIds = Array.isArray(configuredVesselIds)
      ? configuredVesselIds.filter((value): value is string => typeof value === 'string')
      : [];
    const setupNowMs = Date.now();
    const effectiveLiveGmInstances = liveGmInstances.filter((instance) =>
      isLiveSetupGm(instance, setupNowMs));
    // Older sessions stored only one printed lane on their sole GM instance.
    // The authorized start transaction upgrades that legacy record durably so
    // later reads do not have to infer the second lane forever.
    if (effectiveLiveGmInstances.length === 1) {
      const sole = instances.docs.find((instance) => instance.id === effectiveLiveGmInstances[0]?.id);
      if (sole && !Array.isArray(sole.get('responsibilities'))) {
        const legacyResponsibility = sole.get('responsibility');
        tx.update(sole.ref, {
          responsibilities: ['main', 'assistant'],
          responsibility: legacyResponsibility === 'assistant' ? 'assistant' : 'main',
        });
      }
    }
    const readiness = readinessForSetup({
      phase: String(authority.session.get('phase')),
      playerCount,
      connectedPlayers,
      assignments,
      loyaltyUids,
      facilitatorResponsibilities: { main: true, assistant: true },
      activeRoleIds,
      activeVesselIds,
      pressPlayerUids,
      pressEnabled: authority.session.get('pressEnabled') !== false,
      pressHolderUid: typeof storedPressHolderUid === 'string' ? storedPressHolderUid : null,
      facilitatorPlayerUids,
      seatDocuments,
      playerSeatPointers,
      gmInstances: liveGmInstances,
      nowMs: setupNowMs,
    });
    if (!readiness.ready) {
      throw commandError(
        'failed-precondition',
        `Start blocked: ${readiness.reasons.join(', ')}.`,
        'conflict',
      );
    }

    const storedShuttleDockings = authority.session.get('shuttleDockings');
    const currentDockingsForManifest = Array.isArray(storedShuttleDockings)
      ? storedShuttleDockings as Array<{ shuttleId: string; shipId: string }>
      : initialShuttleDockingsForRoles(lockedSetup.activeRoleIds);
    const startingCraftManifest = craftStartingManifestForSetup(
      lockedSetup.activeRoleIds,
      vesselModeForConfiguration(lockedSetup),
      currentDockingsForManifest,
    );
    if (!shuttleDockingsAreParked(currentDockingsForManifest, lockedSetup.activeVesselIds) ||
        !shuttleDockingsMatchRoleOwnedCraft(lockedSetup.activeRoleIds, currentDockingsForManifest) ||
        !craftStartingManifestMatches(
          startingCraftManifest,
          startingCraftManifest,
          lockedSetup.activeVesselIds,
        )) {
      throw commandError(
        'failed-precondition',
        'Start blocked: craft-starting-manifest.',
        'malformed-input',
      );
    }
    const persistedStartingCraft = craftOwnershipManifest.exists
      ? craftOwnershipManifest.get('startingCraft')
      : undefined;
    const persistedStartingCraftMatches = persistedStartingCraft !== undefined &&
      craftStartingManifestMatches(
        persistedStartingCraft,
        startingCraftManifest,
        lockedSetup.activeVesselIds,
      );
    const persistedStartingCraftHasLegacyPlaceholder = persistedStartingCraft !== undefined &&
      !persistedStartingCraftMatches &&
      craftStartingManifestHasUnresolvedHosts(persistedStartingCraft, startingCraftManifest);
    if (persistedStartingCraft !== undefined &&
        !persistedStartingCraftMatches && !persistedStartingCraftHasLegacyPlaceholder) {
      throw commandError(
        'failed-precondition',
        'Start blocked: craft-starting-manifest.',
        'conflict',
      );
    }

    const routineWolf = deriveRoutineWolfAssignment({
      playerCount,
      occupiedCoreRoleIds: canonicalRosterIds.filter((roleId) =>
        coreAssignments.some((assignment) => assignment.roleId === roleId)),
      pressEnabled,
      claimedPressRoleId: claimedPressPlayerUids.length === 1 ? 'press-officer' : null,
      randomIndex: randomInt,
    });
    const explicitRecords = loyaltySecrets.map((secret) => {
      const uidForSecret = secret.id.slice('loyalty-'.length);
      return startLoyaltyRecord(secret, uidForSecret, holderByUid.get(uidForSecret) ?? '');
    });
    let loyaltyAssignments: Readonly<Record<string, { kind: LoyaltyKind; suspicion: number | null }>>;
    let selectedWolfRoleIds = [...routineWolf.selectedRoleIds];
    let loyaltySource: 'automatic-default' | 'explicit-preserved';
    if (explicitRecords.length === 0 &&
      (lockedSetup.universalArbourEnabled || lockedSetup.wolfCultEnabled)) {
      throw commandError(
        'failed-precondition',
        'Start blocked: loyalties-optional-conflicting.',
        'conflict',
      );
    }
    if (explicitRecords.length === 0) {
      loyaltyAssignments = composeDefaultLoyaltyAssignments(holders, routineWolf.selectedRoleIds, randomInt);
      loyaltySource = 'automatic-default';
    } else {
      const validation = validateExplicitLoyaltySetup(holders, explicitRecords, lockedSetup);
      if (!validation.valid) {
        throw commandError('failed-precondition', `Start blocked: loyalties-${validation.reason}.`, 'conflict');
      }
      const explicitWolfRoles = holders
        .filter((holder) => {
          const kind = validation.assignments[holder.uid]?.kind;
          return kind === 'wolf-agent' || kind === 'wolf-cult';
        })
        .map((holder) => holder.roleId);
      if (explicitWolfRoles.length !== routineWolf.wolfCount) {
        throw commandError('failed-precondition', 'Start blocked: loyalties-conflicting-wolf-count.', 'conflict');
      }
      const roleOrder = new Map(canonicalRosterIds.map((roleId, index) => [roleId, index]));
      selectedWolfRoleIds = [...explicitWolfRoles].sort((left, right) =>
        (roleOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (roleOrder.get(right) ?? Number.MAX_SAFE_INTEGER));
      loyaltyAssignments = validation.assignments;
      loyaltySource = 'explicit-preserved';
    }

    // Do not draw randomness until every start precondition has passed. The
    // candidate is still shared across callback retries and only the first
    // successful transaction persists it.
    const missionDeckState = persistedMissionDeck ?? (candidateMissionDeck ??=
      missionDeckStateFromCards(shuffledMissionDeck()));

    const initialGroup = ensureInitialFleetGroup(
      tx,
      start.sessionId,
      lockedSetup.activeVesselIds,
      activeFleetGroupMemberUids(players.docs),
      storedGroup,
      players.docs,
    );

    const committedSetupRevision = start.expectedSetupRevision + 1;
    const initialPursuitGroups = { [initialGroup.id]: 2 };
    tx.set(navigationStateRef(start.sessionId), {
      pursuitGroups: initialPursuitGroups,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(gmDiscoveryProjectionRef(start.sessionId), {
      pursuitGroups: initialPursuitGroups,
      shipFleetGroupIds: Object.fromEntries(initialGroup.vesselIds.map((shipId) => [shipId, initialGroup.id])),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    for (const player of players.docs) {
      if (!player.exists || isKickedPlayer(player)) continue;
      tx.set(playerDiscoveryProjectionRef(start.sessionId, player.id), {
        groupId: initialGroup.id,
        pursuitValue: 2,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    const gmUids = [...new Set(effectiveLiveGmInstances
      .map((instance) => instance.uid))];
    const serverTime = new Date().toISOString();
    const setupReceipt = {
      source: 'routine-start',
      playerCount,
      universalArbourEnabled: lockedSetup.universalArbourEnabled,
      wolfCultEnabled: lockedSetup.wolfCultEnabled,
      mode: vesselModeForConfiguration(lockedSetup),
      rosterIds: canonicalRosterIds,
      pressEligibility: {
        enabled: authority.session.get('pressEnabled') !== false,
        activeClaimCount: activePressHolders.length,
        claimed: claimedPressPlayerUids.length === 1,
      },
      excludedGmCount: players.docs.filter((player) => player.get('role') === 'gm').length,
      wolfCount: routineWolf.wolfCount,
      wolfRule: routineWolf.rule,
      selectedWolfRoleIds,
      eligibleRoleIds: [...routineWolf.eligibleRoleIds],
      orderedModifiers: [],
      roleOwnedCraft: expectedCraftManifest.roleOwnedCraft,
      startingCraft: startingCraftManifest,
      resultCount: holders.length,
      loyaltySource,
      request: fingerprint,
      expectedSetupRevision: start.expectedSetupRevision,
      committedSetupRevision,
      actorUid: uid,
      serverTime,
      event: 'game-started',
    } as const;
    for (const holder of holders) {
      const privateBrief = serializedRoleBrief(
        start.sessionId,
        holder.uid,
        holder.roleId,
        committedSetupRevision,
        {
          capybaraExpansion: lockedSetup.expansion === 'capybara',
          activeRoleIds: lockedSetup.activeRoleIds,
        },
      );
      if (!privateBrief) {
        throw commandError('failed-precondition', 'Start blocked: brief-unavailable.', 'malformed-input');
      }
      tx.set(db.doc(`sessions/${start.sessionId}/roleBriefs/${holder.uid}`), privateBrief);
      if (loyaltySource === 'automatic-default') {
        const assignment = loyaltyAssignments[holder.uid];
        if (!assignment) throw commandError('failed-precondition', 'Start blocked: loyalties-missing-result.', 'unavailable-service');
        tx.set(db.doc(`sessions/${start.sessionId}/secrets/loyalty-${holder.uid}`), {
          visibleToUids: [holder.uid],
          payload: { type: 'loyalty', ...assignment },
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
    setLoyaltyCensusEntries(
      tx,
      start.sessionId,
      committedSetupRevision,
      holders.flatMap((holder) => {
        const assignment = loyaltyAssignments[holder.uid];
        return assignment
          ? [{ uid: holder.uid, kind: assignment.kind, suspicion: assignment.suspicion }]
          : [];
      }),
      census,
    );
    tx.set(db.doc(`sessions/${start.sessionId}/secrets/wolf-assignment`), {
      visibleToUids: gmUids,
      payload: { type: 'wolf-assignment', roleIds: selectedWolfRoleIds },
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${start.sessionId}/secrets/setup-receipt-${start.requestId}`), {
      visibleToUids: gmUids,
      payload: { type: 'setup-receipt', ...setupReceipt },
      createdAt: FieldValue.serverTimestamp(),
    });
    if (!craftOwnershipManifest.exists || persistedStartingCraft === undefined ||
        persistedStartingCraftHasLegacyPlaceholder) {
      tx.set(craftOwnershipManifestRef, {
        ...expectedCraftManifest,
        startingCraft: startingCraftManifest,
        setupRevision: committedSetupRevision,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (!persistedMissionDeck) {
      tx.set(missionDeckRef, {
        ...missionDeckState,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    const turnOneState = atomicStartState({
      activeVesselIds,
      shipDamage: authority.session.get('shipDamage'),
      maintenanceCycles: authority.session.get('maintenanceCycles'),
      fighterWingCounts: authority.session.get('fighterWingCounts'),
      fleetRedAlert: authority.session.get('fleetRedAlert'),
      pressDispatch: authority.session.get('pressDispatch'),
    });
    const transition = advanceTurnInTransaction(tx, sessionRef, start.sessionId, authority.session, false, {
      phase: 'active',
      configurationLocked: true,
      setupRevision: committedSetupRevision,
      pursuitGroups: removeLegacyNavigationField(),
      ...turnOneState,
    });
    const result = {
      status: 'committed' as const,
      sessionId: start.sessionId,
      requestId: start.requestId,
      currentTurn: transition.currentTurn,
      setupRevision: committedSetupRevision,
      turnStartAnnouncement: transition.turnStartAnnouncement,
      turnPhase: transition.turnPhase,
      ...(transition.turnState ? { turnState: transition.turnState } : {}),
      setupReceipt,
    };
    tx.set(startRequestRef, {
      sessionId: start.sessionId,
      requestId: start.requestId,
      actorUid: uid,
      instanceId: start.instanceId,
      expectedSetupRevision: start.expectedSetupRevision,
      fingerprint,
      reply: result,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(markerRef, { fingerprint: markerFingerprint, result, createdAt: FieldValue.serverTimestamp() });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'game-started',
      payload: {
        actorUid: uid,
        requestId: start.requestId,
        turn: 1,
        phase: 'active',
        revision: result.setupRevision,
        expectedSetupRevision: start.expectedSetupRevision,
        craftIds: expectedCraftManifest.roleOwnedCraft.map((craft) => craft.id),
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    return result;
  });
});

type AwayMissionDealReply = Readonly<{
  status: 'committed' | 'replayed' | 'stale';
  sessionId: string;
  requestId: string;
  missionId: string;
  participantCount: number;
  expectedSetupRevision: number;
  currentSetupRevision?: number;
}>;

function isAwayMissionDealReply(value: unknown, sessionId: string): value is AwayMissionDealReply {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const reply = value as Record<string, unknown>;
  return reply.sessionId === sessionId &&
    (reply.status === 'committed' || reply.status === 'replayed' || reply.status === 'stale') &&
    typeof reply.requestId === 'string' && typeof reply.missionId === 'string' &&
    Number.isSafeInteger(reply.participantCount) && (reply.participantCount as number) > 0 &&
    Number.isSafeInteger(reply.expectedSetupRevision) && (reply.expectedSetupRevision as number) >= 0 &&
    (reply.currentSetupRevision === undefined ||
      (Number.isSafeInteger(reply.currentSetupRevision) && (reply.currentSetupRevision as number) >= 0));
}

/** Deal one private initial card to an explicitly selected away-mission roster. */
export const dealPrivateInitialCards = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
  missionId?: unknown;
  participantUids?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const command = requireAwayMissionCardDealRequest(request.data ?? {});
  const markerRef = commandReceiptRef(command.sessionId, command.requestId);
  const eventRef = db.doc(`sessions/${command.sessionId}/events/mission-cards-dealt-${command.requestId}`);
  const playersRef = db.collection(`sessions/${command.sessionId}/players`);
  const craftOwnershipManifestRef = db.doc(`sessions/${command.sessionId}/craftOwnership/manifest`);
  const missionDeckRef = db.doc(`sessions/${command.sessionId}/serverState/missionDeck`);
  const missionRef = db.doc(
    `sessions/${command.sessionId}/serverState/awayMissions/instances/${command.missionId}`,
  );
  const markerFingerprint: CommandFingerprint = {
    action: 'deal-private-initial-cards',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid: uid,
    instanceId: command.instanceId,
    expectedRevision: command.expectedSetupRevision,
    payload: {
      missionId: command.missionId,
      participantUids: command.participantUids,
    },
  };

  return db.runTransaction(async (tx) => {
    const [marker, authority, players, craftOwnershipManifest, missionDeckSnapshot, missionSnapshot, eventSnapshot] =
      await Promise.all([
        tx.get(markerRef),
        requireFacilitatorInstance(tx, command.sessionId, uid, command.instanceId),
        tx.get(playersRef),
        tx.get(craftOwnershipManifestRef),
        tx.get(missionDeckRef),
        tx.get(missionRef),
        tx.get(eventRef),
      ]);
    await rejectForeignLegacyM1Command(
      tx,
      command.sessionId,
      command.requestId,
      'away-mission-deal',
      [eventRef.path],
    );
    if (!marker.exists && eventSnapshot.exists) rejectLegacyEventReplay('away-mission-deal');
    if (hasCompatibleCommandMarker(marker, markerFingerprint, 'away-mission-deal')) {
      const result = marker.get('result');
      if (!isAwayMissionDealReply(result, command.sessionId)) {
        throw commandError('failed-precondition', 'This away-mission deal has no replayable result.', 'conflict');
      }
      return { ...result, status: 'replayed' as const };
    }

    const currentSetupRevision = setupRevision(authority.session);
    if (currentSetupRevision !== command.expectedSetupRevision) {
      const reply: AwayMissionDealReply = {
        status: 'stale',
        sessionId: command.sessionId,
        requestId: command.requestId,
        missionId: command.missionId,
        participantCount: command.participantUids.length,
        expectedSetupRevision: command.expectedSetupRevision,
        currentSetupRevision,
      };
      tx.set(markerRef, {
        fingerprint: markerFingerprint,
        result: reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      return reply;
    }
    if (authority.session.get('phase') !== 'active') {
      throw commandError(
        'failed-precondition',
        'Away-mission cards require an active game.',
        'invalid-phase',
      );
    }
    const activeRoleIds = sessionActiveRoleIds(authority.session);
    const lockedSetup = canonicalSetupForSession(authority.session, activeRoleIds);
    const expectedCraftManifest = roleOwnedCraftManifestForSetup(
      lockedSetup.activeRoleIds,
      vesselModeForConfiguration(lockedSetup),
    );
    if (!craftOwnershipManifest.exists ||
        !roleOwnedCraftManifestMatches(craftOwnershipManifest.data(), expectedCraftManifest)) {
      throw commandError(
        'failed-precondition',
        'Away-mission deal blocked: craft-ownership.',
        'conflict',
      );
    }

    if (missionSnapshot.exists) {
      throw commandError(
        'failed-precondition',
        'That away-mission identity already has a dealt hand.',
        'conflict',
      );
    }

    const playersByUid = new Map(players.docs.map((player) => [player.id, player]));
    const participants: AwayMissionParticipantSnapshot[] = [];
    for (const participantUid of command.participantUids) {
      const player = playersByUid.get(participantUid);
      const roleId = player?.get('assignedRoleId');
      const sourceCraftIds = typeof roleId === 'string' ? awayMissionCraftForRole(roleId) : [];
      const manifestCraftIds = typeof roleId === 'string'
        ? expectedCraftManifest.roleOwnedCraft
          .filter((craft) => craft.ownerRoleId === roleId)
          .map((craft) => craft.id)
        : [];
      if (!player || !isActivePlayer(player) || player.get('role') !== 'player' ||
          typeof roleId !== 'string' || !activeRoleIds.includes(roleId) ||
          sourceCraftIds.length === 0 ||
          sourceCraftIds.some((craftId) => !manifestCraftIds.includes(craftId))) {
        throw commandError(
          'failed-precondition',
          `Selected participant ${participantUid} is not an eligible away-mission craft owner.`,
          'conflict',
        );
      }
      participants.push({
        uid: participantUid,
        roleId,
        craftIds: [...sourceCraftIds],
      });
    }

    const persistedDeck = missionDeckSnapshot.exists
      ? parseMissionDeckState(missionDeckSnapshot.data())
      : null;
    if (!persistedDeck) {
      throw commandError('failed-precondition', 'Away-mission deal blocked: mission-deck.', 'conflict');
    }
    const dealtCount = missionDeckDealtCount(missionDeckSnapshot.data(), persistedDeck.order.length);
    if (dealtCount === null) {
      throw commandError('failed-precondition', 'Away-mission deal blocked: mission-deck cursor.', 'conflict');
    }
    const allocations = allocateMissionCards(persistedDeck, dealtCount, participants);
    if (allocations === null) {
      throw commandError(
        'failed-precondition',
        'The away-mission deck is depleted for this participant selection.',
        'conflict',
      );
    }

    const reply: AwayMissionDealReply = {
      status: 'committed',
      sessionId: command.sessionId,
      requestId: command.requestId,
      missionId: command.missionId,
      participantCount: participants.length,
      expectedSetupRevision: command.expectedSetupRevision,
    };
    tx.set(missionRef, {
      schemaVersion: 1,
      phase: 'awaiting-card-selection',
      revision: 0,
      discardedParticipantUids: [],
      discardedCardIds: [],
      missionId: command.missionId,
      requestId: command.requestId,
      actorUid: uid,
      participantSnapshots: participants,
      handIds: participants.map((participant) => awayMissionHandId(command.missionId, participant.uid)),
      cardIds: allocations.map(({ card }) => card.id),
      dealtFrom: dealtCount,
      dealtThrough: dealtCount + allocations.length,
      createdAt: FieldValue.serverTimestamp(),
    });
    for (const allocation of allocations) {
      const handId = awayMissionHandId(command.missionId, allocation.participant.uid);
      tx.set(db.doc(`sessions/${command.sessionId}/awayMissionHands/${handId}`), {
        type: 'away-mission-hand',
        sessionId: command.sessionId,
        handId,
        missionId: command.missionId,
        participantUid: allocation.participant.uid,
        cardId: allocation.card.id,
        rank: allocation.card.rank,
        suit: allocation.card.suit,
        value: allocation.card.value,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(db.doc(`sessions/${command.sessionId}/awayMissionHandPointers/${handId}`), {
        type: 'away-mission-hand-pointer',
        sessionId: command.sessionId,
        participantUid: allocation.participant.uid,
        missionId: command.missionId,
        handId,
        phase: 'awaiting-card-selection',
        revision: 0,
        discarded: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.update(missionDeckRef, {
      dealtCount: dealtCount + allocations.length,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'mission-cards-dealt',
      payload: {},
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(markerRef, {
      fingerprint: markerFingerprint,
      result: reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
});

type AwayMissionDiscardReadyReply = Readonly<{
  status: 'committed' | 'replayed' | 'stale';
  sessionId: string;
  requestId: string;
  missionId: string;
  participantCount: number;
  expectedSetupRevision: number;
  currentSetupRevision?: number;
}>;

function isAwayMissionDiscardReadyReply(value: unknown, sessionId: string): value is AwayMissionDiscardReadyReply {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const reply = value as Record<string, unknown>;
  return reply.sessionId === sessionId &&
    (reply.status === 'committed' || reply.status === 'replayed' || reply.status === 'stale') &&
    typeof reply.requestId === 'string' && typeof reply.missionId === 'string' &&
    Number.isSafeInteger(reply.participantCount) && (reply.participantCount as number) >= 0 &&
    ((reply.status === 'stale' || (reply.participantCount as number) > 0) ||
      (reply.status === 'replayed' && (reply.participantCount as number) === 0 &&
        Number.isSafeInteger(reply.currentSetupRevision) &&
        reply.currentSetupRevision !== reply.expectedSetupRevision)) &&
    Number.isSafeInteger(reply.expectedSetupRevision) && (reply.expectedSetupRevision as number) >= 0 &&
    (reply.currentSetupRevision === undefined ||
      (Number.isSafeInteger(reply.currentSetupRevision) && (reply.currentSetupRevision as number) >= 0));
}

/** Record that the facilitator has finished extra-card selection and players may discard. */
export const openPrivateMissionDiscards = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
  missionId?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const command = requireAwayMissionDiscardReadyRequest(request.data ?? {});
  const markerRef = commandReceiptRef(command.sessionId, command.requestId);
  const eventRef = db.doc(`sessions/${command.sessionId}/events/mission-discards-opened-${command.requestId}`);
  const missionRef = db.doc(
    `sessions/${command.sessionId}/serverState/awayMissions/instances/${command.missionId}`,
  );
  const markerFingerprint: CommandFingerprint = {
    action: 'open-private-mission-discards',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid: uid,
    instanceId: command.instanceId,
    expectedRevision: command.expectedSetupRevision,
    payload: { missionId: command.missionId },
  };

  return db.runTransaction(async (tx) => {
    const [marker, authority, missionSnapshot, eventSnapshot] = await Promise.all([
      tx.get(markerRef),
      requireFacilitatorInstance(tx, command.sessionId, uid, command.instanceId),
      tx.get(missionRef),
      tx.get(eventRef),
    ]);
    await rejectForeignLegacyM1Command(
      tx,
      command.sessionId,
      command.requestId,
      'away-mission-discard-ready',
      [eventRef.path],
    );
    if (!marker.exists && eventSnapshot.exists) rejectLegacyEventReplay('away-mission-discard-ready');
    if (hasCompatibleCommandMarker(marker, markerFingerprint, 'away-mission-discard-ready')) {
      const result = marker.get('result');
      if (!isAwayMissionDiscardReadyReply(result, command.sessionId)) {
        throw commandError('failed-precondition', 'This discard-ready command has no replayable result.', 'conflict');
      }
      return { ...result, status: 'replayed' as const };
    }

    const currentSetupRevision = setupRevision(authority.session);
    if (currentSetupRevision !== command.expectedSetupRevision) {
      const reply: AwayMissionDiscardReadyReply = {
        status: 'stale',
        sessionId: command.sessionId,
        requestId: command.requestId,
        missionId: command.missionId,
        participantCount: 0,
        expectedSetupRevision: command.expectedSetupRevision,
        currentSetupRevision,
      };
      tx.set(markerRef, {
        fingerprint: markerFingerprint,
        result: reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      return reply;
    }
    if (authority.session.get('phase') !== 'active') {
      throw commandError('failed-precondition', 'Away-mission cards require an active game.', 'invalid-phase');
    }
    if (!missionSnapshot.exists || missionSnapshot.get('missionId') !== command.missionId) {
      throw commandError('failed-precondition', 'That away-mission identity is unavailable.', 'conflict');
    }
    if (missionSnapshot.get('phase') !== 'awaiting-card-selection') {
      throw commandError(
        'failed-precondition',
        'The facilitator must finish extra-card selection before opening private discards.',
        'conflict',
      );
    }
    const participants = awayMissionParticipantSnapshots(missionSnapshot.get('participantSnapshots'));
    const storedHandIds = missionSnapshot.get('handIds');
    if (!participants || !Array.isArray(storedHandIds) || storedHandIds.length !== participants.length ||
        storedHandIds.some((handId) => typeof handId !== 'string')) {
      throw commandError('failed-precondition', 'The away-mission hand roster is malformed.', 'malformed-input');
    }
    const revision = missionSnapshot.get('revision');
    if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
      throw commandError('failed-precondition', 'The away-mission revision is malformed.', 'malformed-input');
    }
    const reply: AwayMissionDiscardReadyReply = {
      status: 'committed',
      sessionId: command.sessionId,
      requestId: command.requestId,
      missionId: command.missionId,
      participantCount: participants.length,
      expectedSetupRevision: command.expectedSetupRevision,
    };
    tx.update(missionRef, {
      phase: 'discarding',
      revision: (revision as number) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    participants.forEach((participant, index) => {
      const handId = storedHandIds[index];
      tx.set(db.doc(`sessions/${command.sessionId}/awayMissionHandPointers/${handId}`), {
        type: 'away-mission-hand-pointer',
        sessionId: command.sessionId,
        participantUid: participant.uid,
        missionId: command.missionId,
        handId: storedHandIds[index],
        phase: 'discarding',
        revision: (revision as number) + 1,
        discarded: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'mission-discards-opened',
      payload: {},
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(markerRef, {
      fingerprint: markerFingerprint,
      result: reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
});

type AwayMissionCardDiscardReply = Readonly<{
  status: 'committed' | 'replayed' | 'stale';
  sessionId: string;
  requestId: string;
  missionId: string;
  expectedSetupRevision: number;
  currentSetupRevision?: number;
}>;

function isAwayMissionCardDiscardReply(value: unknown, sessionId: string): value is AwayMissionCardDiscardReply {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const reply = value as Record<string, unknown>;
  return reply.sessionId === sessionId &&
    (reply.status === 'committed' || reply.status === 'replayed' || reply.status === 'stale') &&
    typeof reply.requestId === 'string' && typeof reply.missionId === 'string' &&
    Number.isSafeInteger(reply.expectedSetupRevision) && (reply.expectedSetupRevision as number) >= 0 &&
    (reply.currentSetupRevision === undefined ||
      (Number.isSafeInteger(reply.currentSetupRevision) && (reply.currentSetupRevision as number) >= 0));
}

function awayMissionParticipantSnapshots(
  value: unknown,
): readonly (Record<string, unknown> & { readonly uid: string })[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const seen = new Set<string>();
  const snapshots: (Record<string, unknown> & { readonly uid: string })[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.uid !== 'string' || candidate.uid.length === 0 ||
        seen.has(candidate.uid)) return null;
    seen.add(candidate.uid);
    snapshots.push(candidate as Record<string, unknown> & { readonly uid: string });
  }
  return snapshots;
}

function awayMissionStringLedger(value: unknown): readonly string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const ledger: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== 'string' || candidate.length === 0 || seen.has(candidate)) return null;
    seen.add(candidate);
    ledger.push(candidate);
  }
  return ledger;
}

/** Secretly consume one participant-owned card before opportunity assignment. */
export const discardPrivateMissionCard = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
  missionId?: unknown;
  cardId?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const command = requireAwayMissionCardDiscardRequest(request.data ?? {});
  const markerRef = commandReceiptRef(command.sessionId, command.requestId);
  const eventRef = db.doc(`sessions/${command.sessionId}/events/mission-card-discarded-${command.requestId}`);
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const playerRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
  const missionRef = db.doc(
    `sessions/${command.sessionId}/serverState/awayMissions/instances/${command.missionId}`,
  );
  const handId = awayMissionHandId(command.missionId, uid);
  const handRef = db.doc(`sessions/${command.sessionId}/awayMissionHands/${handId}`);
  const pointerRef = db.doc(`sessions/${command.sessionId}/awayMissionHandPointers/${handId}`);
  const markerFingerprint: CommandFingerprint = {
    action: 'discard-private-mission-card',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: command.expectedSetupRevision,
    payload: { missionId: command.missionId, cardId: command.cardId },
  };

  return db.runTransaction(async (tx) => {
    const [marker, session, player, missionSnapshot, handSnapshot, pointerSnapshot, eventSnapshot] = await Promise.all([
      tx.get(markerRef),
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(missionRef),
      tx.get(handRef),
      tx.get(pointerRef),
      tx.get(eventRef),
    ]);
    await rejectForeignLegacyM1Command(
      tx,
      command.sessionId,
      command.requestId,
      'away-mission-discard',
      [eventRef.path],
    );
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player) || player.get('role') !== 'player') {
      throw new HttpsError('permission-denied', 'Join the session before discarding a mission card.');
    }
    if (!marker.exists && eventSnapshot.exists) rejectLegacyEventReplay('away-mission-discard');
    if (hasCompatibleCommandMarker(marker, markerFingerprint, 'away-mission-discard')) {
      const result = marker.get('result');
      if (!isAwayMissionCardDiscardReply(result, command.sessionId)) {
        throw commandError('failed-precondition', 'This away-mission discard has no replayable result.', 'conflict');
      }
      return { ...result, status: 'replayed' as const };
    }

    const currentSetupRevision = setupRevision(session);
    if (currentSetupRevision !== command.expectedSetupRevision) {
      const reply: AwayMissionCardDiscardReply = {
        status: 'stale',
        sessionId: command.sessionId,
        requestId: command.requestId,
        missionId: command.missionId,
        expectedSetupRevision: command.expectedSetupRevision,
        currentSetupRevision,
      };
      tx.set(markerRef, {
        fingerprint: markerFingerprint,
        result: reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      return reply;
    }
    if (session.get('phase') !== 'active') {
      throw commandError(
        'failed-precondition',
        'Away-mission cards require an active game.',
        'invalid-phase',
      );
    }
    if (!missionSnapshot.exists || missionSnapshot.get('missionId') !== command.missionId) {
      throw commandError('failed-precondition', 'That away-mission hand is unavailable.', 'conflict');
    }
    if (missionSnapshot.get('phase') !== 'discarding') {
      throw commandError(
        'failed-precondition',
        'The facilitator has not opened private discards for this away mission.',
        'conflict',
      );
    }
    const participants = awayMissionParticipantSnapshots(missionSnapshot.get('participantSnapshots'));
    if (!participants) {
      throw commandError('failed-precondition', 'The away-mission participant snapshot is malformed.', 'malformed-input');
    }
    const participant = participants.find((candidate) => candidate.uid === uid);
    if (!participant) {
      throw new HttpsError('permission-denied', 'Only a current mission participant may discard that hand.');
    }
    if (!pointerSnapshot.exists || pointerSnapshot.get('sessionId') !== command.sessionId ||
        pointerSnapshot.get('participantUid') !== uid || pointerSnapshot.get('missionId') !== command.missionId ||
        pointerSnapshot.get('handId') !== handId || pointerSnapshot.get('phase') !== 'discarding' ||
        pointerSnapshot.get('discarded') === true) {
      throw commandError('failed-precondition', 'Your private mission hand is not ready for a discard.', 'conflict');
    }
    const storedHandIds = missionSnapshot.get('handIds');
    if (!Array.isArray(storedHandIds) || !storedHandIds.includes(handId)) {
      throw commandError('failed-precondition', 'The away-mission hand is not part of this mission.', 'malformed-input');
    }
    if (!handSnapshot.exists || handSnapshot.get('sessionId') !== command.sessionId ||
        handSnapshot.get('missionId') !== command.missionId ||
        handSnapshot.get('participantUid') !== uid || handSnapshot.get('cardId') !== command.cardId) {
      throw commandError('failed-precondition', 'That private card is not owned by this participant.', 'conflict');
    }
    if (handSnapshot.get('discarded') === true ||
        (handSnapshot.get('discardedAt') !== undefined && handSnapshot.get('discardedAt') !== null)) {
      throw commandError('failed-precondition', 'This private card has already been discarded.', 'conflict');
    }
    const discardedParticipantUids = awayMissionStringLedger(missionSnapshot.get('discardedParticipantUids'));
    const discardedCardIds = awayMissionStringLedger(missionSnapshot.get('discardedCardIds'));
    if (!discardedParticipantUids || !discardedCardIds) {
      throw commandError('failed-precondition', 'The away-mission discard ledger is malformed.', 'malformed-input');
    }
    if (discardedParticipantUids.includes(uid) || discardedCardIds.includes(command.cardId)) {
      throw commandError('failed-precondition', 'This participant has already discarded a mission card.', 'conflict');
    }
    const nextDiscardedParticipantUids = [...discardedParticipantUids, uid];
    const nextDiscardedCardIds = [...discardedCardIds, command.cardId];
    const allParticipantsDiscarded = participants.every(({ uid: participantUid }) =>
      nextDiscardedParticipantUids.includes(participantUid));
    const currentMissionRevision = missionSnapshot.get('revision');
    const revision = currentMissionRevision === undefined
      ? 0
      : Number.isSafeInteger(currentMissionRevision) && (currentMissionRevision as number) >= 0
        ? currentMissionRevision as number
        : null;
    if (revision === null) {
      throw commandError('failed-precondition', 'The away-mission revision is malformed.', 'malformed-input');
    }
    const reply: AwayMissionCardDiscardReply = {
      status: 'committed',
      sessionId: command.sessionId,
      requestId: command.requestId,
      missionId: command.missionId,
      expectedSetupRevision: command.expectedSetupRevision,
    };
    tx.update(handRef, {
      discarded: true,
      discardedAt: FieldValue.serverTimestamp(),
    });
    tx.update(missionRef, {
      phase: allParticipantsDiscarded ? 'assignment-ready' : 'discarding',
      discardedParticipantUids: nextDiscardedParticipantUids,
      discardedCardIds: nextDiscardedCardIds,
      revision: revision + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(pointerRef, {
      phase: allParticipantsDiscarded ? 'assignment-ready' : 'discarding',
      revision: revision + 1,
      discarded: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (allParticipantsDiscarded) {
      participants.forEach((candidate) => {
        if (candidate.uid === uid) return;
        tx.update(db.doc(`sessions/${command.sessionId}/awayMissionHandPointers/${awayMissionHandId(command.missionId, candidate.uid)}`), {
          phase: 'assignment-ready',
          revision: revision + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    }
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'mission-card-discarded',
      payload: {},
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(markerRef, {
      fingerprint: markerFingerprint,
      result: reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
});

/** Save a nonbinding vessel preference without implying an assignment. */
export const setShipPreference = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  shipId?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const preference = requireCastingPreferenceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${preference.sessionId}`);
  const playerRef = db.doc(`sessions/${preference.sessionId}/players/${uid}`);
  const eventRef = db.doc(`sessions/${preference.sessionId}/events/${preference.requestId}`);
  const receiptRef = commandReceiptRef(preference.sessionId, preference.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'set-ship-preference',
    sessionId: preference.sessionId,
    requestId: preference.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: null,
    payload: { shipId: preference.shipId },
  };

  return db.runTransaction(async (tx): Promise<CastingMutationResult> => {
    const [session, player, receipt, legacyEvent] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(receiptRef), tx.get(eventRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    await rejectForeignLegacyM1Command(
      tx, preference.sessionId, preference.requestId, 'preference', [eventRef.path],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is CastingMutationResult => isCastingMutationResult(value, preference.sessionId),
      'preference',
    );
    if (replay) return replay;
    if (legacyEvent.exists) rejectLegacyEventReplay('preference');
    requireCastingWindow(session);
    const lockedSetup = canonicalSetupForSession(session, configuredRoleIds(session));
    const activeVessels = lockedSetup.activeVesselIds;
    if (!activeVessels.includes(preference.shipId)) {
      throw commandError('failed-precondition', 'That vessel is not active in this roster.', 'conflict');
    }
    const result = {
      sessionId: preference.sessionId,
      setupRevision: setupRevision(session) + 1,
    } satisfies CastingMutationResult;
    tx.update(playerRef, { shipPreferenceId: preference.shipId });
    tx.update(sessionRef, {
      phase: 'casting',
      setupRevision: result.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'casting-preference',
      payload: {
        actorUid: uid,
        shipId: preference.shipId,
        requestId: preference.requestId,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** Assign one printed role during the unlocked casting window. */
export const assignRole = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
  roleId?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const assignment = requireRoleAssignmentRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${assignment.sessionId}`);
  const eventRef = db.doc(`sessions/${assignment.sessionId}/events/${assignment.requestId}`);
  const receiptRef = commandReceiptRef(assignment.sessionId, assignment.requestId);
  const playersRef = db.collection(`sessions/${assignment.sessionId}/players`);
  const fingerprint: CommandFingerprint = {
    action: 'assign-role',
    sessionId: assignment.sessionId,
    requestId: assignment.requestId,
    actorUid: uid,
    instanceId: assignment.instanceId,
    expectedRevision: null,
    payload: { targetUid: assignment.targetUid, roleId: assignment.roleId },
  };

  return db.runTransaction(async (tx): Promise<CastingMutationResult> => {
    const [receipt, legacyEvent, authority, target, players] = await Promise.all([
      tx.get(receiptRef),
      tx.get(eventRef),
      requireFacilitatorInstance(tx, assignment.sessionId, uid, assignment.instanceId),
      tx.get(db.doc(`sessions/${assignment.sessionId}/players/${assignment.targetUid}`)),
      tx.get(playersRef),
    ]);
    await rejectForeignLegacyM1Command(
      tx, assignment.sessionId, assignment.requestId, 'role assignment', [eventRef.path],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is CastingMutationResult => isCastingMutationResult(value, assignment.sessionId),
      'role assignment',
    );
    if (replay) return replay;
    if (legacyEvent.exists) rejectLegacyEventReplay('role assignment');
    requireCastingWindow(authority.session);
    if (!isActivePlayer(target) || target.get('role') === 'observer') {
      throw commandError('failed-precondition', 'That player is not eligible for casting.', 'conflict');
    }
    if (
      hasPressState(target) || hasPressSeat(target) ||
      authority.session.get('pressHolderUid') === assignment.targetUid
    ) {
      throw commandError(
        'failed-precondition',
        'Release the player\'s Press station before assigning a core role.',
        'conflict',
      );
    }
    const storedSeatId = target.get('seatId');
    const targetSeatRef = typeof storedSeatId === 'string' && storedSeatId.length > 0
      ? db.doc(`sessions/${assignment.sessionId}/seats/${storedSeatId}`)
      : undefined;
    const targetSeat = targetSeatRef ? await tx.get(targetSeatRef) : undefined;
    if (targetSeatRef) {
      const canonicalHeldSeat = targetSeat?.exists &&
        targetSeat.get('roleId') === storedSeatId &&
        targetSeat.get('status') === 'claimed' &&
        targetSeat.get('holderUid') === assignment.targetUid;
      if (!canonicalHeldSeat || storedSeatId !== assignment.roleId) {
        throw commandError(
          'failed-precondition',
          'Release the player\'s current station before assigning a different core role.',
          'unavailable-service',
        );
      }
    }
    const activeRoleIds = configuredRoleIds(authority.session);
    const lockedSetup = canonicalSetupForSession(authority.session, activeRoleIds);
    const assignments = players.docs.filter((member) => !isKickedPlayer(member)).flatMap((member) => {
      const roleId = member.get('assignedRoleId');
      return typeof roleId === 'string' ? [{ uid: member.id, roleId }] : [];
    });
    const decision = roleAssignmentDecision(
      assignments,
      assignment.targetUid,
      assignment.roleId,
      activeRoleIds,
    );
    if (!decision.allowed) {
      throw commandError('failed-precondition', `Role assignment rejected: ${decision.reason}.`, 'conflict');
    }
    const result = {
      sessionId: assignment.sessionId,
      setupRevision: setupRevision(authority.session) + 1,
    } satisfies CastingMutationResult;
    const privateBrief = serializedRoleBrief(
      assignment.sessionId,
      assignment.targetUid,
      assignment.roleId,
      result.setupRevision,
      {
        capybaraExpansion: lockedSetup.expansion === 'capybara',
        activeRoleIds: lockedSetup.activeRoleIds,
        voyage33Admitted: publicVoyage33Admission(authority.session.get('voyage33Admission'), assignment.sessionId) !== undefined,
      },
    );
    if (!privateBrief) {
      throw commandError('failed-precondition', 'Role assignment rejected: brief-unavailable.', 'malformed-input');
    }
    tx.update(target.ref, { assignedRoleId: assignment.roleId, activeConsoleRoleId: null });
    tx.set(db.doc(`sessions/${assignment.sessionId}/roleBriefs/${assignment.targetUid}`), privateBrief);
    tx.update(sessionRef, {
      phase: 'casting',
      setupRevision: result.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'role-assignment',
      payload: {
        actorUid: uid,
        targetUid: assignment.targetUid,
        roleId: assignment.roleId,
        requestId: assignment.requestId,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** Release a role before start so the facilitator can reassign it cleanly. */
export const releaseRole = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const release = requireRoleReleaseRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${release.sessionId}`);
  const eventRef = db.doc(`sessions/${release.sessionId}/events/${release.requestId}`);
  const receiptRef = commandReceiptRef(release.sessionId, release.requestId);
  const targetSecretRef = db.doc(`sessions/${release.sessionId}/secrets/loyalty-${release.targetUid}`);
  const targetBriefRef = db.doc(`sessions/${release.sessionId}/roleBriefs/${release.targetUid}`);
  const playersRef = db.collection(`sessions/${release.sessionId}/players`);
  const secretsRef = db.collection(`sessions/${release.sessionId}/secrets`);
  const censusRef = db.doc(`sessions/${release.sessionId}/loyaltyCensus/current`);
  const fingerprint: CommandFingerprint = {
    action: 'release-role',
    sessionId: release.sessionId,
    requestId: release.requestId,
    actorUid: uid,
    instanceId: release.instanceId,
    expectedRevision: null,
    payload: { targetUid: release.targetUid },
  };

  return db.runTransaction(async (tx): Promise<CastingMutationResult> => {
    const [receipt, legacyEvent, authority] = await Promise.all([
      tx.get(receiptRef),
      tx.get(eventRef),
      requireFacilitatorInstance(tx, release.sessionId, uid, release.instanceId),
    ]);
    await rejectForeignLegacyM1Command(
      tx, release.sessionId, release.requestId, 'role release', [eventRef.path],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is CastingMutationResult => isCastingMutationResult(value, release.sessionId),
      'role release',
    );
    if (replay) return { sessionId: replay.sessionId, setupRevision: replay.setupRevision };
    if (legacyEvent.exists) rejectLegacyEventReplay('role release');
    const [target, targetSecret, players, secrets, census] = await Promise.all([
      tx.get(db.doc(`sessions/${release.sessionId}/players/${release.targetUid}`)),
      tx.get(targetSecretRef),
      tx.get(playersRef),
      tx.get(secretsRef),
      tx.get(censusRef),
    ]);
    const storedSeatId = target.get('seatId');
    const targetSeatRef = typeof storedSeatId === 'string' && storedSeatId.length > 0
      ? db.doc(`sessions/${release.sessionId}/seats/${storedSeatId}`)
      : undefined;
    const targetSeat = targetSeatRef ? await tx.get(targetSeatRef) : undefined;
    let partnerSecretRef: DocumentReference | undefined;
    const partnerUid = privateFriendPartnerUid(targetSecret, release.targetUid);
    if (partnerUid) {
      partnerSecretRef = db.doc(`sessions/${release.sessionId}/secrets/loyalty-${partnerUid}`);
    }
    const partnerSecret = partnerSecretRef ? await tx.get(partnerSecretRef) : undefined;
    requireCastingWindow(authority.session);
    canonicalSetupForSession(authority.session, configuredRoleIds(authority.session));
    if (!isActivePlayer(target)) throw commandError('failed-precondition', 'That player is not eligible for casting.', 'conflict');
    if (
      !hasCoreAssignment(target) || hasPressState(target) || hasPressSeat(target) ||
      authority.session.get('pressHolderUid') === release.targetUid
    ) {
      throw commandError(
        'failed-precondition',
        'Only a player with an assigned core role can be released through casting.',
        'conflict',
      );
    }
    if (targetSeatRef && targetSeat) {
      const assignedRoleId = target.get('assignedRoleId');
      const roleMatchesSeat = assignedRoleId === null || assignedRoleId === undefined ||
        assignedRoleId === '' || assignedRoleId === storedSeatId;
      const canonicalSeat = roleMatchesSeat && targetSeat.get('roleId') === storedSeatId;
      const targetOwnsSeat = targetSeat.get('status') === 'claimed' &&
        targetSeat.get('holderUid') === release.targetUid;
      const openSeat = targetSeat.get('status') === 'open' && targetSeat.get('holderUid') === null;
      if (!canonicalSeat || (!targetOwnsSeat && !openSeat)) {
        throw commandError(
          'failed-precondition',
          'The player role and station records do not agree; refresh before releasing the role.',
          'unavailable-service',
        );
      }
    }
    const result = {
      sessionId: release.sessionId,
      setupRevision: setupRevision(authority.session) + 1,
    } satisfies CastingMutationResult;
    tx.update(target.ref, { assignedRoleId: null, activeConsoleRoleId: null, seatId: null });
    if (targetSeatRef && targetSeat?.exists && targetSeat.get('status') === 'claimed') {
      tx.update(targetSeatRef, { status: 'open', holderUid: null, claimedAt: null });
    }
    tx.delete(targetBriefRef);
    // Role release and loyalty cleanup commit together. Reading the private
    // record above also makes a concurrent assignment retry against this
    // transaction instead of leaving a stale hidden faction behind.
    if (targetSecret.exists) tx.delete(targetSecretRef);
    const removedUids = new Map<string, LoyaltyCensusEntry | null>([
      [release.targetUid, null],
    ]);
    if (partnerSecret?.exists && partnerSecretRef && partnerUid) {
      const reciprocal = privateFriendPartnerUid(partnerSecret, partnerUid) === release.targetUid;
      if (reciprocal) {
        tx.delete(partnerSecretRef);
        removedUids.set(partnerUid, null);
      }
    }
    setLoyaltyCensusFromSecrets(
      tx,
      release.sessionId,
      result.setupRevision,
      secrets.docs ?? [],
      players.docs,
      configuredRoleIds(authority.session),
      removedUids,
      census,
    );
    tx.update(sessionRef, { setupRevision: result.setupRevision, updatedAt: FieldValue.serverTimestamp() });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'role-release',
      payload: {
        actorUid: uid,
        targetUid: release.targetUid,
        requestId: release.requestId,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type ReplacementMutationResultBase = {
  readonly sessionId: string;
  readonly targetUid: string;
  readonly revision: number;
  readonly setupRevision: number;
  readonly replacementRoleId?: string;
};

type ReplacementMutationResult = ReplacementMutationResultBase & (
  | {
    readonly status: 'committed';
    readonly actorUid: string;
    readonly recordedAt: string;
  }
  | {
    readonly status: 'stale';
  }
);

type ReplayableReplacementMutationResult = ReplacementMutationResultBase & {
  readonly status: 'committed' | 'stale';
  readonly actorUid?: unknown;
  readonly recordedAt?: unknown;
};

function isReplayableReplacementMutationResult(
  value: unknown,
  sessionId: string,
): value is ReplayableReplacementMutationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.sessionId === sessionId &&
    (result.status === 'committed' || result.status === 'stale') &&
    typeof result.targetUid === 'string' &&
    Number.isSafeInteger(result.revision) && (result.revision as number) >= 0 &&
    Number.isSafeInteger(result.setupRevision) && (result.setupRevision as number) >= 0 &&
    (result.replacementRoleId === undefined || typeof result.replacementRoleId === 'string');
}

function receiptRecordedAt(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('toDate' in value) ||
      typeof value.toDate !== 'function') return undefined;
  const date = value.toDate();
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function replayReplacementMutation(
  receipt: DocumentSnapshot,
  fingerprint: CommandFingerprint,
  sessionId: string,
  label: string,
): ReplacementMutationResult | null {
  const replay = replayBoundCommand(
    receipt,
    fingerprint,
    (value): value is ReplayableReplacementMutationResult =>
      isReplayableReplacementMutationResult(value, sessionId),
    label,
  );
  if (!replay) return null;
  if (replay.status === 'stale') return {
    status: 'stale',
    sessionId: replay.sessionId,
    targetUid: replay.targetUid,
    revision: replay.revision,
    setupRevision: replay.setupRevision,
    ...(replay.replacementRoleId ? { replacementRoleId: replay.replacementRoleId } : {}),
  };
  const recordedAt = typeof replay.recordedAt === 'string' && Number.isFinite(Date.parse(replay.recordedAt))
    ? replay.recordedAt
    : receiptRecordedAt(receipt.get('createdAt'));
  if (!recordedAt) {
    throw commandError('failed-precondition', `This ${label} request has no replayable decision time.`, 'conflict');
  }
  return { ...replay, actorUid: fingerprint.actorUid, recordedAt };
}

function replacementRevision(snapshot: DocumentSnapshot): number {
  const value = snapshot.get('revision');
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function replacementVesselIds(session: DocumentSnapshot): readonly string[] {
  const persisted = session.get('activeVesselIds');
  if (!Array.isArray(persisted) || persisted.length === 0 ||
      persisted.some((value) => !isWireSafeEntityId(value)) ||
      new Set(persisted).size !== persisted.length) {
    return [];
  }
  return [...persisted] as string[];
}

function replacementRoleIsOccupied(
  players: readonly DocumentSnapshot[],
  targetUid: string,
  role: ReplacementRoleDefinition,
): boolean {
  return players.some((player) => {
    if (player.id === targetUid) return false;
    const assignedRoleId = player.get('replacementRoleId');
    if (assignedRoleId === role.id) return true;
    const assigned = typeof assignedRoleId === 'string'
      ? replacementRoleFor(assignedRoleId)
      : undefined;
    return role.vesselId !== undefined && assigned?.vesselId === role.vesselId;
  });
}

/** Record the facilitator's explicit live eligibility decision. */
export const setReplacementEligibility = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
  reason?: unknown;
  expectedRevision?: unknown;
  expectedSetupRevision?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const decision = requireReplacementEligibilityRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${decision.sessionId}`);
  const targetRef = db.doc(`sessions/${decision.sessionId}/players/${decision.targetUid}`);
  const eligibilityRef = db.doc(`sessions/${decision.sessionId}/replacementEligibility/${decision.targetUid}`);
  const receiptRef = commandReceiptRef(decision.sessionId, decision.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'set-replacement-eligibility', sessionId: decision.sessionId,
    requestId: decision.requestId, actorUid: uid, instanceId: decision.instanceId,
    expectedRevision: decision.expectedRevision,
    payload: {
      targetUid: decision.targetUid, reason: decision.reason,
      expectedSetupRevision: decision.expectedSetupRevision,
    },
  };
  return db.runTransaction(async (tx): Promise<ReplacementMutationResult> => {
    const [authority, target, eligibility, receipt] = await Promise.all([
      requireFacilitatorInstance(tx, decision.sessionId, uid, decision.instanceId),
      tx.get(targetRef), tx.get(eligibilityRef), tx.get(receiptRef),
    ]);
    const replay = replayReplacementMutation(
      receipt, fingerprint, decision.sessionId, 'replacement eligibility',
    );
    if (replay) return replay;
    requireActiveGameplayPhase(authority.session);
    if (!target.exists || target.get('role') !== 'player') {
      throw commandError('failed-precondition', 'Only a player record can receive replacement eligibility.', 'conflict');
    }
    if (setupRevision(authority.session) !== decision.expectedSetupRevision) {
      const stale = {
        status: 'stale' as const, sessionId: decision.sessionId,
        targetUid: decision.targetUid, revision: replacementRevision(eligibility),
        setupRevision: setupRevision(authority.session),
      } satisfies ReplacementMutationResult;
      tx.set(receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const currentRevision = replacementRevision(eligibility);
    if (currentRevision !== decision.expectedRevision) {
      const stale = {
        status: 'stale' as const, sessionId: decision.sessionId,
        targetUid: decision.targetUid, revision: currentRevision,
        setupRevision: setupRevision(authority.session),
      } satisfies ReplacementMutationResult;
      tx.set(receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const result = {
      status: 'committed' as const, sessionId: decision.sessionId,
      targetUid: decision.targetUid, revision: currentRevision + 1,
      setupRevision: setupRevision(authority.session) + 1,
      actorUid: uid, recordedAt: new Date().toISOString(),
    } satisfies ReplacementMutationResult;
    tx.set(eligibilityRef, {
      sessionId: decision.sessionId, targetUid: decision.targetUid,
      reason: decision.reason, eligible: true, revision: result.revision,
      actorUid: uid, requestId: decision.requestId,
      recordedAt: result.recordedAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(sessionRef, { setupRevision: result.setupRevision, updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc(`sessions/${decision.sessionId}/replacementEligibility/${decision.targetUid}/audit/${decision.requestId}`), {
      sessionId: decision.sessionId, targetUid: decision.targetUid,
      reason: decision.reason, revision: result.revision, actorUid: uid,
      requestId: decision.requestId, recordedAt: result.recordedAt,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** Assign one source-defined replacement role after an explicit eligibility decision. */
export const assignReplacementRole = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
  replacementRoleId?: unknown;
  expectedRevision?: unknown;
  expectedSetupRevision?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const assignment = requireReplacementAssignmentRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${assignment.sessionId}`);
  const targetRef = db.doc(`sessions/${assignment.sessionId}/players/${assignment.targetUid}`);
  const targetSecretRef = db.doc(`sessions/${assignment.sessionId}/secrets/loyalty-${assignment.targetUid}`);
  const eligibilityRef = db.doc(`sessions/${assignment.sessionId}/replacementEligibility/${assignment.targetUid}`);
  const receiptRef = commandReceiptRef(assignment.sessionId, assignment.requestId);
  const eventRef = db.doc(`sessions/${assignment.sessionId}/events/${assignment.requestId}`);
  const fingerprint: CommandFingerprint = {
    action: 'assign-replacement-role', sessionId: assignment.sessionId,
    requestId: assignment.requestId, actorUid: uid, instanceId: assignment.instanceId,
    expectedRevision: assignment.expectedRevision,
    payload: {
      targetUid: assignment.targetUid, replacementRoleId: assignment.replacementRoleId,
      expectedSetupRevision: assignment.expectedSetupRevision,
    },
  };
  return db.runTransaction(async (tx): Promise<ReplacementMutationResult> => {
    const authority = await requireFacilitatorInstance(tx, assignment.sessionId, uid, assignment.instanceId);
    const [target, eligibility, players, receipt, targetSecret] = await Promise.all([
      tx.get(targetRef), tx.get(eligibilityRef),
      tx.get(db.collection(`sessions/${assignment.sessionId}/players`)), tx.get(receiptRef),
      tx.get(targetSecretRef),
    ]);
    const replay = replayReplacementMutation(
      receipt, fingerprint, assignment.sessionId, 'replacement assignment',
    );
    if (replay) return replay;
    requireActiveGameplayPhase(authority.session);
    if (setupRevision(authority.session) !== assignment.expectedSetupRevision) {
      const stale = {
        status: 'stale' as const, sessionId: assignment.sessionId,
        targetUid: assignment.targetUid, revision: replacementRevision(eligibility),
        setupRevision: setupRevision(authority.session),
      } satisfies ReplacementMutationResult;
      tx.set(receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const role = replacementRoleFor(assignment.replacementRoleId);
    const activeVesselIds = replacementVesselIds(authority.session);
    if (!role || !replacementRoleAvailable(assignment.replacementRoleId, {
      activeVesselIds, expansion: String(authority.session.get('expansion') ?? 'base'),
    })) {
      throw commandError('failed-precondition', 'That replacement role is not active in this session.', 'conflict');
    }
    if (!target.exists || target.get('role') !== 'player') {
      throw commandError('failed-precondition', 'Only a player record can receive a replacement role.', 'conflict');
    }
    const existingReplacementRoleId = target.get('replacementRoleId');
    const existingEscapeState = playerEscapeState(target);
    const replacingDestroyedShipHolder = typeof existingReplacementRoleId === 'string' &&
      existingEscapeState !== undefined &&
      replacementRoleFor(existingReplacementRoleId)?.vesselId === existingEscapeState.shipId;
    if (typeof existingReplacementRoleId === 'string' && !replacingDestroyedShipHolder) {
      throw commandError('failed-precondition', 'This player already has an active replacement role.', 'conflict');
    }
    if (replacingDestroyedShipHolder && existingEscapeState && role.vesselId === existingEscapeState.shipId) {
      throw commandError(
        'failed-precondition',
        'Choose a replacement role away from the destroyed ship.',
        'conflict',
      );
    }
    const currentRevision = replacementRevision(eligibility);
    if (eligibility.get('eligible') !== true || currentRevision !== assignment.expectedRevision) {
      throw commandError('failed-precondition', 'The player has no matching live replacement eligibility decision.', 'stale-revision');
    }
    if (replacementRoleIsOccupied(players.docs, assignment.targetUid, role)) {
      throw commandError('failed-precondition', 'That replacement role is already assigned.', 'conflict');
    }
    const storedSeatId = target.get('seatId');
    const targetSeatRef = typeof storedSeatId === 'string' && storedSeatId.length > 0
      ? db.doc(`sessions/${assignment.sessionId}/seats/${storedSeatId}`) : undefined;
    const targetSeat = targetSeatRef ? await tx.get(targetSeatRef) : undefined;
    if (targetSeatRef && (!targetSeat?.exists || targetSeat.get('holderUid') !== assignment.targetUid ||
        targetSeat.get('status') !== 'claimed')) {
      throw commandError('failed-precondition', 'The player station pointer is stale; repair it before replacement.', 'unavailable-service');
    }
    // A Friend counterpart may need the target's new replacement identity. Read
    // and update that private secret only for a complete reciprocal pair with
    // exact audiences; malformed or unrelated legacy records stay untouched.
    const friendPartnerUid = privateFriendPartnerUid(targetSecret, assignment.targetUid);
    const friendPartnerSecretRef = friendPartnerUid
      ? db.doc(`sessions/${assignment.sessionId}/secrets/loyalty-${friendPartnerUid}`)
      : undefined;
    const friendPartnerSecret = friendPartnerSecretRef ? await tx.get(friendPartnerSecretRef) : undefined;
    if (friendPartnerUid && friendPartnerSecretRef && isCompleteReciprocalFriendPair(
      targetSecret, assignment.targetUid, target.get('assignedRoleId'),
      friendPartnerSecret, friendPartnerUid, assignment.targetUid,
    )) {
      tx.update(friendPartnerSecretRef, { 'payload.partnerRoleId': assignment.replacementRoleId });
    }
    const result = {
      status: 'committed' as const, sessionId: assignment.sessionId,
      targetUid: assignment.targetUid, revision: currentRevision + 1,
      setupRevision: setupRevision(authority.session) + 1,
      replacementRoleId: assignment.replacementRoleId,
      actorUid: uid, recordedAt: new Date().toISOString(),
    } satisfies ReplacementMutationResult;
    const privateBrief = serializedRoleBrief(
      assignment.sessionId, assignment.targetUid, assignment.replacementRoleId,
      result.setupRevision, {
        capybaraExpansion: authority.session.get('expansion') === 'capybara',
        activeRoleIds: configuredRoleIds(authority.session),
        voyage33Admitted: publicVoyage33Admission(authority.session.get('voyage33Admission'), assignment.sessionId) !== undefined,
      },
    );
    if (!privateBrief) {
      throw commandError('failed-precondition', 'Replacement role brief is unavailable.', 'malformed-input');
    }
    const storedNavigation = await tx.get(navigationStateRef(assignment.sessionId));
    const navigation = navigationStateForSession(storedNavigation, authority.session, activeVesselIds);
    const rawNavigationRevision = storedNavigation.get('revision');
    const navigationRevision = typeof rawNavigationRevision === 'number' &&
      Number.isSafeInteger(rawNavigationRevision) && rawNavigationRevision >= 0 ? rawNavigationRevision : 0;
    writePlayerDiscoveryProjection(
      tx, playerDiscoveryProjectionRef(assignment.sessionId, assignment.targetUid),
      { get: (field: string) => field === 'replacementRoleId' ? assignment.replacementRoleId : target.get(field) },
      navigation, navigationRevision,
    );
    tx.update(targetRef, {
      replacementRoleId: assignment.replacementRoleId,
      activeConsoleRoleId: null,
      seatId: null,
      ...(target.get('escapeState') !== undefined ? { escapeState: null } : {}),
    });
    if (targetSeatRef) tx.update(targetSeatRef, { status: 'open', holderUid: null, claimedAt: null });
    tx.set(db.doc(`sessions/${assignment.sessionId}/roleBriefs/${assignment.targetUid}`), privateBrief);
    tx.set(eligibilityRef, {
      ...eligibility.data(), eligible: false, consumedAt: FieldValue.serverTimestamp(),
      replacementRoleId: assignment.replacementRoleId, consumedByRequestId: assignment.requestId,
      revision: result.revision, updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${assignment.sessionId}/replacementAssignments/${assignment.requestId}`), {
      sessionId: assignment.sessionId, targetUid: assignment.targetUid,
      sourceRoleId: typeof target.get('assignedRoleId') === 'string' ? target.get('assignedRoleId') : null,
      replacementRoleId: assignment.replacementRoleId, reason: eligibility.get('reason'),
      previousSeatId: storedSeatId ?? null, seatReleased: targetSeatRef !== undefined,
      loyaltyPreserved: true, actorUid: uid, requestId: assignment.requestId,
      revision: result.revision, setupRevision: result.setupRevision,
      recordedAt: result.recordedAt,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${assignment.sessionId}/replacementAssignments/${assignment.requestId}/audit/${assignment.requestId}`), {
      sessionId: assignment.sessionId, targetUid: assignment.targetUid,
      replacementRoleId: assignment.replacementRoleId, actorUid: uid,
      requestId: assignment.requestId, revision: result.revision,
      recordedAt: result.recordedAt,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(sessionRef, { setupRevision: result.setupRevision, updatedAt: FieldValue.serverTimestamp() });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'replacement-assignment',
      payload: { actorUid: uid, requestId: assignment.requestId, revision: result.revision },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type LoyaltyAssignmentFingerprint = Readonly<{
  action: 'assign-loyalty';
  sessionId: string;
  actorUid: string;
  instanceId: string;
  targetUid: string;
  kind: string;
  suspicion: number | null;
  partnerUid: string | null;
}>;

function loyaltyAssignmentFingerprint(
  assignment: ReturnType<typeof requireLoyaltyAssignmentRequest>,
  actorUid: string,
): LoyaltyAssignmentFingerprint {
  return {
    action: 'assign-loyalty',
    sessionId: assignment.sessionId,
    actorUid,
    instanceId: assignment.instanceId,
    targetUid: assignment.targetUid,
    kind: assignment.kind,
    suspicion: assignment.suspicion,
    partnerUid: assignment.partnerUid ?? null,
  };
}

function sameLoyaltyAssignmentFingerprint(
  value: unknown,
  expected: LoyaltyAssignmentFingerprint,
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.action === expected.action &&
    candidate.sessionId === expected.sessionId &&
    candidate.actorUid === expected.actorUid &&
    candidate.instanceId === expected.instanceId &&
    candidate.targetUid === expected.targetUid &&
    candidate.kind === expected.kind &&
    candidate.suspicion === expected.suspicion &&
    candidate.partnerUid === expected.partnerUid;
}

function isBoundLoyaltyAssignmentFingerprint(
  value: unknown,
): value is LoyaltyAssignmentFingerprint {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.action === 'assign-loyalty' &&
    typeof candidate.sessionId === 'string' && candidate.sessionId.length > 0 &&
    typeof candidate.actorUid === 'string' && candidate.actorUid.length > 0 &&
    typeof candidate.instanceId === 'string' && candidate.instanceId.length > 0 &&
    typeof candidate.targetUid === 'string' && candidate.targetUid.length > 0 &&
    typeof candidate.kind === 'string' && candidate.kind.length > 0 &&
    (candidate.suspicion === null ||
      (typeof candidate.suspicion === 'number' && Number.isFinite(candidate.suspicion))) &&
    (candidate.partnerUid === null ||
      (typeof candidate.partnerUid === 'string' && candidate.partnerUid.length > 0));
}

/** Keep the receipt's duplicated query fields bound to its replay fingerprint. */
function hasMatchingLoyaltyReceiptBinding(
  receipt: DocumentSnapshot,
  fingerprint: LoyaltyAssignmentFingerprint,
): boolean {
  return sameLoyaltyAssignmentFingerprint({
    action: receipt.get('action'),
    sessionId: receipt.get('sessionId'),
    actorUid: receipt.get('actorUid'),
    instanceId: receipt.get('instanceId'),
    targetUid: receipt.get('targetUid'),
    kind: receipt.get('kind'),
    suspicion: receipt.get('suspicion'),
    partnerUid: receipt.get('partnerUid'),
  }, fingerprint);
}

function isBoundLoyaltyAssignmentResult(
  value: unknown,
  fingerprint: LoyaltyAssignmentFingerprint,
): value is CastingMutationResult & { assignedUids: readonly string[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const assignedUids = candidate.assignedUids;
  const expectedUids = fingerprint.partnerUid
    ? [fingerprint.targetUid, fingerprint.partnerUid]
    : [fingerprint.targetUid];
  return candidate.sessionId === fingerprint.sessionId &&
    Number.isInteger(candidate.setupRevision) && (candidate.setupRevision as number) >= 0 &&
    Array.isArray(assignedUids) && assignedUids.length === expectedUids.length &&
    assignedUids.every((assignedUid, index) => assignedUid === expectedUids[index]);
}

function isCanonicalLoyaltyHolder(
  player: DocumentSnapshot | undefined,
  uid: string,
  players: readonly DocumentSnapshot[],
  activeRoleIds: readonly string[],
): boolean {
  if (!player || !player.exists || player.id !== uid || !isActivePlayer(player) || player.get('role') !== 'player') {
    return false;
  }
  const assignedRoleId = player.get('assignedRoleId');
  if (typeof assignedRoleId !== 'string' || !activeRoleIds.includes(assignedRoleId)) return false;
  // A loyalty secret must never attach to an ambiguous or stale role holder.
  return !players.some((candidate) => candidate.id !== uid &&
    !isKickedPlayer(candidate) && candidate.exists && candidate.get('assignedRoleId') === assignedRoleId);
}

/**
 * Census membership follows the persisted core role assignment, not transient
 * presence. A disconnected core player keeps their loyalty until an
 * authoritative release removes that assignment and secret.
 */
function isPersistedCanonicalLoyaltyHolder(
  player: DocumentSnapshot | undefined,
  uid: string,
  players: readonly DocumentSnapshot[],
  activeRoleIds: readonly string[],
): boolean {
  if (!player || !player.exists || isKickedPlayer(player) || player.id !== uid || player.get('role') !== 'player') return false;
  const assignedRoleId = player.get('assignedRoleId');
  if (typeof assignedRoleId !== 'string' || !activeRoleIds.includes(assignedRoleId)) return false;
  return !players.some((candidate) => candidate.id !== uid && !isKickedPlayer(candidate) &&
    candidate.exists && candidate.get('assignedRoleId') === assignedRoleId);
}

function requireCanonicalLoyaltyHolder(
  player: DocumentSnapshot | undefined,
  uid: string,
  players: readonly DocumentSnapshot[],
  activeRoleIds: readonly string[],
  label: string,
): void {
  if (isCanonicalLoyaltyHolder(player, uid, players, activeRoleIds)) return;
  throw commandError(
    'failed-precondition',
    `${label} must be an active non-GM holder of one unique role in the configured roster.`,
    'conflict',
  );
}

type CanonicalLoyaltySecret = Readonly<{
  uid: string;
  kind: LoyaltyKind;
}>;

type LoyaltyCensusEntry = Readonly<{
  uid: string;
  kind: LoyaltyKind;
  suspicion: number | null;
  note?: string;
}>;

function loyaltyCensusEntryFromSecret(
  secret: DocumentSnapshot,
  players: readonly DocumentSnapshot[],
  activeRoleIds: readonly string[],
): LoyaltyCensusEntry | null {
  if (!secret.exists || !secret.id.startsWith('loyalty-')) return null;
  const uid = secret.id.slice('loyalty-'.length);
  if (!uid || !hasExactPrivateSecretAudience(secret, uid)) return null;
  const holder = players.find((candidate) => candidate.id === uid);
  const eligibleCoreHolder = isPersistedCanonicalLoyaltyHolder(holder, uid, players, activeRoleIds);
  const eligiblePressHolder = Boolean(holder && isActivePlayer(holder) && holder.get('role') === 'player' && hasPressState(holder));
  if (!eligibleCoreHolder && !eligiblePressHolder) return null;
  const payload = secret.get('payload');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.type !== 'loyalty' || typeof record.kind !== 'string') return null;
  const suspicion = record.suspicion === null
    ? null
    : typeof record.suspicion === 'number' ? record.suspicion : Number.NaN;
  const decision = loyaltyAssignmentDecision(record.kind, suspicion);
  if (!decision.allowed) return null;
  if (record.kind !== 'friend' && record.partnerUid !== undefined && record.partnerUid !== null) return null;
  if (record.kind === 'friend' &&
      (typeof record.partnerUid !== 'string' || record.partnerUid === uid)) return null;
  return { uid, kind: record.kind as LoyaltyKind, suspicion: decision.suspicion };
}


function wolfCultIdentity(entries: readonly LoyaltyCensusEntry[]): { cultUid: string; agentUid: string } | null {
  const cults = entries.filter((entry) => entry.kind === 'wolf-cult');
  const agents = entries.filter((entry) => entry.kind === 'wolf-agent');
  return cults.length === 1 && agents.length === 1
    ? { cultUid: cults[0]!.uid, agentUid: agents[0]!.uid }
    : null;
}

function wolfCultHolderUids(entries: readonly LoyaltyCensusEntry[]): readonly string[] {
  return entries.filter((entry) => entry.kind === 'wolf-cult').map((entry) => entry.uid);
}

function setLoyaltyCensusFromSecrets(
  tx: Transaction,
  sessionId: string,
  revision: number,
  secrets: readonly DocumentSnapshot[],
  players: readonly DocumentSnapshot[],
  activeRoleIds: readonly string[],
  patches: ReadonlyMap<string, LoyaltyCensusEntry | null> = new Map(),
  previousCensus?: DocumentSnapshot,
): void {
  const previousNotes = censusNotesFromSnapshot(previousCensus);
  const previousRevision = previousCensus?.exists && Number.isSafeInteger(previousCensus.get('revision')) &&
    (previousCensus.get('revision') as number) >= 0
    ? previousCensus.get('revision') as number
    : -1;
  const censusRevision = Math.max(revision, previousRevision + 1);
  const entries = new Map<string, LoyaltyCensusEntry>();
  for (const secret of secrets) {
    const entry = loyaltyCensusEntryFromSecret(secret, players, activeRoleIds);
    if (entry) {
      const note = previousNotes.get(entry.uid);
      entries.set(entry.uid, note ? { ...entry, note } : entry);
    }
  }
  for (const [uid, entry] of patches) {
    if (entry) {
      const note = entry.note ?? previousNotes.get(uid);
      entries.set(uid, note ? { ...entry, note } : entry);
    }
    else entries.delete(uid);
  }
  const nextEntries = [...entries.values()].sort((left, right) => left.uid.localeCompare(right.uid));
  const previousEntries = storedLoyaltyCensusEntries(previousCensus) ?? [];
  const previousWolf = wolfCultIdentity(previousEntries);
  const nextWolf = wolfCultIdentity(nextEntries);
  const previousCultUid = previousWolf?.cultUid ?? null;
  const nextCultUid = nextWolf?.cultUid ?? null;
  tx.set(db.doc(`sessions/${sessionId}/loyaltyCensus/current`), {
    type: 'loyalty-census',
    revision: censusRevision,
    entries: nextEntries,
  });
  const wolfIdentityChanged = !previousWolf || !nextWolf ||
    previousWolf.cultUid !== nextWolf.cultUid || previousWolf.agentUid !== nextWolf.agentUid;
  if (wolfIdentityChanged) {
    tx.delete(db.doc(`sessions/${sessionId}/wolfCultIntelligence/current`));
    const staleHolderUids = new Set([
      ...wolfCultHolderUids(previousEntries),
      ...wolfCultHolderUids(nextEntries),
      ...(previousCultUid ? [previousCultUid] : []),
      ...(nextCultUid ? [nextCultUid] : []),
    ]);
    for (const holderUid of staleHolderUids) {
      tx.delete(db.doc(`sessions/${sessionId}/wolfCultIntelligence/${holderUid}`));
    }
  }
  tx.set(db.doc(`sessions/${sessionId}/wolfCultIntelligenceAuthority/current`), {
    type: 'wolf-cult-intelligence-authority',
    sessionId,
    recipientUid: nextCultUid,
    revision: censusRevision,
  });
  tx.set(db.doc(`sessions/${sessionId}/arbourVisionAuthority/current`), {
    type: 'arbour-vision-authority',
    sessionId,
    recipientUid: nextEntries.find((entry) => entry.kind === 'universal-arbour')?.uid ?? null,
    revision: censusRevision,
  });
}

export function setLoyaltyCensusEntries(
  tx: Transaction,
  sessionId: string,
  revision: number,
  entries: readonly LoyaltyCensusEntry[],
  previousCensus?: DocumentSnapshot,
): void {
  const previousNotes = censusNotesFromSnapshot(previousCensus);
  const previousRevision = previousCensus?.exists && Number.isSafeInteger(previousCensus.get('revision')) &&
    (previousCensus.get('revision') as number) >= 0
    ? previousCensus.get('revision') as number
    : -1;
  const censusRevision = Math.max(revision, previousRevision + 1);
  const nextEntries = entries.map((entry) => {
    const note = entry.note ?? previousNotes.get(entry.uid);
    return note ? { ...entry, note } : entry;
  }).sort((left, right) => left.uid.localeCompare(right.uid));
  const previousEntries = storedLoyaltyCensusEntries(previousCensus) ?? [];
  const previousWolf = wolfCultIdentity(previousEntries);
  const nextWolf = wolfCultIdentity(nextEntries);
  const previousCultUid = previousWolf?.cultUid ?? null;
  const nextCultUid = nextWolf?.cultUid ?? null;
  tx.set(db.doc(`sessions/${sessionId}/loyaltyCensus/current`), {
    type: 'loyalty-census',
    revision: censusRevision,
    entries: nextEntries,
  });
  const wolfIdentityChanged = !previousWolf || !nextWolf ||
    previousWolf.cultUid !== nextWolf.cultUid || previousWolf.agentUid !== nextWolf.agentUid;
  if (wolfIdentityChanged) {
    tx.delete(db.doc(`sessions/${sessionId}/wolfCultIntelligence/current`));
    const staleHolderUids = new Set([
      ...wolfCultHolderUids(previousEntries),
      ...wolfCultHolderUids(nextEntries),
      ...(previousCultUid ? [previousCultUid] : []),
      ...(nextCultUid ? [nextCultUid] : []),
    ]);
    for (const holderUid of staleHolderUids) {
      tx.delete(db.doc(`sessions/${sessionId}/wolfCultIntelligence/${holderUid}`));
    }
  }
  tx.set(db.doc(`sessions/${sessionId}/wolfCultIntelligenceAuthority/current`), {
    type: 'wolf-cult-intelligence-authority',
    sessionId,
    recipientUid: nextCultUid,
    revision: censusRevision,
  });
  tx.set(db.doc(`sessions/${sessionId}/arbourVisionAuthority/current`), {
    type: 'arbour-vision-authority',
    sessionId,
    recipientUid: nextEntries.find((entry) => entry.kind === 'universal-arbour')?.uid ?? null,
    revision: censusRevision,
  });
}

function censusNotesFromSnapshot(snapshot: DocumentSnapshot | undefined): Map<string, string> {
  const notes = new Map<string, string>();
  if (!snapshot?.exists) return notes;
  const entries = snapshot.get('entries');
  if (!Array.isArray(entries)) return notes;
  for (const rawEntry of entries) {
    if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as Record<string, unknown>;
    if (typeof entry.uid === 'string' && typeof entry.note === 'string' && entry.note.trim()) {
      notes.set(entry.uid, entry.note.trim().slice(0, 240));
    }
  }
  return notes;
}

function storedLoyaltyCensusEntries(snapshot: DocumentSnapshot | undefined): LoyaltyCensusEntry[] | null {
  if (!snapshot?.exists) return null;
  const rawEntries = snapshot.get('entries');
  if (!Array.isArray(rawEntries)) return null;
  const entries: LoyaltyCensusEntry[] = [];
  for (const rawEntry of rawEntries) {
    if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) return null;
    const entry = rawEntry as Record<string, unknown>;
    if (
      typeof entry.uid !== 'string' || !entry.uid ||
      typeof entry.kind !== 'string' || !entry.kind ||
      (typeof entry.suspicion !== 'number' && entry.suspicion !== null) ||
      (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note.length > 240))
    ) return null;
    entries.push({
      uid: entry.uid,
      kind: entry.kind as LoyaltyKind,
      suspicion: entry.suspicion,
      ...(typeof entry.note === 'string' && entry.note.trim() ? { note: entry.note.trim() } : {}),
    });
  }
  return new Set(entries.map((entry) => entry.uid)).size === entries.length ? entries : null;
}

type FacilitatorCensusNoteResult = Readonly<{
  sessionId: string;
  targetUid: string;
  revision: number;
  note: string;
}>;

function isFacilitatorCensusNoteResult(value: unknown, sessionId: string): value is FacilitatorCensusNoteResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.sessionId === sessionId &&
    typeof result.targetUid === 'string' &&
    Number.isSafeInteger(result.revision) && (result.revision as number) >= 0 &&
    typeof result.note === 'string' && result.note.length <= 240;
}

/** Save a facilitator-only census note without publishing private facts. */
export const setFacilitatorCensusNote = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  targetUid?: unknown;
  note?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireFacilitatorCensusNoteRequest(request.data ?? {});
  const censusRef = db.doc(`sessions/${change.sessionId}/loyaltyCensus/current`);
  const auditRef = db.doc(`sessions/${change.sessionId}/loyaltyCensus/current/audit/${change.requestId}`);
  const receiptRef = commandReceiptRef(change.sessionId, change.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'set-facilitator-census-note',
    sessionId: change.sessionId,
    requestId: change.requestId,
    actorUid: uid,
    instanceId: change.instanceId,
    expectedRevision: change.expectedRevision,
    payload: { targetUid: change.targetUid, note: change.note },
  };

  return db.runTransaction(async (tx): Promise<FacilitatorCensusNoteResult> => {
    const [authority, census, receipt, audit] = await Promise.all([
      requireFacilitatorInstance(tx, change.sessionId, uid, change.instanceId),
      tx.get(censusRef),
      tx.get(receiptRef),
      tx.get(auditRef),
    ]);
    await rejectForeignLegacyM1Command(
      tx, change.sessionId, change.requestId, 'facilitator census note', [],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is FacilitatorCensusNoteResult => isFacilitatorCensusNoteResult(value, change.sessionId),
      'facilitator census note',
    );
    if (replay) return replay;
    if (audit.exists) rejectLegacyEventReplay('facilitator census note');
    requireActiveGameplayPhase(authority.session);
    const currentRevision = census.exists && Number.isSafeInteger(census.get('revision')) &&
      (census.get('revision') as number) >= 0
      ? census.get('revision') as number
      : 0;
    if (!census.exists || currentRevision !== change.expectedRevision) {
      throw commandError(
        'failed-precondition',
        'The facilitator census changed. Wait for the live census and try again.',
        'stale-revision',
      );
    }
    const entries = storedLoyaltyCensusEntries(census);
    if (!entries) {
      throw commandError('failed-precondition', 'The facilitator census is malformed; refresh before retrying.', 'malformed-input');
    }
    if (!entries.some((entry) => entry.uid === change.targetUid)) {
      throw commandError('failed-precondition', 'That identity is not currently in the facilitator census.', 'conflict');
    }
    const nextRevision = currentRevision + 1;
    const nextEntries = entries.map((entry) => {
      if (entry.uid !== change.targetUid) return entry;
      return change.note ? { ...entry, note: change.note } : (() => {
        const withoutNote = { ...entry };
        delete withoutNote.note;
        return withoutNote;
      })();
    });
    const result: FacilitatorCensusNoteResult = {
      sessionId: change.sessionId,
      targetUid: change.targetUid,
      revision: nextRevision,
      note: change.note,
    };
    tx.set(censusRef, {
      type: 'loyalty-census',
      revision: nextRevision,
      entries: nextEntries,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(auditRef, {
      type: 'loyalty-census-note',
      action: change.note ? 'set' : 'clear',
      targetUid: change.targetUid,
      revision: nextRevision,
      actorUid: uid,
      instanceId: change.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type WolfCultIntelligenceResult = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  recipientUid: string;
  revision: number;
  fortressCoordinate: string;
  suppliesCoordinate: string;
  agentUid: string;
  codeWord: string;
  label: 'WOLF INTEL';
}>;

function isWolfCultIntelligenceResult(
  value: unknown,
  sessionId: string,
): value is WolfCultIntelligenceResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (result.status === 'committed' || result.status === 'replayed') && result.sessionId === sessionId &&
    typeof result.recipientUid === 'string' && Number.isSafeInteger(result.revision) &&
    (result.revision as number) >= 1 && typeof result.fortressCoordinate === 'string' &&
    typeof result.suppliesCoordinate === 'string' && typeof result.agentUid === 'string' &&
    typeof result.codeWord === 'string' && result.codeWord.length > 0 &&
    result.codeWord.length <= 80 && result.label === 'WOLF INTEL';
}

/** Deliver the four source-defined Wolf Cult facts to its current holder. */
export const deliverWolfCultIntelligence = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  fortressCoordinate?: unknown;
  suppliesCoordinate?: unknown;
  agentUid?: unknown;
  codeWord?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const intelligence = requireWolfCultIntelligenceRequest(request.data ?? {});
  const currentRef = db.doc(`sessions/${intelligence.sessionId}/wolfCultIntelligence/current`);
  const authorityRef = db.doc(`sessions/${intelligence.sessionId}/wolfCultIntelligenceAuthority/current`);
  const secretsRef = db.collection(`sessions/${intelligence.sessionId}/secrets`);
  const playersRef = db.collection(`sessions/${intelligence.sessionId}/players`);
  const auditRef = db.doc(`sessions/${intelligence.sessionId}/wolfCultIntelligence/current/audit/${intelligence.requestId}`);
  const receiptRef = commandReceiptRef(intelligence.sessionId, intelligence.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'deliver-wolf-cult-intelligence',
    sessionId: intelligence.sessionId,
    requestId: intelligence.requestId,
    actorUid: uid,
    instanceId: intelligence.instanceId,
    expectedRevision: intelligence.expectedRevision,
    payload: {
      fortressCoordinate: intelligence.fortressCoordinate,
      suppliesCoordinate: intelligence.suppliesCoordinate,
      agentUid: intelligence.agentUid,
      codeWord: intelligence.codeWord,
    },
  };

  return db.runTransaction(async (tx): Promise<WolfCultIntelligenceResult> => {
    const [authority, current, players, secrets, receipt, audit] = await Promise.all([
      requireFacilitatorInstance(tx, intelligence.sessionId, uid, intelligence.instanceId),
      tx.get(currentRef),
      tx.get(playersRef),
      tx.get(secretsRef),
      tx.get(receiptRef),
      tx.get(auditRef),
    ]);
    await rejectForeignLegacyM1Command(
      tx, intelligence.sessionId, intelligence.requestId, 'Wolf Cult intelligence', [],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is WolfCultIntelligenceResult =>
        isWolfCultIntelligenceResult(value, intelligence.sessionId),
      'Wolf Cult intelligence',
    );
    if (replay) return { ...replay, status: 'replayed' };
    if (audit.exists) rejectLegacyEventReplay('Wolf Cult intelligence');
    requireActiveGameplayPhase(authority.session);

    const activeRoleIds = configuredRoleIds(authority.session);
    const canonicalSecrets = secrets.docs
      .map((secret) => canonicalLoyaltySecret(secret, players.docs, activeRoleIds))
      .filter((secret): secret is CanonicalLoyaltySecret => secret !== null);
    const cultHolders = canonicalSecrets.filter((secret) => secret.kind === 'wolf-cult');
    const wolfAgents = canonicalSecrets.filter((secret) => secret.kind === 'wolf-agent');
    if (authority.session.get('wolfCultEnabled') !== true || cultHolders.length !== 1 || wolfAgents.length !== 1) {
      throw commandError(
        'failed-precondition',
        'Wolf Cult intelligence requires one current Cult leader and one current Wolf agent.',
        'conflict',
      );
    }
    const recipientUid = cultHolders[0]!.uid;
    const agentUid = wolfAgents[0]!.uid;
    if (intelligence.agentUid !== agentUid) {
      throw commandError(
        'failed-precondition',
        'The supplied Wolf agent does not match the current authoritative loyalty assignment.',
        'conflict',
      );
    }
    const currentRevisionValue = current.get('revision');
    const currentRevision = current.exists && Number.isSafeInteger(currentRevisionValue) &&
      (currentRevisionValue as number) >= 0 ? currentRevisionValue as number : 0;
    if (current.exists && (
      current.get('type') !== 'wolf-cult-intelligences' ||
      current.get('sessionId') !== intelligence.sessionId ||
      !Number.isSafeInteger(currentRevisionValue) ||
      (currentRevisionValue as number) < 0 ||
      !isWireSafeEntityId(current.get('recipientUid'))
    )) {
      throw commandError('failed-precondition', 'The Wolf Cult intelligence projection is malformed.', 'malformed-input');
    }
    if (currentRevision !== intelligence.expectedRevision) {
      throw commandError(
        'failed-precondition',
        'Wolf Cult intelligence changed. Refresh the private projection and try again.',
        'stale-revision',
      );
    }
    const revision = currentRevision + 1;
    const result: WolfCultIntelligenceResult = {
      status: 'committed',
      sessionId: intelligence.sessionId,
      recipientUid,
      revision,
      fortressCoordinate: intelligence.fortressCoordinate,
      suppliesCoordinate: intelligence.suppliesCoordinate,
      agentUid,
      codeWord: intelligence.codeWord,
      label: 'WOLF INTEL',
    };
    const gmUids = players.docs
      .filter((player) => isActivePlayer(player) && player.get('role') === 'gm')
      .map((player) => player.id);
    const recipientProjectionRef = db.doc(
      `sessions/${intelligence.sessionId}/wolfCultIntelligence/${recipientUid}`,
    );
    const previousRecipientUid = current.get('recipientUid');
    tx.set(recipientProjectionRef, {
      type: 'wolf-cult-intelligence',
      sessionId: intelligence.sessionId,
      recipientUid,
      visibleToUids: [recipientUid],
      revision,
      fortressCoordinate: intelligence.fortressCoordinate,
      suppliesCoordinate: intelligence.suppliesCoordinate,
      agentUid,
      codeWord: intelligence.codeWord,
      label: 'WOLF INTEL',
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(currentRef, {
      type: 'wolf-cult-intelligences',
      sessionId: intelligence.sessionId,
      recipientUid,
      visibleToUids: gmUids,
      revision,
      fortressCoordinate: intelligence.fortressCoordinate,
      suppliesCoordinate: intelligence.suppliesCoordinate,
      agentUid,
      codeWord: intelligence.codeWord,
      label: 'WOLF INTEL',
      actorUid: uid,
      instanceId: intelligence.instanceId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(authorityRef, {
      type: 'wolf-cult-intelligence-authority',
      sessionId: intelligence.sessionId,
      recipientUid,
      revision,
    });
    if (isWireSafeEntityId(previousRecipientUid) && previousRecipientUid !== recipientUid) {
      tx.delete(db.doc(`sessions/${intelligence.sessionId}/wolfCultIntelligence/${previousRecipientUid}`));
    }
    tx.set(auditRef, {
      type: 'wolf-cult-intelligence',
      action: 'deliver',
      recipientUid,
      revision,
      actorUid: uid,
      instanceId: intelligence.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type ArbourVisionResult = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  recipientUid: string;
  revision: number;
  kind: 'location' | 'danger' | 'suspicion';
  text: string;
  label: 'FACILITATOR CALL';
}>;

type CrisisTransitionResult = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  crisisId: string;
  state: CrisisStateName;
  revision: number;
  title: string;
}>;

type ZealotryResponseResult = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  crisisId: string;
  crisisRevision: number;
  revision: number;
  actions: readonly ZealotryResponseAction[];
  customResponse?: string;
  rationale: string;
  loyaltyCensusRevision: number | null;
  label: 'ZEALOTRY RESPONSE';
}>;

function isZealotryResponseResult(value: unknown, sessionId: string): value is ZealotryResponseResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const parsed = parseStoredZealotryResponse({
    type: 'zealotry-response',
    sessionId: result.sessionId,
    crisisId: result.crisisId,
    crisisRevision: result.crisisRevision,
    state: 'debated',
    revision: result.revision,
    actions: result.actions,
    customResponse: result.customResponse,
    rationale: result.rationale,
    loyaltyCensusRevision: result.loyaltyCensusRevision,
    actorUid: typeof result.actorUid === 'string' ? result.actorUid : 'result-actor',
    instanceId: typeof result.instanceId === 'string' ? result.instanceId : 'result-instance',
  });
  return (result.status === 'committed' || result.status === 'replayed') &&
    result.sessionId === sessionId && parsed !== null && result.label === 'ZEALOTRY RESPONSE';
}

function isCrisisTransitionResult(value: unknown, sessionId: string): value is CrisisTransitionResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (result.status === 'committed' || result.status === 'replayed') &&
    result.sessionId === sessionId && typeof result.crisisId === 'string' &&
    isCrisisState(result.state) && Number.isSafeInteger(result.revision) &&
    (result.revision as number) >= 1 && typeof result.title === 'string' &&
    result.title.length > 0 && result.title.length <= 160;
}

/** Advance one manually authored crisis through the durable facilitator lifecycle. */
export const transitionCrisis = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  crisisId?: unknown;
  state?: unknown;
  title?: unknown;
  details?: unknown;
  crisisKind?: unknown;
  configurationOverride?: unknown;
  diseaseOutbreak?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const crisis = requireCrisisTransitionRequest(request.data ?? {});
  const currentRef = db.doc(`sessions/${crisis.sessionId}/crisisState/current`);
  const zealotryResponseRef = db.doc(`sessions/${crisis.sessionId}/zealotryResponses/current`);
  const civilUnrestResolutionRef = db.doc(`sessions/${crisis.sessionId}/civilUnrestResolutions/current`);
  const auditRef = db.doc(`sessions/${crisis.sessionId}/crisisState/current/audit/${crisis.requestId}`);
  const receiptRef = commandReceiptRef(crisis.sessionId, crisis.requestId);
  const eventRef = db.doc(
    `sessions/${crisis.sessionId}/events/crisis-${crisis.crisisId}-${crisis.requestId}`,
  );
  const fingerprint: CommandFingerprint = {
    action: 'transition-crisis',
    sessionId: crisis.sessionId,
    requestId: crisis.requestId,
    actorUid: uid,
    instanceId: crisis.instanceId,
    expectedRevision: crisis.expectedRevision,
    payload: {
      crisisId: crisis.crisisId,
      state: crisis.state,
      title: crisis.title,
      details: crisis.details,
      ...(request.data?.crisisKind === undefined ? {} : { crisisKind: crisis.crisisKind }),
      ...(request.data?.configurationOverride === undefined ? {} : { configurationOverride: crisis.configurationOverride }),
      ...(request.data?.diseaseOutbreak === undefined ? {} : {
        diseaseAffectedShipIds: crisis.diseaseOutbreak?.affectedShipIds ?? [],
        diseaseWorkRestrictions: crisis.diseaseOutbreak?.workRestrictions ?? '',
        diseaseEscalationRisk: crisis.diseaseOutbreak?.escalationRisk ?? '',
      }),
    },
  };

  return db.runTransaction(async (tx): Promise<CrisisTransitionResult> => {
    const [authority, current, receipt, audit] = await Promise.all([
      requireFacilitatorInstance(tx, crisis.sessionId, uid, crisis.instanceId),
      tx.get(currentRef),
      tx.get(receiptRef),
      tx.get(auditRef),
    ]);
    await rejectForeignLegacyM1Command(tx, crisis.sessionId, crisis.requestId, 'crisis transition', []);
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is CrisisTransitionResult => isCrisisTransitionResult(value, crisis.sessionId),
      'crisis transition',
    );
    if (replay) return replay;
    if (audit.exists) rejectLegacyEventReplay('crisis transition');
    requireActiveGameplayPhase(authority.session);

    const currentRevision = current.exists && Number.isSafeInteger(current.get('revision')) &&
      (current.get('revision') as number) >= 0 ? current.get('revision') as number : 0;
    if (current.exists && (
      current.get('type') !== 'crisis-state' || current.get('sessionId') !== crisis.sessionId ||
      typeof current.get('crisisId') !== 'string' || current.get('crisisId').length === 0 ||
      current.get('crisisId').length > 80 || !isCrisisState(current.get('state')) ||
      !Number.isSafeInteger(current.get('revision')) || (current.get('revision') as number) < 0 ||
      typeof current.get('title') !== 'string' || current.get('title').length === 0 ||
      current.get('title').length > 160 ||
      typeof current.get('details') !== 'string' || current.get('details').length > 2_000
    )) {
      throw commandError('failed-precondition', 'The crisis projection is malformed; refresh before retrying.', 'malformed-input');
    }
    if (currentRevision !== crisis.expectedRevision) {
      throw commandError(
        'failed-precondition',
        'The crisis changed. Refresh the facilitator projection and try again.',
        'stale-revision',
      );
    }
    const previousState = current.exists ? current.get('state') as CrisisStateName : undefined;
    const previousCrisisId = current.exists ? current.get('crisisId') as string : undefined;
    const replacingClosedCrisis = previousState === 'closed' && previousCrisisId !== crisis.crisisId;
    if (replacingClosedCrisis) {
      if (crisis.state !== 'draft') {
        throw commandError('failed-precondition', 'A new crisis must begin in draft.', 'conflict');
      }
    } else {
      if (previousCrisisId !== undefined && previousCrisisId !== crisis.crisisId) {
        throw commandError('failed-precondition', 'Close the current crisis before starting another.', 'conflict');
      }
      if (!canTransitionCrisis(previousState, crisis.state)) {
        throw commandError('failed-precondition', 'That crisis lifecycle transition is not valid.', 'invalid-phase');
      }
      if (current.exists && (crisis.title !== current.get('title') || crisis.details !== current.get('details'))) {
        throw commandError('failed-precondition', 'Crisis content is fixed after draft creation.', 'conflict');
      }
    }
    // Older clients omit configuration fields; continuing the same crisis must
    // retain its private configuration rather than reclassifying its identifier.
    const sameCrisis = current.exists && previousCrisisId === crisis.crisisId;
    const storedKind = current.get('crisisKind');
    const storedOverride = current.get('configurationOverride');
    const crisisKind = request.data?.crisisKind === undefined && sameCrisis && isCrisisKind(storedKind)
      ? storedKind : crisis.crisisKind;
    const configurationOverride = request.data?.configurationOverride === undefined && sameCrisis && typeof storedOverride === 'string'
      ? storedOverride : crisis.configurationOverride;
    if (current.exists && !replacingClosedCrisis && (
      crisisKind !== (current.get('crisisKind') ?? (isCrisisKind(previousCrisisId) ? previousCrisisId : 'custom')) ||
      (crisis.state !== 'delivered' && configurationOverride !== (current.get('configurationOverride') ?? ''))
    )) throw commandError('failed-precondition', 'Crisis configuration is fixed after draft creation.', 'conflict');
    const activeRoles = authority.session.get('activeRoleIds') ?? DEFAULT_ACTIVE_ROLE_IDS;
    const blocker = crisisConfigurationBlocker(crisisKind, {
      presidentEnabled: authority.session.get('dioneEnabled') !== false && Array.isArray(activeRoles) && activeRoles.includes('dione-president'),
      universalArbourEnabled: authority.session.get('universalArbourEnabled') === true,
      wolfCultEnabled: authority.session.get('wolfCultEnabled') === true,
    });
    if ((crisis.state === 'draft' || crisis.state === 'delivered') && blocker && !configurationOverride) {
      throw commandError('failed-precondition', blocker, 'conflict');
    }
    const storedDisease = sameCrisis ? current.get('diseaseOutbreak') : undefined;
    const diseaseValue = request.data?.diseaseOutbreak === undefined ? storedDisease : crisis.diseaseOutbreak;
    const disease = diseaseValue === undefined ? undefined : parseDiseaseOutbreak(diseaseValue);
    if (disease === null || (disease && crisisKind !== 'disease-outbreak')) {
      throw commandError('failed-precondition', 'The outbreak details are not valid for this crisis.', 'malformed-input');
    }
    if (sameCrisis && crisis.state !== 'delivered' && JSON.stringify(disease) !== JSON.stringify(storedDisease)) {
      throw commandError('failed-precondition', 'Outbreak details are fixed after delivery.', 'conflict');
    }
    if (crisisKind === 'disease-outbreak' && crisis.state === 'delivered' && !disease) {
      throw commandError('failed-precondition', 'Record affected ships, work restrictions and escalation risk before delivery.', 'conflict');
    }
    if (disease && (crisis.state === 'draft' || crisis.state === 'delivered')) {
      const activeShips = activeVesselIdsForSession(authority.session);
      if (disease.affectedShipIds.some(id => !activeShips.includes(id) || !isFleetShipId(id))) {
        throw commandError('failed-precondition', 'Every affected ship must be active in this session.', 'conflict');
      }
    }
    const revision = currentRevision + 1;
    const result: CrisisTransitionResult = {
      status: 'committed',
      sessionId: crisis.sessionId,
      crisisId: crisis.crisisId,
      state: crisis.state,
      revision,
      title: crisis.title,
    };
    tx.set(currentRef, {
      type: 'crisis-state',
      sessionId: crisis.sessionId,
      crisisId: crisis.crisisId,
      state: crisis.state,
      revision,
      title: crisis.title,
      details: crisis.details,
      crisisKind,
      configurationOverride,
      ...(disease ? { diseaseOutbreak: disease } : {}),
      actorUid: uid,
      instanceId: crisis.instanceId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(auditRef, {
      type: 'crisis-state',
      action: 'transition',
      sessionId: crisis.sessionId,
      crisisId: crisis.crisisId,
      state: crisis.state,
      revision,
      title: crisis.title,
      details: crisis.details,
      crisisKind,
      configurationOverride,
      ...(disease ? { diseaseOutbreak: disease } : {}),
      actorUid: uid,
      instanceId: crisis.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    });
    const reportRef = db.doc(`sessions/${crisis.sessionId}/crisisReports/current`);
    const civilUnrestPublicRef = db.doc(`sessions/${crisis.sessionId}/civilUnrestPublic/current`);
    const civilUnrestCurrentRefs = CIVIL_UNREST_SHIP_IDS.map((shipId) =>
      db.doc(`sessions/${crisis.sessionId}/civilUnrestGrievances/${shipId}`));
    const civilUnrestShips = activeVesselIdsForSession(authority.session)
      .filter((shipId) => CIVIL_UNREST_SHIP_IDS.includes(shipId as (typeof CIVIL_UNREST_SHIP_IDS)[number]))
      .map((shipId) => (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[shipId] ?? shipId);
    const playerReport = crisisKind === 'approaching-vessel' ? APPROACHING_VESSEL_REPORT
      : crisisKind === 'religious-zealotry' ? RELIGIOUS_ZEALOTRY_REPORT
      : crisisKind === 'presidential-election' ? PRESIDENTIAL_ELECTION_REPORT
      : crisisKind === 'civil-unrest' ? civilUnrestReport(civilUnrestShips)
      : crisisKind === 'disease-outbreak' && disease ? diseaseOutbreakReport(disease, disease.affectedShipIds.map(id => (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[id] ?? id)) : null;
    if (crisis.state === 'draft') {
      // A new draft must never retain the previously delivered crisis report.
      tx.delete(reportRef);
      if (replacingClosedCrisis) {
        // The current facilitator decision belongs to the closed crisis. Keep
        // immutable history and audit, but force a fresh decision for the new
        // crisis rather than letting the private projection bleed across IDs.
        tx.delete(zealotryResponseRef);
        tx.delete(civilUnrestResolutionRef);
      }
      tx.delete(civilUnrestPublicRef);
      civilUnrestCurrentRefs.forEach((ref) => tx.delete(ref));
    } else {
      if (crisis.state === 'closed') {
        // Retire the current grievance projections while preserving their GM-only
        // audit subcollections under the deleted parent documents.
        tx.delete(civilUnrestPublicRef);
        civilUnrestCurrentRefs.forEach((ref) => tx.delete(ref));
        // A resolution is current only while its debated crisis is live. Its
        // history and facilitator audit remain immutable for later review.
        tx.delete(civilUnrestResolutionRef);
      }
      if (playerReport) {
        // Only this fixed player report crosses the private crisis boundary.
        // The facilitator's reality, difficulty and override notes stay private.
        tx.set(reportRef, {
          sessionId: crisis.sessionId,
          crisisId: crisis.crisisId,
          crisisKind,
          state: crisis.state,
          revision,
          ...playerReport,
          updatedAt: FieldValue.serverTimestamp(),
      });
      }
    }
    if (crisis.state !== 'draft') {
      tx.set(eventRef, buildPrivacySafeEventRecord({
        type: 'crisis-state',
        envelope: buildAuthoritativeEventEnvelope({
          sessionId: crisis.sessionId,
          actorUid: uid,
          actorRoleId: null,
          turn: sessionTurn(authority.session.get('currentTurn')),
          phase: vesselActionPhase(authority.session),
          type: 'crisis-state',
          requestId: crisis.requestId,
          revision,
          serverTime: new Date(),
          visibility: EventVisibility.Member,
        }),
        payload: { crisisId: crisis.crisisId, state: crisis.state, title: crisis.title, details: crisis.details },
        createdAt: FieldValue.serverTimestamp(),
      }));
    }
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type Voyage33AdmissionResult = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  crisisId: string;
  crisisRevision: number;
  admission: Voyage33Admission;
}>;

function isVoyage33AdmissionResult(value: unknown, sessionId: string): value is Voyage33AdmissionResult {
  if (!isRecord(value) || (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== sessionId || typeof value.crisisId !== 'string' ||
      !Number.isSafeInteger(value.crisisRevision)) return false;
  const admission = parseVoyage33Admission(value.admission, sessionId);
  return admission !== undefined && admission.crisisId === value.crisisId &&
    admission.crisisRevision === value.crisisRevision;
}

function voyage33ArrivalRef(sessionId: string): DocumentReference {
  return db.doc(`sessions/${sessionId}/voyage33Arrival/current`);
}

function voyage33ArrivalAuditRef(sessionId: string, requestId: string): DocumentReference {
  return db.doc(`sessions/${sessionId}/voyage33Arrival/current/audit/${requestId}`);
}

function currentVoyage33RoleId(player: DocumentSnapshot): string | undefined {
  if (player.get('role') !== 'player') return undefined;
  const replacementRoleId = player.get('replacementRoleId');
  if (typeof replacementRoleId === 'string' && replacementRoleId.length > 0) return replacementRoleId;
  const assignedRoleId = player.get('assignedRoleId');
  return typeof assignedRoleId === 'string' && assignedRoleId.length > 0 ? assignedRoleId : undefined;
}

function privateAdmissionRequestId(
  admission: DocumentSnapshot,
  fallback: string,
  existingArrival?: ReturnType<typeof parseVoyage33ArrivalActivation>,
): string {
  const requestId = admission.get('requestId');
  return typeof requestId === 'string' && isCanonicalRequestId(requestId)
    ? requestId
    : existingArrival?.admissionRequestId ?? fallback;
}

async function activateVoyage33Arrival(
  tx: Transaction,
  admission: Voyage33Admission,
  admissionRequestId: string,
  actorUid: string,
  instanceId: string,
  players: { readonly docs: readonly DocumentSnapshot[] },
  arrivalRef: DocumentReference,
  auditRef: DocumentReference,
): Promise<void> {
  const targets = players.docs.flatMap((player) => {
    const roleId = currentVoyage33RoleId(player);
    return roleId && voyage33MotivationForRole(roleId, true)
      ? [{ uid: player.id, roleId, briefRef: db.doc(`sessions/${admission.sessionId}/roleBriefs/${player.id}`) }]
      : [];
  });
  const briefs = await Promise.all(targets.map((target) => tx.get(target.briefRef)));
  const motivatedRoleIds = targets.flatMap((target, index) => {
    const brief = briefs[index];
    const data = brief?.data();
    if (!brief?.exists || !isRecord(data) || data.type !== 'role-brief' ||
        data.sessionId !== admission.sessionId || data.assignmentUid !== target.uid ||
        data.roleId !== target.roleId) return [];
    const motivation = voyage33MotivationForRole(target.roleId, true);
    if (!motivation) return [];
    if (data.voyage33Motivation !== motivation) {
      tx.update(brief.ref, { voyage33Motivation: motivation });
    }
    return [target.roleId as Voyage33MotivatedRoleId];
  }).sort();
  const activation = arrivalActivationForAdmission(admission, admissionRequestId, motivatedRoleIds);
  tx.set(arrivalRef, {
    ...activation,
    actorUid,
    instanceId,
    activatedAt: FieldValue.serverTimestamp(),
  });
  tx.set(auditRef, {
    ...activation,
    action: 'activate',
    actorUid,
    instanceId,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Admit the printed Voyage 33-0 vessel exactly once from an active crisis. */
export const admitVoyage33 = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  crisisId?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const admissionRequest = requireVoyage33AdmissionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${admissionRequest.sessionId}`);
  const crisisRef = db.doc(`sessions/${admissionRequest.sessionId}/crisisState/current`);
  const admissionRef = db.doc(`sessions/${admissionRequest.sessionId}/voyage33Admission/current`);
  const auditRef = db.doc(`sessions/${admissionRequest.sessionId}/voyage33Admission/current/audit/${admissionRequest.requestId}`);
  const arrivalRef = voyage33ArrivalRef(admissionRequest.sessionId);
  const playersRef = db.collection(`sessions/${admissionRequest.sessionId}/players`);
  const receiptRef = commandReceiptRef(admissionRequest.sessionId, admissionRequest.requestId);
  const eventRef = db.doc(`sessions/${admissionRequest.sessionId}/events/voyage-admitted-${admissionRequest.requestId}`);
  const fingerprint: CommandFingerprint = {
    action: 'admit-voyage-33',
    sessionId: admissionRequest.sessionId,
    requestId: admissionRequest.requestId,
    actorUid: uid,
    instanceId: admissionRequest.instanceId,
    expectedRevision: admissionRequest.expectedRevision,
    payload: { crisisId: admissionRequest.crisisId },
  };

  return db.runTransaction(async (tx): Promise<Voyage33AdmissionResult> => {
    const [authority, crisisSnapshot, storedAdmission, receipt, audit, storedArrival, players] = await Promise.all([
      requireFacilitatorInstance(tx, admissionRequest.sessionId, uid, admissionRequest.instanceId),
      tx.get(crisisRef),
      tx.get(admissionRef),
      tx.get(receiptRef),
      tx.get(auditRef),
      tx.get(arrivalRef),
      tx.get(playersRef),
    ]);
    await rejectForeignLegacyM1Command(tx, admissionRequest.sessionId, admissionRequest.requestId, 'Voyage 33-0 admission', []);
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is Voyage33AdmissionResult => isVoyage33AdmissionResult(value, admissionRequest.sessionId),
      'Voyage 33-0 admission',
    );
    if (replay) return replay;
    if (audit.exists) rejectLegacyEventReplay('Voyage 33-0 admission');
    requireActiveGameplayPhase(authority.session);

    const existing = storedAdmission.exists
      ? parseVoyage33Admission(storedAdmission.data(), admissionRequest.sessionId)
      : undefined;
    if (storedAdmission.exists && !existing) {
      throw commandError('failed-precondition', 'The stored Voyage 33-0 admission is malformed; refresh before retrying.', 'malformed-input');
    }
    const arrival = storedArrival.exists
      ? parseVoyage33ArrivalActivation(storedArrival.data(), admissionRequest.sessionId)
      : undefined;
    if (storedArrival.exists && !arrival) {
      throw commandError('failed-precondition', 'The stored Voyage 33-0 arrival activation is malformed; refresh before retrying.', 'malformed-input');
    }
    const activationRequestId = existing
      ? privateAdmissionRequestId(storedAdmission, admissionRequest.requestId, arrival)
      : admissionRequest.requestId;
    const activationAuditRef = voyage33ArrivalAuditRef(admissionRequest.sessionId, activationRequestId);
    const activationAudit = await tx.get(activationAuditRef);
    if (existing) {
      if (existing.crisisId !== admissionRequest.crisisId) {
        throw commandError('failed-precondition', 'Voyage 33-0 has already been admitted for another crisis.', 'conflict');
      }
      if (arrival) {
        if (arrival.crisisId !== existing.crisisId || arrival.crisisRevision !== existing.crisisRevision ||
            arrival.admissionRequestId !== activationRequestId || !activationAudit.exists) {
          throw commandError('failed-precondition', 'The stored Voyage 33-0 arrival activation is inconsistent; refresh before retrying.', 'malformed-input');
        }
      } else {
        if (activationAudit.exists) {
          throw commandError('failed-precondition', 'The stored Voyage 33-0 arrival audit is missing its current activation; refresh before retrying.', 'malformed-input');
        }
        const actorUid = typeof storedAdmission.get('actorUid') === 'string' ? storedAdmission.get('actorUid') as string : uid;
        const instanceId = typeof storedAdmission.get('instanceId') === 'string'
          ? storedAdmission.get('instanceId') as string
          : admissionRequest.instanceId;
        await activateVoyage33Arrival(
          tx,
          existing,
          activationRequestId,
          actorUid,
          instanceId,
          players,
          arrivalRef,
          activationAuditRef,
        );
      }
      const result: Voyage33AdmissionResult = {
        status: 'replayed',
        sessionId: admissionRequest.sessionId,
        crisisId: existing.crisisId,
        crisisRevision: existing.crisisRevision,
        admission: existing,
      };
      tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
      return result;
    }

    if (!crisisSnapshot.exists || crisisSnapshot.get('type') !== 'crisis-state' ||
        crisisSnapshot.get('sessionId') !== admissionRequest.sessionId ||
        crisisSnapshot.get('crisisId') !== admissionRequest.crisisId ||
        crisisSnapshot.get('crisisKind') !== 'approaching-vessel' ||
        !isCrisisState(crisisSnapshot.get('state')) ||
        crisisSnapshot.get('state') === 'draft' || crisisSnapshot.get('state') === 'closed') {
      throw commandError('failed-precondition', 'An active Approaching Vessel crisis is required before admitting Voyage 33-0.', 'invalid-phase');
    }
    const crisisRevision = crisisSnapshot.get('revision');
    if (!Number.isSafeInteger(crisisRevision) || (crisisRevision as number) !== admissionRequest.expectedRevision) {
      throw commandError('failed-precondition', 'The crisis changed. Refresh the facilitator projection and retry the admission.', 'stale-revision');
    }

    const admission: Voyage33Admission = {
      type: 'voyage-admission',
      sessionId: admissionRequest.sessionId,
      id: VOYAGE_33_ID,
      status: 'admitted',
      crisisId: admissionRequest.crisisId,
      crisisRevision: crisisRevision as number,
      population: VOYAGE_33_POPULATION,
      unrest: VOYAGE_33_UNREST,
      hostShipId: null,
      commitments: VOYAGE_33_COMMITMENTS,
    };
    const result: Voyage33AdmissionResult = {
      status: 'committed',
      sessionId: admissionRequest.sessionId,
      crisisId: admissionRequest.crisisId,
      crisisRevision: crisisRevision as number,
      admission,
    };
    if (arrival || activationAudit.exists) {
      throw commandError('failed-precondition', 'The Voyage 33-0 arrival activation exists without its admission; refresh before retrying.', 'malformed-input');
    }
    await activateVoyage33Arrival(
      tx,
      admission,
      activationRequestId,
      uid,
      admissionRequest.instanceId,
      players,
      arrivalRef,
      activationAuditRef,
    );
    const existingAdmitted = Array.isArray(authority.session.get('admittedVesselIds'))
      ? authority.session.get('admittedVesselIds').filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const admittedVesselIds = [...new Set([...existingAdmitted, VOYAGE_33_ID])];
    tx.set(admissionRef, {
      ...admission,
      actorUid: uid,
      instanceId: admissionRequest.instanceId,
      requestId: admissionRequest.requestId,
      admittedAt: FieldValue.serverTimestamp(),
    });
    tx.set(auditRef, {
      ...admission,
      action: 'admit',
      actorUid: uid,
      instanceId: admissionRequest.instanceId,
      requestId: admissionRequest.requestId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(sessionRef, {
      admittedVesselIds,
      voyage33Admission: admission,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'voyage-admitted',
      envelope: buildAuthoritativeEventEnvelope({
        sessionId: admissionRequest.sessionId,
        actorUid: uid,
        actorRoleId: null,
        turn: sessionTurn(authority.session.get('currentTurn')),
        phase: vesselActionPhase(authority.session),
        type: 'voyage-admitted',
        requestId: admissionRequest.requestId,
        revision: crisisRevision as number,
        serverTime: new Date(),
        visibility: EventVisibility.Member,
      }),
      payload: {
        crisisId: admissionRequest.crisisId,
        crisisRevision: crisisRevision as number,
        vesselId: VOYAGE_33_ID,
        population: VOYAGE_33_POPULATION,
        commitments: VOYAGE_33_COMMITMENTS,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** Record the facilitator's explicit source-approved response to Zealotry. */
export const recordZealotryResponse = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  crisisId?: unknown;
  actions?: unknown;
  customResponse?: unknown;
  rationale?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const response = requireZealotryResponseRequest(request.data ?? {});
  const currentCrisisRef = db.doc(`sessions/${response.sessionId}/crisisState/current`);
  const currentResponseRef = db.doc(`sessions/${response.sessionId}/zealotryResponses/current`);
  const historyRef = db.doc(`sessions/${response.sessionId}/zealotryResponses/history-${response.requestId}`);
  const auditRef = db.doc(`sessions/${response.sessionId}/zealotryResponses/audit-${response.requestId}`);
  const censusRef = db.doc(`sessions/${response.sessionId}/loyaltyCensus/current`);
  const receiptRef = commandReceiptRef(response.sessionId, response.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'record-zealotry-response',
    sessionId: response.sessionId,
    requestId: response.requestId,
    actorUid: uid,
    instanceId: response.instanceId,
    expectedRevision: response.expectedRevision,
    payload: {
      crisisId: response.crisisId,
      actions: response.actions,
      ...(response.customResponse === undefined ? {} : { customResponse: response.customResponse }),
      rationale: response.rationale,
    },
  };

  return db.runTransaction(async (tx): Promise<ZealotryResponseResult> => {
    const [authority, crisisSnapshot, currentResponseSnapshot, censusSnapshot, receipt, audit] = await Promise.all([
      requireFacilitatorInstance(tx, response.sessionId, uid, response.instanceId),
      tx.get(currentCrisisRef),
      tx.get(currentResponseRef),
      tx.get(censusRef),
      tx.get(receiptRef),
      tx.get(auditRef),
    ]);
    await rejectForeignLegacyM1Command(tx, response.sessionId, response.requestId, 'Zealotry response', []);
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is ZealotryResponseResult => isZealotryResponseResult(value, response.sessionId),
      'Zealotry response',
    );
    if (replay) return replay;
    if (audit.exists) rejectLegacyEventReplay('Zealotry response');
    requireActiveGameplayPhase(authority.session);

    if (!crisisSnapshot.exists || crisisSnapshot.get('type') !== 'crisis-state' ||
        crisisSnapshot.get('sessionId') !== response.sessionId ||
        crisisSnapshot.get('crisisId') !== response.crisisId ||
        crisisSnapshot.get('crisisKind') !== 'religious-zealotry' ||
        crisisSnapshot.get('state') !== 'debated' ||
        crisisSnapshot.get('revision') !== response.expectedRevision) {
      throw commandError(
        'failed-precondition',
        'Record a response only for the current debated Religious Zealotry crisis.',
        'stale-revision',
      );
    }
    if (!Number.isSafeInteger(crisisSnapshot.get('revision')) ||
        (crisisSnapshot.get('revision') as number) < 1) {
      throw commandError('failed-precondition', 'The current crisis projection is malformed.', 'malformed-input');
    }

    const priorResponse = currentResponseSnapshot.exists
      ? parseStoredZealotryResponse(currentResponseSnapshot.data())
      : null;
    if (currentResponseSnapshot.exists && (!priorResponse || priorResponse.sessionId !== response.sessionId)) {
      throw commandError('failed-precondition', 'The current Zealotry response projection is malformed.', 'malformed-input');
    }
    const censusRevision = censusSnapshot.exists
      ? Number.isSafeInteger(censusSnapshot.get('revision')) && (censusSnapshot.get('revision') as number) >= 0 &&
        storedLoyaltyCensusEntries(censusSnapshot) !== null
        ? censusSnapshot.get('revision') as number
        : null
      : null;
    if (censusSnapshot.exists && censusRevision === null) {
      throw commandError('failed-precondition', 'The social-deduction census is malformed; refresh before retrying.', 'malformed-input');
    }
    const revision = (priorResponse?.revision ?? 0) + 1;
    const result: ZealotryResponseResult = {
      status: 'committed',
      sessionId: response.sessionId,
      crisisId: response.crisisId,
      crisisRevision: response.expectedRevision,
      revision,
      actions: response.actions,
      ...(response.customResponse === undefined ? {} : { customResponse: response.customResponse }),
      rationale: response.rationale,
      loyaltyCensusRevision: censusRevision,
      label: 'ZEALOTRY RESPONSE',
    };
    const projection = {
      type: 'zealotry-response',
      sessionId: response.sessionId,
      crisisId: response.crisisId,
      crisisRevision: response.expectedRevision,
      state: 'debated' as const,
      revision,
      actions: response.actions,
      ...(response.customResponse === undefined ? {} : { customResponse: response.customResponse }),
      rationale: response.rationale,
      loyaltyCensusRevision: censusRevision,
      actorUid: uid,
      instanceId: response.instanceId,
      label: 'ZEALOTRY RESPONSE' as const,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(currentResponseRef, projection);
    tx.set(historyRef, { ...projection, requestId: response.requestId, createdAt: FieldValue.serverTimestamp() });
    tx.set(auditRef, {
      type: 'zealotry-response',
      action: 'record',
      sessionId: response.sessionId,
      crisisId: response.crisisId,
      crisisRevision: response.expectedRevision,
      revision,
      requestId: response.requestId,
      actions: response.actions,
      ...(response.customResponse === undefined ? {} : { customResponse: response.customResponse }),
      rationale: response.rationale,
      loyaltyCensusRevision: censusRevision,
      actorUid: uid,
      instanceId: response.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type CivilUnrestResolutionResult = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  crisisId: string;
  crisisRevision: number;
  revision: number;
  presidentResponse: string;
  consequence: string;
  rationale: string;
  grievanceRevisions: readonly { readonly shipId: typeof CIVIL_UNREST_RESOLUTION_SHIP_IDS[number]; readonly revision: number | null }[];
  recordedBy: 'facilitator';
  actorUid: string;
  instanceId: string;
  label: 'CIVIL UNREST RESOLUTION';
}>;

function isCivilUnrestResolutionResult(value: unknown, sessionId: string): value is CivilUnrestResolutionResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const parsed = parseStoredCivilUnrestResolution({
    type: 'civil-unrest-resolution', sessionId: result.sessionId, crisisId: result.crisisId,
    crisisRevision: result.crisisRevision, state: 'debated', revision: result.revision,
    presidentResponse: result.presidentResponse, consequence: result.consequence, rationale: result.rationale,
    grievanceRevisions: result.grievanceRevisions, recordedBy: result.recordedBy,
    actorUid: result.actorUid, instanceId: result.instanceId,
  });
  return (result.status === 'committed' || result.status === 'replayed') &&
    result.sessionId === sessionId && parsed !== null && result.label === 'CIVIL UNREST RESOLUTION';
}

/** Record a private facilitator resolution for the current debated Civil Unrest crisis. */
export const recordCivilUnrestResolution = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  crisisId?: unknown;
  presidentResponse?: unknown;
  consequence?: unknown;
  rationale?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const response = requireCivilUnrestResolutionRequest(request.data ?? {});
  const currentCrisisRef = db.doc(`sessions/${response.sessionId}/crisisState/current`);
  const currentResolutionRef = db.doc(`sessions/${response.sessionId}/civilUnrestResolutions/current`);
  const grievanceRefs = CIVIL_UNREST_RESOLUTION_SHIP_IDS.map((shipId) =>
    db.doc(`sessions/${response.sessionId}/civilUnrestGrievances/${shipId}`));
  const historyRef = db.doc(`sessions/${response.sessionId}/civilUnrestResolutions/history-${response.requestId}`);
  const auditRef = db.doc(`sessions/${response.sessionId}/civilUnrestResolutions/audit-${response.requestId}`);
  const receiptRef = commandReceiptRef(response.sessionId, response.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'record-civil-unrest-resolution',
    sessionId: response.sessionId,
    requestId: response.requestId,
    actorUid: uid,
    instanceId: response.instanceId,
    expectedRevision: response.expectedRevision,
    payload: {
      crisisId: response.crisisId,
      presidentResponse: response.presidentResponse,
      consequence: response.consequence,
      rationale: response.rationale,
    },
  };

  return db.runTransaction(async (tx): Promise<CivilUnrestResolutionResult> => {
    const [authority, crisisSnapshot, currentResolutionSnapshot, receipt, audit, ...grievances] = await Promise.all([
      requireFacilitatorInstance(tx, response.sessionId, uid, response.instanceId),
      tx.get(currentCrisisRef),
      tx.get(currentResolutionRef),
      tx.get(receiptRef),
      tx.get(auditRef),
      ...grievanceRefs.map((ref) => tx.get(ref)),
    ]);
    await rejectForeignLegacyM1Command(tx, response.sessionId, response.requestId, 'Civil Unrest resolution', []);
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is CivilUnrestResolutionResult => isCivilUnrestResolutionResult(value, response.sessionId),
      'Civil Unrest resolution',
    );
    if (replay) return replay;
    if (audit.exists) rejectLegacyEventReplay('Civil Unrest resolution');
    requireActiveGameplayPhase(authority.session);
    if (!crisisSnapshot.exists || crisisSnapshot.get('type') !== 'crisis-state' ||
        crisisSnapshot.get('sessionId') !== response.sessionId || crisisSnapshot.get('crisisId') !== response.crisisId ||
        crisisSnapshot.get('crisisKind') !== 'civil-unrest' || crisisSnapshot.get('state') !== 'debated' ||
        crisisSnapshot.get('revision') !== response.expectedRevision ||
        !Number.isSafeInteger(crisisSnapshot.get('revision')) || (crisisSnapshot.get('revision') as number) < 1) {
      throw commandError('failed-precondition', 'Record a resolution only for the current debated Civil Unrest crisis.', 'stale-revision');
    }
    const priorResolution = currentResolutionSnapshot.exists
      ? parseStoredCivilUnrestResolution(currentResolutionSnapshot.data()) : null;
    if (currentResolutionSnapshot.exists && (!priorResolution ||
        priorResolution.sessionId !== response.sessionId || priorResolution.crisisId !== response.crisisId ||
        priorResolution.crisisRevision > response.expectedRevision)) {
      throw commandError('failed-precondition', 'The current Civil Unrest resolution projection is malformed.', 'malformed-input');
    }
    const grievanceRevisions = grievances.map((snapshot, index) => {
      const shipId = CIVIL_UNREST_RESOLUTION_SHIP_IDS[index]!;
      if (!snapshot.exists) return { shipId, revision: null };
      const raw = snapshot.data();
      if (!raw || raw.type !== 'civil-unrest-grievance' || raw.sessionId !== response.sessionId ||
          raw.crisisId !== response.crisisId || raw.shipId !== shipId ||
          (raw.visibility !== 'private' && raw.visibility !== 'public') || typeof raw.text !== 'string' ||
          raw.text.trim().length === 0 || raw.text.length > 2000 || !Number.isSafeInteger(raw.revision) ||
          (raw.revision as number) < 1 || !Number.isSafeInteger(raw.crisisRevision) ||
          (raw.crisisRevision as number) < 1 || (raw.crisisRevision as number) > response.expectedRevision) {
        throw commandError('failed-precondition', 'A current Civil Unrest grievance is malformed; refresh before recording.', 'malformed-input');
      }
      return { shipId, revision: raw.revision as number };
    });
    const revision = (priorResolution?.revision ?? 0) + 1;
    const result: CivilUnrestResolutionResult = {
      status: 'committed', sessionId: response.sessionId, crisisId: response.crisisId,
      crisisRevision: response.expectedRevision, revision,
      presidentResponse: response.presidentResponse, consequence: response.consequence,
      rationale: response.rationale, grievanceRevisions, recordedBy: 'facilitator', actorUid: uid,
      instanceId: response.instanceId, label: 'CIVIL UNREST RESOLUTION',
    };
    const projection = {
      type: 'civil-unrest-resolution' as const,
      sessionId: response.sessionId, crisisId: response.crisisId,
      crisisRevision: response.expectedRevision, state: 'debated' as const, revision,
      presidentResponse: response.presidentResponse, consequence: response.consequence,
      rationale: response.rationale, grievanceRevisions, recordedBy: 'facilitator' as const,
      actorUid: uid, instanceId: response.instanceId, label: 'CIVIL UNREST RESOLUTION' as const,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(currentResolutionRef, projection);
    tx.set(historyRef, { ...projection, requestId: response.requestId, createdAt: FieldValue.serverTimestamp() });
    tx.set(auditRef, {
      type: 'civil-unrest-resolution', action: 'record', sessionId: response.sessionId,
      crisisId: response.crisisId, crisisRevision: response.expectedRevision, revision,
      requestId: response.requestId, presidentResponse: response.presidentResponse,
      consequence: response.consequence, rationale: response.rationale, grievanceRevisions,
      recordedBy: 'facilitator', actorUid: uid, instanceId: response.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type CivilUnrestGrievanceResult = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  crisisId: string;
  shipId: string;
  visibility: 'private' | 'public';
  revision: number;
}>;

function isCivilUnrestGrievanceResult(value: unknown, sessionId: string): value is CivilUnrestGrievanceResult {
  if (!isRecord(value)) return false;
  return (value.status === 'committed' || value.status === 'replayed') &&
    value.sessionId === sessionId && typeof value.crisisId === 'string' &&
    civilUnrestShipId(value.shipId) && (value.visibility === 'private' || value.visibility === 'public') &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 1;
}

function civilUnrestTeamPhase(session: DocumentSnapshot): boolean {
  const turnState = session.get('turnState');
  if (isRecord(turnState) && turnState.phase === 'team') return true;
  const turnPhase = session.get('turnPhase');
  return isRecord(turnPhase) && isRecord(turnPhase.airspace) && turnPhase.airspace.state === 'restricted';
}

/** A player may submit only for their live assigned ship, or one canonical union pair. */
export const submitCivilUnrestGrievance = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  crisisId?: unknown;
  expectedCrisisRevision?: unknown;
  expectedGrievanceRevision?: unknown;
  affectedShipId?: unknown;
  visibility?: unknown;
  text?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const grievance = requireCivilUnrestGrievanceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${grievance.sessionId}`);
  const playerRef = db.doc(`sessions/${grievance.sessionId}/players/${uid}`);
  const crisisRef = db.doc(`sessions/${grievance.sessionId}/crisisState/current`);
  const publicRef = db.doc(`sessions/${grievance.sessionId}/civilUnrestPublic/current`);
  const currentRefFor = (shipId: string) => db.doc(
    `sessions/${grievance.sessionId}/civilUnrestGrievances/${shipId}`,
  );
  const receiptRef = commandReceiptRef(grievance.sessionId, grievance.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'submit-civil-unrest-grievance',
    sessionId: grievance.sessionId,
    requestId: grievance.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: null,
    payload: {
      crisisId: grievance.crisisId,
      expectedCrisisRevision: grievance.expectedCrisisRevision,
      expectedGrievanceRevision: grievance.expectedGrievanceRevision,
      affectedShipId: grievance.affectedShipId ?? null,
      visibility: grievance.visibility,
      text: grievance.text,
    },
  };

  return db.runTransaction(async (tx): Promise<CivilUnrestGrievanceResult> => {
    const [session, player, crisis, publicProjection] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(crisisRef),
      tx.get(publicRef),
    ]);
    if (!session.exists || !player.exists || !isActivePlayer(player) || player.get('role') !== 'player') {
      throw commandError('permission-denied', 'Only an active player may submit a team grievance.', 'unauthorized');
    }
    requireActiveGameplayPhase(session);
    if (!civilUnrestTeamPhase(session)) {
      throw commandError('failed-precondition', 'Team grievances are only available during Team Phase.', 'invalid-phase');
    }
    if (!crisis.exists || crisis.get('type') !== 'crisis-state' || crisis.get('crisisKind') !== 'civil-unrest' ||
        crisis.get('crisisId') !== grievance.crisisId ||
        !['delivered', 'debated', 'escalated'].includes(crisis.get('state')) ||
        !Number.isSafeInteger(crisis.get('revision')) || (crisis.get('revision') as number) < 1) {
      throw commandError('failed-precondition', 'Civil Unrest is not accepting grievances in this crisis state.', 'invalid-phase');
    }
    if (crisis.get('revision') !== grievance.expectedCrisisRevision) {
      throw commandError('failed-precondition', 'The crisis changed. Refresh before submitting your grievance.', 'stale-revision');
    }
    const activeShips = activeVesselIdsForSession(session);
    const roleId = typeof player.get('replacementRoleId') === 'string'
      ? player.get('replacementRoleId') as string
      : typeof player.get('activeConsoleRoleId') === 'string'
        ? player.get('activeConsoleRoleId') as string
        : player.get('assignedRoleId');
    const entitledShips = civilUnrestShipsForRole(roleId).filter((shipId) =>
      activeShips.includes(shipId) && civilUnrestShipId(shipId));
    if (entitledShips.length === 0) {
      throw commandError('permission-denied', 'Your current role is not assigned to an affected team.', 'unauthorized');
    }
    const shipId = grievance.affectedShipId ?? (entitledShips.length === 1 ? entitledShips[0] : undefined);
    if (!shipId || !civilUnrestShipId(shipId) || !entitledShips.includes(shipId)) {
      throw commandError('permission-denied', 'Choose one active ship in your current team assignment.', 'unauthorized');
    }
    const currentRef = currentRefFor(shipId);
    const [current, receipt] = await Promise.all([tx.get(currentRef), tx.get(receiptRef)]);
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is CivilUnrestGrievanceResult => isCivilUnrestGrievanceResult(value, grievance.sessionId),
      'Civil Unrest grievance',
    );
    if (replay) return replay;
    if (current.exists && (
      current.get('type') !== 'civil-unrest-grievance' || current.get('sessionId') !== grievance.sessionId ||
      current.get('crisisId') !== grievance.crisisId || current.get('shipId') !== shipId ||
      !['private', 'public'].includes(current.get('visibility')) || typeof current.get('text') !== 'string' ||
      !Number.isSafeInteger(current.get('revision')) || (current.get('revision') as number) < 1
    )) {
      throw commandError('failed-precondition', 'The current team grievance is malformed; refresh before retrying.', 'malformed-input');
    }
    const currentRevision = current.exists ? current.get('revision') as number : 0;
    if (currentRevision !== grievance.expectedGrievanceRevision) {
      throw commandError('failed-precondition', 'Your team grievance changed. Refresh before revising it.', 'stale-revision');
    }
    const storedPublic = publicProjection.exists ? publicProjection.data() : undefined;
    const publicGrievances = storedPublic && Array.isArray(storedPublic.grievances)
      ? storedPublic.grievances.filter((entry): entry is Record<string, unknown> => isRecord(entry))
      : [];
    if (publicProjection.exists && storedPublic && (
      storedPublic.sessionId !== grievance.sessionId || storedPublic.crisisId !== grievance.crisisId ||
      !['delivered', 'debated', 'escalated'].includes(storedPublic.state) ||
      publicGrievances.length > CIVIL_UNREST_SHIP_IDS.length ||
      new Set(publicGrievances.map((entry) => entry.shipId)).size !== publicGrievances.length ||
      publicGrievances.some((entry) => !civilUnrestShipId(entry.shipId) || typeof entry.text !== 'string' ||
        entry.text.length === 0 || entry.text.length > 2000 ||
        !Number.isSafeInteger(entry.revision) || (entry.revision as number) < 1)
    )) {
      throw commandError('failed-precondition', 'The public grievance projection is malformed; refresh before retrying.', 'malformed-input');
    }
    const revision = currentRevision + 1;
    const result: CivilUnrestGrievanceResult = {
      status: 'committed', sessionId: grievance.sessionId, crisisId: grievance.crisisId,
      shipId, visibility: grievance.visibility, revision,
    };
    tx.set(currentRef, {
      type: 'civil-unrest-grievance', sessionId: grievance.sessionId, crisisId: grievance.crisisId,
      shipId, visibility: grievance.visibility, text: grievance.text, revision,
      crisisRevision: grievance.expectedCrisisRevision, updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(currentRef.collection('audit').doc(grievance.requestId), {
      type: 'civil-unrest-grievance', action: 'submit', sessionId: grievance.sessionId,
      crisisId: grievance.crisisId, shipId, visibility: grievance.visibility, text: grievance.text,
      revision, crisisRevision: grievance.expectedCrisisRevision, actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    const nextPublicGrievances = publicGrievances
      .filter((entry) => entry.shipId !== shipId)
      .concat(grievance.visibility === 'public' ? [{ shipId, text: grievance.text, revision }] : []);
    tx.set(publicRef, {
      type: 'civil-unrest-public', sessionId: grievance.sessionId, crisisId: grievance.crisisId,
      state: crisis.get('state'), revision: grievance.expectedCrisisRevision,
      grievances: nextPublicGrievances, updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

function isArbourVisionResult(value: unknown, sessionId: string): value is ArbourVisionResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (result.status === 'committed' || result.status === 'replayed') &&
    result.sessionId === sessionId && typeof result.recipientUid === 'string' &&
    Number.isSafeInteger(result.revision) && (result.revision as number) >= 1 &&
    (result.kind === 'location' || result.kind === 'danger' || result.kind === 'suspicion') &&
    typeof result.text === 'string' && result.text.length > 0 && result.text.length <= 240 &&
    result.label === 'FACILITATOR CALL';
}

/** Publish one facilitator-authored Universal Arbour call to its current holder. */
export const authorArbourVision = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  targetUid?: unknown;
  kind?: unknown;
  text?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const vision = requireArbourVisionRequest(request.data ?? {});
  const currentRef = db.doc(`sessions/${vision.sessionId}/arbourVisions/current`);
  const recipientRef = db.doc(`sessions/${vision.sessionId}/arbourVisions/${vision.targetUid}`);
  const secretRef = db.doc(`sessions/${vision.sessionId}/secrets/loyalty-${vision.targetUid}`);
  const targetRef = db.doc(`sessions/${vision.sessionId}/players/${vision.targetUid}`);
  const censusRef = db.doc(`sessions/${vision.sessionId}/loyaltyCensus/current`);
  const authorityRef = db.doc(`sessions/${vision.sessionId}/arbourVisionAuthority/current`);
  const auditRef = db.doc(`sessions/${vision.sessionId}/arbourVisions/current/audit/${vision.requestId}`);
  const receiptRef = commandReceiptRef(vision.sessionId, vision.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'author-arbour-vision',
    sessionId: vision.sessionId,
    requestId: vision.requestId,
    actorUid: uid,
    instanceId: vision.instanceId,
    expectedRevision: vision.expectedRevision,
    payload: {
      targetUid: vision.targetUid,
      kind: vision.kind,
      text: vision.text,
    },
  };

  return db.runTransaction(async (tx): Promise<ArbourVisionResult> => {
    const [authority, current, target, secret, census, receipt, audit] = await Promise.all([
      requireFacilitatorInstance(tx, vision.sessionId, uid, vision.instanceId),
      tx.get(currentRef),
      tx.get(targetRef),
      tx.get(secretRef),
      tx.get(censusRef),
      tx.get(receiptRef),
      tx.get(auditRef),
    ]);
    await rejectForeignLegacyM1Command(tx, vision.sessionId, vision.requestId, 'Arbour vision', []);
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is ArbourVisionResult => isArbourVisionResult(value, vision.sessionId),
      'Arbour vision',
    );
    if (replay) return replay;
    if (audit.exists) rejectLegacyEventReplay('Arbour vision');
    requireActiveGameplayPhase(authority.session);
    const activeRoleIds = sessionActiveRoleIds(authority.session);
    const censusEntries = storedLoyaltyCensusEntries(census);
    const targetRoleId = target.get('assignedRoleId');
    if (!target.exists || isKickedPlayer(target) || target.get('role') !== 'player' ||
        typeof targetRoleId !== 'string' || !activeRoleIds.includes(targetRoleId) ||
        !censusEntries?.some((entry) => entry.uid === vision.targetUid && entry.kind === 'universal-arbour')) {
      throw commandError(
        'failed-precondition',
        'The selected player is not the current canonical Universal Arbour holder.',
        'conflict',
      );
    }
    const secretPayload = secret.get('payload');
    if (typeof secretPayload !== 'object' || secretPayload === null || Array.isArray(secretPayload) ||
        (secretPayload as Record<string, unknown>).type !== 'loyalty' ||
        (secretPayload as Record<string, unknown>).kind !== 'universal-arbour' ||
        !hasExactPrivateSecretAudience(secret, vision.targetUid)) {
      throw commandError(
        'failed-precondition',
        'The selected player does not have a current Universal Arbour loyalty card.',
        'conflict',
      );
    }
    const currentRevision = current.exists && Number.isSafeInteger(current.get('revision')) &&
      (current.get('revision') as number) >= 0 ? current.get('revision') as number : 0;
    if (current.exists && current.get('type') !== 'arbour-visions') {
      throw commandError('failed-precondition', 'The Arbour vision projection is malformed.', 'malformed-input');
    }
    if (currentRevision !== vision.expectedRevision) {
      throw commandError(
        'failed-precondition',
        'The Arbour vision changed. Refresh the private projection and try again.',
        'stale-revision',
      );
    }
    const revision = currentRevision + 1;
    const result: ArbourVisionResult = {
      status: 'committed',
      sessionId: vision.sessionId,
      recipientUid: vision.targetUid,
      revision,
      kind: vision.kind,
      text: vision.text,
      label: 'FACILITATOR CALL',
    };
    const projection = {
      type: 'arbour-vision',
      sessionId: vision.sessionId,
      recipientUid: vision.targetUid,
      visibleToUids: [vision.targetUid],
      revision,
      kind: vision.kind,
      text: vision.text,
      label: 'FACILITATOR CALL',
      updatedAt: FieldValue.serverTimestamp(),
    };
    const previousRecipientUid = current.get('recipientUid');
    tx.set(currentRef, {
      type: 'arbour-visions',
      sessionId: vision.sessionId,
      recipientUid: vision.targetUid,
      visibleToUids: [uid],
      revision,
      kind: vision.kind,
      text: vision.text,
      label: 'FACILITATOR CALL',
      actorUid: uid,
      instanceId: vision.instanceId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(recipientRef, projection);
    tx.set(authorityRef, {
      type: 'arbour-vision-authority',
      sessionId: vision.sessionId,
      recipientUid: vision.targetUid,
      revision,
    });
    if (typeof previousRecipientUid === 'string' && previousRecipientUid !== vision.targetUid) {
      tx.delete(db.doc(`sessions/${vision.sessionId}/arbourVisions/${previousRecipientUid}`));
    }
    tx.set(auditRef, {
      type: 'arbour-vision',
      action: 'author',
      recipientUid: vision.targetUid,
      kind: vision.kind,
      revision,
      actorUid: uid,
      instanceId: vision.instanceId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type FacilitatorRuleCallResult = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  callId: string;
  revision: number;
  ambiguity: string;
  source: string;
  decision: string;
  audience: 'gm-only' | 'selected-player';
  recipientUid?: string;
  actorUid: string;
  createdAt: string;
  supersedesCallId?: string;
  label: 'FACILITATOR RULE CALL';
}>;

function isFacilitatorRuleCallResult(
  value: unknown,
  sessionId: string,
): value is FacilitatorRuleCallResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (result.status === 'committed' || result.status === 'replayed') &&
    result.sessionId === sessionId && isCanonicalRequestId(result.callId) &&
    Number.isSafeInteger(result.revision) && (result.revision as number) >= 1 &&
    typeof result.ambiguity === 'string' && result.ambiguity.length > 0 && result.ambiguity.length <= 240 &&
    typeof result.source === 'string' && result.source.length > 0 && result.source.length <= 240 &&
    typeof result.decision === 'string' && result.decision.length > 0 && result.decision.length <= 500 &&
    (result.audience === 'gm-only' || result.audience === 'selected-player') &&
    (result.recipientUid === undefined || isCanonicalRequestId(result.recipientUid)) &&
    typeof result.actorUid === 'string' && result.actorUid.length > 0 &&
    typeof result.createdAt === 'string' && result.createdAt.length > 0 &&
    (result.supersedesCallId === undefined || isCanonicalRequestId(result.supersedesCallId)) &&
    result.label === 'FACILITATOR RULE CALL';
}

function isStoredFacilitatorRuleCall(value: unknown, sessionId: string): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const allowedKeys = new Set([
    'type', 'sessionId', 'callId', 'revision', 'ambiguity', 'source', 'decision',
    'audience', 'recipientUid', 'actorUid', 'label', 'supersedesCallId', 'createdAt',
  ]);
  if (keys.some((key) => !allowedKeys.has(key))) return false;
  const createdAt = record.createdAt;
  const hasStoredTimestamp = typeof createdAt === 'string'
    ? createdAt.length > 0
    : typeof createdAt === 'object' && createdAt !== null &&
      typeof (createdAt as { toMillis?: unknown }).toMillis === 'function';
  return record.type === 'facilitator-rule-call' && record.sessionId === sessionId &&
    isCanonicalRequestId(record.callId) &&
    Number.isSafeInteger(record.revision) && (record.revision as number) >= 1 &&
    typeof record.ambiguity === 'string' && record.ambiguity.length > 0 && record.ambiguity.length <= 240 &&
    typeof record.source === 'string' && record.source.length > 0 && record.source.length <= 240 &&
    typeof record.decision === 'string' && record.decision.length > 0 && record.decision.length <= 500 &&
    (record.audience === 'gm-only' || record.audience === 'selected-player') &&
    (record.audience === 'gm-only'
      ? record.recipientUid === undefined
      : isCanonicalRequestId(record.recipientUid)) &&
    typeof record.actorUid === 'string' && record.actorUid.length > 0 &&
    record.label === 'FACILITATOR RULE CALL' && hasStoredTimestamp &&
    (record.supersedesCallId === undefined ||
      (isCanonicalRequestId(record.supersedesCallId) &&
        record.supersedesCallId !== record.callId));
}

/** Record one durable facilitator ruling without publishing a public event. */
export const authorFacilitatorRuleCall = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  ambiguity?: unknown;
  source?: unknown;
  decision?: unknown;
  audience?: unknown;
  recipientUid?: unknown;
  supersedesCallId?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const call = requireFacilitatorRuleCallRequest(request.data ?? {});
  const currentRef = db.doc(`sessions/${call.sessionId}/facilitatorRuleCalls/gm-current`);
  const historyRef = db.doc(`sessions/${call.sessionId}/facilitatorRuleCalls/history-${call.requestId}`);
  const auditRef = db.doc(`sessions/${call.sessionId}/facilitatorRuleCalls/audit-${call.requestId}`);
  const receiptRef = commandReceiptRef(call.sessionId, call.requestId);
  const supersededRef = call.supersedesCallId
    ? db.doc(`sessions/${call.sessionId}/facilitatorRuleCalls/history-${call.supersedesCallId}`)
    : null;
  const recipientRef = call.recipientUid
    ? db.doc(`sessions/${call.sessionId}/facilitatorRuleCalls/recipient-${call.recipientUid}`)
    : null;
  const fingerprint: CommandFingerprint = {
    action: 'author-facilitator-rule-call',
    sessionId: call.sessionId,
    requestId: call.requestId,
    actorUid: uid,
    instanceId: call.instanceId,
    expectedRevision: call.expectedRevision,
    payload: {
      ambiguity: call.ambiguity,
      source: call.source,
      decision: call.decision,
      audience: call.audience,
      recipientUid: call.recipientUid ?? null,
      supersedesCallId: call.supersedesCallId ?? null,
    },
  };
  const committedAt = new Date().toISOString();

  return db.runTransaction(async tx => {
    const [authority, current, receipt, superseded, audit] = await Promise.all([
      requireFacilitatorInstance(tx, call.sessionId, uid, call.instanceId),
      tx.get(currentRef),
      tx.get(receiptRef),
      supersededRef ? tx.get(supersededRef) : Promise.resolve(null),
      tx.get(auditRef),
    ]);
    await rejectForeignLegacyM1Command(tx, call.sessionId, call.requestId, 'facilitator rule call', []);
    if (current.exists && !isStoredFacilitatorRuleCall(current.data(), call.sessionId)) {
      throw commandError('failed-precondition', 'The facilitator rule-call projection is malformed.', 'malformed-input');
    }
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is FacilitatorRuleCallResult => isFacilitatorRuleCallResult(value, call.sessionId),
      'facilitator rule call',
    );
    if (replay) return replay;
    if (audit.exists) rejectLegacyEventReplay('facilitator rule call');
    requireActiveGameplayPhase(authority.session);
    const currentRevision = current.exists ? current.get('revision') as number : 0;
    if (currentRevision !== call.expectedRevision) {
      throw commandError(
        'failed-precondition',
        'Facilitator rule calls changed. Refresh the live call record and try again.',
        'stale-revision',
      );
    }
    if (call.supersedesCallId) {
      if (!superseded?.exists || superseded.get('type') !== 'facilitator-rule-call') {
        throw commandError('failed-precondition', 'The superseded rule call is not available.', 'conflict');
      }
      if (superseded.get('supersededByCallId') !== undefined) {
        throw commandError('failed-precondition', 'That rule call has already been superseded.', 'conflict');
      }
      if (call.supersedesCallId === call.requestId) {
        throw commandError('failed-precondition', 'A rule call cannot supersede itself.', 'conflict');
      }
    }
    if (call.audience === 'selected-player') {
      const target = await tx.get(db.doc(`sessions/${call.sessionId}/players/${call.recipientUid}`));
      if (!target.exists || !isActivePlayer(target) || target.get('role') !== 'player') {
        throw commandError('failed-precondition', 'The selected recipient is not an active player.', 'conflict');
      }
    }
    const revision = currentRevision + 1;
    const result: FacilitatorRuleCallResult = {
      status: 'committed',
      sessionId: call.sessionId,
      callId: call.requestId,
      revision,
      ambiguity: call.ambiguity,
      source: call.source,
      decision: call.decision,
      audience: call.audience,
      ...(call.recipientUid ? { recipientUid: call.recipientUid } : {}),
      actorUid: uid,
      createdAt: committedAt,
      ...(call.supersedesCallId ? { supersedesCallId: call.supersedesCallId } : {}),
      label: 'FACILITATOR RULE CALL',
    };
    const storedCall = {
      type: 'facilitator-rule-call',
      sessionId: call.sessionId,
      callId: call.requestId,
      revision,
      ambiguity: call.ambiguity,
      source: call.source,
      decision: call.decision,
      audience: call.audience,
      ...(call.recipientUid ? { recipientUid: call.recipientUid } : {}),
      actorUid: uid,
      label: 'FACILITATOR RULE CALL',
      ...(call.supersedesCallId ? { supersedesCallId: call.supersedesCallId } : {}),
      createdAt: FieldValue.serverTimestamp(),
    };
    const recipientCall = call.recipientUid
      ? {
        type: storedCall.type,
        sessionId: storedCall.sessionId,
        callId: storedCall.callId,
        revision: storedCall.revision,
        ambiguity: storedCall.ambiguity,
        source: storedCall.source,
        decision: storedCall.decision,
        audience: storedCall.audience,
        recipientUid: call.recipientUid,
        label: storedCall.label,
        visibleToUids: [call.recipientUid],
      }
      : null;
    tx.set(currentRef, storedCall);
    tx.set(historyRef, storedCall);
    tx.set(auditRef, {
      type: 'facilitator-rule-call-audit',
      callId: call.requestId,
      sessionId: call.sessionId,
      revision,
      ambiguity: call.ambiguity,
      source: call.source,
      decision: call.decision,
      audience: call.audience,
      ...(call.recipientUid ? { recipientUid: call.recipientUid } : {}),
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      ...(call.supersedesCallId ? { supersedesCallId: call.supersedesCallId } : {}),
    });
    if (supersededRef) tx.update(supersededRef, { supersededByCallId: call.requestId });
    if (recipientRef && recipientCall) tx.set(recipientRef, recipientCall);
    if (call.supersedesCallId && superseded?.get('audience') === 'selected-player' &&
        superseded.get('recipientUid') !== call.recipientUid) {
      const previousRecipientUid = superseded.get('recipientUid');
      if (typeof previousRecipientUid === 'string') {
        tx.delete(db.doc(`sessions/${call.sessionId}/facilitatorRuleCalls/recipient-${previousRecipientUid}`));
      }
    }
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

function canonicalLoyaltySecret(
  secret: DocumentSnapshot,
  players: readonly DocumentSnapshot[],
  activeRoleIds: readonly string[],
): CanonicalLoyaltySecret | null {
  if (!secret.exists || !secret.id.startsWith('loyalty-')) return null;
  const uid = secret.id.slice('loyalty-'.length);
  if (!uid) return null;
  if (!hasExactPrivateSecretAudience(secret, uid)) return null;
  const holder = players.find((candidate) => candidate.id === uid);
  if (!isCanonicalLoyaltyHolder(holder, uid, players, activeRoleIds)) return null;
  const payload = secret.get('payload');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.type !== 'loyalty' || typeof record.kind !== 'string') return null;
  const suspicion = record.suspicion === null
    ? null
    : typeof record.suspicion === 'number' ? record.suspicion : Number.NaN;
  const decision = loyaltyAssignmentDecision(record.kind, suspicion);
  if (!decision.allowed) return null;
  if (record.kind !== 'friend' && record.partnerUid !== undefined && record.partnerUid !== null) return null;
  if (record.kind === 'friend' &&
      (typeof record.partnerUid !== 'string' || record.partnerUid === uid)) return null;
  return { uid, kind: record.kind as LoyaltyKind };
}

/**
 * Return a Friend's former partner only for a complete private reciprocal
 * record. Reassignment may replace a holder's secret, but it must not erase a
 * malformed or unrelated secret merely because it names that holder.
 */
function hasExactPrivateSecretAudience(secret: DocumentSnapshot | undefined, uid: string): boolean {
  if (!secret?.exists) return false;
  const visibleToUids = secret.get('visibleToUids');
  return Array.isArray(visibleToUids) && visibleToUids.length === 1 && visibleToUids[0] === uid;
}

function privateFriendPartnerUid(secret: DocumentSnapshot | undefined, uid: string): string | null {
  if (!hasExactPrivateSecretAudience(secret, uid)) return null;
  if (!secret) return null;
  const payload = secret.get('payload');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.type !== 'loyalty' || record.kind !== 'friend' || record.suspicion !== 0) return null;
  return typeof record.partnerUid === 'string' && record.partnerUid.length > 0 && record.partnerUid !== uid
    ? record.partnerUid
    : null;
}

function isKnownFriendRoleId(value: unknown): value is string {
  return typeof value === 'string' && (
    (ROLE_IDS as readonly string[]).includes(value) || replacementRoleFor(value) !== undefined
  );
}

function isCompleteReciprocalFriendPair(
  holderSecret: DocumentSnapshot | undefined,
  holderUid: string,
  holderRoleId: unknown,
  partnerSecret: DocumentSnapshot | undefined,
  partnerUid: string,
  expectedPartnerUid: string,
): boolean {
  if (!holderSecret?.exists || !partnerSecret?.exists || !isKnownFriendRoleId(holderRoleId)) return false;
  if (!hasExactPrivateSecretAudience(holderSecret, holderUid) ||
      !hasExactPrivateSecretAudience(partnerSecret, partnerUid)) return false;
  const holderPayload = holderSecret.get('payload');
  const partnerPayload = partnerSecret.get('payload');
  if (typeof holderPayload !== 'object' || holderPayload === null || Array.isArray(holderPayload) ||
      typeof partnerPayload !== 'object' || partnerPayload === null || Array.isArray(partnerPayload)) return false;
  const holderRecord = holderPayload as Record<string, unknown>;
  const partnerRecord = partnerPayload as Record<string, unknown>;
  return holderRecord.type === 'loyalty' && holderRecord.kind === 'friend' && holderRecord.suspicion === 0 &&
    holderRecord.partnerUid === partnerUid && isKnownFriendRoleId(holderRecord.partnerRoleId) &&
    partnerRecord.type === 'loyalty' && partnerRecord.kind === 'friend' && partnerRecord.suspicion === 0 &&
    partnerRecord.partnerUid === expectedPartnerUid && partnerRecord.partnerRoleId === holderRoleId;
}

/** Assign a private loyalty card through the facilitator boundary. */
export const assignLoyalty = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  targetUid?: unknown;
  kind?: unknown;
  suspicion?: unknown;
  partnerUid?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const assignment = requireLoyaltyAssignmentRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${assignment.sessionId}`);
  const targetRef = db.doc(`sessions/${assignment.sessionId}/players/${assignment.targetUid}`);
  const eventRef = db.doc(`sessions/${assignment.sessionId}/events/${assignment.requestId}`);
  const receiptRef = db.doc(
    `sessions/${assignment.sessionId}/loyaltyAssignmentRequests/${assignment.requestId}`,
  );
  const targetSecretRef = db.doc(`sessions/${assignment.sessionId}/secrets/loyalty-${assignment.targetUid}`);
  const secretsRef = db.collection(`sessions/${assignment.sessionId}/secrets`);
  const playersRef = db.collection(`sessions/${assignment.sessionId}/players`);
  const partnerRef = assignment.partnerUid
    ? db.doc(`sessions/${assignment.sessionId}/players/${assignment.partnerUid}`)
    : undefined;
  const partnerSecretRef = assignment.partnerUid
    ? db.doc(`sessions/${assignment.sessionId}/secrets/loyalty-${assignment.partnerUid}`)
    : undefined;
  const fingerprint = loyaltyAssignmentFingerprint(assignment, uid);
  const sharedReceiptRef = commandReceiptRef(assignment.sessionId, assignment.requestId);
  const sharedFingerprint: CommandFingerprint = {
    action: fingerprint.action,
    sessionId: fingerprint.sessionId,
    requestId: assignment.requestId,
    actorUid: fingerprint.actorUid,
    instanceId: fingerprint.instanceId,
    expectedRevision: null,
    payload: {
      targetUid: fingerprint.targetUid,
      kind: fingerprint.kind,
      suspicion: fingerprint.suspicion,
      partnerUid: fingerprint.partnerUid,
    },
  };
  const censusRef = db.doc(`sessions/${assignment.sessionId}/loyaltyCensus/current`);

  return db.runTransaction(async (tx): Promise<CastingMutationResult & { assignedUids: readonly string[] }> => {
    // Authorize before replay. The receipt is server-only; the public event is
    // retained only as an audit projection and never as replay state.
    const [sharedReceipt, prior, legacyEvent, authority] = await Promise.all([
      tx.get(sharedReceiptRef),
      tx.get(receiptRef),
      tx.get(eventRef),
      requireFacilitatorInstance(tx, assignment.sessionId, uid, assignment.instanceId),
    ]);
    await rejectForeignLegacyM1Command(
      tx, assignment.sessionId, assignment.requestId, 'loyalty assignment',
      [receiptRef.path, eventRef.path],
    );
    const sharedReplay = replayBoundCommand(
      sharedReceipt,
      sharedFingerprint,
      (value): value is CastingMutationResult & { assignedUids: readonly string[] } =>
        isBoundLoyaltyAssignmentResult(value, fingerprint),
      'loyalty assignment',
    );
    if (sharedReplay) return sharedReplay;
    if (prior.exists) {
      if (prior.get('fingerprint') === undefined) {
        throw commandError('failed-precondition', 'This loyalty request has a legacy unbound receipt without a fingerprint.', 'conflict');
      }
      const storedFingerprint = prior.get('fingerprint');
      if (!isBoundLoyaltyAssignmentFingerprint(storedFingerprint)) {
        throw commandError('failed-precondition', 'This loyalty request has a malformed or legacy unbound fingerprint.', 'conflict');
      }
      if (storedFingerprint.actorUid !== uid) {
        throw new HttpsError('permission-denied', 'This loyalty request belongs to a different facilitator.');
      }
      if (!hasMatchingLoyaltyReceiptBinding(prior, storedFingerprint)) {
        throw commandError('failed-precondition', 'This loyalty request has a malformed receipt binding.', 'conflict');
      }
      if (!sameLoyaltyAssignmentFingerprint(storedFingerprint, fingerprint)) {
        throw commandError('failed-precondition', 'This loyalty request id has a fingerprint collision with a different command or actor.', 'conflict');
      }
      const result = prior.get('result');
      if (isBoundLoyaltyAssignmentResult(result, storedFingerprint)) {
        return result;
      }
      throw commandError('failed-precondition', 'This loyalty request has a malformed or non-replayable result.', 'conflict');
    }
    if (legacyEvent.exists) rejectLegacyEventReplay('loyalty assignment');

    const [target, partner, players, secrets, targetSecret, partnerSecret, census] = await Promise.all([
      tx.get(targetRef),
      partnerRef ? tx.get(partnerRef) : Promise.resolve(undefined),
      tx.get(playersRef),
      tx.get(secretsRef),
      tx.get(targetSecretRef),
      partnerSecretRef ? tx.get(partnerSecretRef) : Promise.resolve(undefined),
      tx.get(censusRef),
    ]);
    requireCastingWindow(authority.session);
    const activeRoleIds = configuredRoleIds(authority.session);
    const playerDocuments = players.docs;
    requireCanonicalLoyaltyHolder(
      target, assignment.targetUid, playerDocuments, activeRoleIds, 'That player',
    );
    if (assignment.partnerUid && assignment.partnerUid === assignment.targetUid) {
      throw new HttpsError('invalid-argument', 'A Friend partner must be another player.');
    }
    if (assignment.partnerUid) {
      requireCanonicalLoyaltyHolder(
        partner, assignment.partnerUid, playerDocuments, activeRoleIds, 'The Friend partner',
      );
    }
    const kind = assignment.kind as LoyaltyKind;
    const decision = loyaltyAssignmentDecision(kind, assignment.suspicion);
    if (!decision.allowed) {
      throw new HttpsError('invalid-argument', `Loyalty assignment rejected: ${decision.reason}.`);
    }
    const lockedSetup = canonicalSetupForSession(authority.session, activeRoleIds);
    const optionalDecision = optionalLoyaltyAssignmentDecision(kind, lockedSetup);
    if (!optionalDecision.allowed) {
      throw commandError(
        'failed-precondition',
        `Loyalty assignment rejected: ${optionalDecision.reason}.`,
        'conflict',
      );
    }
    if (kind === 'friend' && !assignment.partnerUid) {
      throw new HttpsError('invalid-argument', 'Friend loyalty requires a private partner.');
    }
    if (kind !== 'friend' && assignment.partnerUid) {
      throw new HttpsError('invalid-argument', 'Only Friend loyalty may name a partner.');
    }

    // Read every displaced counterpart before making any write. A target and
    // a newly chosen Friend partner can each replace an older pair. Delete a
    // former counterpart only if both secrets form a complete reciprocal
    // private pair; corrupt or unrelated secrets remain untouched.
    const reassignedUids = new Set([
      assignment.targetUid,
      ...(assignment.partnerUid ? [assignment.partnerUid] : []),
    ]);
    const previousFriendLinks = [
      { uid: assignment.targetUid, secret: targetSecret },
      ...(assignment.partnerUid ? [{ uid: assignment.partnerUid, secret: partnerSecret }] : []),
    ].flatMap(({ uid: holderUid, secret }) => {
      const oldPartnerUid = privateFriendPartnerUid(secret, holderUid);
      return oldPartnerUid && !reassignedUids.has(oldPartnerUid)
        ? [{ holderUid, oldPartnerUid }]
        : [];
    });
    const displacedPartnerRefs = new Map<string, DocumentReference>();
    for (const { oldPartnerUid } of previousFriendLinks) {
      displacedPartnerRefs.set(
        oldPartnerUid,
        db.doc(`sessions/${assignment.sessionId}/secrets/loyalty-${oldPartnerUid}`),
      );
    }
    const displacedPartnerSecrets = await Promise.all([...displacedPartnerRefs.entries()].map(async ([
      oldPartnerUid,
      ref,
    ]) => ({ oldPartnerUid, ref, secret: await tx.get(ref) })));
    const reciprocalDisplacedPartnerRefs = displacedPartnerSecrets.flatMap(({ oldPartnerUid, ref, secret }) => {
      const formerHolderUids = previousFriendLinks
        .filter((link) => link.oldPartnerUid === oldPartnerUid)
        .map((link) => link.holderUid);
      const reciprocalHolderUid = privateFriendPartnerUid(secret, oldPartnerUid);
      return reciprocalHolderUid && formerHolderUids.includes(reciprocalHolderUid) ? [ref] : [];
    });

    if (kind === 'intelligence-agent') {
      const replacedUids = new Set([
        assignment.targetUid,
        ...(assignment.partnerUid ? [assignment.partnerUid] : []),
      ]);
      const validSecrets = secrets.docs
        .map((secret) => canonicalLoyaltySecret(secret, playerDocuments, activeRoleIds))
        .filter((record): record is CanonicalLoyaltySecret => record !== null)
        .filter((record) => !replacedUids.has(record.uid));
      const wolfCount = validSecrets.filter((record) =>
        record.kind === 'wolf-agent' || record.kind === 'wolf-cult').length;
      const intelligenceAgentCount = validSecrets
        .filter((record) => record.kind === 'intelligence-agent').length;
      if (wolfCount < 1) {
        throw commandError('failed-precondition', 'Intelligence Agent setup requires at least one Wolf agent.', 'conflict');
      }
      if (intelligenceAgentCount >= 1) {
        throw commandError('failed-precondition', 'Only one Intelligence Agent may be assigned.', 'conflict');
      }
    }
    const validSuspicion = kind === 'android'
      ? null
      : (defaultSuspicionForLoyalty(kind).includes(decision.suspicion as number)
        ? decision.suspicion : null);
    const result = {
      sessionId: assignment.sessionId,
      setupRevision: setupRevision(authority.session) + 1,
      assignedUids: assignment.partnerUid
        ? [assignment.targetUid, assignment.partnerUid]
        : [assignment.targetUid],
    } satisfies CastingMutationResult & { assignedUids: readonly string[] };
    tx.set(targetSecretRef, {
      visibleToUids: [assignment.targetUid],
      payload: {
        type: 'loyalty',
        kind,
        suspicion: validSuspicion,
        ...(assignment.partnerUid ? { partnerUid: assignment.partnerUid } : {}),
        ...(kind === 'friend' && partner && typeof partner.get('assignedRoleId') === 'string'
          ? { partnerRoleId: partner.get('assignedRoleId') }
          : {}),
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    if (assignment.partnerUid && partnerSecretRef) {
      tx.set(partnerSecretRef, {
        visibleToUids: [assignment.partnerUid],
        payload: {
          type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: assignment.targetUid,
          ...(typeof target.get('assignedRoleId') === 'string'
            ? { partnerRoleId: target.get('assignedRoleId') }
            : {}),
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    for (const displacedPartnerRef of reciprocalDisplacedPartnerRefs) {
      tx.delete(displacedPartnerRef);
    }
    const censusPatches = new Map<string, LoyaltyCensusEntry | null>([
      [assignment.targetUid, { uid: assignment.targetUid, kind, suspicion: validSuspicion }],
      ...(assignment.partnerUid
        ? [[assignment.partnerUid, { uid: assignment.partnerUid, kind: 'friend', suspicion: 0 }] as const]
        : []),
    ]);
    for (const displacedPartnerRef of reciprocalDisplacedPartnerRefs) {
      const displacedUid = displacedPartnerRef.id.slice('loyalty-'.length);
      if (displacedUid) censusPatches.set(displacedUid, null);
    }
    setLoyaltyCensusFromSecrets(
      tx,
      assignment.sessionId,
      result.setupRevision,
      secrets.docs ?? [],
      playerDocuments,
      activeRoleIds,
      censusPatches,
      census,
    );
    tx.update(sessionRef, {
      phase: 'casting',
      setupRevision: result.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'loyalty-assignment',
      payload: {
        actorUid: uid,
        requestId: assignment.requestId,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, {
      action: fingerprint.action,
      sessionId: fingerprint.sessionId,
      actorUid: fingerprint.actorUid,
      instanceId: fingerprint.instanceId,
      targetUid: fingerprint.targetUid,
      kind: fingerprint.kind,
      suspicion: fingerprint.suspicion,
      partnerUid: fingerprint.partnerUid,
      fingerprint,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(sharedReceiptRef, { fingerprint: sharedFingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** Let only the Android holder disclose its own proof to the shared table. */
export const revealAndroidProof = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const disclosure = requireAndroidDisclosureRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${disclosure.sessionId}`);
  const playerRef = db.doc(`sessions/${disclosure.sessionId}/players/${uid}`);
  const secretRef = db.doc(`sessions/${disclosure.sessionId}/secrets/loyalty-${uid}`);
  const eventRef = db.doc(`sessions/${disclosure.sessionId}/events/${disclosure.requestId}`);
  const receiptRef = commandReceiptRef(disclosure.sessionId, disclosure.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'reveal-android-proof',
    sessionId: disclosure.sessionId,
    requestId: disclosure.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: null,
    payload: {},
  };
  return db.runTransaction(async (tx) => {
    const [session, player, secret, receipt, legacyEvent] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(secretRef), tx.get(receiptRef), tx.get(eventRef),
    ]);
    if (!session.exists || !isActivePlayer(player) || player.get('role') !== 'player') {
      throw new HttpsError('permission-denied', 'Only the active Android holder may disclose Android proof.');
    }
    requireActiveGameplayPhase(session);
    if (!secret.exists) throw new HttpsError('permission-denied', 'No private Android proof is assigned to this identity.');
    const visibleToUids = secret.get('visibleToUids');
    if (!Array.isArray(visibleToUids) || visibleToUids.length !== 1 || visibleToUids[0] !== uid) {
      throw new HttpsError('permission-denied', 'No private Android proof is assigned to this identity.');
    }
    const payload = secret.get('payload');
    if (!isCanonicalAndroidPayload(payload)) {
      throw new HttpsError('permission-denied', 'Only the Android holder may disclose Android proof.');
    }
    await rejectForeignLegacyM1Command(
      tx, disclosure.sessionId, disclosure.requestId, 'Android disclosure', [eventRef.path],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is { disclosed: true } =>
        typeof value === 'object' && value !== null &&
        (value as { disclosed?: unknown }).disclosed === true,
      'Android disclosure',
    );
    if (replay) return { disclosed: true as const };
    if (legacyEvent.exists) rejectLegacyEventReplay('Android disclosure');
    if ((payload as Record<string, unknown>).proofRevealed === true) {
      throw commandError(
        'failed-precondition',
        'Android proof has already been disclosed. Refresh the live session before trying again.',
        'conflict',
      );
    }
    tx.update(secretRef, { payload: { ...payload as Record<string, unknown>, proofRevealed: true } });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'android-proof-disclosed',
      payload: {
        actorUid: uid,
        requestId: disclosure.requestId,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    const result = { disclosed: true as const };
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** Redeem a legacy four-digit or current six-digit code and register presence. */
export const joinSession = onCall<{ joinCode?: string; displayName?: string }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const joinCode = request.data?.joinCode ?? '';
    if (!isJoinCode(joinCode)) {
      throw new HttpsError('invalid-argument', 'Enter a complete session code.');
    }
    const displayName = cleanName(request.data?.displayName, 'Player', 40);

    await consumeJoinCodeAttempt(uid);
    const codeSnap = await db.doc(`joinCodes/${joinCode}`).get();
    if (!codeSnap.exists) {
      throw new HttpsError('not-found', 'No session with that code.');
    }
    const sessionId = codeSnap.get('sessionId') as string;

    const sessionRef = db.doc(`sessions/${sessionId}`);
    const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
    const playersRef = db.collection(`sessions/${sessionId}/players`);
    const membershipRef = db.doc(`activeMemberships/${uid}`);
    const joinResult = await db.runTransaction(async (tx) => {
      const [sessionDoc, player, membership, storedGroup, storedNavigation, players] = await Promise.all([
        tx.get(sessionRef),
        tx.get(playerRef),
        tx.get(membershipRef),
        tx.get(fleetGroupRef(sessionId)),
        tx.get(navigationStateRef(sessionId)),
        tx.get(playersRef),
      ]);
      const playerDocs = Array.isArray(players?.docs) ? players.docs : [];
      if (!sessionDoc.exists) throw new HttpsError('not-found', 'No session with that code.');
      if (sessionDoc.get('phase') === 'closed') {
        throw commandError('failed-precondition', 'That session has closed.', 'terminal-session');
      }
      if (sessionDoc.get('deletingAt')) {
        throw new HttpsError('not-found', 'That session is being retired.');
      }
      if (isKickedPlayer(player)) {
        throw commandError(
          'failed-precondition',
          'This browser was kicked from that session and cannot rejoin.',
          'unauthorized',
        );
      }
      const attackState = sessionDoc.get('phase') === 'active'
        ? await tx.get(db.doc(`sessions/${sessionId}/wolfAttackState/current`))
        : undefined;
      const membershipActive = await membershipIsActive(tx, membership, uid);
      if (activeSessionConflicts(
        membership.exists ? membership.get('sessionId') as string : undefined,
        sessionId,
        membershipActive,
      )) {
        throw commandError(
          'failed-precondition',
          'Disconnect from the current session before joining another.',
          'conflict',
        );
      }
      const connectionGeneration = player.exists ? nextConnectionGeneration(player) : 1;
      const clearStaleMembership = membership.exists && !membershipActive;
      const returningSeat = player.exists
        ? await reconcileReturningSeat(tx, sessionId, uid, player, sessionActiveRoleIds(sessionDoc))
        : null;
      const setup = await hydrateCanonicalSessionSetup(tx, sessionId, sessionDoc);
      if (clearStaleMembership) tx.delete(membershipRef);
      const memberUids = [...new Set([...activeFleetGroupMemberUids(playerDocs), uid])];
      const group = ensureInitialFleetGroup(
        tx, sessionId, setup.activeVesselIds, memberUids, storedGroup, playerDocs,
      );
      const navigation = navigationStateForSession(storedNavigation, sessionDoc, setup.activeVesselIds);
      const navigationRevision = typeof storedNavigation.get('revision') === 'number'
        ? storedNavigation.get('revision') as number : 0;
      if (!storedNavigation.exists) {
        tx.set(navigationStateRef(sessionId), {
          ...navigationProjectionFields(navigation),
          revision: navigationRevision,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(navigationStateRef(sessionId), {
        pursuitGroups: navigation.pursuitGroups,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(gmDiscoveryProjectionRef(sessionId), {
        ...navigationProjectionFields(navigation), knownSystems: allDiscoverySystems(), revision: navigationRevision,
        updatedAt: FieldValue.serverTimestamp(),
      });
      publishDiscoveryProjections(
        tx, sessionId, playerDocs, navigation, navigationRevision,
        sessionDoc.get('chartId') === 'B' || sessionDoc.get('chartId') === 'C' ? sessionDoc.get('chartId') : 'A',
        [group],
      );
      tx.update(sessionRef, {
        shipGalacticCoordinates: removeLegacyNavigationField(),
        shipNavigationLogs: removeLegacyNavigationField(),
        pursuitGroups: removeLegacyNavigationField(),
      });
      reconcilePresenceTimer(tx, sessionRef, sessionDoc, attackState, true);
      if (player.exists) {
        const storedGroupId = player.get('fleetGroupId');
        if (storedGroupId !== undefined && storedGroupId !== group.id) {
          throw commandError(
            'failed-precondition',
            'This player belongs to a different fleet group; refresh before reconnecting.',
            'conflict',
          );
        }
        if (returningSeat?.claimSeat && returningSeat.seatId) {
          tx.update(db.doc(`sessions/${sessionId}/seats/${returningSeat.seatId}`), {
            status: 'claimed',
            holderUid: uid,
            claimedAt: FieldValue.serverTimestamp(),
          });
        }
        ensureFleetTickerBaseline(tx, sessionRef, sessionDoc, new Date().toISOString());
        const currentPressAuthority = player.get('activeConsoleRoleId') === 'press-officer';
        const storedPressHolderUid = sessionDoc.get('pressHolderUid');
        const releasePress = hasPressState(player) && (
          !currentPressAuthority || sessionDoc.get('pressEnabled') === false ||
          player.get('role') !== 'player' || hasCoreAssignment(player) ||
          (typeof storedPressHolderUid === 'string' && storedPressHolderUid !== uid)
        );
        tx.update(playerRef, {
          fleetGroupId: group.id,
          connected: true,
          connectionGeneration,
          lastSeenAt: FieldValue.serverTimestamp(),
          ...(releasePress ? releasedPressFields(player) : {}),
          ...(!releasePress && currentPressAuthority && player.get('assignedRoleId') === 'press-officer'
            ? { assignedRoleId: null } : {}),
          ...(returningSeat?.clearPointer ? { seatId: null } : {}),
        });
        const projectionPlayer = {
          get: (field: string) => field === 'fleetGroupId' ? group.id : player.get(field),
        };
        tx.set(playerDiscoveryProjectionRef(sessionId, uid), {
          ...playerDiscoveryProjection(projectionPlayer, navigation, navigationRevision),
          groupId: group.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(sessionRef, {
          deleteAfter: null,
          updatedAt: FieldValue.serverTimestamp(),
          ...(currentPressAuthority
            ? {
              pressHolderUid: releasePress && typeof storedPressHolderUid === 'string'
                ? storedPressHolderUid
                : releasePress ? null : uid,
            }
            : {}),
        });
        tx.set(membershipRef, { sessionId, connectedAt: FieldValue.serverTimestamp() });
        return {
          seatId: returningSeat?.seatId ?? null,
          connectionGeneration,
        };
      } else {
        ensureFleetTickerBaseline(tx, sessionRef, sessionDoc, new Date().toISOString());
        tx.set(playerRef, {
          uid,
          sessionId,
          displayName,
          role: 'player',
          seatId: null,
          activeConsoleRoleId: null,
          fleetGroupId: group.id,
          joinedAt: FieldValue.serverTimestamp(),
          connected: true,
          connectionGeneration: 1,
          lastSeenAt: FieldValue.serverTimestamp(),
        });
        tx.set(playerDiscoveryProjectionRef(sessionId, uid), {
          groupId: group.id,
          knownCoordinates: ['0000'], knownSystems: discoverySystemsForCoordinates(['0000']),
          pursuitDistance: 0, navigationLogs: [], revision: navigationRevision,
          ...(navigation.pursuitGroups[group.id] !== undefined
            ? { pursuitValue: navigation.pursuitGroups[group.id] }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(sessionRef, { deleteAfter: null, updatedAt: FieldValue.serverTimestamp() });
      tx.set(membershipRef, { sessionId, connectedAt: FieldValue.serverTimestamp() });
      return { seatId: null, connectionGeneration: 1 };
    });
    const [sessionSnap, playerSnap] = await Promise.all([sessionRef.get(), playerRef.get()]);

    const announcement = turnStartAnnouncement(sessionSnap.get('turnStartAnnouncement'));
    const phaseClock = turnPhaseState(sessionSnap.get('turnPhase'));
    const turnState = sessionTurnState(sessionSnap, phaseClock);
    const activeRoleIds = sessionActiveRoleIds(sessionSnap);
    const setup = canonicalSetupForSession(sessionSnap, activeRoleIds);
    const activeVesselIds = setup.activeVesselIds;
    const shuttleDockings = publicShuttleDockings(
      sessionSnap.get('shuttleDockings'), activeVesselIds, activeRoleIds,
    );
    const shuttleVisitLog = publicShuttleVisitLog(
      sessionSnap.get('shuttleVisitLog'), shuttleDockings, activeVesselIds,
    );
    const fighterWingCounts = publicFighterWingCounts(sessionSnap.get('fighterWingCounts'));
    const voyageAdmission = publicVoyage33Admission(sessionSnap.get('voyage33Admission'), sessionId);
    const voyageMaintenance = publicVoyage33Maintenance(
      sessionSnap.get('voyage33Maintenance'), voyageAdmission, activeVesselIds,
    );
    return {
      session: {
        id: sessionId,
        name: sessionSnap.get('name') as string,
        joinCode,
        phase: sessionSnap.get('phase') as string,
        currentTurn: sessionTurn(sessionSnap.get('currentTurn')),
        ...(typeof sessionSnap.get('playerCount') === 'number' ? { playerCount: sessionSnap.get('playerCount') } : {}),
        ...(sessionSnap.get('chartId') === 'A' || sessionSnap.get('chartId') === 'B' || sessionSnap.get('chartId') === 'C'
          ? { chartId: sessionSnap.get('chartId') } : {}),
        ...(sessionSnap.get('expansion') === 'base' || sessionSnap.get('expansion') === 'capybara' || sessionSnap.get('expansion') === 'none'
          ? { expansion: sessionSnap.get('expansion') } : {}),
        ...(sessionSnap.get('turnLimit') === 6 || sessionSnap.get('turnLimit') === 7 || sessionSnap.get('turnLimit') === 8
          ? { turnLimit: sessionSnap.get('turnLimit') } : {}),
        ...(typeof sessionSnap.get('chartSelectionLocked') === 'boolean'
          ? { chartSelectionLocked: sessionSnap.get('chartSelectionLocked') } : {}),
        ...(typeof sessionSnap.get('configurationLocked') === 'boolean'
          ? { configurationLocked: sessionSnap.get('configurationLocked') } : {}),
        ...(typeof sessionSnap.get('setupRevision') === 'number'
          ? { setupRevision: sessionSnap.get('setupRevision') } : {}),
        setup,
        activeVesselIds: [...setup.activeVesselIds],
        admittedVesselIds: voyageAdmission ? [VOYAGE_33_ID] : [],
        ...(voyageAdmission ? { voyage33Admission: voyageAdmission } : {}),
        ...(voyageMaintenance ? { voyage33Maintenance: voyageMaintenance } : {}),
        ...(announcement ? { turnStartAnnouncement: announcement } : {}),
        ...(phaseClock ? { turnPhase: phaseClock } : {}),
        ...(turnState ? { turnState } : {}),
        capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
        dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
        pressEnabled: sessionSnap.get('pressEnabled') !== false,
        pressClaimed: typeof sessionSnap.get('pressHolderUid') === 'string',
        pressAvailabilityRevision: pressAvailabilityRevision(sessionSnap.get('pressAvailabilityRevision')),
        shipConsoleLocks: activeVesselRecord(
          shipConsoleLocks(sessionSnap.get('shipConsoleLocks')), activeVesselIds,
        ),
        shipJumpStates: activeVesselRecord(
          shipJumpStates(sessionSnap.get('shipJumpStates')), activeVesselIds,
        ),
        shipJumpTransitions: activeVesselRecord(
          shipJumpTransitions(sessionSnap.get('shipJumpTransitions')), activeVesselIds,
        ),
        ...(fighterWingCounts === undefined ? {} : { fighterWingCounts }),
        shipDamage: activeVesselRecord(shipDamage(sessionSnap.get('shipDamage')), activeVesselIds),
        shipResources: activeVesselRecord(shipResources(sessionSnap.get('shipResources')), activeVesselIds),
        shipUnrest: activeVesselRecord(shipUnrest(sessionSnap.get('shipUnrest')), activeVesselIds),
        unrestAlerts: publicAlertMap(sessionSnap.get('unrestAlerts'), activeVesselIds, false),
        maintenanceCycles: publicMaintenanceCycles(sessionSnap.get('maintenanceCycles'), activeVesselIds),
        smallShipStates: publicSmallShipStates(sessionSnap.get('smallShipStates'), activeVesselIds),
        shuttleCargo: publicShuttleCargo(sessionSnap.get('shuttleCargo'), activeRoleIds),
        shuttleFuelled: publicShuttleFuelled(sessionSnap.get('shuttleFuelled')),
        shipUpgrades: publicShipUpgrades(sessionSnap.get('shipUpgrades'), activeVesselIds),
        shipSurvivors: activeShipSurvivors(sessionSnap.get('shipSurvivors'), activeVesselIds),
        populationAlerts: publicAlertMap(sessionSnap.get('populationAlerts'), activeVesselIds, true),
        gmControlsLocked: sessionSnap.get('gmControlsLocked') === true,
        debriefMode: debriefModeState(sessionSnap.get('debriefMode')),
        fleetTicker: fleetTickerForSession(sessionId, sessionSnap),
        activeRoleIds,
        shuttleDockings,
        shuttleVisitLog,
        pressDispatch: pressDispatchState(sessionSnap.get('pressDispatch')),
        confettiUsedShipIds: publicConfettiUsedShipIds(sessionSnap.get('confettiUsedShipIds')),
        ...optionalIsoOf(sessionSnap.get('dradisContactTriggeredAt')),
        ownerUid: sessionSnap.get('ownerUid') as string,
        createdAt: isoOf(sessionSnap.get('createdAt')),
        updatedAt: isoOf(sessionSnap.get('updatedAt')),
      },
      player: {
        uid,
        sessionId,
        displayName: cleanName(playerSnap.get('displayName'), 'Player', 40),
        role: playerSnap.get('role') as string,
        seatId: joinResult.seatId,
        ...(typeof playerSnap.get('fleetGroupId') === 'string'
          ? { fleetGroupId: playerSnap.get('fleetGroupId') } : {}),
        ...(typeof playerSnap.get('assignedRoleId') === 'string' || playerSnap.get('assignedRoleId') === null
          ? { assignedRoleId: playerSnap.get('assignedRoleId') } : {}),
        ...(typeof playerSnap.get('replacementRoleId') === 'string' || playerSnap.get('replacementRoleId') === null
          ? { replacementRoleId: playerSnap.get('replacementRoleId') } : {}),
        ...(typeof playerSnap.get('shipPreferenceId') === 'string' || playerSnap.get('shipPreferenceId') === null
          ? { shipPreferenceId: playerSnap.get('shipPreferenceId') } : {}),
        ...(playerEscapeState(playerSnap) ? { escapeState: playerEscapeState(playerSnap) } : {}),
        activeConsoleRoleId:
          (playerSnap.get('activeConsoleRoleId') as string | null) ?? null,
        connectionGeneration: joinResult.connectionGeneration,
        joinedAt: isoOf(playerSnap.get('joinedAt')),
      },
    };
  },
);

/** Refresh a locally remembered session after a browser reload or reopen. */
export const resumeSession = onCall<{ sessionId?: string }>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId } = requireSessionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const playersRef = db.collection(`sessions/${sessionId}/players`);
  let [sessionSnap, playerSnap] = await Promise.all([sessionRef.get(), playerRef.get()]);

  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'That session no longer exists.');
  }
  if (!playerSnap.exists) {
    throw new HttpsError('permission-denied', 'You are no longer in that session.');
  }
  if (isKickedPlayer(playerSnap)) {
    throw commandError(
      'failed-precondition',
      'This browser was kicked from that session and cannot rejoin.',
      'unauthorized',
    );
  }
  if (sessionSnap.get('phase') === 'closed') {
    throw commandError('failed-precondition', 'That session has closed.', 'terminal-session');
  }

  const membershipRef = db.doc(`activeMemberships/${uid}`);
  const resumeResult = await db.runTransaction(async (tx) => {
    const [currentSession, currentPlayer, membership, storedGroup, storedNavigation, players] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(membershipRef),
      tx.get(fleetGroupRef(sessionId)),
      tx.get(navigationStateRef(sessionId)),
      tx.get(playersRef),
    ]);
    const playerDocs = Array.isArray(players?.docs) ? players.docs : [];
    if (!currentSession.exists || currentSession.get('deletingAt')) {
      throw new HttpsError('not-found', 'That session no longer exists.');
    }
    if (currentSession.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'That session has closed.', 'terminal-session');
    }
    if (!currentPlayer.exists) {
      throw new HttpsError('permission-denied', 'You are no longer in that session.');
    }
    if (isKickedPlayer(currentPlayer)) {
      throw commandError(
        'failed-precondition',
        'This browser was kicked from that session and cannot rejoin.',
        'unauthorized',
      );
    }
    const attackState = currentSession.get('phase') === 'active'
      ? await tx.get(db.doc(`sessions/${sessionId}/wolfAttackState/current`))
      : undefined;
    const membershipActive = await membershipIsActive(tx, membership, uid);
    if (activeSessionConflicts(
      membership.exists ? membership.get('sessionId') as string : undefined,
      sessionId,
      membershipActive,
    )) {
      throw commandError(
        'failed-precondition',
        'Disconnect from the current session before reconnecting to another.',
        'conflict',
      );
    }
    const connectionGeneration = nextConnectionGeneration(currentPlayer);
    const clearStaleMembership = membership.exists && !membershipActive;
    // Read the returning seat before setup hydration can write canonical seat
    // fields. The claim itself is applied immediately after hydration below so
    // this transaction never performs a read after its first write.
    const returningSeat = await reconcileReturningSeat(
      tx, sessionId, uid, currentPlayer, sessionActiveRoleIds(currentSession),
    );
    const setup = await hydrateCanonicalSessionSetup(tx, sessionId, currentSession);
    if (clearStaleMembership) tx.delete(membershipRef);
    const group = ensureInitialFleetGroup(
      tx,
      sessionId,
      setup.activeVesselIds,
      [...new Set([...activeFleetGroupMemberUids(playerDocs), uid])],
      storedGroup,
      playerDocs,
    );
    const navigation = navigationStateForSession(storedNavigation, currentSession, setup.activeVesselIds);
    const navigationRevision = typeof storedNavigation.get('revision') === 'number'
      ? storedNavigation.get('revision') as number : 0;
    if (!storedNavigation.exists) {
      tx.set(navigationStateRef(sessionId), {
        ...navigationProjectionFields(navigation), revision: navigationRevision,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(navigationStateRef(sessionId), {
      pursuitGroups: navigation.pursuitGroups,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(gmDiscoveryProjectionRef(sessionId), {
      ...navigationProjectionFields(navigation), knownSystems: allDiscoverySystems(), revision: navigationRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    publishDiscoveryProjections(
      tx, sessionId, playerDocs, navigation, navigationRevision,
      currentSession.get('chartId') === 'B' || currentSession.get('chartId') === 'C' ? currentSession.get('chartId') : 'A',
      [group],
    );
    tx.update(sessionRef, {
      shipGalacticCoordinates: removeLegacyNavigationField(),
      shipNavigationLogs: removeLegacyNavigationField(),
      pursuitGroups: removeLegacyNavigationField(),
    });
    const storedGroupId = currentPlayer.get('fleetGroupId');
    if (storedGroupId !== undefined && storedGroupId !== group.id) {
      throw commandError(
        'failed-precondition',
        'This player belongs to a different fleet group; refresh before reconnecting.',
        'conflict',
      );
    }
    if (returningSeat.claimSeat && returningSeat.seatId) {
      tx.update(db.doc(`sessions/${sessionId}/seats/${returningSeat.seatId}`), {
        status: 'claimed',
        holderUid: uid,
        claimedAt: FieldValue.serverTimestamp(),
      });
    }
    const currentPressAuthority = currentPlayer.get('activeConsoleRoleId') === 'press-officer';
    const storedPressHolderUid = currentSession.get('pressHolderUid');
    const releasePress = hasPressState(currentPlayer) && (
      !currentPressAuthority || currentSession.get('pressEnabled') === false ||
      currentPlayer.get('role') !== 'player' || hasCoreAssignment(currentPlayer) ||
      (typeof storedPressHolderUid === 'string' && storedPressHolderUid !== uid)
    );
    ensureFleetTickerBaseline(tx, sessionRef, currentSession, new Date().toISOString());
    reconcilePresenceTimer(tx, sessionRef, currentSession, attackState, true);
    tx.update(playerRef, {
      fleetGroupId: group.id,
      connected: true,
      connectionGeneration,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(releasePress ? releasedPressFields(currentPlayer) : {}),
      ...(!releasePress && currentPressAuthority && currentPlayer.get('assignedRoleId') === 'press-officer'
        ? { assignedRoleId: null } : {}),
      ...(returningSeat.clearPointer ? { seatId: null } : {}),
    });
    const projectionPlayer = {
      get: (field: string) => field === 'fleetGroupId' ? group.id : currentPlayer.get(field),
    };
    tx.set(playerDiscoveryProjectionRef(sessionId, uid), {
      ...playerDiscoveryProjection(projectionPlayer, navigation, navigationRevision),
      groupId: group.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(sessionRef, {
      deleteAfter: null,
      updatedAt: FieldValue.serverTimestamp(),
      ...(currentPressAuthority ? {
        pressHolderUid: releasePress && typeof storedPressHolderUid === 'string'
          ? storedPressHolderUid
          : releasePress ? null : uid,
      } : {}),
    });
    tx.set(membershipRef, { sessionId, connectedAt: FieldValue.serverTimestamp() });
    return {
      seatId: returningSeat.seatId,
      connectionGeneration,
    };
  });

  [sessionSnap, playerSnap] = await Promise.all([sessionRef.get(), playerRef.get()]);

  const announcement = turnStartAnnouncement(sessionSnap.get('turnStartAnnouncement'));
  const phaseClock = turnPhaseState(sessionSnap.get('turnPhase'));
  const turnState = sessionTurnState(sessionSnap, phaseClock);
  const activeRoleIds = sessionActiveRoleIds(sessionSnap);
  const setup = canonicalSetupForSession(sessionSnap, activeRoleIds);
  const activeVesselIds = setup.activeVesselIds;
  const shuttleDockings = publicShuttleDockings(
    sessionSnap.get('shuttleDockings'), activeVesselIds, activeRoleIds,
  );
  const shuttleVisitLog = publicShuttleVisitLog(
    sessionSnap.get('shuttleVisitLog'), shuttleDockings, activeVesselIds,
  );
  const fighterWingCounts = publicFighterWingCounts(sessionSnap.get('fighterWingCounts'));
  const voyageAdmission = publicVoyage33Admission(sessionSnap.get('voyage33Admission'), sessionId);
  const voyageMaintenance = publicVoyage33Maintenance(
    sessionSnap.get('voyage33Maintenance'), voyageAdmission, activeVesselIds,
  );
  return {
    session: {
      id: sessionId,
      name: sessionSnap.get('name') as string,
      joinCode: sessionSnap.get('joinCode') as string,
      phase: sessionSnap.get('phase') as string,
      currentTurn: sessionTurn(sessionSnap.get('currentTurn')),
      ...(typeof sessionSnap.get('playerCount') === 'number' ? { playerCount: sessionSnap.get('playerCount') } : {}),
      ...(sessionSnap.get('chartId') === 'A' || sessionSnap.get('chartId') === 'B' || sessionSnap.get('chartId') === 'C'
        ? { chartId: sessionSnap.get('chartId') } : {}),
      ...(sessionSnap.get('expansion') === 'base' || sessionSnap.get('expansion') === 'capybara' || sessionSnap.get('expansion') === 'none'
        ? { expansion: sessionSnap.get('expansion') } : {}),
      ...(sessionSnap.get('turnLimit') === 6 || sessionSnap.get('turnLimit') === 7 || sessionSnap.get('turnLimit') === 8
        ? { turnLimit: sessionSnap.get('turnLimit') } : {}),
      ...(typeof sessionSnap.get('chartSelectionLocked') === 'boolean'
        ? { chartSelectionLocked: sessionSnap.get('chartSelectionLocked') } : {}),
      ...(typeof sessionSnap.get('configurationLocked') === 'boolean'
        ? { configurationLocked: sessionSnap.get('configurationLocked') } : {}),
      ...(typeof sessionSnap.get('setupRevision') === 'number'
        ? { setupRevision: sessionSnap.get('setupRevision') } : {}),
      setup,
      activeVesselIds: [...setup.activeVesselIds],
      admittedVesselIds: voyageAdmission ? [VOYAGE_33_ID] : [],
      ...(voyageAdmission ? { voyage33Admission: voyageAdmission } : {}),
      ...(voyageMaintenance ? { voyage33Maintenance: voyageMaintenance } : {}),
      ...(announcement ? { turnStartAnnouncement: announcement } : {}),
      ...(phaseClock ? { turnPhase: phaseClock } : {}),
      ...(turnState ? { turnState } : {}),
      capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
      dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
      pressEnabled: sessionSnap.get('pressEnabled') !== false,
      pressClaimed: typeof sessionSnap.get('pressHolderUid') === 'string',
      pressAvailabilityRevision: pressAvailabilityRevision(sessionSnap.get('pressAvailabilityRevision')),
      shipConsoleLocks: activeVesselRecord(
        shipConsoleLocks(sessionSnap.get('shipConsoleLocks')), activeVesselIds,
      ),
      shipJumpStates: activeVesselRecord(
        shipJumpStates(sessionSnap.get('shipJumpStates')), activeVesselIds,
      ),
      shipJumpTransitions: activeVesselRecord(
        shipJumpTransitions(sessionSnap.get('shipJumpTransitions')), activeVesselIds,
      ),
      ...(fighterWingCounts === undefined ? {} : { fighterWingCounts }),
      shipDamage: activeVesselRecord(shipDamage(sessionSnap.get('shipDamage')), activeVesselIds),
      shipResources: activeVesselRecord(shipResources(sessionSnap.get('shipResources')), activeVesselIds),
      shipUnrest: activeVesselRecord(shipUnrest(sessionSnap.get('shipUnrest')), activeVesselIds),
      unrestAlerts: publicAlertMap(sessionSnap.get('unrestAlerts'), activeVesselIds, false),
      maintenanceCycles: publicMaintenanceCycles(sessionSnap.get('maintenanceCycles'), activeVesselIds),
      smallShipStates: publicSmallShipStates(sessionSnap.get('smallShipStates'), activeVesselIds),
      shuttleCargo: publicShuttleCargo(sessionSnap.get('shuttleCargo'), activeRoleIds),
      shuttleFuelled: publicShuttleFuelled(sessionSnap.get('shuttleFuelled')),
      shipUpgrades: publicShipUpgrades(sessionSnap.get('shipUpgrades'), activeVesselIds),
      shipSurvivors: activeShipSurvivors(sessionSnap.get('shipSurvivors'), activeVesselIds),
      populationAlerts: publicAlertMap(sessionSnap.get('populationAlerts'), activeVesselIds, true),
      gmControlsLocked: sessionSnap.get('gmControlsLocked') === true,
      debriefMode: debriefModeState(sessionSnap.get('debriefMode')),
      fleetTicker: fleetTickerForSession(sessionId, sessionSnap),
      activeRoleIds,
      shuttleDockings,
      shuttleVisitLog,
      pressDispatch: pressDispatchState(sessionSnap.get('pressDispatch')),
      confettiUsedShipIds: publicConfettiUsedShipIds(sessionSnap.get('confettiUsedShipIds')),
      ...optionalIsoOf(sessionSnap.get('dradisContactTriggeredAt')),
      ownerUid: sessionSnap.get('ownerUid') as string,
      createdAt: isoOf(sessionSnap.get('createdAt')),
      updatedAt: isoOf(sessionSnap.get('updatedAt')),
    },
    player: {
      uid,
      sessionId,
      displayName: cleanName(playerSnap.get('displayName'), 'Player', 40),
      role: playerSnap.get('role') as string,
      seatId: resumeResult.seatId,
      ...(typeof playerSnap.get('fleetGroupId') === 'string'
        ? { fleetGroupId: playerSnap.get('fleetGroupId') } : {}),
      ...(typeof playerSnap.get('assignedRoleId') === 'string' || playerSnap.get('assignedRoleId') === null
        ? { assignedRoleId: playerSnap.get('assignedRoleId') } : {}),
      ...(typeof playerSnap.get('replacementRoleId') === 'string' || playerSnap.get('replacementRoleId') === null
        ? { replacementRoleId: playerSnap.get('replacementRoleId') } : {}),
      ...(typeof playerSnap.get('shipPreferenceId') === 'string' || playerSnap.get('shipPreferenceId') === null
        ? { shipPreferenceId: playerSnap.get('shipPreferenceId') } : {}),
      ...(playerEscapeState(playerSnap) ? { escapeState: playerEscapeState(playerSnap) } : {}),
      activeConsoleRoleId:
        (playerSnap.get('activeConsoleRoleId') as string | null) ?? null,
      connectionGeneration: resumeResult.connectionGeneration,
      joinedAt: isoOf(playerSnap.get('joinedAt')),
    },
  };
});

function gmShipConsoleWriteGrantRef(sessionId: string, instanceId: string): DocumentReference {
  return db.doc(
    `sessions/${sessionId}/gmInstances/${instanceId}/private/shipConsoleWriteGrant`,
  );
}

function gmInstanceFrom(
  sessionId: string,
  id: string,
  data: FirebaseFirestore.DocumentData,
  projectLegacySingle = false,
  projectShipConsoleWriteGrant = true,
  grant?: DocumentSnapshot,
) {
  const responsibilities = Array.isArray(data.responsibilities)
    ? ['main', 'assistant'].filter((responsibility) => data.responsibilities.includes(responsibility))
    : data.responsibility === 'main' || data.responsibility === 'assistant'
      ? projectLegacySingle ? ['main', 'assistant'] : [data.responsibility]
      : [];
  return {
    id,
    sessionId,
    uid: data.uid as string,
    name: cleanName(data.name, 'GM instance', 40),
    deviceLabel: cleanName(data.deviceLabel, 'Unknown device', 160),
    ...(responsibilities.length > 0 ? { responsibilities } : {}),
    ...(data.responsibility === 'main' || data.responsibility === 'assistant'
      ? { responsibility: data.responsibility } : {}),
    ...(projectShipConsoleWriteGrant && grant?.exists && typeof grant.get('shipId') === 'string'
      ? {
        shipConsoleWriteGrant: {
          shipId: grant.get('shipId'),
          grantedAt: isoOf(grant.get('grantedAt')),
        },
      } : {}),
    claimedAt: isoOf(data.claimedAt),
  };
}

/** Canonical lease token used to keep a delayed browser cleanup tied to one claim. */
function gmInstanceClaimedAtToken(value: unknown): string | undefined {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'object' && value !== null && 'toMillis' in value &&
      typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const milliseconds = (value as { toMillis: () => unknown }).toMillis();
    return typeof milliseconds === 'number' && Number.isFinite(milliseconds)
      ? new Date(milliseconds).toISOString()
      : undefined;
  }
  return undefined;
}

/** Establish persistent GM access for this anonymous browser identity. */
export const loginGmAccess = onCall<{ password?: string }>(async (request) => {
  const uid = requireUid(request.auth);
  const { password } = requireGmAccessLoginRequest(request.data ?? {});
  if (!isGmAccessPassword(password)) {
    throw new HttpsError('permission-denied', 'GM access credentials rejected.');
  }
  await db.doc(`gmAccess/${uid}`).set({
    uid,
    authenticatedAt: FieldValue.serverTimestamp(),
  });
  return { authenticated: true };
});

/** Revoke persistent GM access and release this browser's active GM instance. */
export const logoutGmAccess = onCall<{
  sessionId?: string | null;
  instanceId?: string | null;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const logout = requireGmAccessLogoutRequest(request.data ?? {});
  const logoutSessionId = logout.sessionId;
  const logoutInstanceId = logout.instanceId;
  if (logoutSessionId && logoutInstanceId) {
    const instanceRef = db.doc(
      `sessions/${logoutSessionId}/gmInstances/${logoutInstanceId}`,
    );
    const playerRef = db.doc(`sessions/${logoutSessionId}/players/${uid}`);
    const instancesRef = db.collection(`sessions/${logoutSessionId}/gmInstances`);
    await db.runTransaction(async (tx) => {
      const [instance, player, activeInstances] = await Promise.all([
        tx.get(instanceRef),
        tx.get(playerRef),
        tx.get(instancesRef),
      ]);
      if (!instance.exists || instance.get('uid') !== uid) return;
      tx.delete(instanceRef);
      tx.delete(gmShipConsoleWriteGrantRef(logoutSessionId, logoutInstanceId));
      const anotherOwnedInstance = activeInstances.docs.some((candidate) =>
        candidate.id !== logoutInstanceId && candidate.get('uid') === uid);
      if (isActivePlayer(player) && !anotherOwnedInstance) {
        tx.update(playerRef, { role: 'player' });
      }
    });
  }
  await db.doc(`gmAccess/${uid}`).delete();
  return { authenticated: false };
});

/** Claim GM authority for one named browser/device instance. */
export const claimGmInstance = onCall<{
  sessionId?: string;
  instanceId?: string;
  name?: string;
  deviceLabel?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const claim = requireGmClaimRequest(request.data ?? {});
  const accessRef = db.doc(`gmAccess/${uid}`);
  const sessionRef = db.doc(`sessions/${claim.sessionId}`);
  const playerRef = db.doc(`sessions/${claim.sessionId}/players/${uid}`);
  const instancesRef = db.collection(`sessions/${claim.sessionId}/gmInstances`);
  const instanceRef = db.doc(
    `sessions/${claim.sessionId}/gmInstances/${claim.instanceId}`,
  );
  const playersRef = db.collection(`sessions/${claim.sessionId}/players`);
  const secretsRef = db.collection(`sessions/${claim.sessionId}/secrets`);
  const wolfSecretRef = db.doc(`sessions/${claim.sessionId}/secrets/wolf-assignment`);
  const censusRef = db.doc(`sessions/${claim.sessionId}/loyaltyCensus/current`);
  await db.runTransaction(async (tx) => {
    const [access, session, player, existing, activeInstances, players, secrets, wolfSecret, census] = await Promise.all([
      tx.get(accessRef),
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
      tx.get(instancesRef),
      tx.get(playersRef),
      tx.get(secretsRef),
      tx.get(wolfSecretRef),
      tx.get(censusRef),
    ]);
    if (!access.exists || !isGmAccessActive(access.get('authenticatedAt'))) {
      throw new HttpsError('permission-denied', 'Log in to GM access before claiming the GM console.');
    }
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    if (hasCoreSeat(player) || hasCoreAssignment(player)) {
      throw commandError('failed-precondition', 'Release your core station before joining as GM.', 'conflict');
    }
    const liveInstances = liveGmInstanceDocs(activeInstances.docs, players.docs);
    if (existing.exists && existing.get('uid') !== uid) {
      throw new HttpsError('already-exists', 'That GM instance identifier is already in use.');
    }
    const replacingStaleInstance = existing.exists && !isLiveGmInstance(existing, player, uid);
    if (replacingStaleInstance) {
      // A stale browser may reclaim the same human-readable instance name.
      // Its old scoped ship grant must not follow that name into the new lease.
      tx.delete(gmShipConsoleWriteGrantRef(claim.sessionId, claim.instanceId));
    }
    const replayedResponsibilities = existing.exists && !replacingStaleInstance
      ? normalizedResponsibilities(existing)
      : [];
    const replayedLegacyResponsibility = existing.exists && !replacingStaleInstance
      ? existing.get('responsibility')
      : undefined;
    const visibleToUids = wolfSecret.exists ? wolfSecret.get('visibleToUids') : undefined;
    if (
      wolfSecret.exists &&
      Array.isArray(visibleToUids) &&
      visibleToUids.every((candidate): candidate is string => typeof candidate === 'string') &&
      !visibleToUids.includes(uid)
    ) {
      tx.update(wolfSecretRef, { visibleToUids: [...visibleToUids, uid] });
    }
    const firstActiveGm = liveInstances.length === 0;
    tx.set(instanceRef, {
      uid,
      sessionId: claim.sessionId,
      name: claim.name,
      deviceLabel: claim.deviceLabel,
      connected: true,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(firstActiveGm
        ? { responsibilities: ['main', 'assistant'], responsibility: 'main' }
        : replayedResponsibilities.length > 0
          ? {
            responsibilities: replayedResponsibilities,
            ...(replayedLegacyResponsibility === 'main' || replayedLegacyResponsibility === 'assistant'
              ? { responsibility: replayedLegacyResponsibility }
              : {}),
          }
          : {}),
      claimedAt: replacingStaleInstance
        ? FieldValue.serverTimestamp()
        : existing.get('claimedAt') ?? FieldValue.serverTimestamp(),
    });
    tx.update(playerRef, {
      role: 'gm',
      ...(hasPressState(player) ? releasedPressFields(player) : {}),
    });
    if (hasPressState(player)) {
      if (!hasCoreAssignment(player)) {
        tx.delete(db.doc(`sessions/${claim.sessionId}/secrets/loyalty-${uid}`));
        setLoyaltyCensusFromSecrets(
          tx,
          claim.sessionId,
          setupRevision(session),
          secrets.docs ?? [],
          players.docs,
          configuredRoleIds(session),
          new Map([[uid, null]]),
          census,
        );
      }
      if (session.get('pressHolderUid') === uid || session.get('pressHolderUid') === undefined) {
        tx.update(sessionRef, { pressHolderUid: null });
      }
    }
  });

  const instance = await instanceRef.get();
  return { instance: gmInstanceFrom(claim.sessionId, instance.id, instance.data() ?? {}) };
});

/** Grant or revoke one browser-scoped ship-console write target. */
export const setGmShipConsoleWriteGrant = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  shipId?: unknown;
  enabled?: unknown;
  claimedAt?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const grant = requireGmShipConsoleWriteGrantRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${grant.sessionId}`);
  const playerRef = db.doc(`sessions/${grant.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${grant.sessionId}/gmInstances/${grant.instanceId}`);
  const grantRef = gmShipConsoleWriteGrantRef(grant.sessionId, grant.instanceId);

  await db.runTransaction(async (tx) => {
    const [session, player, instance, currentGrant] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef), tx.get(grantRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (gmInstanceClaimedAtToken(instance.get('claimedAt')) !== grant.claimedAt) {
      throw new HttpsError('permission-denied', 'This GM instance lease has changed.');
    }
    if (!grant.enabled) {
      if (currentGrant.exists && currentGrant.get('shipId') === grant.shipId) {
        tx.delete(grantRef);
      }
      return;
    }
    if (!isResourceShipId(grant.shipId) ||
        !activeVesselIdsForSession(session).includes(grant.shipId)) {
      throw commandError('failed-precondition', 'That ship is not active in this session.', 'conflict');
    }
    tx.set(grantRef, {
      type: 'gm-ship-console-write-grant',
      sessionId: grant.sessionId,
      instanceId: grant.instanceId,
      uid,
      shipId: grant.shipId,
      grantedAt: FieldValue.serverTimestamp(),
    });
  });

  const current = await grantRef.get();
  const enabled = grant.enabled && current.exists && current.get('shipId') === grant.shipId &&
    current.get('instanceId') === grant.instanceId && current.get('uid') === uid;
  return {
    enabled,
    ...(enabled ? { shipId: grant.shipId } : {}),
  };
});

/** Return every active GM browser instance to a session member. */
export const listGmInstances = onCall<{ sessionId?: string }>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId } = requireSessionRequest(request.data ?? {});
  const player = await db.doc(`sessions/${sessionId}/players/${uid}`).get();
  if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
  const instances = await db.collection(`sessions/${sessionId}/gmInstances`)
    .orderBy('claimedAt', 'asc')
    .get();
  const players = await db.collection(`sessions/${sessionId}/players`).get();
  const liveInstances = liveGmInstanceDocs(instances.docs, players.docs);
  const privateGrants = await Promise.all(liveInstances.map((instance) =>
    instance.get('uid') === uid
      ? gmShipConsoleWriteGrantRef(sessionId, instance.id).get()
      : Promise.resolve(undefined),
  ));
  return {
    // This is the public authority projection. Raw claims may remain briefly
    // in Firestore while a vanished browser's lease expires, but they must not
    // count toward locked-table recovery or appear as handoff targets.
    instances: liveInstances.map((instance, index) =>
      gmInstanceFrom(
        sessionId,
        instance.id,
        instance.data() ?? {},
        liveInstances.length === 1,
        instance.get('uid') === uid,
        privateGrants[index],
      )),
  };
});

async function removeGmInstance(
  uid: string,
  data: unknown,
  mayRemoveOther: boolean,
): Promise<{ targetInstanceId: string }> {
  const action = requireGmInstanceActionRequest(
    typeof data === 'object' && data !== null ? data : {},
  );
  if (!mayRemoveOther && action.instanceId !== action.targetInstanceId) {
    throw new HttpsError('permission-denied', 'A browser may only release its own GM role.');
  }
  const collection = db.collection(`sessions/${action.sessionId}/gmInstances`);
  const callerRef = collection.doc(action.instanceId);
  const callerPlayerRef = db.doc(`sessions/${action.sessionId}/players/${uid}`);
  const targetRef = collection.doc(action.targetInstanceId);
  const receiptRef = action.requestId
    ? commandReceiptRef(action.sessionId, action.requestId)
    : null;
  const fingerprint: CommandFingerprint | null = action.requestId ? {
    action: mayRemoveOther ? 'kick-gm-instance' : 'release-gm-instance',
    sessionId: action.sessionId,
    requestId: action.requestId,
    actorUid: uid,
    instanceId: action.instanceId,
    expectedRevision: null,
    payload: { targetInstanceId: action.targetInstanceId },
  } : null;
  const result = await db.runTransaction(async (tx) => {
    const [caller, callerPlayer, receipt] = await Promise.all([
      tx.get(callerRef),
      tx.get(callerPlayerRef),
      receiptRef ? tx.get(receiptRef) : Promise.resolve(null),
    ]);
    const liveCaller = isLiveGmInstance(caller, callerPlayer, uid);
    // Releasing the final GM instance removes the very authority that sent
    // this command. Its still-active original member may recover only the
    // exact committed receipt; this never authorizes another mutation.
    if (!liveCaller && (mayRemoveOther || !isActivePlayer(callerPlayer))) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (receipt && fingerprint) {
      const replay = replayBoundCommand(
        receipt,
        fingerprint,
        (value): value is { readonly targetInstanceId: string } =>
          typeof value === 'object' && value !== null &&
          (value as Record<string, unknown>).targetInstanceId === action.targetInstanceId,
        mayRemoveOther ? 'GM instance kick' : 'GM instance release',
      );
      if (replay) return replay;
    }
    if (!liveCaller) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    const target = action.targetInstanceId === action.instanceId
      ? caller
      : await tx.get(targetRef);
    if (target.exists) {
      const targetUid = target.get('uid') as string;
      const remaining = await tx.get(collection.where('uid', '==', targetUid));
      tx.delete(targetRef);
      tx.delete(gmShipConsoleWriteGrantRef(action.sessionId, action.targetInstanceId));
      if (remaining.size === 1) {
        tx.update(db.doc(`sessions/${action.sessionId}/players/${targetUid}`), {
          role: 'player',
        });
      }
    }
    const committed = { targetInstanceId: action.targetInstanceId };
    if (receiptRef && fingerprint) {
      tx.set(receiptRef, { fingerprint, result: committed, createdAt: FieldValue.serverTimestamp() });
    }
    return committed;
  });
  return result;
}

/** Remove another active GM instance. The caller must itself be an active instance. */
export const kickGmInstance = onCall(async (request) =>
  removeGmInstance(requireUid(request.auth), request.data, true));

/** Release only the calling browser's own GM instance. */
export const releaseGmInstance = onCall(async (request) =>
  removeGmInstance(requireUid(request.auth), request.data, false));

async function removePlayer(
  uid: string,
  data: unknown,
): Promise<{ targetUid: string }> {
  const action = requirePlayerKickRequest(
    typeof data === 'object' && data !== null ? data : {},
  );
  if (action.targetUid === uid) {
    throw new HttpsError('permission-denied', 'A GM cannot kick its own browser.');
  }

  const sessionRef = db.doc(`sessions/${action.sessionId}`);
  const players = db.collection(`sessions/${action.sessionId}/players`);
  const callerRef = players.doc(uid);
  const instanceRef = db.doc(`sessions/${action.sessionId}/gmInstances/${action.instanceId}`);
  const targetRef = players.doc(action.targetUid);
  const groupRef = fleetGroupRef(action.sessionId);
  const membershipRef = db.doc(`activeMemberships/${action.targetUid}`);
  const censusRef = db.doc(`sessions/${action.sessionId}/loyaltyCensus/current`);
  const secretsRef = db.collection(`sessions/${action.sessionId}/secrets`);
  const receiptRef = action.requestId
    ? commandReceiptRef(action.sessionId, action.requestId)
    : null;
  const fingerprint: CommandFingerprint | null = action.requestId ? {
    action: 'kick-player',
    sessionId: action.sessionId,
    requestId: action.requestId,
    actorUid: uid,
    instanceId: action.instanceId,
    expectedRevision: null,
    payload: { targetUid: action.targetUid },
  } : null;

  const result = await db.runTransaction(async (tx) => {
    const [session, caller, instance, target, membership, census, playersSnapshot, secrets, storedGroup, receipt] = await Promise.all([
      tx.get(sessionRef),
      tx.get(callerRef),
      tx.get(instanceRef),
      tx.get(targetRef),
      tx.get(membershipRef),
      tx.get(censusRef),
      tx.get(players),
      tx.get(secretsRef),
      tx.get(groupRef),
      receiptRef ? tx.get(receiptRef) : Promise.resolve(null),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, caller, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (receipt && fingerprint) {
      const replay = replayBoundCommand(
        receipt,
        fingerprint,
        (value): value is { readonly targetUid: string } =>
          typeof value === 'object' && value !== null &&
          (value as Record<string, unknown>).targetUid === action.targetUid,
        'player kick',
      );
      if (replay) return replay;
    }
    if (!isActivePlayer(target)) {
      throw commandError('failed-precondition', 'That player is no longer connected.', 'conflict');
    }
    if (target.get('role') === 'gm') {
      throw commandError(
        'failed-precondition',
        'GM browsers must be removed from the GM instances panel.',
        'conflict',
      );
    }

    const storedSeatId = target.get('seatId');
    const seatRef = typeof storedSeatId === 'string' && storedSeatId.length > 0
      ? db.doc(`sessions/${action.sessionId}/seats/${storedSeatId}`)
      : null;
    const seat = seatRef ? await tx.get(seatRef) : null;

    const survivingPlayers = playersSnapshot.docs.filter((player) => player.id !== action.targetUid);
    ensureInitialFleetGroup(
      tx,
      action.sessionId,
      activeVesselIdsForSession(session),
      activeFleetGroupMemberUids(survivingPlayers),
      storedGroup,
      survivingPlayers,
    );
    tx.update(targetRef, {
      connected: false,
      ...disconnectedRoleState(),
      fleetGroupId: null,
      kickedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    });
    if (census.exists) {
      setLoyaltyCensusFromSecrets(
        tx,
        action.sessionId,
        setupRevision(session),
        secrets.docs ?? [],
        playersSnapshot.docs,
        configuredRoleIds(session),
        new Map([[action.targetUid, null]]),
        census,
      );
    }
    if (
      seatRef && seat?.exists && seat.get('status') === 'claimed' &&
      seat.get('holderUid') === action.targetUid
    ) {
      tx.update(seatRef, { status: 'open', holderUid: null, claimedAt: null });
    }
    if (membership.exists && membership.get('sessionId') === action.sessionId) {
      tx.delete(membershipRef);
    }
    tx.update(sessionRef, { deleteAfter: null, updatedAt: FieldValue.serverTimestamp() });
    const committed = { targetUid: action.targetUid };
    if (receiptRef && fingerprint) {
      tx.set(receiptRef, { fingerprint, result: committed, createdAt: FieldValue.serverTimestamp() });
    }
    return committed;
  });

  return result;
}

/** Remove a player browser from this session and permanently deny its return. */
export const kickPlayer = onCall(async (request) =>
  removePlayer(requireUid(request.auth), request.data));

/** Start one shared DRADIS transit from an active, named GM browser. */
export const triggerDradisContact = onCall<{
  sessionId?: string;
  instanceId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const action = requireGmInstanceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${action.sessionId}`);
  const playerRef = db.doc(`sessions/${action.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${action.sessionId}/gmInstances/${action.instanceId}`);
  const triggeredAt = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    requireActiveGameplayPhase(session);
    tx.update(sessionRef, {
      dradisContactTriggeredAt: triggeredAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { triggeredAt: triggeredAt.toDate().toISOString() };
});

/** Include or remove the optional Capybara expansion ship for the whole session. */
export const setCapybaraEnabled = onCall<{
  sessionId?: string;
  instanceId?: string;
  capybaraEnabled?: boolean;
}>(async (request) => {
  requireUid(request.auth);
  return rejectLegacySetupMutation();
});

/** Include or remove the optional SNN Press station independently of the core roster. */
export const setPressEnabled = onCall<{
  sessionId?: string;
  instanceId?: string;
  requestId?: string;
  pressEnabled?: boolean;
  expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const setting = requirePressAvailabilityRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${setting.sessionId}`);
  const playerRef = db.doc(`sessions/${setting.sessionId}/players/${uid}`);
  const instanceRef = db.doc(
    `sessions/${setting.sessionId}/gmInstances/${setting.instanceId}`,
  );
  const eventRef = db.doc(
    `sessions/${setting.sessionId}/events/press-availability-${setting.requestId}`,
  );
  const receiptRef = commandReceiptRef(setting.sessionId, setting.requestId);
  const playersRef = db.collection(`sessions/${setting.sessionId}/players`);
  const secretsRef = db.collection(`sessions/${setting.sessionId}/secrets`);
  const wolfSecretRef = db.doc(`sessions/${setting.sessionId}/secrets/wolf-assignment`);
  const censusRef = db.doc(`sessions/${setting.sessionId}/loyaltyCensus/current`);
  const fingerprint: CommandFingerprint = {
    action: 'set-press-availability',
    sessionId: setting.sessionId,
    requestId: setting.requestId,
    actorUid: uid,
    instanceId: setting.instanceId,
    expectedRevision: setting.expectedRevision,
    payload: { pressEnabled: setting.pressEnabled },
  };

  const result = await db.runTransaction(async (tx) => {
    const [session, player, instance, players, secrets, receipt, legacyEvent, wolfSecret, census] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
      tx.get(playersRef),
      tx.get(secretsRef),
      tx.get(receiptRef),
      tx.get(eventRef),
      tx.get(wolfSecretRef),
      tx.get(censusRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const liveInstance = instance.exists
      ? {
        id: instance.id,
        uid: typeof instance.get('uid') === 'string' ? instance.get('uid') as string : '',
        connected: instance.get('connected') !== false,
        lastSeenAt: gmInstanceLeaseTimestamp(instance),
      }
      : null;
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      liveInstance === null || liveInstance.uid !== uid || !isLiveSetupGm(liveInstance)
    ) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    requireActiveGameplayPhase(session);
    await rejectForeignLegacyM1Command(
      tx, setting.sessionId, setting.requestId, 'Press availability', [eventRef.path],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is { pressEnabled: boolean; revision: number } =>
        typeof value === 'object' && value !== null && !Array.isArray(value) &&
        typeof (value as { pressEnabled?: unknown }).pressEnabled === 'boolean' &&
        Number.isSafeInteger((value as { revision?: unknown }).revision),
      'Press availability',
    );
    if (replay) {
      return { pressEnabled: replay.pressEnabled, revision: replay.revision };
    }
    if (legacyEvent.exists) rejectLegacyEventReplay('Press availability');

    const storedRevision = session.get('pressAvailabilityRevision');
    const currentRevision = Number.isSafeInteger(storedRevision) && storedRevision >= 0
      ? storedRevision as number
      : 0;
    const currentEnabled = session.get('pressEnabled') !== false;
    if (setting.expectedRevision !== currentRevision) {
      if (setting.pressEnabled === currentEnabled) {
        const result = { pressEnabled: currentEnabled, revision: currentRevision } as const;
        tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
        return result;
      }
      throw commandError(
        'failed-precondition',
        'Press availability changed. Wait for the live update and try again.',
        'stale-revision',
      );
    }
    if (setting.pressEnabled === currentEnabled) {
      const result = { pressEnabled: currentEnabled, revision: currentRevision } as const;
      tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
      return result;
    }

    const result = {
      pressEnabled: setting.pressEnabled,
      revision: currentRevision + 1,
    } as const;
    tx.update(sessionRef, {
      pressEnabled: setting.pressEnabled,
      pressAvailabilityRevision: result.revision,
      ...(!setting.pressEnabled ? { pressHolderUid: null } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!setting.pressEnabled) {
      // Revoke live and stale station authority, while preserving assignments,
      // dispatch history, and every counted/core roster field.
      const removedLoyaltyUids = new Set<string>();
      players.docs
        .filter(hasPressState)
        .forEach((candidate) => {
          tx.update(candidate.ref, releasedPressFields(candidate));
          if (!hasCoreAssignment(candidate)) {
            tx.delete(db.doc(`sessions/${setting.sessionId}/secrets/loyalty-${candidate.id}`));
            removedLoyaltyUids.add(candidate.id);
          }
        });
      removePressWolfRole(tx, wolfSecretRef, wolfSecret);
      if (removedLoyaltyUids.size > 0) {
        setLoyaltyCensusFromSecrets(
          tx,
          setting.sessionId,
          result.revision,
          secrets.docs ?? [],
          players.docs,
          configuredRoleIds(session),
          new Map([...removedLoyaltyUids].map((removedUid) => [removedUid, null])),
          census,
        );
      }
    }
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'press-availability',
      payload: {
        actorUid: uid,
        requestId: setting.requestId,
        expectedRevision: setting.expectedRevision,
        previousPressEnabled: currentEnabled,
        pressEnabled: setting.pressEnabled,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });

  return result;
});

/** Include or remove Dione for the whole session. */
export const setDioneEnabled = onCall<{
  sessionId?: string;
  instanceId?: string;
  dioneEnabled?: boolean;
}>(async (request) => {
  requireUid(request.auth);
  return rejectLegacySetupMutation();
});

/** Move one fleet ship on the organiser chart and write the bridge audit trail. */
export const moveShipToLocation = onCall<{
  sessionId?: string;
  instanceId?: string;
  shipId?: string;
  destination?: string;
  requestId?: string;
  expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipNavigationMoveRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const attackStateRef = db.doc(`sessions/${change.sessionId}/wolfAttackState/current`);
  const fleetGroupsRef = db.collection(`sessions/${change.sessionId}/fleetGroups`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'move-ship', change.sessionId, identity.requestId, uid, change.instanceId,
    identity.expectedRevision ?? null, { shipId: change.shipId, destination: change.destination },
  );
  const now = new Date();

  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    const attackState = await tx.get(attackStateRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    const storedNavigation = await tx.get(navigationStateRef(change.sessionId));
    const players = await tx.get(db.collection(`sessions/${change.sessionId}/players`));
    const fleetGroups = await tx.get(fleetGroupsRef);
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'ship movement');
    if (replay) return replay;
    requireWolfAttackMovementReleased(attackState);
    requireActionPhase(session, 'movement', 'facilitator');
    requireNavigableShip(session, change.shipId);
    const currentRevision = vesselActionRevision(session, change.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
        identity.requestId, 'move-ship');
      const stale = { status: 'stale' as const, shipId: change.shipId,
        currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    // The request ID is the durable audit identity. It also makes navigation
    // log IDs stable when Firestore retries this transaction callback.
    const eventIdPrefix = `navigation-${identity.requestId}`;
    if (change.shipId === 'capybara' && session.get('capybaraEnabled') === false) {
      throw commandError('failed-precondition', 'Capybara is not in this session.', 'conflict');
    }
    if (change.shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw commandError('failed-precondition', 'Dione is not in this session.', 'conflict');
    }
    const activeVesselIds = activeVesselIdsForSession(session);
    const currentNavigation = navigationStateForSession(storedNavigation, session, activeVesselIds);
    let move;
    try {
      move = applyShipNavigationMove({
        shipId: change.shipId,
        destination: change.destination,
        now,
        eventIdPrefix,
        coordinates: activeVesselRecord(
          currentNavigation.shipGalacticCoordinates, activeVesselIds,
        ),
        logs: currentNavigation.shipNavigationLogs,
        shipNames: FLEET_SHIP_NAMES,
      });
    } catch (cause) {
      throw commandError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'The ship could not be moved.',
        'conflict',
      );
    }
    requireMovementPursuitAuthority(storedNavigation, session);
    const pursuitFleetGroups = movementPursuitFleetGroups(activeVesselIds, fleetGroups, players);
    const movedNavigation = navigationState({
      shipGalacticCoordinates: move.coordinates,
      shipNavigationLogs: move.logs,
      systemHistory: currentNavigation.systemHistory,
      pursuitGroups: currentNavigation.pursuitGroups,
    }, activeVesselIds);
    const nextNavigation = movementPursuitNavigation(
      movedNavigation,
      pursuitFleetGroups,
      change.shipId,
      move.destination,
      session.get('chartId') === 'B' || session.get('chartId') === 'C' ? session.get('chartId') : 'A',
    );
    const nextRevision = currentRevision + 1;
    tx.set(navigationStateRef(change.sessionId), {
      ...navigationProjectionFields(nextNavigation), revision: nextRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(gmDiscoveryProjectionRef(change.sessionId), {
      ...navigationProjectionFields(nextNavigation), revision: nextRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    publishDiscoveryProjections(
      tx,
      change.sessionId,
      Array.isArray(players?.docs) ? players.docs : [player],
      nextNavigation,
      nextRevision,
      session.get('chartId') === 'B' || session.get('chartId') === 'C' ? session.get('chartId') : 'A',
    );
    tx.update(sessionRef, {
      shipGalacticCoordinates: removeLegacyNavigationField(),
      shipNavigationLogs: removeLegacyNavigationField(),
      pursuitGroups: removeLegacyNavigationField(),
      ...vesselActionRevisionPatch(change.shipId, currentRevision + 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const result = {
      shipId: change.shipId,
      origin: move.origin,
      destination: move.destination,
      stardate: move.stardate,
      ...vesselActionEnvelope(session, player, uid, change.shipId, nextRevision,
        identity.requestId, 'move-ship'),
    };
    txSetIfSupported(tx, receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** Resolve one shipboard, coordinate-locked FTL jump. */
export const jumpShip = onCall<{
  sessionId?: string;
  instanceId?: string;
  shipId?: string;
  destination?: string;
  requestId?: string;
  expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipJumpRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const attackStateRef = db.doc(`sessions/${change.sessionId}/wolfAttackState/current`);
  const fleetGroupsRef = db.collection(`sessions/${change.sessionId}/fleetGroups`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'jump-ship', change.sessionId, identity.requestId, uid, change.instanceId ?? null,
    identity.expectedRevision ?? null, { shipId: change.shipId, destination: change.destination },
  );
  const now = new Date();
  const transitionId = `jump-${identity.requestId}`;
  // Firestore may retry the transaction callback. Populate this only after
  // the authoritative reads confirm a damaged drive, then reuse it so
  // contention cannot reroll the same departure.
  let integrityRoll: number | undefined;

  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, false, true,
    );
    const session = await tx.get(sessionRef);
    const attackState = await tx.get(attackStateRef);
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    const storedNavigation = await tx.get(navigationStateRef(change.sessionId));
    const players = await tx.get(db.collection(`sessions/${change.sessionId}/players`));
    const fleetGroups = await tx.get(fleetGroupsRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'ship jump');
    if (replay) return replay;
    requireWolfAttackMovementReleased(attackState);
    requireActionPhase(session, 'jump', player.get('role') === 'gm' ? 'facilitator' : 'player');
    requireNavigableShip(session, change.shipId);
    const currentRevision = vesselActionRevision(session, change.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
        identity.requestId, 'jump-ship');
      const stale = { status: 'stale' as const, shipId: change.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    if (change.shipId === 'capybara' && session.get('capybaraEnabled') === false) {
      throw commandError('failed-precondition', 'Capybara is not in this session.', 'conflict');
    }
    if (change.shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw commandError('failed-precondition', 'Dione is not in this session.', 'conflict');
    }
    const activeVesselIds = activeVesselIdsForSession(session);
    const currentNavigation = navigationStateForSession(storedNavigation, session, activeVesselIds);
    const currentTurn = sessionTurn(session.get('currentTurn'));
    const currentCoordinate = currentNavigation.shipGalacticCoordinates[change.shipId] ?? '0000';
    const currentCycles = typeof session.get('maintenanceCycles') === 'object' && session.get('maintenanceCycles') !== null
      ? session.get('maintenanceCycles') as Record<string, unknown>
      : {};
    const currentCycle = typeof currentCycles[change.shipId] === 'object' && currentCycles[change.shipId] !== null
      ? currentCycles[change.shipId] as Record<string, unknown>
      : {};
    const charges = Array.isArray(currentCycle.charges)
      ? currentCycle.charges.filter((charge): charge is string => typeof charge === 'string')
      : [];
    if (currentCycle.turn !== currentTurn || !charges.includes('jump-drive')) {
      throw commandError('failed-precondition', 'Charge the Jump Drive during this cycle before departure.', 'invalid-phase');
    }

    const inventories = shipResources(session.get('shipResources'));
    const inventory = inventories[change.shipId];
    if (!inventory) throw new HttpsError('invalid-argument', 'Unknown fleet ship.');
    const damage = shipDamage(session.get('shipDamage'))[change.shipId] ?? {
      damagedSystemIds: [], destroyed: false,
    };
    const damaged = damage.damagedSystemIds.includes('jump-drive');
    const upgrades = typeof session.get('shipUpgrades') === 'object' && session.get('shipUpgrades') !== null
      ? session.get('shipUpgrades') as Record<string, unknown>
      : {};
    const upgradeList = upgrades[change.shipId];
    const upgraded = Array.isArray(upgradeList) && upgradeList.some((upgrade) => upgrade === 'jump-drive');
    const state = shipJumpStates(session.get('shipJumpStates'))[change.shipId] ?? {};
    let result: JumpAttemptResult;
    try {
      const attempt = {
        shipId: change.shipId,
        origin: currentCoordinate,
        destination: change.destination,
        currentTurn,
        fuel: inventory.fuel,
        charged: true,
        damaged: damage.damagedSystemIds.includes('jump-drive'),
        upgraded,
        now,
        transitionId,
        state,
        // A roll of six is a non-random preflight value. The real roll is
        // sampled only after route/fuel/lock guards have passed below.
        integrityRoll: 6,
      };
      result = resolveJumpAttempt(attempt);
      if (damaged && result.status === 'jumped') {
        integrityRoll ??= randomInt(1, 7);
        result = resolveJumpAttempt({ ...attempt, integrityRoll });
      }
    } catch (cause) {
      throw commandError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'The jump drive rejected the departure.',
        'conflict',
      );
    }

    if (result.status === 'integrity-locked') {
      const reply = {
        ...result,
        shipId: change.shipId,
        ...vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
          identity.requestId, 'jump-ship'),
      };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }
    if (result.status === 'integrity-lockout') {
      const revision = currentRevision + 1;
      tx.update(sessionRef, {
        [`shipJumpStates.${change.shipId}`]: result.state,
        ...vesselActionRevisionPatch(change.shipId, revision),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const reply = {
        ...result,
        shipId: change.shipId,
        ...vesselActionEnvelope(session, player, uid, change.shipId, revision,
          identity.requestId, 'jump-ship'),
      };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }
    if (result.status === 'drive-failure') {
      const reply = {
        ...result,
        shipId: change.shipId,
        ...vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
          identity.requestId, 'jump-ship'),
      };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }

    const move = applyShipNavigationMove({
      shipId: change.shipId,
      destination: change.destination,
      now,
      eventIdPrefix: transitionId,
      navigationalError: false,
      coordinates: currentNavigation.shipGalacticCoordinates,
      logs: currentNavigation.shipNavigationLogs,
      shipNames: FLEET_SHIP_NAMES,
    });
    requireMovementPursuitAuthority(storedNavigation, session);
    const pursuitFleetGroups = movementPursuitFleetGroups(activeVesselIds, fleetGroups, players);
    const nextCycle = {
      ...currentCycle,
      charges: charges.filter((charge) => charge !== 'jump-drive'),
      results: {
        ...(typeof currentCycle.results === 'object' && currentCycle.results !== null
          ? currentCycle.results as Record<string, unknown>
          : {}),
        ftl: `FTL jump complete // ${result.origin} → ${result.destination} // ${result.length.toUpperCase()} // ${result.fuelCost} fuel.`,
      },
    };
    const revision = currentRevision + 1;
    const movedNavigation = navigationState({
      shipGalacticCoordinates: move.coordinates,
      shipNavigationLogs: move.logs,
      systemHistory: currentNavigation.systemHistory,
      pursuitGroups: currentNavigation.pursuitGroups,
    }, activeVesselIds);
    const nextNavigation = movementPursuitNavigation(
      movedNavigation,
      pursuitFleetGroups,
      change.shipId,
      move.destination,
      session.get('chartId') === 'B' || session.get('chartId') === 'C' ? session.get('chartId') : 'A',
    );
    tx.set(navigationStateRef(change.sessionId), {
      ...navigationProjectionFields(nextNavigation), revision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(gmDiscoveryProjectionRef(change.sessionId), {
      ...navigationProjectionFields(nextNavigation), revision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    publishDiscoveryProjections(
      tx,
      change.sessionId,
      Array.isArray(players?.docs) ? players.docs : [player],
      nextNavigation,
      revision,
      session.get('chartId') === 'B' || session.get('chartId') === 'C' ? session.get('chartId') : 'A',
    );
    tx.update(sessionRef, {
      shipGalacticCoordinates: removeLegacyNavigationField(),
      [`shipResources.${change.shipId}.fuel`]: result.remainingFuel,
      [`maintenanceCycles.${change.shipId}`]: nextCycle,
      [`shipJumpStates.${change.shipId}`]: result.state,
      [`shipJumpTransitions.${change.shipId}`]: result.transition,
      shipNavigationLogs: removeLegacyNavigationField(),
      pursuitGroups: removeLegacyNavigationField(),
      ...vesselActionRevisionPatch(change.shipId, revision),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const reply = {
      ...result,
      shipId: change.shipId,
      ...vesselActionEnvelope(session, player, uid, change.shipId, revision,
        identity.requestId, 'jump-ship'),
    };
    txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

/** Lock one ship's command console while it is travelling. */
export const setShipConsoleLock = onCall<{
  sessionId?: string;
  shipId?: string;
  instanceId?: string;
  locked?: boolean;
  requestId?: string;
  expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipConsoleLockRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const playerRef = db.doc(`sessions/${change.sessionId}/players/${uid}`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'console-lock', change.sessionId, identity.requestId, uid, change.instanceId ?? null,
    identity.expectedRevision ?? null, { shipId: change.shipId, locked: change.locked },
  );

  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, false, true,
    );
    const session = await tx.get(sessionRef);
    const player = await tx.get(playerRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'console lock');
    if (replay) return replay;
    requireActiveGameplayPhase(session);

    const currentRevision = vesselActionRevision(session, change.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
        identity.requestId, 'console-lock');
      const stale = { status: 'stale' as const, shipId: change.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const revision = currentRevision + 1;
    const activeVesselIds = activeVesselIdsForSession(session);
    tx.update(sessionRef, {
      shipConsoleLocks: {
        ...activeVesselRecord(shipConsoleLocks(session.get('shipConsoleLocks')), activeVesselIds),
        [change.shipId]: change.locked,
      },
      ...vesselActionRevisionPatch(change.shipId, revision),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const result = {
      shipId: change.shipId,
      locked: change.locked,
      ...vesselActionEnvelope(session, player, uid, change.shipId, revision,
        identity.requestId, 'console-lock'),
    };
    txSetIfSupported(tx, receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** Lock or unlock subsequent GM registration. */
export const setGmControlsLocked = onCall<{
  sessionId?: string;
  instanceId?: string;
  locked?: boolean;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const setting = requireGmControlsLockRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${setting.sessionId}`);
  const playerRef = db.doc(`sessions/${setting.sessionId}/players/${uid}`);
  const instanceRef = db.doc(
    `sessions/${setting.sessionId}/gmInstances/${setting.instanceId}`,
  );

  await db.runTransaction(async (tx) => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    requireActiveGameplayPhase(session);
    tx.update(sessionRef, {
      gmControlsLocked: setting.locked,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { gmControlsLocked: setting.locked };
});

/** Lower or retract the shared visual finale from an active GM browser. */
export const setDebriefMode = onCall<{
  sessionId?: string;
  instanceId?: string;
  active?: boolean;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const setting = requireDebriefModeRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${setting.sessionId}`);
  const playerRef = db.doc(`sessions/${setting.sessionId}/players/${uid}`);
  const instanceRef = db.doc(
    `sessions/${setting.sessionId}/gmInstances/${setting.instanceId}`,
  );
  const transitionServerTime = new Date().toISOString();

  const debriefMode = await db.runTransaction(async (tx): Promise<DebriefMode> => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    const current = debriefModeState(session.get('debriefMode'));
    if (current.active === setting.active) return current;
    const next = { active: setting.active, revision: current.revision + 1 };
    const fleetTicker = setting.active
      ? publishSessionFleetTicker(setting.sessionId, session, {
        source: 'automatic', priority: FLEET_TICKER_PRIORITIES.debrief,
        text: FLEET_TICKER_COPY.finale, tone: 'normal', sourceId: `debrief:${next.revision}`,
      }, transitionServerTime)
      : dismissFleetTickerSource(
        setting.sessionId,
        fleetTickerForMutation(setting.sessionId, session, transitionServerTime),
        `debrief:${current.revision}`,
        transitionServerTime,
      );
    tx.update(sessionRef, {
      debriefMode: next,
      fleetTicker,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return next;
  });

  return { debriefMode };
});

/** Advance the shared game turn from the value shown on an active GM instance. */
export const advanceTurn = onCall<{
  sessionId?: string;
  instanceId?: string;
  requestId?: string;
  expectedTurn?: number;
  overridePhaseTimer?: boolean;
  skipTurnStartAnnouncement?: boolean;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const advance = requireTurnAdvanceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${advance.sessionId}`);
  const playerRef = db.doc(`sessions/${advance.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${advance.sessionId}/gmInstances/${advance.instanceId}`);
  const receiptRef = commandReceiptRef(advance.sessionId, advance.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'advance-turn',
    sessionId: advance.sessionId,
    requestId: advance.requestId,
    actorUid: uid,
    instanceId: advance.instanceId,
    expectedRevision: advance.expectedTurn,
    payload: {
      overridePhaseTimer: advance.overridePhaseTimer,
      skipTurnStartAnnouncement: advance.skipTurnStartAnnouncement,
    },
  };
  const transitionServerTime = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const [session, player, instance, receipt] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef),
      tx.get(receiptRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    await rejectForeignLegacyM1Command(
      tx, advance.sessionId, advance.requestId, 'cycle advance', [],
    );
    const replay = replayBoundCommand(receipt, fingerprint, isTurnAdvanceResult, 'cycle advance');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    if (session.get('phase') !== undefined && session.get('phase') !== 'active') {
      throw commandError(
        'failed-precondition',
        'The final cycle is already complete; endgame evaluation is in progress.',
        'invalid-phase',
      );
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn !== advance.expectedTurn) {
      throw commandError('failed-precondition', 'The cycle changed. Wait for the live update and try again.', 'stale-revision');
    }
    const activePhase = turnPhaseState(session.get('turnPhase'));
    if (currentTurn === 0) {
      throw commandError(
        'failed-precondition',
        'Cycle 0 is for setup. Start the game before advancing cycles.',
        'invalid-phase',
      );
    }
    if (!activePhase || activePhase.turn !== currentTurn) {
      throw commandError(
        'failed-precondition',
        'No valid current server phase is available for cycle advancement.',
        'invalid-phase',
      );
    }
    if (
      !advance.overridePhaseTimer &&
      (activePhase.airspace.state !== 'lifted' || isTurnPhaseTimerActive(activePhase))
    ) {
      throw commandError(
        'failed-precondition',
        activePhase.airspace.state !== 'lifted'
          ? 'Advance is available only after the current Team Phase opens Coordination.'
          : 'A cycle phase timer is still active. Confirm the override to advance early.',
        'invalid-phase',
      );
    }
    const pursuitAuthority = await readTurnPursuitAuthority(
      tx,
      advance.sessionId,
      session,
    );
    const result = advanceTurnInTransaction(
      tx,
      sessionRef,
      advance.sessionId,
      session,
      advance.skipTurnStartAnnouncement === true,
      {},
      {
        actorUid: uid,
        transitionServerTime,
        reason: advance.overridePhaseTimer === true ? 'override' : 'expiry',
      },
      pursuitAuthority,
    );
    if (result.phase === 'debrief' || result.phase === 'failure') {
      tx.set(receiptRef, {
        fingerprint,
        result,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return result;
  });
});

/** Allow the sole connected player to enter Turn 1 for a demo session. */
export const startSinglePlayerDemo = onCall<{
  sessionId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId } = requireSessionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const connectedPlayersQuery = db.collection(`sessions/${sessionId}/players`)
    .where('connected', '==', true);

  return db.runTransaction(async (tx) => {
    const [session, player, connectedPlayers] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(connectedPlayersQuery),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) {
      throw new HttpsError('permission-denied', 'Join the session first.');
    }
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    if (sessionTurn(session.get('currentTurn')) !== 0) {
      throw commandError('failed-precondition', 'The single-player demo is only available from Cycle 0.', 'invalid-phase');
    }
    if (connectedPlayers.docs.length !== 1 || connectedPlayers.docs[0]?.id !== uid) {
      throw commandError(
        'failed-precondition',
        'The single-player demo requires this to be the only connected player.',
        'conflict',
      );
    }
    return advanceTurnInTransaction(tx, sessionRef, sessionId, session, false);
  });
});

/** Replay the latest turn transmission on every connected console. */
export const replayTurnStartAnnouncement = onCall<{
  sessionId?: string;
  instanceId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const action = requireGmInstanceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${action.sessionId}`);
  const playerRef = db.doc(`sessions/${action.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${action.sessionId}/gmInstances/${action.instanceId}`);

  const announcement = await db.runTransaction(async (tx): Promise<TurnStartAnnouncement> => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    requireActiveGameplayPhase(session);
    const currentTurn = sessionTurn(session.get('currentTurn'));
    const current = turnStartAnnouncement(session.get('turnStartAnnouncement'));
    if (!current || current.turn !== currentTurn || currentTurn < 1) {
      throw commandError('failed-precondition', 'No current cycle transmission is available to replay.', 'invalid-phase');
    }
    const next = {
      turn: current.turn,
      survivorPopulation: current.survivorPopulation,
      revision: (current.revision ?? 0) + 1,
    };
    tx.update(sessionRef, {
      turnStartAnnouncement: next,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return next;
  });

  return { turnStartAnnouncement: announcement };
});

/** Promote the shared real-time turn clock into its coordination/open-airspace phase. */
export const beginOpenAirspacePhase = onCall<{
  sessionId?: unknown;
  expectedTurn?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const requestData = requireOpenAirspacePhaseRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${requestData.sessionId}`);
  const playerRef = db.doc(`sessions/${requestData.sessionId}/players/${uid}`);
  const attackStateRef = db.doc(`sessions/${requestData.sessionId}/wolfAttackState/current`);
  const transitionServerTime = new Date().toISOString();

  return db.runTransaction(async tx => {
    const [session, player, attackState] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(attackStateRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    requireActiveGameplayPhase(session);
    if (sessionTurn(session.get('currentTurn')) !== requestData.expectedTurn) {
      throw commandError('failed-precondition', 'The cycle changed. Wait for the live update and try again.', 'stale-revision');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== requestData.expectedTurn) {
      throw commandError('failed-precondition', 'No current cycle phase is available.', 'invalid-phase');
    }
    if (phase.timerPause) {
      throw commandError(
        'failed-precondition',
        'The emergency timer is paused. Resume it before changing airspace.',
        'invalid-phase',
      );
    }
    requireLiveAirspaceWindow(phase);
    if (Date.now() < Date.parse(phase.teamPhaseEndsAt)) {
      throw commandError('failed-precondition', 'The airspace-closed timer is still active.', 'invalid-phase');
    }
    if (attackState.exists && wolfAttackBlocksNormalMovement(attackState.data())) {
      throw commandError(
        'failed-precondition',
        'The Wolf attack awaits facilitator resolution; normal movement remains blocked.',
        'invalid-phase',
      );
    }
    if (phase.airspace.state === 'lifted') {
      const turnState = sessionTurnState(session, phase);
      return { turnPhase: phase, ...(turnState ? { turnState } : {}) };
    }
    const turnPhase = {
      ...phase,
      airspace: { ...phase.airspace, state: 'lifted' as const, tickerActive: true },
    };
    const turnState = phaseTransitionTurnState(session, turnPhase);
    const fleetTicker = publishSessionFleetTicker(requestData.sessionId, session, {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace, passCount: 1,
      text: FLEET_TICKER_COPY.airspaceOpen, tone: 'normal', gap: 'long',
      sourceId: `airspace:${turnPhase.turn}:lifted`,
    }, transitionServerTime);
    tx.update(sessionRef, {
      turnPhase,
      ...(turnState ? { turnState } : {}),
      fleetTicker,
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAirspaceOpenedEvent(tx, requestData.sessionId, phase, transitionServerTime);
    return { turnPhase, ...(turnState ? { turnState } : {}) };
  });
});

/** Add one confirmed five-minute increment to the live airspace window. */
export const extendAirspaceWindow = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  expectedTurn?: unknown;
  window?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const requestData = requireAirspaceWindowExtensionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${requestData.sessionId}`);
  const playerRef = db.doc(`sessions/${requestData.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${requestData.sessionId}/gmInstances/${requestData.instanceId}`);

  return db.runTransaction(async tx => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    requireActiveGameplayPhase(session);
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn !== requestData.expectedTurn) {
      throw commandError('failed-precondition', 'The cycle changed. Wait for the live update and try again.', 'stale-revision');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== currentTurn) {
      throw commandError('failed-precondition', 'No current cycle phase is available.', 'invalid-phase');
    }
    const turnPhase = extendActiveTurnPhase(phase, requestData.window);
    if (!turnPhase) {
      throw commandError('failed-precondition', 'The requested airspace window is no longer active.', 'stale-revision');
    }
    const turnState = updatedTurnState(session, turnPhase);
    tx.update(sessionRef, {
      turnPhase,
      ...(turnState ? { turnState } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { turnPhase, ...(turnState ? { turnState } : {}) };
  });
});

/** Hold or resume the live turn clock through the GM emergency interlock. */
export const setEmergencyTimerPaused = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  expectedTurn?: unknown;
  paused?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const requestData = requireEmergencyTimerPauseRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${requestData.sessionId}`);
  const playerRef = db.doc(`sessions/${requestData.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${requestData.sessionId}/gmInstances/${requestData.instanceId}`);
  const attackStateRef = db.doc(`sessions/${requestData.sessionId}/wolfAttackState/current`);
  // Firestore may retry a transaction; one logical command must retain one audit id.
  const eventId = randomUUID();
  const transitionServerTime = new Date().toISOString();

  return db.runTransaction(async tx => {
    const [session, player, instance, attackState] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef), tx.get(attackStateRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    requireActiveGameplayPhase(session);
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn < 1) {
      throw commandError('failed-precondition', 'The emergency timer is unavailable during Cycle 0.', 'invalid-phase');
    }
    if (currentTurn !== requestData.expectedTurn) {
      throw commandError('failed-precondition', 'The cycle changed. Wait for the live update and try again.', 'stale-revision');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== currentTurn) {
      throw commandError('failed-precondition', 'No current cycle phase is available.', 'invalid-phase');
    }
    const lockedPhase = preserveWolfAttackAirspaceRestriction(phase, attackState);
    const currentlyPaused = lockedPhase.timerPause !== undefined;
    if (currentlyPaused === requestData.paused) {
      const turnState = sessionTurnState(session, lockedPhase);
      if (lockedPhase !== phase) {
        tx.update(sessionRef, {
          turnPhase: lockedPhase,
          ...(turnState ? { turnState } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return { turnPhase: lockedPhase, ...(turnState ? { turnState } : {}) };
    }

    const transitionedPhase = requestData.paused
      ? pauseActiveTurnPhase(lockedPhase)
      : resumePausedTurnPhase(lockedPhase);
    if (!transitionedPhase) {
      throw commandError(
        'failed-precondition',
        requestData.paused
          ? 'The live cycle timer has already expired.'
          : 'The emergency timer is not currently paused.',
        'stale-revision',
      );
    }
    const turnPhase = preserveWolfAttackAirspaceRestriction(transitionedPhase, attackState);
    const window = turnPhase.timerPause?.window ?? phase.timerPause?.window;
    if (!window) {
      throw new HttpsError('internal', 'The emergency timer transition had no active window.');
    }
    const turnState = updatedTurnState(session, turnPhase);
    const fleetTicker = publishSessionFleetTicker(requestData.sessionId, session, turnPhase.timerPause ? {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.emergency,
      text: FLEET_TICKER_COPY.emergency, tone: 'danger', gap: 'long',
      sourceId: `emergency:${currentTurn}:${turnPhase.timerPause.pausedAt}`,
    } : {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace, passCount: 1,
      text: turnPhase.airspace.state === 'restricted'
        ? FLEET_TICKER_COPY.airspaceClosed : FLEET_TICKER_COPY.airspaceOpen,
      tone: 'normal', gap: 'long', sourceId: `airspace:${currentTurn}:${turnPhase.airspace.state}`,
    }, transitionServerTime);
    tx.update(sessionRef, {
      turnPhase,
      ...(turnState ? { turnState } : {}),
      fleetTicker,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${requestData.sessionId}/events/${eventId}`), buildPrivacySafeEventRecord({
      type: 'timer-pause',
      payload: {
        action: requestData.paused ? 'paused' : 'resumed',
        turn: currentTurn,
        window,
        actorName: cleanName(player.get('displayName'), 'GM', 40),
        byUid: uid,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    return { turnPhase, ...(turnState ? { turnState } : {}) };
  });
});

/** Record the facilitator's approximate first Wolf-attack timing decision. */
export const setWolfAttackWindow = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  status?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const change = requireWolfAttackWindowRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const projectionRef = db.doc(`sessions/${change.sessionId}/wolfAttackWindow/current`);
  const auditRef = db.doc(`sessions/${change.sessionId}/wolfAttackWindow/current/audit/${change.requestId}`);
  const receiptRef = commandReceiptRef(change.sessionId, change.requestId);
  const fingerprint: CommandFingerprint = {
    action: 'set-wolf-attack-window',
    sessionId: change.sessionId,
    requestId: change.requestId,
    actorUid: uid,
    instanceId: change.instanceId,
    expectedRevision: change.expectedRevision,
    payload: { status: change.status },
  };

  const result = await db.runTransaction(async tx => {
    const [session, player, instance, projection, receipt, audit] = await Promise.all([
      tx.get(sessionRef),
      tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`)),
      tx.get(db.doc(`sessions/${change.sessionId}/gmInstances/${change.instanceId}`)),
      tx.get(projectionRef),
      tx.get(receiptRef),
      tx.get(auditRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const liveInstance = instance.exists
      ? {
        id: instance.id,
        uid: typeof instance.get('uid') === 'string' ? instance.get('uid') as string : '',
        connected: instance.get('connected') !== false,
        lastSeenAt: gmInstanceLeaseTimestamp(instance),
      }
      : null;
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      liveInstance === null || liveInstance.uid !== uid || !isLiveSetupGm(liveInstance)
    ) {
      throw new HttpsError('permission-denied', 'An active facilitator instance is required.');
    }
    // This request ID is shared with the older M1 command stores. A legacy
    // record cannot be reinterpreted as this new action, even when the GM
    // marker itself is otherwise authorized.
    await rejectForeignLegacyM1Command(
      tx, change.sessionId, change.requestId, 'Wolf attack timing', [],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is WolfAttackWindow => wolfAttackWindowState(value) !== undefined,
      'Wolf attack timing',
    );
    if (replay) return replay;
    if (audit.exists) rejectLegacyEventReplay('Wolf attack timing');
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    if (session.get('phase') !== 'active') {
      throw commandError(
        'failed-precondition',
        'The first Wolf-attack timing window is available only during the active game.',
        'invalid-phase',
      );
    }

    const current = projection.exists ? wolfAttackWindowState(projection.data()) : undefined;
    const currentRevision = current?.revision ?? 0;
    const currentTurn = sessionTurn(session.get('currentTurn'));
    const sameState = current?.status === change.status &&
      (change.status === 'deferred' ? current.turn === 2 : current.turn === currentTurn);
    if (change.expectedRevision !== currentRevision) {
      throw commandError(
        'failed-precondition',
        'Wolf attack timing changed. Wait for the live facilitator marker and try again.',
        'stale-revision',
      );
    }
    if (sameState && current) {
      tx.set(receiptRef, { fingerprint, result: current, createdAt: FieldValue.serverTimestamp() });
      return current;
    }

    let turn: number;
    if (change.status === 'deferred') {
      if (currentTurn !== 1 || (current && current.status === 'resolved')) {
        throw commandError(
          'failed-precondition',
          'The first Wolf-attack window can be deferred only during Cycle 1.',
          'invalid-phase',
        );
      }
      turn = 2;
    } else if (change.status === 'due') {
      const canMarkDue = (currentTurn === 1 && current === undefined) ||
        (currentTurn === 2 && current?.status === 'deferred' && current.turn === 2);
      if (!canMarkDue || (current && current.status === 'resolved')) {
        throw commandError(
          'failed-precondition',
          'The first Wolf-attack timing marker is unavailable in this cycle.',
          'invalid-phase',
        );
      }
      turn = current?.turn === 2 ? 2 : 1;
    } else {
      if (
        !current || (current.status !== 'due' && current.status !== 'deferred') ||
        current.turn !== currentTurn || (currentTurn !== 1 && currentTurn !== 2)
      ) {
        throw commandError(
          'failed-precondition',
          'Mark the active Wolf-attack timing window before resolving it.',
          'invalid-phase',
        );
      }
      turn = currentTurn;
    }

    if (change.status === 'due') requireSmallShipsDockedAtBoundary(session, 'Wolf attack');

    const next: WolfAttackWindow = {
      status: change.status,
      turn,
      revision: currentRevision + 1,
    };
    tx.set(projectionRef, {
      ...next,
      updatedAt: FieldValue.serverTimestamp(),
    });
    // This audit is deliberately in the GM-only projection. Players can read
    // the session event stream, but should not learn private marker timing.
    tx.set(auditRef, {
      type: 'wolf-attack-window',
      action: next.status,
      turn: next.turn,
      revision: next.revision,
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result: next, createdAt: FieldValue.serverTimestamp() });
    return next;
  });

  return result;
});

/** Stage private Wolf cards, targets, modifiers, and notes before declaration. */
export const stageWolfAttackPreparation = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  turn?: unknown;
  shipIds?: unknown;
  targetMode?: unknown;
  targetAssignments?: unknown;
  modifiers?: unknown;
  notes?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const change = requireWolfAttackPreparationRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const projectionRef = db.doc(`sessions/${change.sessionId}/wolfAttackPreparation/current`);
  const auditRef = db.doc(`sessions/${change.sessionId}/wolfAttackPreparation/current/audit/${change.requestId}`);
  const receiptRef = commandReceiptRef(change.sessionId, change.requestId);
  const canonicalAssignments = [...change.targetAssignments]
    .sort((left, right) => left.cardIndex - right.cardIndex)
    .map(({ cardIndex, targetShipId }) => `${cardIndex}:${targetShipId}`);
  const fingerprint: CommandFingerprint = {
    action: 'stage-wolf-attack-preparation',
    sessionId: change.sessionId,
    requestId: change.requestId,
    actorUid: uid,
    instanceId: change.instanceId,
    expectedRevision: change.expectedRevision,
    payload: {
      turn: change.turn,
      shipIds: change.shipIds,
      targetMode: change.targetMode,
      targetAssignments: canonicalAssignments.join(','),
      modifiers: [...change.modifiers].sort(),
      notes: change.notes,
    },
  };

  const result = await db.runTransaction(async tx => {
    const [session, player, instance, projection, receipt, audit] = await Promise.all([
      tx.get(sessionRef),
      tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`)),
      tx.get(db.doc(`sessions/${change.sessionId}/gmInstances/${change.instanceId}`)),
      tx.get(projectionRef),
      tx.get(receiptRef),
      tx.get(auditRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const liveInstance = instance.exists
      ? {
        id: instance.id,
        uid: typeof instance.get('uid') === 'string' ? instance.get('uid') as string : '',
        connected: instance.get('connected') !== false,
        lastSeenAt: gmInstanceLeaseTimestamp(instance),
      }
      : null;
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      liveInstance === null || liveInstance.uid !== uid || !isLiveSetupGm(liveInstance)
    ) {
      throw new HttpsError('permission-denied', 'An active facilitator instance is required.');
    }
    await rejectForeignLegacyM1Command(
      tx, change.sessionId, change.requestId, 'Wolf attack preparation', [],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is WolfAttackPreparation => wolfAttackPreparationState(value) !== undefined,
      'Wolf attack preparation',
    );
    if (replay) return replay;
    if (audit.exists) rejectLegacyEventReplay('Wolf attack preparation');
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    if (session.get('phase') !== 'active') {
      throw commandError(
        'failed-precondition',
        'Private Wolf-attack preparation is available only during the active game.',
        'invalid-phase',
      );
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn < 1 || change.turn !== currentTurn) {
      throw commandError(
        'failed-precondition',
        'Prepare the attack for the current live cycle.',
        'stale-revision',
      );
    }
    const current = projection.exists ? wolfAttackPreparationState(projection.data()) : undefined;
    if (current && current.turn > currentTurn) {
      throw commandError('failed-precondition', 'The private preparation belongs to a future cycle.', 'stale-revision');
    }
    const currentRevision = current?.revision ?? 0;
    if (change.expectedRevision !== currentRevision) {
      throw commandError(
        'failed-precondition',
        'Wolf-attack preparation changed. Wait for the live GM draft and try again.',
        'stale-revision',
      );
    }
    const activeVesselIds = authoritativeActiveVesselIdsForWolfPreparation(session);
    let validated: Omit<WolfAttackPreparation, 'revision'>;
    try {
      validated = validateWolfAttackPreparation({
        turn: change.turn,
        shipIds: change.shipIds,
        targetMode: change.targetMode,
        targetAssignments: change.targetAssignments,
        modifiers: change.modifiers,
        notes: change.notes,
      }, activeVesselIds);
    } catch (error) {
      throw commandError(
        'failed-precondition',
        error instanceof Error ? error.message : 'The preparation is not valid for this setup.',
        'invalid-phase',
      );
    }
    const next: WolfAttackPreparation = { ...validated, revision: currentRevision + 1 };
    if (current && JSON.stringify({ ...current, revision: undefined }) === JSON.stringify({ ...next, revision: undefined })) {
      tx.set(receiptRef, { fingerprint, result: current, createdAt: FieldValue.serverTimestamp() });
      return current;
    }
    tx.set(projectionRef, { ...next, updatedAt: FieldValue.serverTimestamp() });
    tx.set(auditRef, {
      type: 'wolf-attack-preparation',
      turn: next.turn,
      revision: next.revision,
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result: next, createdAt: FieldValue.serverTimestamp() });
    return next;
  });

  return result;
});

type WolfAttackDeclarationResult = Readonly<{
  status: 'committed';
  type: 'wolf-attack-declaration';
  sessionId: string;
  requestId: string;
  turn: number;
  revision: number;
  currentStep: typeof WOLF_ATTACK_DECLARATION_STEP;
  deadlineAt: string;
  airspaceLocked: true;
  parkedCraftCount: number;
  announcementId: string;
}>;

function isWolfAttackDeclarationResult(value: unknown): value is WolfAttackDeclarationResult {
  if (!isRecord(value)) return false;
  return value.status === 'committed' &&
    value.type === 'wolf-attack-declaration' &&
    typeof value.sessionId === 'string' && value.sessionId.length > 0 &&
    typeof value.requestId === 'string' && value.requestId.length > 0 &&
    Number.isSafeInteger(value.turn) && (value.turn as number) >= 1 &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 1 &&
    value.currentStep === WOLF_ATTACK_DECLARATION_STEP &&
    typeof value.deadlineAt === 'string' && Number.isFinite(Date.parse(value.deadlineAt)) &&
    value.airspaceLocked === true &&
    Number.isSafeInteger(value.parkedCraftCount) && (value.parkedCraftCount as number) >= 0 &&
    typeof value.announcementId === 'string' && value.announcementId.length > 0;
}

type WolfAttackDeclarationInputs = Readonly<{
  phase: ActiveTurnPhase;
  preparation: WolfAttackPreparation;
  window: WolfAttackWindow;
  parkedCraftIds: readonly string[];
  battleTableCraftActions: readonly BattleTableCraftActionRegistration[];
  parkedShuttleDockings: readonly PublicShuttleDocking[];
  targetRing: WolfTargetRing;
}>;

type WolfAttackPursuitSnapshot = Readonly<{
  navigationRevision: number;
  groupValues: Readonly<Record<string, number>>;
  fleetGroups: readonly Readonly<{
    id: string;
    vesselIds: readonly string[];
    memberUids: readonly string[];
  }>[];
}>;

function wolfAttackPursuitSnapshot(
  session: DocumentSnapshot,
  navigation: DocumentSnapshot,
  fleetGroups: { readonly docs: readonly DocumentSnapshot[] },
  players: { readonly docs: readonly DocumentSnapshot[] },
): WolfAttackPursuitSnapshot {
  const raw = navigation.exists &&
    typeof (navigation as unknown as { data?: unknown }).data === 'function'
    ? navigation.data()
    : undefined;
  const rawGroups = isRecord(raw) ? raw.pursuitGroups : undefined;
  const revision = navigation.get('revision');
  if (!isValidPursuitAuthority(rawGroups) ||
      !Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw commandError(
      'failed-precondition',
      'Server-owned pursuit authority is unavailable or malformed; the Wolf attack cannot begin.',
      'conflict',
    );
  }
  const groupValues = Object.fromEntries(
    Object.entries(pursuitGroups({ pursuitGroups: rawGroups }))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const parsedGroups = fleetGroups.docs.map((snapshot) => {
    const group = fleetGroupRecord(snapshot.data());
    return group?.id === snapshot.id ? group : undefined;
  });
  const groupIds = parsedGroups.map((group) => group?.id);
  const valueIds = Object.keys(groupValues).sort();
  if (groupIds.some((groupId) => groupId === undefined) ||
      new Set(groupIds).size !== groupIds.length ||
      JSON.stringify(groupIds.sort()) !== JSON.stringify(valueIds)) {
    throw commandError(
      'failed-precondition',
      'Server-owned pursuit authority is unavailable or malformed; the Wolf attack cannot begin.',
      'conflict',
    );
  }
  const canonicalGroups = (parsedGroups as FleetGroupRecord[])
    .map((group) => ({
      id: group.id,
      vesselIds: [...group.vesselIds].sort(),
      memberUids: [...group.memberUids].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  requireTurnPursuitMembership(
    wolfAttackActiveVesselIds(session),
    parsedGroups as FleetGroupRecord[],
    players.docs,
  );
  return {
    navigationRevision: revision as number,
    groupValues,
    fleetGroups: canonicalGroups,
  };
}

function wolfAttackPursuitFingerprint(pursuit: WolfAttackPursuitSnapshot): string {
  return JSON.stringify({
    navigationRevision: pursuit.navigationRevision,
    groupValues: Object.entries(pursuit.groupValues),
    fleetGroups: pursuit.fleetGroups,
  });
}

function wolfAttackActiveVesselIds(session: DocumentSnapshot): readonly string[] {
  const stored = session.get('activeVesselIds');
  if (!Array.isArray(stored) || stored.length === 0 ||
      stored.some((value) => typeof value !== 'string' || !isResourceShipId(value)) ||
      new Set(stored).size !== stored.length) {
    throw commandError(
      'failed-precondition',
      'The persisted active fleet configuration is missing or malformed.',
      'conflict',
    );
  }
  return [...stored] as string[];
}

function validateWolfAttackDeclaration(
  session: DocumentSnapshot,
  player: DocumentSnapshot,
  instance: DocumentSnapshot,
  preparationProjection: DocumentSnapshot,
  windowProjection: DocumentSnapshot,
  stateProjection: DocumentSnapshot,
  eventProjection: DocumentSnapshot,
  auditProjection: DocumentSnapshot,
  uid: string,
  expectedRevision: number,
): WolfAttackDeclarationInputs {
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  if (!isLiveGmInstance(instance, player, uid)) {
    throw new HttpsError('permission-denied', 'An active facilitator instance is required.');
  }
  requireActiveGameplayPhase(session);
  if (session.get('phase') !== 'active' || session.get('configurationLocked') !== true) {
    throw commandError(
      'failed-precondition',
      'Declare a Wolf attack only after the live game configuration has started.',
      'invalid-phase',
    );
  }
  if (stateProjection.exists) {
    throw commandError('failed-precondition', 'A Wolf attack is already declared for this session.', 'conflict');
  }
  if (eventProjection.exists || auditProjection.exists) {
    rejectLegacyEventReplay('Wolf attack declaration');
  }
  const phase = turnPhaseState(session.get('turnPhase'));
  const currentTurn = sessionTurn(session.get('currentTurn'));
  if (!phase || phase.turn !== currentTurn || currentTurn < 1) {
    throw commandError('failed-precondition', 'No current server cycle phase is available.', 'invalid-phase');
  }
  if (phase.timerPause || phase.airspace.state !== 'lifted') {
    throw commandError(
      'failed-precondition',
      'Declare the attack during the live open-airspace window.',
      'invalid-phase',
    );
  }
  const deadlineMs = Date.parse(phase.openAirspaceEndsAt);
  if (!Number.isFinite(deadlineMs) || Date.now() >= deadlineMs) {
    throw commandError('failed-precondition', 'The configured airspace deadline has passed.', 'invalid-phase');
  }
  const window = windowProjection.exists ? wolfAttackWindowState(windowProjection.data()) : undefined;
  if (!window || window.status !== 'due' || window.turn !== currentTurn) {
    throw commandError(
      'failed-precondition',
      'Mark the current Wolf-attack timing window due before declaring it.',
      'invalid-phase',
    );
  }
  const preparation = preparationProjection.exists
    ? wolfAttackPreparationState(preparationProjection.data())
    : undefined;
  if (!preparation || preparation.revision !== expectedRevision || preparation.turn !== currentTurn) {
    throw commandError(
      'failed-precondition',
      'The private Wolf-attack preparation is stale or missing. Refresh the live GM draft.',
      'stale-revision',
    );
  }
  try {
    // P427 already validates this shape. Recheck the authoritative snapshot at
    // declaration so a malformed or legacy projection cannot become combat state.
    scheduledWolfAttackComposition(currentTurn, preparation.shipIds);
  } catch (error) {
    throw commandError(
      'failed-precondition',
      error instanceof Error ? error.message : 'The private attack composition is invalid.',
      'conflict',
    );
  }
  const activeVesselIds = wolfAttackActiveVesselIds(session);
  if (CORE_WOLF_TARGET_RING.some((shipId) => !activeVesselIds.includes(shipId))) {
    throw commandError(
      'failed-precondition',
      'The base Wolf target ring is incomplete in the active fleet configuration.',
      'conflict',
    );
  }
  const targetRing: WolfTargetRing = activeVesselIds.includes('capybara')
    ? EXPANDED_WOLF_TARGET_RING
    : CORE_WOLF_TARGET_RING;
  requireSmallShipsDockedAtBoundary(session, 'Wolf attack');
  const activeRoleIds = sessionActiveRoleIds(session);
  const parking = requireWolfAttackParking(session, activeVesselIds, activeRoleIds);
  return { phase, preparation, window, ...parking, targetRing };
}

function wolfTargetingStageReceipt(
  turn: number,
  preparation: WolfAttackPreparation,
  declaredAt: string,
  targetRing: WolfTargetRing,
  pursuit: WolfAttackPursuitSnapshot,
): Record<string, unknown> {
  const composition = scheduledWolfAttackComposition(turn, preparation.shipIds);
  // P427's modifier vocabulary intentionally does not contain final roster
  // indexes. Keep those staged choices private and let the later targeting
  // command apply P428's typed modifier order after the affected players act.
  const targeting = resolveWolfTargeting(
    composition,
    {},
    targetRing,
    (upperBound) => randomInt(upperBound),
  );
  return {
    type: 'wolf-combat-calculation-stage',
    version: 1,
    turn,
    step: WOLF_ATTACK_DECLARATION_STEP,
    generatedAt: declaredAt,
    pursuitPressure: {
      navigationRevision: pursuit.navigationRevision,
      groupValues: { ...pursuit.groupValues },
    },
    composition: {
      shipIds: [...composition.shipIds],
      counts: { ...composition.counts },
      damageCapacity: composition.damageCapacity,
    },
    targeting,
  };
}

/** Atomically begin the server-owned Wolf attack lifecycle. */
export const declareWolfAttack = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  if (isRecord(raw)) {
    const allowed = new Set(['sessionId', 'instanceId', 'requestId', 'expectedRevision']);
    if (Object.keys(raw).some((key) => !allowed.has(key))) {
      throw new HttpsError('invalid-argument', 'Declaration outcomes are server generated.');
    }
  }
  const declaration = requireWolfAttackDeclarationRequest(raw ?? {});
  const sessionRef = db.doc(`sessions/${declaration.sessionId}`);
  const playerRef = db.doc(`sessions/${declaration.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${declaration.sessionId}/gmInstances/${declaration.instanceId}`);
  const preparationRef = db.doc(`sessions/${declaration.sessionId}/wolfAttackPreparation/current`);
  const windowRef = db.doc(`sessions/${declaration.sessionId}/wolfAttackWindow/current`);
  const navigationRef = navigationStateRef(declaration.sessionId);
  const fleetGroupsRef = db.collection(`sessions/${declaration.sessionId}/fleetGroups`);
  const playersRef = db.collection(`sessions/${declaration.sessionId}/players`);
  const stateRef = db.doc(`sessions/${declaration.sessionId}/wolfAttackState/current`);
  const auditRef = db.doc(`sessions/${declaration.sessionId}/wolfAttackState/current/audit/${declaration.requestId}`);
  const receiptRef = commandReceiptRef(declaration.sessionId, declaration.requestId);
  const eventRef = db.doc(`sessions/${declaration.sessionId}/events/wolf-attack-${declaration.requestId}`);
  const fingerprint: CommandFingerprint = {
    action: 'declare-wolf-attack',
    sessionId: declaration.sessionId,
    requestId: declaration.requestId,
    actorUid: uid,
    instanceId: declaration.instanceId,
    expectedRevision: declaration.expectedRevision,
    payload: {},
  };

  const [preflightSession, preflightPlayer, preflightInstance, preflightPreparation,
    preflightWindow, preflightNavigation, preflightState, preflightReceipt,
    preflightAudit, preflightEvent, preflightFleetGroups, preflightPlayers] = await Promise.all([
    sessionRef.get(), playerRef.get(), instanceRef.get(), preparationRef.get(),
    windowRef.get(), navigationRef.get(), stateRef.get(), receiptRef.get(), auditRef.get(), eventRef.get(),
    fleetGroupsRef.get(), playersRef.get(),
  ]);
  if (!preflightSession.exists) throw new HttpsError('not-found', 'No such session.');
  if (!isLiveGmInstance(preflightInstance, preflightPlayer, uid)) {
    throw new HttpsError('permission-denied', 'An active facilitator instance is required.');
  }
  await rejectForeignLegacyM1CommandBeforeReplay(
    declaration.sessionId, declaration.requestId, 'Wolf attack declaration', [eventRef.path],
  );
  const preflightReplay = replayBoundCommand(
    preflightReceipt, fingerprint, isWolfAttackDeclarationResult, 'Wolf attack declaration',
  );
  if (preflightReplay) return preflightReplay;
  const preflight = validateWolfAttackDeclaration(
    preflightSession, preflightPlayer, preflightInstance, preflightPreparation,
    preflightWindow, preflightState, preflightEvent, preflightAudit, uid,
    declaration.expectedRevision,
  );
  const preflightPursuit = wolfAttackPursuitSnapshot(
    preflightSession, preflightNavigation, preflightFleetGroups, preflightPlayers,
  );
  const declaredAt = new Date().toISOString();
  const calculationReceipt = wolfTargetingStageReceipt(
    preflight.phase.turn, preflight.preparation, declaredAt, preflight.targetRing, preflightPursuit,
  );
  const announcementId = `wolf-attack-${declaration.requestId}`;
  const result: WolfAttackDeclarationResult = {
    status: 'committed',
    type: 'wolf-attack-declaration',
    sessionId: declaration.sessionId,
    requestId: declaration.requestId,
    turn: preflight.phase.turn,
    revision: 1,
    currentStep: WOLF_ATTACK_DECLARATION_STEP,
    deadlineAt: preflight.phase.openAirspaceEndsAt,
    airspaceLocked: true,
    parkedCraftCount: preflight.parkedCraftIds.length,
    announcementId,
  };

  return db.runTransaction(async tx => {
    const [session, player, instance, preparation, window, navigation,
      state, receipt, audit, event, fleetGroups, players] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef), tx.get(preparationRef),
      tx.get(windowRef), tx.get(navigationRef), tx.get(stateRef), tx.get(receiptRef),
      tx.get(auditRef), tx.get(eventRef), tx.get(fleetGroupsRef), tx.get(playersRef),
    ]);
    await rejectForeignLegacyM1Command(
      tx, declaration.sessionId, declaration.requestId, 'Wolf attack declaration', [eventRef.path],
    );
    const replay = replayBoundCommand(receipt, fingerprint, isWolfAttackDeclarationResult, 'Wolf attack declaration');
    if (replay) return replay;
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'An active facilitator instance is required.');
    }
    const inputs = validateWolfAttackDeclaration(
      session, player, instance, preparation, window, state, event, audit, uid,
      declaration.expectedRevision,
    );
    const pursuit = wolfAttackPursuitSnapshot(session, navigation, fleetGroups, players);
    if (inputs.phase.turn !== preflight.phase.turn ||
        inputs.phase.openAirspaceEndsAt !== preflight.phase.openAirspaceEndsAt ||
        inputs.window.revision !== preflight.window.revision ||
        inputs.preparation.revision !== preflight.preparation.revision ||
        wolfAttackPursuitFingerprint(pursuit) !== wolfAttackPursuitFingerprint(preflightPursuit) ||
        JSON.stringify(inputs.targetRing) !== JSON.stringify(preflight.targetRing)) {
      throw commandError(
        'failed-precondition',
        'The live attack authority or preparation changed while the declaration was being committed.',
        'stale-revision',
      );
    }

    const lockedPhase = {
      ...inputs.phase,
      airspace: { ...inputs.phase.airspace, state: 'restricted' as const, tickerActive: true },
    };
    const turnState = phaseTransitionTurnState(session, lockedPhase);
    const fleetTicker = publishSessionFleetTicker(declaration.sessionId, session, {
      source: 'automatic',
      priority: FLEET_TICKER_PRIORITIES.airspace,
      passCount: 1,
      text: FLEET_TICKER_COPY.airspaceClosed,
      tone: 'normal',
      gap: 'long',
      sourceId: `wolf-attack:${inputs.phase.turn}`,
    }, declaredAt);
    const stageState: WolfAttackStageState = {
      type: 'wolf-attack-state',
      status: 'declared',
      turn: inputs.phase.turn,
      revision: 1,
      preparationRevision: inputs.preparation.revision,
      currentStep: WOLF_ATTACK_DECLARATION_STEP,
      deadlineAt: inputs.phase.openAirspaceEndsAt,
      airspaceLocked: true,
      parkedCraftIds: [...inputs.parkedCraftIds],
      parkingReleaseCondition: WOLF_ATTACK_PARKING_RELEASE,
      battleTableCraftActions: inputs.battleTableCraftActions.map((action) => ({ ...action })),
      parkedShuttleDockings: inputs.parkedShuttleDockings.map((docking) => ({ ...docking })),
      calculationReceipt,
      commanderRerollIndexes: [],
      preparation: inputs.preparation,
      actorUid: uid,
      declaredAt,
      announcementId,
    };
    const nextWindow: WolfAttackWindow = {
      status: 'resolved',
      turn: inputs.window.turn,
      revision: inputs.window.revision + 1,
    };
    tx.update(sessionRef, {
      turnPhase: lockedPhase,
      ...(turnState ? { turnState } : {}),
      fleetTicker,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(stateRef, { ...stageState, updatedAt: FieldValue.serverTimestamp() });
    tx.set(auditRef, {
      type: 'wolf-attack-declaration',
      action: 'declared',
      turn: stageState.turn,
      revision: stageState.revision,
      preparationRevision: stageState.preparationRevision,
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(windowRef, { ...nextWindow, updatedAt: FieldValue.serverTimestamp() });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'wolf-attack-declared',
      envelope: buildAuthoritativeEventEnvelope({
        sessionId: declaration.sessionId,
        actorUid: uid,
        actorRoleId: null,
        turn: stageState.turn,
        phase: 'active',
        type: 'wolf-attack-declared',
        requestId: declaration.requestId,
        revision: stageState.revision,
        serverTime: declaredAt,
        visibility: EventVisibility.Member,
      }),
      payload: {
        status: stageState.status,
        currentStep: stageState.currentStep,
        deadlineAt: stageState.deadlineAt,
        airspace: 'locked',
        parkedCraftCount: stageState.parkedCraftIds.length,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type WolfCommanderTargetingResult = Readonly<{
  status: 'committed';
  type: 'wolf-commander-target-reroll';
  sessionId: string;
  requestId: string;
  turn: number;
  revision: number;
  currentStep: 'targeting';
  rerolledIndexes: readonly number[];
  view: WolfCommanderTargetingView;
}>;

type WolfCommanderTargetingReadResult =
  | WolfCommanderTargetingView
  | Readonly<{
    type: 'wolf-commander-targeting-unavailable';
    sessionId: string;
    reason: 'waiting' | 'not-targeting';
  }>;

function isWolfCommanderTargetingResult(value: unknown): value is WolfCommanderTargetingResult {
  if (!isRecord(value)) return false;
  return value.status === 'committed' && value.type === 'wolf-commander-target-reroll' &&
    typeof value.sessionId === 'string' && value.sessionId.length > 0 &&
    typeof value.requestId === 'string' && value.requestId.length > 0 &&
    Number.isSafeInteger(value.turn) && (value.turn as number) >= 1 &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 1 &&
    value.currentStep === 'targeting' && Array.isArray(value.rerolledIndexes) &&
    value.rerolledIndexes.every((index) => Number.isSafeInteger(index) && (index as number) >= 0) &&
    isRecord(value.view) && value.view.type === 'wolf-commander-targeting-view';
}

type WolfCommanderTargetingInputs = Readonly<{
  turn: number;
  revision: number;
  receipt: WolfTargetingReceipt;
  consumedIndexes: readonly number[];
  calculationReceipt: Record<string, unknown>;
}>;

function wolfCommanderTargetingInputs(
  session: DocumentSnapshot,
  state: DocumentSnapshot,
): WolfCommanderTargetingInputs {
  if (!state.exists || state.get('type') !== 'wolf-attack-state' || state.get('status') !== 'declared' ||
      state.get('currentStep') !== WOLF_ATTACK_DECLARATION_STEP || state.get('airspaceLocked') !== true) {
    throw commandError('failed-precondition', 'Wolf targeting is not currently open to the Commander.', 'invalid-phase');
  }
  const turn = state.get('turn');
  const revision = state.get('revision');
  const currentTurn = sessionTurn(session.get('currentTurn'));
  if (!Number.isSafeInteger(turn) || (turn as number) < 1 || turn !== currentTurn) {
    throw commandError('failed-precondition', 'The Wolf targeting state is stale for the current cycle.', 'stale-revision');
  }
  if (!Number.isSafeInteger(revision) || (revision as number) < 1) {
    throw commandError('failed-precondition', 'The Wolf targeting revision is malformed.', 'conflict');
  }
  const rawConsumed = state.get('commanderRerollIndexes');
  if (!Array.isArray(rawConsumed) || rawConsumed.some((index) =>
    !Number.isSafeInteger(index) || (index as number) < 0) || new Set(rawConsumed).size !== rawConsumed.length) {
    throw commandError('failed-precondition', 'The Wolf targeting reroll ledger is malformed.', 'conflict');
  }
  const rawCalculationReceipt = state.get('calculationReceipt');
  if (!isRecord(rawCalculationReceipt) || rawCalculationReceipt.step !== WOLF_ATTACK_DECLARATION_STEP) {
    throw commandError('failed-precondition', 'The Wolf targeting receipt is unavailable.', 'conflict');
  }
  const receipt = parseWolfTargetingReceipt(rawCalculationReceipt.targeting);
  if (!receipt) {
    throw commandError('failed-precondition', 'The Wolf targeting receipt is malformed.', 'conflict');
  }
  const receiptRerolledIndexes = receipt.rolls.flatMap((roll) =>
    roll.rerollDie === undefined && !roll.modifiers.includes('commander-reroll')
      ? [] : [roll.rosterIndex]);
  const consumedIndexes = [...rawConsumed] as number[];
  if (JSON.stringify([...consumedIndexes].sort((a, b) => a - b)) !==
      JSON.stringify([...receiptRerolledIndexes].sort((a, b) => a - b)) ||
      consumedIndexes.some((index) => index >= receipt.rolls.length)) {
    throw commandError('failed-precondition', 'The Wolf targeting reroll ledger does not match its receipt.', 'conflict');
  }
  const preparation = wolfAttackPreparationState(state.get('preparation'));
  if (!preparation || preparation.turn !== turn) {
    throw commandError('failed-precondition', 'The Wolf targeting preparation is unavailable.', 'conflict');
  }
  try {
    const composition = scheduledWolfAttackComposition(turn as number, preparation.shipIds);
    if (composition.shipIds.length !== receipt.rolls.length ||
        composition.shipIds.some((shipId, index) => receipt.rolls[index]?.shipId !== shipId)) {
      throw new Error('The Wolf targeting receipt does not match its preparation.');
    }
    const activeVesselIds = wolfAttackActiveVesselIds(session);
    const expectedRing = activeVesselIds.includes('capybara')
      ? EXPANDED_WOLF_TARGET_RING : CORE_WOLF_TARGET_RING;
    if (JSON.stringify(receipt.ring) !== JSON.stringify(expectedRing)) {
      throw new Error('The Wolf targeting receipt does not match the active fleet.');
    }
  } catch (error) {
    throw commandError(
      'failed-precondition',
      error instanceof Error ? error.message : 'The Wolf targeting receipt is not authoritative.',
      'conflict',
    );
  }
  return {
    turn: turn as number,
    revision: revision as number,
    receipt,
    consumedIndexes,
    calculationReceipt: rawCalculationReceipt,
  };
}

function requireWolfCommanderPlayer(player: DocumentSnapshot, uid: string): void {
  if (!player.exists || player.id !== uid || !isActivePlayer(player) || player.get('role') !== 'player') {
    throw new HttpsError('permission-denied', 'Only the active Wolf Commander player may use this action.');
  }
  if (player.get('replacementRoleId') !== 'wolf-commander') {
    throw new HttpsError('permission-denied', 'The historical role does not grant Wolf Commander authority.');
  }
}

/** Return a filtered targeting view; the GM-only receipt never crosses this boundary. */
export const getWolfCommanderTargeting = onCall<{
  sessionId?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  if (isRecord(raw) && Object.keys(raw).some((key) => key !== 'sessionId')) {
    throw new HttpsError('invalid-argument', 'The Commander targeting query accepts only sessionId.');
  }
  const sessionId = requireSessionRequest(isRecord(raw) ? raw : {}).sessionId;
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const stateRef = db.doc(`sessions/${sessionId}/wolfAttackState/current`);
  const [session, player, state] = await Promise.all([sessionRef.get(), playerRef.get(), stateRef.get()]);
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  requireWolfCommanderPlayer(player, uid);
  requireActiveGameplayPhase(session);
  if (!state.exists) {
    return { type: 'wolf-commander-targeting-unavailable', sessionId, reason: 'waiting' } satisfies WolfCommanderTargetingReadResult;
  }
  try {
    const inputs = wolfCommanderTargetingInputs(session, state);
    return commanderTargetingView(sessionId, inputs.turn, inputs.revision, inputs.receipt);
  } catch (error) {
    if (error instanceof HttpsError && error.code === 'failed-precondition' &&
        state.get('currentStep') !== WOLF_ATTACK_DECLARATION_STEP) {
      return { type: 'wolf-commander-targeting-unavailable', sessionId, reason: 'not-targeting' } satisfies WolfCommanderTargetingReadResult;
    }
    throw error;
  }
});

/** Apply selected targeting rerolls under the replacement-role authority. */
export const applyWolfCommanderTargetRerolls = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  expectedTurn?: unknown;
  expectedRevision?: unknown;
  rosterIndexes?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  if (isRecord(raw)) {
    const allowed = new Set(['sessionId', 'requestId', 'expectedTurn', 'expectedRevision', 'rosterIndexes']);
    if (Object.keys(raw).some((key) => !allowed.has(key))) {
      throw new HttpsError('invalid-argument', 'Reroll outcomes are server generated.');
    }
  }
  const change = requireWolfCommanderRerollRequest(isRecord(raw) ? raw : {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const playerRef = db.doc(`sessions/${change.sessionId}/players/${uid}`);
  const stateRef = db.doc(`sessions/${change.sessionId}/wolfAttackState/current`);
  const auditRef = db.doc(`sessions/${change.sessionId}/wolfAttackState/current/audit/${change.requestId}`);
  const receiptRef = commandReceiptRef(change.sessionId, change.requestId);
  const canonicalIndexes = [...change.rosterIndexes].sort((left, right) => left - right);
  const fingerprint: CommandFingerprint = {
    action: 'apply-wolf-commander-target-rerolls',
    sessionId: change.sessionId,
    requestId: change.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: change.expectedRevision,
    payload: { expectedTurn: change.expectedTurn, rosterIndexes: canonicalIndexes.map(String) },
  };
  return db.runTransaction(async (tx: Transaction): Promise<WolfCommanderTargetingResult> => {
    const [session, player, state, receipt] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(stateRef), tx.get(receiptRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    requireWolfCommanderPlayer(player, uid);
    const replay = replayBoundCommand(
      receipt, fingerprint, isWolfCommanderTargetingResult, 'Wolf Commander target reroll',
    );
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const inputs = wolfCommanderTargetingInputs(session, state);
    if (change.expectedTurn !== inputs.turn || change.expectedRevision !== inputs.revision) {
      throw commandError(
        'failed-precondition',
        'The Wolf targeting view is stale. Refresh the current dice before choosing rerolls.',
        'stale-revision',
      );
    }
    if (canonicalIndexes.some((index) => inputs.consumedIndexes.includes(index))) {
      throw commandError(
        'failed-precondition',
        'One or more selected targeting dice have already been rerolled.',
        'stale-revision',
      );
    }
    let targeting;
    try {
      targeting = applyWolfCommanderRerolls(inputs.receipt, canonicalIndexes, (upperBound) => randomInt(upperBound));
    } catch (error) {
      throw commandError(
        'failed-precondition',
        error instanceof Error ? error.message : 'The selected targeting dice cannot be rerolled.',
        'conflict',
      );
    }
    const rerolledIndexes = [...inputs.consumedIndexes, ...canonicalIndexes].sort((left, right) => left - right);
    const nextRevision = inputs.revision + 1;
    const nextView = commanderTargetingView(change.sessionId, inputs.turn, nextRevision, targeting);
    const nextCalculationReceipt = {
      ...inputs.calculationReceipt,
      targeting,
    };
    const result: WolfCommanderTargetingResult = {
      status: 'committed',
      type: 'wolf-commander-target-reroll',
      sessionId: change.sessionId,
      requestId: change.requestId,
      turn: inputs.turn,
      revision: nextRevision,
      currentStep: 'targeting',
      rerolledIndexes: canonicalIndexes,
      view: nextView,
    };
    tx.update(stateRef, {
      revision: nextRevision,
      calculationReceipt: nextCalculationReceipt,
      commanderRerollIndexes: rerolledIndexes,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(auditRef, {
      type: 'wolf-commander-target-reroll',
      turn: inputs.turn,
      revision: nextRevision,
      rerolledIndexes: canonicalIndexes,
      actorUid: uid,
      requestId: change.requestId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** AEGIS may grant the SNN Press shuttle a limited exception during restricted airspace. */
export const unlockPressAirspace = onCall<{ sessionId?: unknown; instanceId?: unknown }>(async request => {
  const uid = requireUid(request.auth);
  const requestData = requireAirspaceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${requestData.sessionId}`);
  const attackStateRef = db.doc(`sessions/${requestData.sessionId}/wolfAttackState/current`);
  const transitionServerTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const player = await tx.get(db.doc(`sessions/${requestData.sessionId}/players/${uid}`));
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    await requireConsoleAuthority(tx, requestData.sessionId, player, 'admiral', requestData.instanceId);
    const [session, attackState] = await Promise.all([
      tx.get(sessionRef), tx.get(attackStateRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    requireActiveGameplayPhase(session);
    if (session.get('pressEnabled') === false) {
      throw commandError('failed-precondition', 'Press is disabled.', 'unauthorized');
    }
    const storedPhase = turnPhaseState(session.get('turnPhase'));
    if (!storedPhase || storedPhase.turn !== sessionTurn(session.get('currentTurn'))) {
      throw commandError('failed-precondition', 'No current airspace window is available.', 'invalid-phase');
    }
    const phase = preserveWolfAttackAirspaceRestriction(storedPhase, attackState);
    if (phase.timerPause) {
      throw commandError(
        'failed-precondition',
        'The emergency timer is paused. Resume it before changing airspace.',
        'invalid-phase',
      );
    }
    requireLiveAirspaceWindow(phase);
    // A late command can be the first live request after the team deadline.
    // Heal the shared clock before evaluating a restriction-only exception.
    if (
      phase.airspace.state === 'restricted' &&
      Date.now() >= Date.parse(phase.teamPhaseEndsAt) &&
      (!attackState.exists || !wolfAttackBlocksNormalMovement(attackState.data()))
    ) {
      const turnPhase = {
        ...phase,
        airspace: { ...phase.airspace, state: 'lifted' as const, tickerActive: true },
      };
      const turnState = phaseTransitionTurnState(session, turnPhase);
      const fleetTicker = publishSessionFleetTicker(requestData.sessionId, session, {
        source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace, passCount: 1,
        text: FLEET_TICKER_COPY.airspaceOpen, tone: 'normal', gap: 'long',
        sourceId: `airspace:${turnPhase.turn}:lifted`,
      }, transitionServerTime);
      tx.update(sessionRef, {
        turnPhase,
        ...(turnState ? { turnState } : {}),
        fleetTicker,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAirspaceOpenedEvent(tx, requestData.sessionId, phase, transitionServerTime);
      return { turnPhase, ...(turnState ? { turnState } : {}) };
    }
    if (phase.airspace.state !== 'restricted' || phase.airspace.pressAccess) {
      const turnState = sessionTurnState(session, phase);
      return { turnPhase: phase, ...(turnState ? { turnState } : {}) };
    }
    const turnPhase = {
      ...phase,
      airspace: { ...phase.airspace, pressAccess: true },
    };
    const turnState = sessionTurnState(session, turnPhase);
    tx.update(sessionRef, {
      turnPhase,
      ...(turnState ? { turnState } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { turnPhase, ...(turnState ? { turnState } : {}) };
  });
});

/** Enable or disable a playable role for this session. */
export const setActiveRoleEnabled = onCall<{
  sessionId?: string;
  instanceId?: string;
  roleId?: string;
  enabled?: boolean;
}>(async (request) => {
  requireUid(request.auth);
  return rejectLegacySetupMutation();
});

/** Apply the GM-reviewed roster atomically; individual draft edits never reach the server. */
export const setActiveRoleConfiguration = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  activeRoleIds?: unknown;
}>(async (request) => {
  requireUid(request.auth);
  return rejectLegacySetupMutation();
});

/** Replace role availability with the recommended player-count template. */
export const applyRolePreset = onCall<{
  sessionId?: string;
  instanceId?: string;
  playerCount?: number;
}>(async (request) => {
  requireUid(request.auth);
  return rejectLegacySetupMutation();
});

/** Fire a ship's one-use confetti dispenser and atomically add its GM log event. */
export const popShipConfetti = onCall<{
  sessionId?: string; shipId?: string; roleId?: string; requestId?: string; instanceId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const activation = requireShipConfettiRequest(request.data ?? {});
  const shipId = activation.shipId;
  if (!isFleetShipId(shipId)) {
    throw new HttpsError('invalid-argument', 'Unknown fleet ship.');
  }
  const identity = shipId === 'snn-press-shuttle' ? requireVesselActionRequest(request.data ?? {}) : null;
  const receiptRef = identity ? commandReceiptRef(activation.sessionId, identity.requestId) : null;
  const fingerprint = identity ? vesselActionFingerprint('press-confetti', activation.sessionId,
    identity.requestId, uid, null, null, { shipId, roleId: activation.roleId }) : null;
  const sessionRef = db.doc(`sessions/${activation.sessionId}`);
  const playerRef = db.doc(`sessions/${activation.sessionId}/players/${uid}`);
  const eventRef = db.collection(`sessions/${activation.sessionId}/events`).doc();
  const approvalRef = db.doc(`sessions/${activation.sessionId}/shipConfettiApprovals/${shipId}`);
  const connectedPlayersQuery = db.collection(`sessions/${activation.sessionId}/players`)
    .where('connected', '==', true);
  const instanceRef = activation.instanceId
    ? db.doc(`sessions/${activation.sessionId}/gmInstances/${activation.instanceId}`)
    : null;
  const grantRef = activation.instanceId
    ? gmShipConsoleWriteGrantRef(activation.sessionId, activation.instanceId)
    : null;

  const status = await db.runTransaction(async (tx): Promise<'fired' | 'awaiting-officer'> => {
    const [session, player, approval, connectedPlayers, instance, grant] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(approvalRef),
      tx.get(connectedPlayersQuery),
      instanceRef ? tx.get(instanceRef) : null,
      grantRef ? tx.get(grantRef) : null,
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    requirePlayerShipActionAuthority(player);
    if (player.get('role') === 'gm' && (
      !activation.instanceId || !instance || !isLiveGmInstance(instance, player, uid) ||
      !grant || !hasGmShipConsoleWriteGrant(grant, activation.sessionId, activation.instanceId, uid, shipId)
    )) {
      throw new HttpsError('permission-denied', 'Select this ship for GM write access first.');
    }
    requireActiveGameplayPhase(session);

    if (shipId !== 'snn-press-shuttle' && !activeVesselIdsForSession(session).includes(shipId)) {
      throw commandError('failed-precondition', 'That ship is not active in this session.', 'conflict');
    }
    if (shipId === 'snn-press-shuttle' && session.get('pressEnabled') === false) {
      throw new HttpsError('permission-denied', 'Press is disabled.');
    }
    if (
      shipId === 'snn-press-shuttle' &&
      (
        activation.roleId !== 'press-officer' ||
        !['player', 'gm'].includes(String(player.get('role'))) ||
        player.get('connected') !== true ||
        player.get('activeConsoleRoleId') !== 'press-officer' ||
        hasCoreAssignment(player) ||
        (typeof session.get('pressHolderUid') === 'string' &&
          session.get('pressHolderUid') !== uid) ||
        connectedPlayers.docs.some((candidate) =>
          candidate.id !== uid && isAuthoritativePressHolder(candidate))
      )
    ) {
      throw new HttpsError(
        'permission-denied',
        'Only the active Press Officer may fire this dispenser.',
      );
    }
    if (shipId === 'capybara' && session.get('capybaraEnabled') === false) {
      throw commandError('failed-precondition', 'Capybara is not in this convoy.', 'conflict');
    }
    if (shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw commandError('failed-precondition', 'Dione is not in this convoy.', 'conflict');
    }
    const activeRoleIds = (session.get('activeRoleIds') as string[] | undefined) ??
      DEFAULT_ACTIVE_ROLE_IDS;
    const connectedOfficerRoles = connectedPlayers.docs
      .filter((connectedPlayer) => isActivePlayer(connectedPlayer) &&
        ['player', 'gm'].includes(String(connectedPlayer.get('role'))) &&
        activeRoleIds.includes(String(connectedPlayer.get('activeConsoleRoleId'))) &&
        isOfficerRoleForShip(connectedPlayer.get('activeConsoleRoleId'), shipId))
      .map((connectedPlayer) => ({
        uid: connectedPlayer.id,
        roleId: String(connectedPlayer.get('activeConsoleRoleId')),
      }));
    const used = (session.get('confettiUsedShipIds') as string[] | undefined) ?? [];
    if (shipForRole(activation.roleId) && player.get('role') !== 'gm') {
      const ownRoleId = player.get('activeConsoleRoleId');
      if (!replacementAuthorityAllowsRole(player.get('replacementRoleId'), activation.roleId) ||
          !activeRoleIds.includes(activation.roleId) ||
          player.get('role') !== 'player' ||
          typeof ownRoleId !== 'string' ||
          !activeRoleIds.includes(ownRoleId) ||
          !canOperateRole(
            ownRoleId,
            activation.roleId,
            connectedPlayers.docs
              .filter(member => isActivePlayer(member) && ['player', 'gm'].includes(String(member.get('role'))))
              .map(member => member.get('activeConsoleRoleId'))
              .filter((roleId): roleId is string => typeof roleId === 'string' && activeRoleIds.includes(roleId)),
            activeRoleIds,
          )) {
        throw new HttpsError('permission-denied', 'This console is read only with the current crew.');
      }
    }
    if (
      !shipForRole(activation.roleId) &&
      activation.roleId !== 'press-officer' &&
      !activeRoleIds.includes(activation.roleId)
    ) {
      throw commandError('failed-precondition', 'That role is not active in this session.', 'conflict');
    }
    if (shipId !== 'aegis' && !canPopShipConfetti(used, shipId)) {
      throw new HttpsError('already-exists', 'That dispenser has already been used.');
    }
    let decision;
    try {
      decision = confettiActivationDecision(
        shipId,
        activation.roleId,
        uid,
        liveConfettiApprovals(
          shipId,
          (approval.get('approvals') as Array<{ uid: string; roleId: string }> | undefined) ?? [],
          connectedOfficerRoles,
        ),
        [uid, ...connectedOfficerRoles.map((operator) => operator.uid)],
      );
    } catch {
      throw new HttpsError('permission-denied', 'That role cannot fire this ship dispenser.');
    }
    if (receiptRef && fingerprint && identity) {
      await rejectForeignLegacyM1Command(tx, activation.sessionId, identity.requestId, 'Press dispenser', []);
      const prior = await tx.get(receiptRef);
      const replay = replayBoundCommand(prior, fingerprint,
        (value): value is 'fired' => value === 'fired', 'Press dispenser');
      if (replay) return replay;
    }
    if (decision.kind === 'awaiting-officer') {
      tx.set(approvalRef, { approvals: decision.approvals, updatedAt: FieldValue.serverTimestamp() });
      return 'awaiting-officer';
    }
    const signalRefs = confettiSignalTargets(
      shipId,
      (session.get('shuttleDockings') as Array<{ shuttleId: string; shipId: string }> | undefined) ??
        INITIAL_SHUTTLE_DOCKINGS,
    ).map((targetShipId) => db.doc(
      `sessions/${activation.sessionId}/shipConfetti/${targetShipId}`,
    ));
    const signals = await Promise.all(signalRefs.map((signalRef) => tx.get(signalRef)));
    const reusable = isReusableConfettiSource(shipId);
    const existingSignalIsOwn = Boolean(
      signals[0]?.exists && isShipDispenserSignal(String(signals[0].get('shipId')), shipId),
    );
    if ((!reusable && existingSignalIsOwn) || !canPopShipConfetti(used, shipId)) {
      throw new HttpsError('already-exists', 'That dispenser has already been used.');
    }
    const event = {
      type: 'ship-confetti',
      shipId,
      shipName: FLEET_SHIP_NAMES[shipId],
      actorUid: uid,
      actorName: cleanName(player.get('displayName'), 'Player', 40),
      actorRoleName: decision.actorRoleName,
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.update(sessionRef, reusable ? {
      updatedAt: FieldValue.serverTimestamp(),
    } : {
      confettiUsedShipIds: FieldValue.arrayUnion(shipId),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (reusable) signalRefs.forEach((signalRef) => tx.set(signalRef, event));
    else tx.create(signalRefs[0]!, event);
    tx.delete(approvalRef);
    if (shouldLogShipConfettiEvent(shipId)) {
      tx.create(eventRef, buildPrivacySafeEventRecord({
        type: 'ship-confetti',
        payload: event,
        createdAt: event.createdAt,
      }));
    }
    if (receiptRef && fingerprint) {
      tx.set(receiptRef, { fingerprint, result: 'fired', createdAt: FieldValue.serverTimestamp() });
    }
    return 'fired';
  });

  return { shipId, status };
});

/** Connected-player count used for the last-player disconnect warning. */
export const getSessionPresence = onCall<{ sessionId?: string }>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId } = requireSessionRequest(request.data ?? {});
  const member = await db.doc(`sessions/${sessionId}/players/${uid}`).get();
  if (!isActivePlayer(member)) throw new HttpsError('permission-denied', 'Join the session first.');
  const connected = await db.collection(`sessions/${sessionId}/players`)
    .where('connected', '==', true)
    .get();
  return { connectedPlayers: connected.size };
});

type EscapeMutationResult = Readonly<{
  status: 'committed' | 'replayed' | 'stale';
  sessionId: string;
  requestId: string;
  targetUid: string;
  shipId: string;
  setupRevision: number;
  escapeState?: PlayerEscapeState;
}>;

function isEscapeMutationResult(value: unknown, sessionId: string): value is EscapeMutationResult {
  if (!isRecord(value)) return false;
  return value.sessionId === sessionId && typeof value.requestId === 'string' &&
    typeof value.targetUid === 'string' && typeof value.shipId === 'string' &&
    (value.status === 'committed' || value.status === 'replayed' || value.status === 'stale') &&
    Number.isSafeInteger(value.setupRevision) && (value.setupRevision as number) >= 0 &&
    (value.escapeState === undefined || parsePlayerEscapeState(value.escapeState) !== undefined);
}

/** The affected player explicitly leaves the destroyed ship's station. */
export const fleeDestroyedShip = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  expectedSetupRevision?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const decision = requireEscapeRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${decision.sessionId}`);
  const playerRef = db.doc(`sessions/${decision.sessionId}/players/${uid}`);
  const receiptRef = commandReceiptRef(decision.sessionId, decision.requestId);
  const eventRef = db.doc(`sessions/${decision.sessionId}/events/player-fled-${decision.requestId}`);
  const fingerprint = vesselActionFingerprint(
    'flee-destroyed-ship', decision.sessionId, decision.requestId, uid, null,
    decision.expectedSetupRevision, {},
  );
  return db.runTransaction(async (tx): Promise<EscapeMutationResult> => {
    const [session, player, receipt] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(receiptRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player) || player.get('role') !== 'player') {
      throw new HttpsError('permission-denied', 'Only the affected player may flee the destroyed ship.');
    }
    await rejectForeignLegacyM1Command(
      tx, decision.sessionId, decision.requestId, 'escape transition', [],
    );
    const replay = replayBoundCommand(
      receipt,
      fingerprint,
      (value): value is EscapeMutationResult => isEscapeMutationResult(value, decision.sessionId),
      'escape transition',
    );
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const currentState = playerEscapeState(player);
    if (!currentState) {
      throw commandError('failed-precondition', 'This player has no destroyed-ship escape to resolve.', 'conflict');
    }
    if (currentState.status === 'fled') {
      throw commandError('failed-precondition', 'This player already fled the destroyed ship.', 'conflict');
    }
    const destroyed = shipDamage(session.get('shipDamage'))[currentState.shipId]?.destroyed === true;
    if (!destroyed) {
      throw commandError(
        'failed-precondition',
        'The destroyed-ship escape is no longer current; refresh the live session.',
        'stale-revision',
      );
    }
    const currentSetupRevision = setupRevision(session);
    if (currentSetupRevision !== decision.expectedSetupRevision) {
      const stale: EscapeMutationResult = {
        status: 'stale', sessionId: decision.sessionId, requestId: decision.requestId,
        targetUid: uid, shipId: currentState.shipId, setupRevision: currentSetupRevision,
      };
      tx.set(receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const storedSeatId = player.get('seatId');
    const seatRef = typeof storedSeatId === 'string' && storedSeatId.length > 0
      ? db.doc(`sessions/${decision.sessionId}/seats/${storedSeatId}`) : undefined;
    const seat = seatRef ? await tx.get(seatRef) : undefined;
    if (seatRef && (!seat?.exists || seat.get('status') !== 'claimed' || seat.get('holderUid') !== uid)) {
      throw commandError(
        'failed-precondition',
        'The player station pointer is stale; refresh before fleeing the destroyed ship.',
        'unavailable-service',
      );
    }
    const nextSetupRevision = currentSetupRevision + 1;
    const nextState = fleePlayerEscapeState(currentState, decision.requestId);
    const result: EscapeMutationResult = {
      status: 'committed', sessionId: decision.sessionId, requestId: decision.requestId,
      targetUid: uid, shipId: currentState.shipId, setupRevision: nextSetupRevision,
      escapeState: nextState,
    };
    if (seatRef) tx.update(seatRef, { status: 'open', holderUid: null, claimedAt: null });
    tx.update(playerRef, {
      escapeState: nextState,
      activeConsoleRoleId: null,
      seatId: null,
    });
    tx.update(sessionRef, { setupRevision: nextSetupRevision, updatedAt: FieldValue.serverTimestamp() });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'player-fled-destroyed-ship',
      payload: { actorUid: uid, shipId: currentState.shipId, requestId: decision.requestId },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/** Renew the short server-side lease that distinguishes live devices from ghosts. */
export const refreshPresence = onCall<{
  sessionId?: string; activeConsoleRoleId?: string | null; instanceId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId, instanceId, activeConsoleRoleId } = requirePresenceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const instanceRef = instanceId
    ? db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`)
    : undefined;
  const membershipRef = db.doc(`activeMemberships/${uid}`);
  const pressHoldersRef = db.collection(`sessions/${sessionId}/players`)
    .where('activeConsoleRoleId', '==', 'press-officer');
  const playersRef = db.collection(`sessions/${sessionId}/players`);
  const secretsRef = db.collection(`sessions/${sessionId}/secrets`);
  const wolfSecretRef = db.doc(`sessions/${sessionId}/secrets/wolf-assignment`);
  const censusRef = db.doc(`sessions/${sessionId}/loyaltyCensus/current`);
  const reconciliationRef = presenceReconciliationRef(sessionId, uid);
  await db.runTransaction(async (tx) => {
    const requestedRoleId = activeConsoleRoleId ?? null;
    const roleHolders = requestedRoleId
      ? db.collection(`sessions/${sessionId}/players`)
        .where('activeConsoleRoleId', '==', requestedRoleId)
      : null;
    const [player, session, instance, reconciliation] = await Promise.all([
      tx.get(playerRef),
      tx.get(sessionRef),
      instanceRef ? tx.get(instanceRef) : null,
      tx.get(reconciliationRef),
    ]);
    if (!isActivePlayer(player)) {
      throw new HttpsError('permission-denied', 'Reconnect to the session first.');
    }
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (instanceId && (!instance || !isLiveGmInstance(instance, player, uid))) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    const lastFullReconciliationAt = toTimestampMillis(
      reconciliation.get('lastFullReconciliationAt'),
    );
    const cheapHeartbeat = activeConsoleRoleId === undefined &&
      lastFullReconciliationAt !== undefined &&
      Date.now() - lastFullReconciliationAt < PRESENCE_RECONCILIATION_INTERVAL_MS;
    if (cheapHeartbeat) {
      ensureFleetTickerBaseline(tx, sessionRef, session, new Date().toISOString());
      tx.update(playerRef, { lastSeenAt: FieldValue.serverTimestamp() });
      if (instanceId && instanceRef) {
        tx.update(instanceRef, {
          connected: true,
          lastSeenAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(membershipRef, { sessionId, connectedAt: FieldValue.serverTimestamp() });
      return;
    }
    const [holders, pressHolders, wolfSecret, players, secrets, census] = await Promise.all([
      roleHolders ? tx.get(roleHolders) : null,
      tx.get(pressHoldersRef),
      tx.get(wolfSecretRef),
      tx.get(playersRef),
      tx.get(secretsRef),
      tx.get(censusRef),
    ]);
    ensureFleetTickerBaseline(tx, sessionRef, session, new Date().toISOString());
    const presenceUpdate: Record<string, unknown> = {
      lastSeenAt: FieldValue.serverTimestamp(),
    };
    const removedLoyaltyUids = new Set<string>();
    let pressHolderUidUpdate: string | null | undefined;
    const otherActivePressHolders = pressHolders.docs.filter((holder) =>
      holder.id !== uid && isAuthoritativePressHolder(holder));
    const currentPressAuthority = player.get('activeConsoleRoleId') === 'press-officer';
    const invalidCurrentPressAuthority = currentPressAuthority && (
      session.get('pressEnabled') === false || player.get('role') !== 'player' ||
      hasCoreAssignment(player) || otherActivePressHolders.length > 0
    );
    const explicitRelease = activeConsoleRoleId === null;
    const orphanedPressAssignment = player.get('assignedRoleId') === 'press-officer' &&
      !currentPressAuthority;
    if (explicitRelease || invalidCurrentPressAuthority || orphanedPressAssignment) {
      Object.assign(presenceUpdate, releasedPressFields(player));
      if (hasPressState(player)) {
        if (clearPressPrivateState(
          tx,
          sessionId,
          player,
          wolfSecretRef,
          wolfSecret,
          otherActivePressHolders.length === 0,
        )) removedLoyaltyUids.add(player.id);
        const storedPressHolderUid = session.get('pressHolderUid');
        pressHolderUidUpdate = otherActivePressHolders[0]?.id ??
          (typeof storedPressHolderUid === 'string' && storedPressHolderUid !== uid
            ? storedPressHolderUid
            : null);
      }
    } else if (currentPressAuthority && player.get('assignedRoleId') === 'press-officer') {
      presenceUpdate.assignedRoleId = null;
      pressHolderUidUpdate = uid;
    }
    else if (typeof activeConsoleRoleId === 'string') {
      const requestedRoleId = activeConsoleRoleId;
      if (player.get('role') === 'player' && playerEscapeState(player)) {
        throw commandError(
          'failed-precondition',
          'Flee the destroyed ship before selecting another console.',
          'conflict',
        );
      }
      if (typeof player.get('replacementRoleId') === 'string') {
        throw commandError(
          'failed-precondition',
          'The historical printed role is no longer available after replacement.',
          'conflict',
        );
      }
      const isPressRequest = requestedRoleId === 'press-officer';
      if (isPressRequest && session.get('pressEnabled') === false) {
        throw commandError('failed-precondition', 'Press is disabled.', 'unauthorized');
      }
      if (isPressRequest && player.get('role') !== 'player') {
        throw new HttpsError('permission-denied', 'Press is a player station.');
      }
      const assignedRoleId = player.get('assignedRoleId');
      if (
        isPressRequest &&
        assignedRoleId !== null &&
        assignedRoleId !== undefined &&
        assignedRoleId !== ''
      ) {
        throw commandError(
          'failed-precondition',
          'Release your core role before selecting Press.',
          'conflict',
        );
      }
      const configuredRoleIdsForSelection = configuredRoleIds(session);
      if (
        (!isPressRequest && !configuredRoleIdsForSelection.includes(requestedRoleId)) ||
        (!isPressRequest && isJointEngineeringRoleId(requestedRoleId) &&
          !isJointEngineeringRoleAvailable(configuredRoleIdsForSelection, requestedRoleId))
      ) {
        throw commandError('failed-precondition', 'That console role is not active.', 'conflict');
      }
      const heldByAnotherPlayer = holders?.docs.some(
        (holder) => holder.id !== uid && (
          isPressRequest ? isAuthoritativePressHolder(holder) : isActivePlayer(holder)
        ),
      ) ?? false;
      if (!canSelectConsoleRole(
        player.get('activeConsoleRoleId') as string | null | undefined,
        requestedRoleId,
        player.get('role') === 'gm',
        heldByAnotherPlayer,
      )) {
        if (heldByAnotherPlayer) {
          throw new HttpsError('already-exists', 'That console role is already taken.');
        }
        throw commandError(
          'failed-precondition',
          'Release your current role in settings before selecting another.',
          'conflict',
        );
      }
      if (isPressRequest) {
        for (const holder of pressHolders.docs) {
          if (holder.id === uid || isAuthoritativePressHolder(holder)) continue;
          tx.update(holder.ref, releasedPressFields(holder));
          if (clearPressPrivateState(tx, sessionId, holder, wolfSecretRef, wolfSecret, false)) {
            removedLoyaltyUids.add(holder.id);
          }
        }
        if (player.get('assignedRoleId') === 'press-officer') {
          presenceUpdate.assignedRoleId = null;
        }
        pressHolderUidUpdate = uid;
      }
      presenceUpdate.activeConsoleRoleId = requestedRoleId;
    }
    if (
      currentPressAuthority && !invalidCurrentPressAuthority &&
      activeConsoleRoleId !== null
    ) {
      pressHolderUidUpdate = uid;
    }
    if (removedLoyaltyUids.size > 0) {
      setLoyaltyCensusFromSecrets(
        tx,
        sessionId,
        setupRevision(session),
        secrets.docs ?? [],
        players.docs,
        configuredRoleIds(session),
        new Map([...removedLoyaltyUids].map((removedUid) => [removedUid, null])),
        census,
      );
    }
    tx.update(playerRef, presenceUpdate);
    if (instanceId && instanceRef) {
      tx.update(instanceRef, {
        connected: true,
        lastSeenAt: FieldValue.serverTimestamp(),
      });
    }
    if (pressHolderUidUpdate !== undefined) {
      tx.update(sessionRef, {
        pressHolderUid: pressHolderUidUpdate,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(membershipRef, { sessionId, connectedAt: FieldValue.serverTimestamp() });
    tx.set(reconciliationRef, {
      lastFullReconciliationAt: presenceReconciliationTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { sessionId };
});

/** Mark this identity disconnected and start retention on a transition to empty. */
export const disconnectFromSession = onCall<{
  sessionId?: string;
  instanceId?: string;
  connectionGeneration?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId, instanceId, connectionGeneration } = requireDisconnectRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const membershipRef = db.doc(`activeMemberships/${uid}`);
  const players = db.collection(`sessions/${sessionId}/players`);
  const allPlayers = db.collection(`sessions/${sessionId}/players`);
  const secretsRef = db.collection(`sessions/${sessionId}/secrets`);
  const gmInstances = db.collection(`sessions/${sessionId}/gmInstances`);
  const wolfSecretRef = db.doc(`sessions/${sessionId}/secrets/wolf-assignment`);
  const censusRef = db.doc(`sessions/${sessionId}/loyaltyCensus/current`);

  await db.runTransaction(async (tx) => {
    const [sessionDoc, player, membership, connected, ownedInstances, wolfSecret, playerSnapshot, secrets, census, attackState] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(membershipRef),
      tx.get(players.where('connected', '==', true)),
      tx.get(gmInstances.where('uid', '==', uid)),
      tx.get(wolfSecretRef),
      tx.get(allPlayers),
      tx.get(secretsRef),
      tx.get(censusRef),
      tx.get(db.doc(`sessions/${sessionId}/wolfAttackState/current`)),
    ]);
    if (!sessionDoc.exists || !player.exists) {
      throw new HttpsError('permission-denied', 'You are no longer in that session.');
    }
    const storedConnectionGeneration = player.get('connectionGeneration');
    // Every current client captures the generation that authorized its
    // disconnect. Legacy requests without one fail closed, so a delayed old
    // outbox item cannot clean up a player who has since rejoined this table.
    if (connectionGeneration === undefined ||
        storedConnectionGeneration !== connectionGeneration) return;
    const ownsRequestedInstance = instanceId !== undefined && ownedInstances.docs.some((instance) =>
      instance.id === instanceId && instance.get('uid') === uid);
    const liveSibling = instanceId !== undefined && ownedInstances.docs.some((instance) =>
      instance.id !== instanceId && isLiveGmInstance(instance, player, uid));
    if (instanceId !== undefined && liveSibling) {
      if (ownsRequestedInstance) {
        tx.delete(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`));
        tx.delete(gmShipConsoleWriteGrantRef(sessionId, instanceId));
      }
      return;
    }
    // A legacy GM client may still omit its browser ID. If more than one live
    // browser exists, that ambiguous request cannot safely disconnect the
    // player or delete the sibling claims; the exact-ID client path above will
    // retire only the requesting browser.
    const liveInstances = ownedInstances.docs.filter((instance) =>
      isLiveGmInstance(instance, player, uid));
    if (instanceId === undefined && player.get('role') === 'gm' && liveInstances.length > 1) {
      return;
    }
    const wasConnected = player.get('connected') === true;
    tx.update(playerRef, {
      connected: false,
      ...disconnectedRoleState(),
      ...(hasPressState(player) ? releasedPressFields(player) : {}),
      lastSeenAt: FieldValue.serverTimestamp(),
    });
    if (hasPressState(player)) {
      const anotherPressHolder = connected.docs.some((candidate) =>
        candidate.id !== uid && isAuthoritativePressHolder(candidate));
      const removedLoyalty = clearPressPrivateState(
        tx, sessionId, player, wolfSecretRef, wolfSecret, !anotherPressHolder,
      );
      if (removedLoyalty) {
        setLoyaltyCensusFromSecrets(
          tx,
          sessionId,
          setupRevision(sessionDoc),
          secrets.docs ?? [],
          playerSnapshot.docs,
          configuredRoleIds(sessionDoc),
          new Map([[uid, null]]),
          census,
        );
      }
      if (sessionDoc.get('pressHolderUid') === uid || sessionDoc.get('pressHolderUid') === undefined) {
        const successor = connected.docs.find((candidate) =>
          candidate.id !== uid && isAuthoritativePressHolder(candidate));
        tx.update(sessionRef, {
          pressHolderUid: successor?.id ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    for (const instance of ownedInstances.docs) {
      tx.delete(instance.ref);
      tx.delete(gmShipConsoleWriteGrantRef(sessionId, instance.id));
    }
    if (membership.exists && membership.get('sessionId') === sessionId) {
      tx.delete(membershipRef);
    }
    if (wasConnected && connected.size === 1) {
      reconcilePresenceTimer(tx, sessionRef, sessionDoc, attackState, false);
      tx.update(sessionRef, {
        deleteAfter: Timestamp.fromDate(deletionDeadline(new Date())),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { sessionId };
});

/** Delete sessions whose last-player retention window has elapsed. */
export const deleteInactiveSessions = onSchedule('0 * * * *', async () => {
  const expired = await db.collection('sessions')
    .where('deleteAfter', '<=', Timestamp.now())
    .get();
  for (const session of expired.docs) {
    const joinCode = session.get('joinCode') as string | undefined;
    const claimed = await db.runTransaction(async (tx) => {
      const current = await tx.get(session.ref);
      if (!current.exists || current.get('deletingAt')) return false;
      const deadline = current.get('deleteAfter') as Timestamp | null | undefined;
      if (!deadline || deadline.toMillis() > Date.now()) return false;
      const connected = await tx.get(
        session.ref.collection('players').where('connected', '==', true),
      );
      if (!connected.empty) return false;
      tx.update(session.ref, { deletingAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) continue;
    await db.recursiveDelete(session.ref);
    if (joinCode) await db.doc(`joinCodes/${joinCode}`).delete();
  }
});

/** Expire devices that vanished without getting a chance to disconnect cleanly. */
export const expireStalePlayers = onSchedule('* * * * *', async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - PRESENCE_LEASE_MS);

  // GM leases are browser-scoped. A shared player heartbeat must never keep a
  // vanished sibling instance alive, so expire those records independently
  // before applying the player-level cleanup below.
  const staleGmCandidates = await db.collectionGroup('gmInstances')
    .where('connected', '==', true)
    .get();
  for (const candidate of staleGmCandidates.docs) {
    const sessionId = candidate.get('sessionId');
    const uid = candidate.get('uid');
    if (typeof sessionId !== 'string' || typeof uid !== 'string') continue;
    const instanceRef = db.doc(`sessions/${sessionId}/gmInstances/${candidate.id}`);
    const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
    const instances = db.collection(`sessions/${sessionId}/gmInstances`);
    await db.runTransaction(async (tx) => {
      const [instance, player, ownedInstances] = await Promise.all([
        tx.get(instanceRef),
        tx.get(playerRef),
        tx.get(instances.where('uid', '==', uid)),
      ]);
      if (
        !instance.exists || instance.get('uid') !== uid || instance.get('connected') !== true ||
        isLiveGmInstance(instance, player, uid)
      ) return;
      tx.delete(instanceRef);
      tx.delete(gmShipConsoleWriteGrantRef(sessionId, instance.id));
      const liveSibling = ownedInstances.docs.some((sibling) =>
        sibling.id !== instance.id && isLiveGmInstance(sibling, player, uid));
      if (!liveSibling && isActivePlayer(player) && player.get('role') === 'gm') {
        tx.update(playerRef, { role: 'player' });
      }
    });
  }

  const stale = await db.collectionGroup('players')
    .where('connected', '==', true)
    .where('lastSeenAt', '<=', cutoff)
    .get();

  for (const candidate of stale.docs) {
    const sessionId = candidate.get('sessionId') as string;
    const uid = candidate.id;
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
    const membershipRef = db.doc(`activeMemberships/${uid}`);
    const players = db.collection(`sessions/${sessionId}/players`);
    const allPlayers = db.collection(`sessions/${sessionId}/players`);
    const secretsRef = db.collection(`sessions/${sessionId}/secrets`);
    const gmInstances = db.collection(`sessions/${sessionId}/gmInstances`);
    const wolfSecretRef = db.doc(`sessions/${sessionId}/secrets/wolf-assignment`);
    const censusRef = db.doc(`sessions/${sessionId}/loyaltyCensus/current`);
    await db.runTransaction(async (tx) => {
      const [session, player, membership, connected, ownedInstances, wolfSecret, playerSnapshot, secrets, census, attackState] = await Promise.all([
        tx.get(sessionRef),
        tx.get(playerRef),
        tx.get(membershipRef),
        tx.get(players.where('connected', '==', true)),
        tx.get(gmInstances.where('uid', '==', uid)),
        tx.get(wolfSecretRef),
        tx.get(allPlayers),
        tx.get(secretsRef),
        tx.get(censusRef),
        tx.get(db.doc(`sessions/${sessionId}/wolfAttackState/current`)),
      ]);
      const lastSeenAt = player.get('lastSeenAt') as Timestamp | undefined;
      if (
        !session.exists || !isConnectedPlayer(player) || !lastSeenAt ||
        lastSeenAt.toMillis() > cutoff.toMillis()
      ) return;
      const storedSeatId = player.get('seatId');
      const seatRef = typeof storedSeatId === 'string' && storedSeatId.length > 0
        ? db.doc('sessions/' + sessionId + '/seats/' + storedSeatId)
        : null;
      const seat = seatRef ? await tx.get(seatRef) : null;
      tx.update(playerRef, {
        connected: false,
        ...disconnectedRoleState(),
        ...(hasPressState(player) ? releasedPressFields(player) : {}),
        lastSeenAt: FieldValue.serverTimestamp(),
      });
      if (hasPressState(player)) {
        const anotherPressHolder = connected.docs.some((connectedPlayer) =>
          connectedPlayer.id !== uid && isAuthoritativePressHolder(connectedPlayer));
        const removedLoyalty = clearPressPrivateState(
          tx, sessionId, player, wolfSecretRef, wolfSecret, !anotherPressHolder,
        );
        if (removedLoyalty) {
          setLoyaltyCensusFromSecrets(
            tx,
            sessionId,
            setupRevision(session),
            secrets.docs ?? [],
            playerSnapshot.docs,
            configuredRoleIds(session),
            new Map([[uid, null]]),
            census,
          );
        }
        if (session.get('pressHolderUid') === uid || session.get('pressHolderUid') === undefined) {
          const successor = connected.docs.find((connectedPlayer) =>
            connectedPlayer.id !== uid && isAuthoritativePressHolder(connectedPlayer));
          tx.update(sessionRef, {
            pressHolderUid: successor?.id ?? null,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
      if (
        seatRef &&
        seat?.exists &&
        seat.get('status') === 'claimed' &&
        seat.get('holderUid') === uid
      ) {
        tx.update(seatRef, { status: 'open', holderUid: null, claimedAt: null });
      }
      for (const instance of ownedInstances.docs) {
        tx.delete(instance.ref);
        tx.delete(gmShipConsoleWriteGrantRef(sessionId, instance.id));
      }
      if (membership.exists && membership.get('sessionId') === sessionId) {
        tx.delete(membershipRef);
      }
      if (connected.size === 1) {
        reconcilePresenceTimer(tx, sessionRef, session, attackState, false);
        tx.update(sessionRef, {
          deleteAfter: Timestamp.fromDate(deletionDeadline(new Date())),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  }
});

type StaleAuthorityReceipt = {
  readonly status: 'stale';
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly currentRevision: number;
  readonly entity: 'setup' | 'facilitator' | 'seat';
  readonly seatId?: string;
};

type SeatMutationReceipt = {
  readonly status: 'committed' | 'replayed';
  readonly requestId: string;
  readonly setupRevision: number;
  readonly seatId: string;
  readonly holderUid?: string;
} | StaleAuthorityReceipt;

type SeatMutationFingerprint = {
  readonly action: 'claim' | 'release';
  readonly sessionId: string;
  readonly seatId: string;
  readonly actorUid: string;
  readonly expectedSetupRevision: number;
  readonly instanceId: string | null;
  readonly reason: string | null;
};

function seatMutationFingerprint(
  action: SeatMutationFingerprint['action'],
  parsed: ReturnType<typeof requireSessionSeatRequest>,
  actorUid: string,
): SeatMutationFingerprint {
  return {
    action,
    sessionId: parsed.sessionId,
    seatId: parsed.seatId,
    actorUid,
    expectedSetupRevision: parsed.expectedSetupRevision,
    instanceId: parsed.instanceId ?? null,
    reason: parsed.reason ?? null,
  };
}

function sameSeatMutationFingerprint(value: unknown, expected: SeatMutationFingerprint): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Object.entries(expected).every(([key, item]) => candidate[key] === item);
}

/** Claim an open seat. First transaction wins; losers get a clean error. */
export const claimSeat = onCall<{
  sessionId: string;
  seatId: string;
  requestId: string;
  expectedSetupRevision: number;
}>(
  async (request) => {
    const uid = requireUid(request.auth);
    const parsed = requireSessionSeatRequest(request.data ?? {});
    const { sessionId, seatId } = parsed;
    const revisioned = parsed;

    const seatRef = db.doc(`sessions/${sessionId}/seats/${seatId}`);
    const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);

    const sessionRef = db.doc(`sessions/${sessionId}`);
    const requestRef = db.doc(`sessions/${sessionId}/seatMutationRequests/${revisioned.requestId}`);
    const markerRef = commandReceiptRef(sessionId, revisioned.requestId);
    const eventRef = db.doc(`sessions/${sessionId}/events/seat-claim-${revisioned.requestId}`);
    const fingerprint = seatMutationFingerprint('claim', parsed, uid);
    const markerFingerprint: CommandFingerprint = {
      action: 'claim-seat',
      sessionId,
      requestId: revisioned.requestId,
      actorUid: uid,
      instanceId: null,
      expectedRevision: revisioned.expectedSetupRevision,
      payload: { seatId },
    };
    return db.runTransaction(async (tx): Promise<SeatMutationReceipt> => {
        const [prior, marker, session, seat, player, legacyEvent] = await Promise.all([
          tx.get(requestRef), tx.get(markerRef), tx.get(sessionRef), tx.get(seatRef), tx.get(playerRef),
          tx.get(eventRef),
        ]);
        if (!session.exists) throw new HttpsError('not-found', 'No such session.');
        if (!isActivePlayer(player)) {
          throw new HttpsError('permission-denied', 'Join the session first.');
        }
        if (player.get('role') === 'player' && playerEscapeState(player)) {
          throw commandError(
            'failed-precondition',
            'Flee the destroyed ship before claiming another station.',
            'conflict',
          );
        }
        if (player.get('role') === 'gm') {
          throw new HttpsError('permission-denied', 'GMs cannot claim core seats.');
        }
        await rejectForeignLegacyM1Command(
          tx, sessionId, revisioned.requestId, 'seat claim', [requestRef.path, eventRef.path],
        );
        if (hasCompatibleCommandMarker(marker, markerFingerprint, 'seat') && !prior.exists) {
          throw commandError('failed-precondition', 'This seat request has a marker without a replayable receipt.', 'conflict');
        }
        if (!prior.exists && legacyEvent.exists) rejectLegacyEventReplay('seat claim');
        if (prior.exists) {
          if (
            prior.get('action') !== 'claim' ||
            prior.get('sessionId') !== sessionId ||
            prior.get('seatId') !== seatId ||
            prior.get('actorUid') !== uid ||
            !sameSeatMutationFingerprint(prior.get('fingerprint'), fingerprint)
          ) {
            throw commandError('failed-precondition', 'This request id belongs to a different seat command.', 'conflict');
          }
          const reply = prior.get('reply');
          if (typeof reply !== 'object' || reply === null) {
          throw commandError('failed-precondition', 'This seat request has no replayable result.', 'conflict');
          }
          if (reply.status === 'stale') return reply as SeatMutationReceipt;
          const committedReply = reply as Omit<Extract<SeatMutationReceipt, { status: 'committed' | 'replayed' }>, 'status'>;
          return { ...committedReply, status: 'replayed' };
        }
        requireCastingWindow(session);
        if (!canClaimSeat(player.get('seatId'))) {
          throw commandError('failed-precondition', 'Release your current seat before claiming another.', 'conflict');
        }
        if (setupRevision(session) !== revisioned.expectedSetupRevision) {
          const reply = {
            status: 'stale',
            requestId: revisioned.requestId,
            entity: 'seat',
            seatId,
            expectedRevision: revisioned.expectedSetupRevision,
            currentRevision: setupRevision(session),
          } satisfies StaleAuthorityReceipt;
          tx.set(requestRef, {
            requestId: revisioned.requestId, action: 'claim', sessionId, seatId, actorUid: uid,
            fingerprint, reply, createdAt: FieldValue.serverTimestamp(),
          });
          tx.set(markerRef, { fingerprint: markerFingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
          return reply;
        }
        const configuredRoles = session.get('activeRoleIds');
        if (!Array.isArray(configuredRoles) || !configuredRoles.includes(seatId)) {
          throw commandError('failed-precondition', 'That seat is not part of the active roster.', 'conflict');
        }
        if (!seat.exists) throw new HttpsError('not-found', 'No such seat.');
        if (seat.get('roleId') !== seatId) {
          throw commandError('failed-precondition', 'That seat record does not match its stable role id.', 'unavailable-service');
        }
        if (seatId === 'press-officer' || seat.get('roleId') === 'press-officer') {
          throw commandError('failed-precondition', 'Press is optional and cannot be claimed as a core seat.', 'malformed-input');
        }
        if (seat.get('status') !== 'open' || seat.get('holderUid') !== null) {
          throw new HttpsError('aborted', 'That seat was just taken.');
        }
        const assignedRoleId = player.get('assignedRoleId');
        if (typeof assignedRoleId === 'string' && assignedRoleId !== seatId) {
          throw commandError('failed-precondition', 'Your assigned role does not match that seat.', 'conflict');
        }

        const nextRevision = revisioned.expectedSetupRevision + 1;
        const reply: SeatMutationReceipt = {
          status: 'committed',
          requestId: revisioned.requestId,
          setupRevision: nextRevision,
          seatId,
          holderUid: uid,
        };
        tx.update(seatRef, {
          status: 'claimed', holderUid: uid, claimedAt: FieldValue.serverTimestamp(),
        });
        tx.update(playerRef, { seatId });
        tx.update(sessionRef, { setupRevision: nextRevision, updatedAt: FieldValue.serverTimestamp() });
        tx.set(eventRef, buildPrivacySafeEventRecord({
          type: 'seat-claim',
          payload: {
            seatId, actorUid: uid, revision: nextRevision,
            requestId: revisioned.requestId, expectedSetupRevision: revisioned.expectedSetupRevision,
          },
          createdAt: FieldValue.serverTimestamp(),
        }));
        tx.set(requestRef, {
          requestId: revisioned.requestId, action: 'claim', sessionId, seatId, actorUid: uid,
          fingerprint, reply, createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(markerRef, { fingerprint: markerFingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
        return reply;
    });
  },
);

/** Release a seat you hold, or -- as GM -- any seat. */
export const releaseSeat = onCall<{
  sessionId: string;
  seatId: string;
  requestId: string;
  expectedSetupRevision: number;
  instanceId?: string;
  reason?: string;
}>(
  async (request) => {
    const uid = requireUid(request.auth);
    const parsed = requireSessionSeatRequest(request.data ?? {});
    const { sessionId, seatId } = parsed;
    const revisioned = parsed;

    const seatRef = db.doc(`sessions/${sessionId}/seats/${seatId}`);
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const requestRef = db.doc(`sessions/${sessionId}/seatMutationRequests/${revisioned.requestId}`);
    const markerRef = commandReceiptRef(sessionId, revisioned.requestId);
    const eventRef = db.doc(`sessions/${sessionId}/events/seat-release-${revisioned.requestId}`);
    const fingerprint = seatMutationFingerprint('release', parsed, uid);
    const markerFingerprint: CommandFingerprint = {
      action: 'release-seat',
      sessionId,
      requestId: revisioned.requestId,
      actorUid: uid,
      instanceId: revisioned.instanceId ?? null,
      expectedRevision: revisioned.expectedSetupRevision,
      payload: { seatId, reason: revisioned.reason ?? null },
    };
    return db.runTransaction(async (tx): Promise<SeatMutationReceipt> => {
        const actorRef = db.doc(`sessions/${sessionId}/players/${uid}`);
        const [prior, marker, session, seat, actor, legacyEvent] = await Promise.all([
          tx.get(requestRef), tx.get(markerRef), tx.get(sessionRef), tx.get(seatRef), tx.get(actorRef),
          tx.get(eventRef),
        ]);
        if (!session.exists) throw new HttpsError('not-found', 'No such session.');
        if (!isActivePlayer(actor)) throw new HttpsError('permission-denied', 'Join the session first.');
        let gmInstance: FirebaseFirestore.DocumentSnapshot | null = null;
        if (revisioned.instanceId || revisioned.reason) {
          if (actor.get('role') !== 'gm' || !revisioned.instanceId || !revisioned.reason) {
            throw new HttpsError('permission-denied', 'A live GM instance and release reason are required.');
          }
          gmInstance = (await requireFacilitatorInstance(
            tx, sessionId, uid, revisioned.instanceId,
          )).instance;
        }
        await rejectForeignLegacyM1Command(
          tx, sessionId, revisioned.requestId, 'seat release', [requestRef.path, eventRef.path],
        );
        if (hasCompatibleCommandMarker(marker, markerFingerprint, 'seat') && !prior.exists) {
          throw commandError('failed-precondition', 'This seat request has a marker without a replayable receipt.', 'conflict');
        }
        if (!prior.exists && legacyEvent.exists) rejectLegacyEventReplay('seat release');
        if (prior.exists) {
          if (
            prior.get('action') !== 'release' ||
            prior.get('sessionId') !== sessionId ||
            prior.get('seatId') !== seatId ||
            prior.get('actorUid') !== uid ||
            !sameSeatMutationFingerprint(prior.get('fingerprint'), fingerprint)
          ) {
            throw commandError('failed-precondition', 'This request id belongs to a different seat command.', 'conflict');
          }
          const reply = prior.get('reply');
          if (typeof reply !== 'object' || reply === null) {
          throw commandError('failed-precondition', 'This seat request has no replayable result.', 'conflict');
          }
          if (reply.status === 'stale') return reply as SeatMutationReceipt;
          const committedReply = reply as Omit<Extract<SeatMutationReceipt, { status: 'committed' | 'replayed' }>, 'status'>;
          return { ...committedReply, status: 'replayed' };
        }
        requireCastingWindow(session);
        if (!seat.exists) throw new HttpsError('not-found', 'No such seat.');

        const configuredRoles = session.get('activeRoleIds');
        if (!Array.isArray(configuredRoles) || !configuredRoles.includes(seatId)) {
          throw commandError('failed-precondition', 'That seat is not part of the active roster.', 'conflict');
        }
        if (seat.get('roleId') !== seatId) {
          throw commandError('failed-precondition', 'That seat record does not match its stable role id.', 'unavailable-service');
        }
        if (seatId === 'press-officer' || seat.get('roleId') === 'press-officer') {
          throw commandError('failed-precondition', 'Press is optional and cannot be released as a core seat.', 'malformed-input');
        }
        if (seat.get('status') !== 'claimed' || typeof seat.get('holderUid') !== 'string') {
          throw commandError('failed-precondition', 'That seat is not currently claimed.', 'conflict');
        }

        const holderUid = seat.get('holderUid') as string;
        // Establish actor authority before reading the holder record. An ordinary
        // non-holder must not learn whether another player's seat pointer is stale.
        if (holderUid !== uid) {
          if (actor.get('role') !== 'gm' || !revisioned.instanceId || !revisioned.reason) {
            throw new HttpsError('permission-denied', 'A live GM instance and release reason are required.');
          }
          if (!gmInstance) {
            gmInstance = (await requireFacilitatorInstance(
              tx, sessionId, uid, revisioned.instanceId,
            )).instance;
          }
        }
        if (setupRevision(session) !== revisioned.expectedSetupRevision) {
          const reply = {
            status: 'stale',
            requestId: revisioned.requestId,
            entity: 'seat',
            seatId,
            expectedRevision: revisioned.expectedSetupRevision,
            currentRevision: setupRevision(session),
          } satisfies StaleAuthorityReceipt;
          tx.set(requestRef, {
            requestId: revisioned.requestId, action: 'release', sessionId, seatId, actorUid: uid,
            reason: revisioned.reason ?? null,
            fingerprint, reply, createdAt: FieldValue.serverTimestamp(),
          });
          tx.set(markerRef, { fingerprint: markerFingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
          return reply;
        }
        const holderRef = db.doc(`sessions/${sessionId}/players/${holderUid}`);
        const holder = await tx.get(holderRef);
        const staleHolder = !holder.exists || !isActivePlayer(holder) || holder.get('seatId') !== seatId;
        if (staleHolder && !gmInstance) {
          if (actor.get('role') !== 'gm' || !revisioned.instanceId || !revisioned.reason) {
            throw commandError('failed-precondition', 'The claimed holder and seat pointer do not agree.', 'unavailable-service');
          }
          gmInstance = (await requireFacilitatorInstance(
            tx, sessionId, uid, revisioned.instanceId,
          )).instance;
        }
        const nextRevision = revisioned.expectedSetupRevision + 1;
        const reply: SeatMutationReceipt = {
          status: 'committed', requestId: revisioned.requestId,
          setupRevision: nextRevision, seatId,
        };
        tx.update(seatRef, { status: 'open', holderUid: null, claimedAt: null });
        if (!staleHolder && shouldClearSeatPointer(holder.get('seatId'), seatId)) {
          tx.update(holderRef, { seatId: null });
        }
        tx.update(sessionRef, { setupRevision: nextRevision, updatedAt: FieldValue.serverTimestamp() });
        tx.set(eventRef, buildPrivacySafeEventRecord({
          type: 'seat-release',
          payload: {
            seatId, actorUid: uid, revision: nextRevision,
            requestId: revisioned.requestId, reason: revisioned.reason ?? null,
            expectedSetupRevision: revisioned.expectedSetupRevision,
          },
          createdAt: FieldValue.serverTimestamp(),
        }));
        tx.set(requestRef, {
          requestId: revisioned.requestId, action: 'release', sessionId, seatId, actorUid: uid,
          reason: revisioned.reason ?? null,
          fingerprint, reply, createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(markerRef, { fingerprint: markerFingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
        return reply;
    });
  },
);

/** Elevate a player to GM. Only an existing GM (or the session owner) may. */
export const elevateToGm = onCall<{ sessionId: string; targetUid: string; instanceId?: string }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const { sessionId, targetUid, instanceId } = requireElevationRequest(request.data ?? {});
    const sessionRef = db.doc('sessions/' + sessionId);
    const callerRef = db.doc('sessions/' + sessionId + '/players/' + uid);
    const targetRef = db.doc('sessions/' + sessionId + '/players/' + targetUid);
    const callerInstanceRef = instanceId
      ? db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`)
      : undefined;

    return db.runTransaction(async (tx) => {
      const [sessionSnap, caller, target] = await Promise.all([
        tx.get(sessionRef),
        tx.get(callerRef),
        tx.get(targetRef),
      ]);
      if (!sessionSnap.exists) throw new HttpsError('not-found', 'No such session.');
      if (!isActivePlayer(caller)) {
        throw new HttpsError('permission-denied', 'Join the session first.');
      }
      const owner = sessionSnap.get('ownerUid') === uid;
      if (!owner && caller.get('role') !== 'gm') {
        throw new HttpsError('permission-denied', 'GM only.');
      }
      if (!owner && (!callerInstanceRef ||
        !isLiveGmInstance(await tx.get(callerInstanceRef), caller, uid))) {
        throw new HttpsError('permission-denied', 'Active GM instance required.');
      }
      if (!isActivePlayer(target)) {
        throw commandError('failed-precondition', 'That player is not connected.', 'conflict');
      }
      if (
        hasCoreSeat(target) || hasCoreAssignment(target) || hasPressState(target) ||
        sessionSnap.get('pressHolderUid') === targetUid
      ) {
        throw commandError('failed-precondition', 'Release the target station before elevating to GM.', 'conflict');
      }
      tx.update(targetRef, { role: 'gm' });
      return { targetUid, role: 'gm' };
    });
  },
);

function roleShipId(roleId: unknown): string | undefined {
  if (roleId === 'admiral' || roleId === 'executive-officer' || roleId === 'wing-commander') {
    return 'aegis';
  }
  return typeof roleId === 'string'
    ? Object.keys(INITIAL_SHIP_RESOURCES).find((shipId) => roleId.startsWith(`${shipId}-`))
    : undefined;
}

function configuredRoleIds(session: DocumentSnapshot): readonly string[] {
  const stored = session.get('activeRoleIds');
  const storedPlayerCount = session.get('playerCount');
  const fallbackPlayerCount = Number.isSafeInteger(storedPlayerCount) &&
    (storedPlayerCount as number) >= 8 && (storedPlayerCount as number) <= 20
    ? storedPlayerCount as number
    : 18;
  const configured = Array.isArray(stored)
    ? ROLE_IDS.filter((roleId) => stored.includes(roleId))
    : recommendedRoleIds(fallbackPlayerCount);
  // Press is a separate product-extension station. It is never part of the
  // counted/core roster, even when a legacy session persisted the old role.
  return configured.filter((roleId) => roleId !== 'press-officer');
}

function sessionActiveRoleIds(session: DocumentSnapshot): readonly string[] {
  const stored = session.get('activeRoleIds');
  if (Array.isArray(stored)) {
    return (stored as string[]).filter((roleId) => roleId !== 'press-officer');
  }
  const playerCount = session.get('playerCount');
  return Number.isSafeInteger(playerCount) && playerCount >= 8 && playerCount <= 20
    ? recommendedRoleIds(playerCount)
    : recommendedRoleIds(18);
}

function captainRoleForShip(shipId: string): string | undefined {
  if (!isResourceShipId(shipId)) return undefined;
  return shipId === 'aegis' ? 'admiral' : `${shipId}-captain`;
}

function requireCommissarActor(player: DocumentSnapshot): void {
  if (!isActivePlayer(player) || player.get('role') !== 'player') {
    throw new HttpsError('permission-denied', 'Join the session first.');
  }
  if (player.get('replacementRoleId') !== 'commissar' || player.get('activeConsoleRoleId') !== null) {
    throw new HttpsError('permission-denied', 'The active Commissar replacement role is required.');
  }
}

function requireCaptainConsentAuthority(
  player: DocumentSnapshot,
  session: DocumentSnapshot,
  shipId: string,
): string {
  const captainRoleId = captainRoleForShip(shipId);
  if (!captainRoleId || !activeVesselIdsForSession(session).includes(shipId) ||
      !configuredRoleIds(session).includes(captainRoleId) ||
      !isActivePlayer(player) || player.get('role') !== 'player' ||
      player.get('activeConsoleRoleId') !== captainRoleId ||
      !replacementAuthorityAllowsRole(player.get('replacementRoleId'), captainRoleId)) {
    throw new HttpsError('permission-denied', 'The current captain must authorize this ship.');
  }
  return captainRoleId;
}

async function activeCaptainForShip(
  tx: Transaction,
  sessionId: string,
  session: DocumentSnapshot,
  shipId: string,
): Promise<{ readonly uid: string; readonly roleId: string; readonly player: DocumentSnapshot }> {
  const captainRoleId = captainRoleForShip(shipId);
  if (!captainRoleId || !activeVesselIdsForSession(session).includes(shipId) ||
      !configuredRoleIds(session).includes(captainRoleId)) {
    throw commandError('failed-precondition', 'That ship has no active captain authority.', 'conflict');
  }
  const players = await tx.get(db.collection(`sessions/${sessionId}/players`));
  const captain = players.docs.find((candidate) =>
    isActivePlayer(candidate) && candidate.get('role') === 'player' &&
    candidate.get('activeConsoleRoleId') === captainRoleId &&
    replacementAuthorityAllowsRole(candidate.get('replacementRoleId'), captainRoleId));
  if (!captain) {
    throw commandError('failed-precondition', 'The current captain must authorize this ship.', 'conflict');
  }
  return { uid: captain.id, roleId: captainRoleId, player: captain };
}

function commissarPurgeProjectionRevision(
  session: DocumentSnapshot,
  revisions?: Readonly<Record<string, number>>,
): number {
  return Math.max(0, ...activeVesselIdsForSession(session).map((shipId) =>
    revisions?.[shipId] ?? vesselActionRevision(session, shipId)));
}

function commissarPurgeAuthorityProjection(
  session: DocumentSnapshot,
  player: DocumentSnapshot,
  state: StoredCommissarPurgeState,
  revisions?: Readonly<Record<string, number>>,
): Record<string, unknown> | null {
  if (!isActivePlayer(player) || player.get('role') !== 'player') return null;
  const revision = commissarPurgeProjectionRevision(session, revisions);
  if (player.get('replacementRoleId') === 'commissar' && player.get('activeConsoleRoleId') === null) {
    return {
      type: 'commissar-purge-authority',
      sessionId: session.id,
      role: 'commissar',
      revision,
      consents: Object.fromEntries(Object.entries(state.consents).map(([shipId, consent]) => [shipId, {
        turn: consent.turn,
        captainRoleId: consent.captainRoleId,
        vesselRevision: consent.vesselRevision,
      }])),
      ledger: state.ledger,
    };
  }
  const roleId = player.get('activeConsoleRoleId');
  if (typeof roleId !== 'string' || !configuredRoleIds(session).includes(roleId)) return null;
  const shipId = activeVesselIdsForSession(session).find((candidate) =>
    captainRoleForShip(candidate) === roleId &&
    replacementAuthorityAllowsRole(player.get('replacementRoleId'), roleId));
  if (!shipId) return null;
  const consent = state.consents[shipId];
  const currentTurn = sessionTurn(session.get('currentTurn'));
  const currentRevision = revisions?.[shipId] ?? vesselActionRevision(session, shipId);
  const currentConsent = consent?.captainUid === player.id &&
    consent.captainRoleId === roleId && consent.turn === currentTurn &&
    consent.vesselRevision === currentRevision ? consent : undefined;
  return {
    type: 'commissar-purge-authority',
    sessionId: session.id,
    role: 'captain',
    revision,
    captainRoleId: roleId,
    shipId,
    ...(currentConsent ? {
      consented: true,
      consentTurn: currentConsent.turn,
      consentVesselRevision: currentConsent.vesselRevision,
    } : { consented: false }),
    usedThisTurn: state.ledger[shipId]?.turn === currentTurn,
  };
}

function writeCommissarPurgeAuthorityViews(
  tx: Transaction,
  sessionId: string,
  session: DocumentSnapshot,
  players: { readonly docs: readonly DocumentSnapshot[] },
  state: StoredCommissarPurgeState,
  revisions?: Readonly<Record<string, number>>,
): void {
  for (const player of players.docs) {
    const projection = commissarPurgeAuthorityProjection(session, player, state, revisions);
    if (projection) txSetIfSupported(tx, commissarPurgeAuthorityRef(sessionId, player.id), projection);
  }
}

async function requireShipCounterAuthority(
  tx: Transaction,
  sessionId: string,
  uid: string,
  shipId: string,
  instanceId?: string,
  gmOnly = false,
  requireScopedGmGrant = false,
): Promise<void> {
  if (!isResourceShipId(shipId)) throw new HttpsError('invalid-argument', 'Unknown fleet ship.');
  const [player, session] = await Promise.all([
    tx.get(db.doc(`sessions/${sessionId}/players/${uid}`)),
    tx.get(db.doc(`sessions/${sessionId}`)),
  ]);
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
  requirePlayerShipActionAuthority(player);
  if (!activeVesselIdsForSession(session).includes(shipId)) {
    throw commandError('failed-precondition', 'That ship is not active in this session.', 'conflict');
  }
  const role = player.get('role');
  if (gmOnly && !canAdjustShipCounter(role, Boolean(instanceId))) {
    throw new HttpsError('permission-denied', 'Active GM instance required.');
  }
  if (role === 'gm') {
    if (!instanceId) throw new HttpsError('permission-denied', 'Active GM instance required.');
    const instance = await tx.get(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`));
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'Active GM instance required.');
    }
    if (requireScopedGmGrant) {
      const grant = await tx.get(gmShipConsoleWriteGrantRef(sessionId, instanceId));
      if (!hasGmShipConsoleWriteGrant(grant, sessionId, instanceId, uid, shipId)) {
        throw new HttpsError('permission-denied', 'Select this ship for GM write access first.');
      }
    }
    return;
  }
  const ownRole = player.get('activeConsoleRoleId');
  const replacementRoleId = player.get('replacementRoleId');
  if (!replacementAuthorityAllowsRole(replacementRoleId, String(ownRole ?? ''))) {
    throw new HttpsError('permission-denied', 'The historical printed role is no longer active after replacement.');
  }
  const activeRoleIds = configuredRoleIds(session);
  if (typeof ownRole !== 'string' || !activeRoleIds.includes(ownRole) ||
      roleShipId(ownRole) !== shipId) {
    throw new HttpsError('permission-denied', 'An active role aboard this ship is required.');
  }
}

function hasGmShipConsoleWriteGrant(
  grant: DocumentSnapshot,
  sessionId: string,
  instanceId: string,
  uid: string,
  shipId: string,
): boolean {
  return grant.exists && grant.get('type') === 'gm-ship-console-write-grant' &&
    grant.get('sessionId') === sessionId && grant.get('instanceId') === instanceId &&
    grant.get('uid') === uid && grant.get('shipId') === shipId;
}

async function requireConsoleAuthority(
  tx: Transaction, sessionId: string, player: DocumentSnapshot, targetRole: string,
  instanceId?: string,
): Promise<void> {
  const session = await tx.get(db.doc(`sessions/${sessionId}`));
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  const activeRoleIds = configuredRoleIds(session);
  const ownRole = player.get('activeConsoleRoleId');
  const replacementRoleId = player.get('replacementRoleId');
  requirePlayerShipActionAuthority(player);
  if (player.get('role') !== 'gm' && !replacementAuthorityAllowsRole(replacementRoleId, targetRole)) {
    throw new HttpsError('permission-denied', 'The historical printed role is no longer active after replacement.');
  }
  if (player.get('role') === 'gm') {
    if (!instanceId) {
      throw new HttpsError('permission-denied', 'Active GM instance required.');
    }
    const instance = await tx.get(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`));
    if (!isLiveGmInstance(instance, player, player.id)) {
      throw new HttpsError('permission-denied', 'Active GM instance required.');
    }
    const targetShip = shipForRole(targetRole);
    const grant = await tx.get(gmShipConsoleWriteGrantRef(sessionId, instanceId));
    if (!targetShip || !activeVesselIdsForSession(session).includes(targetShip) ||
        !hasGmShipConsoleWriteGrant(grant, sessionId, instanceId, player.id, targetShip)) {
      throw new HttpsError('permission-denied', 'Select this ship for GM write access first.');
    }
    return;
  }
  if (player.get('role') !== 'gm' &&
      (typeof ownRole !== 'string' || !activeRoleIds.includes(ownRole) ||
       !activeRoleIds.includes(targetRole))) {
    throw new HttpsError('permission-denied', 'That console role is not active.');
  }
  if (ownRole === targetRole && shipForRole(targetRole)) return;
  if (!shipForRole(targetRole) || shipForRole(ownRole) !== shipForRole(targetRole)) {
    throw new HttpsError('permission-denied', 'A role aboard this ship is required.');
  }
  const players = await tx.get(db.collection(`sessions/${sessionId}/players`));
  const roles = players.docs.filter(member => isActivePlayer(member) &&
    ['player', 'gm'].includes(String(member.get('role'))) &&
    activeRoleIds.includes(String(member.get('activeConsoleRoleId'))))
    .map(member => member.get('activeConsoleRoleId'));
  if (!canOperateRole(ownRole, targetRole, roles, activeRoleIds)) {
    throw new HttpsError('permission-denied', 'This console is read only while the full crew is connected.');
  }
}

type StoredUnrestAlert = {
  shipId: string;
  shipName: string;
  targetGmInstanceIds: string[];
  createdAt: string;
};

/** Reconcile all retained stores from one destroyed ship exactly once. */
export const scavengeDestroyedShipStores = onCall<{
  sessionId: string;
  instanceId: string;
  requestId: string;
  sourceShipId: string;
  expectedRevision: number;
  allocations: Record<string, Record<string, number>>;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipStoreScavengeRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const playerRef = db.doc(`sessions/${change.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${change.sessionId}/gmInstances/${change.instanceId}`);
  const stateRef = db.doc(`sessions/${change.sessionId}/shipStoreScavenges/${change.sourceShipId}`);
  const auditRef = db.doc(
    `sessions/${change.sessionId}/shipStoreScavenges/${change.sourceShipId}/audit/${change.requestId}`,
  );
  const receiptRef = commandReceiptRef(change.sessionId, change.requestId);
  const allocationFingerprint = JSON.stringify(Object.fromEntries(
    Object.entries(change.allocations).sort(([left], [right]) => left.localeCompare(right)).map(
      ([shipId, resources]) => [shipId, Object.fromEntries(
        Object.entries(resources).sort(([left], [right]) => left.localeCompare(right)),
      )],
    ),
  ));
  const fingerprint = vesselActionFingerprint(
    'scavenge-destroyed-ship-stores',
    change.sessionId,
    change.requestId,
    uid,
    change.instanceId,
    change.expectedRevision,
    { sourceShipId: change.sourceShipId, allocations: allocationFingerprint },
  );

  return db.runTransaction(async (tx) => {
    const [session, player, instance, prior, priorState, groups] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
      tx.get(receiptRef),
      tx.get(stateRef),
      tx.get(db.collection(`sessions/${change.sessionId}/fleetGroups`)),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player) || player.get('role') !== 'gm' ||
        !isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'Active GM instance required.');
    }
    requirePlayerShipActionAuthority(player);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'destroyed-ship store scavenge');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    if (priorState.exists) {
      throw commandError(
        'already-exists',
        'This destroyed ship has already had its stores reconciled.',
        'conflict',
      );
    }
    const currentRevision = vesselActionRevision(session, change.sourceShipId);
    if (change.expectedRevision !== currentRevision) {
      const stale = {
        status: 'stale' as const,
        sourceShipId: change.sourceShipId,
        currentRevision,
        requestId: change.requestId,
        ...vesselActionEnvelope(
          session,
          player,
          uid,
          change.sourceShipId,
          currentRevision,
          change.requestId,
          'scavenge-destroyed-ship-stores',
        ),
      };
      txSetIfSupported(tx, receiptRef, {
        fingerprint, result: stale, createdAt: FieldValue.serverTimestamp(),
      });
      return stale;
    }

    const fleetGroupIds: Record<string, string> = {};
    for (const snapshot of groups.docs) {
      const group = fleetGroupRecord(snapshot.data());
      if (!group || group.id !== snapshot.id) {
        throw commandError(
          'failed-precondition',
          'The fleet-group authority is malformed; stores cannot be scavenged.',
          'malformed-input',
        );
      }
      for (const vesselId of group.vesselIds) {
        if (fleetGroupIds[vesselId]) {
          throw commandError(
            'failed-precondition',
            'A vessel appears in more than one fleet group; stores cannot be scavenged.',
            'malformed-input',
          );
        }
        fleetGroupIds[vesselId] = group.id;
      }
    }
    const damages = shipDamage(session.get('shipDamage'));
    let plan: ReturnType<typeof planShipStoreScavenge>;
    try {
      plan = planShipStoreScavenge({
        sourceShipId: change.sourceShipId,
        allocations: change.allocations,
        activeVesselIds: activeVesselIdsForSession(session),
        destroyedShipIds: Object.entries(damages)
          .filter(([, damage]) => damage.destroyed)
          .map(([shipId]) => shipId),
        shipFleetGroupIds: fleetGroupIds,
        inventories: requireScavengeInventories(
          session.get('shipResources'),
          [change.sourceShipId, ...Object.keys(change.allocations)],
        ),
      });
    } catch (error) {
      throw commandError(
        'failed-precondition',
        error instanceof Error ? error.message : 'The destroyed-ship allocation is invalid.',
        'conflict',
      );
    }

    const changedShipIds = [
      change.sourceShipId,
      ...plan.transfers.map((transfer) => transfer.recipientShipId),
    ];
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    const revisions: Record<string, number> = {};
    const storedVesselRevisions = session.get('vesselActionRevisions');
    for (const shipId of changedShipIds) {
      updates[`shipResources.${shipId}`] = plan.inventories[shipId];
      const storedRevision = isRecord(storedVesselRevisions)
        ? storedVesselRevisions[shipId]
        : undefined;
      if (storedRevision !== undefined &&
          (!Number.isSafeInteger(storedRevision) || (storedRevision as number) < 0)) {
        throw commandError(
          'failed-precondition',
          'A vessel revision ledger is malformed; stores were not changed.',
          'malformed-input',
        );
      }
      const currentShipRevision = vesselActionRevision(session, shipId);
      if (currentShipRevision >= Number.MAX_SAFE_INTEGER) {
        throw commandError(
          'failed-precondition',
          'A vessel revision has reached the safe ledger limit; stores were not changed.',
          'conflict',
        );
      }
      const revision = currentShipRevision + 1;
      Object.assign(updates, vesselActionRevisionPatch(shipId, revision));
      revisions[shipId] = revision;
    }
    tx.update(sessionRef, updates);
    const result = {
      status: 'committed' as const,
      sourceShipId: change.sourceShipId,
      transfers: plan.transfers,
      inventories: Object.fromEntries(changedShipIds.map((shipId) => [shipId, plan.inventories[shipId]])),
      revisions,
      requestId: change.requestId,
      ...vesselActionEnvelope(
        session,
        player,
        uid,
        change.sourceShipId,
        revisions[change.sourceShipId]!,
        change.requestId,
        'scavenge-destroyed-ship-stores',
      ),
    };
    const authorityRecord = {
      type: 'destroyed-ship-store-scavenge',
      sessionId: change.sessionId,
      sourceShipId: change.sourceShipId,
      actorUid: uid,
      instanceId: change.instanceId,
      requestId: change.requestId,
      transfers: plan.transfers,
      revisions,
      completedAt: FieldValue.serverTimestamp(),
    };
    tx.set(stateRef, authorityRecord);
    tx.set(auditRef, authorityRecord);
    txSetIfSupported(tx, receiptRef, {
      fingerprint, result, createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});

export const adjustShipResource = onCall<{
  sessionId: string; shipId: string; resourceId: string; delta: number; instanceId?: string;
  requestId?: string; expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipCounterRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'adjust-resource', change.sessionId, identity.requestId, uid, change.instanceId ?? null,
    identity.expectedRevision ?? null, { shipId: change.shipId, resourceId: change.resourceId, delta: change.delta },
  );
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'resource adjustment');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const currentRevision = vesselActionRevision(session, change.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
        identity.requestId, 'adjust-resource');
      const stale = { status: 'stale' as const, shipId: change.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const inventories = shipResources(session.get('shipResources'));
    const inventory = inventories[change.shipId];
    const current = inventory?.[change.resourceId];
    if (current === undefined) {
      throw commandError('failed-precondition', 'That ship does not hold this resource.', 'malformed-input');
    }
    const amount = nextResourceAmount(current, change.delta);
    tx.update(sessionRef, {
      [`shipResources.${change.shipId}.${change.resourceId}`]: amount,
      ...vesselActionRevisionPatch(change.shipId, currentRevision + 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const result = {
      amount,
      ...vesselActionEnvelope(session, player, uid, change.shipId, currentRevision + 1,
        identity.requestId, 'adjust-resource'),
    };
    txSetIfSupported(tx, receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const adjustShipUnrest = onCall<{
  sessionId: string; shipId: string; delta: number; instanceId?: string;
  requestId?: string; expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipUnrestRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'adjust-unrest', change.sessionId, identity.requestId, uid, change.instanceId ?? null,
    identity.expectedRevision ?? null, { shipId: change.shipId, delta: change.delta },
  );
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'unrest adjustment');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const currentRevision = vesselActionRevision(session, change.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
        identity.requestId, 'adjust-unrest');
      const stale = { status: 'stale' as const, shipId: change.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const alerts = (session.get('unrestAlerts') ?? {}) as Record<string, StoredUnrestAlert>;
    const amounts = shipUnrest(session.get('shipUnrest'));
    const result = unrestChange(amounts[change.shipId] ?? 0, change.delta, Boolean(alerts[change.shipId]));
    if (result.kind === 'blocked') {
      throw commandError('failed-precondition', 'The GM unrest alert must be dismissed first.', 'invalid-phase');
    }
    const nextAlerts = { ...alerts };
    if (result.kind === 'overflow') {
      const instances = await tx.get(db.collection(`sessions/${change.sessionId}/gmInstances`));
      const targetGmInstanceIds = instances.docs.map((instance) => instance.id);
      if (targetGmInstanceIds.length > 0) {
        nextAlerts[change.shipId] = {
          shipId: change.shipId,
          shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[change.shipId]
            ?? change.shipId,
          targetGmInstanceIds,
          createdAt: new Date().toISOString(),
        };
      }
    }
    tx.update(sessionRef, {
      [`shipUnrest.${change.shipId}`]: result.amount,
      unrestAlerts: nextAlerts,
      ...vesselActionRevisionPatch(change.shipId, currentRevision + 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const reply = {
      amount: result.amount, alertRaised: result.kind === 'overflow',
      ...vesselActionEnvelope(session, player, uid, change.shipId, currentRevision + 1,
        identity.requestId, 'adjust-unrest'),
    };
    txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

/**
 * Record the current captain's explicit consent for a Commissar purge.  The
 * consent is tied to the ship's vessel revision and current turn so a later
 * counter change or captain replacement cannot authorize a stale action.
 */
export const consentCommissarPurge = onCall<{
  sessionId: string; shipId: string; requestId: string; expectedRevision: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const consent = requireCommissarPurgeRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${consent.sessionId}`);
  const receiptRef = commandReceiptRef(consent.sessionId, consent.requestId);
  const fingerprint = vesselActionFingerprint(
    'commissar-consent', consent.sessionId, consent.requestId, uid, null,
    consent.expectedRevision, { shipId: consent.shipId },
  );
  return db.runTransaction(async (tx) => {
    const [session, player, prior, purgeStateSnapshot, players] = await Promise.all([
      tx.get(sessionRef),
      tx.get(db.doc(`sessions/${consent.sessionId}/players/${uid}`)),
      tx.get(receiptRef),
      tx.get(commissarPurgeStateRef(consent.sessionId)),
      tx.get(db.collection(`sessions/${consent.sessionId}/players`)),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const captainRoleId = requireCaptainConsentAuthority(player, session, consent.shipId);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'Commissar consent');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    requireTurnOneForGameplay(session);
    const currentRevision = vesselActionRevision(session, consent.shipId);
    if (consent.expectedRevision !== currentRevision) {
      const stale = {
        status: 'stale' as const,
        shipId: consent.shipId,
        currentRevision,
        ...vesselActionEnvelope(
          session, player, uid, consent.shipId, currentRevision,
          consent.requestId, 'commissar-consent',
        ),
      };
      txSetIfSupported(tx, receiptRef, {
        fingerprint, result: stale, createdAt: FieldValue.serverTimestamp(),
      });
      return stale;
    }
    const priorState = commissarPurgeState(purgeStateSnapshot.get('state') ?? purgeStateSnapshot.data());
    const ledger = priorState.ledger;
    if (ledger[consent.shipId]?.turn === sessionTurn(session.get('currentTurn'))) {
      throw commandError('already-exists', 'This ship has already used its Commissar purge this cycle.', 'conflict');
    }
    const consents = { ...priorState.consents };
    const existing = consents[consent.shipId];
    const alreadyConsented = existing?.turn === sessionTurn(session.get('currentTurn')) &&
      existing.captainUid === uid &&
      existing.captainRoleId === captainRoleId && existing.vesselRevision === currentRevision;
    if (!alreadyConsented) {
      consents[consent.shipId] = {
        turn: sessionTurn(session.get('currentTurn')),
        captainUid: uid,
        captainRoleId,
        vesselRevision: currentRevision,
      };
      txSetIfSupported(tx, commissarPurgeStateRef(consent.sessionId), {
        type: 'commissar-purge-state',
        consents,
        ledger,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    writeCommissarPurgeAuthorityViews(tx, consent.sessionId, session, players, {
      consents,
      ledger,
    });
    const result = {
      status: (alreadyConsented ? 'already-consented' : 'committed') as 'already-consented' | 'committed',
      consented: true,
      shipId: consent.shipId,
      captainRoleId,
      ...vesselActionEnvelope(
        session, player, uid, consent.shipId, currentRevision,
        consent.requestId, 'commissar-consent',
      ),
    };
    txSetIfSupported(tx, receiptRef, {
      fingerprint, result, createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});

/** Apply one printed survivor-track loss and one unrest reduction atomically. */
export const applyCommissarPurge = onCall<{
  sessionId: string; shipId: string; requestId: string; expectedRevision: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const purge = requireCommissarPurgeRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${purge.sessionId}`);
  const receiptRef = commandReceiptRef(purge.sessionId, purge.requestId);
  const fingerprint = vesselActionFingerprint(
    'commissar-purge', purge.sessionId, purge.requestId, uid, null,
    purge.expectedRevision, { shipId: purge.shipId },
  );
  return db.runTransaction(async (tx) => {
    const [session, player, prior, purgeStateSnapshot] = await Promise.all([
      tx.get(sessionRef),
      tx.get(db.doc(`sessions/${purge.sessionId}/players/${uid}`)),
      tx.get(receiptRef),
      tx.get(commissarPurgeStateRef(purge.sessionId)),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    requireCommissarActor(player);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'Commissar purge');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    requireTurnOneForGameplay(session);
    if (!activeVesselIdsForSession(session).includes(purge.shipId)) {
      throw commandError('failed-precondition', 'That ship is not active in this session.', 'conflict');
    }
    const currentRevision = vesselActionRevision(session, purge.shipId);
    if (purge.expectedRevision !== currentRevision) {
      const stale = {
        status: 'stale' as const,
        shipId: purge.shipId,
        currentRevision,
        ...vesselActionEnvelope(
          session, player, uid, purge.shipId, currentRevision,
          purge.requestId, 'commissar-purge',
        ),
      };
      txSetIfSupported(tx, receiptRef, {
        fingerprint, result: stale, createdAt: FieldValue.serverTimestamp(),
      });
      return stale;
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    const priorState = commissarPurgeState(purgeStateSnapshot.get('state') ?? purgeStateSnapshot.data());
    const ledger = priorState.ledger;
    if (ledger[purge.shipId]?.turn === currentTurn) {
      throw commandError('already-exists', 'This ship has already used its Commissar purge this cycle.', 'conflict');
    }
    const captain = await activeCaptainForShip(tx, purge.sessionId, session, purge.shipId);
    const consents = priorState.consents;
    const storedConsent = consents[purge.shipId];
    if (!storedConsent || storedConsent.turn !== currentTurn ||
        storedConsent.captainUid !== captain.uid ||
        storedConsent.captainRoleId !== captain.roleId ||
        storedConsent.vesselRevision !== currentRevision) {
      throw commandError('failed-precondition', 'The current captain must consent at this vessel revision.', 'conflict');
    }

    const populationAlerts = (session.get('populationAlerts') ?? {}) as Record<string, StoredPopulationAlert>;
    const population = populationForShip(purge.shipId, session.get('shipSurvivors'));
    if (population === undefined) {
      throw commandError('failed-precondition', 'That ship has no survivor track.', 'malformed-input');
    }
    let populationResult: ReturnType<typeof populationChange>;
    try {
      populationResult = populationChange(
        purge.shipId, population, -1, Boolean(populationAlerts[purge.shipId]),
      );
    } catch (cause) {
      throw commandError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'The survivor track cannot accept this purge.',
        'conflict',
      );
    }
    const unrestAlerts = (session.get('unrestAlerts') ?? {}) as Record<string, StoredUnrestAlert>;
    const unrest = shipUnrest(session.get('shipUnrest'))[purge.shipId];
    if (unrest === undefined || unrest <= 0) {
      throw commandError('failed-precondition', 'Civil unrest is already at zero.', 'conflict');
    }
    const unrestResult = unrestChange(unrest, -1, Boolean(unrestAlerts[purge.shipId]));
    if (unrestResult.kind === 'blocked') {
      throw commandError('failed-precondition', 'The GM unrest alert must be dismissed first.', 'conflict');
    }
    const nextConsents = { ...consents };
    delete nextConsents[purge.shipId];
    const nextLedger = {
      ...ledger,
      [purge.shipId]: { turn: currentTurn, revision: currentRevision + 1 },
    };
    const nextPopulationAlerts = { ...populationAlerts };
    if (populationResult.alertRaised) {
      const instances = await tx.get(db.collection(`sessions/${purge.sessionId}/gmInstances`));
      const targetGmInstanceIds = instances.docs.map((instance) => instance.id);
      if (targetGmInstanceIds.length > 0) {
        nextPopulationAlerts[purge.shipId] = {
          shipId: purge.shipId,
          shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[purge.shipId] ?? purge.shipId,
          population: populationResult.amount,
          targetGmInstanceIds,
          createdAt: new Date().toISOString(),
        };
      }
    }
    tx.update(sessionRef, {
      [`shipSurvivors.${purge.shipId}`]: populationResult.amount,
      [`shipUnrest.${purge.shipId}`]: unrestResult.amount,
      populationAlerts: nextPopulationAlerts,
      ...vesselActionRevisionPatch(purge.shipId, currentRevision + 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const nextState = { consents: nextConsents, ledger: nextLedger };
    txSetIfSupported(tx, commissarPurgeStateRef(purge.sessionId), {
      type: 'commissar-purge-state',
      ...nextState,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const players = await tx.get(db.collection(`sessions/${purge.sessionId}/players`));
    writeCommissarPurgeAuthorityViews(tx, purge.sessionId, session, players, nextState, {
      [purge.shipId]: currentRevision + 1,
    });
    const result = {
      status: 'committed' as const,
      shipId: purge.shipId,
      survivorsRemoved: population - populationResult.amount,
      population: populationResult.amount,
      unrest: unrestResult.amount,
      unrestReduced: unrest - unrestResult.amount,
      ...vesselActionEnvelope(
        session, player, uid, purge.shipId, currentRevision + 1,
        purge.requestId, 'commissar-purge',
      ),
    };
    txSetIfSupported(tx, receiptRef, {
      fingerprint, result, createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});

/** Refresh the caller's private Commissar authority projection after reconnect or role replacement. */
export const getCommissarPurgeAuthority = onCall<{
  sessionId: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const authorityRequest = requireSessionRequest(request.data ?? {});
  return db.runTransaction(async (tx) => {
    const [session, player, purgeStateSnapshot] = await Promise.all([
      tx.get(db.doc(`sessions/${authorityRequest.sessionId}`)),
      tx.get(db.doc(`sessions/${authorityRequest.sessionId}/players/${uid}`)),
      tx.get(commissarPurgeStateRef(authorityRequest.sessionId)),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    const state = commissarPurgeState(purgeStateSnapshot.get('state') ?? purgeStateSnapshot.data());
    const projection = commissarPurgeAuthorityProjection(session, player, state);
    if (!projection) throw new HttpsError('permission-denied', 'The current Commissar or captain role is required.');
    txSetIfSupported(tx, commissarPurgeAuthorityRef(authorityRequest.sessionId, uid), projection);
    return projection;
  });
});

export const dismissUnrestAlert = onCall<{
  sessionId: string; shipId: string; instanceId: string; requestId?: string; expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const dismissal = requireUnrestDismissalRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${dismissal.sessionId}`);
  const receiptRef = commandReceiptRef(dismissal.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'dismiss-unrest', dismissal.sessionId, identity.requestId, uid, dismissal.instanceId,
    identity.expectedRevision ?? null, { shipId: dismissal.shipId },
  );
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, dismissal.sessionId, uid, dismissal.shipId, dismissal.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${dismissal.sessionId}/players/${uid}`));
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'unrest dismissal');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const currentRevision = vesselActionRevision(session, dismissal.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, dismissal.shipId, currentRevision,
        identity.requestId, 'dismiss-unrest');
      const stale = { status: 'stale' as const, shipId: dismissal.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const alerts = (session.get('unrestAlerts') ?? {}) as Record<string, StoredUnrestAlert>;
    const alert = alerts[dismissal.shipId];
    if (!alert?.targetGmInstanceIds.includes(dismissal.instanceId)) {
      const result = { dismissed: true, ...vesselActionEnvelope(session, player, uid,
        dismissal.shipId, currentRevision, identity.requestId, 'dismiss-unrest') };
      txSetIfSupported(tx, receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
      return result;
    }
    const remaining = alert.targetGmInstanceIds.filter((id) => id !== dismissal.instanceId);
    const nextAlerts = { ...alerts };
    if (remaining.length === 0) delete nextAlerts[dismissal.shipId];
    else nextAlerts[dismissal.shipId] = { ...alert, targetGmInstanceIds: remaining };
    const revision = currentRevision + 1;
    tx.update(sessionRef, { unrestAlerts: nextAlerts, ...vesselActionRevisionPatch(dismissal.shipId, revision), updatedAt: FieldValue.serverTimestamp() });
    const result = { dismissed: true, ...vesselActionEnvelope(session, player, uid,
      dismissal.shipId, revision, identity.requestId, 'dismiss-unrest') };
    txSetIfSupported(tx, receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

/**
 * Draw randomly from the remaining deck for the GM damage control. Gameplay
 * mechanics use the same deck resolver inside their authoritative transactions.
 */
export const addShipDamage = onCall<{
  sessionId: string; shipId: string; instanceId: string;
  requestId?: string; expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipDamageRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  if (!SHIP_DAMAGE_DECKS[change.shipId]) {
    throw new HttpsError('invalid-argument', 'This ship has no implemented damage deck.');
  }
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'add-damage', change.sessionId, identity.requestId, uid, change.instanceId,
    identity.expectedRevision ?? null, { shipId: change.shipId },
  );
  // These values are fixed after the receipt read, then reused if Firestore
  // retries the transaction callback.
  const entropyRange = 0x1_0000_0000;
  let drawEntropy: number | undefined;
  let stableOccurredAt: string | undefined;
  const eventId = `damage-${identity.requestId}`;
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'ship damage');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const currentRevision = vesselActionRevision(session, change.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
        identity.requestId, 'add-damage');
      const stale = { status: 'stale' as const, shipId: change.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    drawEntropy ??= randomInt(0, entropyRange);
    stableOccurredAt ??= new Date().toISOString();
    const storedDamage = shipDamage(session.get('shipDamage'));
    const current = storedDamage[change.shipId] ?? { damagedSystemIds: [], destroyed: false };
    const result = drawShipDamage(
      change.shipId,
      current,
      (upperBound) => Math.floor(((drawEntropy ?? 0) / entropyRange) * upperBound),
    );
    let catastropheEventExists = false;
    if (result.destroyed && current.destroyed) {
      catastropheEventExists = (await tx.get(
        db.doc(`sessions/${change.sessionId}/damageDraws/${destructionTransition(change.shipId, true, false).eventId}`),
      )).exists;
    }
    const destruction = result.destroyed
      ? destructionTransition(change.shipId, current.destroyed, catastropheEventExists)
      : undefined;
    // An already-destroyed ship is a terminal result.  Keep the callable
    // replayable, but do not advance its vessel revision or emit a second
    // catastrophe when a caller draws again.
    if (destruction && current.destroyed && !destruction.createEvent) {
      const reply = { destroyed: true,
        ...vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
          identity.requestId, 'add-damage') };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }

    const currentPopulation = populationForShip(change.shipId, session.get('shipSurvivors'))!;
    const takesCasualties = !result.destroyed && !result.card.systemId.startsWith('armoured-hull') && currentPopulation > 0;
    const nextPopulation = takesCasualties
      ? populationChange(change.shipId, currentPopulation, -1, false).amount : currentPopulation;
    const populationAlerts = (session.get('populationAlerts') ?? {}) as Record<string, StoredPopulationAlert>;
    const unrestAlerts = (session.get('unrestAlerts') ?? {}) as Record<string, StoredUnrestAlert>;
    const unrest = shipUnrest(session.get('shipUnrest'))[change.shipId]!;
    const nextUnrest = takesCasualties && nextPopulation === 0 ? Math.min(10, unrest + 2) : unrest;
    if (takesCasualties && populationTrackForShip(change.shipId)?.thresholds.includes(nextPopulation)) {
      const instances = await tx.get(db.collection(`sessions/${change.sessionId}/gmInstances`));
      const targetGmInstanceIds = instances.docs.map(instance => instance.id);
      if (targetGmInstanceIds.length) {
        const alert = { shipId: change.shipId, shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[change.shipId] ?? change.shipId, targetGmInstanceIds, createdAt: new Date().toISOString() };
        populationAlerts[change.shipId] = { ...alert, population: nextPopulation };
        if (unrest < 8 && nextUnrest >= 8) unrestAlerts[change.shipId] = alert;
      }
    }
    const newlyDestroyed = Boolean(destruction && !current.destroyed);
    const affectedPlayers = newlyDestroyed
      ? await tx.get(db.collection(`sessions/${change.sessionId}/players`))
      : undefined;
    if (newlyDestroyed && destruction) {
      markPlayersForShipEscape(
        tx,
        affectedPlayers?.docs ?? [],
        change.shipId,
        destruction.eventId,
        currentRevision + 1,
      );
    }
    if (!result.destroyed || newlyDestroyed) {
      const terminalPatch = newlyDestroyed
        ? totalFleetLossTerminalPatch(change.sessionId, session, change.shipId, result.state, stableOccurredAt)
        : {};
      tx.update(sessionRef, {
        [`shipDamage.${change.shipId}`]: result.state,
        [`shipSurvivors.${change.shipId}`]: nextPopulation,
        [`shipUnrest.${change.shipId}`]: nextUnrest,
        populationAlerts, unrestAlerts,
        ...vesselActionRevisionPatch(change.shipId, currentRevision + 1),
        ...terminalPatch,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    const revision = newlyDestroyed ? currentRevision + 1 : currentRevision;
    if (result.destroyed) {
      if (!destruction) throw new Error('Missing destruction transition.');
      if (destruction.createEvent) tx.set(db.doc(
        `sessions/${change.sessionId}/damageDraws/${destruction.eventId}`,
      ), {
        type: 'ship-destroyed',
        shipId: change.shipId,
        podCapacity: destruction.capacity.podCapacity,
        createdAt: FieldValue.serverTimestamp(),
      });
      const reply = { destroyed: true,
        ...vesselActionEnvelope(session, player, uid, change.shipId, revision,
          identity.requestId, 'add-damage') };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }
    tx.set(db.doc(`sessions/${change.sessionId}/damageDraws/${eventId}`), {
      type: 'ship-damage',
      shipId: change.shipId,
      card: result.card.card,
      systemId: result.card.systemId,
      systemName: result.card.systemName,
      recycled: result.recycled,
      createdAt: FieldValue.serverTimestamp(),
    });
    const reply = {
      card: result.card, recycled: result.recycled, destroyed: false,
      ...vesselActionEnvelope(session, player, uid, change.shipId, revision,
        identity.requestId, 'add-damage'),
    };
    txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

/**
 * Authoritative randomness. The result is written to the session event log so
 * it cannot be quietly re-rolled, and only then returned to the caller.
 */
export const rollDice = onCall<{ sessionId: string; sides: number; count: number }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const { sessionId, sides, count } = requireDiceRequest(request.data ?? {});

    const [player, session] = await Promise.all([
      db.doc(`sessions/${sessionId}/players/${uid}`).get(),
      db.doc(`sessions/${sessionId}`).get(),
    ]);
    if (!isActivePlayer(player)) {
      throw new HttpsError('permission-denied', 'Join the session first.');
    }
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    requireActiveGameplayPhase(session);


    const rolls = Array.from({ length: count }, () => randomInt(1, sides + 1));
    const id = randomUUID();
    await db.doc(`sessions/${sessionId}/events/${id}`).set(buildPrivacySafeEventRecord({
      type: 'roll',
      payload: {
        byUid: uid,
        sides,
        count,
        rolls,
        total: rolls.reduce((a, b) => a + b, 0),
      },
      createdAt: FieldValue.serverTimestamp(),
    }));

    return { id, rolls };
  },
);


type StoredPopulationAlert = StoredUnrestAlert & { population: number };

/** GM-only, atomic movement through the ship's printed survivor track. */
export const adjustShipPopulation = onCall<{
  sessionId: string; shipId: string; delta: number; instanceId?: string;
  requestId?: string; expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipUnrestRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  if (!populationTrackForShip(change.shipId)) {
    throw new HttpsError('invalid-argument', 'This ship has no survivor track.');
  }
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'adjust-population', change.sessionId, identity.requestId, uid, change.instanceId ?? null,
    identity.expectedRevision ?? null, { shipId: change.shipId, delta: change.delta },
  );
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(tx, change.sessionId, uid, change.shipId, change.instanceId, true);
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'population adjustment');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const currentRevision = vesselActionRevision(session, change.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
        identity.requestId, 'adjust-population');
      const stale = { status: 'stale' as const, shipId: change.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const alerts = (session.get('populationAlerts') ?? {}) as Record<string, StoredPopulationAlert>;
    const unrestAlerts = (session.get('unrestAlerts') ?? {}) as Record<string, StoredUnrestAlert>;
    const population = populationForShip(change.shipId, session.get('shipSurvivors'));
    if (population === undefined) throw new HttpsError('invalid-argument', 'Unknown survivor track.');
    let result: ReturnType<typeof populationChange>;
    try {
      result = populationChange(
        change.shipId,
        population,
        change.delta,
        Boolean(alerts[change.shipId]),
      );
    } catch (cause) {
      throw commandError('failed-precondition', cause instanceof Error ? cause.message : 'Invalid population change.', 'conflict');
    }
    const nextAlerts = { ...alerts };
    const nextUnrestAlerts = { ...unrestAlerts };
    const unrest = shipUnrest(session.get('shipUnrest'))[change.shipId] ?? 0;
    const nextUnrest = population > 0 && result.amount === 0
      ? Math.min(10, unrest + 2)
      : unrest;
    if (result.alertRaised) {
      const instances = await tx.get(db.collection(`sessions/${change.sessionId}/gmInstances`));
      const targetGmInstanceIds = instances.docs.map((instance) => instance.id);
      if (targetGmInstanceIds.length > 0) {
        const alert = {
          shipId: change.shipId,
          shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[change.shipId] ?? change.shipId,
          targetGmInstanceIds, createdAt: new Date().toISOString(),
        };
        nextAlerts[change.shipId] = { ...alert, population: result.amount };
        if (unrest < 8 && nextUnrest >= 8) nextUnrestAlerts[change.shipId] = alert;
      }
    }
    tx.update(sessionRef, {
      [`shipSurvivors.${change.shipId}`]: result.amount,
      [`shipUnrest.${change.shipId}`]: nextUnrest,
      populationAlerts: nextAlerts,
      unrestAlerts: nextUnrestAlerts,
      ...vesselActionRevisionPatch(change.shipId, currentRevision + 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const reply = {
      ...result,
      ...vesselActionEnvelope(session, player, uid, change.shipId, currentRevision + 1,
        identity.requestId, 'adjust-population'),
    };
    txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

/**
 * GM counter inputs can arrive as a short ordered run. The transaction applies
 * each click in sequence so threshold alerts cannot be lost by netting changes.
 */
export const applyShipCounterSteps = onCall<{
  sessionId: string;
  instanceId: string;
  shipId: string;
  counter: string;
  resourceId?: string;
  steps: number[];
  requestId?: string;
  expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipCounterBatchRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  if (change.counter === 'population' && !populationTrackForShip(change.shipId)) {
    throw new HttpsError('invalid-argument', 'This ship has no survivor track.');
  }
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'counter-batch', change.sessionId, identity.requestId, uid, change.instanceId,
    identity.expectedRevision ?? null,
    { shipId: change.shipId, counter: change.counter, steps: change.steps.join(','), ...(change.counter === 'resource' ? { resourceId: change.resourceId } : {}) },
  );
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'counter batch');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const currentRevision = vesselActionRevision(session, change.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
        identity.requestId, 'counter-batch');
      const stale = { status: 'stale' as const, shipId: change.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const revision = currentRevision + 1;

    if (change.counter === 'resource') {
      const inventories = shipResources(session.get('shipResources'));
      const inventory = inventories[change.shipId];
      const current = inventory?.[change.resourceId];
      if (current === undefined) {
        throw commandError('failed-precondition', 'That ship does not hold this resource.', 'malformed-input');
      }
      const result = applyResourceSteps(current, change.steps);
      tx.update(sessionRef, {
        [`shipResources.${change.shipId}.${change.resourceId}`]: result.amount,
        ...vesselActionRevisionPatch(change.shipId, revision),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const reply = { ...result, ...vesselActionEnvelope(session, player, uid, change.shipId,
        revision, identity.requestId, 'counter-batch') };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }

    if (change.counter === 'unrest') {
      const alerts = (session.get('unrestAlerts') ?? {}) as Record<string, StoredUnrestAlert>;
      const current = shipUnrest(session.get('shipUnrest'))[change.shipId] ?? 0;
      let result: ReturnType<typeof applyUnrestSteps>;
      try {
        result = applyUnrestSteps(current, change.steps, Boolean(alerts[change.shipId]));
      } catch (cause) {
        throw commandError(
          'failed-precondition',
          cause instanceof Error ? cause.message : 'Invalid unrest change.',
          'conflict',
        );
      }
      const nextAlerts = { ...alerts };
      if (result.alertRaised) {
        const instances = await tx.get(db.collection(`sessions/${change.sessionId}/gmInstances`));
        const targetGmInstanceIds = instances.docs.map((instance) => instance.id);
        if (targetGmInstanceIds.length > 0) {
          nextAlerts[change.shipId] = {
            shipId: change.shipId,
            shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[change.shipId]
              ?? change.shipId,
            targetGmInstanceIds,
            createdAt: new Date().toISOString(),
          };
        }
      }
      tx.update(sessionRef, {
        [`shipUnrest.${change.shipId}`]: result.amount,
        unrestAlerts: nextAlerts,
        ...vesselActionRevisionPatch(change.shipId, revision),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const reply = { ...result, ...vesselActionEnvelope(session, player, uid, change.shipId,
        revision, identity.requestId, 'counter-batch') };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
      return reply;
    }

    const alerts = (session.get('populationAlerts') ?? {}) as Record<string, StoredPopulationAlert>;
    const unrestAlerts = (session.get('unrestAlerts') ?? {}) as Record<string, StoredUnrestAlert>;
    const population = populationForShip(change.shipId, session.get('shipSurvivors'));
    if (population === undefined) throw new HttpsError('invalid-argument', 'Unknown survivor track.');
    let result: ReturnType<typeof applyPopulationSteps>;
    try {
      result = applyPopulationSteps(
        change.shipId,
        population,
        change.steps,
        Boolean(alerts[change.shipId]),
      );
    } catch (cause) {
      throw commandError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'Invalid population change.',
        'conflict',
      );
    }
    const nextAlerts = { ...alerts };
    const nextUnrestAlerts = { ...unrestAlerts };
    const unrest = shipUnrest(session.get('shipUnrest'))[change.shipId] ?? 0;
    const nextUnrest = population > 0 && result.amount === 0
      ? Math.min(10, unrest + 2)
      : unrest;
    if (result.alertRaised) {
      const instances = await tx.get(db.collection(`sessions/${change.sessionId}/gmInstances`));
      const targetGmInstanceIds = instances.docs.map((instance) => instance.id);
      if (targetGmInstanceIds.length > 0) {
        const alert = {
          shipId: change.shipId,
          shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[change.shipId]
            ?? change.shipId,
          targetGmInstanceIds,
          createdAt: new Date().toISOString(),
        };
        nextAlerts[change.shipId] = { ...alert, population: result.amount };
        if (unrest < 8 && nextUnrest >= 8) nextUnrestAlerts[change.shipId] = alert;
      }
    }
    tx.update(sessionRef, {
      [`shipSurvivors.${change.shipId}`]: result.amount,
      [`shipUnrest.${change.shipId}`]: nextUnrest,
      populationAlerts: nextAlerts,
      unrestAlerts: nextUnrestAlerts,
      ...vesselActionRevisionPatch(change.shipId, revision),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const reply = { ...result, ...vesselActionEnvelope(session, player, uid, change.shipId,
      revision, identity.requestId, 'counter-batch') };
    txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

type FighterWingCountFingerprint = Readonly<{
  sessionId: string;
  instanceId: string;
  requestId: string;
  wingId: FighterWingId;
  count: number;
  expectedRevision: number;
  actorUid: string;
}>;

function sameFighterWingCountFingerprint(
  value: unknown,
  expected: FighterWingCountFingerprint,
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.entries(expected).every(([key, item]) => candidate[key] === item);
}

function fighterWingCountReceiptReply(
  prior: DocumentSnapshot,
  fingerprint: FighterWingCountFingerprint,
): Record<string, unknown> | undefined {
  if (!prior.exists) return undefined;
  const storedFingerprint = prior.get('fingerprint');
  if (!sameFighterWingCountFingerprint(storedFingerprint, fingerprint)) {
    if (
      typeof storedFingerprint === 'object' && storedFingerprint !== null &&
      (storedFingerprint as Record<string, unknown>).actorUid !== fingerprint.actorUid
    ) {
      throw new HttpsError('permission-denied', 'This fighter-wing request belongs to a different actor.');
    }
    throw commandError(
      'failed-precondition',
      'This fighter-wing request id is bound to a different correction.',
      'conflict',
    );
  }
  const reply = prior.get('reply');
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) {
    throw commandError(
      'failed-precondition',
      'This fighter-wing request has no replayable result.',
      'conflict',
    );
  }
  const result = reply as Record<string, unknown>;
  if (!isVesselActionResult(result)) {
    throw commandError(
      'failed-precondition',
      'This fighter-wing request has no complete replayable vessel envelope.',
      'conflict',
    );
  }
  return result.status === 'stale' ? result : { ...result, status: 'replayed' };
}

/** Correct one AEGIS fighter-wing count through a GM-owned CAS revision. */
export const setFighterWingCount = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  wingId?: unknown;
  count?: unknown;
  expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  const allowed = ['sessionId', 'instanceId', 'requestId', 'wingId', 'count', 'expectedRevision'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !allowed.includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid fighter-wing count request.');
  }
  const change = requireFighterWingCountRequest(raw);
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const requestRef = db.doc(
    `sessions/${change.sessionId}/fighterWingCountRequests/${change.requestId}`,
  );
  const fingerprint: FighterWingCountFingerprint = {
    sessionId: change.sessionId,
    instanceId: change.instanceId,
    requestId: change.requestId,
    wingId: change.wingId,
    count: change.count,
    expectedRevision: change.expectedRevision,
    actorUid: uid,
  };
  return db.runTransaction(async tx => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, 'aegis', change.instanceId, true,
    );
    const [session, prior] = await Promise.all([
      tx.get(sessionRef),
      tx.get(requestRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    const replay = fighterWingCountReceiptReply(prior, fingerprint);
    if (replay) return replay;
    requireActiveGameplayPhase(session);

    const current = fighterWingCounts(session.get('fighterWingCounts'))[change.wingId];
    const currentRevision = current?.revision ?? 0;
    const capacity = fighterWingCapacity(session.get('shipUpgrades'));
    if (change.count > capacity) {
      throw commandError(
        'failed-precondition',
        `That correction exceeds the current ${capacity}-fighter capacity.`,
        'conflict',
      );
    }
    if (currentRevision !== change.expectedRevision) {
      if (current?.count === change.count) {
        const reply = {
          status: 'replayed' as const,
          sessionId: change.sessionId,
          requestId: change.requestId,
          wingId: change.wingId,
          count: current.count,
          capacity,
          ...vesselActionEnvelope(session, player, uid, 'aegis', currentRevision,
            change.requestId, 'fighter-count'),
        };
        tx.set(requestRef, {
          ...fingerprint,
          fingerprint,
          reply,
          createdAt: FieldValue.serverTimestamp(),
        });
        return reply;
      }
      const reply = {
        status: 'stale' as const,
        sessionId: change.sessionId,
        requestId: change.requestId,
        wingId: change.wingId,
        currentRevision,
        capacity,
        ...(current ? { count: current.count } : {}),
        ...vesselActionEnvelope(session, player, uid, 'aegis', currentRevision,
          change.requestId, 'fighter-count'),
      };
      tx.set(requestRef, {
        ...fingerprint,
        fingerprint,
        reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      return reply;
    }
    const revision = currentRevision + 1;
    const reply = {
      status: 'committed' as const,
      sessionId: change.sessionId,
      requestId: change.requestId,
      wingId: change.wingId,
      count: change.count,
      capacity,
      ...vesselActionEnvelope(session, player, uid, 'aegis', revision,
        change.requestId, 'fighter-count'),
    };
    tx.update(sessionRef, {
      [`fighterWingCounts.${change.wingId}`]: { count: change.count, revision },
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(requestRef, {
      ...fingerprint,
      fingerprint,
      reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
});

/** Build one replacement fighter through the charged, server-owned AEGIS Construction Bay. */
export const buildFighter = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  wingId?: unknown;
  expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  const allowed = ['sessionId', 'instanceId', 'requestId', 'wingId', 'expectedRevision'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !allowed.includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid fighter construction request.');
  }
  const change = requireFighterBuildRequest(raw);
  const identity = requireVesselActionRequest(raw);
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'fighter-build', change.sessionId, identity.requestId, uid, change.instanceId ?? null,
    change.expectedRevision, { shipId: 'aegis', wingId: change.wingId },
  );
  return db.runTransaction(async tx => {
    const [player, session] = await Promise.all([
      tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`)),
      tx.get(sessionRef),
    ]);
    await requireConsoleAuthority(tx, change.sessionId, player, 'wing-commander', change.instanceId);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (player.get('role') !== 'gm' &&
        (!isActivePlayer(player) || player.get('activeConsoleRoleId') !== 'wing-commander')) {
      throw new HttpsError('permission-denied', 'An active Wing Commander console is required.');
    }
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'fighter construction');
    if (replay) return replay;

    requireActionPhase(session, 'maintenance', player.get('role') === 'gm' ? 'facilitator' : 'player');

    const currentRevision = vesselActionRevision(session, 'aegis');
    const currentCounts = fighterWingCounts(session.get('fighterWingCounts'));
    const currentWing = currentCounts[change.wingId];
    const capacity = fighterWingCapacity(session.get('shipUpgrades'));
    if (!currentWing) {
      throw commandError(
        'failed-precondition',
        'Fighter-wing strength is unavailable; wait for a server snapshot before building replacements.',
        'conflict',
      );
    }
    if (change.expectedRevision !== currentRevision) {
      const stale = {
        status: 'stale' as const,
        sessionId: change.sessionId,
        requestId: identity.requestId,
        wingId: change.wingId,
        count: currentWing.count,
        fighterWingRevision: currentWing.revision,
        materials: shipResources(session.get('shipResources')).aegis?.materials ?? 0,
        capacity,
        currentRevision,
        ...vesselActionEnvelope(session, player, uid, 'aegis', currentRevision,
          identity.requestId, 'fighter-build'),
      };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    if (currentWing.count >= capacity) {
      throw commandError(
        'failed-precondition',
        `That wing is already at its current ${capacity}-fighter capacity.`,
        'conflict',
      );
    }
    const cycles = isRecord(session.get('maintenanceCycles')) ? session.get('maintenanceCycles') : {};
    const cycle = parseMaintenanceCycle(cycles.aegis);
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (!cycle || cycle.turn !== currentTurn || !cycle.charges.includes('construction-bay')) {
      throw commandError(
        'failed-precondition',
        'Charge the Construction Bay during this cycle before building replacement fighters.',
        'invalid-phase',
      );
    }
    const damage = shipDamage(session.get('shipDamage')).aegis;
    if (damage?.destroyed === true || damage?.damagedSystemIds.includes('construction-bay')) {
      throw commandError(
        'failed-precondition',
        damage.destroyed
          ? 'AEGIS is destroyed and cannot build replacement fighters.'
          : 'The Construction Bay is damaged and cannot build replacement fighters.',
        'conflict',
      );
    }
    const resources = shipResources(session.get('shipResources')).aegis;
    if (!resources || resources.materials < 1) {
      throw commandError(
        'failed-precondition',
        'AEGIS has no materials available for a replacement fighter.',
        'conflict',
      );
    }
    const revision = currentRevision + 1;
    const nextCount = currentWing.count + 1;
    const reply = {
      status: 'committed' as const,
      sessionId: change.sessionId,
      requestId: identity.requestId,
      wingId: change.wingId,
      count: nextCount,
      fighterWingRevision: currentWing.revision + 1,
      materials: resources.materials - 1,
      capacity,
      ...vesselActionEnvelope(session, player, uid, 'aegis', revision,
        identity.requestId, 'fighter-build'),
    };
    tx.update(sessionRef, {
      [`fighterWingCounts.${change.wingId}`]: {
        count: nextCount,
        revision: currentWing.revision + 1,
      },
      'shipResources.aegis.materials': resources.materials - 1,
      ...vesselActionRevisionPatch('aegis', revision),
      updatedAt: FieldValue.serverTimestamp(),
    });
    txSetIfSupported(tx, receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

export const dismissPopulationAlert = onCall<{
  sessionId: string; shipId: string; instanceId: string; requestId?: string; expectedRevision?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const dismissal = requireUnrestDismissalRequest(request.data ?? {});
  const identity = requireVesselActionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${dismissal.sessionId}`);
  const receiptRef = commandReceiptRef(dismissal.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'dismiss-population', dismissal.sessionId, identity.requestId, uid, dismissal.instanceId,
    identity.expectedRevision ?? null, { shipId: dismissal.shipId },
  );
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(tx, dismissal.sessionId, uid, dismissal.shipId, dismissal.instanceId, true);
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${dismissal.sessionId}/players/${uid}`));
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'population dismissal');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const currentRevision = vesselActionRevision(session, dismissal.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, dismissal.shipId, currentRevision,
        identity.requestId, 'dismiss-population');
      const stale = { status: 'stale' as const, shipId: dismissal.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const alerts = (session.get('populationAlerts') ?? {}) as Record<string, StoredPopulationAlert>;
    const alert = alerts[dismissal.shipId];
    if (!alert?.targetGmInstanceIds.includes(dismissal.instanceId)) {
      const result = { dismissed: true, ...vesselActionEnvelope(session, player, uid,
        dismissal.shipId, currentRevision, identity.requestId, 'dismiss-population') };
      txSetIfSupported(tx, receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
      return result;
    }
    const remaining = acknowledgePopulationAlert(alert.targetGmInstanceIds, dismissal.instanceId);
    const nextAlerts = { ...alerts };
    if (remaining.length === 0) delete nextAlerts[dismissal.shipId];
    else nextAlerts[dismissal.shipId] = { ...alert, targetGmInstanceIds: remaining };
    const revision = currentRevision + 1;
    tx.update(sessionRef, { populationAlerts: nextAlerts, ...vesselActionRevisionPatch(dismissal.shipId, revision), updatedAt: FieldValue.serverTimestamp() });
    const result = { dismissed: true, ...vesselActionEnvelope(session, player, uid,
      dismissal.shipId, revision, identity.requestId, 'dismiss-population') };
    txSetIfSupported(tx, receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

function smallShipId(value: string): SmallShipId | undefined {
  return (SMALL_SHIP_IDS as readonly string[]).includes(value) ? value as SmallShipId : undefined;
}

function hummingbirdHarvestRef(sessionId: string, uid: string): DocumentReference {
  return db.doc(`sessions/${sessionId}/hummingbirdHarvests/${uid}`);
}

function hummingbirdHarvestRequestRef(sessionId: string, requestId: string): DocumentReference {
  return db.doc(`sessions/${sessionId}/hummingbirdHarvestRequests/${requestId}`);
}

type HummingbirdHarvestFingerprint = Readonly<{
  kind: 'roll' | 'allocate';
  sessionId: string;
  actorUid: string;
  expectedRevision: number;
  hostShipId: string;
  turn: number;
  foodDieIndex?: 0 | 1;
}>;

function sameHummingbirdHarvestFingerprint(
  value: unknown,
  expected: HummingbirdHarvestFingerprint,
): boolean {
  if (!isRecord(value)) return false;
  return value.kind === expected.kind && value.sessionId === expected.sessionId &&
    value.actorUid === expected.actorUid && value.expectedRevision === expected.expectedRevision &&
    value.hostShipId === expected.hostShipId && value.turn === expected.turn &&
    value.foodDieIndex === (expected.foodDieIndex ?? undefined);
}

function hummingbirdHarvestReceiptReply(
  prior: DocumentSnapshot,
  fingerprint: HummingbirdHarvestFingerprint,
  uid: string,
): Record<string, unknown> | undefined {
  if (!prior.exists) return undefined;
  if (prior.get('actorUid') !== uid ||
      !sameHummingbirdHarvestFingerprint(prior.get('fingerprint'), fingerprint)) {
    throw commandError(
      'failed-precondition',
      'This request id was already used for a different Hummingbird harvest or actor.',
      'conflict',
    );
  }
  const reply = prior.get('reply');
  if (!isRecord(reply)) {
    throw commandError('failed-precondition', 'This Hummingbird request has no replayable result.', 'conflict');
  }
  return reply.status === 'stale' ? reply : { ...reply, status: 'replayed' };
}

function hummingbirdDocking(
  session: DocumentSnapshot,
  activeVesselIds: readonly string[],
): { readonly shipId: string } | undefined {
  const stored = session.get('shuttleDockings');
  if (!Array.isArray(stored) || !shuttleDockingsAreParked(stored, activeVesselIds)) return undefined;
  const dockings = stored.filter((entry) => isRecord(entry) && entry.shuttleId === 'hummingbird');
  if (dockings.length !== 1) return undefined;
  const docking = dockings[0];
  if (!isRecord(docking) || typeof docking.shipId !== 'string' || !isResourceShipId(docking.shipId)) return undefined;
  return { shipId: docking.shipId };
}

function hummingbirdCargo(session: DocumentSnapshot): { readonly food: number; readonly water: number } {
  const stored = session.get('shuttleCargo');
  if (stored === undefined) return { food: 0, water: 0 };
  if (!isRecord(stored)) {
    throw commandError('failed-precondition', 'The Hummingbird cargo ledger is malformed.', 'malformed-input');
  }
  const raw = stored.hummingbird;
  if (raw === undefined) return { food: 0, water: 0 };
  if (!isRecord(raw) || Object.keys(raw).some((key) => key !== 'food' && key !== 'water')) {
    throw commandError('failed-precondition', 'The Hummingbird cargo ledger is malformed.', 'malformed-input');
  }
  const food = raw.food === undefined ? 0 : raw.food;
  const water = raw.water === undefined ? 0 : raw.water;
  if (!Number.isSafeInteger(food) || (food as number) < 0 ||
      !Number.isSafeInteger(water) || (water as number) < 0) {
    throw commandError('failed-precondition', 'The Hummingbird cargo ledger is malformed.', 'malformed-input');
  }
  return { food: food as number, water: water as number };
}

function storedHummingbirdHarvest(
  snapshot: DocumentSnapshot,
  sessionId: string,
  uid: string,
): HummingbirdHarvestState | undefined {
  if (!snapshot.exists) return undefined;
  const state = parseHummingbirdHarvestState(snapshot.data());
  if (!state || state.sessionId !== sessionId || state.ownerUid !== uid || !isResourceShipId(state.hostShipId)) {
    throw commandError('failed-precondition', 'The Hummingbird harvest receipt is malformed.', 'malformed-input');
  }
  return state;
}

async function requireHummingbirdAuthority(
  tx: Transaction,
  sessionId: string,
  uid: string,
  enforceActionPhase: boolean,
): Promise<{ readonly player: DocumentSnapshot; readonly session: DocumentSnapshot; readonly hostShipId: string }> {
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const [session, player] = await Promise.all([
    tx.get(sessionRef),
    tx.get(db.doc(`sessions/${sessionId}/players/${uid}`)),
  ]);
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  if (!isActivePlayer(player) || player.get('role') !== 'player') {
    throw new HttpsError('permission-denied', 'Only the connected Quellon Explorer may operate Hummingbird harvesting.');
  }
  requirePlayerShipActionAuthority(player);
  const activeRoleIds = configuredRoleIds(session);
  const activeRole = player.get('activeConsoleRoleId');
  if (activeRole !== 'quellon-explorer' || !activeRoleIds.includes('quellon-explorer') ||
      !replacementAuthorityAllowsRole(player.get('replacementRoleId'), 'quellon-explorer')) {
    throw new HttpsError('permission-denied', 'The active Quellon Explorer console is required.');
  }
  if (!activeVesselIdsForSession(session).includes('quellon')) {
    throw commandError('failed-precondition', 'Quellon is not active in this session.', 'conflict');
  }
  const activeVesselIds = activeVesselIdsForSession(session);
  const docking = hummingbirdDocking(session, activeVesselIds);
  if (!docking) {
    throw commandError('failed-precondition', 'Hummingbird must be docked with an active fleet ship.', 'conflict');
  }
  if (!activeVesselIds.includes(docking.shipId)) {
    throw commandError('failed-precondition', 'Hummingbird must be docked with an active fleet ship.', 'conflict');
  }
  const fuelled = session.get('shuttleFuelled');
  if (!isRecord(fuelled) || fuelled.hummingbird !== true) {
    throw commandError('failed-precondition', 'Hummingbird must be fuelled during the Team Phase first.', 'conflict');
  }
  requireActiveGameplayPhase(session);
  requireTurnOneForGameplay(session);

  if (enforceActionPhase) requireActionPhase(session, 'scouting', 'player');
  return { player, session, hostShipId: docking.shipId };
}

function hummingbirdHarvestReply(
  state: HummingbirdHarvestState,
  session: DocumentSnapshot,
  player: DocumentSnapshot,
  uid: string,
  requestId: string,
  status: 'committed' | 'replayed' | 'stale',
  cargo?: { readonly food: number; readonly water: number },
): Record<string, unknown> {
  return {
    status,
    requestId,
    sessionId: state.sessionId,
    harvest: state,
    ...(cargo ? { cargo } : {}),
    ...vesselActionEnvelope(session, player, uid, 'hummingbird', state.revision,
      requestId, 'hummingbird-harvest', state.hostShipId),
  };
}

/** Roll Hummingbird's private 2d6 harvest receipt. The player allocates it in a second call. */
export const rollHummingbirdHarvest = onCall<{
  sessionId?: unknown; requestId?: unknown; expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(key => !['sessionId', 'requestId', 'expectedRevision'].includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid Hummingbird harvest roll request.');
  }
  const data = requireHummingbirdHarvestRequest(raw);
  const requestRef = hummingbirdHarvestRequestRef(data.sessionId, data.requestId);
  const harvestRef = hummingbirdHarvestRef(data.sessionId, uid);
  const preflight = await db.runTransaction(async tx => {
    const prior = await tx.get(requestRef);
    // Read authority before replay so an exact retry can return its stored
    // result without re-sampling. Fresh rolls still pass the action-phase
    // guard before the caller leaves this transaction and reaches RNG.
    const authority = await requireHummingbirdAuthority(tx, data.sessionId, uid, false);
    const fingerprint: HummingbirdHarvestFingerprint = {
      kind: 'roll', sessionId: data.sessionId, actorUid: uid,
      expectedRevision: data.expectedRevision, hostShipId: authority.hostShipId,
      turn: sessionTurn(authority.session.get('currentTurn')),
    };
    const replay = hummingbirdHarvestReceiptReply(prior, fingerprint, uid);
    if (replay) return { replay, authority, fingerprint, reusePending: false };
    requireActionPhase(authority.session, 'scouting', 'player');
    const stored = await tx.get(harvestRef);
    const current = storedHummingbirdHarvest(stored, data.sessionId, uid);
    const turn = sessionTurn(authority.session.get('currentTurn'));
    if (current && current.turn === turn) {
      if (current.status === 'pending' && current.revision === data.expectedRevision) return {
        replay: undefined, authority, fingerprint, current, reusePending: true,
      };
      throw commandError('failed-precondition', 'Hummingbird harvesting is already resolved this cycle.', 'conflict');
    }
    if (current && current.status === 'pending' && current.turn !== turn) {
      throw commandError('failed-precondition', 'Resolve the previous Hummingbird harvest before starting a new cycle.', 'conflict');
    }
    if (current && current.revision !== data.expectedRevision) {
      throw commandError('failed-precondition', 'Hummingbird harvest changed. Refresh before rolling.', 'stale-revision');
    }
    if (!current && data.expectedRevision !== 0) {
      throw commandError('failed-precondition', 'Hummingbird harvest changed. Refresh before rolling.', 'stale-revision');
    }
    return { replay: undefined, authority, fingerprint, current, reusePending: false };
  });
  if (preflight.replay) return preflight.replay;
  const rolls: [number, number] | undefined = preflight.reusePending
    ? undefined
    : [randomInt(1, 7), randomInt(1, 7)];
  const createdAt = new Date().toISOString();
  return db.runTransaction(async tx => {
    const authority = await requireHummingbirdAuthority(tx, data.sessionId, uid, true);
    const prior = await tx.get(requestRef);
    const fingerprint: HummingbirdHarvestFingerprint = {
      kind: 'roll', sessionId: data.sessionId, actorUid: uid,
      expectedRevision: data.expectedRevision, hostShipId: authority.hostShipId,
      turn: sessionTurn(authority.session.get('currentTurn')),
    };
    const replay = hummingbirdHarvestReceiptReply(prior, fingerprint, uid);
    if (replay) return replay;
    const stored = await tx.get(harvestRef);
    const current = storedHummingbirdHarvest(stored, data.sessionId, uid);
    const turn = sessionTurn(authority.session.get('currentTurn'));
    if (current && current.turn === turn) {
      if (current.status === 'pending') {
        if (current.revision !== data.expectedRevision) {
          throw commandError('failed-precondition', 'A Hummingbird roll is already waiting for allocation.', 'stale-revision');
        }
        const reply = hummingbirdHarvestReply(current, authority.session, authority.player, uid,
          data.requestId, 'committed');
        tx.set(requestRef, { ...fingerprint, fingerprint, requestId: data.requestId, actorUid: uid, reply,
          createdAt: FieldValue.serverTimestamp() });
        return reply;
      }
      throw commandError('failed-precondition', 'Hummingbird harvesting is already resolved this cycle.', 'conflict');
    }
    if (current && current.status === 'pending' && current.turn !== turn) {
      throw commandError('failed-precondition', 'Resolve the previous Hummingbird harvest before starting a new cycle.', 'conflict');
    }
    if (current && current.revision !== data.expectedRevision) {
      throw commandError('failed-precondition', 'Hummingbird harvest changed. Refresh before rolling.', 'stale-revision');
    }
    if (!current && data.expectedRevision !== 0) {
      throw commandError('failed-precondition', 'Hummingbird harvest changed. Refresh before rolling.', 'stale-revision');
    }
    if (!rolls) {
      throw commandError('failed-precondition', 'Hummingbird harvest changed. Refresh before rolling.', 'stale-revision');
    }
    const next: HummingbirdHarvestState = {
      sessionId: data.sessionId, ownerUid: uid, turn,
      hostShipId: authority.hostShipId, revision: data.expectedRevision + 1,
      status: 'pending', rolls, requestId: data.requestId, createdAt,
    };
    const reply = hummingbirdHarvestReply(next, authority.session, authority.player, uid,
      data.requestId, 'committed');
    tx.set(harvestRef, { ...next, updatedAt: FieldValue.serverTimestamp() });
    tx.set(requestRef, { ...fingerprint, fingerprint, requestId: data.requestId, actorUid: uid,
      reply, serverRolls: rolls, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

/** Commit the player's food-die allocation and credit only Hummingbird cargo. */
export const allocateHummingbirdHarvest = onCall<{
  sessionId?: unknown; requestId?: unknown; expectedRevision?: unknown; foodDieIndex?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(key => !['sessionId', 'requestId', 'expectedRevision', 'foodDieIndex'].includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid Hummingbird harvest allocation request.');
  }
  const data = requireHummingbirdHarvestRequest(raw);
  const foodDieIndex = data.foodDieIndex;
  if (foodDieIndex === undefined) {
    throw new HttpsError('invalid-argument', 'Choose which rolled die becomes food.');
  }
  const requestRef = hummingbirdHarvestRequestRef(data.sessionId, data.requestId);
  const harvestRef = hummingbirdHarvestRef(data.sessionId, uid);
  return db.runTransaction(async tx => {
    const prior = await tx.get(requestRef);
    // Preserve exact request replay even if the phase has since advanced;
    // every new allocation must pass the current action-phase guard first.
    const authority = await requireHummingbirdAuthority(tx, data.sessionId, uid, false);
    const turn = sessionTurn(authority.session.get('currentTurn'));
    const fingerprint: HummingbirdHarvestFingerprint = {
      kind: 'allocate', sessionId: data.sessionId, actorUid: uid,
      expectedRevision: data.expectedRevision, hostShipId: authority.hostShipId,
      turn, foodDieIndex,
    };
    const replay = hummingbirdHarvestReceiptReply(prior, fingerprint, uid);
    if (replay) return replay;
    requireActionPhase(authority.session, 'scouting', 'player');
    const stored = await tx.get(harvestRef);
    const current = storedHummingbirdHarvest(stored, data.sessionId, uid);
    if (!current) {
      throw commandError('failed-precondition', 'No Hummingbird roll is waiting for allocation.', 'conflict');
    }
    if (current.turn !== turn || current.hostShipId !== authority.hostShipId) {
      throw commandError('failed-precondition', 'The Hummingbird roll is stale after a cycle or docking change.', 'stale-revision');
    }
    if (current.status !== 'pending' || current.revision !== data.expectedRevision) {
      throw commandError('failed-precondition', 'The Hummingbird roll is no longer waiting for allocation.', 'stale-revision');
    }
    const priorCargo = hummingbirdCargo(authority.session);
    const cargo = addHarvestToCargo(priorCargo, current.rolls, foodDieIndex);
    const values = resolvedHarvestValues(current.rolls, foodDieIndex);
    const next: HummingbirdHarvestState = {
      ...current, revision: current.revision + 1, status: 'resolved',
      foodDieIndex, food: values.food, water: values.water,
      resolvedAt: new Date().toISOString(), requestId: data.requestId,
    };
    const reply = hummingbirdHarvestReply(next, authority.session, authority.player, uid,
      data.requestId, 'committed', cargo);
    tx.update(db.doc(`sessions/${data.sessionId}`), {
      'shuttleCargo.hummingbird': cargo,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(harvestRef, { ...next, updatedAt: FieldValue.serverTimestamp() });
    tx.set(requestRef, { ...fingerprint, fingerprint, requestId: data.requestId, actorUid: uid,
      reply, food: values.food, water: values.water, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

function storedSmallShipState(session: DocumentSnapshot, id: SmallShipId): SmallShipState | undefined {
  const stored = session.get('smallShipStates');
  return isRecord(stored) ? parseSmallShipState(stored[id], id) : undefined;
}

function hasStoredSmallShipState(session: DocumentSnapshot, id: SmallShipId): boolean {
  const stored = session.get('smallShipStates');
  return isRecord(stored) && Object.prototype.hasOwnProperty.call(stored, id);
}

function requireSmallShipMode(session: DocumentSnapshot, id: SmallShipId): void {
  // Older sessions predate the persisted expansion field and use the base
  // Capybara rules by default. Treat only an explicit expansion/none marker
  // as a different effective mode.
  const expansion = session.get('expansion') === undefined ? 'base' : session.get('expansion');
  if (id === 'capybara-small' &&
      (expansion !== 'base' || session.get('capybaraEnabled') === false)) {
    throw commandError(
      'failed-precondition',
      'Base Capybara is unavailable when the expansion Capybara is selected or disabled.',
      'conflict',
    );
  }
}

/** Optional small ships that have been admitted must remain present for the
 * Team and Wolf-attack windows that their printed rules require. */
function requireSmallShipsDockedAtBoundary(
  session: DocumentSnapshot,
  boundary: 'Team' | 'Wolf attack',
): void {
  const stored = session.get('smallShipStates');
  if (!isRecord(stored)) return;
  const activeHosts = new Set(activeVesselIdsForSession(session).filter(isResourceShipId));
  for (const id of SMALL_SHIP_IDS) {
    if (!Object.prototype.hasOwnProperty.call(stored, id)) continue;
    requireSmallShipMode(session, id);
    const state = storedSmallShipState(session, id);
    if (!state || !state.hostShipId || !activeHosts.has(state.hostShipId)) {
      throw commandError(
        'failed-precondition',
        `${SMALL_SHIP_RULES[id].name} must remain docked with an active host for the ${boundary} window.`,
        'conflict',
      );
    }
  }
}

function requireSmallShipDockingPhase(session: DocumentSnapshot): void {
  requireActiveGameplayPhase(session);
  if (session.get('phase') !== 'active') {
    throw commandError('failed-precondition', 'Small ships can only dock during active gameplay.', 'invalid-phase');
  }
  const phase = turnPhaseState(session.get('turnPhase'));
  // Legacy active sessions have no phase clock and retain existing callable
  // compatibility. Once a clock exists, docking is a Coordination action.
  if (phase && phase.airspace.state !== 'lifted') {
    throw commandError('failed-precondition', 'Small ships can only dock during the Coordination Phase.', 'invalid-phase');
  }
}

async function requireSmallShipHostAuthority(
  tx: Transaction,
  sessionId: string,
  uid: string,
  instanceId: string | undefined,
  id: SmallShipId,
): Promise<{ player: DocumentSnapshot; session: DocumentSnapshot; state: SmallShipState }> {
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const [player, session] = await Promise.all([
    tx.get(db.doc(`sessions/${sessionId}/players/${uid}`)),
    tx.get(sessionRef),
  ]);
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  requireSmallShipMode(session, id);
  const state = storedSmallShipState(session, id);
  if (hasStoredSmallShipState(session, id) && !state) {
    throw commandError('failed-precondition', 'The stored small-ship state is malformed. Refresh the session before operating it.', 'conflict');
  }
  if (!state || !state.hostShipId) {
    throw commandError('failed-precondition', 'Dock the small ship with an active fleet host first.', 'conflict');
  }
  await requireShipCounterAuthority(tx, sessionId, uid, state.hostShipId, instanceId, false);
  return { player, session, state };
}

type SmallShipCommandFingerprint = Readonly<{
  kind: 'dock' | 'maintenance';
  sessionId: string;
  smallShipId: SmallShipId;
  actorUid: string;
  instanceId: string | null;
  expectedRevision: number;
  action?: string;
  hostShipId?: string | null;
  docked?: boolean;
  foodLevel?: number | null;
  waterLevel?: number | null;
  consoles?: readonly string[];
  productionConsoleId?: string;
  productionOreAmount?: number | null;
}>;

function sameSmallShipFingerprint(value: unknown, expected: SmallShipCommandFingerprint): boolean {
  if (!isRecord(value)) return false;
  const consoles = value.consoles;
  const consolesMatch = expected.consoles === undefined
    ? consoles === undefined
    : Array.isArray(consoles) && consoles.length === expected.consoles.length &&
      consoles.every((item, index) => item === expected.consoles?.[index]);
  const foodLevelMatch = expected.foodLevel === undefined
    ? value.foodLevel === undefined
    : value.foodLevel === expected.foodLevel;
  const waterLevelMatch = expected.waterLevel === undefined
    ? value.waterLevel === undefined
    : value.waterLevel === expected.waterLevel;
  const productionConsoleMatch = expected.productionConsoleId === undefined
    ? value.productionConsoleId === undefined
    : value.productionConsoleId === expected.productionConsoleId;
  const productionOreAmountMatch = expected.productionOreAmount === undefined
    ? value.productionOreAmount === undefined
    : value.productionOreAmount === expected.productionOreAmount;
  return value.kind === expected.kind && value.sessionId === expected.sessionId &&
    value.smallShipId === expected.smallShipId && value.actorUid === expected.actorUid &&
    value.instanceId === expected.instanceId && value.expectedRevision === expected.expectedRevision &&
    value.action === (expected.action ?? undefined) && value.hostShipId === expected.hostShipId &&
    value.docked === (expected.docked ?? undefined) && foodLevelMatch &&
    waterLevelMatch && consolesMatch && productionConsoleMatch && productionOreAmountMatch;
}

function smallShipReceiptReply(
  prior: DocumentSnapshot,
  fingerprint: SmallShipCommandFingerprint,
  uid: string,
): Record<string, unknown> | undefined {
  if (!prior.exists) return undefined;
  if (prior.get('actorUid') !== uid || !sameSmallShipFingerprint(prior.get('fingerprint'), fingerprint)) {
    throw commandError('failed-precondition', 'This request id was already used for a different small-ship command or actor.', 'conflict');
  }
  const stored = prior.get('reply');
  if (!isRecord(stored)) throw commandError('failed-precondition', 'This small-ship request has no replayable result.', 'conflict');
  if (!isVesselActionResult(stored)) {
    throw commandError('failed-precondition', 'This small-ship request has no complete replayable vessel envelope.', 'conflict');
  }
  return stored.status === 'stale' ? stored : { ...stored, status: 'replayed' };
}

/** Atomically admit or release one optional small ship from a fleet host. */
export const setSmallShipDocking = onCall<{
  sessionId?: unknown; smallShipId?: unknown; hostShipId?: unknown; docked?: unknown;
  instanceId?: unknown; requestId?: unknown; expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(key => !['sessionId', 'smallShipId', 'hostShipId', 'docked', 'instanceId', 'requestId', 'expectedRevision'].includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid small-ship docking request.');
  }
  const data = requireSmallShipDockingRequest(raw);
  const id = smallShipId(data.smallShipId);
  if (!id || (data.docked && !data.hostShipId) || (!data.docked && data.hostShipId !== null)) {
    throw new HttpsError('invalid-argument', 'Invalid small-ship docking target.');
  }
  const sessionRef = db.doc(`sessions/${data.sessionId}`);
  const requestRef = db.doc(`sessions/${data.sessionId}/smallShipRequests/${data.requestId}`);
  const fingerprint: SmallShipCommandFingerprint = {
    kind: 'dock', sessionId: data.sessionId, smallShipId: id, actorUid: uid,
    instanceId: data.instanceId, expectedRevision: data.expectedRevision,
    hostShipId: data.hostShipId, docked: data.docked,
  };
  const reply = await db.runTransaction(async tx => {
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${data.sessionId}/players/${uid}`));
    const prior = await tx.get(requestRef);
    requireSmallShipMode(session, id);
    const parsedCurrent = storedSmallShipState(session, id);
    if (hasStoredSmallShipState(session, id) && !parsedCurrent) {
      throw commandError('failed-precondition', 'The stored small-ship state is malformed. Refresh the session before operating it.', 'conflict');
    }
    const current = parsedCurrent ?? emptySmallShipState(id);
    // An undock replay arrives after the current state has already cleared its
    // host. Keep the original authority read bound to the committed receipt so
    // replay can return the exact result without reopening mutable state.
    const priorAuthorityHost = typeof prior.get('authorityHostId') === 'string'
      ? prior.get('authorityHostId') as string
      : (isRecord(prior.get('reply')) && typeof prior.get('reply')?.hostShipId === 'string'
        ? prior.get('reply')?.hostShipId as string : undefined);
    const authorityHost = data.docked ? data.hostShipId : (priorAuthorityHost ?? current.hostShipId);
    if (!authorityHost || !isResourceShipId(authorityHost) ||
        !activeVesselIdsForSession(session).includes(authorityHost)) {
      throw commandError('failed-precondition', 'Small ships must dock with an active fleet host.', 'conflict');
    }
    // Validate GM/host authority before replay so a receipt cannot disclose
    // another session's result. A completed command remains replayable after
    // its docking window advances; phase validation belongs to fresh writes.
    await requireShipCounterAuthority(tx, data.sessionId, uid, authorityHost, data.instanceId, true);
    const replay = smallShipReceiptReply(prior, fingerprint, uid);
    if (replay) return replay;
    requireSmallShipDockingPhase(session);
    if (current.dockingRevision !== data.expectedRevision) {
      const stale = {
        status: 'stale' as const, requestId: data.requestId, sessionId: data.sessionId,
        smallShipId: id, expectedRevision: data.expectedRevision,
        currentRevision: current.dockingRevision,
        ...vesselActionEnvelope(session, player, uid, id, current.dockingRevision,
          data.requestId, 'small-ship-docking', authorityHost),
      };
      tx.set(requestRef, { ...fingerprint, requestId: data.requestId, actorUid: uid, fingerprint,
        authorityHostId: authorityHost, reply: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const next: SmallShipState = {
      ...current,
      hostShipId: data.docked ? data.hostShipId : null,
      dockingRevision: current.dockingRevision + 1,
    };
    if (!data.docked && current.cycle.step !== 0) {
      throw commandError('failed-precondition', 'Finish the small-ship maintenance cycle before undocking.', 'conflict');
    }
    const committed = {
      status: 'committed' as const,
      requestId: data.requestId, sessionId: data.sessionId, smallShipId: id,
      hostShipId: next.hostShipId, docked: next.hostShipId !== null,
      expectedRevision: data.expectedRevision, committedRevision: next.dockingRevision,
      ...vesselActionEnvelope(session, player, uid, id, next.dockingRevision,
        data.requestId, 'small-ship-docking', next.hostShipId ?? undefined),
    };
    tx.update(sessionRef, {
      [`smallShipStates.${id}`]: next,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(requestRef, { ...fingerprint, requestId: data.requestId, actorUid: uid, fingerprint,
      authorityHostId: authorityHost, reply: committed, createdAt: FieldValue.serverTimestamp() });
    return committed;
  });
  return reply;
});

/** Run the four-step small-ship cycle against the docked host's resources. */
export const runSmallShipMaintenance = onCall<{
  sessionId?: unknown; smallShipId?: unknown; shipId?: unknown; requestId?: unknown; action?: unknown;
  expectedRevision?: unknown; instanceId?: unknown; foodLevel?: unknown; waterLevel?: unknown; consoles?: unknown;
  productionConsoleId?: unknown; productionOreAmount?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(key => !['sessionId', 'smallShipId', 'shipId', 'requestId', 'action', 'expectedRevision', 'instanceId', 'foodLevel', 'waterLevel', 'consoles', 'productionConsoleId', 'productionOreAmount'].includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid small-ship maintenance request.');
  }
  const parsed = requireSmallShipMaintenanceRequest(raw);
  const id = smallShipId(parsed.smallShipId);
  const consoles = requireBoundedIdList(raw.consoles, 'consoles', MAX_SMALL_SHIP_CONSOLES);
  const data = {
    ...parsed,
    ...(raw.foodLevel === undefined ? {} : { foodLevel: raw.foodLevel as number }),
    ...(raw.waterLevel === undefined ? {} : { waterLevel: raw.waterLevel as number }),
    ...(consoles === undefined ? {} : { consoles }),
  };
  const productionConsoleId = raw.productionConsoleId === undefined ? undefined : String(raw.productionConsoleId);
  const productionOreAmount = raw.productionOreAmount === undefined ? undefined : raw.productionOreAmount;
  if (!id || !['begin', 'rations', 'unrest', 'riot', 'reactor', 'production', 'end'].includes(data.action) ||
      [data.foodLevel, data.waterLevel].some(level => level !== undefined && (!Number.isSafeInteger(level) || level < 0 || level > 3)) ||
      (raw.productionConsoleId !== undefined && (data.action !== 'production' ||
        !['water-reclimator', 'hydroponics', 'fuel-processor'].includes(productionConsoleId ?? ''))) ||
      (raw.productionOreAmount !== undefined && (!Number.isSafeInteger(productionOreAmount) ||
        (productionOreAmount as number) < 1 || (productionOreAmount as number) > 5)) ||
      ((productionConsoleId === 'fuel-processor') !== (productionOreAmount !== undefined))) {
    throw new HttpsError('invalid-argument', 'Invalid small-ship maintenance choices.');
  }
  const fingerprint: SmallShipCommandFingerprint = {
    kind: 'maintenance', sessionId: data.sessionId, smallShipId: id, actorUid: uid,
    instanceId: data.instanceId ?? null, expectedRevision: data.expectedRevision,
    action: data.action, foodLevel: data.foodLevel ?? null, waterLevel: data.waterLevel ?? null,
    consoles: [...(data.consoles ?? [])],
    ...(productionConsoleId === undefined ? {} : { productionConsoleId }),
    ...(productionOreAmount === undefined ? {} : { productionOreAmount: productionOreAmount as number }),
  };
  const requestRef = db.doc(`sessions/${data.sessionId}/smallShipRequests/${data.requestId}`);
  const sessionRef = db.doc(`sessions/${data.sessionId}`);
  const preflight = await db.runTransaction(async tx => {
    const prior = await tx.get(requestRef);
    // A completed retry may arrive after a mutable small-ship projection has
    // advanced. Bind the authority read to the original host recorded in the
    // receipt, then return the stored result without rereading outcome state.
    const priorReply = isRecord(prior.get('reply')) ? prior.get('reply') : undefined;
    const priorHost = typeof priorReply?.hostShipId === 'string' ? priorReply.hostShipId : undefined;
    if (priorHost) {
      await requireShipCounterAuthority(tx, data.sessionId, uid, priorHost, data.instanceId, false);
      const replay = smallShipReceiptReply(prior, fingerprint, uid);
      if (replay) return { player: undefined, state: undefined, replay };
    }
    const { player, state } = await requireSmallShipHostAuthority(
      tx, data.sessionId, uid, data.instanceId, id,
    );
    const replay = smallShipReceiptReply(prior, fingerprint, uid);
    if (replay) return { player: undefined, state: undefined, replay };
    return { player, state, replay: undefined };
  });
  if (preflight.replay) return preflight.replay;
  const randomStep = data.action === 'unrest' || data.action === 'riot';
  const stableRolls = randomStep ? [randomInt(1, 7), randomInt(1, 7)] : [];
  const serverTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const { player, session, state } = await requireSmallShipHostAuthority(
      tx, data.sessionId, uid, data.instanceId, id,
    );
    const prior = await tx.get(requestRef);
    const replay = smallShipReceiptReply(prior, fingerprint, uid);
    if (replay) return replay;
    requireTurnOneForGameplay(session);
    requireActionPhase(session, 'maintenance', player.get('role') === 'gm' ? 'facilitator' : 'player');

    if (state.cycle.revision !== data.expectedRevision) {
      const stale = {
        status: 'stale' as const, requestId: data.requestId, sessionId: data.sessionId,
        smallShipId: id, action: data.action, expectedRevision: data.expectedRevision,
        currentRevision: state.cycle.revision,
        ...vesselActionEnvelope(session, player, uid, id, state.cycle.revision,
          data.requestId, 'small-ship-maintenance', state.hostShipId ?? undefined),
      };
      tx.set(requestRef, { ...fingerprint, requestId: data.requestId, actorUid: uid, fingerprint, reply: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const hostResources = shipResources(session.get('shipResources'))[state.hostShipId!];
    if (!hostResources) throw commandError('failed-precondition', 'The docked host resource store is unavailable.', 'conflict');
    let result: ReturnType<typeof advanceSmallShipMaintenance>;
    try {
      result = advanceSmallShipMaintenance({
        state, action: data.action, expectedRevision: data.expectedRevision,
        currentTurn: sessionTurn(session.get('currentTurn')), hostResources,
        rolls: stableRolls, foodLevel: data.foodLevel, waterLevel: data.waterLevel,
        consoles: data.consoles, productionConsoleId,
        productionOreAmount: productionOreAmount as number | undefined, now: serverTime,
      });
    } catch (cause) {
      throw commandError('failed-precondition', cause instanceof Error ? cause.message : 'Invalid small-ship maintenance action.', 'conflict');
    }
    const eventId = `small-maintenance-${data.requestId}`;
    const actorRoleId = typeof player.get('activeConsoleRoleId') === 'string'
      ? player.get('activeConsoleRoleId') as string : null;
    const reply = {
      ...result.state.cycle,
      status: 'committed' as const, requestId: data.requestId, sessionId: data.sessionId,
      smallShipId: id, hostShipId: result.state.hostShipId,
      action: data.action, expectedRevision: data.expectedRevision,
      committedRevision: result.state.cycle.revision, currentTurn: sessionTurn(session.get('currentTurn')),
      serverTime, cycle: result.state.cycle,
      result: { state: result.state, hostResources: result.hostResources },
      ...vesselActionEnvelope(session, player, uid, id, result.state.cycle.revision,
        data.requestId, 'small-ship-maintenance', result.state.hostShipId ?? undefined),
    };
    tx.update(sessionRef, {
      [`smallShipStates.${id}`]: result.state,
      [`shipResources.${state.hostShipId}`]: result.hostResources,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${data.sessionId}/events/${eventId}`), buildPrivacySafeEventRecord({
      type: 'maintenance',
      envelope: buildAuthoritativeEventEnvelope({
        sessionId: data.sessionId, actorUid: uid, actorRoleId,
        turn: sessionTurn(session.get('currentTurn')), phase: 'active', type: 'maintenance',
        requestId: data.requestId, revision: result.state.cycle.revision,
        serverTime, visibility: EventVisibility.Member,
      }),
      payload: projectMaintenanceEvent({
        shipId: id, shipName: SMALL_SHIP_RULES[id].name, action: data.action,
        results: result.state.cycle.results,
      }),
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(requestRef, { ...fingerprint, requestId: data.requestId, actorUid: uid, fingerprint, reply, eventId, serverRolls: randomStep ? stableRolls : null, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

type Voyage33MaintenanceCommandFingerprint = Readonly<{
  kind: 'maintenance';
  sessionId: string;
  actorUid: string;
  instanceId: string | null;
  expectedRevision: number;
  expectedDockingRevision: number;
  action: string;
  foodLevel: number | null;
  waterLevel: number | null;
  consoles: readonly string[];
}>;

function sameVoyage33MaintenanceFingerprint(
  value: unknown,
  expected: Voyage33MaintenanceCommandFingerprint,
): boolean {
  if (!isRecord(value)) return false;
  const consoles = value.consoles;
  return value.kind === expected.kind && value.sessionId === expected.sessionId &&
    value.actorUid === expected.actorUid && value.instanceId === expected.instanceId &&
    value.expectedRevision === expected.expectedRevision && value.action === expected.action &&
    value.expectedDockingRevision === expected.expectedDockingRevision &&
    value.foodLevel === expected.foodLevel && value.waterLevel === expected.waterLevel &&
    Array.isArray(consoles) && consoles.length === expected.consoles.length &&
    consoles.every((item, index) => item === expected.consoles[index]);
}

function voyage33MaintenanceReceiptReply(
  prior: DocumentSnapshot,
  fingerprint: Voyage33MaintenanceCommandFingerprint,
  uid: string,
): Record<string, unknown> | undefined {
  if (!prior.exists) return undefined;
  if (prior.get('actorUid') !== uid || !sameVoyage33MaintenanceFingerprint(prior.get('fingerprint'), fingerprint)) {
    throw commandError('failed-precondition', 'This request id was already used for a different Voyage 33-0 maintenance command or actor.', 'conflict');
  }
  const stored = prior.get('reply');
  if (!isRecord(stored) || !isVesselActionResult(stored)) {
    throw commandError('failed-precondition', 'This Voyage 33-0 maintenance request has no replayable result.', 'conflict');
  }
  return stored.status === 'stale' ? stored : { ...stored, status: 'replayed' };
}

function storedVoyage33MaintenanceState(session: DocumentSnapshot): Voyage33MaintenanceState | undefined {
  return parseVoyage33MaintenanceState(session.get('voyage33Maintenance'));
}

async function requireVoyage33MaintenanceAuthority(
  tx: Transaction,
  sessionId: string,
  uid: string,
  instanceId: string | undefined,
): Promise<{ player: DocumentSnapshot; session: DocumentSnapshot; state: Voyage33MaintenanceState }> {
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const [player, session] = await Promise.all([
    tx.get(db.doc(`sessions/${sessionId}/players/${uid}`)),
    tx.get(sessionRef),
  ]);
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  if (!parseVoyage33Admission(session.get('voyage33Admission'), sessionId)) {
    throw commandError('failed-precondition', 'Voyage 33-0 must be admitted before maintenance can run.', 'conflict');
  }
  const rawState = session.get('voyage33Maintenance');
  const state = storedVoyage33MaintenanceState(session);
  if (rawState !== undefined && !state) {
    throw commandError('failed-precondition', 'The stored Voyage 33-0 maintenance state is malformed; refresh the session before operating it.', 'malformed-input');
  }
  if (!state || !state.hostShipId) {
    throw commandError('failed-precondition', 'Dock Voyage 33-0 with an active fleet host before maintenance.', 'conflict');
  }
  await requireShipCounterAuthority(tx, sessionId, uid, state.hostShipId, instanceId, false);
  return { player, session, state };
}

/** Run Voyage 33-0's four-step host-funded maintenance lane. Docking remains P251. */
export const runVoyage33Maintenance = onCall<{
  sessionId?: unknown; shipId?: unknown; requestId?: unknown; action?: unknown;
  expectedRevision?: unknown; expectedDockingRevision?: unknown; instanceId?: unknown;
  foodLevel?: unknown; waterLevel?: unknown; consoles?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(key => !['sessionId', 'shipId', 'requestId', 'action', 'expectedRevision', 'expectedDockingRevision', 'instanceId', 'foodLevel', 'waterLevel', 'consoles'].includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid Voyage 33-0 maintenance request.');
  }
  const parsed = requireSmallShipMaintenanceRequest({ ...raw, smallShipId: raw.shipId });
  if (!Number.isSafeInteger(raw.expectedDockingRevision) || (raw.expectedDockingRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedDockingRevision must be a non-negative integer.');
  }
  const expectedDockingRevision = raw.expectedDockingRevision as number;
  const consoles = requireBoundedIdList(raw.consoles, 'consoles', MAX_VOYAGE_33_CONSOLES);
  if (parsed.smallShipId !== VOYAGE_33_ID || !['begin', 'rations', 'unrest', 'riot', 'reactor', 'end'].includes(parsed.action) ||
      [raw.foodLevel, raw.waterLevel].some(level => level !== undefined && (!Number.isSafeInteger(level) || (level as number) < 0 || (level as number) > 3))) {
    throw new HttpsError('invalid-argument', 'Invalid Voyage 33-0 maintenance choices.');
  }
  const fingerprint: Voyage33MaintenanceCommandFingerprint = {
    kind: 'maintenance', sessionId: parsed.sessionId, actorUid: uid,
    instanceId: parsed.instanceId ?? null, expectedRevision: parsed.expectedRevision,
    expectedDockingRevision,
    action: parsed.action, foodLevel: raw.foodLevel === undefined ? null : raw.foodLevel as number,
    waterLevel: raw.waterLevel === undefined ? null : raw.waterLevel as number,
    consoles: [...(consoles ?? [])],
  };
  const requestRef = db.doc(`sessions/${parsed.sessionId}/voyage33MaintenanceRequests/${parsed.requestId}`);
  const sessionRef = db.doc(`sessions/${parsed.sessionId}`);
  const preflight = await db.runTransaction(async tx => {
    const prior = await tx.get(requestRef);
    const priorReply = isRecord(prior.get('reply')) ? prior.get('reply') : undefined;
    const priorHost = typeof priorReply?.hostShipId === 'string' ? priorReply.hostShipId : undefined;
    if (priorHost) {
      await requireShipCounterAuthority(tx, parsed.sessionId, uid, priorHost, parsed.instanceId, false);
      const replay = voyage33MaintenanceReceiptReply(prior, fingerprint, uid);
      if (replay) return { replay, player: undefined, state: undefined };
    }
    const authority = await requireVoyage33MaintenanceAuthority(tx, parsed.sessionId, uid, parsed.instanceId);
    const replay = voyage33MaintenanceReceiptReply(prior, fingerprint, uid);
    if (replay) return { replay, player: undefined, state: undefined };
    return { replay: undefined, player: authority.player, state: authority.state };
  });
  if (preflight.replay) return preflight.replay;
  const rollCount = parsed.action === 'unrest' ? 2 : parsed.action === 'riot' ? 1 : 0;
  const stableRolls = Array.from({ length: rollCount }, () => randomInt(1, 7));
  const serverTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const authority = await requireVoyage33MaintenanceAuthority(tx, parsed.sessionId, uid, parsed.instanceId);
    const prior = await tx.get(requestRef);
    const replay = voyage33MaintenanceReceiptReply(prior, fingerprint, uid);
    if (replay) return replay;
    requireTurnOneForGameplay(authority.session);
    requireActionPhase(authority.session, 'maintenance', authority.player.get('role') === 'gm' ? 'facilitator' : 'player');
    if (authority.state.dockingRevision !== expectedDockingRevision) {
      const stale = {
        status: 'stale' as const, requestId: parsed.requestId, sessionId: parsed.sessionId,
        shipId: VOYAGE_33_ID, action: parsed.action, expectedRevision: parsed.expectedRevision,
        currentRevision: authority.state.cycle.revision,
        expectedDockingRevision, currentDockingRevision: authority.state.dockingRevision,
        ...vesselActionEnvelope(authority.session, authority.player, uid, VOYAGE_33_ID,
          authority.state.cycle.revision, parsed.requestId, 'voyage-33-maintenance', authority.state.hostShipId ?? undefined),
      };
      tx.set(requestRef, { ...fingerprint, requestId: parsed.requestId, actorUid: uid, fingerprint, reply: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    if (authority.state.cycle.revision !== parsed.expectedRevision) {
      const stale = {
        status: 'stale' as const, requestId: parsed.requestId, sessionId: parsed.sessionId,
        shipId: VOYAGE_33_ID, action: parsed.action, expectedRevision: parsed.expectedRevision,
        currentRevision: authority.state.cycle.revision,
        expectedDockingRevision, currentDockingRevision: authority.state.dockingRevision,
        ...vesselActionEnvelope(authority.session, authority.player, uid, VOYAGE_33_ID,
          authority.state.cycle.revision, parsed.requestId, 'voyage-33-maintenance', authority.state.hostShipId ?? undefined),
      };
      tx.set(requestRef, { ...fingerprint, requestId: parsed.requestId, actorUid: uid, fingerprint, reply: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const hostShipId = authority.state.hostShipId;
    if (!hostShipId) throw commandError('failed-precondition', 'Dock Voyage 33-0 with an active fleet host before maintenance.', 'conflict');
    const hostResources = shipResources(authority.session.get('shipResources'))[hostShipId];
    if (!hostResources) throw commandError('failed-precondition', 'The docked host resource store is unavailable.', 'conflict');
    let result: ReturnType<typeof advanceVoyage33Maintenance>;
    try {
      result = advanceVoyage33Maintenance({
        state: authority.state, action: parsed.action, expectedRevision: parsed.expectedRevision,
        currentTurn: sessionTurn(authority.session.get('currentTurn')), hostResources,
        rolls: stableRolls, foodLevel: raw.foodLevel as number | undefined,
        waterLevel: raw.waterLevel as number | undefined, consoles, now: serverTime,
      });
    } catch (cause) {
      throw commandError('failed-precondition', cause instanceof Error ? cause.message : 'Invalid Voyage 33-0 maintenance action.', 'conflict');
    }
    const eventId = `voyage33-maintenance-${parsed.requestId}`;
    const actorRoleId = typeof authority.player.get('activeConsoleRoleId') === 'string'
      ? authority.player.get('activeConsoleRoleId') as string : null;
    const reply = {
      ...result.state.cycle,
      status: 'committed' as const, requestId: parsed.requestId, sessionId: parsed.sessionId,
      shipId: VOYAGE_33_ID, hostShipId: result.state.hostShipId, action: parsed.action,
      expectedRevision: parsed.expectedRevision, committedRevision: result.state.cycle.revision,
      expectedDockingRevision, currentDockingRevision: result.state.dockingRevision,
      currentTurn: sessionTurn(authority.session.get('currentTurn')), serverTime,
      cycle: result.state.cycle, result: { state: result.state, hostResources: result.hostResources },
      ...vesselActionEnvelope(authority.session, authority.player, uid, VOYAGE_33_ID,
        result.state.cycle.revision, parsed.requestId, 'voyage-33-maintenance', result.state.hostShipId ?? undefined),
    };
    tx.update(sessionRef, {
      voyage33Maintenance: result.state,
      [`shipResources.${hostShipId}`]: result.hostResources,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${parsed.sessionId}/events/${eventId}`), buildPrivacySafeEventRecord({
      type: 'maintenance',
      envelope: buildAuthoritativeEventEnvelope({
        sessionId: parsed.sessionId, actorUid: uid, actorRoleId,
        turn: sessionTurn(authority.session.get('currentTurn')), phase: 'active', type: 'maintenance',
        requestId: parsed.requestId, revision: result.state.cycle.revision,
        serverTime, visibility: EventVisibility.Member,
      }),
      payload: projectMaintenanceEvent({
        shipId: VOYAGE_33_ID, shipName: 'Voyage 33-0', action: parsed.action,
        results: result.state.cycle.results,
      }),
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(requestRef, { ...fingerprint, requestId: parsed.requestId, actorUid: uid,
      fingerprint, reply, eventId, serverRolls: rollCount > 0 ? stableRolls : null,
      createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

type VulcanLabourCommandFingerprint = Readonly<{
  kind: 'additional-labour';
  sessionId: string;
  actorUid: string;
  instanceId: string | null;
  expectedRevision: number;
  targetExpectedRevision: number;
  sourceConsoleId: string;
  targetShipId: string;
  targetConsoleId: string;
  productionScrap: boolean | null;
  productionOreAmount: number | null;
}>;

function sameVulcanLabourFingerprint(
  value: unknown,
  expected: VulcanLabourCommandFingerprint,
): boolean {
  if (!isRecord(value)) return false;
  return value.kind === expected.kind && value.sessionId === expected.sessionId &&
    value.actorUid === expected.actorUid && value.instanceId === expected.instanceId &&
    value.expectedRevision === expected.expectedRevision &&
    value.targetExpectedRevision === expected.targetExpectedRevision &&
    value.sourceConsoleId === expected.sourceConsoleId &&
    value.targetShipId === expected.targetShipId && value.targetConsoleId === expected.targetConsoleId &&
    (value.productionScrap ?? null) === expected.productionScrap &&
    (value.productionOreAmount ?? null) === expected.productionOreAmount;
}

function vulcanLabourReceiptReply(
  prior: DocumentSnapshot,
  fingerprint: VulcanLabourCommandFingerprint,
  uid: string,
): Record<string, unknown> | undefined {
  if (!prior.exists) return undefined;
  if (prior.get('actorUid') !== uid || !sameVulcanLabourFingerprint(prior.get('fingerprint'), fingerprint)) {
    throw commandError('failed-precondition', 'This request id was already used for a different Additional Labour command or actor.', 'conflict');
  }
  const stored = prior.get('reply');
  if (!isRecord(stored) || !isVesselActionResult(stored)) {
    throw commandError('failed-precondition', 'This Additional Labour request has no replayable result.', 'conflict');
  }
  return stored.status === 'stale' ? stored : { ...stored, status: 'replayed' };
}

async function requireVulcanLabourAuthority(
  tx: Transaction,
  sessionId: string,
  uid: string,
  instanceId: string | undefined,
): Promise<{ player: DocumentSnapshot; session: DocumentSnapshot; state: SmallShipState }> {
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const [player, session] = await Promise.all([
    tx.get(db.doc(`sessions/${sessionId}/players/${uid}`)),
    tx.get(sessionRef),
  ]);
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role')))) {
    throw new HttpsError('permission-denied', 'An active Vulcan Captain or GM is required.');
  }
  requirePlayerShipActionAuthority(player);
  if (player.get('role') === 'gm') {
    if (!instanceId || !isLiveGmInstance(
      await tx.get(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`)), player, uid,
    )) {
      throw new HttpsError('permission-denied', 'Active GM instance required.');
    }
  } else if (!isActivePlayer(player) || player.get('replacementRoleId') !== 'vulcan-captain' ||
    player.get('activeConsoleRoleId') !== null) {
    throw new HttpsError('permission-denied', 'An active Vulcan Captain replacement role is required.');
  }
  const state = storedSmallShipState(session, 'vulcan');
  if (hasStoredSmallShipState(session, 'vulcan') && !state) {
    throw commandError('failed-precondition', 'The stored Vulcan state is malformed. Refresh the session before operating it.', 'conflict');
  }
  if (!state?.hostShipId || !isResourceShipId(state.hostShipId) ||
      !activeVesselIdsForSession(session).includes(state.hostShipId)) {
    throw commandError('failed-precondition', 'Vulcan must remain docked with an active fleet host.', 'conflict');
  }
  return { player, session, state: state ?? emptySmallShipState('vulcan') };
}

/** Resolve one of Vulcan's two Coordination-phase Additional Labour charges. */
export const runVulcanAdditionalLabour = onCall<{
  sessionId?: unknown; requestId?: unknown; instanceId?: unknown; expectedRevision?: unknown;
  targetExpectedRevision?: unknown; sourceConsoleId?: unknown; targetShipId?: unknown;
  targetConsoleId?: unknown; productionScrap?: unknown; productionOreAmount?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  const allowed = [
    'sessionId', 'requestId', 'instanceId', 'expectedRevision', 'targetExpectedRevision',
    'sourceConsoleId', 'targetShipId', 'targetConsoleId', 'productionScrap', 'productionOreAmount',
  ];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(key => !allowed.includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid Additional Labour request.');
  }
  const data = requireVulcanAdditionalLabourRequest(raw);
  if (!VULCAN_ADDITIONAL_LABOUR_CONSOLES.includes(data.sourceConsoleId as VulcanAdditionalLabourConsole) ||
      (data.instanceId !== undefined && !/^[\w-]{1,128}$/.test(data.instanceId)) ||
      ((data.targetConsoleId === 'fuel-refinery' || data.targetConsoleId === 'fuel-refinery-ii') !==
        (data.productionOreAmount !== undefined))) {
    throw new HttpsError('invalid-argument', 'Invalid Additional Labour console or GM instance.');
  }
  const fingerprint: VulcanLabourCommandFingerprint = {
    kind: 'additional-labour', sessionId: data.sessionId, actorUid: uid,
    instanceId: data.instanceId ?? null, expectedRevision: data.expectedRevision,
    targetExpectedRevision: data.targetExpectedRevision, sourceConsoleId: data.sourceConsoleId,
    targetShipId: data.targetShipId, targetConsoleId: data.targetConsoleId,
    productionScrap: data.productionScrap ?? null,
    productionOreAmount: data.productionOreAmount ?? null,
  };
  const sessionRef = db.doc(`sessions/${data.sessionId}`);
  const requestRef = db.doc(`sessions/${data.sessionId}/vulcanLabourRequests/${data.requestId}`);
  const preflight = await db.runTransaction(async tx => {
    const { player, session, state } = await requireVulcanLabourAuthority(
      tx, data.sessionId, uid, data.instanceId,
    );
    const prior = await tx.get(requestRef);
    const replay = vulcanLabourReceiptReply(prior, fingerprint, uid);
    return { player, session, state, replay };
  });
  if (preflight.replay) return preflight.replay;
  const serverTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const { player, session, state } = await requireVulcanLabourAuthority(
      tx, data.sessionId, uid, data.instanceId,
    );
    const prior = await tx.get(requestRef);
    const replay = vulcanLabourReceiptReply(prior, fingerprint, uid);
    if (replay) return replay;
    requireTurnOneForGameplay(session);
    requireActionPhase(session, 'transfer', player.get('role') === 'gm' ? 'facilitator' : 'player');

    if (!isResourceShipId(data.targetShipId) || data.targetShipId === 'vulcan' ||
        !activeVesselIdsForSession(session).includes(data.targetShipId)) {
      throw commandError('failed-precondition', 'Choose another active fleet ship.', 'conflict');
    }
    const currentSourceCycle = state.cycle;
    const currentTargetRaw = isRecord(session.get('maintenanceCycles'))
      ? (session.get('maintenanceCycles') as Record<string, unknown>)[data.targetShipId]
      : undefined;
    if (currentTargetRaw !== undefined && !parseMaintenanceCycle(currentTargetRaw)) {
      throw commandError('failed-precondition', 'The target maintenance cycle is malformed. Refresh the session before operating it.', 'conflict');
    }
    const currentTarget = parseMaintenanceCycle(currentTargetRaw) ?? emptyTargetMaintenanceCycle();
    if (currentSourceCycle.revision !== data.expectedRevision ||
        currentTarget.revision !== data.targetExpectedRevision) {
      const stale = {
        status: 'stale' as const, sessionId: data.sessionId, requestId: data.requestId,
        expectedRevision: data.expectedRevision, currentRevision: currentSourceCycle.revision,
        targetExpectedRevision: data.targetExpectedRevision, targetCurrentRevision: currentTarget.revision,
        targetShipId: data.targetShipId, targetConsoleId: data.targetConsoleId,
        ...vesselActionEnvelope(session, player, uid, 'vulcan', currentSourceCycle.revision,
          data.requestId, 'vulcan-additional-labour', state.hostShipId ?? undefined),
      };
      tx.set(requestRef, { ...fingerprint, requestId: data.requestId, actorUid: uid, fingerprint,
        reply: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const resources = shipResources(session.get('shipResources'))[data.targetShipId];
    if (!resources) throw commandError('failed-precondition', 'The target resource ledger is unavailable.', 'conflict');
    const damages = shipDamage(session.get('shipDamage'))[data.targetShipId] ?? { damagedSystemIds: [], destroyed: false };
    const unrest = shipUnrest(session.get('shipUnrest'))[data.targetShipId] ?? 0;
    const population = populationForShip(data.targetShipId, session.get('shipSurvivors')) ?? 0;
    const upgrades = isRecord(session.get('shipUpgrades')) && Array.isArray(
      (session.get('shipUpgrades') as Record<string, unknown>)[data.targetShipId],
    ) ? (session.get('shipUpgrades') as Record<string, unknown>)[data.targetShipId] as string[] : [];
    let result: ReturnType<typeof applyVulcanAdditionalLabour>;
    try {
      result = applyVulcanAdditionalLabour({
        sourceCycle: currentSourceCycle, sourceConsoleId: data.sourceConsoleId as VulcanAdditionalLabourConsole,
        currentTurn: sessionTurn(session.get('currentTurn')), targetShipId: data.targetShipId,
        targetConsoleId: data.targetConsoleId, targetCycle: currentTarget, targetResources: resources,
        targetDamage: damages, targetUnrest: unrest, targetPopulation: population,
        targetDockings: Array.isArray(session.get('shuttleDockings')) ? session.get('shuttleDockings') as { shipId: string; shuttleId: string }[] : [],
        targetCargo: isRecord(session.get('shuttleCargo')) ? session.get('shuttleCargo') as Record<string, Record<string, number>> : {},
        targetFuelled: isRecord(session.get('shuttleFuelled')) ? session.get('shuttleFuelled') as Record<string, boolean> : {},
        targetUpgrades: upgrades, now: serverTime, productionScrap: data.productionScrap,
        productionOreAmount: data.productionOreAmount,
      });
    } catch (cause) {
      throw commandError('failed-precondition', cause instanceof Error ? cause.message : 'Additional Labour failed.', 'conflict');
    }
    const eventId = `vulcan-additional-labour-${data.requestId}`;
    const actorRoleId = typeof player.get('activeConsoleRoleId') === 'string'
      ? player.get('activeConsoleRoleId') as string : null;
    const reply = {
      status: 'committed' as const, sessionId: data.sessionId, requestId: data.requestId,
      sourceConsoleId: data.sourceConsoleId, targetShipId: data.targetShipId,
      targetConsoleId: data.targetConsoleId, immediate: result.immediate, message: result.message,
      expectedRevision: data.expectedRevision, committedRevision: result.sourceCycle.revision,
      targetExpectedRevision: data.targetExpectedRevision, targetCommittedRevision: result.targetCycle.revision,
      currentTurn: sessionTurn(session.get('currentTurn')), serverTime, cycle: result.sourceCycle,
      ...vesselActionEnvelope(session, player, uid, 'vulcan', result.sourceCycle.revision,
        data.requestId, 'vulcan-additional-labour', state.hostShipId ?? undefined),
    };
    tx.update(sessionRef, {
      [`smallShipStates.vulcan.cycle`]: result.sourceCycle,
      [`maintenanceCycles.${data.targetShipId}`]: result.targetCycle,
      [`shipResources.${data.targetShipId}`]: result.targetResources,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${data.sessionId}/events/${eventId}`), buildPrivacySafeEventRecord({
      type: 'maintenance',
      envelope: buildAuthoritativeEventEnvelope({
        sessionId: data.sessionId, actorUid: uid, actorRoleId,
        turn: sessionTurn(session.get('currentTurn')), phase: 'active', type: 'maintenance',
        requestId: data.requestId, revision: result.sourceCycle.revision,
        serverTime, visibility: EventVisibility.Member,
      }),
      payload: projectMaintenanceEvent({
        shipId: 'vulcan', shipName: SMALL_SHIP_RULES.vulcan.name, action: 'additional-labour',
        results: { '5': result.message },
      }),
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(requestRef, { ...fingerprint, requestId: data.requestId, actorUid: uid,
      fingerprint, reply, eventId, createdAt: FieldValue.serverTimestamp() });
    return reply;
  });
});

type MaintenanceRequestFingerprint = Readonly<{
  sessionId: string;
  shipId: string;
  actorUid: string;
  action: string;
  expectedRevision: number;
  instanceId: string | null;
  foodLevel: number | null;
  waterLevel: number | null;
  consoles: readonly string[];
  refuels: readonly (readonly [string, string])[];
  productionConsoleId: string | null;
  productionMode: 'run' | 'skip' | null;
  productionScrap: boolean | null;
  productionOreAmount: number | null;
  consoleRoleId: string | null;
}>;

type MaintenanceCommand = ReturnType<typeof requireMaintenanceRequest> & {
  foodLevel?: number;
  waterLevel?: number;
  consoles?: string[];
  refuels?: Record<string, string>;
  productionConsoleId?: string;
  productionMode?: 'run' | 'skip';
  productionScrap?: boolean;
  productionOreAmount?: number;
  consoleRoleId?: string;
};

function maintenanceRequestFingerprint(command: MaintenanceCommand, actorUid: string): MaintenanceRequestFingerprint {
  return {
    sessionId: command.sessionId,
    shipId: command.shipId,
    actorUid,
    action: command.action,
    expectedRevision: command.expectedRevision,
    instanceId: command.instanceId ?? null,
    foodLevel: command.foodLevel ?? null,
    waterLevel: command.waterLevel ?? null,
    consoles: [...(command.consoles ?? [])],
    refuels: Object.entries(command.refuels ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    productionConsoleId: command.productionConsoleId ?? null,
    productionMode: command.productionMode ?? null,
    productionScrap: command.productionScrap ?? null,
    productionOreAmount: command.productionOreAmount ?? null,
    consoleRoleId: command.consoleRoleId ?? null,
  };
}

function sameMaintenanceRequestFingerprint(
  value: unknown,
  expected: MaintenanceRequestFingerprint,
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const samePairs = (stored: unknown, wanted: readonly (readonly [string, string])[]) =>
    Array.isArray(stored) && stored.length === wanted.length && stored.every((pair, index) =>
      Array.isArray(pair) && pair.length === 2 && pair[0] === wanted[index]?.[0] && pair[1] === wanted[index]?.[1]);
  return candidate.sessionId === expected.sessionId &&
    candidate.shipId === expected.shipId &&
    candidate.actorUid === expected.actorUid &&
    candidate.action === expected.action &&
    candidate.expectedRevision === expected.expectedRevision &&
    candidate.instanceId === expected.instanceId &&
    candidate.foodLevel === expected.foodLevel &&
    candidate.waterLevel === expected.waterLevel &&
    Array.isArray(candidate.consoles) && candidate.consoles.length === expected.consoles.length &&
    candidate.consoles.every((item, index) => item === expected.consoles[index]) &&
    samePairs(candidate.refuels, expected.refuels) &&
    candidate.productionConsoleId === expected.productionConsoleId &&
    candidate.productionMode === expected.productionMode &&
    (candidate.productionScrap ?? null) === expected.productionScrap &&
    (candidate.productionOreAmount ?? null) === expected.productionOreAmount &&
    candidate.consoleRoleId === expected.consoleRoleId;
}

type MaintenanceAuthority = Readonly<{
  player: DocumentSnapshot;
  snapshot: DocumentSnapshot;
}>;

async function requireMaintenanceAuthority(
  tx: Transaction,
  sessionId: string,
  shipId: string,
  instanceId: string | undefined,
  consoleRoleId: string | undefined,
  uid: string,
  sessionRef: DocumentReference,
): Promise<MaintenanceAuthority> {
  const [player, snapshot] = await Promise.all([
    tx.get(db.doc(`sessions/${sessionId}/players/${uid}`)),
    tx.get(sessionRef),
  ]);
  if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role')))) {
    throw new HttpsError('permission-denied', 'An active ship officer or GM is required.');
  }
  if (!snapshot.exists) throw new HttpsError('not-found', 'No such session.');
  requirePlayerShipActionAuthority(player);
  const ownRoleId = String(player.get('activeConsoleRoleId') ?? '');
  const replacementVipHost = player.get('role') === 'player' && shipId === 'dione' &&
    player.get('replacementRoleId') === 'vip-host' && player.get('activeConsoleRoleId') === null;
  const activeRoleIds = (snapshot.get('activeRoleIds') as string[] | undefined) ??
    DEFAULT_ACTIVE_ROLE_IDS;
  const joint = player.get('role') === 'player' &&
    isJointEngineeringRoleAvailable(activeRoleIds, ownRoleId) &&
    jointEngineeringShipsForRole(ownRoleId).includes(shipId);
  if (!joint && !replacementVipHost) {
    await requireShipCounterAuthority(
      tx, sessionId, uid, shipId, instanceId, false, player.get('role') === 'gm',
    );
  }
  if (consoleRoleId && player.get('role') !== 'gm') {
    if (replacementVipHost) {
      if (consoleRoleId !== 'vip-host') {
        throw new HttpsError('permission-denied', 'VIP Host may only use the Dione VIP Lounge authority.');
      }
    } else if (joint) {
      if (consoleRoleId !== ownRoleId) {
        throw new HttpsError('permission-denied', 'Joint Engineering may only use its assigned console.');
      }
    } else {
      await requireConsoleAuthority(tx, sessionId, player, consoleRoleId);
    }
  }
  return { player, snapshot };
}

function maintenanceReceiptReply(
  prior: DocumentSnapshot,
  fingerprint: MaintenanceRequestFingerprint,
  uid: string,
  sessionId: string,
  shipId: string,
): Record<string, unknown> | undefined {
  if (!prior.exists) return undefined;
  if (
    prior.get('sessionId') !== sessionId ||
    prior.get('shipId') !== shipId ||
    prior.get('actorUid') !== uid ||
    !sameMaintenanceRequestFingerprint(prior.get('fingerprint'), fingerprint)
  ) {
    throw commandError('failed-precondition', 'This request id was already used for a different maintenance command or actor.', 'conflict');
  }
  const storedReply = prior.get('reply');
  if (typeof storedReply !== 'object' || storedReply === null || Array.isArray(storedReply)) {
    throw commandError('failed-precondition', 'This maintenance request has no replayable result.', 'conflict');
  }
  const reply = storedReply as Record<string, unknown>;
  if (!isVesselActionResult(reply)) {
    throw commandError('failed-precondition', 'This maintenance request has no complete replayable vessel envelope.', 'conflict');
  }
  return reply.status === 'stale' ? reply : { ...reply, status: 'replayed' };
}

/** One atomic, revision-checked maintenance action. Dice are never supplied by a client. */
export const runMaintenance = onCall<{
  sessionId?: unknown; shipId?: unknown; requestId?: unknown; action?: unknown; expectedRevision?: unknown;
  instanceId?: unknown; foodLevel?: unknown; waterLevel?: unknown;
  consoles?: unknown; refuels?: unknown; productionConsoleId?: unknown; productionMode?: unknown; productionScrap?: unknown; productionOreAmount?: unknown; consoleRoleId?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  const allowed = ['sessionId', 'shipId', 'requestId', 'action', 'expectedRevision', 'instanceId', 'foodLevel', 'waterLevel', 'consoles', 'refuels', 'productionConsoleId', 'productionMode', 'productionScrap', 'productionOreAmount', 'consoleRoleId'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !allowed.includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid maintenance request.');
  }
  const parsed = requireMaintenanceRequest(raw);
  const consoles = requireBoundedIdList(raw.consoles, 'consoles', MAX_MAINTENANCE_CONSOLES);
  const refuels = requireBoundedIdMap(raw.refuels, 'refuels', MAX_MAINTENANCE_REFUELS, true);
  const data: MaintenanceCommand = {
    ...parsed,
    ...(raw.foodLevel === undefined ? {} : { foodLevel: raw.foodLevel as number }),
    ...(raw.waterLevel === undefined ? {} : { waterLevel: raw.waterLevel as number }),
    ...(consoles === undefined ? {} : { consoles }),
    ...(refuels === undefined ? {} : { refuels }),
    ...(raw.productionConsoleId === undefined ? {} : { productionConsoleId: raw.productionConsoleId as string }),
    ...(raw.productionMode === undefined ? {} : { productionMode: raw.productionMode as 'run' | 'skip' }),
    ...(raw.productionScrap === undefined ? {} : { productionScrap: raw.productionScrap as boolean }),
    ...(raw.productionOreAmount === undefined ? {} : { productionOreAmount: raw.productionOreAmount as number }),
    ...(raw.consoleRoleId === undefined ? {} : { consoleRoleId: raw.consoleRoleId as string }),
  };
  if (!MAINTENANCE_RULES[data.shipId] ||
    (data.consoleRoleId !== undefined && (
      typeof data.consoleRoleId !== 'string' ||
      (shipForRole(data.consoleRoleId) !== data.shipId &&
        !jointEngineeringShipsForRole(data.consoleRoleId).includes(data.shipId))
    )) ||
    (data.instanceId !== undefined && !/^[\w-]{1,128}$/.test(data.instanceId)) ||
    [data.foodLevel, data.waterLevel].some(level => level !== undefined && (!Number.isInteger(level) || level < 0 || level > 3)) ||
    (data.productionConsoleId !== undefined && (typeof data.productionConsoleId !== 'string' || !(
      (data.shipId === 'dione' && ['hydroponics', 'water-reclamation'].includes(data.productionConsoleId)) ||
      (data.shipId === 'icebreaker' && ['hydroponics', 'water-reclamation', 'mining-drone-control'].includes(data.productionConsoleId)) ||
      (data.shipId === 'shepherd' && ['water-reclamation', 'advanced-hydroponics', 'advanced-hydroponics-ii'].includes(data.productionConsoleId)) ||
      (data.shipId === 'quellon' && ['hydroponics', 'water-production', 'water-production-ii'].includes(data.productionConsoleId)) ||
      (data.shipId === 'refinery-124' && ['hydroponics', 'water-reclamation', 'fuel-refinery', 'fuel-refinery-ii'].includes(data.productionConsoleId)) ||
      (data.shipId === 'capybara' && ['advanced-hydroponics', 'water-production', 'scrap-refinery'].includes(data.productionConsoleId))
    ))) ||
    (data.productionMode !== undefined && data.productionMode !== 'run' && data.productionMode !== 'skip') ||
    (data.productionScrap !== undefined && typeof data.productionScrap !== 'boolean') ||
    (data.productionOreAmount !== undefined && (!Number.isSafeInteger(data.productionOreAmount) || data.productionOreAmount < 1 || data.productionOreAmount > 15)) ||
    (data.action !== 'production' && [data.productionConsoleId, data.productionMode, data.productionScrap, data.productionOreAmount]
      .some(value => value !== undefined)) ||
    ((data.productionConsoleId === 'fuel-refinery' || data.productionConsoleId === 'fuel-refinery-ii') &&
      data.productionMode !== 'skip' && data.productionOreAmount === undefined) ||
    (data.productionOreAmount !== undefined &&
      data.productionConsoleId !== 'fuel-refinery' && data.productionConsoleId !== 'fuel-refinery-ii') ||
    (data.consoleRoleId !== undefined && !/^[\w-]{1,128}$/.test(data.consoleRoleId))) {
    throw new HttpsError('invalid-argument', 'Invalid maintenance request.');
  }
  const fingerprint = maintenanceRequestFingerprint(data, uid);
  const eventId = `maintenance-${data.requestId}`;
  const ref = db.doc(`sessions/${data.sessionId}`);
  const requestRef = db.doc(`sessions/${data.sessionId}/maintenanceRequests/${data.requestId}`);
  const eventRef = db.doc(`sessions/${data.sessionId}/events/${eventId}`);
  // Validate authority and replay before capturing server inputs. A replay must
  // not consume a new clock value or random draw, even if mutable game state
  // has since moved on.
  const preflightReply = await db.runTransaction(async tx => {
    await requireMaintenanceAuthority(
      tx, data.sessionId, data.shipId, data.instanceId, data.consoleRoleId, uid, ref,
    );
    const prior = await tx.get(requestRef);
    return maintenanceReceiptReply(prior, fingerprint, uid, data.sessionId, data.shipId) ?? null;
  });
  if (preflightReply) return preflightReply;

  // These server-owned values are fixed after request/authority validation and
  // before the mutating transaction, so callback retries cannot reroll or
  // replace the timestamp. Non-random steps intentionally avoid random draws.
  const stableOccurredAt = new Date().toISOString();
  const randomStep = data.action === 'unrest' || data.action === 'riot';
  const stableEntropy = randomStep
    ? randomInt(0, 0x1_0000_0000) / 0x1_0000_0000 : 0;
  const stableRolls = randomStep ? [randomInt(1, 7), randomInt(1, 7)] : [0, 0];

  return db.runTransaction(async tx => {
    const { player, snapshot } = await requireMaintenanceAuthority(
      tx, data.sessionId, data.shipId, data.instanceId, data.consoleRoleId, uid, ref,
    );
    const prior = await tx.get(requestRef);
    const replay = maintenanceReceiptReply(prior, fingerprint, uid, data.sessionId, data.shipId);
    if (replay) return replay;
    requireTurnOneForGameplay(snapshot);
    requireActionPhase(snapshot, 'maintenance', player.get('role') === 'gm' ? 'facilitator' : 'player');

    if ((data.shipId === 'dione' && snapshot.get('dioneEnabled') === false) ||
        (data.shipId === 'capybara' && snapshot.get('capybaraEnabled') === false) ||
        snapshot.get('phase') === 'closed') {
      throw commandError(
        'failed-precondition',
        'This ship is unavailable.',
        snapshot.get('phase') === 'closed' ? 'terminal-session' : 'conflict',
      );
    }
    const current = (snapshot.get('maintenanceCycles') ?? {}) as Record<string, MaintenanceCycle>;
    const currentTurn = sessionTurn(snapshot.get('currentTurn'));
    const currentCycle = current[data.shipId] ?? emptyMaintenanceCycle();
    if (currentCycle.revision !== data.expectedRevision) {
      const reply = {
        status: 'stale' as const,
        requestId: data.requestId,
        sessionId: data.sessionId,
        shipId: data.shipId,
        action: data.action,
        expectedRevision: data.expectedRevision,
        currentRevision: currentCycle.revision,
        ...vesselActionEnvelope(snapshot, player, uid, data.shipId, currentCycle.revision,
          data.requestId, 'maintenance'),
      };
      tx.set(requestRef, {
        ...fingerprint,
        requestId: data.requestId,
        sessionId: data.sessionId,
        shipId: data.shipId,
        actorUid: uid,
        expectedRevision: data.expectedRevision,
        currentRevision: currentCycle.revision,
        turn: currentTurn,
        phase: 'active',
        serverTime: stableOccurredAt,
        serverEntropy: randomStep ? stableEntropy : null,
        serverRolls: randomStep ? stableRolls : null,
        eventId,
        fingerprint,
        reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      return reply;
    }
    const population = populationForShip(data.shipId, snapshot.get('shipSurvivors'))!;
    const unrest = shipUnrest(snapshot.get('shipUnrest'))[data.shipId]!;
    const currentDamage = shipDamage(snapshot.get('shipDamage'))[data.shipId] ?? {
      damagedSystemIds: [], destroyed: false,
    };
    const unrestAlerts = { ...(snapshot.get('unrestAlerts') ?? {}) } as Record<string, StoredUnrestAlert>;
    const populationAlerts = { ...(snapshot.get('populationAlerts') ?? {}) } as Record<string, StoredPopulationAlert>;
    if (unrestAlerts[data.shipId] || populationAlerts[data.shipId]) {
      throw commandError('failed-precondition', 'A GM must acknowledge the ship alert first.', 'invalid-phase');
    }
    const serverTime = stableOccurredAt;
    const activeRoleIds = sessionActiveRoleIds(snapshot);
    let result: ReturnType<typeof advanceMaintenance>;
    try {
      result = advanceMaintenance({
        ...data, cycle: currentCycle, currentTurn,
        resources: shipResources(snapshot.get('shipResources'))[data.shipId]!,
        damage: currentDamage,
        unrest, population, dockings: snapshot.get('shuttleDockings') ?? [],
        cargo: sanitizeShuttleCargo(snapshot.get('shuttleCargo'), activeRoleIds),
        fuelled: snapshot.get('shuttleFuelled') ?? {},
        upgraded: (snapshot.get('shipUpgrades') ?? {})[data.shipId] ?? [], rolls: stableRolls,
        entropy: stableEntropy, now: serverTime, damageDrawId: eventId,
      });
    } catch (cause) {
      throw commandError('failed-precondition', cause instanceof Error ? cause.message : 'Maintenance failed.', 'conflict');
    }
    result = { ...result, cargo: sanitizeShuttleCargo(result.cargo, activeRoleIds) };
    let catastropheEventExists = false;
    if (result.damageDraw?.destroyed && currentDamage.destroyed) {
      catastropheEventExists = (await tx.get(
        db.doc(`sessions/${data.sessionId}/damageDraws/${destructionTransition(data.shipId, true, false).eventId}`),
      )).exists;
    }
    const destruction = result.damageDraw?.destroyed
      ? destructionTransition(data.shipId, currentDamage.destroyed, catastropheEventExists)
      : undefined;
    if (destruction && result.cycle.damageDrawId !== destruction.eventId) {
      result = { ...result, cycle: { ...result.cycle, damageDrawId: destruction.eventId } };
    }
    const affectedPlayers = destruction && !currentDamage.destroyed
      ? await tx.get(db.collection(`sessions/${data.sessionId}/players`))
      : undefined;
    const populationThreshold = result.population !== population && populationTrackForShip(data.shipId)?.thresholds.includes(result.population);
    if ((unrest < 8 && result.unrest >= 8) || populationThreshold) {
      const instances = await tx.get(db.collection(`sessions/${data.sessionId}/gmInstances`));
      const targetGmInstanceIds = instances.docs.map(instance => instance.id);
      if (targetGmInstanceIds.length) {
        const alert = { shipId: data.shipId, shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[data.shipId] ?? data.shipId, targetGmInstanceIds, createdAt: serverTime };
        if (unrest < 8 && result.unrest >= 8) unrestAlerts[data.shipId] = alert;
        if (populationThreshold) populationAlerts[data.shipId] = { ...alert, population: result.population };
      }
    }
    const undoRef = db.doc(`sessions/${data.sessionId}/maintenanceUndo/${data.shipId}`);
    const undo = await tx.get(undoRef);
    const patch = {
      [`maintenanceCycles.${data.shipId}`]: result.cycle,
      [`shipResources.${data.shipId}`]: result.resources,
      [`shipDamage.${data.shipId}`]: result.damage,
      [`shipUnrest.${data.shipId}`]: result.unrest,
      [`shipSurvivors.${data.shipId}`]: result.population,
      shuttleCargo: result.cargo, shuttleFuelled: result.fuelled,
      unrestAlerts, populationAlerts,
    };
    const terminalPatch = destruction && !currentDamage.destroyed
      ? totalFleetLossTerminalPatch(data.sessionId, snapshot, data.shipId, result.damage, serverTime)
      : {};
    const entries = data.action === 'begin' ? [] : (undo.get('entries') ?? []) as Array<{ fields: MaintenanceUndoField[] }>;
    const immutableFields = result.damageDraw ? [
      `shipDamage.${data.shipId}`,
      `shipSurvivors.${data.shipId}`,
      `shipUnrest.${data.shipId}`,
      'unrestAlerts',
      'populationAlerts',
    ] : [];
    entries.push({ fields: captureMaintenanceUndo(field => snapshot.get(field), patch, immutableFields) });
    if (destruction && !currentDamage.destroyed) {
      markPlayersForShipEscape(
        tx,
        affectedPlayers?.docs ?? [],
        data.shipId,
        destruction.eventId,
        result.cycle.revision,
      );
    }
    const actorRoleId = typeof player.get('activeConsoleRoleId') === 'string'
      ? player.get('activeConsoleRoleId') as string : null;
    const reply = {
      ...result.cycle,
      status: 'committed' as const,
      requestId: data.requestId,
      sessionId: data.sessionId,
      shipId: data.shipId,
      action: data.action,
      expectedRevision: data.expectedRevision,
      committedRevision: result.cycle.revision,
      currentTurn,
      serverTime,
      cycle: result.cycle,
      result: {
        resources: result.resources, damage: result.damage, unrest: result.unrest,
        population: result.population, cargo: result.cargo, fuelled: result.fuelled,
      },
      ...vesselActionEnvelope(snapshot, player, uid, data.shipId, result.cycle.revision,
        data.requestId, 'maintenance'),
    };
    tx.set(undoRef, { turn: currentTurn, entries });
    tx.update(ref, { ...patch, ...terminalPatch, updatedAt: FieldValue.serverTimestamp() });
    tx.set(eventRef, buildPrivacySafeEventRecord({
      type: 'maintenance',
      envelope: buildAuthoritativeEventEnvelope({
        sessionId: data.sessionId, actorUid: uid, actorRoleId, turn: currentTurn,
        phase: 'active', type: 'maintenance', requestId: data.requestId,
        revision: result.cycle.revision, serverTime, visibility: EventVisibility.Member,
      }),
      payload: projectMaintenanceEvent({
        shipId: data.shipId,
        shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[data.shipId] ?? data.shipId,
        action: data.action,
        results: result.cycle.results,
      }),
      createdAt: FieldValue.serverTimestamp(),
    }));
    if (result.damageDraw) {
      const draw = result.damageDraw;
      if (!draw.destroyed || destruction?.createEvent) {
        const damageDrawEventId = draw.destroyed && destruction ? destruction.eventId : eventId;
        tx.set(db.doc(`sessions/${data.sessionId}/damageDraws/${damageDrawEventId}`), {
          shipId: data.shipId, requestId: data.requestId, eventId: damageDrawEventId,
          createdAt: FieldValue.serverTimestamp(),
          ...(draw.destroyed ? {
            type: 'ship-destroyed', podCapacity: destruction?.capacity.podCapacity,
          } : {
            type: 'ship-damage', ...draw.card, recycled: draw.recycled,
          }),
        });
      }
    }
    tx.set(requestRef, {
      ...fingerprint,
      requestId: data.requestId,
      sessionId: data.sessionId,
      shipId: data.shipId,
      actorUid: uid,
      expectedRevision: data.expectedRevision,
      committedRevision: result.cycle.revision,
      turn: currentTurn,
      phase: 'active',
      serverTime,
      serverEntropy: randomStep ? stableEntropy : null,
      serverRolls: randomStep ? stableRolls : null,
      eventId,
      ...(result.damageDraw ? { damageDrawId: destruction?.eventId ?? eventId } : {}),
      fingerprint, reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
});

function vipDeckRef(sessionId: string): DocumentReference {
  return db.doc(`sessions/${sessionId}/serverState/vipCards`);
}

function vipHandRef(sessionId: string, uid: string): DocumentReference {
  return db.doc(`sessions/${sessionId}/vipHands/${uid}`);
}

function vipDeckState(snapshot: DocumentSnapshot): VipDeckState {
  if (!snapshot.exists) return emptyVipDeckState();
  const parsed = parseVipDeckState(
    typeof (snapshot as unknown as { data?: unknown }).data === 'function'
      ? (snapshot as unknown as { data: () => unknown }).data()
      : { revision: snapshot.get('revision'), cards: snapshot.get('cards') },
  );
  if (!parsed) {
    throw commandError('failed-precondition', 'The Dione VIP deck is malformed; refresh before drawing.', 'malformed-input');
  }
  return parsed;
}

function writeVipHand(tx: Transaction, sessionId: string, state: VipDeckState, uid: string): void {
  const hand = vipHandForState(state, sessionId, uid);
  tx.set(vipHandRef(sessionId, uid), {
    ...hand,
    cards: hand.cards.map((card) => ({ ...card })),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function vipCardEvent(
  tx: Transaction,
  sessionId: string,
  requestId: string,
  player: DocumentSnapshot,
  actorUid: string,
  session: DocumentSnapshot,
  revision: number,
  serverTime: string,
  action: 'drawn' | 'transferred',
): void {
  // Card identity, owner, and recipient stay on private projections. Members
  // may learn that the Lounge/trade action happened without learning a hand.
  tx.set(db.doc(`sessions/${sessionId}/events/vip-card-${requestId}`), buildPrivacySafeEventRecord({
    type: 'vip-card',
    envelope: buildAuthoritativeEventEnvelope({
      sessionId, actorUid, actorRoleId: vesselActorRoleId(player),
      turn: sessionTurn(session.get('currentTurn')),
      phase: 'active', type: 'vip-card', requestId, revision,
      serverTime, visibility: EventVisibility.Member,
    }),
    payload: { shipId: 'dione', action },
    createdAt: FieldValue.serverTimestamp(),
  }));
}

/** Draw one private physical card from the charged Dione VIP Lounge. */
export const drawVipCard = onCall<{
  sessionId?: unknown; shipId?: unknown; requestId?: unknown; expectedRevision?: unknown;
  instanceId?: unknown; consoleRoleId?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  const allowed = ['sessionId', 'shipId', 'requestId', 'expectedRevision', 'instanceId', 'consoleRoleId'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some((key) => !allowed.includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid VIP card draw request.');
  }
  const data = requireVipCardDrawRequest(raw);
  if (data.shipId !== 'dione' ||
      (data.consoleRoleId !== undefined && data.consoleRoleId !== 'vip-host' && shipForRole(data.consoleRoleId) !== 'dione') ||
      (data.instanceId !== undefined && !/^[\w-]{1,128}$/.test(data.instanceId)) ||
      (data.consoleRoleId !== undefined && !/^[\w-]{1,128}$/.test(data.consoleRoleId))) {
    throw new HttpsError('invalid-argument', 'VIP cards may only be drawn from the Dione Lounge.');
  }
  const sessionRef = db.doc(`sessions/${data.sessionId}`);
  const deckRef = vipDeckRef(data.sessionId);
  const receiptRef = commandReceiptRef(data.sessionId, data.requestId);
  const fingerprint = vesselActionFingerprint(
    'draw-vip-card', data.sessionId, data.requestId, uid, data.instanceId ?? null,
    data.expectedRevision, { shipId: data.shipId, consoleRoleId: data.consoleRoleId ?? null },
  );

  let preflightAvailableCount = 0;
  let preflightDeckRevision = 0;
  const preflight = await db.runTransaction(async tx => {
    const { player, snapshot } = await requireMaintenanceAuthority(
      tx, data.sessionId, data.shipId, data.instanceId, data.consoleRoleId, uid, sessionRef,
    );
    const prior = await tx.get(receiptRef);
    const replay = replayBoundCommand(prior, fingerprint, isVesselActionResult, 'VIP card draw');
    if (replay) return replay.status === 'committed' ? { ...replay, status: 'replayed' } : replay;
    requireTurnOneForGameplay(snapshot);
    requireActionPhase(snapshot, 'maintenance', player.get('role') === 'gm' ? 'facilitator' : 'player');

    if (snapshot.get('phase') === 'closed' || snapshot.get('dioneEnabled') === false ||
        !activeVesselIdsForSession(snapshot).includes('dione')) {
      throw commandError('failed-precondition', 'Dione is not available in this session.', 'conflict');
    }
    const currentCycles = isRecord(snapshot.get('maintenanceCycles'))
      ? snapshot.get('maintenanceCycles') as Record<string, unknown> : {};
    const currentCycle = parseMaintenanceCycle(currentCycles.dione) ?? emptyMaintenanceCycle();
    if (currentCycle.revision !== data.expectedRevision) {
      const stale = {
        status: 'stale' as const, sessionId: data.sessionId, shipId: data.shipId,
        action: 'vip-card', expectedRevision: data.expectedRevision,
        currentRevision: currentCycle.revision,
        ...vesselActionEnvelope(snapshot, player, uid, data.shipId, currentCycle.revision,
          data.requestId, 'draw-vip-card'),
      };
      tx.set(receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    if (currentCycle.step !== 5 || !currentCycle.charges.includes('vip-lounge')) {
      throw commandError('failed-precondition', 'Charge the VIP Lounge during maintenance step 5 before drawing.', 'invalid-phase');
    }
    const currentDamage = shipDamage(snapshot.get('shipDamage')).dione ?? {
      damagedSystemIds: [], destroyed: false,
    };
    if (currentDamage.destroyed || currentDamage.damagedSystemIds.includes('vip-lounge')) {
      throw commandError('failed-precondition', 'A damaged VIP Lounge cannot be charged or used.', 'conflict');
    }
    const deck = vipDeckState(await tx.get(deckRef));
    preflightAvailableCount = availableVipCards(deck).length;
    preflightDeckRevision = deck.revision;
    if (!preflightAvailableCount) {
      throw commandError('failed-precondition', 'All nine Dione VIP cards have already been dealt.', 'conflict');
    }
    return null;
  });
  if (preflight) return preflight;

  // Select entropy only after request identity and actor authority are valid.
  const randomIndex = randomInt(0, preflightAvailableCount);
  const serverTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const { player, snapshot } = await requireMaintenanceAuthority(
      tx, data.sessionId, data.shipId, data.instanceId, data.consoleRoleId, uid, sessionRef,
    );
    const prior = await tx.get(receiptRef);
    const replay = replayBoundCommand(prior, fingerprint, isVesselActionResult, 'VIP card draw');
    if (replay) return replay.status === 'committed' ? { ...replay, status: 'replayed' } : replay;
    requireTurnOneForGameplay(snapshot);
    requireActionPhase(snapshot, 'maintenance', player.get('role') === 'gm' ? 'facilitator' : 'player');

    if (snapshot.get('phase') === 'closed' || snapshot.get('dioneEnabled') === false ||
        !activeVesselIdsForSession(snapshot).includes('dione')) {
      throw commandError('failed-precondition', 'Dione is not available in this session.', 'conflict');
    }
    const currentCycles = isRecord(snapshot.get('maintenanceCycles'))
      ? snapshot.get('maintenanceCycles') as Record<string, unknown> : {};
    const currentCycle = parseMaintenanceCycle(currentCycles.dione) ?? emptyMaintenanceCycle();
    if (currentCycle.revision !== data.expectedRevision) {
      const stale = {
        status: 'stale' as const, sessionId: data.sessionId, shipId: data.shipId,
        action: 'vip-card', expectedRevision: data.expectedRevision,
        currentRevision: currentCycle.revision,
        ...vesselActionEnvelope(snapshot, player, uid, data.shipId, currentCycle.revision,
          data.requestId, 'draw-vip-card'),
      };
      tx.set(receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    if (currentCycle.step !== 5 || !currentCycle.charges.includes('vip-lounge')) {
      throw commandError('failed-precondition', 'Charge the VIP Lounge during maintenance step 5 before drawing.', 'invalid-phase');
    }
    const currentDamage = shipDamage(snapshot.get('shipDamage')).dione ?? {
      damagedSystemIds: [], destroyed: false,
    };
    if (currentDamage.destroyed || currentDamage.damagedSystemIds.includes('vip-lounge')) {
      throw commandError('failed-precondition', 'A damaged VIP Lounge cannot be charged or used.', 'conflict');
    }
    const deckSnapshot = await tx.get(deckRef);
    const deck = vipDeckState(deckSnapshot);
    if (deck.revision !== preflightDeckRevision) {
      throw commandError('failed-precondition', 'The Dione VIP deck changed; retry the draw.', 'conflict');
    }
    const drawn = drawVipCardState(deck, uid, randomIndex);
    if (!drawn) {
      throw commandError('failed-precondition', 'All nine Dione VIP cards have already been dealt.', 'conflict');
    }
    const nextCycle: MaintenanceCycle = {
      ...currentCycle,
      revision: currentCycle.revision + 1,
      charges: currentCycle.charges.filter((charge) => charge !== 'vip-lounge'),
      results: {
        ...currentCycle.results,
        '5': `${currentCycle.results['5'] ?? ''}${currentCycle.results['5'] ? ' ' : ''}VIP Lounge used. A private card was drawn.`,
      },
    };
    tx.set(deckRef, {
      revision: drawn.state.revision,
      cards: drawn.state.cards.map((card) => ({ ...card })),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeVipHand(tx, data.sessionId, drawn.state, uid);
    tx.update(sessionRef, {
      'maintenanceCycles.dione': nextCycle,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const reply = {
      status: 'committed' as const, sessionId: data.sessionId, shipId: data.shipId,
      action: 'vip-card', requestId: data.requestId,
      expectedRevision: data.expectedRevision, committedRevision: nextCycle.revision,
      deckRevision: drawn.state.revision, currentTurn: sessionTurn(snapshot.get('currentTurn')),
      serverTime, cycle: nextCycle,
      ...vesselActionEnvelope(snapshot, player, uid, data.shipId, nextCycle.revision,
        data.requestId, 'draw-vip-card'),
    };
    tx.set(receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    vipCardEvent(tx, data.sessionId, data.requestId, player, uid, snapshot, nextCycle.revision, serverTime, 'drawn');
    return reply;
  });
});

/** Transfer one unspent VIP card during the printed Coordination window. */
export const transferVipCard = onCall<{
  sessionId?: unknown; requestId?: unknown; cardId?: unknown; targetUid?: unknown;
  expectedRevision?: unknown; instanceId?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  const allowed = ['sessionId', 'requestId', 'cardId', 'targetUid', 'expectedRevision', 'instanceId'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some((key) => !allowed.includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid VIP card transfer request.');
  }
  const data = requireVipCardTransferRequest(raw);
  if (data.instanceId !== undefined && !/^[\w-]{1,128}$/.test(data.instanceId)) {
    throw new HttpsError('invalid-argument', 'Invalid GM instance.');
  }
  const sessionRef = db.doc(`sessions/${data.sessionId}`);
  const deckRef = vipDeckRef(data.sessionId);
  const receiptRef = commandReceiptRef(data.sessionId, data.requestId);
  const fingerprint = vesselActionFingerprint(
    'transfer-vip-card', data.sessionId, data.requestId, uid, data.instanceId ?? null,
    data.expectedRevision, { cardId: data.cardId, targetUid: data.targetUid },
  );
  const serverTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const [player, target, snapshot, deckSnapshot, prior] = await Promise.all([
      tx.get(db.doc(`sessions/${data.sessionId}/players/${uid}`)),
      tx.get(db.doc(`sessions/${data.sessionId}/players/${data.targetUid}`)),
      tx.get(sessionRef),
      tx.get(deckRef),
      tx.get(receiptRef),
    ]);
    if (!snapshot.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role')))) {
      throw new HttpsError('permission-denied', 'Join the session before transferring a VIP card.');
    }
    if (player.get('role') === 'gm') {
      await requireShipCounterAuthority(
        tx, data.sessionId, uid, 'dione', data.instanceId, false, true,
      );
    }
    const replay = replayBoundCommand(prior, fingerprint, isVesselActionResult, 'VIP card transfer');
    if (replay) return replay.status === 'committed' ? { ...replay, status: 'replayed' } : replay;
    if (!isActivePlayer(target) || target.get('role') !== 'player') {
      throw commandError('failed-precondition', 'The target player is not connected.', 'conflict');
    }
    requireTurnOneForGameplay(snapshot);
    requireActionPhase(snapshot, 'transfer', player.get('role') === 'gm' ? 'facilitator' : 'player');

    if (snapshot.get('dioneEnabled') === false || !activeVesselIdsForSession(snapshot).includes('dione')) {
      throw commandError('failed-precondition', 'Dione is not available in this session.', 'conflict');
    }
    const deck = vipDeckState(deckSnapshot);
    if (deck.revision !== data.expectedRevision) {
      const stale = {
        status: 'stale' as const, sessionId: data.sessionId, action: 'vip-card-transfer',
        cardId: data.cardId, targetUid: data.targetUid, expectedRevision: data.expectedRevision,
        currentRevision: deck.revision,
        ...vesselActionEnvelope(snapshot, player, uid, 'dione', deck.revision,
          data.requestId, 'transfer-vip-card'),
      };
      tx.set(receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const transferred = transferVipCardState(deck, uid, data.targetUid, data.cardId);
    if (!transferred) {
      throw commandError('failed-precondition', 'Only the current owner may transfer an unspent VIP card.', 'conflict');
    }
    tx.set(deckRef, {
      revision: transferred.revision,
      cards: transferred.cards.map((card) => ({ ...card })),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeVipHand(tx, data.sessionId, transferred, uid);
    writeVipHand(tx, data.sessionId, transferred, data.targetUid);
    const reply = {
      status: 'committed' as const, sessionId: data.sessionId, action: 'vip-card-transfer',
      cardId: data.cardId, targetUid: data.targetUid, requestId: data.requestId,
      expectedRevision: data.expectedRevision, committedRevision: transferred.revision,
      currentTurn: sessionTurn(snapshot.get('currentTurn')), serverTime,
      ...vesselActionEnvelope(snapshot, player, uid, 'dione', transferred.revision,
        data.requestId, 'transfer-vip-card'),
    };
    tx.set(receiptRef, { fingerprint, result: reply, createdAt: FieldValue.serverTimestamp() });
    vipCardEvent(tx, data.sessionId, data.requestId, player, uid, snapshot, transferred.revision, serverTime, 'transferred');
    return reply;
  });
});

/** Admiral commands are serialized with the fleet's live alert revision. */
const FLEET_ALERT_COOLDOWN_MINUTES = 10;
const FLEET_ALERT_COOLDOWN_MS = FLEET_ALERT_COOLDOWN_MINUTES * 60 * 1000;

function toTimestampMillis(value: unknown): number | undefined {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? undefined : time;
}

export const setFleetRedAlert = onCall<{
  sessionId: string; active: boolean; expectedRevision: number; instanceId?: string; text?: unknown; requestId?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const data = request.data;
  if (!data || Object.keys(data).some(key => !['sessionId', 'active', 'expectedRevision', 'instanceId', 'text', 'requestId'].includes(key)) ||
      typeof data.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(data.sessionId) ||
      (data.instanceId !== undefined && (typeof data.instanceId !== 'string' || !/^[\w-]{1,128}$/.test(data.instanceId))) ||
      (data.requestId !== undefined && (typeof data.requestId !== 'string' || !/^[\w-]{1,128}$/.test(data.requestId))) ||
      (data.text !== undefined && (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 500)) ||
      typeof data.active !== 'boolean' || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) {
    throw new HttpsError('invalid-argument', 'Invalid fleet alert command.');
  }
  const ref = db.doc(`sessions/${data.sessionId}`);
  const requestId = typeof data.requestId === 'string' ? data.requestId : undefined;
  const receiptRef = requestId ? commandReceiptRef(data.sessionId, requestId) : undefined;
  const fingerprint: CommandFingerprint | undefined = requestId ? {
    action: 'set-fleet-red-alert', sessionId: data.sessionId, requestId, actorUid: uid,
    instanceId: data.instanceId ?? null, expectedRevision: data.expectedRevision,
    payload: { active: data.active, text: typeof data.text === 'string' ? data.text.trim().toUpperCase() : null },
  } : undefined;
  const serverTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const player = await tx.get(db.doc(`sessions/${data.sessionId}/players/${uid}`));
    if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role')))) {
      throw new HttpsError('permission-denied', 'Only the active AEGIS Admiral may command a fleet red alert.');
    }
    await requireConsoleAuthority(tx, data.sessionId, player, 'admiral', data.instanceId);
    const session = await tx.get(ref);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const receipt = receiptRef ? await tx.get(receiptRef) : undefined;
    if (receipt && fingerprint) {
      const replay = replayBoundCommand(receipt, fingerprint, isFleetAlertResult, 'fleet red alert');
      if (replay) return replay;
    }

    if (session.get('phase') === 'closed') throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    requireActiveGameplayPhase(session);
    const current = session.get('fleetRedAlert') as
      { active: boolean; revision: number; text?: string; raisedAt?: string | Timestamp } | undefined;
    if ((current?.revision ?? 0) !== data.expectedRevision) {
      throw commandError('failed-precondition', 'Fleet alert changed. Wait for the live update and try again.', 'stale-revision');
    }
    const lastRaisedAt = toTimestampMillis(current?.raisedAt);
    const now = Date.parse(serverTime);
    if (data.active && !current?.active && lastRaisedAt !== undefined && now - lastRaisedAt < FLEET_ALERT_COOLDOWN_MS) {
      throw commandError('failed-precondition', 'Fleet red alert may be raised once every 10 minutes.', 'invalid-phase');
    }
    const text = typeof data.text === 'string' ? data.text.trim().toUpperCase() : current?.text;
    if ((current?.active ?? false) === data.active && (!data.active || text === current?.text)) {
      const result = { active: current?.active ?? false, revision: current?.revision ?? 0 };
      if (receiptRef && fingerprint) {
        txSetIfSupported(tx, receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
      }
      return result;
    }
    const fleetRedAlert: { active: boolean; revision: number; text?: string; raisedAt?: string } = {
      active: data.active,
      revision: data.expectedRevision + 1,
      ...(text === undefined ? {} : { text }),
    };
    if (data.active && !current?.active) fleetRedAlert.raisedAt = new Date(now).toISOString();
    else if (lastRaisedAt !== undefined) fleetRedAlert.raisedAt = new Date(lastRaisedAt).toISOString();
    const phase = turnPhaseState(session.get('turnPhase'));
    const turnPhase = phase?.turn === sessionTurn(session.get('currentTurn')) &&
      phase.airspace.tickerActive
      ? { ...phase, airspace: { ...phase.airspace, tickerActive: false } }
      : undefined;
    const publishedTicker = data.active
      ? publishSessionFleetTicker(data.sessionId, session, {
        source: 'admiral', priority: FLEET_TICKER_PRIORITIES.admiral,
        text: `ICSN ADMIRAL // ${text ?? 'RED ALERT // WOLF ATTACK IMMINENT, ALL HANDS TO BATTLE STATIONS'}`,
        tone: 'danger', sourceId: `red-alert:${fleetRedAlert.revision}`,
      }, serverTime)
      : publishSessionFleetTicker(data.sessionId, session, {
        source: 'automatic', priority: FLEET_TICKER_PRIORITIES.admiral,
        text: FLEET_TICKER_COPY.standDown, tone: 'normal', passCount: 2,
        sourceId: `red-alert:${fleetRedAlert.revision}`,
      }, serverTime);
    const fleetTicker = data.active
      ? publishedTicker
      : fleetTickerFiniteFallback(data.sessionId, session, publishedTicker, serverTime);
    tx.update(ref, {
      fleetRedAlert,
      fleetTicker,
      ...(turnPhase ? { turnPhase } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeFleetTickerAudit(tx, data.sessionId, data.active ? 'raised' : 'stand-down', fleetTicker,
      fleetTicker.current?.id, serverTime);
    if (receiptRef && fingerprint) {
      txSetIfSupported(tx, receiptRef, { fingerprint, result: fleetRedAlert, createdAt: FieldValue.serverTimestamp() });
    }
    return fleetRedAlert;
  });
});

/** Press dispatches are serialized so two open Press consoles cannot overwrite unseen copy. */
export const publishPressDispatch = onCall<{
  sessionId?: unknown; requestId?: unknown; text?: unknown; expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const data = requirePressDispatchRequest(request.data ?? {});
  const dispatchId = randomUUID();
  const ref = db.doc(`sessions/${data.sessionId}`);
  const requestId = data.requestId;
  const receiptRef = requestId ? commandReceiptRef(data.sessionId, requestId) : undefined;
  const fingerprint: CommandFingerprint | undefined = requestId ? {
    action: 'publish-press-dispatch', sessionId: data.sessionId, requestId, actorUid: uid,
    instanceId: null, expectedRevision: data.expectedRevision,
    payload: { text: data.text },
  } : undefined;
  const serverTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const [player, session] = await Promise.all([
      tx.get(db.doc(`sessions/${data.sessionId}/players/${uid}`)),
      tx.get(ref),
    ]);
    if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role'))) ||
        player.get('activeConsoleRoleId') !== 'press-officer' || hasCoreAssignment(player) ||
        (typeof session.get('pressHolderUid') === 'string' &&
          session.get('pressHolderUid') !== uid)) {
      throw new HttpsError(
        'permission-denied',
        'Only the active Press Officer may publish a fleet dispatch.',
      );
    }
    requirePlayerShipActionAuthority(player);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('pressEnabled') === false) {
      throw new HttpsError('permission-denied', 'Press is disabled.');
    }
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    requireActiveGameplayPhase(session);
    const receipt = receiptRef ? await tx.get(receiptRef) : undefined;
    if (receipt && fingerprint) {
      const replay = replayBoundCommand(receipt, fingerprint, isPressDispatchResult, 'Press dispatch');
      if (replay) return replay;
    }
    const current = pressDispatchState(session.get('pressDispatch'));
    if (current.revision !== data.expectedRevision) {
      throw commandError(
        'failed-precondition',
        'Press dispatch changed. Wait for the live update and try again.',
        'stale-revision',
      );
    }
    const pressDispatch = {
      dispatches: [
        ...current.dispatches,
        { id: dispatchId, text: `SNN // ${data.text}` },
      ],
      revision: data.expectedRevision + 1,
    };
    const phase = turnPhaseState(session.get('turnPhase'));
    const turnPhase = phase?.turn === sessionTurn(session.get('currentTurn')) &&
      phase.airspace.tickerActive
      ? { ...phase, airspace: { ...phase.airspace, tickerActive: false } }
      : undefined;
    const fleetTicker = publishPressFleetTicker(data.sessionId, session, {
      source: 'press', priority: FLEET_TICKER_PRIORITIES.press,
      text: `SNN // ${data.text}`, tone: 'normal', gap: 'long', sourceId: dispatchId,
    }, serverTime);
    tx.update(ref, {
      pressDispatch,
      fleetTicker,
      ...(turnPhase ? { turnPhase } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeFleetTickerAudit(tx, data.sessionId, 'publish', fleetTicker, fleetTicker.current?.id, serverTime);
    if (receiptRef && fingerprint) {
      txSetIfSupported(tx, receiptRef, { fingerprint, result: pressDispatch, createdAt: FieldValue.serverTimestamp() });
    }
    return pressDispatch;
  });
});

/** Only the active Press Officer may retire one fleet dispatch from the ticker. */
export const dismissPressDispatch = onCall<{
  sessionId?: unknown; requestId?: unknown; dispatchId?: unknown; expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const data = requirePressDispatchDismissalRequest(request.data ?? {});
  const ref = db.doc(`sessions/${data.sessionId}`);
  const requestId = data.requestId;
  const receiptRef = requestId ? commandReceiptRef(data.sessionId, requestId) : undefined;
  const fingerprint: CommandFingerprint | undefined = requestId ? {
    action: 'dismiss-press-dispatch', sessionId: data.sessionId, requestId, actorUid: uid,
    instanceId: null, expectedRevision: data.expectedRevision,
    payload: { dispatchId: data.dispatchId },
  } : undefined;
  const serverTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const [player, session] = await Promise.all([
      tx.get(db.doc(`sessions/${data.sessionId}/players/${uid}`)),
      tx.get(ref),
    ]);
    if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role'))) ||
        player.get('activeConsoleRoleId') !== 'press-officer' || hasCoreAssignment(player) ||
        (typeof session.get('pressHolderUid') === 'string' &&
          session.get('pressHolderUid') !== uid)) {
      throw new HttpsError(
        'permission-denied',
        'Only the active Press Officer may dismiss a fleet dispatch.',
      );
    }
    requirePlayerShipActionAuthority(player);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('pressEnabled') === false) {
      throw new HttpsError('permission-denied', 'Press is disabled.');
    }
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    requireActiveGameplayPhase(session);
    const receipt = receiptRef ? await tx.get(receiptRef) : undefined;
    if (receipt && fingerprint) {
      const replay = replayBoundCommand(receipt, fingerprint, isPressDispatchResult, 'Press dismissal');
      if (replay) return replay;
    }
    const current = pressDispatchState(session.get('pressDispatch'));
    if (current.revision !== data.expectedRevision) {
      throw commandError(
        'failed-precondition',
        'Press dispatches changed. Wait for the live update and try again.',
        'stale-revision',
      );
    }
    if (!current.dispatches.some(dispatch => dispatch.id === data.dispatchId)) {
      throw commandError('failed-precondition', 'That press dispatch is no longer active.', 'stale-revision');
    }
    const pressDispatch = {
      dispatches: current.dispatches.filter(dispatch => dispatch.id !== data.dispatchId),
      revision: data.expectedRevision + 1,
    };
    const dismissedTicker = dismissFleetTickerSource(
      data.sessionId,
      fleetTickerForMutation(data.sessionId, session, serverTime),
      data.dispatchId,
      serverTime,
    );
    const fleetTicker = fleetTickerFiniteFallback(
      data.sessionId,
      session,
      fleetTickerBaseline(
        data.sessionId,
        session,
        retireAirspaceFleetTicker(dismissedTicker, serverTime),
        serverTime,
      ),
      serverTime,
    );
    tx.update(ref, { pressDispatch, fleetTicker, updatedAt: FieldValue.serverTimestamp() });
    writeFleetTickerAudit(tx, data.sessionId, 'dismiss', fleetTicker, data.dispatchId, serverTime);
    if (receiptRef && fingerprint) {
      txSetIfSupported(tx, receiptRef, { fingerprint, result: pressDispatch, createdAt: FieldValue.serverTimestamp() });
    }
    return pressDispatch;
  });
});

/** GM correction: restore all systems and the deck, preserving casualty history. */
export const repairAllShipDamage = onCall<{
  sessionId: string; shipId: string; instanceId: string;
  requestId?: string; expectedRevision?: number;
}>(async request => {
  const uid = requireUid(request.auth);
  const change = requireShipDamageRequest(request.data ?? {});
  if (!SHIP_DAMAGE_DECKS[change.shipId]) throw new HttpsError('invalid-argument', 'Unknown damage deck.');
  const identity = requireVesselActionRequest(request.data ?? {});
  const eventId = `repair-${identity.requestId}`;
  const ref = db.doc(`sessions/${change.sessionId}`);
  const receiptRef = commandReceiptRef(change.sessionId, identity.requestId);
  const fingerprint = vesselActionFingerprint(
    'repair-damage', change.sessionId, identity.requestId, uid, change.instanceId,
    identity.expectedRevision ?? null, { shipId: change.shipId },
  );
  return db.runTransaction(async tx => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true, true,
    );
    const session = await tx.get(ref);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    const prior = await tx.get(receiptRef);
    const replay = vesselActionReceiptReply(prior, fingerprint, 'ship repair');
    if (replay) return replay;
    requireActiveGameplayPhase(session);
    const currentRevision = vesselActionRevision(session, change.shipId);
    if (identity.expectedRevision !== undefined && identity.expectedRevision !== currentRevision) {
      const envelope = vesselActionEnvelope(session, player, uid, change.shipId, currentRevision,
        identity.requestId, 'repair-damage');
      const stale = { status: 'stale' as const, shipId: change.shipId, currentRevision, ...envelope };
      txSetIfSupported(tx, receiptRef, { fingerprint, result: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    const revision = currentRevision + 1;
    tx.update(ref, {
      [`shipDamage.${change.shipId}`]: { damagedSystemIds: [], destroyed: false },
      ...vesselActionRevisionPatch(change.shipId, revision),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${change.sessionId}/events/${eventId}`), buildPrivacySafeEventRecord({
      type: 'ship-repaired',
      payload: { shipId: change.shipId, actorUid: uid },
      createdAt: FieldValue.serverTimestamp(),
    }));
    const result = {
      repaired: true,
      ...vesselActionEnvelope(session, player, uid, change.shipId, revision,
        identity.requestId, 'repair-damage'),
    };
    txSetIfSupported(tx, receiptRef, { fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

type MaintenanceRollbackFingerprint = Readonly<{
  sessionId: string;
  shipId: string;
  instanceId: string;
  expectedRevision: number;
  actorUid: string;
}>;

function maintenanceRollbackFingerprint(
  change: { sessionId: string; shipId: string; instanceId: string; expectedRevision: number },
  actorUid: string,
): MaintenanceRollbackFingerprint {
  return { ...change, actorUid };
}

function sameMaintenanceRollbackFingerprint(
  value: unknown,
  expected: MaintenanceRollbackFingerprint,
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.entries(expected).every(([key, item]) => candidate[key] === item);
}

function maintenanceRollbackReceiptReply(
  prior: DocumentSnapshot,
  fingerprint: MaintenanceRollbackFingerprint,
): Record<string, unknown> | undefined {
  if (!prior.exists) return undefined;
  if (!sameMaintenanceRollbackFingerprint(prior.get('fingerprint'), fingerprint)) {
    throw commandError('failed-precondition', 'This rollback request id was already used for a different payload or actor.', 'conflict');
  }
  const storedReply = prior.get('reply');
  if (typeof storedReply !== 'object' || storedReply === null || Array.isArray(storedReply)) {
    throw commandError('failed-precondition', 'This rollback request has no replayable result.', 'conflict');
  }
  const reply = storedReply as Record<string, unknown>;
  if (!isVesselActionResult(reply)) {
    throw commandError('failed-precondition', 'This rollback request has no complete replayable vessel envelope.', 'conflict');
  }
  return reply.status === 'stale' ? reply : { ...reply, status: 'replayed' };
}

/** Undo only recorded steps whose resulting state has not subsequently changed. */
export const rollbackMaintenance = onCall<{
  sessionId?: unknown; shipId?: unknown; instanceId?: unknown; requestId?: unknown; expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  const allowed = ['sessionId', 'shipId', 'instanceId', 'requestId', 'expectedRevision'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !allowed.includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid maintenance rollback request.');
  }
  const change = requireMaintenanceRollbackRequest(raw);
  const fingerprint = maintenanceRollbackFingerprint(change, uid);
  const ref = db.doc(`sessions/${change.sessionId}`);
  const undoRef = db.doc(`sessions/${change.sessionId}/maintenanceUndo/${change.shipId}`);
  const requestRef = db.doc(`sessions/${change.sessionId}/maintenanceRollbackRequests/${change.requestId}`);
  const eventId = `maintenance-rollback-${change.requestId}`;
  return db.runTransaction(async tx => {
    const authority = await requireFacilitatorInstance(tx, change.sessionId, uid, change.instanceId);
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true, true,
    );
    const prior = await tx.get(requestRef);
    const replay = maintenanceRollbackReceiptReply(prior, fingerprint);
    if (replay) return replay;
    requireTurnOneForGameplay(authority.session);
    requireActionPhase(authority.session, 'maintenance', 'facilitator');
    const undo = await tx.get(undoRef);
    const cycle = authority.session.get(`maintenanceCycles.${change.shipId}`) as MaintenanceCycle | undefined;
    const entries = (undo.get('entries') ?? []) as Array<{ fields: MaintenanceUndoField[] }>;
    const last = entries.at(-1);
    const currentTurn = sessionTurn(authority.session.get('currentTurn'));
    if (authority.session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    if (!last || cycle?.revision !== change.expectedRevision || undo.get('turn') !== currentTurn) {
      const reply = {
        status: 'stale' as const,
        requestId: change.requestId,
        sessionId: change.sessionId,
        shipId: change.shipId,
        expectedRevision: change.expectedRevision,
        currentRevision: cycle?.revision ?? 0,
        ...vesselActionEnvelope(authority.session, authority.player, uid, change.shipId,
          cycle?.revision ?? 0, change.requestId, 'maintenance-rollback'),
      };
      tx.set(requestRef, {
        requestId: change.requestId,
        sessionId: change.sessionId,
        shipId: change.shipId,
        instanceId: change.instanceId,
        actorUid: uid,
        fingerprint,
        reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      return reply;
    }
    let patch: Record<string, unknown>;
    try { patch = restoreMaintenanceUndo(last.fields, field => authority.session.get(field), change.shipId, change.expectedRevision); }
    catch (cause) {
      throw commandError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'Rollback failed.',
        'conflict',
      );
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'shuttleCargo')) {
      patch = {
        ...patch,
        shuttleCargo: sanitizeShuttleCargo(patch.shuttleCargo, sessionActiveRoleIds(authority.session)),
      };
    }
    const reply = {
      status: 'committed' as const,
      requestId: change.requestId,
      sessionId: change.sessionId,
      shipId: change.shipId,
      expectedRevision: change.expectedRevision,
      eventId,
      ...vesselActionEnvelope(authority.session, authority.player, uid, change.shipId,
        change.expectedRevision + 1, change.requestId, 'maintenance-rollback'),
    };
    tx.update(ref, { ...Object.fromEntries(Object.entries(patch).map(([field, value]) => [field, value === undefined ? FieldValue.delete() : value])), updatedAt: FieldValue.serverTimestamp() });
    tx.set(undoRef, { turn: undo.get('turn'), entries: entries.slice(0, -1) });
    tx.set(db.doc(`sessions/${change.sessionId}/events/${eventId}`), buildPrivacySafeEventRecord({
      type: 'maintenance-rollback',
      payload: {
        requestId: change.requestId, eventId,
        sessionId: change.sessionId, shipId: change.shipId, actorUid: uid,
        revision: change.expectedRevision + 1,
      },
      createdAt: FieldValue.serverTimestamp(),
    }));
    tx.set(requestRef, {
      requestId: change.requestId,
      sessionId: change.sessionId,
      shipId: change.shipId,
      instanceId: change.instanceId,
      actorUid: uid,
      fingerprint,
      eventId,
      reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
});
