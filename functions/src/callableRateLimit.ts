import { createHash } from 'node:crypto';

export const CALLABLE_RATE_LIMIT_POLICIES = {
  // These budgets absorb duplicate reconnect/bootstrap calls while bounding repeated full roster work.
  resumeSession: { windowMs: 60_000, maxRequests: 10 },
  getSessionPresence: { windowMs: 60_000, maxRequests: 12 },
  // Normal GM use can overlap 12 five-second reconciles, 6 ten-second presence
  // heartbeats, and 4 fifteen-second roster polls (22/min). A 60/min budget
  // leaves 38 calls for focus changes, reconnects, and listener refresh bursts.
  listGmInstances: { windowMs: 60_000, maxRequests: 60 },
  // Dice remain interactive; the higher budget limits event growth from tight automated loops.
  rollDice: { windowMs: 60_000, maxRequests: 30 },
} as const;

export type ExpensiveCallableName = keyof typeof CALLABLE_RATE_LIMIT_POLICIES;

export type CallableRateLimitIdentity = Readonly<{
  callableName: ExpensiveCallableName;
  sessionId: string;
  uid: string;
}>;

export type CallableRateLimitPolicy = Readonly<{
  windowMs: number;
  maxRequests: number;
}>;

export type CallableRateLimitMarker = Readonly<{
  type: 'callable-rate-limit';
  version: 1;
  callableName: ExpensiveCallableName;
  identityHash: string;
  windowStartedAtMs: number;
  requestCount: number;
}>;

export type CallableRateLimitDecision =
  | Readonly<{ allowed: true; state: CallableRateLimitMarker }>
  | Readonly<{
      allowed: false;
      reason: 'limit-reached';
      retryAfterMs: number;
    }>
  | Readonly<{ allowed: false; reason: 'invalid-marker' }>;

function requireIdentityPart(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
}

function identityHash(identity: CallableRateLimitIdentity): string {
  return createHash('sha256')
    .update(`${identity.sessionId}\0${identity.uid}`)
    .digest('hex');
}

function validateInputs(
  identity: CallableRateLimitIdentity,
  policy: CallableRateLimitPolicy,
  nowMs: number,
): void {
  requireIdentityPart(identity.sessionId, 'sessionId');
  requireIdentityPart(identity.uid, 'uid');
  requireIdentityPart(identity.callableName, 'callableName');
  if (!Number.isSafeInteger(policy.windowMs) || policy.windowMs <= 0 ||
      !Number.isSafeInteger(policy.maxRequests) || policy.maxRequests <= 0) {
    throw new RangeError('Callable rate-limit policy must use positive safe integer values.');
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError('Rate-limit time must be a non-negative safe integer.');
  }
}

function isMarker(value: unknown, identity: CallableRateLimitIdentity): value is CallableRateLimitMarker {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    'callableName', 'identityHash', 'requestCount', 'type', 'version', 'windowStartedAtMs',
  ];
  if (Object.keys(record).sort().join('|') !== expectedKeys.join('|')) return false;
  return record.type === 'callable-rate-limit' && record.version === 1 &&
    record.callableName === identity.callableName &&
    record.identityHash === identityHash(identity) &&
    Number.isSafeInteger(record.windowStartedAtMs) && (record.windowStartedAtMs as number) >= 0 &&
    Number.isSafeInteger(record.requestCount) && (record.requestCount as number) >= 1;
}

export function callableRateLimitDocumentId(identity: CallableRateLimitIdentity): string {
  requireIdentityPart(identity.sessionId, 'sessionId');
  requireIdentityPart(identity.uid, 'uid');
  requireIdentityPart(identity.callableName, 'callableName');
  return createHash('sha256')
    .update(`${identity.callableName}\0${identity.sessionId}\0${identity.uid}`)
    .digest('hex');
}

export function evaluateCallableRateLimit(
  storedValue: unknown,
  identity: CallableRateLimitIdentity,
  policy: CallableRateLimitPolicy,
  nowMs: number,
): CallableRateLimitDecision {
  validateInputs(identity, policy, nowMs);

  if (storedValue === undefined || storedValue === null) {
    return {
      allowed: true,
      state: {
        type: 'callable-rate-limit',
        version: 1,
        callableName: identity.callableName,
        identityHash: identityHash(identity),
        windowStartedAtMs: nowMs,
        requestCount: 1,
      },
    };
  }

  if (!isMarker(storedValue, identity) || storedValue.windowStartedAtMs > nowMs) {
    return { allowed: false, reason: 'invalid-marker' };
  }

  const elapsed = nowMs - storedValue.windowStartedAtMs;
  if (elapsed >= policy.windowMs) {
    return {
      allowed: true,
      state: {
        type: 'callable-rate-limit',
        version: 1,
        callableName: identity.callableName,
        identityHash: identityHash(identity),
        windowStartedAtMs: nowMs,
        requestCount: 1,
      },
    };
  }

  if (storedValue.requestCount >= policy.maxRequests) {
    return {
      allowed: false,
      reason: 'limit-reached',
      retryAfterMs: policy.windowMs - elapsed,
    };
  }

  return {
    allowed: true,
    state: { ...storedValue, requestCount: storedValue.requestCount + 1 },
  };
}
