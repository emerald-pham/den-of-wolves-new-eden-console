import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const writes = {
    update: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

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

  const querySnapshot = (path: string) => {
    const prefix = `${path}/`;
    const docs = [...documents.keys()]
      .filter((candidate) => candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes('/'))
      .map(snapshot);
    return { docs, size: docs.length, empty: docs.length === 0 };
  };

  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const collection = (path: string) => ({
    query: true,
    path,
    doc: (id: string) => ref(`${path}/${id}`),
    where: () => ({ query: true, path }),
  });

  const get = vi.fn(async (target: { path: string; query?: boolean }) =>
    target.query ? querySnapshot(target.path) : snapshot(target.path));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const remove = vi.fn((target: { path: string }) => {
    documents.delete(target.path);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set, delete: remove }));

  return {
    documents,
    get,
    ...writes,
    remove,
    update,
    set,
    runTransaction,
    db: { doc: ref, collection, runTransaction },
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
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

import { setPressEnabled } from './index';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'press-1',
  pressEnabled: false,
  expectedRevision: 0,
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function session(fields: Fields = {}): void {
  put('sessions/s1', {
    phase: 'lobby',
    pressEnabled: true,
    pressAvailabilityRevision: 0,
    ...fields,
  });
}

function gm(uid = 'u1', instanceId = 'gm-1', fields: Fields = {}): void {
  put(`sessions/s1/players/${uid}`, {
    uid,
    role: 'gm',
    connected: true,
    ...fields,
  });
  put(`sessions/s1/gmInstances/${instanceId}`, {
    uid,
    connected: true,
    claimedAt: { toMillis: () => Date.now() },
    lastSeenAt: { toMillis: () => Date.now() },
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.remove.mockClear();
  mock.runTransaction.mockClear();
});

it('freezes Press roster mutations during endgame evaluation', async () => {
  session({ phase: 'debrief' });
  gm();

  await expect(setPressEnabled.run(request())).rejects
    .toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('changes Press with a server revision, audit, and holder revocation only', async () => {
  session({
    activeRoleIds: ['admiral'],
    pressDispatch: {
      dispatches: [{ id: 'dispatch-1', text: 'SNN // Convoy arrival confirmed' }],
      revision: 7,
    },
  });
  gm();
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true,
    activeConsoleRoleId: 'press-officer', assignedRoleId: null,
  });
  put('sessions/s1/players/u3', {
    uid: 'u3', role: 'player', connected: true,
    activeConsoleRoleId: null, assignedRoleId: 'admiral',
  });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 0 },
  });
  put('sessions/s1/secrets/loyalty-u3', {
    visibleToUids: ['u3'],
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });
  put('sessions/s1/secrets/wolf-assignment', {
    payload: { type: 'wolf-assignment', roleIds: ['press-officer', 'admiral'] },
    visibleToUids: [],
  });

  await expect(setPressEnabled.run(request())).resolves.toEqual({
    pressEnabled: false,
    revision: 1,
  });

  expect(mock.documents.get('sessions/s1')).toMatchObject({
    pressEnabled: false,
    pressAvailabilityRevision: 1,
    activeRoleIds: ['admiral'],
    pressDispatch: {
      dispatches: [{ id: 'dispatch-1', text: 'SNN // Convoy arrival confirmed' }],
      revision: 7,
    },
  });
  expect(mock.documents.get('sessions/s1/players/u2')).toMatchObject({
    activeConsoleRoleId: null,
    assignedRoleId: null,
  });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-u2')).toBeUndefined();
  expect(mock.documents.get('sessions/s1/players/u3')).toMatchObject({
    activeConsoleRoleId: null,
    assignedRoleId: 'admiral',
  });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-u3')).toMatchObject({
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });
  expect(mock.documents.get('sessions/s1/secrets/wolf-assignment')).toMatchObject({
    payload: { type: 'wolf-assignment', roleIds: ['admiral'] },
  });
  expect(mock.documents.get('sessions/s1/events/press-availability-press-1')).toMatchObject({
    type: 'press-availability',
    actorUid: 'u1',
    expectedRevision: 0,
    pressEnabled: false,
  });
  expect(mock.documents.get('sessions/s1/commandReceipts/press-1')).toMatchObject({
    fingerprint: {
      action: 'set-press-availability', sessionId: 's1', requestId: 'press-1',
      actorUid: 'u1', instanceId: 'gm-1', expectedRevision: 0,
      payload: { pressEnabled: false },
    },
    result: { pressEnabled: false, revision: 1 },
  });

  await expect(setPressEnabled.run(request({
    ...baseData,
    requestId: 'press-on',
    pressEnabled: true,
    expectedRevision: 1,
  }))).resolves.toEqual({ pressEnabled: true, revision: 2 });
  expect(mock.documents.get('sessions/s1/players/u2')).toMatchObject({
    activeConsoleRoleId: null,
    assignedRoleId: null,
  });
});

it('clears a legacy Press console claim without deleting a core assignment or its loyalty', async () => {
  session({ activeRoleIds: ['admiral'] });
  gm();
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true,
    activeConsoleRoleId: 'press-officer', assignedRoleId: 'admiral',
  });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });

  await expect(setPressEnabled.run(request({
    ...baseData,
    requestId: 'press-legacy-off',
  }))).resolves.toEqual({ pressEnabled: false, revision: 1 });

  expect(mock.documents.get('sessions/s1/players/u2')).toMatchObject({
    activeConsoleRoleId: null,
    assignedRoleId: 'admiral',
  });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-u2')).toMatchObject({
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });
});

it('clears a disconnected legacy Press-only assignment even when no live console claim remains', async () => {
  session({ activeRoleIds: ['admiral'] });
  gm();
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: false,
    activeConsoleRoleId: null, assignedRoleId: 'press-officer',
  });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'], payload: { type: 'loyalty', kind: 'wolf-agent' },
  });

  await expect(setPressEnabled.run(request({
    ...baseData,
    requestId: 'press-legacy-assignment-off',
  }))).resolves.toEqual({ pressEnabled: false, revision: 1 });

  expect(mock.documents.get('sessions/s1/players/u2')).toMatchObject({
    activeConsoleRoleId: null,
    assignedRoleId: null,
  });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-u2')).toBeUndefined();
});

it('rejects a stale opposite GM command without overwriting the newer choice', async () => {
  session();
  gm();
  await setPressEnabled.run(request());
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(setPressEnabled.run(request({
    ...baseData,
    requestId: 'press-stale',
    pressEnabled: true,
    expectedRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/Press availability changed/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    pressEnabled: false,
    pressAvailabilityRevision: 1,
  });
});

it('records a stale same-state receipt so its exact retry cannot observe a later revision', async () => {
  session({ pressEnabled: false, pressAvailabilityRevision: 3 });
  gm();

  const staleRequest = request({
    ...baseData,
    pressEnabled: false,
    expectedRevision: 1,
  });
  await expect(setPressEnabled.run(staleRequest)).resolves.toEqual({ pressEnabled: false, revision: 3 });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/commandReceipts/press-1' }),
    expect.objectContaining({ result: { pressEnabled: false, revision: 3 } }),
  );

  mock.set.mockClear();
  await expect(setPressEnabled.run(staleRequest)).resolves.toEqual({ pressEnabled: false, revision: 3 });
  expect(mock.set).not.toHaveBeenCalled();
});

it('replays a request result without writing a second audit event', async () => {
  session();
  gm();

  const first = await setPressEnabled.run(request());
  mock.update.mockClear();
  mock.set.mockClear();
  const second = await setPressEnabled.run(request());

  expect(second).toEqual(first);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each([
  ['pressEnabled', { pressEnabled: true }],
  ['expectedRevision', { expectedRevision: 1 }],
] as const)('rejects a %s change when a Press request id is already bound', async (_field, change) => {
  session({ pressEnabled: false, pressAvailabilityRevision: 1 });
  gm();
  const receiptPath = 'sessions/s1/commandReceipts/press-1';
  const priorReceipt = {
    fingerprint: {
      action: 'set-press-availability', sessionId: 's1', requestId: 'press-1',
      actorUid: 'u1', instanceId: 'gm-1', expectedRevision: 0,
      payload: { pressEnabled: false },
    },
    result: { pressEnabled: false, revision: 1, privateDetail: 'classified prior result' },
  } satisfies Fields;
  put(receiptPath, priorReceipt);
  const sessionBefore = { ...mock.documents.get('sessions/s1') };
  const receiptBefore = { ...priorReceipt, result: { ...priorReceipt.result } };

  mock.update.mockClear();
  mock.set.mockClear();
  mock.remove.mockClear();
  const replay = setPressEnabled.run(request({ ...baseData, ...change }));
  await expect(replay).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.not.stringContaining('classified prior result'),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1')).toEqual(sessionBefore);
  expect(mock.documents.get(receiptPath)).toEqual(receiptBefore);
});

it('denies a foreign UID reusing a Press receipt without disclosing its result or writing', async () => {
  session({ pressEnabled: false, pressAvailabilityRevision: 1 });
  gm();
  gm('u2', 'gm-2');
  const receiptPath = 'sessions/s1/commandReceipts/press-1';
  const priorReceipt = {
    fingerprint: {
      action: 'set-press-availability', sessionId: 's1', requestId: 'press-1',
      actorUid: 'u1', instanceId: 'gm-1', expectedRevision: 0,
      payload: { pressEnabled: false },
    },
    result: { pressEnabled: false, revision: 1, privateDetail: 'classified prior result' },
  } satisfies Fields;
  put(receiptPath, priorReceipt);
  const sessionBefore = { ...mock.documents.get('sessions/s1') };
  const receiptBefore = { ...priorReceipt, result: { ...priorReceipt.result } };

  mock.update.mockClear();
  mock.set.mockClear();
  mock.remove.mockClear();
  const replay = setPressEnabled.run(request({ ...baseData, instanceId: 'gm-2' }, 'u2'));
  await expect(replay).rejects.toMatchObject({
    code: 'permission-denied',
    message: expect.not.stringContaining('classified prior result'),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1')).toEqual(sessionBefore);
  expect(mock.documents.get(receiptPath)).toEqual(receiptBefore);
});

it('requires the calling UID to own the named live GM instance', async () => {
  session();
  gm('u1', 'gm-1');
  gm('u2', 'gm-2');

  await expect(setPressEnabled.run(request({ ...baseData, instanceId: 'gm-2' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('serializes two authorized GMs with a stale rejection and current-revision retry', async () => {
  session();
  gm('u1', 'gm-1');
  gm('u2', 'gm-2');

  await expect(setPressEnabled.run(request({ ...baseData, requestId: 'press-gm1-off' }, 'u1')))
    .resolves.toEqual({ pressEnabled: false, revision: 1 });

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(setPressEnabled.run(request({
    ...baseData,
    instanceId: 'gm-2',
    requestId: 'press-gm2-stale',
    pressEnabled: true,
    expectedRevision: 0,
  }, 'u2'))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/Press availability changed/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  await expect(setPressEnabled.run(request({
    ...baseData,
    instanceId: 'gm-2',
    requestId: 'press-gm2-on',
    pressEnabled: true,
    expectedRevision: 1,
  }, 'u2'))).resolves.toEqual({ pressEnabled: true, revision: 2 });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    pressEnabled: true,
    pressAvailabilityRevision: 2,
  });
  expect(mock.documents.get('sessions/s1/events/press-availability-press-gm1-off'))
    .toMatchObject({ actorUid: 'u1' });
  expect(mock.documents.get('sessions/s1/events/press-availability-press-gm2-on'))
    .toMatchObject({ actorUid: 'u2' });
  expect(mock.documents.get('sessions/s1/commandReceipts/press-gm1-off'))
    .toMatchObject({ result: { pressEnabled: false, revision: 1 } });
  expect(mock.documents.get('sessions/s1/commandReceipts/press-gm2-on'))
    .toMatchObject({ result: { pressEnabled: true, revision: 2 } });
});

it('rejects disconnected and missing stale GM instances without writing', async () => {
  session();
  gm('u1', 'gm-1', { connected: false });

  await expect(setPressEnabled.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.documents.set('sessions/s1/players/u1', {
    uid: 'u1', role: 'gm', connected: true,
  });
  mock.documents.delete('sessions/s1/gmInstances/gm-1');
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(setPressEnabled.run(request({ ...baseData, requestId: 'missing-instance' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.documents.set('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: false });
  await expect(setPressEnabled.run(request({ ...baseData, requestId: 'disconnected-instance' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});
