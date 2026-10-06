import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { PRESENCE_LEASE_MS } from './sessionLifecycle';
import { recommendedRoleIds } from './roleConfiguration';

type StoredDocument = Record<string, unknown>;
// Reuse the existing lifecycle native fixture's inert SDK/transaction ports.
// The real index callable, expiry handler and current-member reader execute.
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
    set: (fields: StoredDocument) => Promise<void>;
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

  const applyFields = (previous: StoredDocument, fields: StoredDocument, mergeMaps = false): StoredDocument => {
    const next = { ...previous };
    for (const [field, value] of Object.entries(fields)) {
      if (value === 'delete-field') delete next[field];
      else if (mergeMaps && value !== null && typeof value === 'object' &&
          Object.getPrototypeOf(value) === Object.prototype) {
        const existing = next[field];
        next[field] = applyFields(existing !== null && typeof existing === 'object' &&
          Object.getPrototypeOf(existing) === Object.prototype ? existing as StoredDocument : {}, value as StoredDocument, true);
      } else next[field] = value;
    }
    return next;
  };
  const documents = new Map<string, StoredDocument>();
  let beforeTransaction: (() => void) | undefined;
  let afterReadOnlyTransaction: (() => void | Promise<void>) | undefined;
  type TransactionTrace = {
    readOnly: boolean;
    reads: { path: string; query: boolean }[];
    writes: string[];
  };
  const transactionTraces: TransactionTrace[] = [];
  let rejectQueryLeaseWrites = false;
  let transactionDepth = 0;
  let transactionWrote = false;
  let rejectReadsAfterWrite = false;
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
    set: async (fields) => { documents.set(path, { ...fields }); },
    delete: async () => { documents.delete(path); },
  });

  const update = vi.fn((target: Ref, fields: StoredDocument) => {
    if (transactionDepth > 0) transactionWrote = true;
    documents.set(target.path, applyFields(documents.get(target.path) ?? {}, fields));
  });
  const set = vi.fn((target: Ref, fields: StoredDocument, options?: { merge?: boolean; mergeFields?: string[] }) => {
    if (transactionDepth > 0) transactionWrote = true;
    const selected = options?.mergeFields
      ? Object.fromEntries(options.mergeFields.map(field => [field, fields[field]])) : fields;
    documents.set(target.path, applyFields(options?.merge || options?.mergeFields
      ? documents.get(target.path) ?? {} : {}, selected, options?.merge === true));
  });
  const remove = vi.fn((target: Ref) => {
    if (transactionDepth > 0) transactionWrote = true;
    documents.delete(target.path);
  });
  const get = vi.fn(async (target: Ref | Query | Collection) => {
    if (transactionDepth > 0 && rejectReadsAfterWrite && transactionWrote) {
      throw new Error('Firestore transaction read after write');
    }
    return 'query' in target ? querySnapshot(target)
      : 'id' in target ? snapshot(target) : querySnapshot(query(target.path));
  });
  const runTransaction = vi.fn(async (
    callback: (tx: unknown) => unknown,
    options?: { readOnly?: boolean },
  ) => {
    const hook = beforeTransaction;
    beforeTransaction = undefined;
    hook?.();
    const previousDepth = transactionDepth;
    const previousWrote = transactionWrote;
    transactionDepth += 1;
    transactionWrote = false;
    const trace: TransactionTrace = { readOnly: options?.readOnly === true, reads: [], writes: [] };
    transactionTraces.push(trace);
    const recordWrite = (target: Ref, fields?: StoredDocument) => {
      if (trace.readOnly) throw new Error('Write in read-only Firestore transaction');
      // This is a topology contract, not a simulation of emulator capacity.
      // A stable lease write must not upgrade a player query's transaction.
      if (rejectQueryLeaseWrites && fields?.lastSeenAt !== undefined &&
          target.path.startsWith('sessions/s1/players/') &&
          trace.reads.some(read => read.query && read.path === 'sessions/s1/players')) {
        throw new Error('Lease renewal attempted a query-plus-write transaction');
      }
      trace.writes.push(target.path);
    };
    let result: unknown;
    try {
      result = await callback({
        get: (target: Ref | Query | Collection) => {
          trace.reads.push({ path: target.path, query: !('id' in target) });
          return get(target);
        },
        update: (target: Ref, fields: StoredDocument) => {
          recordWrite(target, fields);
          return update(target, fields);
        },
        set: (target: Ref, fields: StoredDocument, settings?: { merge?: boolean; mergeFields?: string[] }) => {
          recordWrite(target, fields);
          return set(target, fields, settings);
        },
        delete: (target: Ref) => {
          recordWrite(target);
          return remove(target);
        },
      });
    } finally {
      transactionDepth = previousDepth;
      transactionWrote = previousWrote;
    }
    if (trace.readOnly && afterReadOnlyTransaction) {
      const after = afterReadOnlyTransaction;
      afterReadOnlyTransaction = undefined;
      await after();
    }
    return result;
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
    transactionTraces,
    setBeforeTransaction: (hook: (() => void) | undefined) => { beforeTransaction = hook; },
    setAfterReadOnlyTransaction: (hook: (() => void | Promise<void>) | undefined) => { afterReadOnlyTransaction = hook; },
    setRejectQueryLeaseWrites: (value: boolean) => { rejectQueryLeaseWrites = value; },
    setRejectReadsAfterWrite: (value: boolean) => { rejectReadsAfterWrite = value; },
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
  FieldValue: { delete: () => 'delete-field', serverTimestamp: () => mock.Timestamp.now() },
  Timestamp: mock.Timestamp,
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string, readonly details?: unknown) {
      super(message);
    }
  },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({ run: maybeHandler ?? optionsOrHandler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { claimGmInstance, expireStalePlayers, getCurrentMemberSession, refreshPresence, resumeSession } from './index';

const NOW = new Date('2026-10-06T17:06:00.000Z');
const sid = 's1';
const roles = recommendedRoleIds(20);
const gmUid = 'native-original-gm';
const pressUid = 'native-original-press';
const instanceId = 'native-original-gm-instance';
const request = (uid: string, data: Record<string, unknown>) => ({ auth: { uid }, data }) as CallableRequest;
const put = (path: string, fields: StoredDocument) => mock.documents.set(path, { ...fields });
const read = (path: string) => mock.documents.get(path);
const actorUid = (index: number) => `native-original-core-${index}`;

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  mock.documents.clear(); mock.transactionTraces.length = 0;
  mock.get.mockClear(); mock.update.mockClear(); mock.set.mockClear(); mock.remove.mockClear();
  mock.runTransaction.mockClear(); mock.recursiveDelete.mockClear();
  mock.setBeforeTransaction(undefined); mock.setAfterReadOnlyTransaction(undefined);
  mock.setRejectQueryLeaseWrites(false); mock.setRejectReadsAfterWrite(false);
});
afterEach(() => vi.useRealTimers());

async function originalExpiredTable() {
  put(`sessions/${sid}`, { name: 'Native original table', joinCode: 'NATIVE', phase: 'active',
    ownerUid: gmUid, setupRevision: 40, configurationLocked: true, activeRoleIds: roles,
    playerCount: 20, chartId: 'A', expansion: 'capybara', capybaraEnabled: true,
    pressEnabled: true, deleteAfter: null, currentTurn: 1,
    turnPhase: { turn: 1, teamPhaseEndsAt: new Date(NOW.getTime() + 600_000).toISOString(),
      openAirspaceEndsAt: new Date(NOW.getTime() + 900_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } } });
  for (const [index, roleId] of roles.entries()) {
    const uid = actorUid(index);
    put(`sessions/${sid}/players/${uid}`, { uid, sessionId: sid, displayName: uid, role: 'player',
      assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: roleId, replacementStatus: null,
      connected: true, connectionGeneration: 7, lastSeenAt: mock.Timestamp.now(), joinedAt: mock.Timestamp.now() });
    put(`sessions/${sid}/seats/${roleId}`, { roleId, status: 'claimed', holderUid: uid, claimedAt: mock.Timestamp.now() });
    put(`activeMemberships/${uid}`, { sessionId: sid, connectedAt: mock.Timestamp.now() });
  }
  for (const [uid, role, activeConsoleRoleId] of [[gmUid, 'gm', null], [pressUid, 'player', 'press-officer']] as const) {
    put(`sessions/${sid}/players/${uid}`, { uid, sessionId: sid, displayName: uid, role,
      assignedRoleId: null, seatId: null, activeConsoleRoleId, replacementStatus: null,
      connected: true, connectionGeneration: 7, lastSeenAt: mock.Timestamp.now(), joinedAt: mock.Timestamp.now() });
    put(`activeMemberships/${uid}`, { sessionId: sid, connectedAt: mock.Timestamp.now() });
  }
  put(`gmAccess/${gmUid}`, { authenticatedAt: mock.Timestamp.now() });
  put(`sessions/${sid}/gmInstances/${instanceId}`, { uid: gmUid, sessionId: sid, connected: true,
    lastSeenAt: mock.Timestamp.now(), claimedAt: mock.Timestamp.now(), name: 'Native facilitator', deviceLabel: 'Native' });
  // The real producer materializes canonical setup, fleet and discovery state.
  await refreshPresence.run(request(actorUid(0), { sessionId: sid, activeConsoleRoleId: roles[0] }));
  await refreshPresence.run(request(pressUid, { sessionId: sid, activeConsoleRoleId: 'press-officer' }));
  const scopes = new Map<string, unknown>();
  for (const uid of [...roles.map((_role, index) => actorUid(index)), pressUid]) {
    const current = await getCurrentMemberSession.run(request(uid, { sessionId: sid }));
    scopes.set(uid, current.session.memberSessionScope);
  }
  vi.setSystemTime(new Date(NOW.getTime() + PRESENCE_LEASE_MS + 750));
  await expireStalePlayers.run({});
  for (const uid of [...roles.map((_role, index) => actorUid(index)), pressUid, gmUid]) {
    expect(read(`sessions/${sid}/players/${uid}`)?.connected).toBe(false);
    expect(read(`activeMemberships/${uid}`)).toBeUndefined();
  }
  for (const roleId of roles) expect(read(`sessions/${sid}/seats/${roleId}`)).toMatchObject({ status: 'open', holderUid: null });
  await resumeSession.run(request(gmUid, { sessionId: sid }));
  await claimGmInstance.run(request(gmUid, { sessionId: sid, instanceId, name: 'Native facilitator', deviceLabel: 'Native' }));
  await refreshPresence.run(request(gmUid, { sessionId: sid, instanceId }));
  const phase = read(`sessions/${sid}`)?.turnPhase;
  mock.transactionTraces.length = 0; mock.get.mockClear(); mock.update.mockClear(); mock.set.mockClear(); mock.remove.mockClear();
  return { scopes, phase };
}

function assertOriginalCoreReply(index: number, reply: Awaited<ReturnType<typeof resumeSession.run>>, scopes: Map<string, unknown>) {
  const uid = actorUid(index), roleId = roles[index];
  expect(reply.player).toMatchObject({ uid, sessionId: sid, assignedRoleId: roleId, seatId: roleId,
    activeConsoleRoleId: roleId, connectionGeneration: 8 });
  expect(read(`sessions/${sid}/players/${uid}`)).toMatchObject({ connected: true, assignedRoleId: roleId, seatId: roleId });
  expect(read(`sessions/${sid}/seats/${roleId}`)).toMatchObject({ status: 'claimed', holderUid: uid, roleId });
  expect(read(`activeMemberships/${uid}`)).toMatchObject({ sessionId: sid });
  expect(reply.session.memberSessionScope).toEqual(scopes.get(uid));
}

describe('original modern core recovery after real source lease expiry', () => {
  it('recovers all20 original open seats without a full-roster query inside their lease-write transactions', async () => {
    const { scopes, phase } = await originalExpiredTable();
    mock.setRejectQueryLeaseWrites(true);
    const replies = await Promise.all(roles.map((_role, index) => resumeSession.run(request(actorUid(index), { sessionId: sid }))));
    replies.forEach((reply, index) => assertOriginalCoreReply(index, reply, scopes));
    expect(read(`sessions/${sid}`)?.turnPhase).toEqual(phase);
    const leaseWrites = mock.transactionTraces.filter(trace => trace.writes.some(path => /^sessions\/s1\/players\/native-original-core-/.test(path)));
    expect(leaseWrites).toHaveLength(20);
    for (const trace of leaseWrites) expect(trace.reads.every(value => !value.query)).toBe(true);
  });

  it('keeps the original21 overlap and source privacy scopes while only Press retains its required reconciliation', async () => {
    const { scopes, phase } = await originalExpiredTable();
    const uids = [...roles.map((_role, index) => actorUid(index)), pressUid];
    const replies = await Promise.all(uids.map(uid => resumeSession.run(request(uid, { sessionId: sid }))));
    replies.slice(0, 20).forEach((reply, index) => assertOriginalCoreReply(index, reply, scopes));
    const press = replies[20];
    expect(press.player).toMatchObject({ uid: pressUid, sessionId: sid, activeConsoleRoleId: 'press-officer', seatId: null });
    expect(press.session.memberSessionScope).toEqual(scopes.get(pressUid));
    expect(press.session.memberSessionScope.vesselIds).toEqual([]);
    expect(read(`sessions/${sid}`)?.turnPhase).toEqual(phase);
    const queryLeaseWrites = mock.transactionTraces.filter(trace => trace.reads.some(value => value.query && value.path === `sessions/${sid}/players`) &&
      trace.writes.some(path => path.startsWith(`sessions/${sid}/players/`)));
    expect(queryLeaseWrites).toHaveLength(1);
    expect(queryLeaseWrites[0].writes.filter(path => path.startsWith(`sessions/${sid}/players/`))).toEqual([`sessions/${sid}/players/${pressUid}`]);
  });
});
