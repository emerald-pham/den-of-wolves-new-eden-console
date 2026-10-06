// NEW source-coupled hydration-order regression. Existing native fixtures
// admit before mount; this one keeps the remembered GM mounted while the
// real store setIdentity clears an already received source subscription value.
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
  React.act(() => { callback(...args); });
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
  'src/components/ScreenFade.tsx', 'src/components/RoleConsoleTemplate.tsx', 'src/lib/firestore.ts'].map(path =>
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
// Extract unchanged subscription/parser bodies and App's census audience helpers.
// Transport delivers native snapshots only; source cache/status/parse/generation
// guards, the real store actions and the whole GmConsole lifecycle execute.
const firestoreAst = ts.createSourceFile('firestore.ts', sources['src/lib/firestore.ts'], ts.ScriptTarget.Latest, true);
const feedNames = ['optionalIso', 'facilitatorRuleCall', 'loyaltyCensus', 'createMonotonicRevisionGate',
  'subscribeLoyaltyCensus', 'subscribeGmFacilitatorRuleCall'];
const feedNodes = feedNames.map(name => {
  const node = firestoreAst.statements.find(value => ts.isFunctionDeclaration(value) && value.name?.text === name);
  assert.ok(node, name); return node.getText(firestoreAst);
});
const appNames = ['callbackCurrent', 'clearLoyaltyCensus', 'currentPlayerMayReadCensus', 'reconcileLoyaltyCensus'];
const appNodes = appNames.map(name => {
  const nodes = [];
  const find = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(appAst) === name) nodes.push(node);
    ts.forEachChild(node, find);
  };
  find(appAst); assert.equal(nodes.length, 1, name);
  return `const ${nodes[0].getText(appAst)};`;
});
const appCensusBinding = `export function bindSourceAppCensus(sessionId,playerUid,gmInstanceId){
  let active=true,playerProjectionFresh=true,censusSubscribed=false,censusGeneration=0;
  let unsubscribeLoyaltyCensus=()=>undefined;
  const appRoutesMounted={current:true},playerListenerGeneration={current:1},listenerGeneration=1;
  const subscribeLoyaltyCensusFn=subscribeLoyaltyCensus;
  ${appNodes.join('\n')}
  reconcileLoyaltyCensus();
  return {reconcile:reconcileLoyaltyCensus,close:()=>{clearLoyaltyCensus();active=false;}};
}`;

// The response and stored document declarations are copied verbatim from the
// current callable's own AST. They intentionally use different clock owners.
// Only FieldValue's native snapshot resolver is supplied here; no Functions,
// Firebase, browser, Auth/session, product clock or gameplay is run or altered.
const functionsSource = readFileSync(join(root, 'functions/src/index.ts'), 'utf8');
const functionsAst = ts.createSourceFile('functions-index.ts', functionsSource, ts.ScriptTarget.Latest, true);
const callableDeclaration = functionsAst.statements.flatMap(node => ts.isVariableStatement(node)
  ? [...node.declarationList.declarations] : []).find(node => node.name.getText(functionsAst) === 'authorFacilitatorRuleCall');
assert.ok(callableDeclaration && ts.isCallExpression(callableDeclaration.initializer));
const callableBody = callableDeclaration.initializer.arguments.find(ts.isArrowFunction);
assert.ok(callableBody);
const declarationNames = ['committedAt', 'revision', 'result', 'storedCall'];
const callableNodes = declarationNames.map(name => {
  const nodes = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(functionsAst) === name) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(callableBody); assert.equal(nodes.length, 1, name);
  return `const ${nodes[0].getText(functionsAst)};`;
});
const nativeRuleRecordSource = `export function sourceRuleRecords(call,uid,currentRevision,FieldValue){
  ${callableNodes.join('\n')}
  return {result,storedCall};
}`;

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
    import {useSessionStore} from './src/store/useSessionStore';
    import {subscribeLoyaltyCensus} from '@/lib/firestore';
    ${appCensusBinding}
    ${nativeRuleRecordSource}
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
      ? `import {entityId,parseEntityId} from '@/types/identifiers';
        const db=()=>({nativeOnly:true}),doc=(_db,path)=>path;
        const onSnapshot=(...args)=>globalThis.__pc10NativePrivateFeed.subscribe(...args);
        ${feedNodes.join('\n')}
        ${transportNames.filter(name=>name!=='subscribeGmFacilitatorRuleCall').map(name=>`export const ${name}=()=>()=>{};`).join('\n')}`
      : [...(namesByModule.get(input.path) ?? [])].map(name => name === 'useFleetGroupNavigation'
        ? `export const ${name}=()=>undefined;` : ['authorFacilitatorRuleCall','setFacilitatorCensusNote'].includes(name)
          ? `export const ${name}=(...args)=>globalThis.__pc10NativePrivateFeed.write('${name}',...args);`
          : `export const ${name}=async()=>{throw new Error('Unrelated network mutation forbidden.');};`).join('\n'), loader: 'ts', resolveDir: root }));
  } }],
});
const nativeModule = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(requireNative, nativeModule, nativeModule.exports);
const { NativeSourceRoutes, useSessionStore, SCREEN_FADE_MS, bindSourceAppCensus, sourceRuleRecords } = nativeModule.exports;
const uid = 'native-feed-gm', sessionId = 'native-feed-session', targetUid = 'native-feed-member';
const instanceId = 'native-feed-instance', claimedAt = '2026-10-05T10:00:00.000Z';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const specs = Object.fromEntries(GM_RULING_COUNTER_PROCEDURES.map(spec => [spec.endpoint, spec]));
const steps = createPendingProcedureDefaultSteps();


const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const censusRaw = (revision = 4, note) => ({ type: 'loyalty-census', revision,
  entries: [{ uid: targetUid, kind: 'native', suspicion: null, ...(note ? { note } : {}) }] });

async function fixture(options = {}) {
  dom.window.history.replaceState(null, '', options.initialRoute ?? '#/gm');
  useSessionStore.getState().reset();
  const admitted = { session: { id: sessionId, phase: 'active', currentTurn: 1,
    activeVesselIds: ['aegis'], activeRoleIds: ['admiral'], shipConsoleLocks: { aegis: true },
    vesselActionRevisions: { aegis: 3 } },
  me: { uid, sessionId, role: 'gm', displayName: 'Native GM', connectionGeneration: 1, activeConsoleRoleId: null },
  gmInstance: { id: instanceId, sessionId, uid, claimedAt }, mode: 'console',
  connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 2 };
  useSessionStore.setState(options.remembered ? { ...admitted, connection: 'connecting',
    sessionSnapshotFreshness: 'cache', identityHydrationRevision: 0 } : admitted);
  const subscriptions = [];
  let deliverInitialCurrentRule = false;
  const listeners = new Set(), requestListeners = new Set(), waiting = [], timers = new Set();
  const writes = [], replays = [], reads = [], clicks = [], fills = [], snapshots = [];
  let reloads = 0, authUid = uid, serverCensus = censusRaw(), serverRule = null;
  const emit = (suffix, value, { cache = false, missing = false, error = false } = {}) => {
    snapshots.push({ suffix, cache, missing, error, reloads });
    for (const listener of [...listeners]) if (listener.path.endsWith(suffix)) {
      React.act(() => {
        if (error) listener.error(new Error('Native transport read denied.'));
        else listener.next({ metadata: { fromCache: cache }, exists: () => !missing,
          data: () => value });
      });
    }
  };
  const schedule = (callback, ms = 75) => {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms);
    timers.add(timer); return timer;
  };
  function response(endpoint, data, result) {
    const request = { method: () => 'POST', url: () => `http://localhost:5011/native-only/us-central1/${endpoint}`,
      postDataJSON: () => ({ data }) };
    const value = { request: () => request, url: request.url, status: () => 200,
      ok: () => true, json: async () => ({ result }) };
    writes.push({ endpoint, data, result });
    for (const observer of requestListeners) observer(request);
    for (const observer of [...waiting]) if (observer.predicate(value)) {
      waiting.splice(waiting.indexOf(observer), 1); observer.resolve(value);
    }
  }
  globalThis.__pc10NativePrivateFeed = {
    subscribe(path, metadata, next, error) {
      assert.deepEqual(metadata, { includeMetadataChanges: true });
      const listener = { path, next, error, disposed: false }; listeners.add(listener);
      subscriptions.push(listener);
      // A newly registered onSnapshot receives its initial current document.
      // Existing listeners receive no fabricated second update after local clear.
      if (deliverInitialCurrentRule && path.endsWith('/facilitatorRuleCalls/gm-current')) {
        schedule(() => {
          snapshots.push({ suffix: '/facilitatorRuleCalls/gm-current', initial: true,
            reloads, disposed: listener.disposed });
          if (options.currentSnapshot?.error) listener.error(new Error('Native transport read denied.'));
          else listener.next({ metadata: { fromCache: options.currentSnapshot?.cache === true },
            exists: () => options.currentSnapshot?.missing !== true,
            data: () => options.currentRule ? options.currentRule(serverRule) : serverRule });
        }, 5);
      }
      return () => { listener.disposed = true; listeners.delete(listener); };
    },
    async write(endpoint, ...args) {
      assert.equal(useSessionStore.getState().connection, 'live');
      if (endpoint === 'setFacilitatorCensusNote') {
        const [entryUid, note] = args;
        assert.equal(entryUid, targetUid);
        const expectedRevision = serverCensus.revision;
        serverCensus = censusRaw(expectedRevision + 1, note);
        emit('/loyaltyCensus/current', serverCensus);
        response(endpoint, { sessionId, instanceId, requestId: 'native-feed-census-receipt',
          targetUid, note, expectedRevision }, { sessionId, targetUid, note, revision: serverCensus.revision });
        return 'applied';
      }
      assert.equal(endpoint, 'authorFacilitatorRuleCall');
      const [input] = args, expectedRevision = serverRule?.revision ?? 0;
      const call = { sessionId, instanceId, requestId: 'native-ruling-receipt', expectedRevision, ...input };
      let resolvedTimestamp;
      const FieldValue = { serverTimestamp: () => ({ toDate: () => {
        // The native server sentinel resolves on its first snapshot, after the
        // independently sampled reply timestamp. Real timers/Date stay intact.
        resolvedTimestamp ??= new Date(); return resolvedTimestamp;
      } }) };
      const records = sourceRuleRecords(call, uid, expectedRevision, FieldValue);
      serverRule = records.storedCall;
      await delay(15);
      emit('/facilitatorRuleCalls/gm-current', serverRule);
      if (options.replyTimestamp !== undefined) records.result.createdAt = options.replyTimestamp;
      response(endpoint, call, records.result);
      return 'applied';
    },
  };
  let censusBinding = bindSourceAppCensus(sessionId, uid, instanceId);
  const container = document.createElement('div'); document.body.append(container);
  let reactRoot = createRoot(container);
  const flush = async () => { await React.act(async () => {}); };
  async function mount() {
    await React.act(async () => { reactRoot.render(React.createElement(NativeSourceRoutes)); });
    await flush();
  }
  await mount();
  if (!options.initialLoading) emit('/loyaltyCensus/current', serverCensus);
  if (options.initialLoading) schedule(() => {
    options.beforeInitialFeed?.({ container, store: useSessionStore, emit });
    emit('/loyaltyCensus/current', options.initialCensus ?? serverCensus, options.initialSnapshot);
  });
  options.onMounted?.({ container, store: useSessionStore, emit });
  function locator(nodes) {
    const current = () => nodes();
    return { nodes: current, count: async () => current().length,
      isVisible: async () => current().length === 1 && !isInaccessible(current()[0]),
      isEnabled: async () => current().length === 1 && !current()[0].disabled,
      and: other => locator(() => current().filter(node => other.nodes().includes(node))),
      getByRole: (role, input) => locator(() => current().flatMap(node => queryAllByRole(node, role, input))),
      getByLabel: (label, input) => locator(() => current().flatMap(node => queryAllByLabelText(node, label, input))),
      locator: selector => locator(() => { assert.equal(selector, 'xpath=ancestor::tr');
        return current().map(node => node.closest('tr')).filter(Boolean); }),
      inputValue: async () => { assert.equal(current().length, 1); return current()[0].value; },
      fill: async value => { assert.equal(current().length, 1); assert.equal(current()[0].disabled, false);
        fills.push(current()[0].getAttribute('aria-label') ?? current()[0].id);
        React.act(() => { fireEvent.change(current()[0], { target: { value } }); }); await flush(); },
      selectOption: async value => { assert.equal(current().length, 1);
        React.act(() => { fireEvent.change(current()[0], { target: { value } }); }); await flush(); },
      click: async () => { assert.equal(current().length, 1); assert.notEqual(current()[0].disabled, true);
        clicks.push(current()[0].getAttribute('href') ?? current()[0].textContent.trim());
        await React.act(async () => { fireEvent.click(current()[0]); }); await flush(); },
      allTextContents: async () => current().map(node => node.textContent),
    };
  }
  const actor = () => {
    const state = useSessionStore.getState();
    return { hasAuth: !!authUid, sameActor: authUid === state.me?.uid, sessionId: state.session?.id ?? null,
      uidHash: authUid ? hash(authUid) : null, playerRole: state.me?.role ?? null,
      instanceId: state.gmInstance?.id ?? null, gmInstanceOwned: state.gmInstance?.uid === authUid,
      connection: state.connection, freshness: state.sessionSnapshotFreshness,
      cycle: state.session?.currentTurn, phase: state.session?.phase, profileRoleId: null };
  };
  const browser = createContext({ crypto: webcrypto, TextEncoder, window: dom.window,
    document: dom.window.document, performance: dom.window.performance });
  const modules = new Map();
  for (const [path, values] of [
    ['/src/store/useSessionStore.ts', { useSessionStore }],
    ['/src/lib/firebase.ts', { auth: () => ({ currentUser: authUid ? { uid: authUid } : null }) }],
    ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: null }],
  ]) {
    const module = new SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context: browser });
    await module.link(() => { throw new Error('Native reader module has no dependencies.'); });
    await module.evaluate(); modules.set(path, module);
  }
  const surface = { observe: async () => actor(), storeModuleUrl: () => '/src/store/useSessionStore.ts',
    until: async (_description, predicate, timeout) => {
      assert.ok(timeout > 0 && timeout <= 60_000); const current = actor(); assert.ok(predicate(current)); return current;
    },
    callable: async (endpoint, data) => {
      const write = writes.find(value => value.endpoint === endpoint && JSON.stringify(value.data) === JSON.stringify(data));
      assert.ok(write, 'Native replay must preserve the exact UI request.');
      replays.push({ endpoint, data }); return { status: 'committed', result: write.result };
    },
    page: { url: () => dom.window.location.href,
      evaluate: async (callback, input) => {
        await flush(); browser.input = input;
        options.beforeRead?.({ callback, reloads, container, store: useSessionStore });
        const result = await new Script(`(${callback.toString()})(input)`, {
          importModuleDynamically: async path => { assert.ok(modules.has(path)); return modules.get(path); },
        }).runInContext(browser);
        if (callback.toString().includes('gmLoyaltyCensus:')) reads.push({ reloads,
          censusStatus: result?.gmLoyaltyCensusStatus, censusRevision: result?.gmLoyaltyCensus?.revision,
          ruleRevision: result?.gmFacilitatorRuleCall?.revision });
        options.afterRead?.({ callback, reloads, container, store: useSessionStore });
        return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
      },
      getByRole: (role, input) => locator(() => queryAllByRole(container, role, input)),
      getByLabel: (label, input) => locator(() => queryAllByLabelText(container, label, input)),
      locator: selector => locator(() => [...container.querySelectorAll(selector)]),
      goto: async () => { throw new Error('No new synthetic navigation.'); },
      reload: async input => {
        assert.ok(input.timeout > 0 && input.timeout <= 35_000); reloads += 1;
        const before = useSessionStore.getState();
        await React.act(async () => { censusBinding.close(); reactRoot.unmount(); });
        assert.equal(useSessionStore.getState().gmLoyaltyCensus, null);
        assert.equal(useSessionStore.getState().gmLoyaltyCensusStatus, 'loading');
        assert.equal(useSessionStore.getState().gmFacilitatorRuleCall, null);
        // Remembered GM renders first. The real subscription is then delivered
        // before the accepted original resume invokes the unchanged store setter.
        React.act(() => {
          useSessionStore.getState().reset();
          useSessionStore.setState(options.preResumeSnapshot ? { ...admitted,
            connection: 'connecting', sessionSnapshotFreshness: 'cache',
            identityHydrationRevision: 0 } : { ...admitted,
            me: { ...admitted.me, connectionGeneration: before.me.connectionGeneration + 1 },
            identityHydrationRevision: 1 });
        });
        censusBinding = bindSourceAppCensus(sessionId, uid, instanceId);
        reactRoot = createRoot(container); await mount();
        if (options.preResumeSnapshot) {
          emit('/facilitatorRuleCalls/gm-current', serverRule);
          assert.equal(useSessionStore.getState().gmFacilitatorRuleCall?.callId, serverRule.callId);
          const previous = useSessionStore.getState();
          deliverInitialCurrentRule = true;
          React.act(() => {
            previous.setIdentity(previous.session, { ...previous.me,
              connectionGeneration: before.me.connectionGeneration + 1,
              ...options.resumePlayer });
            previous.setSessionSnapshotFreshness('server');
            previous.setConnection('live');
            if (options.resumeInstance) previous.setGmInstance({ ...previous.gmInstance, ...options.resumeInstance });
            if (options.resumeSession) previous.setSession({ ...previous.session, ...options.resumeSession });
            if (options.resumeAuth) authUid = options.resumeAuth;
          });
          assert.equal(useSessionStore.getState().gmFacilitatorRuleCall, null,
            'Accepted hydration must still clear all prior private ruling state.');
          await flush();
          options.onReload?.({ container, store: useSessionStore, emit, schedule, serverCensus, serverRule });
          return;
        }
        options.onReload?.({ container, store: useSessionStore, emit, schedule,
          serverCensus, serverRule,
          setAuth: value => { authUid = value; } });
        schedule(() => {
          options.beforeReloadFeed?.({ container, store: useSessionStore, emit, schedule,
            serverCensus, serverRule,
            setAuth: value => { authUid = value; } });
          emit('/loyaltyCensus/current', options.reloadCensus ?? serverCensus, options.reloadSnapshot);
          emit('/facilitatorRuleCalls/gm-current', options.reloadRule ?? serverRule, options.reloadSnapshot);
        }, options.reloadDelay ?? 75);
      },
      on: (_event, listener) => requestListeners.add(listener),
      off: (_event, listener) => requestListeners.delete(listener),
      waitForResponse: (predicate, input) => {
        assert.ok(input.timeout > 0 && input.timeout <= 60_000);
        return new Promise((resolve, reject) => waiting.push({ predicate, resolve, reject }));
      },
    } };
  const context = { gm: surface, crew: surface, initial: { sessionId, joinCode: '0000', uidHash: hash(uid) },
    started: actor(), roster: [{ roleId: 'gm', uidHash: hash(uid) }, { roleId: 'admiral', uidHash: hash(targetUid) }] };
  const game = createTwoBrowserGameplay(context);
  const getRecipe = endpoint => steps[specs[endpoint].id]({ context, game, spec: specs[endpoint] });
  const prepare = recipe => recipe.prepare({ surface, actor: actor(),
    source: { live: true, sessionId, cycle: 1, phase: 'active' } });
  const run = endpoint => createPendingGmRulingsCountersCallbacks({
    steps: { [specs[endpoint].id]: async input => {
      const recipe = await steps[specs[endpoint].id](input);
      options.onRecipe?.(recipe); return recipe;
    } },
  }).onStarted(context);
  return { container, surface, context, reads, writes, replays, clicks, fills, snapshots, getRecipe, prepare, run,
    subscriptions,
    seedRule() {
      const call = { sessionId, requestId: 'native-pre-resume-rule', ambiguity: 'Native question',
        source: 'Native source', decision: 'Native decision', audience: 'gm-only' };
      serverRule = sourceRuleRecords(call, uid, 0, {
        serverTimestamp: () => ({ toDate: () => new Date('2026-10-06T06:50:00.000Z') }),
      }).storedCall;
      emit('/facilitatorRuleCalls/gm-current', serverRule);
      return serverRule;
    },
    async hydrateOriginal() {
      const previous = useSessionStore.getState();
      deliverInitialCurrentRule = true;
      React.act(() => {
        previous.setIdentity(previous.session, { ...previous.me,
          connectionGeneration: previous.me.connectionGeneration + 1 });
        previous.setSessionSnapshotFreshness('server');
        previous.setConnection('live');
      });
      assert.equal(useSessionStore.getState().gmFacilitatorRuleCall, null);
      await flush();
      await delay(25); await flush();
    },
    reloads: () => reloads, setAuth: value => { authUid = value; },
    async settle() { await delay(SCREEN_FADE_MS + 25); await flush(); },
    async close() {
      for (const timer of timers) clearTimeout(timer); timers.clear();
      for (const observer of waiting.splice(0)) observer.reject(new Error('Native fixture closed.'));
      await React.act(async () => { censusBinding.close(); reactRoot.unmount(); });
      container.remove(); delete globalThis.__pc10NativePrivateFeed;
      assert.equal(requestListeners.size, 0); assert.equal(listeners.size, 0);
    },
  };
}
const rowFor = (result, endpoint) => result.evidence.cases.find(row => row.endpoint === endpoint);

// Warm the actual lazy route in this native module as the existing normal GM
// visit does. This does not bypass its source render or private subscriptions.
const warmed = await fixture(); await warmed.close();


const endpoint = 'authorFacilitatorRuleCall';
const assertOneRuling = f => {
  assert.equal(f.writes.length, 1); assert.equal(f.replays.length, 1); assert.equal(f.reloads(), 1);
  assert.equal(f.writes[0].endpoint, endpoint); assert.equal(f.replays[0].endpoint, endpoint);
  assert.deepEqual(f.replays[0].data, f.writes[0].data);
};


const rulingSubscriptions = f => f.subscriptions.filter(value => value.path.endsWith('/facilitatorRuleCalls/gm-current'));

// The original GM receives current server data while the remembered envelope
// is still connecting. Accepted same-claim setIdentity is a distinct source step.
test('whole source GM subscription rebinds after accepted same-identity hydration clears its pre-resume snapshot', async t => {
  const f = await fixture({ remembered: true });
  try {
    const stored = f.seedRule(), previous = useSessionStore.getState();
    const originalListeners = rulingSubscriptions(f);
    assert.equal(previous.connection, 'connecting');
    assert.equal(previous.sessionSnapshotFreshness, 'cache');
    assert.equal(previous.gmFacilitatorRuleCall.callId, stored.callId);
    await f.hydrateOriginal();
    const current = useSessionStore.getState();
    t.diagnostic(JSON.stringify({ originalSubscriptions: originalListeners.length,
      currentSubscriptions: rulingSubscriptions(f).length,
      privateSourceRestored: current.gmFacilitatorRuleCall?.callId === stored.callId,
      hydrationRevision: current.identityHydrationRevision }));
    assert.equal(current.me.uid, uid); assert.equal(current.session.id, sessionId);
    assert.equal(current.gmInstance.id, instanceId); assert.equal(current.gmInstance.claimedAt, claimedAt);
    assert.equal(current.me.connectionGeneration, previous.me.connectionGeneration + 1);
    assert.equal(current.identityHydrationRevision, previous.identityHydrationRevision + 1);
    assert.equal(current.connection, 'live'); assert.equal(current.sessionSnapshotFreshness, 'server');
    assert.equal(current.gmFacilitatorRuleCall?.callId, stored.callId);
    assert.ok(rulingSubscriptions(f).length > originalListeners.length);
    assert.ok(originalListeners.every(listener => listener.disposed));
    assert.equal(f.writes.length, 0); assert.equal(f.replays.length, 0); assert.equal(f.reloads(), 0);
  } finally { await f.close(); }
});

test('public ruling callback survives genuine reload snapshot-before-original-resume hydration without an extra action or reload', async t => {
  const f = await fixture({ preResumeSnapshot: true });
  try {
    const result = await f.run(endpoint), row = rowFor(result, endpoint);
    t.diagnostic(JSON.stringify({ status: row.status, reason: row.reason ?? null,
      sourceSnapshots: f.snapshots.length, ruleSubscriptions: rulingSubscriptions(f).length,
      hydrationRevision: useSessionStore.getState().identityHydrationRevision }));
    assert.equal(row.status, 'completed', row.reason);
    assert.equal(result.observedProcedureCount, 1); assert.equal(result.familyAcceptanceClaimed, false);
    assertOneRuling(f);
    const call = useSessionStore.getState().gmFacilitatorRuleCall, reply = f.writes[0].result;
    assert.ok(call); assert.equal(call.sessionId, sessionId); assert.equal(call.callId, reply.callId);
    assert.equal(call.revision, reply.revision);
    for (const field of ['ambiguity', 'source', 'decision', 'audience', 'actorUid', 'label']) assert.equal(call[field], reply[field]);
    assert.ok(Number.isFinite(Date.parse(call.createdAt))); assert.ok(Number.isFinite(Date.parse(reply.createdAt)));
    assert.equal(useSessionStore.getState().gmInstance.id, instanceId);
    assert.equal(useSessionStore.getState().gmInstance.claimedAt, claimedAt);
  } finally { await f.close(); }
});

for (const [name, mutation] of [
  ['foreign Auth UID', { resumeAuth: 'native-foreign-auth' }],
  ['foreign accepted player UID', { resumePlayer: { uid: 'native-foreign-player' } }],
  ['foreign session', { resumeSession: { id: 'native-foreign-session' } }],
  ['replacement GM instance', { resumeInstance: { id: 'native-foreign-instance' } }],
  ['same instance with changed claim time', { resumeInstance: { claimedAt: '2026-10-06T10:00:00.000Z' } }],
  ['demoted player', { resumePlayer: { role: 'player' } }],
]) test(`public reload retains hard original authority loss for ${name}`, async () => {
  const f = await fixture({ preResumeSnapshot: true, ...mutation });
  try {
    const result = await f.run(endpoint), row = rowFor(result, endpoint);
    assert.equal(row.status, 'pending');
    assert.equal(row.reason, 'mounted-GM-control-action-did-not-return-a-verifiable-receipt');
    assert.equal(result.observedProcedureCount, 0);
    assertOneRuling(f);
  } finally { await f.close(); }
});

for (const [name, options] of [
  ['cache-only initial snapshot', { currentSnapshot: { cache: true } }],
  ['denied initial read', { currentSnapshot: { error: true } }],
  ['absent current document', { currentSnapshot: { missing: true } }],
  ['foreign current document', { currentRule: call => ({ ...call, sessionId: 'native-foreign-session' }) }],
  ['malformed current document', { currentRule: call => ({ ...call, type: 'foreign-private-type' }) }],
]) test(`fresh hydration never restores private ruling from ${name}`, async () => {
  const f = await fixture({ remembered: true, ...options });
  try {
    f.seedRule(); assert.ok(useSessionStore.getState().gmFacilitatorRuleCall);
    await f.hydrateOriginal();
    assert.equal(useSessionStore.getState().gmFacilitatorRuleCall, null);
    assert.equal(f.writes.length, 0); assert.equal(f.replays.length, 0); assert.equal(f.reloads(), 0);
  } finally { await f.close(); }
});

test('disposed pre-resume source callbacks cannot rehydrate a denied fresh ruling listener', async () => {
  const f = await fixture({ remembered: true, currentSnapshot: { error: true } });
  try {
    const original = f.seedRule(), oldListeners = rulingSubscriptions(f);
    await f.hydrateOriginal();
    assert.equal(useSessionStore.getState().gmFacilitatorRuleCall, null);
    for (const listener of oldListeners) React.act(() => listener.next({
      metadata: { fromCache: false }, exists: () => true, data: () => original,
    }));
    assert.equal(useSessionStore.getState().gmFacilitatorRuleCall, null);
    assert.ok(oldListeners.every(listener => listener.disposed));
  } finally { await f.close(); }
});

test('unmounted current source callbacks stay disposed and cannot refill private state', async () => {
  const f = await fixture({ remembered: true });
  const original = f.seedRule(), oldListeners = rulingSubscriptions(f);
  await f.close();
  for (const listener of oldListeners) React.act(() => listener.next({
    metadata: { fromCache: false }, exists: () => true, data: () => original,
  }));
  assert.equal(useSessionStore.getState().gmFacilitatorRuleCall, null);
  assert.ok(oldListeners.every(listener => listener.disposed));
});
