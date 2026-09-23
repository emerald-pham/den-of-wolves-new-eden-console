import { createHash } from 'node:crypto';

export const CALLABLE_RATE_LIMIT_POLICIES = {
  // These budgets absorb duplicate reconnect/bootstrap calls while bounding repeated full roster work.
  resumeSession: { windowMs: 60_000, maxRequests: 10 },
  getSessionPresence: { windowMs: 60_000, maxRequests: 12 },
  // Two live GM consoles can overlap 12 five-second reconciles, 12 ten-second
  // heartbeat-triggered roster updates, and 4 fifteen-second polls (28/min).
  // A 60/min budget leaves 32 calls for focus changes, reconnects, and bursts.
  listGmInstances: { windowMs: 60_000, maxRequests: 60 },
  // Dice remain interactive; the higher budget limits event growth from tight automated loops.
  rollDice: { windowMs: 60_000, maxRequests: 30 },
  // Setup confirmations are deliberate facilitator actions, but configuration iteration can burst.
  // Twelve per minute allows one confirmation every five seconds; exact completed replays bypass the gate.
  confirmSetup: { windowMs: 60_000, maxRequests: 12 },
  // Starting is a one-time phase transition. Six attempts allow quick correction/retry bursts.
  // Exact completed replays bypass the gate before the collection reads.
  startGame: { windowMs: 60_000, maxRequests: 6 },
  // Attack declaration is a one-time prepared transition; allow six distinct attempts per minute.
  // Exact completed replays bypass the gate before the collection reads.
  declareWolfAttack: { windowMs: 60_000, maxRequests: 6 },
  // Maintenance remains interactive across allowed actions; 30/min permits a two-second burst cadence.
  // Exact completed replays bypass the gate before the conditional fleet scans.
  runMaintenance: { windowMs: 60_000, maxRequests: 30 },
} as const;

export type ExpensiveCallableName = keyof typeof CALLABLE_RATE_LIMIT_POLICIES;

export type CallableRateLimitIdentity = Readonly<{
  callableName: ExpensiveCallableName;
  sessionId: string;
  uid: string;
  requestId?: string;
  requestFingerprint?: string;
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
  requestHashes?: readonly string[];
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

function requestHash(identity: CallableRateLimitIdentity): string | undefined {
  if (identity.requestId === undefined) return undefined;
  return createHash('sha256')
    .update(`${identity.requestId}\0${identity.requestFingerprint ?? ''}`)
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
  if (identity.requestId !== undefined) requireIdentityPart(identity.requestId, 'requestId');
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
    'callableName', 'identityHash', 'requestCount', 'requestHashes', 'type', 'version', 'windowStartedAtMs',
  ];
  const legacyKeys = expectedKeys.filter(key => key !== 'requestHashes');
  const actualKeys = Object.keys(record).sort().join('|');
  if (actualKeys !== expectedKeys.join('|') && actualKeys !== legacyKeys.join('|')) return false;
  if ('requestHashes' in record && (!Array.isArray(record.requestHashes) ||
      record.requestHashes.length > 100 ||
      !record.requestHashes.every((hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)) ||
      new Set(record.requestHashes).size !== record.requestHashes.length)) return false;
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
  const requestKey = requestHash(identity);

  const makeState = (windowStartedAtMs: number, requestCount: number, requestHashes?: readonly string[]) => ({
    type: 'callable-rate-limit' as const,
    version: 1 as const,
    callableName: identity.callableName,
    identityHash: identityHash(identity),
    windowStartedAtMs,
    requestCount,
    ...(requestHashes !== undefined ? { requestHashes } : requestKey ? { requestHashes: [requestKey] } : {}),
  });

  if (storedValue === undefined || storedValue === null) {
    return {
      allowed: true,
      state: makeState(nowMs, 1),
    };
  }

  if (!isMarker(storedValue, identity) || storedValue.windowStartedAtMs > nowMs) {
    return { allowed: false, reason: 'invalid-marker' };
  }

  const elapsed = nowMs - storedValue.windowStartedAtMs;
  if (elapsed >= policy.windowMs) {
    return {
      allowed: true,
      state: makeState(nowMs, 1),
    };
  }

  if (requestKey && Array.isArray(storedValue.requestHashes) &&
      storedValue.requestHashes.includes(requestKey)) {
    return { allowed: true, state: storedValue };
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
    state: makeState(
      storedValue.windowStartedAtMs,
      storedValue.requestCount + 1,
      [...(storedValue.requestHashes ?? []), ...(requestKey ? [requestKey] : [])]
        .slice(-policy.maxRequests),
    ),
  };
}
