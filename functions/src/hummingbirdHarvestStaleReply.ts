import { parseHummingbirdHarvestState, type HummingbirdHarvestState } from './hummingbirdHarvest';
import { buildVesselActionEnvelope } from './vesselActionEnvelope';

export interface HummingbirdHarvestStaleContext {
  readonly sessionId: string;
  readonly actorUid: string;
  readonly actorRoleId: string | null;
  readonly hostShipId: string;
  readonly turn: number;
  readonly requestId: string;
  readonly expectedRevision: number;
}

export interface HummingbirdHarvestStaleReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly harvest: HummingbirdHarvestState;
  readonly actorUid: string;
  readonly actorRoleId: 'quellon-explorer';
  readonly vesselId: 'hummingbird';
  readonly hostShipId: string;
  readonly turn: number;
  readonly phase: 'active';
  readonly revision: number;
  readonly idempotencyKey: string;
  readonly auditId: string;
}

function isBoundedText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function isCounter(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

/**
 * Return only a current-cycle private receipt that proves an ordinary CAS loss.
 * The caller must obtain actor, host, cycle, and request context from its live
 * transaction; this pure helper performs no writes and grants no authority.
 */
export function buildHummingbirdHarvestStaleReply(
  value: unknown,
  context: HummingbirdHarvestStaleContext,
): HummingbirdHarvestStaleReply | undefined {
  if (!isBoundedText(context.sessionId) || !isBoundedText(context.actorUid) ||
      !isBoundedText(context.hostShipId) || context.actorRoleId !== 'quellon-explorer' ||
      !isCounter(context.turn, 1) || !isCounter(context.expectedRevision, 0) ||
      typeof context.requestId !== 'string' || !/^[\w-]{1,128}$/.test(context.requestId)) {
    return undefined;
  }
  const harvest = parseHummingbirdHarvestState(value);
  if (!harvest || harvest.sessionId !== context.sessionId ||
      harvest.ownerUid !== context.actorUid || harvest.hostShipId !== context.hostShipId ||
      harvest.turn !== context.turn || harvest.revision <= context.expectedRevision) {
    return undefined;
  }
  const envelope = buildVesselActionEnvelope({
    actorUid: context.actorUid,
    actorRoleId: 'quellon-explorer',
    vesselId: 'hummingbird',
    hostShipId: context.hostShipId,
    turn: context.turn,
    phase: 'active',
    revision: harvest.revision,
    idempotencyKey: context.requestId,
    auditId: `hummingbird-harvest-${context.requestId}`,
  });
  return {
    status: 'stale',
    sessionId: context.sessionId,
    requestId: context.requestId,
    harvest,
    ...envelope,
    actorRoleId: 'quellon-explorer',
    vesselId: 'hummingbird',
    hostShipId: context.hostShipId,
    turn: context.turn,
    phase: 'active',
  };
}
