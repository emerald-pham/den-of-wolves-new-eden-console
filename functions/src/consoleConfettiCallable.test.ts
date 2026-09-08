import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
const mock = vi.hoisted(() => {
  class MockTimestamp {
    constructor(private readonly millis = Date.now()) {}
    toDate() { return new Date(this.millis); }
    static now() { return new MockTimestamp(); }
  }
  return {
    get: vi.fn(), set: vi.fn(), update: vi.fn(), post: 'dione-engineer', full: true, currentTurn: 1,
    activeRoleIds: undefined as readonly string[] | undefined,
    usedShipIds: [] as readonly string[],
    Timestamp: MockTimestamp,
  };
});
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: (path: string) => path,
    collection: (path: string) => ({ path, doc: () => `${path}/event`, where: () => ({ path }) }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({ get: mock.get, set: mock.set, create: mock.set, delete: vi.fn(), update: mock.update }) }),
  FieldValue: { serverTimestamp: () => 'now', arrayUnion: (...values: unknown[]) => values },
  Timestamp: mock.Timestamp,
}));
import { popShipConfetti } from './index';
const data = { sessionId: 's1', shipId: 'dione', roleId: 'dione-captain' };
beforeEach(() => {
  mock.post = 'dione-engineer'; mock.full = true; mock.currentTurn = 1; mock.activeRoleIds = undefined;
  mock.usedShipIds = [];
  mock.set.mockReset(); mock.update.mockReset();
  mock.get.mockImplementation(async (ref: string | { path: string }) => {
    const path = typeof ref === 'string' ? ref : ref.path;
    if (path.endsWith('/players')) return { docs: (mock.full ? ['dione-engineer', 'dione-captain', 'dione-president'] : [mock.post]).map((post, id) => ({ id: String(id), exists: true, get: (key: string) => ({ role: 'player', connected: true, activeConsoleRoleId: post, lastSeenAt: new mock.Timestamp() } as Record<string, unknown>)[key] })) };
    const fields: Record<string, unknown> = path.includes('/players/') ?
      { role: 'player', connected: true, activeConsoleRoleId: mock.post, lastSeenAt: new mock.Timestamp() } :
      { currentTurn: mock.currentTurn, activeRoleIds: mock.activeRoleIds, confettiUsedShipIds: mock.usedShipIds };
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

it('revokes a ship dispenser when the operator role is removed from the live roster', async () => {
  mock.full = false;
  mock.activeRoleIds = ['dione-captain'];

  await expect(popShipConfetti.run({
    data: { ...data, roleId: 'dione-engineer' }, auth: { uid: 'u1' },
  } as CallableRequest<typeof data>)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies a stale personal console role even when it could otherwise cover a short crew', async () => {
  mock.full = false;
  mock.post = 'dione-engineer';
  mock.activeRoleIds = ['dione-captain'];

  await expect(popShipConfetti.run({
    data: { ...data, roleId: 'dione-captain' }, auth: { uid: 'u1' },
  } as CallableRequest<typeof data>)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('discards an officer approval after that officer changes its active role', async () => {
  mock.post = 'dione-engineer';
  mock.get.mockImplementation(async (ref: string | { path: string }) => {
    const path = typeof ref === 'string' ? ref : ref.path;
    if (path.endsWith('/players')) {
      return {
        docs: [
          { id: 'u1', exists: true, get: (key: string) => ({
            role: 'player', connected: true, activeConsoleRoleId: 'dione-president',
            lastSeenAt: new mock.Timestamp(),
          } as Record<string, unknown>)[key] },
          { id: 'u2', exists: true, get: (key: string) => ({
            role: 'player', connected: true, activeConsoleRoleId: 'dione-engineer',
            lastSeenAt: new mock.Timestamp(),
          } as Record<string, unknown>)[key] },
        ],
      };
    }
    if (path.includes('/shipConfettiApprovals/')) {
      return {
        exists: true,
        get: (key: string) => key === 'approvals'
          ? [{ uid: 'u1', roleId: 'dione-engineer' }]
          : undefined,
      };
    }
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: 'player', connected: true, activeConsoleRoleId: mock.post, lastSeenAt: new mock.Timestamp() }
      : { currentTurn: mock.currentTurn, activeRoleIds: mock.activeRoleIds };
    return {
      exists: !path.includes('/shipConfetti/'),
      get: (key: string) => fields[key],
    };
  });

  await expect(popShipConfetti.run({
    data: { ...data, roleId: 'dione-engineer' }, auth: { uid: 'u2' },
  } as CallableRequest<typeof data>)).resolves.toMatchObject({
    status: 'awaiting-officer',
  });
  expect(mock.set.mock.calls.some(([, value]) =>
    (value as { approvals?: unknown[] } | undefined)?.approvals?.[0],
  )).toBe(true);
});

it('rejects a spent dispenser before creating another officer approval', async () => {
  mock.usedShipIds = ['dione'];

  await expect(popShipConfetti.run({
    data: { ...data, roleId: 'dione-engineer' }, auth: { uid: 'u1' },
  } as CallableRequest<typeof data>)).rejects.toMatchObject({ code: 'already-exists' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not disclose a spent dispenser to a player without current authority', async () => {
  mock.full = false;
  mock.post = 'dione-engineer';
  mock.activeRoleIds = ['dione-captain'];
  mock.usedShipIds = ['dione'];

  await expect(popShipConfetti.run({
    data: { ...data, roleId: 'dione-engineer' }, auth: { uid: 'u1' },
  } as CallableRequest<typeof data>)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not count an observer role as a connected officer for a one-shot override', async () => {
  mock.post = 'dione-engineer';
  mock.get.mockImplementation(async (ref: string | { path: string }) => {
    const path = typeof ref === 'string' ? ref : ref.path;
    if (path.endsWith('/players')) {
      return {
        docs: [
          { id: 'u1', exists: true, get: (key: string) => ({
            role: 'observer', connected: true, activeConsoleRoleId: 'dione-president',
            lastSeenAt: new mock.Timestamp(),
          } as Record<string, unknown>)[key] },
          { id: 'u2', exists: true, get: (key: string) => ({
            role: 'player', connected: true, activeConsoleRoleId: 'dione-engineer',
            lastSeenAt: new mock.Timestamp(),
          } as Record<string, unknown>)[key] },
        ],
      };
    }
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: 'player', connected: true, activeConsoleRoleId: mock.post, lastSeenAt: new mock.Timestamp() }
      : { currentTurn: mock.currentTurn, activeRoleIds: mock.activeRoleIds, confettiUsedShipIds: mock.usedShipIds };
    return {
      exists: !path.includes('/shipConfetti/') && !path.includes('/shipConfettiApprovals/'),
      get: (key: string) => fields[key],
    };
  });

  await expect(popShipConfetti.run({
    data: { ...data, roleId: 'dione-engineer' }, auth: { uid: 'u2' },
  } as CallableRequest<typeof data>)).resolves.toMatchObject({ status: 'fired' });
});

it('does not let a stale connected officer block a ship dispenser approval', async () => {
  mock.full = true;
  mock.get.mockImplementation(async (ref: string | { path: string }) => {
    const path = typeof ref === 'string' ? ref : ref.path;
    if (path.endsWith('/players')) {
      return {
        docs: [
          { id: 'u1', exists: true, get: (key: string) => ({ role: 'player', connected: true, activeConsoleRoleId: 'dione-engineer', lastSeenAt: new mock.Timestamp() } as Record<string, unknown>)[key] },
          { id: 'u2', exists: true, get: (key: string) => ({ role: 'player', connected: true, activeConsoleRoleId: 'dione-president', lastSeenAt: new mock.Timestamp(Date.now() - 60_000) } as Record<string, unknown>)[key] },
        ],
      };
    }
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: 'player', connected: true, activeConsoleRoleId: 'dione-engineer', lastSeenAt: new mock.Timestamp() }
      : { currentTurn: mock.currentTurn, activeRoleIds: mock.activeRoleIds };
    return { exists: !path.includes('/shipConfetti/'), get: (key: string) => fields[key] };
  });

  await expect(popShipConfetti.run({
    data: { ...data, roleId: 'dione-engineer' }, auth: { uid: 'u1' },
  } as CallableRequest<typeof data>))
    .resolves.toMatchObject({ status: 'fired' });
});

it('holds bridge confetti until Turn 1 for a player console', async () => {
  mock.currentTurn = 0;
  mock.full = false;

  await expect(popShipConfetti.run({ data, auth: { uid: 'u1' } } as CallableRequest<typeof data>))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/turn 1/i) });
  expect(mock.set).not.toHaveBeenCalled();
});
