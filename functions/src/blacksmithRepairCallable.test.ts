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

import { repairConsolesFromBlacksmith } from './index';

const command = {
  sessionId: 's1', requestId: 'repair-1', expectedControlRevision: 2,
  expectedRepairRevision: 0, expectedCycle: 3, expectedHostShipId: 'icebreaker',
  systemIds: ['reactor', 'storage'],
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 3,
    activeRoleIds: ['icebreaker-engineer'], activeVesselIds: ['icebreaker'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'now' }],
    shuttleControl: { blacksmith: {
      shuttleId: 'blacksmith', ownerRoleId: 'icebreaker-engineer', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    } },
    shuttleFuelled: { blacksmith: true },
    shipDamage: { icebreaker: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false } },
    shipResources: { icebreaker: {
      ore: 0, fuel: 4, food: 11, water: 9, materials: 12, securityTeams: 2,
    } },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'icebreaker-engineer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['icebreaker'], memberUids: ['holder'],
  });
});

it('rejects every legacy M1 request namespace collision before any write', async () => {
  const requestId = 'repair-legacy-collision';
  const legacyPaths = [
    `sessions/s1/setupMutationRequests/${requestId}`,
    `sessions/s1/gmResponsibilityRequests/${requestId}`,
    `sessions/s1/seatMutationRequests/${requestId}`,
    `sessions/s1/loyaltyAssignmentRequests/${requestId}`,
    `sessionStartRequests/s1_${requestId}`,
    `sessions/s1/events/setup-confirm-${requestId}`,
    `sessions/s1/events/gm-responsibility-${requestId}`,
    `sessions/s1/events/start-${requestId}`,
    `sessions/s1/events/seat-claim-${requestId}`,
    `sessions/s1/events/seat-release-${requestId}`,
    `sessions/s1/events/${requestId}`,
    `sessions/s1/events/press-availability-${requestId}`,
  ];
  const baseSession = { ...mock.documents.get('sessions/s1')! };
  const basePlayer = { ...mock.documents.get('sessions/s1/players/holder')! };
  const baseGroup = { ...mock.documents.get('sessions/s1/fleetGroups/fleet-1')! };

  for (const path of legacyPaths) {
    mock.documents.clear(); mock.set.mockClear(); mock.update.mockClear();
    put('sessions/s1', baseSession);
    put('sessions/s1/players/holder', basePlayer);
    put('sessions/s1/fleetGroups/fleet-1', baseGroup);
    put(path, { legacy: true });
    await expect(repairConsolesFromBlacksmith.run(request({ ...command, requestId })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
    expect(mock.documents.has(`sessions/s1/commandReceipts/${requestId}`)).toBe(false);
  }
});

it('rejects a replay receipt whose result is not exactly bound to the repair request', async () => {
  put('sessions/s1/commandReceipts/repair-1', {
    fingerprint: {
      action: 'blacksmith-repair', sessionId: 's1', requestId: 'repair-1',
      actorUid: 'holder', instanceId: null, expectedRevision: 0,
      payload: {
        expectedControlRevision: 2, expectedCycle: 3, hostShipId: 'icebreaker',
        systemIds: ['reactor', 'storage'],
      },
    },
    result: {
      status: 'committed', sessionId: 's1', requestId: 'repair-1', shuttleId: 'blacksmith',
      hostShipId: 'dione', systemIds: ['reactor', 'storage'], materialsRemaining: 4,
      cycle: 3, repairRevision: 1,
    },
  });
  await expect(repairConsolesFromBlacksmith.run(request(command)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('atomically spends materials, repairs selected consoles, records the cycle, and replays once', async () => {
  await expect(repairConsolesFromBlacksmith.run(request(command))).resolves.toMatchObject({
    status: 'committed', shuttleId: 'blacksmith', hostShipId: 'icebreaker',
    systemIds: ['reactor', 'storage'], materialsRemaining: 4, cycle: 3, repairRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipDamage: { icebreaker: { damagedSystemIds: ['jump-drive'], destroyed: false } },
    shipResources: { icebreaker: { materials: 4 } },
    blacksmithRepairs: {
      cycle: 3, revision: 1,
      hosts: [{ shipId: 'icebreaker', systemIds: ['reactor', 'storage'] }],
    },
  });
  expect(mock.documents.get('sessions/s1/events/blacksmith-repair-repair-1')).toMatchObject({
    type: 'blacksmith-repair', shuttleId: 'blacksmith', hostShipId: 'icebreaker',
    systemIds: ['reactor', 'storage'], materialsSpent: 8,
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(repairConsolesFromBlacksmith.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('canonicalizes a reverse-order selection so an exact retry replays without writes', async () => {
  const reverse = { ...command, requestId: 'repair-reverse', systemIds: ['storage', 'reactor'] };
  await expect(repairConsolesFromBlacksmith.run(request(reverse))).resolves.toMatchObject({
    status: 'committed', systemIds: ['reactor', 'storage'], repairRevision: 1,
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(repairConsolesFromBlacksmith.run(request(reverse))).resolves.toMatchObject({
    status: 'replayed', systemIds: ['reactor', 'storage'], repairRevision: 1,
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it.each([
  ['foreign holder', 'other', command],
  ['stale control', 'holder', { ...command, requestId: 'stale-control', expectedControlRevision: 1 }],
  ['stale repair revision', 'holder', { ...command, requestId: 'stale-repair', expectedRepairRevision: 1 }],
  ['wrong cycle', 'holder', { ...command, requestId: 'stale-cycle', expectedCycle: 2 }],
])('rejects %s without mutation', async (_label, uid, data) => {
  await expect(repairConsolesFromBlacksmith.run(request(data, uid)))
    .rejects.toMatchObject({ code: expect.stringMatching(/permission-denied|failed-precondition/) });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('rejects Team Phase, insufficient materials, and malformed repair history without mutation', async () => {
  const session = mock.documents.get('sessions/s1')!;
  (session.turnPhase as Fields).airspace = { state: 'restricted', tickerActive: true, pressAccess: false };
  await expect(repairConsolesFromBlacksmith.run(request({ ...command, requestId: 'team' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  (session.turnPhase as Fields).airspace = { state: 'lifted', tickerActive: true, pressAccess: true };
  session.shipResources = { icebreaker: {
    ore: 0, fuel: 4, food: 11, water: 9, materials: 7, securityTeams: 2,
  } };
  await expect(repairConsolesFromBlacksmith.run(request({ ...command, requestId: 'poor' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session.shipResources = { icebreaker: {
    ore: 0, fuel: 4, food: 11, water: 9, materials: 12, securityTeams: 2,
  } };
  session.blacksmithRepairs = { cycle: 3, revision: 1, hosts: 'invalid' };
  await expect(repairConsolesFromBlacksmith.run(request({ ...command, requestId: 'malformed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['paused', { timerPause: { window: 'open', remainingMs: 60_000, pausedAt: '2099-09-21T12:01:00.000Z' } }],
  ['expired', { openAirspaceEndsAt: '2000-01-01T00:00:00.000Z' }],
])('rejects a %s Coordination window without mutation', async (_label, phasePatch) => {
  const session = mock.documents.get('sessions/s1')!;
  session.turnPhase = { ...(session.turnPhase as Fields), ...phasePatch };
  await expect(repairConsolesFromBlacksmith.run(request({
    ...command, requestId: `window-${_label}`,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});
