import { beforeEach, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createCurrentMemberSessionReader } from './memberSessionCallable';

let records: Record<string, Record<string, unknown>>;
const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: !!records[path],
  data: () => records[path], get: (key: string) => records[path]?.[key] });
const db = { doc: (path: string) => ({ path }), collection: (path: string) => ({ path, collection: true }),
  runTransaction: async (read: (tx: unknown) => unknown) => read({ get: async ({ path, collection }: { path: string; collection?: boolean }) =>
    collection ? { docs: Object.keys(records).filter(key => key.startsWith(path + '/') && key.slice(path.length + 1).indexOf('/') < 0).map(snapshot) }
      : snapshot(path) }),
} as unknown as Firestore;
const read = createCurrentMemberSessionReader({ db });
const request = (data: Record<string, unknown> = { sessionId: 's1' }, uid = 'u1') => ({ auth: { uid }, data });
beforeEach(() => {
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
