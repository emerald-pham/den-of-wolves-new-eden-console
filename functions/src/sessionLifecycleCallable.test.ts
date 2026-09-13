import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  PRESENCE_LEASE_MS,
  PRESENCE_RECONCILIATION_INTERVAL_MS,
  SESSION_RETENTION_MS,
} from './sessionLifecycle';

type StoredDocument = Record<string, unknown>;

const mock = vi.hoisted(() => {
  class MockTimestamp {
    constructor(private readonly value: Date) {}

    static fromDate(value: Date) {
      return new MockTimestamp(value);
    }

    static fromMillis(value: number) {
      return new MockTimestamp(new Date(value));
    }

    static now() {
      return new MockTimestamp(new Date());
    }

    toDate() {
      return this.value;
    }

    toMillis() {
      return this.value.getTime();
    }
  }

  type Ref = {
    path: string;
    id: string;
    get: () => Promise<unknown>;
    collection: (name: string) => Collection;
    delete: () => Promise<void>;
  };
  type Query = {
    query: true;
    path: string;
    group: boolean;
    filters: ReadonlyArray<readonly [string, string, unknown]>;
    where: (field: string, operator: string, value: unknown) => Query;
    orderBy: () => Query;
    get: () => Promise<unknown>;
  };
  type Collection = {
    path: string;
    doc: (id?: string) => Ref;
    where: (field: string, operator: string, value: unknown) => Query;
    orderBy: () => Query;
    get: () => Promise<unknown>;
  };

  const documents = new Map<string, StoredDocument>();
  let beforeTransaction: (() => void) | undefined;
  const recursiveDelete = vi.fn(async (ref: Ref) => {
    for (const path of [...documents.keys()]) {
      if (path === ref.path || path.startsWith(ref.path + '/')) documents.delete(path);
    }
  });

  const documentId = (path: string) => path.split('/').at(-1) ?? '';
  const valueForComparison = (value: unknown) =>
    typeof value === 'object' && value !== null && 'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
      ? (value as { toMillis: () => number }).toMillis()
      : value;

  const snapshot = (ref: Ref) => {
    const fields = documents.get(ref.path);
    return {
      exists: fields !== undefined,
      id: ref.id,
      ref,
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };

  const matches = (path: string, query: Query) => {
    const segments = path.split('/');
    const directChild = path.startsWith(query.path + '/') &&
      segments.length === query.path.split('/').length + 1;
    const groupChild = query.group && segments.at(-2) === query.path;
    return directChild || groupChild;
  };

  const querySnapshot = (query: Query) => {
    const docs = [...documents.keys()]
      .filter((path) => matches(path, query))
      .map((path) => ref(path))
      .filter((candidate) => query.filters.every(([field, operator, expected]) => {
        const received = snapshot(candidate).get(field);
        if (operator === '==') return received === expected;
        if (operator === '<=') {
          return valueForComparison(received) <= valueForComparison(expected);
        }
        throw new Error('Unsupported query operator: ' + operator);
      }))
      .map(snapshot);
    return { docs, size: docs.length, empty: docs.length === 0 };
  };

  const query = (
    path: string,
    group = false,
    filters: ReadonlyArray<readonly [string, string, unknown]> = [],
  ): Query => ({
    query: true,
    path,
    group,
    filters,
    where: (field, operator, value) => query(path, group, [...filters, [field, operator, value]]),
    orderBy: () => query(path, group, filters),
    get: async () => querySnapshot(query(path, group, filters)),
  });

  const collection = (path: string): Collection => ({
    path,
    doc: (id?: string) => ref(path + '/' + (id ?? 'generated')),
    where: (field, operator, value) => query(path).where(field, operator, value),
    orderBy: () => query(path),
    get: async () => querySnapshot(query(path)),
  });

  const ref = (path: string): Ref => ({
    path,
    id: documentId(path),
    get: async () => snapshot(ref(path)),
    collection: (name) => collection(path + '/' + name),
    delete: async () => { documents.delete(path); },
  });

  const update = vi.fn((target: Ref, fields: StoredDocument) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: Ref, fields: StoredDocument, options?: { merge?: boolean }) => {
    documents.set(target.path, options?.merge
      ? { ...(documents.get(target.path) ?? {}), ...fields }
      : { ...fields });
  });
  const remove = vi.fn((target: Ref) => { documents.delete(target.path); });
  const get = vi.fn(async (target: Ref | Query) =>
    'query' in target ? querySnapshot(target) : snapshot(target));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
    const hook = beforeTransaction;
    beforeTransaction = undefined;
    hook?.();
    return callback({ get, update, set, delete: remove });
  });

  return {
    Timestamp: MockTimestamp,
    documents,
    get,
    update,
    set,
    remove,
    runTransaction,
    recursiveDelete,
    setBeforeTransaction: (hook: (() => void) | undefined) => { beforeTransaction = hook; },
    db: {
      doc: ref,
      collection,
      collectionGroup: (name: string) => query(name, true),
      runTransaction,
      recursiveDelete,
    },
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: mock.Timestamp,
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import {
  claimSeat,
  deleteInactiveSessions,
  disconnectFromSession,
  expireStalePlayers,
  refreshPresence,
  resumeSession,
} from './index';

const NOW = new Date('2026-09-06T20:00:00.000Z');

function put(path: string, fields: StoredDocument) {
  mock.documents.set(path, { ...fields });
}

function read(path: string) {
  return mock.documents.get(path);
}

function readPaths() {
  return mock.get.mock.calls.map(([target]) =>
    typeof target === 'object' && target !== null && 'path' in target
      ? (target as { path: string }).path
      : '');
}

function session(fields: StoredDocument = {}) {
  put('sessions/s1', {
    name: 'Table one',
    joinCode: '482109',
    phase: 'lobby',
    ownerUid: 'u1',
    setupRevision: 0,
    deleteAfter: null,
    ...fields,
  });
}

function player(fields: StoredDocument = {}) {
  put('sessions/s1/players/u1', {
    uid: 'u1',
    sessionId: 's1',
    displayName: 'Player',
    role: 'player',
    seatId: null,
    activeConsoleRoleId: null,
    connected: true,
    lastSeenAt: mock.Timestamp.fromDate(NOW),
    ...fields,
  });
}

function request<T extends Record<string, unknown>>(data: T, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<T>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.remove.mockClear();
  mock.runTransaction.mockClear();
  mock.recursiveDelete.mockClear();
  mock.setBeforeTransaction(undefined);
});

afterEach(() => vi.useRealTimers());

describe('presence lease', () => {
  it('denies a player exactly at lease expiry instead of letting a heartbeat revive authority', async () => {
    session();
    player({
      lastSeenAt: mock.Timestamp.fromMillis(NOW.getTime() - PRESENCE_LEASE_MS),
    });
    put('sessions/s1/presenceReconciliations/u1', {
      lastFullReconciliationAt: mock.Timestamp.fromDate(NOW),
    });
    put('sessions/s1/seats/seat-1', { status: 'open', holderUid: null });

    await expect(claimSeat.run(request({
      sessionId: 's1', seatId: 'seat-1', requestId: 'claim-expired-player', expectedSetupRevision: 0,
    })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(refreshPresence.run(request({ sessionId: 's1' })))
      .rejects.toMatchObject({ code: 'permission-denied' });

    expect(read('sessions/s1/seats/seat-1')).toEqual({ status: 'open', holderUid: null });
    expect(read('sessions/s1/players/u1')?.lastSeenAt)
      .toEqual(mock.Timestamp.fromMillis(NOW.getTime() - PRESENCE_LEASE_MS));
  });

  it('allows a fresh player to renew only their live presence', async () => {
    session();
    player();

    await expect(refreshPresence.run(request({ sessionId: 's1' }))).resolves.toEqual({
      sessionId: 's1',
    });

    expect(read('sessions/s1/players/u1')).toMatchObject({ lastSeenAt: 'server-time' });
    expect(read('activeMemberships/u1')).toMatchObject({ sessionId: 's1' });
    expect(readPaths()).toContain('sessions/s1/players');
    expect(read('sessions/s1/presenceReconciliations/u1')?.lastFullReconciliationAt)
      .toEqual(expect.any(mock.Timestamp));
  });

  it('renews rapid heartbeat retries cheaply without moving the full-reconciliation marker', async () => {
    session();
    player({ role: 'gm' });
    put('sessions/s1/gmInstances/bridge', {
      uid: 'u1', sessionId: 's1', connected: true,
      lastSeenAt: mock.Timestamp.fromDate(NOW), claimedAt: mock.Timestamp.fromDate(NOW),
    });
    const marker = mock.Timestamp.fromMillis(NOW.getTime() - 1_000);
    put('sessions/s1/presenceReconciliations/u1', { lastFullReconciliationAt: marker });

    await expect(refreshPresence.run(request({ sessionId: 's1', instanceId: 'bridge' })))
      .resolves.toEqual({ sessionId: 's1' });

    expect(readPaths()).not.toContain('sessions/s1/players');
    expect(readPaths()).not.toContain('sessions/s1/secrets');
    expect(read('sessions/s1/presenceReconciliations/u1')?.lastFullReconciliationAt)
      .toBe(marker);
    expect(read('sessions/s1/gmInstances/bridge')).toMatchObject({
      connected: true, lastSeenAt: 'server-time',
    });
  });

  it('performs full reconciliation once the marker interval elapses', async () => {
    session();
    player();
    put('sessions/s1/presenceReconciliations/u1', {
      lastFullReconciliationAt: mock.Timestamp.fromMillis(
        NOW.getTime() - PRESENCE_RECONCILIATION_INTERVAL_MS - 1,
      ),
    });

    await expect(refreshPresence.run(request({ sessionId: 's1' }))).resolves.toEqual({
      sessionId: 's1',
    });

    expect(readPaths()).toContain('sessions/s1/players');
    expect(read('sessions/s1/presenceReconciliations/u1')?.lastFullReconciliationAt)
      .toEqual(expect.any(mock.Timestamp));
  });

  it('keeps the full marker isolated by session and player identity', async () => {
    session();
    player();
    put('sessions/s1/presenceReconciliations/u1', {
      lastFullReconciliationAt: mock.Timestamp.fromDate(NOW),
    });
    put('sessions/s1/players/u2', {
      uid: 'u2', sessionId: 's1', role: 'player', connected: true,
      lastSeenAt: mock.Timestamp.fromDate(NOW),
    });

    await expect(refreshPresence.run(request({ sessionId: 's1' }, 'u2')))
      .resolves.toEqual({ sessionId: 's1' });
    expect(read('sessions/s1/presenceReconciliations/u2')?.lastFullReconciliationAt)
      .toEqual(expect.any(mock.Timestamp));

    put('sessions/s2', { name: 'Table two', phase: 'lobby', ownerUid: 'u1' });
    put('sessions/s2/players/u1', {
      uid: 'u1', sessionId: 's2', role: 'player', connected: true,
      lastSeenAt: mock.Timestamp.fromDate(NOW),
    });
    mock.get.mockClear();
    await expect(refreshPresence.run(request({ sessionId: 's2' })))
      .resolves.toEqual({ sessionId: 's2' });
    expect(readPaths()).toContain('sessions/s2/players');
    expect(read('sessions/s2/presenceReconciliations/u1')?.lastFullReconciliationAt)
      .toEqual(expect.any(mock.Timestamp));
  });

  it('never takes the cheap path for an explicit role claim or release', async () => {
    session({ pressEnabled: true, activeRoleIds: ['admiral'] });
    player();
    put('sessions/s1/presenceReconciliations/u1', {
      lastFullReconciliationAt: mock.Timestamp.fromDate(NOW),
    });

    await expect(refreshPresence.run(request({ sessionId: 's1', activeConsoleRoleId: null })))
      .resolves.toEqual({ sessionId: 's1' });

    expect(readPaths()).toContain('sessions/s1/players');
    expect(read('sessions/s1/presenceReconciliations/u1')?.lastFullReconciliationAt)
      .toEqual(expect.any(mock.Timestamp));
  });

  it('does not let a replaced player reclaim the historical console role', async () => {
    session({ phase: 'active', activeRoleIds: ['admiral'] });
    player({
      assignedRoleId: 'admiral',
      replacementRoleId: 'wolf-commander',
      activeConsoleRoleId: null,
    });

    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: 'admiral',
    }))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/historical.*role|replacement/i),
    });
    expect(read('sessions/s1/players/u1')).toMatchObject({
      assignedRoleId: 'admiral',
      replacementRoleId: 'wolf-commander',
      activeConsoleRoleId: null,
    });
  });

  it('keeps Press exclusive to an unassigned player instead of letting a core role holder or GM bypass P061', async () => {
    session({ pressEnabled: true, activeRoleIds: ['admiral'] });
    player({ assignedRoleId: 'admiral' });

    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: 'press-officer',
    }))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/core role|assigned|Press/i),
    });

    player({ role: 'gm', assignedRoleId: 'admiral' });
    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: 'press-officer',
    }))).rejects.toMatchObject({
      code: 'permission-denied',
      message: expect.stringMatching(/Press|player station/i),
    });

    put('sessions/s1/players/u2', {
      uid: 'u2',
      sessionId: 's1',
      displayName: 'Press player',
      role: 'player',
      assignedRoleId: null,
      activeConsoleRoleId: null,
      connected: true,
      lastSeenAt: mock.Timestamp.fromDate(NOW),
    });
    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: 'press-officer',
    }, 'u2'))).resolves.toEqual({ sessionId: 's1' });
    expect(read('sessions/s1/players/u2')).toMatchObject({ activeConsoleRoleId: 'press-officer' });
  });

  it('keeps an unassigned GM as a Press observer instead of granting station authority', async () => {
    session({ pressEnabled: true, activeRoleIds: ['admiral'] });
    player({ role: 'gm', assignedRoleId: null });

    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: 'press-officer',
    }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(read('sessions/s1/players/u1')).toMatchObject({ activeConsoleRoleId: null });
  });

  it('allows an enabled Press claim outside active core roles, but reclaims a stale holder', async () => {
    session({ pressEnabled: true, activeRoleIds: ['admiral'] });
    player();
    put('sessions/s1/players/u2', {
      uid: 'u2', sessionId: 's1', role: 'player', connected: true,
      activeConsoleRoleId: 'press-officer',
      lastSeenAt: mock.Timestamp.fromDate(NOW),
    });

    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: 'press-officer',
    }))).rejects.toMatchObject({ code: 'already-exists' });

    put('sessions/s1/players/u2', {
      ...read('sessions/s1/players/u2'),
      connected: false,
      lastSeenAt: mock.Timestamp.fromMillis(NOW.getTime() - PRESENCE_LEASE_MS),
    });
    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: 'press-officer',
    }))).resolves.toEqual({ sessionId: 's1' });
    expect(read('sessions/s1/players/u1')).toMatchObject({ activeConsoleRoleId: 'press-officer' });
  });

  it('seeds Turn 0 ATC on the first heartbeat and does not publish it again on cheap renewal', async () => {
    session({ currentTurn: 0 });
    player();

    await refreshPresence.run(request({ sessionId: 's1' }));
    const firstTicker = read('sessions/s1')?.fleetTicker as Record<string, unknown>;
    expect(firstTicker).toMatchObject({
      revision: 1,
      current: expect.objectContaining({
        sourceId: 'turn-zero-atc',
        text: 'AIRSPACE CONTROL // TURN 0 // STANDING BY',
      }),
    });

    const tickerWrites = () => mock.update.mock.calls.filter(([ref, fields]) =>
      (ref as { path: string }).path === 'sessions/s1' &&
      typeof fields === 'object' && fields !== null && 'fleetTicker' in fields);
    expect(tickerWrites()).toHaveLength(1);

    // The mock transaction stores serverTimestamp as a sentinel string. The
    // next real Firestore read resolves it to a Timestamp before liveness is
    // checked, so model that commit boundary for the repeated heartbeat.
    put('sessions/s1/players/u1', {
      ...read('sessions/s1/players/u1'),
      lastSeenAt: mock.Timestamp.fromDate(NOW),
    });
    await refreshPresence.run(request({ sessionId: 's1' }));

    expect(tickerWrites()).toHaveLength(1);
    expect((read('sessions/s1')?.fleetTicker as Record<string, unknown>).revision).toBe(1);
  });

  it.each([
    ['a later turn', { currentTurn: 1 }],
    ['a closed Turn 0 session', { phase: 'closed', currentTurn: 0 }],
  ])('does not seed Turn 0 ATC for %s', async (_label, fields) => {
    session(fields);
    player();

    await refreshPresence.run(request({ sessionId: 's1' }));

    expect(read('sessions/s1')?.fleetTicker).toBeUndefined();
    expect(mock.update.mock.calls.filter(([ref, updates]) =>
      (ref as { path: string }).path === 'sessions/s1' &&
      typeof updates === 'object' && updates !== null && 'fleetTicker' in updates,
    )).toHaveLength(0);
  });

  it('does not let a stale Press holder reclaim authority after a replacement claims it', async () => {
    session({
      pressEnabled: true,
      activeRoleIds: ['admiral'],
      createdAt: mock.Timestamp.fromDate(NOW),
      updatedAt: mock.Timestamp.fromDate(NOW),
    });
    player({
      activeConsoleRoleId: 'press-officer',
      joinedAt: mock.Timestamp.fromDate(NOW),
      lastSeenAt: mock.Timestamp.fromMillis(NOW.getTime() - PRESENCE_LEASE_MS),
    });
    put('sessions/s1/players/u2', {
      uid: 'u2', sessionId: 's1', displayName: 'Replacement', role: 'player',
      seatId: null, assignedRoleId: null, activeConsoleRoleId: null, connected: true,
      joinedAt: mock.Timestamp.fromDate(NOW),
      lastSeenAt: mock.Timestamp.fromDate(NOW),
    });

    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: 'press-officer',
    }, 'u2'))).resolves.toEqual({ sessionId: 's1' });
    await expect(resumeSession.run(request({ sessionId: 's1' }))).resolves.toBeDefined();

    expect(read('sessions/s1/players/u1')).toMatchObject({ activeConsoleRoleId: null });
    expect(read('sessions/s1/players/u2')).toMatchObject({ activeConsoleRoleId: 'press-officer' });
  });

  it('denies Press presence when the authoritative toggle is disabled', async () => {
    session({ pressEnabled: false, activeRoleIds: ['admiral', 'press-officer'] });
    player();

    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: 'press-officer',
    }))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/press.*disabled/i),
    });
    expect(read('sessions/s1/players/u1')?.activeConsoleRoleId).toBeNull();
  });

  it('clears stale Press authority during a passive disabled heartbeat without changing dispatch history', async () => {
    session({
      pressEnabled: false,
      pressDispatch: {
        dispatches: [{ id: 'dispatch-1', text: 'SNN // Earlier copy' }],
        revision: 3,
      },
    });
    player({ activeConsoleRoleId: 'press-officer' });

    await expect(refreshPresence.run(request({ sessionId: 's1' }))).resolves.toEqual({
      sessionId: 's1',
    });

    expect(read('sessions/s1/players/u1')).toMatchObject({
      activeConsoleRoleId: null,
      lastSeenAt: 'server-time',
    });
    expect(read('sessions/s1')?.pressDispatch).toEqual({
      dispatches: [{ id: 'dispatch-1', text: 'SNN // Earlier copy' }],
      revision: 3,
    });
  });

  it('removes Press-only private state on release while preserving dispatch history', async () => {
    session({
      pressEnabled: true,
      pressDispatch: {
        dispatches: [{ id: 'dispatch-1', text: 'SNN // Earlier copy' }],
        revision: 3,
      },
    });
    player({ activeConsoleRoleId: 'press-officer', assignedRoleId: 'press-officer' });
    put('sessions/s1/secrets/loyalty-u1', {
      visibleToUids: ['u1'], payload: { type: 'loyalty', kind: 'wolf-agent' },
    });
    put('sessions/s1/secrets/wolf-assignment', {
      payload: { type: 'wolf-assignment', roleIds: ['press-officer'] },
    });

    await expect(refreshPresence.run(request({
      sessionId: 's1', activeConsoleRoleId: null,
    }))).resolves.toEqual({ sessionId: 's1' });

    expect(read('sessions/s1/players/u1')).toMatchObject({
      activeConsoleRoleId: null,
      assignedRoleId: null,
    });
    expect(read('sessions/s1/secrets/loyalty-u1')).toBeUndefined();
    expect(read('sessions/s1/secrets/wolf-assignment')).toBeUndefined();
    expect(read('sessions/s1')?.pressDispatch).toEqual({
      dispatches: [{ id: 'dispatch-1', text: 'SNN // Earlier copy' }],
      revision: 3,
    });
  });
});

describe('disconnect and retention', () => {
  it('disconnects one GM browser while preserving a live same-UID sibling', async () => {
    session();
    player({ role: 'gm' });
    put('activeMemberships/u1', { sessionId: 's1' });
    put('sessions/s1/gmInstances/bridge', {
      uid: 'u1', sessionId: 's1', connected: true,
      lastSeenAt: mock.Timestamp.fromDate(NOW), claimedAt: mock.Timestamp.fromDate(NOW),
    });
    put('sessions/s1/gmInstances/old-tab', {
      uid: 'u1', sessionId: 's1', connected: true,
      lastSeenAt: mock.Timestamp.fromDate(NOW), claimedAt: mock.Timestamp.fromDate(NOW),
    });

    await disconnectFromSession.run(request({ sessionId: 's1', instanceId: 'old-tab' }));

    expect(read('sessions/s1/gmInstances/old-tab')).toBeUndefined();
    expect(read('sessions/s1/gmInstances/bridge')).toBeDefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ connected: true, role: 'gm' });
    expect(read('activeMemberships/u1')).toMatchObject({ sessionId: 's1' });
  });

  it('does not let an ID-less legacy GM disconnect erase live sibling browsers', async () => {
    session();
    player({ role: 'gm' });
    put('activeMemberships/u1', { sessionId: 's1' });
    for (const id of ['bridge', 'desk']) {
      put(`sessions/s1/gmInstances/${id}`, {
        uid: 'u1', sessionId: 's1', connected: true,
        lastSeenAt: mock.Timestamp.fromDate(NOW), claimedAt: mock.Timestamp.fromDate(NOW),
      });
    }

    await disconnectFromSession.run(request({ sessionId: 's1' }));

    expect(read('sessions/s1/gmInstances/bridge')).toBeDefined();
    expect(read('sessions/s1/gmInstances/desk')).toBeDefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ connected: true, role: 'gm' });
    expect(read('activeMemberships/u1')).toMatchObject({ sessionId: 's1' });
  });

  it('clears device authority and starts the exact seven-day window only for the final player', async () => {
    session();
    player({ role: 'gm', activeConsoleRoleId: 'admiral' });
    put('activeMemberships/u1', { sessionId: 's1' });
    put('sessions/s1/gmInstances/bridge', { uid: 'u1' });

    await disconnectFromSession.run(request({ sessionId: 's1' }));

    expect(read('sessions/s1/players/u1')).toMatchObject({
      connected: false,
      role: 'player',
      activeConsoleRoleId: null,
      lastSeenAt: 'server-time',
    });
    expect(read('sessions/s1/gmInstances/bridge')).toBeUndefined();
    expect(read('activeMemberships/u1')).toBeUndefined();
    const deadline = read('sessions/s1')?.deleteAfter;
    expect(deadline).toBeInstanceOf(mock.Timestamp);
    expect((deadline as { toMillis: () => number }).toMillis())
      .toBe(NOW.getTime() + SESSION_RETENTION_MS);
  });

  it('is idempotent and preserves a membership lock for another session', async () => {
    session();
    player({ connected: false });
    put('activeMemberships/u1', { sessionId: 's2' });

    await disconnectFromSession.run(request({ sessionId: 's1' }));

    expect(read('activeMemberships/u1')).toEqual({ sessionId: 's2' });
    expect(read('sessions/s1')?.deleteAfter).toBeNull();
  });
});

describe('stale-player cleanup', () => {
  it('expires a vanished GM browser without deleting a live same-UID sibling', async () => {
    session();
    player({ role: 'gm' });
    put('activeMemberships/u1', { sessionId: 's1' });
    put('sessions/s1/gmInstances/bridge', {
      uid: 'u1', sessionId: 's1', connected: true,
      lastSeenAt: mock.Timestamp.fromDate(NOW), claimedAt: mock.Timestamp.fromDate(NOW),
    });
    put('sessions/s1/gmInstances/old-tab', {
      uid: 'u1', sessionId: 's1', connected: true,
      lastSeenAt: mock.Timestamp.fromMillis(NOW.getTime() - PRESENCE_LEASE_MS - 1),
      claimedAt: mock.Timestamp.fromMillis(NOW.getTime() - PRESENCE_LEASE_MS - 1),
    });

    await expireStalePlayers.run({});

    expect(read('sessions/s1/gmInstances/old-tab')).toBeUndefined();
    expect(read('sessions/s1/gmInstances/bridge')).toBeDefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ connected: true, role: 'gm' });
    expect(read('activeMemberships/u1')).toMatchObject({ sessionId: 's1' });
  });

  it('frees a stale player seat without deleting their durable session membership', async () => {
    session();
    player({
      role: 'gm',
      seatId: 'seat-1',
      activeConsoleRoleId: 'admiral',
      lastSeenAt: mock.Timestamp.fromMillis(NOW.getTime() - PRESENCE_LEASE_MS),
    });
    put('activeMemberships/u1', { sessionId: 's1' });
    put('sessions/s1/gmInstances/bridge', { uid: 'u1' });
    put('sessions/s1/seats/seat-1', {
      status: 'claimed',
      holderUid: 'u1',
      claimedAt: mock.Timestamp.fromDate(NOW),
    });

    await expireStalePlayers.run({});

    expect(read('sessions/s1/players/u1')).toMatchObject({
      connected: false,
      role: 'player',
      activeConsoleRoleId: null,
      seatId: 'seat-1',
    });
    expect(read('sessions/s1/seats/seat-1')).toEqual({
      status: 'open',
      holderUid: null,
      claimedAt: null,
    });
    expect(read('activeMemberships/u1')).toBeUndefined();
    expect(read('sessions/s1/gmInstances/bridge')).toBeUndefined();
  });

  it('does nothing when a heartbeat wins the race after the stale query', async () => {
    session();
    player({
      seatId: 'seat-1',
      lastSeenAt: mock.Timestamp.fromMillis(NOW.getTime() - PRESENCE_LEASE_MS),
    });
    put('activeMemberships/u1', { sessionId: 's1' });
    put('sessions/s1/seats/seat-1', {
      status: 'claimed',
      holderUid: 'u1',
      claimedAt: mock.Timestamp.fromDate(NOW),
    });
    mock.setBeforeTransaction(() => {
      put('sessions/s1/players/u1', {
        ...read('sessions/s1/players/u1'),
        lastSeenAt: mock.Timestamp.fromDate(NOW),
      });
    });

    await expireStalePlayers.run({});

    expect(read('sessions/s1/players/u1')).toMatchObject({ connected: true, seatId: 'seat-1' });
    expect(read('sessions/s1/seats/seat-1')).toMatchObject({
      status: 'claimed',
      holderUid: 'u1',
    });
    expect(read('activeMemberships/u1')).toEqual({ sessionId: 's1' });
  });
});

describe('inactive-session reaper', () => {
  it('retires the join code with an expired empty session', async () => {
    session({ deleteAfter: mock.Timestamp.fromDate(new Date(NOW.getTime() - 1)) });
    put('joinCodes/482109', { sessionId: 's1' });

    await deleteInactiveSessions.run({});

    expect(mock.recursiveDelete).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1' }),
    );
    expect(read('joinCodes/482109')).toBeUndefined();
  });

  it.each([
    ['a renewed deadline', () => session({
      deleteAfter: mock.Timestamp.fromDate(new Date(NOW.getTime() + 1)),
    })],
    ['a newly connected player', () => put('sessions/s1/players/u2', {
      uid: 'u2',
      connected: true,
      lastSeenAt: mock.Timestamp.fromDate(NOW),
    })],
    ['a competing reaper claim', () => session({ deletingAt: 'another-worker' })],
  ])('rechecks %s inside its deletion transaction', async (_name, change) => {
    session({ deleteAfter: mock.Timestamp.fromDate(new Date(NOW.getTime() - 1)) });
    put('joinCodes/482109', { sessionId: 's1' });
    mock.setBeforeTransaction(change);

    await deleteInactiveSessions.run({});

    expect(mock.recursiveDelete).not.toHaveBeenCalled();
    expect(read('sessions/s1')).toBeDefined();
    expect(read('joinCodes/482109')).toEqual({ sessionId: 's1' });
  });
});

describe('empty-session clock continuity', () => {
  const phase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T20:03:00.000Z',
    openAirspaceEndsAt: '2026-09-06T20:18:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  it('freezes only the last connected participant and preserves the exact remaining window', async () => {
    session({ phase: 'active', currentTurn: 2, turnPhase: phase });
    player();
    await disconnectFromSession.run(request({ sessionId: 's1' }));
    expect(read('sessions/s1')?.turnPhase).toEqual({
      ...phase,
      timerPause: { reason: 'empty-session', window: 'restricted', remainingMs: 180_000, pausedAt: NOW.toISOString() },
    });
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    await disconnectFromSession.run(request({ sessionId: 's1' }));
    expect(read('sessions/s1')?.turnPhase).toMatchObject({
      timerPause: { remainingMs: 180_000, pausedAt: NOW.toISOString() },
    });
  });

  it('replaces the stored empty-session ticker when the first participant reconnects', async () => {
    session({ phase: 'active', currentTurn: 2, turnPhase: phase,
      createdAt: mock.Timestamp.fromDate(NOW), updatedAt: mock.Timestamp.fromDate(NOW) });
    player({ joinedAt: mock.Timestamp.fromDate(NOW) });
    await disconnectFromSession.run(request({ sessionId: 's1' }));
    expect(read('sessions/s1')?.fleetTicker).toMatchObject({
      current: { sourceId: `empty-session:2:${NOW.toISOString()}` },
    });
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    await resumeSession.run(request({ sessionId: 's1' }));
    expect(read('sessions/s1')?.fleetTicker).toMatchObject({
      current: { sourceId: 'airspace:2:restricted' },
      queued: [],
    });
    expect(read('sessions/s1')?.turnPhase).not.toHaveProperty('timerPause');
  });

  it('keeps a populated session running', async () => {
    session({ phase: 'active', currentTurn: 2, turnPhase: phase });
    player();
    put('sessions/s1/players/u2', { uid: 'u2', connected: true, lastSeenAt: mock.Timestamp.fromDate(NOW) });
    await disconnectFromSession.run(request({ sessionId: 's1' }));
    expect(read('sessions/s1')?.turnPhase).toEqual(phase);
  });

  it('freezes the clock when authoritative expiry removes the final vanished participant', async () => {
    session({ phase: 'active', currentTurn: 2, turnPhase: phase });
    player({ lastSeenAt: mock.Timestamp.fromMillis(NOW.getTime() - PRESENCE_LEASE_MS) });
    await expireStalePlayers.run({} as Parameters<typeof expireStalePlayers.run>[0]);
    expect(read('sessions/s1')?.turnPhase).toMatchObject({
      timerPause: { reason: 'empty-session', remainingMs: 180_000, pausedAt: NOW.toISOString() },
    });
  });

  it.each(['closed', 'debrief', 'lobby'])('does not create a hold in a %s session', async (lifecycle) => {
    session({ phase: lifecycle, currentTurn: 2, turnPhase: phase });
    player();
    await disconnectFromSession.run(request({ sessionId: 's1' }));
    expect(read('sessions/s1')?.turnPhase).toEqual(phase);
  });

  it('preserves an emergency pause when the last participant disconnects', async () => {
    const held = { ...phase, timerPause: { window: 'restricted', remainingMs: 120_000, pausedAt: '2026-09-06T19:59:00.000Z' } };
    session({ phase: 'active', currentTurn: 2, turnPhase: held });
    player();
    await disconnectFromSession.run(request({ sessionId: 's1' }));
    expect(read('sessions/s1')?.turnPhase).toEqual(held);
  });

  it('does not revive a completed timer on disconnect', async () => {
    const completed = { ...phase, teamPhaseEndsAt: '2026-09-06T19:40:00.000Z', openAirspaceEndsAt: NOW.toISOString() };
    session({ phase: 'active', currentTurn: 2, turnPhase: completed });
    player();
    await disconnectFromSession.run(request({ sessionId: 's1' }));
    expect(read('sessions/s1')?.turnPhase).toEqual(completed);
  });
});

it('commits elapsed Team expiry once before holding the remaining Coordination window', async () => {
  session({ phase: 'active', currentTurn: 2, turnPhase: {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T19:59:00.000Z',
    openAirspaceEndsAt: '2026-09-06T20:14:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  } });
  player();
  await disconnectFromSession.run(request({ sessionId: 's1' }));
  expect(read('sessions/s1')?.turnPhase).toMatchObject({
    airspace: { state: 'lifted' },
    timerPause: { reason: 'empty-session', window: 'open', remainingMs: 840_000 },
  });
  const opened = [...mock.documents.values()].filter(value => value.type === 'airspace-opened');
  expect(opened).toHaveLength(1);
  await disconnectFromSession.run(request({ sessionId: 's1' }));
  expect([...mock.documents.values()].filter(value => value.type === 'airspace-opened')).toHaveLength(1);
});

it('keeps the emergency hold when a GM pause wins the disconnect race', async () => {
  session({ phase: 'active', currentTurn: 2 });
  player();
  const hold = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T20:03:00.000Z',
    openAirspaceEndsAt: '2026-09-06T20:18:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    timerPause: { window: 'restricted', remainingMs: 180_000, pausedAt: NOW.toISOString() },
  };
  mock.setBeforeTransaction(() => session({ phase: 'active', currentTurn: 2, turnPhase: hold }));
  await disconnectFromSession.run(request({ sessionId: 's1' }));
  expect(read('sessions/s1')?.turnPhase).toEqual(hold);
});

it('serializes two participant reconnects to one resume without duplicating time or its event', async () => {
  const held = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T19:03:00.000Z',
    openAirspaceEndsAt: '2026-09-06T19:18:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    timerPause: { reason: 'empty-session', window: 'restricted', remainingMs: 180_000, pausedAt: '2026-09-06T19:00:00.000Z' },
  };
  session({ phase: 'active', currentTurn: 2, turnPhase: held,
    createdAt: mock.Timestamp.fromDate(NOW), updatedAt: mock.Timestamp.fromDate(NOW) });
  player({ connected: false, joinedAt: mock.Timestamp.fromDate(NOW) });
  put('sessions/s1/players/u2', { ...read('sessions/s1/players/u1'), uid: 'u2' });
  const first = await resumeSession.run(request({ sessionId: 's1' }));
  vi.setSystemTime(new Date(NOW.getTime() + 30_000));
  const second = await resumeSession.run(request({ sessionId: 's1' }, 'u2'));
  expect(first.session.turnPhase).toMatchObject({ teamPhaseEndsAt: '2026-09-06T20:03:00.000Z', openAirspaceEndsAt: '2026-09-06T20:18:00.000Z' });
  expect(second.session.turnPhase).toEqual(first.session.turnPhase);
  expect([...mock.documents.values()].filter(value => value.type === 'timer-pause' && value.action === 'resumed')).toHaveLength(1);
});
