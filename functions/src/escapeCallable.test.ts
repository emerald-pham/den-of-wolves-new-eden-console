import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  session: {
    phase: 'active', setupRevision: 7, activeVesselIds: ['aegis'],
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: true } },
    shipResources: { aegis: { food: 4 } },
  } as Record<string, unknown>,
  player: {
    role: 'player', connected: true, assignedRoleId: 'admiral',
    activeConsoleRoleId: 'admiral', seatId: 'admiral',
    escapeState: {
      status: 'pending', shipId: 'aegis', destructionEventId: 'damage-destroyed-aegis', revision: 8,
    },
  } as Record<string, unknown>,
  seat: { status: 'claimed', holderUid: 'u1', roleId: 'admiral' } as Record<string, unknown>,
  receipts: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<readonly [string, Record<string, unknown>]>,
  sets: [] as Array<readonly [string, Record<string, unknown>]>,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({ path }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: async (ref: { path: string }) => {
        const path = ref.path;
        if (path === 'sessions/s1') return snapshot(mock.session, path);
        if (path === 'sessions/s1/players/u1') return snapshot(mock.player, path);
        if (path === 'sessions/s1/seats/admiral') return snapshot(mock.seat, path);
        if (path.startsWith('sessions/s1/commandReceipts/')) {
          const fields = mock.receipts.get(path);
          return snapshot(fields ?? {}, path, fields !== undefined);
        }
        return snapshot({}, path, false);
      },
      update: (ref: { path: string }, fields: Record<string, unknown>) => {
        mock.updates.push([ref.path, fields]);
      },
      set: (ref: { path: string }, fields: Record<string, unknown>) => {
        mock.sets.push([ref.path, fields]);
        if (ref.path.startsWith('sessions/s1/commandReceipts/')) mock.receipts.set(ref.path, fields);
      },
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { adjustShipResource, fleeDestroyedShip } from './index';

function snapshot(fields: Record<string, unknown>, path: string, exists = true) {
  return {
    exists,
    id: path.split('/').at(-1),
    ref: { path },
    get: (field: string) => fields[field],
  };
}

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.session = {
    phase: 'active', setupRevision: 7, activeVesselIds: ['aegis'],
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: true } },
    shipResources: { aegis: { food: 4 } },
  };
  mock.player = {
    role: 'player', connected: true, assignedRoleId: 'admiral',
    activeConsoleRoleId: 'admiral', seatId: 'admiral',
    escapeState: {
      status: 'pending', shipId: 'aegis', destructionEventId: 'damage-destroyed-aegis', revision: 8,
    },
  };
  mock.seat = { status: 'claimed', holderUid: 'u1', roleId: 'admiral' };
  mock.receipts.clear();
  mock.updates.length = 0;
  mock.sets.length = 0;
});

it('lets the affected authenticated player flee once and releases only the station pointer', async () => {
  await expect(fleeDestroyedShip.run(request({
    sessionId: 's1', requestId: 'flee-1', expectedSetupRevision: 7,
  }))).resolves.toMatchObject({
    status: 'committed', targetUid: 'u1', shipId: 'aegis', setupRevision: 8,
    escapeState: { status: 'fled', shipId: 'aegis', fleeRequestId: 'flee-1' },
  });
  expect(mock.updates).toContainEqual(['sessions/s1/seats/admiral', {
    status: 'open', holderUid: null, claimedAt: null,
  }]);
  expect(mock.updates).toContainEqual(['sessions/s1/players/u1', {
    escapeState: expect.objectContaining({ status: 'fled', shipId: 'aegis' }),
    activeConsoleRoleId: null, seatId: null,
  }]);
  expect(mock.updates).toContainEqual(['sessions/s1', {
    setupRevision: 8, updatedAt: 'server-time',
  }]);
  expect(mock.updates.some(([, fields]) => 'shipResources.aegis' in fields)).toBe(false);
});

it('replays the receipt and blocks a destroyed-ship mutation after escape', async () => {
  const payload = { sessionId: 's1', requestId: 'flee-replay', expectedSetupRevision: 7 };
  const first = await fleeDestroyedShip.run(request(payload));
  const updateCount = mock.updates.length;
  await expect(fleeDestroyedShip.run(request(payload))).resolves.toEqual(first);
  expect(mock.updates).toHaveLength(updateCount);

  await expect(adjustShipResource.run(request({
    sessionId: 's1', shipId: 'aegis', resourceId: 'food', delta: 1,
    requestId: 'resource-after-escape', expectedRevision: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.updates).toHaveLength(updateCount);
});

it('rejects a second flee transition after the first receipt has committed', async () => {
  await fleeDestroyedShip.run(request({ sessionId: 's1', requestId: 'flee-first', expectedSetupRevision: 7 }));
  mock.player.escapeState = {
    status: 'fled', shipId: 'aegis', destructionEventId: 'damage-destroyed-aegis',
    revision: 8, fleeRequestId: 'flee-first',
  };
  await expect(fleeDestroyedShip.run(request({
    sessionId: 's1', requestId: 'flee-second', expectedSetupRevision: 8,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});
