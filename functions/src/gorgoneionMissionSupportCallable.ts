import { HttpsError } from 'firebase-functions/v2/https';
import {
  commandReceiptDisposition,
  type CommandFingerprint,
} from './commandIdempotency';
import { missionDeckDealtCount } from './awayMissionCards';
import { isExtraShipAdmitted } from './extraShipAdmission';
import { applyGorgoneionMissionSupport } from './gorgoneionMissionSupport';
import {
  missionDeck,
  parseMissionDeckState,
  type MissionCardId,
  type MissionDeckState,
} from './missionDeck';
import { parseSmallShipState } from './smallShip';

type Data = Record<string, unknown>;
type TransactionSnapshot = Readonly<{
  readonly exists: boolean;
  readonly id: string;
  get(field: string): unknown;
  data(): unknown;
}>;
type PlayerQuerySnapshot = Readonly<{ readonly docs: readonly TransactionSnapshot[] }>;
type Transaction = {
  get(reference: unknown): Promise<TransactionSnapshot | PlayerQuerySnapshot>;
  set(reference: unknown, value: Data): void;
  update(reference: unknown, value: Data): void;
  delete(reference: unknown): void;
};

const ROLE_ID = 'gorgoneion-captain' as const;
const SMALL_SHIP_ID = 'gorgoneion' as const;
const ACTION = 'gorgoneion-mission-support' as const;
const MISSION_SUPPORT_CARD_COUNT = 5;
const REQUEST_ID_PATTERN = /^[\w-]{1,128}$/;
const SESSION_ID_PATTERN = /^[\w-]{1,128}$/;
const CARD_IDS = new Set<string>(missionDeck().map(({ id }) => id));
const PROJECTION_FIELDS = new Set([
  'sessionId', 'actorUid', 'hostShipId', 'dockingRevision', 'dealtCount', 'cardIds',
]);
const APPLY_FIELDS = new Set([
  ...PROJECTION_FIELDS, 'requestId', 'topCardIds', 'bottomCardIds',
]);

export interface GorgoneionMissionSupportCallableRequest {
  readonly auth?: { readonly uid?: string } | null;
  readonly data?: unknown;
}

export interface GorgoneionMissionSupportCallableSnapshot {
  readonly exists: boolean;
  readonly id: string;
  get(field: string): unknown;
  data(): unknown;
}

export interface GorgoneionMissionSupportCallableDatabase {
  doc(path: string): unknown;
  collection(path: string): unknown;
  runTransaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T>;
}

export interface GorgoneionMissionSupportCommandMarkerAdapter {
  /** Read the shared session commandReceipts marker in the same transaction. */
  readonly read: (
    transaction: unknown,
    sessionId: string,
    requestId: string,
  ) => Promise<GorgoneionMissionSupportCallableSnapshot>;
  /** Atomically occupy the shared request-id namespace with its safe reply. */
  readonly create: (
    transaction: unknown,
    fingerprint: CommandFingerprint,
    result: GorgoneionMissionSupportApplyReply,
  ) => void;
}

export interface GorgoneionMissionSupportCallableDependencies {
  readonly db: GorgoneionMissionSupportCallableDatabase;
  readonly commandMarkers: GorgoneionMissionSupportCommandMarkerAdapter;
  readonly isActivePlayer: (player: GorgoneionMissionSupportCallableSnapshot) => boolean;
  readonly serverTimestamp: () => unknown;
}

export interface GorgoneionMissionSupportProjection {
  readonly status: 'available';
  readonly sessionId: string;
  readonly actorUid: string;
  readonly hostShipId: string;
  readonly dockingRevision: number;
  readonly dealtCount: 0;
  readonly cardIds: readonly MissionCardId[];
}

export interface GorgoneionMissionSupportApplyReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly cardCount: typeof MISSION_SUPPORT_CARD_COUNT;
}

interface ProjectionCommand {
  readonly sessionId: string;
  readonly actorUid: string;
  readonly hostShipId: string;
  readonly dockingRevision: number;
  readonly dealtCount: 0;
  readonly cardIds: readonly MissionCardId[];
}

interface ApplyCommand extends ProjectionCommand {
  readonly requestId: string;
  readonly topCardIds: readonly MissionCardId[];
  readonly bottomCardIds: readonly MissionCardId[];
}

interface CurrentMissionSupportContext {
  readonly session: GorgoneionMissionSupportCallableSnapshot;
  readonly actor: GorgoneionMissionSupportCallableSnapshot;
  readonly deckSnapshot: GorgoneionMissionSupportCallableSnapshot;
  readonly deckData: Data;
  readonly deckState: MissionDeckState;
  readonly dealtCount: number;
  readonly hostShipId: string;
  readonly dockingRevision: number;
}

/**
 * Create the private Gorgoneion pre-deal support actions. Both reads and
 * writes use the P403 missionDeck document so Firestore serializes support
 * against the deal cursor update. The server-only action marker and the shared
 * actor-bound command receipt commit in the same transaction.
 */
export function createGorgoneionMissionSupportCallables(
  dependencies: GorgoneionMissionSupportCallableDependencies,
) {
  return {
    getGorgoneionMissionSupportProjection: async (
      request: GorgoneionMissionSupportCallableRequest,
    ): Promise<GorgoneionMissionSupportProjection> => {
      const actorUid = requireActorUid(request.auth);
      const sessionId = parseProjectionRequest(request.data);

      return dependencies.db.runTransaction(async (rawTransaction) => {
        const transaction = rawTransaction as Transaction;
        const [sessionRead, actorRead, playersRead, deckRead] = await Promise.all([
          transaction.get(dependencies.db.doc(`sessions/${sessionId}`)),
          transaction.get(dependencies.db.doc(`sessions/${sessionId}/players/${actorUid}`)),
          transaction.get(dependencies.db.collection(`sessions/${sessionId}/players`)),
          transaction.get(dependencies.db.doc(`sessions/${sessionId}/serverState/missionDeck`)),
        ]);
        const session = requireDocumentSnapshot(sessionRead);
        const actor = requireDocumentSnapshot(actorRead);
        const players = requirePlayerQuery(playersRead);
        const deckSnapshot = requireDocumentSnapshot(deckRead);
        requireCurrentCaptain(actor, players.docs, actorUid, dependencies.isActivePlayer);
        if (!session.exists) throw new HttpsError('not-found', 'No such session.');
        const context = requireCurrentMissionSupportContext(session, actor, deckSnapshot);
        if (hasSupportAction(context.deckData)) {
          failClosed('Gorgoneion mission support has already been used.');
        }
        const reply = projectionReply(sessionId, actorUid, context);
        // Older production starts omitted the zero cursor. The callable
        // validates that legacy deck as undealt, but the private read rules
        // require the explicit cursor. Publish both authorities atomically.
        if (context.deckData.dealtCount === undefined) {
          transaction.update(dependencies.db.doc(`sessions/${sessionId}/serverState/missionDeck`), {
            dealtCount: 0,
          });
        }
        transaction.set(dependencies.db.doc(
          `sessions/${sessionId}/gorgoneionMissionSupportViews/${actorUid}`,
        ), {
          sessionId,
          actorUid,
          hostShipId: context.hostShipId,
          dockingRevision: context.dockingRevision,
          dealtCount: 0,
          cardIds: [...reply.cardIds],
        });
        return reply;
      });
    },

    applyGorgoneionMissionSupport: async (
      request: GorgoneionMissionSupportCallableRequest,
    ): Promise<GorgoneionMissionSupportApplyReply> => {
      const actorUid = requireActorUid(request.auth);
      const command = parseApplyCommand(request.data);
      if (command.actorUid !== actorUid) {
        throw new HttpsError('permission-denied', 'The inspected Gorgoneion projection belongs to another player.');
      }
      const fingerprint = fingerprintFor(actorUid, command);
      const sessionPath = `sessions/${command.sessionId}`;
      const deckPath = `${sessionPath}/serverState/missionDeck`;

      return dependencies.db.runTransaction(async (rawTransaction) => {
        const transaction = rawTransaction as Transaction;
        const [sessionRead, actorRead, playersRead, deckRead, receipt] = await Promise.all([
          transaction.get(dependencies.db.doc(sessionPath)),
          transaction.get(dependencies.db.doc(`${sessionPath}/players/${actorUid}`)),
          transaction.get(dependencies.db.collection(`${sessionPath}/players`)),
          transaction.get(dependencies.db.doc(deckPath)),
          dependencies.commandMarkers.read(rawTransaction, command.sessionId, command.requestId),
        ]);
        const session = requireDocumentSnapshot(sessionRead);
        const actor = requireDocumentSnapshot(actorRead);
        const players = requirePlayerQuery(playersRead);
        const deckSnapshot = requireDocumentSnapshot(deckRead);
        requireCurrentCaptain(actor, players.docs, actorUid, dependencies.isActivePlayer);
        if (!session.exists) throw new HttpsError('not-found', 'No such session.');

        const replay = replayReply(receipt, fingerprint);
        if (replay) return replay;

        const context = requireCurrentMissionSupportContext(session, actor, deckSnapshot);
        if (hasSupportAction(context.deckData)) {
          failClosed('Gorgoneion mission support has already been used.');
        }
        if (command.hostShipId !== context.hostShipId ||
            command.dockingRevision !== context.dockingRevision) {
          failClosed('The Gorgoneion dock changed. Refresh before using mission support.');
        }

        const inspectedTopFive = context.deckState.order.slice(0, MISSION_SUPPORT_CARD_COUNT);
        if (!sameCardIds(command.cardIds, inspectedTopFive)) {
          failClosed('The inspected mission cards changed. Refresh before applying support.');
        }

        const reordered = applyGorgoneionMissionSupport({
          deckState: context.deckState,
          phase: 'before-first-deal',
          dealtCount: 0,
          topCardIds: command.topCardIds,
          bottomCardIds: command.bottomCardIds,
        });
        if (!reordered) {
          throw new HttpsError('invalid-argument', 'Choose an exact partition of the inspected five cards.');
        }

        const topSet = new Set(command.topCardIds);
        const bottomSet = new Set(command.bottomCardIds);
        const normalizedTopCardIds = inspectedTopFive.filter((cardId) => topSet.has(cardId));
        const normalizedBottomCardIds = inspectedTopFive.filter((cardId) => bottomSet.has(cardId));
        const reply: GorgoneionMissionSupportApplyReply = {
          status: 'committed',
          sessionId: command.sessionId,
          requestId: command.requestId,
          cardCount: MISSION_SUPPORT_CARD_COUNT,
        };
        const marker = {
          schemaVersion: 1,
          action: ACTION,
          requestId: command.requestId,
          actorUid,
          hostShipId: context.hostShipId,
          dockingRevision: context.dockingRevision,
          dealtCountBefore: 0,
          inspectedCardIds: inspectedTopFive,
          topCardIds: normalizedTopCardIds,
          bottomCardIds: normalizedBottomCardIds,
          createdAt: dependencies.serverTimestamp(),
        };

        transaction.update(dependencies.db.doc(deckPath), {
          order: reordered.order,
          gorgoneionSupportApplied: true,
          gorgoneionMissionSupport: marker,
          updatedAt: dependencies.serverTimestamp(),
        });
        transaction.delete(dependencies.db.doc(
          `${sessionPath}/gorgoneionMissionSupportViews/${actorUid}`,
        ));
        dependencies.commandMarkers.create(rawTransaction, fingerprint, reply);
        return reply;
      });
    },
  };
}

function parseProjectionRequest(value: unknown): string {
  if (!isRecord(value) || !hasExactKeys(value, new Set(['sessionId'])) ||
      typeof value.sessionId !== 'string' || !SESSION_ID_PATTERN.test(value.sessionId)) {
    throw new HttpsError('invalid-argument', 'Invalid Gorgoneion mission-support projection request.');
  }
  return value.sessionId;
}

function parseApplyCommand(value: unknown): ApplyCommand {
  if (!isRecord(value) || !hasExactKeys(value, APPLY_FIELDS) ||
      typeof value.sessionId !== 'string' || !SESSION_ID_PATTERN.test(value.sessionId) ||
      typeof value.actorUid !== 'string' || value.actorUid.length === 0 || value.actorUid.length > 128 ||
      typeof value.hostShipId !== 'string' || !/^[-\w]{1,128}$/.test(value.hostShipId) ||
      !Number.isSafeInteger(value.dockingRevision) || (value.dockingRevision as number) < 1 ||
      value.dealtCount !== 0 || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId) ||
      !isCardIdArray(value.cardIds, MISSION_SUPPORT_CARD_COUNT) ||
      !isCardIdArray(value.topCardIds) || !isCardIdArray(value.bottomCardIds) ||
      value.topCardIds.length + value.bottomCardIds.length !== MISSION_SUPPORT_CARD_COUNT) {
    throw new HttpsError('invalid-argument', 'Invalid Gorgoneion mission-support command.');
  }
  return {
    sessionId: value.sessionId,
    actorUid: value.actorUid,
    hostShipId: value.hostShipId,
    dockingRevision: value.dockingRevision as number,
    dealtCount: 0,
    cardIds: value.cardIds as MissionCardId[],
    requestId: value.requestId,
    topCardIds: value.topCardIds as MissionCardId[],
    bottomCardIds: value.bottomCardIds as MissionCardId[],
  };
}

function requireCurrentCaptain(
  actor: GorgoneionMissionSupportCallableSnapshot,
  players: readonly GorgoneionMissionSupportCallableSnapshot[],
  actorUid: string,
  isActivePlayer: (player: GorgoneionMissionSupportCallableSnapshot) => boolean,
): void {
  if (!isActivePlayer(actor) || actor.get('role') !== 'player' ||
      actor.get('replacementRoleId') !== ROLE_ID || actor.get('replacementStatus') != null ||
      actor.get('activeConsoleRoleId') !== null || actor.get('seatId') !== null ||
      actor.get('escapeState') != null) {
    throw new HttpsError('permission-denied', 'Only the connected current Gorgoneion Captain may use mission support.');
  }
  const roleHolders = players.filter((player) => player.get('replacementRoleId') === ROLE_ID);
  if (roleHolders.length !== 1 || roleHolders[0]?.id !== actorUid || actor.id !== actorUid) {
    failClosed('The authoritative Gorgoneion Captain assignment is unavailable.');
  }
}

function requireCurrentMissionSupportContext(
  session: GorgoneionMissionSupportCallableSnapshot,
  _actor: GorgoneionMissionSupportCallableSnapshot,
  deckSnapshot: GorgoneionMissionSupportCallableSnapshot,
): CurrentMissionSupportContext {
  if (session.get('phase') !== 'active') {
    failClosed('Gorgoneion mission support is available only during active gameplay.');
  }
  const sessionData = snapshotData(session, 'The authoritative session state is malformed.');
  const admission = {
    activeVesselIds: sessionData.activeVesselIds,
    smallShipStates: sessionData.smallShipStates,
    smallShipId: SMALL_SHIP_ID,
    expansion: sessionData.expansion,
    capybaraEnabled: sessionData.capybaraEnabled,
  };
  if (!isExtraShipAdmitted(admission)) {
    failClosed('Gorgoneion is not admitted at an active core host.');
  }
  const smallShipStates = isRecord(sessionData.smallShipStates) ? sessionData.smallShipStates : undefined;
  const smallShipState = parseSmallShipState(smallShipStates?.[SMALL_SHIP_ID], SMALL_SHIP_ID);
  if (!smallShipState || smallShipState.hostShipId === null || smallShipState.dockingRevision < 1) {
    failClosed('The current Gorgoneion docking authority is unavailable.');
  }
  if (!deckSnapshot.exists) failClosed('The server-owned mission deck is missing.');
  const deckData = snapshotData(deckSnapshot, 'The server-owned mission deck is malformed.');
  const deckState = parseMissionDeckState(deckData);
  const dealtCount = deckState ? missionDeckDealtCount(deckData, deckState.order.length) : null;
  if (!deckState || dealtCount === null) {
    failClosed('The server-owned mission deck or deal cursor is malformed.');
  }
  if (dealtCount !== 0) {
    failClosed('Gorgoneion mission support is available only before the first mission card is dealt.');
  }
  return {
    session,
    actor: _actor,
    deckSnapshot,
    deckData,
    deckState,
    dealtCount,
    hostShipId: smallShipState.hostShipId,
    dockingRevision: smallShipState.dockingRevision,
  };
}

function projectionReply(
  sessionId: string,
  actorUid: string,
  context: CurrentMissionSupportContext,
): GorgoneionMissionSupportProjection {
  const cardIds = context.deckState.order.slice(0, MISSION_SUPPORT_CARD_COUNT);
  if (cardIds.length !== MISSION_SUPPORT_CARD_COUNT) {
    failClosed('The server-owned mission deck has fewer than five cards.');
  }
  return {
    status: 'available',
    sessionId,
    actorUid,
    hostShipId: context.hostShipId,
    dockingRevision: context.dockingRevision,
    dealtCount: 0,
    cardIds,
  };
}

function fingerprintFor(actorUid: string, command: ApplyCommand): CommandFingerprint {
  const topSet = new Set(command.topCardIds);
  const bottomSet = new Set(command.bottomCardIds);
  const normalizedTop = command.cardIds.filter((cardId) => topSet.has(cardId));
  const normalizedBottom = command.cardIds.filter((cardId) => bottomSet.has(cardId));
  return {
    action: ACTION,
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid,
    instanceId: null,
    expectedRevision: command.dockingRevision,
    payload: {
      hostShipId: command.hostShipId,
      dockingRevision: command.dockingRevision,
      dealtCount: command.dealtCount,
      inspectedCardIds: [...command.cardIds],
      topCardIds: normalizedTop,
      bottomCardIds: normalizedBottom,
    },
  };
}

function replayReply(
  receipt: GorgoneionMissionSupportCallableSnapshot,
  fingerprint: CommandFingerprint,
): GorgoneionMissionSupportApplyReply | null {
  if (!receipt.exists) return null;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', 'This Gorgoneion mission-support request belongs to another Captain.');
  }
  if (disposition.kind === 'collision') {
    failClosed('This Gorgoneion mission-support request id is bound to another command.');
  }
  const result = receipt.get('result');
  if (!isRecord(result) || !hasExactKeys(result, new Set(['status', 'sessionId', 'requestId', 'cardCount'])) ||
      result.status !== 'committed' || result.sessionId !== fingerprint.sessionId ||
      result.requestId !== fingerprint.requestId || result.cardCount !== MISSION_SUPPORT_CARD_COUNT) {
    failClosed('This Gorgoneion mission-support receipt has no safe replay result.');
  }
  return {
    status: 'replayed',
    sessionId: fingerprint.sessionId!,
    requestId: fingerprint.requestId,
    cardCount: MISSION_SUPPORT_CARD_COUNT,
  };
}

function requireActorUid(auth: GorgoneionMissionSupportCallableRequest['auth']): string {
  if (typeof auth?.uid !== 'string' || auth.uid.length === 0) {
    throw new HttpsError('unauthenticated', 'Sign in before using Gorgoneion mission support.');
  }
  return auth.uid;
}

function requireDocumentSnapshot(value: TransactionSnapshot | PlayerQuerySnapshot): TransactionSnapshot {
  if ('exists' in value && typeof value.exists === 'boolean' &&
      typeof value.get === 'function' && typeof value.data === 'function') {
    return value as TransactionSnapshot;
  }
  failClosed('An authoritative session document is unavailable.');
}

function requirePlayerQuery(value: TransactionSnapshot | PlayerQuerySnapshot): PlayerQuerySnapshot {
  if ('docs' in value && Array.isArray(value.docs)) return value as PlayerQuerySnapshot;
  failClosed('The current session player roster is unavailable.');
}

function hasSupportAction(deckData: Data): boolean {
  return deckData.gorgoneionSupportApplied === true ||
    (Object.hasOwn(deckData, 'gorgoneionMissionSupport') && deckData.gorgoneionMissionSupport != null);
}

function snapshotData(snapshot: GorgoneionMissionSupportCallableSnapshot, message: string): Data {
  const value = snapshot.data();
  if (!isRecord(value)) failClosed(message);
  return value;
}

function isCardIdArray(value: unknown, expectedLength?: number): value is MissionCardId[] {
  return Array.isArray(value) &&
    (expectedLength === undefined || value.length === expectedLength) &&
    value.every((cardId) => typeof cardId === 'string' && CARD_IDS.has(cardId)) &&
    new Set(value).size === value.length;
}

function sameCardIds(actual: readonly MissionCardId[], expected: readonly MissionCardId[]): boolean {
  return actual.length === expected.length && actual.every((cardId, index) => cardId === expected[index]);
}

function hasExactKeys(value: Data, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failClosed(message: string): never {
  throw new HttpsError('failed-precondition', message);
}
