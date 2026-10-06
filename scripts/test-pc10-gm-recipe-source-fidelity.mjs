import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createContext, Script, SyntheticModule } from 'node:vm';
import test from 'node:test';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import { GM_RULING_COUNTER_PROCEDURES, createPendingGmRulingsCountersCallbacks } from './pc10-pending-procedure-ui-proof.mjs';

const steps = createPendingProcedureDefaultSteps();
const specs = Object.fromEntries(GM_RULING_COUNTER_PROCEDURES.map(row => [row.endpoint, row]));
const hash = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const normalize = value => value === undefined ? value : JSON.parse(JSON.stringify(value));

// These NEW source-fidelity fixtures execute the actual public recipe factory and serialized
// browser readers, with only browser imports/globals. Locators model the real
// source fields, input-dependent enablement and lazy observer mount. No browser,
// Auth account, server claim, grant, session or gameplay credit is created.
async function fixture(options = {}) {
  const uid = 'native-original-gm', sessionId = 'native-recipe-session';
  const targetUid = 'native-original-member', claimedAt = '2026-10-05T10:00:00.000Z';
  const raw = {
    session: { id: sessionId, currentTurn: 1, phase: 'active', activeVesselIds: ['aegis'],
      activeRoleIds: ['admiral'], shipConsoleLocks: { aegis: true }, vesselActionRevisions: { aegis: 3 },
      shipFleetGroupIds: { aegis: 'native-fleet' } },
    me: { uid, sessionId, role: 'gm', connectionGeneration: 1, activeConsoleRoleId: null },
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 2,
    gmInstance: { id: 'native-original-instance', sessionId, uid, claimedAt, shipConsoleWriteGrant: null },
    gmLoyaltyCensus: { revision: 4, entries: [{ uid: targetUid, kind: 'native', suspicion: null }] },
    gmLoyaltyCensusStatus: 'present', gmFacilitatorRuleCall: null, pendingCommands: [],
    gmAccessAuthenticatedAt: null, roleBrief: null,
  };
  let authUid = uid, url = 'http://localhost:5174/#/gm', mounted = true;
  let remainingGmMountReads = options.gmMountReads ?? 0, gmMountReads = 0;
  let gmMounted = remainingGmMountReads === 0;
  let mountReads = 0, remainingMountReads = options.mountReads ?? 0;
  let reloads = 0, lists = 0, lifecycleReads = 0;
  const fields = { 'Question or ambiguity': '', 'Source or reference': '', Decision: '',
    Audience: 'gm-only', 'Supersedes call ID (optional)': '', [`Facilitator note for ${targetUid}`]: '' };
  const writes = [], fills = [], uiEvents = [], waiting = [], requestListeners = new Set();
  const listsAtHydration = [], operationBudgets = [];
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
    'Private loyalty census', 'ICN console lock', 'ICN console lock // clear', ...controlNames, 'Are you sure?', 'ARE YOU SURE?']);
  function available(name) {
    if (!known.has(name)) return 0;
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
        return null;
      },
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
        if (name === 'Save note') {
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
        if (selector === '[role="status"]') return route() === '#/gm' && !gmMounted
          ? [{ textContent: 'Opening GM console…' }]
          : route() === '#/ships/aegis/observer' && !mounted ? [{ textContent: 'Opening ship console…' }] : [];
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
      assert.ok(timeout > 0 && timeout <= 20_000); operationBudgets.push(timeout);
      const value = actor(); assert.ok(predicate(value)); return value;
    },
    page: { url: () => url, goto: async (next, input = {}) => {
        if (input.timeout !== undefined) { assert.ok(input.timeout > 0 && input.timeout <= 35_000); operationBudgets.push(input.timeout); }
        url = next; mounted = remainingMountReads === 0; options.onGoto?.({ raw });
      },
      reload: async () => {
        reloads += 1; raw.me.connectionGeneration += 1; raw.identityHydrationRevision = 1;
        if (route() === '#/gm') { remainingGmMountReads = options.gmMountReads ?? 0; gmMounted = remainingGmMountReads === 0; }
        options.onReload?.({ raw, reloads });
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
  const context = { initial: { sessionId, uidHash: hash(uid) }, started: actor(), gm: surface,
    roster: [{ roleId: 'admiral', uidHash: hash(targetUid) }] };
  const game = { select: async role => { assert.equal(role, 'gm'); return surface; },
    state: async () => ({ ...raw.session, sessionId: raw.session.id, cycle: raw.session.currentTurn,
      live: raw.connection === 'live' && raw.sessionSnapshotFreshness === 'server' }) };
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
  return { raw, surface, context, game, getRecipe, prepare, run, writes, fills, uiEvents, listsAtHydration, operationBudgets,
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

for (const endpoint of ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote']) {
  test(`public ${endpoint} waits for the exact source GM lazy fallback while the generic actor is already live`, async () => {
    const f = await fixture({ gmMountReads: 1 });
    assert.equal((await f.surface.observe()).connection, 'live');
    assert.equal((await f.surface.observe()).claimedAt, undefined, 'The actual generic driver intentionally has no rich claim/document fields.');
    const result = await callbackFor(f, [endpoint]).onStarted(f.context);
    assert.equal(rowFor(result, endpoint).status, 'completed', rowFor(result, endpoint).reason);
    assert.ok(f.gmMountReads() >= 2);
    assert.equal(f.writes.length, 1); assert.equal(result.familyAcceptanceClaimed, false); f.close();
  });
}

test('public four-recipe callback uses source route-local forms, exact receipts and one original GM across all required reloads', async () => {
  const f = await fixture({ gmMountReads: 1, mountReads: 1 });
  const endpoints = ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote', 'setGmShipConsoleWriteGrant', 'setShipConsoleLock'];
  const result = await callbackFor(f, endpoints).onStarted(f.context);
  for (const endpoint of endpoints) assert.equal(rowFor(result, endpoint).status, 'completed', `${endpoint}: ${rowFor(result, endpoint).reason}`);
  assert.equal(result.observedProcedureCount, 4); assert.equal(result.familyAcceptanceClaimed, false);
  assert.equal(f.raw.gmInstance.shipConsoleWriteGrant, null);
  assert.equal(f.raw.session.shipConsoleLocks.aegis, false);
  assert.equal(result.evidence.privateTextPersisted, false);
  assert.doesNotMatch(JSON.stringify(result), /native-original-gm|native-original-member|Automated virtual personas|2026-10-05T10:00:00/);
  f.close();
});

for (const [name, options] of [
  ['missing rule input', { counts: { Decision: 0 } }],
  ['ambiguous rule input', { counts: { Decision: 2 } }],
  ['disabled rule input', { disabled: ['Decision'] }],
  ['missing exact Record', { counts: { 'Record rule call': 0 } }],
  ['ambiguous exact Record', { counts: { 'Record rule call': 2 } }],
]) test(`fully mounted ${name} remains pending with no input or write`, async () => {
  const f = await fixture(options);
  const result = await callbackFor(f, ['authorFacilitatorRuleCall']).onStarted(f.context);
  assert.equal(rowFor(result, 'authorFacilitatorRuleCall').status, 'pending');
  assert.equal(f.writes.length, 0); assert.equal(f.fills.length, 0); f.close();
});

for (const [name, change] of [
  ['exact claim', raw => { raw.gmInstance.claimedAt = '2026-10-05T10:01:00.000Z'; }],
  ['current generation', raw => { raw.me.connectionGeneration += 1; }],
  ['current hydration', raw => { raw.identityHydrationRevision += 1; }],
  ['private audience', raw => { raw.roleBrief = { assignmentUid: 'native-foreign-member' }; }],
]) test(`GM form mount cannot adopt a changed ${name}`, async () => {
  const f = await fixture({ gmMountReads: 1, onGmMountRead: ({ raw, gmMountReads }) => {
    if (gmMountReads === 1) change(raw);
  } });
  const result = await callbackFor(f, ['authorFacilitatorRuleCall']).onStarted(f.context);
  assert.equal(rowFor(result, 'authorFacilitatorRuleCall').status, 'pending');
  assert.equal(f.writes.length, 0); assert.equal(f.fills.length, 0); f.close();
});

for (const [endpoint, change] of [
  ['authorFacilitatorRuleCall', raw => { raw.identityHydrationRevision += 1; }],
  ['setFacilitatorCensusNote', raw => { raw.me.connectionGeneration += 1; }],
  ['setGmShipConsoleWriteGrant', raw => { raw.identityHydrationRevision += 1; }],
]) test(`rich capture rejects same-common-fields document churn after ${endpoint} UI receipt`, async () => {
  const f = await fixture({ onReceipt: ({ raw, endpoint: actual }) => { if (actual === endpoint) change(raw); } });
  const result = await callbackFor(f, [endpoint]).onStarted(f.context);
  assert.equal(rowFor(result, endpoint).status, 'pending');
  assert.equal(result.observedProcedureCount, 0);
  assert.equal(f.writes.filter(row => row.endpoint === endpoint && row.data.enabled !== false).length, 1);
  f.close();
});

test('grant reload waits for this document acceptance before private SDK read without replacing original UID or claim', async () => {
  const f = await fixture({ onReload: ({ raw }) => { raw.identityHydrationRevision = 0; },
    onLifecycleActorRead: ({ raw, reloads }) => { if (reloads > 0 && raw.identityHydrationRevision === 0) raw.identityHydrationRevision = 1; } });
  const result = await callbackFor(f, ['setGmShipConsoleWriteGrant']).onStarted(f.context);
  assert.equal(rowFor(result, 'setGmShipConsoleWriteGrant').status, 'completed', rowFor(result, 'setGmShipConsoleWriteGrant').reason);
  assert.ok(f.listsAtHydration.length > 0); assert.ok(f.listsAtHydration.every(revision => revision >= 1));
  assert.equal(f.raw.gmInstance.claimedAt, '2026-10-05T10:00:00.000Z');
  assert.equal(f.raw.gmInstance.shipConsoleWriteGrant, null); f.close();
});

test('future grant-loss evidence distinguishes absent restore and disabled projection without reconstructing a lease tuple', async () => {
  const f = await fixture({ onReload: ({ raw, reloads }) => { if (reloads === 1) raw.gmInstance.shipConsoleWriteGrant = null; } });
  const result = await callbackFor(f, ['setGmShipConsoleWriteGrant', 'setShipConsoleLock']).onStarted(f.context);
  const row = rowFor(result, 'setGmShipConsoleWriteGrant');
  assert.equal(row.status, 'pending'); assert.equal(rowFor(result, 'setShipConsoleLock').status, 'pending');
  assert.equal(row.leaseDiagnostic.restorePresent, false);
  assert.equal(row.leaseDiagnostic.enabledProjectionPresent, false);
  assert.equal(row.leaseDiagnostic.projectionClaimMatches, true);
  assert.equal(row.leaseDiagnostic.restoreClaimMatches, null);
  assert.doesNotMatch(JSON.stringify(result), /native-original-gm|native-original-member|2026-10-05T10:00:00/);
  assert.equal(f.writes.filter(row => row.endpoint === 'setShipConsoleLock').length, 0); f.close();
});

// Mock only the native proof-operation budget, never the source game clock.
test('observer navigation cannot reset an exhausted original GM operation deadline', async t => {
  let budgetNow = Date.now(); t.mock.method(Date, 'now', () => budgetNow);
  const f = await fixture({ onGoto: () => { budgetNow += 60_001; } });
  const result = await callbackFor(f, ['setGmShipConsoleWriteGrant']).onStarted(f.context);
  assert.equal(rowFor(result, 'setGmShipConsoleWriteGrant').status, 'pending');
  assert.equal(f.writes.length, 0); assert.equal(f.lists(), 0); f.close();
});

test('required reload cannot reset the original GM operation deadline or read private SDK state after it', async t => {
  let budgetNow = Date.now(); t.mock.method(Date, 'now', () => budgetNow);
  let listsBeforeReload;
  const f = await fixture({ onReload: () => { listsBeforeReload = f.lists(); budgetNow += 60_001; } });
  const result = await callbackFor(f, ['setGmShipConsoleWriteGrant']).onStarted(f.context);
  assert.equal(rowFor(result, 'setGmShipConsoleWriteGrant').status, 'pending');
  assert.equal(f.lists(), listsBeforeReload);
  assert.equal(f.writes.length, 1, 'Only the original authorized enable receipt was captured.'); f.close();
});

for (const [name, change] of [
  ['claim', raw => { raw.gmInstance.claimedAt = '2026-10-05T10:01:00.000Z'; }],
  ['instance', raw => { raw.gmInstance.id = 'native-replacement-instance'; }],
  ['private audience', raw => { raw.roleBrief = { assignmentUid: 'native-foreign-member' }; }],
  ['phase', raw => { raw.session.phase = 'debrief'; }],
  ['cycle', raw => { raw.session.currentTurn += 1; }],
]) test(`required grant reload cannot adopt a changed original ${name} before private SDK inspection`, async () => {
  let listsBeforeReload;
  const f = await fixture({ onReload: ({ raw }) => { listsBeforeReload = f.lists(); change(raw); } });
  const result = await callbackFor(f, ['setGmShipConsoleWriteGrant']).onStarted(f.context);
  assert.equal(rowFor(result, 'setGmShipConsoleWriteGrant').status, 'pending');
  assert.equal(f.lists(), listsBeforeReload); assert.equal(f.writes.length, 1); f.close();
});

// Denial-only counterexamples: a later acceptable snapshot cannot erase an
// already observed role, ownership or foreign-command violation during reload.
for (const [name, violate, restore] of [
  ['foreign pending command', raw => { raw.pendingCommands = [{ payload: { sessionId: 'native-foreign-session' } }]; },
    raw => { raw.pendingCommands = []; }],
  ['GM role loss', raw => { raw.me.role = 'player'; }, raw => { raw.me.role = 'gm'; }],
  ['instance ownership loss', raw => { raw.gmInstance.uid = 'native-foreign-gm'; },
    raw => { raw.gmInstance.uid = raw.me.uid; }],
]) test(`unaccepted reload cannot wait through an observed ${name} and later grant credit`, async () => {
  let listsBeforeReload;
  const f = await fixture({ onReload: ({ raw }) => {
    listsBeforeReload = f.lists(); raw.identityHydrationRevision = 0; violate(raw);
  }, onLifecycleActorRead: ({ raw, reloads }) => {
    if (reloads > 0 && raw.identityHydrationRevision === 0) { raw.identityHydrationRevision = 1; restore(raw); }
  } });
  const result = await callbackFor(f, ['setGmShipConsoleWriteGrant']).onStarted(f.context);
  assert.equal(rowFor(result, 'setGmShipConsoleWriteGrant').status, 'pending');
  assert.equal(f.lists(), listsBeforeReload); assert.equal(f.writes.length, 1); f.close();
});

test('exact GM form mount cannot reset its original twenty-second readiness deadline', async t => {
  let budgetNow = Date.now(); t.mock.method(Date, 'now', () => budgetNow);
  const f = await fixture({ gmMountReads: 1, onGmMountRead: () => { budgetNow += 20_001; } });
  const result = await callbackFor(f, ['authorFacilitatorRuleCall']).onStarted(f.context);
  assert.equal(rowFor(result, 'authorFacilitatorRuleCall').status, 'pending');
  assert.equal(f.gmMountReads(), 1); assert.equal(f.fills.length, 0); assert.equal(f.writes.length, 0); f.close();
});

test('public default recipe capture fails closed when its current-document certificate is absent', async () => {
  const f = await fixture(), spec = specs.authorFacilitatorRuleCall;
  const callbacks = createPendingGmRulingsCountersCallbacks({ steps: { [spec.id]: async input => {
    const recipe = await steps[spec.id](input); return { ...recipe, gmOperation: undefined };
  } }, gameFactory: () => f.game });
  const result = await callbacks.onStarted(f.context);
  assert.equal(rowFor(result, spec.endpoint).status, 'pending');
  assert.equal(f.writes.length, 0); assert.equal(f.fills.length, 0); f.close();
});
