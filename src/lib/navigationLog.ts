import type { ShipNavigationLogEntry } from '@/types/game';

/** The shared stardate uses UTC so every console sees the same server event. */
export function stardateForDate(date: Date): string {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor((Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ) - startOfYear) / 86_400_000) + 1;
  const two = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}.${String(day).padStart(3, '0')}.${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}`;
}

/** Return the route's previous fixes, excluding the ship's current system. */
export function visitedCoordinates(
  entries: readonly ShipNavigationLogEntry[],
  currentCoordinate: string,
): readonly string[] {
  const ordered = entries
    .filter((entry) => entry.type === 'self-jump')
    .flatMap((entry) => [entry.origin, entry.destination]);
  return [...new Set(ordered)].filter((coordinate) => coordinate !== currentCoordinate);
}

export function navigationEntryMessage(entry: ShipNavigationLogEntry): string {
  const subject = (entry.subjectShipName ?? entry.subjectShipId ?? entry.shipId).toUpperCase();
  if (entry.type === 'self-jump') {
    return entry.navigationalError
      ? `JUMP // NAVIGATIONAL ERROR // ${entry.origin} → ${entry.destination}`
      : `JUMP // ${entry.origin} → ${entry.destination}`;
  }
  if (entry.type === 'ship-jump-away') {
    return `${subject} // JUMPED AWAY // ${entry.origin} → ${entry.destination}`;
  }
  return `${subject} // JUMPED INTO SYSTEM // ${entry.origin} → ${entry.destination}`;
}
