import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined, id: path.split('/').at(-1) ?? '', ref: ref(path),
      get: (field: string) => fields?.[field], data: () => fields,
    };
  };
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [path, value] of Object.entries(fields)) {
      const parts = path.split('.');
      if (parts.length === 1) current[path] = value;
      else {
        let cursor = current;
        for (let index = 0; index < parts.length - 1; index += 1) {
          const key = parts[index]!;
          cursor[key] = { ...((cursor[key] as Fields | undefined) ?? {}) };
          cursor = cursor[key] as Fields;
        }
        cursor[parts.at(-1)!] = value;
      }
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
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    static now() { return new MockTimestamp(new Date()); }
    toDate() { return this.value; }
    toMillis() { return this.value.getTime(); }
  },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_s: string, h: (event: unknown) => unknown) => ({ run: h }) }));

import { repairConsolesFromChacau } from './index';

const command = {
  sessionId: 's1', requestId: 'chacau-1', expectedControlRevision: 2,
  expectedRepairRevision: 0, expectedCycle: 3, expectedHostShipId: 'refinery-124',
  systemIds: ['reactor', 'storage'],
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 3,
    activeRoleIds: ['refinery-124-engineer'], activeVesselIds: ['refinery-124'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'now' }],
    shuttleControl: { chacau: {
      shuttleId: 'chacau', ownerRoleId: 'refinery-124-engineer', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    } },
    shuttleFuelled: { chacau: false },
    shipDamage: { 'refinery-124': { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false } },
    shipResources: { 'refinery-124': {
      ore: 0, fuel: 4, food: 11, water: 9, materials: 12, securityTeams: 2,
    } },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'refinery-124-engineer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['refinery-124'], memberUids: ['holder'],
  });
});

it('atomically repairs Chacau consoles, redacts the actor event, and replays exactly', async () => {
  await expect(repairConsolesFromChacau.run(request(command))).resolves.toMatchObject({
    status: 'committed', shuttleId: 'chacau', hostShipId: 'refinery-124',
    systemIds: ['reactor', 'storage'], materialsRemaining: 4, cycle: 3, repairRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipDamage: { 'refinery-124': { damagedSystemIds: ['jump-drive'], destroyed: false } },
    shipResources: { 'refinery-124': { materials: 4 } },
    chacauRepairs: {
      cycle: 3, revision: 1,
      hosts: [{ shipId: 'refinery-124', systemIds: ['reactor', 'storage'] }],
    },
  });
  expect(mock.documents.get('sessions/s1/events/chacau-repair-chacau-1')).toMatchObject({
    type: 'chacau-repair', shuttleId: 'chacau', hostShipId: 'refinery-124',
    systemIds: ['reactor', 'storage'], materialsSpent: 8,
  });
  expect(mock.documents.get('sessions/s1/events/chacau-repair-chacau-1')).not.toHaveProperty('actorUid');
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(repairConsolesFromChacau.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('rejects a copied role and a command that targets a different actor before any mutation', async () => {
  mock.documents.get('sessions/s1/players/holder')!.assignedRoleId = 'dione-engineer';
  await expect(repairConsolesFromChacau.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  mock.documents.get('sessions/s1/players/holder')!.assignedRoleId = 'refinery-124-engineer';
  await expect(repairConsolesFromChacau.run(request(command, 'intruder'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});
