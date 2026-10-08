import {
  addFacilitatorCardsFromTopDeck,
  createMissionLifecycleState,
  type MissionLifecycleStateInput,
  allocateBlindExtraMissionCard,
  assignRemainingMissionCards,
  calculateMissionOpportunityTotals,
  discardMissionHandForWarriorReclamator,
  discardMissionCardSecretly,
  missionLeaderCardRequestCounts,
  openMissionDiscarding,
  privateMissionHandForParticipant,
  recordMissionCardRequest,
  type MissionBonusSourceInput,
  type MissionLifecycleState,
  type MissionOpportunityResolution,
} from './missionLifecycle';
import { missionCardForCode } from './missionCards';
import { applyBoaReclamationDifficulty } from './boaMissionReclamation';
import { missionBonusSourcesForShuttleParticipants } from './awayMissionBonuses';
import {
  resolveMissionOpportunityRewards,
  resolveWarriorReclamatorHand,
  type MissionOpportunityRewardResult,
} from './missionRewards';
import type { MissionCardId, MissionDeckRandomIndex } from './missionDeck';
import { missionRewardNeedsChoice, validMissionRewardChoice, missionRewardChoiceOptions, validMissionRewardChoiceProjection,
  type MissionRewardChoice, type MissionRewardSelection, type MissionRewardConsoleTarget,
  type MissionRewardChoiceOptions } from './missionRewardDelivery';

export interface AwayMissionParticipantCrafts {
  readonly participantUid: string;
  readonly craftIds: readonly string[];
}

export interface CreateAwayMissionLifecycleRecordInput {
  readonly sessionId: string;
  readonly groupId: string;
  readonly sourceCycle: number;
  readonly lifecycle: MissionLifecycleState;
  /** Current server-derived group/craft authority at admission. */
  readonly participantCrafts: readonly AwayMissionParticipantCrafts[];
  /** The authenticated Boa participant's one pre-deal card-opportunity choice. */
  readonly boaReclamation?: Readonly<{ actorUid: string; opportunityId: string }>;
}

export interface AwayMissionCustody {
  readonly status: 'mission-leader' | 'dropped-off';
  readonly holderUid: string;
  readonly shipId: string | null;
}

export interface AwayMissionReclamatorSalvage {
  readonly participantUid: string;
  readonly opportunityId: string;
  readonly cardIds: readonly MissionCardId[];
  readonly choices: readonly Readonly<{ cardId: MissionCardId; resource: 'food' | 'water' | 'materials' }>[];
  readonly resources: Readonly<Partial<Record<'food' | 'water' | 'materials', number>>>;
}

export interface AwayMissionSpecialReward {
  readonly opportunityId: string;
  readonly resources: Readonly<Partial<Record<'food' | 'water' | 'materials', number>>>;
}

export interface AwayMissionLifecycleCommandReceipt {
  readonly requestId: string;
  readonly actorUid: string;
  readonly fingerprint: string;
}

export interface AwayMissionLifecycleRecord {
  /** Exact protected command which moved this mission from active to resolved. */
  readonly resolutionRevision?: number;
  readonly resolutionRequestId?: string;
  /** Recipient choices and their live server options remain in protected state. */
  readonly rewardChoices?: readonly MissionRewardSelection[];
  readonly rewardOptions?: readonly MissionRewardChoiceOptions[];
  readonly explorationAppliedOpportunityIds?: readonly string[];
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly groupId: string;
  readonly sourceCycle: number;
  readonly revision: number;
  readonly lifecycle: MissionLifecycleState;
  readonly participantCrafts: readonly AwayMissionParticipantCrafts[];
  /** Server-private pre-deal modifier; never copied to member/public projections. */
  readonly boaReclamation?: Readonly<{ actorUid: string; opportunityId: string }>;
  readonly status: 'active' | 'resolved' | 'complete';
  readonly overrun: boolean;
  readonly outcomes: readonly MissionOpportunityResolution[] | null;
  readonly rewards: readonly MissionOpportunityRewardResult[] | null;
  /** Hidden card-to-resource choices stay in the server-private mission record. */
  readonly reclamatorSalvages: readonly AwayMissionReclamatorSalvage[];
  readonly specialRewards: readonly AwayMissionSpecialReward[] | null;
  readonly custody: AwayMissionCustody;
  readonly legalDropOffShipIds: readonly string[];
  readonly commandReceipts: readonly AwayMissionLifecycleCommandReceipt[];
}

export type AwayMissionLifecycleCommand =
  | Readonly<{ type: 'requestExtraCards'; requestId: string; expectedRevision: number; count: number }>
  | Readonly<{ type: 'distributeExtraCard'; requestId: string; expectedRevision: number; participantUid: string; opportunityId: string }>
  | Readonly<{ type: 'openDiscards'; requestId: string; expectedRevision: number }>
  | Readonly<{ type: 'discardCard'; requestId: string; expectedRevision: number; cardId: MissionCardId }>
  | Readonly<{ type: 'reclamatorSalvage'; requestId: string; expectedRevision: number; opportunityId: string; choices: readonly Readonly<{ cardId: MissionCardId; resource: 'food' | 'water' | 'materials' }>[] }>
  | Readonly<{ type: 'assignCards'; requestId: string; expectedRevision: number; placements: readonly Readonly<{ cardId: MissionCardId; opportunityId: string }>[] }>
  | Readonly<{ type: 'addFacilitatorCards'; requestId: string; expectedRevision: number }>
  | Readonly<{ type: 'resolve'; requestId: string; expectedRevision: number }>
  | Readonly<{ type: 'exploreSystems'; requestId: string; expectedRevision: number; opportunityId: string; targetCoordinates: readonly string[] }>
  | Readonly<{ type: 'chooseRewardTargets'; requestId: string; expectedRevision: number; opportunityId: string; choice: MissionRewardChoice }>
  | Readonly<{ type: 'dropOff'; requestId: string; expectedRevision: number; shipId: string }>;

export interface AwayMissionLifecycleAuthority {
  /** Derived from authentication, never from the command payload. */
  readonly actorUid: string;
  /** Derived from the current server-side GM lease. */
  readonly isActiveGm: boolean;
  readonly teamPhase: boolean;
  readonly currentCycle: number;
  readonly legalDropOffShipIds: readonly string[];
  /** Authoritative role/craft/device sources from the current accepted group. */
  readonly bonusSources?: readonly MissionBonusSourceInput[];
  /** Private server rolls for card-defined difficulty and reward rules. */
  readonly secretD6Rolls?: Readonly<Record<string, number>>;
  /** Cryptographically secure draw/shuffle index source, supplied by Functions. */
  readonly randomIndex?: MissionDeckRandomIndex;
  readonly rewardConsoleTargets?: readonly MissionRewardConsoleTarget[];
}

export type AwayMissionLifecycleCommandResult = Readonly<{
  status: 'committed' | 'replayed' | 'denied';
  record?: AwayMissionLifecycleRecord;
}>;

export interface AwayMissionPublicState {
  readonly explorationAppliedOpportunityIds?: readonly string[];
  readonly missionId: string;
  readonly groupId: string;
  readonly siteCode: string;
  readonly revision: number;
  readonly phase: string;
  readonly status: AwayMissionLifecycleRecord['status'];
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
    outcome: MissionOpportunityResolution['outcome'];
  }>[] | null;
  readonly rewards: readonly MissionOpportunityRewardResult[] | null;
  readonly specialRewards: readonly AwayMissionSpecialReward[] | null;
  readonly custody: AwayMissionCustody;
  readonly legalDropOffShipIds: readonly string[];
}

export interface AwayMissionPrivateState {
  readonly rewardChoices?: readonly MissionRewardSelection[];
  readonly rewardOptions?: readonly MissionRewardChoiceOptions[];
  /** Present only in the leader's own private hand projection. */
  readonly extraCardRecipientUids?: readonly string[];
  readonly assignmentCommitted?: boolean;
  readonly canUseReclamator?: boolean;
  readonly missionId: string;
  readonly participantUid: string;
  readonly revision: number;
  readonly phase: string;
  readonly cards: readonly Readonly<{
    id: MissionCardId;
    value: number;
    status: 'remaining' | 'discarded' | 'assigned';
    opportunityId: string | null;
  }>[];
  readonly reclamatorSalvage: Readonly<{
    opportunityId: string;
    choices: readonly Readonly<{ cardId: MissionCardId; resource: 'food' | 'water' | 'materials' }>[];
  }> | null;
}

const CRAFT_CARD_IDS = new Set<string>([
  'A♥', 'A♦', 'A♣', '4♥', '4♦', '4♣', '5♥', '5♦', '5♣', '6♥', '6♦', '6♣',
  '7♥', '7♦', '7♣', '8♥', '8♦', '8♣', '9♥', '9♦', '9♣', '10♥', '10♦', '10♣',
  'J♥', 'J♦', 'J♣', 'Q♥', 'Q♦', 'Q♣', 'K♥', 'K♦', 'K♣',
]);

export function createAwayMissionLifecycleRecord(
  input: CreateAwayMissionLifecycleRecordInput,
): AwayMissionLifecycleRecord | null {
  if (!isRecord(input) || !isNonEmptyString(input.sessionId) || !isNonEmptyString(input.groupId) ||
      !Number.isSafeInteger(input.sourceCycle) || input.sourceCycle < 1 ||
      !Array.isArray(input.participantCrafts) ||
      missionLeaderCardRequestCounts(input.lifecycle, input.lifecycle?.leaderUid) === null) return null;
  const participants = input.lifecycle.participants;
  const participantIds = new Set(participants.map(({ uid }) => uid));
  if (input.participantCrafts.length !== participants.length) return null;
  const seen = new Set<string>();
  const participantCrafts: AwayMissionParticipantCrafts[] = [];
  for (const binding of input.participantCrafts) {
    if (!isRecord(binding) || !isNonEmptyString(binding.participantUid) ||
        !participantIds.has(binding.participantUid) || seen.has(binding.participantUid) ||
        !Array.isArray(binding.craftIds) || binding.craftIds.some((id) => !isNonEmptyString(id)) ||
        new Set(binding.craftIds).size !== binding.craftIds.length) return null;
    seen.add(binding.participantUid);
    participantCrafts.push({ participantUid: binding.participantUid, craftIds: [...binding.craftIds] });
  }
  if (participants.some((participant) => privateMissionHandForParticipant(input.lifecycle, participant.uid) === null)) {
    return null;
  }
  if (input.boaReclamation !== undefined &&
      (!isRecord(input.boaReclamation) || Object.keys(input.boaReclamation).length !== 2 ||
        typeof input.boaReclamation.actorUid !== 'string' ||
        typeof input.boaReclamation.opportunityId !== 'string' ||
        !missionCardForCode(input.lifecycle.siteCode)?.opportunities.some(({ id }) =>
          id === input.boaReclamation!.opportunityId) ||
        input.lifecycle.availableCarrierCraftIds.includes('boa') !== true ||
        participants.find(({ uid }) => uid === input.boaReclamation!.actorUid)?.roleId !== 'capybara-recycler' ||
        !participantCrafts.find(({ participantUid }) => participantUid === input.boaReclamation!.actorUid)
          ?.craftIds.includes('boa'))) return null;
  return {
    schemaVersion: 1,
    sessionId: input.sessionId,
    groupId: input.groupId,
    sourceCycle: input.sourceCycle,
    revision: 0,
    lifecycle: input.lifecycle,
    participantCrafts,
    ...(input.boaReclamation ? { boaReclamation: { ...input.boaReclamation } } : {}),
    status: 'active',
    overrun: false,
    outcomes: null,
    rewards: null,
    reclamatorSalvages: [],
    specialRewards: null,
    custody: { status: 'mission-leader', holderUid: input.lifecycle.leaderUid, shipId: null },
    legalDropOffShipIds: [],
    commandReceipts: [],
  };
}

/** Seed the lifecycle and its two entitled views in the initial deal transaction. */
export function createAwayMissionLifecycleBootstrap(input: Readonly<{
  sessionId: string;
  groupId: string;
  sourceCycle: number;
  revision?: number;
  lifecycle: MissionLifecycleStateInput;
  participantCrafts: readonly AwayMissionParticipantCrafts[];
  boaReclamation?: Readonly<{ actorUid: string; opportunityId: string }>;
}>): Readonly<{
  record: AwayMissionLifecycleRecord;
  participantStates: readonly Readonly<{
    participantUid: string;
    privateState: AwayMissionPrivateState;
    publicState: AwayMissionPublicState;
  }>[];
}> | null {
  if (!isRecord(input) || (input.revision !== undefined &&
      (!Number.isSafeInteger(input.revision) || input.revision < 0))) return null;
  const lifecycle = createMissionLifecycleState(input.lifecycle);
  if (!lifecycle) return null;
  const initialRecord = createAwayMissionLifecycleRecord({ ...input, lifecycle });
  if (!initialRecord) return null;
  const record = { ...initialRecord, revision: input.revision ?? 0 };
  const participantStates = [];
  for (const { uid: participantUid } of lifecycle.participants) {
    const privateState = projectAwayMissionPrivateState(record, participantUid);
    const publicState = projectAwayMissionPublicState(record, participantUid);
    if (!privateState || !publicState) return null;
    participantStates.push({ participantUid, privateState, publicState });
  }
  return { record, participantStates };
}

/** Apply one authenticated server command to the private authoritative mission record. */
export function applyAwayMissionLifecycleCommand(
  record: AwayMissionLifecycleRecord,
  command: AwayMissionLifecycleCommand,
  authority: AwayMissionLifecycleAuthority,
): AwayMissionLifecycleCommandResult {
  if (!isValidRecord(record) || !isRecord(command) || !isRecord(authority) ||
      !isNonEmptyString(authority.actorUid) || typeof authority.isActiveGm !== 'boolean' ||
      typeof authority.teamPhase !== 'boolean' || !Number.isSafeInteger(authority.currentCycle) ||
      authority.currentCycle < record.sourceCycle || !Array.isArray(authority.legalDropOffShipIds) ||
      authority.legalDropOffShipIds.some((id) => !isNonEmptyString(id)) ||
      new Set(authority.legalDropOffShipIds).size !== authority.legalDropOffShipIds.length ||
      (authority.bonusSources !== undefined && !Array.isArray(authority.bonusSources)) ||
      (authority.secretD6Rolls !== undefined && !isRecord(authority.secretD6Rolls)) ||
      (authority.randomIndex !== undefined && typeof authority.randomIndex !== 'function')) return { status: 'denied' };
  const expectedKeys = COMMAND_KEYS[command.type as AwayMissionLifecycleCommand['type']];
  if (!expectedKeys || !hasOnlyKeys(command, expectedKeys) || !isNonEmptyString(command.requestId) ||
      !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) return { status: 'denied' };
  const fingerprint = stableStringify(command);
  const prior = record.commandReceipts.find((receipt) => receipt.requestId === command.requestId);
  if (prior) {
    if (prior.actorUid !== authority.actorUid || prior.fingerprint !== fingerprint) return { status: 'denied' };
    return { status: 'replayed', record };
  }
  if (command.expectedRevision !== record.revision || record.status === 'complete' ||
      (authority.teamPhase && !record.overrun) ||
      (record.status === 'active' && authority.currentCycle > record.sourceCycle && !record.overrun)) {
    return { status: 'denied' };
  }

  let nextLifecycle: MissionLifecycleState | null = null;
  let nextStatus: AwayMissionLifecycleRecord['status'] = record.status;
  let nextOutcomes = record.outcomes;
  let nextRewards = record.rewards;
  let nextSpecialRewards = record.specialRewards;
  let nextReclamatorSalvages = record.reclamatorSalvages;
  let nextLegalDropOffShipIds = record.legalDropOffShipIds;
  let nextCustody = record.custody;
  let nextRewardChoices = record.rewardChoices;
  let nextRewardOptions = record.rewardOptions;

  switch (command.type) {
    case 'requestExtraCards': {
      if (!isParticipant(record.lifecycle, authority.actorUid) || !Number.isSafeInteger(command.count) ||
          command.count < 1 || command.count > missionCardForCode(record.lifecycle.siteCode)!.opportunityCount) {
        return { status: 'denied' };
      }
      nextLifecycle = recordMissionCardRequest(record.lifecycle, authority.actorUid, { count: command.count });
      break;
    }
    case 'distributeExtraCard': {
      if (authority.actorUid !== record.lifecycle.leaderUid || !isNonEmptyString(command.participantUid) ||
          !isNonEmptyString(command.opportunityId)) return { status: 'denied' };
      const allocated = allocateBlindExtraMissionCard(record.lifecycle, {
        actorUid: authority.actorUid,
        participantUid: command.participantUid,
        opportunityId: command.opportunityId,
        requestId: command.requestId,
      });
      nextLifecycle = allocated?.state ?? null;
      break;
    }
    case 'openDiscards':
      if (!authority.isActiveGm || record.lifecycle.phase !== 'awaiting-card-selection') return { status: 'denied' };
      nextLifecycle = openMissionDiscarding(record.lifecycle);
      break;
    case 'discardCard':
      if (!isParticipant(record.lifecycle, authority.actorUid) || typeof command.cardId !== 'string' ||
          !CRAFT_CARD_IDS.has(command.cardId)) return { status: 'denied' };
      nextLifecycle = discardMissionCardSecretly(record.lifecycle, authority.actorUid, command.cardId as MissionCardId)?.state ?? null;
      break;
    case 'reclamatorSalvage': {
      const participant = record.lifecycle.participants.find(({ uid }) => uid === authority.actorUid);
      const craftBinding = record.participantCrafts.find(({ participantUid }) => participantUid === authority.actorUid);
      const privateHand = privateMissionHandForParticipant(record.lifecycle, authority.actorUid);
      if (!participant || participant.roleId !== 'warrior-captain' || !craftBinding?.craftIds.includes('warrior') ||
          !privateHand || record.lifecycle.phase !== 'discarding' || !Array.isArray(command.choices) ||
          record.reclamatorSalvages.some(salvage => salvage.opportunityId === command.opportunityId)) {
        return { status: 'denied' };
      }
      const handCardIds = privateHand.cards.filter(({ status }) => status === 'remaining').map(({ id }) => id);
      const salvage = resolveWarriorReclamatorHand({
        participantUid: authority.actorUid,
        roleId: participant.roleId,
        siteCode: record.lifecycle.siteCode,
        opportunityId: command.opportunityId,
        handCardIds,
        choices: command.choices,
      });
      const discarded = discardMissionHandForWarriorReclamator(record.lifecycle, authority.actorUid, command.opportunityId);
      if (!salvage || !discarded) return { status: 'denied' };
      nextLifecycle = discarded.state;
      nextReclamatorSalvages = [...record.reclamatorSalvages, {
        participantUid: salvage.participantUid,
        opportunityId: salvage.opportunityId,
        cardIds: salvage.discardedCardIds,
        choices: command.choices,
        resources: salvage.resources,
      }];
      break;
    }
    case 'assignCards':
      if (!isParticipant(record.lifecycle, authority.actorUid) || !Array.isArray(command.placements)) {
        return { status: 'denied' };
      }
      if (command.placements.some(placement => record.reclamatorSalvages.some(salvage =>
        salvage.opportunityId === placement?.opportunityId))) return { status: 'denied' };
      nextLifecycle = assignRemainingMissionCards(record.lifecycle, authority.actorUid, command.placements)?.state ?? null;
      break;
    case 'addFacilitatorCards': {
      if (!authority.isActiveGm || typeof authority.randomIndex !== 'function') return { status: 'denied' };
      nextLifecycle = addFacilitatorCardsFromTopDeck(
        record.lifecycle,
        command.requestId,
        authority.randomIndex,
      )?.state ?? null;
      break;
    }
    case 'resolve': {
      if (!authority.isActiveGm || record.status !== 'active') return { status: 'denied' };
      const serverBonusSources = authority.bonusSources ?? [];
      const nonMissionShuttleSources = serverBonusSources.filter((candidate) => !isMissionShuttleSource(candidate));
      const shuttleSources = missionBonusSourcesForShuttleParticipants(record.lifecycle, record.participantCrafts);
      const calculatedOutcomes = calculateMissionOpportunityTotals(
        record.lifecycle,
        [...nonMissionShuttleSources, ...shuttleSources],
        authority.secretD6Rolls ?? {},
      );
      const outcomes = calculatedOutcomes && record.boaReclamation
        ? applyBoaReclamationDifficulty(calculatedOutcomes, record.boaReclamation.opportunityId)
        : calculatedOutcomes;
      if (!outcomes) return { status: 'denied' };
      const rewards = resolveMissionOpportunityRewards(record.lifecycle.siteCode, outcomes, {
        secretD6Rolls: authority.secretD6Rolls ?? {},
        bulkHaulageContributorUidsByOpportunity: bulkHaulageContributorsByOpportunity(record),
        ...(record.boaReclamation
          ? { boaReclamationOpportunityId: record.boaReclamation.opportunityId } : {}),
      });
      if (!rewards) return { status: 'denied' };
      nextLifecycle = record.lifecycle;
      nextStatus = 'resolved';
      nextOutcomes = outcomes;
      nextRewards = rewards;
      nextSpecialRewards = aggregateSpecialRewards(record.reclamatorSalvages);
      nextLegalDropOffShipIds = [...new Set(authority.legalDropOffShipIds)];
      nextRewardOptions = missionRewardChoiceOptions(rewards, authority.rewardConsoleTargets ?? []);
      nextRewardChoices = [];
      break;
    }
    case 'exploreSystems': {
      const reward = record.rewards?.find(({ opportunityId }) => opportunityId === command.opportunityId);
      if (!authority.isActiveGm || record.status !== 'resolved' || !reward || reward.branch === 'none' ||
          !reward.effects.some(({ kind }) => kind === 'exploreStarSystems') ||
          record.explorationAppliedOpportunityIds?.includes(command.opportunityId) ||
          !Array.isArray(command.targetCoordinates) || command.targetCoordinates.length !== 2 ||
          command.targetCoordinates.some(coordinate => typeof coordinate !== 'string' || !/^\d{4}$/.test(coordinate)) ||
          new Set(command.targetCoordinates).size !== 2) return { status: 'denied' };
      nextLifecycle = record.lifecycle;
      break;
    }
    case 'chooseRewardTargets': {
      const reward = record.rewards?.find(({ opportunityId }) => opportunityId === command.opportunityId);
      if (record.status !== 'resolved' || authority.actorUid !== record.lifecycle.leaderUid ||
          !reward || !validMissionRewardChoice(reward, command.choice)) return { status: 'denied' };
      nextLifecycle = record.lifecycle;
      nextRewardChoices = [...(record.rewardChoices ?? []).filter(choice => choice.opportunityId !== command.opportunityId),
        { opportunityId: command.opportunityId, choice: command.choice }];
      nextRewardOptions = missionRewardChoiceOptions(record.rewards ?? [], authority.rewardConsoleTargets ?? []);
      nextLegalDropOffShipIds = [...authority.legalDropOffShipIds];
      break;
    }
    case 'dropOff':
      if (record.rewards?.some(reward => missionRewardNeedsChoice(reward) &&
          !(record.rewardChoices ?? []).some(selection => selection.opportunityId === reward.opportunityId && validMissionRewardChoice(reward, selection.choice)))) return { status: 'denied' };
      if (record.rewards?.some(reward => reward.effects.some(({ kind }) => kind === 'exploreStarSystems') &&
          !record.explorationAppliedOpportunityIds?.includes(reward.opportunityId))) return { status: 'denied' };
      if (record.status !== 'resolved' || authority.actorUid !== record.lifecycle.leaderUid ||
          !isNonEmptyString(command.shipId) || !record.legalDropOffShipIds.includes(command.shipId) ||
          !authority.legalDropOffShipIds.includes(command.shipId)) return { status: 'denied' };
      nextLifecycle = record.lifecycle;
      nextStatus = 'complete';
      nextLegalDropOffShipIds = [...authority.legalDropOffShipIds];
      nextCustody = { status: 'dropped-off', holderUid: record.lifecycle.leaderUid, shipId: command.shipId };
      break;
    default:
      return { status: 'denied' };
  }
  if (!nextLifecycle) return { status: 'denied' };

  const nextRecord: AwayMissionLifecycleRecord = {
    ...record,
    ...(record.status === 'active' && nextStatus === 'resolved' ? {
      resolutionRevision: record.revision + 1, resolutionRequestId: command.requestId,
    } : {}),
    ...(command.type === 'exploreSystems' ? { explorationAppliedOpportunityIds: [
      ...(record.explorationAppliedOpportunityIds ?? []), command.opportunityId,
    ] } : {}),
    revision: record.revision + 1,
    lifecycle: nextLifecycle,
    status: nextStatus,
    outcomes: nextOutcomes,
    rewards: nextRewards,
    reclamatorSalvages: nextReclamatorSalvages,
    specialRewards: nextSpecialRewards,
    custody: nextCustody,
    ...(nextRewardChoices === undefined ? {} : { rewardChoices: nextRewardChoices }),
    ...(nextRewardOptions === undefined ? {} : { rewardOptions: nextRewardOptions }),
    legalDropOffShipIds: nextLegalDropOffShipIds,
    commandReceipts: [...record.commandReceipts, {
      requestId: command.requestId,
      actorUid: authority.actorUid,
      fingerprint,
    }],
  };
  return { status: 'committed', record: nextRecord };
}

/** Return a participant's current private cards and only those cards. */
export function projectAwayMissionPrivateState(
  record: AwayMissionLifecycleRecord,
  participantUid: string,
): AwayMissionPrivateState | null {
  if (!isValidRecord(record) || !isParticipant(record.lifecycle, participantUid)) return null;
  const privateHand = privateMissionHandForParticipant(record.lifecycle, participantUid);
  if (!privateHand) return null;
  const cards = privateHand.cards.map((card) => ({
    id: card.id,
    value: card.value,
    status: card.status,
    opportunityId: record.lifecycle.assignments.find((assignment) => assignment.cardId === card.id)?.opportunityId ?? null,
  }));
  return {
    ...(participantUid === record.lifecycle.leaderUid && record.rewardOptions ? { rewardOptions: record.rewardOptions, rewardChoices: record.rewardChoices ?? [] } : {}),
    ...(participantUid === record.lifecycle.leaderUid ? { extraCardRecipientUids: record.lifecycle.participants.map(({ uid }) => uid) } : {}),
    assignmentCommitted: record.lifecycle.assignedParticipantUids.includes(participantUid),
    canUseReclamator: record.lifecycle.participants.find(({ uid }) => uid === participantUid)?.roleId === 'warrior-captain' &&
      record.participantCrafts.some((binding) => binding.participantUid === participantUid && binding.craftIds.includes('warrior')),
    missionId: record.lifecycle.missionId,
    participantUid,
    revision: record.revision,
    phase: record.status === 'resolved' || record.status === 'complete' ? record.status : record.lifecycle.phase,
    cards,
    reclamatorSalvage: (() => {
      const salvage = record.reclamatorSalvages.find(({ participantUid: owner }) => owner === participantUid);
      return salvage ? { opportunityId: salvage.opportunityId, choices: salvage.choices } : null;
    })(),
  };
}

/** A redacted member projection; private card values and unrevealed assignments never enter it. */
export function projectAwayMissionPublicState(
  record: AwayMissionLifecycleRecord,
  viewerUid?: string,
): AwayMissionPublicState | null {
  if (!isValidRecord(record)) return null;
  const definition = missionCardForCode(record.lifecycle.siteCode);
  if (!definition) return null;
  const outcomes = record.status === 'active' || !record.outcomes
    ? null
    : record.outcomes.map(({ opportunityId, contributorCount, total, bonusTotal, difficulty, criticalThreshold, outcome }) => ({
      opportunityId, contributorCount, total, bonusTotal, difficulty, criticalThreshold, outcome,
    }));
  const rewards = record.status === 'active' ? null : record.rewards;
  return {
    ...(record.explorationAppliedOpportunityIds ? { explorationAppliedOpportunityIds: record.explorationAppliedOpportunityIds } : {}),
    missionId: record.lifecycle.missionId,
    groupId: record.groupId,
    siteCode: record.lifecycle.siteCode,
    revision: record.revision,
    phase: record.status === 'active' ? record.lifecycle.phase : record.status,
    status: record.status,
    overrun: record.overrun,
    missionLeaderUid: record.lifecycle.leaderUid,
    participantCount: record.lifecycle.participants.length,
    opportunities: definition.opportunities.map(({ id, description }) => ({ id, label: description })),
    requestCounts: viewerUid === record.lifecycle.leaderUid
      ? missionLeaderCardRequestCounts(record.lifecycle, viewerUid) ?? []
      : [],
    outcomes,
    rewards,
    specialRewards: record.status === 'active' ? null : record.specialRewards,
    custody: record.custody,
    legalDropOffShipIds: record.status === 'resolved' && viewerUid === record.lifecycle.leaderUid
      ? record.legalDropOffShipIds
      : [],
  };
}

/** Team-phase rollover leaves a running mission and its committed craft active. */
export function markAwayMissionOverrun(
  record: AwayMissionLifecycleRecord,
  teamPhaseOrNextCycle: boolean | number,
): AwayMissionLifecycleRecord {
  if (!isValidRecord(record) || record.status !== 'active') return record;
  const crossedBoundary = teamPhaseOrNextCycle === true ||
    (typeof teamPhaseOrNextCycle === 'number' && Number.isSafeInteger(teamPhaseOrNextCycle) &&
      teamPhaseOrNextCycle > record.sourceCycle);
  return crossedBoundary && !record.overrun ? { ...record, overrun: true } : record;
}

/** Prevent committed mission craft from moving until the active lifecycle resolves. */
export function missionBlocksCommittedCraftMovement(
  record: AwayMissionLifecycleRecord,
  craftId: string,
): boolean {
  return isValidRecord(record) && record.status === 'active' &&
    record.participantCrafts.some(({ craftIds }) => craftIds.includes(craftId));
}

const COMMAND_KEYS: Readonly<Record<AwayMissionLifecycleCommand['type'], readonly string[]>> = {
  requestExtraCards: ['type', 'requestId', 'expectedRevision', 'count'],
  distributeExtraCard: ['type', 'requestId', 'expectedRevision', 'participantUid', 'opportunityId'],
  openDiscards: ['type', 'requestId', 'expectedRevision'],
  discardCard: ['type', 'requestId', 'expectedRevision', 'cardId'],
  reclamatorSalvage: ['type', 'requestId', 'expectedRevision', 'opportunityId', 'choices'],
  assignCards: ['type', 'requestId', 'expectedRevision', 'placements'],
  addFacilitatorCards: ['type', 'requestId', 'expectedRevision'],
  resolve: ['type', 'requestId', 'expectedRevision'],
  exploreSystems: ['type', 'requestId', 'expectedRevision', 'opportunityId', 'targetCoordinates'],
  chooseRewardTargets: ['type', 'requestId', 'expectedRevision', 'opportunityId', 'choice'],
  dropOff: ['type', 'requestId', 'expectedRevision', 'shipId'],
};

function isValidRecord(value: unknown): value is AwayMissionLifecycleRecord {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isNonEmptyString(value.sessionId) ||
      !isNonEmptyString(value.groupId) || !Number.isSafeInteger(value.sourceCycle) ||
      typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !['active', 'resolved', 'complete'].includes(String(value.status)) || typeof value.overrun !== 'boolean' ||
      !Array.isArray(value.participantCrafts) || !Array.isArray(value.commandReceipts) ||
      !Array.isArray(value.legalDropOffShipIds) || !Array.isArray(value.reclamatorSalvages) ||
      missionLeaderCardRequestCounts(value.lifecycle as MissionLifecycleState, (value.lifecycle as MissionLifecycleState)?.leaderUid) === null) {
    return false;
  }
  const lifecycle = value.lifecycle as MissionLifecycleState;
  if ((value.resolutionRevision !== undefined || value.resolutionRequestId !== undefined) &&
      (value.status === 'active' || !Number.isSafeInteger(value.resolutionRevision) || (value.resolutionRevision as number) < 1 ||
        (value.resolutionRevision as number) > value.revision || !isNonEmptyString(value.resolutionRequestId) ||
        !value.commandReceipts.some(receipt => isRecord(receipt) && receipt.requestId === value.resolutionRequestId))) return false;
  if ((value.rewardOptions !== undefined || value.rewardChoices !== undefined) &&
      !validMissionRewardChoiceProjection(value.rewardOptions, value.rewardChoices)) return false;
  if (value.rewardChoices !== undefined) {
    if (!Array.isArray(value.rewardChoices)) return false;
    const choices = new Set<string>();
    for (const selection of value.rewardChoices) {
      if (!isRecord(selection) || Object.keys(selection).length !== 2 || !isNonEmptyString(selection.opportunityId) || choices.has(selection.opportunityId) ||
          !Array.isArray(value.rewards)) return false;
      const reward = (value.rewards as unknown as MissionOpportunityRewardResult[]).find(reward => reward.opportunityId === selection.opportunityId);
      if (!reward || !validMissionRewardChoice(reward, selection.choice)) return false;
      choices.add(selection.opportunityId);
    }
  }
  const leaderUid = lifecycle.leaderUid;
  const definition = missionCardForCode(lifecycle.siteCode);
  if (!definition || !isRecord(value.custody) || value.custody.holderUid !== leaderUid ||
      !['mission-leader', 'dropped-off'].includes(String(value.custody.status)) ||
      (value.custody.shipId !== null && !isNonEmptyString(value.custody.shipId)) ||
      value.legalDropOffShipIds.some((id) => !isNonEmptyString(id)) ||
      new Set(value.legalDropOffShipIds).size !== value.legalDropOffShipIds.length) return false;

  if (value.explorationAppliedOpportunityIds !== undefined &&
      (!Array.isArray(value.explorationAppliedOpportunityIds) ||
        new Set(value.explorationAppliedOpportunityIds).size !== value.explorationAppliedOpportunityIds.length ||
        value.explorationAppliedOpportunityIds.some(id => typeof id !== 'string' ||
          !(value.rewards as readonly MissionOpportunityRewardResult[] | null)?.some(reward =>
            reward.opportunityId === id && reward.branch !== 'none' &&
            reward.effects.some(({ kind }) => kind === 'exploreStarSystems'))))) return false;

  const participantIds = new Set(lifecycle.participants.map(({ uid }) => uid));
  if (value.participantCrafts.length !== participantIds.size) return false;
  const craftBindings = new Map<string, readonly string[]>();
  for (const binding of value.participantCrafts) {
    if (!isRecord(binding) || !isNonEmptyString(binding.participantUid) ||
        !participantIds.has(binding.participantUid) || craftBindings.has(binding.participantUid) ||
        !Array.isArray(binding.craftIds) || binding.craftIds.some((id) => !isNonEmptyString(id)) ||
        new Set(binding.craftIds).size !== binding.craftIds.length) return false;
    craftBindings.set(binding.participantUid, binding.craftIds as string[]);
  }

  if (value.boaReclamation !== undefined) {
    const reclamation = value.boaReclamation;
    if (!isRecord(reclamation) || Object.keys(reclamation).length !== 2 ||
        !isNonEmptyString(reclamation.actorUid) || !isNonEmptyString(reclamation.opportunityId) ||
        !definition.opportunities.some(({ id }) => id === reclamation.opportunityId) ||
        !lifecycle.availableCarrierCraftIds.includes('boa') ||
        lifecycle.participants.find(({ uid }) => uid === reclamation.actorUid)?.roleId !== 'capybara-recycler' ||
        !craftBindings.get(reclamation.actorUid)?.includes('boa')) return false;
  }

  const receiptIds = new Set<string>();
  for (const receipt of value.commandReceipts) {
    if (!isRecord(receipt) || !isNonEmptyString(receipt.requestId) || !isNonEmptyString(receipt.actorUid) ||
        typeof receipt.fingerprint !== 'string' || receipt.fingerprint.length === 0 || receiptIds.has(receipt.requestId)) {
      return false;
    }
    receiptIds.add(receipt.requestId);
  }

  const salvageByUid = new Map<string, AwayMissionReclamatorSalvage>();
  const salvagedOpportunities = new Set<string>();
  for (const salvage of value.reclamatorSalvages) {
    if (!isRecord(salvage) || !isNonEmptyString(salvage.participantUid) ||
        salvageByUid.has(salvage.participantUid) || !participantIds.has(salvage.participantUid) ||
        lifecycle.participants.find(({ uid }) => uid === salvage.participantUid)?.roleId !== 'warrior-captain' ||
        !craftBindings.get(salvage.participantUid)?.includes('warrior') ||
        typeof salvage.opportunityId !== 'string' || salvagedOpportunities.has(salvage.opportunityId) ||
        lifecycle.assignments.some(assignment => assignment.opportunityId === salvage.opportunityId)) return false;
    salvagedOpportunities.add(salvage.opportunityId);
    const privateHand = privateMissionHandForParticipant(lifecycle, salvage.participantUid);
    if (!privateHand) return false;
    const salvaged = resolveWarriorReclamatorHand({
      participantUid: salvage.participantUid,
      roleId: 'warrior-captain',
      siteCode: lifecycle.siteCode,
      opportunityId: salvage.opportunityId as string,
      handCardIds: salvage.cardIds as MissionCardId[],
      choices: salvage.choices as AwayMissionReclamatorSalvage['choices'],
    });
    const lifecycleCardIds = lifecycle.reclamatorCardIds.filter((cardId) =>
      lifecycle.cards.some((card) => card.cardId === cardId && card.participantUid === salvage.participantUid));
    if (!salvaged || !Array.isArray(salvage.cardIds) || !Array.isArray(salvage.choices) ||
        stableStringify(salvage.cardIds) !== stableStringify(lifecycleCardIds) ||
        stableStringify(salvage.resources) !== stableStringify(salvaged.resources)) return false;
    salvageByUid.set(salvage.participantUid, salvage as unknown as AwayMissionReclamatorSalvage);
  }
  if (lifecycle.reclamatorOpportunityClaims?.some(claim =>
      salvageByUid.get(claim.participantUid)?.opportunityId !== claim.opportunityId)) return false;
  if (salvageByUid.size !== lifecycle.reclamatorParticipantUids.length ||
      lifecycle.reclamatorParticipantUids.some((uid) => !salvageByUid.has(uid))) return false;

  if (value.status === 'active' && (value.outcomes !== null || value.rewards !== null || value.specialRewards !== null ||
      value.custody.status !== 'mission-leader' || value.custody.shipId !== null || value.legalDropOffShipIds.length !== 0)) {
    return false;
  }
  if (value.status !== 'active' && (!Array.isArray(value.outcomes) || !Array.isArray(value.rewards) ||
      !Array.isArray(value.specialRewards) || lifecycle.phase !== 'facilitator-cards-added' ||
      value.outcomes.length !== definition.opportunities.length || value.rewards.length !== definition.opportunities.length ||
      (value.status === 'resolved' && (value.custody.status !== 'mission-leader' || value.custody.shipId !== null)) ||
      (value.status === 'complete' && (value.custody.status !== 'dropped-off' || !isNonEmptyString(value.custody.shipId))))) {
    return false;
  }
  if (value.status !== 'active') {
    const expectedSpecialRewards = aggregateSpecialRewards(value.reclamatorSalvages as AwayMissionReclamatorSalvage[]);
    if (stableStringify(value.specialRewards) !== stableStringify(expectedSpecialRewards)) return false;
  }
  return true;
}

function isParticipant(state: MissionLifecycleState, participantUid: string): boolean {
  return state.participants.some((participant) => participant.uid === participantUid);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function aggregateSpecialRewards(
  salvages: readonly AwayMissionReclamatorSalvage[],
): readonly AwayMissionSpecialReward[] {
  const byOpportunity = new Map<string, Partial<Record<'food' | 'water' | 'materials', number>>>();
  for (const salvage of salvages) {
    const resources = byOpportunity.get(salvage.opportunityId) ?? {};
    for (const [resource, amount] of Object.entries(salvage.resources)) {
      if (amount !== undefined) {
        const id = resource as 'food' | 'water' | 'materials';
        resources[id] = (resources[id] ?? 0) + amount;
      }
    }
    byOpportunity.set(salvage.opportunityId, resources);
  }
  return [...byOpportunity.entries()].map(([opportunityId, resources]) => ({ opportunityId, resources }));
}

function bulkHaulageContributorsByOpportunity(
  record: AwayMissionLifecycleRecord,
): Readonly<Record<string, readonly string[]>> {
  const participantByUid = new Map(record.lifecycle.participants.map((participant) => [participant.uid, participant]));
  const craftIdsByUid = new Map(record.participantCrafts.map(({ participantUid, craftIds }) => [participantUid, craftIds]));
  const result: Record<string, string[]> = {};
  for (const assignment of record.lifecycle.assignments) {
    const participant = participantByUid.get(assignment.participantUid);
    const craftIds = craftIdsByUid.get(assignment.participantUid) ?? [];
    if (participant?.roleId !== 'capybara-small-captain' || !craftIds.includes('capybara-small')) continue;
    const contributors = result[assignment.opportunityId] ?? [];
    if (!contributors.includes(participant.uid)) contributors.push(participant.uid);
    result[assignment.opportunityId] = contributors;
  }
  return result;
}

function isMissionShuttleSource(candidate: unknown): boolean {
  if (!isRecord(candidate) || !isRecord(candidate.source)) return false;
  return candidate.source.kind === 'craft' &&
    ['starlight', 'hummingbird', 'highwall', 'endeavour', 'pdf-escort-fighter-wing'].includes(String(candidate.source.id));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
