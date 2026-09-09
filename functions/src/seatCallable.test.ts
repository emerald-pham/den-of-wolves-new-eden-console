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
    roleId: id,
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
  put('sessions/s1', {
    phase: 'lobby', currentTurn: 0, setupRevision: 0, configurationLocked: false,
    activeRoleIds: ['admiral', 'seat-1', 'seat-2'],
  });
});

describe('claimSeat', () => {
  it('commits a revisioned, replay-safe seat receipt, pointer, and member-safe event', async () => {
    put('sessions/s1', {
      phase: 'lobby',
      currentTurn: 0,
      configurationLocked: false,
      setupRevision: 0,
      activeRoleIds: ['admiral', 'seat-1', 'seat-2'],
    });
    player('u1');
    seat('admiral');

    const command = {
      sessionId: 's1',
      seatId: 'admiral',
      requestId: 'claim-admiral-1',
      expectedSetupRevision: 0,
    };
    await expect(claimSeat.run(request(command))).resolves.toMatchObject({
      status: 'committed',
      requestId: 'claim-admiral-1',
      setupRevision: 1,
      seatId: 'admiral',
      holderUid: 'u1',
    });
    expect(read('sessions/s1')).toMatchObject({ setupRevision: 1 });
    expect(read('sessions/s1/events/seat-claim-claim-admiral-1')).toMatchObject({
      type: 'seat-claim',
      seatId: 'admiral',
      actorUid: 'u1',
      revision: 1,
    });

    await expect(claimSeat.run(request(command))).resolves.toMatchObject({
      status: 'replayed',
      requestId: 'claim-admiral-1',
      setupRevision: 1,
    });
    expect(read('sessions/s1')).toMatchObject({ setupRevision: 1 });

    await expect(claimSeat.run(request({ ...command, expectedSetupRevision: 1 })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects a stale claim before mutating either seat, pointer, revision, or event', async () => {
    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 3, configurationLocked: false,
      activeRoleIds: ['admiral', 'seat-1', 'seat-2'],
    });
    player('u1');
    seat('admiral');

    const command = {
      sessionId: 's1', seatId: 'admiral', requestId: 'claim-stale', expectedSetupRevision: 2,
    };
    const staleReply = {
      status: 'stale', requestId: 'claim-stale', entity: 'seat', seatId: 'admiral',
      expectedRevision: 2, currentRevision: 3,
    };
    await expect(claimSeat.run(request(command))).resolves.toEqual(staleReply);
    expect(read('sessions/s1/seats/admiral')).toMatchObject({ status: 'open', holderUid: null });
    expect(read('sessions/s1/events/seat-claim-claim-stale')).toBeUndefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ seatId: null });
    expect(read('sessions/s1')).toMatchObject({ setupRevision: 3 });
    expect(read('sessions/s1/events/seat-claim-claim-stale')).toBeUndefined();

    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 2, configurationLocked: false,
      activeRoleIds: ['admiral', 'seat-1', 'seat-2'],
    });
    await expect(claimSeat.run(request(command))).resolves.toEqual(staleReply);
    expect(read('sessions/s1/seats/admiral')).toMatchObject({ status: 'open', holderUid: null });
  });

  it('returns safe stale receipts for claim and release without mutating authority state', async () => {
    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 3, configurationLocked: false,
      activeRoleIds: ['admiral', 'seat-1', 'seat-2'],
    });
    player('u1');
    seat('admiral');

    await expect(claimSeat.run(request({
      sessionId: 's1', seatId: 'admiral', requestId: 'claim-stale-receipt', expectedSetupRevision: 2,
    }))).resolves.toEqual({
      status: 'stale', requestId: 'claim-stale-receipt', entity: 'seat', seatId: 'admiral',
      expectedRevision: 2, currentRevision: 3,
    });

    put('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true, seatId: 'admiral' });
    put('sessions/s1/seats/admiral', { roleId: 'admiral', status: 'claimed', holderUid: 'u1' });
    await expect(releaseSeat.run(request({
      sessionId: 's1', seatId: 'admiral', requestId: 'release-stale-receipt', expectedSetupRevision: 2,
    }))).resolves.toEqual({
      status: 'stale', requestId: 'release-stale-receipt', entity: 'seat', seatId: 'admiral',
      expectedRevision: 2, currentRevision: 3,
    });
    expect(read('sessions/s1')).toMatchObject({ setupRevision: 3 });
    expect(read('sessions/s1/seats/admiral')).toMatchObject({ status: 'claimed', holderUid: 'u1' });
    expect(read('sessions/s1/players/u1')).toMatchObject({ seatId: 'admiral' });

    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 2, configurationLocked: false,
      activeRoleIds: ['admiral', 'seat-1', 'seat-2'],
    });
    await expect(releaseSeat.run(request({
      sessionId: 's1', seatId: 'admiral', requestId: 'release-stale-receipt', expectedSetupRevision: 2,
    }))).resolves.toEqual({
      status: 'stale', requestId: 'release-stale-receipt', entity: 'seat', seatId: 'admiral',
      expectedRevision: 2, currentRevision: 3,
    });
    expect(read('sessions/s1/events/seat-release-release-stale-receipt')).toBeUndefined();
  });

  it('does not replay a claim or release receipt for an inactive or foreign member', async () => {
    player('u1');
    seat('seat-1');
    const claimCommand = {
      sessionId: 's1', seatId: 'seat-1', requestId: 'claim-replay-authority', expectedSetupRevision: 0,
    };
    await claimSeat.run(request(claimCommand));
    player('u1', { connected: false, seatId: 'seat-1' });
    await expect(claimSeat.run(request(claimCommand))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(claimSeat.run(request(claimCommand, 'u2'))).rejects.toMatchObject({ code: 'permission-denied' });

    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 1, configurationLocked: false,
      activeRoleIds: ['admiral', 'seat-1', 'seat-2'],
    });
    player('u1', { connected: true, seatId: 'seat-1' });
    seat('seat-1', { status: 'claimed', holderUid: 'u1' });
    const releaseCommand = {
      sessionId: 's1', seatId: 'seat-1', requestId: 'release-replay-authority', expectedSetupRevision: 1,
    };
    await releaseSeat.run(request(releaseCommand));
    player('u1', { connected: false, seatId: null });
    await expect(releaseSeat.run(request(releaseCommand))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(releaseSeat.run(request(releaseCommand, 'u2'))).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('does not replay a GM intervention after its live instance is gone', async () => {
    player('u1', { role: 'gm' });
    player('u2', { seatId: 'seat-1' });
    seat('seat-1', { status: 'claimed', holderUid: 'u2' });
    put('sessions/s1/gmInstances/bridge', { uid: 'u1' });
    const command = {
      sessionId: 's1', seatId: 'seat-1', requestId: 'release-gm-replay-authority',
      expectedSetupRevision: 0, instanceId: 'bridge', reason: 'Clear stale browser',
    };
    await expect(releaseSeat.run(request(command))).resolves.toMatchObject({ status: 'committed' });
    mock.documents.delete('sessions/s1/gmInstances/bridge');

    await expect(releaseSeat.run(request(command))).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('requires an explicit active roster and an exact stable role id', async () => {
    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 0, configurationLocked: false,
      activeRoleIds: ['admiral'],
    });
    player('u1');
    seat('admiral', { roleId: 'dione-captain' });
    await expect(claimSeat.run(request({
      sessionId: 's1', seatId: 'admiral', requestId: 'claim-mismatch', expectedSetupRevision: 0,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });

    seat('admiral', { roleId: 'admiral' });
    put('sessions/s1', { phase: 'lobby', currentTurn: 0, setupRevision: 0, configurationLocked: false });
    await expect(claimSeat.run(request({
      sessionId: 's1', seatId: 'admiral', requestId: 'claim-no-roster', expectedSetupRevision: 0,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('never treats the optional Press station as a core claim or release seat', async () => {
    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 0, configurationLocked: false,
      activeRoleIds: ['press-officer'],
    });
    player('u1');
    seat('press-officer');
    await expect(claimSeat.run(request({
      sessionId: 's1', seatId: 'press-officer', requestId: 'claim-press', expectedSetupRevision: 0,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(read('sessions/s1/seats/press-officer')).toMatchObject({ status: 'open', holderUid: null });

    put('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true, seatId: 'press-officer' });
    put('sessions/s1/seats/press-officer', {
      roleId: 'press-officer', status: 'claimed', holderUid: 'u1', claimedAt: 'server-time',
    });
    await expect(releaseSeat.run(request({
      sessionId: 's1', seatId: 'press-officer', requestId: 'release-press', expectedSetupRevision: 0,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(read('sessions/s1/seats/press-officer')).toMatchObject({ status: 'claimed', holderUid: 'u1' });
  });

  it('claims an open seat and records the pointer in the same transaction', async () => {
    player('u1');
    seat('seat-1');

    await expect(claimSeat.run(request({
      sessionId: 's1', seatId: 'seat-1', requestId: 'claim-seat-1', expectedSetupRevision: 0,
    }))).resolves.toMatchObject({
      status: 'committed', seatId: 'seat-1', holderUid: 'u1', setupRevision: 1,
    });

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

    await expect(claimSeat.run(request({
      sessionId: 's1', seatId: 'seat-1', requestId: `claim-${_name.replaceAll(' ', '-')}`, expectedSetupRevision: 0,
    })))
      .rejects.toMatchObject({ code });

    expect(read('sessions/s1/seats/seat-1')).toEqual(beforeSeat);
    expect(read('sessions/s1/players/u1')).toEqual(beforePlayer);
  });

  it('allows only one winner when two players claim the same open seat', async () => {
    player('u1');
    player('u2');
    seat('seat-1');

    const outcomes = await Promise.allSettled([
      claimSeat.run(request({
        sessionId: 's1', seatId: 'seat-1', requestId: 'claim-race-u1', expectedSetupRevision: 0,
      }, 'u1')),
      claimSeat.run(request({
        sessionId: 's1', seatId: 'seat-1', requestId: 'claim-race-u2', expectedSetupRevision: 0,
      }, 'u2')),
    ]);

    const committed = outcomes.filter((outcome) =>
      outcome.status === 'fulfilled' && outcome.value.status === 'committed');
    expect(committed).toHaveLength(1);
    expect(outcomes.filter((outcome) =>
      outcome.status === 'fulfilled' && outcome.value.status === 'stale')).toHaveLength(1);
    expect(read('sessions/s1/seats/seat-1')?.holderUid).toMatch(/u[12]/);
    expect([
      read('sessions/s1/players/u1')?.seatId,
      read('sessions/s1/players/u2')?.seatId,
    ].filter(Boolean)).toHaveLength(1);
  });
});

describe('releaseSeat', () => {
  it('commits a revisioned self-release and replays without a second event', async () => {
    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 4, configurationLocked: false,
      activeRoleIds: ['admiral', 'seat-1', 'seat-2'],
    });
    player('u1', { seatId: 'admiral' });
    seat('admiral', { status: 'claimed', holderUid: 'u1', claimedAt: 'server-time' });

    const command = {
      sessionId: 's1',
      seatId: 'admiral',
      requestId: 'release-admiral-1',
      expectedSetupRevision: 4,
    };
    await expect(releaseSeat.run(request(command))).resolves.toMatchObject({
      status: 'committed',
      requestId: 'release-admiral-1',
      setupRevision: 5,
      seatId: 'admiral',
    });
    expect(read('sessions/s1')).toMatchObject({ setupRevision: 5 });
    expect(read('sessions/s1/events/seat-release-release-admiral-1')).toMatchObject({
      type: 'seat-release',
      seatId: 'admiral',
      actorUid: 'u1',
      revision: 5,
    });

    await expect(releaseSeat.run(request(command))).resolves.toMatchObject({
      status: 'replayed',
      requestId: 'release-admiral-1',
      setupRevision: 5,
    });

    await expect(releaseSeat.run(request({ ...command, expectedSetupRevision: 5 })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('opens a held seat and clears only the matching player pointer', async () => {
    player('u1', { seatId: 'seat-1' });
    seat('seat-1', { status: 'claimed', holderUid: 'u1', claimedAt: 'server-time' });

    await expect(releaseSeat.run(request({
      sessionId: 's1', seatId: 'seat-1', requestId: 'release-seat-1', expectedSetupRevision: 0,
    }))).resolves.toMatchObject({ status: 'committed', seatId: 'seat-1', setupRevision: 1 });

    expect(read('sessions/s1/seats/seat-1')).toEqual({
      roleId: 'seat-1',
      status: 'open',
      holderUid: null,
      claimedAt: null,
    });
    expect(read('sessions/s1/players/u1')).toMatchObject({ seatId: null });
  });

  it('does not erase another seat pointer when releasing a stale seat record', async () => {
    player('u1', { seatId: 'seat-2' });
    seat('seat-1', { status: 'claimed', holderUid: 'u1' });

    await expect(releaseSeat.run(request({
      sessionId: 's1', seatId: 'seat-1', requestId: 'release-stale-seat', expectedSetupRevision: 0,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(read('sessions/s1/players/u1')).toMatchObject({ seatId: 'seat-2' });
    expect(read('sessions/s1/seats/seat-1')).toMatchObject({ status: 'claimed', holderUid: 'u1' });
  });

  it('allows an active GM to release another player seat but denies an ordinary non-holder', async () => {
    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 0, configurationLocked: false,
      activeRoleIds: ['admiral', 'seat-1', 'seat-2'],
    });
    player('u1', { role: 'gm' });
    player('u2', { seatId: 'seat-1' });
    seat('seat-1', { status: 'claimed', holderUid: 'u2' });
    put('sessions/s1/gmInstances/bridge', { uid: 'u1' });

    await releaseSeat.run(request({
      sessionId: 's1', seatId: 'seat-1', requestId: 'release-by-gm', expectedSetupRevision: 0,
      instanceId: 'bridge', reason: 'Roster correction',
    }, 'u1'));
    expect(read('sessions/s1/players/u2')).toMatchObject({ seatId: null });
    expect(mock.directGet).not.toHaveBeenCalled();

    player('u1', { role: 'player' });
    seat('seat-2', { status: 'claimed', holderUid: 'u2' });
    await expect(releaseSeat.run(request({
      sessionId: 's1', seatId: 'seat-2', requestId: 'release-denied', expectedSetupRevision: 1,
    }, 'u1')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(read('sessions/s1/seats/seat-2')).toMatchObject({ holderUid: 'u2' });
  });

  it('requires the claimed holder document and pointer to agree before release', async () => {
    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 0, configurationLocked: false,
      activeRoleIds: ['admiral', 'seat-1'],
    });
    player('u1', { seatId: 'seat-2' });
    seat('seat-1', { status: 'claimed', holderUid: 'u1' });
    await expect(releaseSeat.run(request({
      sessionId: 's1', seatId: 'seat-1', requestId: 'release-pointer-mismatch', expectedSetupRevision: 0,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(read('sessions/s1/seats/seat-1')).toMatchObject({ status: 'claimed', holderUid: 'u1' });

    put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true, seatId: null });
    put('sessions/s1/gmInstances/bridge', { uid: 'u1' });
    await expect(releaseSeat.run(request({
      sessionId: 's1', seatId: 'seat-1', requestId: 'release-missing-holder', expectedSetupRevision: 0,
      instanceId: 'bridge', reason: 'Remove stale holder',
    }))).resolves.toMatchObject({ status: 'committed', seatId: 'seat-1', setupRevision: 1 });
    expect(read('sessions/s1/seats/seat-1')).toMatchObject({ status: 'open', holderUid: null });
    expect(read('sessions/s1/events/seat-release-release-missing-holder')).toMatchObject({
      reason: 'Remove stale holder', actorUid: 'u1', seatId: 'seat-1',
    });

    put('sessions/s1', {
      phase: 'lobby', currentTurn: 0, setupRevision: 1, configurationLocked: false,
      activeRoleIds: ['admiral', 'seat-1'],
    });
    put('sessions/s1/seats/seat-1', { roleId: 'seat-1', status: 'claimed', holderUid: 'u9' });
    await expect(releaseSeat.run(request({
      sessionId: 's1', seatId: 'seat-1', requestId: 'release-missing-reason', expectedSetupRevision: 1,
      instanceId: 'bridge',
    }))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
