import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { assertArbourRecipientReceipt } from './pc10-arbour-vision-ui-proof.mjs';

const require = createRequire(import.meta.url), ts = require('typescript');
const SID = 'original-arbour-session', GM = 'original-gm', TARGET = 'original-admiral';
const INSTANCE = 'original-gm-instance', TEXT = 'Training exercise // facilitator call; no new location is selected.';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

async function sourceDeclarations(path, names) {
  const text = await readFile(new URL(path, import.meta.url), 'utf8');
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const declarations = file.statements.filter(node => names.includes(node.name?.text) ||
    ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.includes(item.name.getText(file))));
  assert.equal(declarations.length, names.length, `Every requested actual source declaration must exist: ${path}`);
  return declarations.map(node => node.getText(file)).join('\n');
}

function executeTypeScript(text, scope, names) {
  const code = ts.transpileModule(`${text}\nexport { ${names.join(', ')} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', ...Object.keys(scope), code)(exports, ...Object.values(scope));
  return exports;
}

async function originalServer() {
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const commandError = (code, message) => new HttpsError(code, message);
  const guardNames = ['requireUid', 'requiredText', 'isCanonicalRequestId', 'requiredId',
    'requireGmInstanceRequest', 'requireArbourVisionRequest'];
  const guards = executeTypeScript(await sourceDeclarations('../functions/src/requestGuards.ts', guardNames),
    { HttpsError, commandError }, guardNames);
  const idempotency = executeTypeScript(await readFile(new URL('../functions/src/commandIdempotency.ts', import.meta.url), 'utf8'),
    {}, ['commandReceiptDisposition']);
  const documents = new Map([
    [`sessions/${SID}/players/${TARGET}`, { uid: TARGET, role: 'player', assignedRoleId: 'admiral' }],
    [`sessions/${SID}/secrets/loyalty-${TARGET}`, { visibleToUids: [TARGET], payload: { type: 'loyalty', kind: 'universal-arbour' } }],
    [`sessions/${SID}/loyaltyCensus/current`, { entries: [{ uid: TARGET, kind: 'universal-arbour', suspicion: null }] }],
  ]);
  const writes = [];
  const snapshot = path => ({ exists: documents.has(path), get: key => documents.get(path)?.[key] });
  const db = { doc: path => ({ path }), runTransaction: async callback => callback({
    get: async ref => snapshot(ref.path),
    set: (ref, value) => { documents.set(ref.path, structuredClone(value)); writes.push(ref.path); },
    delete: ref => { documents.delete(ref.path); writes.push(ref.path); },
  }) };
  const names = ['storedLoyaltyCensusEntries', 'hasExactPrivateSecretAudience', 'isArbourVisionResult',
    'replayBoundCommand', 'authorArbourVision'];
  const server = executeTypeScript(await sourceDeclarations('../functions/src/index.ts', names), {
    ...guards, ...idempotency, HttpsError, commandError, db,
    auditedOnCall: (_name, callback) => callback,
    commandReceiptRef: (sessionId, requestId) => db.doc(`sessions/${sessionId}/commandReceipts/${requestId}`),
    requireFacilitatorInstance: async (_tx, sessionId, uid, instanceId) => {
      if (sessionId !== SID || uid !== GM || instanceId !== INSTANCE) throw new HttpsError('permission-denied', 'Original GM only.');
      return { session: { get: key => ({ phase: 'active', activeRoleIds: ['admiral'] })[key] } };
    },
    rejectForeignLegacyM1Command: async () => undefined,
    rejectLegacyEventReplay: () => { throw new HttpsError('failed-precondition', 'Legacy replay is not admissible.'); },
    requireActiveGameplayPhase: session => assert.equal(session.get('phase'), 'active'),
    sessionActiveRoleIds: session => session.get('activeRoleIds'), isKickedPlayer: () => false,
    FieldValue: { serverTimestamp: () => 'native-server-timestamp' },
  }, names);
  const parsers = executeTypeScript(await sourceDeclarations('../src/lib/firestore.ts', ['arbourVision', 'gmArbourVision']),
    { entityId: (_kind, value) => value, parseEntityId: (_kind, value) => value }, ['arbourVision', 'gmArbourVision']);
  return { ...server, ...parsers, documents, writes };
}

async function loadProof(factory = () => { throw new Error('No fresh-game factory is run in native diagnosis.'); }) {
  const url = new URL('./pc10-explicit-loyalty-demo-proof.mjs', import.meta.url);
  const module = new vm.SourceTextModule(`${await readFile(url, 'utf8')}\nexport { deliverFacilitatorScenarioCall, actorState };`, {
    identifier: url.href, initializeImportMeta: meta => { meta.url = url.href; },
  });
  await module.link(async name => {
    const namespace = name === './pc10-full-game-demo-ui-proof.mjs'
      ? { runFreshFullGameDemoUi: factory } : await import(name.startsWith('.') ? new URL(name, url).href : name);
    return new vm.SyntheticModule(Object.keys(namespace), function () {
      for (const key of Object.keys(namespace)) this.setExport(key, namespace[key]);
    });
  });
  await module.evaluate(); return module.namespace;
}

async function fixture({ uiResult = value => value, replayResult = value => value,
  uiStatus = 200, beforeFill, afterUi, afterReplay, control = {}, initialPatch,
  currentRevision = null, afterPrivateRead } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-arbour-vision-native-'));
  const server = await originalServer(), events = [], waiters = [];
  let user = GM, documentOrigin = 50, kind = 'location', text = '', published = false;
  const state = {
    session: { id: SID, phase: 'active', currentTurn: 1, fullGameDemo: { status: 'active', progression: 'manual' },
      turnPhase: { progression: 'manual', airspace: { state: 'restricted' } } },
    me: { uid: GM, sessionId: SID, role: 'gm', connectionGeneration: 2, connected: true },
    gmInstance: { id: INSTANCE, uid: GM, sessionId: SID, claimedAt: '2026-10-06T10:00:00.000Z' },
    identityHydrationRevision: 1, connection: 'live', sessionSnapshotFreshness: 'server',
    gmAccessAuthenticatedAt: '2026-10-06T10:00:00.000Z', pendingCommands: [], roleBrief: null,
    gmLoyaltyCensus: { revision: 21, entries: [{ uid: TARGET, kind: 'universal-arbour', suspicion: null }] },
    gmArbourVision: null,
  };
  if (currentRevision !== null) {
    const previous = { type: 'arbour-visions', sessionId: SID, recipientUid: TARGET, revision: currentRevision,
      kind: 'location', text: 'Previous source call', label: 'FACILITATOR CALL' };
    server.documents.set(`sessions/${SID}/arbourVisions/current`, previous);
    state.gmArbourVision = server.gmArbourVision(previous, SID);
  }
  const request = () => ({ sessionId: state.session.id, instanceId: state.gmInstance?.id,
    requestId: 'original-vision-request', expectedRevision: state.gmArbourVision?.revision ?? 0,
    targetUid: TARGET, kind, text });
  const mutate = patch => { if (patch.user !== undefined) user = patch.user;
    if (patch.documentOrigin !== undefined) documentOrigin = patch.documentOrigin;
    if (patch.state) Object.assign(state, patch.state); };
  await initialPatch?.(mutate, state);
  const item = (name, extra = {}) => ({
    count: async () => control[name]?.count ?? 1,
    isVisible: async () => control[name]?.visible !== false,
    isEnabled: async () => control[name]?.enabled ?? (name !== 'publish' || text.trim().length > 0),
    waitFor: async options => { events.push({ kind: 'wait', name, timeout: options?.timeout }); },
    inputValue: async () => name === 'recipient' ? TARGET : name === 'kind' ? kind : text,
    selectOption: async value => { kind = value; await beforeFill?.(mutate, state); },
    fill: async value => { text = value; },
    filter() { return this; },
    ...extra,
  });
  const button = item('publish', { click: async () => {
    events.push({ kind: 'ui-click' }); const data = request();
    const result = await server.authorArbourVision({ data, auth: { uid: user } });
    state.gmArbourVision = server.gmArbourVision(server.documents.get(`sessions/${SID}/arbourVisions/current`), SID);
    published = true;
    const response = { url: () => 'http://127.0.0.1:5011/demo-pc10-native/us-central1/authorArbourVision',
      status: () => uiStatus, request: () => ({ method: () => 'POST', postDataJSON: () => ({ data }) }),
      json: async () => ({ result: uiResult(structuredClone(result)) }) };
    await afterUi?.(mutate, state);
    for (const waiter of waiters) if (waiter.predicate(response)) waiter.resolve(response);
  } });
  const form = item('form', {
    locator: selector => selector === '#arbour-vision-kind' ? item('kind')
      : selector === '#arbour-vision-text' ? item('text') : item('recipient'),
    getByRole: role => role === 'button' ? button : item('status', { waitFor: async options => {
      assert.equal(published, true); events.push({ kind: 'visible-success', timeout: options?.timeout });
    } }),
  });
  const gm = {
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ({ uidHash: hash(user), sessionId: state.session.id, instanceId: state.gmInstance?.id,
      sameActor: user === state.me.uid, playerRole: state.me.role, gmInstanceOwned: state.gmInstance?.uid === user,
      connection: state.connection, freshness: state.sessionSnapshotFreshness, documentTimeOrigin: documentOrigin,
      cycle: state.session.currentTurn, phase: state.session.phase, fullGameDemo: state.session.fullGameDemo,
      phaseProgression: state.session.turnPhase.progression }),
    page: {
      url: () => 'http://127.0.0.1:5174/#/gm',
      getByRole: () => form,
      waitForResponse: (predicate, options) => {
        assert.ok(options.timeout > 0 && options.timeout <= 60_000);
        events.push({ kind: 'arm-response', timeout: options.timeout });
        return new Promise(resolve => waiters.push({ predicate, resolve }));
      },
      evaluate: async (callback, input) => {
        const fixtureImport = async name => name === '/src/lib/firebase.ts'
          ? { auth: () => ({ currentUser: user ? { uid: user } : null }) }
          : name === '/src/lib/demoActorContext.ts' ? { activeDemoActorProfile: {
            roleId: state.me.role === 'gm' ? 'gm' : 'admiral', sessionId: SID } }
            : { useSessionStore: { getState: () => state } };
        const body = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
        const result = structuredClone(await new Function('fixtureImport', 'crypto', 'performance', 'document', 'input', `return (${body})(input);`)(
          fixtureImport, webcrypto, { timeOrigin: documentOrigin }, { querySelector: () => null }, input));
        if (body.includes('recipientCall:')) await afterPrivateRead?.(mutate, state);
        return result;
      },
    },
    callable: async (endpoint, data) => {
      assert.equal(endpoint, 'authorArbourVision'); events.push({ kind: 'sdk-replay', request: structuredClone(data) });
      const result = await server.authorArbourVision({ data, auth: { uid: user } });
      await afterReplay?.(mutate, state); return { status: 'committed', result: replayResult(structuredClone(result)) };
    },
  };
  const context = { mode: 'universal-arbour', gm, directory,
    initial: { sessionId: SID, uidHash: hash(GM), documentTimeOrigin: 50 },
    started: { sessionId: SID, uidHash: hash(GM), instanceId: INSTANCE, cycle: 1, phase: 'active',
      fullGameDemo: { status: 'active', progression: 'manual' }, phaseProgression: 'manual', documentTimeOrigin: 50 },
    roster: [{ roleId: 'admiral', uidHash: hash(TARGET) }],
  };
  return { context, server, state, events, mutate, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('actual Arbour handler and parser publish seven fields and replay the stored result without writes', async () => {
  const server = await originalServer();
  const data = { sessionId: SID, instanceId: INSTANCE, requestId: 'actual-handler-receipt', expectedRevision: 0,
    targetUid: TARGET, kind: 'danger', text: TEXT };
  const first = await server.authorArbourVision({ data, auth: { uid: GM } });
  assert.deepEqual(Object.keys(first).sort(), ['status', 'sessionId', 'recipientUid', 'revision', 'kind', 'text', 'label'].sort());
  assert.deepEqual(first, { status: 'committed', sessionId: SID, recipientUid: TARGET, revision: 1,
    kind: 'danger', text: TEXT, label: 'FACILITATOR CALL' });
  const count = server.writes.length;
  assert.deepEqual(await server.authorArbourVision({ data, auth: { uid: GM } }), first);
  assert.equal(server.writes.length, count);
  await assert.rejects(server.authorArbourVision({ data: { ...data, text: 'different call' }, auth: { uid: GM } }));
});

test('normal mounted Arbour call arms actual capture before its one click and repeats only the captured request', async () => {
  const f = await fixture();
  try {
    const proof = await loadProof(), result = await proof.deliverFacilitatorScenarioCall(f.context);
    assert.deepEqual(f.events.filter(event => ['arm-response', 'ui-click', 'sdk-replay'].includes(event.kind)).map(event => event.kind),
      ['arm-response', 'ui-click', 'sdk-replay']);
    assert.equal(result.authorArbourVision.fullPublishedDtoBound, true);
    assert.equal(result.authorArbourVision.exactOriginalSdkReplay, true);
    assert.equal(f.server.writes.length, 5, 'The replay cannot write a second private delivery.');
    const saved = await readFile(join(f.context.directory, 'facilitator-private-action.json'), 'utf8');
    for (const privateValue of [GM, TARGET, SID, INSTANCE, TEXT]) assert.equal(saved.includes(privateValue), false);
  } finally { await f.cleanup(); }
});

for (const [name, uiResult] of [
  ['foreign recipient', result => ({ ...result, recipientUid: 'other-original-player' })],
  ['wrong revision', result => ({ ...result, revision: result.revision + 1 })],
  ['missing published field', result => { delete result.label; return result; }],
]) test(`visible success cannot credit an Arbour response with ${name}`, async () => {
  const f = await fixture({ uiResult });
  try { const proof = await loadProof(); await assert.rejects(proof.deliverFacilitatorScenarioCall(f.context)); }
  finally { await f.cleanup(); }
});

test('exact original Arbour SDK replay must bind the complete stored receipt', async () => {
  const f = await fixture({ replayResult: result => ({ ...result, text: 'different replay' }) });
  try { const proof = await loadProof(); await assert.rejects(proof.deliverFacilitatorScenarioCall(f.context)); }
  finally { await f.cleanup(); }
});

test('public optional onStarted callback captures Arbour receipt before unrelated actor traversal', async () => {
  const f = await fixture();
  try {
    const proof = await loadProof(async options => options.onStarted({ ...f.context, crew: {}, roster: f.context.roster }));
    await assert.rejects(proof.runFreshOptionalLoyaltyScenario('universal-arbour', {
      directory: f.context.directory, runEnding: async () => { throw new Error('Native test does not end a game.'); },
    }));
    // Only this mounted authoring boundary is modeled. The unprepared actor
    // traversal remains rejected; no factory/pre-start/ending credit follows.
    assert.equal(f.events.filter(event => event.kind === 'sdk-replay').length, 1);
  } finally { await f.cleanup(); }
});

test('normal Arbour authoring uses the actual current revision rather than inventing the first revision', async () => {
  const f = await fixture({ currentRevision: 4 });
  try {
    const proof = await loadProof(), result = await proof.deliverFacilitatorScenarioCall(f.context);
    assert.equal(result.arbourVisionReceipt.revision, 5);
    assert.equal(f.events.find(event => event.kind === 'sdk-replay').request.expectedRevision, 4);
  } finally { await f.cleanup(); }
});

for (const [name, uiResult] of [
  ['foreign session', value => ({ ...value, sessionId: 'foreign-session' })],
  ['wrong category', value => ({ ...value, kind: 'location' })],
  ['changed text', value => ({ ...value, text: 'Different private call' })],
  ['unsafe revision', value => ({ ...value, revision: Number.MAX_SAFE_INTEGER + 1 })],
  ['zero revision', value => ({ ...value, revision: 0 })],
  ['unknown field', value => ({ ...value, actorUid: GM })],
  ['noncommitted status', value => ({ ...value, status: 'queued' })],
]) test(`Arbour capture rejects a published DTO with ${name}`, async () => {
  const f = await fixture({ uiResult });
  try { const proof = await loadProof(); await assert.rejects(proof.deliverFacilitatorScenarioCall(f.context)); }
  finally { await f.cleanup(); }
});

for (const [name, initialPatch] of [
  ['missing Auth', mutate => mutate({ user: null })],
  ['foreign Auth', mutate => mutate({ user: 'foreign-gm' })],
  ['foreign player session', (_mutate, state) => { state.me.sessionId = 'foreign-session'; }],
  ['demoted actor', (_mutate, state) => { state.me.role = 'player'; }],
  ['offline connection', (_mutate, state) => { state.connection = 'offline'; }],
  ['cached projection', (_mutate, state) => { state.sessionSnapshotFreshness = 'cache'; }],
  ['unhydrated document', (_mutate, state) => { state.identityHydrationRevision = 0; }],
  ['disconnected actor', (_mutate, state) => { state.me.connected = false; }],
  ['missing original claim', (_mutate, state) => { state.gmInstance.claimedAt = null; }],
  ['foreign private audience', (_mutate, state) => { state.roleBrief = { assignmentUid: 'foreign-gm' }; }],
  ['foreign outbox', (_mutate, state) => { state.pendingCommands = [{ payload: { sessionId: 'foreign-session' } }]; }],
  ['debrief phase', (_mutate, state) => { state.session.phase = 'debrief'; }],
  ['next cycle', (_mutate, state) => { state.session.currentTurn = 2; }],
  ['foreign original document', mutate => mutate({ documentOrigin: 51 })],
  ['missing current source property', (_mutate, state) => { delete state.gmArbourVision; }],
  ['malformed present current call', (_mutate, state) => { state.gmArbourVision = { revision: 0 }; }],
  ['no entitled current holder', (_mutate, state) => { state.gmLoyaltyCensus.entries = []; }],
  ['ambiguous entitled holders', (_mutate, state) => { state.gmLoyaltyCensus.entries.push({ uid: 'other-holder', kind: 'universal-arbour' }); }],
]) test(`normal Arbour authoring denies ${name} before its mounted click`, async () => {
  const f = await fixture({ initialPatch });
  try {
    const proof = await loadProof(); await assert.rejects(proof.deliverFacilitatorScenarioCall(f.context));
    assert.equal(f.events.filter(event => event.kind === 'ui-click').length, 0);
  } finally { await f.cleanup(); }
});

for (const [name, change] of [
  ['original claim', (_mutate, state) => { state.gmInstance.claimedAt = '2026-10-06T10:00:01.000Z'; }],
  ['generation', (_mutate, state) => { state.me.connectionGeneration += 1; }],
  ['hydration', (_mutate, state) => { state.identityHydrationRevision += 1; }],
  ['current document', mutate => mutate({ documentOrigin: 51 })],
  ['original UID', mutate => mutate({ user: 'foreign-gm' })],
]) test(`changed ${name} during Arbour input cannot issue the normal UI request`, async () => {
  const f = await fixture({ beforeFill: change });
  try {
    const proof = await loadProof(); await assert.rejects(proof.deliverFacilitatorScenarioCall(f.context));
    assert.equal(f.events.filter(event => event.kind === 'ui-click').length, 0);
  } finally { await f.cleanup(); }
});

for (const [name, change] of [
  ['claim loss', (_mutate, state) => { state.gmInstance = null; }],
  ['document replacement', mutate => mutate({ documentOrigin: 51 })],
  ['private reader loss', (_mutate, state) => { state.roleBrief = { assignmentUid: TARGET }; }],
]) test(`late Arbour UI reply after ${name} cannot dispatch SDK replay`, async () => {
  const f = await fixture({ afterUi: change });
  try {
    const proof = await loadProof(); await assert.rejects(proof.deliverFacilitatorScenarioCall(f.context));
    assert.equal(f.events.filter(event => event.kind === 'sdk-replay').length, 0);
  } finally { await f.cleanup(); }
});

for (const [name, change] of [
  ['generation loss', (_mutate, state) => { state.me.connectionGeneration += 1; }],
  ['new document', mutate => mutate({ documentOrigin: 51 })],
  ['wrong private current receipt', (_mutate, state) => { state.gmArbourVision.text = 'Unrelated current call'; }],
]) test(`Arbour SDK completion after ${name} stays uncredited`, async () => {
  const f = await fixture({ afterReplay: change });
  try { const proof = await loadProof(); await assert.rejects(proof.deliverFacilitatorScenarioCall(f.context)); }
  finally { await f.cleanup(); }
});

for (const [name, control] of [
  ['absent form', { form: { count: 0 } }], ['ambiguous form', { form: { count: 2 } }],
  ['hidden form', { form: { visible: false } }], ['disabled call category', { kind: { enabled: false } }],
  ['disabled text field', { text: { enabled: false } }], ['missing recipient', { recipient: { count: 0 } }],
  ['disabled publish after inputs', { publish: { enabled: false } }],
]) test(`Arbour ${name} cannot issue a UI mutation`, async () => {
  const f = await fixture({ control });
  try {
    const proof = await loadProof(); await assert.rejects(proof.deliverFacilitatorScenarioCall(f.context));
    assert.equal(f.events.filter(event => event.kind === 'ui-click').length, 0);
  } finally { await f.cleanup(); }
});

test('HTTP rejection is not converted into an Arbour success by a visible status', async () => {
  const f = await fixture({ uiStatus: 403 });
  try { const proof = await loadProof(); await assert.rejects(proof.deliverFacilitatorScenarioCall(f.context)); }
  finally { await f.cleanup(); }
});
