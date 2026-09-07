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
  debriefMode: { active: false, revision: 0 },
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
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { setDebriefMode } from './index';

const data = { sessionId: 's1', instanceId: 'bridge', active: true };
const request = (input = data) => ({ data: input, auth: { uid: 'u1' } }) as CallableRequest<typeof data>;

beforeEach(() => {
  Object.assign(mock, {
    role: 'gm',
    connected: true,
    instanceUid: 'u1',
    sessionExists: true,
    phase: 'active',
    debriefMode: { active: false, revision: 0 },
  });
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/')
        ? { uid: mock.instanceUid }
        : { phase: mock.phase, debriefMode: mock.debriefMode };
    return {
      exists: path.includes('/players/') || path.includes('/gmInstances/')
        ? true
        : mock.sessionExists,
      get: (key: string) => fields[key],
    };
  });
});

it('lets an active named GM enable and retract the shared finale state', async () => {
  await expect(setDebriefMode.run(request())).resolves.toEqual({
    debriefMode: { active: true, revision: 1 },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    debriefMode: { active: true, revision: 1 },
  }));

  mock.debriefMode = { active: true, revision: 1 };
  await expect(setDebriefMode.run(request({ ...data, active: false }))).resolves.toEqual({
    debriefMode: { active: false, revision: 2 },
  });
});

it('denies malformed, closed, disconnected, non-GM, stale-instance, and unsigned finale commands', async () => {
  await expect(setDebriefMode.run(request({ ...data, active: 'yes' } as never)))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  mock.phase = 'closed';
  await expect(setDebriefMode.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.phase = 'active';
  mock.connected = false;
  await expect(setDebriefMode.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  mock.connected = true;
  mock.role = 'player';
  await expect(setDebriefMode.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm';
  mock.instanceUid = 'u2';
  await expect(setDebriefMode.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(setDebriefMode.run({ data } as CallableRequest<typeof data>))
    .rejects.toMatchObject({ code: 'unauthenticated' });
  expect(mock.update).not.toHaveBeenCalled();
});
