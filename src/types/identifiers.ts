/**
 * Wire-safe identity values shared by client snapshots and future game tables.
 *
 * The brand is erased when an ID is written to Firestore, so this contract
 * preserves the existing string representation while preventing one entity's
 * identifier from being used where another entity's identifier is expected.
 */

export const ENTITY_ID_KINDS = [
  'session',
  'player',
  'seat',
  'role',
  'vessel',
  'console',
  'shuttle',
  'group',
  'mission',
  'attack',
  'event',
] as const;

export type EntityKind = typeof ENTITY_ID_KINDS[number];

declare const entityIdBrand: unique symbol;

/** A string that has been checked at a wire boundary for one entity kind. */
export type EntityId<K extends EntityKind> = string & {
  /** Optional keeps existing object fixtures source-compatible during the
   * incremental migration; values crossing a snapshot boundary are still
   * narrowed by `parseEntityId`/`entityId`. */
  readonly [entityIdBrand]?: K;
};

export type SessionId = EntityId<'session'>;
export type PlayerId = EntityId<'player'>;
export type SeatId = EntityId<'seat'>;
export type RoleId = EntityId<'role'>;
export type VesselId = EntityId<'vessel'>;
export type ConsoleId = EntityId<'console'>;
export type ShuttleId = EntityId<'shuttle'>;
export type GroupId = EntityId<'group'>;
export type MissionId = EntityId<'mission'>;
export type AttackId = EntityId<'attack'>;
export type EventId = EntityId<'event'>;

export interface EntityIdByKind {
  readonly session: SessionId;
  readonly player: PlayerId;
  readonly seat: SeatId;
  readonly role: RoleId;
  readonly vessel: VesselId;
  readonly console: ConsoleId;
  readonly shuttle: ShuttleId;
  readonly group: GroupId;
  readonly mission: MissionId;
  readonly attack: AttackId;
  readonly event: EventId;
}

export type AnyEntityId = EntityIdByKind[EntityKind];

/**
 * Firestore document IDs are strings in the wire format. A slash would turn a
 * single ID into a path, so it is the only structural character rejected here;
 * existing domain values otherwise pass through unchanged.
 */
export function isWireSafeEntityId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1_500 && !value.includes('/');
}

export function isEntityId<K extends EntityKind>(kind: K, value: unknown): value is EntityId<K> {
  void kind;
  return isWireSafeEntityId(value);
}

/** Parse an untrusted snapshot value without changing its wire representation. */
export function parseEntityId<K extends EntityKind>(kind: K, value: unknown): EntityId<K> | undefined {
  return isEntityId(kind, value) ? value : undefined;
}

/** Construct an ID for trusted catalog values or throw on malformed input. */
export function entityId<K extends EntityKind>(kind: K, value: unknown): EntityId<K> {
  const parsed = parseEntityId(kind, value);
  if (!parsed) throw new Error(`Invalid ${kind} identifier.`);
  return parsed;
}

/** Convert a typed ID back to the unchanged Firestore wire value. */
export function wireEntityId<K extends EntityKind>(value: EntityId<K>): string {
  return value;
}
