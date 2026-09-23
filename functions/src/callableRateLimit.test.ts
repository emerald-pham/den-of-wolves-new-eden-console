import { describe, expect, it } from 'vitest';
import {
  CALLABLE_RATE_LIMIT_POLICIES,
  callableRateLimitDocumentId,
  evaluateCallableRateLimit,
} from './callableRateLimit';

describe('expensive callable rate limits', () => {
  const identity = { callableName: 'resumeSession', sessionId: 'session-a', uid: 'uid-a' };
  const policy = { windowMs: 60_000, maxRequests: 2 };

  it('allows a small same-session retry burst and denies requests after the configured limit', () => {
    const first = evaluateCallableRateLimit(undefined, identity, policy, 1_000);
    expect(first.allowed).toBe(true);
    if (!first.allowed) throw new Error('first request should be allowed');

    const second = evaluateCallableRateLimit(first.state, identity, policy, 1_100);
    expect(second.allowed).toBe(true);
    if (!second.allowed) throw new Error('second request should be allowed');

    expect(evaluateCallableRateLimit(second.state, identity, policy, 1_200)).toEqual({
      allowed: false,
      retryAfterMs: 59_800,
      reason: 'limit-reached',
    });
  });

  it('starts a fresh fixed window exactly when the prior window expires', () => {
    const first = evaluateCallableRateLimit(undefined, identity, policy, 1_000);
    if (!first.allowed) throw new Error('first request should be allowed');
    const second = evaluateCallableRateLimit(first.state, identity, policy, 1_100);
    if (!second.allowed) throw new Error('second request should be allowed');

    const afterWindow = evaluateCallableRateLimit(second.state, identity, policy, 61_000);
    expect(afterWindow).toMatchObject({ allowed: true, state: { windowStartedAtMs: 61_000, requestCount: 1 } });
  });

  it('keys buckets by authenticated identity, session, and callable without exposing raw UIDs', () => {
    const ownBucket = callableRateLimitDocumentId(identity);
    expect(ownBucket).toMatch(/^[a-f0-9]{64}$/);
    expect(ownBucket).not.toContain(identity.uid);
    expect(callableRateLimitDocumentId({ ...identity, uid: 'uid-b' })).not.toBe(ownBucket);
    expect(callableRateLimitDocumentId({ ...identity, sessionId: 'session-b' })).not.toBe(ownBucket);
    expect(callableRateLimitDocumentId({ ...identity, callableName: 'rollDice' })).not.toBe(ownBucket);
  });

  it('fails closed when a private marker is malformed, belongs to another identity, or moves into the future', () => {
    const valid = evaluateCallableRateLimit(undefined, identity, policy, 10_000);
    if (!valid.allowed) throw new Error('first request should be allowed');

    expect(evaluateCallableRateLimit({ ...valid.state, identityHash: 'spoofed' }, identity, policy, 10_001))
      .toMatchObject({ allowed: false, reason: 'invalid-marker' });
    expect(evaluateCallableRateLimit({ ...valid.state, requestCount: 0 }, identity, policy, 10_001))
      .toMatchObject({ allowed: false, reason: 'invalid-marker' });
    expect(evaluateCallableRateLimit({ ...valid.state, windowStartedAtMs: 10_002 }, identity, policy, 10_001))
      .toMatchObject({ allowed: false, reason: 'invalid-marker' });
  });

  it('sets budgets for the audited expensive callables and excludes client identity from the policy', () => {
    expect(CALLABLE_RATE_LIMIT_POLICIES).toEqual({
      resumeSession: { windowMs: 60_000, maxRequests: 10 },
      getSessionPresence: { windowMs: 60_000, maxRequests: 12 },
      listGmInstances: { windowMs: 60_000, maxRequests: 12 },
      rollDice: { windowMs: 60_000, maxRequests: 30 },
    });
    expect(CALLABLE_RATE_LIMIT_POLICIES).not.toHaveProperty('uid');
    expect(CALLABLE_RATE_LIMIT_POLICIES).not.toHaveProperty('ip');
  });
});
