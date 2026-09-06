import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), role: 'player', post: 'press-officer', connected: true,
  exists: true, phase: 'active', revision: 0, pressDispatch: undefined as unknown,
}));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get, update: mock.update,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { publishPressDispatch } from './index';

const data = { sessionId: 's1', text: 'Convoy arrival confirmed', expectedRevision: 0 };
const request = (input = data) => ({
  data: input, auth: { uid: 'u1' },
}) as CallableRequest<typeof data>;

beforeEach(() => {
  Object.assign(mock, {
    role: 'player', post: 'press-officer', connected: true, exists: true,
    phase: 'active', revision: 0, pressDispatch: undefined,
  });
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, activeConsoleRoleId: mock.post, connected: mock.connected }
      : { phase: mock.phase, pressDispatch: mock.pressDispatch };
    return { exists: mock.exists, get: (key: string) => fields[key] };
  });
});

it('lets the active Press Officer publish a serialized dispatch', async () => {
  mock.pressDispatch = { text: 'Old news', revision: 0 };
  await publishPressDispatch.run(request());
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', {
    pressDispatch: { text: `SNN // ${data.text}`, revision: 1 },
    updatedAt: 'server-time',
  });
});

it('uses revision zero when the session has no earlier dispatch', async () => {
  await publishPressDispatch.run(request());
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', {
    pressDispatch: { text: `SNN // ${data.text}`, revision: 1 },
    updatedAt: 'server-time',
  });
});

it('denies other roles, disconnected players, and unsigned callers', async () => {
  mock.post = 'admiral';
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'permission-denied' });
  mock.post = 'press-officer';
  mock.connected = false;
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'permission-denied' });
  await expect(publishPressDispatch.run({ data } as CallableRequest<typeof data>)).rejects
    .toMatchObject({ code: 'unauthenticated' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects closed sessions and stale revisions without writing', async () => {
  mock.phase = 'closed';
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'failed-precondition' });
  mock.phase = 'active';
  mock.revision = 2;
  mock.pressDispatch = { text: 'Old news', revision: mock.revision };
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});
