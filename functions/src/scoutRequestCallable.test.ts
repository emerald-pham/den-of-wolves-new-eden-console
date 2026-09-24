import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: { path },
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const create = vi.fn((target: { path: string }, fields: Fields) => {
    if (documents.has(target.path)) throw new Error('already exists');
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, create }));
  return { documents, get, create, runTransaction, db: { doc: ref, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    constructor(private readonly date: Date) {}
    toMillis() { return this.date.getTime(); }
    toDate() { return this.date; }
    static now() { return new MockTimestamp(new Date()); }
    static fromDate(date: Date) { return new MockTimestamp(date); }
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

import { requestScout } from './index';

const roleIds = ['wing-commander', 'quellon-explorer', 'shepherd-scientist'];
const vesselIds = ['aegis', 'quellon', 'shepherd'];

function request(data: Record<string, unknown>, uid = 'wing') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function resetFixture(): void {
  mock.documents.clear();
  mock.get.mockClear();
  mock.create.mockClear();
  mock.runTransaction.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 2,
    activeRoleIds: [...roleIds], activeVesselIds: [...vesselIds],
    turnPhase: { turn: 2, airspace: { state: 'lifted' } },
  });
  put('sessions/s1/players/wing', {
    role: 'player', connected: true, assignedRoleId: 'wing-commander',
    seatId: 'wing-commander', activeConsoleRoleId: 'wing-commander', replacementRoleId: null,
  });
  put('sessions/s1/players/explorer', {
    role: 'player', connected: true, assignedRoleId: 'quellon-explorer',
    seatId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer', replacementRoleId: null,
  });
  put('sessions/s1/players/scientist', {
    role: 'player', connected: true, assignedRoleId: 'shepherd-scientist',
    seatId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', replacementRoleId: null,
  });
  put('sessions/s1/players/comms', {
    role: 'player', connected: true, assignedRoleId: 'wing-commander',
    seatId: 'wing-commander', activeConsoleRoleId: null, replacementRoleId: 'comms-officer',
  });
}

beforeEach(resetFixture);

it.each([
  ['wing', 'starlight', 'wing-commander', 'aegis'],
  ['explorer', 'hummingbird', 'quellon-explorer', 'quellon'],
  ['scientist', 'endeavour', 'shepherd-scientist', 'shepherd'],
  ['comms', 'comms-officer', 'comms-officer', 'aegis'],
] as const)('creates a pending request for the current %s entitlement only', async (uid, entitlementId, ownerRoleId, anchorShipId) => {
  const result = await requestScout.run(request({
    sessionId: 's1', requestId: `request-${uid}`, entitlementId, targetCoordinate: '5143',
  }, uid));

  expect(result).toMatchObject({
    status: 'requested', requestId: `request-${uid}`, sessionId: 's1', cycle: 2,
    entitlementId, ownerRoleId, anchorShipId, targetCoordinate: '5143',
  });
  const stored = mock.documents.get(`sessions/s1/scoutRequests/request-${uid}`);
  expect(stored).toMatchObject({
    status: 'requested', actorUid: uid, entitlementId, ownerRoleId, anchorShipId,
    targetCoordinate: '5143', cycle: 2, createdAt: 'server-time',
  });
  expect(stored).not.toHaveProperty('result');
  expect(stored).not.toHaveProperty('chartFact');
  expect(stored).not.toHaveProperty('fuelSpent');
  expect(stored).not.toHaveProperty('cadenceConsumed');
  expect(mock.documents.get('sessions/s1')).toMatchObject({ currentTurn: 2 });
  expect(mock.create).toHaveBeenCalledTimes(2);
});

it('keeps a printed but range-unresolved target pending without a scan result', async () => {
  const result = await requestScout.run(request({
    sessionId: 's1', requestId: 'range-unresolved', entitlementId: 'comms-officer', targetCoordinate: '4888',
  }, 'comms'));
  expect(result).toMatchObject({ status: 'requested', resolution: 'pending', targetCoordinate: '4888' });
  expect(result).not.toHaveProperty('originCoordinate');
  expect(result).not.toHaveProperty('distance');
  expect(result).not.toHaveProperty('chartFact');
  expect(mock.documents.get('sessions/s1/scoutRequests/range-unresolved')).not.toHaveProperty('result');
});

it('replays an identical caller-bound request without another write and rejects request-id reuse', async () => {
  const data = { sessionId: 's1', requestId: 'replay-one', entitlementId: 'starlight', targetCoordinate: '5143' };
  expect(await requestScout.run(request(data))).toMatchObject({ status: 'requested' });
  expect(await requestScout.run(request(data))).toMatchObject({ status: 'replayed' });
  expect(mock.create).toHaveBeenCalledTimes(2);

  await expect(requestScout.run(request({ ...data, targetCoordinate: '1413' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(requestScout.run(request({ ...data, entitlementId: 'hummingbird' }, 'explorer')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.create).toHaveBeenCalledTimes(2);
});

it('rechecks the active phase before replay and rejects ids already owned by another command', async () => {
  const data = { sessionId: 's1', requestId: 'phase-replay', entitlementId: 'starlight', targetCoordinate: '5143' };
  await requestScout.run(request(data));
  mock.documents.get('sessions/s1')!.turnPhase = { turn: 2, airspace: { state: 'restricted' } };
  await expect(requestScout.run(request(data))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.create).toHaveBeenCalledTimes(2);

  resetFixture();
  put('sessions/s1/commandReceipts/foreign-command', {
    fingerprint: {
      action: 'transfer-shuttle-cargo', sessionId: 's1', requestId: 'foreign-command',
      actorUid: 'wing', instanceId: null, expectedRevision: null, payload: {},
    },
    result: {},
  });
  await expect(requestScout.run(request({
    sessionId: 's1', requestId: 'foreign-command', entitlementId: 'starlight', targetCoordinate: '5143',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.create).not.toHaveBeenCalled();
});

it('rejects legacy M1 request-id ownership before creating a scout request', async () => {
  const requestId = 'scout-legacy-collision';
  put(`sessions/s1/setupMutationRequests/${requestId}`, { type: 'legacy-setup-command' });

  await expect(requestScout.run(request({
    sessionId: 's1', requestId, entitlementId: 'starlight', targetCoordinate: '5143',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.create).not.toHaveBeenCalled();
  expect(mock.documents.has(`sessions/s1/scoutRequests/${requestId}`)).toBe(false);
  expect(mock.documents.has(`sessions/s1/commandReceipts/${requestId}`)).toBe(false);
});

it.each([
  ['cross-entitlement', 'explorer', 'starlight'],
  ['wrong core seat', 'wing', 'starlight'],
  ['unassigned Comms replacement', 'comms', 'comms-officer'],
] as const)('fails closed on %s without creating a request', async (label, uid, entitlementId) => {
  if (label === 'wrong core seat') {
    mock.documents.get('sessions/s1/players/wing')!.seatId = 'admiral';
  }
  if (label === 'unassigned Comms replacement') {
    mock.documents.get('sessions/s1/players/comms')!.replacementRoleId = 'vip-host';
  }
  await expect(requestScout.run(request({
    sessionId: 's1', requestId: `denied-${label.replaceAll(' ', '-')}`,
    entitlementId, targetCoordinate: '5143',
  }, uid))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.documents.size).toBe(5);
  expect(mock.create).not.toHaveBeenCalled();
});

it.each([
  ['closed lifecycle', (session: Fields) => { session.phase = 'debrief'; }],
  ['wrong action phase', (session: Fields) => { session.turnPhase = { turn: 2, airspace: { state: 'restricted' } }; }],
  ['missing phase clock', (session: Fields) => { delete session.turnPhase; }],
  ['stale phase turn', (session: Fields) => { session.turnPhase = { turn: 1, airspace: { state: 'lifted' } }; }],
  ['malformed current cycle', (session: Fields) => { session.currentTurn = 0; }],
] as const)('rejects a new request outside %s with no write', async (_label, mutate) => {
  mutate(mock.documents.get('sessions/s1')!);
  await expect(requestScout.run(request({
    sessionId: 's1', requestId: 'phase-denied', entitlementId: 'starlight', targetCoordinate: '5143',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.create).not.toHaveBeenCalled();
});

it.each([
  ['disconnected', (player: Fields) => { player.connected = false; }],
  ['kicked', (player: Fields) => { player.kickedAt = 'kicked'; }],
  ['stale presence', (player: Fields) => { player.lastSeenAt = Timestamp.fromDate(new Date(0)); }],
] as const)('rejects %s actors without a write', async (_label, mutate) => {
  mutate(mock.documents.get('sessions/s1/players/wing')!);
  await expect(requestScout.run(request({
    sessionId: 's1', requestId: 'inactive-actor', entitlementId: 'starlight', targetCoordinate: '5143',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.create).not.toHaveBeenCalled();
});

it.each([
  ['unknown target', { targetCoordinate: '9999' }],
  ['unknown entitlement', { entitlementId: 'pallas' }],
  ['extra result field', { chartFact: 'hidden fact' }],
] as const)('rejects %s before persistence', async (_label, patch) => {
  const data = {
    sessionId: 's1', requestId: 'bad-payload', entitlementId: 'starlight', targetCoordinate: '5143',
    ...patch,
  };
  await expect(requestScout.run(request(data))).rejects.toMatchObject({
    code: 'invalid-argument',
  });
  expect(mock.create).not.toHaveBeenCalled();
});

it('fails closed on malformed or mismatched session role and vessel rosters', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.activeRoleIds = ['wing-commander', 'wing-commander', 'shepherd-scientist'];
  await expect(requestScout.run(request({
    sessionId: 's1', requestId: 'bad-role-roster', entitlementId: 'starlight', targetCoordinate: '5143',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  session.activeRoleIds = [...roleIds];
  session.activeVesselIds = [...vesselIds, 'wolf-ship'];
  await expect(requestScout.run(request({
    sessionId: 's1', requestId: 'bad-vessel-roster', entitlementId: 'starlight', targetCoordinate: '5143',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.create).not.toHaveBeenCalled();
});

it('requires the requester and target fields and rejects unrecognized payload keys', async () => {
  await expect(requestScout.run(request({
    sessionId: 's1', requestId: 'missing-target', entitlementId: 'starlight',
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(requestScout.run(request({
    sessionId: 's1', requestId: 'extra-field', entitlementId: 'starlight', targetCoordinate: '5143', origin: '0000',
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.create).not.toHaveBeenCalled();
});
