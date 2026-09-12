import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), role: 'gm', owner: 'u1', connected: true, phase: 'active',
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) =>
      callback({ get: mock.get, update: mock.update }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({
    kind: 'timestamp', toDate: () => new Date('2026-01-01T00:05:00.000Z'),
  }) },
}));

import { triggerDradisContact } from './index';

function request(uid = 'u1') {
  return {
    data: { sessionId: 's1', instanceId: 'bridge' },
    auth: { uid },
  } as CallableRequest<{ sessionId: string; instanceId: string }>;
}

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.connected = true;
  mock.phase = 'active';
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner, connected: mock.connected, lastSeenAt: new Date() }
        : { phase: mock.phase };
    return { exists: true, get: (key: string) => fields[key] };
  });
});

it('stores one server-timed contact trigger for the whole session', async () => {
  await expect(triggerDradisContact.run(request())).resolves.toEqual({
    triggeredAt: '2026-01-01T00:05:00.000Z',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', {
    dradisContactTriggeredAt: expect.objectContaining({ kind: 'timestamp' }),
    updatedAt: 'server-time',
  });
});

it('denies players and GM instances owned by another browser', async () => {
  mock.role = 'player';
  await expect(triggerDradisContact.run(request())).rejects
    .toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm';
  mock.owner = 'other';
  await expect(triggerDradisContact.run(request())).rejects
    .toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('freezes new DRADIS effects during endgame evaluation', async () => {
  mock.phase = 'debrief';

  await expect(triggerDradisContact.run(request())).rejects
    .toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});
