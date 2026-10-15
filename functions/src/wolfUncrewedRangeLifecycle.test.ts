import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { TurnPhase } from './turnZero';

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
      const parts = key.split('.');
      let cursor = next;
      for (const part of parts.slice(0, -1)) {
        cursor[part] = { ...((cursor[part] ?? {}) as StoredDocument) };
        cursor = cursor[part] as StoredDocument;
      }
      if (value === DELETE) delete cursor[parts.at(-1)!];
      else cursor[parts.at(-1)!] = value;
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
    versionStore = versions, options?: { merge?: boolean }) =>
    applyFields(target.path, fields, options?.merge !== true, store, versionStore));
  const update = vi.fn((target: Ref, fields: StoredDocument, store = documents,
    versionStore = versions) => applyFields(target.path, fields, false, store, versionStore));
  const remove = vi.fn((target: Ref, store = documents, versionStore = versions) => {
    store.delete(target.path);
    versionStore.set(target.path, (versionStore.get(target.path) ?? 0) + 1);
  });
  const transactionAttempts = vi.fn();
  const enqueueTask = vi.fn(async () => undefined);
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
        set: (target: Ref, fields: StoredDocument, options?: { merge?: boolean }) =>
          set(target, fields, working, workingVersions, options),
        create: (target: Ref, fields: StoredDocument) => {
          if (working.has(target.path)) throw new Error(`Mock transaction create collision: ${target.path}`);
          set(target, fields, working, workingVersions);
        },
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
    get: async () => querySnapshot(query(path)),
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
    enqueueTask,
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
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({ run: maybeHandler ?? optionsOrHandler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (options: unknown, handler: (event: unknown) => unknown) => ({ options, run: handler }),
}));
vi.mock('firebase-functions/v2/tasks', () => ({
  onTaskDispatched: (options: unknown, handler: (event: unknown) => unknown) => ({ options, run: handler }),
}));
vi.mock('firebase-admin/functions', () => ({
  getFunctions: () => ({ taskQueue: () => ({ enqueue: mock.enqueueTask }) }),
}));

// Reuse the sessionComposition transaction ports. Everything below the ports
// is the ordinary handler chain; no phase, choice, roster or receipt is injected.
import { createSession, loginGmAccess, claimGmInstance, confirmSetup,
  prepareFullGameDemo, joinSession, assignRole, claimSeat, startGame, refreshPresence,
  runMaintenance, advanceFullGameDemoPhase, setWolfAttackWindow,
  stageWolfAttackPreparation, declareWolfAttack, advanceWolfAttackLifecycle,
  getAegisFighterWingLaunch, launchAegisFighterWing, passWolfFighterLaunchChoice,
  getWolfFighterRangeActionChoice, commitWolfFighterRangeActionChoice,
  getWolfRangeActionChoice } from './index';
import { recommendedRoleIds } from './roleConfiguration';
import { projectWolfAttackMemberView } from './wolfAttackAudience';

const roles = recommendedRoleIds(8);
const gm = 'normal-gm', admiral = 'normal-admiral', wing = 'normal-wing';
const instanceId = 'normal-bridge';
const alpha = 'fighter-wing-alpha', bravo = 'fighter-wing-bravo';
const req = (data: Record<string, unknown>, uid = gm) => ({ data, auth: { uid } }) as CallableRequest<Record<string, unknown>>;
const read = (path: string) => mock.documents.get(path)!;

async function normalPrefix(withMiner = false) {
  const created = await createSession.run(req({ requestId: 'normal-create', name: 'Normal Wing',
    displayName: 'GM', playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8 }));
  const sessionId = (created.session as StoredDocument).id as string;
  const root = `sessions/${sessionId}`;
  await loginGmAccess.run(req({ password: 'bananasplit' }));
  await claimGmInstance.run(req({ sessionId, instanceId, name: 'GM', deviceLabel: 'Inert source qualification' }));
  await confirmSetup.run(req({ sessionId, instanceId, requestId: 'normal-confirm', expectedSetupRevision: 0,
    playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8,
    dioneEnabled: false, capybaraEnabled: true, activeRoleIds: [...roles] }));
  await prepareFullGameDemo.run(req({ sessionId, instanceId, requestId: 'normal-training',
    expectedSetupRevision: read(root).setupRevision }));
  const actors = [[admiral, 'admiral'], [wing, 'wing-commander'], ...(withMiner ? [['normal-miner', 'icebreaker-miner']] : [])];
  for (const [uid, roleId] of actors) {
    await joinSession.run(req({ joinCode: (created.session as StoredDocument).joinCode, displayName: uid }, uid));
    await assignRole.run(req({ sessionId, instanceId, requestId: `assign-${uid}`, targetUid: uid, roleId }));
    await claimSeat.run(req({ sessionId, seatId: roleId, requestId: `claim-${uid}`,
      expectedSetupRevision: read(root).setupRevision }, uid));
  }
  const started = await startGame.run(req({ sessionId, instanceId, requestId: 'normal-start', fullGameDemo: true,
    expectedSetupRevision: read(root).setupRevision }));
  expect(started).toMatchObject({ status: 'committed', currentTurn: 1 });
  for (const [uid, roleId] of actors) {
    await refreshPresence.run(req({ sessionId, activeConsoleRoleId: roleId }, uid));
  }
  expect(read(root).fullGameDemo).toEqual({ status: 'active', progression: 'manual' });
  if (!withMiner) {
    expect((read(root).shuttleControl as StoredDocument).highwall).toBeUndefined();
    expect(Object.keys(read(root).shuttleControl as StoredDocument)).toEqual(['starlight']);
  } else expect((read(root).shuttleControl as StoredDocument).highwall).toMatchObject({ ownerUid: 'normal-miner', holderUid: 'normal-miner' });
  for (const [revision, action] of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor'].entries()) {
    const result = await runMaintenance.run(req({ sessionId, shipId: 'aegis', requestId: `maintenance-${action}`,
      action, expectedRevision: revision, consoleRoleId: 'admiral',
      ...(action === 'rations' ? { foodLevel: 3, waterLevel: 3 } : {}),
      ...(action === 'reactor' ? { consoles: ['fighter-bay-alpha', 'fighter-bay-bravo', 'construction-bay'] } : {}),
    }, admiral));
    expect(result).toMatchObject({ status: 'committed', revision: revision + 1 });
  }
  await advanceFullGameDemoPhase.run(req({ sessionId, instanceId, requestId: 'normal-coordination', expectedTurn: 1 }));
  await setWolfAttackWindow.run(req({ sessionId, instanceId, requestId: 'normal-due', expectedRevision: 0, status: 'due' }));
  await stageWolfAttackPreparation.run(req({ sessionId, instanceId, requestId: 'normal-draft', expectedRevision: 0, turn: 1,
    shipIds: [...Array(10).fill('wolf-fighter-wing'), ...Array(5).fill('wolf-assault-transport')],
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' }));
  const declared = await declareWolfAttack.run(req({ sessionId, instanceId, requestId: 'normal-declare', expectedRevision: 1 }));
  expect(declared).toMatchObject({ status: 'committed', currentStep: 'targeting' });
  const statePath = `${root}/wolfAttackState/current`;
  expect(read(statePath).battleTableCraftActions).toContainEqual({ craftId: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner' });
  await advanceWolfAttackLifecycle.run({ params: { sessionId } });
  const offer = await getAegisFighterWingLaunch.run(req({ sessionId, wingId: alpha }, wing));
  await launchAegisFighterWing.run(req({ sessionId, requestId: 'normal-alpha', expectedTurn: 1,
    expectedRevision: offer.revision, expectedWingRevision: offer.wingRevision, wingId: alpha }, wing));
  const current = await getAegisFighterWingLaunch.run(req({ sessionId, wingId: bravo }, wing));
  const passed = await passWolfFighterLaunchChoice.run(req({ sessionId, requestId: 'normal-bravo', expectedTurn: 1,
    expectedRevision: current.revision, expectedWingRevision: current.wingRevision, sourceId: bravo }, wing));
  expect(passed).toMatchObject({ choiceStatus: 'passed', sourceId: bravo });
  expect(read(statePath).currentStep).toBe('long-range');
  return { sessionId, root, statePath, passed };
}

beforeEach(() => {
  mock.reset();
  // Inert deterministic entropy chooses ordinary healthy maintenance and target
  // rolls. No outcome is supplied in any command body.
  mock.randomInt.mockImplementation((first: number, second?: number) => second === undefined ? 0 : first === 1000 ? 1001 : first);
});

describe('normal uncrewed battle-table craft lifecycle', () => {
  it('continues actual startup custody + declaration parking + explicit Alpha/Bravo choices from Long to Medium', async () => {
    const f = await normalPrefix();
    expect(roles).toHaveLength(8);
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
    expect(read(f.statePath)).toMatchObject({ currentStep: 'medium-range', revision: f.passed.revision + 2,
      rangeDecisions: { 'long-range': { status: 'unavailable', reason: 'no-configured-executive-officer' } } });
    expect(projectWolfAttackMemberView({ sessionId: f.sessionId, state: read(f.statePath), serverTime: new Date().toISOString() }))
      .toMatchObject({ currentStep: 'medium-range', range: 'medium' });
  });

  it('keeps malformed present Highwall custody fail-closed', async () => {
    const f = await normalPrefix();
    read(f.root).shuttleControl = { ...(read(f.root).shuttleControl as StoredDocument), highwall: { holderUid: 'foreign' } };
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
    expect(read(f.statePath).currentStep).toBe('long-range');
    expect(read(f.statePath).rangeReceipts).toBeUndefined();
  });

  it('retains genuine normally assigned Miner custody while Long has no Highwall action', async () => {
    const f = await normalPrefix(true);
    const custody = structuredClone(read(f.root).shuttleControl);
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
    expect(read(f.statePath).currentStep).toBe('medium-range');
    expect(read(f.root).shuttleControl).toEqual(custody);
    expect(read(f.statePath).battleTableCraftActions).toContainEqual({ craftId: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner' });
  });

  it('does not advance through a changed original manual clock', async () => {
    const f = await normalPrefix();
    const phase = read(f.root).turnPhase as StoredDocument;
    read(f.root).turnPhase = { ...phase, timerPause: { reason: 'turn-interstitial', pausedAt: new Date().toISOString(), remainingMs: 1000 } };
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
    expect(read(f.statePath).currentStep).toBe('long-range');
    expect(read(f.statePath).rangeReceipts).toBeUndefined();
  });

  it('rejects Admiral substitution and wrong-role range writes without transport effects', async () => {
    const f = await normalPrefix();
    await expect(getWolfRangeActionChoice.run(req({ sessionId: f.sessionId }, admiral)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(commitWolfFighterRangeActionChoice.run(req({ sessionId: f.sessionId, requestId: 'wrong-admiral',
      expectedTurn: 1, expectedRevision: read(f.statePath).revision, range: 'medium-range', sourceId: alpha, actions: [] }, admiral)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.documents.has(`${f.root}/commandReceipts/wrong-admiral`)).toBe(false);
  });
});

