import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { memberSessionProjection, memberSessionScope } from './memberSession';
import { fleetGroupMemberShipId, fleetGroupRecord } from './fleetGroups';

function wire(value: unknown): unknown {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value.toDate() as Date).toISOString();
  }
  if (Array.isArray(value)) return value.map(wire);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, wire(entry)]));
  return value;
}

/** A read-only transaction binds the actor, its own berth and craft audience.
 * The server-only member berth map and other actors' berths never leave it. */
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
      const [session, actor, groups, departures, election, ballot] = await Promise.all([
        tx.get(db.doc(`sessions/${sessionId}`)),
        tx.get(db.doc(`sessions/${sessionId}/players/${actorUid}`)),
        tx.get(db.collection(`sessions/${sessionId}/fleetGroups`)),
        tx.get(db.collection(`sessions/${sessionId}/shuttleDepartures`)),
        tx.get(db.doc(`sessions/${sessionId}/presidentialElections/current`)),
        tx.get(db.doc(`sessions/${sessionId}/presidentialElections/current/ballots/${actorUid}`)),
      ]);
      if (!session.exists) throw new HttpsError('not-found', 'No such session.');
      const closedHistory = session.get('phase') === 'closed';
      const historicalRole = actor.get('role') === 'player' || actor.get('role') === 'gm';
      if (!actor.exists || actor.get('kickedAt') ||
          actor.get('connected') !== true && !(closedHistory && historicalRole)) {
        throw new HttpsError('permission-denied', 'Current session membership is required.');
      }
      let scope;
      try {
        scope = actor.get('role') === 'gm'
          ? { groupId: 'gm', vesselIds: Array.isArray(session.get('activeVesselIds'))
            ? (session.get('activeVesselIds') as unknown[]).filter((id): id is string => typeof id === 'string') : [] }
          : memberSessionScope({ ...actor.data(), uid: actorUid,
            ...(closedHistory ? { connected: true } : {}) }, groups.docs.map(group => group.data()));
      } catch {
        throw new HttpsError('permission-denied', 'Current fleet membership is unavailable.');
      }
      if (!Array.isArray(scope.vesselIds)) throw new HttpsError('failed-precondition', 'Session roster is unavailable.');
      const craftIds = scope.vesselIds.length === 0 ? [] : departures.docs.flatMap(departure =>
        departure.get('fleetGroupId') === scope.groupId &&
        ['requested', 'in-transit'].includes(String(departure.get('status')))
          ? [departure.id] : []);
      const source = closedHistory ? {
        id: sessionId,
        name: typeof session.get('name') === 'string' ? session.get('name') : '',
        phase: 'closed',
        currentTurn: session.get('currentTurn'),
        playerCount: session.get('playerCount'),
        turnLimit: session.get('turnLimit'),
        createdAt: wire(session.get('createdAt')),
        updatedAt: wire(session.get('updatedAt')),
      } : projectSession(session, sessionId);
      const raw: Record<string, unknown> = {
        ...source,
        gameOutcome: session.get('gameOutcome'),
        survivorOutcome: session.get('survivorOutcome'),
        debriefSnapshot: session.get('debriefSnapshot'),
        fullGameDemo: session.get('fullGameDemo'),
        pressHolderUid: session.get('pressHolderUid'),
        awayMissionProjectionSafety: session.get('awayMissionProjectionSafety'),
      };
      const memberSession = wire(memberSessionProjection(raw, { ...scope, actorUid, craftIds,
        presidentialBallotSubmitted: election.exists && ballot.exists && ballot.get('voterUid') === actorUid })) as Record<string, unknown>;
      const closedSession = closedHistory ? {
        id: sessionId,
        name: typeof raw.name === 'string' ? raw.name : '',
        joinCode: '',
        phase: 'closed',
        currentTurn: Number.isSafeInteger(raw.currentTurn) ? raw.currentTurn : 0,
        ...(Number.isSafeInteger(raw.playerCount) ? { playerCount: raw.playerCount } : {}),
        ...(Number.isSafeInteger(raw.turnLimit) ? { turnLimit: raw.turnLimit } : {}),
        ...(typeof raw.createdAt === 'string' ? { createdAt: raw.createdAt } : {}),
        ...(typeof raw.updatedAt === 'string' ? { updatedAt: raw.updatedAt } : {}),
        ...(memberSession.gameOutcome ? { gameOutcome: memberSession.gameOutcome } : {}),
        ...(memberSession.survivorOutcome ? { survivorOutcome: memberSession.survivorOutcome } : {}),
        ...(memberSession.debriefSnapshot ? { debriefSnapshot: memberSession.debriefSnapshot } : {}),
        ...(memberSession.fullGameDemo ? { fullGameDemo: memberSession.fullGameDemo } : {}),
      } : undefined;
      const currentGroup = groups.docs.find(group => group.get('id') === scope.groupId);
      // Absence alone preserves the legacy static-ship path. A present map
      // without a usable current berth must explicitly withdraw that path.
      const hasCurrentBerthMap = !closedHistory && actor.get('role') === 'player' &&
        Object.hasOwn(currentGroup?.data() ?? {}, 'memberShipIds');
      const group = currentGroup ? fleetGroupRecord(currentGroup.data()) : undefined;
      const shipId = group ? fleetGroupMemberShipId([group], actorUid, scope.groupId) : undefined;
      const connectionGeneration = actor.get('connectionGeneration') ?? 1;
      const assignedRoleId = actor.get('assignedRoleId') ?? null;
      const activeConsoleRoleId = actor.get('activeConsoleRoleId') ?? null;
      const replacementRoleId = actor.get('replacementRoleId') ?? null;
      const nullableRoleId = (id: unknown) => id === null ||
        typeof id === 'string' && id.length > 0 && id.length <= 1_500 && !id.includes('/');
      const currentActorBerthAuthority = hasCurrentBerthMap && shipId && scope.vesselIds.includes(shipId) &&
        Number.isSafeInteger(connectionGeneration) && connectionGeneration >= 1 &&
        nullableRoleId(assignedRoleId) && nullableRoleId(activeConsoleRoleId) && nullableRoleId(replacementRoleId) &&
        actor.get('replacementStatus') == null
        ? { sessionId, actorUid, groupId: scope.groupId, role: 'player' as const, connectionGeneration,
          assignedRoleId, activeConsoleRoleId, replacementRoleId, replacementStatus: null, shipId }
        : null;
      return {
        type: 'current-member-session' as const, sessionId, actorUid, groupId: scope.groupId,
        connectionGeneration: actor.get('connectionGeneration') ?? 1,
        assignedRoleId: actor.get('assignedRoleId') ?? null,
        activeConsoleRoleId: actor.get('activeConsoleRoleId') ?? null,
        ...(hasCurrentBerthMap ? { currentActorBerthAuthority } : {}),
        session: closedSession ?? memberSession,
      };
    }, { readOnly: true });
  };
}
