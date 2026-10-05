import { beforeEach, expect, it, vi } from 'vitest';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { createCurrentMemberSessionReader } from './memberSessionCallable';

// Native transaction stand-ins only; no Firebase reads or gameplay evidence.
let records: Record<string, Record<string, unknown>>;
const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: Boolean(records[path]),
  data: () => records[path], get: (key: string) => records[path]?.[key] });
const reads: string[] = [];
const writes = vi.fn();
const transaction = { get: async ({ path, collection }: { path: string; collection?: boolean }) => {
  reads.push(path);
  return collection ? { docs: Object.keys(records).filter(key => key.startsWith(`${path}/`) &&
    !key.slice(path.length + 1).includes('/')).map(snapshot) } : snapshot(path);
}, set: writes, update: writes, delete: writes };
const runTransaction = vi.fn(async (read: (tx: unknown) => unknown) => read(transaction));
const db = { doc: (path: string) => ({ path }), collection: (path: string) => ({ path, collection: true }),
  runTransaction } as unknown as Firestore;
const projectSession = (source: DocumentSnapshot, sessionId: string) => ({ ...source.data(), id: sessionId });
const read = createCurrentMemberSessionReader({ db, projectSession });
const request = { auth: { uid: 'u1' }, data: { sessionId: 's1' } };
const authority = (change = {}) => ({ sessionId: 's1', actorUid: 'u1', groupId: 'fleet-2',
  role: 'player', connectionGeneration: 4, assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
  replacementRoleId: null, replacementStatus: null, shipId: 'shepherd', ...change });

beforeEach(() => {
  reads.length = 0; writes.mockClear(); runTransaction.mockClear();
  records = {
    'sessions/s1': { name: 'Native', phase: 'active', currentTurn: 2, activeVesselIds: ['aegis', 'shepherd', 'icebreaker'] },
    'sessions/s1/players/u1': { connected: true, role: 'player', fleetGroupId: 'fleet-2', connectionGeneration: 4,
      assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain', replacementRoleId: null, replacementStatus: null },
    'sessions/s1/fleetGroups/fleet-1': { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u3'], memberShipIds: { u3: 'aegis' } },
    'sessions/s1/fleetGroups/fleet-2': { id: 'fleet-2', vesselIds: ['shepherd', 'icebreaker'], memberUids: ['u1', 'u2'],
      memberShipIds: { u1: 'shepherd', u2: 'icebreaker' } },
  };
});

it('derives only the authenticated current berth from the existing atomic read, not historical assigned vessel', async () => {
  const response = await read(request);
  expect(response).toHaveProperty('currentActorBerthAuthority', authority());
  expect(response).not.toHaveProperty('memberShipIds');
  expect(response.session).not.toHaveProperty('memberShipIds');
  expect(JSON.stringify(response)).not.toContain('u2');
  expect(JSON.stringify(response)).not.toContain('u3');
  expect(reads).toHaveLength(6);
  expect(writes).not.toHaveBeenCalled();
  expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), { readOnly: true });
});

it.each([
  ['joint-engineering-shepherd-icebreaker', 'shepherd', ['shepherd', 'icebreaker']],
  ['joint-engineering-quellon-refinery', 'refinery-124', ['quellon', 'refinery-124']],
] as const)('binds a legitimate current berth for %s without inventing a station ship', async (roleId, shipId, vesselIds) => {
  Object.assign(records['sessions/s1/players/u1']!, { assignedRoleId: roleId, activeConsoleRoleId: roleId });
  Object.assign(records['sessions/s1/fleetGroups/fleet-2']!, { vesselIds, memberShipIds: { u1: shipId, u2: vesselIds[0] } });
  expect(await read(request)).toHaveProperty('currentActorBerthAuthority', authority({ assignedRoleId: roleId, activeConsoleRoleId: roleId, shipId }));
});

it('includes current replacement and active-console truth without a persistent projection refresh', async () => {
  Object.assign(records['sessions/s1/players/u1']!, { replacementRoleId: 'comms-officer', activeConsoleRoleId: null });
  expect(await read(request)).toHaveProperty('currentActorBerthAuthority', authority({ replacementRoleId: 'comms-officer', activeConsoleRoleId: null }));
  Object.assign(records['sessions/s1/players/u1']!, { connectionGeneration: 5, replacementRoleId: 'warrior-captain' });
  records['sessions/s1/fleetGroups/fleet-2']!.memberShipIds = { u1: 'icebreaker', u2: 'shepherd' };
  expect(await read(request)).toHaveProperty('currentActorBerthAuthority', authority({ connectionGeneration: 5,
    replacementRoleId: 'warrior-captain', activeConsoleRoleId: null, shipId: 'icebreaker' }));
  expect(writes).not.toHaveBeenCalled();
});

it.each([
  { replacementStatus: 'awaiting-re-role' },
  { activeConsoleRoleId: 'press-officer', assignedRoleId: null },
  { connectionGeneration: 0 },
  { connectionGeneration: '4' },
])('present current-berth authority cannot widen an ineligible actor: %j', async change => {
  Object.assign(records['sessions/s1/players/u1']!, change);
  expect(await read(request)).toHaveProperty('currentActorBerthAuthority', null);
});

it('does not substitute a historical role for a missing current actor berth', async () => {
  records['sessions/s1/fleetGroups/fleet-2']!.memberShipIds = { u2: 'icebreaker' };
  expect(await read(request)).toHaveProperty('currentActorBerthAuthority', null);
});

it('keeps legacy absent-map behavior and never accepts a caller-selected berth', async () => {
  delete records['sessions/s1/fleetGroups/fleet-2']!.memberShipIds;
  expect(await read(request)).not.toHaveProperty('currentActorBerthAuthority');
  await expect(read({ ...request, data: { ...request.data, shipId: 'aegis' } })).rejects.toMatchObject({ code: 'invalid-argument' });
});

it('omits current operational berth authority from disconnected immutable closed history', async () => {
  records['sessions/s1']!.phase = 'closed';
  records['sessions/s1/players/u1']!.connected = false;
  expect(await read(request)).not.toHaveProperty('currentActorBerthAuthority');
});
