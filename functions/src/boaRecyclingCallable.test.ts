import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  boaRecyclingCommandFingerprint,
  isBoaRecyclingCallableReply,
  parseBoaRecyclingCallableCommand,
} from './boaRecyclingCallable';

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

import { recycleWithBoa } from './index';

const command = {
  sessionId: 's1', requestId: 'boa-recycling-1', recipeId: 'food',
  expectedControlRevision: 2, expectedRecyclingRevision: 0,
  expectedCycle: 3, expectedHostShipId: 'aegis',
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

function seedState(): void {
  put('sessions/s1', {
    phase: 'active', currentTurn: 3,
    activeRoleIds: ['capybara-captain', 'capybara-recycler'],
    activeVesselIds: ['capybara', 'aegis'],
    turnPhase: { turn: 3, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
    shuttleDockings: [
      { shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'now' },
      { shuttleId: 'boa', shipId: 'aegis', dockedAt: 'later' },
    ],
    shuttleControl: {
      macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'captain', holderUid: 'captain', revision: 0 },
      boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'holder', holderUid: 'holder', revision: 2 },
    },
    shuttleFuelled: { macaw: false, boa: true },
    shipResources: {
      capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
    },
    shuttleCargo: { boa: { scrap: 3 }, macaw: { scrap: 2 } },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'capybara-recycler', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['capybara', 'aegis'], memberUids: ['holder'],
  });
}

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  seedState();
});

it('parses only a complete printed Boa recycling command and binds replay to the actor', () => {
  expect(parseBoaRecyclingCallableCommand(command)).toEqual(command);
  expect(parseBoaRecyclingCallableCommand({ ...command, unexpected: true })).toBeNull();
  expect(parseBoaRecyclingCallableCommand({ ...command, recipeId: 'securityTeams' })).toBeNull();
  const parsed = parseBoaRecyclingCallableCommand(command)!;
  expect(boaRecyclingCommandFingerprint('holder', parsed)).toMatchObject({
    action: 'boa-recycling', actorUid: 'holder', expectedRevision: 0,
    payload: { recipeId: 'food', expectedCycle: 3, hostShipId: 'aegis' },
  });
});

it('atomically spends the current docked host food, adds one Boa Scrap, records the cycle, and replays once', async () => {
  await expect(recycleWithBoa.run(request(command))).resolves.toMatchObject({
    status: 'committed', shuttleId: 'boa', hostShipId: 'aegis', recipeId: 'food',
    resourceId: 'food', resourceCost: 6, hostResourceRemaining: 2,
    scrapRemaining: 4, cycle: 3, recyclingRevision: 1, exchangesThisCycle: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipResources: {
      capybara: { scrap: 3 },
      aegis: { food: 2, fuel: 4, water: 6, materials: 1, securityTeams: 9 },
    },
    shuttleCargo: { boa: { scrap: 4 }, macaw: { scrap: 2 } },
    boaRecycling: { cycle: 3, revision: 1, exchangesThisCycle: 1 },
  });
  expect(mock.documents.get('sessions/s1/events/boa-recycling-boa-recycling-1')).toMatchObject({
    type: 'boa-recycling', shuttleId: 'boa', hostShipId: 'aegis',
    recipeId: 'food', resourceId: 'food', resourceCost: 6, scrapAwarded: 1,
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(recycleWithBoa.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it.each([
  ['foreign holder', 'stranger', command],
  ['wrong role', 'holder', { ...command, requestId: 'wrong-role', _actorRole: 'capybara-captain' }],
])('rejects %s without mutation', async (_label, uid, data) => {
  if ('_actorRole' in data) {
    mock.documents.get('sessions/s1/players/holder')!.assignedRoleId = 'capybara-captain';
    const clean = Object.fromEntries(Object.entries(data).filter(([key]) => key !== '_actorRole'));
    await expect(recycleWithBoa.run(request(clean, uid))).rejects.toMatchObject({ code: 'permission-denied' });
  } else {
    await expect(recycleWithBoa.run(request(data, uid))).rejects.toMatchObject({ code: 'permission-denied' });
  }
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['fuelled', (session: Fields) => { (session.shuttleFuelled as Fields).boa = false; }],
  ['current host', (session: Fields) => { (session.shuttleDockings as Fields[])[1]!.shipId = 'capybara'; }],
  ['host group', (_session: Fields, group: Fields) => { group.vesselIds = ['capybara']; }],
  ['Coordination window', (session: Fields) => { ((session.turnPhase as Fields).airspace as Fields).state = 'restricted'; }],
  ['recycling quota', (session: Fields) => { session.boaRecycling = { cycle: 3, revision: 2, exchangesThisCycle: 2 }; }],
  ['host balance', (session: Fields) => { ((session.shipResources as Fields).aegis as Fields).food = 5; }],
  ['Boa cargo shape', (session: Fields) => { (session.shuttleCargo as Fields).boa = { food: 1 }; }],
])('fails closed for invalid %s before writing any part of the transaction', async (_label, mutate) => {
  const session = mock.documents.get('sessions/s1')!;
  const group = mock.documents.get('sessions/s1/fleetGroups/fleet-1')!;
  mutate(session, group);
  await expect(recycleWithBoa.run(request(command))).rejects.toMatchObject({
    code: expect.stringMatching(/failed-precondition|permission-denied/),
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects a stale host, control revision, or cycle without moving either inventory', async () => {
  const staleCommands = [
    { ...command, requestId: 'stale-host', expectedHostShipId: 'capybara' },
    { ...command, requestId: 'stale-control', expectedControlRevision: 1 },
    { ...command, requestId: 'stale-cycle', expectedCycle: 2 },
  ];
  for (const stale of staleCommands) {
    await expect(recycleWithBoa.run(request(stale))).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('accepts a reply only when every committed field matches the request fingerprint', () => {
  const fingerprint = boaRecyclingCommandFingerprint('holder', parseBoaRecyclingCallableCommand(command)!);
  const reply = {
    status: 'committed', sessionId: 's1', requestId: command.requestId, shuttleId: 'boa',
    hostShipId: 'aegis', recipeId: 'food', resourceId: 'food', resourceCost: 6,
    hostResourceRemaining: 2, scrapRemaining: 4, cycle: 3,
    recyclingRevision: 1, exchangesThisCycle: 1,
  };
  expect(isBoaRecyclingCallableReply(reply, fingerprint)).toBe(true);
  expect(isBoaRecyclingCallableReply({ ...reply, scrapRemaining: -1 }, fingerprint)).toBe(false);
  expect(isBoaRecyclingCallableReply({ ...reply, hostShipId: 'capybara' }, fingerprint)).toBe(false);
});
