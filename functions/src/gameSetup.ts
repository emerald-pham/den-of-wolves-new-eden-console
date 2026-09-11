import {
  isJointEngineeringRoleAvailable,
  isJointEngineeringRoleId,
  recommendedRoleIds,
} from './roleConfiguration';
import { PRESENCE_LEASE_MS } from './sessionLifecycle';
import { entityId } from './identifiers';
import type {
  PlayerId,
  RoleId,
  SeatId,
  VesselId,
} from './identifiers';

export const SUPPORTED_PLAYER_COUNTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;
export const SUPPORTED_CHART_IDS = ['A', 'B', 'C'] as const;
export const SUPPORTED_EXPANSION_MODES = ['base', 'capybara', 'none'] as const;
export const SUPPORTED_TURN_LIMITS = [6, 7, 8] as const;

export type SessionChartId = typeof SUPPORTED_CHART_IDS[number];
export type SessionExpansionMode = typeof SUPPORTED_EXPANSION_MODES[number];
export type SessionTurnLimit = typeof SUPPORTED_TURN_LIMITS[number];
/** The one vessel definition a session may use for its complete setup. */
export type SessionVesselMode = 'base-capybara' | 'expansion-capybara' | 'none';

export interface SessionConfiguration {
  readonly playerCount: number;
  readonly chartId: SessionChartId;
  readonly expansion: SessionExpansionMode;
  readonly turnLimit: SessionTurnLimit;
  readonly dioneEnabled: boolean;
  readonly capybaraEnabled: boolean;
  /** Optional loyalty variants are explicit setup choices and default off. */
  readonly universalArbourEnabled: boolean;
  readonly wolfCultEnabled: boolean;
}

/** The immutable setup tuple persisted alongside the legacy session fields. */
export interface CanonicalSessionSetup extends SessionConfiguration {
  readonly activeRoleIds: readonly RoleId[];
  readonly activeVesselIds: readonly VesselId[];
}

/**
 * Resolve the effective Capybara definition from the persisted setup tuple.
 *
 * `base` with Capybara disabled is a legacy representation of the no-Capybara
 * choice. Keep that representation readable while making the effective mode
 * unambiguous for locks and composition checks.
 */
export function vesselModeForConfiguration(
  configuration: Pick<SessionConfiguration, 'expansion' | 'capybaraEnabled'>,
): SessionVesselMode {
  if (configuration.expansion === 'capybara') return 'expansion-capybara';
  if (configuration.expansion === 'none' || configuration.capybaraEnabled === false) return 'none';
  return 'base-capybara';
}

/** Reject a roster that would combine base and expansion Capybara definitions. */
export function validateVesselModeRoster(
  configuration: Pick<SessionConfiguration, 'expansion'>,
  activeRoleIds: readonly string[],
): void {
  const capybaraRoleIds = activeRoleIds.filter((roleId) => roleId.startsWith('capybara-'));
  if (configuration.expansion !== 'capybara') {
    if (capybaraRoleIds.length > 0) {
      throw new Error('Expansion Capybara roles are unavailable outside expansion mode.');
    }
    return;
  }
  const expectedRoles = ['capybara-captain', 'capybara-recycler'];
  if (capybaraRoleIds.length !== expectedRoles.length ||
      expectedRoles.some((roleId) => !capybaraRoleIds.includes(roleId))) {
    throw new Error('Expansion mode requires the complete Capybara role pair.');
  }
}

export interface StableSeatRecord {
  readonly id: SeatId;
  readonly roleId: RoleId;
  readonly label: string;
  readonly factionId: VesselId | null;
  readonly status: 'open';
  readonly holderUid: PlayerId | null;
  readonly claimedAt: null;
}

/** Defaults preserve sessions created before setup configuration was added. */
export const DEFAULT_SESSION_CONFIGURATION: SessionConfiguration = {
  playerCount: 18,
  chartId: 'A',
  expansion: 'base',
  turnLimit: 8,
  dioneEnabled: true,
  capybaraEnabled: true,
  universalArbourEnabled: false,
  wolfCultEnabled: false,
};

function isOneOf<T extends string | number>(value: unknown, values: readonly T[]): value is T {
  return values.includes(value as T);
}

function booleanOption(
  input: Readonly<Record<string, unknown>>,
  key: string,
  fallback: boolean,
): boolean {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${key} must be boolean.`);
  return value;
}

/** Validate and normalize the options that become immutable at game start. */
export function normalizeSessionConfiguration(
  input: Readonly<Record<string, unknown>>,
): SessionConfiguration {
  const playerCount = input.playerCount === undefined
    ? DEFAULT_SESSION_CONFIGURATION.playerCount
    : input.playerCount;
  if (!isOneOf(playerCount, SUPPORTED_PLAYER_COUNTS)) {
    throw new Error('playerCount must be an integer from 8 through 20.');
  }

  const chartId = input.chartId === undefined ? DEFAULT_SESSION_CONFIGURATION.chartId : input.chartId;
  if (!isOneOf(chartId, SUPPORTED_CHART_IDS)) throw new Error('chartId must be A, B, or C.');

  // The legacy empty shape remains base-game compatible. For the two
  // expansion-only player counts, an omitted mode means the printed Capybara
  // pair; an explicit base/none request is rejected below rather than being
  // silently converted.
  const expansion = input.expansion === undefined
    ? (playerCount >= 19 ? 'capybara' : DEFAULT_SESSION_CONFIGURATION.expansion)
    : input.expansion;
  if (!isOneOf(expansion, SUPPORTED_EXPANSION_MODES)) {
    throw new Error('expansion must be base, capybara, or none.');
  }

  const turnLimit = input.turnLimit === undefined
    ? DEFAULT_SESSION_CONFIGURATION.turnLimit
    : input.turnLimit;
  if (!isOneOf(turnLimit, SUPPORTED_TURN_LIMITS)) {
    throw new Error('turnLimit must be 6, 7, or 8.');
  }

  const dioneDefault = playerCount >= 12;
  const dioneEnabled = booleanOption(input, 'dioneEnabled', dioneDefault);
  if (playerCount < 12 && dioneEnabled) {
    throw new Error('Dione is unavailable below 12 players.');
  }

  const capybaraDefault = expansion !== 'none';
  const capybaraEnabled = booleanOption(input, 'capybaraEnabled', capybaraDefault);
  if (expansion === 'capybara' && !capybaraEnabled) {
    throw new Error('The Capybara expansion cannot be disabled in expansion mode.');
  }
  if (expansion === 'none' && capybaraEnabled) {
    throw new Error('Capybara cannot be enabled when expansion mode is none.');
  }
  if (playerCount >= 19 && expansion !== 'capybara') {
    throw new Error('The Capybara expansion is required for 19 or 20 players.');
  }
  if (playerCount < 19 && expansion === 'capybara') {
    throw new Error('The Capybara expansion is available only for 19 or 20 players.');
  }

  const universalArbourEnabled = booleanOption(input, 'universalArbourEnabled', false);
  const wolfCultEnabled = booleanOption(input, 'wolfCultEnabled', false);
  if (universalArbourEnabled && wolfCultEnabled) {
    throw new Error('Universal Arbour and Wolf Cult are alternative loyalty configurations.');
  }
  if (wolfCultEnabled && wolfCountForPlayerCount(playerCount) !== 2) {
    throw new Error('Wolf Cult requires the printed two-Wolf player count.');
  }

  const options = input.options;
  if (options !== undefined) {
    if (!Array.isArray(options) || options.some((option) => typeof option !== 'string')) {
      throw new Error('options must be a list of text values.');
    }
    if (new Set(options).size !== options.length) throw new Error('options may not contain duplicates.');
  }

  return {
    playerCount,
    chartId,
    expansion,
    turnLimit,
    dioneEnabled,
    capybaraEnabled,
    universalArbourEnabled,
    wolfCultEnabled,
  };
}

/** Read legacy stored sessions without allowing that shape for new writes. */
export function normalizePersistedSessionConfiguration(
  input: Readonly<Record<string, unknown>>,
): SessionConfiguration {
  const expansion = input.expansion;
  const playerCount = input.playerCount;
  if (expansion === 'capybara' && typeof playerCount === 'number' && playerCount < 19) {
    const base = normalizeSessionConfiguration({
      ...input,
      expansion: 'base',
      capybaraEnabled: input.capybaraEnabled === undefined ? true : input.capybaraEnabled,
    });
    // A pre-0.3.12 session could carry the old optional Capybara marker at a
    // lower count. Hydrate it deterministically as a base-game tuple; the
    // strict creation/configuration validator still rejects that shape.
    return base;
  }
  return normalizeSessionConfiguration(input);
}

export function wolfCountForPlayerCount(playerCount: number): 1 | 2 {
  if (!isOneOf(playerCount, SUPPORTED_PLAYER_COUNTS)) {
    throw new Error('playerCount must be an integer from 8 through 20.');
  }
  return playerCount <= 13 ? 1 : 2;
}

export type LoyaltyKind =
  | 'fleet-loyalist'
  | 'wolf-agent'
  | 'intelligence-agent'
  | 'universal-arbour'
  | 'wolf-cult'
  | 'android'
  | 'friend';

const LOYALTY_SUSPICION: Readonly<Record<LoyaltyKind, readonly number[]>> = {
  'fleet-loyalist': [0, 5, 10],
  'wolf-agent': [0],
  'intelligence-agent': [6],
  'universal-arbour': [10],
  'wolf-cult': [15],
  android: [],
  friend: [0],
};

export function defaultSuspicionForLoyalty(kind: LoyaltyKind): readonly number[] {
  return LOYALTY_SUSPICION[kind];
}

export interface SetupHolder {
  readonly uid: PlayerId;
  readonly roleId: RoleId;
}

export interface ExplicitLoyaltyRecord extends SetupHolder {
  readonly kind: string;
  readonly suspicion: number | null;
  readonly partnerUid?: PlayerId | null;
}

export type ExplicitLoyaltyValidation =
  | { readonly valid: true; readonly assignments: Readonly<Record<string, SetupLoyalty>> }
  | {
    readonly valid: false;
    readonly reason:
      | 'partial'
      | 'conflicting'
      | 'malformed'
      | 'stale'
      | 'optional-disabled'
      | 'optional-conflicting';
  };

export interface ExplicitLoyaltyConfiguration {
  readonly playerCount: number;
  readonly universalArbourEnabled?: boolean;
  readonly wolfCultEnabled?: boolean;
}

/** Gate optional loyalty cards against the locked public setup tuple. */
export function optionalLoyaltyAssignmentDecision(
  kind: string,
  configuration: ExplicitLoyaltyConfiguration,
): { readonly allowed: true } | { readonly allowed: false; readonly reason: 'optional-disabled' | 'wolf-cult-requires-two-wolves' } {
  if (kind === 'universal-arbour') {
    return configuration.universalArbourEnabled === true
      ? { allowed: true }
      : { allowed: false, reason: 'optional-disabled' };
  }
  if (kind === 'wolf-cult') {
    if (configuration.wolfCultEnabled !== true) {
      return { allowed: false, reason: 'optional-disabled' };
    }
    return wolfCountForPlayerCount(configuration.playerCount) === 2
      ? { allowed: true }
      : { allowed: false, reason: 'wolf-cult-requires-two-wolves' };
  }
  return { allowed: true };
}

/** Validate a fully authored pre-start loyalty setup without exposing secrets. */
export function validateExplicitLoyaltySetup(
  holders: readonly SetupHolder[],
  records: readonly ExplicitLoyaltyRecord[],
  configuration?: ExplicitLoyaltyConfiguration,
): ExplicitLoyaltyValidation {
  const setupConfiguration = configuration ?? {
    playerCount: DEFAULT_SESSION_CONFIGURATION.playerCount,
    universalArbourEnabled: false,
    wolfCultEnabled: false,
  };
  const holderUids = new Set(holders.map((holder) => holder.uid));
  const holderByUid = new Map(holders.map((holder) => [holder.uid, holder]));
  if (records.length !== holders.length) return { valid: false, reason: 'partial' };
  const byUid = new Map(records.map((record) => [record.uid, record]));
  if (byUid.size !== records.length) return { valid: false, reason: 'conflicting' };
  if ([...byUid.keys()].some((uid) => !holderUids.has(uid))) return { valid: false, reason: 'stale' };
  if ([...holderUids].some((uid) => !byUid.has(uid))) return { valid: false, reason: 'partial' };

  const assignments: Record<string, SetupLoyalty> = {};
  for (const record of records) {
    const holder = holderByUid.get(record.uid);
    if (!holder || holder.roleId !== record.roleId) return { valid: false, reason: 'stale' };
    const decision = loyaltyAssignmentDecision(record.kind, record.suspicion);
    if (!decision.allowed) return { valid: false, reason: 'malformed' };
    const optionalDecision = optionalLoyaltyAssignmentDecision(record.kind, setupConfiguration);
    if (!optionalDecision.allowed) return { valid: false, reason: optionalDecision.reason === 'optional-disabled' ? 'optional-disabled' : 'optional-conflicting' };
    if (record.kind === 'friend' &&
      (typeof record.partnerUid !== 'string' || record.partnerUid === record.uid || !holderUids.has(record.partnerUid))) {
      return { valid: false, reason: 'malformed' };
    }
    if (record.kind !== 'friend' && record.partnerUid !== undefined && record.partnerUid !== null) {
      return { valid: false, reason: 'conflicting' };
    }
    assignments[record.uid] = { kind: record.kind as LoyaltyKind, suspicion: decision.suspicion };
  }
  for (const record of records) {
    if (record.kind !== 'friend') continue;
    const partner = byUid.get(record.partnerUid!);
    if (!partner || partner.kind !== 'friend' || partner.partnerUid !== record.uid) {
      return { valid: false, reason: 'conflicting' };
    }
  }
  const intelligenceAgentCount = records.filter((record) => record.kind === 'intelligence-agent').length;
  const universalArbourCount = records.filter((record) => record.kind === 'universal-arbour').length;
  const wolfCultCount = records.filter((record) => record.kind === 'wolf-cult').length;
  const wolfAgentCount = records.filter((record) => record.kind === 'wolf-agent').length;
  const expectedWolfCount = wolfCountForPlayerCount(setupConfiguration.playerCount);
  if (setupConfiguration.universalArbourEnabled === true && universalArbourCount !== 1) {
    return { valid: false, reason: 'optional-conflicting' };
  }
  if (setupConfiguration.wolfCultEnabled === true &&
    (wolfCultCount !== 1 || expectedWolfCount !== 2 || wolfAgentCount !== 1)) {
    return { valid: false, reason: 'optional-conflicting' };
  }
  if (intelligenceAgentCount > 1 || (intelligenceAgentCount === 1 && wolfAgentCount + wolfCultCount < 1)) {
    return { valid: false, reason: 'conflicting' };
  }
  return { valid: true, assignments };
}

/** The automatic production setup has no optional faction policy enabled. */
export function composeDefaultLoyaltyAssignments(
  holders: readonly SetupHolder[],
  wolfRoleIds: readonly string[],
  randomIndex: (upperBound: number) => number,
): Readonly<Record<string, SetupLoyalty>> {
  const byRole = new Map(holders.map((holder) => [holder.roleId, holder]));
  const uniqueWolfRoles = [...new Set(wolfRoleIds)];
  if (uniqueWolfRoles.length !== wolfRoleIds.length || uniqueWolfRoles.length < 1 || uniqueWolfRoles.length > 2) {
    throw new Error('Routine setup requires one or two distinct Wolf roles.');
  }
  const wolfUids = uniqueWolfRoles.map((roleId) => byRole.get(roleId)?.uid);
  if (wolfUids.some((uid) => typeof uid !== 'string')) {
    throw new Error('Every selected Wolf role must be an occupied setup role.');
  }
  const wolfUidSet = new Set(wolfUids as string[]);
  const loyalistUids = holders.map((holder) => holder.uid).filter((uid) => !wolfUidSet.has(uid));
  const suspicionCards: number[] = loyalistUids.map((_uid, index) => index < 2 ? 5 : index === 2 ? 10 : 0);
  for (let index = suspicionCards.length - 1; index > 0; index -= 1) {
    const swapWith = randomIndex(index + 1);
    [suspicionCards[index], suspicionCards[swapWith]] = [suspicionCards[swapWith]!, suspicionCards[index]!];
  }
  const loyalties: Record<string, SetupLoyalty> = {};
  for (const holder of holders) {
    loyalties[holder.uid] = wolfUidSet.has(holder.uid)
      ? { kind: 'wolf-agent', suspicion: 0 }
      : { kind: 'fleet-loyalist', suspicion: suspicionCards[loyalistUids.indexOf(holder.uid)] ?? 0 };
  }
  return loyalties;
}

export type LoyaltyAssignmentDecision =
  | { readonly allowed: true; readonly suspicion: number | null }
  | { readonly allowed: false; readonly reason: 'invalid-kind' | 'invalid-suspicion' };

/** Validate a private loyalty card without exposing its value to the caller. */
export function loyaltyAssignmentDecision(
  kind: string,
  suspicion: number | null,
): LoyaltyAssignmentDecision {
  if (!(kind in LOYALTY_SUSPICION)) return { allowed: false, reason: 'invalid-kind' };
  const allowed = LOYALTY_SUSPICION[kind as LoyaltyKind];
  if (kind === 'android') {
    return suspicion === null
      ? { allowed: true, suspicion: null }
      : { allowed: false, reason: 'invalid-suspicion' };
  }
  return typeof suspicion === 'number' && allowed.includes(suspicion)
    ? { allowed: true, suspicion }
    : { allowed: false, reason: 'invalid-suspicion' };
}

export interface RoleAssignment {
  readonly uid: PlayerId;
  readonly roleId: RoleId;
}

export type RoleAssignmentReason =
  | 'player-already-assigned'
  | 'role-already-assigned'
  | 'role-not-active'
  | 'incomplete-union-roster';

export function roleAssignmentDecision(
  assignments: readonly RoleAssignment[],
  uid: string,
  roleId: string,
  activeRoleIds: readonly string[],
): { readonly allowed: true } | { readonly allowed: false; readonly reason: RoleAssignmentReason } {
  if (assignments.some((assignment) => assignment.uid === uid)) {
    return { allowed: false, reason: 'player-already-assigned' };
  }
  if (assignments.some((assignment) => assignment.roleId === roleId)) {
    return { allowed: false, reason: 'role-already-assigned' };
  }
  if (!activeRoleIds.includes(roleId)) return { allowed: false, reason: 'role-not-active' };
  if (isJointEngineeringRoleId(roleId) && !isJointEngineeringRoleAvailable(activeRoleIds, roleId)) {
    return { allowed: false, reason: 'incomplete-union-roster' };
  }
  return { allowed: true };
}

export interface SetupBrief {
  readonly roleId: RoleId;
  readonly text: string;
}

export interface SetupLoyalty {
  readonly kind: LoyaltyKind;
  readonly suspicion: number | null;
}

export interface SetupPrivateState {
  readonly briefs: Readonly<Record<string, SetupBrief>>;
  readonly loyalties: Readonly<Record<string, SetupLoyalty>>;
  readonly friendPairs: Readonly<Record<string, string>>;
  readonly censusNotes: Readonly<Record<string, string>>;
}

export interface CensusProjection {
  readonly kind: LoyaltyKind;
  readonly suspicion: number | null;
  readonly note?: string;
}

export interface PrivateSetupProjection {
  readonly brief: SetupBrief | undefined;
  readonly loyalty: SetupLoyalty | undefined;
  readonly friend: string | undefined;
  readonly census?: Readonly<Record<string, CensusProjection>>;
}

/** Project setup secrets without serializing another player's hidden state. */
export function projectPrivateSetup(
  setup: SetupPrivateState,
  uid: string,
  facilitator: boolean,
): PrivateSetupProjection {
  const loyalty = setup.loyalties[uid];
  const result: PrivateSetupProjection = {
    brief: setup.briefs[uid],
    loyalty,
    friend: loyalty?.kind === 'friend' ? setup.friendPairs[uid] : undefined,
  };
  if (!facilitator) return result;

  const census = Object.fromEntries(Object.entries(setup.loyalties).map(([playerUid, record]) => [
    playerUid,
    {
      kind: record.kind,
      suspicion: record.suspicion,
      ...(setup.censusNotes[playerUid] === undefined ? {} : { note: setup.censusNotes[playerUid] }),
    },
  ])) as Readonly<Record<string, CensusProjection>>;
  return { ...result, census };
}

export type SetupReadinessReason =
  | 'wrong-phase'
  | 'player-count'
  | 'players'
  | 'roles'
  | 'loyalties'
  | 'main-facilitator'
  | 'assistant-facilitator'
  | 'vessels'
  | 'seat-documents'
  | 'seat-pointers'
  | 'gm-staffing'
  | 'press';

/** The server-facing shape of a provisioned, role-keyed seat document. */
export interface SetupSeatDocument {
  readonly id: SeatId;
  readonly roleId: RoleId;
  readonly label: string;
  readonly factionId: VesselId;
  readonly status: 'open' | 'claimed' | 'locked';
  readonly holderUid: PlayerId | null;
  readonly claimedAt?: string | number | Date | null;
}

/** A player pointer read beside its seat document during start readiness. */
export interface SetupPlayerSeatPointer {
  readonly uid: PlayerId;
  readonly seatId: SeatId | null;
}

/** Minimal normalized GM instance input used by the pure readiness policy. */
export interface SetupGmInstance {
  readonly id: string;
  readonly uid: PlayerId;
  readonly connected: boolean;
  readonly lastSeenAt?: string | number | Date | null;
  readonly responsibilities?: readonly ('main' | 'assistant')[];
  readonly responsibility?: 'main' | 'assistant' | null;
}

export interface SetupReadinessInput {
  readonly phase: string;
  readonly playerCount: number;
  readonly connectedPlayers: readonly PlayerId[];
  readonly assignments: readonly RoleAssignment[];
  readonly loyaltyUids: readonly PlayerId[];
  readonly facilitatorResponsibilities: { readonly main: boolean; readonly assistant: boolean };
  readonly activeRoleIds: readonly RoleId[];
  readonly activeVesselIds: readonly VesselId[];
  /** Optional Press holders are live station occupancy, never core roster members. */
  readonly pressPlayerUids?: readonly PlayerId[];
  /** Press is an optional station; disabled/stale occupancy is excluded from core math. */
  readonly pressEnabled?: boolean;
  /** Stored station owner used to reject a stale or mismatched Press claim. */
  readonly pressHolderUid?: PlayerId | null;
  /** Connected GM-only observers do not consume a player or Press station. */
  readonly facilitatorPlayerUids?: readonly PlayerId[];
  /** Canonical role-keyed seat documents provisioned by the server. */
  readonly seatDocuments?: readonly SetupSeatDocument[];
  /** Exact reciprocal player -> seat pointers from the same read. */
  readonly playerSeatPointers?: readonly SetupPlayerSeatPointer[];
  /** Live normalized GM instances; one instance covers both printed lanes. */
  readonly gmInstances?: readonly SetupGmInstance[];
  /** Testable clock for GM lease normalization; defaults to Date.now(). */
  readonly nowMs?: number;
}

function vesselIdsForRole(roleId: string): readonly VesselId[] {
  if (roleId === 'admiral' || roleId === 'executive-officer' || roleId === 'wing-commander') return ['aegis'];
  if (roleId === 'joint-engineering-quellon-refinery') return ['quellon', 'refinery-124'];
  if (roleId === 'joint-engineering-shepherd-icebreaker') return ['shepherd', 'icebreaker'];
  const ship = roleId.match(/^(dione|icebreaker|shepherd|quellon|refinery-124|capybara)-/);
  return ship ? [ship[1]!] : roleId === 'press-officer' ? ['press'] : [];
}

function setupTimestampMs(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as { toMillis?: () => unknown; toDate?: () => unknown };
  if (typeof candidate.toMillis === 'function') {
    const millis = candidate.toMillis();
    return typeof millis === 'number' && Number.isFinite(millis) ? millis : undefined;
  }
  if (typeof candidate.toDate === 'function') return setupTimestampMs(candidate.toDate());
  return undefined;
}

/** Apply the same connection and presence lease used by authoritative starts. */
export function isLiveSetupGm(instance: SetupGmInstance, nowMs = Date.now()): boolean {
  if (!instance.connected) return false;
  if (instance.lastSeenAt === undefined || instance.lastSeenAt === null) return true;
  const seen = setupTimestampMs(instance.lastSeenAt);
  return seen !== undefined && nowMs - seen < PRESENCE_LEASE_MS;
}

export function readinessForSetup(input: SetupReadinessInput): {
  readonly ready: boolean;
  readonly reasons: readonly SetupReadinessReason[];
} {
  const reasons: SetupReadinessReason[] = [];
  const strictSeatBackedReadiness = input.seatDocuments !== undefined ||
    input.playerSeatPointers !== undefined;
  if (input.phase !== 'casting') reasons.push('wrong-phase');
  if (!isOneOf(input.playerCount, SUPPORTED_PLAYER_COUNTS)) reasons.push('player-count');
  const pressCandidateUids = new Set(input.pressPlayerUids ?? []);
  const pressPlayerUids = input.pressEnabled === false ? new Set<string>() : pressCandidateUids;
  const assignedPressUids = strictSeatBackedReadiness
    ? input.assignments
      .filter((assignment) => assignment.roleId === 'press-officer')
      .map((assignment) => assignment.uid)
    : [];
  const pressExcludedUids = new Set([...pressCandidateUids, ...assignedPressUids]);
  // A GM browser is a facilitator device, never a core seat holder, even if a
  // legacy player document still carries an old assignedRoleId.
  const facilitatorOnlyUids = new Set(input.facilitatorPlayerUids ?? []);
  const coreConnectedPlayers = input.connectedPlayers.filter((uid) =>
    !pressExcludedUids.has(uid) && !facilitatorOnlyUids.has(uid));
  const coreAssignments = input.assignments.filter((assignment) =>
    !pressPlayerUids.has(assignment.uid) && !facilitatorOnlyUids.has(assignment.uid) &&
    assignment.roleId !== 'press-officer');
  const pressHasCoreAssignment = input.assignments.some((assignment) =>
    pressPlayerUids.has(assignment.uid) && assignment.roleId !== 'press-officer');
  if (coreConnectedPlayers.length !== input.playerCount) reasons.push('players');

  const playerIds = new Set(coreConnectedPlayers);
  const roleIds = new Set(coreAssignments.map((assignment) => assignment.roleId));
  const assignedPlayers = new Set(coreAssignments.map((assignment) => assignment.uid));
  const printedRoleIds = recommendedRoleIds(input.playerCount);
  const configuredRoleSet = new Set(input.activeRoleIds);
  const exactPrintedRoster =
    configuredRoleSet.size === input.activeRoleIds.length &&
    input.activeRoleIds.length === printedRoleIds.length &&
    printedRoleIds.every((roleId) => configuredRoleSet.has(roleId));
  if (
    assignedPlayers.size !== coreAssignments.length ||
    roleIds.size !== coreAssignments.length ||
    coreAssignments.length !== coreConnectedPlayers.length ||
    !exactPrintedRoster ||
    pressHasCoreAssignment ||
    coreAssignments.some((assignment) => !playerIds.has(assignment.uid) || !input.activeRoleIds.includes(assignment.roleId))
  ) reasons.push('roles');

  if (strictSeatBackedReadiness) {
    const seatDocuments = input.seatDocuments ?? [];
    const seatByRole = new Map(seatDocuments.map((seat) => [seat.roleId, seat]));
    const validSeatDocuments = seatDocuments.length === printedRoleIds.length &&
      seatByRole.size === seatDocuments.length &&
      printedRoleIds.every((roleId) => {
        const seat = seatByRole.get(roleId);
        const metadata = ROLE_SEAT_METADATA[roleId];
        return seat?.id === roleId && seat.roleId === roleId &&
          metadata !== undefined && seat.label === metadata.label && seat.factionId === metadata.factionId &&
          seat.status === 'claimed' && typeof seat.holderUid === 'string' &&
          seat.holderUid.length > 0;
      });
    if (!validSeatDocuments) reasons.push('seat-documents');

    const pointers = input.playerSeatPointers ?? [];
    const pointerByUid = new Map(pointers.map((pointer) => [pointer.uid, pointer]));
    const assignmentByUid = new Map(coreAssignments.map((assignment) => [assignment.uid, assignment]));
    const reciprocalPointers = pointers.length === coreConnectedPlayers.length &&
      pointerByUid.size === pointers.length &&
      coreConnectedPlayers.every((uid) => {
        const pointer = pointerByUid.get(uid);
        const assignment = assignmentByUid.get(uid);
        const seat = assignment ? seatByRole.get(assignment.roleId) : undefined;
        return pointer?.seatId !== null && pointer?.seatId !== undefined &&
          seat?.id === pointer.seatId && seat.holderUid === uid;
      });
    if (!reciprocalPointers) reasons.push('seat-pointers');

    const nowMs = input.nowMs ?? Date.now();
    const liveGmInstances = (input.gmInstances ?? []).filter((instance) =>
      isLiveSetupGm(instance, nowMs));
    if (liveGmInstances.length === 0) reasons.push('gm-staffing');

    if (input.pressEnabled !== false) {
      if (pressCandidateUids.size > 1 ||
          (input.pressHolderUid !== undefined && input.pressHolderUid !== null &&
            (pressCandidateUids.size !== 1 || !pressCandidateUids.has(input.pressHolderUid)))) {
        reasons.push('press');
      }
    }
  }

  const expectedLoyaltyUids = new Set([...coreConnectedPlayers, ...pressPlayerUids]);
  const relevantLoyaltyUids = input.loyaltyUids.filter((uid) => expectedLoyaltyUids.has(uid));
  const loyaltyIds = new Set(relevantLoyaltyUids);
  if (
    !(strictSeatBackedReadiness && input.loyaltyUids.length === 0) &&
    (loyaltyIds.size !== relevantLoyaltyUids.length ||
    (strictSeatBackedReadiness && relevantLoyaltyUids.length !== input.loyaltyUids.length) ||
    expectedLoyaltyUids.size !== loyaltyIds.size ||
    [...expectedLoyaltyUids].some((uid) => !loyaltyIds.has(uid)))
  ) reasons.push('loyalties');

  if (!strictSeatBackedReadiness) {
    if (!input.facilitatorResponsibilities.main) reasons.push('main-facilitator');
    if (!input.facilitatorResponsibilities.assistant) reasons.push('assistant-facilitator');
  }

  const assignedVessels = new Set(coreAssignments.flatMap((assignment) => vesselIdsForRole(assignment.roleId)));
  const configuredVessels = new Set(input.activeVesselIds);
  if (
    configuredVessels.size !== input.activeVesselIds.length ||
    assignedVessels.size !== configuredVessels.size ||
    [...configuredVessels].some((vesselId) => !assignedVessels.has(vesselId))
  ) reasons.push('vessels');

  return { ready: reasons.length === 0, reasons };
}

/** Keep the imported preset helper reachable from the setup module's public contract. */
export function printedRosterForPlayerCount(playerCount: number): readonly RoleId[] {
  return recommendedRoleIds(playerCount);
}

/** Resolve the vessels that a setup roster actually puts into play. */
export function activeVesselIdsForRoles(roleIds: readonly string[]): readonly VesselId[] {
  const vessels = new Set<VesselId>();
  for (const roleId of roleIds) {
    if (roleId === 'admiral' || roleId === 'executive-officer' || roleId === 'wing-commander') {
      vessels.add('aegis');
      continue;
    }
    const jointShips = isJointEngineeringRoleId(roleId)
      ? (roleId === 'joint-engineering-quellon-refinery'
        ? ['quellon', 'refinery-124']
        : ['shepherd', 'icebreaker'])
      : [];
    for (const shipId of jointShips) vessels.add(shipId);
    const ship = roleId.match(/^(dione|icebreaker|shepherd|quellon|refinery-124|capybara)-/);
    if (ship) vessels.add(ship[1]!);
  }
  return [...vessels];
}

/** Build the one canonical tuple used by creation and every later setup write. */
export function canonicalSessionSetup(
  configuration: SessionConfiguration,
  activeRoleIds: readonly string[] = recommendedRoleIds(configuration.playerCount),
): CanonicalSessionSetup {
  validateVesselModeRoster(configuration, activeRoleIds);
  return {
    ...configuration,
    activeRoleIds: [...activeRoleIds],
    activeVesselIds: activeVesselIdsForRoles(activeRoleIds),
  };
}

export interface RoleSeatMetadata {
  readonly label: string;
  readonly factionId: VesselId;
}

/** Shared printed role/vessel names used by seat records and the CIC. */
export const ROLE_SEAT_METADATA: Readonly<Record<RoleId, RoleSeatMetadata>> = {
  admiral: { label: 'AEGIS // Admiral', factionId: 'aegis' },
  'executive-officer': { label: 'AEGIS // Executive Officer', factionId: 'aegis' },
  'wing-commander': { label: 'AEGIS // Wing Commander', factionId: 'aegis' },
  'dione-captain': { label: 'Dione // Captain', factionId: 'dione' },
  'dione-engineer': { label: 'Dione // Engineer', factionId: 'dione' },
  'dione-president': { label: 'Dione // President', factionId: 'dione' },
  'icebreaker-captain': { label: 'Icebreaker // Captain', factionId: 'icebreaker' },
  'icebreaker-engineer': { label: 'Icebreaker // Engineer', factionId: 'icebreaker' },
  'icebreaker-miner': { label: 'Icebreaker // Miner', factionId: 'icebreaker' },
  'shepherd-captain': { label: 'Shepherd // Captain', factionId: 'shepherd' },
  'shepherd-engineer': { label: 'Shepherd // Engineer', factionId: 'shepherd' },
  'shepherd-scientist': { label: 'Shepherd // Scientist', factionId: 'shepherd' },
  'quellon-captain': { label: 'Quellon // Captain', factionId: 'quellon' },
  'quellon-engineer': { label: 'Quellon // Engineer', factionId: 'quellon' },
  'quellon-explorer': { label: 'Quellon // Explorer', factionId: 'quellon' },
  'refinery-124-captain': { label: 'Refinery 124 // Captain', factionId: 'refinery-124' },
  'refinery-124-engineer': { label: 'Refinery 124 // Engineer', factionId: 'refinery-124' },
  'refinery-124-pdf-colonel': { label: 'Refinery 124 // P.D.F. Colonel', factionId: 'refinery-124' },
  'capybara-captain': { label: 'Capybara // Capybara Captain', factionId: 'capybara' },
  'capybara-recycler': { label: 'Capybara // Capybara Recycler', factionId: 'capybara' },
  'joint-engineering-quellon-refinery': {
    label: 'Joint Engineering Union // Quellon / Refinery Engineer',
    factionId: 'joint-engineering-union',
  },
  'joint-engineering-shepherd-icebreaker': {
    label: 'Joint Engineering Union // Shepherd / Icebreaker Engineer',
    factionId: 'joint-engineering-union',
  },
};

/** Stable role-keyed seats are created once and reconciled by role id. */
export function stableSeatsForRoles(roleIds: readonly RoleId[]): readonly StableSeatRecord[] {
  return roleIds.map((roleId) => {
    const metadata = ROLE_SEAT_METADATA[roleId];
    if (!metadata) throw new Error(`No canonical seat metadata for role ${roleId}.`);
    return {
      id: entityId('seat', roleId),
      roleId,
      label: metadata.label,
      factionId: metadata.factionId,
      status: 'open',
      holderUid: null,
      claimedAt: null,
    };
  });
}
