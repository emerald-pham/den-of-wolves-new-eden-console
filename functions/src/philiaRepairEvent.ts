import { EventVisibility } from './eventEnvelope';

const MEMBER_ENVELOPE_FIELDS = [
  'sessionId', 'actorUid', 'actorRoleId', 'turn', 'phase', 'type',
  'requestId', 'revision', 'serverTime', 'visibility',
] as const;

const MEMBER_REPAIR_FIELDS = ['hostShipId', 'systemIds', 'materialsSpent'] as const;

function pick(record: Readonly<Record<string, unknown>>, fields: readonly string[]) {
  return Object.fromEntries(fields.flatMap((field) =>
    Object.prototype.hasOwnProperty.call(record, field) ? [[field, record[field]]] : []));
}

/**
 * Project the Philia repair audit event to the small member-visible contract.
 * The shared event allowlist is owned by another active task, so this local
 * projection keeps the callable fail-closed until that allowlist can be merged.
 */
export function buildPhiliaRepairMemberEventRecord(input: Readonly<{
  envelope: object;
  payload: object;
  createdAt: unknown;
}>): Record<string, unknown> {
  const envelope = input.envelope as Record<string, unknown>;
  if (envelope.visibility !== EventVisibility.Member) {
    throw new Error('Member-readable Philia repair events must use member visibility.');
  }
  return {
    ...pick({ ...envelope, type: 'philia-repair' }, MEMBER_ENVELOPE_FIELDS),
    createdAt: input.createdAt,
    shuttleId: 'philia',
    ...pick(input.payload as Record<string, unknown>, MEMBER_REPAIR_FIELDS),
  };
}
