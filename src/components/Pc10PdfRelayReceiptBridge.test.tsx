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
    [`sessions/${sid}`, { phase: 'active', activeVesselIds: ['refinery-124'] }],
    [`sessions/${sid}/players/${uid}`, { connected: true, fleetGroupId: 'fleet-1',
      lastSeenAt: Timestamp.now(), assignedRoleId: roleId, activeConsoleRoleId: roleId }],
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
  return { send: async (payload: Row) => plain(await handlers.send({ auth: { uid }, data: payload })) as Row,
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
  async function evaluate(callback: (...args: never[]) => unknown, input: unknown) {
    const browser = createContext({ input, crypto: webcrypto, TextEncoder, document, performance: { timeOrigin } });
    const modules = new Map<string, SyntheticModule>();
    for (const [name, exports] of [
      ['/src/store/useSessionStore.ts', { useSessionStore }],
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
      const node = query()[0]!; expect(node).toBeEnabled(); clicks++;
      await act(async () => { fireEvent.click(node); });
      await act(async () => { await vi.waitFor(() => expect(calls.filter(call => call.name === 'sendFleetGroupMessage')).toHaveLength(1)); });
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
  const gm = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
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
  const run = async (message = privateText) => { await mount(); return runAgain(message); };
  return { run, runAgain, mount, game, driver, calls, replays, backend, reply: () => issuedReply!, saved: () => saved,
    counts: () => ({ selects, fills, clicks, observers }), samples: () => ({ stateCalls, domScans }),
    changeAuth: () => { authUid = 'foreign-native'; },
    replaceDocument: () => { timeOrigin += 1000; } };
}

it('accepts only the real three-field revision-less group receipt through the entire current Capy caller', async () => {
  const f = fixture(); const outcome = await f.run();
  expect(Object.keys(f.reply()).sort()).toEqual(['status', 'groupId', 'messageId'].sort());
  expect(f.reply().revision).toBeUndefined(); expect(f.reply().currentRevision).toBeUndefined();
  expect(outcome.status).toBe('captured');
  const stage = capybaraStageOutcome({ ...outcome, roleId });
  expect(stage).toMatchObject({ status: 'completed', endpoint: 'sendFleetGroupMessage', roleId,
    cycle: 1, scope: 'current-group-message-recorded' });
  expect(stage.sourceRevision).toBeUndefined(); expect(stage.privateDelivery).toBeUndefined();
  expect(outcome.evidence.response).toMatchObject({ httpStatus: 200, resultStatus: 'committed',
    revision: null, replayRevision: null, projectionRevision: null, exactReplay: true });
  expect(outcome.evidence.projection.gm).toEqual({ source: 'server', cycle: 1, status: 'current-session' });
  expect(outcome.evidence.projection.crew).toEqual({ source: 'server', cycle: 1, status: 'current-group-note-visible' });
  expect(outcome.evidence.projection.renderedStatus).toBe('current-group-note-visible');
  expect(f.counts()).toEqual({ selects: 2, fills: 1, clicks: 1, observers: 1 });
  const posts = f.calls.filter(call => call.name === 'sendFleetGroupMessage').map(call => call.payload);
  expect(posts).toHaveLength(1); expect(f.replays).toEqual(posts);
  expect(f.calls.filter(call => call.name === 'readFleetGroupMessages')).toHaveLength(2);
  expect(JSON.stringify(outcome.evidence)).not.toContain(uid);
  expect(JSON.stringify(outcome.evidence)).not.toContain(sid);
  expect(JSON.stringify(outcome.evidence)).not.toContain(privateText);
  expect(outcome.evidence.projection.groupMessage.domNoteIdentity).toBe('own-matching-text');
  expect(projectCapybaraEvidence({ stages: { 'pdf-group-relay': stage } }).stages['pdf-group-relay'].scope)
    .toBe('current-group-message-recorded');
});

it('executes the real request parser and ordinary panel/service with no revision or cycle request field', async () => {
  const f = fixture(); await f.mount();
  await act(async () => { fireEvent.change(screen.getByRole('textbox'), { target: { value: privateText } }); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Relay message to current group' })); });
  expect(screen.getByRole('status')).toHaveTextContent('Message sent to your current fleet group.');
  const payload = f.calls.find(call => call.name === 'sendFleetGroupMessage')!.payload;
  expect(Object.keys(payload).sort()).toEqual(['sessionId', 'requestId', 'expectedGroupId', 'text'].sort());
  expect(() => actualServerDto({ ...payload, expectedRevision: 1 })).toThrow(/invalid fleet group note request/i);
  expect(() => actualServerDto({ ...payload, expectedCycle: 1 })).toThrow(/invalid fleet group note request/i);
});

it.each([
  ['wrong group', (reply: Row) => { reply.groupId = 'fleet-2'; }],
  ['wrong message identity', (reply: Row) => { reply.messageId = 'different-note'; }],
  ['noncommitted result', (reply: Row) => { reply.status = 'replayed'; }],
  ['missing message identity', (reply: Row) => { delete reply.messageId; }],
  ['invented revision', (reply: Row) => { reply.revision = 99; }],
  ['unexpected private field', (reply: Row) => { reply.privateText = privateText; }],
] as const)('does not qualify the real relay with %s', async (_label, replyChange) => {
  const f = fixture({ replyChange }); await expect(f.run()).rejects.toThrow();
  expect(JSON.stringify(f.saved() ?? null)).not.toContain(privateText);
});

it.each([
  ['foreign author', (notes: Row[]) => { notes[0]!.actorUid = 'another-member'; }],
  ['wrong note text', (notes: Row[]) => { notes[0]!.text = 'Another note'; }],
  ['missing note', (notes: Row[]) => { notes.length = 0; }],
  ['duplicate own text', (notes: Row[]) => { notes.push({ ...notes[0], id: 'prior-identical-note' }); }],
] as const)('does not turn a %s into current rendered note credit', async (_label, noteChange) => {
  const f = fixture({ noteChange }); await expect(f.run()).rejects.toThrow(/converge|current group/i);
});

it.each(['hidden notice', 'wrong notice', 'duplicate notice'] as const)('fails closed on %s', async kind => {
  const f = fixture({ beforeRender: () => {
    const notice = document.querySelector('.pdf-news-relay [role="status"]') as HTMLElement | null;
    if (!notice) return;
    if (kind === 'hidden notice') notice.hidden = true;
    else if (kind === 'wrong notice') notice.textContent = 'A different action succeeded.';
    else if (!notice.nextElementSibling?.matches('[data-native-duplicate]')) {
      const duplicate = notice.cloneNode(true) as HTMLElement;
      duplicate.dataset.nativeDuplicate = 'true'; notice.after(duplicate);
    }
  } });
  await expect(f.run()).rejects.toThrow(/converge/);
});

it.each([
  ['current group', () => { useSessionStore.setState(state => ({ session: { ...state.session!,
    shipFleetGroupIds: { 'refinery-124': 'fleet-2' } } })); }],
  ['source cycle', () => { useSessionStore.setState(state => ({ session: { ...state.session!, currentTurn: 2 } })); }],
  ['released station', () => { useSessionStore.setState(state => ({ me: { ...state.me!, activeConsoleRoleId: null } })); }],
  ['replaced actor', () => { useSessionStore.setState(state => ({ me: { ...state.me!, replacementRoleId: 'other', replacementStatus: 'awaiting-re-role' } })); }],
  ['offline source', () => { useSessionStore.getState().setConnection('offline'); }],
  ['cache source', () => { useSessionStore.getState().setSessionSnapshotFreshness('cache'); }],
] as const)('does not accept relay credit after %s changes', async (_label, afterSend) => {
  const f = fixture({ afterSend }); await expect(f.run()).rejects.toThrow();
});

it.each(['Auth', 'document', 'generation', 'hydration', 'assignment'] as const)('keeps original rich selector fences before relay for changed %s', async changed => {
    const f = fixture({ duringSecondSelection: () => {
      if (changed === 'Auth') f.changeAuth();
      if (changed === 'document') f.replaceDocument();
      if (changed === 'generation') useSessionStore.setState(state => ({ me: { ...state.me!, connectionGeneration: 4 } }));
      if (changed === 'hydration') useSessionStore.setState({ identityHydrationRevision: 2 });
      if (changed === 'assignment') useSessionStore.setState(state => ({ me: { ...state.me!, assignedRoleId: 'different' } }));
    } });
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter(call => call.name === 'sendFleetGroupMessage')).toHaveLength(0);
    expect(f.counts().observers).toBe(0); expect(f.counts().clicks).toBe(0); expect(f.replays).toHaveLength(0);
  });

it('keeps the exact original complete SDK replay receipt equality', async () => {
  const f = fixture({ replayChange: reply => { reply.messageId = 'different-replayed-note'; } });
  await expect(f.run()).rejects.toThrow(/exact same-actor replay/);
});

it('uses only original source/DOM checkpoints and one exact replay without duplicating the real handler note', async () => {
  const f = fixture(); await f.run();
  expect(f.samples()).toEqual({ stateCalls: 3, domScans: 2 });
  expect(f.backend.noteWrites()).toBe(1); expect(f.backend.notes()).toHaveLength(1);
  const post = f.calls.find(call => call.name === 'sendFleetGroupMessage')!.payload;
  expect(f.backend.notes()[0]!.id).toBe(post.requestId);
  expect(f.replays).toEqual([post]);
});

it('permits other legitimate rendered group notes while binding only one current own matching-text witness', async () => {
  const f = fixture({ noteChange: notes => { notes.push({ ...notes[0], id: 'prior-other-note',
    actorUid: 'previous-member', text: 'A different current group note.' }); } });
  const outcome = await f.run();
  expect(capybaraStageOutcome({ ...outcome, roleId }).status).toBe('completed');
});

it.each([
  ['different captured text', (request: Row) => { request.text = 'Not the original chosen message.'; }],
  ['missing original text', (request: Row) => { delete request.text; }],
  ['unsupported request revision', (request: Row) => { request.expectedRevision = 1; }],
  ['different original session', (request: Row) => { request.sessionId = 'foreign-session'; }],
] as const)('does not qualify a request with %s', async (_label, mutationRequest) => {
  const f = fixture({ mutationRequest }); await expect(f.run()).rejects.toThrow();
});

it.each([
  ['missing source group map', () => { useSessionStore.setState(state => {
    const session = { ...state.session! }; Reflect.deleteProperty(session, 'shipFleetGroupIds'); return { session };
  }); }],
  ['missing active original host', () => { useSessionStore.setState(state => ({ session: { ...state.session!, activeVesselIds: [] } })); }],
  ['closed current source', () => { useSessionStore.setState(state => ({ session: { ...state.session!, phase: 'closed' } })); }],
] as const)('does not qualify a %s after the UI receipt', async (_label, afterSend) => {
  const f = fixture({ afterSend }); await expect(f.run()).rejects.toThrow();
});

it('keeps unrelated specialist numeric revision predicates despite a current-group rendered code', async () => {
  const f = fixture(); await f.mount();
  const actor = await f.game.context.crew.observe();
  await expect(f.driver.waitForCommit({ surface: f.game.context.crew, actor, endpoint: 'buildFighter',
    inspect: async () => ({ ready: true, renderedStatusCode: 'current-group-note-visible',
      groupMessage: { type: 'current-group-message-recorded' } }) })).rejects.toThrow(/actual GM-visible source revision/);
});

it.each([
  ['original request identity', (evidence: Row) => { (evidence.request as Row).requestId = 'other-command'; }],
  ['current group', (evidence: Row) => { (evidence.request as Row).expectedGroupId = 'fleet-2'; }],
  ['original text hash', (evidence: Row) => { (evidence.request as Row).textHash = hash('other-text'); }],
  ['original message identity', (evidence: Row) => { (evidence.response as Row).messageId = 'other-message'; }],
  ['full replay equality', (evidence: Row) => { (evidence.response as Row).exactReplay = false; }],
  ['invented numeric revision', (evidence: Row) => { (evidence.response as Row).revision = 99; }],
  ['GM note entitlement', (evidence: Row) => { ((evidence.projection as Row).gm as Row).status = 'current-group-note-visible'; }],
  ['hidden private result', (evidence: Row) => { (evidence.projection as Row).privateActorStatus = 'private-result-visible'; }],
  ['inferred rendered ID', (evidence: Row) => { ((evidence.projection as Row).groupMessage as Row).domNoteIdentity = 'exact-note-id'; }],
  ['extra raw private field', (evidence: Row) => { ((evidence.projection as Row).groupMessage as Row).rawText = privateText; }],
] as const)('keeps the completed relay stage bound against changed %s', async (_label, mutate) => {
  const f = fixture(); const outcome = await f.run();
  const evidence = plain(outcome.evidence); mutate(evidence);
  expect(capybaraStageOutcome({ ...outcome, roleId, evidence }).status).toBe('pending');
});

it('qualifies both actual planned cycle relay texts as separate ordinary requests with one own witness and one write each', async () => {
  const f = fixture();
  const first = await f.run(plannedRelayMessages[0]!);
  expect(capybaraStageOutcome({ ...first, roleId })).toMatchObject({ status: 'completed', cycle: 1 });
  await act(async () => { useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, currentTurn: 2 }); });
  const second = await f.runAgain(plannedRelayMessages[1]!);
  expect(capybaraStageOutcome({ ...second, roleId })).toMatchObject({ status: 'completed', cycle: 2 });
  expect(f.backend.notes()).toHaveLength(2); expect(f.backend.noteWrites()).toBe(2);
  const posts = f.calls.filter(call => call.name === 'sendFleetGroupMessage').map(call => call.payload);
  expect(posts.map(post => post.text)).toEqual(plannedRelayMessages);
  expect(posts[0]!.requestId).not.toBe(posts[1]!.requestId); expect(f.replays).toEqual(posts);
  expect(f.counts()).toEqual({ selects: 4, fills: 2, clicks: 2, observers: 2 });
  expect(f.samples()).toEqual({ stateCalls: 6, domScans: 4 });
  expect(f.calls.filter(call => call.name === 'readFleetGroupMessages')).toHaveLength(3);
});

it('keeps two genuine different commands with duplicate own text uncredited even when both exact replays write once', async () => {
  const f = fixture(); const first = await f.run();
  expect(capybaraStageOutcome({ ...first, roleId }).status).toBe('completed');
  await act(async () => { useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, currentTurn: 2 }); });
  await expect(f.runAgain(privateText)).rejects.toThrow(/converge/);
  expect(f.backend.notes()).toHaveLength(2); expect(f.backend.noteWrites()).toBe(2);
  const posts = f.calls.filter(call => call.name === 'sendFleetGroupMessage').map(call => call.payload);
  expect(posts[0]!.requestId).not.toBe(posts[1]!.requestId); expect(f.replays).toEqual(posts);
});
