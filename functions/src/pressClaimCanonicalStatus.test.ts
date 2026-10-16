import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type StoredDocument = Record<string, unknown>;
// Reuses the existing lifecycle transaction fixture. Server timestamp stand-ins
// resolve on commit to Timestamp.now(), so a genuinely joined native actor has a live lease.
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

import { joinSession, refreshPresence, resumeSession } from './index';
import { recommendedRoleIds } from './roleConfiguration';
import { canonicalSessionSetup, normalizeSessionConfiguration } from './gameSetup';
const NOW = new Date('2026-10-06T10:00:00.000Z');
const UID = 'native-new-press';
function request<T extends StoredDocument>(data: T, uid = UID) {
  return { data, auth: { uid } } as CallableRequest<T>;
}
function actor() { return mock.documents.get(`sessions/s1/players/${UID}`)!; }
async function join() {
  expect(mock.documents.has(`sessions/s1/players/${UID}`)).toBe(false);
  await expect(joinSession.run(request({ joinCode: '482109', displayName: 'Native Press' })))
    .resolves.toMatchObject({ session: { id: 's1' }, player: { uid: UID, sessionId: 's1' } });
  expect(actor()).toMatchObject({ uid: UID, sessionId: 's1', role: 'player', connected: true,
    connectionGeneration: 1, activeConsoleRoleId: null });
  expect(actor()).not.toHaveProperty('replacementStatus');
}
const claim = () => refreshPresence.run(request({ sessionId: 's1', activeConsoleRoleId: 'press-officer' }));

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  mock.documents.clear(); mock.get.mockClear(); mock.update.mockClear(); mock.set.mockClear();
  mock.remove.mockClear(); mock.runTransaction.mockClear(); mock.transactionTraces.length = 0;
  mock.setBeforeTransaction(undefined); mock.setAfterReadOnlyTransaction(undefined);
  mock.setRejectQueryLeaseWrites(false); mock.setRejectReadsAfterWrite(false);
  mock.documents.set('joinCodes/482109', { sessionId: 's1' });
  const setup = canonicalSessionSetup(normalizeSessionConfiguration({
    playerCount: 20, chartId: 'A', expansion: 'capybara', turnLimit: 6,
  }), recommendedRoleIds(20));
  mock.documents.set('sessions/s1', { name: 'Native', joinCode: '482109', phase: 'lobby', currentTurn: 0,
    ...setup, setup, ownerUid: 'native-gm', pressEnabled: true, setupRevision: 0,
    deleteAfter: null });
});
afterEach(() => vi.useRealTimers());

it('normal join then genuine Press claim persists explicit inactive replacement status on the same actor', async () => {
  await join();
  const generation = actor().connectionGeneration;
  await expect(claim()).resolves.toEqual({ sessionId: 's1' });
  expect(actor()).toMatchObject({ uid: UID, sessionId: 's1', role: 'player', connected: true,
    activeConsoleRoleId: 'press-officer', replacementStatus: null, connectionGeneration: generation });
  expect(mock.documents.get('sessions/s1')!.pressHolderUid).toBe(UID);
  const claimWrite = mock.update.mock.calls.find(([ref, fields]) => ref.path === `sessions/s1/players/${UID}` &&
    fields.activeConsoleRoleId === 'press-officer');
  expect(claimWrite?.[1]).toHaveProperty('replacementStatus', null);
  // Canonical stored truth survives resume; the existing SDK reply continues
  // to omit inactive optional replacement fields rather than inventing defaults.
  await expect(resumeSession.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    player: { uid: UID, activeConsoleRoleId: 'press-officer' },
  });
  expect(actor()).toHaveProperty('replacementStatus', null);
});

it.each([
  ['replacement pending', { replacementStatus: 'awaiting-re-role' }, 'failed-precondition'],
  ['replacement assigned', { replacementRoleId: 'warrior-captain' }, 'failed-precondition'],
  ['core assignment', { assignedRoleId: 'admiral' }, 'failed-precondition'],
  ['core seat', { seatId: 'admiral' }, 'failed-precondition'],
  ['GM actor', { role: 'gm' }, 'permission-denied'],
  ['disconnected', { connected: false }, 'permission-denied'],
  ['kicked', { kickedAt: NOW.toISOString() }, 'permission-denied'],
] as const)('a fresh %s actor cannot gain Press or erase replacement truth', async (_label, patch, code) => {
  await join(); Object.assign(actor(), patch);
  const before = { ...actor() };
  await expect(claim()).rejects.toMatchObject({ code });
  expect(actor()).toEqual(before);
  expect(mock.update.mock.calls.some(([ref, fields]) => ref.path === `sessions/s1/players/${UID}` &&
    Object.hasOwn(fields, 'replacementStatus'))).toBe(false);
});

it('disabled Press preserves the original claim denial and absent optional status', async () => {
  await join(); mock.documents.get('sessions/s1')!.pressEnabled = false;
  await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(actor().activeConsoleRoleId).toBeNull();
  expect(actor()).not.toHaveProperty('replacementStatus');
});

it('a foreign live Press holder keeps the original already-exists denial and remains byte-identical', async () => {
  await join();
  const foreign = { uid: 'foreign', sessionId: 's1', role: 'player', connected: true,
    activeConsoleRoleId: 'press-officer', assignedRoleId: null, seatId: null,
    lastSeenAt: mock.Timestamp.now(), connectionGeneration: 3, replacementStatus: null };
  mock.documents.set('sessions/s1/players/foreign', foreign);
  await expect(claim()).rejects.toMatchObject({ code: 'already-exists' });
  expect(actor()).not.toHaveProperty('replacementStatus');
  expect(mock.documents.get('sessions/s1/players/foreign')).toEqual(foreign);
});

it('a legacy already-active stable Press heartbeat is not a new claim or optional-field rewrite', async () => {
  await join(); Object.assign(actor(), { activeConsoleRoleId: 'press-officer', assignedRoleId: null });
  mock.documents.get('sessions/s1')!.pressHolderUid = UID;
  await expect(refreshPresence.run(request({ sessionId: 's1' }))).resolves.toEqual({ sessionId: 's1' });
  expect(actor()).not.toHaveProperty('replacementStatus');
});

it('an ordinary core claim does not acquire the Press-only canonical status write', async () => {
  await join(); Object.assign(actor(), { assignedRoleId: 'admiral', seatId: 'admiral' });
  Object.assign(mock.documents.get('sessions/s1/seats/admiral')!, { status: 'claimed', holderUid: UID });
  await expect(refreshPresence.run(request({ sessionId: 's1', activeConsoleRoleId: 'admiral' })))
    .resolves.toEqual({ sessionId: 's1' });
  expect(actor().activeConsoleRoleId).toBe('admiral');
  expect(actor()).not.toHaveProperty('replacementStatus');
});
