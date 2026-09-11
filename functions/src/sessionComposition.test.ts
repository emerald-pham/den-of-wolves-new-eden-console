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
  const versions = new Map<string, number>();
  let generatedSession = 0;

  function applyFields(
    path: string,
    fields: StoredDocument,
    replace: boolean,
    store: Map<string, StoredDocument> = documents,
    versionStore: Map<string, number> = versions,
  ) {
    const next: StoredDocument = replace ? {} : { ...(store.get(path) ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      if (value === DELETE) delete next[key];
      else next[key] = value;
    }
    store.set(path, next);
    versionStore.set(path, (versionStore.get(path) ?? 0) + 1);
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

  function snapshot(target: Ref, store: Map<string, StoredDocument> = documents) {
    const fields = store.get(target.path);
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

  function querySnapshot(target: Query, store: Map<string, StoredDocument> = documents) {
    const docs = [...store.keys()]
      .filter((path) => path.startsWith(target.path + '/') &&
        path.split('/').length === target.path.split('/').length + 1)
      .map((path) => ref(path))
      .filter((candidate) => target.filters.every(([field, value]) =>
        snapshot(candidate, store).get(field) === value))
      .map((candidate) => snapshot(candidate, store));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }

  const get = vi.fn(async (target: Ref | Query) =>
    'query' in target ? querySnapshot(target) : snapshot(target));
  const set = vi.fn((target: Ref, fields: StoredDocument, store = documents,
    versionStore = versions) => applyFields(target.path, fields, true, store, versionStore));
  const update = vi.fn((target: Ref, fields: StoredDocument, store = documents,
    versionStore = versions) => applyFields(target.path, fields, false, store, versionStore));
  const remove = vi.fn((target: Ref, store = documents, versionStore = versions) => {
    store.delete(target.path);
    versionStore.set(target.path, (versionStore.get(target.path) ?? 0) + 1);
  });
  const transactionAttempts = vi.fn();
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      transactionAttempts();
      const working = new Map([...documents.entries()].map(([path, fields]) => [path, { ...fields }]));
      const workingVersions = new Map(versions);
      const baseVersions = new Map(versions);
      const readPaths = new Set<string>();
      const transactionGet = async (target: Ref | Query) => {
        if ('query' in target) {
          const result = querySnapshot(target, working);
          for (const item of result.docs) readPaths.add(item.ref.path);
          return result;
        }
        readPaths.add(target.path);
        return snapshot(target, working);
      };
      const result = await callback({
        get: transactionGet,
        set: (target: Ref, fields: StoredDocument) => set(target, fields, working, workingVersions),
        update: (target: Ref, fields: StoredDocument) => update(target, fields, working, workingVersions),
        delete: (target: Ref) => remove(target, working, workingVersions),
      });
      const conflicted = [...readPaths].some((path) =>
        versions.get(path) !== baseVersions.get(path));
      if (conflicted) continue;
      documents.clear();
      for (const [path, fields] of working) documents.set(path, fields);
      versions.clear();
      for (const [path, version] of workingVersions) versions.set(path, version);
      return result;
    }
    throw new Error('Mock transaction exceeded optimistic retry limit.');
  });
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
      versions.clear();
      generatedSession = 0;
      get.mockClear();
      set.mockClear();
      update.mockClear();
      remove.mockClear();
      runTransaction.mockClear();
      transactionAttempts.mockClear();
    },
    MockTimestamp,
    randomInt: vi.fn((first: number, second?: number) => second === undefined ? 0 : 1001),
    randomUUID: vi.fn(() => 'composition-uuid'),
    db: {
      doc: ref,
      collection,
      runTransaction,
    },
    runTransaction,
    transactionAttempts,
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
  assignLoyalty,
  claimGmInstance,
  claimSeat,
  confirmSetup,
  createSession,
  disconnectFromSession,
  elevateToGm,
  joinSession,
  loginGmAccess,
  refreshPresence,
  releaseRole,
  resumeSession,
  setShipPreference,
  startGame,
} from './index';

type CompositionCount = 8 | 19 | 20;

const EXPECTED_ROSTERS: Readonly<Record<CompositionCount, readonly string[]>> = {
  8: [
    'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
    'quellon-explorer', 'refinery-124-pdf-colonel',
    'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
  ],
  19: [
    'admiral', 'executive-officer', 'wing-commander', 'dione-captain', 'dione-president',
    'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
    'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
    'quellon-captain', 'quellon-engineer', 'quellon-explorer',
    'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
    'capybara-captain', 'capybara-recycler',
  ],
  20: [
    'admiral', 'executive-officer', 'wing-commander', 'dione-captain', 'dione-engineer',
    'dione-president', 'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
    'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
    'quellon-captain', 'quellon-engineer', 'quellon-explorer',
    'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
    'capybara-captain', 'capybara-recycler',
  ],
};

function request<T extends Record<string, unknown>>(data: T, uid: string) {
  return { data, auth: { uid } } as CallableRequest<T>;
}

function read(path: string) {
  return mock.documents.get(path);
}

function canonicalStateValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalStateValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalStateValue(item)]),
  );
}

function stateSnapshot(excludedPaths: readonly string[] = []) {
  const excluded = new Set(excludedPaths);
  return JSON.stringify([...mock.documents.entries()]
    .filter(([path]) => !excluded.has(path))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, fields]) => [path, canonicalStateValue(fields)]));
}

async function composeProductionSession(
  playerCount: CompositionCount,
  options: {
    readonly afterSetup?: (context: {
      readonly sessionId: string;
      readonly ownerUid: string;
      readonly instanceId: string;
      readonly activeRoleIds: readonly string[];
      readonly coreUids: readonly string[];
    }) => Promise<void>;
  } = {},
) {
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
  const expectedRoleIds = EXPECTED_ROSTERS[playerCount];
  expect(session.activeRoleIds).toEqual(expectedRoleIds);
  const activeRoleIds = [...expectedRoleIds];
  const coreUids = activeRoleIds.map((_roleId, index) => `player-${playerCount}-${index}`);

  for (const uid of coreUids) {
    await joinSession.run(request({ joinCode, displayName: uid }, uid));
  }
  let raceJoinResults: PromiseSettledResult<unknown>[] = [];
  const raceJoinUid = playerCount === 8 ? `racer-${playerCount}` : null;
  if (raceJoinUid) {
    raceJoinResults = await Promise.allSettled([
      joinSession.run(request({ joinCode, displayName: 'Racer A' }, raceJoinUid)),
      joinSession.run(request({ joinCode, displayName: 'Racer B' }, raceJoinUid)),
    ]);
    await disconnectFromSession.run(request({ sessionId }, raceJoinUid));
  }
  if (playerCount === 20) {
    await joinSession.run(request({ joinCode, displayName: 'Press Officer' }, `press-${playerCount}`));
  }
  const extraGmUid = playerCount === 20 ? `extra-gm-${playerCount}` : null;
  if (extraGmUid) {
    await joinSession.run(request({ joinCode, displayName: 'Second GM' }, extraGmUid));
  }

  await elevateToGm.run(request({ sessionId, targetUid: ownerUid }, ownerUid));
  await loginGmAccess.run(request({ password: 'bananasplit' }, ownerUid));
  await claimGmInstance.run(request({
    sessionId,
    instanceId: `bridge-${playerCount}`,
    name: 'Bridge GM',
    deviceLabel: 'Composition test',
  }, ownerUid));
  if (extraGmUid) {
    await elevateToGm.run(request({ sessionId, targetUid: extraGmUid }, ownerUid));
    await loginGmAccess.run(request({ password: 'bananasplit' }, extraGmUid));
    await claimGmInstance.run(request({
      sessionId,
      instanceId: `observer-${playerCount}`,
      name: 'Second GM',
      deviceLabel: 'Composition test',
    }, extraGmUid));
  }

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
  await options.afterSetup?.({
    sessionId,
    ownerUid,
    instanceId: `bridge-${playerCount}`,
    activeRoleIds,
    coreUids,
  });
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

  let iaRaceResults: PromiseSettledResult<unknown>[] = [];
  let iaRaceRequests: Array<Record<string, unknown>> = [];
  let iaRaceWinner: { request: Record<string, unknown>; result: Record<string, unknown> } | null = null;
  if (playerCount === 8) {
    await expect(assignLoyalty.run(request({
      sessionId,
      instanceId: `bridge-${playerCount}`,
      requestId: `loyalty-${playerCount}-intelligence-without-wolf`,
      targetUid: coreUids[1]!,
      kind: 'intelligence-agent',
      suspicion: 6,
    }, ownerUid))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/Wolf/i),
    });

    const wolfAssignment = await assignLoyalty.run(request({
      sessionId,
      instanceId: `bridge-${playerCount}`,
      requestId: `loyalty-${playerCount}-wolf`,
      targetUid: coreUids[0]!,
      kind: 'wolf-agent',
      suspicion: 0,
    }, ownerUid));
    setupRevision = (wolfAssignment as { setupRevision: number }).setupRevision;

    iaRaceRequests = [1, 2].map((index, requestIndex) => ({
      sessionId,
      instanceId: `bridge-${playerCount}`,
      requestId: `loyalty-${playerCount}-ia-race-${requestIndex}`,
      targetUid: coreUids[index]!,
      kind: 'intelligence-agent',
      suspicion: 6,
    }));
    iaRaceResults = await Promise.allSettled(iaRaceRequests.map((iaRequest) =>
      assignLoyalty.run(request(iaRequest, ownerUid))));
    expect(iaRaceResults.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(iaRaceResults.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const iaWinnerIndex = iaRaceResults.findIndex((outcome) => outcome.status === 'fulfilled');
    if (iaWinnerIndex < 0) throw new Error('The Intelligence Agent race produced no committed result.');
    iaRaceWinner = {
      request: iaRaceRequests[iaWinnerIndex]!,
      result: iaRaceResults[iaWinnerIndex]!.value as Record<string, unknown>,
    };
    setupRevision = iaRaceWinner.result.setupRevision as number;
    const iaWinnerUid = iaRaceWinner.request.targetUid as string;
    await expect(assignLoyalty.run(request(iaRaceWinner.request, ownerUid)))
      .resolves.toEqual(iaRaceWinner.result);

    const iaSecretsAfterRace = [...mock.documents.entries()].filter(([path, fields]) =>
      path.startsWith(`sessions/${sessionId}/secrets/loyalty-`) &&
      (fields.payload as Record<string, unknown> | undefined)?.kind === 'intelligence-agent');
    expect(iaSecretsAfterRace).toHaveLength(1);

    mock.documents.set(`sessions/${sessionId}/events/legacy-event-collision`, {
      type: 'loyalty-assignment',
      result: { sessionId, setupRevision, assignedUids: [coreUids[3]] },
    });
    await expect(assignLoyalty.run(request({
      sessionId,
      instanceId: `bridge-${playerCount}`,
      requestId: 'legacy-event-collision',
      targetUid: coreUids[3]!,
      kind: 'fleet-loyalist',
      suspicion: 0,
    }, ownerUid))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/legacy|unbound|receipt/i),
    });

    for (const [index, uid] of coreUids.entries()) {
      if (index === 0 || uid === iaWinnerUid) continue;
      const assignment = await assignLoyalty.run(request({
        sessionId,
        instanceId: `bridge-${playerCount}`,
        requestId: `loyalty-${playerCount}-${index}`,
        targetUid: uid,
        kind: 'fleet-loyalist',
        suspicion: 0,
      }, ownerUid));
      setupRevision = (assignment as { setupRevision: number }).setupRevision;
    }

    await disconnectFromSession.run(request({ sessionId }, coreUids[1]!));
    const resumedBeforeStart = await resumeSession.run(request({ sessionId }, coreUids[1]!));
    expect(resumedBeforeStart).toMatchObject({
      session: { id: sessionId, phase: 'casting', setupRevision },
      player: { uid: coreUids[1], assignedRoleId: activeRoleIds[1] },
    });
    expect(JSON.stringify(resumedBeforeStart)).not.toMatch(/wolf-agent|intelligence-agent|selectedWolfRoleIds/);
  }

  if (playerCount === 20) {
    await refreshPresence.run(request({ sessionId, activeConsoleRoleId: 'press-officer' }, `press-${playerCount}`));
  }

  let startRequest = {
    sessionId,
    instanceId: `bridge-${playerCount}`,
    requestId: `start-${playerCount}`,
    expectedSetupRevision: setupRevision,
  };
  type StartedResult = {
    status: string;
    setupRevision: number;
    currentTurn: number;
    setupReceipt: Record<string, unknown>;
  };
  let started: StartedResult;
  let startRaceResults: PromiseSettledResult<unknown>[] = [];
  let startRaceRequests: typeof startRequest[] = [];
  if (extraGmUid) {
    startRaceRequests = [startRequest, {
      ...startRequest,
      requestId: `${startRequest.requestId}-observer`,
      instanceId: `observer-${playerCount}`,
    }];
    startRaceResults = await Promise.allSettled([
      startGame.run(request(startRaceRequests[0]!, ownerUid)),
      startGame.run(request(startRaceRequests[1]!, extraGmUid)),
    ]);
    const committedIndex = startRaceResults.findIndex((result) =>
      result.status === 'fulfilled' && result.value.status === 'committed');
    if (committedIndex < 0) throw new Error('The authorized start race produced no committed result.');
    started = startRaceResults[committedIndex]!.value as StartedResult;
    startRequest = startRaceRequests[committedIndex]!;
  } else {
    started = await startGame.run(request(startRequest, ownerUid)) as StartedResult;
  }

  return {
    ownerUid,
    sessionId,
    activeRoleIds,
    coreUids,
    started,
    startRequest,
    extraGmUid,
    raceJoinResults,
    raceJoinUid,
    startRaceResults,
    startRaceRequests,
    iaRaceResults,
    iaRaceRequests,
    iaRaceWinner,
  };
}

describe('Prompt 020 production lobby-to-Team-Phase composition', () => {
  beforeEach(() => mock.reset());

  it('denies a role command that reuses the completed setup request id', async () => {
    await expect(composeProductionSession(8, {
      afterSetup: async ({ sessionId, ownerUid, instanceId, activeRoleIds, coreUids }) => {
        await expect(assignRole.run(request({
          sessionId,
          instanceId,
          requestId: 'confirm-8',
          targetUid: coreUids[0]!,
          roleId: activeRoleIds[0]!,
        }, ownerUid))).rejects.toMatchObject({ code: 'failed-precondition' });
      },
    })).resolves.toMatchObject({ sessionId: expect.any(String) });
  });

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
    const {
      started, sessionId, activeRoleIds, coreUids, ownerUid, startRequest,
      extraGmUid, raceJoinResults, raceJoinUid, startRaceResults, startRaceRequests,
    } = composition;
    expect(started.status).toBe('committed');
    expect(started.currentTurn).toBe(1);
    expect(started.setupReceipt).toMatchObject({
      playerCount,
      wolfCount: expectedWolfCount,
      excludedGmCount: extraGmUid ? 2 : 1,
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

    if (extraGmUid) {
      expect(startRaceRequests).toHaveLength(2);
      expect(startRaceRequests.map(({ expectedSetupRevision }) => expectedSetupRevision))
        .toEqual([startRequest.expectedSetupRevision, startRequest.expectedSetupRevision]);
      expect(startRaceRequests.map(({ instanceId }) => instanceId))
        .toEqual(expect.arrayContaining([`bridge-${playerCount}`, `observer-${playerCount}`]));
      const raceStatuses = startRaceResults
        .filter((result): result is PromiseFulfilledResult<Record<string, unknown>> => result.status === 'fulfilled')
        .map((result) => result.value.status)
        .sort();
      expect(raceStatuses).toEqual(['committed', 'stale']);
      expect([...mock.documents.values()].filter((fields) => fields.type === 'game-started')).toHaveLength(1);
      expect([...mock.documents.keys()].filter((path) =>
        path.startsWith(`sessions/${sessionId}/secrets/setup-receipt-`),
      )).toHaveLength(1);
    }

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
      visibleToUids: extraGmUid ? [ownerUid, extraGmUid] : [ownerUid],
    });

    if (playerCount === 8) {
      expect(started.setupReceipt.loyaltySource).toBe('explicit-preserved');
      expect(read(`sessions/${sessionId}/secrets/loyalty-${coreUids[0]}`)).toMatchObject({
        visibleToUids: [coreUids[0]],
        payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
      });
    } else {
      expect(started.setupReceipt.loyaltySource).toBe('automatic-default');
    }

    const gmInstances = [...mock.documents.entries()]
      .filter(([path]) => path.startsWith(`sessions/${sessionId}/gmInstances/`));
    expect(gmInstances).toHaveLength(extraGmUid ? 2 : 1);
    expect(gmInstances.map(([, fields]) => fields.uid)).toEqual(
      expect.arrayContaining([ownerUid, ...(extraGmUid ? [extraGmUid] : [])]),
    );

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
    const duplicateStarts = await Promise.all([
      startGame.run(request(startRequest, ownerUid)),
      startGame.run(request(startRequest, ownerUid)),
    ]);
    expect(duplicateStarts).toEqual([
      expect.objectContaining({ status: 'replayed' }),
      expect.objectContaining({ status: 'replayed' }),
    ]);
    expect(stateSnapshot()).toBe(stateAfterStart);

    const staleRequest = {
      ...startRequest,
      requestId: `${startRequest.requestId}-stale`,
      expectedSetupRevision: 0,
    };
    const staleReceiptPath = `sessionStartRequests/${sessionId}_${staleRequest.requestId}`;
    const staleMarkerPath = `sessions/${sessionId}/commandReceipts/${staleRequest.requestId}`;
    const beforeStale = stateSnapshot([staleReceiptPath, staleMarkerPath]);
    const stale = await startGame.run(request(staleRequest, ownerUid));
    expect(stale).toMatchObject({ status: 'stale', currentSetupRevision: started.setupRevision });
    expect(stateSnapshot([staleReceiptPath, staleMarkerPath])).toBe(beforeStale);
    expect(read(staleReceiptPath)).toMatchObject({
      requestId: staleRequest.requestId,
      reply: { status: 'stale', currentSetupRevision: started.setupRevision },
    });
    expect(read(staleMarkerPath)).toMatchObject({
      fingerprint: expect.objectContaining({ action: 'start-game', requestId: staleRequest.requestId }),
      result: { status: 'stale', currentSetupRevision: started.setupRevision },
    });
    expect(read(`sessions/${sessionId}`)).toMatchObject({ phase: 'active', currentTurn: 1 });

    if (raceJoinUid) {
      expect(raceJoinResults).toHaveLength(2);
      expect(raceJoinResults.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
      expect([...mock.documents.keys()].filter((path) =>
        path === `sessions/${sessionId}/players/${raceJoinUid}`,
      )).toHaveLength(1);
      expect(read(`sessions/${sessionId}/players/${raceJoinUid}`)).toMatchObject({
        connected: false,
        role: 'player',
      });
    }

    if (playerCount === 8) {
      const unsupportedState = stateSnapshot();
      await expect(createSession.run(request({ requestId: 'unsupported-count', playerCount: 7 }, ownerUid)))
        .rejects.toMatchObject({ code: 'invalid-argument' });
      await expect(createSession.run(request({
        requestId: 'unsupported-mode', playerCount: 19, expansion: 'base',
      }, ownerUid))).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(stateSnapshot()).toBe(unsupportedState);
    }

    await disconnectFromSession.run(request({ sessionId }, coreUids[0]!));
    const resumed = await resumeSession.run(request({ sessionId }, coreUids[0]!));
    expect(resumed).toMatchObject({
      session: { id: sessionId, phase: 'active', currentTurn: 1 },
      player: {
        uid: coreUids[0], role: 'player', assignedRoleId: activeRoleIds[0], seatId: activeRoleIds[0],
      },
    });
    expect(JSON.stringify(resumed)).not.toMatch(/wolf-agent|selectedWolfRoleIds|fleet-loyalist/);
    expect(resumed).not.toHaveProperty('secrets');
  });
});

describe('Prompt 055 private loyalty reassignment composition', () => {
  beforeEach(() => mock.reset());

  it('redacts the public loyalty audit event and fails closed when another casting action reuses its request id', async () => {
    const { sessionId, ownerUid, coreUids, activeRoleIds } = await composeProductionSession(8);
    mock.documents.set(`sessions/${sessionId}`, {
      ...(read(`sessions/${sessionId}`) as StoredDocument),
      phase: 'casting',
      configurationLocked: false,
    });
    const requestId = 'private-loyalty-cross-action';
    const targetUid = coreUids[3]!;
    await expect(assignLoyalty.run(request({
      sessionId,
      instanceId: 'bridge-8',
      requestId,
      targetUid,
      kind: 'android',
      suspicion: null,
    }, ownerUid))).resolves.toMatchObject({ assignedUids: [targetUid] });

    const event = read(`sessions/${sessionId}/events/${requestId}`);
    expect(event).toMatchObject({ type: 'loyalty-assignment', actorUid: ownerUid, requestId });
    expect(JSON.stringify(event)).not.toMatch(new RegExp(
      `${targetUid}|android|assignedUids|suspicion|partnerUid|result`,
    ));
    expect(read(`sessions/${sessionId}/loyaltyAssignmentRequests/${requestId}`)).toMatchObject({
      targetUid,
      kind: 'android',
      suspicion: null,
      result: { assignedUids: [targetUid] },
    });

    const stateAfterLoyalty = stateSnapshot();
    await expect(assignRole.run(request({
      sessionId,
      instanceId: 'bridge-8',
      requestId,
      targetUid: coreUids[4]!,
      roleId: activeRoleIds[4]!,
    }, ownerUid))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(stateSnapshot()).toBe(stateAfterLoyalty);

    await expect(releaseRole.run(request({
      sessionId,
      instanceId: 'bridge-8',
      requestId,
      targetUid: coreUids[4]!,
    }, ownerUid))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(stateSnapshot()).toBe(stateAfterLoyalty);

    await expect(setShipPreference.run(request({
      sessionId,
      requestId,
      shipId: 'icebreaker',
    }, coreUids[4]!))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(stateSnapshot()).toBe(stateAfterLoyalty);
  });

  it('retries concurrent Friend reassignment without leaving either displaced reciprocal record orphaned', async () => {
    const { sessionId, ownerUid, coreUids } = await composeProductionSession(8);
    mock.documents.set(`sessions/${sessionId}`, {
      ...(read(`sessions/${sessionId}`) as StoredDocument),
      phase: 'casting',
      configurationLocked: false,
    });
    const [firstTargetUid, firstPartnerUid, secondTargetUid, secondPartnerUid] = [
      coreUids[2]!, coreUids[3]!, coreUids[4]!, coreUids[5]!,
    ];
    mock.documents.set(`sessions/${sessionId}/secrets/loyalty-${firstTargetUid}`, {
      visibleToUids: [firstTargetUid],
      payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: firstPartnerUid },
    });
    mock.documents.set(`sessions/${sessionId}/secrets/loyalty-${firstPartnerUid}`, {
      visibleToUids: [firstPartnerUid],
      payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: firstTargetUid },
    });
    mock.documents.set(`sessions/${sessionId}/secrets/loyalty-${secondTargetUid}`, {
      visibleToUids: [secondTargetUid],
      payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: secondPartnerUid },
    });
    mock.documents.set(`sessions/${sessionId}/secrets/loyalty-${secondPartnerUid}`, {
      visibleToUids: [secondPartnerUid],
      payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: secondTargetUid },
    });
    mock.transactionAttempts.mockClear();

    await expect(Promise.all([
      assignLoyalty.run(request({
        sessionId,
        instanceId: 'bridge-8',
        requestId: 'concurrent-reassign-target',
        targetUid: firstTargetUid,
        kind: 'android',
        suspicion: null,
      }, ownerUid)),
      assignLoyalty.run(request({
        sessionId,
        instanceId: 'bridge-8',
        requestId: 'concurrent-reassign-partner',
        targetUid: secondTargetUid,
        kind: 'android',
        suspicion: null,
      }, ownerUid)),
    ])).resolves.toEqual([
      expect.objectContaining({ assignedUids: [firstTargetUid] }),
      expect.objectContaining({ assignedUids: [secondTargetUid] }),
    ]);
    expect(mock.transactionAttempts).toHaveBeenCalledTimes(3);

    expect(read(`sessions/${sessionId}/secrets/loyalty-${firstTargetUid}`)).toMatchObject({
      visibleToUids: [firstTargetUid],
      payload: { type: 'loyalty', kind: 'android', suspicion: null },
    });
    expect(read(`sessions/${sessionId}/secrets/loyalty-${secondTargetUid}`)).toMatchObject({
      visibleToUids: [secondTargetUid],
      payload: { type: 'loyalty', kind: 'android', suspicion: null },
    });
    expect(read(`sessions/${sessionId}/secrets/loyalty-${firstPartnerUid}`)).toBeUndefined();
    expect(read(`sessions/${sessionId}/secrets/loyalty-${secondPartnerUid}`)).toBeUndefined();
  });
});
