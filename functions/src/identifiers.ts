/**
 * Server-side counterpart to `src/types/identifiers.ts`.
 *
 * Functions compile as an independent TypeScript project, so the wire
 * contract is intentionally kept dependency-free and mirrored here. Both
 * modules brand the same unchanged Firestore string representation.
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

export type EntityId<K extends EntityKind> = string & {
  readonly [entityIdBrand]?: K;
};

export type SessionId = EntityId<'session'>;
export type PlayerId = EntityId<'player'>;
export type SeatId = EntityId<'seat'>;
/** Role-keyed legacy seat documents are compared to roles during hydration. */
export type RoleId = EntityId<'role'> | SeatId;
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

export function isWireSafeEntityId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1_500 && !value.includes('/');
}

export function parseEntityId<K extends EntityKind>(kind: K, value: unknown): EntityId<K> | undefined {
  void kind;
  return isWireSafeEntityId(value) ? value : undefined;
}

export function entityId<K extends EntityKind>(kind: K, value: unknown): EntityId<K> {
  const parsed = parseEntityId(kind, value);
  if (!parsed) throw new Error(`Invalid ${kind} identifier.`);
  return parsed;
}

export function wireEntityId<K extends EntityKind>(value: EntityId<K>): string {
  return value;
}
