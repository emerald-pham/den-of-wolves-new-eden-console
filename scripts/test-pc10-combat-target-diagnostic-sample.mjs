import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { createContext, Script, SourceTextModule, SyntheticModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { observeWolfChoiceActor, assertWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';

// Source/native only. The whole production Zustand store and the actual
// serialized Full-game and Wolf observers run below. SDK/Auth I/O is inert;
// no browser, transport, member promise, engine or private mutation is started.
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const storeUrl = '/src/store/useSessionStore.ts';
const privateUid = 'private-native-original-eo';
const privateSid = 'private-native-session';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://native.invalid/#/console' });
dom.window.HTMLElement.prototype.getClientRects = function () {
  return this.isConnected ? [{ width: 100, height: 20 }] : [];
}; // Explicit inert geometry; not a browser paint claim.

async function synthetic(exports, context) {
  const m = new SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  await m.link(() => assert.fail('An inert export must not import transport.'));
  await m.evaluate(); return m;
}
const productionStoreText = await readFile(new URL('../src/store/useSessionStore.ts', import.meta.url), 'utf8');
const storeContext = createContext({ console: { ...console, warn: () => {} } });
const storeModule = new SourceTextModule(ts.transpileModule(productionStoreText, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
} }).outputText, { context: storeContext });
await storeModule.link(async name => {
  let exports;
  if (name.startsWith('zustand')) exports = await import(name);
  else if (name.includes('demoActorContext')) exports = { demoActorSessionStorageKey: key => key };
  else if (name.includes('shuttles')) exports = { normalizeShuttleManifest: () => assert.fail('No persisted hydration in this fixture.') };
  else if (name.includes('navigationPrivacy')) exports = { stripPersistedNavigationProjection: () => assert.fail('No storage or persisted projection in this fixture.') };
  else assert.fail(`Unexpected store dependency: ${name}`);
  return synthetic(exports, storeContext);
});
await storeModule.evaluate();
const store = storeModule.namespace.useSessionStore;

function astFunction(text, name, kind = ts.ScriptKind.TS) {
  const file = ts.createSourceFile('source', text, ts.ScriptTarget.Latest, true, kind);
  const matches = [];
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file); assert.equal(matches.length, 1); return { file, node: matches[0] };
}
const genericText = await readFile(new URL('./pc10-full-game-demo-ui-proof.mjs', import.meta.url), 'utf8');
const generic = astFunction(genericText, 'observe', ts.ScriptKind.JS);
const genericCalls = [];
const findEvaluate = node => {
  if (ts.isCallExpression(node) && node.expression.getText(generic.file) === 'page.evaluate') genericCalls.push(node.arguments[0]);
  ts.forEachChild(node, findEvaluate);
};
findEvaluate(generic.node); assert.equal(genericCalls.length, 1);
const actualGenericCallback = genericCalls[0].getText(generic.file);
const controllerText = await readFile(new URL('../src/lib/wolfAttackChoiceController.ts', import.meta.url), 'utf8');
const authority = astFunction(controllerText, 'authorityFor');
const currentAuthority = astFunction(controllerText, 'wolfAttackChoiceAuthorityIsCurrent');
const online = astFunction(controllerText, 'browserIsOnline');
const authorityScript = ts.transpileModule([online, authority, currentAuthority]
  .map(({ node, file }) => node.getText(file).replace(/^export /, '')).join('\n'), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
} }).outputText;
const authorityContext = createContext({ useSessionStore: store, navigator: dom.window.navigator });
new Script(authorityScript).runInContext(authorityContext);
function productionAuthorityKey() {
  authorityContext.values = { session: store.getState().session, me: store.getState().me,
    gmInstance: store.getState().gmInstance, connection: store.getState().connection,
    freshness: store.getState().sessionSnapshotFreshness, identityRevision: store.getState().identityHydrationRevision,
    online: true };
  return new Script("authorityFor('executive-officer', undefined, true, values).key").runInContext(authorityContext);
}
function productionOriginalKeyIsCurrent(key) {
  authorityContext.originalKey = key;
  return new Script("wolfAttackChoiceAuthorityIsCurrent('executive-officer', originalKey, values.session.id, true)")
    .runInContext(authorityContext);
}

function fixture({ afterBefore, afterMetadata } = {}) {
  store.getState().reset();
  const me = { uid: privateUid, sessionId: privateSid, role: 'player', connected: true,
    fleetGroupId: 'fleet-1', connectionGeneration: 8, assignedRoleId: 'executive-officer',
    activeConsoleRoleId: 'executive-officer', seatId: 'executive-officer', replacementRoleId: null, replacementStatus: null };
  const discovery = { groupId: 'fleet-1', shipId: 'aegis', revision: 1, fleetGroupVesselIds: ['aegis', 'dione'],
    knownCoordinates: ['private-coordinate'], knownSystems: { secret: 'private-system-name' } };
  const berth = { sessionId: privateSid, actorUid: privateUid, groupId: 'fleet-1', role: 'player',
    connectionGeneration: 8, assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer',
    replacementRoleId: null, replacementStatus: null, shipId: 'aegis' };
  const session = { id: privateSid, phase: 'active', currentTurn: 1,
    turnState: { currentTurn: 1, phase: 'team', phaseRevision: 4 },
    turnPhase: { turn: 1, progression: 'manual', airspace: { state: 'restricted', pressAccess: false }, timerPause: null },
    playerDiscovery: discovery, currentActorBerthAuthority: berth,
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis', 'dione'] },
    smallShipStates: { gorgoneion: { hostShipId: 'aegis', dockingRevision: 2 } }, pursuitEmergencyWindow: null };
  store.getState().setIdentity(session, me);
  store.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
  dom.window.document.body.innerHTML = '<section aria-label="Wolf range actions"><header><p class="eyebrow">Cycle 1 // weapon control</p><h2>medium range</h2></header><p class="wolf-range-action__status">Target assignment</p><time datetime="native-deadline">native-deadline</time><select aria-label="Missile launchers hit 1"><option value="">Choose a live contact</option><option value="private-contact">PRIVATE TARGET</option></select><button disabled>Commit target assignments</button></section>';
  let authUid = privateUid, observeCount = 0, metadataCount = 0, storeReads = 0, tick = 20;
  const dynamicImports = [], diagnostics = [];
  const run = async (callback, input, isMetadata) => {
    const browser = createContext({ input, crypto: webcrypto, TextEncoder, Uint8Array, Date,
      performance: { timeOrigin: 123456, now: () => tick }, document: dom.window.document,
      window: dom.window, navigator: dom.window.navigator });
    const modules = new Map([
      [storeUrl, await synthetic({ useSessionStore: { getState: () => { storeReads++; return store.getState(); } } }, browser)],
      ['/src/lib/firebase.ts', await synthetic({ auth: () => ({ currentUser: authUid ? { uid: authUid } : null }) }, browser)],
      ['/src/lib/demoActorContext.ts', await synthetic({ activeDemoActorProfile: { roleId: 'executive-officer', sessionId: privateSid } }, browser)],
    ]);
    const value = await new Script(`(${typeof callback === 'string' ? callback : callback.toString()})(input)`, {
      importModuleDynamically: async name => { dynamicImports.push(name); assert.ok(modules.has(name)); return modules.get(name); },
    }).runInContext(browser);
    if (isMetadata) afterMetadata?.(f);
    return structuredClone(value);
  };
  const f = { store, diagnostics, dynamicImports,
    setAuth: value => { authUid = value; }, advanceClock: () => { tick += 100; },
    counts: () => ({ observeCount, metadataCount, storeReads }),
    surface: { storeModuleUrl: () => storeUrl,
      observe: async () => {
        observeCount++; const result = await run(actualGenericCallback, storeUrl, false);
        if (observeCount === 1) afterBefore?.(f); return result;
      }, page: { evaluate: async (callback, input) => { metadataCount++; return run(callback, input, true); } } },
    sample: () => observeWolfChoiceActor(f.surface, sample => diagnostics.push(sample)),
  };
  return f;
}

test('actual serialized Wolf sample retains safe metadata in its sole original store read', async () => {
  const f = fixture(), originalKey = productionAuthorityKey();
  const observed = await f.sample();
  assertWolfChoiceActor(observed, observed);
  assert.equal(f.diagnostics.length, 1, 'The existing metadata callback must retain its own diagnostic sample.');
  const sample = f.diagnostics[0];
  assert.equal(sample.controllerAuthorityInputFingerprint, hash(JSON.parse(originalKey)));
  assert.equal(sample.dom.available, true); assert.equal(sample.dom.panelCount, 1);
  assert.equal(sample.dom.fieldCount, 1); assert.equal(sample.dom.fields[0].valueFingerprint, hash(''));
  assert.equal(sample.dom.commitEnabled, false); assert.equal(sample.discoveryState, 'object');
  assert.equal(sample.berthState, 'object'); assert.equal(sample.memberScopeState, 'object');
  assert.equal(sample.reactFormKeyObserved, false); assert.equal(sample.continuousMountObserved, false);
  assert.deepEqual(f.counts(), { observeCount: 2, metadataCount: 1, storeReads: 3 });
  assert.deepEqual(f.dynamicImports.filter(name => name === storeUrl), [storeUrl, storeUrl, storeUrl]);
  for (const value of [privateUid, privateSid, 'private-contact', 'PRIVATE TARGET', 'private-coordinate', 'private-system-name', 'aegis'])
    assert.equal(JSON.stringify(sample).includes(value), false, 'Private source/DOM values must not persist.');
});

test('same source and DOM produce identical context/form/value hashes across discrete samples', async () => {
  const f = fixture(); await f.sample(); f.advanceClock(); await f.sample();
  assert.equal(f.diagnostics.length, 2);
  const [first, second] = f.diagnostics;
  for (const key of ['controllerAuthorityInputFingerprint','memberFingerprint','phaseFingerprint','discoveryFingerprint',
    'craftFingerprint','berthFingerprint','memberScopeFingerprint','domFormFingerprint']) assert.equal(first[key], second[key]);
  assert.notEqual(first.sampleMonotonicMs, second.sampleMonotonicMs);
  assert.equal(second.dom.fields[0].valueFingerprint, first.dom.fields[0].valueFingerprint);
  assert.deepEqual(f.counts(), { observeCount: 4, metadataCount: 2, storeReads: 6 });
});

const sourceChanges = {
  discovery: state => ({ session: { ...state.session, playerDiscovery: { ...state.session.playerDiscovery, revision: 2 } } }),
  discoveryVessels: state => ({ session: { ...state.session, playerDiscovery: { ...state.session.playerDiscovery, fleetGroupVesselIds: ['aegis'] } } }),
  phaseRevision: state => ({ session: { ...state.session, turnState: { ...state.session.turnState, phaseRevision: 5 } } }),
  timer: state => ({ session: { ...state.session, turnPhase: { ...state.session.turnPhase, timerPause: { pausedAt: 'private-pause' } } } }),
  pressAccess: state => ({ session: { ...state.session, turnPhase: { ...state.session.turnPhase, airspace: { ...state.session.turnPhase.airspace, pressAccess: true } } } }),
  craft: state => ({ session: { ...state.session, smallShipStates: { gorgoneion: { hostShipId: 'dione', dockingRevision: 3 } } } }),
  pursuit: state => ({ session: { ...state.session, pursuitEmergencyWindow: { revision: 2 } } }),
  hydration: state => ({ identityHydrationRevision: state.identityHydrationRevision + 1 }),
  assignment: state => ({ me: { ...state.me, assignedRoleId: 'wing-commander' } }),
  generation: state => ({ me: { ...state.me, connectionGeneration: 9 } }),
  session: state => ({ session: { ...state.session, id: 'private-foreign-session' } }),
};
for (const [name, change] of Object.entries(sourceChanges)) test(`source ${name} change is visible without making an old controller key current`, async () => {
  const f = fixture(), key = productionAuthorityKey();
  const original = await f.sample();
  f.store.setState(change(f.store.getState()));
  const current = await f.sample();
  assert.equal(productionOriginalKeyIsCurrent(key), false, 'Use the actual production current-key predicate, never a new diagnostic evaluator.');
  assert.notEqual(f.diagnostics[0].controllerAuthorityInputFingerprint, f.diagnostics[1].controllerAuthorityInputFingerprint);
  if (['hydration','assignment','generation','session'].includes(name)) assert.throws(() => assertWolfChoiceActor(current, original));
  else assert.doesNotThrow(() => assertWolfChoiceActor(current, original), 'Range guards do not cover the whole controller key; diagnostics grant no new acceptance.');
  assert.equal(f.diagnostics[1].continuousMountObserved, false);
});

for (const kind of ['absent','null','malformed']) test(`real ${kind} berth/discovery/member scope has an explicit diagnostic distinction`, async () => {
  const f = fixture();
  const next = { ...f.store.getState().session };
  for (const key of ['playerDiscovery','currentActorBerthAuthority','memberSessionScope']) {
    if (kind === 'absent') delete next[key];
    else next[key] = kind === 'null' ? null : 'malformed-private-value';
  }
  f.store.getState().setSession(next);
  await f.sample(); assert.equal(f.diagnostics.length, 1);
  for (const key of ['discoveryState','berthState','memberScopeState']) assert.equal(f.diagnostics[0][key], kind);
  assert.equal(JSON.stringify(f.diagnostics).includes('malformed-private-value'), false);
});

for (const name of ['Auth','SID','hydration','assignment','generation']) test(`original ${name} drift inside the sample still rejects after retaining the observed tuple`, async () => {
  const f = fixture({ afterMetadata: f => {
    if (name === 'Auth') f.setAuth('private-foreign-auth');
    else f.store.setState(sourceChanges[name === 'SID' ? 'session' : name](f.store.getState()));
  } });
  await assert.rejects(f.sample(), /Original combat|sameActor/);
  assert.equal(f.diagnostics.length, 1, 'Retain only the sample actually observed before the original after-check rejection.');
  assert.deepEqual(f.counts(), { observeCount: 2, metadataCount: 1, storeReads: 3 });
});

test('the actual browser callback has only its original awaited store import', async () => {
  const text = await readFile(new URL('./pc10-combat-choice-readiness.mjs', import.meta.url), 'utf8');
  const found = astFunction(text, 'observeWolfChoiceActor', ts.ScriptKind.JS);
  const callbacks = [], awaits = [];
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(found.file) === 'surface.page.evaluate') callbacks.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(found.node); assert.equal(callbacks.length, 1);
  const countAwait = node => { if (ts.isAwaitExpression(node)) awaits.push(node.getText(found.file)); ts.forEachChild(node, countAwait); };
  countAwait(callbacks[0]); assert.deepEqual(awaits, ['await import(moduleUrl)']);
});
