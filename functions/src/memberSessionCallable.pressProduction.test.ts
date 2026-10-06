import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

// Existing Functions native fixture pattern. index.ts's real callable, limiter,
// publicMemberSessionSource and final projection run; all external SDKs are stand-ins.
type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return { exists: fields !== undefined, id: path.split('/').at(-1) ?? '', ref: ref(path),
      get: (field: string) => fields?.[field], data: () => fields };
  };
  const get = vi.fn(async (target: { path: string; collection?: boolean }) => target.collection
    ? { docs: [...documents.keys()].filter(path => path.startsWith(`${target.path}/`) &&
      !path.slice(target.path.length + 1).includes('/')).map(snapshot) } : snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path,
    { ...documents.get(target.path), ...fields }));
  const runTransaction = vi.fn(async (read: (tx: unknown) => unknown) => read({ get, set, update }));
  return { documents, get, set, update, runTransaction,
    db: { doc: ref, collection: (path: string) => ({ ...ref(path), collection: true }), runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    static now() { return new MockTimestamp(new Date()); }
    static fromDate(value: Date) { return new MockTimestamp(value); }
    static fromMillis(value: number) { return new MockTimestamp(new Date(value)); }
    toDate() { return this.value; }
    toMillis() { return this.value.getTime(); }
  },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
  },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({ run: maybeHandler ?? optionsOrHandler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/logger', () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));

import { getCurrentMemberSession } from './index';
const request = (uid = 'press') => ({ auth: { uid }, data: { sessionId: 's1' } }) as CallableRequest<Fields>;
const snn = { shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: 'press', holderUid: 'press', revision: 0 };

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear(); mock.runTransaction.mockClear();
  mock.documents.set('sessions/s1', { name: 'Native Press', joinCode: '123456', phase: 'active', currentTurn: 2,
    chartId: 'A', expansion: 'base', activeRoleIds: ['wing-commander', 'shepherd-captain', 'press-officer'],
    activeVesselIds: ['aegis', 'shepherd'], pressEnabled: true, pressHolderUid: 'press',
    shuttleControl: { 'snn-press-shuttle': snn, starlight: {
      shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'foreign', holderUid: 'foreign', revision: 0,
    } },
    shuttleDockings: [{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
    shuttleCargo: { 'snn-press-shuttle': { fuel: 1 }, starlight: { fuel: 99 } },
    shipResources: { aegis: { fuel: 80 }, shepherd: { fuel: 70 } },
    loyalty: { private: 'never-public' }, fleetTicker: { private: 'never-public' } });
  mock.documents.set('sessions/s1/players/press', { connected: true, role: 'player', fleetGroupId: 'fleet-1',
    assignedRoleId: null, activeConsoleRoleId: 'press-officer', connectionGeneration: 4 });
  mock.documents.set('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['press'],
    memberShipIds: { press: 'aegis' } });
  mock.documents.set('sessions/s1/fleetGroups/fleet-2', { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['foreign'],
    memberShipIds: { foreign: 'shepherd' } });
});

it('production final Press scope already includes OWN SNN before its first departure', async () => {
  expect(mock.documents.has('sessions/s1/shuttleDepartures/snn-press-shuttle')).toBe(false);
  const value = await getCurrentMemberSession.run(request());
  expect(value).toMatchObject({ type: 'current-member-session', actorUid: 'press', groupId: 'fleet-1',
    session: { memberSessionScope: { groupId: 'fleet-1', vesselIds: [], craftIds: ['snn-press-shuttle'] },
      shuttleControl: { 'snn-press-shuttle': snn }, shipResources: {} } });
  expect(JSON.stringify(value)).not.toMatch(/memberShipIds|never-public|"starlight"|"fuel":99/);
});

it.each([
  ['nonholder', { pressHolderUid: 'foreign' }, {}],
  ['disabled', { pressEnabled: false }, {}],
  ['released control', { shuttleControl: { 'snn-press-shuttle': { ...snn, holderUid: 'foreign' } } }, {}],
  ['wrong control role', { shuttleControl: { 'snn-press-shuttle': { ...snn, ownerRoleId: 'wing-commander' } } }, {}],
  ['malformed control', { shuttleControl: { 'snn-press-shuttle': { ...snn, revision: -1 } } }, {}],
] as const)('production parser preserves absent Press craft audience for %s', async (_label, sessionPatch, actorPatch) => {
  Object.assign(mock.documents.get('sessions/s1')!, sessionPatch);
  Object.assign(mock.documents.get('sessions/s1/players/press')!, actorPatch);
  const value = await getCurrentMemberSession.run(request());
  expect(value).toMatchObject({ session: { memberSessionScope: { vesselIds: [], craftIds: [] }, shuttleControl: {} } });
});

it.each([
  ['disconnected', { connected: false }],
  ['kicked', { kickedAt: 'now' }],
  ['stale group', { fleetGroupId: 'fleet-2' }],
] as const)('production callable denies %s without inventing a Press craft', async (_label, patch) => {
  Object.assign(mock.documents.get('sessions/s1/players/press')!, patch);
  await expect(getCurrentMemberSession.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
});

it('production callable preserves immutable closed history without operational SNN authority', async () => {
  mock.documents.get('sessions/s1')!.phase = 'closed';
  mock.documents.get('sessions/s1/players/press')!.connected = false;
  const value = await getCurrentMemberSession.run(request());
  expect(value).toMatchObject({ session: { phase: 'closed' } });
  expect(value.session).not.toHaveProperty('memberSessionScope');
  expect(value.session).not.toHaveProperty('shuttleControl');
  expect(value).not.toHaveProperty('currentActorBerthAuthority');
});
