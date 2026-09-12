import { captureMaintenanceUndo, restoreMaintenanceUndo, type MaintenanceUndoField } from './maintenanceRollback';
import { projectMaintenanceEvent } from './maintenanceEvent';
import { canOperateRole, shipForRole } from './crewAccess';
import { advanceMaintenance, MAINTENANCE_RULES, emptyMaintenanceCycle, parseMaintenanceCycle, type MaintenanceCycle } from './maintenance';
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
import { canClaimSeat, shouldClearSeatPointer } from './seatPolicy';
import { canSelectConsoleRole, disconnectedRoleState } from './consoleRolePolicy';
import { mayClaimGmInstance } from './gmControlsLock';
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
  requireGmInstanceActionRequest,
  requireGmInstanceRequest,
  requireAirspaceWindowExtensionRequest,
  requireEmergencyTimerPauseRequest,
  requireWolfAttackWindowRequest,
  requireFacilitatorCensusNoteRequest,
  requirePlayerKickRequest,
  requireOpenAirspacePhaseRequest,
  requireTurnAdvanceRequest,
  requireShipConfettiRequest,
  requireShipCounterBatchRequest,
  requireShipCounterRequest,
  requireFighterWingCountRequest,
  requireShipDamageRequest,
  requireMaintenanceRollbackRequest,
  requireShipJumpRequest,
  requireShipNavigationMoveRequest,
  requireShipConsoleLockRequest,
  requireShipUnrestRequest,
  requireUnrestDismissalRequest,
  requireSessionRequest,
  requireAirspaceRequest,
  requireMaintenanceRequest,
  requireSmallShipDockingRequest,
  requireSmallShipMaintenanceRequest,
  requireSessionCreationRequest,
  requireCastingPreferenceRequest,
  requireRoleAssignmentRequest,
  requireRoleReleaseRequest,
  requireLoyaltyAssignmentRequest,
  requireAndroidDisclosureRequest,
  requireFacilitatorResponsibilityRequest,
  requireGameStartRequest,
  requireSessionSeatRequest,
  requireUid,
  requireSetupConfirmationRequest,
  requirePressDispatchDismissalRequest,
  requirePressDispatchRequest,
} from './requestGuards';
import {
  applyShipNavigationMove,
  type NavigationLogEntry,
  type NavigationLogs,
} from './navigation';
import {
  resolveJumpAttempt,
  type JumpAttemptResult,
  type JumpDriveState,
  type JumpTransition,
} from './jumpDrive';
import { deriveRoutineWolfAssignment } from './wolfAssignment';
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
  INITIAL_SHIP_RESOURCES,
  canAdjustShipCounter,
  isResourceShipId,
  nextResourceAmount,
  RESOURCE_IDS,
  shipResources,
  shipUnrest,
  unrestChange,
} from './resources';
import { activeVesselRecord, initialSessionComposition } from './sessionComposition';
import {
  ROLE_OWNED_CRAFT_CATALOG,
  roleOwnedCraftManifestForSetup,
  roleOwnedCraftManifestMatches,
} from './craftOwnership';
import {
  PRESENCE_LEASE_MS,
  activeSessionConflicts,
  deletionDeadline,
  isPresenceStale,
} from './sessionLifecycle';
import { SHIP_DAMAGE_DECKS, drawShipDamage, shipDamage } from './shipDamage';
import { atomicStartState } from './startState';
import {
  fighterWingCapacity,
  fighterWingCounts,
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
} from './shuttlecraft';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import {
  isJoinCode,
  joinCodeLengthForCreateRequest,
  takeJoinCodeAttempt,
  type JoinCodeAttemptState,
} from './joinCodeSecurity';
import {
  isPlayerGameplayLockedAtTurnZero,
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
import { wolfAttackWindowState, type WolfAttackWindow } from './wolfAttackWindow';
import {
  commandReceiptDisposition,
  type CommandFingerprint,
} from './commandIdempotency';
import {
  dismissFleetTickerSource,
  emptyFleetTickerState,
  FLEET_TICKER_PRIORITIES,
  publishFleetTicker,
  standDownExpiry,
  fleetTickerState,
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

type ActiveTurnPhase = NonNullable<ReturnType<typeof turnPhaseState>>;
type ActiveTurnState = NonNullable<ReturnType<typeof turnStateState>>;

const FLEET_TICKER_COPY = {
  turnZero: 'AEGIS // CONSOLES LOCKED OUT UNTIL IRIS AUTHENTICATION IS COMPLETE',
  airspaceClosed: 'AIRSPACE CONTROL // AIRSPACE CLOSED // AIRSPACE LOCKDOWN, ALL CREW MUST RETURN TO ORIGIN SHIPS / STAY IN THEIR ORIGIN SHIPS // SHUTTLES MUST STAY AT CURRENT LOCATION.',
  airspaceOpen: 'AIRSPACE CONTROL // AIRSPACE OPEN',
  emergency: 'AIRSPACE CONTROL // EMERGENCY TIMER PAUSED // ALL FLEET CLOCKS ON HOLD // GM RESUME REQUIRED',
  standDown: 'AEGIS // RED ALERT CANCELLED BY AEGIS, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. REPEAT, STAND DOWN, STAND DOWN ALL BATTLESTATIONS. RED ALERT CANCELLED BY AEGIS.',
  finale: 'CREDITS // BASED ON THE ORIGINAL MEGAGAME DEN OF WOLVES BY JOHN MIZON (SOUTH WEST MEGAGAMES) // NEW EDEN GAME DESIGN: JOHN KEYWORTH (KIWI GAME DESIGN) // WEB APP LEAD: EMERALD FLEUR PHAM',
} as const;

function fleetTickerStateFromLegacy(
  sessionId: string,
  session: DocumentSnapshot,
  now: string,
): FleetTickerState {
  let state = emptyFleetTickerState();
  const currentTurn = sessionTurn(session.get('currentTurn'));
  if (currentTurn === 0) {
    state = publishFleetTicker(sessionId, state, {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.turnZero,
      text: FLEET_TICKER_COPY.turnZero, tone: 'normal', gap: 'long', sourceId: 'turn-zero',
    }, now);
  }
  const phase = turnPhaseState(session.get('turnPhase'));
  if (phase?.timerPause) {
    state = publishFleetTicker(sessionId, state, {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.emergency,
      text: FLEET_TICKER_COPY.emergency, tone: 'danger', gap: 'long',
      sourceId: `emergency:${phase.turn}:${phase.timerPause.pausedAt}`,
    }, now);
  } else if (phase?.airspace.tickerActive) {
    state = publishFleetTicker(sessionId, state, {
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace,
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
  return stored === undefined
    ? emptyFleetTickerState()
    : fleetTickerState(stored);
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
  return stored === undefined
    ? fleetTickerStateFromLegacy(sessionId, session, now)
    : fleetTickerState(stored);
}

function publishSessionFleetTicker(
  sessionId: string,
  session: DocumentSnapshot,
  input: FleetTickerTransmission,
  now: string,
): FleetTickerState {
  return publishFleetTicker(sessionId, fleetTickerForMutation(sessionId, session, now), input, now);
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

function activeShipSurvivors(value: unknown, activeVesselIds: readonly string[]): Record<string, number> {
  const stored: Record<string, number> = {};
  if (isRecord(value)) {
    for (const [shipId, amount] of Object.entries(value)) {
      if (typeof amount === 'number') stored[shipId] = amount;
    }
  }
  return activeVesselRecord({ ...INITIAL_SHIP_SURVIVORS, ...stored }, activeVesselIds);
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

function publicShuttleCargo(value: unknown): Record<string, Record<string, number>> {
  const stored = isRecord(value) ? value : {};
  const knownCargoIds: ReadonlySet<string> = new Set(RESOURCE_IDS);
  return Object.fromEntries(Object.entries(stored).flatMap(([shuttleId, cargo]) => {
    if (!AUTHORIZED_SHUTTLE_IDS.has(shuttleId) || !isRecord(cargo)) return [];
    const parsed = Object.fromEntries(Object.entries(cargo).flatMap(([resourceId, amount]) =>
      knownCargoIds.has(resourceId) && typeof amount === 'number' && Number.isFinite(amount)
        ? [[resourceId, amount]] : []));
    return [[shuttleId, parsed]];
  }));
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
): Promise<ReturningSeat> {
  const storedSeatId = player.get('seatId');
  if (storedSeatId === null || storedSeatId === undefined) {
    return { seatId: null, clearPointer: false };
  }
  if (typeof storedSeatId !== 'string' || storedSeatId.length === 0) {
    return { seatId: null, clearPointer: true };
  }

  const seatRef = db.doc('sessions/' + sessionId + '/seats/' + storedSeatId);
  const seat = await tx.get(seatRef);
  if (
    seat.exists &&
    seat.get('status') === 'claimed' &&
    seat.get('holderUid') === uid
  ) {
    return { seatId: storedSeatId, clearPointer: false };
  }
  if (seat.exists && seat.get('status') === 'open') {
    tx.update(seatRef, {
      status: 'claimed',
      holderUid: uid,
      claimedAt: FieldValue.serverTimestamp(),
    });
    return { seatId: storedSeatId, clearPointer: false };
  }
  return { seatId: null, clearPointer: true };
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

function requireTurnOneForPlayer(session: DocumentSnapshot, player: DocumentSnapshot): void {
  if (isPlayerGameplayLockedAtTurnZero(session.get('currentTurn'), player.get('role'))) {
    throw commandError(
      'failed-precondition',
      'Turn 0 is for GM setup. Wait for the GM to advance to Turn 1.',
      'invalid-phase',
    );
  }
}

function requireTurnOneForGameplay(session: DocumentSnapshot): void {
  if (sessionTurn(session.get('currentTurn')) === 0) {
    throw commandError(
      'failed-precondition',
      'Turn 0 is for setup. Wait for the GM to advance to Turn 1.',
      'invalid-phase',
    );
  }
}

function requireLiveAirspaceWindow(phase: ActiveTurnPhase): void {
  if (phase.airspace.state === 'restricted' && Date.now() >= Date.parse(phase.openAirspaceEndsAt)) {
    throw commandError(
      'failed-precondition',
      'The airspace window has closed. Wait for the next turn.',
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
  if (lifecyclePhase === 'closed') {
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
  readonly phase?: 'debrief';
  readonly turnState?: ActiveTurnState;
  readonly turnStartAnnouncement?: TurnStartAnnouncement;
  readonly turnPhase?: ReturnType<typeof startTurnPhase>;
  readonly maintenanceCycles?: Record<string, MaintenanceCycle>;
  readonly shuttleFuelled?: Record<string, boolean>;
};

function isTurnAdvanceResult(value: unknown): value is TurnAdvanceResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!Number.isSafeInteger(result.currentTurn) || (result.currentTurn as number) < 0) return false;
  if (result.phase === 'debrief') return result.turnPhase === undefined;
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
): TurnAdvanceResult {
  const currentTurn = sessionTurn(session.get('currentTurn'));
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
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace,
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
    tx.update(sessionRef, {
      currentTurn: maxTurn,
      phase: 'debrief',
      turnPhase: FieldValue.delete(),
      turnState: FieldValue.delete(),
      turnStartAnnouncement: FieldValue.delete(),
      fleetTicker,
      ...(expiredTurnResources
        ? {
          maintenanceCycles: expiredTurnResources.maintenanceCycles,
          shuttleFuelled: expiredTurnResources.shuttleFuelled,
        }
        : {}),
      ...additionalFields,
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
  throw new HttpsError(
    'resource-exhausted',
    `Too many session-code attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
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
      const initialFleetTicker = publishFleetTicker(sessionRef.id, emptyFleetTickerState(), {
        source: 'automatic', priority: FLEET_TICKER_PRIORITIES.turnZero,
        text: FLEET_TICKER_COPY.turnZero, tone: 'normal', gap: 'long', sourceId: 'turn-zero',
      }, now);
      // The expansion mode is persisted now, but its two-role composition is
      // deliberately resolved by the casting/start slice. Adding both roles
      // here would silently create more role holders than configured players
      // and would mix base and expansion Capybara rules.
      const activeRoleIds = [...recommendedRoleIds(creation.configuration.playerCount)];
      const setup = canonicalSessionSetup(creation.configuration, activeRoleIds);
      const stableSeats = stableSeatsForRoles(activeRoleIds);
      const composition = initialSessionComposition(setup);
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
          pressEnabled: true,
          pressAvailabilityRevision: 0,
          pressHolderUid: null,
          shipGalacticCoordinates,
          shipNavigationLogs,
          shipConsoleLocks,
          shipJumpStates,
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
          assignedRoleId: null,
          shipPreferenceId: null,
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
          shipGalacticCoordinates,
          shipNavigationLogs,
          shipConsoleLocks,
          shipJumpStates,
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
          setupRevision: 0,
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
          joinedAt: FieldValue.serverTimestamp(),
          connected: true,
          lastSeenAt: FieldValue.serverTimestamp(),
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
): SetupCommandFingerprint {
  return {
    playerCount: configuration.playerCount,
    chartId: configuration.chartId,
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
    );
    const [prior, marker, authority, legacyEvent] = await Promise.all([
      tx.get(requestRef),
      tx.get(markerRef),
      requireFacilitatorInstance(tx, command.sessionId, uid, command.instanceId),
      tx.get(eventRef),
    ]);
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
    const currentRoleIds = sessionActiveRoleIds(authority.session);
    await reconcileStableSeats(tx, command.sessionId, currentRoleIds, command.activeRoleIds);
    const setup = canonicalSessionSetup(command.configuration, command.activeRoleIds);
    const currentActiveVesselIds = activeVesselIdsForSession(authority.session);
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
    const nextShipGalacticCoordinates = reconcileActiveVesselMap(
      authority.session.get('shipGalacticCoordinates'),
      currentActiveVesselIds,
      nextActiveVesselIds,
      shipGalacticCoordinates,
      INITIAL_SHIP_GALACTIC_COORDINATES,
    );
    const nextShipNavigationLogs = reconcileActiveVesselMap(
      authority.session.get('shipNavigationLogs'),
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
    const currentDockings = activeShuttleDockingsForVessels(
      (authority.session.get('shuttleDockings') as typeof INITIAL_SHUTTLE_DOCKINGS | undefined) ??
        initialShuttleDockingsForRoles(currentRoleIds),
      currentActiveVesselIds,
    );
    const retainedDockings = activeShuttleDockingsForVessels(currentDockings, nextActiveVesselIds);
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
    const reply = {
      status: 'committed' as const,
      requestId: command.requestId,
      setupRevision: command.expectedSetupRevision + 1,
      setup,
      activeRoleIds: [...setup.activeRoleIds],
      activeVesselIds: [...setup.activeVesselIds],
    };
    tx.update(sessionRef, {
      ...setupWriteFields(setup),
      shipResources: nextShipResources,
      shipUnrest: nextShipUnrest,
      shipSurvivors: nextShipSurvivors,
      shipGalacticCoordinates: nextShipGalacticCoordinates,
      shipNavigationLogs: nextShipNavigationLogs,
      shipConsoleLocks: nextShipConsoleLocks,
      shipJumpStates: nextShipJumpStates,
      shuttleDockings: nextDockings,
      shuttleVisitLog: nextVisits,
      setupRevision: reply.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${command.sessionId}/craftOwnership/manifest`), {
      ...nextCraftManifest,
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
  const censusRef = db.doc(`sessions/${start.sessionId}/loyaltyCensus/current`);
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

  return db.runTransaction(async (tx) => {
    const [prior, marker, authority, players, instances, seats, secrets, legacyEvent, craftOwnershipManifest, census] = await Promise.all([
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

    const committedSetupRevision = start.expectedSetupRevision + 1;
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
    if (!craftOwnershipManifest.exists) {
      tx.set(craftOwnershipManifestRef, {
        ...expectedCraftManifest,
        setupRevision: committedSetupRevision,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
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
      pursuitGroups: { fleet: 2 },
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
  tx.set(db.doc(`sessions/${sessionId}/loyaltyCensus/current`), {
    type: 'loyalty-census',
    revision: censusRevision,
    entries: [...entries.values()].sort((left, right) => left.uid.localeCompare(right.uid)),
  });
}

function setLoyaltyCensusEntries(
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
  tx.set(db.doc(`sessions/${sessionId}/loyaltyCensus/current`), {
    type: 'loyalty-census',
    revision: censusRevision,
    entries: entries.map((entry) => {
      const note = entry.note ?? previousNotes.get(entry.uid);
      return note ? { ...entry, note } : entry;
    }).sort((left, right) => left.uid.localeCompare(right.uid)),
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

function storedLoyaltyCensusEntries(snapshot: DocumentSnapshot): LoyaltyCensusEntry[] | null {
  if (!snapshot.exists) return null;
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
    if (authority.session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
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
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    if (assignment.partnerUid && partnerSecretRef) {
      tx.set(partnerSecretRef, {
        visibleToUids: [assignment.partnerUid],
        payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: assignment.targetUid },
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
    const [secret, receipt, legacyEvent] = await Promise.all([
      tx.get(secretRef), tx.get(receiptRef), tx.get(eventRef),
    ]);
    if (!secret.exists) throw new HttpsError('permission-denied', 'No private Android proof is assigned to this identity.');
    const payload = secret.get('payload');
    if (typeof payload !== 'object' || payload === null || payload.kind !== 'android') {
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
    const membershipRef = db.doc(`activeMemberships/${uid}`);
    const resumedSeatId = await db.runTransaction(async (tx) => {
      const [sessionDoc, player, membership] = await Promise.all([
        tx.get(sessionRef),
        tx.get(playerRef),
        tx.get(membershipRef),
      ]);
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
      if (membership.exists && !membershipActive) tx.delete(membershipRef);
      await hydrateCanonicalSessionSetup(tx, sessionId, sessionDoc);
      if (player.exists) {
        const returningSeat = await reconcileReturningSeat(tx, sessionId, uid, player);
        const currentPressAuthority = player.get('activeConsoleRoleId') === 'press-officer';
        const storedPressHolderUid = sessionDoc.get('pressHolderUid');
        const releasePress = hasPressState(player) && (
          !currentPressAuthority || sessionDoc.get('pressEnabled') === false ||
          player.get('role') !== 'player' || hasCoreAssignment(player) ||
          (typeof storedPressHolderUid === 'string' && storedPressHolderUid !== uid)
        );
        tx.update(playerRef, {
          connected: true,
          lastSeenAt: FieldValue.serverTimestamp(),
          ...(releasePress ? releasedPressFields(player) : {}),
          ...(!releasePress && currentPressAuthority && player.get('assignedRoleId') === 'press-officer'
            ? { assignedRoleId: null } : {}),
          ...(returningSeat.clearPointer ? { seatId: null } : {}),
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
        return returningSeat.seatId;
      } else {
        tx.set(playerRef, {
          uid,
          sessionId,
          displayName,
          role: 'player',
          seatId: null,
          activeConsoleRoleId: null,
          joinedAt: FieldValue.serverTimestamp(),
          connected: true,
          lastSeenAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(sessionRef, { deleteAfter: null, updatedAt: FieldValue.serverTimestamp() });
      tx.set(membershipRef, { sessionId, connectedAt: FieldValue.serverTimestamp() });
      return null;
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
        ...(typeof sessionSnap.get('configurationLocked') === 'boolean'
          ? { configurationLocked: sessionSnap.get('configurationLocked') } : {}),
        ...(typeof sessionSnap.get('setupRevision') === 'number'
          ? { setupRevision: sessionSnap.get('setupRevision') } : {}),
        setup,
        activeVesselIds: [...setup.activeVesselIds],
        ...(announcement ? { turnStartAnnouncement: announcement } : {}),
        ...(phaseClock ? { turnPhase: phaseClock } : {}),
        ...(turnState ? { turnState } : {}),
        capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
        dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
        pressEnabled: sessionSnap.get('pressEnabled') !== false,
        pressAvailabilityRevision: pressAvailabilityRevision(sessionSnap.get('pressAvailabilityRevision')),
        shipGalacticCoordinates: activeVesselRecord(
          shipGalacticCoordinates(sessionSnap.get('shipGalacticCoordinates')), activeVesselIds,
        ),
        shipNavigationLogs: activeVesselRecord(
          shipNavigationLogs(sessionSnap.get('shipNavigationLogs')), activeVesselIds,
        ),
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
        shuttleCargo: publicShuttleCargo(sessionSnap.get('shuttleCargo')),
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
        seatId: resumedSeatId,
        ...(typeof playerSnap.get('assignedRoleId') === 'string' || playerSnap.get('assignedRoleId') === null
          ? { assignedRoleId: playerSnap.get('assignedRoleId') } : {}),
        ...(typeof playerSnap.get('shipPreferenceId') === 'string' || playerSnap.get('shipPreferenceId') === null
          ? { shipPreferenceId: playerSnap.get('shipPreferenceId') } : {}),
        activeConsoleRoleId:
          (playerSnap.get('activeConsoleRoleId') as string | null) ?? null,
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
  const resumedSeatId = await db.runTransaction(async (tx) => {
    const [currentSession, currentPlayer, membership] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(membershipRef),
    ]);
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
    if (membership.exists && !membershipActive) tx.delete(membershipRef);
    await hydrateCanonicalSessionSetup(tx, sessionId, currentSession);
    const returningSeat = await reconcileReturningSeat(tx, sessionId, uid, currentPlayer);
    const currentPressAuthority = currentPlayer.get('activeConsoleRoleId') === 'press-officer';
    const storedPressHolderUid = currentSession.get('pressHolderUid');
    const releasePress = hasPressState(currentPlayer) && (
      !currentPressAuthority || currentSession.get('pressEnabled') === false ||
      currentPlayer.get('role') !== 'player' || hasCoreAssignment(currentPlayer) ||
      (typeof storedPressHolderUid === 'string' && storedPressHolderUid !== uid)
    );
    tx.update(playerRef, {
      connected: true,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(releasePress ? releasedPressFields(currentPlayer) : {}),
      ...(!releasePress && currentPressAuthority && currentPlayer.get('assignedRoleId') === 'press-officer'
        ? { assignedRoleId: null } : {}),
      ...(returningSeat.clearPointer ? { seatId: null } : {}),
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
    return returningSeat.seatId;
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
      ...(typeof sessionSnap.get('configurationLocked') === 'boolean'
        ? { configurationLocked: sessionSnap.get('configurationLocked') } : {}),
      ...(typeof sessionSnap.get('setupRevision') === 'number'
        ? { setupRevision: sessionSnap.get('setupRevision') } : {}),
      setup,
      activeVesselIds: [...setup.activeVesselIds],
      ...(announcement ? { turnStartAnnouncement: announcement } : {}),
      ...(phaseClock ? { turnPhase: phaseClock } : {}),
      ...(turnState ? { turnState } : {}),
      capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
      dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
      pressEnabled: sessionSnap.get('pressEnabled') !== false,
      pressAvailabilityRevision: pressAvailabilityRevision(sessionSnap.get('pressAvailabilityRevision')),
      shipGalacticCoordinates: activeVesselRecord(
        shipGalacticCoordinates(sessionSnap.get('shipGalacticCoordinates')), activeVesselIds,
      ),
      shipNavigationLogs: activeVesselRecord(
        shipNavigationLogs(sessionSnap.get('shipNavigationLogs')), activeVesselIds,
      ),
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
      shuttleCargo: publicShuttleCargo(sessionSnap.get('shuttleCargo')),
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
      seatId: resumedSeatId,
      ...(typeof playerSnap.get('assignedRoleId') === 'string' || playerSnap.get('assignedRoleId') === null
        ? { assignedRoleId: playerSnap.get('assignedRoleId') } : {}),
      ...(typeof playerSnap.get('shipPreferenceId') === 'string' || playerSnap.get('shipPreferenceId') === null
        ? { shipPreferenceId: playerSnap.get('shipPreferenceId') } : {}),
      activeConsoleRoleId:
        (playerSnap.get('activeConsoleRoleId') as string | null) ?? null,
      joinedAt: isoOf(playerSnap.get('joinedAt')),
    },
  };
});

function gmInstanceFrom(
  sessionId: string,
  id: string,
  data: FirebaseFirestore.DocumentData,
  projectLegacySingle = false,
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
    claimedAt: isoOf(data.claimedAt),
  };
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
  if (logout.sessionId && logout.instanceId) {
    const instanceRef = db.doc(
      `sessions/${logout.sessionId}/gmInstances/${logout.instanceId}`,
    );
    const playerRef = db.doc(`sessions/${logout.sessionId}/players/${uid}`);
    const instancesRef = db.collection(`sessions/${logout.sessionId}/gmInstances`);
    await db.runTransaction(async (tx) => {
      const [instance, player, activeInstances] = await Promise.all([
        tx.get(instanceRef),
        tx.get(playerRef),
        tx.get(instancesRef),
      ]);
      if (!instance.exists || instance.get('uid') !== uid) return;
      tx.delete(instanceRef);
      const anotherOwnedInstance = activeInstances.docs.some((candidate) =>
        candidate.id !== logout.instanceId && candidate.get('uid') === uid);
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
    if (
      !existing.exists &&
      !mayClaimGmInstance(session.get('gmControlsLocked') === true, liveInstances.length)
    ) {
      throw commandError('failed-precondition', 'GM registration is locked.', 'conflict');
    }
    if (existing.exists && existing.get('uid') !== uid) {
      throw new HttpsError('already-exists', 'That GM instance identifier is already in use.');
    }
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
        : {}),
      claimedAt: existing.get('claimedAt') ?? FieldValue.serverTimestamp(),
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
  return {
    // This is the public authority projection. Raw claims may remain briefly
    // in Firestore while a vanished browser's lease expires, but they must not
    // count toward locked-table recovery or appear as handoff targets.
    instances: liveInstances.map((instance) =>
      gmInstanceFrom(sessionId, instance.id, instance.data() ?? {}, liveInstances.length === 1)),
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
  await db.runTransaction(async (tx) => {
    const [caller, callerPlayer] = await Promise.all([
      tx.get(callerRef),
      tx.get(callerPlayerRef),
    ]);
    if (!isLiveGmInstance(caller, callerPlayer, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    const target = action.targetInstanceId === action.instanceId
      ? caller
      : await tx.get(targetRef);
    if (!target.exists) return;
    const targetUid = target.get('uid') as string;
    const remaining = await tx.get(collection.where('uid', '==', targetUid));
    tx.delete(targetRef);
    if (remaining.size === 1) {
      tx.update(db.doc(`sessions/${action.sessionId}/players/${targetUid}`), {
        role: 'player',
      });
    }
  });
  return { targetInstanceId: action.targetInstanceId };
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
  const membershipRef = db.doc(`activeMemberships/${action.targetUid}`);
  const censusRef = db.doc(`sessions/${action.sessionId}/loyaltyCensus/current`);
  const secretsRef = db.collection(`sessions/${action.sessionId}/secrets`);

  await db.runTransaction(async (tx) => {
    const [session, caller, instance, target, membership, census, playersSnapshot, secrets] = await Promise.all([
      tx.get(sessionRef),
      tx.get(callerRef),
      tx.get(instanceRef),
      tx.get(targetRef),
      tx.get(membershipRef),
      tx.get(censusRef),
      tx.get(players),
      tx.get(secretsRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, caller, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
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

    tx.update(targetRef, {
      connected: false,
      ...disconnectedRoleState(),
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
  });

  return { targetUid: action.targetUid };
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
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipNavigationMoveRequest(request.data ?? {});
  // Fix the event clock and ids before the transaction callback. Firestore may
  // retry that callback, but a retry must not create a second-looking jump.
  const now = new Date();
  const eventIdPrefix = randomUUID();
  const sessionRef = db.doc(`sessions/${change.sessionId}`);

  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    requireActionPhase(session, 'movement', 'facilitator');
    if (change.shipId === 'capybara' && session.get('capybaraEnabled') === false) {
      throw commandError('failed-precondition', 'Capybara is not in this session.', 'conflict');
    }
    if (change.shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw commandError('failed-precondition', 'Dione is not in this session.', 'conflict');
    }
    const activeVesselIds = activeVesselIdsForSession(session);
    let move;
    try {
      move = applyShipNavigationMove({
        shipId: change.shipId,
        destination: change.destination,
        now,
        eventIdPrefix,
        coordinates: activeVesselRecord(
          shipGalacticCoordinates(session.get('shipGalacticCoordinates')), activeVesselIds,
        ),
        logs: activeVesselRecord(
          shipNavigationLogs(session.get('shipNavigationLogs')), activeVesselIds,
        ),
        shipNames: FLEET_SHIP_NAMES,
      });
    } catch (cause) {
      throw commandError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'The ship could not be moved.',
        'conflict',
      );
    }
    tx.update(sessionRef, {
      shipGalacticCoordinates: move.coordinates,
      shipNavigationLogs: move.logs,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      shipId: change.shipId,
      origin: move.origin,
      destination: move.destination,
      stardate: move.stardate,
    };
  });
});

/** Resolve one shipboard, coordinate-locked FTL jump. */
export const jumpShip = onCall<{
  sessionId?: string;
  instanceId?: string;
  shipId?: string;
  destination?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipJumpRequest(request.data ?? {});
  const now = new Date();
  const transitionId = randomUUID();
  // Firestore may retry the transaction callback. Populate this only after
  // the authoritative reads confirm a damaged drive, then reuse it so
  // contention cannot reroll the same departure.
  let integrityRoll: number | undefined;
  const sessionRef = db.doc(`sessions/${change.sessionId}`);

  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(tx, change.sessionId, uid, change.shipId, change.instanceId, false);
    const session = await tx.get(sessionRef);
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    requireTurnOneForPlayer(session, player);
    requireActionPhase(session, 'jump', player.get('role') === 'gm' ? 'facilitator' : 'player');
    if (change.shipId === 'capybara' && session.get('capybaraEnabled') === false) {
      throw commandError('failed-precondition', 'Capybara is not in this session.', 'conflict');
    }
    if (change.shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw commandError('failed-precondition', 'Dione is not in this session.', 'conflict');
    }
    const activeVesselIds = activeVesselIdsForSession(session);

    const currentTurn = sessionTurn(session.get('currentTurn'));
    const currentCoordinate = activeVesselRecord(
      shipGalacticCoordinates(session.get('shipGalacticCoordinates')), activeVesselIds,
    )[change.shipId] ?? '0000';
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
      throw commandError('failed-precondition', 'Charge the Jump Drive during this turn before departure.', 'invalid-phase');
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
      return {
        ...result,
        shipId: change.shipId,
      };
    }
    if (result.status === 'integrity-lockout') {
      tx.update(sessionRef, {
        [`shipJumpStates.${change.shipId}`]: result.state,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        ...result,
        shipId: change.shipId,
      };
    }
    if (result.status === 'drive-failure') {
      return {
        ...result,
        shipId: change.shipId,
      };
    }

    const move = applyShipNavigationMove({
      shipId: change.shipId,
      destination: change.destination,
      now,
      eventIdPrefix: transitionId,
      navigationalError: false,
      coordinates: activeVesselRecord(
        shipGalacticCoordinates(session.get('shipGalacticCoordinates')), activeVesselIds,
      ),
      logs: activeVesselRecord(
        shipNavigationLogs(session.get('shipNavigationLogs')), activeVesselIds,
      ),
      shipNames: FLEET_SHIP_NAMES,
    });
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
    tx.update(sessionRef, {
      [`shipGalacticCoordinates.${change.shipId}`]: result.destination,
      [`shipResources.${change.shipId}.fuel`]: result.remainingFuel,
      [`maintenanceCycles.${change.shipId}`]: nextCycle,
      [`shipJumpStates.${change.shipId}`]: result.state,
      [`shipJumpTransitions.${change.shipId}`]: result.transition,
      shipNavigationLogs: move.logs,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      ...result,
      shipId: change.shipId,
    };
  });
});

/** Lock one ship's command console while it is travelling. */
export const setShipConsoleLock = onCall<{
  sessionId?: string;
  shipId?: string;
  instanceId?: string;
  locked?: boolean;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipConsoleLockRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  const playerRef = db.doc(`sessions/${change.sessionId}/players/${uid}`);

  await db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, false,
    );
    const session = await tx.get(sessionRef);
    const player = await tx.get(playerRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    requireActiveGameplayPhase(session);
    requireTurnOneForPlayer(session, player);
    const activeVesselIds = activeVesselIdsForSession(session);
    tx.update(sessionRef, {
      shipConsoleLocks: {
        ...activeVesselRecord(shipConsoleLocks(session.get('shipConsoleLocks')), activeVesselIds),
        [change.shipId]: change.locked,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { shipId: change.shipId, locked: change.locked };
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
      tx, advance.sessionId, advance.requestId, 'turn advance', [],
    );
    const replay = replayBoundCommand(receipt, fingerprint, isTurnAdvanceResult, 'turn advance');
    if (replay) return replay;
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    if (session.get('phase') !== undefined && session.get('phase') !== 'active') {
      throw commandError(
        'failed-precondition',
        'The final turn is already complete; endgame evaluation is in progress.',
        'invalid-phase',
      );
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn !== advance.expectedTurn) {
      throw commandError('failed-precondition', 'The turn changed. Wait for the live update and try again.', 'stale-revision');
    }
    const activePhase = turnPhaseState(session.get('turnPhase'));
    if (currentTurn === 0) {
      throw commandError(
        'failed-precondition',
        'Turn 0 is for setup. Start the game before advancing turns.',
        'invalid-phase',
      );
    }
    if (!activePhase || activePhase.turn !== currentTurn) {
      throw commandError(
        'failed-precondition',
        'No valid current server phase is available for turn advancement.',
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
          : 'A turn phase timer is still active. Confirm the override to advance early.',
        'invalid-phase',
      );
    }
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
    );
    if (result.phase === 'debrief') {
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
      throw commandError('failed-precondition', 'The single-player demo is only available from Turn 0.', 'invalid-phase');
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
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    const current = turnStartAnnouncement(session.get('turnStartAnnouncement'));
    if (!current || current.turn !== currentTurn || currentTurn < 1) {
      throw commandError('failed-precondition', 'No current turn transmission is available to replay.', 'invalid-phase');
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
  const transitionServerTime = new Date().toISOString();

  return db.runTransaction(async tx => {
    const [session, player] = await Promise.all([tx.get(sessionRef), tx.get(playerRef)]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    if (sessionTurn(session.get('currentTurn')) !== requestData.expectedTurn) {
      throw commandError('failed-precondition', 'The turn changed. Wait for the live update and try again.', 'stale-revision');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== requestData.expectedTurn) {
      throw commandError('failed-precondition', 'No current turn phase is available.', 'invalid-phase');
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
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace,
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
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn !== requestData.expectedTurn) {
      throw commandError('failed-precondition', 'The turn changed. Wait for the live update and try again.', 'stale-revision');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== currentTurn) {
      throw commandError('failed-precondition', 'No current turn phase is available.', 'invalid-phase');
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
  // Firestore may retry a transaction; one logical command must retain one audit id.
  const eventId = randomUUID();
  const transitionServerTime = new Date().toISOString();

  return db.runTransaction(async tx => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isLiveGmInstance(instance, player, uid)) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn < 1) {
      throw commandError('failed-precondition', 'The emergency timer is unavailable during Turn 0.', 'invalid-phase');
    }
    if (currentTurn !== requestData.expectedTurn) {
      throw commandError('failed-precondition', 'The turn changed. Wait for the live update and try again.', 'stale-revision');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== currentTurn) {
      throw commandError('failed-precondition', 'No current turn phase is available.', 'invalid-phase');
    }
    const currentlyPaused = phase.timerPause !== undefined;
    if (currentlyPaused === requestData.paused) {
      const turnState = sessionTurnState(session, phase);
      return { turnPhase: phase, ...(turnState ? { turnState } : {}) };
    }

    const turnPhase = requestData.paused
      ? pauseActiveTurnPhase(phase)
      : resumePausedTurnPhase(phase);
    if (!turnPhase) {
      throw commandError(
        'failed-precondition',
        requestData.paused
          ? 'The live turn timer has already expired.'
          : 'The emergency timer is not currently paused.',
        'stale-revision',
      );
    }
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
      source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace,
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
          'The first Wolf-attack window can be deferred only during Turn 1.',
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
          'The first Wolf-attack timing marker is unavailable in this turn.',
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

/** AEGIS may grant the SNN Press shuttle a limited exception during restricted airspace. */
export const unlockPressAirspace = onCall<{ sessionId?: unknown; instanceId?: unknown }>(async request => {
  const uid = requireUid(request.auth);
  const requestData = requireAirspaceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${requestData.sessionId}`);
  const transitionServerTime = new Date().toISOString();
  return db.runTransaction(async tx => {
    const player = await tx.get(db.doc(`sessions/${requestData.sessionId}/players/${uid}`));
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    await requireConsoleAuthority(tx, requestData.sessionId, player, 'admiral', requestData.instanceId);
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('pressEnabled') === false) {
      throw commandError('failed-precondition', 'Press is disabled.', 'unauthorized');
    }
    requireTurnOneForPlayer(session, player);
    if (session.get('phase') === 'closed') {
      throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== sessionTurn(session.get('currentTurn'))) {
      throw commandError('failed-precondition', 'No current airspace window is available.', 'invalid-phase');
    }
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
    if (phase.airspace.state === 'restricted' && Date.now() >= Date.parse(phase.teamPhaseEndsAt)) {
      const turnPhase = {
        ...phase,
        airspace: { ...phase.airspace, state: 'lifted' as const, tickerActive: true },
      };
      const turnState = phaseTransitionTurnState(session, turnPhase);
      const fleetTicker = publishSessionFleetTicker(requestData.sessionId, session, {
        source: 'automatic', priority: FLEET_TICKER_PRIORITIES.airspace,
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
  sessionId?: string; shipId?: string; roleId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const activation = requireShipConfettiRequest(request.data ?? {});
  const shipId = activation.shipId;
  if (!isFleetShipId(shipId)) {
    throw new HttpsError('invalid-argument', 'Unknown fleet ship.');
  }
  const sessionRef = db.doc(`sessions/${activation.sessionId}`);
  const playerRef = db.doc(`sessions/${activation.sessionId}/players/${uid}`);
  const eventRef = db.collection(`sessions/${activation.sessionId}/events`).doc();
  const approvalRef = db.doc(`sessions/${activation.sessionId}/shipConfettiApprovals/${shipId}`);
  const connectedPlayersQuery = db.collection(`sessions/${activation.sessionId}/players`)
    .where('connected', '==', true);

  const status = await db.runTransaction(async (tx): Promise<'fired' | 'awaiting-officer'> => {
    const [session, player, approval, connectedPlayers] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(approvalRef),
      tx.get(connectedPlayersQuery),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    requireActiveGameplayPhase(session);
    requireTurnOneForPlayer(session, player);
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
      if (!activeRoleIds.includes(activation.roleId) ||
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

/** Renew the short server-side lease that distinguishes live devices from ghosts. */
export const refreshPresence = onCall<{
  sessionId?: string; activeConsoleRoleId?: string | null; instanceId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId, instanceId } = requireAirspaceRequest(request.data ?? {});
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
  await db.runTransaction(async (tx) => {
    const requestedRoleId = typeof request.data?.activeConsoleRoleId === 'string'
      ? request.data.activeConsoleRoleId
      : null;
    const roleHolders = requestedRoleId
      ? db.collection(`sessions/${sessionId}/players`)
        .where('activeConsoleRoleId', '==', requestedRoleId)
      : null;
    const [player, session, instance, holders, pressHolders, wolfSecret, players, secrets, census] = await Promise.all([
      tx.get(playerRef),
      tx.get(sessionRef),
      instanceRef ? tx.get(instanceRef) : null,
      roleHolders ? tx.get(roleHolders) : null,
      tx.get(pressHoldersRef),
      tx.get(wolfSecretRef),
      tx.get(playersRef),
      tx.get(secretsRef),
      tx.get(censusRef),
    ]);
    if (!isActivePlayer(player)) {
      throw new HttpsError('permission-denied', 'Reconnect to the session first.');
    }
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (instanceId && (!instance || !isLiveGmInstance(instance, player, uid))) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
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
    const explicitRelease = request.data?.activeConsoleRoleId === null;
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
    else if (typeof request.data?.activeConsoleRoleId === 'string') {
      const requestedRoleId = request.data.activeConsoleRoleId;
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
      request.data?.activeConsoleRoleId !== null
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
  });
  return { sessionId };
});

/** Mark this identity disconnected and start retention on a transition to empty. */
export const disconnectFromSession = onCall<{ sessionId?: string; instanceId?: string }>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId, instanceId } = requireAirspaceRequest(request.data ?? {});
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
    const [sessionDoc, player, membership, connected, ownedInstances, wolfSecret, playerSnapshot, secrets, census] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(membershipRef),
      tx.get(players.where('connected', '==', true)),
      tx.get(gmInstances.where('uid', '==', uid)),
      tx.get(wolfSecretRef),
      tx.get(allPlayers),
      tx.get(secretsRef),
      tx.get(censusRef),
    ]);
    if (!sessionDoc.exists || !player.exists) {
      throw new HttpsError('permission-denied', 'You are no longer in that session.');
    }
    const ownsRequestedInstance = instanceId !== undefined && ownedInstances.docs.some((instance) =>
      instance.id === instanceId && instance.get('uid') === uid);
    const liveSibling = instanceId !== undefined && ownedInstances.docs.some((instance) =>
      instance.id !== instanceId && isLiveGmInstance(instance, player, uid));
    if (instanceId !== undefined && liveSibling) {
      if (ownsRequestedInstance) {
        tx.delete(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`));
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
    for (const instance of ownedInstances.docs) tx.delete(instance.ref);
    if (membership.exists && membership.get('sessionId') === sessionId) {
      tx.delete(membershipRef);
    }
    if (wasConnected && connected.size === 1) {
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
      const [session, player, membership, connected, ownedInstances, wolfSecret, playerSnapshot, secrets, census] = await Promise.all([
        tx.get(sessionRef),
        tx.get(playerRef),
        tx.get(membershipRef),
        tx.get(players.where('connected', '==', true)),
        tx.get(gmInstances.where('uid', '==', uid)),
        tx.get(wolfSecretRef),
        tx.get(allPlayers),
        tx.get(secretsRef),
        tx.get(censusRef),
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
      for (const instance of ownedInstances.docs) tx.delete(instance.ref);
      if (membership.exists && membership.get('sessionId') === sessionId) {
        tx.delete(membershipRef);
      }
      if (connected.size === 1) {
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

async function requireShipCounterAuthority(
  tx: Transaction,
  sessionId: string,
  uid: string,
  shipId: string,
  instanceId?: string,
  gmOnly = false,
): Promise<void> {
  if (!isResourceShipId(shipId)) throw new HttpsError('invalid-argument', 'Unknown fleet ship.');
  const [player, session] = await Promise.all([
    tx.get(db.doc(`sessions/${sessionId}/players/${uid}`)),
    tx.get(db.doc(`sessions/${sessionId}`)),
  ]);
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
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
    return;
  }
  const ownRole = player.get('activeConsoleRoleId');
  const activeRoleIds = configuredRoleIds(session);
  if (typeof ownRole !== 'string' || !activeRoleIds.includes(ownRole) ||
      roleShipId(ownRole) !== shipId) {
    throw new HttpsError('permission-denied', 'An active role aboard this ship is required.');
  }
}

async function requireConsoleAuthority(
  tx: Transaction, sessionId: string, player: DocumentSnapshot, targetRole: string,
  instanceId?: string,
): Promise<void> {
  const session = await tx.get(db.doc(`sessions/${sessionId}`));
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  const activeRoleIds = configuredRoleIds(session);
  const ownRole = player.get('activeConsoleRoleId');
  if (player.get('role') === 'gm') {
    if (!instanceId) {
      throw new HttpsError('permission-denied', 'Active GM instance required.');
    }
    const instance = await tx.get(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`));
    if (!isLiveGmInstance(instance, player, player.id)) {
      throw new HttpsError('permission-denied', 'Active GM instance required.');
    }
    // A GM may operate a ship console without selecting a player station, but
    // the named browser lease remains the authority boundary for the command.
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

export const adjustShipResource = onCall<{
  sessionId: string; shipId: string; resourceId: string; delta: number; instanceId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipCounterRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const inventories = shipResources(session.get('shipResources'));
    const inventory = inventories[change.shipId];
    const current = inventory?.[change.resourceId];
    if (current === undefined) {
      throw commandError('failed-precondition', 'That ship does not hold this resource.', 'malformed-input');
    }
    const amount = nextResourceAmount(current, change.delta);
    tx.update(sessionRef, {
      [`shipResources.${change.shipId}.${change.resourceId}`]: amount,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { amount };
  });
});

export const adjustShipUnrest = onCall<{
  sessionId: string; shipId: string; delta: number; instanceId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipUnrestRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
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
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { amount: result.amount, alertRaised: result.kind === 'overflow' };
  });
});

export const dismissUnrestAlert = onCall<{
  sessionId: string; shipId: string; instanceId: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const dismissal = requireUnrestDismissalRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${dismissal.sessionId}`);
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, dismissal.sessionId, uid, dismissal.shipId, dismissal.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const alerts = (session.get('unrestAlerts') ?? {}) as Record<string, StoredUnrestAlert>;
    const alert = alerts[dismissal.shipId];
    if (!alert?.targetGmInstanceIds.includes(dismissal.instanceId)) return { dismissed: true };
    const remaining = alert.targetGmInstanceIds.filter((id) => id !== dismissal.instanceId);
    const nextAlerts = { ...alerts };
    if (remaining.length === 0) delete nextAlerts[dismissal.shipId];
    else nextAlerts[dismissal.shipId] = { ...alert, targetGmInstanceIds: remaining };
    tx.update(sessionRef, { unrestAlerts: nextAlerts, updatedAt: FieldValue.serverTimestamp() });
    return { dismissed: true };
  });
});

/**
 * Draw randomly from the remaining deck for the GM damage control. Gameplay
 * mechanics use the same deck resolver inside their authoritative transactions.
 */
export const addShipDamage = onCall<{
  sessionId: string; shipId: string; instanceId: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipDamageRequest(request.data ?? {});
  if (!SHIP_DAMAGE_DECKS[change.shipId]) {
    throw new HttpsError('invalid-argument', 'This ship has no implemented damage deck.');
  }
  // Transactions may retry. Fix both random inputs before entering the callback
  // so contention cannot quietly reroll the card or fork the audit identity.
  const entropyRange = 0x1_0000_0000;
  const drawEntropy = randomInt(0, entropyRange);
  const eventId = randomUUID();
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('phase') === 'closed') throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    const storedDamage = shipDamage(session.get('shipDamage'));
    const current = storedDamage[change.shipId] ?? { damagedSystemIds: [], destroyed: false };
    const result = drawShipDamage(
      change.shipId,
      current,
      (upperBound) => Math.floor((drawEntropy / entropyRange) * upperBound),
    );
    const eventRef = db.doc(`sessions/${change.sessionId}/damageDraws/${eventId}`);

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
    tx.update(sessionRef, {
      [`shipDamage.${change.shipId}`]: result.state,
      [`shipSurvivors.${change.shipId}`]: nextPopulation,
      [`shipUnrest.${change.shipId}`]: nextUnrest,
      populationAlerts, unrestAlerts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (result.destroyed) {
      tx.set(eventRef, {
        type: 'ship-destroyed',
        shipId: change.shipId,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { destroyed: true };
    }
    tx.set(eventRef, {
      type: 'ship-damage',
      shipId: change.shipId,
      card: result.card.card,
      systemId: result.card.systemId,
      systemName: result.card.systemName,
      recycled: result.recycled,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { card: result.card, recycled: result.recycled, destroyed: false };
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
    requireTurnOneForPlayer(session, player);

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
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipUnrestRequest(request.data ?? {});
  if (!populationTrackForShip(change.shipId)) {
    throw new HttpsError('invalid-argument', 'This ship has no survivor track.');
  }
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(tx, change.sessionId, uid, change.shipId, change.instanceId, true);
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const alerts = (session.get('populationAlerts') ?? {}) as Record<string, StoredPopulationAlert>;
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
    if (result.alertRaised) {
      const instances = await tx.get(db.collection(`sessions/${change.sessionId}/gmInstances`));
      const targetGmInstanceIds = instances.docs.map((instance) => instance.id);
      if (targetGmInstanceIds.length > 0) {
        nextAlerts[change.shipId] = {
          shipId: change.shipId,
          shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[change.shipId] ?? change.shipId,
          population: result.amount, targetGmInstanceIds, createdAt: new Date().toISOString(),
        };
      }
    }
    tx.update(sessionRef, {
      [`shipSurvivors.${change.shipId}`]: result.amount,
      populationAlerts: nextAlerts, updatedAt: FieldValue.serverTimestamp(),
    });
    return result;
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
}>(async (request) => {
  const uid = requireUid(request.auth);
  const change = requireShipCounterBatchRequest(request.data ?? {});
  if (change.counter === 'population' && !populationTrackForShip(change.shipId)) {
    throw new HttpsError('invalid-argument', 'This ship has no survivor track.');
  }
  const sessionRef = db.doc(`sessions/${change.sessionId}`);
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, true,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');

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
        updatedAt: FieldValue.serverTimestamp(),
      });
      return result;
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
        updatedAt: FieldValue.serverTimestamp(),
      });
      return result;
    }

    const alerts = (session.get('populationAlerts') ?? {}) as Record<string, StoredPopulationAlert>;
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
    if (result.alertRaised) {
      const instances = await tx.get(db.collection(`sessions/${change.sessionId}/gmInstances`));
      const targetGmInstanceIds = instances.docs.map((instance) => instance.id);
      if (targetGmInstanceIds.length > 0) {
        nextAlerts[change.shipId] = {
          shipId: change.shipId,
          shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[change.shipId]
            ?? change.shipId,
          population: result.amount,
          targetGmInstanceIds,
          createdAt: new Date().toISOString(),
        };
      }
    }
    tx.update(sessionRef, {
      [`shipSurvivors.${change.shipId}`]: result.amount,
      populationAlerts: nextAlerts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return result;
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
          revision: currentRevision,
          capacity,
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
      revision,
      capacity,
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

export const dismissPopulationAlert = onCall<{
  sessionId: string; shipId: string; instanceId: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const dismissal = requireUnrestDismissalRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${dismissal.sessionId}`);
  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(tx, dismissal.sessionId, uid, dismissal.shipId, dismissal.instanceId, true);
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const alerts = (session.get('populationAlerts') ?? {}) as Record<string, StoredPopulationAlert>;
    const alert = alerts[dismissal.shipId];
    if (!alert?.targetGmInstanceIds.includes(dismissal.instanceId)) return { dismissed: true };
    const remaining = acknowledgePopulationAlert(alert.targetGmInstanceIds, dismissal.instanceId);
    const nextAlerts = { ...alerts };
    if (remaining.length === 0) delete nextAlerts[dismissal.shipId];
    else nextAlerts[dismissal.shipId] = { ...alert, targetGmInstanceIds: remaining };
    tx.update(sessionRef, { populationAlerts: nextAlerts, updatedAt: FieldValue.serverTimestamp() });
    return { dismissed: true };
  });
});

function smallShipId(value: string): SmallShipId | undefined {
  return (SMALL_SHIP_IDS as readonly string[]).includes(value) ? value as SmallShipId : undefined;
}

function storedSmallShipState(session: DocumentSnapshot, id: SmallShipId): SmallShipState | undefined {
  const stored = session.get('smallShipStates');
  return isRecord(stored) ? parseSmallShipState(stored[id], id) : undefined;
}

function hasStoredSmallShipState(session: DocumentSnapshot, id: SmallShipId): boolean {
  const stored = session.get('smallShipStates');
  return isRecord(stored) && Object.prototype.hasOwnProperty.call(stored, id);
}

function requireSmallShipMode(session: DocumentSnapshot, id: SmallShipId): void {
  if (id === 'capybara-small' &&
      (session.get('expansion') !== 'base' || session.get('capybaraEnabled') === false)) {
    throw commandError(
      'failed-precondition',
      'Base Capybara is unavailable when the expansion Capybara is selected or disabled.',
      'conflict',
    );
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
}>;

function sameSmallShipFingerprint(value: unknown, expected: SmallShipCommandFingerprint): boolean {
  if (!isRecord(value)) return false;
  const consoles = value.consoles;
  return value.kind === expected.kind && value.sessionId === expected.sessionId &&
    value.smallShipId === expected.smallShipId && value.actorUid === expected.actorUid &&
    value.instanceId === expected.instanceId && value.expectedRevision === expected.expectedRevision &&
    value.action === (expected.action ?? undefined) && value.hostShipId === (expected.hostShipId ?? undefined) &&
    value.docked === (expected.docked ?? undefined) && value.foodLevel === (expected.foodLevel ?? null) &&
    value.waterLevel === (expected.waterLevel ?? null) && Array.isArray(consoles) &&
    consoles.length === (expected.consoles ?? []).length &&
    consoles.every((item, index) => item === expected.consoles?.[index]);
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
    const prior = await tx.get(requestRef);
    const replay = smallShipReceiptReply(prior, fingerprint, uid);
    if (replay) return replay;
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    requireSmallShipMode(session, id);
    const parsedCurrent = storedSmallShipState(session, id);
    if (hasStoredSmallShipState(session, id) && !parsedCurrent) {
      throw commandError('failed-precondition', 'The stored small-ship state is malformed. Refresh the session before operating it.', 'conflict');
    }
    const current = parsedCurrent ?? emptySmallShipState(id);
    if (current.dockingRevision !== data.expectedRevision) {
      const stale = {
        status: 'stale' as const, requestId: data.requestId, sessionId: data.sessionId,
        smallShipId: id, expectedRevision: data.expectedRevision,
        currentRevision: current.dockingRevision,
      };
      tx.set(requestRef, { ...fingerprint, requestId: data.requestId, actorUid: uid, fingerprint, reply: stale, createdAt: FieldValue.serverTimestamp() });
      return stale;
    }
    requireSmallShipDockingPhase(session);
    const authorityHost = data.docked ? data.hostShipId : current.hostShipId;
    if (!authorityHost || !isResourceShipId(authorityHost) ||
        !activeVesselIdsForSession(session).includes(authorityHost)) {
      throw commandError('failed-precondition', 'Small ships must dock with an active fleet host.', 'conflict');
    }
    await requireShipCounterAuthority(tx, data.sessionId, uid, authorityHost, data.instanceId, true);
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
    };
    tx.update(sessionRef, {
      [`smallShipStates.${id}`]: next,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(requestRef, { ...fingerprint, requestId: data.requestId, actorUid: uid, fingerprint, reply: committed, createdAt: FieldValue.serverTimestamp() });
    return committed;
  });
  return reply;
});

/** Run the four-step small-ship cycle against the docked host's resources. */
export const runSmallShipMaintenance = onCall<{
  sessionId?: unknown; smallShipId?: unknown; shipId?: unknown; requestId?: unknown; action?: unknown;
  expectedRevision?: unknown; instanceId?: unknown; foodLevel?: unknown; waterLevel?: unknown; consoles?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(key => !['sessionId', 'smallShipId', 'shipId', 'requestId', 'action', 'expectedRevision', 'instanceId', 'foodLevel', 'waterLevel', 'consoles'].includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid small-ship maintenance request.');
  }
  const parsed = requireSmallShipMaintenanceRequest(raw);
  const id = smallShipId(parsed.smallShipId);
  const data = {
    ...parsed,
    ...(raw.foodLevel === undefined ? {} : { foodLevel: raw.foodLevel as number }),
    ...(raw.waterLevel === undefined ? {} : { waterLevel: raw.waterLevel as number }),
    ...(raw.consoles === undefined ? {} : { consoles: raw.consoles as string[] }),
  };
  if (!id || !['begin', 'rations', 'unrest', 'riot', 'reactor', 'end'].includes(data.action) ||
      [data.foodLevel, data.waterLevel].some(level => level !== undefined && (!Number.isSafeInteger(level) || level < 0 || level > 3)) ||
      (data.consoles !== undefined && (!Array.isArray(data.consoles) || data.consoles.length > 20 || data.consoles.some(consoleId => typeof consoleId !== 'string')))) {
    throw new HttpsError('invalid-argument', 'Invalid small-ship maintenance choices.');
  }
  const fingerprint: SmallShipCommandFingerprint = {
    kind: 'maintenance', sessionId: data.sessionId, smallShipId: id, actorUid: uid,
    instanceId: data.instanceId ?? null, expectedRevision: data.expectedRevision,
    action: data.action, foodLevel: data.foodLevel ?? null, waterLevel: data.waterLevel ?? null,
    consoles: [...(data.consoles ?? [])],
  };
  const requestRef = db.doc(`sessions/${data.sessionId}/smallShipRequests/${data.requestId}`);
  const sessionRef = db.doc(`sessions/${data.sessionId}`);
  const preflight = await db.runTransaction(async tx => {
    const prior = await tx.get(requestRef);
    const replay = smallShipReceiptReply(prior, fingerprint, uid);
    if (replay) return { player: undefined, state: undefined, replay };
    const { player, state } = await requireSmallShipHostAuthority(
      tx, data.sessionId, uid, data.instanceId, id,
    );
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
    requireTurnOneForPlayer(session, player);
    if (state.cycle.revision !== data.expectedRevision) {
      const stale = {
        status: 'stale' as const, requestId: data.requestId, sessionId: data.sessionId,
        smallShipId: id, action: data.action, expectedRevision: data.expectedRevision,
        currentRevision: state.cycle.revision,
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
        consoles: data.consoles, now: serverTime,
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
      phase: 'active' as const, serverTime, cycle: result.state.cycle,
      result: { state: result.state, hostResources: result.hostResources },
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
  consoleRoleId: string | null;
}>;

type MaintenanceCommand = ReturnType<typeof requireMaintenanceRequest> & {
  foodLevel?: number;
  waterLevel?: number;
  consoles?: string[];
  refuels?: Record<string, string>;
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
  const ownRoleId = String(player.get('activeConsoleRoleId') ?? '');
  const activeRoleIds = (snapshot.get('activeRoleIds') as string[] | undefined) ??
    DEFAULT_ACTIVE_ROLE_IDS;
  const joint = player.get('role') === 'player' &&
    isJointEngineeringRoleAvailable(activeRoleIds, ownRoleId) &&
    jointEngineeringShipsForRole(ownRoleId).includes(shipId);
  if (!joint) {
    await requireShipCounterAuthority(tx, sessionId, uid, shipId, instanceId);
  }
  if (consoleRoleId && player.get('role') !== 'gm') {
    if (joint) {
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
  return reply.status === 'stale' ? reply : { ...reply, status: 'replayed' };
}

/** One atomic, revision-checked maintenance action. Dice are never supplied by a client. */
export const runMaintenance = onCall<{
  sessionId?: unknown; shipId?: unknown; requestId?: unknown; action?: unknown; expectedRevision?: unknown;
  instanceId?: unknown; foodLevel?: unknown; waterLevel?: unknown;
  consoles?: unknown; refuels?: unknown; consoleRoleId?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const raw = request.data;
  const allowed = ['sessionId', 'shipId', 'requestId', 'action', 'expectedRevision', 'instanceId', 'foodLevel', 'waterLevel', 'consoles', 'refuels', 'consoleRoleId'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !allowed.includes(key))) {
    throw new HttpsError('invalid-argument', 'Invalid maintenance request.');
  }
  const parsed = requireMaintenanceRequest(raw);
  const data: MaintenanceCommand = {
    ...parsed,
    ...(raw.foodLevel === undefined ? {} : { foodLevel: raw.foodLevel as number }),
    ...(raw.waterLevel === undefined ? {} : { waterLevel: raw.waterLevel as number }),
    ...(raw.consoles === undefined ? {} : { consoles: raw.consoles as string[] }),
    ...(raw.refuels === undefined ? {} : { refuels: raw.refuels as Record<string, string> }),
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
    (data.consoles !== undefined && (!Array.isArray(data.consoles) || data.consoles.length > 20 || data.consoles.some(id => typeof id !== 'string'))) ||
    (data.refuels !== undefined && (typeof data.refuels !== 'object' || data.refuels === null || Array.isArray(data.refuels) || Object.values(data.refuels).some(id => typeof id !== 'string'))) ||
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
    requireTurnOneForPlayer(snapshot, player);
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
    const unrestAlerts = { ...(snapshot.get('unrestAlerts') ?? {}) } as Record<string, StoredUnrestAlert>;
    const populationAlerts = { ...(snapshot.get('populationAlerts') ?? {}) } as Record<string, StoredPopulationAlert>;
    if (unrestAlerts[data.shipId] || populationAlerts[data.shipId]) {
      throw commandError('failed-precondition', 'A GM must acknowledge the ship alert first.', 'invalid-phase');
    }
    const serverTime = stableOccurredAt;
    let result: ReturnType<typeof advanceMaintenance>;
    try {
      result = advanceMaintenance({
        ...data, cycle: currentCycle, currentTurn,
        resources: shipResources(snapshot.get('shipResources'))[data.shipId]!,
        damage: shipDamage(snapshot.get('shipDamage'))[data.shipId] ?? { damagedSystemIds: [], destroyed: false },
        unrest, population, dockings: snapshot.get('shuttleDockings') ?? [],
        cargo: snapshot.get('shuttleCargo') ?? {}, fuelled: snapshot.get('shuttleFuelled') ?? {},
        upgraded: (snapshot.get('shipUpgrades') ?? {})[data.shipId] ?? [], rolls: stableRolls,
        entropy: stableEntropy, now: serverTime, damageDrawId: eventId,
      });
    } catch (cause) {
      throw commandError('failed-precondition', cause instanceof Error ? cause.message : 'Maintenance failed.', 'conflict');
    }
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
    const entries = data.action === 'begin' ? [] : (undo.get('entries') ?? []) as Array<{ fields: MaintenanceUndoField[] }>;
    const immutableFields = result.damageDraw ? [
      `shipDamage.${data.shipId}`,
      `shipSurvivors.${data.shipId}`,
      `shipUnrest.${data.shipId}`,
      'unrestAlerts',
      'populationAlerts',
    ] : [];
    entries.push({ fields: captureMaintenanceUndo(field => snapshot.get(field), patch, immutableFields) });
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
      phase: 'active' as const,
      serverTime,
      cycle: result.cycle,
      result: {
        resources: result.resources, damage: result.damage, unrest: result.unrest,
        population: result.population, cargo: result.cargo, fuelled: result.fuelled,
      },
    };
    tx.set(undoRef, { turn: currentTurn, entries });
    tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
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
      tx.set(db.doc(`sessions/${data.sessionId}/damageDraws/${eventId}`), {
        shipId: data.shipId, requestId: data.requestId, eventId,
        createdAt: FieldValue.serverTimestamp(),
        ...(draw.destroyed ? { type: 'ship-destroyed' } : {
          type: 'ship-damage', ...draw.card, recycled: draw.recycled,
        }),
      });
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
      ...(result.damageDraw ? { damageDrawId: eventId } : {}),
      fingerprint, reply,
      createdAt: FieldValue.serverTimestamp(),
    });
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
    if (player.get('role') === 'gm' && data.instanceId) {
      await requireShipCounterAuthority(tx, data.sessionId, uid, 'aegis', data.instanceId, true);
    } else await requireConsoleAuthority(tx, data.sessionId, player, 'admiral', data.instanceId);
    const session = await tx.get(ref);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const receipt = receiptRef ? await tx.get(receiptRef) : undefined;
    if (receipt && fingerprint) {
      const replay = replayBoundCommand(receipt, fingerprint, isFleetAlertResult, 'fleet red alert');
      if (replay) return replay;
    }
    requireTurnOneForPlayer(session, player);
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
    const fleetTicker = data.active
      ? publishSessionFleetTicker(data.sessionId, session, {
        source: 'admiral', priority: FLEET_TICKER_PRIORITIES.admiral,
        text: `ICSN ADMIRAL // ${text ?? 'RED ALERT // WOLF ATTACK IMMINENT, ALL HANDS TO BATTLE STATIONS'}`,
        tone: 'danger', sourceId: `red-alert:${fleetRedAlert.revision}`,
      }, serverTime)
      : publishSessionFleetTicker(data.sessionId, session, {
        source: 'automatic', priority: FLEET_TICKER_PRIORITIES.admiral,
        text: FLEET_TICKER_COPY.standDown, tone: 'normal', passCount: 2,
        expiresAt: standDownExpiry(serverTime), sourceId: `red-alert:${fleetRedAlert.revision}`,
      }, serverTime);
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
    const fleetTicker = publishSessionFleetTicker(data.sessionId, session, {
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
    const fleetTicker = dismissFleetTickerSource(
      data.sessionId,
      fleetTickerForMutation(data.sessionId, session, serverTime),
      data.dispatchId,
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
}>(async request => {
  const uid = requireUid(request.auth);
  const change = requireShipDamageRequest(request.data ?? {});
  if (!SHIP_DAMAGE_DECKS[change.shipId]) throw new HttpsError('invalid-argument', 'Unknown damage deck.');
  const eventId = randomUUID();
  const ref = db.doc(`sessions/${change.sessionId}`);
  return db.runTransaction(async tx => {
    await requireShipCounterAuthority(tx, change.sessionId, uid, change.shipId, change.instanceId, true);
    const session = await tx.get(ref);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('phase') === 'closed') throw commandError('failed-precondition', 'This session is closed.', 'terminal-session');
    tx.update(ref, {
      [`shipDamage.${change.shipId}`]: { damagedSystemIds: [], destroyed: false },
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${change.sessionId}/events/${eventId}`), buildPrivacySafeEventRecord({
      type: 'ship-repaired',
      payload: { shipId: change.shipId, actorUid: uid },
      createdAt: FieldValue.serverTimestamp(),
    }));
    return { repaired: true };
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
    await requireShipCounterAuthority(tx, change.sessionId, uid, change.shipId, change.instanceId, true);
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
    const reply = {
      status: 'committed' as const,
      requestId: change.requestId,
      sessionId: change.sessionId,
      shipId: change.shipId,
      expectedRevision: change.expectedRevision,
      revision: change.expectedRevision + 1,
      eventId,
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
