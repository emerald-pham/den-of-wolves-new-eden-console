// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let strictReadOrder = false;

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
      let wrote = false;
      const transactionGet = async (target: Ref | Query) => {
        if (strictReadOrder && wrote) throw new Error('Firestore transactions require all reads before all writes.');
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
          { wrote = true; return set(target, fields, working, workingVersions, options); },
        create: (target: Ref, fields: StoredDocument) => {
          wrote = true;
          if (working.has(target.path)) throw new Error(`Mock transaction create collision: ${target.path}`);
          set(target, fields, working, workingVersions);
        },
        update: (target: Ref, fields: StoredDocument) => { wrote = true; return update(target, fields, working, workingVersions); },
        delete: (target: Ref) => { wrote = true; return remove(target, working, workingVersions); },
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
    requireReadOrder: () => { strictReadOrder = true; },
    reset: () => {
      documents.clear();
      versions.clear();
      generatedSession = 0;
      strictReadOrder = false;
      get.mockClear();
      set.mockClear();
      update.mockClear();
      remove.mockClear();
      runTransaction.mockClear();
      transactionAttempts.mockClear();
    },
    MockTimestamp,
    randomInt: vi.fn((first: number, second?: number) => second === undefined ? 0 : first),
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

const clientPort = vi.hoisted(() => ({ uid: 'normal-wing',
  invoke: undefined as undefined | ((endpoint: string, data: Record<string, unknown>) => Promise<unknown>),
  calls: [] as Array<{ endpoint: string; data: Record<string, unknown> }>,
}));
vi.mock('@/lib/firebase', () => ({ auth: () => ({ currentUser: { uid: clientPort.uid } }), functions: () => ({}) }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions: unknown, endpoint: string) => async (data: Record<string, unknown>) => {
  clientPort.calls.push({ endpoint, data });
  return { data: await clientPort.invoke!(endpoint, data) };
} }));
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));

// Reuse the sessionComposition transaction ports. Everything below the ports
// is the ordinary handler chain; no phase, choice, roster or receipt is injected.
import { createSession, loginGmAccess, claimGmInstance, confirmSetup,
  prepareFullGameDemo, joinSession, assignRole, claimSeat, startGame, refreshPresence,
  runMaintenance, advanceFullGameDemoPhase, setWolfAttackWindow,
  stageWolfAttackPreparation, declareWolfAttack, advanceWolfAttackLifecycle,
  getAegisFighterWingLaunch, launchAegisFighterWing, passWolfFighterLaunchChoice,
  getWolfFighterRangeActionChoice, commitWolfFighterRangeActionChoice,
  getWolfRangeActionChoice, getWolfBoardingDefenceChoice, commitWolfBoardingDefenceChoice,
  setUnionCraftStartingHost, addShipDamage, kickPlayer, setGmShipConsoleWriteGrant, setSmallShipDocking, setReplacementEligibility, assignReplacementRole, setFighterWingCount, repairAllShipDamage, advanceTurn } from './index';
import { SHIP_DAMAGE_DECKS } from './shipDamage';
import { initialPdfEscortWingState } from './pdfEscortWingState';
import { recommendedRoleIds } from './roleConfiguration';
import { projectWolfAttackMemberView } from './wolfAttackAudience';
import { wolfCombatRoster, type WolfTargetingReceipt } from './wolfCombatMath';
import { deriveWolfBoardingSupportCraft, type WolfBoardingCraftAuthorityInput } from './wolfBoardingSupport';
import { roleOwnedCraftForRoles } from './craftOwnership';
import { retainShuttlesFromDestroyedHost } from './retainedShuttles';
import { boardingSecurityTeamAuthority } from './boardingSecurityTeams';
import { memberSessionProjection } from './memberSession';
import { sessionFrom } from '@/lib/firestore';
import { getWolfFighterRangeActionChoice as clientReadRange, commitWolfFighterRangeActionChoice as clientCommitRange } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import { WolfFighterRangeActionPanelView } from '@/components/WolfFighterRangeActionPanel';
import { createElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import type { GameSession, Player } from '@/types/game';

const roles = recommendedRoleIds(8);
const gm = 'normal-gm', admiral = 'normal-admiral', wing = 'normal-wing';
const instanceId = 'normal-bridge';
const alpha = 'fighter-wing-alpha', bravo = 'fighter-wing-bravo';
const req = (data: Record<string, unknown>, uid = gm) => ({ data, auth: { uid } }) as CallableRequest<Record<string, unknown>>;
const read = (path: string) => mock.documents.get(path)!;
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

async function normalPrefix(withMiner = false, withUnion = false, options: { onlySetup?: boolean; withoutWing?: boolean; withColonel?: boolean } = {}) {
  const created = await createSession.run(req({ requestId: 'normal-create', name: 'Normal Wing',
    displayName: 'GM', playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8 }));
  const sessionId = (created.session as StoredDocument).id as string;
  const root = `sessions/${sessionId}`;
  await loginGmAccess.run(req({ password: 'bananasplit' }));
  await claimGmInstance.run(req({ sessionId, instanceId, name: 'GM', deviceLabel: 'Inert source qualification' }));
  await confirmSetup.run(req({ sessionId, instanceId, requestId: 'normal-confirm', expectedSetupRevision: 0,
    playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8,
    dioneEnabled: false, capybaraEnabled: true, activeRoleIds: [...roles] }));
  if (withUnion) {
    for (const [craftId, hostShipId] of [['wobbly', 'quellon'], ['ally', 'shepherd']]) {
      await setUnionCraftStartingHost.run(req({ sessionId, instanceId, requestId: `normal-host-${craftId}`,
        expectedSetupRevision: read(root).setupRevision, craftId, hostShipId }));
    }
  }
  await prepareFullGameDemo.run(req({ sessionId, instanceId, requestId: 'normal-training',
    expectedSetupRevision: read(root).setupRevision }));
  const actors = [[admiral, 'admiral'], ...(!options.withoutWing ? [[wing, 'wing-commander']] : []),
    ...(options.withColonel ? [['normal-colonel', 'refinery-124-pdf-colonel']] : []), ...(withMiner ? [['normal-miner', 'icebreaker-miner']] : []),
    ...(withUnion ? [['normal-wobbly', 'joint-engineering-quellon-refinery'], ['normal-ally', 'joint-engineering-shepherd-icebreaker']] : [])];
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
    if (!withUnion) expect(Object.keys(read(root).shuttleControl as StoredDocument)).toEqual(options.withColonel ? ['starlight', 'chepu'] : options.withoutWing ? [] : ['starlight']);
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
  if (options.onlySetup) return { sessionId, root, statePath: `${root}/wolfAttackState/current`, passed: undefined, attackId: '' };
  await setWolfAttackWindow.run(req({ sessionId, instanceId, requestId: 'normal-due', expectedRevision: 0, status: 'due' }));
  await stageWolfAttackPreparation.run(req({ sessionId, instanceId, requestId: 'normal-draft', expectedRevision: 0, turn: 1,
    shipIds: [...Array(10).fill('wolf-fighter-wing'), ...Array(5).fill('wolf-assault-transport')],
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' }));
  const declarationEntropyStart = mock.randomInt.mock.calls.length;
  const declared = await declareWolfAttack.run(req({ sessionId, instanceId, requestId: 'normal-declare', expectedRevision: 1 }));
  expect(declared).toMatchObject({ status: 'committed', currentStep: 'targeting' });
  const statePath = `${root}/wolfAttackState/current`;
  // Check that Node's real server entropy import is bound to this inert port;
  // a DOM project's built-in import normalization must not silently bypass it.
  expect(mock.randomInt.mock.calls.slice(declarationEntropyStart).filter(([upperBound]) => upperBound === 5)).toHaveLength(15);
  expect(((read(statePath).calculationReceipt as { targeting: WolfTargetingReceipt }).targeting.rolls)
    .every(roll => roll.target === 'aegis')).toBe(true);
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
  return { sessionId, root, statePath, passed, attackId: declared.announcementId };
}

function boardingInput(f: Awaited<ReturnType<typeof normalPrefix>>): WolfBoardingCraftAuthorityInput & { admittedShuttleIds: readonly string[] } {
  const session = read(f.root), state = read(f.statePath);
  const players = [...mock.documents.entries()].filter(([path]) => path.startsWith(`${f.root}/players/`)).map(([, value]) => value);
  const supportIds = new Set(roleOwnedCraftForRoles(session.activeRoleIds as string[])
    .filter(craft => craft.boardingSupport !== undefined).map(({ id }) => id));
  return { activeRoleIds: session.activeRoleIds, activeVesselIds: session.activeVesselIds,
    dockings: session.shuttleDockings, visits: (session.shuttleVisitLog as Array<{ shuttleId: string }>).filter(visit => supportIds.has(visit.shuttleId)),
    control: session.shuttleControl, fuelled: session.shuttleFuelled, retainedShuttles: session.retainedShuttles ?? {},
    roleHolders: players.filter(player => player.role === 'player').map(player => ({ uid: player.uid, roleId: player.assignedRoleId })),
    playerUids: players.filter(player => player.role === 'player').map(player => player.uid),
    admittedShuttleIds: state.parkedCraftIds,
  } as WolfBoardingCraftAuthorityInput & { admittedShuttleIds: readonly string[] };
}

beforeEach(() => {
  mock.reset();
  mock.randomInt.mockClear();
  // Inert deterministic entropy chooses ordinary healthy maintenance and target
  // rolls. No outcome is supplied in any command body.
  mock.randomInt.mockImplementation((first: number, second?: number) => second === undefined ? 0 : first === 1000 ? 1001 : first);
  clientPort.uid = wing;
  clientPort.calls = [];
  clientPort.invoke = async (endpoint, data) => {
    const handler = { getWolfFighterRangeActionChoice, commitWolfFighterRangeActionChoice }[endpoint];
    if (!handler) throw new Error('This consumer qualification admits only the two existing fighter range endpoints.');
    return handler.run(req(data, clientPort.uid));
  };
});
afterEach(cleanup);

describe('normal uncrewed battle-table craft lifecycle', () => {
  it('excludes only never-admitted optional Union craft from actual normal boarding inputs', async () => {
    const f = await normalPrefix();
    const input = boardingInput(f);
    expect(input.admittedShuttleIds).not.toContain('wobbly');
    expect(input.admittedShuttleIds).not.toContain('ally');
    expect(() => deriveWolfBoardingSupportCraft(input)).not.toThrow();
  });

  it('retains both actually admitted and normally owned Union craft with their original custody', async () => {
    const f = await normalPrefix(false, true);
    expect(boardingInput(f).admittedShuttleIds).toEqual(expect.arrayContaining(['wobbly', 'ally']));
    expect(deriveWolfBoardingSupportCraft(boardingInput(f))).toEqual(expect.arrayContaining([
      expect.objectContaining({ shuttleId: 'wobbly', ownerUid: 'normal-wobbly', holderUid: 'normal-wobbly', hostShipId: 'quellon' }),
      expect.objectContaining({ shuttleId: 'ally', ownerUid: 'normal-ally', holderUid: 'normal-ally', hostShipId: 'shepherd' }),
    ]));
  });

  it('rejects present malformed admission and own-property optional custody instead of treating them as absent', async () => {
    const f = await normalPrefix(), input = boardingInput(f);
    for (const admittedShuttleIds of [undefined, null, ['wobbly', 'wobbly'], ['foreign-craft']]) {
      expect(() => deriveWolfBoardingSupportCraft({ ...input, admittedShuttleIds } as unknown as typeof input))
        .toThrow(/admission/);
    }
    expect(() => deriveWolfBoardingSupportCraft({ ...input, control: { ...(input.control as StoredDocument), ally: undefined } }))
      .toThrow();
  });

  it('rejects missing admitted history even when current optional docking/custody evidence is removed', async () => {
    const f = await normalPrefix(false, true), input = boardingInput(f);
    const control = { ...(input.control as StoredDocument) }; delete control.wobbly;
    expect(() => deriveWolfBoardingSupportCraft({ ...input, control,
      dockings: input.dockings.filter(({ shuttleId }) => shuttleId !== 'wobbly'),
      visits: input.visits.filter(({ shuttleId }) => shuttleId !== 'wobbly'),
    })).toThrow(/visit history/);
  });

  it('rejects a present or historical optional craft contradiction even when omitted from admission IDs', async () => {
    const f = await normalPrefix(false, true), input = boardingInput(f);
    expect(() => deriveWolfBoardingSupportCraft({ ...input, admittedShuttleIds: [],
      visits: input.visits.map(visit => visit.shuttleId === 'wobbly' ? { ...visit, shipId: 'refinery-124' } : visit),
    } as typeof input)).toThrow(/visit history/);
    expect(() => deriveWolfBoardingSupportCraft({ ...input, admittedShuttleIds: [],
      dockings: input.dockings.filter(({ shuttleId }) => shuttleId !== 'wobbly'),
    } as typeof input)).toThrow(/visit history/);
  });

  it('keeps actual retained optional craft history required after source-produced destruction retention', async () => {
    const f = await normalPrefix(false, true), input = boardingInput(f);
    // Qualify this optional craft's real retention producer without claiming
    // a whole-ship destruction scene for the unrelated uncrewed shuttles.
    const retained = retainShuttlesFromDestroyedHost({ destroyedHostShipId: 'quellon',
      dockings: input.dockings.filter(({ shuttleId }) => shuttleId === 'wobbly'),
      control: input.control as Parameters<typeof retainShuttlesFromDestroyedHost>[0]['control'], retained: {}, retainedAt: new Date().toISOString() });
    expect(retained.retainedShuttleIds).toContain('wobbly');
    expect(() => deriveWolfBoardingSupportCraft({ ...input, admittedShuttleIds: [],
      dockings: input.dockings.filter(({ shuttleId }) => shuttleId !== 'wobbly'),
      retainedShuttles: retained.retained, visits: input.visits.filter(({ shuttleId }) => shuttleId !== 'wobbly'),
    } as typeof input)).toThrow(/visit history/);
  });

  it('feeds actual connected range producers through client getter/parser and the mounted ordinary Medium/Short handlers', async () => {
    const f = await normalPrefix();
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
    useSessionStore.setState({ session: { ...read(f.root), id: f.sessionId } as unknown as GameSession,
      me: { ...read(`${f.root}/players/${wing}`), sessionId: f.sessionId } as unknown as Player,
      connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1 });
    const medium = await clientReadRange('medium-range', alpha);
    let pending: ReturnType<typeof clientCommitRange> | undefined;
    const ui = render(createElement(WolfFighterRangeActionPanelView, { view: medium,
      onResolveMedium: actions => { pending = clientCommitRange(medium.turn, medium.revision, medium.range, alpha, actions); },
      onResolveShort: () => { throw new Error('Short is not mounted during Medium.'); } }));
    for (const [index, kind] of [[1, 'attack'], [2, 'target-shift']] as const) {
      fireEvent.change(ui.getByLabelText(`Fighter ${index} action`), { target: { value: kind } });
      fireEvent.change(ui.getByLabelText(`Fighter ${index} target`), { target: { value: medium.targets[0].instanceId } });
    }
    fireEvent.change(ui.getByLabelText('Fighter 2 shift'), { target: { value: '-1' } });
    fireEvent.click(ui.getByRole('button', { name: 'Resolve Medium actions' }));
    const mediumReceipt = await pending!;
    expect(mediumReceipt).toMatchObject({ choiceStatus: 'pending-resolution', selectedFighterIndexes: [0, 1], revision: medium.revision + 1 });
    expect(read(f.statePath).currentStep).toBe('short-range');
    expect(clientPort.calls.at(-1)?.data).toMatchObject({ sourceId: alpha, actions: [
      { fighterIndex: 0, kind: 'attack', targetContactId: medium.targets[0].instanceId },
      { fighterIndex: 1, kind: 'target-shift', targetContactId: medium.targets[0].instanceId, shift: -1 },
    ] });
    ui.unmount();
    const short = await clientReadRange('short-range', alpha);
    const shortUi = render(createElement(WolfFighterRangeActionPanelView, { view: short,
      onResolveMedium: () => { throw new Error('Medium is not mounted during Short.'); },
      onResolveShort: indexes => { pending = clientCommitRange(short.turn, short.revision, short.range, alpha, indexes); } }));
    for (let index = 1; index <= 4; index++) fireEvent.click(shortUi.getByLabelText(`Fighter ${index} Short attack`));
    fireEvent.click(shortUi.getByRole('button', { name: 'Resolve selected Short attacks' }));
    expect(await pending!).toMatchObject({ choiceStatus: 'pending-resolution', selectedFighterIndexes: [0, 1, 2, 3] });
    const member = projectWolfAttackMemberView({ sessionId: f.sessionId, state: read(f.statePath), serverTime: new Date().toISOString() });
    expect(member).toMatchObject({ currentStep: 'boarding', range: null });
    expect(clientPort.calls.filter(({ endpoint }) => endpoint.startsWith('commit'))).toHaveLength(2);
    expect(clientPort.calls.every(({ data }) => !('attackId' in data) && !('expectedWingRevision' in data))).toBe(true);
  });

  it('qualifies actual Long→Medium→Short receipts, crew boarding prerequisites and original finalization without stage injection', async () => {
    const f = await normalPrefix();
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
    const before = structuredClone(read(f.root));
    const medium = await getWolfFighterRangeActionChoice.run(req({ sessionId: f.sessionId, sourceId: alpha, range: 'medium-range' }, wing));
    expect(medium.fighters.map((fighter: { fighterIndex: number }) => fighter.fighterIndex)).toEqual([0, 1, 2, 3]);
    const contact = medium.targets[0].instanceId;
    const mediumReceipt = await commitWolfFighterRangeActionChoice.run(req({ sessionId: f.sessionId, requestId: 'normal-medium',
      expectedTurn: 1, expectedRevision: medium.revision, sourceId: alpha, range: 'medium-range', actions: [
        { fighterIndex: 0, kind: 'attack', targetContactId: contact },
        { fighterIndex: 1, kind: 'target-shift', targetContactId: contact, shift: -1 },
      ] }, wing));
    expect(mediumReceipt).toMatchObject({ choiceStatus: 'pending-resolution', revision: medium.revision + 1, selectedFighterIndexes: [0, 1] });
    expect(read(f.statePath)).toMatchObject({ currentStep: 'short-range', revision: mediumReceipt.revision + 1 });
    const short = await getWolfFighterRangeActionChoice.run(req({ sessionId: f.sessionId, sourceId: alpha, range: 'short-range' }, wing));
    const shortReceipt = await commitWolfFighterRangeActionChoice.run(req({ sessionId: f.sessionId, requestId: 'normal-short',
      expectedTurn: 1, expectedRevision: short.revision, sourceId: alpha, range: 'short-range',
      fighterIndexes: short.fighters.map((fighter: { fighterIndex: number }) => fighter.fighterIndex) }, wing));
    expect(shortReceipt).toMatchObject({ choiceStatus: 'pending-resolution', revision: short.revision + 1, selectedFighterIndexes: [0, 1, 2, 3] });
    expect(read(f.statePath).currentStep).toBe('boarding');
    expect(read(f.statePath).rangeReceipts).toHaveLength(3);
    for (const key of ['shipResources', 'maintenanceCycles', 'shuttleControl', 'shuttleDockings', 'shipUpgrades']) {
      expect(read(f.root)[key]).toEqual(before[key]);
    }
    // The source may wait for genuine current AEGIS crew after Short. This
    // qualification follows its actual offered choices; the native range
    // objective must stop before these additional boarding mutations.
    const defence = await getWolfBoardingDefenceChoice.run(req({ sessionId: f.sessionId }, admiral));
    expect(defence).toMatchObject({ type: 'wolf-boarding-defence-choice-view', targetShipId: 'aegis', choiceStatus: 'pending' });
    await commitWolfBoardingDefenceChoice.run(req({ sessionId: f.sessionId, requestId: 'normal-boarding-defence',
      expectedTurn: 1, expectedRevision: defence.revision, targetShipId: defence.targetShipId,
      securityTeams: defence.availableSecurityTeams }, admiral));
    for (let index = 0; index < 12 && read(f.statePath).status !== 'resolved'; index++) {
      const revision = read(f.statePath).revision;
      await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
      if (read(f.statePath).status === 'resolved') break;
      expect(read(f.statePath).revision).not.toBe(revision);
    }
    expect(read(f.statePath)).toMatchObject({ status: 'resolved', currentStep: 'resolved', attackId: f.attackId });
    expect((read(f.root).turnPhase as StoredDocument).airspace).toMatchObject({ state: 'lifted' });
    expect(mock.documents.has(`${f.statePath}/audit/wolf-finalized-1`)).toBe(true);
    expect(read(`${f.statePath}/audit/wolf-finalized-1`)).toMatchObject({ type: 'wolf-attack-finalization', attackId: f.attackId,
      requestId: `wolf-final-${f.attackId}`, revision: read(f.statePath).finalizationRevision });
    expect(read(`${f.statePath}/audit/wolf-finalized-1`).receipt).toEqual(read(f.statePath).calculationReceipt);
  });

  it('continues actual startup custody + declaration parking + explicit Alpha/Bravo choices from Long to Medium', async () => {
    const f = await normalPrefix();
    expect(roles).toHaveLength(8);
    const roster = wolfCombatRoster((read(f.statePath).calculationReceipt as { targeting: WolfTargetingReceipt }).targeting);
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
    expect(read(f.statePath)).toMatchObject({ currentStep: 'medium-range', revision: f.passed.revision + 2,
      rangeDecisions: { 'long-range': { status: 'auto-passed', reason: 'no-eligible-range-action' } } });
    expect(projectWolfAttackMemberView({ sessionId: f.sessionId, state: read(f.statePath), serverTime: new Date().toISOString() }))
      .toMatchObject({ currentStep: 'medium-range', range: 'medium' });
    expect(read(f.statePath).combatRoster).toEqual(roster);
    expect(read(f.statePath).battleTableCraftActions).toContainEqual({ craftId: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner' });
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

  it('does not turn missing current Miner custody into an automatic absent-owner pass', async () => {
    const f = await normalPrefix(true);
    const control = { ...(read(f.root).shuttleControl as StoredDocument) };
    delete control.highwall;
    read(f.root).shuttleControl = control;
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
    expect(read(f.statePath).currentStep).toBe('long-range');
  });

  it('requires valid current parking before accepting a genuinely absent Highwall owner', async () => {
    const f = await normalPrefix();
    read(f.root).shuttleDockings = (read(f.root).shuttleDockings as Array<{ shuttleId: string }>).filter(({ shuttleId }) => shuttleId !== 'highwall');
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
    expect(read(f.statePath).currentStep).toBe('long-range');
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



// Owner 2026-10-15: never-assigned craft are lost with their destroyed host.
// These cases use the genuine partial-roster startup, then ordinary damage
// calls; no destruction, custody, loss result or current stage is injected.
async function destroyNormalIcebreaker(f: Awaited<ReturnType<typeof normalPrefix>>) {
  await setGmShipConsoleWriteGrant.run(req({ sessionId: f.sessionId, instanceId, shipId: 'icebreaker',
    enabled: true, claimedAt: (read(`${f.root}/gmInstances/${instanceId}`).claimedAt as { toDate: () => Date }).toDate().toISOString() }));
  mock.requireReadOrder();
  let result: unknown;
  for (let draw = 0; draw < 9; draw++) {
    result = await addShipDamage.run(req({ sessionId: f.sessionId, instanceId,
      shipId: 'icebreaker', requestId: `owner-loss-draw-${draw}`,
      expectedRevision: (read(f.root).vesselActionRevisions as StoredDocument)?.icebreaker ?? 0 }));
  }
  return result;
}
function removalEntries(root: string) {
  return [...mock.documents].filter(([path, value]) => path.startsWith(`${root}/procedureAudits/`) &&
    value.type === 'player-removal').map(([, value]) => value);
}
describe('owner host-loss and actual player-removal incidents', () => {
  it('loses never-assigned normal craft without synthetic custody or a player-removal alert', async () => {
    const f = await normalPrefix();
    const history = structuredClone(read(f.root).shuttleVisitLog);
    const capitalResources = structuredClone(read(f.root).shipResources);
    await expect(destroyNormalIcebreaker(f)).resolves.toMatchObject({ destroyed: true });
    const session = read(f.root);
    expect(session.lostShuttles).toMatchObject({ highwall: { status: 'lost', shuttleId: 'highwall',
      ownerRoleId: 'icebreaker-miner', destroyedHostShipId: 'icebreaker', cycle: 1,
      sourceId: 'damage-destroyed-icebreaker', lostAt: expect.any(String) } });
    expect((session.shuttleDockings as StoredDocument[]).some(d => d.shipId === 'icebreaker')).toBe(false);
    for (const key of ['shuttleControl', 'shuttleCargo', 'shuttleFuelled', 'retainedShuttles']) {
      expect((session[key] as StoredDocument | undefined)?.highwall).toBeUndefined();
    }
    expect(session.shuttleVisitLog).toEqual(history);
    expect(session.shipResources).toEqual(capitalResources);
    expect(removalEntries(f.root)).toEqual([]);
    expect(mock.documents.has(`${f.root}/shuttleDepartures/highwall`)).toBe(false);
    expect(mock.documents.has(`${f.root}/shuttleTransitChains/highwall`)).toBe(false);
    const terminal = structuredClone(session);
    await addShipDamage.run(req({ sessionId: f.sessionId, instanceId, shipId: 'icebreaker',
      requestId: 'owner-loss-terminal-repeat', expectedRevision: (session.vesselActionRevisions as StoredDocument).icebreaker }));
    expect(read(f.root)).toEqual(terminal);
  });
  it('preserves a genuinely assigned craft and alerts its exact displaced player once, never a secret', async () => {
    const f = await normalPrefix(true);
    const control = structuredClone(read(f.root).shuttleControl);
    await destroyNormalIcebreaker(f);
    expect(read(f.root).retainedShuttles).toMatchObject({ highwall: { status: 'retained', holderUid: 'normal-miner' } });
    expect(read(f.root).shuttleControl).toEqual(control);
    expect((read(f.root).lostShuttles as StoredDocument)?.highwall).toBeUndefined();
    const entries = removalEntries(f.root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'player-removal', sessionId: f.sessionId,
      playerUid: 'normal-miner', playerName: 'normal-miner', roleId: 'icebreaker-miner',
      roleName: expect.any(String), cause: 'ship-destroyed', shipId: 'icebreaker',
      sourceId: 'damage-destroyed-icebreaker', cycle: 1 });
    expect(Object.keys(entries[0]).sort()).toEqual(['cause','createdAt','cycle','playerName','playerUid',
      'roleId','roleName','sessionId','shipId','sourceId','type'].sort());
    const original = structuredClone(entries);
    await addShipDamage.run(req({ sessionId: f.sessionId, instanceId, shipId: 'icebreaker',
      requestId: 'owner-loss-draw-8', expectedRevision: 8 }));
    expect(removalEntries(f.root)).toEqual(original);
    expect([...mock.documents].filter(([path]) => path.startsWith(`${f.root}/events/`))
      .every(([, value]) => value.type !== 'player-removal')).toBe(true);
  });
  it.each(['malformed-own-property', 'missing-owner-custody', 'foreign-holder', 'changed-history'])(
    'denies %s rather than laundering it into never-assigned loss', async (mode) => {
      const f = await normalPrefix(mode !== 'malformed-own-property' && mode !== 'changed-history');
      const session = read(f.root), control = { ...(session.shuttleControl as StoredDocument) };
      if (mode === 'malformed-own-property') control.highwall = undefined;
      if (mode === 'missing-owner-custody') delete control.highwall;
      if (mode === 'foreign-holder') control.highwall = { ...(control.highwall as StoredDocument), holderUid: 'foreign' };
      if (mode === 'changed-history') session.shuttleVisitLog = (session.shuttleVisitLog as StoredDocument[])
        .map(v => v.shuttleId === 'highwall' ? { ...v, shipId: 'aegis' } : v);
      session.shuttleControl = control;
      await expect(destroyNormalIcebreaker(f)).rejects.toThrow(/custody|history|manifest/);
      expect((read(f.root).shipDamage as StoredDocument).icebreaker).toMatchObject({ destroyed: false });
      expect(read(f.root).lostShuttles).toBeUndefined(); expect(removalEntries(f.root)).toEqual([]);
    });
  it('logs permanent GM removal with the actual original role once and refuses foreign/currentless authority', async () => {
    const f = await normalPrefix();
    const command = { sessionId: f.sessionId, instanceId, requestId: 'owner-kick-wing', targetUid: wing };
    await expect(kickPlayer.run(req(command, admiral))).rejects.toThrow();
    expect(removalEntries(f.root)).toEqual([]);
    await kickPlayer.run(req(command));
    expect(read(`${f.root}/players/${wing}`)).toMatchObject({ connected: false, assignedRoleId: 'wing-commander' });
    expect(removalEntries(f.root)).toEqual([expect.objectContaining({ playerUid: wing, playerName: wing,
      roleId: 'wing-commander', roleName: expect.any(String), cause: 'gm-removal', sourceId: 'owner-kick-wing' })]);
    const original = structuredClone(removalEntries(f.root));
    await kickPlayer.run(req(command));
    expect(removalEntries(f.root)).toEqual(original);
  });
});


describe('host-loss current projections and security manifest', () => {
  it('parses the actual normal terminal loss without recreating a playable craft', async () => {
    const f = await normalPrefix(); await destroyNormalIcebreaker(f);
    const session = sessionFrom(f.sessionId, read(f.root));
    expect(session.lostShuttles).toEqual(read(f.root).lostShuttles);
    expect(session.shuttleDockings?.some(d => d.shuttleId === 'highwall')).toBe(false);
    expect(session.shuttleControl?.highwall).toBeUndefined();
  });
  it('projects loss only to its host group without granting craft or actor authority', async () => {
    const f = await normalPrefix(); await destroyNormalIcebreaker(f);
    const session = { ...read(f.root), id: f.sessionId };
    const local = memberSessionProjection(session, { groupId: 'fleet-1', vesselIds: ['icebreaker'], actorUid: 'local' });
    expect(local.lostShuttles).toEqual(session.lostShuttles);
    expect((local.memberSessionScope as StoredDocument).craftIds).not.toContain('highwall');
    const foreign = memberSessionProjection(session, { groupId: 'fleet-2', vesselIds: ['aegis'], actorUid: wing });
    expect(foreign.lostShuttles).toEqual({});
    expect(JSON.stringify(foreign)).not.toContain('player-removal');
  });
  it('uses actual startup manifest and terminal loss for current security ledgers, rejecting resurrected custody', async () => {
    const f = await normalPrefix(); await destroyNormalIcebreaker(f);
    const session = read(f.root), manifest = read(`${f.root}/craftOwnership/manifest`);
    const input = { ...session, activeRoleIds: session.activeRoleIds, activeVesselIds: session.activeVesselIds,
      vesselMode: manifest.vesselMode, startingCraftManifest: manifest.startingCraft,
      currentCycle: session.currentTurn } as Parameters<typeof boardingSecurityTeamAuthority>[0];
    const current = boardingSecurityTeamAuthority(input);
    expect(current.shuttleSecurityTeams.highwall).toBeUndefined();
    expect(current.shuttleSecurityTeams.starlight).toBe(0);
    expect(() => boardingSecurityTeamAuthority({ ...input,
      shuttleControl: { ...(session.shuttleControl as StoredDocument), highwall: { shuttleId: 'highwall',
        ownerRoleId: 'icebreaker-miner', ownerUid: 'foreign', holderUid: 'foreign', revision: 0 } },
    })).toThrow(/lost|Lost/);
  });
});


it('keeps absent legacy custody history ambiguous instead of treating it as never-assigned', async () => {
  const f = await normalPrefix();
  delete read(f.root).shuttleControl;
  await expect(destroyNormalIcebreaker(f)).rejects.toThrow(/custody|history|manifest/);
  expect(read(f.root).lostShuttles).toBeUndefined();
});


async function normalSmallShipSetup(id = 'gorgoneion') {
  const f = await normalPrefix(false, false, { onlySetup: true });
  await setSmallShipDocking.run(req({ sessionId: f.sessionId, instanceId, smallShipId: id,
    hostShipId: 'icebreaker', docked: true, expectedRevision: 0, requestId: `owner-admit-${id}` }));
  return f;
}
async function assignNormalSmallShipCaptain(f: Awaited<ReturnType<typeof normalPrefix>>, id = 'gorgoneion') {
  await setReplacementEligibility.run(req({ sessionId: f.sessionId, instanceId, requestId: 'owner-captain-eligibility',
    targetUid: wing, reason: 'removed', expectedRevision: 0, expectedSetupRevision: read(f.root).setupRevision }));
  return assignReplacementRole.run(req({ sessionId: f.sessionId, instanceId, requestId: 'owner-assign-captain', targetUid: wing,
    replacementRoleId: `${id}-captain`, expectedRevision: 1, expectedSetupRevision: read(f.root).setupRevision }));
}
describe('owner fate for genuinely admitted optional craft and unassigned fighter wings', () => {
  it('records never-assigned provenance on first ordinary GM admission and permanent assignment on the real role transaction', async () => {
    const f = await normalSmallShipSetup();
    expect((read(f.root).smallShipStates as StoredDocument).gorgoneion).toMatchObject({ everAssigned: false });
    await assignNormalSmallShipCaptain(f);
    expect((read(f.root).smallShipStates as StoredDocument).gorgoneion).toMatchObject({ everAssigned: true });
  });
  it('loses an actually admitted never-assigned small ship with its host without creating a player alert', async () => {
    const f = await normalSmallShipSetup(); await destroyNormalIcebreaker(f);
    expect((read(f.root).smallShipStates as StoredDocument).gorgoneion).toMatchObject({ hostShipId: null,
      everAssigned: false, dockingRevision: 2, loss: { status: 'lost', destroyedHostShipId: 'icebreaker',
        sourceId: 'damage-destroyed-icebreaker', cycle: 1, lostAt: expect.any(String) } });
    expect(removalEntries(f.root)).toEqual([]);
  });
  it('denies ordinary GM undock/redock and replacement assignment after the real host loss', async () => {
    const f = await normalSmallShipSetup(); await destroyNormalIcebreaker(f);
    const state = structuredClone(read(f.root).smallShipStates);
    const current = (state as StoredDocument).gorgoneion as StoredDocument;
    await expect(setSmallShipDocking.run(req({ sessionId: f.sessionId, instanceId, smallShipId: 'gorgoneion',
      hostShipId: null, docked: false, expectedRevision: current.dockingRevision, requestId: 'owner-revive-undock' }))).rejects.toThrow();
    await expect(setSmallShipDocking.run(req({ sessionId: f.sessionId, instanceId, smallShipId: 'gorgoneion',
      hostShipId: 'aegis', docked: true, expectedRevision: current.dockingRevision, requestId: 'owner-revive-redock' }))).rejects.toThrow();
    await expect(assignNormalSmallShipCaptain(f)).rejects.toThrow();
    expect(read(f.root).smallShipStates).toEqual(state);
  });
  it('does not assign a new Captain to the actual never-assigned lost craft', async () => {
    const f = await normalSmallShipSetup(); await destroyNormalIcebreaker(f);
    await expect(assignNormalSmallShipCaptain(f)).rejects.toThrow();
    expect(read(`${f.root}/players/${wing}`).replacementRoleId).toBeUndefined();
  });
  it('writes assignment history in the actual replacement transaction even before any host loss', async () => {
    const f = await normalSmallShipSetup(); await assignNormalSmallShipCaptain(f);
    expect((read(f.root).smallShipStates as StoredDocument).gorgoneion).toMatchObject({ everAssigned: true });
  });
  it('preserves genuine assigned small-ship fate and never resets its assignment history on ordinary docking', async () => {
    const f = await normalSmallShipSetup(); await assignNormalSmallShipCaptain(f);
    await setSmallShipDocking.run(req({ sessionId: f.sessionId, instanceId, smallShipId: 'gorgoneion',
      hostShipId: null, docked: false, expectedRevision: 1, requestId: 'owner-owned-undock' }));
    await setSmallShipDocking.run(req({ sessionId: f.sessionId, instanceId, smallShipId: 'gorgoneion',
      hostShipId: 'icebreaker', docked: true, expectedRevision: 2, requestId: 'owner-owned-redock' }));
    const before = structuredClone((read(f.root).smallShipStates as StoredDocument).gorgoneion);
    await destroyNormalIcebreaker(f);
    expect((read(f.root).smallShipStates as StoredDocument).gorgoneion).toEqual(before);
    expect(before).toMatchObject({ everAssigned: true });
  });
  it('keeps missing legacy assignment provenance ambiguous instead of irreversibly losing an admitted craft', async () => {
    const f = await normalSmallShipSetup();
    delete ((read(f.root).smallShipStates as StoredDocument).gorgoneion as StoredDocument).everAssigned;
    await expect(destroyNormalIcebreaker(f)).rejects.toThrow(/assignment|custody|history/);
  });
  it('zeros never-assigned PDF fighters through ordinary host destruction with canonical terminal identity', async () => {
    const f = await normalPrefix(false, false, { onlySetup: true });
    await setGmShipConsoleWriteGrant.run(req({ sessionId: f.sessionId, instanceId, shipId: 'refinery-124',
      enabled: true, claimedAt: (read(`${f.root}/gmInstances/${instanceId}`).claimedAt as { toDate: () => Date }).toDate().toISOString() }));
    for (let draw = 0; draw < 10; draw++) await addShipDamage.run(req({ sessionId: f.sessionId, instanceId,
      shipId: 'refinery-124', requestId: `owner-pdf-loss-${draw}`,
      expectedRevision: (read(f.root).vesselActionRevisions as StoredDocument)?.['refinery-124'] ?? 0 }));
    expect(read(`${f.root}/serverState/pdfEscortWing`)).toMatchObject({ fighters: 0, losses: 4, launched: false,
      hostLoss: { status: 'lost', destroyedHostShipId: 'refinery-124', cycle: 1, sourceId: 'damage-destroyed-refinery-124' } });
    expect(removalEntries(f.root)).toEqual([]);
    const state = structuredClone(read(`${f.root}/serverState/pdfEscortWing`));
    await addShipDamage.run(req({ sessionId: f.sessionId, instanceId, shipId: 'refinery-124',
      requestId: 'owner-pdf-loss-9', expectedRevision: 9 }));
    expect(read(`${f.root}/serverState/pdfEscortWing`)).toEqual(state);
  });
});


// Later affected-gate qualification, after the three-kind producer edit. The
// AEGIS destruction prerequisite is explicitly prepared here because its
// recyclable hull draws cannot exhaust through the deterministic draw port.
async function destroyPreparedAegis(f: Awaited<ReturnType<typeof normalPrefix>>) {
  (read(f.root).shipDamage as StoredDocument).aegis = {
    damagedSystemIds: SHIP_DAMAGE_DECKS.aegis.map(card => card.systemId), destroyed: false,
  };
  await setGmShipConsoleWriteGrant.run(req({ sessionId: f.sessionId, instanceId, shipId: 'aegis', enabled: true,
    claimedAt: (read(`${f.root}/gmInstances/${instanceId}`).claimedAt as { toDate: () => Date }).toDate().toISOString() }));
  return addShipDamage.run(req({ sessionId: f.sessionId, instanceId, shipId: 'aegis',
    expectedRevision: 0, requestId: 'owner-aegis-catastrophe' }));
}
async function declareFromCurrentManualSetup(f: Awaited<ReturnType<typeof normalPrefix>>) {
  await setWolfAttackWindow.run(req({ sessionId: f.sessionId, instanceId, requestId: 'owner-future-due', expectedRevision: 0, status: 'due' }));
  await stageWolfAttackPreparation.run(req({ sessionId: f.sessionId, instanceId, requestId: 'owner-future-draft', expectedRevision: 0, turn: 1,
    shipIds: [...Array(10).fill('wolf-fighter-wing'), ...Array(5).fill('wolf-assault-transport')],
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' }));
  return declareWolfAttack.run(req({ sessionId: f.sessionId, instanceId, requestId: 'owner-future-declare', expectedRevision: 1 }));
}
it('zeros both never-assigned AEGIS wings and denies a new GM count correction after terminal loss', async () => {
  const f = await normalPrefix(false, false, { onlySetup: true, withoutWing: true });
  await destroyPreparedAegis(f);
  expect(read(f.root).fighterWingCounts).toEqual({
    'fighter-wing-alpha': { count: 0, revision: 1 }, 'fighter-wing-bravo': { count: 0, revision: 1 },
  });
  await expect(setFighterWingCount.run(req({ sessionId: f.sessionId, instanceId, requestId: 'owner-revive-count',
    wingId: alpha, count: 1, expectedRevision: 1 }))).rejects.toThrow();
  expect((read(f.root).fighterWingCounts as StoredDocument)[alpha]).toEqual({ count: 0, revision: 1 });
});
it('preserves genuinely assigned AEGIS wing counts with the existing retained player craft rule', async () => {
  const f = await normalPrefix(false, false, { onlySetup: true });
  const before = structuredClone(read(f.root).fighterWingCounts);
  await destroyPreparedAegis(f);
  expect(read(f.root).fighterWingCounts).toEqual(before);
  expect((read(f.root).retainedShuttles as StoredDocument).starlight).toMatchObject({ holderUid: wing });
});
it('rejects a counterfeit terminal PDF marker at the actual declaration when its host is not destroyed', async () => {
  const f = await normalPrefix(false, false, { onlySetup: true });
  mock.documents.set(`${f.root}/serverState/pdfEscortWing`, { ...initialPdfEscortWingState(), revision: 1, fighters: 0, losses: 4,
    hostLoss: { status: 'lost', destroyedHostShipId: 'refinery-124', cycle: 1,
      sourceId: 'damage-destroyed-refinery-124', lostAt: new Date().toISOString() } });
  await expect(declareFromCurrentManualSetup(f)).rejects.toThrow(/PDF|host.loss|provenance/);
  expect(mock.documents.has(f.statePath)).toBe(false);
});
it('preserves source-produced predeclaration PDF loss through the actual later declaration without regrowing fighters', async () => {
  const f = await normalPrefix(false, false, { onlySetup: true });
  await setGmShipConsoleWriteGrant.run(req({ sessionId: f.sessionId, instanceId, shipId: 'refinery-124', enabled: true,
    claimedAt: (read(`${f.root}/gmInstances/${instanceId}`).claimedAt as { toDate: () => Date }).toDate().toISOString() }));
  for (let draw = 0; draw < 10; draw++) await addShipDamage.run(req({ sessionId: f.sessionId, instanceId,
    shipId: 'refinery-124', requestId: `owner-future-pdf-${draw}`, expectedRevision: draw }));
  await expect(declareFromCurrentManualSetup(f)).resolves.toMatchObject({ status: 'committed' });
  expect(read(`${f.root}/serverState/pdfEscortWing`)).toMatchObject({ fighters: 0, losses: 4, launched: false,
    attackCycle: null, hostLoss: { sourceId: 'damage-destroyed-refinery-124' } });
});

it('keeps actual shuttle and admitted small-ship losses terminal through ordinary host repair and a future declaration', async () => {
  const f = await normalSmallShipSetup(); await destroyNormalIcebreaker(f);
  const loss = structuredClone(read(f.root).lostShuttles);
  await expect(repairAllShipDamage.run(req({ sessionId: f.sessionId, instanceId, shipId: 'icebreaker',
    expectedRevision: 9, requestId: 'owner-repair-icebreaker' }))).resolves.toMatchObject({ repaired: true });
  expect((read(f.root).shipDamage as StoredDocument).icebreaker).toMatchObject({ destroyed: false });
  await expect(declareFromCurrentManualSetup(f)).resolves.toMatchObject({ status: 'committed' });
  expect(read(f.root).lostShuttles).toMatchObject(loss);
  expect((read(f.root).smallShipStates as StoredDocument).gorgoneion).toMatchObject({ hostShipId: null, loss: { status: 'lost' } });
  await expect(setSmallShipDocking.run(req({ sessionId: f.sessionId, instanceId, smallShipId: 'gorgoneion', hostShipId: 'aegis',
    docked: true, expectedRevision: 2, requestId: 'owner-revive-repaired-smallship' }))).rejects.toThrow();
});
it('keeps actual PDF host loss at zero after ordinary host repair and a new real attack initialization', async () => {
  const f = await normalPrefix(false, false, { onlySetup: true });
  await setGmShipConsoleWriteGrant.run(req({ sessionId: f.sessionId, instanceId, shipId: 'refinery-124', enabled: true,
    claimedAt: (read(`${f.root}/gmInstances/${instanceId}`).claimedAt as { toDate: () => Date }).toDate().toISOString() }));
  for (let draw = 0; draw < 10; draw++) await addShipDamage.run(req({ sessionId: f.sessionId, instanceId,
    shipId: 'refinery-124', requestId: `owner-repair-pdf-damage-${draw}`, expectedRevision: draw }));
  await repairAllShipDamage.run(req({ sessionId: f.sessionId, instanceId, shipId: 'refinery-124',
    expectedRevision: 10, requestId: 'owner-repair-refinery' }));
  await expect(declareFromCurrentManualSetup(f)).resolves.toMatchObject({ status: 'committed' });
  expect(read(`${f.root}/serverState/pdfEscortWing`)).toMatchObject({ fighters: 0, losses: 4,
    hostLoss: { status: 'lost' }, attackCycle: 1, launched: false });
});

it('requires the original catastrophe before an ordinary repair can acknowledge terminal craft history', async () => {
  const f = await normalSmallShipSetup(); await destroyNormalIcebreaker(f);
  mock.documents.delete(`${f.root}/damageDraws/damage-destroyed-icebreaker`);
  const before = structuredClone(read(f.root));
  await expect(repairAllShipDamage.run(req({ sessionId: f.sessionId, instanceId, shipId: 'icebreaker',
    expectedRevision: 9, requestId: 'owner-repair-without-catastrophe' }))).rejects.toThrow(/original host catastrophe/);
  expect(read(f.root)).toEqual(before);
});
it('denies missing, foreign and future repair witnesses rather than reviving a terminal craft on a living host', async () => {
  const f = await normalSmallShipSetup(); await destroyNormalIcebreaker(f);
  await repairAllShipDamage.run(req({ sessionId: f.sessionId, instanceId, shipId: 'icebreaker',
    expectedRevision: 9, requestId: 'owner-repair-witness-denials' }));
  const loss = (read(f.root).lostShuttles as StoredDocument).highwall as StoredDocument;
  const proof = structuredClone(loss.hostRepair as StoredDocument);
  for (const [index, hostRepair] of [undefined, { ...proof, sourceId: 'damage-destroyed-aegis' }, { ...proof, revision: 11 }].entries()) {
    if (hostRepair === undefined) delete loss.hostRepair; else loss.hostRepair = hostRepair;
    await expect(index === 0 ? declareFromCurrentManualSetup(f) : declareWolfAttack.run(req({ sessionId: f.sessionId, instanceId,
      requestId: `owner-denied-repair-witness-${index}`, expectedRevision: 1 }))).rejects.toThrow();
    expect((read(f.root).shuttleDockings as StoredDocument[]).some(dock => dock.shuttleId === 'highwall')).toBe(false);
  }
});
it('continues the actual connected range/boarding finalizer and next Team after terminal unassigned host loss', async () => {
  const f = await normalPrefix(); await destroyNormalIcebreaker(f);
  await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
  expect(read(f.statePath).currentStep).toBe('medium-range');
  const medium = await getWolfFighterRangeActionChoice.run(req({ sessionId: f.sessionId, sourceId: alpha, range: 'medium-range' }, wing));
  await commitWolfFighterRangeActionChoice.run(req({ sessionId: f.sessionId, requestId: 'owner-chain-medium', expectedTurn: 1,
    expectedRevision: medium.revision, sourceId: alpha, range: 'medium-range', actions: [
      { fighterIndex: 0, kind: 'attack', targetContactId: medium.targets[0].instanceId },
      { fighterIndex: 1, kind: 'target-shift', targetContactId: medium.targets[0].instanceId, shift: -1 },
    ] }, wing));
  expect(read(f.statePath).currentStep).toBe('short-range');
  const short = await getWolfFighterRangeActionChoice.run(req({ sessionId: f.sessionId, sourceId: alpha, range: 'short-range' }, wing));
  await commitWolfFighterRangeActionChoice.run(req({ sessionId: f.sessionId, requestId: 'owner-chain-short', expectedTurn: 1,
    expectedRevision: short.revision, sourceId: alpha, range: 'short-range',
    fighterIndexes: short.fighters.map((fighter: { fighterIndex: number }) => fighter.fighterIndex) }, wing));
  const defence = await getWolfBoardingDefenceChoice.run(req({ sessionId: f.sessionId }, admiral));
  await commitWolfBoardingDefenceChoice.run(req({ sessionId: f.sessionId, requestId: 'owner-chain-defence', expectedTurn: 1,
    expectedRevision: defence.revision, targetShipId: defence.targetShipId, securityTeams: defence.availableSecurityTeams }, admiral));
  for (let step = 0; step < 12 && read(f.statePath).status !== 'resolved'; step++) {
    await advanceWolfAttackLifecycle.run({ params: { sessionId: f.sessionId } });
  }
  expect(read(f.statePath)).toMatchObject({ status: 'resolved', currentStep: 'resolved', attackId: f.attackId });
  expect(read(`${f.statePath}/audit/wolf-finalized-1`)).toMatchObject({ type: 'wolf-attack-finalization', attackId: f.attackId });
  await expect(advanceTurn.run(req({ sessionId: f.sessionId, instanceId, expectedTurn: 1, requestId: 'owner-next-team',
    skipTurnStartAnnouncement: true }))).resolves.toMatchObject({ currentTurn: 2 });
  expect((read(f.root).lostShuttles as StoredDocument).highwall).toMatchObject({ status: 'lost' });
  expect((read(f.root).shuttleControl as StoredDocument).highwall).toBeUndefined();
});

it('does not report an already GM-removed assigned player as a fresh destruction victim or a second Kick victim', async () => {
  const f = await normalPrefix(false, false, { onlySetup: true, withoutWing: true });
  await kickPlayer.run(req({ sessionId: f.sessionId, instanceId, requestId: 'owner-kick-before-destruction', targetUid: admiral }));
  const entries = structuredClone(removalEntries(f.root));
  expect(entries).toHaveLength(1);
  await expect(kickPlayer.run(req({ sessionId: f.sessionId, instanceId, requestId: 'owner-redundant-kick', targetUid: admiral }))).rejects.toThrow(/no longer connected/);
  expect(removalEntries(f.root)).toEqual(entries);
  await destroyPreparedAegis(f);
  expect(removalEntries(f.root)).toEqual(entries);
});
