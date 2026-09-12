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
    get: () => query(path).get(),
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
  setGmControlsLocked,
  setFacilitatorResponsibility,
  setFleetRedAlert,
  unlockPressAirspace,
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

  it.each([
    ['a core seat pointer', { seatId: 'admiral' }, {}],
    ['a core assigned role', { assignedRoleId: 'admiral' }, {}],
    ['an active Press role', { activeConsoleRoleId: 'press-officer' }, { pressHolderUid: 'u2' }],
    ['claimed Press authority', { activeConsoleRoleId: null }, { pressHolderUid: 'u2' }],
  ] as const)('rejects elevation of a target with %s without writing', async (_label, fields, sessionFields) => {
    session(sessionFields);
    player('u1');
    player('u2', fields);
    mock.directUpdate.mockClear();
    mock.update.mockClear();
    mock.set.mockClear();
    mock.remove.mockClear();

    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });

    expect(read('sessions/s1/players/u2')).toMatchObject({ role: 'player', ...fields });
    expect(read('sessions/s1')).toMatchObject(sessionFields);
    expect(mock.directUpdate).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('allows an active GM but rejects inactive callers, inactive targets, and ordinary players', async () => {
    session({ ownerUid: 'owner' });
    player('u1', { role: 'gm' });
    player('u2');
    instance('bridge', 'u1');

    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2', instanceId: 'bridge' })))
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
    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2', instanceId: 'bridge' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('does not let a stale GM role elevate another player without a live instance', async () => {
    session({ ownerUid: 'owner' });
    player('u1', { role: 'gm' });
    player('u2');

    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(read('sessions/s1/players/u2')).toMatchObject({ role: 'player' });
  });

  it('binds GM elevation to the exact live browser instance', async () => {
    session({ ownerUid: 'owner' });
    player('u1', { role: 'gm' });
    player('u2');
    instance('bridge', 'u1');
    put('sessions/s1/gmInstances/stale', {
      uid: 'u1', sessionId: 's1', name: 'Stale', deviceLabel: 'Old browser',
      connected: false, claimedAt: 'old-server-time',
    });

    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2', instanceId: 'stale' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(elevateToGm.run(request({ sessionId: 's1', targetUid: 'u2', instanceId: 'bridge' })))
      .resolves.toMatchObject({ targetUid: 'u2', role: 'gm' });
  });
});

describe('GM instance ownership', () => {
  it('returns a safe stale receipt when facilitator revision changed before saving', async () => {
    session({ phase: 'lobby', currentTurn: 0, setupRevision: 5, configurationLocked: false });
    player('u1', { role: 'gm' });
    instance('bridge', 'u1');

    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', responsibility: 'main',
      requestId: 'responsibility-stale-receipt', expectedSetupRevision: 4, mode: 'share',
    }))).resolves.toEqual({
      status: 'stale', requestId: 'responsibility-stale-receipt', entity: 'facilitator',
      expectedRevision: 4, currentRevision: 5,
    });
    expect(read('sessions/s1/gmResponsibilityRequests/responsibility-stale-receipt'))
      .toMatchObject({ reply: expect.objectContaining({ status: 'stale' }) });
    expect(read('sessions/s1/gmInstances/bridge')).not.toHaveProperty('responsibilities');
    expect(read('sessions/s1')).toMatchObject({ setupRevision: 5 });

    session({ phase: 'lobby', currentTurn: 0, setupRevision: 4, configurationLocked: false });
    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', responsibility: 'main',
      requestId: 'responsibility-stale-receipt', expectedSetupRevision: 4, mode: 'share',
    }))).resolves.toEqual({
      status: 'stale', requestId: 'responsibility-stale-receipt', entity: 'facilitator',
      expectedRevision: 4, currentRevision: 5,
    });
  });

  it('does not replay a responsibility receipt for an inactive or foreign facilitator', async () => {
    session({ phase: 'lobby', currentTurn: 0, setupRevision: 0, configurationLocked: false });
    player('u1', { role: 'gm' });
    instance('bridge', 'u1');
    const command = {
      sessionId: 's1', instanceId: 'bridge', responsibility: 'main' as const,
      requestId: 'responsibility-replay-authority', expectedSetupRevision: 0, mode: 'share' as const,
    };
    await setFacilitatorResponsibility.run(request(command));

    player('u1', { role: 'gm', connected: false });
    await expect(setFacilitatorResponsibility.run(request(command))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(setFacilitatorResponsibility.run(request(command, 'u2'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

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
    expect(read('sessions/s1/events/gm-responsibility-responsibility-1')).not.toHaveProperty('fingerprint');
    expect(read('sessions/s1/events/gm-responsibility-responsibility-1')).not.toHaveProperty('reply');

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

  it('returns only live GM claims and never exposes stale handoff targets', async () => {
    session();
    player('u1', { role: 'gm' });
    player('u2', { role: 'gm', connected: false });
    instance('bridge', 'u1');
    put('sessions/s1/gmInstances/bridge', {
      ...read('sessions/s1/gmInstances/bridge'), responsibility: 'main',
    });
    put('sessions/s1/gmInstances/stale', {
      uid: 'u2', sessionId: 's1', name: 'Old tablet', deviceLabel: 'Test browser',
      connected: false, responsibilities: ['main', 'assistant'], claimedAt: 'old-server-time',
    });

    await expect(listGmInstances.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
      instances: [expect.objectContaining({ id: 'bridge', responsibilities: ['main', 'assistant'] })],
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

  it('does not assign an optional lane to a stale GM instance', async () => {
    session({ phase: 'lobby', setupRevision: 0, configurationLocked: false });
    player('u1', { role: 'gm' });
    player('u2', { role: 'gm' });
    instance('bridge', 'u1');
    put('sessions/s1/gmInstances/tablet', {
      uid: 'u2', sessionId: 's1', name: 'Tablet', deviceLabel: 'Test browser',
      connected: false, responsibilities: [], claimedAt: 'old-server-time',
    });
    mock.update.mockClear();
    mock.set.mockClear();

    await expect(setFacilitatorResponsibility.run(request({
      sessionId: 's1', instanceId: 'bridge', targetInstanceId: 'tablet', responsibility: 'main',
      requestId: 'responsibility-stale-target', expectedSetupRevision: 0, mode: 'share',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(read('sessions/s1/gmInstances/bridge')).toMatchObject({ uid: 'u1' });
    expect(read('sessions/s1/gmInstances/tablet')).toMatchObject({
      connected: false, responsibilities: [],
    });
    expect(read('sessions/s1')).toMatchObject({ setupRevision: 0 });
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
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

  it('lets a new GM recover a locked table when only a stale instance remains', async () => {
    session({ gmControlsLocked: true });
    player('u1');
    player('u2', { role: 'gm', connected: false });
    put('sessions/s1/gmInstances/stale', {
      uid: 'u2',
      sessionId: 's1',
      name: 'Old tablet',
      deviceLabel: 'Test browser',
      connected: false,
      responsibilities: ['main', 'assistant'],
      claimedAt: 'old-server-time',
    });
    await login();

    await expect(claimGmInstance.run(request({
      sessionId: 's1',
      instanceId: 'bridge',
      name: 'Bridge laptop',
      deviceLabel: 'Test browser',
    }))).resolves.toMatchObject({
      instance: { id: 'bridge', uid: 'u1', responsibilities: ['main', 'assistant'] },
    });

    expect(read('sessions/s1/gmInstances/bridge')).toMatchObject({
      uid: 'u1', responsibilities: ['main', 'assistant'],
    });
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'gm' });
    expect(read('sessions/s1/gmInstances/stale')).toBeDefined();
  });

  it('adds a post-start GM to the existing Wolf assignment audience without replacing its secret', async () => {
    session({ phase: 'active', currentTurn: 1 });
    player('u1');
    put('sessions/s1/secrets/wolf-assignment', {
      visibleToUids: ['u2'],
      payload: { type: 'wolf-assignment', roleIds: ['admiral'] },
      createdAt: 'start-time',
    });
    await login();

    await expect(claimGmInstance.run(request({
      sessionId: 's1', instanceId: 'bridge', name: 'Bridge laptop', deviceLabel: 'Test browser',
    }))).resolves.toMatchObject({ instance: { id: 'bridge', uid: 'u1' } });

    expect(read('sessions/s1/secrets/wolf-assignment')).toEqual({
      visibleToUids: ['u2', 'u1'],
      payload: { type: 'wolf-assignment', roleIds: ['admiral'] },
      createdAt: 'start-time',
    });
  });

  it.each([
    ['a core seat pointer', { seatId: 'admiral' }],
    ['a core assigned role', { assignedRoleId: 'admiral' }],
  ] as const)('rejects GM promotion with %s without mutating authority', async (_label, fields) => {
    session();
    player('u1', fields);
    await login();
    mock.directUpdate.mockClear();
    mock.update.mockClear();
    mock.set.mockClear();
    mock.remove.mockClear();

    await expect(claimGmInstance.run(request({
      sessionId: 's1', instanceId: 'bridge', name: 'Bridge laptop', deviceLabel: 'Test browser',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(read('sessions/s1/gmInstances/bridge')).toBeUndefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'player', ...fields });
    expect(mock.directUpdate).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
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
    put('sessions/s1/secrets/wolf-assignment', {
      visibleToUids: ['u2'],
      payload: { type: 'wolf-assignment', roleIds: ['admiral'] },
    });

    await expect(claimGmInstance.run(request({
      sessionId: 's1',
      instanceId: 'bridge',
      name: 'Bridge laptop',
      deviceLabel: 'Test browser',
    }))).rejects.toMatchObject({ code: 'permission-denied' });

    expect(read('sessions/s1/gmInstances/bridge')).toBeUndefined();
    expect(read('sessions/s1/players/u1')).toMatchObject({ role: 'player' });
    expect(read('sessions/s1/secrets/wolf-assignment')).toMatchObject({ visibleToUids: ['u2'] });
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

describe('GM registration lock', () => {
  it('rejects a stale GM instance from changing the shared registration lock', async () => {
    session({ phase: 'active', currentTurn: 1 });
    player('u1', { role: 'gm' });
    put('sessions/s1/gmInstances/bridge', {
      uid: 'u1', sessionId: 's1', name: 'Bridge', deviceLabel: 'Test browser',
      connected: false, claimedAt: 'old-server-time',
    });

    await expect(setGmControlsLocked.run(request({
      sessionId: 's1', instanceId: 'bridge', locked: true,
    }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(read('sessions/s1')).toMatchObject({ gmControlsLocked: false });
  });

  it('requires a live GM instance for role-only fleet authority fallbacks', async () => {
    session({ phase: 'active', currentTurn: 1 });
    player('u1', { role: 'gm' });

    await expect(setFleetRedAlert.run(request({
      sessionId: 's1', active: true, expectedRevision: 0,
    }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(unlockPressAirspace.run(request({ sessionId: 's1' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(read('sessions/s1')).toMatchObject({ phase: 'active', currentTurn: 1 });
  });

  it('binds role-only fleet commands to the exact live browser instance', async () => {
    const now = Date.now();
    session({
      phase: 'active', currentTurn: 1,
      turnPhase: {
        turn: 1,
        teamPhaseEndsAt: new Date(now + 60_000).toISOString(),
        openAirspaceEndsAt: new Date(now + 1_800_000).toISOString(),
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
    });
    player('u1', { role: 'gm' });
    instance('bridge', 'u1');
    put('sessions/s1/gmInstances/stale', {
      uid: 'u1', sessionId: 's1', name: 'Stale', deviceLabel: 'Old browser',
      connected: false, claimedAt: 'old-server-time',
    });

    await expect(setFleetRedAlert.run(request({
      sessionId: 's1', active: true, expectedRevision: 0,
    }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setFleetRedAlert.run(request({
      sessionId: 's1', active: true, expectedRevision: 0, instanceId: 'stale',
    }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setFleetRedAlert.run(request({
      sessionId: 's1', active: true, expectedRevision: 0, instanceId: 'bridge',
    }))).resolves.toMatchObject({ active: true, revision: 1 });

    await expect(unlockPressAirspace.run(request({ sessionId: 's1', instanceId: 'stale' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(unlockPressAirspace.run(request({ sessionId: 's1', instanceId: 'bridge' })))
      .resolves.toMatchObject({ turnPhase: expect.objectContaining({
        airspace: expect.objectContaining({ pressAccess: true }),
      }) });
  });

  it('freezes registration mutations during endgame evaluation', async () => {
    session({ phase: 'debrief' });
    player('u1', { role: 'gm' });
    instance('bridge', 'u1');

    await expect(setGmControlsLocked.run(request({
      sessionId: 's1', instanceId: 'bridge', locked: true,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(read('sessions/s1')).toMatchObject({ gmControlsLocked: false, phase: 'debrief' });
    expect(mock.update).not.toHaveBeenCalled();
  });
});
