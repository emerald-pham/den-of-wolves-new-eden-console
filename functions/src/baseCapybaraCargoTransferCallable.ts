import { writeStandardActionAudit } from './actionAudit';
import { auditedOnCall } from './securityCallable';
import { requireCandidateVesselsAvailable } from './candidateAvailability';
import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, } from 'firebase-functions/v2/https';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { isPresenceStale } from './sessionLifecycle';
import {
  BASE_CAPYBARA_CARGO_TYPES,
  parseBaseCapybaraCargoState,
  resolveSmallShipCargoTransfer,
  type SmallShipCargoId,
  type BaseCapybaraCargoType,
} from './baseCapybaraCargoTransfer';
import { isResourceShipId } from './resources';
import { replacementRoleAvailable, replacementRoleFor } from './replacementRoles';
import { vesselModeForConfiguration, type SessionVesselMode } from './gameSetup';
import { turnPhaseDeadlinePassed, turnPhaseState } from './turnZero';
import { isSmallShipInMutiny, parseSmallShipState } from './smallShip';

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

type BaseCapybaraCargoTransferStaleReply = Readonly<{
  status: 'stale';
  sessionId: string;
  requestId: string;
  expectedCycle: number;
  currentCycle: number;
  expectedHostShipId: string;
  currentHostShipId: string;
  expectedDockingRevision: number;
  currentDockingRevision: number;
  resourceId: BaseCapybaraCargoType;
  direction: 'load' | 'unload';
  amount: number;
  expectedRevision: number;
  currentCargoRevision: number;
}>;

function createSmallShipCargoTransferCallable(SMALL_SHIP_ID: SmallShipCargoId) {
  const ROLE_ID = `${SMALL_SHIP_ID}-captain`;
  const craftName = SMALL_SHIP_ID === 'warrior' ? 'Warrior' : 'Capybara';
  const roleName = SMALL_SHIP_ID === 'warrior' ? 'Warrior' : 'base Capybara';
  const ledgerField = SMALL_SHIP_ID === 'warrior' ? 'warriorCargo' : 'baseCapybaraCargo';
  const callableName = SMALL_SHIP_ID === 'warrior' ? 'transferWarriorCargo' : 'transferBaseCapybaraCargo';
  const auditAction = SMALL_SHIP_ID === 'warrior' ? 'warrior-cargo' : 'base-capybara-cargo';
  const REQUEST_ID_PATTERN = /^[\w-]{1,128}$/;

  function isRecord(value: unknown): value is RecordValue {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function requireUid(auth: { uid?: string } | undefined): string {
    if (typeof auth?.uid !== 'string' || auth.uid.length === 0) {
      throw new HttpsError('unauthenticated', `Sign in before transferring ${craftName} cargo.`);
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
        (SMALL_SHIP_ID === 'capybara-small' && value.expectedHostShipId === 'capybara') ||
        typeof value.resourceId !== 'string' ||
        !BASE_CAPYBARA_CARGO_TYPES.includes(value.resourceId as BaseCapybaraCargoType) ||
        value.direction !== 'load' && value.direction !== 'unload' ||
        !Number.isSafeInteger(value.amount) || (value.amount as number) < 1) {
      throw new HttpsError('invalid-argument', `Invalid ${roleName} Cargo Transfer request.`);
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
        !isResourceShipId(value.hostShipId) || (SMALL_SHIP_ID === 'capybara-small' && value.hostShipId === 'capybara') ||
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
      throw new HttpsError('permission-denied', `This ${craftName} cargo request belongs to a different Captain.`);
    }
    if (disposition.kind === 'collision') {
      throw new HttpsError('failed-precondition', `This ${craftName} cargo request id is already bound to another command.`);
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
      throw new HttpsError('failed-precondition', `This ${craftName} cargo receipt has no safe replay result.`);
    }
    return { ...stored, status: 'replayed' };
  }

  function requireCaptainAuthority(
    player: DocumentSnapshot,
    players: readonly DocumentSnapshot[],
    uid: string,
  ): string {
    if (!isActivePlayer(player) || player.get('replacementRoleId') !== ROLE_ID ||
        player.get('replacementStatus') != null ||
        player.get('activeConsoleRoleId') !== null ||
        player.get('seatId') !== null ||
        (player.get('escapeState') !== undefined && player.get('escapeState') !== null)) {
      throw new HttpsError('permission-denied', `Only the connected current ${roleName} Captain may transfer cargo.`);
    }
    const role = replacementRoleFor(ROLE_ID);
    if (!role || role.kind !== 'extra-ship' || role.vesselId !== SMALL_SHIP_ID || (SMALL_SHIP_ID === 'capybara-small' && role.baseVesselOnly !== true)) {
      failClosed(`The ${roleName} Captain role definition is unavailable.`);
    }
    const roleHolders = players.filter((candidate) => candidate.get('replacementRoleId') === ROLE_ID);
    if (roleHolders.length !== 1 || roleHolders[0]?.id !== uid) {
      failClosed(`The authoritative ${roleName} Captain assignment is unavailable.`);
    }
    return uid;
  }

  function requireCargoVesselMode(session: DocumentSnapshot): SessionVesselMode {
    const expansion = session.get('expansion');
    const capybaraEnabled = session.get('capybaraEnabled');
    if ((expansion !== 'base' && expansion !== 'capybara' && expansion !== 'none') ||
        typeof capybaraEnabled !== 'boolean') {
      failClosed(`The authoritative ${craftName} vessel mode is unavailable.`);
    }
    const mode = vesselModeForConfiguration({
      expansion: expansion as 'base' | 'capybara' | 'none',
      capybaraEnabled,
    });
    if (SMALL_SHIP_ID === 'capybara-small' && mode !== 'base-capybara') {
      failClosed(`Cargo Transfer is available only for the enabled ${roleName}.`);
    }
    return mode;
  }

  /** Persist one source-authorized base Capybara transfer through the server transaction. */
  return auditedOnCall<{
    sessionId?: unknown;
    requestId?: unknown;
    expectedCycle?: unknown;
    expectedRevision?: unknown;
    expectedHostShipId?: unknown;
    expectedDockingRevision?: unknown;
    resourceId?: unknown;
    direction?: unknown;
    amount?: unknown;
  }>(callableName, CALLABLE_RUNTIME_OPTIONS, async (request) => {
    const uid = requireUid(request.auth);
    const command = parseCommand(request.data);
    const fingerprint: CommandFingerprint = {
      action: `transfer-${auditAction}`,
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
      requireCandidateVesselsAvailable(session, [SMALL_SHIP_ID, command.expectedHostShipId]);

      if (session.get('phase') !== 'active') {
        failClosed('Cargo Transfer is available only during active gameplay.');
      }
      const currentCycle = session.get('currentTurn');
      const turnPhase = turnPhaseState(session.get('turnPhase'));
      const currentTime = Date.now();
      if (!Number.isSafeInteger(currentCycle) || currentCycle !== command.expectedCycle ||
          !turnPhase || turnPhase.turn !== currentCycle || turnPhase.airspace.state !== 'lifted' ||
          turnPhase.timerPause !== undefined ||
          turnPhaseDeadlinePassed(turnPhase, 'open', currentTime)) {
        failClosed(`${roleName} Cargo Transfer requires the current live Coordination cycle.`);
      }
      const vesselMode = requireCargoVesselMode(session);
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
        failClosed(`The ${roleName} has not been admitted by a valid server-owned docking state.`);
      }

      const storedSmallShips = isRecord(session.get('smallShipStates'))
        ? session.get('smallShipStates') as RecordValue : undefined;
      const smallShipState = storedSmallShips?.[SMALL_SHIP_ID];
      const smallShipRecord = parseSmallShipState(smallShipState, SMALL_SHIP_ID);
      if (!smallShipRecord || smallShipRecord.hostShipId !== command.expectedHostShipId ||
          smallShipRecord.dockingRevision !== command.expectedDockingRevision) {
        failClosed(`The ${craftName} dock changed. Refresh before transferring.`);
      }
      if (isSmallShipInMutiny(smallShipRecord)) {
        failClosed(`${roleName} is in mutiny and cannot be used until a new captain is installed.`);
      }
      const storedResources = isRecord(session.get('shipResources'))
        ? session.get('shipResources') as RecordValue : undefined;
      const hostResources = storedResources?.[command.expectedHostShipId];
      const storedDamage = isRecord(session.get('shipDamage'))
        ? session.get('shipDamage') as RecordValue : undefined;
      const hostDamage = storedDamage?.[command.expectedHostShipId];
      if (!storedDamage || !Object.prototype.hasOwnProperty.call(storedDamage, command.expectedHostShipId)) {
        failClosed('The current docked-host damage authority is unavailable.');
      }
      const resolveTransfer = (expectedRevision: number) => {
        try {
          return resolveSmallShipCargoTransfer({
            actorUid: uid,
            activeRoleHolderUid,
            actorRoleId: actor.get('replacementRoleId'),
            actorScope: 'player',
            currentCycle: currentCycle as number,
            currentTime,
            turnPhase,
            vesselMode,
            isSmallShipAdmitted,
            activeVesselIds,
            smallShipState,
            resourceId: command.resourceId,
            direction: command.direction,
            amount: command.amount,
            expectedRevision,
            cargoState: session.get(ledgerField),
            hostResources,
            hostDamage,
          }, SMALL_SHIP_ID);
        } catch (cause) {
          throw new HttpsError(
            'failed-precondition',
            cause instanceof Error ? cause.message : `${roleName} Cargo Transfer was rejected.`,
          );
        }
      };

      const currentCargo = parseBaseCapybaraCargoState(session.get(ledgerField));
      if (currentCargo && currentCargo.revision > command.expectedRevision) {
        // Resolve against the authoritative revision to prove this exact transfer is
        // still eligible, but return before any session or receipt write.
        const eligible = resolveTransfer(currentCargo.revision);
        if (eligible.hostShipId !== command.expectedHostShipId) {
          failClosed(`The ${craftName} dock changed. Refresh before transferring.`);
        }
        const staleReply: BaseCapybaraCargoTransferStaleReply = {
          status: 'stale',
          sessionId: command.sessionId,
          requestId: command.requestId,
          expectedCycle: command.expectedCycle,
          currentCycle: currentCycle as number,
          expectedHostShipId: command.expectedHostShipId,
          currentHostShipId: smallShipRecord.hostShipId,
          expectedDockingRevision: command.expectedDockingRevision,
          currentDockingRevision: smallShipRecord.dockingRevision as number,
          resourceId: command.resourceId,
          direction: command.direction,
          amount: command.amount,
          expectedRevision: command.expectedRevision,
          currentCargoRevision: currentCargo.revision,
        };
        return staleReply;
      }

      const result = resolveTransfer(command.expectedRevision);

      if (result.hostShipId !== command.expectedHostShipId) {
        failClosed(`The ${craftName} dock changed. Refresh before transferring.`);
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
        [ledgerField]: result.cargoState,
        [`shipResources.${result.hostShipId}`]: result.hostResources,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeStandardActionAudit(tx, db, {
        sessionId: command.sessionId, actorUid: uid, actorRoleId: actor.get('replacementRoleId') ?? actor.get('assignedRoleId') ?? null, action: auditAction,
        phase: 'active', requestId: command.requestId, revision: result.cargoState.revision,
        outcome: 'committed', resolutionSource: 'server-calculated', createdAt: FieldValue.serverTimestamp(),
      }, {
        sourceId: auditAction, requiredChoices: [{ actor: 'player', kind: 'cargo', value: { direction: command.direction, resourceId: command.resourceId, amount: command.amount } }],
        calculation: { direction: result.direction, resourceId: result.resourceId, amount: result.amount },
        consequences: { hostShipId: result.hostShipId, hostResources: result.hostResources, cargoInventory: result.cargoState.inventory }, audience: { operational: 'actor' },
      });
      tx.set(receiptRef, {
        fingerprint,
        result: reply,
        createdAt: FieldValue.serverTimestamp(),
      });
      return reply;
    });
  });

}

export const transferBaseCapybaraCargo = createSmallShipCargoTransferCallable('capybara-small');
export const transferWarriorCargo = createSmallShipCargoTransferCallable('warrior');
