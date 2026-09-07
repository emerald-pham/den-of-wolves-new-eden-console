import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type StoredDocument = Record<string, unknown>;

const mock = vi.hoisted(() => {
  type Ref = {
    path: string;
    id: string;
    get: () => Promise<unknown>;
  };
  type Query = {
    query: true;
    path: string;
    filters: ReadonlyArray<readonly [string, unknown]>;
    where: (field: string, operator: string, value: unknown) => Query;
  };

  const documents = new Map<string, StoredDocument>();
  const documentId = (path: string) => path.split('/').at(-1) ?? '';
  const directGet = vi.fn(async (target: Ref) => snapshot(target));
  const ref = (path: string): Ref => ({
    path,
    id: documentId(path),
    get: async () => directGet(ref(path)),
  });
  const snapshot = (target: Ref) => {
    const fields = documents.get(target.path);
    return {
      exists: fields !== undefined,
      id: target.id,
      ref: target,
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const query = (
    path: string,
    filters: ReadonlyArray<readonly [string, unknown]> = [],
  ): Query => ({
    query: true,
    path,
    filters,
    where: (field, operator, value) => {
      if (operator !== '==') throw new Error('Unsupported query operator: ' + operator);
      return query(path, [...filters, [field, value]]);
    },
  });
  const querySnapshot = (target: Query) => {
    const docs = [...documents.keys()]
      .filter((path) => path.startsWith(target.path + '/') &&
        path.split('/').length === target.path.split('/').length + 1)
      .map(ref)
      .filter((candidate) => target.filters.every(([field, value]) =>
        snapshot(candidate).get(field) === value))
      .map(snapshot);
    return { docs, size: docs.length, empty: docs.length === 0 };
  };
  const get = vi.fn(async (target: Ref | Query) =>
    'query' in target ? querySnapshot(target) : snapshot(target));
  const update = vi.fn((target: Ref, fields: StoredDocument) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: Ref, fields: StoredDocument) => {
    documents.set(target.path, { ...fields });
  });
  const remove = vi.fn((target: Ref) => { documents.delete(target.path); });
  let transactionTail: Promise<void> = Promise.resolve();
  const runTransaction = vi.fn((callback: (tx: unknown) => unknown) => {
    const run = transactionTail.then(() => callback({ get, update, set, delete: remove }));
    transactionTail = run.then(() => undefined, () => undefined);
    return run;
  });
  const collection = (path: string) => ({
    path,
    doc: (id?: string) => ref(path + '/' + (id ?? 'generated')),
    where: (field: string, operator: string, value: unknown) =>
      query(path).where(field, operator, value),
  });

  return {
    documents,
    directGet,
    get,
    update,
    set,
    remove,
    resetTransactions: () => { transactionTail = Promise.resolve(); },
    db: {
      doc: ref,
      collection,
      runTransaction,
    },
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class {},
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

import { claimSeat, releaseSeat } from './index';

function put(path: string, fields: StoredDocument) {
  mock.documents.set(path, { ...fields });
}

function read(path: string) {
  return mock.documents.get(path);
}

function player(uid: string, fields: StoredDocument = {}) {
  put('sessions/s1/players/' + uid, {
    uid,
    sessionId: 's1',
    displayName: uid,
    role: 'player',
    seatId: null,
    connected: true,
    ...fields,
  });
}

function seat(id: string, fields: StoredDocument = {}) {
  put('sessions/s1/seats/' + id, {
    status: 'open',
    holderUid: null,
    claimedAt: null,
    ...fields,
  });
}

function request<T extends Record<string, unknown>>(data: T, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<T>;
}

beforeEach(() => {
  mock.documents.clear();
  mock.directGet.mockClear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.remove.mockClear();
  mock.resetTransactions();
});

describe('claimSeat', () => {
  it('claims an open seat and records the pointer in the same transaction', async () => {
    player('u1');
    seat('seat-1');

    await expect(claimSeat.run(request({ sessionId: 's1', seatId: 'seat-1' })))
      .resolves.toEqual({ seatId: 'seat-1', holderUid: 'u1' });

    expect(read('sessions/s1/seats/seat-1')).toMatchObject({
      status: 'claimed',
      holderUid: 'u1',
      claimedAt: 'server-time',
    });
    expect(read('sessions/s1/players/u1')).toMatchObject({ seatId: 'seat-1' });
  });

  it.each([
    ['a disconnected player', { connected: false }, { status: 'open' }, 'permission-denied'],
    ['a missing player', null, { status: 'open' }, 'permission-denied'],
    ['a seat held by someone else', {}, { status: 'claimed', holderUid: 'u2' }, 'aborted'],
    ['a second seat attempt', { seatId: 'seat-2' }, { status: 'open' }, 'failed-precondition'],
  ])('rejects %s without changing either side of the claim', async (
    _name,
    playerFields,
    seatFields,
    code,
  ) => {
    if (playerFields !== null) player('u1', playerFields);
    seat('seat-1', seatFields);
    const beforeSeat = read('sessions/s1/seats/seat-1');
    const beforePlayer = read('sessions/s1/players/u1');

    await expect(claimSeat.run(request({ sessionId: 's1', seatId: 'seat-1' })))
      .rejects.toMatchObject({ code });

    expect(read('sessions/s1/seats/seat-1')).toEqual(beforeSeat);
    expect(read('sessions/s1/players/u1')).toEqual(beforePlayer);
  });

  it('allows only one winner when two players claim the same open seat', async () => {
    player('u1');
    player('u2');
    seat('seat-1');

    const outcomes = await Promise.allSettled([
      claimSeat.run(request({ sessionId: 's1', seatId: 'seat-1' }, 'u1')),
      claimSeat.run(request({ sessionId: 's1', seatId: 'seat-1' }, 'u2')),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(read('sessions/s1/seats/seat-1')?.holderUid).toMatch(/u[12]/);
    expect([
      read('sessions/s1/players/u1')?.seatId,
      read('sessions/s1/players/u2')?.seatId,
    ].filter(Boolean)).toHaveLength(1);
  });
});

describe('releaseSeat', () => {
  it('opens a held seat and clears only the matching player pointer', async () => {
    player('u1', { seatId: 'seat-1' });
    seat('seat-1', { status: 'claimed', holderUid: 'u1', claimedAt: 'server-time' });

    await expect(releaseSeat.run(request({ sessionId: 's1', seatId: 'seat-1' })))
      .resolves.toEqual({ seatId: 'seat-1' });

    expect(read('sessions/s1/seats/seat-1')).toEqual({
      status: 'open',
      holderUid: null,
      claimedAt: null,
    });
    expect(read('sessions/s1/players/u1')).toMatchObject({ seatId: null });
  });

  it('does not erase another seat pointer when releasing a stale seat record', async () => {
    player('u1', { seatId: 'seat-2' });
    seat('seat-1', { status: 'claimed', holderUid: 'u1' });

    await releaseSeat.run(request({ sessionId: 's1', seatId: 'seat-1' }));

    expect(read('sessions/s1/players/u1')).toMatchObject({ seatId: 'seat-2' });
  });

  it('allows an active GM to release another player seat but denies an ordinary non-holder', async () => {
    player('u1', { role: 'gm' });
    player('u2', { seatId: 'seat-1' });
    seat('seat-1', { status: 'claimed', holderUid: 'u2' });

    await releaseSeat.run(request({ sessionId: 's1', seatId: 'seat-1' }, 'u1'));
    expect(read('sessions/s1/players/u2')).toMatchObject({ seatId: null });
    expect(mock.directGet).not.toHaveBeenCalled();

    player('u1', { role: 'player' });
    seat('seat-2', { status: 'claimed', holderUid: 'u2' });
    await expect(releaseSeat.run(request({ sessionId: 's1', seatId: 'seat-2' }, 'u1')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(read('sessions/s1/seats/seat-2')).toMatchObject({ holderUid: 'u2' });
  });
});
