export function canSelectConsoleRole(
  activeRoleId: string | null | undefined,
  requestedRoleId: string,
  isGm: boolean,
): boolean {
  return isGm || activeRoleId == null || activeRoleId === requestedRoleId;
}

export function disconnectedRoleState(): {
  role: 'player';
  activeConsoleRoleId: null;
} {
  return { role: 'player', activeConsoleRoleId: null };
}
