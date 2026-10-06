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
  'src/components/ScreenFade.tsx', 'src/components/RoleConsoleTemplate.tsx',
  'src/routes/ShipRoleSelect.tsx', 'src/routes/ShipConsole.tsx'].map(path =>
  [path, readFileSync(join(root, path), 'utf8')]));
const appAst = ts.createSourceFile('App.tsx', sources['src/App.tsx'], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const routeNodes = new Map();
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(appAst) === 'Route') {
    const path = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'path');
    if (path?.initializer && ts.isStringLiteral(path.initializer) && ['/gm', '/console', '/ships/:shipId/roles', '/ships/:shipId/observer'].includes(path.initializer.text)) {
      routeNodes.set(path.initializer.text, node.getText(appAst));
    }
  }
  ts.forEachChild(node, visit);
}
visit(appAst);
assert.equal(routeNodes.size, 4);
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
const serviceSource = readFileSync(join(root, 'src/lib/sessionService.ts'), 'utf8');
const serviceAst = ts.createSourceFile('sessionService.ts', serviceSource, ts.ScriptTarget.Latest, true);
const grantSource = serviceAst.statements.find(node => ts.isFunctionDeclaration(node) &&
  node.name?.text === 'setGmShipConsoleWriteGrant').getText(serviceAst);
const nativeCleanupCalls = [];
const transportNames = ['subscribeShipConfetti', 'subscribeConnectedPlayers', 'subscribeSessionPlayers', 'subscribeReplacementEligibility',
  'subscribeDamageDraws', 'subscribeGmInstances', 'subscribeGmWolfAttackPreparation', 'subscribeGmWolfAttackState',
  'subscribeGmWolfAttackWindow', 'subscribeGmWolfActionReceipt', 'subscribeGmWolfSuspicionHistory',
  'subscribeGmWolfAssignment', 'subscribeGmWolfClueDisclosure', 'subscribeGmWolfCultIntelligence',
  'subscribeGmArbourVision', 'subscribeGmFacilitatorRuleCall', 'subscribeGmCrisisState',
  'subscribeGmApproachingVesselResponse', 'subscribeGmZealotryResponse', 'subscribeGmCivilUnrestResolution',
  'subscribeGmArrestPosseCalculation', 'subscribeSessionEvents', 'subscribeGmArrestCase'];

// Execute whole current ShipConsole, ShipRoleSelect, GmConsole and Stations,
// with the actual store, ScreenFade, RoleConsoleTemplate and unchanged grant
// SDK cleanup body. Only unrelated panels/subscriptions/native transport are
// isolated. App's four route nodes are copied verbatim by its source AST.
const compiled = await build({
  stdin: { contents: `import React,{lazy,Suspense} from 'react';
    import {HashRouter,Link,Routes,Route} from 'react-router-dom';
    import ScreenFade from './src/components/ScreenFade';
    import CurrentGmConsole from './src/routes/GmConsole';
    import CurrentSessionMode from './src/routes/SessionMode';
    import ShipRoleSelect from './src/routes/ShipRoleSelect';
    import ShipConsole from './src/routes/ShipConsole';
    export {useSessionStore} from './src/store/useSessionStore';
    export {SCREEN_FADE_MS} from './src/components/ScreenFade';
    const GmConsole=lazy(async()=>({default:CurrentGmConsole}));
    const SessionMode=lazy(async()=>({default:CurrentSessionMode}));
    function DeferredShipConsole(props){return <ShipConsole {...props}/>;}
    export function NativeSourceRoutes(){return <HashRouter><ScreenFade>{screen=><Routes location={screen}>
      ${routeNodes.get('/console')}${routeNodes.get('/gm')}
      ${routeNodes.get('/ships/:shipId/roles')}${routeNodes.get('/ships/:shipId/observer')}
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
    builder.onLoad({ filter: /.*/, namespace: 'native-transport' }, input => {
      if (input.path === 'firestore') return {
        contents: transportNames.map(name => `export const ${name}=()=>()=>{};`).join('\n'), loader: 'js',
      };
      if (input.path === '@/lib/sessionService') return { contents: `
        import {useSessionStore} from '@/store/useSessionStore';
        import {requireFreshSessionAuthority} from '@/lib/sessionMutationAuthority';
        const ensureSignedIn=async()=>undefined;
        const functions=()=>({nativeOnly:true});
        const httpsCallable=(_functions,endpoint)=>async data=>{
          if(endpoint!=='setGmShipConsoleWriteGrant'||data.enabled!==false)
            throw new Error('Only actual source unmount cleanup is allowed in this native transport.');
          globalThis.__nativeGmReturnCleanup.push(JSON.parse(JSON.stringify(data)));
          return {data:{enabled:false}};
        };
        ${grantSource}
        ${[...(namesByModule.get(input.path) ?? [])].filter(name => name !== 'setGmShipConsoleWriteGrant')
          .map(name => `export const ${name}=async()=>{throw new Error('No unrelated SDK action.');};`).join('\n')}
      `, loader:'ts',resolveDir:root};
      return { contents: [...(namesByModule.get(input.path) ?? [])].map(name => name === 'useFleetGroupNavigation'
        ? `export const ${name}=()=>undefined;`
        : `export const ${name}=async()=>{throw new Error('No unrelated network action.');};`).join('\n'), loader:'js' };
    });
  } }],
});
previous.set('__nativeGmReturnCleanup', Object.getOwnPropertyDescriptor(globalThis, '__nativeGmReturnCleanup'));
Object.defineProperty(globalThis, '__nativeGmReturnCleanup', { configurable:true, value:nativeCleanupCalls });
previous.set('CSS', Object.getOwnPropertyDescriptor(globalThis, 'CSS'));
Object.defineProperty(globalThis, 'CSS', { configurable:true, value:{escape:requireNative('css.escape')} });
const nativeModule = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(requireNative, nativeModule, nativeModule.exports);
const { NativeSourceRoutes, useSessionStore, SCREEN_FADE_MS } = nativeModule.exports;
const uid = 'native-route-gm', sessionId = 'native-route-session', targetUid = 'native-route-member';
const instanceId = 'native-route-instance', claimedAt = '2026-10-05T10:00:00.000Z';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const specs = Object.fromEntries(GM_RULING_COUNTER_PROCEDURES.map(spec => [spec.endpoint, spec]));
const steps = createPendingProcedureDefaultSteps();

async function fixture(options = {}) {
  dom.window.history.replaceState(null, '', options.initialRoute ?? '#/ships/aegis/observer');
  useSessionStore.getState().reset();
  useSessionStore.setState({ session: { id: sessionId, name: 'Native source form', joinCode: '0000',
    ownerUid: uid, phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'], activeRoleIds: ['admiral'],
    shipConsoleLocks: { aegis: true }, vesselActionRevisions: { aegis: 3 } },
  me: { uid, sessionId, role: 'gm', displayName: 'Native GM', connectionGeneration: 1, activeConsoleRoleId: null },
  gmInstance: { id: instanceId, sessionId, uid, claimedAt }, mode: 'console',
  connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 2,
  gmLoyaltyCensus: { revision: 1, entries: [{ uid: targetUid, kind: 'native', suspicion: null }] },
  gmLoyaltyCensusStatus: 'present', gmFacilitatorRuleCall: null });
  nativeCleanupCalls.length = 0;
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
        // Flush only work already queued by real React/source timers. No timer
        // or clock is advanced, and source authority is never manufactured.
        await React.act(async () => {});
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
      goto: async url => {
        const target = new URL(url);
        assert.equal(target.origin, dom.window.location.origin);
        assert.equal(target.pathname, dom.window.location.pathname);
        assert.equal(target.search, dom.window.location.search);
        assert.equal(target.hash, '#/gm');
        // The unchanged owner wrapper uses page.goto for this same-document
        // fragment return. HashRouter receives its real hashchange event.
        await React.act(async () => {
          const changed = new Promise(resolve => dom.window.addEventListener('hashchange', resolve, {once:true}));
          dom.window.location.hash = target.hash; await changed;
        });
      },
      reload: async () => { throw new Error('No reload before source form preparation.'); },
      on: (_event, listener) => requestListeners.add(listener),
      off: (_event, listener) => requestListeners.delete(listener),
    } };
  const context = { gm: surface, crew: surface,
    initial: { sessionId, joinCode: '0000', uidHash: hash(uid) }, started: actor(), roster: [{ roleId: 'gm', uidHash: hash(uid) }], directory: null };
  return { container, waits, clicks, reads, clickSnapshots, requestListeners, surface, context,
    useSessionStore, nativeCleanupCalls,
    async settle() { await new Promise(resolve => setTimeout(resolve, SCREEN_FADE_MS + 25));
      await React.act(async () => {}); },
    async close() { await React.act(async () => { reactRoot.unmount(); }); container.remove(); },
  };
}


// The normal started GM has already visited the GM console before the owner
// prepares its observer lock. Resolve that same actual lazy module through a
// real source mount, rather than treating the return as a cold module load.
const priorGmVisit=await fixture({initialRoute:'#/gm'});
assert.equal(priorGmVisit.container.querySelectorAll('main.gm-console').length,1);
await priorGmVisit.close();

const rowFor=(result,endpoint)=>result.evidence.cases.find(row=>row.endpoint===endpoint);
const callbackFor=endpoint=>createPendingGmRulingsCountersCallbacks({
  steps:{[specs[endpoint].id]:steps[specs[endpoint].id]},
});
async function existingOwnerReturn(f){
  const back=f.container.querySelector('a.ship-console__back.cic-text-button[href="#/ships/aegis/roles"]');
  assert.ok(back); assert.equal(back.textContent.trim(),'Change role');
  assert.equal(f.container.querySelectorAll('main.ship-console[data-observer-mode="read"]').length,1);
  await React.act(async()=>{back.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));});
  await f.settle();
  assert.equal(f.container.querySelectorAll('main.session-mode.ship-role-select').length,1);
  assert.equal(f.nativeCleanupCalls.length,1,'Actual ShipConsole unmount alone issued cleanup.');
  assert.deepEqual(f.nativeCleanupCalls[0],{sessionId,instanceId,shipId:'aegis',enabled:false,claimedAt});
  const url=new URL(f.surface.page.url());url.hash='/gm';
  await f.surface.page.goto(url.href);
  const fade=f.container.querySelector('.screen-fade');
  const during={gmRoute:dom.window.location.hash==='#/gm',crossing:fade.dataset.crossing,
    phase:fade.dataset.phase,outgoingStationsCount:fade.querySelectorAll('main.fleet-roster').length,
    outgoingAegisRolesCount:fade.querySelectorAll('main.session-mode.ship-role-select').length,
    gmMainCount:fade.querySelectorAll('main.gm-console').length,
    loading:[...f.container.querySelectorAll('[role="status"]')].some(n=>n.textContent.trim()==='Opening GM console…')};
  assert.deepEqual(during,{gmRoute:true,crossing:'true',phase:'out',outgoingStationsCount:0,
    outgoingAegisRolesCount:1,gmMainCount:0,loading:false});
  return during;
}

for(const endpoint of ['authorFacilitatorRuleCall','setFacilitatorCensusNote']){
  test(`public ${endpoint} waits for source AEGIS role overview after the existing same-document GM return`,async t=>{
    const f=await fixture();
    try{
      const during=await existingOwnerReturn(f);
      const spec=specs[endpoint],game=createTwoBrowserGameplay(f.context);
      const prepared=await steps[spec.id]({context:f.context,game,spec});
      const result=await prepared.prepare({surface:f.surface,actor:await f.surface.observe(),
        source:{cycle:1,phase:'active'}});
      await f.settle();
      const ruleCount=queryAllByRole(f.container,'region',{name:'Facilitator rule call',exact:true}).length;
      const censusCount=queryAllByLabelText(f.container,`Facilitator note for ${targetUid}`,{exact:true}).length;
      t.diagnostic(JSON.stringify({after:{route:dom.window.location.hash,mainCount:f.container.querySelectorAll('main.gm-console').length,roleCount:ruleCount,censusCount},readCount:f.reads.length,offered:result.offered,reason:result.reason}));
      assert.equal(ruleCount,1);assert.equal(censusCount,1);
      t.diagnostic(JSON.stringify({during,ruleCountAfterSourceSwap:ruleCount,censusCountAfterSourceSwap:censusCount,
        sourceFadeMs:SCREEN_FADE_MS,cssParserLimitations:cssErrors.length}));
      assert.equal(result.offered,true,result.reason);
      assert.equal(typeof result.click,'function');
      assert.ok(f.reads.length>=2,'The public preparation must inspect both source outgoing and mounted states.');
      assert.deepEqual(f.clicks,[],'The recipe adds no navigation or game action at the existing /gm route.');
      assert.equal(f.nativeCleanupCalls.length,1);
      assert.ok(f.waits.every(timeout=>timeout>0&&timeout<=60_000));
      assert.equal(f.requestListeners.size,0);
    }finally{await f.close();}
  });
}
