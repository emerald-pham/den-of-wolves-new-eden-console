import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => ({ exists: documents.has(path), id: ref(path).id, ref: ref(path),
    get: (field: string) => documents.get(path)?.[field], data: () => documents.get(path) });
  const get = vi.fn(async (target: { path: string; kind?: string }) => target.kind === 'collection'
    ? { docs: [...documents.keys()].filter((path) => path.startsWith(`${target.path}/`) &&
      !path.slice(target.path.length + 1).includes('/')).map(snapshot) }
    : snapshot(target.path));
  const set = vi.fn((target: { path: string }, value: Fields, options?: { merge?: boolean }) => {
    documents.set(target.path, { ...(options?.merge ? documents.get(target.path) : {}), ...value });
  });
  const create = vi.fn((target: { path: string }, value: Fields) => {
    if (documents.has(target.path)) throw new Error('already exists');
    documents.set(target.path, { ...value });
  });
  const update = vi.fn((target: { path: string }, value: Fields) => {
    const current = { ...documents.get(target.path) };
    for (const [path, field] of Object.entries(value)) {
      const keys = path.split('.');
      let cursor = current;
      for (const key of keys.slice(0, -1)) {
        cursor[key] = { ...(cursor[key] as Fields | undefined) }; cursor = cursor[key] as Fields;
      }
      cursor[keys.at(-1)!] = field;
    }
    documents.set(target.path, current);
  });
  let tail: Promise<unknown> = Promise.resolve();
  const runTransaction = vi.fn((callback: (tx: unknown) => unknown) => {
    const pending = tail.then(() => callback({ get, set, create, update }));
    tail = pending.catch(() => undefined);
    return pending;
  });
  return { documents, get, set, create, update,
    db: { doc: ref, collection: (path: string) => ({ path, kind: 'collection' }), runTransaction } };
});
const random = vi.hoisted(() => ({ randomInt: vi.fn(() => 4) }));
vi.mock('node:crypto', async (importOriginal) => ({ ...await importOriginal<typeof import('node:crypto')>(), ...random }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class { constructor(private value: Date) {} toDate() { return this.value; } },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({ run: maybeHandler ?? optionsOrHandler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_schedule: string, handler: unknown) => ({ run: handler }) }));

import { buildEndeavourScienceDevice, activateEndeavourEcmDevice, readEndeavourResearchWorkspace,
  runWolfAgentDetectorTest } from './index';

const command = { sessionId: 's1', requestId: 'build-1', expectedCycle: 1, expectedControlRevision: 2,
  expectedResearchRevision: 0, expectedDeviceRevision: 0, deviceId: 'ecm-device' };
const request = (data: Fields, uid = 'scientist') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, value: Fields) => mock.documents.set(path, { ...value });
const session = () => mock.documents.get('sessions/s1')!;
const noWrites = () => {
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
};

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.create.mockClear(); mock.update.mockClear();
  random.randomInt.mockClear();
  put('sessions/s1', { phase: 'active', currentTurn: 1, activeRoleIds: ['shepherd-scientist'],
    activeVesselIds: ['shepherd'],
    turnPhase: { turn: 1, teamPhaseEndsAt: '2999-01-01T00:00:00Z', openAirspaceEndsAt: '2999-01-01T01:00:00Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    shuttleControl: { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
      ownerUid: 'scientist', holderUid: 'scientist', revision: 2 } },
    shipResources: { shepherd: { materials: 30, ore: 10, fuel: 4, food: 10, water: 8, securityTeams: 2 } },
  });
  put('sessions/s1/players/scientist', { role: 'player', connected: true, assignedRoleId: 'shepherd-scientist',
    activeConsoleRoleId: 'shepherd-scientist', fleetGroupId: 'fleet-1' });
  put('sessions/s1/players/target', { role: 'player', connected: true, displayName: 'Target', fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['shepherd'], memberUids: ['scientist', 'target'] });
  put('sessions/s1/secrets/loyalty-target', { visibleToUids: ['target'], payload: { type: 'loyalty', kind: 'wolf-agent' } });
  put('sessions/s1/serverState/navigation', { shipGalacticCoordinates: { shepherd: '0000' }, shipNavigationLogs: { shepherd: [] },
    pursuitGroups: { 'fleet-1': 8 }, revision: 1 });
  put('sessions/s1/gmDiscovery/current', { pursuitGroups: { 'fleet-1': 8 }, revision: 1 });
  for (const uid of ['scientist', 'target']) put(`sessions/s1/playerDiscoveries/${uid}`, { groupId: 'fleet-1', pursuitValue: 8, revision: 1 });
});

it('commits early ECM construction but requires completed research before its one-use effect', async () => {
  put('sessions/s1/serverState/endeavourResearch', { 'ecm-device': 1 });
  const before = await readEndeavourResearchWorkspace.run(request({ sessionId: 's1' }));
  expect(before.scienceDevices).toMatchObject({
    revision: 0, ecmBuilt: false, detectorBuilt: false, ecmUsed: false, shepherdMaterials: 30,
    buildCosts: { 'ecm-device': 13, 'wolf-agent-detector': null },
  });
  await expect(buildEndeavourScienceDevice.run(request(command))).resolves.toMatchObject({
    status: 'committed', built: true, deviceId: 'ecm-device', materialCost: 13, shepherdMaterials: 17, deviceRevision: 1,
  });
  expect(session()).toMatchObject({ shipResources: { shepherd: { materials: 17, ore: 10 } } });
  expect(mock.documents.get('sessions/s1/serverState/endeavourScienceDevices')).toEqual({ revision: 1, ecmBuilt: true, detectorBuilt: false });
  const after = await readEndeavourResearchWorkspace.run(request({ sessionId: 's1' }));
  expect(after.scienceDevices).toMatchObject({ ecmBuilt: true, shepherdMaterials: 17 });
  const use = { sessionId: 's1', requestId: 'use-ecm', expectedControlRevision: 2, expectedDeviceRevision: 0, expectedCycle: 1 };
  await expect(activateEndeavourEcmDevice.run(request(use))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/serverState/navigation')).toMatchObject({ pursuitGroups: { 'fleet-1': 8 } });
  expect(mock.documents.has('sessions/s1/commandReceipts/use-ecm')).toBe(false);
  put('sessions/s1/serverState/endeavourResearch', { 'ecm-device': 5 });
  await expect(activateEndeavourEcmDevice.run(request(use))).resolves.toMatchObject({ pursuitBefore: 8, pursuitAfter: 5 });
  await expect(activateEndeavourEcmDevice.run(request(use))).resolves.toMatchObject({ status: 'replayed' });
  expect(session()).toMatchObject({ shipResources: { shepherd: { materials: 17 } } });
  expect(mock.documents.get('sessions/s1/serverState/navigation')).toMatchObject({ pursuitGroups: { 'fleet-1': 5 } });
  expect(mock.documents.get('sessions/s1/endeavourScienceDeviceAudits/build-1')).toMatchObject({ materialCost: 13, materialsBefore: 30, materialsAfter: 17 });
});

it.each([[2, 18], [3, 12], [4, 10]] as const)('builds Detector at earned mark %s for %s materials and keeps tests private', async (marks, price) => {
  put('sessions/s1/serverState/endeavourResearch', { 'wolf-agent-detector': marks });
  await expect(buildEndeavourScienceDevice.run(request({ ...command, deviceId: 'wolf-agent-detector' })))
    .resolves.toMatchObject({ materialCost: price, shepherdMaterials: 30 - price });
  if (marks < 4) return;
  const test = { sessionId: 's1', requestId: 'test-1', expectedCycle: 1, expectedRevision: 0, targetUid: 'target' };
  await expect(runWolfAgentDetectorTest.run(request(test))).resolves.toMatchObject({ reportedWolf: true });
  await runWolfAgentDetectorTest.run(request(test));
  expect(random.randomInt).toHaveBeenCalledExactlyOnceWith(1, 6);
  expect(mock.documents.get('sessions/s1/wolfAgentDetectorReports/scientist')).toMatchObject({ visibleToUids: ['scientist'] });
  expect(mock.documents.get('sessions/s1/wolfAgentDetectorReports/scientist')).not.toHaveProperty('actualWolf');
  expect(mock.documents.get('sessions/s1/wolfAgentDetectorAudits/test-1')).toMatchObject({ actualWolf: true, accuracyRoll: 4 });
});

it('requires completed Detector research before testing an already built device', async () => {
  put('sessions/s1/serverState/endeavourResearch', { 'wolf-agent-detector': 2 });
  await buildEndeavourScienceDevice.run(request({ ...command, deviceId: 'wolf-agent-detector' }));
  mock.set.mockClear(); mock.create.mockClear(); mock.update.mockClear(); random.randomInt.mockClear();
  await expect(runWolfAgentDetectorTest.run(request({
    sessionId: 's1', requestId: 'test-before-complete', expectedCycle: 1, expectedRevision: 0, targetUid: 'target',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(random.randomInt).not.toHaveBeenCalled(); noWrites();
});

it.each([0, 1])('denies unavailable Detector construction at earned mark %s atomically', async (marks) => {
  put('sessions/s1/serverState/endeavourResearch', { 'wolf-agent-detector': marks });
  await expect(buildEndeavourScienceDevice.run(request({ ...command, deviceId: 'wolf-agent-detector' })))
    .rejects.toMatchObject({ code: 'failed-precondition' }); noWrites();
});

it('replays the exact build after phase/cycle changes without debiting materials again or constructing twice', async () => {
  const first = await buildEndeavourScienceDevice.run(request(command));
  session().currentTurn = 2; (session().turnPhase as Fields).turn = 2;
  (session().turnPhase as Fields).airspace = { state: 'lifted', tickerActive: false, pressAccess: false };
  mock.set.mockClear(); mock.create.mockClear(); mock.update.mockClear();
  await expect(buildEndeavourScienceDevice.run(request(command))).resolves.toEqual({ ...first, status: 'replayed' }); noWrites();
});

it('serializes competing construction requests so only one debit and Built state commit', async () => {
  const results = await Promise.allSettled([buildEndeavourScienceDevice.run(request(command)),
    buildEndeavourScienceDevice.run(request({ ...command, requestId: 'competing' }))]);
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  expect(session()).toMatchObject({ shipResources: { shepherd: { materials: 12 } } });
  expect(mock.documents.has('sessions/s1/commandReceipts/competing')).toBe(false);
});

it.each(['ecm-device', 'wolf-agent-detector'])('rejects insufficient materials for %s without a receipt or Built state', async (deviceId) => {
  put('sessions/s1/serverState/endeavourResearch', { 'wolf-agent-detector': 2 });
  (session().shipResources as Record<string, Fields>).shepherd.materials = 17;
  await expect(buildEndeavourScienceDevice.run(request({ ...command, deviceId })))
    .rejects.toMatchObject({ code: 'failed-precondition' }); noWrites();
});

it.each([
  ['wrong assignment', (actor: Fields) => { actor.assignedRoleId = 'shepherd-engineer'; }],
  ['conflicting seat', (actor: Fields) => { actor.seatId = 'shepherd-engineer'; }],
  ['disconnected actor', (actor: Fields) => { actor.connected = false; }],
  ['replacement identity', (actor: Fields) => { actor.replacementRoleId = 'warrior-captain'; }],
  ['foreign console', (actor: Fields) => { actor.activeConsoleRoleId = 'admiral'; }],
  ['escaped actor', (actor: Fields) => { actor.escapeState = { status: 'fled', shipId: 'shepherd', destructionEventId: 'destroyed', revision: 1 }; }],
])('rejects %s before writes or private result disclosure', async (_label, mutate) => {
  mutate(mock.documents.get('sessions/s1/players/scientist')!);
  await expect(buildEndeavourScienceDevice.run(request(command))).rejects.toMatchObject({ code: 'permission-denied' }); noWrites();
});

it.each([
  ['Coordination', (phase: Fields) => { phase.airspace = { state: 'lifted', tickerActive: false, pressAccess: false }; }],
  ['expired Team', (phase: Fields) => { phase.teamPhaseEndsAt = '2000-01-01T00:00:00Z'; }],
  ['paused Team', (phase: Fields) => { phase.timerPause = { window: 'restricted', remainingMs: 1000, pausedAt: '2026-10-08T13:00:00Z' }; }],
])('rejects construction during %s', async (_label, mutate) => {
  mutate(session().turnPhase as Fields);
  await expect(buildEndeavourScienceDevice.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' }); noWrites();
});

it.each([
  ['stale cycle', { expectedCycle: 2 }], ['stale control', { expectedControlRevision: 1 }],
  ['stale research', { expectedResearchRevision: 1 }], ['stale construction', { expectedDeviceRevision: 1 }],
])('rejects %s without paying', async (_label, patch) => {
  await expect(buildEndeavourScienceDevice.run(request({ ...command, ...patch })))
    .rejects.toMatchObject({ code: 'failed-precondition' }); noWrites();
});

it('rejects malformed or forged inventories, progress, construction and commands', async () => {
  for (const data of [{ ...command, materialCost: 0 }, { ...command, deviceId: 'reactor' }, { ...command, built: true }]) {
    await expect(buildEndeavourScienceDevice.run(request(data))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  put('sessions/s1/serverState/endeavourResearch', { unknown: 1 });
  await expect(buildEndeavourScienceDevice.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.delete('sessions/s1/serverState/endeavourResearch');
  put('sessions/s1/serverState/endeavourScienceDevices', { revision: 1, ecmBuilt: false, detectorBuilt: false });
  await expect(buildEndeavourScienceDevice.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.delete('sessions/s1/serverState/endeavourScienceDevices');
  (session().shipResources as Record<string, Fields>).shepherd.materials = -1;
  await expect(buildEndeavourScienceDevice.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' }); noWrites();
});

it('rejects foreign replay, request collisions, legacy collisions and rebuilding a spent ECM', async () => {
  await buildEndeavourScienceDevice.run(request(command));
  mock.set.mockClear(); mock.create.mockClear(); mock.update.mockClear();
  await expect(buildEndeavourScienceDevice.run(request(command, 'target'))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(buildEndeavourScienceDevice.run(request({ ...command, deviceId: 'wolf-agent-detector' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1/events/legacy-build', { type: 'legacy' });
  await expect(buildEndeavourScienceDevice.run(request({ ...command, requestId: 'legacy-build' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.delete('sessions/s1/serverState/endeavourScienceDevices');
  put('sessions/s1/serverState/endeavourEcmDevice', { status: 'used', revision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5 });
  await expect(buildEndeavourScienceDevice.run(request({ ...command, requestId: 'rebuild' })))
    .rejects.toMatchObject({ code: 'failed-precondition' }); noWrites();
});
