import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type StoredDocument = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const DELETE = Symbol('delete-field');

  class MockTimestamp {
    constructor(private readonly value: Date) {}

    static fromDate(value: Date) {
      return new MockTimestamp(value);
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
    get: () => Promise<ReturnType<typeof snapshot>>;
    set: (fields: StoredDocument) => Promise<void>;
    update: (fields: StoredDocument) => Promise<void>;
    delete: () => Promise<void>;
  };
  type Query = {
    query: true;
    path: string;
    filters: ReadonlyArray<readonly [string, unknown]>;
    where: (field: string, operator: string, value: unknown) => Query;
    orderBy: (...args: unknown[]) => Query;
  };

  const documents = new Map<string, StoredDocument>();
  let generatedSession = 0;

  function applyFields(path: string, fields: StoredDocument, replace: boolean) {
    const next: StoredDocument = replace ? {} : { ...(documents.get(path) ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      if (value === DELETE) delete next[key];
      else next[key] = value;
    }
    documents.set(path, next);
  }

  function documentId(path: string) {
    return path.split('/').at(-1) ?? '';
  }

  function ref(path: string): Ref {
    return {
      path,
      id: documentId(path),
      get: async () => snapshot(ref(path)),
      set: async (fields) => applyFields(path, fields, true),
      update: async (fields) => applyFields(path, fields, false),
      delete: async () => { documents.delete(path); },
    };
  }

  function snapshot(target: Ref) {
    const fields = documents.get(target.path);
    return {
      exists: fields !== undefined,
      id: target.id,
      ref: target,
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  }

  function query(
    path: string,
    filters: ReadonlyArray<readonly [string, unknown]> = [],
  ): Query {
    return {
      query: true,
      path,
      filters,
      where: (field, operator, value) => {
        if (operator !== '==') throw new Error(`Unsupported query operator: ${operator}`);
        return query(path, [...filters, [field, value]]);
      },
      orderBy: () => query(path, filters),
    };
  }

  function querySnapshot(target: Query) {
    const docs = [...documents.keys()]
      .filter((path) => path.startsWith(target.path + '/') &&
        path.split('/').length === target.path.split('/').length + 1)
      .map((path) => ref(path))
      .filter((candidate) => target.filters.every(([field, value]) =>
        snapshot(candidate).get(field) === value))
      .map((candidate) => snapshot(candidate));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }

  const get = vi.fn(async (target: Ref | Query) =>
    'query' in target ? querySnapshot(target) : snapshot(target));
  const set = vi.fn((target: Ref, fields: StoredDocument) => applyFields(target.path, fields, true));
  const update = vi.fn((target: Ref, fields: StoredDocument) => applyFields(target.path, fields, false));
  const remove = vi.fn((target: Ref) => { documents.delete(target.path); });
  const collection = (path: string) => ({
    query: true as const,
    path,
    filters: [] as ReadonlyArray<readonly [string, unknown]>,
    doc: (id?: string) => ref(`${path}/${id ?? `session-${++generatedSession}`}`),
    where: (field: string, operator: string, value: unknown) => query(path).where(field, operator, value),
    orderBy: (...args: unknown[]) => query(path).orderBy(...args),
  });

  return {
    documents,
    reset: () => {
      documents.clear();
      generatedSession = 0;
      get.mockClear();
      set.mockClear();
      update.mockClear();
      remove.mockClear();
    },
    MockTimestamp,
    randomInt: vi.fn((first: number, second?: number) => second === undefined ? 0 : 1001),
    randomUUID: vi.fn(() => 'composition-uuid'),
    db: {
      doc: ref,
      collection,
      runTransaction: (callback: (tx: unknown) => unknown) =>
        callback({ get, set, update, delete: remove }),
    },
    DELETE,
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    randomInt: mock.randomInt,
    randomUUID: mock.randomUUID,
  };
});
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: {
    delete: () => mock.DELETE,
    serverTimestamp: () => mock.MockTimestamp.now(),
  },
  Timestamp: mock.MockTimestamp,
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
  assignRole,
  claimGmInstance,
  claimSeat,
  confirmSetup,
  createSession,
  elevateToGm,
  joinSession,
  loginGmAccess,
  refreshPresence,
  startGame,
} from './index';

type CompositionCount = 8 | 19 | 20;

function request<T extends Record<string, unknown>>(data: T, uid: string) {
  return { data, auth: { uid } } as CallableRequest<T>;
}

function read(path: string) {
  return mock.documents.get(path);
}

function stateSnapshot() {
  return JSON.stringify([...mock.documents.entries()]);
}

async function composeProductionSession(playerCount: CompositionCount) {
  const ownerUid = `gm-${playerCount}`;
  const created = await createSession.run(request({
    requestId: `create-${playerCount}`,
    name: `Production ${playerCount}`,
    displayName: 'Production GM',
    playerCount,
    chartId: 'A',
    expansion: playerCount >= 19 ? 'capybara' : 'base',
    turnLimit: 8,
  }, ownerUid));
  const session = created.session as Record<string, unknown>;
  const sessionId = session.id as string;
  const joinCode = session.joinCode as string;
  const activeRoleIds = [...session.activeRoleIds as string[]];
  const coreUids = activeRoleIds.map((_roleId, index) => `player-${playerCount}-${index}`);

  for (const uid of coreUids) {
    await joinSession.run(request({ joinCode, displayName: uid }, uid));
  }
  if (playerCount === 20) {
    await joinSession.run(request({ joinCode, displayName: 'Press Officer' }, `press-${playerCount}`));
  }

  await elevateToGm.run(request({ sessionId, targetUid: ownerUid }, ownerUid));
  await loginGmAccess.run(request({ password: 'bananasplit' }, ownerUid));
  await claimGmInstance.run(request({
    sessionId,
    instanceId: `bridge-${playerCount}`,
    name: 'Bridge GM',
    deviceLabel: 'Composition test',
  }, ownerUid));

  const configuration = {
    sessionId,
    instanceId: `bridge-${playerCount}`,
    requestId: `confirm-${playerCount}`,
    expectedSetupRevision: 0,
    playerCount,
    chartId: 'A',
    expansion: playerCount >= 19 ? 'capybara' : 'base',
    turnLimit: 8,
    dioneEnabled: playerCount >= 12,
    capybaraEnabled: true,
    activeRoleIds,
  };
  const confirmed = await confirmSetup.run(request(configuration, ownerUid)) as {
    setupRevision: number;
  };
  let setupRevision = confirmed.setupRevision;
  for (const [index, roleId] of activeRoleIds.entries()) {
    const uid = coreUids[index]!;
    const assignment = await assignRole.run(request({
      sessionId,
      instanceId: `bridge-${playerCount}`,
      requestId: `assign-${playerCount}-${index}`,
      targetUid: uid,
      roleId,
    }, ownerUid));
    setupRevision = (assignment as { setupRevision: number }).setupRevision;
    const seat = await claimSeat.run(request({
      sessionId,
      seatId: roleId,
      requestId: `seat-${playerCount}-${index}`,
      expectedSetupRevision: setupRevision,
    }, uid));
    setupRevision = (seat as { setupRevision: number }).setupRevision;
  }

  if (playerCount === 20) {
    await refreshPresence.run(request({ sessionId, activeConsoleRoleId: 'press-officer' }, `press-${playerCount}`));
  }

  const startRequest = {
    sessionId,
    instanceId: `bridge-${playerCount}`,
    requestId: `start-${playerCount}`,
    expectedSetupRevision: setupRevision,
  };
  const started = await startGame.run(request(startRequest, ownerUid)) as {
    status: string;
    setupRevision: number;
    currentTurn: number;
    setupReceipt: Record<string, unknown>;
  };

  return {
    ownerUid,
    sessionId,
    activeRoleIds,
    coreUids,
    started,
    startRequest,
  };
}

describe('Prompt 020 production lobby-to-Team-Phase composition', () => {
  beforeEach(() => mock.reset());

  it.each([
    [8, 1, 8, false],
    [19, 2, 19, false],
    [20, 2, 21, true],
  ] as const)('runs the production callable path for the %i-player row', async (
    playerCount,
    expectedWolfCount,
    expectedHolderCount,
    pressClaimed,
  ) => {
    const composition = await composeProductionSession(playerCount);
    const { started, sessionId, activeRoleIds, coreUids, ownerUid, startRequest } = composition;
    expect(started.status).toBe('committed');
    expect(started.currentTurn).toBe(1);
    expect(started.setupReceipt).toMatchObject({
      playerCount,
      wolfCount: expectedWolfCount,
      excludedGmCount: 1,
      pressEligibility: { claimed: pressClaimed },
    });

    const storedSession = read(`sessions/${sessionId}`);
    expect(storedSession).toMatchObject({
      phase: 'active',
      currentTurn: 1,
      configurationLocked: true,
      pursuitGroups: { fleet: 2 },
      activeRoleIds,
    });
    expect((read(`sessions/${sessionId}/gmInstances/bridge-${playerCount}`) as StoredDocument).responsibilities)
      .toEqual(['main', 'assistant']);

    const claimedSeats = [...mock.documents.entries()]
      .filter(([path, fields]) => path.startsWith(`sessions/${sessionId}/seats/`) && fields.status === 'claimed');
    expect(claimedSeats).toHaveLength(activeRoleIds.length);
    expect(new Set(coreUids.map((uid) => (read(`sessions/${sessionId}/players/${uid}`) as StoredDocument).assignedRoleId)).size)
      .toBe(activeRoleIds.length);

    const loyaltySecrets = [...mock.documents.entries()]
      .filter(([path]) => path.startsWith(`sessions/${sessionId}/secrets/loyalty-`));
    expect(loyaltySecrets).toHaveLength(expectedHolderCount);
    for (const [, secret] of loyaltySecrets) {
      expect(secret.visibleToUids).toHaveLength(1);
      expect(secret).not.toHaveProperty('selectedWolfRoleIds');
    }
    expect(read(`sessions/${sessionId}/secrets/wolf-assignment`)).toMatchObject({
      visibleToUids: [ownerUid],
    });

    const stateAfterStart = stateSnapshot();
    await expect(startGame.run(request(startRequest, coreUids[0]!))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(stateSnapshot()).toBe(stateAfterStart);

    await expect(startGame.run(request(startRequest, ownerUid))).resolves.toMatchObject({
      status: 'replayed',
      currentTurn: 1,
      setupRevision: started.setupRevision,
    });
    expect(stateSnapshot()).toBe(stateAfterStart);

    const stale = await startGame.run(request({
      ...startRequest,
      requestId: `${startRequest.requestId}-stale`,
      expectedSetupRevision: 0,
    }, ownerUid));
    expect(stale).toMatchObject({ status: 'stale', currentSetupRevision: started.setupRevision });
    expect(read(`sessions/${sessionId}`)).toMatchObject({ phase: 'active', currentTurn: 1 });
  });
});
