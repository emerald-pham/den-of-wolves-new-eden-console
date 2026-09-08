import {
  isJointEngineeringRoleAvailable,
  isJointEngineeringRoleId,
  recommendedRoleIds,
} from './roleConfiguration';

export const SUPPORTED_PLAYER_COUNTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;
export const SUPPORTED_CHART_IDS = ['A', 'B', 'C'] as const;
export const SUPPORTED_EXPANSION_MODES = ['base', 'capybara', 'none'] as const;
export const SUPPORTED_TURN_LIMITS = [6, 7, 8] as const;

export type SessionChartId = typeof SUPPORTED_CHART_IDS[number];
export type SessionExpansionMode = typeof SUPPORTED_EXPANSION_MODES[number];
export type SessionTurnLimit = typeof SUPPORTED_TURN_LIMITS[number];

export interface SessionConfiguration {
  readonly playerCount: number;
  readonly chartId: SessionChartId;
  readonly expansion: SessionExpansionMode;
  readonly turnLimit: SessionTurnLimit;
  readonly dioneEnabled: boolean;
  readonly capybaraEnabled: boolean;
}

/** Defaults preserve sessions created before setup configuration was added. */
export const DEFAULT_SESSION_CONFIGURATION: SessionConfiguration = {
  playerCount: 18,
  chartId: 'A',
  expansion: 'base',
  turnLimit: 8,
  dioneEnabled: true,
  capybaraEnabled: true,
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
    throw new Error('playerCount must be an integer from 8 through 18.');
  }

  const chartId = input.chartId === undefined ? DEFAULT_SESSION_CONFIGURATION.chartId : input.chartId;
  if (!isOneOf(chartId, SUPPORTED_CHART_IDS)) throw new Error('chartId must be A, B, or C.');

  const expansion = input.expansion === undefined
    ? DEFAULT_SESSION_CONFIGURATION.expansion
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
  };
}

export function wolfCountForPlayerCount(playerCount: number): 1 | 2 {
  if (!isOneOf(playerCount, SUPPORTED_PLAYER_COUNTS)) {
    throw new Error('playerCount must be an integer from 8 through 18.');
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
  readonly uid: string;
  readonly roleId: string;
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
  readonly roleId: string;
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
  | 'vessels';

export interface SetupReadinessInput {
  readonly phase: string;
  readonly playerCount: number;
  readonly connectedPlayers: readonly string[];
  readonly assignments: readonly RoleAssignment[];
  readonly loyaltyUids: readonly string[];
  readonly facilitatorResponsibilities: { readonly main: boolean; readonly assistant: boolean };
  readonly activeRoleIds: readonly string[];
  readonly activeVesselIds: readonly string[];
}

function vesselIdsForRole(roleId: string): readonly string[] {
  if (roleId === 'admiral' || roleId === 'executive-officer' || roleId === 'wing-commander') return ['aegis'];
  if (roleId === 'joint-engineering-quellon-refinery') return ['quellon', 'refinery-124'];
  if (roleId === 'joint-engineering-shepherd-icebreaker') return ['shepherd', 'icebreaker'];
  const ship = roleId.match(/^(dione|icebreaker|shepherd|quellon|refinery-124|capybara)-/);
  return ship ? [ship[1]!] : roleId === 'press-officer' ? ['press'] : [];
}

export function readinessForSetup(input: SetupReadinessInput): {
  readonly ready: boolean;
  readonly reasons: readonly SetupReadinessReason[];
} {
  const reasons: SetupReadinessReason[] = [];
  if (input.phase !== 'casting') reasons.push('wrong-phase');
  if (!isOneOf(input.playerCount, SUPPORTED_PLAYER_COUNTS)) reasons.push('player-count');
  if (input.connectedPlayers.length !== input.playerCount) reasons.push('players');

  const playerIds = new Set(input.connectedPlayers);
  const roleIds = new Set(input.assignments.map((assignment) => assignment.roleId));
  const assignedPlayers = new Set(input.assignments.map((assignment) => assignment.uid));
  const printedRoleIds = recommendedRoleIds(input.playerCount);
  const configuredRoleSet = new Set(input.activeRoleIds);
  const exactPrintedRoster =
    configuredRoleSet.size === input.activeRoleIds.length &&
    input.activeRoleIds.length === printedRoleIds.length &&
    printedRoleIds.every((roleId) => configuredRoleSet.has(roleId));
  if (
    assignedPlayers.size !== input.assignments.length ||
    roleIds.size !== input.assignments.length ||
    input.assignments.length !== input.connectedPlayers.length ||
    !exactPrintedRoster ||
    input.assignments.some((assignment) => !playerIds.has(assignment.uid) || !input.activeRoleIds.includes(assignment.roleId))
  ) reasons.push('roles');

  const loyaltyIds = new Set(input.loyaltyUids);
  if (
    loyaltyIds.size !== input.loyaltyUids.length ||
    loyaltyIds.size !== input.connectedPlayers.length ||
    input.connectedPlayers.some((uid) => !loyaltyIds.has(uid))
  ) reasons.push('loyalties');

  if (!input.facilitatorResponsibilities.main) reasons.push('main-facilitator');
  if (!input.facilitatorResponsibilities.assistant) reasons.push('assistant-facilitator');

  const assignedVessels = new Set(input.assignments.flatMap((assignment) => vesselIdsForRole(assignment.roleId)));
  const configuredVessels = new Set(input.activeVesselIds);
  if (
    assignedVessels.size !== configuredVessels.size ||
    [...configuredVessels].some((vesselId) => !assignedVessels.has(vesselId))
  ) reasons.push('vessels');

  return { ready: reasons.length === 0, reasons };
}

/** Keep the imported preset helper reachable from the setup module's public contract. */
export function printedRosterForPlayerCount(playerCount: number): readonly string[] {
  return recommendedRoleIds(playerCount);
}

/** Resolve the vessels that a setup roster actually puts into play. */
export function activeVesselIdsForRoles(roleIds: readonly string[]): readonly string[] {
  const vessels = new Set<string>();
  for (const roleId of roleIds) {
    if (roleId === 'admiral' || roleId === 'executive-officer' || roleId === 'wing-commander') {
      vessels.add('aegis');
      continue;
    }
    if (roleId === 'press-officer') {
      vessels.add('press');
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
