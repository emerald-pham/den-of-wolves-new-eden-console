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
  shouldLogShipConfettiEvent,
} from './shipConfetti';
import {
  requireDiceRequest,
  requireDebriefModeRequest,
  requireDioneAvailabilityRequest,
  requireElevationRequest,
  requireGmAccessLoginRequest,
  requireGmAccessLogoutRequest,
  requireGmClaimRequest,
  requireGmControlsLockRequest,
  requireGmInstanceActionRequest,
  requireGmInstanceRequest,
  requireAirspaceWindowExtensionRequest,
  requirePlayerKickRequest,
  requireOpenAirspacePhaseRequest,
  requireTurnAdvanceRequest,
  requireShipAvailabilityRequest,
  requireShipConfettiRequest,
  requireShipCounterBatchRequest,
  requireShipCounterRequest,
  requireShipDamageRequest,
  requireShipNavigationMoveRequest,
  requireShipConsoleLockRequest,
  requireShipUnrestRequest,
  requireUnrestDismissalRequest,
  requireSessionRequest,
  requireSessionSeatRequest,
  requireUid,
  requireWolfAssignmentRequest,
  requireManualWolfAssignmentRequest,
  requireActiveRoleSettingRequest,
  requireRoleConfigurationRequest,
  requireRolePresetRequest,
  requirePressDispatchDismissalRequest,
  requirePressDispatchRequest,
} from './requestGuards';
import {
  applyShipNavigationMove,
  type NavigationLogEntry,
  type NavigationLogs,
} from './navigation';
import { chooseWolfRoles } from './wolfAssignment';
import { expireTurnScopedResources } from './turnTransition';
import {
  DEFAULT_ACTIVE_ROLE_IDS,
  isJointEngineeringRoleAvailable,
  isJointEngineeringRoleId,
  isValidRoleConfiguration,
  jointEngineeringShipsForRole,
  ROLE_IDS,
  recommendedRoleIds,
} from './roleConfiguration';
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
import { INITIAL_SHUTTLE_DOCKINGS, INITIAL_SHUTTLE_VISITS } from './shuttlecraft';
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
  startTurnPhase,
  turnPhaseState,
} from './turnZero';

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
}>(
  async (request) => {
    const uid = requireUid(request.auth);
    const name = cleanName(request.data?.name, 'New session', 80);
    const displayName = cleanName(request.data?.displayName, 'GM', 40);
    const joinCodeLength = joinCodeLengthForCreateRequest(request.data?.joinCodeVersion);
    const membershipRef = db.doc(`activeMemberships/${uid}`);

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const joinCode = makeJoinCode(joinCodeLength);
      const codeRef = db.doc(`joinCodes/${joinCode}`);
      const sessionRef = db.collection('sessions').doc();

      const claimed = await db.runTransaction(async (tx) => {
        const [code, membership] = await Promise.all([
          tx.get(codeRef),
          tx.get(membershipRef),
        ]);
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
        if (code.exists) return false;

        tx.set(codeRef, {
          sessionId: sessionRef.id,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(sessionRef, {
          name,
          joinCode,
          phase: 'lobby',
          currentTurn: 0,
          capybaraEnabled: true,
          dioneEnabled: true,
          shipGalacticCoordinates: INITIAL_SHIP_GALACTIC_COORDINATES,
          shipNavigationLogs: INITIAL_SHIP_NAVIGATION_LOGS,
          shipConsoleLocks: INITIAL_SHIP_CONSOLE_LOCKS,
          shipResources: INITIAL_SHIP_RESOURCES,
          shipDamage: {},
          shipUnrest: INITIAL_SHIP_UNREST,
          unrestAlerts: {},
          shipSurvivors: { ...INITIAL_SHIP_SURVIVORS },
          fleetSurvivorPopulationAdjustment: 0,
          populationAlerts: {},
          gmControlsLocked: false,
          debriefMode: { active: false, revision: 0 },
          activeRoleIds: [...DEFAULT_ACTIVE_ROLE_IDS],
          shuttleDockings: INITIAL_SHUTTLE_DOCKINGS,
          shuttleVisitLog: INITIAL_SHUTTLE_VISITS,
          confettiUsedShipIds: [],
          ownerUid: uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          deleteAfter: null,
          deletingAt: null,
        });
        // GM authority is claimed per named browser instance after creation.
        tx.set(db.doc(`sessions/${sessionRef.id}/players/${uid}`), {
          uid,
          sessionId: sessionRef.id,
          displayName,
          role: 'player',
          seatId: null,
          activeConsoleRoleId: null,
          joinedAt: FieldValue.serverTimestamp(),
          connected: true,
          lastSeenAt: FieldValue.serverTimestamp(),
        });
        tx.set(membershipRef, { sessionId: sessionRef.id, connectedAt: FieldValue.serverTimestamp() });
        return true;
      });

      if (claimed) {
        const now = new Date().toISOString();
        return {
          session: {
            id: sessionRef.id,
            name,
            joinCode,
            phase: 'lobby',
            currentTurn: 0,
            capybaraEnabled: true,
            dioneEnabled: true,
            shipGalacticCoordinates: INITIAL_SHIP_GALACTIC_COORDINATES,
            shipNavigationLogs: INITIAL_SHIP_NAVIGATION_LOGS,
            shipConsoleLocks: INITIAL_SHIP_CONSOLE_LOCKS,
            shipResources: INITIAL_SHIP_RESOURCES,
            shipDamage: {},
            shipUnrest: INITIAL_SHIP_UNREST,
            unrestAlerts: {},
            shipSurvivors: { ...INITIAL_SHIP_SURVIVORS },
            fleetSurvivorPopulationAdjustment: 0,
            populationAlerts: {},
            gmControlsLocked: false,
            debriefMode: { active: false, revision: 0 },
            activeRoleIds: [...DEFAULT_ACTIVE_ROLE_IDS],
            shuttleDockings: INITIAL_SHUTTLE_DOCKINGS,
            shuttleVisitLog: INITIAL_SHUTTLE_VISITS,
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
            joinedAt: now,
          },
        };
      }
    }

    throw new HttpsError(
      'resource-exhausted',
      'Could not find a free session code. Please try again.',
    );
  },
);

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
      if (player.exists) {
        const returningSeat = await reconcileReturningSeat(tx, sessionId, uid, player);
        tx.update(playerRef, {
          connected: true,
          lastSeenAt: FieldValue.serverTimestamp(),
          ...(returningSeat.clearPointer ? { seatId: null } : {}),
        });
        tx.update(sessionRef, { deleteAfter: null, updatedAt: FieldValue.serverTimestamp() });
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
    return {
      session: {
        id: sessionId,
        name: sessionSnap.get('name') as string,
        joinCode,
        phase: sessionSnap.get('phase') as string,
        currentTurn: sessionTurn(sessionSnap.get('currentTurn')),
        ...(announcement ? { turnStartAnnouncement: announcement } : {}),
        ...(phaseClock ? { turnPhase: phaseClock } : {}),
        capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
        dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
        shipGalacticCoordinates: shipGalacticCoordinates(sessionSnap.get('shipGalacticCoordinates')),
        shipNavigationLogs: shipNavigationLogs(sessionSnap.get('shipNavigationLogs')),
        shipConsoleLocks: shipConsoleLocks(sessionSnap.get('shipConsoleLocks')),
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
        activeRoleIds:
          (sessionSnap.get('activeRoleIds') as string[] | undefined) ?? [...DEFAULT_ACTIVE_ROLE_IDS],
        shuttleDockings:
          (sessionSnap.get('shuttleDockings') as unknown[] | undefined) ?? INITIAL_SHUTTLE_DOCKINGS,
        shuttleVisitLog:
          (sessionSnap.get('shuttleVisitLog') as unknown[] | undefined) ?? INITIAL_SHUTTLE_VISITS,
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
    const returningSeat = await reconcileReturningSeat(tx, sessionId, uid, currentPlayer);
    tx.update(playerRef, {
      connected: true,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(returningSeat.clearPointer ? { seatId: null } : {}),
    });
    tx.update(sessionRef, { deleteAfter: null, updatedAt: FieldValue.serverTimestamp() });
    tx.set(membershipRef, { sessionId, connectedAt: FieldValue.serverTimestamp() });
    return returningSeat.seatId;
  });

  [sessionSnap, playerSnap] = await Promise.all([sessionRef.get(), playerRef.get()]);

  const announcement = turnStartAnnouncement(sessionSnap.get('turnStartAnnouncement'));
  const phaseClock = turnPhaseState(sessionSnap.get('turnPhase'));
  return {
    session: {
      id: sessionId,
      name: sessionSnap.get('name') as string,
      joinCode: sessionSnap.get('joinCode') as string,
      phase: sessionSnap.get('phase') as string,
      currentTurn: sessionTurn(sessionSnap.get('currentTurn')),
      ...(announcement ? { turnStartAnnouncement: announcement } : {}),
      ...(phaseClock ? { turnPhase: phaseClock } : {}),
      capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
      dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
      shipGalacticCoordinates: shipGalacticCoordinates(sessionSnap.get('shipGalacticCoordinates')),
      shipNavigationLogs: shipNavigationLogs(sessionSnap.get('shipNavigationLogs')),
      shipConsoleLocks: shipConsoleLocks(sessionSnap.get('shipConsoleLocks')),
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
      activeRoleIds:
        (sessionSnap.get('activeRoleIds') as string[] | undefined) ?? [...DEFAULT_ACTIVE_ROLE_IDS],
      shuttleDockings:
        (sessionSnap.get('shuttleDockings') as unknown[] | undefined) ?? INITIAL_SHUTTLE_DOCKINGS,
      shuttleVisitLog:
        (sessionSnap.get('shuttleVisitLog') as unknown[] | undefined) ?? INITIAL_SHUTTLE_VISITS,
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
) {
  return {
    id,
    sessionId,
    uid: data.uid as string,
    name: cleanName(data.name, 'GM instance', 40),
    deviceLabel: cleanName(data.deviceLabel, 'Unknown device', 160),
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
    if (
      !existing.exists &&
      !mayClaimGmInstance(session.get('gmControlsLocked') === true, activeInstances.size)
    ) {
      throw new HttpsError('failed-precondition', 'GM registration is locked.');
    }
    if (existing.exists && existing.get('uid') !== uid) {
      throw new HttpsError('already-exists', 'That GM instance identifier is already in use.');
    }
    tx.set(instanceRef, {
      uid,
      sessionId: claim.sessionId,
      name: claim.name,
      deviceLabel: claim.deviceLabel,
      claimedAt: existing.get('claimedAt') ?? FieldValue.serverTimestamp(),
    });
    tx.update(playerRef, { role: 'gm' });
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
      gmInstanceFrom(sessionId, instance.id, instance.data())),
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
  const uid = requireUid(request.auth);
  const setting = requireShipAvailabilityRequest(request.data ?? {});
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
      capybaraEnabled: setting.capybaraEnabled,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { capybaraEnabled: setting.capybaraEnabled };
});

/** Include or remove Dione for the whole session. */
export const setDioneEnabled = onCall<{
  sessionId?: string;
  instanceId?: string;
  dioneEnabled?: boolean;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const setting = requireDioneAvailabilityRequest(request.data ?? {});
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
      dioneEnabled: setting.dioneEnabled,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { dioneEnabled: setting.dioneEnabled };
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

  await db.runTransaction(async (tx) => {
    await requireShipCounterAuthority(
      tx, change.sessionId, uid, change.shipId, change.instanceId, false,
    );
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
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
      turnStartAnnouncement: advance.skipTurnStartAnnouncement
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
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      currentTurn: nextTurn,
      ...(advance.skipTurnStartAnnouncement ? {} : { turnStartAnnouncement: announcement }),
      turnPhase,
      ...(expiredTurnResources
        ? {
          maintenanceCycles: expiredTurnResources.maintenanceCycles,
          shuttleFuelled: expiredTurnResources.shuttleFuelled,
        }
        : {}),
    };
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
    requireTurnOneForPlayer(session, player);
    if (session.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'This session is closed.');
    }
    const phase = turnPhaseState(session.get('turnPhase'));
    if (!phase || phase.turn !== sessionTurn(session.get('currentTurn'))) {
      throw new HttpsError('failed-precondition', 'No current airspace window is available.');
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
  const uid = requireUid(request.auth);
  const setting = requireActiveRoleSettingRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${setting.sessionId}`);
  const playerRef = db.doc(`sessions/${setting.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${setting.sessionId}/gmInstances/${setting.instanceId}`);

  const activeRoleIds = await db.runTransaction(async (tx) => {
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
    const current = new Set(
      (session.get('activeRoleIds') as string[] | undefined) ?? DEFAULT_ACTIVE_ROLE_IDS,
    );
    if (setting.enabled) current.add(setting.roleId);
    else current.delete(setting.roleId);
    const next = ROLE_IDS.filter((roleId) => current.has(roleId));
    if (!isValidRoleConfiguration(next)) {
      throw new HttpsError(
        'failed-precondition',
        'Joint Engineering Union roles must replace both paired engineers in a lower-count roster.',
      );
    }
    tx.update(sessionRef, { activeRoleIds: next, updatedAt: FieldValue.serverTimestamp() });
    return next;
  });

  return { activeRoleIds };
});

/** Apply the GM-reviewed roster atomically; individual draft edits never reach the server. */
export const setActiveRoleConfiguration = onCall<{
  sessionId?: unknown;
  instanceId?: unknown;
  activeRoleIds?: unknown;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const configuration = requireRoleConfigurationRequest(request.data ?? {});
  if (!isValidRoleConfiguration(configuration.activeRoleIds)) {
    throw new HttpsError(
      'failed-precondition',
      'Joint Engineering Union roles must replace both paired engineers in a lower-count roster.',
    );
  }
  const sessionRef = db.doc(`sessions/${configuration.sessionId}`);
  const playerRef = db.doc(`sessions/${configuration.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${configuration.sessionId}/gmInstances/${configuration.instanceId}`);
  const activeRoleIds = ROLE_IDS.filter((roleId) => configuration.activeRoleIds.includes(roleId));

  await db.runTransaction(async (tx) => {
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
    tx.update(sessionRef, { activeRoleIds, updatedAt: FieldValue.serverTimestamp() });
  });

  return { activeRoleIds };
});

/** Replace role availability with the recommended player-count template. */
export const applyRolePreset = onCall<{
  sessionId?: string;
  instanceId?: string;
  playerCount?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const setting = requireRolePresetRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${setting.sessionId}`);
  const playerRef = db.doc(`sessions/${setting.sessionId}/players/${uid}`);
  const instanceRef = db.doc(`sessions/${setting.sessionId}/gmInstances/${setting.instanceId}`);
  const activeRoleIds = [...recommendedRoleIds(setting.playerCount)];
  if (!isValidRoleConfiguration(activeRoleIds)) {
    throw new HttpsError('internal', 'The recommended roster is invalid.');
  }

  await db.runTransaction(async (tx) => {
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
    tx.update(sessionRef, { activeRoleIds, updatedAt: FieldValue.serverTimestamp() });
  });

  return { activeRoleIds, playerCount: setting.playerCount };
});

/** Securely choose one or two wolf roles and keep the result GM-only. */
export const assignWolves = onCall<{
  sessionId?: string;
  instanceId?: string;
  count?: number;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const assignment = requireWolfAssignmentRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${assignment.sessionId}`);
  const playerRef = db.doc(`sessions/${assignment.sessionId}/players/${uid}`);
  const instanceRef = db.doc(
    `sessions/${assignment.sessionId}/gmInstances/${assignment.instanceId}`,
  );
  const secretRef = db.doc(`sessions/${assignment.sessionId}/secrets/wolf-assignment`);

  const roleIds = await db.runTransaction(async (tx) => {
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
    const enabledRoleIds = (session.get('activeRoleIds') as string[] | undefined) ??
      DEFAULT_ACTIVE_ROLE_IDS;
    if (enabledRoleIds.length < assignment.count) {
      throw new HttpsError('failed-precondition', 'Not enough enabled roles for that many wolves.');
    }
    const selected = chooseWolfRoles(enabledRoleIds, assignment.count, randomInt);
    tx.set(secretRef, {
      visibleToUids: [],
      payload: { type: 'wolf-assignment', roleIds: selected },
      createdAt: FieldValue.serverTimestamp(),
    });
    return selected;
  });

  return { roleIds };
});

/** Save a GM-selected wolf assignment after validating active roles. */
export const assignWolfRoles = onCall<{
  sessionId?: string;
  instanceId?: string;
  roleIds?: string[];
}>(async (request) => {
  const uid = requireUid(request.auth);
  const assignment = requireManualWolfAssignmentRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${assignment.sessionId}`);
  const playerRef = db.doc(`sessions/${assignment.sessionId}/players/${uid}`);
  const instanceRef = db.doc(
    `sessions/${assignment.sessionId}/gmInstances/${assignment.instanceId}`,
  );
  const secretRef = db.doc(`sessions/${assignment.sessionId}/secrets/wolf-assignment`);

  await db.runTransaction(async (tx) => {
    const [session, player, instance] = await Promise.all([
      tx.get(sessionRef), tx.get(playerRef), tx.get(instanceRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (!isActivePlayer(player) || player.get('role') !== 'gm' || !instance.exists || instance.get('uid') !== uid) {
      throw new HttpsError('permission-denied', 'This GM instance is no longer active.');
    }
    const active = (session.get('activeRoleIds') as string[] | undefined) ?? DEFAULT_ACTIVE_ROLE_IDS;
    if (assignment.roleIds.some((roleId) => !active.includes(roleId))) {
      throw new HttpsError('failed-precondition', 'Every selected wolf must be active.');
    }
    tx.set(secretRef, {
      visibleToUids: [],
      payload: { type: 'wolf-assignment', roleIds: assignment.roleIds },
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { roleIds: assignment.roleIds };
});

/** Remove the current wolf assignment so Setup can choose again. */
export const resetWolves = onCall<{
  sessionId?: string;
  instanceId?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const assignment = requireGmInstanceRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${assignment.sessionId}`);
  const playerRef = db.doc(`sessions/${assignment.sessionId}/players/${uid}`);
  const instanceRef = db.doc(
    `sessions/${assignment.sessionId}/gmInstances/${assignment.instanceId}`,
  );
  const secretRef = db.doc(`sessions/${assignment.sessionId}/secrets/wolf-assignment`);

  await db.runTransaction(async (tx) => {
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
    tx.delete(secretRef);
  });

  return { reset: true as const };
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
    if (shipId === 'capybara' && session.get('capybaraEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Capybara is not in this convoy.');
    }
    if (shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Dione is not in this convoy.');
    }
    const activeRoleIds = (session.get('activeRoleIds') as string[] | undefined) ??
      DEFAULT_ACTIVE_ROLE_IDS;
    if (shipForRole(activation.roleId) && player.get('role') !== 'gm') {
      if (!activeRoleIds.includes(activation.roleId) || player.get('role') !== 'player' ||
          !canOperateRole(
            player.get('activeConsoleRoleId'),
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
    if (!shipForRole(activation.roleId) && !activeRoleIds.includes(activation.roleId)) {
      throw new HttpsError('failed-precondition', 'That role is not active in this session.');
    }
    let decision;
    try {
      decision = confettiActivationDecision(
        shipId,
        activation.roleId,
        uid,
        (approval.get('approvals') as Array<{ uid: string; roleId: string }> | undefined) ?? [],
        [uid, ...connectedPlayers.docs
          .filter((connectedPlayer) => isActivePlayer(connectedPlayer) &&
            activeRoleIds.includes(String(connectedPlayer.get('activeConsoleRoleId'))) &&
            isOfficerRoleForShip(connectedPlayer.get('activeConsoleRoleId'), shipId))
          .map((connectedPlayer) => connectedPlayer.id)],
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
    const used = (session.get('confettiUsedShipIds') as string[] | undefined) ?? [];
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
  const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const membershipRef = db.doc(`activeMemberships/${uid}`);
  await db.runTransaction(async (tx) => {
    const requestedRoleId = typeof request.data?.activeConsoleRoleId === 'string'
      ? request.data.activeConsoleRoleId
      : null;
    const roleHolders = requestedRoleId
      ? db.collection(`sessions/${sessionId}/players`)
        .where('activeConsoleRoleId', '==', requestedRoleId)
      : null;
    const [player, session, holders] = await Promise.all([
      tx.get(playerRef),
      tx.get(db.doc(`sessions/${sessionId}`)),
      roleHolders ? tx.get(roleHolders) : null,
    ]);
    if (!isActivePlayer(player)) {
      throw new HttpsError('permission-denied', 'Reconnect to the session first.');
    }
    const presenceUpdate: Record<string, unknown> = {
      lastSeenAt: FieldValue.serverTimestamp(),
    };
    if (request.data?.activeConsoleRoleId === null) presenceUpdate.activeConsoleRoleId = null;
    else if (typeof request.data?.activeConsoleRoleId === 'string') {
      const activeRoleIds = session.get('activeRoleIds') as string[] | undefined;
      const configuredRoleIds = activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
      if (
        !configuredRoleIds.includes(request.data.activeConsoleRoleId) ||
        (isJointEngineeringRoleId(request.data.activeConsoleRoleId) &&
          !isJointEngineeringRoleAvailable(configuredRoleIds, request.data.activeConsoleRoleId))
      ) {
        throw new HttpsError('failed-precondition', 'That console role is not active.');
      }
      const heldByAnotherPlayer = holders?.docs.some(
        (holder) => holder.id !== uid && isActivePlayer(holder),
      ) ?? false;
      if (!canSelectConsoleRole(
        player.get('activeConsoleRoleId') as string | null | undefined,
        request.data.activeConsoleRoleId,
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
      presenceUpdate.activeConsoleRoleId = request.data.activeConsoleRoleId;
    }
    tx.update(playerRef, presenceUpdate);
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

  await db.runTransaction(async (tx) => {
    const [sessionDoc, player, membership, connected, ownedInstances] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(membershipRef),
      tx.get(players.where('connected', '==', true)),
      tx.get(gmInstances.where('uid', '==', uid)),
    ]);
    if (!sessionDoc.exists || !player.exists) {
      throw new HttpsError('permission-denied', 'You are no longer in that session.');
    }
    const wasConnected = player.get('connected') === true;
    tx.update(playerRef, {
      connected: false,
      ...disconnectedRoleState(),
      lastSeenAt: FieldValue.serverTimestamp(),
    });
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
    await db.runTransaction(async (tx) => {
      const [session, player, membership, connected, ownedInstances] = await Promise.all([
        tx.get(sessionRef),
        tx.get(playerRef),
        tx.get(membershipRef),
        tx.get(players.where('connected', '==', true)),
        tx.get(gmInstances.where('uid', '==', uid)),
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
        lastSeenAt: FieldValue.serverTimestamp(),
      });
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

/** Claim an open seat. First transaction wins; losers get a clean error. */
export const claimSeat = onCall<{ sessionId: string; seatId: string }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const { sessionId, seatId } = requireSessionSeatRequest(request.data ?? {});

    const seatRef = db.doc(`sessions/${sessionId}/seats/${seatId}`);
    const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);

    return db.runTransaction(async (tx) => {
      const [seat, player] = await Promise.all([tx.get(seatRef), tx.get(playerRef)]);
      if (!isActivePlayer(player)) {
        throw new HttpsError('permission-denied', 'Join the session first.');
      }
      if (!canClaimSeat(player.get('seatId'))) {
        throw new HttpsError(
          'failed-precondition',
          'Release your current seat before claiming another.',
        );
      }
      if (!seat.exists) {
        throw new HttpsError('not-found', 'No such seat.');
      }
      if (seat.get('status') !== 'open') {
        throw new HttpsError('aborted', 'That seat was just taken.');
      }

      tx.update(seatRef, {
        status: 'claimed',
        holderUid: uid,
        claimedAt: FieldValue.serverTimestamp(),
      });
      tx.update(playerRef, { seatId });
      return { seatId, holderUid: uid };
    });
  },
);

/** Release a seat you hold, or -- as GM -- any seat. */
export const releaseSeat = onCall<{ sessionId: string; seatId: string }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const { sessionId, seatId } = requireSessionSeatRequest(request.data ?? {});

    const seatRef = db.doc(`sessions/${sessionId}/seats/${seatId}`);

    return db.runTransaction(async (tx) => {
      const actorRef = db.doc(`sessions/${sessionId}/players/${uid}`);
      const [seat, actor] = await Promise.all([tx.get(seatRef), tx.get(actorRef)]);
      if (!seat.exists) throw new HttpsError('not-found', 'No such seat.');
      if (!isActivePlayer(actor)) {
        throw new HttpsError('permission-denied', 'Join the session first.');
      }

      const holderUid = seat.get('holderUid') as string | null;
      const holderRef = holderUid
        ? db.doc(`sessions/${sessionId}/players/${holderUid}`)
        : null;
      const holder = holderRef ? await tx.get(holderRef) : null;
      if (holderUid !== uid && actor.get('role') !== 'gm') {
        throw new HttpsError('permission-denied', 'GM only.');
      }

      tx.update(seatRef, { status: 'open', holderUid: null, claimedAt: null });
      if (
        holderRef &&
        holder?.exists &&
        shouldClearSeatPointer(holder.get('seatId'), seatId)
      ) {
        tx.update(holderRef, {
          seatId: null,
        });
      }
      return { seatId };
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
  return Array.isArray(stored)
    ? ROLE_IDS.filter((roleId) => stored.includes(roleId))
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
    const player = await tx.get(db.doc(`sessions/${data.sessionId}/players/${uid}`));
    if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role'))) ||
        player.get('activeConsoleRoleId') !== 'press-officer') {
      throw new HttpsError(
        'permission-denied',
        'Only the active Press Officer may publish a fleet dispatch.',
      );
    }
    const session = await tx.get(ref);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (player.get('role') !== 'gm' && !configuredRoleIds(session).includes('press-officer')) {
      throw new HttpsError('permission-denied', 'The Press Officer role is not active in this session.');
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
    const player = await tx.get(db.doc(`sessions/${data.sessionId}/players/${uid}`));
    if (!isActivePlayer(player) || !['player', 'gm'].includes(String(player.get('role'))) ||
        player.get('activeConsoleRoleId') !== 'press-officer') {
      throw new HttpsError(
        'permission-denied',
        'Only the active Press Officer may dismiss a fleet dispatch.',
      );
    }
    const session = await tx.get(ref);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    if (player.get('role') !== 'gm' && !configuredRoleIds(session).includes('press-officer')) {
      throw new HttpsError('permission-denied', 'The Press Officer role is not active in this session.');
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
