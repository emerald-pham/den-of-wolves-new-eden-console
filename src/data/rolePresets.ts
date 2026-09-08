import { CONSOLE_ROLES } from './roles';

const CORE_18 = [
  'admiral', 'executive-officer', 'wing-commander',
  'dione-captain', 'dione-engineer', 'dione-president',
  'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
  'quellon-captain', 'quellon-engineer', 'quellon-explorer',
  'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
] as const;

const A = 'admiral';
const W = 'wing-commander';
const QR = 'joint-engineering-quellon-refinery';
const SI = 'joint-engineering-shepherd-icebreaker';

export const JOINT_ENGINEERING_ROLE_IDS = [QR, SI] as const;
export type JointEngineeringRoleId = typeof JOINT_ENGINEERING_ROLE_IDS[number];

/** The printed Union stations replace these two ship engineers, never supplement them. */
export const JOINT_ENGINEERING_REPLACEMENTS: Readonly<
  Record<JointEngineeringRoleId, readonly string[]>
> = {
  [QR]: ['quellon-engineer', 'refinery-124-engineer'],
  [SI]: ['shepherd-engineer', 'icebreaker-engineer'],
};

/** Printed casting rows where each Union station replaces its paired engineers. */
export const JOINT_ENGINEERING_PLAYER_COUNTS: Readonly<
  Record<JointEngineeringRoleId, readonly number[]>
> = {
  [QR]: [8, 9, 14, 15],
  [SI]: [8, 14, 15],
};

const MATRIX_PRESETS: Readonly<Record<number, readonly string[]>> = {
  8: [A, W, 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer', 'refinery-124-pdf-colonel', QR, SI],
  9: [A, W, 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-explorer', 'refinery-124-pdf-colonel', QR],
  10: [A, W, 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  11: [A, 'executive-officer', W, 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  12: [A, W, 'dione-engineer', 'dione-president', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  13: [A, 'executive-officer', W, 'dione-engineer', 'dione-president', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  14: [A, W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-miner', 'shepherd-captain', 'shepherd-scientist', 'quellon-captain', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-pdf-colonel', QR, SI],
  15: [A, 'executive-officer', W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-miner', 'shepherd-captain', 'shepherd-scientist', 'quellon-captain', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-pdf-colonel', QR, SI],
  16: [A, W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist', 'quellon-captain', 'quellon-engineer', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  17: [A, 'executive-officer', W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist', 'quellon-captain', 'quellon-engineer', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  18: CORE_18,
  20: [...CORE_18, 'capybara-captain', 'capybara-recycler'],
};

export const MIN_PLAYER_PRESET = 8;
export const MAX_PLAYER_PRESET = 20;

const KNOWN_ROLE_IDS = new Set(CONSOLE_ROLES.map((role) => role.id));

export function recommendedRoleIds(playerCount: number): readonly string[] {
  return MATRIX_PRESETS[playerCount] ?? [];
}

export function isJointEngineeringRoleId(roleId: string): roleId is JointEngineeringRoleId {
  return (JOINT_ENGINEERING_ROLE_IDS as readonly string[]).includes(roleId);
}

/** A Union station is valid only when it replaces both named engineers in a smaller roster. */
export function isJointEngineeringRoleAvailable(
  activeRoleIds: readonly string[],
  roleId: string,
): boolean {
  if (!isJointEngineeringRoleId(roleId) || !activeRoleIds.includes(roleId)) return false;
  const matchesPrintedRoster = JOINT_ENGINEERING_PLAYER_COUNTS[roleId].some((playerCount) => {
    const printedRoleIds = recommendedRoleIds(playerCount);
    return activeRoleIds.length === printedRoleIds.length &&
      printedRoleIds.every((printedRoleId) => activeRoleIds.includes(printedRoleId));
  });
  return matchesPrintedRoster && JOINT_ENGINEERING_REPLACEMENTS[roleId].every(
    (replacementRoleId) => !activeRoleIds.includes(replacementRoleId),
  );
}

/** Whether the GM may add this Union station to the roster currently on screen. */
export function canOfferJointEngineeringRole(
  activeRoleIds: readonly string[],
  roleId: JointEngineeringRoleId,
): boolean {
  const next = activeRoleIds.includes(roleId) ? activeRoleIds : [...activeRoleIds, roleId];
  return isJointEngineeringRoleAvailable(next, roleId);
}

/** Reject malformed drafts before the GM can send their single roster command. */
export function isValidRoleConfiguration(activeRoleIds: readonly string[]): boolean {
  if (new Set(activeRoleIds).size !== activeRoleIds.length) return false;
  if (activeRoleIds.some((roleId) => !KNOWN_ROLE_IDS.has(roleId))) return false;
  if (activeRoleIds.includes('press-officer')) return false;
  return JOINT_ENGINEERING_ROLE_IDS.every((roleId) =>
    !activeRoleIds.includes(roleId) || isJointEngineeringRoleAvailable(activeRoleIds, roleId));
}

/** Identify an exact printed matrix preset, leaving customized rosters unlabelled. */
export function recommendedPlayerCountForRoleIds(activeRoleIds: readonly string[]): number | undefined {
  const active = new Set(activeRoleIds);
  if (active.size !== activeRoleIds.length) return undefined;
  for (let playerCount = MIN_PLAYER_PRESET; playerCount <= MAX_PLAYER_PRESET; playerCount += 1) {
    const recommended = recommendedRoleIds(playerCount);
    if (recommended.length === active.size && recommended.every((roleId) => active.has(roleId))) {
      return playerCount;
    }
  }
  return undefined;
}
