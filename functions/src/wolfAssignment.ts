export const WOLF_ROLE_IDS = [
  'press-officer',
  'admiral',
  'executive-officer',
  'wing-commander',
] as const;

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
