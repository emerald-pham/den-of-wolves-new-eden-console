import type { LifecyclePhase } from './lifecycle';

/**
 * Common server-authored metadata returned by every vessel-console command.
 * The domain reply remains alongside this envelope for compatibility, while
 * the envelope gives clients one stable audit/replay contract.
 */
export interface VesselActionEnvelope {
  readonly actorUid: string;
  readonly actorRoleId: string | null;
  readonly vesselId: string;
  readonly hostShipId?: string;
  readonly turn: number;
  readonly phase: LifecyclePhase;
  readonly revision: number;
  readonly idempotencyKey: string;
  readonly auditId: string;
}

export interface VesselActionEnvelopeInput {
  readonly actorUid: string;
  readonly actorRoleId: string | null;
  readonly vesselId: string;
  readonly hostShipId?: string;
  readonly turn: number;
  readonly phase: LifecyclePhase;
  readonly revision: number;
  readonly idempotencyKey: string;
  readonly auditId: string;
}

function requiredText(value: string, field: string): string {
  if (value.trim().length === 0 || value.length > 128) {
    throw new Error(`${field} must be a non-empty bounded identifier.`);
  }
  return value;
}

function requiredRevision(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer.`);
  }
  return value;
}

/** Build only server-owned envelope fields; callers must obtain every value from the transaction. */
export function buildVesselActionEnvelope(input: VesselActionEnvelopeInput): VesselActionEnvelope {
  return {
    actorUid: requiredText(input.actorUid, 'actorUid'),
    actorRoleId: input.actorRoleId === null ? null : requiredText(input.actorRoleId, 'actorRoleId'),
    vesselId: requiredText(input.vesselId, 'vesselId'),
    ...(input.hostShipId === undefined ? {} : { hostShipId: requiredText(input.hostShipId, 'hostShipId') }),
    turn: requiredRevision(input.turn, 'turn'),
    phase: input.phase,
    revision: requiredRevision(input.revision, 'revision'),
    idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey'),
    auditId: requiredText(input.auditId, 'auditId'),
  };
}
