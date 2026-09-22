import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => { const fields = documents.get(path); return {
    exists: fields !== undefined, id: path.split('/').at(-1) ?? '', ref: ref(path),
    get: (field: string) => fields?.[field], data: () => fields,
  }; };
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      const [root, child] = key.split('.');
      if (child && (root === 'shipResources' || root === 'shuttleCargo')) {
        current[root] = { ...((current[root] as Fields | undefined) ?? {}), [child]: value };
      } else current[key] = value;
    }
    documents.set(target.path, current);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update }));
  return { documents, get, set, update, db: { doc: ref, collection: ref, runTransaction } };
});
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: class MockTimestamp { constructor(private readonly value: Date) {} static now() { return new MockTimestamp(new Date()); } toDate() { return this.value; } toMillis() { return this.value.getTime(); } },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_s: string, h: (event: unknown) => unknown) => ({ run: h }) }));

import { transferShuttleCargoCommand } from './index';

const command = {
  sessionId: 's1', requestId: 'cargo-1', shuttleId: 'hummingbird', resourceId: 'food',
  direction: 'load', amount: 2, expectedControlRevision: 0,
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 1,
    turnPhase: {
      turn: 1, airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'now' }],
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'owner',
      holderUid: 'holder', revision: 0,
    } },
    shipResources: { quellon: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 } },
    shuttleCargo: { hummingbird: { food: 1, water: 0 } },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/owner', {
    role: 'player', connected: true, assignedRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['quellon'], memberUids: ['holder', 'owner'] });
});

it('moves cargo across both ledgers once and replays without another write', async () => {
  await expect(transferShuttleCargoCommand.run(request(command))).resolves.toMatchObject({
    status: 'committed', hostShipId: 'quellon', shipAmount: 8, shuttleAmount: 3,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipResources: { quellon: expect.objectContaining({ food: 8 }) },
    shuttleCargo: { hummingbird: expect.objectContaining({ food: 3 }) },
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(transferShuttleCargoCommand.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it.each([
  ['foreign holder', 'owner', command],
  ['forbidden type', 'holder', { ...command, requestId: 'ore', resourceId: 'ore' }],
  ['negative amount', 'holder', { ...command, requestId: 'negative', amount: -1 }],
  ['stale custody', 'holder', { ...command, requestId: 'stale', expectedControlRevision: 2 }],
] as const)('rejects %s without mutation', async (_label, uid, data) => {
  await expect(transferShuttleCargoCommand.run(request(data, uid))).rejects.toMatchObject({
    code: expect.stringMatching(/invalid-argument|permission-denied|failed-precondition/),
  });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('rejects cargo movement outside the live Coordination phase without mutation', async () => {
  mock.documents.get('sessions/s1')!.turnPhase = {
    turn: 1, airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(transferShuttleCargoCommand.run(request({
    ...command, requestId: 'wrong-phase',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects cargo movement when the authoritative phase clock is absent without mutation', async () => {
  delete mock.documents.get('sessions/s1')!.turnPhase;

  await expect(transferShuttleCargoCommand.run(request({
    ...command, requestId: 'missing-phase-clock',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/no current server phase/i),
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects transit, cross-group host, and insufficient inventory without mutation', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.shuttleDockings = [];
  await expect(transferShuttleCargoCommand.run(request({ ...command, requestId: 'transit' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  session.shuttleDockings = [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'now' }];
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = [];
  await expect(transferShuttleCargoCommand.run(request({ ...command, requestId: 'foreign' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['quellon'];
  await expect(transferShuttleCargoCommand.run(request({ ...command, requestId: 'short', amount: 11 }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('rejects missing authoritative ship inventory without restoring seeded resources', async () => {
  mock.documents.get('sessions/s1')!.shipResources = {};
  await expect(transferShuttleCargoCommand.run(request({
    ...command, requestId: 'missing-inventory',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects a stale player fleet-group pointer after canonical membership is removed', async () => {
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.memberUids = ['owner'];
  await expect(transferShuttleCargoCommand.run(request({
    ...command, requestId: 'removed-member',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});
