import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), receipts: new Map<string, Record<string, unknown>>(),
  role: 'player', post: 'admiral', connected: true, exists: true, phase: 'active', currentTurn: 1,
  revision: 0, active: false, raisedAt: undefined as string | undefined, turnPhase: undefined as unknown,
  fleetTicker: undefined as unknown,
}));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: (path: string) => path, collection: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) => callback({ get: mock.get, update: mock.update, set: mock.set }) }),
  FieldValue: { serverTimestamp: () => 'server-time' }, Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
import { setFleetRedAlert } from './index';
const data = { sessionId: 's1', active: true, expectedRevision: 0 };
const request = (input = data) => ({ data: input, auth: { uid: 'u1' } }) as CallableRequest<typeof data>;
beforeEach(() => {
  Object.assign(mock, { role: 'player', post: 'admiral', connected: true, exists: true, phase: 'active', currentTurn: 1, revision: 0, active: false, raisedAt: undefined, turnPhase: undefined, fleetTicker: undefined });
  mock.update.mockReset();
  mock.set.mockReset();
  mock.receipts.clear();
  mock.set.mockImplementation((path: string, value: Record<string, unknown>) => {
    mock.receipts.set(path, value);
  });
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/commandReceipts/')) {
      const value = mock.receipts.get(path);
      return { exists: value !== undefined, get: (key: string) => value?.[key] };
    }
    if (path.endsWith('/players')) return { docs: ['admiral', 'executive-officer', 'wing-commander'].map(post => ({ exists: true, get: (key: string) => ({ connected: true, role: 'player', activeConsoleRoleId: post } as Record<string, unknown>)[key] })) };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, activeConsoleRoleId: mock.post, connected: mock.connected }
      : { phase: mock.phase, currentTurn: mock.currentTurn, fleetRedAlert: { revision: mock.revision, active: mock.active, ...(mock.raisedAt ? { raisedAt: mock.raisedAt } : {}) }, turnPhase: mock.turnPhase, fleetTicker: mock.fleetTicker };
    return { exists: mock.exists, id: path.includes('/players/') ? 'u1' : 's1', get: (key: string) => fields[key] };
  });
});
it('lets the active Admiral raise and cancel the shared warning', async () => {
  await setFleetRedAlert.run(request());
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ fleetRedAlert: expect.objectContaining({ active: true, revision: 1 }) }));
  mock.active = true; mock.revision = 1;
  await setFleetRedAlert.run(request({ ...data, active: false, expectedRevision: 1 }));
  expect(mock.update).toHaveBeenLastCalledWith('sessions/s1', expect.objectContaining({ fleetRedAlert: expect.objectContaining({ active: false, revision: 2 }) }));
});
it('replays a request id without a second alert or ticker revision', async () => {
  const command = { ...data, requestId: 'alert-retry-1' };
  const first = await setFleetRedAlert.run(request(command));
  mock.update.mockClear();

  await expect(setFleetRedAlert.run(request(command))).resolves.toEqual(first);
  expect(mock.update).not.toHaveBeenCalled();
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
it('keeps the eligible Press pool behind AEGIS instead of losing it to phase priority', async () => {
  mock.fleetTicker = {
    revision: 1, nextSequence: 1, replayCursor: 1,
    current: {
      id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 50,
      text: 'SNN // SUPPLY SHIPS ARRIVING', tone: 'normal', gap: 'long', sourceId: 'dispatch-1',
      createdAt: '2026-09-06T12:00:00.000Z',
    },
    queued: [], draining: [], dismissed: [],
  };

  await setFleetRedAlert.run(request());

  const update = mock.update.mock.calls[0]?.[1] as Record<string, unknown>;
  expect(update.fleetTicker).toMatchObject({
    current: { source: 'admiral', sourceId: 'red-alert:1' },
    queued: [{ source: 'press', sourceId: 'dispatch-1', priority: 50 }],
  });
});
it('keeps a queued Press dispatch behind the finite AEGIS stand-down', async () => {
  mock.active = true;
  mock.revision = 1;
  mock.fleetTicker = {
    revision: 2, nextSequence: 2, replayCursor: 2,
    current: {
      id: 's1:fleet-ticker:1', sequence: 1, source: 'admiral', priority: 80,
      text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger', gap: 'long', sourceId: 'red-alert:1',
      createdAt: '2026-09-06T12:00:00.000Z',
    },
    queued: [{
      id: 's1:fleet-ticker:2', sequence: 2, source: 'press', priority: 50,
      text: 'SNN // SUPPLY SHIPS ARRIVING', tone: 'normal', gap: 'long', sourceId: 'dispatch-1',
      createdAt: '2026-09-06T12:01:00.000Z',
    }],
    draining: [], dismissed: [],
  };

  await setFleetRedAlert.run(request({ ...data, active: false, expectedRevision: 1 }));

  const update = mock.update.mock.calls[0]?.[1] as Record<string, unknown>;
  expect(update.fleetTicker).toMatchObject({
    current: { source: 'automatic', sourceId: 'red-alert:2' },
    queued: [{ source: 'press', sourceId: 'dispatch-1' }],
  });
  expect((update.fleetTicker as { current: { expiresAt?: string } }).current).not.toHaveProperty('expiresAt');
});

it('persists an ATC fallback behind stand-down when no Press dispatch is eligible', async () => {
  mock.active = true;
  mock.revision = 1;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: false, pressAccess: false },
  };
  mock.fleetTicker = {
    revision: 1, nextSequence: 1, replayCursor: 1,
    current: {
      id: 's1:fleet-ticker:1', sequence: 1, source: 'admiral', priority: 80,
      text: 'ICSN ADMIRAL // RED ALERT', tone: 'danger', gap: 'long', sourceId: 'red-alert:1',
      createdAt: '2026-09-06T12:00:00.000Z',
    },
    queued: [], draining: [], dismissed: [],
  };

  await setFleetRedAlert.run(request({ ...data, active: false, expectedRevision: 1 }));

  const update = mock.update.mock.calls[0]?.[1] as Record<string, unknown>;
  expect(update.fleetTicker).toMatchObject({
    current: { source: 'automatic', sourceId: 'red-alert:2', passCount: 2 },
    queued: [{ source: 'automatic', sourceId: 'airspace:1:restricted', text: 'AIRSPACE CONTROL // AIRSPACE CLOSED' }],
  });
});
it('allows an entitled Admiral at Turn 0 and still checks the GM instance', async () => {
  mock.currentTurn = 0;
  await expect(setFleetRedAlert.run(request())).resolves.toMatchObject({ revision: 1 });
  mock.role = 'gm';
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/private/shipConsoleWriteGrant')) {
      return { exists: true, get: (key: string) => ({
        type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'gm1', uid: 'u1',
        shipId: 'aegis', grantedAt: new Date().toISOString(),
      } as Record<string, unknown>)[key] };
    }
    return path.includes('/gmInstances/')
    ? { exists: true, get: (key: string) => ({
      uid: 'u1', connected: true,
        claimedAt: { toMillis: () => Date.now() },
        lastSeenAt: { toMillis: () => Date.now() },
      } as Record<string, unknown>)[key] }
    : previous(path);
  });
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
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'terminal-session' },
  });
  mock.phase = 'active'; mock.revision = 2;
  await expect(setFleetRedAlert.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'stale-revision' },
  });
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
  mock.get.mockImplementation(async (path: string) => path.includes('/private/shipConsoleWriteGrant')
    ? { exists: true, get: (key: string) => ({
        type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'gm1', uid: 'u1',
        shipId: 'aegis', grantedAt: new Date().toISOString(),
      } as Record<string, unknown>)[key] }
    : path.includes('/gmInstances/')
      ? { exists: true, get: (key: string) => ({
        uid: 'u1', connected: true,
        claimedAt: { toMillis: () => Date.now() },
        lastSeenAt: { toMillis: () => Date.now() },
      } as Record<string, unknown>)[key] }
      : previous(path));
  await expect(setFleetRedAlert.run({ data: { ...data, instanceId: 'gm1' }, auth: { uid: 'u1' } } as CallableRequest<typeof data & { instanceId: string }>)).resolves.toMatchObject({ revision: 1 });
});

it('rejects a GM fleet alert when the scoped grant belongs to another ship', async () => {
  mock.role = 'gm'; mock.post = '';
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => path.includes('/private/shipConsoleWriteGrant')
    ? { exists: true, get: (key: string) => ({
        type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'gm1', uid: 'u1',
        shipId: 'dione', grantedAt: new Date().toISOString(),
      } as Record<string, unknown>)[key] }
    : path.includes('/gmInstances/')
      ? { exists: true, get: (key: string) => ({
        uid: 'u1', connected: true,
        claimedAt: { toMillis: () => Date.now() },
        lastSeenAt: { toMillis: () => Date.now() },
      } as Record<string, unknown>)[key] }
      : previous(path));

  await expect(setFleetRedAlert.run({ data: { ...data, instanceId: 'gm1' }, auth: { uid: 'u1' } } as CallableRequest<typeof data & { instanceId: string }>))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
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
