import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return { exists: fields !== undefined, id: path.split('/').at(-1) ?? '', ref: ref(path),
      get: (field: string) => fields?.[field], data: () => fields };
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
  Timestamp: class MockTimestamp { constructor(private readonly value: Date) {} static now() { return new MockTimestamp(new Date()); } toDate() { return this.value; } toMillis() { return this.value.getTime(); } },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_s: string, h: (event: unknown) => unknown) => ({ run: h }) }));

import { repairConsolesFromMacaw } from './index';

const command = {
  sessionId: 's1', requestId: 'macaw-repair-1', expectedControlRevision: 2,
  expectedRepairRevision: 0, expectedCycle: 3, expectedHostShipId: 'capybara',
  systemIds: ['reactor', 'storage'],
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 3,
    activeRoleIds: ['capybara-captain'], activeVesselIds: ['capybara'],
    turnPhase: { turn: 3, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
    shuttleDockings: [{ shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'now' }],
    shuttleControl: { macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'owner', holderUid: 'holder', revision: 2 } },
    shuttleFuelled: { macaw: true },
    shipDamage: { capybara: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false } },
    shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 } },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'capybara-captain', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['capybara'], memberUids: ['holder'] });
});

it('atomically spends Scrap, repairs selected consoles, records an event, and replays once', async () => {
  await expect(repairConsolesFromMacaw.run(request(command))).resolves.toMatchObject({
    status: 'committed', shuttleId: 'macaw', hostShipId: 'capybara',
    systemIds: ['reactor', 'storage'], scrapRemaining: 1, cycle: 3, repairRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipDamage: { capybara: { damagedSystemIds: ['jump-drive'], destroyed: false } },
    shipResources: { capybara: { scrap: 1 } },
    macawRepairs: { cycle: 3, revision: 1, hosts: [{ shipId: 'capybara', systemIds: ['reactor', 'storage'] }] },
  });
  expect(mock.documents.get('sessions/s1/events/macaw-repair-macaw-repair-1')).toMatchObject({
    type: 'macaw-repair', shuttleId: 'macaw', scrapSpent: 2,
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(repairConsolesFromMacaw.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('canonicalizes selection order and rejects a request with an unknown field', async () => {
  const reverse = { ...command, requestId: 'macaw-repair-reverse', systemIds: ['storage', 'reactor'] };
  await expect(repairConsolesFromMacaw.run(request(reverse))).resolves.toMatchObject({
    systemIds: ['reactor', 'storage'], repairRevision: 1,
  });
  await expect(repairConsolesFromMacaw.run(request({ ...command, requestId: 'invalid', fuelled: true })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
});

it.each([
  ['foreign holder', 'other', command],
  ['stale control', 'holder', { ...command, requestId: 'stale-control', expectedControlRevision: 1 }],
  ['stale cycle', 'holder', { ...command, requestId: 'stale-cycle', expectedCycle: 2 }],
])('rejects %s before mutation', async (_label, uid, data) => {
  await expect(repairConsolesFromMacaw.run(request(data, uid))).rejects.toMatchObject({
    code: expect.stringMatching(/permission-denied|failed-precondition/),
  });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('requires a fuelled second ship and rejects malformed server state', async () => {
  let session = mock.documents.get('sessions/s1')!;
  const group = mock.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  session.activeVesselIds = ['capybara', 'aegis']; group.vesselIds = ['capybara', 'aegis'];
  session.shipDamage = {
    capybara: { damagedSystemIds: ['reactor'], destroyed: false },
    aegis: { damagedSystemIds: ['reactor'], destroyed: false },
  };
  session.shipResources = {
    capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
    aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
  };
  await expect(repairConsolesFromMacaw.run(request({ ...command, systemIds: ['reactor'] }))).resolves.toMatchObject({ repairRevision: 1 });
  session = mock.documents.get('sessions/s1')!;
  expect(session.shipResources).toMatchObject({ capybara: { scrap: 2 } });
  session.shuttleDockings = [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'later' }];
  session.shuttleFuelled = { macaw: false };
  await expect(repairConsolesFromMacaw.run(request({ ...command, requestId: 'second', expectedRepairRevision: 1, expectedHostShipId: 'aegis', systemIds: ['reactor'] })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session.shuttleFuelled = { macaw: true };
  await expect(repairConsolesFromMacaw.run(request({ ...command, requestId: 'second', expectedRepairRevision: 1, expectedHostShipId: 'aegis', systemIds: ['reactor'] })))
    .resolves.toMatchObject({ repairRevision: 2, scrapRemaining: 1 });
  session.macawRepairs = { cycle: 3, revision: 2, hosts: 'invalid' };
  await expect(repairConsolesFromMacaw.run(request({ ...command, requestId: 'malformed', expectedRepairRevision: 2, expectedHostShipId: 'aegis', systemIds: ['reactor'] })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});
