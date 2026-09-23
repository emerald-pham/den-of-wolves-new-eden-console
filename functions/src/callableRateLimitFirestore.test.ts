import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { callableRateLimitDocumentId } from './callableRateLimit';
import { enforceExpensiveCallableRateLimit } from './callableRateLimitFirestore';

function rateLimitFirestore(initial: ReadonlyMap<string, unknown> = new Map()) {
  const documents = new Map(initial);
  const paths: string[] = [];
  const firestore = {
    doc: vi.fn((path: string) => {
      paths.push(path);
      return { path };
    }),
    runTransaction: vi.fn(async <T>(callback: (transaction: unknown) => Promise<T>) => callback({
      get: async (reference: { path: string }) => ({
        exists: documents.has(reference.path),
        data: () => documents.get(reference.path),
      }),
      set: (reference: { path: string }, value: unknown) => documents.set(reference.path, value),
    })),
  } as unknown as Firestore;
  return { firestore, documents, paths };
}

describe('Firestore callable rate-limit adapter', () => {
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
      details: { commandError: 'rate-limited', retryAfterMs: 59_990 },
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
});
