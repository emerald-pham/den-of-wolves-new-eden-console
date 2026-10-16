import {
  defaultSuspicionForLoyalty,
  loyaltyAssignmentDecision,
  optionalLoyaltyAssignmentDecision,
  wolfCountForPlayerCount,
  type ExplicitLoyaltyConfiguration,
  type LoyaltyKind,
} from '../../functions/src/gameSetup';
import type { Player } from '@/types/game';

/** Runtime vocabulary mirrors the complete source `LoyaltyKind` union. */
export const GM_LOYALTY_KINDS = [
  'fleet-loyalist',
  'wolf-agent',
  'intelligence-agent',
  'universal-arbour',
  'wolf-cult',
  'android',
  'friend',
] as const satisfies readonly LoyaltyKind[];

export type GmLoyaltyHolder = Pick<
  Player,
  | 'uid' | 'displayName' | 'role' | 'seatId' | 'assignedRoleId' | 'replacementRoleId'
  | 'replacementStatus' | 'escapeState' | 'connected' | 'activeConsoleRoleId'
>;

export interface GmLoyaltyPressState {
  readonly enabled: boolean;
  /** Sanitized public presence bit only; the stored holder UID remains server-private. */
  readonly claimed: boolean;
}

export interface ExplicitGmLoyaltyConfiguration extends ExplicitLoyaltyConfiguration {
  readonly universalArbourEnabled: boolean;
  readonly wolfCultEnabled: boolean;
}

/** Ordinary sessions leave the complete loyalty assignment to production start. */
export function allowedExplicitGmLoyaltyKinds(
  configuration: ExplicitGmLoyaltyConfiguration,
): readonly LoyaltyKind[] {
  if (configuration.universalArbourEnabled === configuration.wolfCultEnabled) return [];
  return GM_LOYALTY_KINDS.filter((kind) =>
    optionalLoyaltyAssignmentDecision(kind, configuration).allowed &&
    loyaltyAssignmentDecision(kind, kind === 'android' ? null : defaultSuspicionForLoyalty(kind)[0] ?? null).allowed,
  );
}

export function suspicionChoicesForGmLoyalty(kind: LoyaltyKind): readonly (number | null)[] {
  if (kind === 'android') return [null];
  return defaultSuspicionForLoyalty(kind);
}

/** Keep only unique, active core-role assignments; Press and uncast actors are excluded. */
export function canonicalGmLoyaltyHolders(
  players: readonly GmLoyaltyHolder[],
  activeRoleIds: readonly string[],
): readonly GmLoyaltyHolder[] {
  const assignedPlayers = players.filter((player) =>
    player.role === 'player' &&
    typeof player.assignedRoleId === 'string' &&
    player.assignedRoleId !== 'press-officer' &&
    activeRoleIds.includes(player.assignedRoleId),
  );
  const roleCounts = new Map<string, number>();
  for (const player of assignedPlayers) {
    const roleId = player.assignedRoleId!;
    roleCounts.set(roleId, (roleCounts.get(roleId) ?? 0) + 1);
  }
  const uidCounts = new Map<string, number>();
  for (const player of assignedPlayers) uidCounts.set(player.uid, (uidCounts.get(player.uid) ?? 0) + 1);
  return assignedPlayers
    .filter((player) => player.replacementStatus == null)
    .filter((player) => roleCounts.get(player.assignedRoleId!) === 1 && uidCounts.get(player.uid) === 1)
    .map((player) => ({ ...player, assignedRoleId: player.assignedRoleId! }));
}

/**
 * Include a Press station only when the fresh public roster contains one active
 * Press console holder and the session says the optional station is claimed.
 * The stored holder UID remains private; assignLoyalty revalidates exact server
 * ownership, station enablement, seat pointers, escape and replacement state.
 */
export function canonicalGmLoyaltyAssignmentHolders(
  players: readonly GmLoyaltyHolder[],
  activeRoleIds: readonly string[],
  press: GmLoyaltyPressState,
): readonly GmLoyaltyHolder[] {
  const core = canonicalGmLoyaltyHolders(players, activeRoleIds);
  if (!press.enabled || !press.claimed) return core;
  const activePressCandidates = players.filter((player) =>
    player.role === 'player' &&
    player.connected === true &&
    player.activeConsoleRoleId === 'press-officer' &&
    player.assignedRoleId == null &&
    player.seatId == null &&
    player.replacementStatus == null &&
    typeof player.replacementRoleId !== 'string' &&
    player.escapeState == null,
  );
  if (activePressCandidates.length !== 1) return core;
  return [...core, { ...activePressCandidates[0]!, assignedRoleId: 'press-officer' }];
}

export function explicitLoyaltyCoverage(
  holders: readonly GmLoyaltyHolder[],
  configuredHolderUids: readonly string[],
): { readonly configured: number; readonly total: number; readonly complete: boolean } {
  const configured = new Set(configuredHolderUids);
  const count = holders.reduce((total, holder) => total + (configured.has(holder.uid) ? 1 : 0), 0);
  return { configured: count, total: holders.length, complete: holders.length > 0 && count === holders.length };
}

/** Intelligence-Agent records are valid only when another configured Wolf remains. */
export function hasOtherConfiguredWolf(
  targetUid: string,
  configuredWolfHolderUids: readonly string[],
): boolean {
  return configuredWolfHolderUids.some((uid) => uid !== targetUid);
}

export function expectedExplicitWolfCount(playerCount: number): 1 | 2 {
  return wolfCountForPlayerCount(playerCount);
}

export function isGmLoyaltyKind(kind: unknown): kind is LoyaltyKind {
  return typeof kind === 'string' && (GM_LOYALTY_KINDS as readonly string[]).includes(kind);
}
