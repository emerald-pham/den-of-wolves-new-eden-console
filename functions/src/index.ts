import { randomInt, randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { canClaimSeat, shouldClearSeatPointer } from './seatPolicy';

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

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in before joining a table.');
  }
  return auth.uid;
}

async function requireGm(sessionId: string, uid: string): Promise<void> {
  const snap = await db.doc(`sessions/${sessionId}/players/${uid}`).get();
  if (snap.get('role') !== 'gm') {
    throw new HttpsError('permission-denied', 'GM only.');
  }
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

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const joinCode = makeJoinCode();
      const codeRef = db.doc(`joinCodes/${joinCode}`);
      const sessionRef = db.collection('sessions').doc();

      const claimed = await db.runTransaction(async (tx) => {
        if ((await tx.get(codeRef)).exists) return false;

        tx.set(codeRef, {
          sessionId: sessionRef.id,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(sessionRef, {
          name,
          joinCode,
          phase: 'lobby',
          ownerUid: uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        // The creator is the GM. This is exactly the write the rules forbid a
        // client to make for itself.
        tx.set(db.doc(`sessions/${sessionRef.id}/players/${uid}`), {
          uid,
          sessionId: sessionRef.id,
          displayName,
          role: 'gm',
          seatId: null,
          joinedAt: FieldValue.serverTimestamp(),
        });
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
            ownerUid: uid,
            createdAt: now,
            updatedAt: now,
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

    const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', 'No session with that code.');
    }
    if (sessionSnap.get('phase') === 'closed') {
      throw new HttpsError('failed-precondition', 'That session has closed.');
    }

    // Rejoining is normal -- a phone locks, a browser reloads -- so an existing
    // player document is left exactly as it is, role and seat included.
    const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);
    if (!(await playerRef.get()).exists) {
      await playerRef.set({
        uid,
        sessionId,
        displayName,
        role: 'player',
        seatId: null,
        joinedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      session: {
        id: sessionId,
        name: sessionSnap.get('name') as string,
        joinCode,
        phase: sessionSnap.get('phase') as string,
        ownerUid: sessionSnap.get('ownerUid') as string,
        createdAt: isoOf(sessionSnap.get('createdAt')),
        updatedAt: isoOf(sessionSnap.get('updatedAt')),
      },
    };
  },
);

/** Claim an open seat. First transaction wins; losers get a clean error. */
export const claimSeat = onCall<{ sessionId: string; seatId: string }>(
  async (request) => {
    const uid = requireUid(request.auth);
    const { sessionId, seatId } = request.data ?? {};
    if (!sessionId || !seatId) {
      throw new HttpsError('invalid-argument', 'sessionId and seatId required.');
    }

    const seatRef = db.doc(`sessions/${sessionId}/seats/${seatId}`);
    const playerRef = db.doc(`sessions/${sessionId}/players/${uid}`);

    return db.runTransaction(async (tx) => {
      const [seat, player] = await Promise.all([tx.get(seatRef), tx.get(playerRef)]);
      if (!player.exists) {
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
    const { sessionId, seatId } = request.data ?? {};
    if (!sessionId || !seatId) {
      throw new HttpsError('invalid-argument', 'sessionId and seatId required.');
    }

    const seatRef = db.doc(`sessions/${sessionId}/seats/${seatId}`);

    return db.runTransaction(async (tx) => {
      const seat = await tx.get(seatRef);
      if (!seat.exists) throw new HttpsError('not-found', 'No such seat.');

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
    const { sessionId, targetUid } = request.data ?? {};
    if (!sessionId || !targetUid) {
      throw new HttpsError('invalid-argument', 'sessionId and targetUid required.');
    }

    const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionSnap.exists) throw new HttpsError('not-found', 'No such session.');

    if (sessionSnap.get('ownerUid') !== uid) {
      await requireGm(sessionId, uid);
    }

    await db.doc(`sessions/${sessionId}/players/${targetUid}`).update({ role: 'gm' });
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
    const { sessionId, sides, count } = request.data ?? {};
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId required.');
    if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
      throw new HttpsError('invalid-argument', 'sides must be 2..1000.');
    }
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      throw new HttpsError('invalid-argument', 'count must be 1..50.');
    }

    const player = await db.doc(`sessions/${sessionId}/players/${uid}`).get();
    if (!player.exists) {
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
