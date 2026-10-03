import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { memberSessionProjection, memberSessionScope } from './memberSession';

function wire(value: unknown): unknown {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value.toDate() as Date).toISOString();
  }
  if (Array.isArray(value)) return value.map(wire);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, wire(entry)]));
  return value;
}

/** A read-only transaction keeps the actor, group and craft entitlement on one current snapshot. */
export function createCurrentMemberSessionReader({ db, projectSession }: {
  readonly db: Firestore;
  readonly projectSession: (source: DocumentSnapshot, sessionId: string) => Record<string, unknown>;
}) {
  return async (request: { readonly auth?: { readonly uid: string }; readonly data?: unknown }) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before reading this session.');
    const data = request.data as Record<string, unknown> | undefined;
    if (!data || Array.isArray(data) || Object.keys(data).length !== 1 ||
        typeof data.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(data.sessionId)) {
      throw new HttpsError('invalid-argument', 'A session ID is required.');
    }
    const sessionId = data.sessionId;
    const actorUid = request.auth.uid;
    return db.runTransaction(async tx => {
      const [session, actor, groups, departures] = await Promise.all([
        tx.get(db.doc(`sessions/${sessionId}`)),
        tx.get(db.doc(`sessions/${sessionId}/players/${actorUid}`)),
        tx.get(db.collection(`sessions/${sessionId}/fleetGroups`)),
        tx.get(db.collection(`sessions/${sessionId}/shuttleDepartures`)),
      ]);
      if (!session.exists) throw new HttpsError('not-found', 'No such session.');
      if (!actor.exists || actor.get('connected') !== true || actor.get('kickedAt')) {
        throw new HttpsError('permission-denied', 'Current session membership is required.');
      }
      let scope;
      try {
        scope = actor.get('role') === 'gm'
          ? { groupId: 'gm', vesselIds: session.get('activeVesselIds') as readonly string[] }
          : memberSessionScope({ ...actor.data(), uid: actorUid }, groups.docs.map(group => group.data()));
      } catch {
        throw new HttpsError('permission-denied', 'Current fleet membership is unavailable.');
      }
      if (!Array.isArray(scope.vesselIds)) throw new HttpsError('failed-precondition', 'Session roster is unavailable.');
      const craftIds = scope.vesselIds.length === 0 ? [] : departures.docs.flatMap(departure =>
        departure.get('fleetGroupId') === scope.groupId &&
        ['requested', 'in-transit'].includes(String(departure.get('status')))
          ? [departure.id] : []);
      const raw = { ...projectSession(session, sessionId), pressHolderUid: session.get('pressHolderUid') };
      return {
        type: 'current-member-session' as const, sessionId, actorUid, groupId: scope.groupId,
        connectionGeneration: actor.get('connectionGeneration') ?? 1,
        assignedRoleId: actor.get('assignedRoleId') ?? null,
        activeConsoleRoleId: actor.get('activeConsoleRoleId') ?? null,
        session: wire(memberSessionProjection(raw, { ...scope, actorUid, craftIds })) as Record<string, unknown>,
      };
    });
  };
}
