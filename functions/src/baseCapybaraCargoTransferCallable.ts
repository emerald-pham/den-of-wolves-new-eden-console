import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { isPresenceStale } from './sessionLifecycle';
import {
  BASE_CAPYBARA_CARGO_TYPES,
  resolveBaseCapybaraCargoTransfer,
  type BaseCapybaraCargoType,
} from './baseCapybaraCargoTransfer';
import { isResourceShipId } from './resources';
import { replacementRoleAvailable, replacementRoleFor } from './replacementRoles';
import { vesselModeForConfiguration } from './gameSetup';

type RecordValue = Record<string, unknown>;

type BaseCapybaraCargoTransferCommand = Readonly<{
  sessionId: string;
  requestId: string;
  expectedCycle: number;
  expectedRevision: number;
  expectedHostShipId: string;
  expectedDockingRevision: number;
  resourceId: BaseCapybaraCargoType;
  direction: 'load' | 'unload';
  amount: number;
}>;

type BaseCapybaraCargoTransferReply = Readonly<{
  status: 'committed' | 'replayed';
  sessionId: string;
  requestId: string;
  cycle: number;
  hostShipId: string;
  resourceId: BaseCapybaraCargoType;
  direction: 'load' | 'unload';
  amount: number;
  cargoRevision: number;
}>;

const ROLE_ID = 'capybara-small-captain' as const;
const SMALL_SHIP_ID = 'capybara-small' as const;
const REQUEST_ID_PATTERN = /^[\w-]{1,128}$/;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireUid(auth: { uid?: string } | undefined): string {
  if (typeof auth?.uid !== 'string' || auth.uid.length === 0) {
    throw new HttpsError('unauthenticated', 'Sign in before transferring Capybara cargo.');
  }
  return auth.uid;
}

function parseCommand(value: unknown): BaseCapybaraCargoTransferCommand {
  const allowed = new Set([
    'sessionId', 'requestId', 'expectedCycle', 'expectedRevision',
    'expectedHostShipId', 'expectedDockingRevision', 'resourceId', 'direction', 'amount',
  ]);
  if (!isRecord(value) || Object.keys(value).some((key) => !allowed.has(key)) ||
      typeof value.sessionId !== 'string' || !REQUEST_ID_PATTERN.test(value.sessionId) ||
      typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId) ||
      !Number.isSafeInteger(value.expectedCycle) || (value.expectedCycle as number) < 1 ||
      !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0 ||
      !Number.isSafeInteger(value.expectedDockingRevision) || (value.expectedDockingRevision as number) < 0 ||
      typeof value.expectedHostShipId !== 'string' || !isResourceShipId(value.expectedHostShipId) ||
      value.expectedHostShipId === 'capybara' ||
      typeof value.resourceId !== 'string' ||
      !BASE_CAPYBARA_CARGO_TYPES.includes(value.resourceId as BaseCapybaraCargoType) ||
      value.direction !== 'load' && value.direction !== 'unload' ||
      !Number.isSafeInteger(value.amount) || (value.amount as number) < 1) {
    throw new HttpsError('invalid-argument', 'Invalid base Capybara Cargo Transfer request.');
  }
  return value as unknown as BaseCapybaraCargoTransferCommand;
}

function isActivePlayer(player: DocumentSnapshot): boolean {
  if (!player.exists || player.get('role') !== 'player' || player.get('connected') !== true ||
      (player.get('kickedAt') !== undefined && player.get('kickedAt') !== null)) return false;
  const lastSeenAt = player.get('lastSeenAt');
  if (lastSeenAt === undefined) return true;
  return lastSeenAt instanceof Timestamp && !isPresenceStale(lastSeenAt.toDate(), new Date());
}

function failClosed(message: string): never {
  throw new HttpsError('failed-precondition', message);
}

function isTransferReply(value: unknown, sessionId: string): value is BaseCapybaraCargoTransferReply {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== [
    'amount', 'cargoRevision', 'cycle', 'direction', 'hostShipId', 'requestId',
    'resourceId', 'sessionId', 'status',
  ].sort().join(',') ||
      value.status !== 'committed' || value.sessionId !== sessionId ||
      typeof value.requestId !== 'string' || typeof value.hostShipId !== 'string' ||
      !isResourceShipId(value.hostShipId) || value.hostShipId === 'capybara' ||
      typeof value.resourceId !== 'string' ||
      !BASE_CAPYBARA_CARGO_TYPES.includes(value.resourceId as BaseCapybaraCargoType) ||
      (value.direction !== 'load' && value.direction !== 'unload') ||
      !Number.isSafeInteger(value.amount) || (value.amount as number) < 1 ||
      !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
      !Number.isSafeInteger(value.cargoRevision) || (value.cargoRevision as number) < 1) return false;
  return true;
}

function replayReply(
  receipt: DocumentSnapshot,
  fingerprint: CommandFingerprint,
  command: BaseCapybaraCargoTransferCommand,
): BaseCapybaraCargoTransferReply | null {
  if (!receipt.exists) return null;
  const disposition = commandReceiptDisposition(receipt.get('fingerprint'), fingerprint);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', 'This Capybara cargo request belongs to a different Captain.');
  }
  if (disposition.kind === 'collision') {
    throw new HttpsError('failed-precondition', 'This Capybara cargo request id is already bound to another command.');
  }
  const stored = receipt.get('result');
  if (!isTransferReply(stored, command.sessionId) ||
      stored.requestId !== command.requestId ||
      stored.cycle !== command.expectedCycle ||
      stored.hostShipId !== command.expectedHostShipId ||
      stored.resourceId !== command.resourceId ||
      stored.direction !== command.direction ||
      stored.amount !== command.amount ||
      command.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      stored.cargoRevision !== command.expectedRevision + 1) {
    throw new HttpsError('failed-precondition', 'This Capybara cargo receipt has no safe replay result.');
  }
  return { ...stored, status: 'replayed' };
}

function requireCaptainAuthority(
  player: DocumentSnapshot,
  players: readonly DocumentSnapshot[],
  uid: string,
): string {
  if (!isActivePlayer(player) || player.get('replacementRoleId') !== ROLE_ID ||
      player.get('activeConsoleRoleId') !== null ||
      (player.get('escapeState') !== undefined && player.get('escapeState') !== null)) {
    throw new HttpsError('permission-denied', 'Only the connected current base Capybara Captain may transfer cargo.');
  }
  const role = replacementRoleFor(ROLE_ID);
  if (!role || role.kind !== 'extra-ship' || role.vesselId !== SMALL_SHIP_ID || role.baseVesselOnly !== true) {
    failClosed('The base Capybara Captain role definition is unavailable.');
  }
  const roleHolders = players.filter((candidate) => candidate.get('replacementRoleId') === ROLE_ID);
  if (roleHolders.length !== 1 || roleHolders[0]?.id !== uid) {
    failClosed('The authoritative base Capybara Captain assignment is unavailable.');
  }
  return uid;
}

function requireBaseVesselMode(session: DocumentSnapshot): 'base-capybara' {
  const expansion = session.get('expansion');
  const capybaraEnabled = session.get('capybaraEnabled');
  if ((expansion !== 'base' && expansion !== 'capybara' && expansion !== 'none') ||
      typeof capybaraEnabled !== 'boolean') {
    failClosed('The authoritative Capybara vessel mode is unavailable.');
  }
  const mode = vesselModeForConfiguration({
    expansion: expansion as 'base' | 'capybara' | 'none',
    capybaraEnabled,
  });
  if (mode !== 'base-capybara') {
    failClosed('Cargo Transfer is available only for the enabled base Capybara.');
  }
  return mode;
}

/** Persist one source-authorized base Capybara transfer through the server transaction. */
export const transferBaseCapybaraCargo = onCall<{
  sessionId?: unknown;
  requestId?: unknown;
  expectedCycle?: unknown;
  expectedRevision?: unknown;
  expectedHostShipId?: unknown;
  expectedDockingRevision?: unknown;
  resourceId?: unknown;
  direction?: unknown;
  amount?: unknown;
}>(CALLABLE_RUNTIME_OPTIONS, async (request) => {
  const uid = requireUid(request.auth);
  const command = parseCommand(request.data);
  const fingerprint: CommandFingerprint = {
    action: 'transfer-base-capybara-cargo',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid: uid,
    instanceId: null,
    expectedRevision: command.expectedRevision,
    payload: {
      expectedCycle: command.expectedCycle,
      expectedHostShipId: command.expectedHostShipId,
      expectedDockingRevision: command.expectedDockingRevision,
      resourceId: command.resourceId,
      direction: command.direction,
      amount: command.amount,
    },
  };
  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${command.sessionId}`);
  const actorRef = db.doc(`sessions/${command.sessionId}/players/${uid}`);
  const playersRef = db.collection(`sessions/${command.sessionId}/players`);
  const receiptRef = db.doc(`sessions/${command.sessionId}/commandReceipts/${command.requestId}`);

  return db.runTransaction(async (tx) => {
    const [session, actor, playersSnapshot, receipt] = await Promise.all([
      tx.get(sessionRef), tx.get(actorRef), tx.get(playersRef), tx.get(receiptRef),
    ]);
    if (!session.exists) throw new HttpsError('not-found', 'No such session.');
    const activeRoleHolderUid = requireCaptainAuthority(actor, playersSnapshot.docs, uid);
    const replay = replayReply(receipt, fingerprint, command);
    if (replay) return replay;

    if (session.get('phase') !== 'active') {
      failClosed('Cargo Transfer is available only during active gameplay.');
    }
    const currentCycle = session.get('currentTurn');
    const turnPhase = session.get('turnPhase');
    if (!Number.isSafeInteger(currentCycle) || currentCycle !== command.expectedCycle ||
        !isRecord(turnPhase) || turnPhase.turn !== currentCycle) {
      failClosed('The Capybara cargo cycle changed. Refresh before transferring.');
    }
    const vesselMode = requireBaseVesselMode(session);
    const activeVesselIds = session.get('activeVesselIds');
    const isSmallShipAdmitted = Array.isArray(activeVesselIds) &&
      activeVesselIds.every((id) => typeof id === 'string') &&
      new Set(activeVesselIds).size === activeVesselIds.length &&
      replacementRoleAvailable(ROLE_ID, {
          activeVesselIds: activeVesselIds as string[],
          expansion: session.get('expansion') as string,
          smallShipStates: session.get('smallShipStates'),
          capybaraEnabled: session.get('capybaraEnabled'),
        });
    if (!isSmallShipAdmitted) {
      failClosed('The base Capybara has not been admitted by a valid server-owned docking state.');
    }

    const storedSmallShips = isRecord(session.get('smallShipStates'))
      ? session.get('smallShipStates') as RecordValue : undefined;
    const smallShipState = storedSmallShips?.[SMALL_SHIP_ID];
    const smallShipRecord = isRecord(smallShipState) ? smallShipState : undefined;
    if (!smallShipRecord || smallShipRecord.hostShipId !== command.expectedHostShipId ||
        smallShipRecord.dockingRevision !== command.expectedDockingRevision) {
      failClosed('The Capybara dock changed. Refresh before transferring.');
    }
    const storedResources = isRecord(session.get('shipResources'))
      ? session.get('shipResources') as RecordValue : undefined;
    const hostResources = storedResources?.[command.expectedHostShipId];
    const result = (() => {
      try {
        return resolveBaseCapybaraCargoTransfer({
          actorUid: uid,
          activeRoleHolderUid,
          actorRoleId: actor.get('replacementRoleId'),
          actorScope: 'player',
          currentCycle: currentCycle as number,
          turnPhase: session.get('turnPhase'),
          vesselMode,
          isSmallShipAdmitted,
          activeVesselIds,
          smallShipState,
          resourceId: command.resourceId,
          direction: command.direction,
          amount: command.amount,
          expectedRevision: command.expectedRevision,
          cargoState: session.get('baseCapybaraCargo'),
          hostResources,
        });
      } catch (cause) {
        throw new HttpsError(
          'failed-precondition',
          cause instanceof Error ? cause.message : 'Base Capybara Cargo Transfer was rejected.',
        );
      }
    })();

    if (result.hostShipId !== command.expectedHostShipId) {
      failClosed('The Capybara dock changed. Refresh before transferring.');
    }
    const reply: BaseCapybaraCargoTransferReply = {
      status: 'committed',
      sessionId: command.sessionId,
      requestId: command.requestId,
      cycle: currentCycle as number,
      hostShipId: result.hostShipId,
      resourceId: result.resourceId,
      direction: result.direction,
      amount: result.amount,
      cargoRevision: result.cargoState.revision,
    };
    tx.update(sessionRef, {
      baseCapybaraCargo: result.cargoState,
      [`shipResources.${result.hostShipId}`]: result.hostResources,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(receiptRef, {
      fingerprint,
      result: reply,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reply;
  });
});
