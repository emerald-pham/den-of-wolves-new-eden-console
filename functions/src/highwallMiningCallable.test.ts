import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const cryptoMock = vi.hoisted(() => ({ randomInt: vi.fn(), randomUUID: vi.fn() }));
vi.mock('node:crypto', () => cryptoMock);

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
      if (key === 'shuttleCargo.highwall') {
        current.shuttleCargo = { ...((current.shuttleCargo as Fields | undefined) ?? {}), highwall: value };
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

import { runHighwallMining } from './index';

const command = {
  sessionId: 's1', requestId: 'mine-1', resource: 'materials',
  expectedRevision: 0, expectedControlRevision: 2, expectedCycle: 2,
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  cryptoMock.randomInt.mockReset().mockReturnValue(4);
  put('sessions/s1', {
    phase: 'active', currentTurn: 2,
    activeRoleIds: ['icebreaker-miner'], activeVesselIds: ['icebreaker'],
    turnPhase: {
      turn: 2, airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
      teamPhaseEndsAt: '2099-09-21T12:00:00.000Z', openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
    },
    shuttleDockings: [{ shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' }],
    shuttleControl: { highwall: {
      shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    } },
    shuttleFuelled: { highwall: false },
    shuttleCargo: { highwall: { ore: 3, materials: 2 } },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'icebreaker-miner',
    activeConsoleRoleId: 'icebreaker-miner', replacementRoleId: null, fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/owner', {
    role: 'player', connected: true, assignedRoleId: 'icebreaker-miner',
    activeConsoleRoleId: 'icebreaker-miner', replacementRoleId: null, fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['icebreaker'], memberUids: ['holder', 'owner'],
  });
});

it('commits one material roll and exact retry without another random draw or write', async () => {
  await expect(runHighwallMining.run(request(command))).resolves.toMatchObject({
    status: 'committed', cycle: 2, revision: 1,
    operation: { resource: 'materials', rolls: [4], amount: 4 },
    cargo: { ore: 3, materials: 6 },
  });
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    highwallMining: { cycle: 2, revision: 1, operations: [{ requestId: 'mine-1', amount: 4 }] },
    shuttleCargo: { highwall: { ore: 3, materials: 6 } },
  });
  expect(mock.documents.get('sessions/s1/actionAudits/mine-1')).toMatchObject({
    schemaVersion: 1, sessionId: 's1', actorUid: 'holder', actorRoleId: 'icebreaker-miner',
    action: 'highwall-mining', phase: 'active', requestId: 'mine-1', revision: 1,
    outcome: 'committed', resolutionSource: 'server-random',
    redactionPolicy: 'action-audit-metadata-only-v1',
    createdAt: 'server-time',
  });
  expect(mock.documents.get('sessions/s1/actionAudits/mine-1')).not.toHaveProperty('rolls');
  expect(mock.documents.get('sessions/s1/actionAudits/mine-1')).not.toHaveProperty('cargo');
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  cryptoMock.randomInt.mockClear();
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(runHighwallMining.run(request(command))).resolves.toMatchObject({
    status: 'replayed', operation: { amount: 4 },
  });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('rejects a structurally valid replay result that does not match its exact request', async () => {
  await runHighwallMining.run(request(command));
  const receipt = mock.documents.get('sessions/s1/commandReceipts/mine-1')!;
  const result = receipt.result as Fields;
  receipt.result = {
    ...result,
    operation: { requestId: 'mine-1', resource: 'ore', rolls: [1, 1, 1], amount: 3 },
  };
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  cryptoMock.randomInt.mockClear();
  await expect(runHighwallMining.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('rolls three server dice for ore and adds their sum only to Highwall cargo', async () => {
  cryptoMock.randomInt.mockReset()
    .mockReturnValueOnce(2).mockReturnValueOnce(5).mockReturnValueOnce(3);
  await expect(runHighwallMining.run(request({ ...command, resource: 'ore' }))).resolves.toMatchObject({
    operation: { resource: 'ore', rolls: [2, 5, 3], amount: 10 },
    cargo: { ore: 13, materials: 2 },
  });
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(3);
});

it('allows two standard operations and requires fuel for the third', async () => {
  await runHighwallMining.run(request(command));
  await runHighwallMining.run(request({ ...command, requestId: 'mine-2', expectedRevision: 1 }));
  cryptoMock.randomInt.mockClear();
  await expect(runHighwallMining.run(request({
    ...command, requestId: 'mine-3-blocked', expectedRevision: 2,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  mock.documents.get('sessions/s1')!.shuttleFuelled = { highwall: true };
  await expect(runHighwallMining.run(request({
    ...command, requestId: 'mine-3', expectedRevision: 2,
  }))).resolves.toMatchObject({ revision: 3 });
});

it.each([
  ['foreign holder', 'owner', {}, command],
  ['stale control', 'holder', {}, { ...command, requestId: 'stale-control', expectedControlRevision: 1 }],
  ['wrong phase', 'holder', { turnPhase: { turn: 2, airspace: { state: 'restricted' } } }, { ...command, requestId: 'wrong-phase' }],
  ['malformed cargo', 'holder', { shuttleCargo: { highwall: { food: 9 } } }, { ...command, requestId: 'bad-cargo' }],
  ['malformed state', 'holder', { highwallMining: { cycle: 2, revision: 'one', operations: [] } }, { ...command, requestId: 'bad-state' }],
] as const)('rejects %s before rolling or writing', async (_label, uid, sessionPatch, data) => {
  Object.assign(mock.documents.get('sessions/s1')!, sessionPatch);
  cryptoMock.randomInt.mockClear();
  await expect(runHighwallMining.run(request(data, uid))).rejects.toMatchObject({
    code: expect.stringMatching(/permission-denied|failed-precondition/),
  });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('rejects a docked host outside the holder fleet group before rolling or writing', async () => {
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['quellon'];
  cryptoMock.randomInt.mockClear();
  await expect(runHighwallMining.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['lobby lifecycle', { phase: 'lobby' }],
  ['missing current cycle', { currentTurn: undefined }],
  ['mismatched phase cycle', { turnPhase: {
    turn: 3, airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    teamPhaseEndsAt: '2099-09-21T12:00:00.000Z', openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
  } }],
  ['paused clock', { turnPhase: {
    turn: 2, airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    teamPhaseEndsAt: '2099-09-21T12:00:00.000Z', openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
    timerPause: { window: 'open', remainingMs: 1000, pausedAt: '2099-09-21T12:01:00.000Z' },
  } }],
  ['expired clock', { turnPhase: {
    turn: 2, airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    teamPhaseEndsAt: '2020-09-21T12:00:00.000Z', openAirspaceEndsAt: '2020-09-21T12:15:00.000Z',
  } }],
] as const)('rejects %s before rolling or writing', async (_label, patch) => {
  Object.assign(mock.documents.get('sessions/s1')!, patch);
  cryptoMock.randomInt.mockClear();
  await expect(runHighwallMining.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['own event', 'sessions/s1/events/highwall-mining-mine-1'],
  ['foreign legacy request', 'sessions/s1/events/mine-1'],
  ['orphaned action audit', 'sessions/s1/actionAudits/mine-1'],
] as const)('rejects an unbound %s collision before rolling or writing', async (_label, path) => {
  put(path, { type: 'legacy' });
  cryptoMock.randomInt.mockClear();
  await expect(runHighwallMining.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('rejects malformed bound receipts before rolling or writing', async () => {
  put('sessions/s1/commandReceipts/mine-1', {
    fingerprint: {
      kind: 'highwall-mining', sessionId: 's1', actorUid: 'holder', requestId: 'mine-1',
      resource: 'materials', expectedRevision: 0, expectedControlRevision: 2, cycle: 2,
      forged: true,
    },
    result: { status: 'committed' },
  });
  cryptoMock.randomInt.mockClear();
  await expect(runHighwallMining.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  { cycle: 3, revision: 0, operations: [] },
  { cycle: 2, revision: 2, operations: [
    { requestId: 'duplicate', resource: 'materials', rolls: [2], amount: 2 },
    { requestId: 'duplicate', resource: 'materials', rolls: [3], amount: 3 },
  ] },
])('rejects noncanonical mining state before rolling or writing', async (highwallMining) => {
  mock.documents.get('sessions/s1')!.highwallMining = highwallMining;
  cryptoMock.randomInt.mockClear();
  await expect(runHighwallMining.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});
