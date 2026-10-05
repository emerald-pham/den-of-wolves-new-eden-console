import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createSessionDebriefCommands } from './sessionDebriefCallable';

type Fields = Record<string, unknown>;
const database = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const updates: { path: string; fields: Fields }[] = [];
  const creates: { path: string; fields: Fields }[] = [];
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const data = documents.get(path);
    return { exists: data !== undefined, id: path.split('/').at(-1) ?? '', ref: ref(path),
      get: (key: string) => data?.[key], data: () => data };
  };
  const tx = {
    get: vi.fn(async (target: { path: string }) => snapshot(target.path)),
    update: vi.fn((target: { path: string }, fields: Fields) => {
      updates.push({ path: target.path, fields });
      documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
    }),
    create: vi.fn((target: { path: string }, fields: Fields) => {
      creates.push({ path: target.path, fields });
      if (documents.has(target.path)) throw new Error('already exists');
      documents.set(target.path, { ...fields });
    }),
  };
  const db = { doc: ref, runTransaction: (callback: (transaction: unknown) => unknown) => callback(tx) };
  return { documents, updates, creates, tx, db };
});

const sessionId = 's1';
const instanceId = 'gm-1';
const base = { sessionId, instanceId, requestId: 'debrief-1' };
const time = '2026-10-05T12:00:00.000Z';
const failure = { type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss', cycle: 8, occurredAt: time };
const survivors = { type: 'survivor-outcome', cycle: 8, occurredAt: time,
  fleetShipPopulation: 100, survivingShipPopulation: 0, evacuatedPopulation: 0,
  escapePodCapacity: 0, lostPopulation: 100, smallVesselPopulation: 0,
  admittedVesselPopulation: 0, finalSurvivors: 0, survivingShipIds: [], lostOrDestroyedShipIds: ['aegis'] };
const handlers = (live = true) => createSessionDebriefCommands({
  db: database.db as unknown as Firestore,
  isLiveGmInstance: () => live,
});
const request = (data: unknown = base, uid = 'u1') => ({ data, auth: { uid } });

function seed(phase: string): void {
  database.documents.set('sessions/s1', { phase, gameOutcome: failure, survivorOutcome: survivors, activeVesselIds: ['aegis'] });
  database.documents.set('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  database.documents.set('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
}

beforeEach(() => {
  database.documents.clear(); database.updates.length = 0; database.creates.length = 0;
  database.tx.get.mockClear(); database.tx.update.mockClear(); database.tx.create.mockClear();
  seed('failure');
});

it('commits an immutable failure debrief through a live GM instance', async () => {
  const result = await handlers().begin(request());
  expect(result).toEqual({ phase: 'debrief', committed: true, cycle: 8, result: 'failure' });
  expect(database.documents.get('sessions/s1')).toMatchObject({ phase: 'debrief', debriefSnapshot: {
    type: 'session-debrief', source: 'failure-review', result: 'failure', cause: 'total-fleet-loss', cycle: 8,
  } });
  expect(database.creates).toHaveLength(1);
});

it('closes only a committed debrief and returns the same receipt for concurrent/replayed close requests', async () => {
  await handlers().begin(request());
  const active = database.documents.get('sessions/s1')!;
  database.documents.set('sessions/s1', { ...active, phase: 'debrief' });
  const frozen = active.debriefSnapshot;
  const close = handlers();
  const first = await close.close(request({ ...base, requestId: 'close-1' }));
  const second = await close.close(request({ ...base, requestId: 'close-2' }));
  expect(first).toEqual({ phase: 'closed', committed: true, cycle: 8, result: 'failure' });
  expect(second).toEqual({ phase: 'closed', committed: false, cycle: 8, result: 'failure' });
  expect(database.documents.get('sessions/s1')).toMatchObject({ phase: 'closed', debriefSnapshot: frozen });
});

it('rejects unsigned, malformed, stale-GM, non-GM, and premature close requests without writes', async () => {
  const call = handlers();
  await expect(call.begin({ data: base })).rejects.toMatchObject({ code: 'unauthenticated' });
  await expect(call.begin(request({ ...base, instanceId: '' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(database.updates).toHaveLength(0);

  const stale = handlers(false);
  await expect(stale.begin(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(database.updates).toHaveLength(0);

  database.documents.set('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true });
  await expect(call.begin(request())).rejects.toMatchObject({ code: 'permission-denied' });
  database.documents.set('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  await expect(call.close(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(database.updates).toHaveLength(0);
});

it('requires the currently live GM for private debrief history', async () => {
  await handlers().begin(request());
  database.documents.set('sessions/s1', { ...database.documents.get('sessions/s1')!, phase: 'closed' });
  const input = { sessionId, instanceId };

  await expect(handlers(false).read(request(input)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  database.documents.set('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true });
  await expect(handlers().read(request(input)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  database.documents.set('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: false });
  await expect(handlers().read(request(input)))
    .rejects.toMatchObject({ code: 'permission-denied' });

  database.documents.set('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  const response = await handlers().read(request(input));
  expect(response).toMatchObject({ type: 'session-debrief', sessionId,
    snapshot: { type: 'session-debrief', result: 'failure', cause: 'total-fleet-loss' } });
  expect(response.snapshot).toHaveProperty('source', 'failure-review');
  expect(response.snapshot).not.toHaveProperty('gmNote');
  expect(response.snapshot.outcome).not.toHaveProperty('sourceId');
});

it('replays the original action receipt before rejecting a fresh terminal action', async () => {
  const call = handlers();
  const original = await call.begin(request());
  seed('closed');
  const replay = await call.begin(request());
  expect(replay).toEqual(original);
  await expect(call.begin(request({ ...base, requestId: 'fresh-debrief' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('rejects a corrupted stored command result instead of replaying unvalidated fields', async () => {
  const call = handlers();
  await call.begin(request());
  const receiptPath = 'sessions/s1/debriefActions/debrief-1';
  const receipt = database.documents.get(receiptPath)!;
  database.documents.set(receiptPath, { ...receipt,
    result: { phase: 'closed', committed: true, cycle: -1, result: 'private-note', extra: 'loyalty' } });

  await expect(call.begin(request())).rejects.toMatchObject({ code: 'failed-precondition' });
});
