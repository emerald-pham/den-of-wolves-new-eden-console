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
      if (child && ['maintenanceCycles', 'serviceShuttleRecharges'].includes(root!)) {
        current[root!] = { ...((current[root!] as Fields | undefined) ?? {}), [child]: value };
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

import { rechargeHostConsoleFromShuttle } from './index';

const command = {
  sessionId: 's1', requestId: 'recharge-1', shuttleId: 'condor', consoleId: 'hydroponics',
  expectedControlRevision: 2, expectedMaintenanceRevision: 7, expectedCycle: 3,
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 3, activeRoleIds: ['quellon-engineer'], activeVesselIds: ['quellon'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2026-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2026-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'condor', shipId: 'quellon', dockedAt: 'now' }],
    shuttleControl: { condor: {
      shuttleId: 'condor', ownerRoleId: 'quellon-engineer', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    } },
    shuttleFuelled: { condor: true }, serviceShuttleRecharges: {},
    maintenanceCycles: { quellon: {
      step: 0, revision: 7, turn: 3, results: { '7': 'Maintenance cycle complete.' },
      charges: ['jump-drive'], refuelled: ['condor'], completedAt: '2026-09-21T12:00:00.000Z',
    } },
    shipDamage: { quellon: { damagedSystemIds: [], destroyed: false } },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'quellon-engineer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/owner', {
    role: 'player', connected: true, assignedRoleId: 'quellon-engineer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['quellon'], memberUids: ['holder', 'owner'],
  });
});

it('atomically appends one host charge, records the cycle use, and replays without another write', async () => {
  await expect(rechargeHostConsoleFromShuttle.run(request(command))).resolves.toMatchObject({
    status: 'committed', shuttleId: 'condor', hostShipId: 'quellon',
    consoleId: 'hydroponics', cycle: 3, maintenanceRevision: 8, rechargeRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    maintenanceCycles: { quellon: { revision: 8, charges: ['jump-drive', 'hydroponics'] } },
    serviceShuttleRecharges: {
      condor: { cycle: 3, hostShipId: 'quellon', consoleId: 'hydroponics', revision: 1 },
    },
  });
  expect(mock.documents.get('sessions/s1/events/service-recharge-recharge-1')).toMatchObject({
    type: 'service-shuttle-recharge', shuttleId: 'condor',
    hostShipId: 'quellon', consoleId: 'hydroponics',
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(rechargeHostConsoleFromShuttle.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('rejects a second recharge in the same cycle without another host charge', async () => {
  await rechargeHostConsoleFromShuttle.run(request(command));
  await expect(rechargeHostConsoleFromShuttle.run(request({
    ...command, requestId: 'recharge-2', consoleId: 'water-production', expectedMaintenanceRevision: 8,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    maintenanceCycles: { quellon: { charges: ['jump-drive', 'hydroponics'] } },
  });
});

it.each([
  ['foreign holder', 'owner', command],
  ['stale custody', 'holder', { ...command, requestId: 'stale-control', expectedControlRevision: 1 }],
  ['stale maintenance', 'holder', { ...command, requestId: 'stale-maintenance', expectedMaintenanceRevision: 6 }],
  ['wrong cycle', 'holder', { ...command, requestId: 'stale-cycle', expectedCycle: 2 }],
] as const)('rejects %s without mutation', async (_label, uid, data) => {
  await expect(rechargeHostConsoleFromShuttle.run(request(data, uid)))
    .rejects.toMatchObject({ code: expect.stringMatching(/permission-denied|failed-precondition/) });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('rejects Team Phase, missing fuel, damaged targets, transit, and foreign-group hosts', async () => {
  const session = mock.documents.get('sessions/s1')!;
  (session.turnPhase as Fields).airspace = { state: 'restricted', tickerActive: true, pressAccess: false };
  await expect(rechargeHostConsoleFromShuttle.run(request({ ...command, requestId: 'team' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  (session.turnPhase as Fields).airspace = { state: 'lifted', tickerActive: true, pressAccess: true };
  session.shuttleFuelled = { condor: false };
  await expect(rechargeHostConsoleFromShuttle.run(request({ ...command, requestId: 'fuel' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session.shuttleFuelled = { condor: true };
  session.shipDamage = { quellon: { damagedSystemIds: ['hydroponics'], destroyed: false } };
  await expect(rechargeHostConsoleFromShuttle.run(request({ ...command, requestId: 'damage' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session.shipDamage = { quellon: { damagedSystemIds: [], destroyed: false } };
  session.shuttleDockings = [];
  await expect(rechargeHostConsoleFromShuttle.run(request({ ...command, requestId: 'transit' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session.shuttleDockings = [{ shuttleId: 'condor', shipId: 'quellon', dockedAt: 'now' }];
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = [];
  await expect(rechargeHostConsoleFromShuttle.run(request({ ...command, requestId: 'foreign-host' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it.each(['lobby', 'casting', 'briefing'] as const)(
  'rejects stale Coordination state during %s without mutation',
  async (phase) => {
    mock.documents.get('sessions/s1')!.phase = phase;
    await expect(rechargeHostConsoleFromShuttle.run(request({
      ...command, requestId: `inactive-${phase}`,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
  },
);

it.each([
  { damagedSystemIds: 'hydroponics', destroyed: false },
  { damagedSystemIds: [], destroyed: 'true' },
])('rejects malformed present host damage without mutation', async (damage) => {
  mock.documents.get('sessions/s1')!.shipDamage = { quellon: damage };
  await expect(rechargeHostConsoleFromShuttle.run(request({
    ...command, requestId: `malformed-damage-${String(damage.destroyed)}`,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});
