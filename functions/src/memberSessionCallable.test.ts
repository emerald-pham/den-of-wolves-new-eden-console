import { beforeEach, expect, it, vi } from 'vitest';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { createCurrentMemberSessionReader } from './memberSessionCallable';

let records: Record<string, Record<string, unknown>>;
const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: !!records[path],
  data: () => records[path], get: (key: string) => records[path]?.[key] });
const db = { doc: (path: string) => ({ path }), collection: (path: string) => ({ path, collection: true }),
  runTransaction: async (read: (tx: unknown) => unknown) => read({ get: async ({ path, collection }: { path: string; collection?: boolean }) =>
    collection ? { docs: Object.keys(records).filter(key => key.startsWith(path + '/') && key.slice(path.length + 1).indexOf('/') < 0).map(snapshot) }
      : snapshot(path) }),
} as unknown as Firestore;
// These fixtures already represent parsed public operational values; this suite
// isolates the transactional audience selector from the production index parser.
const projectSession = vi.fn((source: DocumentSnapshot, sessionId: string) => ({ ...source.data(), id: sessionId }));
const read = createCurrentMemberSessionReader({ db, projectSession });
const request = (data: Record<string, unknown> = { sessionId: 's1' }, uid = 'u1') => ({ auth: { uid }, data });
beforeEach(() => {
  projectSession.mockClear();
  projectSession.mockImplementation((source, sessionId) => ({ ...source.data(), id: sessionId }));
  records = {
    'sessions/s1': { name: 'Table', phase: 'active', currentTurn: 2, activeVesselIds: ['aegis', 'shepherd'],
      turnPhase: { turn: 2 }, shipResources: { aegis: { fuel: 90 }, shepherd: { fuel: 3 } },
      missionCraftCommitments: { hidden: 'mission-card' },
      shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis' }, { shuttleId: 'endeavour', shipId: 'shepherd' }] },
    'sessions/s1/players/u1': { connected: true, role: 'player', fleetGroupId: 'fleet-2', connectionGeneration: 4,
      assignedRoleId: 'shepherd-captain', activeConsoleRoleId: 'shepherd-captain' },
    'sessions/s1/fleetGroups/fleet-1': { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u2'] },
    'sessions/s1/fleetGroups/fleet-2': { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['u1'] },
  };
});
it('reads live membership and state atomically with no caller-selected audience', async () => {
  const value = await read(request());
  expect(value).toMatchObject({ type: 'current-member-session', sessionId: 's1', actorUid: 'u1',
    groupId: 'fleet-2', connectionGeneration: 4, assignedRoleId: 'shepherd-captain' });
  expect(value.session.shipResources).toEqual({ shepherd: { fuel: 3 } });
  expect(value.session).not.toHaveProperty('missionCraftCommitments');
  await expect(read(request({ sessionId: 's1', groupId: 'fleet-1' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(read(request({ sessionId: 's1', viewerShipId: 'aegis' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
it('denies wrong actor, disconnected actor, kicked actor and malformed membership', async () => {
  await expect(read(request(undefined, 'stranger'))).rejects.toMatchObject({ code: 'permission-denied' });
  for (const patch of [{ connected: false }, { kickedAt: 'now' }, { fleetGroupId: 'fleet-1' }]) {
    const previous = records['sessions/s1/players/u1']!;
    records['sessions/s1/players/u1'] = { ...previous, ...patch };
    await expect(read(request())).rejects.toMatchObject({ code: 'permission-denied' });
    records['sessions/s1/players/u1'] = previous;
  }
});
it('tracks actual craft group while in transit and removes it after foreign arrival', async () => {
  records['sessions/s1']!.shuttleDockings = [{ shuttleId: 'endeavour', shipId: 'aegis' }];
  records['sessions/s1']!.shuttleControl = { endeavour: { holderUid: 'u1' } };
  records['sessions/s1/shuttleDepartures/endeavour'] = { shuttleId: 'endeavour', status: 'in-transit', fleetGroupId: 'fleet-2' };
  expect((await read(request())).session.shuttleControl).toEqual({ endeavour: { holderUid: 'u1' } });
  records['sessions/s1/shuttleDepartures/endeavour']!.status = 'completed';
  expect((await read(request())).session.shuttleControl).toEqual({});
});

it('keeps only the current Press holder’s own SNN operations through docking and transit', async () => {
  const actor = records['sessions/s1/players/u1']!;
  Object.assign(actor, { assignedRoleId: null, activeConsoleRoleId: 'press-officer' });
  const snn = { shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: 'u1', holderUid: 'u1', revision: 1 };
  Object.assign(records['sessions/s1']!, {
    pressEnabled: true, pressHolderUid: 'u1',
    shuttleControl: { 'snn-press-shuttle': snn, starlight: { holderUid: 'u2' } },
    shuttleCargo: { 'snn-press-shuttle': { fuel: 1 }, starlight: { fuel: 99 } },
    shuttleFuelled: { 'snn-press-shuttle': true, starlight: true },
    shuttleDockings: [{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'now' },
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'now' }],
    shuttleVisitLog: [{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', id: 'own-visit' },
      { shuttleId: 'starlight', shipId: 'aegis', id: 'foreign-visit' }],
  });
  const docked = (await read(request())).session;
  expect(docked.shipResources).toEqual({});
  expect(docked.shuttleControl).toEqual({ 'snn-press-shuttle': snn });
  expect(docked.shuttleCargo).toEqual({ 'snn-press-shuttle': { fuel: 1 } });
  expect(docked.shuttleFuelled).toEqual({ 'snn-press-shuttle': true });
  expect(docked.shuttleDockings).toEqual([{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'now' }]);
  expect(docked.shuttleVisitLog).toEqual([{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', id: 'own-visit' }]);
  records['sessions/s1']!.shuttleDockings = [];
  records['sessions/s1/shuttleDepartures/snn-press-shuttle'] = { shuttleId: 'snn-press-shuttle', status: 'in-transit', fleetGroupId: 'fleet-1' };
  expect((await read(request())).session.shuttleControl).toEqual({ 'snn-press-shuttle': snn });
  for (const change of [{ pressHolderUid: 'u2' }, { pressEnabled: false },
    { shuttleControl: { 'snn-press-shuttle': { ...snn, holderUid: 'u2' } } }]) {
    const previous = { ...records['sessions/s1'] };
    Object.assign(records['sessions/s1']!, change);
    expect((await read(request())).session.shuttleControl).toEqual({});
    records['sessions/s1'] = previous;
  }
});


it('uses the required public parser on the same transaction snapshot instead of spreading the stored root', async () => {
  projectSession.mockImplementation((_source, sessionId) => ({ id: sessionId, phase: 'active',
    activeVesselIds: ['aegis', 'shepherd'], shipResources: { shepherd: { fuel: 3 } } }));
  records['sessions/s1']!.fleetTicker = { internal: 'server-private' };
  const response = await read(request());
  expect(projectSession).toHaveBeenCalledWith(expect.objectContaining({ exists: true }), 's1');
  expect(response.session.shipResources).toEqual({ shepherd: { fuel: 3 } });
  expect(response.session).not.toHaveProperty('fleetTicker');
  expect(response.session).not.toHaveProperty('missionCraftCommitments');
});
