import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Script, SyntheticModule, createContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import { GM_RULING_COUNTER_PROCEDURES, createPendingGmRulingsCountersCallbacks } from './pc10-pending-procedure-ui-proof.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Borrow the retained, locked PC09 dependencies without installing or linking
// anything. This is React DOM in JSDOM, with no browser, Firebase or network.
const dependencies = '/private/tmp/dow-pc09-execution-20261004/node_modules';
const requireNative = createRequire(join(dependencies, '../package.json'));
const { build } = requireNative('esbuild');
const ts = requireNative('typescript');
const { JSDOM } = requireNative('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/#/ships/aegis/observer' });
const previous = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const React = requireNative('react');
const { createRoot } = requireNative('react-dom/client');
const { MemoryRouter, Route, Routes } = requireNative('react-router-dom');
after(() => {
  dom.window.close();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const serviceSource = readFileSync(join(root, 'src/lib/sessionService.ts'), 'utf8');
const serviceAst = ts.createSourceFile('sessionService.ts', serviceSource, ts.ScriptTarget.Latest, true);
const grantNode = serviceAst.statements.find(node => ts.isFunctionDeclaration(node) &&
  node.name?.text === 'setGmShipConsoleWriteGrant');
assert.ok(grantNode);
const grantSource = grantNode.getText(serviceAst);
// Execute the whole current ShipConsole, store/persist implementation, source
// freshness guard and unmodified SDK function. Only unrelated child panels,
// subscriptions and the SDK transport are isolated. No cleanup is synthesized.
const compiled = await build({
  stdin: { contents: `export { default as ShipConsole } from './src/routes/ShipConsole.tsx';
    export { useSessionStore, selectIsGm, SESSION_STORAGE_KEY } from './src/store/useSessionStore.ts';
    export { setGmShipConsoleWriteGrant } from '@/lib/sessionService';`,
    resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
  loader: { '.png': 'dataurl' },
  alias: { '@': join(root, 'src') }, nodePaths: [dependencies],
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-router-dom', 'zustand', 'zustand/*'],
  plugins: [{ name: 'native-source-lifecycle-only', setup(builder) {
    builder.onResolve({ filter: /^@\/components\// }, input => ({ path: input.path, namespace: 'native-panel' }));
    builder.onLoad({ filter: /.*/, namespace: 'native-panel' }, () => ({ contents: 'export default function NativeUnrelatedPanel(){return null;}', loader: 'js' }));
    builder.onResolve({ filter: /^@\/lib\/firestore$/ }, () => ({ path: 'subscriptions', namespace: 'native-transport' }));
    builder.onResolve({ filter: /^@\/lib\/sessionService$/ }, () => ({ path: 'grant', namespace: 'native-transport' }));
    builder.onLoad({ filter: /.*/, namespace: 'native-transport' }, input => input.path === 'subscriptions'
      ? { contents: `export const subscribeShipConfetti=()=>()=>{};
        export const subscribeConnectedPlayers=()=>()=>{};
        export const subscribeDamageDraws=()=>()=>{};`, loader: 'js' }
      : { contents: `import { useSessionStore } from '@/store/useSessionStore';
        import { requireFreshSessionAuthority } from '@/lib/sessionMutationAuthority';
        const functions=()=>({nativeOnly:true});
        const ensureSignedIn=async()=>globalThis.__nativeGmLifecycle.signedIn();
        const httpsCallable=(_functions,endpoint)=>async data=>({data:await globalThis.__nativeGmLifecycle.callable(endpoint,data)});
        export const popShipConfetti=()=>{throw new Error('Unrelated action forbidden.');};
        export const selectConsoleRole=()=>{throw new Error('Unrelated action forbidden.');};
        export const setShipConsoleLock=()=>{throw new Error('Unrelated action forbidden.');};
        ${grantSource}`, loader: 'ts', resolveDir: root });
  } }],
});

const original = { sessionId: 'native-source-session', uid: 'native-source-gm',
  instanceId: 'native-source-instance', claimedAt: '2026-10-05T10:00:00.000Z', shipId: 'aegis' };
const persisted = granted => ({ state: {
  session: { id: original.sessionId, phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
    activeRoleIds: ['admiral'], shipConsoleLocks: { aegis: true }, vesselActionRevisions: { aegis: 3 } },
  me: { uid: original.uid, sessionId: original.sessionId, role: 'gm', displayName: 'Native GM',
    joinedAt: original.claimedAt, connectionGeneration: 1, activeConsoleRoleId: null },
  gmInstance: { id: original.instanceId, sessionId: original.sessionId, uid: original.uid,
    claimedAt: original.claimedAt, ...(granted ? { shipConsoleWriteGrant: { shipId: 'aegis', grantedAt: original.claimedAt } } : {}) },
  mode: 'console', pendingCommands: [], lastRoute: '/ships/aegis/observer',
}, version: 1 });

async function createObserverFixture({ granted = true, denyCleanup = false, observer = true, strict = true } = {}) {
  dom.window.localStorage.clear();
  dom.window.localStorage.setItem('dow-new-eden-session', JSON.stringify(persisted(granted)));
  const calls = [], authChecks = [];
  const exports = {};
  const sandbox = createContext({ require: requireNative, module: { exports }, exports,
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    queueMicrotask, console, setTimeout, clearTimeout,
    __nativeGmLifecycle: {
      signedIn: () => authChecks.push(true), callable: async (endpoint, data) => {
        assert.equal(endpoint, 'setGmShipConsoleWriteGrant');
        assert.deepEqual(JSON.parse(JSON.stringify(data)), { sessionId: original.sessionId,
          instanceId: original.instanceId, shipId: 'aegis', enabled: data.enabled, claimedAt: original.claimedAt });
        calls.push(JSON.parse(JSON.stringify(data)));
        if (denyCleanup && data.enabled === false) throw new Error('Native server denied the captured old authority.');
        return data.enabled ? { enabled: true, shipId: 'aegis' } : { enabled: false };
      },
    } });
  new Script(compiled.outputFiles[0].text).runInContext(sandbox);
  const api = sandbox.module.exports;
  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  const reactRoot = createRoot(container);
  async function mount() {
    const component = React.createElement(MemoryRouter, { initialEntries: ['/ships/aegis/observer'] },
      React.createElement(Routes, null, React.createElement(Route, { path: '/ships/:shipId/observer',
        element: React.createElement(api.ShipConsole, { observer }) })));
    await React.act(async () => { reactRoot.render(strict ? React.createElement(React.StrictMode, null, component) : component); });
  }
  async function close() { await React.act(async () => { reactRoot.unmount(); }); container.remove(); }
  return { api, calls, authChecks, container, mount, close };
}

test('current persisted GM authority really restores a granted observer before live hydration', async () => {
  const f = await createObserverFixture();
  try {
    const state = f.api.useSessionStore.getState();
    assert.equal(f.api.selectIsGm(state), true);
    assert.equal(state.connection, 'idle'); assert.equal(state.sessionSnapshotFreshness, 'cache');
    assert.equal(state.identityHydrationRevision, 0);
    assert.equal(state.gmInstance.shipConsoleWriteGrant.shipId, 'aegis');
    assert.equal(state.gmInstance.claimedAt, original.claimedAt); assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test('real current StrictMode observer mount revokes remembered grant with the unchanged SDK cleanup path', async () => {
  const f = await createObserverFixture();
  try {
    await f.mount();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].enabled, false);
    assert.equal(f.authChecks.length, 1);
    const state = f.api.useSessionStore.getState();
    assert.equal(state.connection, 'idle'); assert.equal(state.sessionSnapshotFreshness, 'cache');
    assert.equal(state.identityHydrationRevision, 0);
    assert.equal(state.gmInstance.shipConsoleWriteGrant, undefined);
    assert.equal(state.gmInstance.id, original.instanceId); assert.equal(state.gmInstance.claimedAt, original.claimedAt);
    assert.equal(f.container.querySelector('[aria-label="GM ship console read write access"]').getAttribute('aria-pressed'), 'false');
    assert.equal(f.container.querySelector('main.ship-console').getAttribute('data-observer-mode'), 'read');
  } finally { await f.close(); }
});

test('real source cleanup remains a denied receipt when the captured server authority is rejected', async () => {
  const f = await createObserverFixture({ denyCleanup: true });
  try {
    await f.mount();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].enabled, false);
    assert.equal(f.api.useSessionStore.getState().gmInstance.shipConsoleWriteGrant.shipId, 'aegis');
    assert.equal(f.api.useSessionStore.getState().gmInstance.claimedAt, original.claimedAt);
  } finally { await f.close(); }
});

test('real observer unmount queues the original scoped revoke without any synthetic reload action', async () => {
  const f = await createObserverFixture({ strict: false });
  await f.mount(); assert.equal(f.calls.length, 0);
  await f.close();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].enabled, false);
  assert.equal(f.api.useSessionStore.getState().gmInstance.shipConsoleWriteGrant, undefined);
});

test('ordinary non-observer source mount does not acquire the observer revoke lifecycle', async () => {
  const f = await createObserverFixture({ observer: false });
  try { await f.mount(); assert.equal(f.calls.length, 0); }
  finally { await f.close(); }
  assert.equal(f.calls.length, 0);
});

test('source SDK still refuses enabling a remembered grant before live server authority', async () => {
  const f = await createObserverFixture({ granted: false });
  try {
    await assert.rejects(f.api.setGmShipConsoleWriteGrant('aegis', true, original), /Reconnect/);
    assert.equal(f.calls.length, 0); assert.equal(f.authChecks.length, 0);
  } finally { await f.close(); }
});

// This NEW public fixture starts where the real canonical driver starts: select
// only certifies live authority. Fields and normal links are route-local. It
// executes the unchanged default factory/callback and browser readers; no live
// identity or server fixture is created.
const hash = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const normalize = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
const steps = createPendingProcedureDefaultSteps();
const specs = Object.fromEntries(GM_RULING_COUNTER_PROCEDURES.map(row => [row.endpoint, row]));
const storeSource = readFileSync(join(root, 'src/store/useSessionStore.ts'), 'utf8');
const storeAst = ts.createSourceFile('useSessionStore.ts', storeSource, ts.ScriptTarget.Latest, true);
const selectNode = storeAst.statements.find(node => ts.isVariableStatement(node) &&
  node.declarationList.declarations.some(declaration => declaration.name.getText(storeAst) === 'selectIsGm'));
assert.ok(selectNode);
const selectJs = ts.transpileModule(selectNode.getText(storeAst).replace(/^export /, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const sourceIsGm = new Script(`${selectJs}; selectIsGm`).runInNewContext();
const sourceLinks = {
  'GM Console': { href: '#/gm', selector: 'a.role-card.cic-frame[href="#/gm"]' },
  '← Change role': { href: '#/ships/aegis/roles', selector: 'a.ship-console__back.cic-text-button[href="#/ships/aegis/roles"]' },
  'Back to fleet': { href: '#/console', selector: 'main.ship-role-select a.session-mode__back.cic-text-button[href="#/console"]' },
};
assert.match(readFileSync(join(root, 'src/routes/SessionMode.tsx'), 'utf8'), /isGm && <Link\s+className="role-card cic-frame"\s+to="\/gm"\s+aria-label="GM Console"/);
assert.match(readFileSync(join(root, 'src/routes/ShipRoleSelect.tsx'), 'utf8'), /<Link className="session-mode__back cic-text-button" to="\/console">\s+Back to fleet/);

async function fixture(options = {}) {
  const uid = original.uid, sessionId = original.sessionId;
  const targetUid = 'native-original-member', claimedAt = original.claimedAt;
  const raw = {
    session: { id: sessionId, currentTurn: 1, phase: 'active', activeVesselIds: ['aegis'],
      activeRoleIds: ['admiral'], shipConsoleLocks: { aegis: true }, vesselActionRevisions: { aegis: 3 },
      shipFleetGroupIds: { aegis: 'native-fleet' } },
    me: { uid, sessionId, role: 'gm', connectionGeneration: 1, activeConsoleRoleId: null },
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 2,
    gmInstance: { id: original.instanceId, sessionId, uid, claimedAt, shipConsoleWriteGrant: null },
    gmLoyaltyCensus: { revision: 4, entries: [{ uid: targetUid, kind: 'native', suspicion: null }] },
    gmLoyaltyCensusStatus: 'present', gmFacilitatorRuleCall: null, pendingCommands: [],
    gmAccessAuthenticatedAt: null, roleBrief: null,
  };
  let authUid = uid, url = `http://localhost:5174/${options.route ?? '#/console'}`, mounted = true;
  let remainingGmMountReads = options.gmMountReads ?? 0, gmMountReads = 0;
  let gmMounted = remainingGmMountReads === 0;
  let remainingStationMountReads = options.stationMountReads ?? 0;
  let mountReads = 0, remainingMountReads = options.mountReads ?? 0;
  let reloads = 0, lists = 0, lifecycleReads = 0;
  const fields = { 'Question or ambiguity': '', 'Source or reference': '', Decision: '',
    Audience: 'gm-only', 'Supersedes call ID (optional)': '', [`Facilitator note for ${targetUid}`]: '' };
  const writes = [], fills = [], uiEvents = [], waiting = [], requestListeners = new Set();
  const listsAtHydration = [], operationBudgets = [], navigations = [];
  const counts = options.counts ?? {}, disabled = new Set(options.disabled ?? []);
  const route = () => new URL(url).hash;
  const actor = () => ({ hasAuth: !!authUid, sameActor: authUid === raw.me?.uid,
    sessionId: raw.session?.id, uidHash: authUid ? hash(authUid) : null,
    playerRole: raw.me?.role, instanceId: raw.gmInstance?.id ?? null,
    gmInstanceOwned: !!raw.gmInstance && raw.gmInstance.uid === authUid &&
      raw.gmInstance.sessionId === raw.session?.id,
    connection: raw.connection, freshness: raw.sessionSnapshotFreshness,
    cycle: raw.session?.currentTurn, phase: raw.session?.phase, profileRoleId: null });
  function emit(endpoint, extra, result) {
    const data = { sessionId, instanceId: raw.gmInstance.id, ...extra };
    const request = { method: () => 'POST', url: () => `http://localhost:5011/demo-native/us-central1/${endpoint}`,
      postDataJSON: () => ({ data }) };
    const response = { request: () => request, url: request.url, status: () => 200,
      ok: () => true, json: async () => ({ result }) };
    writes.push({ endpoint, data, result });
    for (const listener of requestListeners) listener(request);
    for (const observer of [...waiting]) if (observer.predicate(response)) {
      waiting.splice(waiting.indexOf(observer), 1); observer.resolve(response);
    }
    options.onReceipt?.({ raw, endpoint });
  }
  const controlNames = ['GM ship console read write access', 'Release ICN console lock', 'Engage ICN console lock'];
  const known = new Set([...Object.keys(fields), 'Facilitator rule call', 'Record rule call', 'Save note',
    'Private loyalty census', 'ICN console lock', 'ICN console lock // clear', ...controlNames, 'Are you sure?', 'ARE YOU SURE?', 'GM Console', '← Change role', 'Back to fleet']);
  function available(name) {
    if (!known.has(name)) return 0;
    if (['GM Console', '← Change role', 'Back to fleet'].includes(name)) {
      if (!sourceIsGm(raw)) return 0;
      const routes = { 'GM Console': '#/console', '← Change role': '#/ships/aegis/observer', 'Back to fleet': '#/ships/aegis/roles' };
      if (route() !== routes[name]) return 0;
      if (name === 'GM Console' && remainingStationMountReads > 0) return 0;
    }
    if ((Object.hasOwn(fields, name) || ['Facilitator rule call', 'Private loyalty census', 'Record rule call', 'Save note'].includes(name)) &&
        (route() !== '#/gm' || !gmMounted)) return 0;
    if (counts[name] !== undefined) return counts[name];
    if (name === 'ICN console lock // clear') return raw.session.shipConsoleLocks.aegis === false ? 1 : 0;
    if (controlNames.includes(name) || name === 'ICN console lock') {
      if (route() !== '#/ships/aegis/observer' || !mounted) return 0;
      if (name === 'Release ICN console lock' && raw.session.shipConsoleLocks.aegis !== true) return 0;
      if (name === 'Engage ICN console lock' && raw.session.shipConsoleLocks.aegis !== false) return 0;
    }
    return 1;
  }
  function enabled(name) {
    if (disabled.has(name) || options.endgame === true &&
        (Object.hasOwn(fields, name) || ['Record rule call', 'Save note'].includes(name))) return false;
    if (name === 'Record rule call') return options.recordStaysDisabled !== true &&
      ['Question or ambiguity', 'Source or reference', 'Decision'].every(label => fields[label].trim());
    if (name === 'Release ICN console lock') return raw.gmInstance.shipConsoleWriteGrant?.shipId === 'aegis';
    return true;
  }
  function locator(name) {
    return { count: async () => available(name), isVisible: async () => available(name) === 1,
      isEnabled: async () => available(name) === 1 && !!enabled(name),
      innerText: async () => name, getAttribute: async attribute => {
        if (name === 'GM ship console read write access' && attribute === 'aria-pressed')
          return raw.gmInstance.shipConsoleWriteGrant?.shipId === 'aegis' ? 'true' : 'false';
        if (attribute === 'href') return sourceLinks[name]?.href ?? null;
        return null;
      },
      and: other => other.sourceLink === name && options.foreignLink !== name ? locator(name) : locator('not-source-link'),
      evaluate: async callback => callback({ getAttribute: () => null }),
      getByRole: (_role, input) => locator(input.name), getByLabel: (label, input) => {
        assert.equal(input.exact, true); return locator(label);
      },
      getByText: (text, input) => { assert.equal(input.exact, true); return locator(text); },
      locator: selector => { assert.equal(selector, 'xpath=ancestor::tr'); return locator('census-row'); },
      inputValue: async () => fields[name],
      fill: async value => {
        assert.equal(available(name), 1); assert.ok(enabled(name), 'Native field is not writable.');
        fields[name] = value; fills.push(name); uiEvents.push(`fill:${name}`);
        options.onFill?.({ name, raw, fields });
      },
      selectOption: async value => {
        assert.equal(available(name), 1); assert.ok(enabled(name));
        assert.equal(name, 'Audience'); assert.equal(value, 'gm-only'); fields[name] = value;
      },
      click: async () => {
        assert.equal(available(name), 1); assert.ok(enabled(name), 'Native source button is disabled.');
        uiEvents.push(`click:${name}`);
        if (sourceLinks[name]) {
          url = new URL(sourceLinks[name].href, url).href;
          navigations.push(name); options.onNavigation?.({ name, raw });
        } else if (name === 'Save note') {
          const note = fields[`Facilitator note for ${targetUid}`];
          raw.gmLoyaltyCensus.revision += 1; raw.gmLoyaltyCensus.entries[0].note = note;
          emit('setFacilitatorCensusNote', { requestId: 'native-census-receipt', targetUid, note,
            expectedRevision: raw.gmLoyaltyCensus.revision - 1 }, { sessionId,
            targetUid, revision: raw.gmLoyaltyCensus.revision, note });
        } else if (name === 'Record rule call') {
          const revision = (raw.gmFacilitatorRuleCall?.revision ?? 0) + 1;
          raw.gmFacilitatorRuleCall = { sessionId, revision, callId: 'native-rule-receipt', actorUid: uid,
            label: 'FACILITATOR RULE CALL', ambiguity: fields['Question or ambiguity'],
            source: fields['Source or reference'], decision: fields.Decision, audience: fields.Audience,
            createdAt: '2026-10-05T10:00:01.000Z' };
          emit('authorFacilitatorRuleCall', { requestId: 'native-rule-receipt', expectedRevision: revision - 1,
            ambiguity: fields['Question or ambiguity'], source: fields['Source or reference'],
            decision: fields.Decision, audience: fields.Audience }, { status: 'committed',
            ...raw.gmFacilitatorRuleCall });
        } else if (name === 'ARE YOU SURE?') {
          raw.gmInstance.shipConsoleWriteGrant = { shipId: 'aegis' };
          emit('setGmShipConsoleWriteGrant', { shipId: 'aegis', enabled: true, claimedAt },
            { shipId: 'aegis', enabled: true });
        } else if (name === 'GM ship console read write access' && raw.gmInstance.shipConsoleWriteGrant) {
          raw.gmInstance.shipConsoleWriteGrant = null;
          emit('setGmShipConsoleWriteGrant', { shipId: 'aegis', enabled: false, claimedAt },
            { enabled: false });
        } else if (name === 'Release ICN console lock') {
          raw.session.shipConsoleLocks.aegis = false; raw.session.vesselActionRevisions.aegis += 1;
          emit('setShipConsoleLock', { shipId: 'aegis', locked: false, expectedRevision: 3,
            requestId: 'native-lock-receipt' }, { shipId: 'aegis', locked: false, actorUid: uid,
            actorRoleId: null, vesselId: 'aegis', turn: 1, phase: 'active', revision: 4,
            idempotencyKey: 'native-lock-receipt', auditId: 'console-lock-native-lock-receipt' });
        }
      } };
  }
  function documentFixture() {
    const select = { value: 'admiral', options: [{ value: 'admiral', selected: true, disabled: false }] };
    const main = { getAttribute: () => raw.gmInstance.shipConsoleWriteGrant ? 'write' : 'read',
      querySelector: () => ({ getAttribute: () => 'aegis' }), querySelectorAll: () => [select] };
    return { querySelector: () => null, getElementById: () => null,
      querySelectorAll: selector => {
        if (selector === 'main.gm-console') {
          gmMountReads += 1;
          if (remainingGmMountReads > 0) { remainingGmMountReads -= 1; gmMounted = false; }
          else gmMounted = true;
          options.onGmMountRead?.({ raw, gmMountReads });
          return gmMounted && route() === '#/gm' ? [{}] : [];
        }
        if (selector === 'main.ship-console[data-observer-mode]') {
          mountReads += 1;
          if (remainingMountReads > 0) { remainingMountReads -= 1; mounted = false; }
          else mounted = true;
          options.onMountRead?.({ raw, mountReads });
          return mounted && route() === '#/ships/aegis/observer' ? [main] : [];
        }
        if (selector === '[role="status"]') {
          if (route() === '#/console' && remainingStationMountReads > 0) {
            remainingStationMountReads -= 1; return [{ textContent: 'Opening stations…' }];
          }
          return route() === '#/gm' && !gmMounted ? [{ textContent: 'Opening GM console…' }]
            : route() === '#/ships/aegis/observer' && !mounted ? [{ textContent: 'Opening ship console…' }] : [];
        }
        return [];
      } };
  }
  const browser = createContext({ crypto: webcrypto, TextEncoder,
    window: { get location() { return { hash: new URL(url).hash }; } }, document: documentFixture() });
  assert.equal(new Script('[typeof process,typeof Buffer,typeof createHash,typeof require].join(",")')
    .runInContext(browser), 'undefined,undefined,undefined,undefined');
  const modules = new Map();
  for (const [path, exports] of [
    ['/src/store/useSessionStore.ts', { useSessionStore: { getState: () => raw } }],
    ['/src/lib/sessionService.ts', { reconcileGmAuthority: async () => {},
      listGmInstances: async () => { lists += 1; listsAtHydration.push(raw.identityHydrationRevision); return [raw.gmInstance]; } }],
    ['/src/lib/firebase.ts', { auth: () => ({ currentUser: authUid ? { uid: authUid } : null }) }],
    ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: null }],
  ]) {
    const module = new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context: browser });
    await module.link(() => { throw new Error('No native browser module has imports.'); });
    await module.evaluate(); modules.set(path, module);
  }
  const surface = { storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => actor(),
    until: async (_description, predicate, timeout) => {
      assert.ok(timeout > 0 && timeout <= 60_000); operationBudgets.push(timeout);
      const value = actor(); assert.ok(predicate(value)); return value;
    },
    page: { url: () => url, goto: async (next, input = {}) => {
        if (input.timeout !== undefined) { assert.ok(input.timeout > 0 && input.timeout <= 35_000); operationBudgets.push(input.timeout); }
        url = next; mounted = remainingMountReads === 0; options.onGoto?.({ raw });
      },
      reload: async () => {
        reloads += 1; raw.me.connectionGeneration += 1; raw.identityHydrationRevision = 1;
        if (route() === '#/gm') { remainingGmMountReads = options.gmMountReads ?? 0; gmMounted = remainingGmMountReads === 0; }
        await options.onReload?.({ raw, reloads });
      },
      evaluate: async (callback, input) => {
        browser.input = input;
        const result = normalize(await new Script(`(${callback.toString()})(input)`, {
          importModuleDynamically: async path => {
            assert.ok(modules.has(path), `Only genuine browser dependencies: ${path}`); return modules.get(path);
          } }).runInContext(browser));
        if (callback.toString().includes('privateAudienceMatches:')) {
          lifecycleReads += 1; options.onLifecycleActorRead?.({ raw, reloads, lifecycleReads });
        }
        return result;
      },
      getByRole: (role, input = {}) => role === 'status'
        ? { allTextContents: async () => ['RULE CALL APPLIED'] } : locator(input.name),
      getByLabel: (label, input) => { assert.equal(input.exact, true); return locator(label); },
      locator: selector => {
        for (const [name, link] of Object.entries(sourceLinks)) {
          if (selector === link.selector) return { ...locator(name), sourceLink: name };
        }
        assert.equal(selector, '.ship-console');
        return { getAttribute: async () => raw.gmInstance.shipConsoleWriteGrant ? 'write' : 'read' };
      },
      on: (_event, listener) => requestListeners.add(listener), off: (_event, listener) => requestListeners.delete(listener),
      waitForResponse: (predicate, input) => {
        // Model the unchanged public collector default; surface.until still enforces twenty seconds above.
        assert.ok(input.timeout > 0 && input.timeout <= 60_000);
        return new Promise((resolve, reject) => waiting.push({ predicate, resolve, reject }));
      } },
    callable: async (endpoint, data) => {
      const exact = writes.find(write => write.endpoint === endpoint && JSON.stringify(write.data) === JSON.stringify(data));
      assert.ok(exact); return { status: 'committed', result: exact.result };
    } };
  const context = { initial: { sessionId, joinCode: 'native-source-join', uidHash: hash(uid) }, started: actor(), gm: surface, crew: surface,
    roster: [{ roleId: 'admiral', uidHash: hash(targetUid) }] };
  const game = createTwoBrowserGameplay(context);
  const getRecipe = async endpoint => steps[specs[endpoint].id]({ context, game, spec: specs[endpoint] });
  const state = async () => ({ live: raw.connection === 'live' && raw.sessionSnapshotFreshness === 'server',
    sessionId: raw.session.id, cycle: raw.session.currentTurn, phase: raw.session.phase });
  const prepare = async recipe => recipe.prepare({ surface, actor: actor(), source: await state() });
  const run = async endpoint => {
    const recipe = await getRecipe(endpoint), planned = await prepare(recipe);
    assert.equal(planned.offered, true, planned.reason);
    await planned.click();
    const request = writes.findLast(write => write.endpoint === endpoint);
    assert.ok(request);
    const inspected = await recipe.inspect({ surface, result: request.result, request: request.data });
    return { recipe, inspected };
  };
  return { raw, surface, context, game, getRecipe, prepare, run, writes, fills, uiEvents, listsAtHydration, operationBudgets, navigations,
    gmMountReads: () => gmMountReads,
    lists: () => lists, reloads: () => reloads, mountReads: () => mountReads,
    setAuth: value => { authUid = value; }, close: () => {
      for (const observer of waiting.splice(0)) observer.reject(new Error('Native fixture closed.'));
    } };
}

const callbackFor = (f, endpoints) => createPendingGmRulingsCountersCallbacks({
  steps: Object.fromEntries(endpoints.map(endpoint => [specs[endpoint].id, steps[specs[endpoint].id]])),
  gameFactory: () => f.game,
});
const rowFor = (result, endpoint) => result.evidence.cases.find(row => row.endpoint === endpoint);

test('actual canonical GM selection verifies live authority without navigating to the GM console', async () => {
  const f = await fixture();
  try {
    assert.equal(await f.game.select('gm'), f.surface);
    assert.equal(new URL(f.surface.page.url()).hash, '#/console');
    assert.deepEqual(f.navigations, []); assert.deepEqual(f.writes, []);
  } finally { f.close(); }
});

for (const endpoint of ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote']) {
  test(`public ${endpoint} uses the actual normal GM link before filling route-local fields`, async () => {
    const f = await fixture();
    try {
      const result = await callbackFor(f, [endpoint]).onStarted(f.context);
      assert.equal(rowFor(result, endpoint).status, 'completed', rowFor(result, endpoint).reason);
      assert.deepEqual(f.navigations, ['GM Console']);
      assert.ok(f.uiEvents.indexOf('click:GM Console') < f.uiEvents.findIndex(value => value.startsWith('fill:')));
      assert.equal(f.writes.length, 1); assert.equal(f.reloads(), 1);
      assert.equal(result.familyAcceptanceClaimed, false);
    } finally { f.close(); }
  });

  test(`public ${endpoint} follows the original mounted observer return, fleet return and GM link`, async () => {
    const f = await fixture({ route: '#/ships/aegis/observer' });
    try {
      const result = await callbackFor(f, [endpoint]).onStarted(f.context);
      assert.equal(rowFor(result, endpoint).status, 'completed', rowFor(result, endpoint).reason);
      assert.deepEqual(f.navigations, ['← Change role', 'Back to fleet', 'GM Console']);
      assert.equal(f.writes.length, 1); assert.equal(f.reloads(), 1);
    } finally { f.close(); }
  });

  test(`public ${endpoint} waits only for the source lazy fallback after normal GM navigation`, async () => {
    const f = await fixture({ gmMountReads: 1 });
    try {
      const result = await callbackFor(f, [endpoint]).onStarted(f.context);
      assert.equal(rowFor(result, endpoint).status, 'completed', rowFor(result, endpoint).reason);
      assert.deepEqual(f.navigations, ['GM Console']); assert.ok(f.gmMountReads() >= 2);
    } finally { f.close(); }
  });

  test(`public ${endpoint} rejects changed original claim during normal navigation before input or action`, async () => {
    const f = await fixture({ onNavigation: ({ raw }) => { raw.gmInstance.claimedAt = '2026-10-05T10:00:01.000Z'; } });
    try {
      const result = await callbackFor(f, [endpoint]).onStarted(f.context);
      assert.equal(rowFor(result, endpoint).status, 'pending');
      assert.equal(f.fills.length, 0); assert.equal(f.writes.length, 0); assert.equal(f.reloads(), 0);
    } finally { f.close(); }
  });
}

for (const [description, options] of [
  ['absent', { counts: { 'GM Console': 0 } }],
  ['ambiguous', { counts: { 'GM Console': 2 } }],
  ['disabled', { disabled: ['GM Console'] }],
  ['foreign source href/class', { foreignLink: 'GM Console' }],
]) {
  test(`public GM form remains pending when its exact normal link is ${description}`, async () => {
    const f = await fixture(options);
    try {
      const result = await callbackFor(f, ['authorFacilitatorRuleCall']).onStarted(f.context);
      assert.equal(rowFor(result, 'authorFacilitatorRuleCall').status, 'pending');
      assert.equal(f.fills.length, 0); assert.equal(f.writes.length, 0); assert.equal(f.reloads(), 0);
      assert.deepEqual(f.navigations, []);
    } finally { f.close(); }
  });
}

test('public GM form rejects changed accepted document generation during the normal link click', async () => {
  const f = await fixture({ onNavigation: ({ raw }) => { raw.me.connectionGeneration += 1; } });
  try {
    const result = await callbackFor(f, ['authorFacilitatorRuleCall']).onStarted(f.context);
    assert.equal(rowFor(result, 'authorFacilitatorRuleCall').status, 'pending');
    assert.equal(f.fills.length, 0); assert.equal(f.writes.length, 0);
  } finally { f.close(); }
});

test('public GM form keeps an already mounted GM route without an additional navigation', async () => {
  const f = await fixture({ route: '#/gm' });
  try {
    const result = await callbackFor(f, ['authorFacilitatorRuleCall']).onStarted(f.context);
    assert.equal(rowFor(result, 'authorFacilitatorRuleCall').status, 'completed', rowFor(result, 'authorFacilitatorRuleCall').reason);
    assert.deepEqual(f.navigations, []); assert.equal(f.writes.length, 1);
  } finally { f.close(); }
});

test('public GM form consumes the existing readiness budget while its exact normal stations link is still lazy mounting', async () => {
  const f = await fixture({ stationMountReads: 1 });
  try {
    const result = await callbackFor(f, ['authorFacilitatorRuleCall']).onStarted(f.context);
    assert.equal(rowFor(result, 'authorFacilitatorRuleCall').status, 'completed', rowFor(result, 'authorFacilitatorRuleCall').reason);
    assert.deepEqual(f.navigations, ['GM Console']); assert.equal(f.writes.length, 1);
    assert.ok(f.operationBudgets.every(timeout => timeout > 0 && timeout <= 60_000));
  } finally { f.close(); }
});

test('public strict grant capture stays pending when the real source StrictMode reload cleanup removes enabled grant', async () => {
  const sourceCleanupCalls = [];
  const f = await fixture({ route: '#/gm', onReload: async ({ raw }) => {
    const observer = await createObserverFixture({ granted: raw.gmInstance.shipConsoleWriteGrant?.shipId === 'aegis' });
    try {
      await observer.mount();
      raw.gmInstance = normalize(observer.api.useSessionStore.getState().gmInstance);
      sourceCleanupCalls.push(...observer.calls);
    } finally { await observer.close(); }
  } });
  try {
    const result = await callbackFor(f, ['setGmShipConsoleWriteGrant']).onStarted(f.context);
    const row = rowFor(result, 'setGmShipConsoleWriteGrant');
    assert.equal(row.status, 'pending');
    assert.equal(row.reason, 'single-shot-enable-and-ui-revoke-do-not-share-the-same-live-GM-lease');
    assert.equal(row.leaseDiagnostic.restorePresent, false);
    assert.equal(row.leaseDiagnostic.enabledProjectionPresent, false);
    assert.equal(row.leaseDiagnostic.projectionClaimMatches, true);
    assert.equal(sourceCleanupCalls.length, 1); assert.equal(sourceCleanupCalls[0].enabled, false);
    assert.equal(sourceCleanupCalls[0].instanceId, original.instanceId);
    assert.equal(sourceCleanupCalls[0].claimedAt, original.claimedAt);
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].data.enabled, true);
    assert.equal(f.reloads(), 1); assert.equal(result.familyAcceptanceClaimed, false);
  } finally { f.close(); }
});
