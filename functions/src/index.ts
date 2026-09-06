import {
  INITIAL_SHIP_SURVIVORS,
  acknowledgePopulationAlert,
  populationChange,
  populationForShip,
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
  requireDioneAvailabilityRequest,
  requireElevationRequest,
  requireGmClaimRequest,
  requireGmControlsLockRequest,
  requireGmInstanceActionRequest,
  requireShipAvailabilityRequest,
  requireShipConfettiRequest,
  requireShipCounterRequest,
  requireShipUnrestRequest,
  requireUnrestDismissalRequest,
  requireSessionRequest,
  requireSessionSeatRequest,
  requireUid,
  requireWolfAssignmentRequest,
  requireManualWolfAssignmentRequest,
  requireActiveRoleSettingRequest,
  requireRolePresetRequest,
} from './requestGuards';
import { chooseWolfRoles } from './wolfAssignment';
import { DEFAULT_ACTIVE_ROLE_IDS, ROLE_IDS, recommendedRoleIds } from './roleConfiguration';
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
import { generateSurvivorPopulation, shouldRefreshSurvivorPopulation } from './survivorPopulation';

/**
 * Server-side authority for the companion console.
 *
 * Firestore rules deny every client write that a player could benefit from
 * lying about. Those mutations land here instead, where they run with admin
 * privileges inside a transaction. Cloud Functions 2nd gen, Node 22.
 */

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = getFirestore();
const ARRIVAL_STATE = db.doc('appState/arrival');
const INITIAL_SHUTTLE_DOCKINGS = [
  { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
];
const INITIAL_SHUTTLE_VISITS = [{
  id: 'snn-initial-aegis-docking', shuttleId: 'snn-press-shuttle', shipId: 'aegis',
  action: 'docked', occurredAt: 'SESSION START',
}];
const INITIAL_SHIP_GALACTIC_COORDINATES = {
  aegis: '0000',
  dione: '0000',
  icebreaker: '0000',
  capybara: '0000',
  shepherd: '0000',
  quellon: '0000',
  'refinery-124': '0000',
};

function shipGalacticCoordinates(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return { ...INITIAL_SHIP_GALACTIC_COORDINATES };
  }
  return { ...INITIAL_SHIP_GALACTIC_COORDINATES, ...value as Record<string, string> };
}

async function requireGm(sessionId: string, uid: string): Promise<void> {
  const snap = await db.doc(`sessions/${sessionId}/players/${uid}`).get();
  if (!snap.exists || snap.get('connected') !== true || snap.get('role') !== 'gm') {
    throw new HttpsError('permission-denied', 'GM only.');
  }
}

function isActivePlayer(player: DocumentSnapshot): boolean {
  return player.exists && player.get('connected') === true;
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
  return isActivePlayer(player)
    && lastSeenAt instanceof Timestamp
    && !isPresenceStale(lastSeenAt.toDate(), new Date());
}

function isoOf(value: unknown): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date().toISOString();
}

function cleanName(value: unknown, fallback: string, max: number): string {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text.length > 0 ? text : fallback;
}

/** Four digits, because the code gets read aloud across a noisy table. */
function makeJoinCode(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

/**
 * One app-wide arrival figure is server-owned. Every live instance renews the
 * activity lease; only a full week with no launcher or session activity draws
 * a new value.
 */
async function touchSurvivorPopulation(): Promise<number> {
  return db.runTransaction(async (tx) => {
    const state = await tx.get(ARRIVAL_STATE);
    const now = new Date();
    const lastActivity = state.get('lastActivityAt') as Timestamp | undefined;
    const currentPopulation = state.get('survivorPopulation') as number | undefined;
    const refresh = !state.exists || !Number.isInteger(currentPopulation) ||
      !(lastActivity instanceof Timestamp) || shouldRefreshSurvivorPopulation(lastActivity.toDate(), now);
    const survivorPopulation = refresh || currentPopulation === undefined
      ? generateSurvivorPopulation(() => randomInt(0, 16_000) / 16_000)
      : currentPopulation;
    tx.set(ARRIVAL_STATE, {
      survivorPopulation,
      lastActivityAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return survivorPopulation;
  });
}

/** Read and renew the global launcher statistic for this signed-in app instance. */
export const getSurvivorPopulation = onCall<Record<string, never>>(async (request) => {
  requireUid(request.auth);
  return { survivorPopulation: await touchSurvivorPopulation() };
});

/**
 * Only ten thousand codes exist, so collisions are a certainty rather than a
 * curiosity. `joinCodes/{code}` is a uniqueness lock: creating it inside the
 * same transaction as the session is what makes "pick a code" safe against two
 * tables being made at the same instant. It also lives outside `sessions`,
 * which the rules deny to clients entirely -- so a code can be redeemed but
 * never enumerated.
 */
const CODE_ATTEMPTS = 12;

export const createSession = onCall<{ name?: string; displayName?: string }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const name = cleanName(request.data?.name, 'New session', 80);
    const displayName = cleanName(request.data?.displayName, 'GM', 40);
    const membershipRef = db.doc(`activeMemberships/${uid}`);

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const joinCode = makeJoinCode();
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
          capybaraEnabled: true,
          dioneEnabled: true,
          shipGalacticCoordinates: INITIAL_SHIP_GALACTIC_COORDINATES,
          shipResources: INITIAL_SHIP_RESOURCES,
          shipUnrest: INITIAL_SHIP_UNREST,
          unrestAlerts: {},
          shipSurvivors: { ...INITIAL_SHIP_SURVIVORS },
          populationAlerts: {},
          gmControlsLocked: false,
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
        await touchSurvivorPopulation();
        const now = new Date().toISOString();
        return {
          session: {
            id: sessionRef.id,
            name,
            joinCode,
            phase: 'lobby',
            capybaraEnabled: true,
            dioneEnabled: true,
            shipGalacticCoordinates: INITIAL_SHIP_GALACTIC_COORDINATES,
            shipResources: INITIAL_SHIP_RESOURCES,
            shipUnrest: INITIAL_SHIP_UNREST,
            unrestAlerts: {},
            shipSurvivors: { ...INITIAL_SHIP_SURVIVORS },
            populationAlerts: {},
            gmControlsLocked: false,
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

/** Redeem a four-digit code and register presence in that session. */
export const joinSession = onCall<{ joinCode?: string; displayName?: string }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const joinCode = request.data?.joinCode ?? '';
    if (!/^\d{4}$/.test(joinCode)) {
      throw new HttpsError('invalid-argument', 'A session code is four digits.');
    }
    const displayName = cleanName(request.data?.displayName, 'Player', 40);

    const codeSnap = await db.doc(`joinCodes/${joinCode}`).get();
    if (!codeSnap.exists) {
      throw new HttpsError('not-found', 'No session with that code.');
    }
    const sessionId = codeSnap.get('sessionId') as string;

    const sessionRef = db.doc(`sessions/${sessionId}`);
    const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
    const membershipRef = db.doc(`activeMemberships/${uid}`);
    await db.runTransaction(async (tx) => {
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
        tx.update(playerRef, { connected: true, lastSeenAt: FieldValue.serverTimestamp() });
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
    });
    await touchSurvivorPopulation();
    const [sessionSnap, playerSnap] = await Promise.all([sessionRef.get(), playerRef.get()]);

    return {
      session: {
        id: sessionId,
        name: sessionSnap.get('name') as string,
        joinCode,
        phase: sessionSnap.get('phase') as string,
        capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
        dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
        shipGalacticCoordinates: shipGalacticCoordinates(sessionSnap.get('shipGalacticCoordinates')),
        shipResources: shipResources(sessionSnap.get('shipResources')),
        shipUnrest: shipUnrest(sessionSnap.get('shipUnrest')),
        unrestAlerts: sessionSnap.get('unrestAlerts') ?? {},
        shipSurvivors: sessionSnap.get('shipSurvivors') ?? { ...INITIAL_SHIP_SURVIVORS },
        populationAlerts: sessionSnap.get('populationAlerts') ?? {},
        gmControlsLocked: sessionSnap.get('gmControlsLocked') === true,
        activeRoleIds:
          (sessionSnap.get('activeRoleIds') as string[] | undefined) ?? [...DEFAULT_ACTIVE_ROLE_IDS],
        shuttleDockings:
          (sessionSnap.get('shuttleDockings') as unknown[] | undefined) ?? INITIAL_SHUTTLE_DOCKINGS,
        shuttleVisitLog:
          (sessionSnap.get('shuttleVisitLog') as unknown[] | undefined) ?? INITIAL_SHUTTLE_VISITS,
        confettiUsedShipIds: (sessionSnap.get('confettiUsedShipIds') as string[] | undefined) ?? [],
        ownerUid: sessionSnap.get('ownerUid') as string,
        createdAt: isoOf(sessionSnap.get('createdAt')),
        updatedAt: isoOf(sessionSnap.get('updatedAt')),
      },
      player: {
        uid,
        sessionId,
        displayName: cleanName(playerSnap.get('displayName'), 'Player', 40),
        role: playerSnap.get('role') as string,
        seatId: (playerSnap.get('seatId') as string | null) ?? null,
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
  const [sessionSnap, playerSnap] = await Promise.all([sessionRef.get(), playerRef.get()]);

  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'That session no longer exists.');
  }
  if (!playerSnap.exists) {
    throw new HttpsError('permission-denied', 'You are no longer in that session.');
  }
  if (sessionSnap.get('phase') === 'closed') {
    throw new HttpsError('failed-precondition', 'That session has closed.');
  }

  const membershipRef = db.doc(`activeMemberships/${uid}`);
  await db.runTransaction(async (tx) => {
    const [currentSession, currentPlayer, membership] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(membershipRef),
    ]);
    if (!currentSession.exists || currentSession.get('deletingAt')) {
      throw new HttpsError('not-found', 'That session no longer exists.');
    }
    if (!currentPlayer.exists) {
      throw new HttpsError('permission-denied', 'You are no longer in that session.');
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
    tx.update(playerRef, { connected: true, lastSeenAt: FieldValue.serverTimestamp() });
    tx.update(sessionRef, { deleteAfter: null, updatedAt: FieldValue.serverTimestamp() });
    tx.set(membershipRef, { sessionId, connectedAt: FieldValue.serverTimestamp() });
  });

  await touchSurvivorPopulation();

  return {
    session: {
      id: sessionId,
      name: sessionSnap.get('name') as string,
      joinCode: sessionSnap.get('joinCode') as string,
      phase: sessionSnap.get('phase') as string,
      capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
      dioneEnabled: sessionSnap.get('dioneEnabled') !== false,
      shipGalacticCoordinates: shipGalacticCoordinates(sessionSnap.get('shipGalacticCoordinates')),
      shipResources: shipResources(sessionSnap.get('shipResources')),
      shipUnrest: shipUnrest(sessionSnap.get('shipUnrest')),
      unrestAlerts: sessionSnap.get('unrestAlerts') ?? {},
      shipSurvivors: sessionSnap.get('shipSurvivors') ?? { ...INITIAL_SHIP_SURVIVORS },
      populationAlerts: sessionSnap.get('populationAlerts') ?? {},
      gmControlsLocked: sessionSnap.get('gmControlsLocked') === true,
      activeRoleIds:
        (sessionSnap.get('activeRoleIds') as string[] | undefined) ?? [...DEFAULT_ACTIVE_ROLE_IDS],
      shuttleDockings:
        (sessionSnap.get('shuttleDockings') as unknown[] | undefined) ?? INITIAL_SHUTTLE_DOCKINGS,
      shuttleVisitLog:
        (sessionSnap.get('shuttleVisitLog') as unknown[] | undefined) ?? INITIAL_SHUTTLE_VISITS,
      confettiUsedShipIds: (sessionSnap.get('confettiUsedShipIds') as string[] | undefined) ?? [],
      ownerUid: sessionSnap.get('ownerUid') as string,
      createdAt: isoOf(sessionSnap.get('createdAt')),
      updatedAt: isoOf(sessionSnap.get('updatedAt')),
    },
    player: {
      uid,
      sessionId,
      displayName: cleanName(playerSnap.get('displayName'), 'Player', 40),
      role: playerSnap.get('role') as string,
      seatId: (playerSnap.get('seatId') as string | null) ?? null,
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

/** Claim GM authority for one named browser/device instance. */
export const claimGmInstance = onCall<{
  sessionId?: string;
  instanceId?: string;
  name?: string;
  deviceLabel?: string;
}>(async (request) => {
  const uid = requireUid(request.auth);
  const claim = requireGmClaimRequest(request.data ?? {});
  const sessionRef = db.doc(`sessions/${claim.sessionId}`);
  const playerRef = db.doc(`sessions/${claim.sessionId}/players/${uid}`);
  const instancesRef = db.collection(`sessions/${claim.sessionId}/gmInstances`);
  const instanceRef = db.doc(
    `sessions/${claim.sessionId}/gmInstances/${claim.instanceId}`,
  );
  await db.runTransaction(async (tx) => {
    const [session, player, existing, activeInstances] = await Promise.all([
      tx.get(sessionRef),
      tx.get(playerRef),
      tx.get(instanceRef),
      tx.get(instancesRef),
    ]);
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
    tx.update(sessionRef, { activeRoleIds: next, updatedAt: FieldValue.serverTimestamp() });
    return next;
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
    if (shipId === 'capybara' && session.get('capybaraEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Capybara is not in this convoy.');
    }
    if (shipId === 'dione' && session.get('dioneEnabled') === false) {
      throw new HttpsError('failed-precondition', 'Dione is not in this convoy.');
    }
    const activeRoleIds = (session.get('activeRoleIds') as string[] | undefined) ??
      DEFAULT_ACTIVE_ROLE_IDS;
    if (!activeRoleIds.includes(activation.roleId)) {
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
          .filter((connectedPlayer) => isOfficerRoleForShip(
            connectedPlayer.get('activeConsoleRoleId'), shipId,
          ))
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
      if (!(activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS).includes(request.data.activeConsoleRoleId)) {
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
  await touchSurvivorPopulation();
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
        !session.exists || !isActivePlayer(player) || !lastSeenAt ||
        lastSeenAt.toMillis() > cutoff.toMillis()
      ) return;
      tx.update(playerRef, {
        connected: false,
        ...disconnectedRoleState(),
        lastSeenAt: FieldValue.serverTimestamp(),
      });
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
      if (holderUid !== uid) {
        await requireGm(sessionId, uid);
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

    const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionSnap.exists) throw new HttpsError('not-found', 'No such session.');

    const caller = await db.doc(`sessions/${sessionId}/players/${uid}`).get();
    if (!isActivePlayer(caller)) {
      throw new HttpsError('permission-denied', 'Join the session first.');
    }

    if (sessionSnap.get('ownerUid') !== uid) {
      await requireGm(sessionId, uid);
    }

    const target = await db.doc(`sessions/${sessionId}/players/${targetUid}`).get();
    if (!isActivePlayer(target)) {
      throw new HttpsError('failed-precondition', 'That player is not connected.');
    }
    await target.ref.update({ role: 'gm' });
    return { targetUid, role: 'gm' };
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
  if (roleShipId(player.get('activeConsoleRoleId')) !== shipId) {
    throw new HttpsError('permission-denied', 'An active role aboard this ship is required.');
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
 * Authoritative randomness. The result is written to the session event log so
 * it cannot be quietly re-rolled, and only then returned to the caller.
 */
export const rollDice = onCall<{ sessionId: string; sides: number; count: number }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const { sessionId, sides, count } = requireDiceRequest(request.data ?? {});

    const player = await db.doc(`sessions/${sessionId}/players/${uid}`).get();
    if (!isActivePlayer(player)) {
      throw new HttpsError('permission-denied', 'Join the session first.');
    }

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
  if (populationForShip(change.shipId) === undefined) {
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
