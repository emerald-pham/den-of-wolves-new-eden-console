export function canClaimSeat(currentSeatId: unknown): boolean {
  return currentSeatId === null;
}

export function shouldClearSeatPointer(
  currentSeatId: unknown,
  releasedSeatId: string,
): boolean {
  return currentSeatId === releasedSeatId;
}
