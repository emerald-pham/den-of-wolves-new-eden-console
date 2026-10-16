import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { CALLABLE_RATE_LIMIT_POLICIES, callableRateLimitDocumentId, evaluateCallableRateLimit } from './callableRateLimit';
import { enforceExpensiveCallableRateLimit } from './callableRateLimitFirestore';

function rateLimitFirestore(initial: ReadonlyMap<string, unknown> = new Map()) {
  const documents = new Map(initial);
  const paths: string[] = [];
  let transactionTail = Promise.resolve();
  const firestore = {
    doc: vi.fn((path: string) => {
      paths.push(path);
      return { path };
    }),
    runTransaction: vi.fn(async <T>(callback: (transaction: unknown) => Promise<T>) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        return await callback({
          get: async (reference: { path: string }) => ({
            exists: documents.has(reference.path),
            data: () => documents.get(reference.path),
          }),
          set: (reference: { path: string }, value: unknown) => documents.set(reference.path, value),
        });
      } finally {
        release();
      }
    }),
  } as unknown as Firestore;
  return { firestore, documents, paths };
}

describe('Firestore callable rate-limit adapter', () => {
  it('charges an earlier waiting request after a later genuine opener without treating its current marker as future state', async () => {
    const identity = { callableName: 'getCurrentMemberSession', sessionId: 'session-a', uid: 'auth-uid-a' } as const;
    const policy = CALLABLE_RATE_LIMIT_POLICIES.getCurrentMemberSession;
    const prior = evaluateCallableRateLimit(undefined, identity, policy, 1_000);
    if (!prior.allowed) throw new Error('ordinary previous window must be valid');
    for (const initial of [undefined, prior.state]) {
      let now = 61_000;
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
      let marker = initial;
      let reads = 0;
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const waiting = new Promise<void>(resolve => { entered = resolve; });
      const firestore = {
        doc: (path: string) => ({ path }),
        runTransaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback({
          get: async () => {
            if (++reads === 1) { entered(); await held; }
            return { exists: marker !== undefined, data: () => marker };
          },
          set: (_reference: unknown, value: typeof marker) => { marker = value; },
        }),
      } as unknown as Firestore;
      try {
        const earlier = enforceExpensiveCallableRateLimit(firestore, identity);
        // Retain the rejection until the assertion rather than creating an unhandled promise.
        const result = earlier.then(() => ({ allowed: true }), error => ({ allowed: false, error }));
        await waiting;
        now = 61_001;
        await expect(enforceExpensiveCallableRateLimit(firestore, identity)).resolves.toBeUndefined();
        expect(marker).toMatchObject({ windowStartedAtMs: 61_001, requestCount: 1 });
        now = 61_002;
        release();
        expect(await result).toEqual({ allowed: true });
        expect(marker).toMatchObject({ windowStartedAtMs: 61_001, requestCount: 2 });
      } finally { release(); clock.mockRestore(); }
    }
  });

  it('uses only the final transaction attempt decision when a genuine fixed window expires during retry', async () => {
    const identity = { callableName: 'resumeSession', sessionId: 'session-a', uid: 'auth-uid-a' } as const;
    const policy = CALLABLE_RATE_LIMIT_POLICIES.resumeSession;
    const first = evaluateCallableRateLimit(undefined, identity, policy, 1_000);
    if (!first.allowed) throw new Error('ordinary window must be valid');
    let marker = { ...first.state, requestCount: policy.maxRequests };
    let now = 2_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    let writes = 0;
    const transaction = {
      get: async () => ({ exists: true, data: () => marker }),
      set: (_reference: unknown, value: typeof marker) => { writes++; marker = value; },
    };
    const firestore = { doc: (path: string) => ({ path }),
      runTransaction: async <T>(callback: (transaction: unknown) => Promise<T>) => {
        await callback(transaction);
        expect(writes).toBe(0);
        now = 61_000;
        return callback(transaction);
      },
    } as unknown as Firestore;
    try {
      await expect(enforceExpensiveCallableRateLimit(firestore, identity)).resolves.toBeUndefined();
      expect(writes).toBe(1);
      expect(marker).toMatchObject({ windowStartedAtMs: 61_000, requestCount: 1 });
    } finally { clock.mockRestore(); }
  });

  it('still rejects a marker actually ahead of the current server clock without resetting or charging it', async () => {
    const identity = { callableName: 'resumeSession', sessionId: 'session-a', uid: 'auth-uid-a' } as const;
    const future = evaluateCallableRateLimit(undefined, identity, CALLABLE_RATE_LIMIT_POLICIES.resumeSession, 2_000);
    if (!future.allowed) throw new Error('future marker fixture must be structurally valid');
    const path = `sessions/session-a/serverState/callableRateLimit-${callableRateLimitDocumentId(identity)}`;
    const { firestore, documents } = rateLimitFirestore(new Map([[path, future.state]]));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      await expect(enforceExpensiveCallableRateLimit(firestore, identity)).rejects.toMatchObject({
        code: 'resource-exhausted', details: { commandError: 'rate-limit-state-invalid' },
      });
      expect(documents.get(path)).toEqual(future.state);
    } finally { clock.mockRestore(); }
  });

  it('stores one private counter per session, authenticated UID, and callable', async () => {
    const { firestore, documents, paths } = rateLimitFirestore();
    const identity = { callableName: 'getSessionPresence', sessionId: 'session-a', uid: 'auth-uid-a' } as const;

    await enforceExpensiveCallableRateLimit(firestore, identity, 1_000);

    const expectedPath = `sessions/session-a/serverState/callableRateLimit-${callableRateLimitDocumentId(identity)}`;
    expect(paths).toEqual([expectedPath]);
    expect(expectedPath).not.toContain(identity.uid);
    expect(documents.get(expectedPath)).toMatchObject({
      type: 'callable-rate-limit',
      version: 1,
      callableName: identity.callableName,
      requestCount: 1,
    });
  });

  it('permits ordinary retries below the limit, rejects excess requests, and isolates other members', async () => {
    const { firestore } = rateLimitFirestore();
    const identity = { callableName: 'resumeSession', sessionId: 'session-a', uid: 'auth-uid-a' } as const;

    for (let index = 0; index < 10; index += 1) {
      await expect(enforceExpensiveCallableRateLimit(firestore, identity, 1_000 + index)).resolves.toBeUndefined();
    }
    await expect(enforceExpensiveCallableRateLimit(firestore, identity, 1_010)).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { commandError: 'rate-limited', retryAfterSeconds: 60 },
    });
    await expect(enforceExpensiveCallableRateLimit(firestore, {
      ...identity, uid: 'auth-uid-b',
    }, 1_011)).resolves.toBeUndefined();
    await expect(enforceExpensiveCallableRateLimit(firestore, {
      ...identity, sessionId: 'session-b',
    }, 1_012)).resolves.toBeUndefined();
  });

  it('does not reset a malformed or identity-spoofed private marker', async () => {
    const identity = { callableName: 'rollDice', sessionId: 'session-a', uid: 'auth-uid-a' } as const;
    const markerPath = `sessions/session-a/serverState/callableRateLimit-${callableRateLimitDocumentId(identity)}`;
    const { firestore, documents } = rateLimitFirestore(new Map([[markerPath, {
      type: 'callable-rate-limit',
      version: 1,
      callableName: identity.callableName,
      identityHash: 'different-user',
      windowStartedAtMs: 1_000,
      requestCount: 1,
    }]]));

    await expect(enforceExpensiveCallableRateLimit(firestore, identity, 1_001)).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { commandError: 'rate-limit-state-invalid' },
    });
    expect(documents.get(markerPath)).toMatchObject({ identityHash: 'different-user' });
  });

  it('serializes concurrent same-table mutations against one member budget', async () => {
    const { firestore, documents } = rateLimitFirestore();
    const identity = { callableName: 'confirmSetup', sessionId: 'session-a', uid: 'gm-a' } as const;
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
      enforceExpensiveCallableRateLimit(firestore, identity, 10_000 + index),
    ));
    const accepted = attempts.filter(attempt => attempt.status === 'fulfilled');
    const rejected = attempts.filter(attempt => attempt.status === 'rejected');
    expect(accepted).toHaveLength(12);
    expect(rejected).toHaveLength(8);
    const markerPath = `sessions/session-a/serverState/callableRateLimit-${callableRateLimitDocumentId(identity)}`;
    expect(documents.get(markerPath)).toMatchObject({ requestCount: 12 });

    await expect(enforceExpensiveCallableRateLimit(firestore, {
      ...identity, uid: 'gm-b',
    }, 10_021)).resolves.toBeUndefined();
  });
});
