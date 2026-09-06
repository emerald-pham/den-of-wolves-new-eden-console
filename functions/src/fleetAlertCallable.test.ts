import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
const mock = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), role: 'player', post: 'admiral', connected: true, exists: true, phase: 'active', revision: 0, active: false }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) => callback({ get: mock.get, update: mock.update }) }),
  FieldValue: { serverTimestamp: () => 'server-time' }, Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
import { setFleetRedAlert } from './index';
const data = { sessionId: 's1', active: true, expectedRevision: 0 };
const request = (input = data) => ({ data: input, auth: { uid: 'u1' } }) as CallableRequest<typeof data>;
beforeEach(() => {
  Object.assign(mock, { role: 'player', post: 'admiral', connected: true, exists: true, phase: 'active', revision: 0, active: false });
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, activeConsoleRoleId: mock.post, connected: mock.connected }
      : { phase: mock.phase, fleetRedAlert: { revision: mock.revision, active: mock.active } };
    return { exists: mock.exists, get: (key: string) => fields[key] };
  });
});
it('lets the active Admiral raise and cancel the shared warning', async () => {
  await setFleetRedAlert.run(request());
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ fleetRedAlert: expect.objectContaining({ active: true, revision: 1 }) }));
  mock.active = true; mock.revision = 1;
  await setFleetRedAlert.run(request({ ...data, active: false, expectedRevision: 1 }));
  expect(mock.update).toHaveBeenLastCalledWith('sessions/s1', expect.objectContaining({ fleetRedAlert: expect.objectContaining({ active: false, revision: 2 }) }));
});
it.each(['wing-commander', 'executive-officer', 'captain-capybara', ''])('denies another post: %s', async post => {
  mock.post = post;
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('denies disconnected, missing, observer and unsigned callers', async () => {
  mock.connected = false;
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  mock.connected = true; mock.exists = false;
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  mock.exists = true; mock.role = 'observer';
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(setFleetRedAlert.run({ data } as CallableRequest<typeof data>)).rejects.toMatchObject({ code: 'unauthenticated' });
});
it('rejects malformed, closed and stale commands without writes', async () => {
  await expect(setFleetRedAlert.run(request({ ...data, sessionId: '../bad' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  mock.phase = 'closed';
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.phase = 'active'; mock.revision = 2;
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('does not create a cancellation for an inactive alert', async () => {
  await setFleetRedAlert.run(request({ ...data, active: false }));
  expect(mock.update).not.toHaveBeenCalled();
});
