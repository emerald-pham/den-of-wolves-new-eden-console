import { getFirestore, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isLiveSetupGm } from './gameSetup';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { buildScoutResolutionPlan } from './scoutResolutionPlan';
import { parsePrivateScoutResult, projectPrivateScoutResult,
  type ScoutResultViewerAuthority } from './scoutResultProjection';
import { PRESENCE_LEASE_MS } from './sessionLifecycle';

type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function command(raw: unknown, keys: readonly string[]): RecordValue {
  if (!record(raw) || !exact(raw, keys) || !id(raw.sessionId) ||
      (keys.includes('requestId') && !id(raw.requestId)) ||
      (keys.includes('instanceId') && !id(raw.instanceId))) {
    throw new HttpsError('invalid-argument', 'Invalid scout result request.');
  }
  return raw;
}

function uid(auth: { uid?: string } | null | undefined): string {
  if (!id(auth?.uid)) throw new HttpsError('unauthenticated', 'Sign in before reading scouting reports.');
  return auth.uid;
}

function ms(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (record(value) && typeof value.toMillis === 'function') {
    try {
      const parsed: unknown = value.toMillis();
      return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
    } catch { return null; }
  }
  return null;
}

function activeMember(player: DocumentSnapshot, nowMs: number): boolean {
  if (!player.exists || player.get('connected') !== true ||
      player.get('kickedAt') != null) return false;
  const presence = player.get('lastSeenAt');
  if (presence === undefined) return true; // bounded legacy compatibility
  const seen = ms(presence);
  return seen !== null && seen <= nowMs && nowMs - seen < PRESENCE_LEASE_MS;
}

function gmViewer(
  sessionId: string,
  gmUid: string,
  player: DocumentSnapshot,
  instance: DocumentSnapshot,
  nowMs: number,
): ScoutResultViewerAuthority {
  const lease = instance.get('lastSeenAt') ?? instance.get('claimedAt') ?? '';
  if (!activeMember(player, nowMs) || player.get('role') !== 'gm' ||
      !instance.exists || instance.get('uid') !== gmUid ||
      instance.get('connected') === false || !isLiveSetupGm({
        id: instance.id, uid: gmUid, connected: true, lastSeenAt: lease,
      }, nowMs)) {
    throw new HttpsError('permission-denied', 'A live owned GM instance is required.');
  }
  return {
    sessionId, uid: gmUid, role: 'gm', active: true, connected: true, nowMs,
    facilitatorInstance: {
      id: instance.id, sessionId, uid: gmUid, connected: true, lastSeenAt: lease,
    },
  };
}

function playerViewer(
  sessionId: string, memberUid: string, player: DocumentSnapshot, nowMs: number,
): ScoutResultViewerAuthority {
  return {
    sessionId, uid: memberUid, role: player.get('role'),
    active: activeMember(player, nowMs), connected: player.get('connected') === true,
    nowMs,
  };
}

function groupForShip(groups: readonly DocumentSnapshot[], shipId: unknown): string {
  if (!id(shipId)) throw new HttpsError('failed-precondition', 'The scouting ship is invalid.');
  const matches = groups.filter((group) => group.exists &&
    Array.isArray(group.get('vesselIds')) && group.get('vesselIds').includes(shipId) &&
    /^fleet-[1-9][0-9]*$/.test(group.id));
  if (matches.length !== 1) {
    throw new HttpsError('failed-precondition', 'The scouting ship has no unique fleet group.');
  }
  return matches[0]!.id;
}

function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** GM reveals one selected-chart fact from a committed, immutable legal request. */
export const resolvePendingScoutRequest = onCall(CALLABLE_RUNTIME_OPTIONS, async (request) => {
  const db = getFirestore();
  const actorUid = uid(request.auth);
  const raw = command(request.data, ['sessionId', 'requestId', 'instanceId']);
  const sessionId = raw.sessionId as string;
  const requestId = raw.requestId as string;
  const nowMs = Date.now();
  const serverTime = new Date(nowMs).toISOString();
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const requestRef = db.doc(`sessions/${sessionId}/scoutRequests/${requestId}`);
  const resultRef = db.doc(`sessions/${sessionId}/scoutResults/${requestId}`);
  const auditRef = db.doc(`sessions/${sessionId}/scoutResolutionAudits/${requestId}`);
  const deepRef = db.doc(`sessions/${sessionId}/deepNebulaScans/${requestId}`);

  return db.runTransaction(async (tx: Transaction) => {
    const [session, player, instance, pending, priorResult, groups] = await Promise.all([
      tx.get(sessionRef),
      tx.get(db.doc(`sessions/${sessionId}/players/${actorUid}`)),
      tx.get(db.doc(`sessions/${sessionId}/gmInstances/${raw.instanceId}`)),
      tx.get(requestRef), tx.get(resultRef),
      tx.get(db.collection(`sessions/${sessionId}/fleetGroups`)),
    ]);
    if (!session.exists || session.get('phase') !== 'active') {
      throw new HttpsError('failed-precondition', 'This scouting session is not active.');
    }
    const facilitator = gmViewer(sessionId, actorUid, player, instance, nowMs);
    const pendingData = pending.data();
    if (!record(pendingData) || pendingData.requestId !== requestId ||
        pendingData.sessionId !== sessionId || !id(pendingData.entitlementId) ||
        !Number.isSafeInteger(pendingData.cycle)) {
      throw new HttpsError('failed-precondition', 'The pending scout request is unavailable.');
    }
    const cadenceRef = db.doc(`sessions/${sessionId}/scoutCadence/${pendingData.cycle}-${pendingData.entitlementId}`);
    const cadence = await tx.get(cadenceRef);
    let plan;
    try {
      plan = buildScoutResolutionPlan({
        request: pendingData, cadence: cadence.data(),
        session: {
          sessionId, phase: session.get('phase'), chartId: session.get('chartId'),
          chartSelectionLocked: session.get('chartSelectionLocked'),
          currentCycle: session.get('currentTurn'),
        }, facilitator,
        fleetGroupId: groupForShip(groups.docs, pendingData.receivingShipId),
        recordedAt: serverTime,
      });
    } catch {
      throw new HttpsError('failed-precondition', 'The scout request no longer matches current authority.');
    }
    const noteRef = db.doc(
      `sessions/${sessionId}/playerDiscoveryNotes/${plan.result.requesterUid}/notes/${plan.note.id}`,
    );
    const [priorNote, priorAudit, priorDeep] = await Promise.all([
      tx.get(noteRef), tx.get(auditRef), tx.get(deepRef),
    ]);
    if (priorResult.exists) {
      const stored = parsePrivateScoutResult(priorResult.data());
      const note = priorNote.data();
      const audit = priorAudit.data();
      if (!stored || !equal(stored, plan.result) || !record(note) ||
          typeof note.recordedAt !== 'string' || !record(audit) ||
          audit.recordedAt !== note.recordedAt) {
        throw new HttpsError('failed-precondition', 'The stored scout result is incomplete.');
      }
      const replayPlan = buildScoutResolutionPlan({
        request: pendingData, cadence: cadence.data(),
        session: {
          sessionId, phase: session.get('phase'), chartId: session.get('chartId'),
          chartSelectionLocked: session.get('chartSelectionLocked'),
          currentCycle: session.get('currentTurn'),
        }, facilitator, fleetGroupId: groupForShip(groups.docs, pendingData.receivingShipId),
        recordedAt: note.recordedAt,
      });
      if (!id(audit.facilitatorUid) || !equal(note, replayPlan.note) ||
          !equal({ ...audit, facilitatorUid: replayPlan.audit.facilitatorUid }, replayPlan.audit) ||
          (replayPlan.deepNebulaScan ? !equal(priorDeep.data(), replayPlan.deepNebulaScan)
            : priorDeep.exists)) {
        throw new HttpsError('failed-precondition', 'The stored scout result has conflicting records.');
      }
      return { status: 'replayed' as const, result: stored };
    }
    if (priorNote.exists || priorAudit.exists || priorDeep.exists) {
      throw new HttpsError('failed-precondition', 'The scout result has conflicting records.');
    }
    tx.create(resultRef, plan.result);
    tx.create(noteRef, plan.note);
    tx.create(auditRef, plan.audit);
    if (plan.deepNebulaScan) tx.create(deepRef, plan.deepNebulaScan);
    return { status: 'resolved' as const, result: plan.result };
  });
});

/** Return one fact; no endpoint accepts a chart selector or exports a chart. */
export const readPrivateScoutResult = onCall(CALLABLE_RUNTIME_OPTIONS, async (request) => {
  const db = getFirestore();
  const actorUid = uid(request.auth);
  const raw = command(request.data, record(request.data) && 'instanceId' in request.data
    ? ['sessionId', 'requestId', 'instanceId'] : ['sessionId', 'requestId']);
  const sessionId = raw.sessionId as string;
  const nowMs = Date.now();
  return db.runTransaction(async (tx: Transaction) => {
    const [session, player, stored, instance] = await Promise.all([
      tx.get(db.doc(`sessions/${sessionId}`)),
      tx.get(db.doc(`sessions/${sessionId}/players/${actorUid}`)),
      tx.get(db.doc(`sessions/${sessionId}/scoutResults/${raw.requestId}`)),
      raw.instanceId ? tx.get(db.doc(`sessions/${sessionId}/gmInstances/${raw.instanceId}`)) : Promise.resolve(null),
    ]);
    if (!session.exists || session.get('phase') !== 'active') {
      throw new HttpsError('failed-precondition', 'This scouting session is not active.');
    }
    const viewer = player.get('role') === 'gm' && instance
      ? gmViewer(sessionId, actorUid, player, instance, nowMs)
      : playerViewer(sessionId, actorUid, player, nowMs);
    const result = projectPrivateScoutResult(stored.data(), viewer);
    if (!result) throw new HttpsError('permission-denied', 'This scouting result is unavailable.');
    return result;
  });
});

/** A GM sees only pending request coordinates and source identities. */
export const listPendingScoutRequests = onCall(CALLABLE_RUNTIME_OPTIONS, async (request) => {
  const db = getFirestore();
  const actorUid = uid(request.auth);
  const raw = command(request.data, ['sessionId', 'instanceId']);
  const sessionId = raw.sessionId as string;
  const nowMs = Date.now();
  return db.runTransaction(async (tx: Transaction) => {
    const [session, player, instance, requests] = await Promise.all([
      tx.get(db.doc(`sessions/${sessionId}`)),
      tx.get(db.doc(`sessions/${sessionId}/players/${actorUid}`)),
      tx.get(db.doc(`sessions/${sessionId}/gmInstances/${raw.instanceId}`)),
      tx.get(db.collection(`sessions/${sessionId}/scoutRequests`)),
    ]);
    if (!session.exists || session.get('phase') !== 'active') {
      throw new HttpsError('failed-precondition', 'This scouting session is not active.');
    }
    gmViewer(sessionId, actorUid, player, instance, nowMs);
    const pending = requests.docs.filter((doc) => doc.get('sessionId') === sessionId &&
      doc.get('type') === 'scout-request' && doc.get('status') === 'requested' &&
      doc.get('resolution') === 'pending' && doc.get('cycle') === session.get('currentTurn') &&
      id(doc.id) && doc.get('requestId') === doc.id && id(doc.get('entitlementId')) &&
      id(doc.get('anchorShipId')) && typeof doc.get('targetCoordinate') === 'string');
    const results = await Promise.all(pending.map((doc) =>
      tx.get(db.doc(`sessions/${sessionId}/scoutResults/${doc.id}`))));
    return pending.filter((_doc, index) => !results[index]!.exists).map((doc) => ({
      requestId: doc.id, cycle: doc.get('cycle') as number,
      entitlementId: doc.get('entitlementId') as string,
      anchorShipId: doc.get('anchorShipId') as string,
      targetCoordinate: doc.get('targetCoordinate') as string,
    }));
  });
});
