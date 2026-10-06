import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { PRESENCE_LEASE_MS } from './sessionLifecycle';
import { recommendedRoleIds } from './roleConfiguration';
import { escapeStateForDestruction } from './escapeState';

type StoredDocument = Record<string, unknown>;
// Reuse the existing lifecycle native fixture's inert SDK/transaction ports.
// The actual refreshPresence callable and current-member reader execute.
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
  let afterPlayerQuery: (() => void) | undefined;
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
    const result = 'query' in target ? querySnapshot(target)
      : 'id' in target ? snapshot(target) : querySnapshot(query(target.path));
    if (!('id' in target) && target.path.endsWith('/players') && afterPlayerQuery) {
      const after = afterPlayerQuery; afterPlayerQuery = undefined; after();
    }
    return result;
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
          target.path.split('/').at(-2) === 'players' &&
          trace.reads.some(read => read.query && read.path === target.path.split('/').slice(0, -1).join('/'))) {
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
    setAfterPlayerQuery: (hook: (() => void) | undefined) => { afterPlayerQuery = hook; },
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

import { getCurrentMemberSession, refreshPresence, resumeSession } from './index';

// Exact retained Gate2_6 authority tuple and issue/completion times. These are
// inert native Auth/DB inputs, not replayed SDK replies or historical causality.
const sid = '1GFzaqK5xTbaWuvmHId7';
const pressUid = '2rXU71SUXqCT06IcpJ4i6YGBw7BQ';
const gmUid = 'native-press-renewal-gm';
const roles = recommendedRoleIds(20);
const lastSeenAtMs = 1_791_311_026_478;
const issuedAtMs = 1_791_311_035_969;
const completedAtMs = 1_791_311_073_020;
const request = (uid: string, data: Record<string, unknown>) => ({ auth: { uid }, data }) as CallableRequest;
const playerPath = `sessions/${sid}/players/${pressUid}`;
const membershipPath = `activeMemberships/${pressUid}`;
const sessionPath = `sessions/${sid}`;
const put = (path: string, fields: StoredDocument) => mock.documents.set(path, { ...fields });
const read = (path: string) => mock.documents.get(path);
const change = (path: string, fields: StoredDocument) => put(path, { ...read(path), ...fields });
const renew = (activeConsoleRoleId: string | undefined = 'press-officer') =>
  refreshPresence.run(request(pressUid, { sessionId: sid, ...(activeConsoleRoleId === undefined ? {} : { activeConsoleRoleId }) }));
const leaseWriteTraces = () => mock.transactionTraces.filter(t => t.writes.includes(playerPath));
const clearTraces = () => {
  mock.transactionTraces.length = 0; mock.get.mockClear(); mock.update.mockClear(); mock.set.mockClear(); mock.remove.mockClear();
};

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(lastSeenAtMs);
  mock.documents.clear(); clearTraces(); mock.runTransaction.mockClear(); mock.recursiveDelete.mockClear();
  mock.setBeforeTransaction(undefined); mock.setAfterReadOnlyTransaction(undefined);
  mock.setRejectQueryLeaseWrites(false); mock.setRejectReadsAfterWrite(false); mock.setAfterPlayerQuery(undefined);
});
afterEach(() => vi.useRealTimers());

async function originalCurrentPressTable() {
  put(sessionPath, { name: 'Native original Press table', joinCode: 'NATIVE', phase: 'active',
    ownerUid: gmUid, setupRevision: 42, configurationLocked: true, activeRoleIds: roles,
    playerCount: 20, chartId: 'A', expansion: 'capybara', capybaraEnabled: true,
    pressEnabled: true, deleteAfter: null, currentTurn: 1,
    turnPhase: { turn: 1, teamPhaseEndsAt: new Date(lastSeenAtMs + 600_000).toISOString(),
      openAirspaceEndsAt: new Date(lastSeenAtMs + 900_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } } });
  for (const [i, roleId] of roles.entries()) {
    const uid = `native-press-renewal-core-${i}`;
    put(`sessions/${sid}/players/${uid}`, { uid, sessionId: sid, displayName: uid, role: 'player',
      assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: roleId, replacementStatus: null,
      connected: true, connectionGeneration: 3, lastSeenAt: mock.Timestamp.now(), joinedAt: mock.Timestamp.now() });
    put(`sessions/${sid}/seats/${roleId}`, { roleId, status: 'claimed', holderUid: uid, claimedAt: mock.Timestamp.now() });
    put(`activeMemberships/${uid}`, { sessionId: sid, connectedAt: mock.Timestamp.now() });
  }
  for (const [uid, role, activeConsoleRoleId] of [[gmUid, 'gm', null], [pressUid, 'player', 'press-officer']] as const) {
    put(`sessions/${sid}/players/${uid}`, { uid, sessionId: sid, displayName: uid, role,
      assignedRoleId: null, seatId: null, activeConsoleRoleId, replacementStatus: null,
      connected: true, connectionGeneration: 3, lastSeenAt: mock.Timestamp.now(), joinedAt: mock.Timestamp.now() });
    put(`activeMemberships/${uid}`, { sessionId: sid, connectedAt: mock.Timestamp.now() });
  }
  // Use the original server producer, not a fabricated canonical fleet/projection.
  await resumeSession.run(request(gmUid, { sessionId: sid }));
  await refreshPresence.run(request(pressUid, { sessionId: sid, activeConsoleRoleId: 'press-officer' }));
  // Exact current SNN control from the original captured privacy command;
  // this is authoritative inert DB fixture state, not a fabricated SDK reply.
  change(sessionPath, { shuttleControl: { 'snn-press-shuttle': {
    shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: pressUid, holderUid: pressUid, revision: 0,
  } } });
  put(`sessions/${sid}/secrets/foreign-native-private`, { uid: 'foreign-player', privateMarker: 'FOREIGN_PRIVATE_DATA' });
  const current = await getCurrentMemberSession.run(request(pressUid, { sessionId: sid }));
  expect(current).toMatchObject({ actorUid: pressUid, sessionId: sid, connectionGeneration: 3,
    assignedRoleId: null, activeConsoleRoleId: 'press-officer' });
  expect(read(playerPath)).toMatchObject({ uid: pressUid, sessionId: sid, connectionGeneration: 3,
    assignedRoleId: null, activeConsoleRoleId: 'press-officer', seatId: null, replacementStatus: null });
  expect(current.session.memberSessionScope).toMatchObject({ vesselIds: [], craftIds: ['snn-press-shuttle'] });
  expect(read(sessionPath)?.pressHolderUid).toBe(pressUid);
  expect(read(playerPath)?.lastSeenAt).toBeInstanceOf(mock.Timestamp);
  expect((read(playerPath)?.lastSeenAt as InstanceType<typeof mock.Timestamp>).toMillis()).toBe(lastSeenAtMs);
  vi.setSystemTime(issuedAtMs); clearTraces();
  return current;
}

function assertPointRenewal() {
  const writes = leaseWriteTraces();
  expect(writes).toHaveLength(1);
  expect(writes[0].reads.every(r => !r.query)).toBe(true);
  expect(new Set(writes[0].writes)).toEqual(new Set([playerPath, membershipPath, `sessions/${sid}/presenceReconciliations/${pressUid}`]));
  const preflight = mock.transactionTraces.filter(t => t.readOnly && t.reads.some(r => r.query && r.path === `sessions/${sid}/players`));
  expect(preflight).toHaveLength(1); expect(preflight[0].writes).toEqual([]);
}

function assertNoRenewal() {
  expect(mock.update).not.toHaveBeenCalled(); expect(mock.set).not.toHaveBeenCalled(); expect(mock.remove).not.toHaveBeenCalled();
  expect((read(playerPath)?.lastSeenAt as InstanceType<typeof mock.Timestamp>).toMillis()).toBe(lastSeenAtMs);
}

function assertFullReconciliation() {
  expect(mock.transactionTraces.some(t => !t.readOnly && t.reads.some(r => r.query && r.path === `sessions/${sid}/players`))).toBe(true);
}

describe('current original Press lease uses read-only exclusivity plus atomic point renewal', () => {
  it('keeps the exact live UID/SID/gen3 tuple without a writing holder-query transaction', async () => {
    const current = await originalCurrentPressTable(); const before = new Map(mock.documents);
    expect(issuedAtMs - lastSeenAtMs).toBe(9491);
    expect(await renew()).toEqual({ sessionId: sid }); assertPointRenewal();
    expect(read(playerPath)).toMatchObject({ uid: pressUid, sessionId: sid, connected: true, connectionGeneration: 3,
      assignedRoleId: null, activeConsoleRoleId: 'press-officer', seatId: null, replacementStatus: null });
    expect(read(sessionPath)).toEqual(before.get(sessionPath));
    for (const [path, value] of before) if (path !== playerPath && path !== membershipPath && !path.includes('/presenceReconciliations/')) expect(read(path)).toEqual(value);
    const after = await getCurrentMemberSession.run(request(pressUid, { sessionId: sid }));
    expect(after.session.memberSessionScope).toEqual(current.session.memberSessionScope);
    expect(JSON.stringify(after)).not.toContain('FOREIGN_PRIVATE_DATA');
  });

  it('keeps an omitted-role heartbeat on the same current-holder renewal path', async () => {
    await originalCurrentPressTable();
    expect(await refreshPresence.run(request(pressUid, { sessionId: sid }))).toEqual({ sessionId: sid }); assertPointRenewal();
  });

  it('executes the original callable when the inert DB forbids query-plus-lease writes', async () => {
    await originalCurrentPressTable(); mock.setRejectQueryLeaseWrites(true);
    expect(await renew()).toEqual({ sessionId: sid }); assertPointRenewal();
  });

  it('does every renewal read before the original writes', async () => {
    await originalCurrentPressTable(); mock.setRejectReadsAfterWrite(true);
    expect(await renew()).toEqual({ sessionId: sid }); assertPointRenewal();
  });

  it.each([45_000, 45_750])('denies a lease already aged %ims without renewal', async age => {
    await originalCurrentPressTable(); expect(PRESENCE_LEASE_MS).toBe(45_000); vi.setSystemTime(lastSeenAtMs + age);
    await expect(renew()).rejects.toMatchObject({ code: 'permission-denied' }); assertNoRenewal();
  });

  it('does not renew after the original query crosses the exact retained completion age', async () => {
    await originalCurrentPressTable(); mock.setAfterPlayerQuery(() => vi.setSystemTime(completedAtMs));
    expect(completedAtMs - lastSeenAtMs).toBe(46_542);
    await expect(renew()).rejects.toMatchObject({ code: 'permission-denied' }); assertNoRenewal();
  });

  it('rechecks expiry after a successful read-only preflight, before any renewal write', async () => {
    await originalCurrentPressTable(); mock.setAfterReadOnlyTransaction(() => vi.setSystemTime(completedAtMs));
    await expect(renew()).rejects.toMatchObject({ code: 'permission-denied' }); assertNoRenewal();
  });

  it.each([
    ['generation', () => change(playerPath, { connectionGeneration: 4 })],
    ['UID tuple', () => change(playerPath, { uid: 'foreign-player' })],
    ['SID tuple', () => change(playerPath, { sessionId: 'foreign-session' })],
    ['escape marker', () => change(playerPath, { escapeState: escapeStateForDestruction('snn-press-shuttle', 'native-destruction', 1) })],
    ['closed phase', () => change(sessionPath, { phase: 'closed' })],
    ['disconnected', () => change(playerPath, { connected: false })],
    ['kick', () => change(playerPath, { kickedAt: mock.Timestamp.now() })],
    ['replacement', () => change(playerPath, { replacementStatus: 'pending' })],
    ['historical role', () => change(playerPath, { replacementRoleId: roles[0] })],
    ['core assignment', () => change(playerPath, { assignedRoleId: roles[0] })],
    ['core seat', () => change(playerPath, { seatId: roles[0] })],
    ['released console', () => change(playerPath, { activeConsoleRoleId: null })],
    ['foreign membership', () => change(membershipPath, { sessionId: 'foreign-session' })],
    ['missing membership', () => mock.documents.delete(membershipPath)],
    ['different holder', () => change(sessionPath, { pressHolderUid: 'foreign-player' })],
    ['disabled Press', () => change(sessionPath, { pressEnabled: false })],
    ['configuration', () => change(sessionPath, { setupRevision: 43 })],
  ] as const)('denies changed %s authority between preflight and renewal without writes', async (_label, mutate) => {
    await originalCurrentPressTable(); mock.setAfterReadOnlyTransaction(mutate);
    await expect(renew()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.update).not.toHaveBeenCalled(); expect(mock.set).not.toHaveBeenCalled(); expect(mock.remove).not.toHaveBeenCalled();
  });

  it('preserves the original malformed escape failed-precondition without any renewal write', async () => {
    await originalCurrentPressTable();
    mock.setAfterReadOnlyTransaction(() => change(playerPath, { escapeState: { status: 'required' } }));
    await expect(renew()).rejects.toMatchObject({ code: 'failed-precondition', details: { commandError: 'malformed-input' } });
    expect(mock.update).not.toHaveBeenCalled(); expect(mock.set).not.toHaveBeenCalled(); expect(mock.remove).not.toHaveBeenCalled();
  });

  it.each(['missing-generation', 'missing-lastSeen', 'missing-membership'] as const)('keeps the original %s legacy reconciliation rather than granting the fast path', async kind => {
    await originalCurrentPressTable();
    if (kind === 'missing-generation') { const p = { ...read(playerPath) }; delete p.connectionGeneration; put(playerPath, p); }
    if (kind === 'missing-lastSeen') { const p = { ...read(playerPath) }; delete p.lastSeenAt; put(playerPath, p); }
    if (kind === 'missing-membership') mock.documents.delete(membershipPath);
    expect(await renew()).toEqual({ sessionId: sid }); assertFullReconciliation();
    expect(mock.transactionTraces.filter(t => !t.readOnly && t.writes.includes(playerPath)).length).toBe(1);
  });

  it('does not renew an expired legacy actor after fallback queries', async () => {
    await originalCurrentPressTable(); const actor = { ...read(playerPath) }; delete actor.connectionGeneration; put(playerPath, actor);
    mock.setAfterPlayerQuery(() => vi.setSystemTime(completedAtMs));
    await expect(renew()).rejects.toMatchObject({ code: 'permission-denied' }); assertNoRenewal();
  });

  it('retains canonical exclusivity when another ordinary actor attempts Press during preflight', async () => {
    await originalCurrentPressTable(); const uid = 'native-competing-press';
    mock.setAfterReadOnlyTransaction(async () => {
      put(`sessions/${sid}/players/${uid}`, { uid, sessionId: sid, displayName: uid, role: 'player',
        connected: true, connectionGeneration: 1, activeConsoleRoleId: null, assignedRoleId: null,
        seatId: null, replacementStatus: null, lastSeenAt: mock.Timestamp.now() });
      put(`activeMemberships/${uid}`, { sessionId: sid, connectedAt: mock.Timestamp.now() });
      await expect(refreshPresence.run(request(uid, { sessionId: sid, activeConsoleRoleId: 'press-officer' })))
        .rejects.toMatchObject({ code: 'already-exists' });
    });
    expect(await renew()).toEqual({ sessionId: sid }); assertPointRenewal();
    expect(read(sessionPath)?.pressHolderUid).toBe(pressUid);
    expect(read(`sessions/${sid}/players/${uid}`)?.activeConsoleRoleId).toBe(null);
    expect(read(`sessions/${sid}/secrets/foreign-native-private`)?.privateMarker).toBe('FOREIGN_PRIVATE_DATA');
  });

  it('keeps duplicate current Press markers on original authority cleanup', async () => {
    await originalCurrentPressTable(); const uid = 'native-other-press';
    put(`sessions/${sid}/players/${uid}`, { uid, sessionId: sid, displayName: uid, role: 'player',
      connected: true, connectionGeneration: 1, activeConsoleRoleId: 'press-officer', assignedRoleId: null,
      seatId: null, replacementStatus: null, lastSeenAt: mock.Timestamp.now() });
    const reply = await renew(); expect(reply).toEqual({ sessionId: sid, stationSelectionRequired: true });
    assertFullReconciliation(); expect(read(playerPath)?.activeConsoleRoleId).toBe(null);
    expect(read(sessionPath)?.pressHolderUid).toBe(uid);
  });

  it('keeps inactive legacy Press marker cleanup on the original private reconciliation path', async () => {
    await originalCurrentPressTable(); const uid = 'native-old-press';
    put(`sessions/${sid}/players/${uid}`, { uid, sessionId: sid, displayName: uid, role: 'player',
      connected: false, activeConsoleRoleId: 'press-officer', assignedRoleId: null, seatId: null,
      replacementStatus: null, lastSeenAt: mock.Timestamp.fromMillis(lastSeenAtMs - 45_000) });
    expect(await renew()).toEqual({ sessionId: sid }); assertFullReconciliation();
    expect(read(`sessions/${sid}/players/${uid}`)?.activeConsoleRoleId).toBe(null);
    expect(read(`sessions/${sid}/secrets/foreign-native-private`)?.privateMarker).toBe('FOREIGN_PRIVATE_DATA');
  });
});
