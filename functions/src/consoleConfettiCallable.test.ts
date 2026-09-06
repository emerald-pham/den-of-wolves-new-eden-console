import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
const mock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn(), post: 'dione-engineer', full: true }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: (path: string) => path,
    collection: (path: string) => ({ path, doc: () => `${path}/event`, where: () => ({ path }) }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({ get: mock.get, set: mock.set, create: mock.set, delete: vi.fn(), update: mock.update }) }),
  FieldValue: { serverTimestamp: () => 'now', arrayUnion: (...values: unknown[]) => values },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
import { popShipConfetti } from './index';
const data = { sessionId: 's1', shipId: 'dione', roleId: 'dione-captain' };
beforeEach(() => {
  mock.post = 'dione-engineer'; mock.full = true; mock.set.mockReset(); mock.update.mockReset();
  mock.get.mockImplementation(async (ref: string | { path: string }) => {
    const path = typeof ref === 'string' ? ref : ref.path;
    if (path.endsWith('/players')) return { docs: (mock.full ? ['dione-engineer', 'dione-captain', 'dione-president'] : [mock.post]).map((post, id) => ({ id: String(id), exists: true, get: (key: string) => ({ role: 'player', connected: true, activeConsoleRoleId: post } as Record<string, unknown>)[key] })) };
    const fields: Record<string, unknown> = path.includes('/players/') ? { role: 'player', connected: true, activeConsoleRoleId: mock.post } : {};
    return { exists: !path.includes('/shipConfetti/'), get: (key: string) => fields[key] };
  });
});
it('denies forging a captain console while the full crew is connected', async () => {
  await expect(popShipConfetti.run({ data, auth: { uid: 'u1' } } as CallableRequest<typeof data>)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
});
it('permits captain console relief while short staffed but never from another ship', async () => {
  mock.full = false;
  await expect(popShipConfetti.run({ data, auth: { uid: 'u1' } } as CallableRequest<typeof data>)).resolves.toBeDefined();
  mock.post = 'capybara-captain'; mock.set.mockClear();
  await expect(popShipConfetti.run({ data, auth: { uid: 'u1' } } as CallableRequest<typeof data>)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
});
