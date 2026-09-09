/** Canonical role order matches the printed roster and the client preset order. */
export const ROLE_IDS = [
  'admiral', 'executive-officer', 'wing-commander',
  'dione-captain', 'dione-engineer', 'dione-president',
  'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
  'quellon-captain', 'quellon-engineer', 'quellon-explorer',
  'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
  'press-officer', 'capybara-captain', 'capybara-recycler',
  'joint-engineering-quellon-refinery',
  'joint-engineering-shepherd-icebreaker',
] as const;

export const DEFAULT_ACTIVE_ROLE_IDS = ROLE_IDS.filter(
  (id) => id !== 'press-officer' && !id.startsWith('joint-engineering-'),
);

const CORE_18 = ROLE_IDS.filter((id) =>
  id !== 'press-officer' &&
  !id.startsWith('capybara-') &&
  !id.startsWith('joint-engineering-'),
);
const A = 'admiral';
const W = 'wing-commander';
const QR = 'joint-engineering-quellon-refinery';
const SI = 'joint-engineering-shepherd-icebreaker';
const CORE_17 = [
  A, 'executive-officer', W, 'dione-captain', 'dione-president',
  'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
  'quellon-captain', 'quellon-engineer', 'quellon-explorer',
  'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
] as const;
const CAPYBARA_PAIR = ['capybara-captain', 'capybara-recycler'] as const;

export const JOINT_ENGINEERING_ROLE_IDS = [QR, SI] as const;
export type JointEngineeringRoleId = typeof JOINT_ENGINEERING_ROLE_IDS[number];

export const JOINT_ENGINEERING_REPLACEMENTS: Readonly<
  Record<JointEngineeringRoleId, readonly string[]>
> = {
  [QR]: ['quellon-engineer', 'refinery-124-engineer'],
  [SI]: ['shepherd-engineer', 'icebreaker-engineer'],
};

export const JOINT_ENGINEERING_SHIPS: Readonly<Record<JointEngineeringRoleId, readonly string[]>> = {
  [QR]: ['quellon', 'refinery-124'],
  [SI]: ['shepherd', 'icebreaker'],
};

export const JOINT_ENGINEERING_PLAYER_COUNTS: Readonly<
  Record<JointEngineeringRoleId, readonly number[]>
> = {
  [QR]: [8, 9, 14, 15],
  [SI]: [8, 14, 15],
};

const PRESETS: Readonly<Record<number, readonly string[]>> = {
  8: [A, W, 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer', 'refinery-124-pdf-colonel', QR, SI],
  9: [A, W, 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-explorer', 'refinery-124-pdf-colonel', QR],
  10: [A, W, 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  11: [A, 'executive-officer', W, 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  12: [A, W, 'dione-engineer', 'dione-president', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  13: [A, 'executive-officer', W, 'dione-engineer', 'dione-president', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  14: [A, W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-miner', 'shepherd-captain', 'shepherd-scientist', 'quellon-captain', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-pdf-colonel', QR, SI],
  15: [A, 'executive-officer', W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-miner', 'shepherd-captain', 'shepherd-scientist', 'quellon-captain', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-pdf-colonel', QR, SI],
  16: [A, W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist', 'quellon-captain', 'quellon-engineer', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  17: CORE_17,
  18: CORE_18,
  19: [...CORE_17, ...CAPYBARA_PAIR],
  20: [...CORE_18, ...CAPYBARA_PAIR],
};

export function recommendedRoleIds(playerCount: number): readonly string[] {
  return PRESETS[playerCount] ?? [];
}

export function isJointEngineeringRoleId(roleId: string): roleId is JointEngineeringRoleId {
  return (JOINT_ENGINEERING_ROLE_IDS as readonly string[]).includes(roleId);
}

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

export function jointEngineeringShipsForRole(roleId: string): readonly string[] {
  return isJointEngineeringRoleId(roleId) ? JOINT_ENGINEERING_SHIPS[roleId] : [];
}

/** Keep the server’s roster authority aligned with the printed replacement matrix. */
export function isValidRoleConfiguration(activeRoleIds: readonly string[]): boolean {
  if (new Set(activeRoleIds).size !== activeRoleIds.length) return false;
  if (activeRoleIds.includes('press-officer')) return false;
  if (activeRoleIds.some((roleId) => !(ROLE_IDS as readonly string[]).includes(roleId))) return false;
  return JOINT_ENGINEERING_ROLE_IDS.every((roleId) =>
    !activeRoleIds.includes(roleId) || isJointEngineeringRoleAvailable(activeRoleIds, roleId));
}
