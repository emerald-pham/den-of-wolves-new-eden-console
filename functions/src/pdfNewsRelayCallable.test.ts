import { beforeEach, expect, it, vi } from 'vitest';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1)! });
  const snapshot = (path: string) => ({ ...ref(path), ref: ref(path), exists: documents.has(path),
    data: () => documents.get(path), get: (field: string) => documents.get(path)?.[field] });
  const writes = vi.fn();
  const runTransaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    const queued: Array<[string, Fields]> = [];
    const result = await callback({ get: async (target: { path: string; collection?: boolean }) => {
      if (queued.length) throw new Error('Native Firestore forbids reads after writes');
      return target.collection ? { docs: [...documents.keys()].filter(path => path.startsWith(`${target.path}/`) &&
        !path.slice(target.path.length + 1).includes('/')).map(snapshot) } : snapshot(target.path);
    }, set: (target: { path: string }, value: Fields) => queued.push([target.path, value]),
    update: (target: { path: string }, value: Fields) => queued.push([target.path, { ...documents.get(target.path), ...value }]),
    create: (target: { path: string }, value: Fields) => {
      if (documents.has(target.path)) throw new Error('already exists');
      queued.push([target.path, value]);
    } });
    queued.forEach(([path, value]) => { writes(path, value); documents.set(path, value); });
    return result;
  };
  return { documents, writes, db: { doc: ref, collection: (path: string) => ({ path, collection: true }), runTransaction } };
});
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => '__delete-field__' },
  Timestamp: class { toMillis() { return Date.now(); } toDate() { return new Date(); } static now() { return new this(); } } }));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({ HttpsError: class extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}, onCall: (handler: (request: unknown) => unknown) => ({ run: handler }) }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_: unknown, handler: unknown) => ({ run: handler }) }));
import * as callables from './index';

const calls = callables as unknown as {
  relayPdfColonelNews: { run: (request: unknown) => Promise<unknown> };
  readFleetGroupMessages: { run: (request: unknown) => Promise<unknown> };
};
const COLONEL = 'refinery-124-pdf-colonel';
const relay = { sessionId: 's1', requestId: 'relay-1', expectedGroupId: 'fleet-1',
  text: '  Wolves sighted beyond the outer marker.  ', handToPress: false };
const request = (value: Fields = relay, uid = 'colonel') => ({ data: value, auth: { uid } });
const put = (path: string, value: Fields) => mock.documents.set(path, value);
const paths = (prefix: string) => [...mock.documents.keys()].filter(path => path.startsWith(prefix));
const snapshotAll = () => structuredClone([...mock.documents.entries()]);

beforeEach(() => {
  mock.documents.clear(); mock.writes.mockClear();
  put('sessions/s1', { phase: 'active', currentTurn: 2, pressEnabled: true,
    activeRoleIds: [COLONEL, 'refinery-124-engineer', 'admiral', 'press-officer'],
    activeVesselIds: ['refinery-124', 'aegis'] });
  put('sessions/s1/players/colonel', { role: 'player', connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: COLONEL, seatId: COLONEL, activeConsoleRoleId: COLONEL });
  put('sessions/s1/players/engineer', { role: 'player', connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: 'refinery-124-engineer', seatId: 'refinery-124-engineer', activeConsoleRoleId: 'refinery-124-engineer' });
  put('sessions/s1/players/admiral', { role: 'player', connected: true, fleetGroupId: 'fleet-2',
    assignedRoleId: 'admiral', seatId: 'admiral', activeConsoleRoleId: 'admiral' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['refinery-124'], memberUids: ['colonel', 'engineer'] });
  put('sessions/s1/fleetGroups/fleet-2', { id: 'fleet-2', vesselIds: ['aegis'], memberUids: ['admiral'] });
});

it('relays the current P.D.F. Colonel message once to the current group and the GM record only', async () => {
  const result = await calls.relayPdfColonelNews.run(request());

  expect(result).toEqual({ status: 'committed', groupId: 'fleet-1', messageId: 'relay-1', handedToPress: false });
  const notes = mock.documents.get('sessions/s1/fleetGroupMessages/fleet-1');
  expect(notes?.messages).toEqual([expect.objectContaining({
    id: 'relay-1', actorUid: 'colonel', text: 'Wolves sighted beyond the outer marker.' })]);
  expect(await calls.readFleetGroupMessages.run(request({ sessionId: 's1', expectedGroupId: 'fleet-1' }, 'engineer')))
    .toMatchObject({ messages: [{ id: 'relay-1', text: 'Wolves sighted beyond the outer marker.' }] });
  expect(paths('sessions/s1/fleetGroupMessages/fleet-2')).toEqual([]);
  expect(mock.documents.get('sessions/s1/pdfNewsRelayAudits/relay-1')).toEqual({
    type: 'pdf-news-relay-audit', sessionId: 's1', requestId: 'relay-1', actorUid: 'colonel',
    actorRoleId: COLONEL, groupId: 'fleet-1', cycle: 2, text: 'Wolves sighted beyond the outer marker.',
    handedToPress: false, createdAt: 'server-time',
  });
  expect(paths('sessions/s1/pressLog/')).toEqual([]);
});

it('hands only the relayed text to the Press intake when the Colonel explicitly chooses it', async () => {
  const result = await calls.relayPdfColonelNews.run(request({ ...relay, handToPress: true }));

  expect(result).toMatchObject({ status: 'committed', handedToPress: true });
  const entries = paths('sessions/s1/pressLog/');
  expect(entries).toHaveLength(1);
  const entry = mock.documents.get(entries[0]!)!;
  expect(entry).toEqual({ type: 'pdf-news-relay', sourceId: 'pdf-news-relay:relay-1', cycle: 2,
    recordedAt: expect.any(String), text: 'Wolves sighted beyond the outer marker.' });
  expect(JSON.stringify(entry)).not.toMatch(/colonel|fleet-1/);
  expect(mock.documents.get('sessions/s1/pdfNewsRelayAudits/relay-1')).toMatchObject({ handedToPress: true });
});

it('replays an exact retry without writing again and rejects a changed text or publication choice', async () => {
  const first = await calls.relayPdfColonelNews.run(request({ ...relay, handToPress: true }));
  mock.writes.mockClear();
  const before = snapshotAll();

  expect(await calls.relayPdfColonelNews.run(request({ ...relay, handToPress: true }))).toEqual(first);
  await expect(calls.relayPdfColonelNews.run(request({ ...relay, handToPress: false }))).rejects.toThrow();
  await expect(calls.relayPdfColonelNews.run(request({ ...relay, handToPress: true, text: 'Changed.' }))).rejects.toThrow();
  expect(mock.writes).not.toHaveBeenCalled();
  expect(snapshotAll()).toEqual(before);
  expect(paths('sessions/s1/pressLog/')).toHaveLength(1);
});

it.each([
  ['another Refinery 124 role in the same group', 'engineer', undefined],
  ['a player whose active console is not the P.D.F. Colonel', 'colonel', { activeConsoleRoleId: 'refinery-124-engineer' }],
  ['a disconnected Colonel', 'colonel', { connected: false }],
  ['a GM', 'gm1', undefined],
] as const)('rejects %s without writing', async (_label, uid, patch) => {
  if (uid === 'gm1') put('sessions/s1/players/gm1', { role: 'gm', connected: true, fleetGroupId: 'fleet-1' });
  if (patch) Object.assign(mock.documents.get(`sessions/s1/players/${uid}`)!, patch);
  const before = snapshotAll();

  await expect(calls.relayPdfColonelNews.run(request({ ...relay, handToPress: true }, uid)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.writes).not.toHaveBeenCalled();
  expect(snapshotAll()).toEqual(before);
});

it('rejects another actor replaying the Colonel request id', async () => {
  await calls.relayPdfColonelNews.run(request());
  mock.writes.mockClear();
  put('sessions/s1/players/engineer', { role: 'player', connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: COLONEL, seatId: COLONEL, activeConsoleRoleId: COLONEL });

  await expect(calls.relayPdfColonelNews.run(request(relay, 'engineer'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.writes).not.toHaveBeenCalled();
});

it('rejects a relay addressed to another fleet group', async () => {
  await expect(calls.relayPdfColonelNews.run(request({ ...relay, expectedGroupId: 'fleet-2' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.writes).not.toHaveBeenCalled();
});

it('rejects a relay during an active Wolf attack and allows it once normal movement reopens', async () => {
  put('sessions/s1/wolfAttackState/current', { type: 'wolf-attack-state', status: 'declared', currentStep: 'medium-range',
    airspaceLocked: true });
  const before = snapshotAll();

  await expect(calls.relayPdfColonelNews.run(request({ ...relay, handToPress: true })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/Wolf attack/i) });
  expect(mock.writes).not.toHaveBeenCalled();
  expect(snapshotAll()).toEqual(before);

  put('sessions/s1/wolfAttackState/current', { type: 'wolf-attack-state', status: 'resolved', currentStep: 'resolved',
    airspaceLocked: false, parkingReleaseCondition: 'normal-movement-reopened' });
  await expect(calls.relayPdfColonelNews.run(request())).resolves.toMatchObject({ status: 'committed' });
});

it('refuses a Press hand-off while the Press is disabled but still relays to the group without one', async () => {
  Object.assign(mock.documents.get('sessions/s1')!, { pressEnabled: false });

  await expect(calls.relayPdfColonelNews.run(request({ ...relay, handToPress: true })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.writes).not.toHaveBeenCalled();

  await expect(calls.relayPdfColonelNews.run(request({ ...relay, requestId: 'relay-2' })))
    .resolves.toMatchObject({ status: 'committed', handedToPress: false });
  expect(paths('sessions/s1/pressLog/')).toEqual([]);
});

it.each([
  [{ ...relay, handToPress: undefined }],
  [{ ...relay, handToPress: 'yes' }],
  [{ ...relay, text: '   ' }],
  [{ ...relay, text: 'x'.repeat(241) }],
  [{ ...relay, audience: 'all' }],
  [{ ...relay, requestId: 'bad/id' }],
])('rejects a malformed relay request', async (value) => {
  await expect(calls.relayPdfColonelNews.run(request(value as Fields))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.writes).not.toHaveBeenCalled();
});
