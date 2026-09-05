export function canSelectConsoleRole(
  activeRoleId: string | null | undefined,
  requestedRoleId: string,
  isGm: boolean,
  heldByAnotherPlayer: boolean,
): boolean {
  return !heldByAnotherPlayer && (
    isGm || activeRoleId == null || activeRoleId === requestedRoleId
  );
}

export function disconnectedRoleState(): {
  role: 'player';
  activeConsoleRoleId: null;
} {
  return { role: 'player', activeConsoleRoleId: null };
}
