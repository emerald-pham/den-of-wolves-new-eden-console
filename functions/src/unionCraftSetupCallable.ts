import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { commandError } from './commandErrors';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { craftStartingManifestForSetup, craftStartingManifestMatches, roleOwnedCraftForRoles,
  roleOwnedCraftManifestForSetup, roleOwnedCraftManifestMatches, shuttleDockingsAreParked,
  shuttleDockingsMatchRoleOwnedCraft, shuttleHostIsAllowed } from './craftOwnership';
import { initialShuttleVisitsForDockings } from './shuttlecraft';

export interface UnionCraftStartingHostReply {
  readonly status: 'committed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly craftId: 'wobbly' | 'ally';
  readonly hostShipId: string;
  readonly setupRevision: number;
}
interface Dependencies {
  db: Pick<Firestore, 'doc' | 'runTransaction'>;
  requireUid: (auth: { uid: string } | undefined) => string;
  requireFacilitatorInstance: (tx: Transaction, sessionId: string, uid: string, instanceId: string) => Promise<{ session: DocumentSnapshot }>;
  requireCastingWindow: (session: DocumentSnapshot) => void;
  setupForSession: (session: DocumentSnapshot) => { activeRoleIds: readonly string[]; activeVesselIds: readonly string[]; vesselMode: string };
  serverTimestamp: () => unknown;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
}

/** A facilitator supplies only the unspecified initial host; start derives printed role ownership. */
export function createUnionCraftStartingHostHandler(deps: Dependencies) {
  return async (request: { auth?: { uid: string }; data?: unknown }): Promise<UnionCraftStartingHostReply> => {
    const uid = deps.requireUid(request.auth), data = request.data;
    if (!record(data) || Object.keys(data).some(key => !['sessionId', 'instanceId', 'requestId', 'expectedSetupRevision', 'craftId', 'hostShipId'].includes(key)) ||
        !identifier(data.sessionId) || !identifier(data.instanceId) || !identifier(data.requestId) || !identifier(data.hostShipId) ||
        (data.craftId !== 'wobbly' && data.craftId !== 'ally') || !Number.isSafeInteger(data.expectedSetupRevision) ||
        (data.expectedSetupRevision as number) < 0 || !Number.isSafeInteger((data.expectedSetupRevision as number) + 1)) {
      throw new HttpsError('invalid-argument', 'Choose a Union craft starting host from the confirmed setup.');
    }
    const sessionId = data.sessionId, instanceId = data.instanceId, requestId = data.requestId;
    const craftId = data.craftId, hostShipId = data.hostShipId, revision = data.expectedSetupRevision as number;
    const sessionRef = deps.db.doc(`sessions/${sessionId}`), manifestRef = deps.db.doc(`sessions/${sessionId}/craftOwnership/manifest`);
    const receiptRef = deps.db.doc(`sessions/${sessionId}/commandReceipts/${requestId}`);
    const fingerprint: CommandFingerprint = { action: 'set-union-craft-starting-host', sessionId, instanceId, requestId,
      actorUid: uid, expectedRevision: revision, payload: { craftId, hostShipId } };
    return deps.db.runTransaction(async tx => {
      const [{ session }, manifest, receipt] = await Promise.all([
        deps.requireFacilitatorInstance(tx, sessionId, uid, instanceId), tx.get(manifestRef), tx.get(receiptRef),
      ]);
      deps.requireCastingWindow(session);
      if (session.get('setupConfirmed') !== true || session.get('currentTurn') !== 0)
        throw commandError('failed-precondition', 'Confirm setup before choosing a Union craft starting host.', 'invalid-phase');
      if (receipt.exists) {
        const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
        if (disposition.kind === 'foreign-actor') throw new HttpsError('permission-denied', 'This setup request belongs to another facilitator.');
        if (disposition.kind !== 'replay') throw commandError('failed-precondition', 'This setup request belongs to another action.', 'conflict');
        const reply = receipt.get('result');
        if (!record(reply) || Object.keys(reply).length !== 6 || reply.status !== 'committed' || reply.sessionId !== sessionId ||
            reply.requestId !== requestId || reply.craftId !== craftId || reply.hostShipId !== hostShipId || reply.setupRevision !== revision + 1)
          throw commandError('failed-precondition', 'The setup receipt is malformed.', 'conflict');
        return reply as unknown as UnionCraftStartingHostReply;
      }
      if (session.get('setupRevision') !== revision)
        throw commandError('failed-precondition', 'Setup changed. Review the current roster and choose again.', 'stale-revision');
      const setup = deps.setupForSession(session);
      const craft = roleOwnedCraftForRoles(setup.activeRoleIds).find(entry => entry.id === craftId);
      if (!craft || craft.enabledMode !== 'gm-controlled' || !setup.activeVesselIds.includes(hostShipId) || !shuttleHostIsAllowed(craftId, hostShipId))
        throw commandError('failed-precondition', 'The confirmed Union station must use one of its two active ships.', 'conflict');
      const dockings = session.get('shuttleDockings');
      const expectedManifest = roleOwnedCraftManifestForSetup(setup.activeRoleIds, setup.vesselMode);
      if (!Array.isArray(dockings) || !shuttleDockingsAreParked(dockings, setup.activeVesselIds) ||
          !shuttleDockingsMatchRoleOwnedCraft(setup.activeRoleIds, dockings) || !manifest.exists ||
          !roleOwnedCraftManifestMatches(manifest.data(), expectedManifest) ||
          !craftStartingManifestMatches(manifest.get('startingCraft'),
            craftStartingManifestForSetup(setup.activeRoleIds, setup.vesselMode, dockings), setup.activeVesselIds))
        throw commandError('failed-precondition', 'The current craft starting manifest is malformed. Reconfirm setup.', 'malformed-input');
      const visits = session.get('shuttleVisitLog');
      if (!Array.isArray(visits) || visits.some(visit => !record(visit) || !identifier(visit.id) || !identifier(visit.shuttleId) ||
          !identifier(visit.shipId) || visit.action !== 'docked' || visit.occurredAt !== 'SESSION START'))
        throw commandError('failed-precondition', 'The current initial docking history is malformed. Reconfirm setup.', 'malformed-input');
      const docking = { shuttleId: craftId, shipId: hostShipId, dockedAt: 'SESSION START' };
      const nextDockings = [...dockings.filter(entry => entry.shuttleId !== craftId), docking];
      const nextVisits = [...visits.filter(visit => visit.shuttleId !== craftId), ...initialShuttleVisitsForDockings([docking])];
      const result: UnionCraftStartingHostReply = { status: 'committed', sessionId, requestId, craftId, hostShipId, setupRevision: revision + 1 };
      tx.update(sessionRef, { shuttleDockings: nextDockings, shuttleVisitLog: nextVisits, setupRevision: result.setupRevision, updatedAt: deps.serverTimestamp() });
      tx.set(manifestRef, { ...expectedManifest, startingCraft: craftStartingManifestForSetup(setup.activeRoleIds, setup.vesselMode, nextDockings),
        setupRevision: result.setupRevision, updatedAt: deps.serverTimestamp() });
      tx.set(receiptRef, { fingerprint, result, createdAt: deps.serverTimestamp() });
      return result;
    });
  };
}
