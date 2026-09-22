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
  'fleet-ticker': ['action', 'messageId', 'revision', 'sequence', 'serverTime'],
  'admiral-directive': ['kind', 'revision', 'cycle', 'serverTime'],
  'president-action': ['kind', 'revision', 'cycle', 'serverTime'],
  'timer-pause': ['action', 'turn', 'window', 'actorName', 'byUid', 'reason'],
  'wolf-attack-declared': ['status', 'currentStep', 'deadlineAt', 'airspace', 'parkedCraftCount'],
  'ship-confetti': ['shipId', 'shipName', 'actorUid', 'actorName', 'actorRoleName'],
  'roll': ['byUid', 'sides', 'count', 'rolls', 'total'],
  'maintenance': ['shipId', 'shipName', 'action', 'results'],
  'ship-repaired': ['actorUid', 'shipId'],
  'maintenance-rollback': ['actorUid', 'requestId', 'eventId', 'shipId', 'revision'],
  'crisis-state': ['crisisId', 'state', 'title'],
  'voyage-admitted': ['crisisId', 'crisisRevision', 'vesselId', 'population', 'commitments'],
  'shuttle-survivor-evacuation': [
    'shuttleId', 'sourceShipId', 'destinationShipId', 'amount',
    'sourcePopulation', 'destinationPopulation', 'movedThisCycle',
  ],
  'shuttle-arrival': ['shuttleId'],
  'service-shuttle-recharge': ['shuttleId', 'hostShipId', 'consoleId', 'immediate', 'message'],
  'blacksmith-repair': ['shuttleId', 'hostShipId', 'systemIds', 'materialsSpent'],
  'highwall-mining': ['shuttleId', 'resource', 'rolls', 'amount', 'operation'],
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

// Arrival events tell members that a shuttle completed its trip without
// exposing the holder identity or the private transit route.
const MEMBER_ENVELOPE_FIELDS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  'shuttle-arrival': MEMBER_ENVELOPE_FIELDS.filter((field) =>
    field !== 'actorUid' && field !== 'actorRoleId'),
};

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
    ...pick(envelope, MEMBER_ENVELOPE_FIELDS_BY_TYPE[input.type] ?? MEMBER_ENVELOPE_FIELDS),
    ...pick(payload, fields),
  };
}

export function memberEventFieldsFor(type: string): readonly string[] {
  return MEMBER_EVENT_FIELDS[type] ?? [];
}
