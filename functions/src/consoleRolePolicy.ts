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

/** Resolve the one core console a player is entitled to activate. */
export function boundCoreConsoleRole(
  assignedRoleId: unknown,
  seatId: unknown,
): string | undefined {
  const assignedPress = assignedRoleId === 'press-officer';
  const seatPress = seatId === 'press-officer';
  const assigned = typeof assignedRoleId === 'string' && assignedRoleId.length > 0 &&
    !assignedPress ? assignedRoleId : undefined;
  const seat = typeof seatId === 'string' && seatId.length > 0 &&
    !seatPress ? seatId : undefined;
  if ((assignedPress && seat) || (seatPress && assigned)) return undefined;
  if (assigned && seat && assigned !== seat) return undefined;
  return assigned ?? seat;
}

export function disconnectedRoleState(): {
  role: 'player';
  activeConsoleRoleId: null;
} {
  return { role: 'player', activeConsoleRoleId: null };
}
