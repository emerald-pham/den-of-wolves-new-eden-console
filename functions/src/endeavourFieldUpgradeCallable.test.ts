import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: ref(path),
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) =>
    documents.set(target.path, { ...fields }));
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
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update }));
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
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { upgradeEndeavourFieldTargets } from './index';

const targets = (...pairs: readonly [string, string][]) =>
  pairs.map(([shipId, systemId]) => ({ shipId, systemId }));
const command = {
  sessionId: 's1',
  requestId: 'upgrade-1',
  expectedControlRevision: 3,
  expectedUpgradeRevision: 0,
  expectedCycle: 3,
  targets: targets(['shepherd', 'reactor'], ['aegis', 'reactor']),
};
const request = (data: Fields, uid = 'holder') =>
  ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  put('sessions/s1', {
    phase: 'active',
    currentTurn: 3,
    activeRoleIds: ['shepherd-scientist'],
    activeVesselIds: ['shepherd', 'aegis', 'quellon'],
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'now' }],
    shuttleControl: {
      endeavour: {
        shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
        ownerUid: 'holder', holderUid: 'holder', revision: 3,
      },
    },
    shuttleFuelled: { endeavour: false },
    shipResources: {
      shepherd: { ore: 0, fuel: 4, food: 10, water: 8, materials: 7, securityTeams: 2 },
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 8, securityTeams: 9 },
      quellon: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 },
    },
    endeavourResearchProgressByShip: {
      shepherd: { reactor: 1 },
      aegis: { reactor: 0 },
    },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'shepherd-scientist',
    fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['shepherd', 'aegis', 'quellon'], memberUids: ['holder'],
  });
});

it('charges each target ship at its current research cost in one authoritative update', async () => {
  await expect(upgradeEndeavourFieldTargets.run(request(command))).resolves.toMatchObject({
    status: 'committed', shuttleId: 'endeavour', cycle: 3, upgradeRevision: 1,
    appliedTargets: [
      { shipId: 'aegis', systemId: 'reactor', materialCost: 8, crossedBox: 0 },
      { shipId: 'shepherd', systemId: 'reactor', materialCost: 7, crossedBox: 1 },
    ],
    materialsRemainingByShip: { shepherd: 0, aegis: 0 },
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipResources: { shepherd: { materials: 0 }, aegis: { materials: 0 } },
    endeavourResearchProgressByShip: { shepherd: { reactor: 2 }, aegis: { reactor: 1 } },
    endeavourFieldUpgrades: {
      cycle: 3, revision: 1,
      targets: expect.arrayContaining([
        expect.objectContaining({ shipId: 'shepherd', systemId: 'reactor', materialCost: 7 }),
        expect.objectContaining({ shipId: 'aegis', systemId: 'reactor', materialCost: 8 }),
      ]),
    },
  });
  expect(mock.documents.get('sessions/s1/events/endeavour-field-upgrade-upgrade-1'))
    .not.toHaveProperty('actorUid');
  expect(mock.documents.get('sessions/s1/events/endeavour-field-upgrade-upgrade-1'))
    .not.toHaveProperty('actorRoleId');
});

it('derives the four-target extension from server fuel and rejects client fuel claims', async () => {
  const threeTargets = {
    ...command,
    requestId: 'upgrade-fuelled',
    targets: targets(
      ['shepherd', 'reactor'], ['aegis', 'reactor'], ['quellon', 'reactor'],
    ),
  };
  await expect(upgradeEndeavourFieldTargets.run(request({ ...threeTargets, fuelled: true })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(upgradeEndeavourFieldTargets.run(request(threeTargets)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();

  const session = mock.documents.get('sessions/s1')!;
  session.shuttleFuelled = { endeavour: true };
  session.shipResources = {
    shepherd: { ore: 0, fuel: 4, food: 10, water: 8, materials: 20, securityTeams: 2 },
    aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 30, securityTeams: 9 },
    quellon: { ore: 0, fuel: 3, food: 10, water: 8, materials: 20, securityTeams: 2 },
  };
  const fourTargets = {
    ...threeTargets,
    targets: targets(
      ['shepherd', 'reactor'], ['aegis', 'reactor'], ['quellon', 'reactor'],
      ['aegis', 'jump-drive'],
    ),
  };
  await expect(upgradeEndeavourFieldTargets.run(request(fourTargets))).resolves.toMatchObject({
    appliedTargets: [{}, {}, {}, {}],
  });
  const writesAfterFourTargets = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(upgradeEndeavourFieldTargets.run(request({
    ...fourTargets,
    requestId: 'upgrade-over-four',
    expectedUpgradeRevision: 1,
    targets: targets(
      ['shepherd', 'reactor'], ['aegis', 'reactor'], ['quellon', 'reactor'],
      ['aegis', 'jump-drive'], ['shepherd', 'jump-drive'],
    ),
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writesAfterFourTargets);
});

it('rejects a non-holder, a target outside the holder fleet, and a missing docking without writes', async () => {
  await expect(upgradeEndeavourFieldTargets.run(request(command, 'intruder')))
    .rejects.toMatchObject({ code: 'permission-denied' });

  const group = mock.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  group.vesselIds = ['shepherd'];
  await expect(upgradeEndeavourFieldTargets.run(request({
    ...command, requestId: 'outside-group', targets: targets(['aegis', 'reactor']),
  }))).rejects.toMatchObject({ code: 'permission-denied' });

  group.vesselIds = ['shepherd', 'aegis', 'quellon'];
  const session = mock.documents.get('sessions/s1')!;
  session.shuttleDockings = [];
  await expect(upgradeEndeavourFieldTargets.run(request({ ...command, requestId: 'undocked' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('requires the live Coordination phase and refuses forged target costs', async () => {
  const session = mock.documents.get('sessions/s1')!;
  (session.turnPhase as Fields).airspace = { state: 'restricted', tickerActive: true, pressAccess: false };
  await expect(upgradeEndeavourFieldTargets.run(request({ ...command, requestId: 'team-phase' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  (session.turnPhase as Fields).airspace = { state: 'lifted', tickerActive: true, pressAccess: true };
  await expect(upgradeEndeavourFieldTargets.run(request({
    ...command,
    requestId: 'forged-cost',
    targets: [{ shipId: 'shepherd', systemId: 'reactor', materialCost: 0 }],
  }))) .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('replays the exact command once without charging again', async () => {
  await upgradeEndeavourFieldTargets.run(request(command));
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  const session = mock.documents.get('sessions/s1')!;
  session.phase = 'debrief';
  await expect(upgradeEndeavourFieldTargets.run(request(command))).resolves.toMatchObject({
    status: 'replayed', upgradeRevision: 1,
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
  await expect(upgradeEndeavourFieldTargets.run(request({
    ...command,
    targets: targets(['shepherd', 'reactor']),
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});
