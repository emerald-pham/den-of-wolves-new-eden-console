import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { app, auth, functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import {
  captureSessionAuthority,
  hasFreshSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';

type Data = Record<string, unknown>;
export interface AwayMissionPublicState {
  readonly explorationAppliedOpportunityIds?: readonly string[];
  readonly missionId: string;
  readonly groupId: string;
  readonly siteCode: string;
  readonly revision: number;
  readonly phase: string;
  readonly status: 'active' | 'resolved' | 'complete';
  readonly overrun: boolean;
  readonly missionLeaderUid: string;
  readonly participantCount: number;
  readonly opportunities: readonly Readonly<{ id: string; label: string }>[];
  readonly requestCounts: readonly Readonly<{ participantUid: string; count: number }>[];
  readonly outcomes: readonly Readonly<{
    opportunityId: string;
    contributorCount: number;
    total: number;
    bonusTotal: number;
    difficulty: number | null;
    criticalThreshold: number | null;
    outcome: 'automatic-failure' | 'failure' | 'success' | 'critical-success';
  }>[] | null;
  readonly rewards: readonly Readonly<{
    opportunityId: string;
    resources: Readonly<Record<string, number>>;
  }>[] | null;
  readonly specialRewards: readonly Readonly<{
    opportunityId: string;
    resources: Readonly<Record<string, number>>;
  }>[] | null;
  readonly custody: Readonly<{ status: 'mission-leader' | 'dropped-off'; holderUid: string; shipId: string | null }>;
  readonly legalDropOffShipIds: readonly string[];
}

export interface AwayMissionPrivateState {
  readonly assignmentCommitted?: boolean;
  readonly canUseReclamator?: boolean;
  readonly missionId: string;
  readonly participantUid: string;
  readonly revision: number;
  readonly phase: string;
  readonly cards: readonly Readonly<{
    id: string;
    value: number;
    status: 'remaining' | 'discarded' | 'assigned';
    opportunityId: string | null;
  }>[];
  readonly reclamatorSalvage: Readonly<{
    opportunityId: string;
    choices: readonly Readonly<{ cardId: string; resource: 'food' | 'water' | 'materials' }>[];
  }> | null;
}

type LifecycleCommandType =
  | 'requestExtraCards'
  | 'distributeExtraCard'
  | 'openDiscards'
  | 'discardCard'
  | 'reclamatorSalvage'
  | 'assignCards'
  | 'addFacilitatorCards'
  | 'resolve'
  | 'exploreSystems'
  | 'dropOff';

export interface AwayMissionLifecycleMission {
  readonly publicState: AwayMissionPublicState;
  readonly privateState: AwayMissionPrivateState;
}

export type AwayMissionLifecycleFeedStatus =
  | 'loading'
  | 'ready'
  | 'stale'
  | 'projection-missing'
  | 'error';

export interface AwayMissionLifecycleFeedState {
  readonly status: AwayMissionLifecycleFeedStatus;
  readonly missions: readonly AwayMissionLifecycleMission[];
  readonly projectionMissing: boolean;
}

export interface OwnMissionPointerDocument {
  readonly id: string;
  readonly data: () => unknown;
}

export interface OwnMissionPointersSnapshot {
  readonly fromCache: boolean;
  readonly hasPendingWrites: boolean;
  readonly docs: readonly OwnMissionPointerDocument[];
}

export interface OwnMissionHandSnapshot {
  readonly fromCache: boolean;
  readonly hasPendingWrites: boolean;
  readonly exists: boolean;
  readonly data: () => unknown;
}

export interface AwayMissionLifecycleProjectionReader {
  readonly watchAuth: (onUid: (uid: string | null) => void) => Unsubscribe;
  readonly watchOwnPointers: (
    sessionId: string,
    actorUid: string,
    onSnapshot: (snapshot: OwnMissionPointersSnapshot) => void,
    onError: (error: unknown) => void,
  ) => Unsubscribe;
  readonly watchOwnHand: (
    sessionId: string,
    actorUid: string,
    handId: string,
    onSnapshot: (snapshot: OwnMissionHandSnapshot) => void,
    onError: (error: unknown) => void,
  ) => Unsubscribe;
}

export interface AwayMissionLifecycleClientContext {
  readonly sessionId: string;
  readonly actorUid: string;
  readonly authenticatedUid: string | null;
  readonly actorRole: 'player' | 'gm' | 'other';
  readonly missionId: string;
  readonly missionLeaderUid: string;
  readonly revision: number;
  readonly sessionIsActive: boolean;
  readonly hasFreshServerAuthority: boolean;
  readonly instanceId?: string;
}

export interface AwayMissionLifecycleCallablePayload {
  readonly sessionId: string;
  readonly missionId: string;
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly type: LifecycleCommandType;
  readonly count?: number;
  readonly participantUid?: string;
  readonly opportunityId?: string;
  readonly cardId?: string;
  readonly choices?: readonly Readonly<{ cardId: string; resource: 'food' | 'water' | 'materials' }>[];
  readonly placements?: readonly Readonly<{ cardId: string; opportunityId: string }> [];
  readonly targetCoordinates?: readonly string[];
  readonly shipId?: string;
  readonly instanceId?: string;
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
  readonly privateState: AwayMissionPrivateState | null;
}

export interface AwayMissionLifecycleClientActions {
  readonly requestExtraCards: (count: number) => Promise<void>;
  readonly distributeExtraCard: (participantUid: string, opportunityId: string) => Promise<void>;
  readonly openDiscards: () => Promise<void>;
  readonly discardCard: (cardId: string) => Promise<void>;
  readonly reclamatorSalvage: (
    opportunityId: string,
    choices: readonly Readonly<{ cardId: string; resource: 'food' | 'water' | 'materials' }>[],
  ) => Promise<void>;
  readonly assignCards: (
    placements: readonly Readonly<{ cardId: string; opportunityId: string }>[],
  ) => Promise<void>;
  readonly addFacilitatorCards: () => Promise<void>;
  readonly resolve: () => Promise<void>;
  readonly exploreSystems: (opportunityId: string, targetCoordinates: readonly string[]) => Promise<void>;
  readonly dropOff: (shipId: string) => Promise<void>;
}

export interface AwayMissionLifecycleActionDependencies {
  readonly invoke?: (payload: AwayMissionLifecycleCallablePayload) => Promise<unknown>;
  readonly createRequestId?: () => string;
}

const PUBLIC_KEYS = [
  'missionId', 'groupId', 'siteCode', 'revision', 'phase', 'status', 'overrun',
  'missionLeaderUid', 'participantCount', 'opportunities', 'requestCounts', 'outcomes',
  'rewards', 'specialRewards', 'custody', 'legalDropOffShipIds',
] as const;
const PRIVATE_KEYS = [
  'missionId', 'participantUid', 'revision', 'phase', 'cards', 'reclamatorSalvage',
] as const;
const MISSION_PHASES = new Set([
  'awaiting-card-selection', 'discarding', 'assignment-ready', 'assigning',
  'assignments-complete', 'facilitator-cards-added', 'resolved', 'complete',
]);
const MISSION_CARD_VALUES = new Map<string, number>([
  ...['♥', '♦', '♣'].flatMap((suit) => [
    [`A${suit}`, 10], [`4${suit}`, 4], [`5${suit}`, 5], [`6${suit}`, 6], [`7${suit}`, 7],
    [`8${suit}`, 8], [`9${suit}`, 9], [`10${suit}`, 10], [`J${suit}`, -5],
    [`Q${suit}`, -5], [`K${suit}`, -5],
  ] as const),
]);
const RESOURCE_IDS = new Set([
  'ore', 'fuel', 'food', 'water', 'materials', 'securityTeams', 'scrap', 'minerals', 'survivors',
]);
const AMBIGUOUS_TRANSPORT_ERRORS = new Set([
  'functions/deadline-exceeded', 'functions/internal', 'functions/network-request-failed',
  'functions/unavailable', 'functions/unknown',
]);
const GM_COMMANDS = new Set<LifecycleCommandType>(['openDiscards', 'addFacilitatorCards', 'resolve', 'exploreSystems']);
const LEADER_COMMANDS = new Set<LifecycleCommandType>(['distributeExtraCard', 'dropOff']);

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Data, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isUniqueStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString) && new Set(value).size === value.length;
}

function isResourceMap(value: unknown): boolean {
  return isRecord(value) && Object.entries(value).every(([resource, amount]) =>
    RESOURCE_IDS.has(resource) && Number.isSafeInteger(amount) && (amount as number) >= 0);
}

function validPublicOutcomes(value: unknown, opportunityIds: ReadonlySet<string>): boolean {
  if (value === null) return true;
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  return value.every((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, [
      'opportunityId', 'contributorCount', 'total', 'bonusTotal', 'difficulty',
      'criticalThreshold', 'outcome',
    ]) || !isNonEmptyString(entry.opportunityId) || !opportunityIds.has(entry.opportunityId) ||
        seen.has(entry.opportunityId) || !Number.isSafeInteger(entry.contributorCount) ||
        (entry.contributorCount as number) < 0 || !Number.isSafeInteger(entry.total) ||
        !Number.isSafeInteger(entry.bonusTotal) ||
        (entry.difficulty !== null && !Number.isSafeInteger(entry.difficulty)) ||
        (entry.criticalThreshold !== null && !Number.isSafeInteger(entry.criticalThreshold)) ||
        !['automatic-failure', 'failure', 'success', 'critical-success'].includes(String(entry.outcome))) {
      return false;
    }
    seen.add(entry.opportunityId);
    return true;
  });
}

function validRewardResults(value: unknown, opportunityIds: ReadonlySet<string>): boolean {
  if (value === null) return true;
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  return value.every((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, [
      'opportunityId', 'branch', 'resources', 'effects', 'bulkHaulageApplied',
    ]) || !isNonEmptyString(entry.opportunityId) || !opportunityIds.has(entry.opportunityId) ||
        seen.has(entry.opportunityId) || !['none', 'success', 'critical'].includes(String(entry.branch)) ||
        !isResourceMap(entry.resources) || !Array.isArray(entry.effects) ||
        typeof entry.bulkHaulageApplied !== 'boolean') return false;
    seen.add(entry.opportunityId);
    return true;
  });
}

function validSpecialRewards(value: unknown, opportunityIds: ReadonlySet<string>): boolean {
  if (value === null) return true;
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  return value.every((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, ['opportunityId', 'resources']) ||
        !isNonEmptyString(entry.opportunityId) || !opportunityIds.has(entry.opportunityId) ||
        seen.has(entry.opportunityId) || !isResourceMap(entry.resources)) return false;
    seen.add(entry.opportunityId);
    return true;
  });
}

export function parseAwayMissionLifecyclePublicState(
  value: unknown,
  expectedMissionId: string,
): AwayMissionPublicState | null {
  if (!isRecord(value) || !hasExactKeys(value, [...PUBLIC_KEYS, ...(Object.hasOwn(value, 'explorationAppliedOpportunityIds') ? ['explorationAppliedOpportunityIds'] : [])]) ||
      value.missionId !== expectedMissionId || !isNonEmptyString(value.groupId) ||
      typeof value.siteCode !== 'string' || !/^[A-P]$/.test(value.siteCode) ||
      !isRevision(value.revision) || typeof value.phase !== 'string' || !MISSION_PHASES.has(value.phase) ||
      !['active', 'resolved', 'complete'].includes(String(value.status)) ||
      typeof value.overrun !== 'boolean' || !isNonEmptyString(value.missionLeaderUid) ||
      !Number.isSafeInteger(value.participantCount) || (value.participantCount as number) < 1 ||
      (value.participantCount as number) > 33 || !Array.isArray(value.opportunities) ||
      value.opportunities.length < 1 || value.opportunities.length > 16 ||
      !Array.isArray(value.requestCounts) || !isRecord(value.custody) ||
      !hasExactKeys(value.custody, ['status', 'holderUid', 'shipId']) ||
      !['mission-leader', 'dropped-off'].includes(String(value.custody.status)) ||
      !isNonEmptyString(value.custody.holderUid) ||
      (value.custody.shipId !== null && !isNonEmptyString(value.custody.shipId)) ||
      !isUniqueStringArray(value.legalDropOffShipIds)) return null;

  const opportunityIds = new Set<string>();
  for (const opportunity of value.opportunities) {
    if (!isRecord(opportunity) || !hasExactKeys(opportunity, ['id', 'label']) ||
        !isNonEmptyString(opportunity.id) || !isNonEmptyString(opportunity.label) ||
        opportunityIds.has(opportunity.id)) return null;
    opportunityIds.add(opportunity.id);
  }
  if (value.explorationAppliedOpportunityIds !== undefined &&
      (!isUniqueStringArray(value.explorationAppliedOpportunityIds) ||
        value.explorationAppliedOpportunityIds.some(id => !opportunityIds.has(id)))) return null;
  if (value.requestCounts.some((entry) => !isRecord(entry) ||
      !hasExactKeys(entry, ['participantUid', 'count']) || !isNonEmptyString(entry.participantUid) ||
      !Number.isSafeInteger(entry.count) || (entry.count as number) < 1 ||
      (entry.count as number) > 16) ||
      new Set(value.requestCounts.map((entry) => (entry as Data).participantUid)).size !== value.requestCounts.length ||
      !validPublicOutcomes(value.outcomes, opportunityIds) ||
      !validRewardResults(value.rewards, opportunityIds) ||
      !validSpecialRewards(value.specialRewards, opportunityIds)) return null;

  return value as unknown as AwayMissionPublicState;
}

export function parseAwayMissionLifecyclePrivateState(
  value: unknown,
  expected: Readonly<{ missionId: string; participantUid: string; revision: number }>,
): AwayMissionPrivateState | null {
  if (!isRecord(value) || !hasExactKeys(value, [...PRIVATE_KEYS,
      ...(Object.hasOwn(value, 'canUseReclamator') ? ['canUseReclamator'] : []),
      ...(Object.hasOwn(value, 'assignmentCommitted') ? ['assignmentCommitted'] : []),
    ]) || (value.canUseReclamator !== undefined && typeof value.canUseReclamator !== 'boolean') ||
      (value.assignmentCommitted !== undefined && typeof value.assignmentCommitted !== 'boolean') ||
      value.missionId !== expected.missionId || value.participantUid !== expected.participantUid ||
      value.revision !== expected.revision || typeof value.phase !== 'string' ||
      !MISSION_PHASES.has(value.phase) || !Array.isArray(value.cards) || value.cards.length > 33) return null;

  const cardIds = new Set<string>();
  for (const card of value.cards) {
    if (!isRecord(card) || !hasExactKeys(card, ['id', 'value', 'status', 'opportunityId']) ||
        typeof card.id !== 'string' || MISSION_CARD_VALUES.get(card.id) !== card.value ||
        !['remaining', 'discarded', 'assigned'].includes(String(card.status)) ||
        (card.opportunityId !== null && !isNonEmptyString(card.opportunityId)) || cardIds.has(card.id)) return null;
    cardIds.add(card.id);
  }
  if (value.reclamatorSalvage !== null) {
    const salvage = value.reclamatorSalvage;
    if (!isRecord(salvage) || !hasExactKeys(salvage, ['opportunityId', 'choices']) ||
        !isNonEmptyString(salvage.opportunityId) || !Array.isArray(salvage.choices) ||
        salvage.choices.some((choice) => !isRecord(choice) ||
          !hasExactKeys(choice, ['cardId', 'resource']) || !cardIds.has(String(choice.cardId)) ||
          !['food', 'water', 'materials'].includes(String(choice.resource)))) return null;
  }
  return value as unknown as AwayMissionPrivateState;
}

function pointerState(
  value: unknown,
  id: string,
  sessionId: string,
  actorUid: string,
): Readonly<{ handId: string; missionId: string; revision: number; publicState: AwayMissionPublicState }> | 'missing' | null {
  if (!isRecord(value) || value.type !== 'away-mission-hand-pointer' ||
      value.sessionId !== sessionId || value.participantUid !== actorUid || value.handId !== id ||
      !isNonEmptyString(value.missionId) || !isRevision(value.revision) ||
      typeof value.phase !== 'string' || !MISSION_PHASES.has(value.phase)) return null;
  if (value.lifecyclePublicState === undefined) return 'missing';
  const publicState = parseAwayMissionLifecyclePublicState(value.lifecyclePublicState, value.missionId);
  if (!publicState || publicState.revision !== value.revision || publicState.phase !== value.phase) return null;
  return { handId: id, missionId: value.missionId, revision: value.revision, publicState };
}

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function productionProjectionReader(): AwayMissionLifecycleProjectionReader {
  const database = getFirestore(app());
  return {
    watchAuth: (onUid) => onAuthStateChanged(auth(), (user) => onUid(user?.uid ?? null)),
    watchOwnPointers: (sessionId, actorUid, onNext, onError) => onSnapshot(
      query(
        collection(database, `sessions/${sessionId}/awayMissionHandPointers`),
        where('sessionId', '==', sessionId),
        where('participantUid', '==', actorUid),
      ),
      { includeMetadataChanges: true },
      (snapshot) => onNext({
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        docs: snapshot.docs.map((entry) => ({ id: entry.id, data: () => entry.data() })),
      }),
      onError,
    ),
    watchOwnHand: (sessionId, _actorUid, handId, onNext, onError) => onSnapshot(
      doc(database, `sessions/${sessionId}/awayMissionHands/${handId}`),
      { includeMetadataChanges: true },
      (snapshot) => onNext({
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        exists: snapshot.exists(),
        data: () => snapshot.data(),
      }),
      onError,
    ),
  };
}

export function createAwayMissionLifecycleProjectionSubscription(options: Readonly<{
  sessionId: string;
  actorUid: string;
  onState: (state: AwayMissionLifecycleFeedState) => void;
  reader: AwayMissionLifecycleProjectionReader;
}>): Unsubscribe {
  const { sessionId, actorUid, onState, reader } = options;
  let closed = false;
  let generation = 0;
  let currentUid: string | null = null;
  let pointerReady = false;
  let pointerHasError = false;
  let pointerStop: Unsubscribe | null = null;
  let authStop: Unsubscribe | null = null;
  const handStops = new Map<string, Unsubscribe>();
  const pointerEntries = new Map<string, Readonly<{
    missionId: string;
    revision: number;
    publicState: AwayMissionPublicState | null;
  }>>();
  const handEntries = new Map<string, AwayMissionPrivateState | null>();

  const stopHands = () => {
    handStops.forEach((stop) => stop());
    handStops.clear();
  };
  const clearProjection = () => {
    pointerStop?.();
    pointerStop = null;
    stopHands();
    pointerEntries.clear();
    handEntries.clear();
    pointerReady = false;
    pointerHasError = false;
  };
  const publish = (forced?: AwayMissionLifecycleFeedStatus) => {
    if (closed) return;
    if (forced) {
      onState({ status: forced, missions: [], projectionMissing: false });
      return;
    }
    if (pointerHasError) {
      onState({ status: 'error', missions: [], projectionMissing: false });
      return;
    }
    if (!pointerReady) {
      onState({ status: currentUid === actorUid ? 'loading' : 'error', missions: [], projectionMissing: false });
      return;
    }
    const missions: AwayMissionLifecycleMission[] = [];
    let projectionMissing = false;
    let waitingForOwnHand = false;
    for (const [handId, pointer] of pointerEntries) {
      if (!pointer.publicState) {
        projectionMissing = true;
        continue;
      }
      const privateState = handEntries.get(handId);
      if (!privateState) {
        waitingForOwnHand = true;
        continue;
      }
      if (privateState.revision !== pointer.revision || privateState.missionId !== pointer.missionId ||
          privateState.phase !== pointer.publicState.phase ||
          privateState.cards.some((card) => card.opportunityId !== null &&
            !pointer.publicState!.opportunities.some(({ id }) => id === card.opportunityId))) {
        waitingForOwnHand = true;
        continue;
      }
      missions.push({ publicState: pointer.publicState, privateState });
    }
    if (missions.length === 0 && waitingForOwnHand) {
      onState({ status: 'loading', missions: [], projectionMissing });
      return;
    }
    if (missions.length === 0 && projectionMissing) {
      onState({ status: 'projection-missing', missions: [], projectionMissing: true });
      return;
    }
    onState({ status: 'ready', missions, projectionMissing: projectionMissing || waitingForOwnHand });
  };

  const listenForOwnPointers = (uid: string) => {
    clearProjection();
    currentUid = uid;
    const myGeneration = ++generation;
    pointerStop = reader.watchOwnPointers(sessionId, actorUid, (snapshot) => {
      if (closed || myGeneration !== generation) return;
      if (snapshot.fromCache || snapshot.hasPendingWrites) {
        pointerReady = false;
        pointerHasError = false;
        publish('stale');
        return;
      }
      pointerReady = true;
      pointerHasError = false;
      const nextPointers = new Map<string, Readonly<{
        missionId: string;
        revision: number;
        publicState: AwayMissionPublicState | null;
      }>>();
      const nextHandIds = new Set<string>();
      for (const document of snapshot.docs) {
        const raw = document.data();
        if (isRecord(raw) && (
          (typeof raw.sessionId === 'string' && raw.sessionId !== sessionId) ||
          (typeof raw.participantUid === 'string' && raw.participantUid !== actorUid)
        )) continue;
        const parsed = pointerState(raw, document.id, sessionId, actorUid);
        if (parsed === null) {
          pointerHasError = true;
          continue;
        }
        if (parsed === 'missing') {
          const rawPointer = isRecord(raw) ? raw : {};
          if (!isNonEmptyString(rawPointer.missionId) || !isRevision(rawPointer.revision)) {
            pointerHasError = true;
            continue;
          }
          nextPointers.set(document.id, {
            missionId: rawPointer.missionId,
            revision: rawPointer.revision,
            publicState: null,
          });
          continue;
        }
        nextPointers.set(document.id, parsed);
        nextHandIds.add(parsed.handId);
      }
      for (const [handId, stop] of handStops) {
        if (!nextHandIds.has(handId)) {
          stop();
          handStops.delete(handId);
          handEntries.delete(handId);
        }
      }
      for (const handId of [...pointerEntries.keys()]) {
        const previous = pointerEntries.get(handId);
        const next = nextPointers.get(handId);
        if (!next || previous?.revision !== next.revision || previous.missionId !== next.missionId) {
          handEntries.delete(handId);
        }
      }
      pointerEntries.clear();
      nextPointers.forEach((pointer, handId) => pointerEntries.set(handId, pointer));
      for (const handId of nextHandIds) {
        if (handStops.has(handId)) continue;
        handStops.set(handId, reader.watchOwnHand(sessionId, actorUid, handId, (handSnapshot) => {
          if (closed || myGeneration !== generation) return;
          if (handSnapshot.fromCache || handSnapshot.hasPendingWrites) {
            handEntries.delete(handId);
            publish('stale');
            return;
          }
          if (!handSnapshot.exists) {
            handEntries.delete(handId);
            publish();
            return;
          }
          const raw = handSnapshot.data();
          if (!isRecord(raw) || raw.type !== 'away-mission-hand' || raw.sessionId !== sessionId ||
              raw.participantUid !== actorUid || raw.handId !== handId || !isNonEmptyString(raw.missionId)) {
            pointerHasError = true;
            publish();
            return;
          }
          const pointer = pointerEntries.get(handId);
          if (raw.missionId !== pointer?.missionId) {
            pointerHasError = true;
            publish();
            return;
          }
          if (raw.lifecyclePrivateState === undefined) {
            handEntries.delete(handId);
            publish();
            return;
          }
          const privateState = parseAwayMissionLifecyclePrivateState(raw.lifecyclePrivateState, {
            missionId: raw.missionId,
            participantUid: actorUid,
            revision: pointer?.revision ?? -1,
          });
          if (!privateState) {
            const rawPrivate = isRecord(raw.lifecyclePrivateState) ? raw.lifecyclePrivateState : {};
            if (rawPrivate.revision !== pointer?.revision) {
              handEntries.delete(handId);
              publish();
              return;
            }
            pointerHasError = true;
            publish();
            return;
          }
          handEntries.set(handId, privateState);
          publish();
        }, () => {
          if (closed || myGeneration !== generation) return;
          pointerHasError = true;
          publish();
        }));
      }
      publish();
    }, () => {
      if (closed || myGeneration !== generation) return;
      pointerHasError = true;
      pointerReady = true;
      publish();
    });
  };

  onState({ status: 'loading', missions: [], projectionMissing: false });
  authStop = reader.watchAuth((uid) => {
    if (closed) return;
    if (uid !== actorUid) {
      generation += 1;
      clearProjection();
      currentUid = uid;
      publish('error');
      return;
    }
    if (currentUid !== uid || !pointerStop) listenForOwnPointers(uid);
  });
  return () => {
    if (closed) return;
    closed = true;
    generation += 1;
    authStop?.();
    clearProjection();
  };
}

export function subscribeToOwnAwayMissionLifecycles(
  sessionId: string,
  actorUid: string,
  onState: (state: AwayMissionLifecycleFeedState) => void,
): Unsubscribe {
  return createAwayMissionLifecycleProjectionSubscription({
    sessionId,
    actorUid,
    onState,
    reader: productionProjectionReader(),
  });
}

function parseLifecycleReply(
  value: unknown,
  expected: AwayMissionLifecycleCallablePayload,
  actorUid: string,
  expectsPrivateState: boolean,
): AwayMissionLifecycleCallableReply {
  if (!isRecord(value)) throw new Error('The server returned an invalid away-mission lifecycle result.');
  const stale = value.status === 'stale';
  const expectedKeys = stale
    ? ['status', 'sessionId', 'missionId', 'requestId', 'revision', 'expectedRevision', 'currentRevision', 'publicState', 'privateState']
    : ['status', 'sessionId', 'missionId', 'requestId', 'revision', 'publicState', 'privateState'];
  const revision = value.revision;
  if (!hasExactKeys(value, expectedKeys) ||
      !['committed', 'replayed', 'stale'].includes(String(value.status)) ||
      value.sessionId !== expected.sessionId || value.missionId !== expected.missionId ||
      value.requestId !== expected.requestId || !isRevision(revision) ||
      !parseAwayMissionLifecyclePublicState(value.publicState, expected.missionId) ||
      (value.publicState as Data).revision !== revision) {
    throw new Error('The server returned an invalid away-mission lifecycle result.');
  }
  const publicState = parseAwayMissionLifecyclePublicState(value.publicState, expected.missionId)!;
  const privateState = value.privateState === null
    ? null
    : parseAwayMissionLifecyclePrivateState(value.privateState, {
      missionId: expected.missionId,
      participantUid: actorUid,
      revision: revision as number,
    });
  if ((value.privateState !== null && !privateState) || (expectsPrivateState && !privateState) ||
      (!expectsPrivateState && value.privateState !== null)) {
    throw new Error('The server returned an invalid private away-mission projection.');
  }
  if (stale && (!isRevision(value.expectedRevision) || value.expectedRevision !== expected.expectedRevision ||
      !isRevision(value.currentRevision) || value.currentRevision !== revision ||
      (value.currentRevision as number) <= expected.expectedRevision)) {
    throw new Error('The server returned an invalid stale away-mission result.');
  }
  return {
    status: value.status as AwayMissionLifecycleCallableReply['status'],
    sessionId: value.sessionId,
    missionId: value.missionId,
    requestId: value.requestId,
    revision: revision as number,
    ...(stale ? { expectedRevision: value.expectedRevision as number, currentRevision: value.currentRevision as number } : {}),
    publicState,
    privateState,
  };
}

function commandFingerprint(payload: Data): string {
  const sortValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortValue);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  };
  return JSON.stringify(sortValue(payload));
}

function isAmbiguousTransportFailure(error: unknown): boolean {
  return AMBIGUOUS_TRANSPORT_ERRORS.has(errorCode(error) ?? '');
}

export function createAwayMissionLifecycleActions(
  readContext: () => AwayMissionLifecycleClientContext,
  dependencies: AwayMissionLifecycleActionDependencies = {},
): AwayMissionLifecycleClientActions {
  const invoke = dependencies.invoke ?? invokeLifecycleCallable;
  const createRequestId = dependencies.createRequestId ?? (() => globalThis.crypto.randomUUID());
  let pendingRequest: Readonly<{
    fingerprint: string;
    payload: AwayMissionLifecycleCallablePayload;
  }> | null = null;

  const submit = async (
    type: LifecycleCommandType,
    fields: Omit<AwayMissionLifecycleCallablePayload, 'sessionId' | 'missionId' | 'requestId' | 'expectedRevision' | 'type'> = {},
  ): Promise<void> => {
    const context = readContext();
    if (!context.sessionId || !context.actorUid || context.authenticatedUid !== context.actorUid) {
      throw new Error('The away-mission command belongs to a different authenticated player identity.');
    }
    if (!context.hasFreshServerAuthority) {
      throw new Error('Reconnect until the current mission state is available before continuing.');
    }
    if (!context.sessionIsActive && !pendingRequest) {
      throw new Error('Away-mission commands require the active game session.');
    }
    if (!isNonEmptyString(context.missionId) || !isNonEmptyString(context.missionLeaderUid) ||
        !isRevision(context.revision)) throw new Error('The current away-mission projection is incomplete.');
    if (GM_COMMANDS.has(type)) {
      if (context.actorRole !== 'gm' || !isNonEmptyString(context.instanceId)) {
        throw new Error('Claim an active facilitator instance before changing facilitator mission state.');
      }
    } else {
      if (context.actorRole !== 'player') throw new Error('Join the mission as an active player before continuing.');
      if (LEADER_COMMANDS.has(type) && context.actorUid !== context.missionLeaderUid) {
        throw new Error('Only the Mission Leader can perform this away-mission action.');
      }
    }
    const base: Omit<AwayMissionLifecycleCallablePayload, 'requestId'> = {
      sessionId: context.sessionId,
      missionId: context.missionId,
      expectedRevision: context.revision,
      type,
      ...fields,
      ...(GM_COMMANDS.has(type) ? { instanceId: context.instanceId } : {}),
    };
    const semanticCommand = Object.fromEntries(
      Object.entries(base).filter(([key]) => key !== 'expectedRevision'),
    );
    const fingerprint = commandFingerprint({
      ...semanticCommand,
      actorUid: context.actorUid,
      actorRole: context.actorRole,
    });
    if (pendingRequest && pendingRequest.fingerprint !== fingerprint) {
      throw new Error('Retry the same away-mission request before submitting a different request.');
    }
    const payload = pendingRequest?.payload ?? {
      ...base,
      requestId: createRequestId(),
    };
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(payload.requestId)) {
      throw new Error('The away-mission request identifier is invalid.');
    }
    pendingRequest = { fingerprint, payload };

    try {
      const reply = parseLifecycleReply(
        await invoke(payload), payload, context.actorUid, !GM_COMMANDS.has(type),
      );
      if (reply.status === 'stale') {
        pendingRequest = null;
        throw new Error('The mission state changed while you were working. Review the refreshed mission state and retry.');
      }
      pendingRequest = null;
    } catch (error) {
      if (!isAmbiguousTransportFailure(error) &&
          !(error instanceof Error && /server returned an invalid/i.test(error.message))) {
        pendingRequest = null;
      }
      throw error;
    }
  };

  return {
    requestExtraCards: (count) => submit('requestExtraCards', { count }),
    distributeExtraCard: (participantUid, opportunityId) =>
      submit('distributeExtraCard', { participantUid, opportunityId }),
    openDiscards: () => submit('openDiscards'),
    discardCard: (cardId) => submit('discardCard', { cardId }),
    reclamatorSalvage: (opportunityId, choices) => submit('reclamatorSalvage', { opportunityId, choices }),
    assignCards: (placements) => submit('assignCards', { placements }),
    addFacilitatorCards: () => submit('addFacilitatorCards'),
    resolve: () => submit('resolve'),
    exploreSystems: (opportunityId, targetCoordinates) => submit('exploreSystems', { opportunityId, targetCoordinates }),
    dropOff: (shipId) => submit('dropOff', { shipId }),
  };
}

async function invokeLifecycleCallable(payload: AwayMissionLifecycleCallablePayload): Promise<unknown> {
  const store = useSessionStore.getState();
  const actorUid = store.me?.uid;
  if (!actorUid || store.session?.id !== payload.sessionId) {
    throw new Error('The away-mission command belongs to a different session identity.');
  }
  requireFreshSessionAuthority();
  const checkpoint = captureSessionAuthority(payload.sessionId, actorUid);
  const call = httpsCallable<AwayMissionLifecycleCallablePayload, unknown>(
    functions(), 'commitAwayMissionLifecycleCommand',
  );
  const result = (await call(payload)).data;
  if (!isCurrentSessionAuthority(checkpoint)) {
    throw new Error('The away-mission reply belongs to an earlier session identity. Refresh before continuing.');
  }
  return result;
}

export function createCurrentAwayMissionLifecycleActions(
  readMission: () => Readonly<{ missionId: string; missionLeaderUid: string; revision: number }>,
  sessionId: string,
  actorUid: string,
): AwayMissionLifecycleClientActions {
  return createAwayMissionLifecycleActions(() => createCurrentAwayMissionLifecycleContext(
    readMission(), sessionId, actorUid,
  ));
}

export function createCurrentAwayMissionLifecycleContext(
  mission: Readonly<{ missionId: string; missionLeaderUid: string; revision: number }>,
  sessionId: string,
  actorUid: string,
): AwayMissionLifecycleClientContext {
    const store = useSessionStore.getState();
    const authenticatedUid = auth().currentUser?.uid ?? null;
    const gmInstance = store.gmInstance;
    return {
      sessionId,
      actorUid,
      authenticatedUid,
      actorRole: store.me?.role === 'player' ? 'player' : store.me?.role === 'gm' ? 'gm' : 'other',
      missionId: mission.missionId,
      missionLeaderUid: mission.missionLeaderUid,
      revision: mission.revision,
      sessionIsActive: store.session?.id === sessionId && store.session.phase === 'active',
      hasFreshServerAuthority: hasFreshSessionAuthority(),
      ...(gmInstance?.id ? { instanceId: gmInstance.id } : {}),
    };
}
