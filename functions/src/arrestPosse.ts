/** Calculate the printed arrest posse count without returning target suspicion. */
export function calculateArrestPosseSize(
  targetSuspicion: unknown,
  defenderCount: unknown,
  adjustment?: unknown,
): number {
  if (typeof targetSuspicion !== 'number' || !Number.isSafeInteger(targetSuspicion) || targetSuspicion < 0 ||
      typeof defenderCount !== 'number' || !Number.isSafeInteger(defenderCount) || defenderCount < 0 ||
      (adjustment !== undefined && adjustment !== -1 && adjustment !== 1)) {
    throw new Error('Arrest posse inputs must be canonical non-negative integers and an optional -1 or +1 adjustment.');
  }

  const suspicionBands = Math.floor(targetSuspicion / 5);
  const requiredPlayers = 6 - suspicionBands + defenderCount + (adjustment ?? 0);
  if (!Number.isSafeInteger(requiredPlayers)) {
    throw new Error('The arrest posse count exceeds the safe integer range.');
  }

  return requiredPlayers;
}
