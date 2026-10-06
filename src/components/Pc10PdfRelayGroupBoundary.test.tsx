import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { constants, createContext, Script, SyntheticModule } from 'node:vm';
import ts from 'typescript';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { isCanonicalRequestId, requireUid, requireNonterminalSessionPhase } from '../../functions/src/requestGuards';
import { commandReceiptDisposition } from '../../functions/src/commandIdempotency';
import { commandError } from '../../functions/src/commandErrors';
import { fleetGroupRecord, ordinaryFleetCommunicationGroup } from '../../functions/src/fleetGroups';
import { requirePursuitEmergencyWindowAbsent } from '../../functions/src/pursuitEmergencyWindow';
import { isPresenceStale } from '../../functions/src/sessionLifecycle';
import PdfNewsRelayPanel from './PdfNewsRelayPanel';
import { createCurrentMemberSessionReader } from '../../functions/src/memberSessionCallable';
import { sessionFrom } from '@/lib/firestore';
import { entityId, parseEntityId } from '@/types/identifiers';
import { normalizeDisplayName } from '@/lib/displayName';
import { Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import type { Player } from '@/types/game';
import { stripGmNavigationProjection } from '@/lib/navigationPrivacy';
import type { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';

const functionsRequire = createRequire(resolve(process.cwd(), 'functions/package.json'));
const { HttpsError } = functionsRequire('firebase-functions/v2/https');
const { Timestamp } = functionsRequire('firebase-admin/firestore');

// Real React control, fleetGroupService/parser, Zustand, serialized generic and
// rich selectors, specialist phase/driver and complete current Capy caller run.
// Firebase transport and native DOM layout are inert; no Auth/DB/browser runs.
const transport = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions: unknown, name: string) =>
  (payload: unknown) => transport.call(name, payload) }));
vi.mock('@/lib/firebase', () => ({ functions: () => ({}) }));
const nativeImport = (name: string) => new Script('import(url)', {
  importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
}).runInNewContext({ url: pathToFileURL(resolve(process.cwd(), 'scripts', name)).href });
const specialist = await nativeImport('pc10-specialist-gameplay.mjs');
const { createTwoBrowserGameplay } = await nativeImport('pc10-two-browser-gameplay.mjs');
const { runPc10SpecialistAction, PC10_SPECIALIST_ACTIONS } = await nativeImport('pc10-specialist-phases.mjs');
const { capybaraStageOutcome, projectCapybaraEvidence } = await nativeImport('pc10-capybara-full-gameplay.mjs');
const sourceFile = (path: string) => ts.createSourceFile(path, readFileSync(resolve(process.cwd(), path), 'utf8'),
  ts.ScriptTarget.Latest, true);
function declarations(file: ts.SourceFile, names: string[]) {
  const found: ts.FunctionDeclaration[] = [];
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file); expect(found).toHaveLength(names.length); return found;
}
const playerFile = sourceFile('src/lib/firestore.ts');
const playerSource = ts.transpileModule(`${declarations(playerFile, ['iso', 'optionalIso', 'playerFrom'])
  .map(node => node.getText(playerFile)).join('\n')}\nplayerFrom;`,
{ compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const actualPlayerFrom = new Script(playerSource).runInNewContext({
  entityId, parseEntityId, normalizeDisplayName, FirestoreTimestamp,
}) as (sessionId: string, actorUid: string, data: Record<string, unknown>) => Player;
const observerFile = sourceFile('scripts/pc10-full-game-demo-ui-proof.mjs');
const returned = declarations(observerFile, ['observe'])[0]!.body!.statements[0] as ts.ReturnStatement;
const genericCallback = new Script(`(${(returned.expression as ts.CallExpression).arguments[0]!.getText(observerFile)})`)
  .runInNewContext();
const capyFile = sourceFile('scripts/pc10-capybara-full-gameplay.mjs');
const capyDeclarations = declarations(capyFile, ['attemptSpecialist', 'runSpecialist', 'inspectRenderedAction']);
const plannedRelayMessages: string[] = [];
function findPlannedRelays(node: ts.Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(capyFile) === 'runSpecialist' &&
      node.arguments[0]?.getText(capyFile) === "'pdf-group-relay'") {
    const inputs = node.arguments[2] as ts.ObjectLiteralExpression;
    const message = inputs.properties.find(property => ts.isPropertyAssignment(property) &&
      property.name.getText(capyFile) === 'message') as ts.PropertyAssignment;
    expect(ts.isStringLiteral(message.initializer)).toBe(true);
    plannedRelayMessages.push((message.initializer as ts.StringLiteral).text);
  }
  ts.forEachChild(node, findPlannedRelays);
}
findPlannedRelays(capyFile); expect(plannedRelayMessages).toHaveLength(2);

// Execute the actual Functions request parser, reply predicate, message and
// receipt expressions. This is DTO/render evidence, not a server transaction or
// backend membership qualification. The full authority transaction stays out.
const serverFile = sourceFile('functions/src/index.ts');
const serverDeclarations = declarations(serverFile, ['groupNoteRequest', 'isFleetGroupMessageReply']);
let sendHandler: ts.Node | undefined, message: ts.VariableDeclaration | undefined, result: ts.VariableDeclaration | undefined;
function findHandler(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.name.getText(serverFile) === 'sendFleetGroupMessage') sendHandler = node.initializer;
  ts.forEachChild(node, findHandler);
}
findHandler(serverFile); expect(sendHandler).toBeDefined();
function findReceipt(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.name.getText(serverFile) === 'message') message = node;
  if (ts.isVariableDeclaration(node) && node.name.getText(serverFile) === 'result' &&
      node.type?.getText(serverFile) === 'FleetGroupMessageReply') result = node;
  ts.forEachChild(node, findReceipt);
}
findReceipt(sendHandler!); expect(message).toBeDefined(); expect(result).toBeDefined();
const serverDto = ts.transpileModule(`${serverDeclarations.map(node => node.getText(serverFile)).join('\n')}\n` +
  `const data = groupNoteRequest(payload, true); const message = ${message!.initializer!.getText(serverFile)};\n` +
  `const result = ${result!.initializer!.getText(serverFile)}; ({ result, message, valid: isFleetGroupMessageReply(result) });`,
{ compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const sid = 'native-pdf-relay-session', uid = 'private-native-pdf', roleId = 'refinery-124-pdf-colonel';
const privateText = 'Native current-group relay copy must stay only in memory.';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
type Row = Record<string, unknown>;
function actualServerDto(payload: Row) {
  return plain(new Script(serverDto).runInNewContext({ payload, uid, groupId: 'fleet-1',
    now: '2026-10-06T17:43:45.000Z', isCanonicalRequestId,
    isRecord: (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value),
    HttpsError: class extends Error { constructor(_code: string, message: string) { super(message); } },
  })) as { result: Row; message: Row; valid: boolean };
}

// The existing handlers and their actual authority/replay/read helpers execute
// over inert in-memory document I/O. There is no deployed callable, transaction
// concurrency or Rules claim. Exact replay executes the real no-duplicate path.
const handlerHelpers = declarations(serverFile, ['isRecord', 'groupNoteRequest', 'isFleetGroupMessageReply',
  'groupNoteAuthority', 'storedGroupNotes', 'activeVesselIdsForSession', 'isActivePlayer',
  'isConnectedPlayer', 'isKickedPlayer', 'requireActiveGameplayPhase', 'requireTurnPursuitMembership',
  'movementPursuitFleetGroups', 'commandReceiptRef', 'replayBoundCommand']);
let readHandler: ts.Node | undefined;
function findReadHandler(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.name.getText(serverFile) === 'readFleetGroupMessages') readHandler = node.initializer;
  ts.forEachChild(node, findReadHandler);
}
findReadHandler(serverFile); expect(readHandler).toBeDefined();
const handlerSource = ts.transpileModule(`${handlerHelpers.map(node => node.getText(serverFile)).join('\n')}\n` +
  `const send = ${(sendHandler as ts.CallExpression).arguments[1]!.getText(serverFile)};\n` +
  `const read = ${(readHandler as ts.CallExpression).arguments[1]!.getText(serverFile)}; ({ send, read });`,
{ compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function actualHandlers() {
  const data = new Map<string, Row>([
    [`sessions/${sid}`, { id: sid, name: 'Native current PDF table', joinCode: '4821', phase: 'active', currentTurn: 1,
      fullGameDemo: { status: 'active', progression: 'manual' }, activeRoleIds: [roleId],
      activeVesselIds: ['refinery-124'], shipFleetGroupIds: { 'refinery-124': 'fleet-1' },
      createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z' }],
    [`sessions/${sid}/players/${uid}`, { connected: true, fleetGroupId: 'fleet-1',
      lastSeenAt: Timestamp.now(), role: 'player', connectionGeneration: 3, seatId: roleId,
      replacementStatus: null, assignedRoleId: roleId, activeConsoleRoleId: roleId }],
    [`sessions/${sid}/fleetGroups/fleet-1`, { id: 'fleet-1', vesselIds: ['refinery-124'],
      memberUids: [uid], memberShipIds: { [uid]: 'refinery-124' } }],
  ]);
  const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: data.has(path),
    get: (key: string) => data.get(path)?.[key], data: () => data.get(path) });
  let noteWrites = 0;
  const db = { doc: (path: string) => path, collection: (path: string) => ({ path }),
    runTransaction: async (run: (tx: unknown) => unknown) => run({
      get: async (ref: string | { path: string }) => typeof ref === 'string' ? snapshot(ref) : {
        docs: [...data.keys()].filter(path => path.startsWith(`${ref.path}/`) &&
          !path.slice(ref.path.length + 1).includes('/')).map(snapshot),
      },
      set: (ref: string, value: Row) => { if (ref.includes('/fleetGroupMessages/')) noteWrites++; data.set(ref, value); },
    }),
  };
  const handlers = new Script(handlerSource).runInNewContext({ db, Timestamp, requireUid,
    requireNonterminalSessionPhase, requirePursuitEmergencyWindowAbsent, isPresenceStale, fleetGroupRecord,
    ordinaryFleetCommunicationGroup, isCanonicalRequestId, commandReceiptDisposition, commandError,
    HttpsError, FieldValue: { serverTimestamp: () => 'native-inert-write-time' } });
  const memberRead = createCurrentMemberSessionReader({ db: db as unknown as Firestore,
    projectSession: (source: DocumentSnapshot, id: string) => ({ ...source.data(), id }) });
  return { member: async () => memberRead({ auth: { uid }, data: { sessionId: sid } }),
    player: () => actualPlayerFrom(sid, uid, data.get(`sessions/${sid}/players/${uid}`)!),
    gmSession: () => ({ ...sessionFrom(sid, data.get(`sessions/${sid}`)!),
      shipFleetGroupIds: data.get(`sessions/${sid}`)!.shipFleetGroupIds as Record<string, string> }),
    send: async (payload: Row) => plain(await handlers.send({ auth: { uid }, data: payload })) as Row,
    read: async (payload: Row) => plain(await handlers.read({ auth: { uid }, data: payload })) as Row,
    notes: () => data.get(`sessions/${sid}/fleetGroupMessages/fleet-1`)?.messages as Row[],
    noteWrites: () => noteWrites };
}
beforeEach(() => {
  transport.call.mockReset();
  const store = useSessionStore.getState(); store.reset();
  store.setIdentity({ id: sid, name: 'Native PDF table', joinCode: '4821', phase: 'active', currentTurn: 1,
    fullGameDemo: { status: 'active', progression: 'manual' }, setupRevision: 999,
    activeRoleIds: [roleId], activeVesselIds: ['refinery-124'], shipFleetGroupIds: { 'refinery-124': 'fleet-1' },
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['refinery-124'], craftIds: [] },
    currentActorBerthAuthority: { sessionId: sid, actorUid: uid, groupId: 'fleet-1', role: 'player',
      connectionGeneration: 3, assignedRoleId: roleId, activeConsoleRoleId: roleId,
      replacementRoleId: null, replacementStatus: null, shipId: 'refinery-124' },
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z',
  }, { uid, sessionId: sid, displayName: 'PDF Colonel', role: 'player', connected: true,
    assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId, fleetGroupId: 'fleet-1',
    connectionGeneration: 3, replacementRoleId: null, replacementStatus: null,
    joinedAt: '2026-10-06T00:00:00.000Z' });
  store.setConnection('live'); store.setSessionSnapshotFreshness('server');
});

function fixture({ replyChange, noteChange, afterSend, beforeSecondSelect, duringSecondSelection, beforeRender, replayChange, mutationRequest }:
  { replyChange?: (reply: Row) => void; noteChange?: (notes: Row[]) => void; afterSend?: () => void;
    beforeSecondSelect?: () => void; duringSecondSelection?: () => void; beforeRender?: () => void; replayChange?: (reply: Row) => void;
    mutationRequest?: (request: Row) => void } = {}) {
  let authUid = uid, timeOrigin = 1000, resolveResponse: (value: unknown) => void, issuedReply: Row;
  let notes: Row[] = [], saved: unknown, selects = 0, fills = 0, clicks = 0, observers = 0;
  let stateCalls = 0, domScans = 0;
  let richSamples = 0;
  const calls: { name: string; payload: Row }[] = [], replays: Row[] = [];
  const backend = actualHandlers();
  async function evaluate(callback: (...args: never[]) => unknown, input: unknown, sampledStore = useSessionStore) {
    const browser = createContext({ input, crypto: webcrypto, TextEncoder, document, performance: { timeOrigin } });
    const modules = new Map<string, SyntheticModule>();
    for (const [name, exports] of [
      ['/src/store/useSessionStore.ts', { useSessionStore: sampledStore }],
      ['/src/lib/firebase.ts', { auth: () => ({ currentUser: authUid ? { uid: authUid } : null }) }],
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: { roleId, sessionId: sid } }],
    ] as const) {
      const module = new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context: browser });
      await module.link(() => { throw new Error('No native extra import.'); }); await module.evaluate(); modules.set(name, module);
    }
    const value = plain(await new Script(`(${callback.toString()})(input)`, { importModuleDynamically: async name => {
      const module = modules.get(name); if (!module) throw new Error(`No native SDK read: ${name}`); return module;
    } }).runInContext(browser));
    if (callback.toString().includes('currentMemberBerthPresent') && selects === 2 && ++richSamples === 1)
      await act(async () => { duringSecondSelection?.(); });
    return value;
  }
  const locate = (query: () => HTMLElement[]) => ({
    isVisible: async () => query().length === 1 && !query()[0]!.hidden,
    isEnabled: async () => query().length === 1 && !query()[0]!.matches(':disabled'),
    evaluateAll: async (callback: (nodes: HTMLElement[], argument?: unknown) => unknown, argument?: unknown) => {
      domScans++;
      await act(async () => { beforeRender?.(); });
      const nodes = query();
      for (const node of document.querySelectorAll<HTMLElement>('*')) node.getClientRects = () =>
        node.hidden ? [] as unknown as DOMRectList : [{ width: 1, height: 1 }] as unknown as DOMRectList;
      return new Script(`(${callback.toString()})(nodes, argument)`).runInNewContext({ nodes, argument,
        getComputedStyle: (node: Element) => document.defaultView!.getComputedStyle(node) });
    },
    fill: async (value: string) => { fills++; await act(async () => { fireEvent.change(query()[0]!, { target: { value } }); }); },
    click: async () => {
      const sentBeforeClick = calls.filter(call => call.name === 'sendFleetGroupMessage').length;
      const node = query()[0]!; expect(node).toBeEnabled(); clicks++;
      await act(async () => { fireEvent.click(node); });
      await act(async () => { await vi.waitFor(() => expect(calls.filter(call => call.name === 'sendFleetGroupMessage').slice(sentBeforeClick)).toHaveLength(1)); });
      await act(async () => { afterSend?.(); });
    },
  });
  const page = { url: () => `http://native.invalid/#/ships/refinery-124/roles/${roleId}`, evaluate,
    getByRole: (kind: 'region' | 'status', options: { name: string; exact?: boolean }) => {
      if (kind === 'region') return {
        getByRole: (childKind: 'button' | 'status', childOptions: { name?: string } = {}) => locate(() => {
          const region = screen.queryByRole('region', { name: options.name });
          return region ? within(region).queryAllByRole(childKind, childOptions.name ? { name: childOptions.name } : {}) : [];
        }),
        getByLabel: (name: string) => locate(() => {
          const region = screen.queryByRole('region', { name: options.name });
          return region ? within(region).queryAllByLabelText(name) : [];
        }),
      };
      return locate(() => screen.queryAllByRole(kind));
    },
    waitForResponse: () => { observers++; return new Promise(resolve => { resolveResponse = resolve; }); },
  };
  transport.call.mockImplementation(async (name: string, payload: Row) => {
    calls.push({ name, payload: plain(payload) });
    if (name === 'readFleetGroupMessages') return { data: await backend.read(payload) };
    expect(name).toBe('sendFleetGroupMessage');
    const produced = actualServerDto(payload); expect(produced.valid).toBe(true);
    const result = await backend.send(payload); expect(result).toEqual(produced.result);
    notes = backend.notes(); noteChange?.(notes); replyChange?.(result); issuedReply = plain(result);
    const request = plain(payload); mutationRequest?.(request);
    resolveResponse?.({ url: () => 'http://native.invalid/us-central1/sendFleetGroupMessage',
      request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: request }) }),
      json: async () => ({ result }), ok: () => true, status: () => 200 });
    return { data: result };
  });
  const crew = { page, observe: () => evaluate(genericCallback, '/src/store/useSessionStore.ts'),
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async (name: string, payload: Row) => {
      expect(name).toBe('sendFleetGroupMessage'); replays.push(plain(payload));
      const result = await backend.send(payload); replayChange?.(result); return { status: 'committed', result };
    },
  };
  const gmSnapshot = { session: backend.gmSession(), me: { uid: 'native-gm', role: 'gm' },
    connection: 'live', sessionSnapshotFreshness: 'server' };
  const gmStore = { getState: () => gmSnapshot } as typeof useSessionStore;
  const gm = { page: { ...page, evaluate: (callback: (...args: never[]) => unknown, input: unknown) =>
    evaluate(callback, input, gmStore) }, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const context = { gm, crew, initial: { sessionId: sid, joinCode: 'NATIVE' },
    roster: [{ roleId, uidHash: hash(uid).slice(0, 16) }],
    started: { fullGameDemo: { status: 'active', progression: 'manual' } }, directory: '/tmp/native-pdf-no-files' };
  const actual = createTwoBrowserGameplay(context);
  const game = { ...actual, select: async (selectedRole: string) => {
    selects++; if (selects === 2) await act(async () => { beforeSecondSelect?.(); });
    return actual.select(selectedRole, { deadlineAt: Date.now() + 500 });
  }, state: async (surface: unknown) => { stateCalls++; return actual.state(surface); },
  save: async (_name: string, value: unknown) => { saved = value; } };
  const driver = specialist.createSpecialistGameplayDriver(game, { timeoutMs: 0, intervalMs: 0 });
  const runSpecialist = new Script(`${capyDeclarations.map(node => node.getText(capyFile)).join('\n')}\nrunSpecialist`)
    .runInNewContext({ assert, URL, PC10_SPECIALIST_ACTIONS, runPc10SpecialistAction, capybaraStageOutcome,
      ...specialist, SUCCESS_RESULT_STATUSES: new Set(['committed', 'requested', 'replayed']), a: game, gm,
      initial: context.initial, specialistDriver: driver,
      updateCapybaraStage: () => { throw new Error('No native stage-file write or injected credit.'); } });
  const mount = async () => { render(<PdfNewsRelayPanel enabled />);
    await act(async () => { await vi.waitFor(() => expect(calls).toHaveLength(1)); }); };
  const runAgain = async (message: string) => runSpecialist('pdf-group-relay', 'pdf-group-relay',
    { roleId, message }, { roleId, record: false });
  const applyMember = async () => {
    const envelope = await backend.member();
    const projected = stripGmNavigationProjection(sessionFrom(sid, envelope.session));
    useSessionStore.getState().setSession({ ...projected,
      currentActorBerthAuthority: envelope.currentActorBerthAuthority });
    useSessionStore.getState().setMe(backend.player());
    return envelope;
  };
  const run = async (message = privateText) => { await applyMember(); await mount(); return runAgain(message); };
  return { run, runAgain, applyMember, gmSnapshot, mount, game, driver, calls, replays, backend, reply: () => issuedReply!, saved: () => saved,
    counts: () => ({ selects, fills, clicks, observers }), samples: () => ({ stateCalls, domScans }),
    changeAuth: () => { authUid = 'foreign-native'; },
    replaceDocument: () => { timeOrigin += 1000; } };
}


it('keeps the actual ordinary member envelope/parser private while the normal PDF panel sends and reads its own group note', async () => {
  const f = fixture(); const envelope = await f.applyMember();
  expect(envelope.session).not.toHaveProperty('shipFleetGroupIds');
  expect(useSessionStore.getState().session).not.toHaveProperty('shipFleetGroupIds');
  expect(useSessionStore.getState().session!.memberSessionScope).toMatchObject({ groupId: 'fleet-1', vesselIds: ['refinery-124'] });
  expect(f.gmSnapshot.session.shipFleetGroupIds).toEqual({ 'refinery-124': 'fleet-1' });
  await f.mount();
  await act(async () => { fireEvent.change(screen.getByRole('textbox'), { target: { value: privateText } }); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Relay message to current group' })); });
  expect(screen.getByRole('status')).toHaveTextContent('Message sent to your current fleet group.');
  const own = screen.getByRole('list', { name: 'Current fleet group messages' });
  expect(within(own).getAllByRole('listitem')).toHaveLength(1);
  expect(within(own).getByText(privateText)).toBeVisible();
  expect(within(own).getByText(/^You \/\/ /)).toBeVisible();
  expect(f.backend.noteWrites()).toBe(1);
});

it('qualifies the real member-private group relay through both existing DOM readers and entire current Capy caller', async () => {
  const f = fixture(); const outcome = await f.run();
  expect(capybaraStageOutcome({ ...outcome, roleId })).toMatchObject({ status: 'completed', cycle: 1,
    scope: 'current-group-message-recorded' });
  expect(f.counts()).toEqual({ selects: 2, fills: 1, clicks: 1, observers: 1 });
  expect(f.samples()).toEqual({ stateCalls: 3, domScans: 2 });
  expect(f.backend.noteWrites()).toBe(1); expect(f.backend.notes()).toHaveLength(1);
  const posts = f.calls.filter(call => call.name === 'sendFleetGroupMessage').map(call => call.payload);
  expect(posts).toHaveLength(1); expect(f.replays).toEqual(posts);
  expect(f.calls.filter(call => call.name === 'readFleetGroupMessages')).toHaveLength(2);
  expect(JSON.stringify(outcome.evidence)).not.toContain(uid);
  expect(JSON.stringify(outcome.evidence)).not.toContain(privateText);
  expect(JSON.stringify(outcome.evidence)).not.toContain('shipFleetGroupIds');
});

it.each([
  ['different GM host group', (f: ReturnType<typeof fixture>) => { f.gmSnapshot.session.shipFleetGroupIds = { 'refinery-124': 'fleet-2' }; }],
  ['absent GM host map', (f: ReturnType<typeof fixture>) => { Reflect.deleteProperty(f.gmSnapshot.session, 'shipFleetGroupIds'); }],
  ['different member scope group', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    memberSessionScope: { ...state.session!.memberSessionScope!, groupId: 'fleet-2' } } })); }],
  ['absent member scope', () => { useSessionStore.setState(state => { const session = { ...state.session! };
    Reflect.deleteProperty(session, 'memberSessionScope'); return { session }; }); }],
  ['malformed member scope', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    memberSessionScope: { ...state.session!.memberSessionScope!, vesselIds: null as never } } })); }],
  ['missing entitled original host', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    memberSessionScope: { ...state.session!.memberSessionScope!, vesselIds: [] } } })); }],
  ['withdrawn current member witness', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    currentActorBerthAuthority: null } })); }],
  ['absent current member witness', () => { useSessionStore.setState(state => { const session = { ...state.session! };
    Reflect.deleteProperty(session, 'currentActorBerthAuthority'); return { session }; }); }],
  ['foreign current member witness', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    currentActorBerthAuthority: { ...state.session!.currentActorBerthAuthority!, actorUid: 'foreign-native' } } })); }],
  ['changed current witness generation', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    currentActorBerthAuthority: { ...state.session!.currentActorBerthAuthority!, connectionGeneration: 4 } } })); }],
  ['foreign current witness session', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    currentActorBerthAuthority: { ...state.session!.currentActorBerthAuthority!, sessionId: 'foreign-session' as never } } })); }],
  ['malformed current witness', () => { useSessionStore.setState(state => { const berth = { ...state.session!.currentActorBerthAuthority! };
    Reflect.deleteProperty(berth, 'shipId'); return { session: { ...state.session!, currentActorBerthAuthority: berth } }; }); }],
  ['unexpected private witness field', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    currentActorBerthAuthority: { ...state.session!.currentActorBerthAuthority!, privateNote: privateText } as never } })); }],
  ['different current member group', () => { useSessionStore.setState(state => ({ me: { ...state.me!, fleetGroupId: 'fleet-2' as never } })); }],
  ['wrong current primary', () => { useSessionStore.setState(state => ({ me: { ...state.me!, assignedRoleId: 'wing-commander' as never } })); }],
  ['replaced current member', () => { useSessionStore.setState(state => ({ me: { ...state.me!, replacementRoleId: 'wing-commander' as never,
    replacementStatus: 'awaiting-re-role' } })); }],
  ['closed current member session', () => { useSessionStore.setState(state => ({ session: { ...state.session!, phase: 'closed' } })); }],
  ['stale forbidden player map', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    shipFleetGroupIds: { 'refinery-124': 'fleet-2' } } })); }],
  ['withdrawn own player', () => { useSessionStore.setState(state => ({ me: { ...state.me!, connected: false } })); }],
  ['cache member view', () => { useSessionStore.getState().setSessionSnapshotFreshness('cache'); }],
] as const)('does not credit private member relay after %s', async (_label, change) => {
  let f: ReturnType<typeof fixture>;
  f = fixture({ afterSend: () => { change(f); } });
  await expect(f.run()).rejects.toThrow();
  expect(f.counts()).toEqual({ selects: 2, fills: 1, clicks: 1, observers: 1 });
  expect(f.backend.noteWrites()).toBe(1);
  expect(JSON.stringify(f.saved() ?? null)).not.toContain(uid);
  expect(JSON.stringify(f.saved() ?? null)).not.toContain(privateText);
});

it.each([
  ['foreign author', (notes: Row[]) => { notes[0]!.actorUid = 'another-member'; }],
  ['genuinely duplicate own text', (notes: Row[]) => { notes.push({ ...notes[0], id: 'other-actual-command' }); }],
] as const)('keeps %s uncredited through the real current-group read/parser', async (_label, noteChange) => {
  const f = fixture({ noteChange }); await expect(f.run()).rejects.toThrow(/converge/);
  expect(f.backend.noteWrites()).toBe(1); expect(f.replays).toHaveLength(1);
});

it('keeps full exact original SDK replay equality for a genuine private member audience', async () => {
  const f = fixture({ replayChange: result => { result.messageId = 'foreign-replay-note'; } });
  await expect(f.run()).rejects.toThrow(/exact same-actor replay/);
  expect(f.backend.noteWrites()).toBe(1);
});
