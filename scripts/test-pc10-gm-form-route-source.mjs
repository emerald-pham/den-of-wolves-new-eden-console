import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, Script, SyntheticModule } from 'node:vm';
import test, { after } from 'node:test';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import { GM_RULING_COUNTER_PROCEDURES, createPendingGmRulingsCountersCallbacks } from './pc10-pending-procedure-ui-proof.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dependencies = '/private/tmp/dow-pc09-execution-20261004/node_modules';
const requireNative = createRequire(join(dependencies, '../package.json'));
const { build } = requireNative('esbuild');
const ts = requireNative('typescript');
const { JSDOM, VirtualConsole } = requireNative('jsdom');
const cssErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => {
  if (error.type === 'css parsing') cssErrors.push(error.type);
  else throw error;
});
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost/#/console', pretendToBeVisual: true, virtualConsole,
});
// Retain the complete current stylesheet, including reduced-motion overrides.
// JSDOM cannot certify browser geometry or unsupported CSS; the counterexample
// uses the actual React delayed route, not guessed computed layout.
const style = dom.window.document.createElement('style');
style.textContent = readFileSync(join(root, 'src/index.css'), 'utf8');
dom.window.document.head.append(style);
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const previous = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
  localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const React = requireNative('react');
const nativeSetTimeout = dom.window.setTimeout.bind(dom.window);
// Keep the actual source delays and real clock. Act only flushes their React
// render callbacks; it does not advance, replace or shorten any timer.
dom.window.setTimeout = (callback, timeout, ...args) => nativeSetTimeout(() => {
  React.act(() => callback(...args));
}, timeout);
const { createRoot } = requireNative('react-dom/client');
const { queryAllByRole, queryAllByLabelText, isInaccessible, fireEvent } = requireNative('@testing-library/dom');
after(() => {
  dom.window.close();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const sources = Object.fromEntries(['src/App.tsx', 'src/routes/GmConsole.tsx', 'src/routes/SessionMode.tsx',
  'src/components/ScreenFade.tsx', 'src/components/RoleConsoleTemplate.tsx'].map(path =>
  [path, readFileSync(join(root, path), 'utf8')]));
const appAst = ts.createSourceFile('App.tsx', sources['src/App.tsx'], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const routeNodes = new Map();
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(appAst) === 'Route') {
    const path = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'path');
    if (path?.initializer && ts.isStringLiteral(path.initializer) && ['/gm', '/console'].includes(path.initializer.text)) {
      routeNodes.set(path.initializer.text, node.getText(appAst));
    }
  }
  ts.forEachChild(node, visit);
}
visit(appAst);
assert.equal(routeNodes.size, 2);
const namesByModule = new Map();
for (const source of Object.values(sources)) {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly || !node.importClause) continue;
    const path = node.moduleSpecifier.text, names = namesByModule.get(path) ?? new Set();
    const bindings = node.importClause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const value of bindings.elements) {
      if (!value.isTypeOnly) names.add((value.propertyName ?? value.name).text);
    }
    namesByModule.set(path, names);
  }
}
const transportNames = ['subscribeConnectedPlayers', 'subscribeSessionPlayers', 'subscribeReplacementEligibility',
  'subscribeDamageDraws', 'subscribeGmInstances', 'subscribeGmWolfAttackPreparation', 'subscribeGmWolfAttackState',
  'subscribeGmWolfAttackWindow', 'subscribeGmWolfActionReceipt', 'subscribeGmWolfSuspicionHistory',
  'subscribeGmWolfAssignment', 'subscribeGmWolfClueDisclosure', 'subscribeGmWolfCultIntelligence',
  'subscribeGmArbourVision', 'subscribeGmFacilitatorRuleCall', 'subscribeGmCrisisState',
  'subscribeGmApproachingVesselResponse', 'subscribeGmZealotryResponse', 'subscribeGmCivilUnrestResolution',
  'subscribeGmArrestPosseCalculation', 'subscribeSessionEvents', 'subscribeGmArrestCase'];

// Execute whole current GM/Stations components, actual store, ScreenFade and
// RoleConsoleTemplate. Only unrelated panels and network services are isolated.
// App's two route JSX nodes below are copied verbatim by its source AST.
const compiled = await build({
  stdin: { contents: `import React,{lazy,Suspense} from 'react';
    import {HashRouter,Link,Routes,Route} from 'react-router-dom';
    import ScreenFade from './src/components/ScreenFade';
    import CurrentGmConsole from './src/routes/GmConsole';
    import CurrentSessionMode from './src/routes/SessionMode';
    export {useSessionStore} from './src/store/useSessionStore';
    export {SCREEN_FADE_MS} from './src/components/ScreenFade';
    const GmConsole=lazy(async()=>({default:CurrentGmConsole}));
    const SessionMode=lazy(async()=>({default:CurrentSessionMode}));
    export function NativeSourceRoutes(){return <HashRouter><ScreenFade>{screen=><Routes location={screen}>
      ${routeNodes.get('/console')}${routeNodes.get('/gm')}
    </Routes>}</ScreenFade></HashRouter>;}`, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
  loader: { '.png': 'dataurl' }, alias: { '@': join(root, 'src') }, nodePaths: [dependencies],
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-router-dom', 'zustand', 'zustand/*'],
  plugins: [{ name: 'native-real-gm-route', setup(builder) {
    builder.onResolve({ filter: /^(?:@\/components\/|\.\.\/components\/)/ }, input => {
      if (input.path === '@/components/RoleConsoleTemplate') return null;
      return { path: input.path, namespace: 'unrelated-panel' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'unrelated-panel' }, input => ({
      contents: `export default function UnrelatedPanel(){return null;}
        ${[...(namesByModule.get(input.path) ?? [])].map(name => name === 'DRADIS_RESIZE_MS'
          ? `export const ${name}=200;` : `export const ${name}=()=>null;`).join('\n')}`, loader: 'js',
    }));
    builder.onResolve({ filter: /^@\/routes\/ShuttleConsole$/ }, input => ({ path: input.path, namespace: 'unrelated-panel' }));
    builder.onResolve({ filter: /^@\/lib\/firestore$/ }, () => ({ path: 'firestore', namespace: 'native-transport' }));
    builder.onResolve({ filter: /^@\/lib\/.*Service$/ }, input => ({ path: input.path, namespace: 'native-transport' }));
    builder.onResolve({ filter: /^@\/lib\/useFleetGroupNavigation$/ }, input => ({ path: input.path, namespace: 'native-transport' }));
    builder.onLoad({ filter: /.*/, namespace: 'native-transport' }, input => ({ contents: input.path === 'firestore'
      ? transportNames.map(name => `export const ${name}=()=>()=>{};`).join('\n')
      : [...(namesByModule.get(input.path) ?? [])].map(name => name === 'useFleetGroupNavigation'
        ? `export const ${name}=()=>undefined;` : `export const ${name}=async()=>{throw new Error('No network mutation permitted in this source-form test.');};`).join('\n'), loader: 'js' }));
  } }],
});
const nativeModule = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(requireNative, nativeModule, nativeModule.exports);
const { NativeSourceRoutes, useSessionStore, SCREEN_FADE_MS } = nativeModule.exports;
const uid = 'native-route-gm', sessionId = 'native-route-session', targetUid = 'native-route-member';
const instanceId = 'native-route-instance', claimedAt = '2026-10-05T10:00:00.000Z';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const specs = Object.fromEntries(GM_RULING_COUNTER_PROCEDURES.map(spec => [spec.endpoint, spec]));
const steps = createPendingProcedureDefaultSteps();

async function fixture(options = {}) {
  dom.window.history.replaceState(null, '', options.initialRoute ?? '#/console');
  useSessionStore.getState().reset();
  useSessionStore.setState({ session: { id: sessionId, name: 'Native source form', joinCode: '0000',
    ownerUid: uid, phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'], activeRoleIds: ['admiral'],
    shipConsoleLocks: { aegis: true }, vesselActionRevisions: { aegis: 3 } },
  me: { uid, sessionId, role: 'gm', displayName: 'Native GM', connectionGeneration: 1, activeConsoleRoleId: null },
  gmInstance: { id: instanceId, sessionId, uid, claimedAt }, mode: 'console',
  connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 2,
  gmLoyaltyCensus: { revision: 1, entries: [{ uid: targetUid, kind: 'native', suspicion: null }] },
  gmLoyaltyCensusStatus: 'present', gmFacilitatorRuleCall: null });
  const container = document.createElement('div'); document.body.append(container);
  const reactRoot = createRoot(container);
  await React.act(async () => { reactRoot.render(React.createElement(NativeSourceRoutes)); });
  options.onMounted?.({ container, useSessionStore });
  const waits = [], clicks = [], reads = [], clickSnapshots = [], requestListeners = new Set();
  function locator(nodes) {
    const current = () => nodes();
    return { count: async () => current().length,
      isVisible: async () => current().length === 1 && !isInaccessible(current()[0]),
      isEnabled: async () => current().length === 1 && !current()[0].disabled,
      and: other => locator(() => current().filter(node => other.nodes().includes(node))), nodes: current,
      getByRole: (role, input) => locator(() => current().flatMap(node => queryAllByRole(node, role, input))),
      getByLabel: (label, input) => locator(() => current().flatMap(node => queryAllByLabelText(node, label, input))),
      locator: selector => locator(() => current().map(node => {
        assert.equal(selector, 'xpath=ancestor::tr'); return node.closest('tr');
      }).filter(Boolean)),
      click: async () => {
        assert.equal(current().length, 1); clicks.push(current()[0].getAttribute('href'));
        await React.act(async () => { current()[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
        const crossing = container.querySelector('.screen-fade');
        clickSnapshots.push({ gmRoute: dom.window.location.hash === '#/gm',
          crossing: crossing.getAttribute('data-crossing'), phase: crossing.getAttribute('data-phase'),
          outgoingStationsCount: container.querySelectorAll('main.fleet-roster').length,
          gmMainCount: container.querySelectorAll('main.gm-console').length });
        React.act(() => { options.onAfterClick?.({ container, useSessionStore }); });
      },
    };
  }
  const actor = () => ({ hasAuth: true, sameActor: true, sessionId, uidHash: hash(uid),
    playerRole: 'gm', instanceId, gmInstanceOwned: true, connection: useSessionStore.getState().connection,
    freshness: useSessionStore.getState().sessionSnapshotFreshness, cycle: 1, phase: 'active', profileRoleId: null });
  const browser = createContext({ crypto: webcrypto, TextEncoder, window: dom.window,
    document: dom.window.document, performance: dom.window.performance });
  const modules = new Map();
  for (const [path, values] of [
    ['/src/store/useSessionStore.ts', { useSessionStore }],
    ['/src/lib/firebase.ts', { auth: () => ({ currentUser: { uid } }) }],
    ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: null }],
  ]) {
    const module = new SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context: browser });
    await module.link(() => { throw new Error('Native import has no dependencies.'); });
    await module.evaluate(); modules.set(path, module);
  }
  const surface = { observe: async () => actor(), storeModuleUrl: () => '/src/store/useSessionStore.ts',
    until: async (_description, predicate, timeout) => { waits.push(timeout); assert.ok(timeout > 0 && timeout <= 60_000);
      const current = actor(); assert.ok(predicate(current)); return current; },
    page: { url: () => dom.window.location.href,
      evaluate: async (callback, input) => {
        if (callback.toString().includes('main.gm-console')) options.onMountRead?.({ container, useSessionStore });
        browser.input = input;
        const result = await new Script(`(${callback.toString()})(input)`, {
          importModuleDynamically: async path => { assert.ok(modules.has(path)); return modules.get(path); },
        }).runInContext(browser);
        if (callback.toString().includes('main.gm-console')) reads.push(JSON.parse(JSON.stringify(result)));
        return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
      },
      getByRole: (role, input) => locator(() => queryAllByRole(container, role, input)),
      getByLabel: (label, input) => locator(() => queryAllByLabelText(container, label, input)),
      locator: selector => locator(() => [...container.querySelectorAll(selector)]),
      goto: async () => { throw new Error('No synthetic route navigation.'); },
      reload: async () => { throw new Error('No reload before source form preparation.'); },
      on: (_event, listener) => requestListeners.add(listener),
      off: (_event, listener) => requestListeners.delete(listener),
    } };
  const context = { gm: surface, crew: surface,
    initial: { sessionId, joinCode: '0000', uidHash: hash(uid) }, started: actor(), roster: [{ roleId: 'gm', uidHash: hash(uid) }], directory: null };
  return { container, waits, clicks, reads, clickSnapshots, requestListeners, surface, context,
    async settle() { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, SCREEN_FADE_MS + 25)); }); },
    async close() { await React.act(async () => { reactRoot.unmount(); }); container.remove(); },
  };
}

for (const endpoint of ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote']) {
  test(`public ${endpoint} waits for the actual App ScreenFade route to mount its real source form`, async t => {
    const f = await fixture();
    try {
      assert.equal(f.container.querySelectorAll('main.fleet-roster').length, 1);
      const spec = specs[endpoint], game = createTwoBrowserGameplay(f.context);
      const prepared = await steps[spec.id]({ context: f.context, game, spec });
      // Capture the source-real crossing before advancing the actual timer.
      const during = f.clickSnapshots[0];
      assert.deepEqual(during, { gmRoute: true, crossing: 'true', phase: 'out', outgoingStationsCount: 1, gmMainCount: 0 });
      await f.settle();
      const ruleCount = queryAllByRole(f.container, 'region', { name: 'Facilitator rule call', exact: true }).length;
      const censusCount = queryAllByLabelText(f.container, `Facilitator note for ${targetUid}`, { exact: true }).length;
      t.diagnostic(JSON.stringify({ during, ruleCountAfterSourceSwap: ruleCount,
        censusCountAfterSourceSwap: censusCount, sourceFadeMs: SCREEN_FADE_MS, cssParserLimitations: cssErrors.length }));
      assert.equal(ruleCount, 1); assert.equal(censusCount, 1);
      assert.deepEqual(f.clicks, ['#/gm']);
      const result = await prepared.prepare({ surface: f.surface, actor: await f.surface.observe(),
        source: { cycle: 1, phase: 'active' } });
      assert.equal(result.offered, true, result.reason);
      assert.equal(typeof result.click, 'function');
      if (endpoint === 'authorFacilitatorRuleCall') {
        const record = queryAllByRole(f.container, 'button', { name: 'Record rule call', exact: true })[0];
        assert.equal(record.disabled, true, 'Real source waits for its required input.');
        for (const label of ['Question or ambiguity', 'Source or reference', 'Decision']) {
          const field = queryAllByLabelText(f.container, label, { exact: true })[0];
          assert.equal(field.disabled, false);
          React.act(() => { fireEvent.change(field, { target: { value: 'Native source input' } }); });
        }
        assert.equal(record.disabled, false, 'Real source enables only after required input.');
        assert.deepEqual(f.clicks, ['#/gm'], 'No rule write is requested by this source-return counterexample.');
      }
      assert.ok(f.waits.every(timeout => timeout <= 60_000));
    } finally { await f.close(); }
  });
}

const finiteFailure = { stage: 'mount', route: 'gm', gmMainCount: 1, loading: false,
  screenFadeCount: 1, crossingOut: false, outgoingStationsCount: 0,
  formCount: 1, formVisible: false, formEnabled: true };
for (const [name, formDiagnostic] of [
  ['extra private field', { ...finiteFailure, uid }],
  ['unbounded route string', { ...finiteFailure, route: '/foreign-route?secret=0000' }],
  ['uncapped locator count', { ...finiteFailure, formCount: 3 }],
  ['nonboolean enabled value', { ...finiteFailure, formEnabled: 'native-route-private' }],
]) test(`public pending form evidence rejects ${name} while keeping the original pending result`, async () => {
  const f = await fixture({ initialRoute: '#/gm' });
  try {
    const endpoint = 'authorFacilitatorRuleCall', spec = specs[endpoint];
    const callback = createPendingGmRulingsCountersCallbacks({ steps: { [spec.id]: async input => ({
      ...await steps[spec.id](input),
      prepare: async () => ({ offered: false, reason: 'native-unavailable', formDiagnostic }),
    }) } });
    const result = await callback.onStarted(f.context), row = rowFor(result, endpoint);
    assert.equal(row.status, 'pending'); assert.equal(row.reason, 'native-unavailable');
    assert.equal(Object.hasOwn(row, 'formDiagnostic'), false); assert.equal(result.observedProcedureCount, 0);
    assert.doesNotMatch(JSON.stringify(row), /native-route|0000|foreign-route|secret|private/);
    assert.deepEqual(f.clicks, []); assert.equal(f.requestListeners.size, 0);
  } finally { await f.close(); }
});

for (const endpoint of ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote']) {
  test(`public ${endpoint} retains a real mount reader error as an uncredited preparation failure`, async () => {
    const f = await fixture({ initialRoute: '#/gm', onMountRead: () => { throw new Error('Native mount reader failure.'); } });
    try {
      const result = await callbackFor(f, endpoint).onStarted(f.context), row = rowFor(result, endpoint);
      assert.equal(row.status, 'pending'); assert.equal(row.reason, 'mounted-GM-source-preparation-did-not-complete');
      assert.equal(Object.hasOwn(row, 'formDiagnostic'), false);
      assert.equal(result.observedProcedureCount, 0); assert.deepEqual(f.clicks, []);
      assert.equal(f.requestListeners.size, 0);
    } finally { await f.close(); }
  });
}

const callbackFor = (f, endpoint) => createPendingGmRulingsCountersCallbacks({
  steps: { [specs[endpoint].id]: steps[specs[endpoint].id] },
});
const rowFor = (result, endpoint) => result.evidence.cases.find(row => row.endpoint === endpoint);

// Each malformed marker below is a denial stimulus applied to the real source
// crossing. A broad absent-form retry would accept its later mounted form and
// fail these cases. No successful source mount is fabricated by the fixture.
for (const [name, change] of [
  ['missing crossing marker', container => container.querySelector('.screen-fade').removeAttribute('data-crossing')],
  ['noncrossing source frame', container => { container.querySelector('.screen-fade').dataset.crossing = 'false'; }],
  ['incoming rather than outgoing phase', container => { container.querySelector('.screen-fade').dataset.phase = 'in'; }],
  ['malformed outgoing phase', container => { container.querySelector('.screen-fade').dataset.phase = 'unknown'; }],
  ['ambiguous fade roots', container => container.append(container.querySelector('.screen-fade').cloneNode(true))],
  ['outgoing wrong screen', container => { container.querySelector('main.fleet-roster').className = 'ship-role-select'; }],
  ['ambiguous outgoing Stations', container => container.querySelector('.screen-fade__content').append(container.querySelector('main.fleet-roster').cloneNode(true))],
  ['ambiguous source content', container => container.querySelector('.screen-fade').append(container.querySelector('.screen-fade__content').cloneNode(false))],
  ['outgoing Stations outside source content', container => { container.querySelector('.screen-fade__content').className = 'different-source-content'; }],
]) test(`public form callback rejects ${name} without waiting for a later source form`, async () => {
  const f = await fixture({ onAfterClick: ({ container }) => change(container) });
  try {
    const result = await callbackFor(f, 'authorFacilitatorRuleCall').onStarted(f.context);
    const row = rowFor(result, 'authorFacilitatorRuleCall');
    assert.equal(row.status, 'pending');
    assert.equal(row.reason, 'the actual source rule-call form is not mounted and writable');
    assert.equal(f.reads.length, 1); assert.equal(result.observedProcedureCount, 0);
    assert.equal(result.familyAcceptanceClaimed, false); assert.equal(f.requestListeners.size, 0);
  } finally { await f.close(); }
});

for (const endpoint of ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote']) {
  for (const [name, mutate] of [
    ['absent', node => node.remove()],
    ['hidden', node => { node.style.display = 'none'; }],
    ['ambiguous', node => node.parentNode.append(node.cloneNode(true))],
  ]) test(`fully mounted real source ${endpoint} remains pending when its form is ${name}`, async () => {
    const f = await fixture({ initialRoute: '#/gm', onMounted: ({ container }) => {
      const node = endpoint === 'authorFacilitatorRuleCall'
        ? queryAllByRole(container, 'region', { name: 'Facilitator rule call', exact: true })[0]
        : queryAllByLabelText(container, `Facilitator note for ${targetUid}`, { exact: true })[0];
      assert.ok(node); mutate(node);
    } });
    try {
      const result = await callbackFor(f, endpoint).onStarted(f.context), row = rowFor(result, endpoint);
      assert.equal(row.status, 'pending'); assert.equal(result.observedProcedureCount, 0);
      assert.equal(f.reads.length, 1); assert.deepEqual(f.clicks, []);
      assert.equal(f.requestListeners.size, 0);
    } finally { await f.close(); }
  });
}

for (const endpoint of ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote']) {
  test(`actual mounted disabled ${endpoint} input remains uncredited with no write or route retry`, async () => {
    const f = await fixture({ initialRoute: '#/gm', onMounted: ({ container }) => {
      const field = queryAllByLabelText(container, endpoint === 'authorFacilitatorRuleCall'
        ? 'Question or ambiguity' : `Facilitator note for ${targetUid}`, { exact: true })[0];
      assert.ok(field); field.disabled = true;
    } });
    try {
      const result = await callbackFor(f, endpoint).onStarted(f.context), row = rowFor(result, endpoint);
      assert.equal(row.status, 'pending'); assert.equal(result.observedProcedureCount, 0);
      assert.equal(row.formDiagnostic.stage, 'writable');
      assert.equal(row.formDiagnostic.controlsWritable, false);
      assert.equal(row.formDiagnostic.formCount, 1); assert.equal(row.formDiagnostic.formVisible, true);
      assert.equal(row.formDiagnostic.formEnabled, endpoint === 'authorFacilitatorRuleCall');
      assert.equal(f.reads.length, 1); assert.deepEqual(f.clicks, []); assert.equal(f.requestListeners.size, 0);
    } finally { await f.close(); }
  });
}

for (const [name, change] of [
  ['UID', state => ({ me: { ...state.me, uid: 'native-foreign-gm' } })],
  ['session', state => ({ session: { ...state.session, id: 'native-foreign-session' } })],
  ['GM instance', state => ({ gmInstance: { ...state.gmInstance, id: 'native-foreign-instance' } })],
  ['GM claim', state => ({ gmInstance: { ...state.gmInstance, claimedAt: '2026-10-05T11:00:00.000Z' } })],
  ['document generation', state => ({ me: { ...state.me, connectionGeneration: 2 } })],
  ['accepted hydration', () => ({ identityHydrationRevision: 3 })],
  ['live authority', () => ({ connection: 'offline' })],
  ['server freshness', () => ({ sessionSnapshotFreshness: 'cache' })],
  ['private audience', () => ({ roleBrief: { assignmentUid: 'native-foreign-member' } })],
]) test(`real source crossing cannot adopt a changed original ${name}`, async () => {
  const f = await fixture({ onAfterClick: ({ useSessionStore: store }) => {
    store.setState(change(store.getState()));
  } });
  try {
    const result = await callbackFor(f, 'authorFacilitatorRuleCall').onStarted(f.context);
    assert.equal(rowFor(result, 'authorFacilitatorRuleCall').status, 'pending');
    assert.equal(result.observedProcedureCount, 0); assert.equal(result.familyAcceptanceClaimed, false);
    assert.ok(f.reads.length <= 1); assert.equal(f.requestListeners.size, 0);
  } finally { await f.close(); }
});

test('real form wait rejects a changed route while the actual original GM remains live', async () => {
  const f = await fixture({ initialRoute: '#/gm', onMountRead: () => {
    dom.window.history.replaceState(null, '', '#/not-the-gm-route');
  } });
  try {
    const result = await callbackFor(f, 'authorFacilitatorRuleCall').onStarted(f.context);
    assert.equal(rowFor(result, 'authorFacilitatorRuleCall').status, 'pending');
    assert.equal(result.observedProcedureCount, 0); assert.equal(f.reads.length, 1);
    assert.equal((await f.surface.observe()).connection, 'live'); assert.deepEqual(f.clicks, []);
  } finally { await f.close(); }
});

for (const endpoint of ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote']) {
  test(`public ${endpoint} preserves finite failure-only form observations without private data`, async () => {
    const f = await fixture({ initialRoute: '#/gm', onMounted: ({ container }) => {
      const node = endpoint === 'authorFacilitatorRuleCall'
        ? queryAllByRole(container, 'region', { name: 'Facilitator rule call', exact: true })[0]
        : queryAllByLabelText(container, `Facilitator note for ${targetUid}`, { exact: true })[0];
      node.style.display = 'none';
    } });
    try {
      const result = await callbackFor(f, endpoint).onStarted(f.context), row = rowFor(result, endpoint);
      assert.equal(row.status, 'pending'); assert.equal(result.observedProcedureCount, 0);
      assert.equal(result.familyAcceptanceClaimed, false);
      assert.deepEqual(row.formDiagnostic, { stage: 'mount', route: 'gm', gmMainCount: 1,
        loading: false, screenFadeCount: 1, crossingOut: false, outgoingStationsCount: 0,
        formCount: 1, formVisible: false, formEnabled: true });
      assert.doesNotMatch(JSON.stringify(row), /native-route|2026-10-05|0000|Question or ambiguity|Facilitator note for/);
      assert.deepEqual(f.clicks, []); assert.equal(f.requestListeners.size, 0);
    } finally { await f.close(); }
  });
}
