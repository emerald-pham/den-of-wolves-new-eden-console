import { captureMaintenanceUndo, restoreMaintenanceUndo, type MaintenanceUndoField } from './maintenanceRollback';
import { canOperateRole, shipForRole } from './crewAccess';
import { advanceMaintenance, MAINTENANCE_RULES, emptyMaintenanceCycle, type MaintenanceCycle } from './maintenance';
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
  requirePlayerKickRequest,
  requireOpenAirspacePhaseRequest,
  requireTurnAdvanceRequest,
  requireShipConfettiRequest,
  requireShipCounterBatchRequest,
  requireShipCounterRequest,
  requireShipDamageRequest,
  requireShipJumpRequest,
  requireShipNavigationMoveRequest,
  requireShipConsoleLockRequest,
  requireShipUnrestRequest,
  requireUnrestDismissalRequest,
  requireSessionRequest,
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
  isLiveSetupGm,
  loyaltyAssignmentDecision,
  normalizeSessionConfiguration,
  normalizePersistedSessionConfiguration,
  readinessForSetup,
  roleAssignmentDecision,
  stableSeatsForRoles,
  validateExplicitLoyaltySetup,
  type LoyaltyKind,
} from './gameSetup';
import {
  INITIAL_SHIP_RESOURCES,
  INITIAL_SHIP_UNREST,
  canAdjustShipCounter,
  isResourceShipId,
  nextResourceAmount,
  shipResources,
  shipUnrest,
  unrestChange,
} from './resources';
import {
  PRESENCE_LEASE_MS,
  activeSessionConflicts,
  deletionDeadline,
  isPresenceStale,
} from './sessionLifecycle';
import { SHIP_DAMAGE_DECKS, drawShipDamage, shipDamage } from './shipDamage';
import {
  applyPopulationSteps,
  applyResourceSteps,
  applyUnrestSteps,
} from './shipCounterBatch';
import { pressDispatchState } from './pressDispatchState';
import {
  INITIAL_SHUTTLE_DOCKINGS,
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
  turnPhaseState,
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

function shipGalacticCoordinates(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return { ...INITIAL_SHIP_GALACTIC_COORDINATES };
  }
  return { ...INITIAL_SHIP_GALACTIC_COORDINATES, ...value as Record<string, string> };
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
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_JUMP_TRANSITIONS).flatMap((shipId) => {
    const raw = stored[shipId];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];
    const transition = raw as Record<string, unknown>;
    if (
      typeof transition.id !== 'string' || typeof transition.shipId !== 'string' ||
      typeof transition.origin !== 'string' || typeof transition.destination !== 'string' ||
      typeof transition.occurredAt !== 'string'
    ) return [];
    return [[shipId, transition as unknown as JumpTransition]];
  }));
}

function shipNavigationLogs(value: unknown): NavigationLogs {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_NAVIGATION_LOGS).map((shipId) => [
    shipId,
    Array.isArray(stored[shipId])
      ? stored[shipId] as NavigationLogEntry[]
      : [],
  ]));
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

function hasCoreAssignment(player: DocumentSnapshot): boolean {
  const assignedRoleId = player.get('assignedRoleId');
  return typeof assignedRoleId === 'string' && assignedRoleId.trim().length > 0 &&
    assignedRoleId !== 'press-officer';
}

function hasCoreSeat(player: DocumentSnapshot): boolean {
  const seatId = player.get('seatId');
  return typeof seatId === 'string' && seatId.trim().length > 0 && seatId !== 'press-officer';
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
): void {
  if (!hasCoreAssignment(player)) {
    tx.delete(db.doc(`sessions/${sessionId}/secrets/loyalty-${player.id}`));
  }
  if (removeWolfRole) removePressWolfRole(tx, wolfSecretRef, wolfSecret);
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
    throw new HttpsError(
      'failed-precondition',
      'Turn 0 is for GM setup. Wait for the GM to advance to Turn 1.',
    );
  }
}

function requireTurnOneForGameplay(session: DocumentSnapshot): void {
  if (sessionTurn(session.get('currentTurn')) === 0) {
    throw new HttpsError(
      'failed-precondition',
      'Turn 0 is for setup. Wait for the GM to advance to Turn 1.',
    );
  }
}

/**
 * Enforce the shared Team/Coordination policy when a session has a phase
 * clock. Legacy sessions predate that field and retain their existing
 * callable behavior until the next authoritative turn transition supplies it.
 */
function requireActionPhase(
  session: DocumentSnapshot,
  action: ActionId,
  actorScope: ActorScope,
): void {
  if (session.get('turnPhase') === undefined) return;
  const decision = decideActionAuthorization({
    action,
    actorScope,
    turnPhase: session.get('turnPhase'),
  });
  if (decision.allowed) return;
  if (decision.reason === 'unknown-phase') {
    throw new HttpsError('failed-precondition', 'No current server phase is available.');
  }
  const label = ACTION_METADATA[action].requiredPhase === 'team' ? 'Team' : 'Coordination';
  throw new HttpsError(
    'failed-precondition',
    `${action} is only available during ${label} Phase.`,
  );
}

type TurnAdvanceResult = {
  readonly currentTurn: number;
  readonly turnStartAnnouncement?: TurnStartAnnouncement;
  readonly turnPhase: ReturnType<typeof startTurnPhase>;
  readonly maintenanceCycles?: Record<string, MaintenanceCycle>;
  readonly shuttleFuelled?: Record<string, boolean>;
};

function advanceTurnInTransaction(
  tx: Transaction,
  sessionRef: DocumentReference,
  session: DocumentSnapshot,
  skipTurnStartAnnouncement: boolean,
  additionalFields: Record<string, unknown> = {},
): TurnAdvanceResult {
  const currentTurn = sessionTurn(session.get('currentTurn'));
  const nextTurn = currentTurn + 1;
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
  const expiredTurnResources = currentTurn >= 1
    ? expireTurnScopedResources(
      (session.get('maintenanceCycles') ?? {}) as Record<string, MaintenanceCycle>,
      (session.get('shuttleFuelled') ?? {}) as Record<string, boolean>,
    )
    : undefined;
  tx.update(sessionRef, {
    currentTurn: nextTurn,
    turnStartAnnouncement: skipTurnStartAnnouncement
      ? FieldValue.delete()
      : announcement,
    fleetSurvivorPopulationAdjustment: nextFleetPopulation - fleetShipSurvivorPopulation(session),
    turnPhase,
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
    currentTurn: nextTurn,
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

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const joinCode = makeJoinCode(joinCodeLength);
      const codeRef = db.doc(`joinCodes/${joinCode}`);
      const sessionRef = db.collection('sessions').doc();
      const eventRef = db.doc(`sessions/${sessionRef.id}/events/create-${creation.requestId}`);
      const now = new Date().toISOString();
      // The expansion mode is persisted now, but its two-role composition is
      // deliberately resolved by the casting/start slice. Adding both roles
      // here would silently create more role holders than configured players
      // and would mix base and expansion Capybara rules.
      const activeRoleIds = [...recommendedRoleIds(creation.configuration.playerCount)];
      const setup = canonicalSessionSetup(creation.configuration, activeRoleIds);
      const stableSeats = stableSeatsForRoles(activeRoleIds);
      const initialShuttleDockings = initialShuttleDockingsForRoles(activeRoleIds);
      const initialShuttleVisits = initialShuttleVisitsForDockings(initialShuttleDockings);
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
          setup,
          activeVesselIds: setup.activeVesselIds,
          pressEnabled: true,
          pressAvailabilityRevision: 0,
          pressHolderUid: null,
          shipGalacticCoordinates: INITIAL_SHIP_GALACTIC_COORDINATES,
          shipNavigationLogs: INITIAL_SHIP_NAVIGATION_LOGS,
          shipConsoleLocks: INITIAL_SHIP_CONSOLE_LOCKS,
          shipJumpStates: INITIAL_SHIP_JUMP_STATES,
          shipJumpTransitions: {},
          shipResources: INITIAL_SHIP_RESOURCES,
          shipDamage: {},
          shipUnrest: INITIAL_SHIP_UNREST,
          unrestAlerts: {},
          shipSurvivors: { ...INITIAL_SHIP_SURVIVORS },
          fleetSurvivorPopulationAdjustment: 0,
          populationAlerts: {},
          gmControlsLocked: false,
          debriefMode: { active: false, revision: 0 },
          activeRoleIds,
          shuttleDockings: initialShuttleDockings,
          shuttleVisitLog: initialShuttleVisits,
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
          const priorReply = priorRequest.get('reply');
          if (typeof priorReply !== 'object' || priorReply === null) {
            throw new HttpsError('failed-precondition', 'This creation request has no replayable result.');
          }
          return priorReply as typeof reply;
        }
        const membershipActive = await membershipIsActive(tx, membership, uid);
        if (activeSessionConflicts(
          membership.exists ? membership.get('sessionId') as string : undefined,
          sessionRef.id,
          membershipActive,
        )) {
          throw new HttpsError(
            'failed-precondition',
            'Disconnect from the current session before creating another.',
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
          setup,
          activeVesselIds: setup.activeVesselIds,
          pressEnabled: true,
          pressAvailabilityRevision: 0,
          pressHolderUid: null,
          shipGalacticCoordinates: INITIAL_SHIP_GALACTIC_COORDINATES,
          shipNavigationLogs: INITIAL_SHIP_NAVIGATION_LOGS,
          shipConsoleLocks: INITIAL_SHIP_CONSOLE_LOCKS,
          shipJumpStates: INITIAL_SHIP_JUMP_STATES,
          shipJumpTransitions: {},
          shipResources: INITIAL_SHIP_RESOURCES,
          shipDamage: {},
          shipUnrest: INITIAL_SHIP_UNREST,
          unrestAlerts: {},
          shipSurvivors: { ...INITIAL_SHIP_SURVIVORS },
          fleetSurvivorPopulationAdjustment: 0,
          populationAlerts: {},
          gmControlsLocked: false,
          debriefMode: { active: false, revision: 0 },
          activeRoleIds,
          shuttleDockings: initialShuttleDockings,
          shuttleVisitLog: initialShuttleVisits,
          confettiUsedShipIds: [],
          ownerUid: uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          deleteAfter: null,
          deletingAt: null,
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
          reply,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(eventRef, {
          ...buildAuthoritativeEventEnvelope({
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
        });
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

function setupRevision(session: DocumentSnapshot): number {
  const value = session.get('setupRevision');
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function requireCastingWindow(session: DocumentSnapshot): void {
  if (session.get('configurationLocked') === true ||
      !['lobby', 'casting'].includes(String(session.get('phase')))) {
    throw new HttpsError('failed-precondition', 'Casting is locked after setup begins.');
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
  const expansion = playerCount >= 19
    ? 'capybara'
    : playerCountOverride === undefined && session.get('expansion') === 'capybara'
      ? 'capybara'
      : session.get('expansion') === 'none' ? 'none' : 'base';
  const configurationInput = {
    playerCount,
    chartId: session.get('chartId'),
    expansion,
    turnLimit: session.get('turnLimit'),
    dioneEnabled: session.get('dioneEnabled') !== false && playerCount >= 12,
    capybaraEnabled: expansion !== 'none' && (playerCount >= 19 || session.get('capybaraEnabled') !== false),
  };
  const configuration = playerCountOverride === undefined
    ? normalizePersistedSessionConfiguration(configurationInput)
    : normalizeSessionConfiguration(configurationInput);
  return canonicalSessionSetup(configuration, activeRoleIds);
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
    throw new HttpsError(
      'failed-precondition',
      `Seat ${claimedSeat.roleId} is claimed and cannot be removed from the setup.`,
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
  await reconcileStableSeats(tx, sessionId, activeRoleIds, activeRoleIds);
  const setup = canonicalSetupForSession(session, activeRoleIds);
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
    candidate.expectedSetupRevision === expected.expectedSetupRevision &&
    Array.isArray(candidate.activeRoleIds) &&
    candidate.activeRoleIds.length === expected.activeRoleIds.length &&
    candidate.activeRoleIds.every((roleId, index) => roleId === expected.activeRoleIds[index]);
}

function rejectLegacySetupMutation(): never {
  throw new HttpsError(
    'failed-precondition',
    'Legacy setup mutations are disabled; submit the complete tuple through confirmSetup.',
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
  activeRoleIds?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const command = requireSetupConfirmationRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const requestRef = db.doc(`sessions/${command.sessionId}/setupMutationRequests/${command.requestId}`);
  const eventRef = db.doc(`sessions/${command.sessionId}/events/setup-confirm-${command.requestId}`);

  return db.runTransaction(async (tx) => {
    const fingerprint = setupCommandFingerprint(
      command.configuration,
      command.activeRoleIds,
      command.expectedSetupRevision,
    );
    const [prior, authority] = await Promise.all([
      tx.get(requestRef),
      requireFacilitatorInstance(tx, command.sessionId, uid, command.instanceId),
    ]);
    if (prior.exists) {
      if (
        prior.get('action') !== 'confirm-setup' ||
        prior.get('sessionId') !== command.sessionId ||
        prior.get('actorUid') !== uid ||
        prior.get('instanceId') !== command.instanceId
      ) {
        throw new HttpsError('failed-precondition', 'This request id belongs to a different setup command.');
      }
      const expectedFingerprint = setupCommandFingerprint(
        command.configuration,
        command.activeRoleIds,
        command.expectedSetupRevision,
      );
      if (!sameSetupCommandFingerprint(prior.get('fingerprint'), expectedFingerprint)) {
        throw new HttpsError('failed-precondition', 'This request id was already used for a different setup tuple.');
      }
      const reply = prior.get('reply');
      if (typeof reply !== 'object' || reply === null) {
        throw new HttpsError('failed-precondition', 'This setup request has no replayable result.');
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
      return reply;
    }
    requireCastingWindow(authority.session);
    const currentRoleIds = sessionActiveRoleIds(authority.session);
    await reconcileStableSeats(tx, command.sessionId, currentRoleIds, command.activeRoleIds);
    const setup = canonicalSessionSetup(command.configuration, command.activeRoleIds);
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
      setupRevision: reply.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, {
      type: 'setup-confirm', action: 'confirm-setup', requestId: command.requestId,
      actorUid: uid, instanceId: command.instanceId, revision: reply.setupRevision,
      fingerprint,
      activeRoleIds: [...setup.activeRoleIds], createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(requestRef, {
      action: 'confirm-setup', requestId: command.requestId,
      sessionId: command.sessionId, actorUid: uid, instanceId: command.instanceId,
      fingerprint, reply,
      createdAt: FieldValue.serverTimestamp(),
    });
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
      lastSeenAt: instance.get('lastSeenAt') ?? player.get('lastSeenAt'),
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
  const eventRef = db.doc(
    `sessions/${responsibility.sessionId}/events/gm-responsibility-${responsibility.requestId}`,
  );
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
    const [authority, prior] = await Promise.all([
      requireFacilitatorInstance(tx, responsibility.sessionId, uid, responsibility.instanceId),
      tx.get(requestRef),
    ]);
    if (prior.exists) {
      const stored = prior.get('fingerprint');
      const same = typeof stored === 'object' && stored !== null &&
        Object.entries(fingerprint).every(([key, value]) =>
          (stored as Record<string, unknown>)[key] === value);
      if (!same) {
        throw new HttpsError('failed-precondition', 'This request id was already used for a different responsibility command.');
      }
      const reply = prior.get('reply');
      if (typeof reply !== 'object' || reply === null) {
        throw new HttpsError('failed-precondition', 'This responsibility request has no replayable result.');
      }
      if (reply.status === 'stale') return reply;
      return { ...(reply as Record<string, unknown>), status: 'replayed' };
    }

    const [instance, instances] = await Promise.all([tx.get(instanceRef), tx.get(instancesRef)]);
    requireCastingWindow(authority.session);
    if (!instance.exists) throw new HttpsError('not-found', 'No such facilitator instance.');
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
      return reply;
    }

    const targetInstanceId = responsibility.targetInstanceId ?? responsibility.instanceId;
    if (
      instances.docs.length > 1 &&
      (responsibility.mode === 'share' || responsibility.mode === 'handoff') &&
      responsibility.targetInstanceId === undefined
    ) {
      throw new HttpsError('invalid-argument', 'targetInstanceId is required when multiple facilitator instances are active.');
    }
    const target = instances.docs.find((candidate) => candidate.id === targetInstanceId);
    if (!target) throw new HttpsError('not-found', 'No such target facilitator instance.');
    const onlyInstance = instances.docs.length === 1;
    if (onlyInstance && responsibility.mode === 'drop') {
      throw new HttpsError('failed-precondition', 'The sole active facilitator must carry both printed responsibilities.');
    }

    const nextByInstance = new Map<string, FacilitatorResponsibility[]>(
      instances.docs.map((candidate) => [candidate.id, normalizedResponsibilities(candidate)]),
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

    for (const candidate of instances.docs) {
      const responsibilities = nextByInstance.get(candidate.id) ?? [];
      const legacyResponsibility = responsibilities[0] ?? null;
      tx.update(candidate.ref, {
        responsibilities,
        // Keep the singular field for legacy clients; the array is authoritative.
        responsibility: legacyResponsibility,
      });
    }

    const nextRevision = responsibility.expectedSetupRevision + 1;
    const nextInstances = instances.docs.map((candidate) => ({
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
    tx.set(eventRef, {
      type: 'gm-responsibility',
      action: 'set-facilitator-responsibility',
      actorUid: uid,
      requestId: responsibility.requestId,
      expectedSetupRevision: responsibility.expectedSetupRevision,
      revision: nextRevision,
      fingerprint,
      reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(requestRef, {
      ...fingerprint,
      requestId: responsibility.requestId,
      expectedSetupRevision: responsibility.expectedSetupRevision,
      fingerprint,
      reply,
      createdAt: FieldValue.serverTimestamp(),
    });
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
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
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
  const eventRef = db.doc(`sessions/${start.sessionId}/events/start-${start.requestId}`);
  const playersRef = db.collection(`sessions/${start.sessionId}/players`);
  const instancesRef = db.collection(`sessions/${start.sessionId}/gmInstances`);
  const seatsRef = db.collection(`sessions/${start.sessionId}/seats`);
  const secretsRef = db.collection(`sessions/${start.sessionId}/secrets`);

  return db.runTransaction(async (tx) => {
    const [prior, authority, players, instances, seats, secrets] = await Promise.all([
      tx.get(startRequestRef),
      requireFacilitatorInstance(tx, start.sessionId, uid, start.instanceId),
      tx.get(playersRef),
      tx.get(instancesRef),
      tx.get(seatsRef),
      tx.get(secretsRef),
    ]);
    if (prior.exists) {
      if (!sameStartRequestFingerprint(prior.get('fingerprint'), fingerprint)) {
        throw new HttpsError('failed-precondition', 'This request id was already used for a different start payload or actor.');
      }
      const result = prior.get('reply');
      if (typeof result === 'object' && result !== null) {
        if ((result as Record<string, unknown>).status === 'stale') return result;
        // A replay is the same committed result with a truthful disposition.
        // Never recompute private identities, clocks, or setup writes here.
        return { ...(result as Record<string, unknown>), status: 'replayed' };
      }
      throw new HttpsError('failed-precondition', 'This start request has no replayable result.');
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
      return reply;
    }
    requireCastingWindow(authority.session);
    const persistedActiveRoleIds = authority.session.get('activeRoleIds');
    const activeRoleIds = Array.isArray(persistedActiveRoleIds)
      ? configuredRoleIds(authority.session)
      : [];
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
      const storedLastSeen = instance.get('lastSeenAt') ?? owner?.get('lastSeenAt');
      return {
        id: instance.id,
        uid: typeof instance.get('uid') === 'string' ? instance.get('uid') as string : '',
        connected: instance.get('connected') !== false && owner?.get('role') === 'gm',
        lastSeenAt: storedLastSeen,
        responsibilities: normalizedResponsibilities(instance),
      };
    });
    const playerCount = typeof authority.session.get('playerCount') === 'number'
      ? authority.session.get('playerCount') as number
      : coreAssignments.length;
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
      throw new HttpsError(
        'failed-precondition',
        `Start blocked: ${readiness.reasons.join(', ')}.`,
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
    if (explicitRecords.length === 0) {
      loyaltyAssignments = composeDefaultLoyaltyAssignments(holders, routineWolf.selectedRoleIds, randomInt);
      loyaltySource = 'automatic-default';
    } else {
      const validation = validateExplicitLoyaltySetup(holders, explicitRecords);
      if (!validation.valid) {
        throw new HttpsError('failed-precondition', `Start blocked: loyalties-${validation.reason}.`);
      }
      const explicitWolfRoles = holders
        .filter((holder) => validation.assignments[holder.uid]?.kind === 'wolf-agent')
        .map((holder) => holder.roleId);
      if (explicitWolfRoles.length !== routineWolf.wolfCount) {
        throw new HttpsError('failed-precondition', 'Start blocked: loyalties-conflicting-wolf-count.');
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
      mode: authority.session.get('expansion') === 'capybara' ||
        authority.session.get('expansion') === 'none'
        ? authority.session.get('expansion') as 'capybara' | 'none'
        : 'base',
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
      if (loyaltySource === 'automatic-default') {
        const assignment = loyaltyAssignments[holder.uid];
        if (!assignment) throw new HttpsError('failed-precondition', 'Start blocked: loyalties-missing-result.');
        tx.set(db.doc(`sessions/${start.sessionId}/secrets/loyalty-${holder.uid}`), {
          visibleToUids: [holder.uid],
          payload: { type: 'loyalty', ...assignment },
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
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

    const transition = advanceTurnInTransaction(tx, sessionRef, authority.session, false, {
      phase: 'active',
      configurationLocked: true,
      setupRevision: committedSetupRevision,
      pursuitGroups: { fleet: 2 },
    });
    const result = {
      status: 'committed' as const,
      sessionId: start.sessionId,
      requestId: start.requestId,
      currentTurn: transition.currentTurn,
      setupRevision: committedSetupRevision,
      turnStartAnnouncement: transition.turnStartAnnouncement,
      turnPhase: transition.turnPhase,
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
    tx.set(eventRef, {
      type: 'game-started',
      actorUid: uid,
      requestId: start.requestId,
      turn: 1,
      phase: 'active',
      revision: result.setupRevision,
      expectedSetupRevision: start.expectedSetupRevision,
      createdAt: FieldValue.serverTimestamp(),
    });
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

  return db.runTransaction(async (tx): Promise<CastingMutationResult> => {
    const [session, player, prior] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(eventRef),
    ]);
    if (prior.exists) {
      const result = prior.get('result');
      if (typeof result === 'object' && result !== null) return result as CastingMutationResult;
      throw new HttpsError('failed-precondition', 'This preference request has no replayable result.');
    }
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    requireCastingWindow(session);
    const activeVessels = configuredRoleIds(session)
      .map((roleId) => roleShipId(roleId))
      .filter((shipId): shipId is string => typeof shipId === 'string');
    if (!activeVessels.includes(preference.shipId)) {
      throw new HttpsError('failed-precondition', 'That vessel is not active in this roster.');
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
    tx.set(eventRef, {
      type: 'casting-preference',
      actorUid: uid,
      shipId: preference.shipId,
      requestId: preference.requestId,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
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
  const playersRef = db.collection(`sessions/${assignment.sessionId}/players`);

  return db.runTransaction(async (tx): Promise<CastingMutationResult> => {
    const [prior, authority, target, players] = await Promise.all([
      tx.get(eventRef),
      requireFacilitatorInstance(tx, assignment.sessionId, uid, assignment.instanceId),
      tx.get(db.doc(`sessions/${assignment.sessionId}/players/${assignment.targetUid}`)),
      tx.get(playersRef),
    ]);
    if (prior.exists) {
      const result = prior.get('result');
      if (typeof result === 'object' && result !== null) return result as CastingMutationResult;
      throw new HttpsError('failed-precondition', 'This assignment request has no replayable result.');
    }
    requireCastingWindow(authority.session);
    if (!isActivePlayer(target) || target.get('role') === 'observer') {
      throw new HttpsError('failed-precondition', 'That player is not eligible for casting.');
    }
    const activeRoleIds = configuredRoleIds(authority.session);
    const assignments = players.docs.flatMap((member) => {
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
      throw new HttpsError('failed-precondition', `Role assignment rejected: ${decision.reason}.`);
    }
    const result = {
      sessionId: assignment.sessionId,
      setupRevision: setupRevision(authority.session) + 1,
    } satisfies CastingMutationResult;
    tx.update(target.ref, { assignedRoleId: assignment.roleId, activeConsoleRoleId: null });
    tx.update(sessionRef, {
      phase: 'casting',
      setupRevision: result.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, {
      type: 'role-assignment',
      actorUid: uid,
      targetUid: assignment.targetUid,
      roleId: assignment.roleId,
      requestId: assignment.requestId,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
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

  return db.runTransaction(async (tx): Promise<CastingMutationResult> => {
    const [prior, authority, target] = await Promise.all([
      tx.get(eventRef),
      requireFacilitatorInstance(tx, release.sessionId, uid, release.instanceId),
      tx.get(db.doc(`sessions/${release.sessionId}/players/${release.targetUid}`)),
    ]);
    if (prior.exists) {
      const result = prior.get('result');
      if (typeof result === 'object' && result !== null) return result as CastingMutationResult;
      throw new HttpsError('failed-precondition', 'This release request has no replayable result.');
    }
    requireCastingWindow(authority.session);
    if (!isActivePlayer(target)) throw new HttpsError('failed-precondition', 'That player is not eligible for casting.');
    const result = {
      sessionId: release.sessionId,
      setupRevision: setupRevision(authority.session) + 1,
    } satisfies CastingMutationResult;
    tx.update(target.ref, { assignedRoleId: null, activeConsoleRoleId: null });
    tx.update(sessionRef, { setupRevision: result.setupRevision, updatedAt: FieldValue.serverTimestamp() });
    tx.set(eventRef, {
      type: 'role-release',
      actorUid: uid,
      targetUid: release.targetUid,
      requestId: release.requestId,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});

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
  const targetSecretRef = db.doc(`sessions/${assignment.sessionId}/secrets/loyalty-${assignment.targetUid}`);
  const partnerRef = assignment.partnerUid
    ? db.doc(`sessions/${assignment.sessionId}/players/${assignment.partnerUid}`)
    : undefined;
  const partnerSecretRef = assignment.partnerUid
    ? db.doc(`sessions/${assignment.sessionId}/secrets/loyalty-${assignment.partnerUid}`)
    : undefined;

  return db.runTransaction(async (tx): Promise<CastingMutationResult & { assignedUids: readonly string[] }> => {
    const [prior, authority, target, partner] = await Promise.all([
      tx.get(eventRef),
      requireFacilitatorInstance(tx, assignment.sessionId, uid, assignment.instanceId),
      tx.get(targetRef),
      partnerRef ? tx.get(partnerRef) : Promise.resolve(undefined),
    ]);
    if (prior.exists) {
      const result = prior.get('result');
      if (typeof result === 'object' && result !== null) {
        return result as CastingMutationResult & { assignedUids: readonly string[] };
      }
      throw new HttpsError('failed-precondition', 'This loyalty request has no replayable result.');
    }
    requireCastingWindow(authority.session);
    if (!isActivePlayer(target)) throw new HttpsError('failed-precondition', 'That player is not eligible for loyalty setup.');
    if (assignment.partnerUid && assignment.partnerUid === assignment.targetUid) {
      throw new HttpsError('invalid-argument', 'A Friend partner must be another player.');
    }
    if (assignment.partnerUid && (!partner || !isActivePlayer(partner))) {
      throw new HttpsError('failed-precondition', 'The Friend partner is not an active player.');
    }
    const kind = assignment.kind as LoyaltyKind;
    const decision = loyaltyAssignmentDecision(kind, assignment.suspicion);
    if (!decision.allowed) {
      throw new HttpsError('invalid-argument', `Loyalty assignment rejected: ${decision.reason}.`);
    }
    if (kind === 'friend' && !assignment.partnerUid) {
      throw new HttpsError('invalid-argument', 'Friend loyalty requires a private partner.');
    }
    if (kind !== 'friend' && assignment.partnerUid) {
      throw new HttpsError('invalid-argument', 'Only Friend loyalty may name a partner.');
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
    tx.update(sessionRef, {
      phase: 'casting',
      setupRevision: result.setupRevision,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(eventRef, {
      type: 'loyalty-assignment',
      actorUid: uid,
      assignedUids: result.assignedUids,
      requestId: assignment.requestId,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
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
  return db.runTransaction(async (tx) => {
    const [secret, prior] = await Promise.all([tx.get(secretRef), tx.get(eventRef)]);
    if (prior.exists) return { disclosed: true as const };
    if (!secret.exists) throw new HttpsError('permission-denied', 'No private Android proof is assigned to this identity.');
    const payload = secret.get('payload');
    if (typeof payload !== 'object' || payload === null || payload.kind !== 'android') {
      throw new HttpsError('permission-denied', 'Only the Android holder may disclose Android proof.');
    }
    tx.update(secretRef, { payload: { ...payload as Record<string, unknown>, proofRevealed: true } });
    tx.set(eventRef, {
      type: 'android-proof-disclosed',
      actorUid: uid,
      requestId: disclosure.requestId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { disclosed: true as const };
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
        throw new HttpsError('failed-precondition', 'That session has closed.');
      }
      if (sessionDoc.get('deletingAt')) {
        throw new HttpsError('not-found', 'That session is being retired.');
      }
      if (isKickedPlayer(player)) {
        throw new HttpsError(
          'failed-precondition',
          'This browser was kicked from that session and cannot rejoin.',
        );
      }
      const membershipActive = await membershipIsActive(tx, membership, uid);
      if (activeSessionConflicts(
        membership.exists ? membership.get('sessionId') as string : undefined,
        sessionId,
        membershipActive,
      )) {
        throw new HttpsError(
          'failed-precondition',
          'Disconnect from the current session before joining another.',
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
    const activeRoleIds = sessionActiveRoleIds(sessionSnap);
    const setup = canonicalSetupForSession(sessionSnap, activeRoleIds);
    const shuttleDockings = (sessionSnap.get('shuttleDockings') as unknown[] | undefined) ??
      initialShuttleDockingsForRoles(activeRoleIds);
    const shuttleVisitLog = (sessionSnap.get('shuttleVisitLog') as unknown[] | undefined) ??
      initialShuttleVisitsForDockings(shuttleDockings as typeof INITIAL_SHUTTLE_DOCKINGS);
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
        capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
        dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
        pressEnabled: sessionSnap.get('pressEnabled') !== false,
        pressAvailabilityRevision: pressAvailabilityRevision(sessionSnap.get('pressAvailabilityRevision')),
        shipGalacticCoordinates: shipGalacticCoordinates(sessionSnap.get('shipGalacticCoordinates')),
        shipNavigationLogs: shipNavigationLogs(sessionSnap.get('shipNavigationLogs')),
        shipConsoleLocks: shipConsoleLocks(sessionSnap.get('shipConsoleLocks')),
        shipJumpStates: shipJumpStates(sessionSnap.get('shipJumpStates')),
        shipJumpTransitions: shipJumpTransitions(sessionSnap.get('shipJumpTransitions')),
        shipResources: shipResources(sessionSnap.get('shipResources')),
        shipDamage: shipDamage(sessionSnap.get('shipDamage')),
        shipUnrest: shipUnrest(sessionSnap.get('shipUnrest')),
        unrestAlerts: sessionSnap.get('unrestAlerts') ?? {},
        maintenanceCycles: sessionSnap.get('maintenanceCycles') ?? {},
        shuttleCargo: sessionSnap.get('shuttleCargo') ?? {},
        shuttleFuelled: sessionSnap.get('shuttleFuelled') ?? {},
        shipUpgrades: sessionSnap.get('shipUpgrades') ?? {},
        shipSurvivors: sessionSnap.get('shipSurvivors') ?? { ...INITIAL_SHIP_SURVIVORS },
        populationAlerts: sessionSnap.get('populationAlerts') ?? {},
        gmControlsLocked: sessionSnap.get('gmControlsLocked') === true,
        debriefMode: debriefModeState(sessionSnap.get('debriefMode')),
        activeRoleIds,
        shuttleDockings,
        shuttleVisitLog,
        pressDispatch: pressDispatchState(sessionSnap.get('pressDispatch')),
        confettiUsedShipIds: (sessionSnap.get('confettiUsedShipIds') as string[] | undefined) ?? [],
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
    throw new HttpsError(
      'failed-precondition',
      'This browser was kicked from that session and cannot rejoin.',
    );
  }
  if (sessionSnap.get('phase') === 'closed') {
    throw new HttpsError('failed-precondition', 'That session has closed.');
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
      throw new HttpsError('failed-precondition', 'That session has closed.');
    }
    if (!currentPlayer.exists) {
      throw new HttpsError('permission-denied', 'You are no longer in that session.');
    }
    if (isKickedPlayer(currentPlayer)) {
      throw new HttpsError(
        'failed-precondition',
        'This browser was kicked from that session and cannot rejoin.',
      );
    }
    const membershipActive = await membershipIsActive(tx, membership, uid);
    if (activeSessionConflicts(
      membership.exists ? membership.get('sessionId') as string : undefined,
      sessionId,
      membershipActive,
    )) {
      throw new HttpsError(
        'failed-precondition',
        'Disconnect from the current session before reconnecting to another.',
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
  const activeRoleIds = sessionActiveRoleIds(sessionSnap);
  const setup = canonicalSetupForSession(sessionSnap, activeRoleIds);
  const shuttleDockings = (sessionSnap.get('shuttleDockings') as unknown[] | undefined) ??
    initialShuttleDockingsForRoles(activeRoleIds);
  const shuttleVisitLog = (sessionSnap.get('shuttleVisitLog') as unknown[] | undefined) ??
    initialShuttleVisitsForDockings(shuttleDockings as typeof INITIAL_SHUTTLE_DOCKINGS);
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
      capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
      dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
      pressEnabled: sessionSnap.get('pressEnabled') !== false,
      pressAvailabilityRevision: pressAvailabilityRevision(sessionSnap.get('pressAvailabilityRevision')),
      shipGalacticCoordinates: shipGalacticCoordinates(sessionSnap.get('shipGalacticCoordinates')),
      shipNavigationLogs: shipNavigationLogs(sessionSnap.get('shipNavigationLogs')),
      shipConsoleLocks: shipConsoleLocks(sessionSnap.get('shipConsoleLocks')),
      shipJumpStates: shipJumpStates(sessionSnap.get('shipJumpStates')),
      shipJumpTransitions: shipJumpTransitions(sessionSnap.get('shipJumpTransitions')),
      shipResources: shipResources(sessionSnap.get('shipResources')),
      shipDamage: shipDamage(sessionSnap.get('shipDamage')),
      shipUnrest: shipUnrest(sessionSnap.get('shipUnrest')),
      unrestAlerts: sessionSnap.get('unrestAlerts') ?? {},
      maintenanceCycles: sessionSnap.get('maintenanceCycles') ?? {},
      shuttleCargo: sessionSnap.get('shuttleCargo') ?? {},
      shuttleFuelled: sessionSnap.get('shuttleFuelled') ?? {},
      shipUpgrades: sessionSnap.get('shipUpgrades') ?? {},
      shipSurvivors: sessionSnap.get('shipSurvivors') ?? { ...INITIAL_SHIP_SURVIVORS },
      populationAlerts: sessionSnap.get('populationAlerts') ?? {},
      gmControlsLocked: sessionSnap.get('gmControlsLocked') === true,
      debriefMode: debriefModeState(sessionSnap.get('debriefMode')),
      activeRoleIds,
      shuttleDockings,
      shuttleVisitLog,
      pressDispatch: pressDispatchState(sessionSnap.get('pressDispatch')),
      confettiUsedShipIds: (sessionSnap.get('confettiUsedShipIds') as string[] | undefined) ?? [],
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
  await db.runTransaction(async (tx) => {
    const [access, session, player, existing, activeInstances] = await Promise.all([
      tx.get(accessRef),
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
      tx.get(instancesRef),
    ]);
    if (!access.exists || !isGmAccessActive(access.get('authenticatedAt'))) {
      throw new HttpsError('permission-denied', 'Log in to GM access before claiming the GM console.');
    }
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    if (hasCoreSeat(player) || hasCoreAssignment(player)) {
      throw new HttpsError('failed-precondition', 'Release your core station before joining as GM.');
    }
    if (
      !existing.exists &&
      !mayClaimGmInstance(session.get('gmControlsLocked') === true, activeInstances.size)
    ) {
      throw new HttpsError('failed-precondition', 'GM registration is locked.');
    }
    if (existing.exists && existing.get('uid') !== uid) {
      throw new HttpsError('already-exists', 'That GM instance identifier is already in use.');
    }
    const firstActiveGm = activeInstances.docs.length === 0;
    tx.set(instanceRef, {
      uid,
      sessionId: claim.sessionId,
      name: claim.name,
      deviceLabel: claim.deviceLabel,
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
  return {
    instances: instances.docs.map((instance) =>
      gmInstanceFrom(sessionId, instance.id, instance.data(), instances.docs.length === 1)),
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
    if (!isActivePlayer(callerPlayer) || !caller.exists || caller.get('uid') !== uid) {
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

  await db.runTransaction(async (tx) => {
    const [session, caller, instance, target, membership] = await Promise.all([
      tx.get(sessionRef),
      tx.get(callerRef),
      tx.get(instanceRef),
      tx.get(targetRef),
      tx.get(membershipRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (
      !isActivePlayer(caller) || caller.get('role') !== 'gm' ||
      !instance.exists || instance.get('uid') !== uid
    ) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (!isActivePlayer(target)) {
      throw new HttpsError('failed-precondition', 'That player is no longer connected.');
    }
    if (target.get('role') === 'gm') {
      throw new HttpsError(
        'failed-precondition',
        'GM browsers must be removed from the GM instances panel.',
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
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      !instance.exists || instance.get('uid') !== uid
    ) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
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
  const playersRef = db.collection(`sessions/${setting.sessionId}/players`);
  const wolfSecretRef = db.doc(`sessions/${setting.sessionId}/secrets/wolf-assignment`);

  const result = await db.runTransaction(async (tx) => {
    const [session, player, instance, players, prior, wolfSecret] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
      tx.get(playersRef),
      tx.get(eventRef),
      tx.get(wolfSecretRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      !instance.exists || instance.get('uid') !== uid
    ) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (prior.exists) {
      const priorResult = prior.get('result');
      if (typeof priorResult !== 'object' || priorResult === null ||
          typeof (priorResult as { pressEnabled?: unknown }).pressEnabled !== 'boolean' ||
          !Number.isSafeInteger((priorResult as { revision?: unknown }).revision)) {
        throw new HttpsError('failed-precondition', 'This Press setting request has no replayable result.');
      }
      return priorResult as { pressEnabled: boolean; revision: number };
    }

    const storedRevision = session.get('pressAvailabilityRevision');
    const currentRevision = Number.isSafeInteger(storedRevision) && storedRevision >= 0
      ? storedRevision as number
      : 0;
    const currentEnabled = session.get('pressEnabled') !== false;
    if (setting.expectedRevision !== currentRevision) {
      if (setting.pressEnabled === currentEnabled) {
        return { pressEnabled: currentEnabled, revision: currentRevision };
      }
      throw new HttpsError(
        'failed-precondition',
        'Press availability changed. Wait for the live update and try again.',
      );
    }
    if (setting.pressEnabled === currentEnabled) {
      return { pressEnabled: currentEnabled, revision: currentRevision };
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
      players.docs
        .filter(hasPressState)
        .forEach((candidate) => {
          tx.update(candidate.ref, releasedPressFields(candidate));
          if (!hasCoreAssignment(candidate)) {
            tx.delete(db.doc(`sessions/${setting.sessionId}/secrets/loyalty-${candidate.id}`));
          }
        });
      removePressWolfRole(tx, wolfSecretRef, wolfSecret);
    }
    tx.set(eventRef, {
      type: 'press-availability',
      actorUid: uid,
      requestId: setting.requestId,
      expectedRevision: setting.expectedRevision,
      previousPressEnabled: currentEnabled,
      pressEnabled: setting.pressEnabled,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
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
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    requireActionPhase(session, 'movement', 'facilitator');
    if (change.shipId === 'capybara' && session.get('capybaraEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Capybara is not in this session.');
    }
    if (change.shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Dione is not in this session.');
    }
    let move;
    try {
      move = applyShipNavigationMove({
        shipId: change.shipId,
        destination: change.destination,
        now,
        eventIdPrefix,
        coordinates: shipGalacticCoordinates(session.get('shipGalacticCoordinates')),
        logs: shipNavigationLogs(session.get('shipNavigationLogs')),
        shipNames: FLEET_SHIP_NAMES,
      });
    } catch (cause) {
      throw new HttpsError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'The ship could not be moved.',
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
  const sessionRef = db.doc(`sessions/${change.sessionId}`);

  return db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(tx, change.sessionId, uid, change.shipId, change.instanceId, false);
    const session = await tx.get(sessionRef);
    const player = await tx.get(db.doc(`sessions/${change.sessionId}/players/${uid}`));
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    requireTurnOneForPlayer(session, player);
    requireActionPhase(session, 'jump', player.get('role') === 'gm' ? 'facilitator' : 'player');
    if (change.shipId === 'capybara' && session.get('capybaraEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Capybara is not in this session.');
    }
    if (change.shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Dione is not in this session.');
    }

    const currentTurn = sessionTurn(session.get('currentTurn'));
    const currentCoordinate = shipGalacticCoordinates(session.get('shipGalacticCoordinates'))[change.shipId] ?? '0000';
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
      throw new HttpsError('failed-precondition', 'Charge the Jump Drive during this turn before departure.');
    }

    const inventories = shipResources(session.get('shipResources'));
    const inventory = inventories[change.shipId];
    if (!inventory) throw new HttpsError('invalid-argument', 'Unknown fleet ship.');
    const damage = shipDamage(session.get('shipDamage'))[change.shipId] ?? {
      damagedSystemIds: [], destroyed: false,
    };
    const upgrades = typeof session.get('shipUpgrades') === 'object' && session.get('shipUpgrades') !== null
      ? session.get('shipUpgrades') as Record<string, unknown>
      : {};
    const upgradeList = upgrades[change.shipId];
    const upgraded = Array.isArray(upgradeList) && upgradeList.some((upgrade) => upgrade === 'jump-drive');
    const state = shipJumpStates(session.get('shipJumpStates'))[change.shipId] ?? {};
    let result: JumpAttemptResult;
    try {
      result = resolveJumpAttempt({
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
        integrityRoll: damage.damagedSystemIds.includes('jump-drive') ? randomInt(1, 7) : 6,
      });
    } catch (cause) {
      throw new HttpsError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'The jump drive rejected the departure.',
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
      coordinates: shipGalacticCoordinates(session.get('shipGalacticCoordinates')),
      logs: shipNavigationLogs(session.get('shipNavigationLogs')),
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
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    requireTurnOneForPlayer(session, player);
    tx.update(sessionRef, {
      shipConsoleLocks: { ...shipConsoleLocks(session.get('shipConsoleLocks')), [change.shipId]: change.locked },
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
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      !instance.exists || instance.get('uid') !== uid
    ) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
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

  const debriefMode = await db.runTransaction(async (tx): Promise<DebriefMode> => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      !instance.exists || instance.get('uid') !== uid
    ) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    const current = debriefModeState(session.get('debriefMode'));
    if (current.active === setting.active) return current;
    const next = { active: setting.active, revision: current.revision + 1 };
    tx.update(sessionRef, {
      debriefMode: next,
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
  expectedTurn?: number;
  overridePhaseTimer?: boolean;
  skipTurnStartAnnouncement?: boolean;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const advance = requireTurnAdvanceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${advance.sessionId}`);
  const playerRef = db.doc(`sessions/${advance.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${advance.sessionId}/gmInstances/${advance.instanceId}`);

  return db.runTransaction(async (tx) => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player) || player.get('role') !== 'gm' ||
        !instance.exists || instance.get('uid') !== uid) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn !== advance.expectedTurn) {
      throw new HttpsError('failed-precondition', 'The turn changed. Wait for the live update and try again.');
    }
    const activePhase = turnPhaseState(session.get('turnPhase'));
    if (
      activePhase?.turn === currentTurn && isTurnPhaseTimerActive(activePhase) &&
      !advance.overridePhaseTimer
    ) {
      throw new HttpsError(
        'failed-precondition',
        'A turn phase timer is still active. Confirm the override to advance early.',
      );
    }
    return advanceTurnInTransaction(
      tx,
      sessionRef,
      session,
      advance.skipTurnStartAnnouncement === true,
    );
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
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    if (sessionTurn(session.get('currentTurn')) !== 0) {
      throw new HttpsError('failed-precondition', 'The single-player demo is only available from Turn 0.');
    }
    if (connectedPlayers.docs.length !== 1 || connectedPlayers.docs[0]?.id !== uid) {
      throw new HttpsError(
        'failed-precondition',
        'The single-player demo requires this to be the only connected player.',
      );
    }
    return advanceTurnInTransaction(tx, sessionRef, session, false);
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
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      !instance.exists || instance.get('uid') !== uid
    ) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    const current = turnStartAnnouncement(session.get('turnStartAnnouncement'));
    if (!current || current.turn !== currentTurn || currentTurn < 1) {
      throw new HttpsError('failed-precondition', 'No current turn transmission is available to replay.');
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

  return db.runTransaction(async tx => {
    const [session, player] = await Promise.all([tx.get(sessionRef), tx.get(playerRef)]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    if (sessionTurn(session.get('currentTurn')) !== requestData.expectedTurn) {
      throw new HttpsError('failed-precondition', 'The turn changed. Wait for the live update and try again.');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== requestData.expectedTurn) {
      throw new HttpsError('failed-precondition', 'No current turn phase is available.');
    }
    if (phase.timerPause) {
      throw new HttpsError(
        'failed-precondition',
        'The emergency timer is paused. Resume it before changing airspace.',
      );
    }
    if (Date.now() < Date.parse(phase.teamPhaseEndsAt)) {
      throw new HttpsError('failed-precondition', 'The airspace-closed timer is still active.');
    }
    if (phase.airspace.state === 'lifted') return { turnPhase: phase };
    const turnPhase = {
      ...phase,
      airspace: { ...phase.airspace, state: 'lifted' as const, tickerActive: true },
    };
    tx.update(sessionRef, { turnPhase, updatedAt: FieldValue.serverTimestamp() });
    return { turnPhase };
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
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      !instance.exists || instance.get('uid') !== uid
    ) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn !== requestData.expectedTurn) {
      throw new HttpsError('failed-precondition', 'The turn changed. Wait for the live update and try again.');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== currentTurn) {
      throw new HttpsError('failed-precondition', 'No current turn phase is available.');
    }
    const turnPhase = extendActiveTurnPhase(phase, requestData.window);
    if (!turnPhase) {
      throw new HttpsError('failed-precondition', 'The requested airspace window is no longer active.');
    }
    tx.update(sessionRef, { turnPhase, updatedAt: FieldValue.serverTimestamp() });
    return { turnPhase };
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

  return db.runTransaction(async tx => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (
      !isActivePlayer(player) || player.get('role') !== 'gm' ||
      !instance.exists || instance.get('uid') !== uid
    ) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    const currentTurn = sessionTurn(session.get('currentTurn'));
    if (currentTurn < 1) {
      throw new HttpsError('failed-precondition', 'The emergency timer is unavailable during Turn 0.');
    }
    if (currentTurn !== requestData.expectedTurn) {
      throw new HttpsError('failed-precondition', 'The turn changed. Wait for the live update and try again.');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== currentTurn) {
      throw new HttpsError('failed-precondition', 'No current turn phase is available.');
    }
    const currentlyPaused = phase.timerPause !== undefined;
    if (currentlyPaused === requestData.paused) return { turnPhase: phase };

    const turnPhase = requestData.paused
      ? pauseActiveTurnPhase(phase)
      : resumePausedTurnPhase(phase);
    if (!turnPhase) {
      throw new HttpsError(
        'failed-precondition',
        requestData.paused
          ? 'The live turn timer has already expired.'
          : 'The emergency timer is not currently paused.',
      );
    }
    const window = turnPhase.timerPause?.window ?? phase.timerPause?.window;
    if (!window) {
      throw new HttpsError('internal', 'The emergency timer transition had no active window.');
    }
    tx.update(sessionRef, {
      turnPhase,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${requestData.sessionId}/events/${eventId}`), {
      type: 'timer-pause',
      action: requestData.paused ? 'paused' : 'resumed',
      turn: currentTurn,
      window,
      actorName: cleanName(player.get('displayName'), 'GM', 40),
      byUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { turnPhase };
  });
});

/** AEGIS may grant the SNN Press shuttle a limited exception during restricted airspace. */
export const unlockPressAirspace = onCall<{ sessionId?: unknown }>(async request => {
  const uid = requireUid(request.auth);
  const requestData = requireSessionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${requestData.sessionId}`);
  return db.runTransaction(async tx => {
    const player = await tx.get(db.doc(`sessions/${requestData.sessionId}/players/${uid}`));
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
    await requireConsoleAuthority(tx, requestData.sessionId, player, 'admiral');
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('pressEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Press is disabled.');
    }
    requireTurnOneForPlayer(session, player);
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== sessionTurn(session.get('currentTurn'))) {
      throw new HttpsError('failed-precondition', 'No current airspace window is available.');
    }
    if (phase.timerPause) {
      throw new HttpsError(
        'failed-precondition',
        'The emergency timer is paused. Resume it before changing airspace.',
      );
    }
    // A late command can be the first live request after the team deadline.
    // Heal the shared clock before evaluating a restriction-only exception.
    if (phase.airspace.state === 'restricted' && Date.now() >= Date.parse(phase.teamPhaseEndsAt)) {
      const turnPhase = {
        ...phase,
        airspace: { ...phase.airspace, state: 'lifted' as const, tickerActive: true },
      };
      tx.update(sessionRef, { turnPhase, updatedAt: FieldValue.serverTimestamp() });
      return { turnPhase };
    }
    if (phase.airspace.state !== 'restricted' || phase.airspace.pressAccess) {
      return { turnPhase: phase };
    }
    const turnPhase = {
      ...phase,
      airspace: { ...phase.airspace, pressAccess: true },
    };
    tx.update(sessionRef, { turnPhase, updatedAt: FieldValue.serverTimestamp() });
    return { turnPhase };
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
    requireTurnOneForPlayer(session, player);
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
      throw new HttpsError('failed-precondition', 'Capybara is not in this convoy.');
    }
    if (shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Dione is not in this convoy.');
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
      throw new HttpsError('failed-precondition', 'That role is not active in this session.');
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
    if (shouldLogShipConfettiEvent(shipId)) tx.create(eventRef, event);
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
  sessionId?: string; activeConsoleRoleId?: string | null;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId } = requireSessionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const membershipRef = db.doc(`activeMemberships/${uid}`);
  const pressHoldersRef = db.collection(`sessions/${sessionId}/players`)
    .where('activeConsoleRoleId', '==', 'press-officer');
  const wolfSecretRef = db.doc(`sessions/${sessionId}/secrets/wolf-assignment`);
  await db.runTransaction(async (tx) => {
    const requestedRoleId = typeof request.data?.activeConsoleRoleId === 'string'
      ? request.data.activeConsoleRoleId
      : null;
    const roleHolders = requestedRoleId
      ? db.collection(`sessions/${sessionId}/players`)
        .where('activeConsoleRoleId', '==', requestedRoleId)
      : null;
    const [player, session, holders, pressHolders, wolfSecret] = await Promise.all([
      tx.get(playerRef),
      tx.get(sessionRef),
      roleHolders ? tx.get(roleHolders) : null,
      tx.get(pressHoldersRef),
      tx.get(wolfSecretRef),
    ]);
    if (!isActivePlayer(player)) {
      throw new HttpsError('permission-denied', 'Reconnect to the session first.');
    }
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const presenceUpdate: Record<string, unknown> = {
      lastSeenAt: FieldValue.serverTimestamp(),
    };
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
        clearPressPrivateState(
          tx,
          sessionId,
          player,
          wolfSecretRef,
          wolfSecret,
          otherActivePressHolders.length === 0,
        );
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
        throw new HttpsError('failed-precondition', 'Press is disabled.');
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
        throw new HttpsError(
          'failed-precondition',
          'Release your core role before selecting Press.',
        );
      }
      const configuredRoleIdsForSelection = configuredRoleIds(session);
      if (
        (!isPressRequest && !configuredRoleIdsForSelection.includes(requestedRoleId)) ||
        (!isPressRequest && isJointEngineeringRoleId(requestedRoleId) &&
          !isJointEngineeringRoleAvailable(configuredRoleIdsForSelection, requestedRoleId))
      ) {
        throw new HttpsError('failed-precondition', 'That console role is not active.');
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
        throw new HttpsError(
          'failed-precondition',
          'Release your current role in settings before selecting another.',
        );
      }
      if (isPressRequest) {
        for (const holder of pressHolders.docs) {
          if (holder.id === uid || isAuthoritativePressHolder(holder)) continue;
          tx.update(holder.ref, releasedPressFields(holder));
          clearPressPrivateState(tx, sessionId, holder, wolfSecretRef, wolfSecret, false);
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
    tx.update(playerRef, presenceUpdate);
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
export const disconnectFromSession = onCall<{ sessionId?: string }>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId } = requireSessionRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const membershipRef = db.doc(`activeMemberships/${uid}`);
  const players = db.collection(`sessions/${sessionId}/players`);
  const gmInstances = db.collection(`sessions/${sessionId}/gmInstances`);
  const wolfSecretRef = db.doc(`sessions/${sessionId}/secrets/wolf-assignment`);

  await db.runTransaction(async (tx) => {
    const [sessionDoc, player, membership, connected, ownedInstances, wolfSecret] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(membershipRef),
      tx.get(players.where('connected', '==', true)),
      tx.get(gmInstances.where('uid', '==', uid)),
      tx.get(wolfSecretRef),
    ]);
    if (!sessionDoc.exists || !player.exists) {
      throw new HttpsError('permission-denied', 'You are no longer in that session.');
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
      clearPressPrivateState(
        tx, sessionId, player, wolfSecretRef, wolfSecret, !anotherPressHolder,
      );
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
    const gmInstances = db.collection(`sessions/${sessionId}/gmInstances`);
    const wolfSecretRef = db.doc(`sessions/${sessionId}/secrets/wolf-assignment`);
    await db.runTransaction(async (tx) => {
      const [session, player, membership, connected, ownedInstances, wolfSecret] = await Promise.all([
        tx.get(sessionRef),
        tx.get(playerRef),
        tx.get(membershipRef),
        tx.get(players.where('connected', '==', true)),
        tx.get(gmInstances.where('uid', '==', uid)),
        tx.get(wolfSecretRef),
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
        clearPressPrivateState(
          tx, sessionId, player, wolfSecretRef, wolfSecret, !anotherPressHolder,
        );
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
    const eventRef = db.doc(`sessions/${sessionId}/events/seat-claim-${revisioned.requestId}`);
    const fingerprint = seatMutationFingerprint('claim', parsed, uid);
    return db.runTransaction(async (tx): Promise<SeatMutationReceipt> => {
        const [prior, session, seat, player] = await Promise.all([
          tx.get(requestRef), tx.get(sessionRef), tx.get(seatRef), tx.get(playerRef),
        ]);
        if (!session.exists) throw new HttpsError('not-found', 'No such session.');
        if (!isActivePlayer(player)) {
          throw new HttpsError('permission-denied', 'Join the session first.');
        }
        if (player.get('role') === 'gm') {
          throw new HttpsError('permission-denied', 'GMs cannot claim core seats.');
        }
        if (prior.exists) {
          if (
            prior.get('action') !== 'claim' ||
            prior.get('sessionId') !== sessionId ||
            prior.get('seatId') !== seatId ||
            prior.get('actorUid') !== uid ||
            !sameSeatMutationFingerprint(prior.get('fingerprint'), fingerprint)
          ) {
            throw new HttpsError('failed-precondition', 'This request id belongs to a different seat command.');
          }
          const reply = prior.get('reply');
          if (typeof reply !== 'object' || reply === null) {
            throw new HttpsError('failed-precondition', 'This seat request has no replayable result.');
          }
          if (reply.status === 'stale') return reply as SeatMutationReceipt;
          const committedReply = reply as Omit<Extract<SeatMutationReceipt, { status: 'committed' | 'replayed' }>, 'status'>;
          return { ...committedReply, status: 'replayed' };
        }
        requireCastingWindow(session);
        if (!canClaimSeat(player.get('seatId'))) {
          throw new HttpsError('failed-precondition', 'Release your current seat before claiming another.');
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
          return reply;
        }
        const configuredRoles = session.get('activeRoleIds');
        if (!Array.isArray(configuredRoles) || !configuredRoles.includes(seatId)) {
          throw new HttpsError('failed-precondition', 'That seat is not part of the active roster.');
        }
        if (!seat.exists) throw new HttpsError('not-found', 'No such seat.');
        if (seat.get('roleId') !== seatId) {
          throw new HttpsError('failed-precondition', 'That seat record does not match its stable role id.');
        }
        if (seatId === 'press-officer' || seat.get('roleId') === 'press-officer') {
          throw new HttpsError('failed-precondition', 'Press is optional and cannot be claimed as a core seat.');
        }
        if (seat.get('status') !== 'open' || seat.get('holderUid') !== null) {
          throw new HttpsError('aborted', 'That seat was just taken.');
        }
        const assignedRoleId = player.get('assignedRoleId');
        if (typeof assignedRoleId === 'string' && assignedRoleId !== seatId) {
          throw new HttpsError('failed-precondition', 'Your assigned role does not match that seat.');
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
        tx.set(eventRef, {
          type: 'seat-claim', seatId, actorUid: uid, revision: nextRevision,
          requestId: revisioned.requestId, expectedSetupRevision: revisioned.expectedSetupRevision,
          fingerprint, createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(requestRef, {
          requestId: revisioned.requestId, action: 'claim', sessionId, seatId, actorUid: uid,
          fingerprint, reply, createdAt: FieldValue.serverTimestamp(),
        });
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
    const eventRef = db.doc(`sessions/${sessionId}/events/seat-release-${revisioned.requestId}`);
    const fingerprint = seatMutationFingerprint('release', parsed, uid);
    return db.runTransaction(async (tx): Promise<SeatMutationReceipt> => {
        const actorRef = db.doc(`sessions/${sessionId}/players/${uid}`);
        const [prior, session, seat, actor] = await Promise.all([
          tx.get(requestRef), tx.get(sessionRef), tx.get(seatRef), tx.get(actorRef),
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
        if (prior.exists) {
          if (
            prior.get('action') !== 'release' ||
            prior.get('sessionId') !== sessionId ||
            prior.get('seatId') !== seatId ||
            prior.get('actorUid') !== uid ||
            !sameSeatMutationFingerprint(prior.get('fingerprint'), fingerprint)
          ) {
            throw new HttpsError('failed-precondition', 'This request id belongs to a different seat command.');
          }
          const reply = prior.get('reply');
          if (typeof reply !== 'object' || reply === null) {
            throw new HttpsError('failed-precondition', 'This seat request has no replayable result.');
          }
          if (reply.status === 'stale') return reply as SeatMutationReceipt;
          const committedReply = reply as Omit<Extract<SeatMutationReceipt, { status: 'committed' | 'replayed' }>, 'status'>;
          return { ...committedReply, status: 'replayed' };
        }
        requireCastingWindow(session);
        if (!seat.exists) throw new HttpsError('not-found', 'No such seat.');

        const configuredRoles = session.get('activeRoleIds');
        if (!Array.isArray(configuredRoles) || !configuredRoles.includes(seatId)) {
          throw new HttpsError('failed-precondition', 'That seat is not part of the active roster.');
        }
        if (seat.get('roleId') !== seatId) {
          throw new HttpsError('failed-precondition', 'That seat record does not match its stable role id.');
        }
        if (seatId === 'press-officer' || seat.get('roleId') === 'press-officer') {
          throw new HttpsError('failed-precondition', 'Press is optional and cannot be released as a core seat.');
        }
        if (seat.get('status') !== 'claimed' || typeof seat.get('holderUid') !== 'string') {
          throw new HttpsError('failed-precondition', 'That seat is not currently claimed.');
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
          return reply;
        }
        const holderRef = db.doc(`sessions/${sessionId}/players/${holderUid}`);
        const holder = await tx.get(holderRef);
        const staleHolder = !holder.exists || !isActivePlayer(holder) || holder.get('seatId') !== seatId;
        if (staleHolder && !gmInstance) {
          if (actor.get('role') !== 'gm' || !revisioned.instanceId || !revisioned.reason) {
            throw new HttpsError('failed-precondition', 'The claimed holder and seat pointer do not agree.');
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
        tx.set(eventRef, {
          type: 'seat-release', seatId, actorUid: uid, revision: nextRevision,
          requestId: revisioned.requestId, reason: revisioned.reason ?? null,
          expectedSetupRevision: revisioned.expectedSetupRevision, fingerprint,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(requestRef, {
          requestId: revisioned.requestId, action: 'release', sessionId, seatId, actorUid: uid,
          reason: revisioned.reason ?? null,
          fingerprint, reply, createdAt: FieldValue.serverTimestamp(),
        });
        return reply;
    });
  },
);

/** Elevate a player to GM. Only an existing GM (or the session owner) may. */
export const elevateToGm = onCall<{ sessionId: string; targetUid: string }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const { sessionId, targetUid } = requireElevationRequest(request.data ?? {});
    const sessionRef = db.doc('sessions/' + sessionId);
    const callerRef = db.doc('sessions/' + sessionId + '/players/' + uid);
    const targetRef = db.doc('sessions/' + sessionId + '/players/' + targetUid);

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
      if (sessionSnap.get('ownerUid') !== uid && caller.get('role') !== 'gm') {
        throw new HttpsError('permission-denied', 'GM only.');
      }
      if (!isActivePlayer(target)) {
        throw new HttpsError('failed-precondition', 'That player is not connected.');
      }
      if (
        hasCoreSeat(target) || hasCoreAssignment(target) || hasPressState(target) ||
        sessionSnap.get('pressHolderUid') === targetUid
      ) {
        throw new HttpsError('failed-precondition', 'Release the target station before elevating to GM.');
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
  const configured = Array.isArray(stored)
    ? ROLE_IDS.filter((roleId) => stored.includes(roleId))
    : DEFAULT_ACTIVE_ROLE_IDS;
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
    : DEFAULT_ACTIVE_ROLE_IDS;
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
  const player = await tx.get(db.doc(`sessions/${sessionId}/players/${uid}`));
  if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
  const role = player.get('role');
  if (gmOnly && !canAdjustShipCounter(role, Boolean(instanceId))) {
    throw new HttpsError('permission-denied', 'Active GM instance required.');
  }
  if (role === 'gm') {
    if (!instanceId) throw new HttpsError('permission-denied', 'Active GM instance required.');
    const instance = await tx.get(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`));
    if (!instance.exists || instance.get('uid') !== uid) {
      throw new HttpsError('permission-denied', 'Active GM instance required.');
    }
    return;
  }
  const session = await tx.get(db.doc(`sessions/${sessionId}`));
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  const ownRole = player.get('activeConsoleRoleId');
  const activeRoleIds = configuredRoleIds(session);
  if (typeof ownRole !== 'string' || !activeRoleIds.includes(ownRole) ||
      roleShipId(ownRole) !== shipId) {
    throw new HttpsError('permission-denied', 'An active role aboard this ship is required.');
  }
}

async function requireConsoleAuthority(
  tx: Transaction, sessionId: string, player: DocumentSnapshot, targetRole: string,
): Promise<void> {
  const session = await tx.get(db.doc(`sessions/${sessionId}`));
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  const activeRoleIds = configuredRoleIds(session);
  const ownRole = player.get('activeConsoleRoleId');
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
      throw new HttpsError('failed-precondition', 'That ship does not hold this resource.');
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
      throw new HttpsError('failed-precondition', 'The GM unrest alert must be dismissed first.');
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
    if (session.get('phase') === 'closed') throw new HttpsError('failed-precondition', 'This session is closed.');
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
    requireTurnOneForPlayer(session, player);

    const rolls = Array.from({ length: count }, () => randomInt(1, sides + 1));
    const id = randomUUID();
    await db.doc(`sessions/${sessionId}/events/${id}`).set({
      type: 'roll',
      byUid: uid,
      sides,
      count,
      rolls,
      total: rolls.reduce((a, b) => a + b, 0),
      createdAt: FieldValue.serverTimestamp(),
    });

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
      throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Invalid population change.');
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
        throw new HttpsError('failed-precondition', 'That ship does not hold this resource.');
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
        throw new HttpsError(
          'failed-precondition',
          cause instanceof Error ? cause.message : 'Invalid unrest change.',
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
      throw new HttpsError(
        'failed-precondition',
        cause instanceof Error ? cause.message : 'Invalid population change.',
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

/** One atomic, revision-checked maintenance action. Dice are never supplied by a client. */
export const runMaintenance = onCall<{
  sessionId: string; shipId: string; action: string; expectedRevision: number;
  instanceId?: string; foodLevel?: number; waterLevel?: number;
  consoles?: string[]; refuels?: Record<string, string>; consoleRoleId?: string;
}>(async request => {
  const uid = requireUid(request.auth);
  const data = request.data;
  const allowed = ['sessionId', 'shipId', 'action', 'expectedRevision', 'instanceId', 'foodLevel', 'waterLevel', 'consoles', 'refuels', 'consoleRoleId'];
  if (!data || Object.keys(data).some(key => !allowed.includes(key)) ||
    typeof data.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(data.sessionId) ||
    typeof data.shipId !== 'string' || !MAINTENANCE_RULES[data.shipId] ||
    (data.consoleRoleId !== undefined && (
      typeof data.consoleRoleId !== 'string' ||
      (shipForRole(data.consoleRoleId) !== data.shipId &&
        !jointEngineeringShipsForRole(data.consoleRoleId).includes(data.shipId))
    )) ||
    typeof data.action !== 'string' || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0 ||
    (data.instanceId !== undefined && (typeof data.instanceId !== 'string' || !/^[\w-]{1,128}$/.test(data.instanceId))) ||
    [data.foodLevel, data.waterLevel].some(level => level !== undefined && (!Number.isInteger(level) || level < 0 || level > 3)) ||
    (data.consoles !== undefined && (!Array.isArray(data.consoles) || data.consoles.length > 20 || data.consoles.some(id => typeof id !== 'string'))) ||
    (data.refuels !== undefined && (typeof data.refuels !== 'object' || data.refuels === null || Array.isArray(data.refuels) || Object.values(data.refuels).some(id => typeof id !== 'string')))) {
    throw new HttpsError('invalid-argument', 'Invalid maintenance request.');
  }
  const entropy = randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
  const rolls = [randomInt(1, 7), randomInt(1, 7)];
  const eventId = randomUUID();
  const ref = db.doc(`sessions/${data.sessionId}`);
  return db.runTransaction(async tx => {
    // Joint engineering authority is scoped to the two ships on its assigned station.
    const [player, snapshot] = await Promise.all([
      tx.get(db.doc(`sessions/${data.sessionId}/players/${uid}`)),
      tx.get(ref),
    ]);
    if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role')))) {
      throw new HttpsError('permission-denied', 'An active ship officer or GM is required.');
    }
    if (!snapshot.exists) throw new HttpsError('not-found', 'No such session.');
    requireTurnOneForGameplay(snapshot);
    requireActionPhase(snapshot, 'maintenance', player.get('role') === 'gm' ? 'facilitator' : 'player');
    const ownRoleId = String(player.get('activeConsoleRoleId') ?? '');
    const activeRoleIds = (snapshot.get('activeRoleIds') as string[] | undefined) ??
      DEFAULT_ACTIVE_ROLE_IDS;
    const joint = player.get('role') === 'player' &&
      isJointEngineeringRoleAvailable(activeRoleIds, ownRoleId) &&
      jointEngineeringShipsForRole(ownRoleId).includes(data.shipId);
    if (!joint) {
      await requireShipCounterAuthority(tx, data.sessionId, uid, data.shipId, data.instanceId);
    }
    if (data.consoleRoleId && player.get('role') !== 'gm') {
      if (joint) {
        if (data.consoleRoleId !== ownRoleId) {
          throw new HttpsError('permission-denied', 'Joint Engineering may only use its assigned console.');
        }
      } else {
        await requireConsoleAuthority(tx, data.sessionId, player, data.consoleRoleId);
      }
    }
    requireTurnOneForPlayer(snapshot, player);
    if ((data.shipId === 'dione' && snapshot.get('dioneEnabled') === false) ||
        (data.shipId === 'capybara' && snapshot.get('capybaraEnabled') === false) ||
        snapshot.get('phase') === 'closed') throw new HttpsError('failed-precondition', 'This ship is unavailable.');
    const current = (snapshot.get('maintenanceCycles') ?? {}) as Record<string, MaintenanceCycle>;
    const currentTurn = sessionTurn(snapshot.get('currentTurn'));
    const population = populationForShip(data.shipId, snapshot.get('shipSurvivors'))!;
    const unrest = shipUnrest(snapshot.get('shipUnrest'))[data.shipId]!;
    const unrestAlerts = { ...(snapshot.get('unrestAlerts') ?? {}) } as Record<string, StoredUnrestAlert>;
    const populationAlerts = { ...(snapshot.get('populationAlerts') ?? {}) } as Record<string, StoredPopulationAlert>;
    if (unrestAlerts[data.shipId] || populationAlerts[data.shipId]) throw new HttpsError('failed-precondition', 'A GM must acknowledge the ship alert first.');
    let result: ReturnType<typeof advanceMaintenance>;
    const occurredAt = new Date().toISOString();
    try {
      result = advanceMaintenance({
        ...data, cycle: current[data.shipId] ?? emptyMaintenanceCycle(), currentTurn,
        resources: shipResources(snapshot.get('shipResources'))[data.shipId]!,
        damage: shipDamage(snapshot.get('shipDamage'))[data.shipId] ?? { damagedSystemIds: [], destroyed: false },
        unrest, population, dockings: snapshot.get('shuttleDockings') ?? [],
        cargo: snapshot.get('shuttleCargo') ?? {}, fuelled: snapshot.get('shuttleFuelled') ?? {},
        upgraded: (snapshot.get('shipUpgrades') ?? {})[data.shipId] ?? [], rolls, entropy,
        now: occurredAt, damageDrawId: eventId,
      });
    } catch (cause) {
      throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Maintenance failed.');
    }
    const populationThreshold = result.population !== population && populationTrackForShip(data.shipId)?.thresholds.includes(result.population);
    if ((unrest < 8 && result.unrest >= 8) || populationThreshold) {
      const instances = await tx.get(db.collection(`sessions/${data.sessionId}/gmInstances`));
      const targetGmInstanceIds = instances.docs.map(instance => instance.id);
      if (targetGmInstanceIds.length) {
        const alert = { shipId: data.shipId, shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[data.shipId] ?? data.shipId, targetGmInstanceIds, createdAt: new Date().toISOString() };
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
    entries.push({ fields: captureMaintenanceUndo(field => snapshot.get(field), patch) });
    tx.set(undoRef, { turn: currentTurn, entries });
    tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc(`sessions/${data.sessionId}/events/${eventId}`), {
      type: 'maintenance', shipId: data.shipId,
      shipName: (FLEET_SHIP_NAMES as Readonly<Record<string, string>>)[data.shipId] ?? data.shipId,
      byUid: uid, action: data.action,
      revision: result.cycle.revision, results: result.cycle.results,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (result.damageDraw) {
      const draw = result.damageDraw;
      tx.set(db.doc(`sessions/${data.sessionId}/damageDraws/${eventId}`), {
        shipId: data.shipId, createdAt: FieldValue.serverTimestamp(),
        ...(draw.destroyed ? { type: 'ship-destroyed' } : {
          type: 'ship-damage', ...draw.card, recycled: draw.recycled,
        }),
      });
    }
    return result.cycle;
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
  sessionId: string; active: boolean; expectedRevision: number; instanceId?: string; text?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const data = request.data;
  if (!data || Object.keys(data).some(key => !['sessionId', 'active', 'expectedRevision', 'instanceId', 'text'].includes(key)) ||
      typeof data.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(data.sessionId) ||
      (data.instanceId !== undefined && (typeof data.instanceId !== 'string' || !/^[\w-]{1,128}$/.test(data.instanceId))) ||
      (data.text !== undefined && (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 500)) ||
      typeof data.active !== 'boolean' || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) {
    throw new HttpsError('invalid-argument', 'Invalid fleet alert command.');
  }
  const ref = db.doc(`sessions/${data.sessionId}`);
  return db.runTransaction(async tx => {
    const player = await tx.get(db.doc(`sessions/${data.sessionId}/players/${uid}`));
    if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role')))) {
      throw new HttpsError('permission-denied', 'Only the active AEGIS Admiral may command a fleet red alert.');
    }
    if (player.get('role') === 'gm' && data.instanceId) {
      await requireShipCounterAuthority(tx, data.sessionId, uid, 'aegis', data.instanceId, true);
    } else await requireConsoleAuthority(tx, data.sessionId, player, 'admiral');
    const session = await tx.get(ref);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    requireTurnOneForPlayer(session, player);
    if (session.get('phase') === 'closed') throw new HttpsError('failed-precondition', 'This session is closed.');
    const current = session.get('fleetRedAlert') as
      { active: boolean; revision: number; text?: string; raisedAt?: string | Timestamp } | undefined;
    if ((current?.revision ?? 0) !== data.expectedRevision) {
      throw new HttpsError('failed-precondition', 'Fleet alert changed. Wait for the live update and try again.');
    }
    const lastRaisedAt = toTimestampMillis(current?.raisedAt);
    const now = Date.now();
    if (data.active && !current?.active && lastRaisedAt !== undefined && now - lastRaisedAt < FLEET_ALERT_COOLDOWN_MS) {
      throw new HttpsError('failed-precondition', 'Fleet red alert may be raised once every 10 minutes.');
    }
    const text = typeof data.text === 'string' ? data.text.trim().toUpperCase() : current?.text;
    if ((current?.active ?? false) === data.active && (!data.active || text === current?.text)) return { revision: current?.revision ?? 0 };
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
    tx.update(ref, {
      fleetRedAlert,
      ...(turnPhase ? { turnPhase } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return fleetRedAlert;
  });
});

/** Press dispatches are serialized so two open Press consoles cannot overwrite unseen copy. */
export const publishPressDispatch = onCall<{
  sessionId?: unknown; text?: unknown; expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const data = requirePressDispatchRequest(request.data ?? {});
  const dispatchId = randomUUID();
  const ref = db.doc(`sessions/${data.sessionId}`);
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
    requireTurnOneForPlayer(session, player);
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    const current = pressDispatchState(session.get('pressDispatch'));
    if (current.revision !== data.expectedRevision) {
      throw new HttpsError(
        'failed-precondition',
        'Press dispatch changed. Wait for the live update and try again.',
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
    tx.update(ref, {
      pressDispatch,
      ...(turnPhase ? { turnPhase } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return pressDispatch;
  });
});

/** Only the active Press Officer may retire one fleet dispatch from the ticker. */
export const dismissPressDispatch = onCall<{
  sessionId?: unknown; dispatchId?: unknown; expectedRevision?: unknown;
}>(async request => {
  const uid = requireUid(request.auth);
  const data = requirePressDispatchDismissalRequest(request.data ?? {});
  const ref = db.doc(`sessions/${data.sessionId}`);
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
    requireTurnOneForPlayer(session, player);
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    const current = pressDispatchState(session.get('pressDispatch'));
    if (current.revision !== data.expectedRevision) {
      throw new HttpsError(
        'failed-precondition',
        'Press dispatches changed. Wait for the live update and try again.',
      );
    }
    if (!current.dispatches.some(dispatch => dispatch.id === data.dispatchId)) {
      throw new HttpsError('failed-precondition', 'That press dispatch is no longer active.');
    }
    const pressDispatch = {
      dispatches: current.dispatches.filter(dispatch => dispatch.id !== data.dispatchId),
      revision: data.expectedRevision + 1,
    };
    tx.update(ref, { pressDispatch, updatedAt: FieldValue.serverTimestamp() });
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
    if (session.get('phase') === 'closed') throw new HttpsError('failed-precondition', 'This session is closed.');
    tx.update(ref, {
      [`shipDamage.${change.shipId}`]: { damagedSystemIds: [], destroyed: false },
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`sessions/${change.sessionId}/events/${eventId}`), {
      type: 'ship-repaired', shipId: change.shipId, actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { repaired: true };
  });
});

/** Undo only recorded steps whose resulting state has not subsequently changed. */
export const rollbackMaintenance = onCall<{
  sessionId: string; shipId: string; instanceId: string; expectedRevision: number;
}>(async request => {
  const uid = requireUid(request.auth);
  const { expectedRevision, ...input } = request.data ?? {};
  const change = requireShipDamageRequest(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new HttpsError('invalid-argument', 'Invalid maintenance revision.');
  const ref = db.doc(`sessions/${change.sessionId}`);
  const undoRef = db.doc(`sessions/${change.sessionId}/maintenanceUndo/${change.shipId}`);
  const eventId = randomUUID();
  return db.runTransaction(async tx => {
    await requireShipCounterAuthority(tx, change.sessionId, uid, change.shipId, change.instanceId, true);
    const session = await tx.get(ref);
    const undo = await tx.get(undoRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const cycle = session.get(`maintenanceCycles.${change.shipId}`) as MaintenanceCycle | undefined;
    const entries = (undo.get('entries') ?? []) as Array<{ fields: MaintenanceUndoField[] }>;
    const last = entries.at(-1);
    if (session.get('phase') === 'closed' || !last || cycle?.revision !== expectedRevision ||
        undo.get('turn') !== sessionTurn(session.get('currentTurn'))) {
      throw new HttpsError('failed-precondition', 'No current maintenance step is available to roll back.');
    }
    let patch: Record<string, unknown>;
    try { patch = restoreMaintenanceUndo(last.fields, field => session.get(field), change.shipId, expectedRevision); }
    catch (cause) { throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Rollback failed.'); }
    tx.update(ref, { ...Object.fromEntries(Object.entries(patch).map(([field, value]) => [field, value === undefined ? FieldValue.delete() : value])), updatedAt: FieldValue.serverTimestamp() });
    tx.set(undoRef, { turn: undo.get('turn'), entries: entries.slice(0, -1) });
    tx.set(db.doc(`sessions/${change.sessionId}/events/${eventId}`), {
      type: 'maintenance-rollback', shipId: change.shipId, actorUid: uid,
      revision: expectedRevision + 1, createdAt: FieldValue.serverTimestamp(),
    });
    return { revision: expectedRevision + 1 };
  });
});
