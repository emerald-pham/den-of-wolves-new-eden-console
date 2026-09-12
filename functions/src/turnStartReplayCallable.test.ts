import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  role: 'gm',
  connected: true,
  instanceUid: 'u1',
  sessionExists: true,
  phase: 'active',
  currentTurn: 2,
  announcement: { turn: 2, survivorPopulation: 237_000, revision: 3 },
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get,
      update: mock.update,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
}));

import { replayTurnStartAnnouncement } from './index';

const data = { sessionId: 's1', instanceId: 'bridge' };
const request = (input = data) => ({
  data: input,
  auth: { uid: 'u1' },
}) as CallableRequest<typeof data>;

beforeEach(() => {
  Object.assign(mock, {
    role: 'gm',
    connected: true,
    instanceUid: 'u1',
    sessionExists: true,
    phase: 'active',
    currentTurn: 2,
    announcement: { turn: 2, survivorPopulation: 237_000, revision: 3 },
  });
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/')
        ? { uid: mock.instanceUid, connected: true, lastSeenAt: new Date() }
        : {
            phase: mock.phase,
            currentTurn: mock.currentTurn,
            turnStartAnnouncement: mock.announcement,
          };
    return {
      exists: path.includes('/players/') || path.includes('/gmInstances/')
        ? true
        : mock.sessionExists,
      get: (key: string) => fields[key],
    };
  });
});

it('increments the current turn transmission revision for every connected console', async () => {
  await expect(replayTurnStartAnnouncement.run(request())).resolves.toEqual({
    turnStartAnnouncement: { turn: 2, survivorPopulation: 237_000, revision: 4 },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnStartAnnouncement: { turn: 2, survivorPopulation: 237_000, revision: 4 },
  }));
});

it('denies malformed, closed, missing, disconnected, non-GM, foreign-instance, and unsigned replays', async () => {
  await expect(replayTurnStartAnnouncement.run(request({ sessionId: '' } as never)))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  mock.phase = 'closed';
  await expect(replayTurnStartAnnouncement.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.phase = 'active';
  mock.announcement = undefined;
  await expect(replayTurnStartAnnouncement.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.announcement = { turn: 2, survivorPopulation: 237_000, revision: 3 };
  mock.connected = false;
  await expect(replayTurnStartAnnouncement.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  mock.connected = true;
  mock.role = 'player';
  await expect(replayTurnStartAnnouncement.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm';
  mock.instanceUid = 'u2';
  await expect(replayTurnStartAnnouncement.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(replayTurnStartAnnouncement.run({ data } as CallableRequest<typeof data>))
    .rejects.toMatchObject({ code: 'unauthenticated' });
  expect(mock.update).not.toHaveBeenCalled();
});
