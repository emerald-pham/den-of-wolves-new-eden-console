import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaintenanceSystems from './MaintenanceSystems';
import { ConsoleAccessContext } from '@/lib/consoleAccess';
import { runMaintenance } from '@/lib/maintenanceService';
import { useSessionStore } from '@/store/useSessionStore';
import capybara from '@/data/vessels/capybara';
import type { GameSession, Player } from '@/types/game';
import { advanceMaintenance, emptyMaintenanceCycle, type MaintenanceInput } from '../../functions/src/maintenance';
import { requireMaintenanceRequest } from '../../functions/src/requestGuards';
import { buildVesselActionEnvelope } from '../../functions/src/vesselActionEnvelope';

const transport = vi.hoisted(() => ({ callable: vi.fn(), invoke: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: transport.callable }));
vi.mock('@/lib/firebase', () => ({ functions: () => 'native-transport' }));

type Row = Record<string, unknown>;
const sourceRoot = resolve(import.meta.dirname, '../..');
const capyText = readFileSync(resolve(sourceRoot, 'scripts/pc10-capybara-full-gameplay.mjs'), 'utf8');
const capySource = ts.createSourceFile('capy.mjs', capyText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const indexText = readFileSync(resolve(sourceRoot, 'functions/src/index.ts'), 'utf8');
const indexSource = ts.createSourceFile('index.ts', indexText, ts.ScriptTarget.Latest, true);

function findNode<T extends ts.Node>(source: ts.Node, predicate: (node: ts.Node) => node is T): T {
  let found: T | undefined;
  function visit(node: ts.Node) {
    if (found) return;
    if (predicate(node)) found = node;
    else ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, 'The current production source seam must exist.');
  return found;
}

const maintenanceCallback = findNode(indexSource, (node): node is ts.VariableDeclaration =>
  ts.isVariableDeclaration(node) && node.name.getText(indexSource) === 'runMaintenance');
const allowed = findNode(maintenanceCallback, (node): node is ts.VariableDeclaration =>
  ts.isVariableDeclaration(node) && node.name.getText(indexSource) === 'allowed');
const requestShapeGuard = findNode(maintenanceCallback, (node): node is ts.IfStatement =>
  ts.isIfStatement(node) && node.expression.getText(indexSource).includes('Object.keys(raw)'));
const reply = findNode(maintenanceCallback, (node): node is ts.VariableDeclaration =>
  ts.isVariableDeclaration(node) && node.name.getText(indexSource) === 'reply' &&
  node.initializer?.getText(indexSource).includes('cycle: result.cycle') === true);

function js(text: string) {
  return ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

const validateRequestShape = new Function('raw', 'HttpsError', js(
  `const allowed = ${allowed.initializer!.getText(indexSource)}; ${requestShapeGuard.getText(indexSource)}`,
)) as (raw: Row, error: typeof Error) => void;
const envelopeSource = ['sessionTurn', 'vesselActionPhase', 'vesselActorRoleId', 'vesselActionEnvelope'].map(name =>
  findNode(indexSource, (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name).getText(indexSource)).join('\n');
const lifecyclePhases = findNode(indexSource, (node): node is ts.VariableDeclaration =>
  ts.isVariableDeclaration(node) && node.name.getText(indexSource) === 'LIFECYCLE_PHASES');
const makeReply = new Function('buildVesselActionEnvelope', js(
  `const LIFECYCLE_PHASES = ${lifecyclePhases.initializer!.getText(indexSource)};\n${envelopeSource}\n` +
  `return (result, data, currentTurn, serverTime, snapshot, player, uid) => (${reply.initializer!.getText(indexSource)});`,
))(buildVesselActionEnvelope) as (result: ReturnType<typeof advanceMaintenance>, data: Row, turn: number,
  now: string, snapshot: { get: (key: string) => unknown }, player: { get: (key: string) => unknown }, uid: string) => Row;

const helper = findNode(capySource, (node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'runCapybaraMaintenanceWithExactReplay');
const normalize = findNode(capySource, (node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'normalizeReceipt');
const receiptText = readFileSync(resolve(sourceRoot, 'scripts/pc10-browser-ui-receipt.mjs'), 'utf8');
const receiptSource = ts.createSourceFile('receipt.mjs', receiptText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const observeReceipt = findNode(receiptSource, (node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'observeUiReceipt').getText(receiptSource).replace(/^export /, '');

const uid = 'native-original-recycler', sid = 'native-current-session', roleId = 'capybara-recycler';
const now = '2026-10-06T14:00:00.000Z';
const me: Player = { uid, sessionId: sid, role: 'player', displayName: 'Recycler', joinedAt: now,
  connected: true, seatId: 'native-recycler-seat', assignedRoleId: roleId, activeConsoleRoleId: roleId,
  fleetGroupId: 'native-original-group', connectionGeneration: 3, replacementStatus: null };
const baseSession: GameSession = {
  id: sid, name: 'Native DTO bridge', joinCode: 'NATIVE', ownerUid: 'native-gm', phase: 'active',
  createdAt: now, updatedAt: now, currentTurn: 1, capybaraEnabled: true,
  activeRoleIds: ['capybara-captain', roleId], activeVesselIds: ['capybara'],
  fullGameDemo: { status: 'active', progression: 'manual' },
  turnPhase: { turn: 1, teamPhaseEndsAt: now, openAirspaceEndsAt: now,
    progression: 'manual', airspace: { state: 'restricted', tickerActive: false, pressAccess: false } },
  maintenanceCycles: { capybara: emptyMaintenanceCycle() },
  shipResources: { capybara: { ...capybara.resources } },
  shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
  shipSurvivors: { capybara: capybara.initialSurvivors }, shipUnrest: { capybara: 0 },
};

function mountPanel() {
  render(<ConsoleAccessContext.Provider value={{ writable: true, roleId }}>
    <MaintenanceSystems name="Capybara" shipId="capybara" systems={capybara.systems}
      renderSystem={() => null} rations={null} />
  </ConsoleAccessContext.Provider>);
}

// The only simulated server I/O uses the current request guard, pure engine,
// and exact callable receipt expression. It tests DTO mapping, not server Auth,
// Rules, random outcomes, full maintenance, or gameplay acceptance.
function installTransport() {
  const captured: Array<{ request: Row; result: Row }> = [];
  let deliver: ((response: ReturnType<typeof responseFor>) => void) | undefined;
  let mutateRequest = (request: Row) => request;
  let mutateReply = (result: Row) => result;
  const receipts = new Map<string, { request: Row; result: Row }>();
  transport.invoke.mockImplementation(async (raw: Row) => {
    validateRequestShape(raw, Error);
    const data = requireMaintenanceRequest(raw);
    const prior = receipts.get(data.requestId);
    if (prior) {
      assert.deepEqual(raw, prior.request, 'Only the exact original request can replay.');
      return { data: structuredClone(prior.result) };
    }
    const state = useSessionStore.getState(), session = state.session!;
    const input: MaintenanceInput = {
      ...data, currentTurn: session.currentTurn!, cycle: session.maintenanceCycles!.capybara!,
      resources: session.shipResources!.capybara!, damage: session.shipDamage!.capybara!,
      population: session.shipSurvivors!.capybara!, unrest: session.shipUnrest!.capybara!,
      dockings: [], cargo: {}, fuelled: {}, rolls: [], entropy: 0, now,
      ...(raw.productionConsoleId === undefined ? {} : { productionConsoleId: raw.productionConsoleId as string }),
    };
    const result = advanceMaintenance(input);
    const emitted = makeReply(result, { ...data, consoleRoleId: raw.consoleRoleId }, session.currentTurn!, now,
      { get: key => (session as unknown as Row)[key] },
      { get: key => (state.me as unknown as Row)[key] }, state.me!.uid);
    receipts.set(data.requestId, { request: structuredClone(raw), result: structuredClone(emitted) });
    const capturedRequest = mutateRequest(structuredClone(raw));
    const capturedResult = mutateReply(structuredClone(emitted));
    captured.push({ request: capturedRequest, result: capturedResult });
    act(() => useSessionStore.setState({ session: { ...session,
      maintenanceCycles: { capybara: result.cycle }, shipResources: { capybara: result.resources } } }));
    deliver?.(responseFor(capturedRequest, capturedResult));
    return { data: emitted };
  });
  transport.callable.mockImplementation((_functions: unknown, endpoint: string) => {
    assert.equal(endpoint, 'runMaintenance');
    return transport.invoke;
  });
  return {
    captured,
    waitForResponse: () => new Promise<ReturnType<typeof responseFor>>(resolve => { deliver = resolve; }),
    mutateRequest: (mutate: typeof mutateRequest) => { mutateRequest = mutate; },
    mutateReply: (mutate: typeof mutateReply) => { mutateReply = mutate; },
  };
}

function responseFor(request: Row, result: Row) {
  return { status: () => 200, json: async () => ({ result }),
    url: () => 'https://native.invalid/us-central1/runMaintenance',
    request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: request }) }) };
}

interface NativeLocator {
  first: () => NativeLocator;
  or: (other: NativeLocator) => NativeLocator;
  waitFor: () => Promise<void>;
  isVisible: () => Promise<boolean>;
  isEnabled: () => Promise<boolean>;
  click: () => Promise<void>;
  getByRole: (role: string, options?: { name?: string | RegExp }) => NativeLocator;
  evaluateAll: (callback: (nodes: HTMLElement[]) => unknown) => Promise<unknown>;
}

function domLocator(role: string, name?: string | RegExp, root: () => HTMLElement = () => document.body): NativeLocator {
  const query = () => within(root()).queryByRole(role, name === undefined ? {} : { name });
  const get = () => {
    const element = query();
    assert.ok(element, `The real current component must offer ${String(name)}.`);
    return element;
  };
  return {
    first() { return this; },
    or(other) { return { ...this, waitFor: async () => { if (!query()) await other.waitFor(); } }; },
    waitFor: async () => { get(); }, isVisible: async () => !!query(),
    isEnabled: async () => !(get() as HTMLButtonElement).disabled,
    click: async () => { await userEvent.click(get()); },
    getByRole: (childRole, options = {}) => domLocator(childRole, options.name, get),
    evaluateAll: async callback => callback(within(root()).queryAllByRole(role, name === undefined ? {} : { name })),
  };
}

function stateProjection() {
  const state = useSessionStore.getState(), session = state.session!;
  return { ...session, sessionId: session.id, live: state.connection === 'live' && state.sessionSnapshotFreshness === 'server',
    cycle: session.currentTurn };
}

function actorProjection() {
  const state = useSessionStore.getState();
  return { uidHash: state.me?.uid === uid ? 'native-original-hash' : 'native-foreign-hash',
    sameActor: state.me?.uid === uid && state.me?.sessionId === sid, sessionId: state.me?.sessionId,
    profileRoleId: roleId, activeConsoleRoleId: state.me?.activeConsoleRoleId,
    connection: state.connection, freshness: state.sessionSnapshotFreshness };
}

function firstReceiptBridge(io: ReturnType<typeof installTransport>) {
  const surface = { observe: async () => actorProjection(), page: {
    getByRole: (role: string, options: { name: string | RegExp }) => domLocator(role, options.name),
    waitForResponse: io.waitForResponse,
  }, callable: async (endpoint: string, request: Row) => {
    const value = await transport.callable('native-transport', endpoint)(request);
    return { status: 'committed', result: value.data };
  } };
  const game = { state: async () => stateProjection(), select: async (selected: string) => {
    assert.equal(selected, roleId); return surface;
  } };
  // Run the ENTIRE unchanged production helper. Its existing after-Begin hook
  // is the finite boundary; later random maintenance/mission stages are not run.
  const run = new Function('assert', 'createTwoBrowserGameplay',
    `${observeReceipt}\n${normalize.getText(capySource)}\n${helper.getText(capySource)}\nreturn runCapybaraMaintenanceWithExactReplay;`,
  )(assert, () => game) as (context: Row, cycle: number, options: Row) => Promise<unknown>;
  const reached = new Error('source-validated-first-receipt-boundary');
  return { run: (cycle = 1) => run({ gm: {}, initial: { sessionId: sid } }, cycle, {
    gmRepair: async () => { throw reached; },
  }), reached };
}

beforeEach(() => {
  transport.callable.mockReset(); transport.invoke.mockReset();
  useSessionStore.getState().reset();
  useSessionStore.setState({ session: structuredClone(baseSession), me: { ...me }, connection: 'live',
    sessionSnapshotFreshness: 'server', identityHydrationRevision: 1 });
});

it('real normal Begin request has no cycle field and actual receipt supplies both current turn fields', async () => {
  const io = installTransport(); mountPanel();
  await userEvent.click(screen.getByRole('button', { name: 'Begin Maintenance Cycle: Cycle 1', exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'ARE YOU SURE?', exact: true }));
  const captured = io.captured[0]!;
  expect(captured.request).toMatchObject({ sessionId: sid, shipId: 'capybara', action: 'begin',
    expectedRevision: 0, consoleRoleId: roleId, requestId: expect.any(String) });
  expect(Object.hasOwn(captured.request, 'expectedCycle')).toBe(false);
  expect(captured.result).toMatchObject({ status: 'committed', sessionId: sid, shipId: 'capybara',
    action: 'begin', expectedRevision: 0, currentTurn: 1, committedRevision: 1, cycle: { turn: 1, revision: 1, step: 1 } });
  expect(() => validateRequestShape({ ...captured.request, expectedCycle: 1 }, Error)).toThrow();
  expect(transport.invoke).toHaveBeenCalledTimes(1);
});

it('entire Capy helper accepts the real cycle-bound Begin DTO and exact replay before its next existing hook', async () => {
  const io = installTransport(); mountPanel();
  const bridge = firstReceiptBridge(io);
  await expect(bridge.run()).rejects.toBe(bridge.reached);
  expect(io.captured).toHaveLength(1);
  expect(transport.invoke).toHaveBeenCalledTimes(2);
  expect(transport.invoke.mock.calls[1]![0]).toEqual(io.captured[0]!.request);
});

it('the actual Capy production loop touches only offered production controls, then bays remain separate', async () => {
  useSessionStore.setState({ session: { ...baseSession, maintenanceCycles: { capybara: {
    ...emptyMaintenanceCycle(), turn: 1, step: 6, revision: 6,
    charges: ['jump-drive', 'shuttle-bay', 'scrap-refinery'],
  } } } });
  installTransport(); mountPanel();
  const group = screen.getByRole('group', { name: 'Capybara production consoles' });
  expect(within(group).getByRole('button', { name: 'Run Scrap Refinery', exact: true })).toBeEnabled();
  expect(within(group).queryByRole('button', { name: 'Run Jump Drive', exact: true })).toBeNull();
  expect(within(group).queryByRole('button', { name: 'Run Shuttle Bay', exact: true })).toBeNull();
  expect(screen.getByRole('combobox', { name: 'Shuttle Bay refuelling', exact: true })).toBeInTheDocument();
  const loop = findNode(helper, (node): node is ts.ForOfStatement =>
    ts.isForOfStatement(node) && node.statement.getText(capySource).includes('production.getByRole'));
  const execute = async (button: ReturnType<typeof domLocator>) => { await button.click(); };
  const runLoop = new Function('production', 'execute', `return (async () => { ${loop.getText(capySource)} })();`);
  await runLoop(domLocator('group', 'Capybara production consoles'), execute);
  expect(transport.invoke).toHaveBeenCalledTimes(1);
  expect(transport.invoke.mock.calls[0]![0]).toMatchObject({ action: 'production', productionConsoleId: 'scrap-refinery' });
});

it('original pre-source cycle mismatch rejects before a UI command or replay', async () => {
  const io = installTransport(); mountPanel();
  await expect(firstReceiptBridge(io).run(2)).rejects.toThrow();
  expect(transport.invoke).not.toHaveBeenCalled();
});

it.each(['sessionId', 'shipId'] as const)('captured wrong %s request fails the original bridge guard before replay', async key => {
  const io = installTransport(); io.mutateRequest(request => ({ ...request, [key]: 'foreign' })); mountPanel();
  await expect(firstReceiptBridge(io).run()).rejects.toThrow();
  expect(transport.invoke).toHaveBeenCalledTimes(1);
});

it('cached authority cannot send the normal maintenance SDK request', async () => {
  installTransport(); useSessionStore.setState({ sessionSnapshotFreshness: 'cache' });
  await expect(runMaintenance('capybara', 'begin', 0, {}, roleId)).rejects.toThrow(/live session state/i);
  expect(transport.callable).not.toHaveBeenCalled();
});
