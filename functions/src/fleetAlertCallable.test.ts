import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
const mock = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), role: 'player', post: 'admiral', connected: true, exists: true, phase: 'active', currentTurn: 1, revision: 0, active: false, raisedAt: undefined as string | undefined, turnPhase: undefined as unknown }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: (path: string) => path, collection: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) => callback({ get: mock.get, update: mock.update }) }),
  FieldValue: { serverTimestamp: () => 'server-time' }, Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
import { setFleetRedAlert } from './index';
const data = { sessionId: 's1', active: true, expectedRevision: 0 };
const request = (input = data) => ({ data: input, auth: { uid: 'u1' } }) as CallableRequest<typeof data>;
beforeEach(() => {
  Object.assign(mock, { role: 'player', post: 'admiral', connected: true, exists: true, phase: 'active', currentTurn: 1, revision: 0, active: false, raisedAt: undefined, turnPhase: undefined });
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.endsWith('/players')) return { docs: ['admiral', 'executive-officer', 'wing-commander'].map(post => ({ exists: true, get: (key: string) => ({ connected: true, role: 'player', activeConsoleRoleId: post } as Record<string, unknown>)[key] })) };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, activeConsoleRoleId: mock.post, connected: mock.connected }
      : { phase: mock.phase, currentTurn: mock.currentTurn, fleetRedAlert: { revision: mock.revision, active: mock.active, ...(mock.raisedAt ? { raisedAt: mock.raisedAt } : {}) }, turnPhase: mock.turnPhase };
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
it('stops an airspace bulletin when AEGIS sends a new fleet alert', async () => {
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await setFleetRedAlert.run(request());

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'restricted', tickerActive: false, pressAccess: false },
    },
  }));
});
it('holds the player Admiral command at Turn 0 but lets an active GM intervene', async () => {
  mock.currentTurn = 0;
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/turn 1/i),
  });
  mock.role = 'gm';
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => path.includes('/gmInstances/')
    ? { exists: true, get: (key: string) => key === 'uid' ? 'u1' : undefined }
    : previous(path));
  await expect(setFleetRedAlert.run({ data: { ...data, instanceId: 'gm1' }, auth: { uid: 'u1' } } as CallableRequest<typeof data & { instanceId: string }>))
    .resolves.toMatchObject({ revision: 1 });
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
it('allows AEGIS relief only while the connected complement is incomplete', async () => {
  mock.post = 'wing-commander';
  const previous = mock.get.getMockImplementation()!;
  let posts = ['wing-commander'];
  mock.get.mockImplementation(async (path: string) => path.endsWith('/players')
    ? { docs: posts.map(post => ({ exists: true, get: (key: string) => ({ connected: true, role: 'player', activeConsoleRoleId: post } as Record<string, unknown>)[key] })) }
    : previous(path));
  await expect(setFleetRedAlert.run(request())).resolves.toMatchObject({ revision: 1 });
  mock.update.mockClear();
  posts = ['admiral', 'wing-commander', 'executive-officer'];
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('lets a verified GM observer command the Admiral console without claiming it', async () => {
  mock.role = 'gm'; mock.post = '';
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => path.includes('/gmInstances/') ? { exists: true, get: (key: string) => key === 'uid' ? 'u1' : undefined } : previous(path));
  await expect(setFleetRedAlert.run({ data: { ...data, instanceId: 'gm1' }, auth: { uid: 'u1' } } as CallableRequest<typeof data & { instanceId: string }>)).resolves.toMatchObject({ revision: 1 });
});

it('stores custom warning text in uppercase under Admiral authority', async () => {
  await setFleetRedAlert.run({ data: { ...data, text: '  HOLD POSITION  ' }, auth: { uid: 'u1' } } as CallableRequest<typeof data & { text: string }>);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ fleetRedAlert: expect.objectContaining({ active: true, revision: 1, text: 'HOLD POSITION' }) }));
});
it.each(['', '   ', 'x'.repeat(501), 42])('rejects invalid warning copy: %s', async text => {
  await expect(setFleetRedAlert.run({ data: { ...data, text }, auth: { uid: 'u1' } } as CallableRequest<typeof data & { text: unknown }>)).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('revises an active warning without standing the fleet down', async () => {
  mock.active = true;
  await setFleetRedAlert.run({ data: { ...data, text: 'New orders' }, auth: { uid: 'u1' } } as CallableRequest<typeof data & { text: string }>);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ fleetRedAlert: expect.objectContaining({ active: true, revision: 1, text: 'NEW ORDERS' }) }));
});

it('blocks a new red alert until ten minutes after the previous raise', async () => {
  mock.raisedAt = new Date(Date.now() - (10 * 60 * 1000) + 1000).toISOString();
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();

  mock.raisedAt = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
  await expect(setFleetRedAlert.run(request())).resolves.toMatchObject({ active: true });
});

it('preserves the last raise time when standing down so the cooldown survives', async () => {
  mock.active = true;
  mock.revision = 1;
  mock.raisedAt = '2026-09-06T12:00:00.000Z';
  await setFleetRedAlert.run(request({ ...data, active: false, expectedRevision: 1 }));
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    fleetRedAlert: expect.objectContaining({ active: false, raisedAt: mock.raisedAt }),
  }));
});
