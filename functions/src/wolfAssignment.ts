import { ROLE_IDS } from './roleConfiguration';

export const WOLF_ROLE_IDS = ROLE_IDS;

export interface RoutineWolfAssignmentInput {
  readonly playerCount: number;
  /** Occupied, enabled core role holders only; GM and Press are not implicit. */
  readonly occupiedCoreRoleIds: readonly string[];
  readonly pressEnabled: boolean;
  /** Set only when exactly one enabled Press Officer is claimed. */
  readonly claimedPressRoleId: 'press-officer' | null;
  readonly randomIndex: (upperBound: number) => number;
}

export interface RoutineWolfAssignmentResult {
  readonly wolfCount: 1 | 2;
  readonly eligibleRoleIds: readonly string[];
  readonly selectedRoleIds: readonly string[];
  readonly rule: 'one-wolf-at-8-13' | 'two-wolves-at-14-20';
}

/** Fisher-Yates selection with an injected integer source for deterministic tests. */
export function chooseWolfRoles(
  enabledRoleIds: readonly string[],
  count: number,
  randomIndex: (upperBound: number) => number,
): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 2) {
    throw new Error('Wolf count must be one or two.');
  }
  if (enabledRoleIds.length < count) {
    throw new Error('Not enough enabled roles for that many wolves.');
  }
  const roles = [...enabledRoleIds];
  for (let index = roles.length - 1; index > 0; index -= 1) {
    const swapWith = randomIndex(index + 1);
    [roles[index], roles[swapWith]] = [roles[swapWith]!, roles[index]!];
  }
  return roles.slice(0, count);
}

/**
 * Derive the ordinary production Wolf pool from authoritative occupancy.
 * Caller-selected cardinality is intentionally not an input to this helper.
 */
export function deriveRoutineWolfAssignment(
  input: RoutineWolfAssignmentInput,
): RoutineWolfAssignmentResult {
  if (!Number.isSafeInteger(input.playerCount) || input.playerCount < 8 || input.playerCount > 20) {
    throw new Error('playerCount must be an integer from 8 through 20.');
  }
  const wolfCount: 1 | 2 = input.playerCount <= 13 ? 1 : 2;
  const eligibleRoleIds = [...new Set(input.occupiedCoreRoleIds)].filter((roleId) =>
    roleId !== 'press-officer' && roleId !== 'gm' && roleId.length > 0);
  if (input.pressEnabled && input.claimedPressRoleId === 'press-officer') {
    eligibleRoleIds.push('press-officer');
  }
  const selectedRoleIds = chooseWolfRoles(eligibleRoleIds, wolfCount, input.randomIndex);
  return {
    wolfCount,
    eligibleRoleIds,
    selectedRoleIds,
    rule: wolfCount === 1 ? 'one-wolf-at-8-13' : 'two-wolves-at-14-20',
  };
}
