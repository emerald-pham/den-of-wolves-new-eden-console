import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => {
  class MockTimestamp {
    constructor(private readonly value: Date) {}

    static fromDate(value: Date) {
      return new MockTimestamp(value);
    }

    static now() {
      return new MockTimestamp(new Date());
    }

    toDate() {
      return this.value;
    }
  }

  return {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    Timestamp: MockTimestamp,
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => {
      const ref = { path, get: () => mock.get(ref) };
      return ref;
    },
    collection: () => ({ doc: () => ({ path: 'generated-session' }) }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get,
      set: mock.set,
      update: mock.update,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: mock.Timestamp,
}));

import { joinSession } from './index';

function request(joinCode: string) {
  return {
    data: { joinCode },
    auth: { uid: 'u1' },
  } as CallableRequest<{ joinCode: string }>;
}

function snapshot(fields: Record<string, unknown>, exists = true) {
  return { exists, get: (field: string) => fields[field] };
}

beforeEach(() => {
  mock.get.mockReset();
  mock.set.mockReset();
  mock.update.mockReset();
});

it('records an allowed code attempt before looking up the code', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({ code: 'not-found' });

  expect(mock.set).toHaveBeenCalledWith(expect.objectContaining({ path: 'joinAttemptLimits/u1' }), expect.objectContaining({
    attempts: 1,
    expiresAt: expect.any(mock.Timestamp),
  }));
  expect(mock.get).toHaveBeenCalledWith(expect.objectContaining({ path: 'joinCodes/482109' }));
});

it('does not reveal another code after the identity bucket is exhausted', async () => {
  const now = new Date();
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') {
      return snapshot({
        windowStartedAt: mock.Timestamp.fromDate(now),
        attempts: 6,
      });
    }
    throw new Error(`The code lookup must not run while blocked: ${path}`);
  });

  await expect(joinSession.run(request('4821'))).rejects.toMatchObject({
    code: 'resource-exhausted',
  });

  expect(mock.get).toHaveBeenCalledTimes(1);
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects an unsupported code shape without spending a limiter attempt', async () => {
  await expect(joinSession.run(request('48210'))).rejects.toMatchObject({
    code: 'invalid-argument',
    message: 'Enter a complete session code.',
  });

  expect(mock.get).not.toHaveBeenCalled();
});
