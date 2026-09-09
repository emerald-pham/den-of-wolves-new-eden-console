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
    delete: vi.fn(),
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
      delete: mock.delete,
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
  mock.delete.mockReset();
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

it.each(['4821', '482109'])('redeems a valid %s legacy or current code', async (joinCode) => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === `joinCodes/${joinCode}`) return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ name: 'Table one', phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    throw new Error(`Unexpected read: ${path}`);
  });

  await expect(joinSession.run(request(joinCode))).resolves.toMatchObject({
    session: { id: 's1', joinCode },
  });
});

it('does not redeem a code while its session is being retired', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/4821') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby', deletingAt: 'server-time' });
    return snapshot({}, false);
  });

  await expect(joinSession.run(request('4821'))).rejects.toMatchObject({
    code: 'not-found',
    message: 'That session is being retired.',
  });
  expect(mock.update).not.toHaveBeenCalled();
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

it('replaces a stale membership lock when the same identity joins its remembered table', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({
      name: 'Table one',
      phase: 'lobby',
      ownerUid: 'owner',
    });
    if (path === 'sessions/s1/players/u1') return snapshot({
      displayName: 'Returning player',
      role: 'player',
      seatId: null,
      activeConsoleRoleId: null,
    });
    if (path === 'activeMemberships/u1') return snapshot({ sessionId: 's2' });
    if (path === 'sessions/s2/players/u1') return snapshot({ connected: false });
    if (path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).resolves.toMatchObject({
    session: { id: 's1' },
    player: { seatId: null },
  });

  expect(mock.delete).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'activeMemberships/u1' }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'activeMemberships/u1' }),
    expect.objectContaining({ sessionId: 's1' }),
  );
});

it('rejects a browser that was kicked from this session', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({ kickedAt: 'server-time' });
    if (path === 'activeMemberships/u1') return snapshot({}, false);
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: 'This browser was kicked from that session and cannot rejoin.',
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('refuses to displace an identity that is actively connected in another session', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'activeMemberships/u1') return snapshot({ sessionId: 's2' });
    if (path === 'sessions/s2/players/u1') return snapshot({
      connected: true,
      lastSeenAt: mock.Timestamp.fromDate(new Date()),
    });
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({
    code: 'failed-precondition',
  });

  expect(mock.update).not.toHaveBeenCalled();
});

it('treats a legacy connected player without a heartbeat as active elsewhere', async () => {
  mock.get.mockImplementation(({ path }: { path: string }) => {
    if (path === 'joinAttemptLimits/u1') return snapshot({}, false);
    if (path === 'joinCodes/482109') return snapshot({ sessionId: 's1' });
    if (path === 'sessions/s1') return snapshot({ phase: 'lobby' });
    if (path === 'sessions/s1/players/u1') return snapshot({}, false);
    if (path === 'activeMemberships/u1') return snapshot({ sessionId: 's2' });
    if (path === 'sessions/s2/players/u1') return snapshot({ connected: true });
    throw new Error('Unexpected read: ' + path);
  });

  await expect(joinSession.run(request('482109'))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.delete).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});
