import { beforeEach, expect, it } from 'vitest';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { craftStartingManifestForSetup, roleOwnedCraftManifestForSetup } from './craftOwnership';
import { initialShuttleDockingsForRoles, initialShuttleVisitsForDockings } from './shuttlecraft';
import { createUnionCraftStartingHostHandler } from './unionCraftSetupCallable';

const roles = ['admiral', 'wing-commander', 'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker'];
const setup = { activeRoleIds: roles, activeVesselIds: ['aegis', 'quellon', 'refinery-124', 'shepherd', 'icebreaker'], vesselMode: 'core' };
let docs: Record<string, Record<string, unknown>>;
let writes: Array<{ path: string; data: Record<string, unknown> }>;
const snapshot = (path: string) => ({ exists: !!docs[path], get: (key: string) => docs[path]?.[key], data: () => docs[path] }) as DocumentSnapshot;
const db = { doc: (path: string) => path, runTransaction: async (fn: (tx: unknown) => unknown) => fn({
  get: async (path: string) => snapshot(path),
  update: (path: string, data: Record<string, unknown>) => { writes.push({ path, data }); docs[path] = { ...docs[path], ...data }; },
  set: (path: string, data: Record<string, unknown>) => { writes.push({ path, data }); docs[path] = data; },
}) } as unknown as Firestore;
const handler = createUnionCraftStartingHostHandler({ db,
  requireUid: auth => { if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in'); return auth.uid; },
  requireFacilitatorInstance: async (tx: Transaction, sessionId: string, uid: string, instanceId: string) => {
    const session = await tx.get(db.doc(`sessions/${sessionId}`));
    const player = await tx.get(db.doc(`sessions/${sessionId}/players/${uid}`));
    const instance = await tx.get(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`));
    if (!session.exists) throw new HttpsError('not-found', 'No session');
    if (player.get('role') !== 'gm' || player.get('kickedAt') || instance.get('uid') !== uid || instance.get('connected') !== true)
      throw new HttpsError('permission-denied', 'Live GM only');
    return { session, player, instance };
  },
  requireCastingWindow: session => { if (!['lobby', 'casting'].includes(String(session.get('phase'))) || session.get('configurationLocked'))
    throw new HttpsError('failed-precondition', 'Casting closed'); },
  setupForSession: () => setup, serverTimestamp: () => 'server-time',
});
const request = (overrides = {}, uid = 'gm') => ({ auth: { uid }, data: {
  sessionId: 's1', instanceId: 'bridge', requestId: 'host1', expectedSetupRevision: 4,
  craftId: 'wobbly', hostShipId: 'quellon', ...overrides,
} });
beforeEach(() => {
  const dockings = initialShuttleDockingsForRoles(roles);
  docs = {
    'sessions/s1': { phase: 'casting', setupConfirmed: true, setupRevision: 4, currentTurn: 0,
      activeRoleIds: roles, shuttleDockings: dockings, shuttleVisitLog: initialShuttleVisitsForDockings(dockings) },
    'sessions/s1/players/gm': { role: 'gm' }, 'sessions/s1/players/player': { role: 'player' },
    'sessions/s1/gmInstances/bridge': { uid: 'gm', connected: true },
    'sessions/s1/craftOwnership/manifest': { ...roleOwnedCraftManifestForSetup(roles, 'core'),
      startingCraft: craftStartingManifestForSetup(roles, 'core', dockings), setupRevision: 4 },
  }; writes = [];
});
it('establishes both explicit hosts, preserves standard craft and lets normal start derive owner control', async () => {
  const first = await handler(request());
  expect(first).toMatchObject({ status: 'committed', sessionId: 's1', requestId: 'host1', setupRevision: 5, craftId: 'wobbly', hostShipId: 'quellon' });
  await handler(request({ craftId: 'ally', hostShipId: 'shepherd', requestId: 'host2', expectedSetupRevision: 5 }));
  const session = docs['sessions/s1']!;
  expect(session.setupRevision).toBe(6);
  expect(session.shuttleDockings).toEqual([...initialShuttleDockingsForRoles(roles),
    { shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'SESSION START' },
    { shuttleId: 'ally', shipId: 'shepherd', dockedAt: 'SESSION START' }]);
  expect(session.shuttleControl).toBeUndefined();
  const manifest = docs['sessions/s1/craftOwnership/manifest']!;
  expect(manifest.startingCraft).toEqual(craftStartingManifestForSetup(roles, 'core', session.shuttleDockings as { shuttleId: string; shipId: string }[]));
  expect(manifest.setupRevision).toBe(6);
});
it('replays the exact receipt without revision, docking or history duplication, and permits a new pre-start choice', async () => {
  const reply = await handler(request()); const count = writes.length;
  expect(await handler(request())).toEqual(reply); expect(writes).toHaveLength(count);
  await handler(request({ expectedSetupRevision: 5, requestId: 'host2', hostShipId: 'refinery-124' }));
  expect((docs['sessions/s1']!.shuttleDockings as { shuttleId: string; shipId: string }[]).filter(d => d.shuttleId === 'wobbly'))
    .toEqual([{ shuttleId: 'wobbly', shipId: 'refinery-124', dockedAt: 'SESSION START' }]);
  expect((docs['sessions/s1']!.shuttleVisitLog as { shuttleId: string; shipId: string }[]).filter(d => d.shuttleId === 'wobbly'))
    .toEqual([expect.objectContaining({ shipId: 'refinery-124', occurredAt: 'SESSION START' })]);
});
it('requires current GM instance authority before any receipt replay', async () => {
  await handler(request()); const count = writes.length;
  for (const uid of ['player', 'stranger']) await expect(handler(request({}, uid))).rejects.toMatchObject({ code: 'permission-denied' });
  docs['sessions/s1/gmInstances/bridge']!.connected = false;
  await expect(handler(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(writes).toHaveLength(count);
});
it('denies stale setup, request collisions, non-paired hosts, disabled roles and closed setup without writes', async () => {
  for (const input of [{ expectedSetupRevision: 3 }, { hostShipId: 'aegis' }, { craftId: 'pallas' }, { ownerUid: 'attacker' }])
    await expect(handler(request(input))).rejects.toBeDefined();
  const originalRoles = setup.activeRoleIds; setup.activeRoleIds = [];
  await expect(handler(request())).rejects.toMatchObject({ code: 'failed-precondition' }); setup.activeRoleIds = originalRoles;
  for (const change of [{ phase: 'active' }, { setupConfirmed: false }, { configurationLocked: true }, { currentTurn: 1 }]) {
    const before = { ...docs['sessions/s1'] }; Object.assign(docs['sessions/s1']!, change);
    await expect(handler(request())).rejects.toMatchObject({ code: 'failed-precondition' }); docs['sessions/s1'] = before;
  }
  expect(writes).toHaveLength(0);
  await handler(request()); const count = writes.length;
  await expect(handler(request({ hostShipId: 'refinery-124' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(writes).toHaveLength(count);
});
it('rejects malformed current docking or ownership manifests without repairing unrelated authority', async () => {
  docs['sessions/s1']!.shuttleDockings = [{ shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'SESSION START' },
    { shuttleId: 'wobbly', shipId: 'refinery-124', dockedAt: 'SESSION START' }];
  await expect(handler(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  docs['sessions/s1']!.shuttleDockings = initialShuttleDockingsForRoles(roles);
  docs['sessions/s1/craftOwnership/manifest']!.roleOwnedCraft = [];
  await expect(handler(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(writes).toHaveLength(0);
});
