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
import {
  requireDiceRequest,
  requireElevationRequest,
  requireGmClaimRequest,
  requireGmInstanceActionRequest,
  requireShipAvailabilityRequest,
  requireSessionRequest,
  requireSessionSeatRequest,
  requireUid,
} from './requestGuards';
import {
  PRESENCE_LEASE_MS,
  activeSessionConflicts,
  deletionDeadline,
  isPresenceStale,
} from './sessionLifecycle';

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
            capybaraEnabled: true,
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
          joinedAt: FieldValue.serverTimestamp(),
          connected: true,
          lastSeenAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(sessionRef, { deleteAfter: null, updatedAt: FieldValue.serverTimestamp() });
      tx.set(membershipRef, { sessionId, connectedAt: FieldValue.serverTimestamp() });
    });
    const [sessionSnap, playerSnap] = await Promise.all([sessionRef.get(), playerRef.get()]);

    return {
      session: {
        id: sessionId,
        name: sessionSnap.get('name') as string,
        joinCode,
        phase: sessionSnap.get('phase') as string,
        capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
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

  return {
    session: {
      id: sessionId,
      name: sessionSnap.get('name') as string,
      joinCode: sessionSnap.get('joinCode') as string,
      phase: sessionSnap.get('phase') as string,
      capybaraEnabled: sessionSnap.get('capybaraEnabled') !== false,
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
  const playerRef = db.doc(`sessions/${claim.sessionId}/players/${uid}`);
  const instanceRef = db.doc(
    `sessions/${claim.sessionId}/gmInstances/${claim.instanceId}`,
  );

  await db.runTransaction(async (tx) => {
    const [player, existing] = await Promise.all([
      tx.get(playerRef),
      tx.get(instanceRef),
    ]);
    if (!isActivePlayer(player)) throw new HttpsError('permission-denied', 'Join the session first.');
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
export const refreshPresence = onCall<{ sessionId?: string }>(async (request) => {
  const uid = requireUid(request.auth);
  const { sessionId } = requireSessionRequest(request.data ?? {});
  const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
  const membershipRef = db.doc(`activeMemberships/${uid}`);
  await db.runTransaction(async (tx) => {
    const player = await tx.get(playerRef);
    if (!isActivePlayer(player)) {
      throw new HttpsError('permission-denied', 'Reconnect to the session first.');
    }
    tx.update(playerRef, { lastSeenAt: FieldValue.serverTimestamp() });
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
      role: 'player',
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
        role: 'player',
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
