import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type StoredDocument = Record<string, unknown>;

const mock = vi.hoisted(() => {
  type Ref = {
    path: string;
    id: string;
    get: () => Promise<unknown>;
    update: (fields: StoredDocument) => Promise<void>;
  };
  type Query = {
    query: true;
    path: string;
    filters: ReadonlyArray<readonly [string, unknown]>;
    where: (field: string, operator: string, value: unknown) => Query;
    orderBy: () => Query;
  };

  const documents = new Map<string, StoredDocument>();
  const documentId = (path: string) => path.split('/').at(-1) ?? '';
  const directUpdate = vi.fn(async (target: Ref, fields: StoredDocument) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const ref = (path: string): Ref => ({
    path,
    id: documentId(path),
    get: async () => snapshot(ref(path)),
    update: async (fields) => directUpdate(ref(path), fields),
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
    orderBy: () => query(path, filters),
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
  const collection = (path: string) => ({
    path,
    doc: (id?: string) => ref(path + '/' + (id ?? 'generated')),
    where: (field: string, operator: string, value: unknown) =>
      query(path).where(field, operator, value),
    orderBy: () => query(path),
  });

  return {
    documents,
    directUpdate,
    get,
    update,
    set,
    remove,
    db: {
      doc: ref,
      collection,
      runTransaction: (callback: (tx: unknown) => unknown) =>
        callback({ get, update, set, delete: remove }),
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

import { claimGmInstance, elevateToGm, releaseGmInstance } from './index';

function put(path: string, fields: StoredDocument) {
  mock.documents.set(path, { ...fields });
}

function read(path: string) {
  return mock.documents.get(path);
}

function session(fields: StoredDocument = {}) {
  put('sessions/s1', { ownerUid: 'u1', gmControlsLocked: false, ...fields });
}

function player(uid: string, fields: StoredDocument = {}) {
  put('sessions/s1/players/' + uid, {
    uid,
    sessionId: 's1',
    displayName: uid,
    role: 'player',
    connected: true,
    seatId: null,
    ...fields,
  });
}

function instance(id: string, uid: string) {
  put('sessions/s1/gmInstances/' + id, {
    uid,
    sessionId: 's1',
    name: id,
    deviceLabel: 'Test browser',
    claimedAt: 'server-time',
  });
}

function request<T extends Record<string, unknown>>(data: T, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<T>;
}

beforeEach(() => {
  mock.documents.clear();
  mock.directUpdate.mockClear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.remove.mockClear();
});

describe('elevateToGm', () => {
  it('checks authority and promotes the target in one transaction', async () => {
    session();
    player('u1');
    player('u2');

    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2' })))
      .resolves.toEqual({ targetUid: 'u2', role: 'gm' });

    expect(mock.directUpdate).not.toHaveBeenCalled();
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/players/u2' }),
      { role: 'gm' },
    );
    expect(read('sessions/s1/players/u2')).toMatchObject({ role: 'gm' });
  });

  it('allows an active GM but rejects inactive callers, inactive targets, and ordinary players', async () => {
    session({ ownerUid: 'owner' });
    player('u1', { role: 'gm' });
    player('u2');

    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2' })))
      .resolves.toMatchObject({ role: 'gm' });

    player('u1', { role: 'player' });
    player('u2');
    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2' })))
      .rejects.toMatchObject({ code: 'permission-denied' });

    player('u1', { role: 'gm', connected: false });
    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2' })))
      .rejects.toMatchObject({ code: 'permission-denied' });

    player('u1', { role: 'gm' });
    player('u2', { connected: false });
    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('GM instance ownership', () => {
  it('claims a named browser atomically and raises only its owner to GM', async () => {
    session();
    player('u1');

    await expect(claimGmInstance.run(request({
      sessionId: 's1',
      instanceId: 'bridge',
      name: 'Bridge laptop',
      deviceLabel: 'Test browser',
    }))).resolves.toMatchObject({
      instance: { id: 'bridge', uid: 'u1' },
    });

    expect(read('sessions/s1/gmInstances/bridge')).toMatchObject({ uid: 'u1' });
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'gm' });
  });

  it('rejects a duplicate browser identifier owned by somebody else', async () => {
    session();
    player('u1');
    instance('bridge', 'u2');

    await expect(claimGmInstance.run(request({
      sessionId: 's1',
      instanceId: 'bridge',
      name: 'Bridge laptop',
      deviceLabel: 'Test browser',
    }))).rejects.toMatchObject({ code: 'already-exists' });

    expect(read('sessions/s1/gmInstances/bridge')).toMatchObject({ uid: 'u2' });
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'player' });
  });

  it('demotes only when a release removes the target final browser instance', async () => {
    session();
    player('u1', { role: 'gm' });
    instance('bridge', 'u1');

    await releaseGmInstance.run(request({
      sessionId: 's1',
      instanceId: 'bridge',
      targetInstanceId: 'bridge',
    }));

    expect(read('sessions/s1/gmInstances/bridge')).toBeUndefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'player' });

    player('u1', { role: 'gm' });
    instance('bridge', 'u1');
    instance('tablet', 'u1');
    await releaseGmInstance.run(request({
      sessionId: 's1',
      instanceId: 'bridge',
      targetInstanceId: 'bridge',
    }));

    expect(read('sessions/s1/gmInstances/tablet')).toBeDefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'gm' });
  });
});
