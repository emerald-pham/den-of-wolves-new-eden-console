import { randomInt, randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

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
      if (holderUid !== uid) {
        await requireGm(sessionId, uid);
      }

      tx.update(seatRef, { status: 'open', holderUid: null, claimedAt: null });
      if (holderUid) {
        tx.update(db.doc(`sessions/${sessionId}/players/${holderUid}`), {
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
