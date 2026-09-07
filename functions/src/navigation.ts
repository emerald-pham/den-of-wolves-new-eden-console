export type NavigationEventType = 'self-jump' | 'ship-jump-away' | 'ship-jump-arrival';

export interface NavigationLogEntry {
  readonly id: string;
  readonly shipId: string;
  readonly type: NavigationEventType;
  readonly origin: string;
  readonly destination: string;
  readonly subjectShipId?: string;
  readonly subjectShipName?: string;
  readonly navigationalError?: boolean;
  readonly occurredAt: string;
  readonly stardate: string;
}

export type NavigationLogs = Readonly<Record<string, readonly NavigationLogEntry[]>>;

const PRINTED_COORDINATES = new Set([
  '0000', '5143', '1413', '9997', '6837', '0488', '6931', '4454',
  '4753', '1096', '6964', '2580', '3068', '0853', '6943', '6798',
  '8378', '1964', '1380', '1836', '0408', '4888',
]);

export function isStarSystemCoordinate(value: string): boolean {
  return PRINTED_COORDINATES.has(value);
}

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

export interface ShipNavigationMoveInput {
  readonly shipId: string;
  readonly destination: string;
  readonly now: Date;
  readonly coordinates: Readonly<Record<string, string>>;
  readonly logs: NavigationLogs;
  readonly shipNames: Readonly<Record<string, string>>;
  readonly eventIdPrefix?: string;
}

export interface ShipNavigationMoveResult {
  readonly coordinates: Readonly<Record<string, string>>;
  readonly logs: NavigationLogs;
  readonly origin: string;
  readonly destination: string;
  readonly stardate: string;
}

function eventId(prefix: string | undefined, index: number, shipId: string, now: Date): string {
  return prefix ? `${prefix}-${index}` : `${shipId}-${now.getTime()}-${index}`;
}

function append(
  logs: Record<string, NavigationLogEntry[]>,
  shipId: string,
  entry: NavigationLogEntry,
): void {
  logs[shipId] = [entry, ...(logs[shipId] ?? [])];
}

/**
 * Apply one GM relocation and fan out only the local-system notifications that
 * other fleet bridges could actually hear. Wolves are absent from the input
 * ship list and therefore cannot leak into a player log.
 */
export function applyShipNavigationMove(input: ShipNavigationMoveInput): ShipNavigationMoveResult {
  if (!isStarSystemCoordinate(input.destination)) throw new Error('Unknown printed star system.');
  const origin = input.coordinates[input.shipId] ?? '0000';
  if (!isStarSystemCoordinate(origin)) throw new Error('Ship has an unknown current system.');
  if (origin === input.destination) throw new Error('Ship is already at that system.');

  const occurredAt = input.now.toISOString();
  const stardate = stardateForDate(input.now);
  const nextCoordinates = { ...input.coordinates, [input.shipId]: input.destination };
  const nextLogs: Record<string, NavigationLogEntry[]> = Object.fromEntries(
    Object.entries(input.logs).map(([shipId, entries]) => [shipId, [...entries]]),
  );
  let sequence = 0;
  append(nextLogs, input.shipId, {
    id: eventId(input.eventIdPrefix, sequence++, input.shipId, input.now),
    shipId: input.shipId,
    type: 'self-jump',
    origin,
    destination: input.destination,
    navigationalError: true,
    occurredAt,
    stardate,
  });

  for (const [shipId, coordinate] of Object.entries(input.coordinates)) {
    if (shipId === input.shipId || !input.shipNames[shipId]) continue;
    const type: NavigationEventType | undefined = coordinate === origin
      ? 'ship-jump-away'
      : coordinate === input.destination
        ? 'ship-jump-arrival'
        : undefined;
    if (!type) continue;
    append(nextLogs, shipId, {
      id: eventId(input.eventIdPrefix, sequence++, shipId, input.now),
      shipId,
      type,
      origin,
      destination: input.destination,
      subjectShipId: input.shipId,
      subjectShipName: input.shipNames[input.shipId] ?? input.shipId,
      occurredAt,
      stardate,
    });
  }

  return { coordinates: nextCoordinates, logs: nextLogs, origin, destination: input.destination, stardate };
}
