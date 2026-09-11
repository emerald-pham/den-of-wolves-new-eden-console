import { EventVisibility } from './eventEnvelope';

/**
 * Member-readable events are an audit read model.  Every field in this map is
 * deliberately allow-listed per event type; callers cannot accidentally make
 * a command fingerprint, secret payload, or server-only input visible by
 * spreading an authoritative record into the event document.
 */
const MEMBER_EVENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'session.created': [],
  'setup-confirm': ['action', 'actorUid', 'requestId', 'revision', 'activeRoleIds'],
  'gm-responsibility': ['action', 'actorUid', 'requestId', 'expectedSetupRevision', 'revision'],
  'game-started': ['actorUid', 'requestId', 'turn', 'phase', 'revision'],
  'casting-preference': ['actorUid', 'requestId', 'shipId'],
  'role-assignment': ['actorUid', 'targetUid', 'roleId', 'requestId'],
  'role-release': ['actorUid', 'targetUid', 'requestId'],
  'loyalty-assignment': ['actorUid', 'requestId'],
  'android-proof-disclosed': ['actorUid', 'requestId'],
  'press-availability': ['actorUid', 'requestId', 'expectedRevision', 'previousPressEnabled', 'pressEnabled'],
  'seat-claim': ['actorUid', 'seatId', 'revision', 'requestId'],
  'seat-release': ['actorUid', 'seatId', 'revision', 'requestId', 'reason'],
  'airspace-opened': ['transition'],
  'turn-advanced': ['transition', 'fromTurn', 'toTurn', 'reason'],
  'timer-pause': ['action', 'turn', 'window', 'actorName', 'byUid'],
  'ship-confetti': ['shipId', 'shipName', 'actorUid', 'actorName', 'actorRoleName'],
  'roll': ['byUid', 'sides', 'count', 'rolls', 'total'],
  'maintenance': ['shipId', 'shipName', 'action', 'results'],
  'ship-repaired': ['actorUid', 'shipId'],
  'maintenance-rollback': ['actorUid', 'requestId', 'eventId', 'shipId', 'revision'],
};

/**
 * These are the envelope fields that are useful for replay and facilitator
 * inspection while remaining free of command fingerprints and private state.
 * Actor identity remains part of the existing member audit contract. Hidden
 * decisions and command fingerprints are still excluded by the event-specific
 * allowlist below.
 */
const MEMBER_ENVELOPE_FIELDS = [
  'sessionId',
  'actorUid',
  'actorRoleId',
  'turn',
  'phase',
  'type',
  'requestId',
  'revision',
  'serverTime',
  'visibility',
  'createdAt',
] as const;

type EventRecord = object;

export type PrivacySafeEventInput = Readonly<{
  readonly type: string;
  readonly envelope?: EventRecord;
  readonly payload?: EventRecord;
  readonly createdAt: unknown;
}>;

function pick(record: EventRecord, fields: readonly string[]): Record<string, unknown> {
  const values = record as Record<string, unknown>;
  return Object.fromEntries(fields.flatMap((field) =>
    Object.prototype.hasOwnProperty.call(values, field) ? [[field, values[field]]] : []));
}

/**
 * Build the member-readable event projection from server-authored inputs.
 * Unknown event types fail closed to the safe envelope only, so adding a new
 * event requires an explicit privacy decision in this module.
 */
export function buildPrivacySafeEventRecord(input: PrivacySafeEventInput): Record<string, unknown> {
  const suppliedVisibility = input.envelope &&
    (input.envelope as Record<string, unknown>).visibility;
  if (suppliedVisibility !== undefined && suppliedVisibility !== EventVisibility.Member) {
    throw new Error('Member-readable events must use member visibility');
  }
  const envelope = {
    ...(input.envelope ?? {}),
    type: input.type,
    createdAt: input.createdAt,
  };
  const payload = input.payload ?? {};
  const fields = MEMBER_EVENT_FIELDS[input.type] ?? [];
  return {
    ...pick(envelope, MEMBER_ENVELOPE_FIELDS),
    ...pick(payload, fields),
  };
}

export function memberEventFieldsFor(type: string): readonly string[] {
  return MEMBER_EVENT_FIELDS[type] ?? [];
}
