import { HttpsError } from 'firebase-functions/v2/https';

export function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in before joining a table.');
  }
  return auth.uid;
}

export function requireSessionRequest(data: {
  sessionId?: unknown;
}): { sessionId: string } {
  const { sessionId } = data;
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId required.');
  }
  return { sessionId };
}

export function requireSessionSeatRequest(data: {
  sessionId?: unknown;
  seatId?: unknown;
}): { sessionId: string; seatId: string } {
  const { sessionId, seatId } = data;
  if (typeof sessionId !== 'string' || !sessionId || typeof seatId !== 'string' || !seatId) {
    throw new HttpsError('invalid-argument', 'sessionId and seatId required.');
  }
  return { sessionId, seatId };
}

export function requireElevationRequest(data: {
  sessionId?: unknown;
  targetUid?: unknown;
}): { sessionId: string; targetUid: string } {
  const { sessionId, targetUid } = data;
  if (
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof targetUid !== 'string' ||
    !targetUid
  ) {
    throw new HttpsError('invalid-argument', 'sessionId and targetUid required.');
  }
  return { sessionId, targetUid };
}

export function requireDiceRequest(data: {
  sessionId?: unknown;
  sides?: unknown;
  count?: unknown;
}): { sessionId: string; sides: number; count: number } {
  const { sessionId, sides, count } = data;
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId required.');
  }
  if (typeof sides !== 'number' || !Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new HttpsError('invalid-argument', 'sides must be 2..1000.');
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 50) {
    throw new HttpsError('invalid-argument', 'count must be 1..50.');
  }
  return { sessionId, sides, count };
}
