import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type StoredDocument = Record<string, unknown>;

const mock = vi.hoisted(() => {
  type Ref = {
    path: string;
    id: string;
    get: () => Promise<unknown>;
    set: (fields: StoredDocument) => Promise<void>;
    update: (fields: StoredDocument) => Promise<void>;
    delete: () => Promise<void>;
  };
  type Query = {
    query: true;
    path: string;
    filters: ReadonlyArray<readonly [string, unknown]>;
    where: (field: string, operator: string, value: unknown) => Query;
    orderBy: () => Query;
    get: () => Promise<{ docs: Array<ReturnType<typeof snapshot>>; size: number }>;
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
    set: async (fields) => { documents.set(path, { ...fields }); },
    update: async (fields) => directUpdate(ref(path), fields),
    delete: async () => { documents.delete(path); },
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
    get: async () => querySnapshot(query(path, filters)),
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
    query: true as const,
    path,
    filters: [] as ReadonlyArray<readonly [string, unknown]>,
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
  FieldValue: {
    serverTimestamp: () => {
      const milliseconds = Date.now();
      return { toMillis: () => milliseconds };
    },
  },
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

import {
  claimGmInstance,
  elevateToGm,
  loginGmAccess,
  logoutGmAccess,
  kickPlayer,
  listGmInstances,
  releaseGmInstance,
  setFacilitatorResponsibility,
} from './index';
import { GM_ACCESS_TIMEOUT_MS } from './gmAccess';

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

async function login() {
  await loginGmAccess.run(request({ password: 'bananasplit' }));
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
  it('lets one active GM instance carry both printed responsibilities', async () => {
    session({ phase: 'lobby', currentTurn: 0, setupRevision: 0, configurationLocked: false });
    player('u1', { role: 'gm' });
    instance('bridge', 'u1');

    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', responsibility: 'main',
      requestId: 'responsibility-1', expectedSetupRevision: 0, mode: 'share',
    }))).resolves.toMatchObject({
      status: 'committed', setupRevision: 1,
      responsibilities: ['main', 'assistant'],
      coverage: { main: ['bridge'], assistant: ['bridge'] },
    });
    expect(read('sessions/s1/gmInstances/bridge')).toMatchObject({
      responsibilities: ['main', 'assistant'],
    });

    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', responsibility: 'main',
      requestId: 'responsibility-1', expectedSetupRevision: 0, mode: 'share',
    }))).resolves.toMatchObject({ status: 'replayed', setupRevision: 1 });

    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', responsibility: 'assistant',
      requestId: 'responsibility-1', expectedSetupRevision: 0, mode: 'share',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });

    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', responsibility: 'main',
      requestId: 'responsibility-1', expectedSetupRevision: 1, mode: 'share',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('projects a legacy singular responsibility to both labels for the sole active GM', async () => {
    session({ phase: 'lobby', setupRevision: 0, configurationLocked: false });
    player('u1', { role: 'gm' });
    instance('bridge', 'u1');
    put('sessions/s1/gmInstances/bridge', {
      ...read('sessions/s1/gmInstances/bridge'), responsibility: 'main',
    });

    await expect(listGmInstances.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
      instances: [expect.objectContaining({
        id: 'bridge', responsibilities: ['main', 'assistant'], responsibility: 'main',
      })],
    });
  });

  it('applies share and handoff to the requested target instance and binds target in replay', async () => {
    session({ phase: 'lobby', setupRevision: 0, configurationLocked: false });
    player('u1', { role: 'gm' });
    player('u2', { role: 'gm' });
    instance('bridge', 'u1');
    instance('tablet', 'u2');
    put('sessions/s1/gmInstances/bridge', {
      ...read('sessions/s1/gmInstances/bridge'), responsibilities: ['main', 'assistant'], responsibility: 'main',
    });
    put('sessions/s1/gmInstances/tablet', {
      ...read('sessions/s1/gmInstances/tablet'), responsibilities: [],
    });

    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', targetInstanceId: 'tablet', responsibility: 'main',
      requestId: 'responsibility-share-target', expectedSetupRevision: 0, mode: 'share',
    }))).resolves.toMatchObject({
      status: 'committed', setupRevision: 1,
      coverage: { main: ['bridge', 'tablet'], assistant: ['bridge'] },
    });
    expect(read('sessions/s1/gmInstances/tablet')).toMatchObject({ responsibilities: ['main'] });

    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', targetInstanceId: 'tablet', responsibility: 'assistant',
      requestId: 'responsibility-handoff-target', expectedSetupRevision: 1, mode: 'handoff',
    }))).resolves.toMatchObject({
      status: 'committed', setupRevision: 2,
      coverage: { main: ['bridge', 'tablet'], assistant: ['tablet'] },
    });
    expect(read('sessions/s1/gmInstances/bridge')).toMatchObject({ responsibilities: ['main'] });
    expect(read('sessions/s1/gmInstances/tablet')).toMatchObject({ responsibilities: ['main', 'assistant'] });

    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', targetInstanceId: 'bridge', responsibility: 'main',
      requestId: 'responsibility-share-target', expectedSetupRevision: 0, mode: 'share',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('logs in and out of persistent GM access', async () => {
    await expect(loginGmAccess.run(request({ password: 'bananasplit' })))
      .resolves.toEqual({ authenticated: true });
    expect(read('gmAccess/u1')).toMatchObject({ uid: 'u1' });

    await expect(logoutGmAccess.run(request({}))).resolves.toEqual({ authenticated: false });
    expect(read('gmAccess/u1')).toBeUndefined();
  });

  it('logging out releases this browser GM instance', async () => {
    session();
    player('u1', { role: 'gm' });
    instance('bridge', 'u1');
    await login();

    await expect(logoutGmAccess.run(request({ sessionId: 's1', instanceId: 'bridge' })))
      .resolves.toEqual({ authenticated: false });

    expect(read('gmAccess/u1')).toBeUndefined();
    expect(read('sessions/s1/gmInstances/bridge')).toBeUndefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'player' });
  });

  it('rejects a wrong login password without creating access state', async () => {
    await expect(loginGmAccess.run(request({ password: 'not-the-password' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(read('gmAccess/u1')).toBeUndefined();
  });

  it('claims a named browser atomically and raises only its owner to GM', async () => {
    session();
    player('u1');
    await login();

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
    await login();

    await expect(claimGmInstance.run(request({
      sessionId: 's1',
      instanceId: 'bridge',
      name: 'Bridge laptop',
      deviceLabel: 'Test browser',
    }))).rejects.toMatchObject({ code: 'already-exists' });

    expect(read('sessions/s1/gmInstances/bridge')).toMatchObject({ uid: 'u2' });
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'player' });
  });

  it('rejects a GM claim when this browser has not logged in', async () => {
    session();
    player('u1');

    await expect(claimGmInstance.run(request({
      sessionId: 's1',
      instanceId: 'bridge',
      name: 'Bridge laptop',
      deviceLabel: 'Test browser',
    }))).rejects.toMatchObject({ code: 'permission-denied' });

    expect(read('sessions/s1/gmInstances/bridge')).toBeUndefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'player' });
  });

  it('rejects a GM claim after the remembered access window expires', async () => {
    session();
    player('u1');
    await login();
    put('gmAccess/u1', {
      uid: 'u1',
      authenticatedAt: { toMillis: () => Date.now() - GM_ACCESS_TIMEOUT_MS - 1 },
    });

    await expect(claimGmInstance.run(request({
      sessionId: 's1',
      instanceId: 'bridge',
      name: 'Bridge laptop',
      deviceLabel: 'Test browser',
    }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(read('sessions/s1/gmInstances/bridge')).toBeUndefined();
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

  it('kicks a player browser, frees its seat, and blocks its return to this session', async () => {
    session();
    player('u1', { role: 'gm' });
    player('u2', { seatId: 'seat-1' });
    put('sessions/s1/seats/seat-1', {
      status: 'claimed', holderUid: 'u2', claimedAt: 'server-time',
    });
    put('activeMemberships/u2', { sessionId: 's1' });
    instance('bridge', 'u1');

    await expect(kickPlayer.run(request({
      sessionId: 's1', instanceId: 'bridge', targetUid: 'u2',
    }))).resolves.toEqual({ targetUid: 'u2' });

    expect(read('sessions/s1/players/u2')).toMatchObject({
      connected: false,
      role: 'player',
      activeConsoleRoleId: null,
      kickedAt: expect.anything(),
    });
    expect(read('sessions/s1/seats/seat-1')).toMatchObject({
      status: 'open', holderUid: null, claimedAt: null,
    });
    expect(read('activeMemberships/u2')).toBeUndefined();
  });

  it('does not let an ordinary player kick another browser', async () => {
    session();
    player('u1');
    player('u2');
    instance('bridge', 'u1');

    await expect(kickPlayer.run(request({
      sessionId: 's1', instanceId: 'bridge', targetUid: 'u2',
    }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(read('sessions/s1/players/u2')).toMatchObject({ connected: true });
  });
});
