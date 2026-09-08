import type { LifecyclePhase } from './lifecycle';

/** Visibility scopes are intentionally allow-listed to prevent ad hoc leaks. */
export enum EventVisibility {
  Public = 'public',
  Member = 'member',
  Crew = 'crew',
  RolePrivate = 'role-private',
  LoyaltyPrivate = 'loyalty-private',
  Facilitator = 'facilitator',
}

export interface AuthoritativeEventEnvelope {
  readonly sessionId: string;
  readonly actorUid: string;
  readonly actorRoleId: string | null;
  readonly turn: number;
  readonly phase: LifecyclePhase;
  readonly type: string;
  readonly requestId: string;
  readonly revision: number;
  readonly serverTime: string;
  readonly visibility: EventVisibility;
}

export interface BuildAuthoritativeEventEnvelopeInput {
  readonly sessionId: string;
  readonly actorUid: string;
  readonly actorRoleId: string | null;
  readonly turn: number;
  readonly phase: LifecyclePhase;
  readonly type: string;
  readonly requestId: string;
  readonly revision: number;
  readonly serverTime: string | Date;
  readonly visibility: EventVisibility;
}

function requireNonEmpty(value: string, field: string): string {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
  return value;
}

function requireCounter(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeServerTime(value: string | Date): string {
  const normalized = value instanceof Date ? value.toISOString() : value;
  if (Number.isNaN(Date.parse(normalized))) throw new Error('serverTime must be a valid timestamp');
  return normalized;
}

/** Build the common server-authored shape emitted by authoritative callables. */
export function buildAuthoritativeEventEnvelope(
  input: BuildAuthoritativeEventEnvelopeInput,
): AuthoritativeEventEnvelope {
  return {
    sessionId: requireNonEmpty(input.sessionId, 'sessionId'),
    actorUid: requireNonEmpty(input.actorUid, 'actorUid'),
    actorRoleId: input.actorRoleId === null
      ? null
      : requireNonEmpty(input.actorRoleId, 'actorRoleId'),
    turn: requireCounter(input.turn, 'turn'),
    phase: input.phase,
    type: requireNonEmpty(input.type, 'type'),
    requestId: requireNonEmpty(input.requestId, 'requestId'),
    revision: requireCounter(input.revision, 'revision'),
    serverTime: normalizeServerTime(input.serverTime),
    visibility: input.visibility,
  };
}
