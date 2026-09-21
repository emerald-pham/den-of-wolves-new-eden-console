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
      if (child && ['shipSurvivors', 'shuttleEvacuations'].includes(root!)) {
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

import { evacuateShuttleSurvivorsCommand } from './index';

const command = {
  sessionId: 's1', requestId: 'evac-1', shuttleId: 'hummingbird',
  destinationShipId: 'capybara', amount: 2_000, expectedControlRevision: 0,
  expectedCycle: 3, expectedEvacuationRevision: 0,
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 3, activeRoleIds: ['quellon-explorer'],
    activeVesselIds: ['quellon', 'capybara'], populationAlerts: {},
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2026-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2026-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'now' }],
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'owner',
      holderUid: 'holder', revision: 0,
    } },
    shipSurvivors: { quellon: 30_000, capybara: 13_000 }, shuttleEvacuations: {},
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/owner', {
    role: 'player', connected: true, assignedRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['quellon', 'capybara'], memberUids: ['holder', 'owner'],
  });
});

it('atomically moves survivors, records craft use and one privacy-safe event, then replays', async () => {
  await expect(evacuateShuttleSurvivorsCommand.run(request(command))).resolves.toMatchObject({
    status: 'committed', sourceShipId: 'quellon', destinationShipId: 'capybara',
    sourcePopulation: 28_000, destinationPopulation: 15_000,
    movedThisCycle: 2_000, evacuationRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipSurvivors: { quellon: 28_000, capybara: 15_000 },
    shuttleEvacuations: { hummingbird: { cycle: 3, moved: 2_000, revision: 1 } },
  });
  expect(mock.documents.get('sessions/s1/events/shuttle-evacuation-evac-1')).toMatchObject({
    type: 'shuttle-survivor-evacuation', amount: 2_000, movedThisCycle: 2_000,
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(evacuateShuttleSurvivorsCommand.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('rejects concurrent stale revisions and keeps the committed transfer singular', async () => {
  await evacuateShuttleSurvivorsCommand.run(request(command));
  await expect(evacuateShuttleSurvivorsCommand.run(request({ ...command, requestId: 'evac-2' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipSurvivors: { quellon: 28_000, capybara: 15_000 },
    shuttleEvacuations: { hummingbird: { moved: 2_000, revision: 1 } },
  });
});

it.each([
  ['foreign holder', 'owner', command],
  ['stale control', 'holder', { ...command, requestId: 'stale-control', expectedControlRevision: 2 }],
  ['stale cycle', 'holder', { ...command, requestId: 'stale-cycle', expectedCycle: 2 }],
] as const)('rejects %s without mutation', async (_label, uid, data) => {
  await expect(evacuateShuttleSurvivorsCommand.run(request(data, uid))).rejects.toMatchObject({
    code: expect.stringMatching(/permission-denied|failed-precondition/),
  });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['stale phase clock', () => { (mock.documents.get('sessions/s1')!.turnPhase as Fields).turn = 2; }],
  ['missing current cycle', () => { delete mock.documents.get('sessions/s1')!.currentTurn; }],
] as const)('rejects a %s without mutation', async (_label, mutate) => {
  mutate();
  await expect(evacuateShuttleSurvivorsCommand.run(request(command)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('rejects a preexisting event without a replay receipt and preserves it', async () => {
  const eventPath = 'sessions/s1/events/shuttle-evacuation-evac-1';
  put(eventPath, { type: 'legacy-event', sentinel: true });
  await expect(evacuateShuttleSurvivorsCommand.run(request(command)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get(eventPath)).toEqual({ type: 'legacy-event', sentinel: true });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('rejects cross-group destinations, pending alerts and cycle-cap overflow without mutation', async () => {
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['quellon'];
  await expect(evacuateShuttleSurvivorsCommand.run(request({ ...command, requestId: 'cross' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['quellon', 'capybara'];
  mock.documents.get('sessions/s1')!.populationAlerts = { capybara: { population: 13_000 } };
  await expect(evacuateShuttleSurvivorsCommand.run(request({ ...command, requestId: 'alert' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1')!.populationAlerts = {};
  mock.documents.get('sessions/s1')!.shuttleEvacuations = { hummingbird: { cycle: 3, moved: 4_000, revision: 1 } };
  await expect(evacuateShuttleSurvivorsCommand.run(request({
    ...command, requestId: 'cap', expectedEvacuationRevision: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});
