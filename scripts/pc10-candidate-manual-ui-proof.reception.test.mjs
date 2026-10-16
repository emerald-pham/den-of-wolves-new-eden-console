import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createContext, Script, SourceTextModule, SyntheticModule } from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plain = value => JSON.parse(JSON.stringify(value));
const noAction = () => assert.fail('This actual-component reception fixture cannot mutate gameplay or call Auth/emulators.');

async function sourceModule(file, imports, realm = createContext({})) {
  const { outputText } = ts.transpileModule(await readFile(resolve(ROOT, file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const module = new SourceTextModule(outputText, { context: realm });
  await module.link(async name => {
    assert.ok(Object.hasOwn(imports, name), `Only declared source dependencies may load: ${name}`);
    const values = imports[name];
    if (values instanceof SourceTextModule) return values;
    const dependency = new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context: realm });
    await dependency.link(noAction); return dependency;
  });
  await module.evaluate(); return module;
}

/** Actual source component/effect and native timers. Transport and DOM layout are isolated models. */
export async function receptionFixture({ initialNetworkMs = 18, initialComponentMs = 65,
  refreshNetworkMs = 35, refreshComponentMs = 40, recoveredPending = false,
  extraRefreshRead = false, refreshScope = {} } = {}) {
  const css = `${await readFile(resolve(ROOT, 'src/styles/cic.css'), 'utf8')}\n${await readFile(resolve(ROOT, 'src/components/CandidatePreparationPanel.css'), 'utf8')}`;
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body><main id="source-root"></main></body></html>`, { pretendToBeVisual: true });
  const { window } = dom;
  // Static source CSS is unchanged during these cases; live hidden/disabled DOM guards remain uncached.
  const computeStyle = window.getComputedStyle.bind(window), styles = new WeakMap();
  window.getComputedStyle = node => {
    const key = `${node.className}|${node.getAttribute('style') ?? ''}`, cached = styles.get(node);
    if (cached?.key === key) return cached.value;
    const value = computeStyle(node); styles.set(node, { key, value }); return value;
  };
  const saved = Object.fromEntries(['window', 'document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of Object.keys(saved)) Object.defineProperty(globalThis, key, { configurable: true, value: window[key] ?? window });
  const block = new Set(['MAIN', 'SECTION', 'DIV', 'P', 'H2', 'H3', 'ARTICLE', 'FIELDSET', 'LEGEND', 'LABEL', 'UL', 'LI']);
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() {
    const text = [...this.childNodes].map(node => {
      if (node.nodeType === 3) return node.textContent.replace(/\s+/g, ' ');
      if (!(node instanceof window.HTMLElement)) return '';
      return block.has(node.tagName) ? `\n${node.innerText}\n` : node.innerText;
    }).join('').trim();
    return window.getComputedStyle(this).textTransform === 'uppercase' ? text.toUpperCase() : text;
  } });
  const visible = node => {
    if (!node?.isConnected || node.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
    for (let current = node; current; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 280, height: 44 });
  window.HTMLElement.prototype.getClientRects = function () { return visible(this) ? [this.getBoundingClientRect()] : []; };
  const store = { session: { id: 'source-reception-session', currentTurn: 4, phase: 'active', updatedAt: 'source-key-0',
    shipFleetGroupIds: { shepherd: 'fleet-1' } }, me: { sessionId: 'source-reception-session', uid: 'source-scientist',
    role: 'player', assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist',
    fleetGroupId: 'fleet-1', connectionGeneration: 3 }, gmInstance: null,
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1 };
  const projectionRealm = createContext({});
  const research = await sourceModule('functions/src/endeavourResearch.ts', { './consoleMetadata': { consoleMetadataFor: noAction } }, projectionRealm);
  const paths = await sourceModule('functions/src/candidatePaths.ts', { './endeavourResearch': research }, projectionRealm);
  const tracks = ['reactor', 'jump-drive', 'hydroponics', 'water-reclamation', 'advanced-hydroponics'];
  // The domain requires canonical records from its own realm, so build this source fixture there.
  const researchProgress = new Script(`Object.fromEntries(${JSON.stringify(tracks)}.map(id => [id, 4]))`)
    .runInContext(projectionRealm);
  const report = plain(paths.namespace.candidateWorkspace({ sessionId: store.session.id, cycle: 4, phase: 'active',
    coordination: true, now: '2026-10-06T00:00:00.000Z', groupId: 'fleet-1', vesselIds: ['shepherd'],
    actor: { uid: store.me.uid, gm: false, shipIds: [], research: true, shuttleIds: [] },
    discovered: [{ code: 'N', coordinate: '0123' }], ships: { shepherd: { fuel: 40, materials: 10, reactorCapacity: 5,
      destroyed: false, jumpCharged: true, jumpDamaged: false, longJumpCost: 13, atCandidate: true, jumpedThisCycle: false,
      coordinate: '0123' } }, research: researchProgress, engineeringShuttles: [], hiddenScoutCount: 0,
  }, { revision: 6, sites: {} }));
  const events = [], listeners = new Map(), timers = new Set(), reads = [];
  const emit = (event, value) => { for (const listener of listeners.get(event) ?? []) listener(value); };
  const schedule = (fn, ms) => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms); timers.add(timer); return timer; };
  let clickCount = 0, screenshotCount = 0, sourcePaintCount = 0;
  const foreignDocuments = [];
  const read = groupId => new Promise(resolveReport => {
    const ordinal = reads.length, fromRefresh = clickCount > 0;
    const data = { sessionId: store.session.id, expectedGroupId: groupId, ...(fromRefresh ? refreshScope : {}) };
    const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5011/demo-pc10-source-reception/us-central1/readCandidateWorkspace',
      postDataJSON: () => ({ data }) };
    const response = { request: () => request, url: request.url, status: () => 200, json: async () => ({ result: report }) };
    const key = store.session.updatedAt;
    reads.push({ ordinal, fromRefresh, key });
    events.push({ kind: 'source-read', ordinal, fromRefresh, groupMatches: groupId === 'fleet-1' });
    schedule(() => { emit('request', request); events.push({ kind: 'request', ordinal, fromRefresh });
      if (extraRefreshRead && fromRefresh) emit('request', { ...request }); }, fromRefresh ? refreshNetworkMs : initialNetworkMs);
    schedule(() => { emit('response', response); events.push({ kind: 'response', ordinal, fromRefresh }); },
      fromRefresh ? refreshNetworkMs + 3 : Math.max(0, initialComponentMs - 3));
    schedule(() => resolveReport(report), fromRefresh ? refreshComponentMs : initialComponentMs);
  });
  const pending = recoveredPending ? { sessionId: store.session.id, requestId: 'source-original-pending', expectedGroupId: 'fleet-1' } : undefined;
  const component = await sourceModule('src/components/CandidatePreparationPanel.tsx', {
    react: React, 'react/jsx-runtime': jsxRuntime, '@/store/useSessionStore': { useSessionStore: selector => selector(store) },
    '@/lib/sessionService': { setGmShipConsoleWriteGrant: noAction }, '@/lib/candidateService': {
      createCandidateAttempt: noAction, executeCandidateAttempt: noAction, readCandidateWorkspace: read,
      recoverCandidateAttempt: () => pending, selectCandidateEdition: noAction,
    }, './CandidatePreparationPanel.css': {},
  });
  const root = createRoot(window.document.querySelector('#source-root'));
  const render = () => root.render(React.createElement(component.namespace.default)); render();
  const browserRealm = createContext({ document: window.document, performance: window.performance,
    innerWidth: 320, getComputedStyle: window.getComputedStyle.bind(window), matchMedia: () => ({ matches: false }),
    requestAnimationFrame: callback => window.requestAnimationFrame(time => { sourcePaintCount++; callback(time); }),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window), setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) });
  assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(browserRealm), 'undefined,undefined,undefined');
  const storeModule = new SyntheticModule(['useSessionStore'], function () { this.setExport('useSessionStore', { getState: () => store }); }, { context: browserRealm });
  await storeModule.link(noAction); await storeModule.evaluate();
  const evaluate = async (callback, arg) => {
    browserRealm.arg = arg;
    return new Script(`(${callback.toString()})(arg)`, { importModuleDynamically: async name => {
      assert.equal(name, 'source-store-module'); return storeModule;
    } }).runInContext(browserRealm);
  };
  function locator(query) {
    const nodes = () => query();
    return { count: async () => nodes().length, isVisible: async () => nodes().length === 1 && visible(nodes()[0]),
      isEnabled: async () => nodes().length === 1 && !nodes()[0].matches(':disabled') && !nodes()[0].closest('fieldset:disabled'),
      inputValue: async () => { assert.equal(nodes().length, 1); return nodes()[0].value; },
      waitFor: async () => {}, scrollIntoViewIfNeeded: async () => {},
      evaluate: async callback => { assert.equal(nodes().length, 1); browserRealm.arg = nodes()[0]; return plain(await evaluate(callback, nodes()[0])); },
      getByRole: (role, options) => locator(() => nodes().flatMap(node => [...node.querySelectorAll(role === 'button' ? 'button' : 'select')]).filter(node =>
        (node.getAttribute('aria-label') ?? node.textContent.replace(/\s+/g, ' ').trim()) === options.name)),
      click: async () => {
        assert.equal(nodes().length, 1); assert.ok(visible(nodes()[0])); assert.equal(nodes()[0].disabled, false);
        const receiving = window.document.body.textContent.includes('Receiving current candidate operations…');
        events.push({ kind: 'refresh-click', receiving, sourcePaintCount }); clickCount++; nodes()[0].click();
      } };
  }
  const panel = locator(() => [...window.document.querySelectorAll('[aria-label="Candidate preparation and actions"]')]);
  const page = { getByRole: () => panel, evaluate,
    on: (event, listener) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
    off: (event, listener) => listeners.get(event)?.delete(listener),
    waitForResponse: (predicate, { timeout } = {}) => new Promise((resolveResponse, rejectResponse) => {
      events.push({ kind: 'arm-response', timeout });
      let timer;
      const finish = () => { page.off('response', handle); clearTimeout(timer); timers.delete(timer); };
      const handle = response => { if (predicate(response)) { finish(); resolveResponse(response); } };
      page.on('response', handle); timer = schedule(() => { finish(); rejectResponse(new Error('candidate workspace source report timed out')); }, timeout);
    }), viewportSize: () => ({ width: 320, height: 844 }), setViewportSize: async () => {},
    screenshot: async () => { screenshotCount++; }, keyboard: { press: async key => {
      assert.equal(key, 'Tab');
      const stops = [...window.document.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(node => visible(node) && !node.matches(':disabled') && node.tabIndex >= 0);
      const index = stops.indexOf(window.document.activeElement); stops[(index + 1) % stops.length].focus();
    } } };
  const surface = { page, storeModuleUrl: () => 'source-store-module', observe: async () => ({ hasAuth: true, sameActor: true,
    uidHash: store.me.uid === 'source-scientist' ? 'source-original-hash' : 'foreign-hash', sessionId: store.session.id,
    playerRole: store.me.role, profileRoleId: 'shepherd-scientist', assignedRoleId: store.me.assignedRoleId,
    activeConsoleRoleId: store.me.activeConsoleRoleId, instanceId: null, gmInstanceOwned: false,
    connection: store.connection, freshness: store.sessionSnapshotFreshness }) };
  // Mount and its effect are part of the actual source fixture, not a synthesized ready snapshot.
  for (let attempt = 0; reads.length === 0 && attempt < 50; attempt++) await delay(2);
  assert.ok(reads.length > 0);
  return { dom, window, store, report, events, reads, surface, render, panel,
    received: async () => { while (window.document.body.textContent.includes('Receiving current candidate operations…')) await delay(2); },
    changeDocument: () => {
      const foreign = new JSDOM('<!doctype html><html><body></body></html>'); foreignDocuments.push(foreign);
      browserRealm.document = foreign.window.document; browserRealm.performance = foreign.window.performance;
    }, clearDocument: () => { browserRealm.performance = {}; },
    screenshotCount: () => screenshotCount, clickCount: () => clickCount,
    dispose: () => { root.unmount(); for (const timer of timers) clearTimeout(timer); window.close();
      for (const foreign of foreignDocuments) foreign.window.close();
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
      } },
  };
}

async function geometry(t, fixture, readinessTimeoutMs = 650) {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-source-reception-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tools = candidateGameplayTools({ gm: fixture.surface, crew: fixture.surface, directory,
    initial: { sessionId: fixture.store.session.id, joinCode: 'source-join' },
    roster: [{ roleId: 'shepherd-scientist', uidHash: 'source-original-hash' }], projectId: 'demo-pc10-source-reception', ports: { functions: 5011 } });
  return { run: () => tools.candidateGeometry(fixture.surface, 'N', 'research-choice', { readinessTimeoutMs }), directory };
}

test('public geometry waits for actual initial reception and two source paints before its ONE explicit scoped read', async t => {
  const f = await receptionFixture(); t.after(f.dispose);
  const g = await geometry(t, f);
  const refresh = f.window.document.querySelector('.candidate-preparation__header button');
  assert.equal(refresh.disabled, false); assert.ok(f.window.document.body.textContent.includes('Receiving current candidate operations…'));
  await g.run();
  assert.equal(f.clickCount(), 1); assert.equal(f.reads.filter(read => read.fromRefresh).length, 1);
  const click = f.events.find(event => event.kind === 'refresh-click');
  assert.equal(click.receiving, false); assert.ok(click.sourcePaintCount >= 2);
  assert.equal(f.screenshotCount(), 3);
});

test('actual session.updatedAt effect clears reception and cancels the earlier source-key read before explicit refresh', async t => {
  const f = await receptionFixture({ initialNetworkMs: 45, initialComponentMs: 85 }); t.after(f.dispose);
  const g = await geometry(t, f);
  const timer = setTimeout(() => { f.store.session = { ...f.store.session, updatedAt: 'source-key-1' }; f.render(); }, 8);
  t.after(() => clearTimeout(timer));
  await g.run();
  assert.ok(f.reads.filter(read => !read.fromRefresh).length >= 2);
  assert.equal(f.reads.filter(read => read.fromRefresh).length, 1);
  assert.equal(f.events.find(event => event.kind === 'refresh-click').receiving, false);
});

test('native remaining budget cannot restart after network receipt while the actual refreshed source paint is still pending', async t => {
  const f = await receptionFixture({ initialNetworkMs: 0, initialComponentMs: 2,
    refreshNetworkMs: 70, refreshComponentMs: 210 }); t.after(f.dispose); await f.received();
  const g = await geometry(t, f, 180), started = Date.now();
  await assert.rejects(g.run(), /deadline|budget|did not finish rendering/i);
  assert.ok(Date.now() - started < 230, 'The original native 180ms budget includes mount paints, request, and later reception.');
  assert.equal(f.screenshotCount(), 0); assert.deepEqual(await readdir(g.directory), []);
  const arm = f.events.find(event => event.kind === 'arm-response');
  assert.ok(arm.timeout < 180, 'Mount qualification must consume the same original remaining network budget.');
});

for (const kind of ['pending-mutation', 'transmitting', 'missing', 'duplicate', 'hidden', 'missing-refresh', 'duplicate-refresh',
  'foreign-actor', 'foreign-document', 'missing-document', 'foreign-group', 'stale-cycle']) {
  test(`public geometry keeps ${kind} source reception unready before arming/clicking`, async t => {
    const f = await receptionFixture({ initialNetworkMs: 0, initialComponentMs: 2, recoveredPending: kind === 'pending-mutation' });
    t.after(f.dispose); await f.received();
    const g = await geometry(t, f, 95);
    const element = f.window.document.querySelector('[aria-label="Candidate preparation and actions"]');
    if (kind === 'transmitting') { const status = f.window.document.createElement('p'); status.textContent = 'Transmitting candidate choice…'; element.append(status); }
    if (kind === 'missing') element.removeAttribute('aria-label');
    if (kind === 'duplicate') element.after(element.cloneNode(true));
    if (kind === 'hidden') element.hidden = true;
    if (kind === 'missing-refresh') element.querySelector('.candidate-preparation__header button').remove();
    if (kind === 'duplicate-refresh') { const button = element.querySelector('.candidate-preparation__header button'); button.after(button.cloneNode(true)); }
    // Change held source identity after the helper captures its original actor/source.
    const changes = { 'foreign-actor': () => { f.store.me.uid = 'foreign-source'; }, 'foreign-document': f.changeDocument,
      'missing-document': f.clearDocument,
      'foreign-group': () => { f.store.me.fleetGroupId = 'fleet-2'; }, 'stale-cycle': () => { f.store.session.currentTurn = 3; } };
    let timer;
    if (changes[kind]) timer = setTimeout(changes[kind], 3);
    t.after(() => clearTimeout(timer));
    await assert.rejects(g.run());
    assert.equal(f.clickCount(), 0); assert.equal(f.events.filter(event => event.kind === 'arm-response').length, 0);
    assert.equal(f.screenshotCount(), 0); assert.deepEqual(await readdir(g.directory), []);
  });
}

test('qualified public refresh still rejects duplicate scoped reads and foreign request payloads', async t => {
  for (const options of [{ extraRefreshRead: true }, { refreshScope: { expectedGroupId: 'fleet-2' } }]) {
    const f = await receptionFixture({ initialNetworkMs: 0, initialComponentMs: 2, ...options }); await f.received();
    const g = await geometry(t, f, 140);
    try {
      await assert.rejects(g.run(), options.extraRefreshRead ? /Exactly one current scoped workspace read/ : /timed out|deadline/i);
      assert.equal(f.clickCount(), 1); assert.equal(f.screenshotCount(), 0); assert.deepEqual(await readdir(g.directory), []);
    } finally { f.dispose(); }
  }
});
