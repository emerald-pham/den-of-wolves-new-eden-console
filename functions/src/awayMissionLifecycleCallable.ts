import { randomInt } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  commandReceiptDisposition,
  type CommandFingerprint,
} from './commandIdempotency';
import {
  awayMissionHandId,
  missionDeckDealtCount,
  type AwayMissionParticipantSnapshot,
} from './awayMissionCards';
import {
  applyAwayMissionLifecycleCommand,
  createAwayMissionLifecycleBootstrap,
  markAwayMissionOverrun,
  projectAwayMissionPrivateState,
  projectAwayMissionPublicState,
  type AwayMissionLifecycleCommand,
  type AwayMissionLifecycleRecord,
  type AwayMissionParticipantCrafts,
  type AwayMissionPrivateState,
  type AwayMissionPublicState,
} from './awayMissionLifecycleAdapter';
import { missionCardForCode } from './missionCards';
import {
  missionCardsForState,
  missionDeck,
  parseMissionDeckState,
  type MissionCardId,
  type MissionDeckRandomIndex,
  type MissionDeckState,
} from './missionDeck';
import {
  type MissionLifecycleStateInput,
  type MissionBonusSourceInput,
} from './missionLifecycle';

type Data = Record<string, unknown>;
type LifecycleCommandType = AwayMissionLifecycleCommand['type'];

export interface AwayMissionLifecycleCallableRequest {
  readonly auth?: { readonly uid?: string } | null;
  readonly data?: unknown;
}

export interface AwayMissionLifecycleCallableSnapshot {
  readonly exists: boolean;
  readonly id?: string;
  get(field: string): unknown;
  data(): unknown;
}

export interface AwayMissionLifecycleCallableDatabase {
  doc(path: string): unknown;
  runTransaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T>;
}

export interface AwayMissionLifecycleCommandMarkerSnapshot {
  readonly exists: boolean;
  get(field: string): unknown;
}

export interface AwayMissionLifecycleCommandMarkerAdapter {
  /** Read the shared session commandReceipts marker in the same transaction. */
  readonly read: (
    transaction: unknown,
    sessionId: string,
    requestId: string,
  ) => Promise<AwayMissionLifecycleCommandMarkerSnapshot>;
  /** Atomically occupy the shared request-id namespace with its safe reply. */
  readonly create: (
    transaction: unknown,
    fingerprint: CommandFingerprint,
    result: AwayMissionLifecycleCallableReply,
  ) => void;
}

export interface AwayMissionLifecycleParticipantCraftContext {
  readonly transaction: unknown;
  readonly sessionId: string;
  readonly session: AwayMissionLifecycleCallableSnapshot;
  readonly mission: AwayMissionLifecycleCallableSnapshot;
  readonly missionId: string;
  readonly groupId: string;
  readonly participantSnapshots: readonly AwayMissionParticipantSnapshot[];
  readonly availableCarrierCraftIds: readonly string[];
  /** Captured by P403 alongside its immutable participant roster. */
  readonly participantCrafts?: readonly AwayMissionParticipantCrafts[];
}

export interface AwayMissionLifecycleGameContext {
  readonly currentCycle: number;
  readonly teamPhase: boolean;
  readonly legalDropOffShipIds: readonly string[];
  readonly bonusSources?: readonly MissionBonusSourceInput[];
}

export interface AwayMissionLifecycleAuthorityContext {
  readonly transaction: unknown;
  readonly sessionId: string;
  readonly missionId: string;
  readonly session: AwayMissionLifecycleCallableSnapshot;
  readonly mission: AwayMissionLifecycleCallableSnapshot;
  readonly record: AwayMissionLifecycleRecord;
  readonly commandType: LifecycleCommandType;
}

export interface AwayMissionLifecycleCallableDependencies {
  readonly db: AwayMissionLifecycleCallableDatabase;
  readonly commandMarkers: AwayMissionLifecycleCommandMarkerAdapter;
  readonly serverTimestamp: () => unknown;
  readonly isActivePlayer: (player: AwayMissionLifecycleCallableSnapshot) => boolean;
  /** Must verify the actor's current connected GM player and matching live instance. */
  readonly requireActiveGm: (
    transaction: unknown,
    sessionId: string,
    actorUid: string,
    instanceId: string,
  ) => Promise<void>;
  /** Bind mission bonus craft to the immutable P403 participant snapshot. */
  readonly deriveParticipantCrafts: (
    context: AwayMissionLifecycleParticipantCraftContext,
  ) => Promise<readonly AwayMissionParticipantCrafts[]>;
  /** Read current cycle, phase, permitted reward ships, and bonus sources from server state. */
  readonly deriveContext: (
    context: AwayMissionLifecycleAuthorityContext,
  ) => Promise<AwayMissionLifecycleGameContext>;
  /** Override only for deterministic tests; production defaults use crypto.randomInt. */
  readonly randomIndex?: MissionDeckRandomIndex;
  /** Override only for deterministic tests; production defaults use a private cryptographic d6. */
  readonly rollD6?: () => number;
}

export interface AwayMissionLifecycleCallableReply {
  readonly status: 'committed' | 'replayed' | 'stale';
  readonly sessionId: string;
  readonly missionId: string;
  readonly requestId: string;
  readonly revision: number;
  readonly expectedRevision?: number;
  readonly currentRevision?: number;
  readonly publicState: AwayMissionPublicState;
  /** Present only for the authenticated participant's own hand; GM replies receive null. */
  readonly privateState: AwayMissionPrivateState | null;
}

interface ParsedCallableCommand {
  readonly sessionId: string;
  readonly missionId: string;
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly instanceId?: string;
  readonly command: AwayMissionLifecycleCommand;
}

interface P403MissionContext {
  readonly missionId: string;
  readonly opportunityId: string;
  readonly startRequestId: string;
  readonly groupId: string;
  readonly chart: string;
  readonly coordinate: string;
  readonly siteCode: string;
  readonly sourceCycle: number;
  readonly missionLeaderUid: string;
  readonly missionLeaderRoleId: string;
  readonly participantSnapshots: readonly AwayMissionParticipantSnapshot[];
  readonly availableCarrierCraftIds: readonly string[];
  readonly participantCrafts?: readonly AwayMissionParticipantCrafts[];
  readonly handIds: readonly string[];
  readonly cardIds: readonly MissionCardId[];
  readonly dealtFrom: number;
  readonly dealtThrough: number;
  readonly discardedParticipantUids: readonly string[];
  readonly discardedCardIds: readonly MissionCardId[];
  readonly revision: number;
  readonly phase: string;
}

interface LoadedParticipantDocuments {
  readonly participant: AwayMissionParticipantSnapshot;
  readonly handId: string;
  readonly handRef: unknown;
  readonly hand: Data;
  readonly pointerRef: unknown;
  readonly pointer: Data;
}

interface CachedRandomIndex {
  readonly beginAttempt: () => void;
  readonly next: MissionDeckRandomIndex;
}

const COMMAND_FIELDS: Readonly<Record<LifecycleCommandType, readonly string[]>> = {
  requestExtraCards: ['count'],
  distributeExtraCard: ['participantUid', 'opportunityId'],
  openDiscards: [],
  discardCard: ['cardId'],
  reclamatorSalvage: ['opportunityId', 'choices'],
  assignCards: ['placements'],
  addFacilitatorCards: [],
  resolve: [],
  dropOff: ['shipId'],
};

const COMMAND_TYPES = Object.keys(COMMAND_FIELDS) as LifecycleCommandType[];
const GM_COMMANDS = new Set<LifecycleCommandType>(['openDiscards', 'addFacilitatorCards', 'resolve']);
const LEADER_COMMANDS = new Set<LifecycleCommandType>(['distributeExtraCard', 'dropOff']);
const PARTICIPANT_COMMANDS = new Set<LifecycleCommandType>([
  'requestExtraCards', 'discardCard', 'reclamatorSalvage', 'assignCards',
]);
const INITIAL_P403_PHASES = new Set<string>(['awaiting-card-selection', 'discarding', 'assignment-ready']);
const LIFECYCLE_PHASES = new Set<string>([
  'awaiting-card-selection', 'discarding', 'assignment-ready', 'assigning',
  'assignments-complete', 'facilitator-cards-added', 'resolved', 'complete',
]);
const CANONICAL_MISSION_CARD_IDS = new Set<string>(missionDeck().map(({ id }) => id));

/**
 * A single handler handles every post-P403 lifecycle command. P403 remains the
 * only mission-start path; this factory first verifies its immutable receipt,
 * original deck slice, private hands, and member-safe pointers. The full
 * lifecycle record stays on the server-only mission instance. Member-readable
 * pointers receive only the existing public projector, and each private hand
 * receives only its own private projector.
 */
export function createAwayMissionLifecycleCallables(
  dependencies: AwayMissionLifecycleCallableDependencies,
) {
  const randomSource = dependencies.randomIndex ?? ((upperBound: number) => randomInt(upperBound));
  const rollD6 = dependencies.rollD6 ?? (() => randomInt(1, 7));

  return {
    commitAwayMissionLifecycleCommand: async (
      request: AwayMissionLifecycleCallableRequest,
    ): Promise<AwayMissionLifecycleCallableReply> => {
      const parsed = parseCallableCommand(request.data);
      const actorUid = requireActorUid(request.auth);
      const random = createCachedRandomIndex(randomSource);
      const d6Rolls = new Map<string, number>();
      const p = missionPaths(parsed.sessionId, parsed.missionId, parsed.requestId, actorUid);
      const commandFingerprint = lifecycleCommandFingerprint(parsed, actorUid);

      return dependencies.db.runTransaction(async (rawTransaction) => {
        random.beginAttempt();
        const transaction = rawTransaction as LifecycleTransaction;
        const playerSnapshot = await transaction.get(dependencies.db.doc(p.player));
        const isActiveGm = GM_COMMANDS.has(parsed.command.type);
        if (isActiveGm) {
          const instanceId = parsed.instanceId;
          if (!instanceId) fail('invalid-argument', 'An active facilitator instance is required.');
          await dependencies.requireActiveGm(rawTransaction, parsed.sessionId, actorUid, instanceId);
        } else if (!dependencies.isActivePlayer(playerSnapshot)) {
          fail('permission-denied', 'An active session player is required for this away-mission command.');
        }

        const [sessionSnapshot, missionSnapshot, deckSnapshot, eventSnapshot, markerSnapshot] = await Promise.all([
          transaction.get(dependencies.db.doc(p.session)),
          transaction.get(dependencies.db.doc(p.mission)),
          transaction.get(dependencies.db.doc(p.deck)),
          transaction.get(dependencies.db.doc(p.event)),
          dependencies.commandMarkers.read(rawTransaction, parsed.sessionId, parsed.requestId),
        ]);
        if (!sessionSnapshot.exists) fail('not-found', 'No such session.');
        const markerDisposition = markerSnapshot.exists
          ? commandReceiptDisposition(markerSnapshot.get('fingerprint'), commandFingerprint)
          : null;
        if (markerDisposition?.kind === 'foreign-actor') {
          fail('permission-denied', 'This away-mission request belongs to a different actor.');
        }
        if (markerDisposition?.kind === 'collision') {
          fail('failed-precondition', 'This away-mission request id is bound to another command.');
        }
        if (!missionSnapshot.exists) fail('failed-precondition', 'The P403 away-mission start is unavailable.');
        const sessionData = requireSnapshotData(sessionSnapshot, 'The session state is malformed.');
        const missionData = requireSnapshotData(missionSnapshot, 'The away-mission state is malformed.');
        const p403 = parseP403MissionContext(missionData, parsed.missionId);
        const deckData = requireSnapshotData(deckSnapshot, 'The shared away-mission deck is missing.');
        const deckState = parseMissionDeckState(deckData);
        const deckCount = deckState ? missionDeckDealtCount(deckData, deckState.order.length) : null;
        if (!deckState || deckCount === null) {
          fail('failed-precondition', 'The shared away-mission deck is malformed.');
        }
        if (p403.dealtThrough > deckCount) {
          fail('failed-precondition', 'The P403 mission deal is ahead of the shared deck cursor.');
        }
        validateP403DeckSlice(p403, deckState);

        const startRef = dependencies.db.doc(`sessions/${parsed.sessionId}/missionStartSnapshots/${p403.opportunityId}`);
        const participants = p403.participantSnapshots.map((participant, index) => ({
          participant,
          handId: p403.handIds[index]!,
          handRef: dependencies.db.doc(`sessions/${parsed.sessionId}/awayMissionHands/${p403.handIds[index]!}`),
          pointerRef: dependencies.db.doc(`sessions/${parsed.sessionId}/awayMissionHandPointers/${p403.handIds[index]!}`),
        }));
        const originRefs = [
          startRef,
          ...participants.map(({ handRef }) => handRef),
          ...participants.map(({ pointerRef }) => pointerRef),
        ];
        const originSnapshots = await Promise.all(originRefs.map((ref) => transaction.get(ref)));
        const startSnapshot = originSnapshots[0]!;
        if (!startSnapshot.exists) fail('failed-precondition', 'The immutable P403 mission-start receipt is missing.');
        const startData = requireSnapshotData(startSnapshot, 'The immutable P403 mission-start receipt is malformed.');
        validateStartSnapshot(startData, p403, parsed.sessionId);

        const cardsById = new Map(missionCardsForState(deckState).map((card) => [card.id, card]));
        const handSnapshots = originSnapshots.slice(1, participants.length + 1);
        const pointerSnapshots = originSnapshots.slice(participants.length + 1);
        const loadedParticipants: LoadedParticipantDocuments[] = participants.map((entry, index) => {
          const handSnapshot = handSnapshots[index]!;
          const pointerSnapshot = pointerSnapshots[index]!;
          if (!handSnapshot.exists || !pointerSnapshot.exists) {
            fail('failed-precondition', 'A P403 participant hand or pointer is missing.');
          }
          const hand = requireSnapshotData(handSnapshot, 'A P403 participant hand is malformed.');
          const pointer = requireSnapshotData(pointerSnapshot, 'A P403 participant pointer is malformed.');
          const expectedCard = cardsById.get(p403.cardIds[index]!);
          if (!expectedCard || hand.type !== 'away-mission-hand' || hand.sessionId !== parsed.sessionId ||
              hand.missionId !== parsed.missionId || hand.handId !== entry.handId ||
              hand.participantUid !== entry.participant.uid || hand.cardId !== expectedCard.id ||
              hand.rank !== expectedCard.rank || hand.suit !== expectedCard.suit || hand.value !== expectedCard.value ||
              (hand.discarded !== undefined && typeof hand.discarded !== 'boolean')) {
            fail('failed-precondition', 'A P403 participant hand no longer matches its mission-start deal.');
          }
          validatePointerIdentity(pointer, p403, entry.participant, entry.handId, parsed.sessionId);
          return { ...entry, hand, pointer };
        });

        const hasLifecycleRecord = Object.hasOwn(missionData, 'lifecycleRecord');
        let record: AwayMissionLifecycleRecord;
        if (hasLifecycleRecord) {
          record = requireStoredLifecycleRecord(
            missionData.lifecycleRecord,
            missionData,
            parsed.sessionId,
            p403,
            deckState,
            deckCount,
            loadedParticipants,
          );
        } else {
          if (eventSnapshot.exists) {
            fail('failed-precondition', 'This request already has an event but no lifecycle replay receipt.');
          }
          if (missionData.status !== undefined || missionData.overrun !== undefined) {
            fail('failed-precondition', 'The legacy P403 mission has orphan lifecycle status fields.');
          }
          if (!INITIAL_P403_PHASES.has(p403.phase)) {
            fail('failed-precondition', 'The legacy P403 mission phase cannot initialize the lifecycle safely.');
          }
          record = await bootstrapLifecycleRecord(
            dependencies,
            rawTransaction,
            sessionSnapshot,
            missionSnapshot,
            p403,
            deckState,
            deckCount,
            loadedParticipants,
            parsed.sessionId,
          );
        }

        const priorReceipt = record.commandReceipts.find(({ requestId }) => requestId === parsed.requestId);
        if (priorReceipt) {
          if (!markerSnapshot.exists || markerDisposition?.kind !== 'replay') {
            fail('failed-precondition', 'The committed away-mission request is missing its shared command receipt.');
          }
          const storedReply = validateStoredCommandReply(markerSnapshot.get('result'), parsed, actorUid, 'committed');
          if (!eventSnapshot.exists) {
            fail('failed-precondition', 'The committed away-mission request is missing its atomic event receipt.');
          }
          const eventData = requireSnapshotData(eventSnapshot, 'The committed away-mission event receipt is malformed.');
          validateLifecycleEvent(
            eventData,
            parsed,
            record,
            priorReceipt,
          );
          if (storedReply.revision !== eventData.revision) {
            fail('failed-precondition', 'The shared command result does not match the committed mission event.');
          }
          if (priorReceipt.actorUid !== actorUid) {
            fail('permission-denied', 'This away-mission request belongs to another participant.');
          }
          const replay = applyAwayMissionLifecycleCommand(record, parsed.command, {
            actorUid,
            isActiveGm,
            teamPhase: false,
            currentCycle: record.sourceCycle,
            legalDropOffShipIds: [],
          });
          if (replay.status !== 'replayed') {
            fail('failed-precondition', 'This request identifier was already used with different command inputs.');
          }
          return buildReply(replay.record ?? record, 'replayed', parsed, actorUid);
        }
        if (eventSnapshot.exists) {
          fail('failed-precondition', 'This request identifier already has an event receipt.');
        }
        if (markerSnapshot.exists) {
          const markerResult = markerSnapshot.get('result');
          if (!markerDisposition || markerDisposition.kind !== 'replay') {
            fail('failed-precondition', 'This away-mission request has no matching shared command receipt.');
          }
          if (!isRecord(markerResult) || markerResult.status !== 'stale') {
            fail('failed-precondition', 'The shared away-mission request marker has no lifecycle receipt.');
          }
          validateStoredCommandReply(markerResult, parsed, actorUid, 'stale');
          authorizeMissionActor(record, parsed.command.type, actorUid);
          if (parsed.expectedRevision >= record.revision) {
            fail('failed-precondition', 'The stored stale away-mission request no longer conflicts with mission state.');
          }
          return buildStaleReply(record, parsed, actorUid);
        }

        authorizeMissionActor(record, parsed.command.type, actorUid);
        if (sessionData.phase !== 'active') {
          fail('failed-precondition', 'Away-mission lifecycle commands require an active game.');
        }
        if (record.status === 'complete') {
          fail('failed-precondition', 'This away mission is already complete.');
        }
        if (parsed.expectedRevision !== record.revision) {
          const staleReply = buildStaleReply(record, parsed, actorUid);
          dependencies.commandMarkers.create(rawTransaction, commandFingerprint, staleReply);
          return staleReply;
        }

        const context = await dependencies.deriveContext({
          transaction: rawTransaction,
          sessionId: parsed.sessionId,
          missionId: parsed.missionId,
          session: sessionSnapshot,
          mission: missionSnapshot,
          record,
          commandType: parsed.command.type,
        });
        validateGameContext(context, record.sourceCycle);

        let recordForCommand = rebasePreResolutionDeckCursor(record, deckCount);
        recordForCommand = markAwayMissionOverrun(
          recordForCommand,
          context.teamPhase || context.currentCycle > recordForCommand.sourceCycle,
        );
        const authority = {
          actorUid,
          isActiveGm,
          teamPhase: context.teamPhase,
          currentCycle: context.currentCycle,
          legalDropOffShipIds: context.legalDropOffShipIds,
          ...(context.bonusSources === undefined ? {} : { bonusSources: context.bonusSources }),
          ...(parsed.command.type === 'addFacilitatorCards' ? { randomIndex: random.next } : {}),
          ...(parsed.command.type === 'resolve'
            ? { secretD6Rolls: createRequiredD6Rolls(recordForCommand, rollD6, d6Rolls) }
            : {}),
        };
        const result = applyAwayMissionLifecycleCommand(recordForCommand, parsed.command, authority);
        if (result.status !== 'committed' || !result.record) {
          fail('failed-precondition', 'The away-mission command is not valid for its current state.');
        }

        // The last participant submission owns one atomic command. The server
        // performs the printed draw and arithmetic before publishing that result;
        // its internal transitions neither reserve client request IDs nor expose rolls.
        let nextRecord = result.record;
        if (nextRecord.lifecycle.phase === 'assignments-complete' && nextRecord.status === 'active') {
          const systemAuthority = { ...authority, isActiveGm: true, randomIndex: random.next };
          const dealt = applyAwayMissionLifecycleCommand(nextRecord, {
            type: 'addFacilitatorCards', requestId: `${parsed.requestId}:server-deal`,
            expectedRevision: nextRecord.revision,
          }, systemAuthority);
          if (dealt.status !== 'committed' || !dealt.record) {
            fail('failed-precondition', 'The automatic mission-card draw could not be completed.');
          }
          const resolved = applyAwayMissionLifecycleCommand(dealt.record, {
            type: 'resolve', requestId: `${parsed.requestId}:server-resolution`,
            expectedRevision: dealt.record.revision,
          }, {
            ...systemAuthority,
            secretD6Rolls: createRequiredD6Rolls(dealt.record, rollD6, d6Rolls),
          });
          if (resolved.status !== 'committed' || !resolved.record) {
            fail('failed-precondition', 'The automatic mission outcome could not be completed.');
          }
          nextRecord = {
            ...resolved.record,
            revision: result.record.revision,
            commandReceipts: result.record.commandReceipts,
          };
        }
        const publicProjections = projectPublicProjections(nextRecord);
        const privateProjections = projectPrivateProjections(nextRecord);
        if (!publicProjections || !privateProjections) {
          fail('failed-precondition', 'The away-mission projection could not be validated.');
        }
        const nextDeckCount = Math.max(deckCount, nextRecord.lifecycle.dealtCount);
        if (nextDeckCount > deckState.order.length) {
          fail('failed-precondition', 'The away-mission command exhausted the shared deck.');
        }

        const updatedAt = dependencies.serverTimestamp();
        transaction.update(dependencies.db.doc(p.mission), {
          phase: nextRecord.lifecycle.phase,
          revision: nextRecord.revision,
          status: nextRecord.status,
          overrun: nextRecord.overrun,
          discardedParticipantUids: [...nextRecord.lifecycle.discardedParticipantUids],
          discardedCardIds: [...nextRecord.lifecycle.discardedCardIds],
          lifecycleRecord: nextRecord,
          updatedAt,
        });
        if (nextDeckCount !== deckCount) {
          transaction.update(dependencies.db.doc(p.deck), { dealtCount: nextDeckCount, updatedAt });
        }
        loadedParticipants.forEach(({ participant, handRef, pointerRef }) => {
          const privateState = privateProjections.get(participant.uid)!;
          const publicState = publicProjections.get(participant.uid)!;
          const initialCard = privateState.cards.find(({ id }) => id === p403.cardIds[
            p403.participantSnapshots.findIndex(({ uid }) => uid === participant.uid)
          ]);
          transaction.update(handRef, {
            discarded: initialCard?.status === 'discarded',
            revision: privateState.revision,
            phase: privateState.phase,
            lifecyclePrivateState: privateState,
            updatedAt,
          });
          transaction.update(pointerRef, {
            phase: publicState.phase,
            revision: publicState.revision,
            discarded: privateState.cards.some(({ status }) => status === 'discarded'),
            lifecyclePublicState: publicState,
            updatedAt,
          });
        });
        transaction.create(dependencies.db.doc(p.event), {
          type: 'away-mission-lifecycle-command',
          sessionId: parsed.sessionId,
          missionId: parsed.missionId,
          requestId: parsed.requestId,
          commandType: parsed.command.type,
          revision: nextRecord.revision,
          createdAt: updatedAt,
        });
        const reply = buildReply(nextRecord, 'committed', parsed, actorUid);
        dependencies.commandMarkers.create(rawTransaction, commandFingerprint, reply);
        return reply;
      });
    },
  };
}

type LifecycleTransaction = {
  get(reference: unknown): Promise<AwayMissionLifecycleCallableSnapshot>;
  set(reference: unknown, data: Data): void;
  create(reference: unknown, data: Data): void;
  update(reference: unknown, data: Data): void;
};

function parseCallableCommand(value: unknown): ParsedCallableCommand {
  if (!isRecord(value) || typeof value.type !== 'string' ||
      !COMMAND_TYPES.includes(value.type as LifecycleCommandType)) {
    fail('invalid-argument', 'Invalid away-mission lifecycle command.');
  }
  const type = value.type as LifecycleCommandType;
  const expectedKeys = new Set([
    'sessionId', 'missionId', 'requestId', 'expectedRevision', ...COMMAND_FIELDS[type],
    ...(Object.hasOwn(value, 'instanceId') ? ['instanceId'] : []),
    'type',
  ]);
  if (Object.keys(value).some((key) => !expectedKeys.has(key))) {
    fail('invalid-argument', 'Away-mission command contains unsupported fields.');
  }
  const sessionId = safePathSegment(value.sessionId);
  const missionId = safePathSegment(value.missionId);
  const requestId = safePathSegment(value.requestId);
  const expectedRevision = value.expectedRevision;
  if (!sessionId || !missionId || !requestId || !Number.isSafeInteger(expectedRevision) ||
      (expectedRevision as number) < 0) {
    fail('invalid-argument', 'Invalid away-mission lifecycle command identity or revision.');
  }
  const instanceId = Object.hasOwn(value, 'instanceId')
    ? safePathSegment(value.instanceId) ?? undefined
    : undefined;
  if (Object.hasOwn(value, 'instanceId') && !instanceId) {
    fail('invalid-argument', 'Invalid facilitator instance identifier.');
  }
  if (Object.hasOwn(value, 'instanceId') && !GM_COMMANDS.has(type)) {
    fail('invalid-argument', 'A facilitator instance is only valid for facilitator commands.');
  }
  if (GM_COMMANDS.has(type) && !instanceId) {
    fail('invalid-argument', 'A facilitator instance identifier is required.');
  }

  let command: AwayMissionLifecycleCommand;
  switch (type) {
    case 'requestExtraCards':
      if (!Number.isSafeInteger(value.count) || (value.count as number) < 1) {
        fail('invalid-argument', 'Invalid extra-card request count.');
      }
      command = { type, requestId, expectedRevision: expectedRevision as number, count: value.count as number };
      break;
    case 'distributeExtraCard':
      if (!safePathSegment(value.participantUid) || !safePathSegment(value.opportunityId)) {
        fail('invalid-argument', 'Invalid extra-card distribution target.');
      }
      command = {
        type, requestId, expectedRevision: expectedRevision as number,
        participantUid: value.participantUid as string,
        opportunityId: value.opportunityId as string,
      };
      break;
    case 'openDiscards':
    case 'addFacilitatorCards':
    case 'resolve':
      command = { type, requestId, expectedRevision: expectedRevision as number };
      break;
    case 'discardCard':
      if (typeof value.cardId !== 'string' || value.cardId.length === 0 || value.cardId.length > 16) {
        fail('invalid-argument', 'Invalid mission card identifier.');
      }
      command = {
        type, requestId, expectedRevision: expectedRevision as number,
        cardId: value.cardId as MissionCardId,
      };
      break;
    case 'reclamatorSalvage':
      if (!safePathSegment(value.opportunityId) || !Array.isArray(value.choices) ||
          value.choices.some((choice) => !isRecord(choice) || !hasExactKeys(choice, ['cardId', 'resource']) ||
            typeof choice.cardId !== 'string' || !['food', 'water', 'materials'].includes(String(choice.resource)))) {
        fail('invalid-argument', 'Invalid Warrior Reclamator choices.');
      }
      command = {
        type, requestId, expectedRevision: expectedRevision as number,
        opportunityId: value.opportunityId as string,
        choices: value.choices as readonly Readonly<{
          cardId: MissionCardId;
          resource: 'food' | 'water' | 'materials';
        }>[],
      };
      break;
    case 'assignCards':
      if (!Array.isArray(value.placements) ||
          value.placements.some((placement) => !isRecord(placement) ||
            !hasExactKeys(placement, ['cardId', 'opportunityId']) ||
            typeof placement.cardId !== 'string' || !safePathSegment(placement.opportunityId))) {
        fail('invalid-argument', 'Invalid mission-card assignments.');
      }
      command = {
        type, requestId, expectedRevision: expectedRevision as number,
        placements: value.placements as readonly Readonly<{ cardId: MissionCardId; opportunityId: string }>[],
      };
      break;
    case 'dropOff':
      if (!safePathSegment(value.shipId)) fail('invalid-argument', 'Invalid mission reward drop-off ship.');
      command = { type, requestId, expectedRevision: expectedRevision as number, shipId: value.shipId as string };
      break;
  }
  return {
    sessionId,
    missionId,
    requestId,
    expectedRevision: expectedRevision as number,
    ...(instanceId === undefined ? {} : { instanceId }),
    command,
  };
}

function parseP403MissionContext(value: Data, requestedMissionId: string): P403MissionContext {
  const participantSnapshots = parseParticipantSnapshots(value.participantSnapshots);
  const groupId = safePathSegment(value.groupId);
  const opportunityId = safePathSegment(value.opportunityId);
  const startRequestId = safePathSegment(value.requestId);
  const missionId = safePathSegment(value.missionId);
  const chart = value.chart;
  const coordinate = value.coordinate;
  const siteCode = value.siteCode;
  const sourceCycle = value.sourceCycle;
  const missionLeaderUid = safePathSegment(value.missionLeaderUid);
  const missionLeaderRoleId = safePathSegment(value.missionLeaderRoleId);
  const availableCarrierCraftIds = uniqueStringArray(value.availableCarrierCraftIds);
  const participantCrafts = Object.hasOwn(value, 'participantCrafts')
    ? parseParticipantCraftBindings(value.participantCrafts, participantSnapshots ?? [])
    : undefined;
  const handIds = stringArray(value.handIds);
  const cardIds = stringArray(value.cardIds) as readonly MissionCardId[] | null;
  const discardedParticipantUids = uniqueStringArray(value.discardedParticipantUids);
  const discardedCardIds = uniqueStringArray(value.discardedCardIds) as readonly MissionCardId[] | null;
  const dealtFrom = value.dealtFrom;
  const dealtThrough = value.dealtThrough;
  const revision = value.revision;
  const phase = value.phase;
  const definition = typeof siteCode === 'string' ? missionCardForCode(siteCode) : undefined;
  const leader = participantSnapshots?.find(({ uid }) => uid === missionLeaderUid);
  if (value.schemaVersion !== 1 || !participantSnapshots || participantSnapshots.length === 0 ||
      !groupId || !opportunityId || !startRequestId || missionId !== requestedMissionId ||
      missionId !== `mission-${opportunityId}` ||
      (chart !== 'A' && chart !== 'B' && chart !== 'C') ||
      typeof coordinate !== 'string' || !/^\d{4}$/.test(coordinate) ||
      typeof siteCode !== 'string' || !definition ||
      !Number.isSafeInteger(sourceCycle) || (sourceCycle as number) < 1 ||
      !missionLeaderUid || !missionLeaderRoleId || !leader || leader.roleId !== missionLeaderRoleId ||
      !availableCarrierCraftIds || availableCarrierCraftIds.length === 0 ||
      (Object.hasOwn(value, 'participantCrafts') && participantCrafts === null) ||
      !handIds || !cardIds || handIds.length !== participantSnapshots.length ||
      cardIds.length !== participantSnapshots.length ||
      !discardedParticipantUids || !discardedCardIds ||
      !Number.isSafeInteger(dealtFrom) || (dealtFrom as number) < 0 ||
      !Number.isSafeInteger(dealtThrough) || (dealtThrough as number) <= (dealtFrom as number) ||
      (dealtThrough as number) - (dealtFrom as number) !== participantSnapshots.length ||
      !Number.isSafeInteger(revision) || (revision as number) < 0 ||
      typeof phase !== 'string' || !LIFECYCLE_PHASES.has(phase)) {
    fail('failed-precondition', 'The P403 away-mission record is malformed.');
  }
  if (handIds.some((handId, index) => handId !== awayMissionHandId(missionId, participantSnapshots[index]!.uid))) {
    fail('failed-precondition', 'The P403 hand roster does not match its participant snapshot.');
  }
  if (new Set(cardIds).size !== cardIds.length ||
      cardIds.some((cardId) => !CANONICAL_MISSION_CARD_IDS.has(cardId)) ||
      discardedCardIds.some((cardId) => !CANONICAL_MISSION_CARD_IDS.has(cardId)) ||
      discardedParticipantUids.some((uid) => !participantSnapshots.some((participant) => participant.uid === uid))) {
    fail('failed-precondition', 'The P403 initial card ledger is malformed.');
  }
  return {
    missionId,
    opportunityId,
    startRequestId,
    groupId,
    chart,
    coordinate,
    siteCode,
    sourceCycle: sourceCycle as number,
    missionLeaderUid,
    missionLeaderRoleId,
    participantSnapshots,
    availableCarrierCraftIds,
    ...(participantCrafts == null ? {} : { participantCrafts }),
    handIds,
    cardIds,
    dealtFrom: dealtFrom as number,
    dealtThrough: dealtThrough as number,
    discardedParticipantUids,
    discardedCardIds,
    revision: revision as number,
    phase,
  };
}

async function bootstrapLifecycleRecord(
  dependencies: AwayMissionLifecycleCallableDependencies,
  transaction: unknown,
  session: AwayMissionLifecycleCallableSnapshot,
  mission: AwayMissionLifecycleCallableSnapshot,
  p403: P403MissionContext,
  deckState: MissionDeckState,
  deckCount: number,
  participants: readonly LoadedParticipantDocuments[],
  sessionId: string,
): Promise<AwayMissionLifecycleRecord> {
  if (!INITIAL_P403_PHASES.has(p403.phase)) {
    fail('failed-precondition', 'The legacy P403 mission phase cannot initialize the lifecycle safely.');
  }
  const cardsById = new Map(missionCardsForState(deckState).map((card) => [card.id, card]));
  const orderedP403Cards = deckState.order.slice(p403.dealtFrom, p403.dealtThrough);
  if (orderedP403Cards.length !== p403.cardIds.length ||
      p403.cardIds.some((cardId, index) => orderedP403Cards[index] !== cardId)) {
    fail('failed-precondition', 'The P403 initial cards do not match the shared deck order.');
  }
  const initialCards = participants.map(({ participant, hand }) => ({
    participantUid: participant.uid,
    cardId: hand.cardId as MissionCardId,
  }));
  if (initialCards.some((card, index) => card.cardId !== p403.cardIds[index] || !cardsById.has(card.cardId))) {
    fail('failed-precondition', 'The P403 participant hands do not match the original deck deal.');
  }
  validateLegacyDiscardProjections(p403, participants);

  const lifecycleInput = {
    missionId: p403.missionId,
    siteCode: p403.siteCode as MissionLifecycleStateInput['siteCode'],
    leaderUid: p403.missionLeaderUid,
    participants: p403.participantSnapshots,
    availableCarrierCraftIds: p403.availableCarrierCraftIds,
    deckState,
    dealtCount: deckCount,
    initialCards,
    phase: p403.phase as 'awaiting-card-selection' | 'discarding' | 'assignment-ready',
    discardedParticipantUids: p403.discardedParticipantUids,
    discardedCardIds: p403.discardedCardIds,
  };
  const participantCrafts = await dependencies.deriveParticipantCrafts({
    transaction,
    sessionId,
    session,
    mission,
    missionId: p403.missionId,
    groupId: p403.groupId,
    participantSnapshots: p403.participantSnapshots,
    availableCarrierCraftIds: p403.availableCarrierCraftIds,
    ...(p403.participantCrafts === undefined ? {} : { participantCrafts: p403.participantCrafts }),
  });
  const bootstrap = createAwayMissionLifecycleBootstrap({
    sessionId,
    groupId: p403.groupId,
    sourceCycle: p403.sourceCycle,
    lifecycle: lifecycleInput,
    revision: p403.revision,
    participantCrafts,
  });
  if (!bootstrap) fail('failed-precondition', 'The server-derived participant craft snapshot is malformed.');
  return bootstrap.record;
}

function requireStoredLifecycleRecord(
  value: unknown,
  missionData: Data,
  sessionId: string,
  p403: P403MissionContext,
  deckState: MissionDeckState,
  deckCount: number,
  participants: readonly LoadedParticipantDocuments[],
): AwayMissionLifecycleRecord {
  if (!isRecord(value)) fail('failed-precondition', 'The stored away-mission lifecycle record is malformed.');
  const record = value as unknown as AwayMissionLifecycleRecord;
  let valid = false;
  try {
    valid = projectAwayMissionPublicState(record) !== null &&
      participants.every(({ participant }) => projectAwayMissionPrivateState(record, participant.uid) !== null);
  } catch {
    valid = false;
  }
  if (!valid || record.sessionId !== sessionId ||
      record.lifecycle.missionId !== p403.missionId || record.groupId !== p403.groupId ||
      record.sourceCycle !== p403.sourceCycle || record.revision !== p403.revision ||
      record.lifecycle.phase !== p403.phase || record.lifecycle.leaderUid !== p403.missionLeaderUid ||
      record.lifecycle.siteCode !== p403.siteCode ||
      record.lifecycle.availableCarrierCraftIds.length !== p403.availableCarrierCraftIds.length ||
      record.lifecycle.availableCarrierCraftIds.some((craftId, index) => craftId !== p403.availableCarrierCraftIds[index]) ||
      (p403.participantCrafts === undefined
        ? Object.hasOwn(missionData, 'participantCrafts')
        : !sameJson(record.participantCrafts, p403.participantCrafts) ||
          !sameJson(missionData.participantCrafts, p403.participantCrafts)) ||
      record.lifecycle.deckState.order.length !== deckState.order.length ||
      record.lifecycle.deckState.order.some((cardId, index) => cardId !== deckState.order[index]) ||
      record.lifecycle.dealtCount < p403.dealtThrough || record.lifecycle.dealtCount > deckCount ||
      missionData.status !== record.status || missionData.overrun !== record.overrun ||
      !sameJson(missionData.discardedParticipantUids, record.lifecycle.discardedParticipantUids) ||
      !sameJson(missionData.discardedCardIds, record.lifecycle.discardedCardIds)) {
    fail('failed-precondition', 'The stored lifecycle record no longer matches P403 mission authority.');
  }
  const recordParticipants = record.lifecycle.participants;
  if (recordParticipants.length !== p403.participantSnapshots.length ||
      recordParticipants.some((participant, index) => participant.uid !== p403.participantSnapshots[index]!.uid ||
        participant.roleId !== p403.participantSnapshots[index]!.roleId)) {
    fail('failed-precondition', 'The stored lifecycle participant snapshot is inconsistent.');
  }

  for (let index = 0; index < participants.length; index += 1) {
    const { participant, hand, pointer } = participants[index]!;
    const expectedPrivate = safePrivateProjection(record, participant.uid);
    const expectedPublic = safePublicProjection(record, participant.uid);
    if (!expectedPrivate || !expectedPublic) {
      fail('failed-precondition', 'A stored participant projection could not be derived safely.');
    }
    const initialCard = expectedPrivate.cards.find(({ id }) => id === p403.cardIds[index]);
    if (!sameJson(hand.lifecyclePrivateState, expectedPrivate) ||
        !sameJson(pointer.lifecyclePublicState, expectedPublic) ||
        hand.revision !== record.revision || hand.phase !== expectedPrivate.phase ||
        hand.discarded !== (initialCard?.status === 'discarded') ||
        pointer.phase !== expectedPublic.phase || pointer.revision !== record.revision ||
        pointer.discarded !== expectedPrivate.cards.some(({ status }) => status === 'discarded')) {
      fail('failed-precondition', 'A stored participant projection no longer matches its lifecycle record.');
    }
  }
  return record;
}

function validateStartSnapshot(value: Data, p403: P403MissionContext, sessionId: string): void {
  const inputs = isRecord(value.inputs) ? value.inputs : undefined;
  const leader = isRecord(value.missionLeader) ? value.missionLeader : undefined;
  const stateDelta = isRecord(value.stateDelta) ? value.stateDelta : undefined;
  const revisions = isRecord(value.revisions) ? value.revisions : undefined;
  const deckRevision = revisions && isRecord(revisions.missionDeck) ? revisions.missionDeck : undefined;
  if (value.type !== 'away-mission-start-snapshot' || value.schemaVersion !== 1 ||
      value.sessionId !== sessionId || value.opportunityId !== p403.opportunityId ||
      value.requestId !== p403.startRequestId ||
      value.missionId !== p403.missionId || value.groupId !== p403.groupId ||
      value.chart !== p403.chart || value.coordinate !== p403.coordinate ||
      value.siteCode !== p403.siteCode || value.sourceCycle !== p403.sourceCycle ||
      !inputs || !sameJson(inputs.participantSnapshots, p403.participantSnapshots) ||
      !sameJson(inputs.availableCarrierCraftIds, p403.availableCarrierCraftIds) ||
      (p403.participantCrafts !== undefined && !sameJson(inputs.participantCrafts, p403.participantCrafts)) ||
      inputs.missionLeaderUid !== p403.missionLeaderUid ||
      !stateDelta || stateDelta.missionDeckDealtCountBefore !== p403.dealtFrom ||
      stateDelta.missionDeckDealtCountAfter !== p403.dealtThrough ||
      !deckRevision || deckRevision.before !== p403.dealtFrom || deckRevision.after !== p403.dealtThrough ||
      !leader || leader.uid !== p403.missionLeaderUid || leader.roleId !== p403.missionLeaderRoleId) {
    fail('failed-precondition', 'The P403 mission-start receipt does not match the active mission instance.');
  }
}

function validateP403DeckSlice(p403: P403MissionContext, deckState: MissionDeckState): void {
  const originalDeal = deckState.order.slice(p403.dealtFrom, p403.dealtThrough);
  if (originalDeal.length !== p403.cardIds.length ||
      originalDeal.some((cardId, index) => cardId !== p403.cardIds[index])) {
    fail('failed-precondition', 'The P403 initial cards no longer match the shared deck order.');
  }
}

function validatePointerIdentity(
  pointer: Data,
  p403: P403MissionContext,
  participant: AwayMissionParticipantSnapshot,
  handId: string,
  sessionId: string,
): void {
  if (pointer.type !== 'away-mission-hand-pointer' || pointer.sessionId !== sessionId ||
      pointer.participantUid !== participant.uid || pointer.missionId !== p403.missionId ||
      pointer.handId !== handId || pointer.groupId !== p403.groupId ||
      pointer.chart !== p403.chart || pointer.coordinate !== p403.coordinate ||
      pointer.siteCode !== p403.siteCode || pointer.sourceCycle !== p403.sourceCycle ||
      pointer.participantCount !== p403.participantSnapshots.length ||
      pointer.missionLeaderUid !== p403.missionLeaderUid ||
      pointer.missionLeaderRoleId !== p403.missionLeaderRoleId ||
      typeof pointer.phase !== 'string' || !LIFECYCLE_PHASES.has(pointer.phase) ||
      typeof pointer.discarded !== 'boolean' || !Number.isSafeInteger(pointer.revision) ||
      (pointer.revision as number) < 0 || (pointer.revision as number) > p403.revision) {
    fail('failed-precondition', 'A P403 hand pointer no longer matches its mission context.');
  }
}

function validateLegacyDiscardProjections(
  p403: P403MissionContext,
  participants: readonly LoadedParticipantDocuments[],
): void {
  if (p403.discardedParticipantUids.length !== p403.discardedCardIds.length ||
      new Set(p403.discardedParticipantUids).size !== p403.discardedParticipantUids.length ||
      new Set(p403.discardedCardIds).size !== p403.discardedCardIds.length) {
    fail('failed-precondition', 'The P403 discard ledger is malformed.');
  }
  participants.forEach(({ participant, hand, pointer }) => {
    const participantIndex = p403.participantSnapshots.findIndex(({ uid }) => uid === participant.uid);
    const discarded = p403.discardedParticipantUids.includes(participant.uid);
    const discardedCard = p403.discardedCardIds.includes(p403.cardIds[participantIndex]!);
    if (discarded !== discardedCard || pointer.discarded !== discarded ||
        pointer.phase !== p403.phase ||
        (hand.discarded !== undefined && hand.discarded !== discarded)) {
      fail('failed-precondition', 'The P403 discard ledger and private projections disagree.');
    }
  });
}

function authorizeMissionActor(record: AwayMissionLifecycleRecord, type: LifecycleCommandType, actorUid: string): void {
  if (GM_COMMANDS.has(type)) return;
  const participant = record.lifecycle.participants.some(({ uid }) => uid === actorUid);
  if (!participant) fail('permission-denied', 'Only a recorded mission participant may use this command.');
  if (LEADER_COMMANDS.has(type) && record.lifecycle.leaderUid !== actorUid) {
    fail('permission-denied', 'Only the recorded Mission Leader may use this command.');
  }
  if (!LEADER_COMMANDS.has(type) && !PARTICIPANT_COMMANDS.has(type)) {
    fail('permission-denied', 'This actor is not authorized for the away-mission command.');
  }
}

function validateGameContext(context: AwayMissionLifecycleGameContext, sourceCycle: number): void {
  if (!isRecord(context) || !Number.isSafeInteger(context.currentCycle) ||
      (context.currentCycle as number) < sourceCycle || typeof context.teamPhase !== 'boolean' ||
      !uniqueStringArray(context.legalDropOffShipIds) ||
      (context.bonusSources !== undefined && !Array.isArray(context.bonusSources))) {
    fail('failed-precondition', 'Current server mission authority is unavailable or malformed.');
  }
}

function rebasePreResolutionDeckCursor(
  record: AwayMissionLifecycleRecord,
  deckCount: number,
): AwayMissionLifecycleRecord {
  if (record.status !== 'active' || record.lifecycle.phase === 'facilitator-cards-added') return record;
  if (record.lifecycle.dealtCount > deckCount) {
    fail('failed-precondition', 'The lifecycle deck cursor is ahead of the shared mission deck.');
  }
  if (record.lifecycle.dealtCount === deckCount) return record;
  return {
    ...record,
    lifecycle: { ...record.lifecycle, dealtCount: deckCount },
  };
}

function createRequiredD6Rolls(
  record: AwayMissionLifecycleRecord,
  rollD6: () => number,
  cache: Map<string, number>,
): Readonly<Record<string, number>> {
  const definition = missionCardForCode(record.lifecycle.siteCode);
  if (!definition) fail('failed-precondition', 'The mission difficulty rules are unavailable.');
  const assignedOpportunityIds = new Set(record.lifecycle.assignments.map(({ opportunityId }) => opportunityId));
  const rolls: Record<string, number> = {};
  for (const opportunity of definition.opportunities) {
    if (opportunity.difficultyRule === undefined || !assignedOpportunityIds.has(opportunity.id)) continue;
    let roll = cache.get(opportunity.id);
    if (roll === undefined) {
      roll = rollD6();
      if (!Number.isSafeInteger(roll) || roll < 1 || roll > 6) {
        fail('failed-precondition', 'A private mission roll could not be generated.');
      }
      cache.set(opportunity.id, roll);
    }
    rolls[opportunity.id] = roll;
  }
  return rolls;
}

function projectPublicProjections(
  record: AwayMissionLifecycleRecord,
): Map<string, AwayMissionPublicState> | null {
  const projections = new Map<string, AwayMissionPublicState>();
  for (const participant of record.lifecycle.participants) {
    const projection = safePublicProjection(record, participant.uid);
    if (!projection) return null;
    projections.set(participant.uid, projection);
  }
  return projections;
}

function projectPrivateProjections(
  record: AwayMissionLifecycleRecord,
): Map<string, AwayMissionPrivateState> | null {
  const projections = new Map<string, AwayMissionPrivateState>();
  for (const participant of record.lifecycle.participants) {
    const projection = safePrivateProjection(record, participant.uid);
    if (!projection) return null;
    projections.set(participant.uid, projection);
  }
  return projections;
}

function safePublicProjection(record: AwayMissionLifecycleRecord, viewerUid?: string): AwayMissionPublicState | null {
  try {
    return projectAwayMissionPublicState(record, viewerUid);
  } catch {
    return null;
  }
}

function safePrivateProjection(record: AwayMissionLifecycleRecord, participantUid: string): AwayMissionPrivateState | null {
  try {
    return projectAwayMissionPrivateState(record, participantUid);
  } catch {
    return null;
  }
}

function buildReply(
  record: AwayMissionLifecycleRecord,
  status: 'committed' | 'replayed',
  command: ParsedCallableCommand,
  actorUid: string,
): AwayMissionLifecycleCallableReply {
  const publicState = safePublicProjection(record, actorUid);
  const privateState = safePrivateProjection(record, actorUid);
  if (!publicState) fail('failed-precondition', 'The away-mission public projection is malformed.');
  return {
    status,
    sessionId: command.sessionId,
    missionId: command.missionId,
    requestId: command.requestId,
    revision: record.revision,
    publicState,
    privateState,
  };
}

function buildStaleReply(
  record: AwayMissionLifecycleRecord,
  command: ParsedCallableCommand,
  actorUid: string,
): AwayMissionLifecycleCallableReply {
  const reply = buildReply(record, 'replayed', command, actorUid);
  return {
    ...reply,
    status: 'stale',
    expectedRevision: command.expectedRevision,
    currentRevision: record.revision,
  };
}

function lifecycleCommandFingerprint(
  command: ParsedCallableCommand,
  actorUid: string,
): CommandFingerprint {
  return {
    action: 'away-mission-lifecycle-command',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid,
    instanceId: command.instanceId ?? null,
    expectedRevision: command.expectedRevision,
    payload: {
      missionId: command.missionId,
      command: stableJson(command.command),
    },
  };
}

function validateStoredCommandReply(
  value: unknown,
  command: ParsedCallableCommand,
  actorUid: string,
  expectedStatus: 'committed' | 'stale',
): AwayMissionLifecycleCallableReply {
  const extraReplyKeys = expectedStatus === 'stale' ? ['expectedRevision', 'currentRevision'] : [];
  if (!isRecord(value) || !hasExactKeys(value, [
    'status', 'sessionId', 'missionId', 'requestId', 'revision', 'publicState', 'privateState', ...extraReplyKeys,
  ])) {
    fail('failed-precondition', 'The shared away-mission receipt has no safe replay result.');
  }
  const publicState = value.publicState;
  const privateState = value.privateState;
  if (value.status !== expectedStatus || value.sessionId !== command.sessionId ||
      value.missionId !== command.missionId || value.requestId !== command.requestId ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
      !isRecord(publicState) || publicState.missionId !== command.missionId ||
      publicState.revision !== value.revision || !hasExactKeys(publicState, [
        'missionId', 'groupId', 'siteCode', 'revision', 'phase', 'status', 'overrun',
        'missionLeaderUid', 'participantCount', 'opportunities', 'requestCounts', 'outcomes',
        'rewards', 'specialRewards', 'custody', 'legalDropOffShipIds',
      ])) {
    fail('failed-precondition', 'The shared away-mission receipt has no safe replay result.');
  }
  if (privateState !== null) {
    if (!isRecord(privateState) || !hasExactKeys(privateState, [
      'missionId', 'participantUid', 'revision', 'phase', 'cards', 'reclamatorSalvage',
      ...(Object.hasOwn(privateState, 'canUseReclamator') ? ['canUseReclamator'] : []),
    ]) || (privateState.canUseReclamator !== undefined && typeof privateState.canUseReclamator !== 'boolean') || privateState.missionId !== command.missionId || privateState.participantUid !== actorUid ||
        privateState.revision !== value.revision || !Array.isArray(privateState.cards) ||
        privateState.cards.some((card) => !isRecord(card) ||
          !hasExactKeys(card, ['id', 'value', 'status', 'opportunityId']))) {
      fail('failed-precondition', 'The shared away-mission private receipt is malformed.');
    }
    const salvage = privateState.reclamatorSalvage;
    if (salvage !== null && (!isRecord(salvage) ||
        !hasExactKeys(salvage, ['opportunityId', 'choices']) || !Array.isArray(salvage.choices) ||
        salvage.choices.some((choice) => !isRecord(choice) || !hasExactKeys(choice, ['cardId', 'resource'])))) {
      fail('failed-precondition', 'The shared away-mission salvage receipt is malformed.');
    }
  }
  if (expectedStatus === 'stale' &&
      (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision !== command.expectedRevision ||
        !Number.isSafeInteger(value.currentRevision) || value.currentRevision !== value.revision ||
        (value.currentRevision as number) <= command.expectedRevision)) {
    fail('failed-precondition', 'The shared stale away-mission receipt is malformed.');
  }
  return value as unknown as AwayMissionLifecycleCallableReply;
}

function validateLifecycleEvent(
  event: Data,
  command: ParsedCallableCommand,
  record: AwayMissionLifecycleRecord,
  receipt: AwayMissionLifecycleRecord['commandReceipts'][number],
): void {
  const receiptIndex = record.commandReceipts.findIndex(({ requestId }) => requestId === receipt.requestId);
  const expectedRevision = record.revision - record.commandReceipts.length + receiptIndex + 1;
  if (event.type !== 'away-mission-lifecycle-command' || event.sessionId !== command.sessionId ||
      event.missionId !== command.missionId || event.requestId !== command.requestId ||
      event.commandType !== command.command.type || event.revision !== expectedRevision ||
      !Number.isSafeInteger(event.revision) || expectedRevision < 1) {
    fail('failed-precondition', 'The committed away-mission event does not match its lifecycle receipt.');
  }
}

function createCachedRandomIndex(source: MissionDeckRandomIndex): CachedRandomIndex {
  const draws: { readonly upperBound: number; readonly value: number }[] = [];
  let cursor = 0;
  return {
    beginAttempt: () => { cursor = 0; },
    next: (upperBound) => {
      const previous = draws[cursor];
      if (previous) {
        if (previous.upperBound !== upperBound) {
          fail('failed-precondition', 'A retried mission-card shuffle changed shape.');
        }
        cursor += 1;
        return previous.value;
      }
      const value = source(upperBound);
      if (!Number.isSafeInteger(value) || value < 0 || value >= upperBound) {
        fail('failed-precondition', 'A private mission-card shuffle could not be generated.');
      }
      draws.push({ upperBound, value });
      cursor += 1;
      return value;
    },
  };
}

function missionPaths(sessionId: string, missionId: string, requestId: string, actorUid: string) {
  return {
    session: `sessions/${sessionId}`,
    player: `sessions/${sessionId}/players/${actorUid}`,
    mission: `sessions/${sessionId}/serverState/awayMissions/instances/${missionId}`,
    deck: `sessions/${sessionId}/serverState/missionDeck`,
    event: `sessions/${sessionId}/events/away-mission-lifecycle-${requestId}`,
  };
}


function requireSnapshotData(snapshot: AwayMissionLifecycleCallableSnapshot, message: string): Data {
  const value = snapshot.data();
  if (!isRecord(value)) fail('failed-precondition', message);
  return value;
}

function parseParticipantSnapshots(value: unknown): readonly AwayMissionParticipantSnapshot[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const seen = new Set<string>();
  const participants: AwayMissionParticipantSnapshot[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['uid', 'roleId']) ||
        !safePathSegment(candidate.uid) || !safePathSegment(candidate.roleId) || seen.has(candidate.uid as string)) {
      return null;
    }
    const uid = candidate.uid as string;
    seen.add(uid);
    participants.push({ uid, roleId: candidate.roleId as string });
  }
  return participants;
}

const KNOWN_PARTICIPANT_CRAFT_IDS = new Set([
  'starlight', 'highwall', 'endeavour', 'hummingbird', 'pdf-escort-fighter-wing',
  'blacksmith', 'macaw', 'boa', 'capybara-small', 'warrior', 'gorgoneion', 'vulcan',
]);

function parseParticipantCraftBindings(
  value: unknown,
  participants: readonly AwayMissionParticipantSnapshot[],
): readonly AwayMissionParticipantCrafts[] | null {
  if (!Array.isArray(value) || value.length !== participants.length) return null;
  const bindings: AwayMissionParticipantCrafts[] = [];
  for (const [index, candidate] of value.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['participantUid', 'craftIds']) ||
        candidate.participantUid !== participants[index]?.uid || !Array.isArray(candidate.craftIds) ||
        candidate.craftIds.some((craftId) => typeof craftId !== 'string' ||
          !KNOWN_PARTICIPANT_CRAFT_IDS.has(craftId)) ||
        new Set(candidate.craftIds).size !== candidate.craftIds.length) return null;
    bindings.push({
      participantUid: candidate.participantUid as string,
      craftIds: [...candidate.craftIds] as string[],
    });
  }
  return bindings;
}

function stringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((entry) => !safePathSegment(entry))) return null;
  return value as string[];
}

function uniqueStringArray(value: unknown): readonly string[] | null {
  const values = stringArray(value);
  return values && new Set(values).size === values.length ? values : null;
}

function requireActorUid(auth: AwayMissionLifecycleCallableRequest['auth']): string {
  const uid = auth?.uid;
  if (typeof uid !== 'string' || uid.trim().length === 0 || uid.length > 128 || uid.includes('/')) {
    fail('unauthenticated', 'Sign in before using away-mission commands.');
  }
  return uid;
}

function safePathSegment(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/')
    ? value
    : null;
}

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Data, expected: readonly string[]): boolean {
  const allowed = new Set(expected);
  return Object.keys(value).length === expected.length && Object.keys(value).every((key) => allowed.has(key));
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

type LifecycleErrorCode = 'unauthenticated' | 'invalid-argument' | 'permission-denied' |
  'not-found' | 'failed-precondition';

function fail(code: LifecycleErrorCode, message: string): never {
  throw new HttpsError(code, message);
}
