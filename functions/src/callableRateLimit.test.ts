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

  it('deduplicates the same authenticated request ID within a rate window', () => {
    const requestIdentity = { ...identity, requestId: 'same-request' };
    const first = evaluateCallableRateLimit(undefined, requestIdentity, policy, 1_000);
    if (!first.allowed) throw new Error('first request should be allowed');

    const duplicate = evaluateCallableRateLimit(first.state, requestIdentity, policy, 1_001);
    expect(duplicate).toEqual({ allowed: true, state: first.state });
    if (!duplicate.allowed) throw new Error('same request must remain eligible for replay');

    const nextRequest = evaluateCallableRateLimit(
      duplicate.state, { ...requestIdentity, requestId: 'different-request' }, policy, 1_002,
    );
    expect(nextRequest).toMatchObject({ allowed: true, state: { requestCount: 2 } });
    expect(first.state).not.toHaveProperty('requestId');
  });

  it('does not let a reused request ID with a different payload bypass the request budget', () => {
    const requestIdentity = { ...identity, requestId: 'same-request', requestFingerprint: 'payload-a' };
    const first = evaluateCallableRateLimit(undefined, requestIdentity, policy, 1_000);
    if (!first.allowed) throw new Error('first request should be allowed');

    const exactRetry = evaluateCallableRateLimit(first.state, requestIdentity, policy, 1_001);
    expect(exactRetry).toEqual({ allowed: true, state: first.state });
    if (!exactRetry.allowed) throw new Error('exact request retry should remain eligible');

    const differentPayload = evaluateCallableRateLimit(
      exactRetry.state, { ...requestIdentity, requestFingerprint: 'payload-b' }, policy, 1_002,
    );
    expect(differentPayload).toMatchObject({ allowed: true, state: { requestCount: 2 } });
    if (!differentPayload.allowed) throw new Error('different request tuple should consume a budget slot');
    expect(evaluateCallableRateLimit(
      differentPayload.state, { ...requestIdentity, requestFingerprint: 'payload-c' }, policy, 1_003,
    )).toMatchObject({ allowed: false, reason: 'limit-reached' });
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
      listGmInstances: { windowMs: 60_000, maxRequests: 60 },
      rollDice: { windowMs: 60_000, maxRequests: 30 },
      confirmSetup: { windowMs: 60_000, maxRequests: 12 },
      startGame: { windowMs: 60_000, maxRequests: 6 },
      declareWolfAttack: { windowMs: 60_000, maxRequests: 6 },
      runMaintenance: { windowMs: 60_000, maxRequests: 30 },
    });
    expect(CALLABLE_RATE_LIMIT_POLICIES).not.toHaveProperty('uid');
    expect(CALLABLE_RATE_LIMIT_POLICIES).not.toHaveProperty('ip');
  });

  it('allows the observed overlapping two-GM roster cadence with a 32-call margin', () => {
    const gmIdentity = { callableName: 'listGmInstances', sessionId: 'session-a', uid: 'gm-a' } as const;
    const gmPolicy = CALLABLE_RATE_LIMIT_POLICIES.listGmInstances;
    const cadenceTimes = [
      ...Array.from({ length: 12 }, (_, index) => index * 5_000),
      ...Array.from({ length: 6 }, (_, index) => index * 10_000),
      ...Array.from({ length: 6 }, (_, index) => index * 10_000),
      ...Array.from({ length: 4 }, (_, index) => index * 15_000),
    ].sort((left, right) => left - right);
    let marker: unknown;

    for (const nowMs of cadenceTimes) {
      const decision = evaluateCallableRateLimit(marker, gmIdentity, gmPolicy, nowMs);
      expect(decision.allowed).toBe(true);
      if (decision.allowed) marker = decision.state;
    }

    expect(marker).toMatchObject({ requestCount: 28 });
    expect(gmPolicy.maxRequests - cadenceTimes.length).toBe(32);
  });

  it('allows independent burst budgets for different authenticated members at one table', () => {
    for (const uid of ['gm-a', 'gm-b', 'player-c']) {
      const memberIdentity = { callableName: 'runMaintenance', sessionId: 'session-a', uid } as const;
      let marker: unknown;
      for (let index = 0; index < 30; index += 1) {
        const decision = evaluateCallableRateLimit(
          marker, memberIdentity, CALLABLE_RATE_LIMIT_POLICIES.runMaintenance, 5_000 + index,
        );
        expect(decision.allowed).toBe(true);
        if (decision.allowed) marker = decision.state;
      }
      expect(marker).toMatchObject({ requestCount: 30 });
    }
  });
});
