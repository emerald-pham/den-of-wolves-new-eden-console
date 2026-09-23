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
  return { documents, get, set, update, db: { doc: ref, runTransaction } };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    toDate() { return this.value; }
  },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({
    run: maybeHandler ?? optionsOrHandler,
  }),
}));

import { repairConsolesFromAlly } from './allyRepairCallable';

const command = {
  sessionId: 's1', requestId: 'ally-repair-1', expectedControlRevision: 2,
  expectedRepairRevision: 0, expectedCycle: 3, expectedHostShipId: 'shepherd',
  systemIds: ['reactor', 'storage'],
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });
const baseSession = () => ({
  phase: 'active', currentTurn: 3,
  activeRoleIds: ['joint-engineering-shepherd-icebreaker'],
  activeVesselIds: ['shepherd', 'icebreaker'],
  turnPhase: {
    turn: 3, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
    openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
  shuttleDockings: [{ shuttleId: 'ally', shipId: 'shepherd', dockedAt: 'facilitator-set' }],
  shuttleControl: { ally: {
    shuttleId: 'ally', ownerRoleId: 'joint-engineering-shepherd-icebreaker',
    ownerUid: 'union-owner', holderUid: 'holder', revision: 2,
  } },
  shuttleFuelled: { ally: true },
  shipDamage: {
    shepherd: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false },
    icebreaker: { damagedSystemIds: ['reactor', 'storage'], destroyed: false },
  },
  shipResources: {
    shepherd: { ore: 0, fuel: 4, food: 10, water: 8, materials: 12, securityTeams: 2 },
    icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 8, securityTeams: 2 },
  },
});
const basePlayer = () => ({
  role: 'player', connected: true, assignedRoleId: 'joint-engineering-shepherd-icebreaker',
  activeConsoleRoleId: 'joint-engineering-shepherd-icebreaker', fleetGroupId: 'fleet-1',
});
const baseGroup = () => ({
  id: 'fleet-1', vesselIds: ['shepherd', 'icebreaker'], memberUids: ['holder'],
});
const resetFixture = () => {
  mock.documents.clear();
  mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear(); mock.db.runTransaction.mockClear();
  put('sessions/s1', baseSession());
  put('sessions/s1/players/holder', basePlayer());
  put('sessions/s1/fleetGroups/fleet-1', baseGroup());
};

beforeEach(resetFixture);

it('atomically repairs the facilitator-set Ally host, exposes only the outcome, and replays once', async () => {
  await expect(repairConsolesFromAlly.run(request(command))).resolves.toEqual({
    status: 'committed', sessionId: 's1', requestId: 'ally-repair-1', shuttleId: 'ally',
    hostShipId: 'shepherd', systemIds: ['reactor', 'storage'], materialsRemaining: 4,
    cycle: 3, repairRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipDamage: { shepherd: { damagedSystemIds: ['jump-drive'], destroyed: false } },
    shipResources: { shepherd: { materials: 4 } },
    allyRepairs: { cycle: 3, revision: 1, hosts: [{ shipId: 'shepherd', systemIds: ['reactor', 'storage'] }] },
  });
  const receipt = mock.documents.get('sessions/s1/commandReceipts/ally-repair-1');
  expect(receipt?.fingerprint).toMatchObject({ action: 'ally-repair', actorUid: 'holder' });
  expect(receipt?.result).not.toHaveProperty('ownerUid');
  expect(receipt?.result).not.toHaveProperty('holderUid');
  expect(receipt?.result).not.toHaveProperty('fleetGroupId');
  expect(mock.documents.get('sessions/s1/events/ally-repair-ally-repair-1')).toMatchObject({
    type: 'ally-repair',
    visibility: 'member',
    shuttleId: 'ally', hostShipId: 'shepherd',
    systemIds: ['reactor', 'storage'], materialsSpent: 8,
  });
  expect(mock.documents.get('sessions/s1/events/ally-repair-ally-repair-1'))
    .not.toHaveProperty('actorUid');

  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  (mock.documents.get('sessions/s1') as Fields).phase = 'debrief';
  await expect(repairConsolesFromAlly.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('canonicalizes selection order into a stable receipt fingerprint', async () => {
  const reverse = { ...command, requestId: 'ally-repair-reverse', systemIds: ['storage', 'reactor'] };
  await expect(repairConsolesFromAlly.run(request(reverse))).resolves.toMatchObject({
    status: 'committed', systemIds: ['reactor', 'storage'], repairRevision: 1,
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(repairConsolesFromAlly.run(request(reverse))).resolves.toMatchObject({
    status: 'replayed', systemIds: ['reactor', 'storage'], repairRevision: 1,
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('requires server-recorded Ally fuel for a second Union ship', async () => {
  await repairConsolesFromAlly.run(request({ ...command, systemIds: ['reactor'] }));
  const session = mock.documents.get('sessions/s1')!;
  session.shuttleDockings = [{ shuttleId: 'ally', shipId: 'icebreaker', dockedAt: 'later' }];
  session.shuttleFuelled = { ally: false };
  const secondHost = {
    ...command, requestId: 'ally-second-host', expectedRepairRevision: 1,
    expectedHostShipId: 'icebreaker', systemIds: ['storage'],
  };
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(repairConsolesFromAlly.run(request(secondHost)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
  session.shuttleFuelled = { ally: true };
  await expect(repairConsolesFromAlly.run(request(secondHost))).resolves.toMatchObject({
    status: 'committed', shuttleId: 'ally', hostShipId: 'icebreaker', repairRevision: 2,
  });
});

it.each([
  ['copied craft field', { request: { shuttleId: 'philia' }, code: 'invalid-argument' }],
  ['wrong active role', { player: { assignedRoleId: 'dione-engineer' }, code: 'permission-denied' }],
  ['removed Union role', { session: { activeRoleIds: ['dione-engineer'] }, code: 'permission-denied' }],
  ['wrong Ally holder', { session: { shuttleControl: { ally: {
    shuttleId: 'ally', ownerRoleId: 'joint-engineering-shepherd-icebreaker',
    ownerUid: 'union-owner', holderUid: 'someone-else', revision: 2,
  } } }, code: 'permission-denied' }],
  ['copied Philia identity under Ally key', { session: { shuttleControl: { ally: {
    shuttleId: 'philia', ownerRoleId: 'dione-engineer', ownerUid: 'owner', holderUid: 'holder', revision: 2,
  } } }, code: 'permission-denied' }],
  ['host outside Union pairing', { session: { shuttleDockings: [{ shuttleId: 'ally', shipId: 'dione', dockedAt: 'bad' }] } }],
  ['host outside fleet group', { group: { vesselIds: ['icebreaker'] }, code: 'permission-denied' }],
  ['stale host expectation', { request: { expectedHostShipId: 'icebreaker' } }],
  ['stale control revision', { request: { expectedControlRevision: 1 } }],
  ['stale repair revision', { request: { expectedRepairRevision: 1 } }],
  ['missing live coordination window', { session: { turnPhase: { state: 'restricted' } } }],
  ['malformed server fuel', { session: { shuttleFuelled: { ally: 'yes' } } }],
  ['malformed server repair history', { session: { allyRepairs: { cycle: 3, revision: -1, hosts: [] } } }],
  ['unknown host damage-deck id', { request: { systemIds: ['not-a-damage-card'] } }],
] as const)('rejects %s before writing', async (_label, change) => {
  const session = mock.documents.get('sessions/s1')!;
  const player = mock.documents.get('sessions/s1/players/holder')!;
  const group = mock.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  const requestData = { ...command };
  if ('session' in change) Object.assign(session, change.session);
  if ('player' in change) Object.assign(player, change.player);
  if ('group' in change) Object.assign(group, change.group);
  if ('request' in change) Object.assign(requestData, change.request);
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(repairConsolesFromAlly.run(request(requestData))).rejects.toMatchObject({
    code: 'code' in change ? change.code : 'failed-precondition',
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('rejects cross-action receipts and legacy request namespaces before mutation', async () => {
  put('sessions/s1/commandReceipts/ally-repair-1', {
    fingerprint: {
      action: 'philia-repair', sessionId: 's1', requestId: 'ally-repair-1', actorUid: 'holder',
      instanceId: null, expectedRevision: 0, payload: {},
    },
    result: {},
  });
  await expect(repairConsolesFromAlly.run(request(command)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.delete('sessions/s1/commandReceipts/ally-repair-1');
  put('sessions/s1/events/setup-confirm-ally-repair-1', { legacy: true });
  await expect(repairConsolesFromAlly.run(request(command)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects an unbound Ally repair event without revealing it through a replay', async () => {
  put('sessions/s1/events/ally-repair-ally-repair-1', { type: 'ally-repair', actorUid: 'holder' });
  await expect(repairConsolesFromAlly.run(request(command)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});
