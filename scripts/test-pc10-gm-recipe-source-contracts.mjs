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

// These native fixtures execute the actual public recipe factory and serialized
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
  let mountReads = 0, remainingMountReads = options.mountReads ?? 0;
  let reloads = 0, lists = 0, lifecycleReads = 0;
  const fields = { 'Question or ambiguity': '', 'Source or reference': '', Decision: '',
    Audience: 'gm-only', 'Supersedes call ID (optional)': '', [`Facilitator note for ${targetUid}`]: '' };
  const writes = [], fills = [], uiEvents = [], waiting = [], requestListeners = new Set();
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
  }
  const controlNames = ['GM ship console read write access', 'Release ICN console lock', 'Engage ICN console lock'];
  const known = new Set([...Object.keys(fields), 'Facilitator rule call', 'Record rule call', 'Save note',
    'ICN console lock', 'ICN console lock // clear', ...controlNames, 'Are you sure?', 'ARE YOU SURE?']);
  function available(name) {
    if (!known.has(name)) return 0;
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
        if (selector === 'main.ship-console[data-observer-mode]') {
          mountReads += 1;
          if (remainingMountReads > 0) { remainingMountReads -= 1; mounted = false; }
          else mounted = true;
          options.onMountRead?.({ raw, mountReads });
          return mounted && route() === '#/ships/aegis/observer' ? [main] : [];
        }
        if (selector === '[role="status"]') return !mounted ? [{ textContent: 'Opening ship console…' }] : [];
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
      listGmInstances: async () => { lists += 1; return [raw.gmInstance]; } }],
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
      assert.ok(timeout > 0 && timeout <= 20_000);
      const value = actor(); assert.ok(predicate(value)); return value;
    },
    page: { url: () => url, goto: async next => { url = next; mounted = remainingMountReads === 0; },
      reload: async () => {
        reloads += 1; raw.me.connectionGeneration += 1; raw.identityHydrationRevision = 1;
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
  return { raw, surface, context, game, getRecipe, prepare, run, writes, fills, uiEvents,
    lists: () => lists, reloads: () => reloads, mountReads: () => mountReads,
    setAuth: value => { authUid = value; }, close: () => {
      for (const observer of waiting.splice(0)) observer.reject(new Error('Native fixture closed.'));
    } };
}

test('actual public census recipe accepts the source DTO and binds saved/reloaded note to current original GM', async () => {
  const f = await fixture();
  assert.deepEqual(Object.keys(f.raw.gmLoyaltyCensus), ['revision', 'entries']);
  const { recipe, inspected } = await f.run('setFacilitatorCensusNote');
  assert.equal(recipe.expected.sourceRevision, 4);
  assert.equal(inspected.sourceAfter.live, true); assert.equal(inspected.sourceAfter.revision, 5);
  assert.equal(inspected.afterReload.projection.sessionId, f.context.initial.sessionId);
  assert.equal(inspected.afterReload.projection.uidHash, f.context.initial.uidHash);
  assert.equal(inspected.afterReload.projection.instanceId, 'native-original-instance');
  assert.equal(f.reloads(), 1); assert.equal(f.raw.me.connectionGeneration, 2);
  assert.equal(f.raw.identityHydrationRevision, 1, 'A genuine reload accepts its new current document.');
  f.close();
});

test('actual public rule recipe fills writable required fields before checking source Record enablement', async () => {
  const f = await fixture();
  const { inspected } = await f.run('authorFacilitatorRuleCall');
  assert.equal(inspected.sourceAfter.live, true); assert.equal(inspected.sourceAfter.revision, 1);
  assert.equal(inspected.rendered.visible, true);
  assert.equal(f.writes.length, 1);
  assert.ok(f.uiEvents.indexOf('fill:Decision') < f.uiEvents.indexOf('click:Record rule call'));
  f.close();
});

test('actual public grant/lock recipes wait for lazy observer role/control without inventing lock or revision', async () => {
  const f = await fixture({ mountReads: 1 });
  const grant = await f.run('setGmShipConsoleWriteGrant');
  assert.equal(grant.inspected.sourceAfter.live, true);
  assert.ok(f.mountReads() >= 2); assert.equal(f.raw.session.shipConsoleLocks.aegis, true);
  assert.equal(f.raw.session.vesselActionRevisions.aegis, 3);
  const lock = await f.run('setShipConsoleLock');
  assert.equal(lock.inspected.sourceAfter.live, true); assert.equal(lock.inspected.sourceAfter.revision, 4);
  assert.equal(lock.inspected.rendered.locked, false);
  assert.equal(f.raw.gmInstance.shipConsoleWriteGrant, null);
  f.close();
});

for (const [reason, change] of [
  ['a replacement live same-session Auth/owned GM', f => {
    f.setAuth('native-replacement-gm'); f.raw.me.uid = 'native-replacement-gm';
    f.raw.gmInstance.uid = 'native-replacement-gm'; f.raw.gmInstance.id = 'native-replacement-instance';
  }],
  ['a replacement owned instance for the same original Auth', f => {
    f.raw.gmInstance.id = 'native-replacement-instance';
  }],
  ['an absent actual started snapshot', f => { delete f.context.started; }],
]) test(`public GM preparation never adopts ${reason}`, async () => {
  const f = await fixture(); change(f);
  const recipe = await f.getRecipe('setGmShipConsoleWriteGrant');
  assert.equal((await f.prepare(recipe)).offered, false);
  assert.equal(f.writes.length, 0); assert.equal(f.fills.length, 0); f.close();
});

for (const [label, change] of [
  ['Auth UID', f => f.setAuth('native-foreign-auth')],
  ['session', f => { f.raw.session.id = 'native-foreign-session'; }],
  ['owned instance', f => { f.raw.gmInstance.id = 'native-replacement-instance'; }],
  ['exact claim', f => { f.raw.gmInstance.claimedAt = '2026-10-05T10:01:00.000Z'; }],
  ['current document generation', f => { f.raw.me.connectionGeneration += 1; }],
  ['current document hydration', f => { f.raw.identityHydrationRevision += 1; }],
  ['private audience', f => { f.raw.roleBrief = { assignmentUid: 'native-foreign-member' }; }],
  ['cached source', f => { f.raw.sessionSnapshotFreshness = 'cache'; }],
  ['revision', f => { f.raw.gmLoyaltyCensus.revision += 1; }],
]) test(`prepared public census recipe refuses changed ${label} before any fill or write`, async () => {
  const f = await fixture();
  const recipe = await f.getRecipe('setFacilitatorCensusNote');
  const prepared = await f.prepare(recipe);
  assert.equal(prepared.offered, true, prepared.reason);
  change(f);
  await assert.rejects(prepared.click());
  assert.equal(f.fills.length, 0); assert.equal(f.writes.length, 0); f.close();
});

for (const [label, options] of [
  ['endgame form', { endgame: true }],
  ['disabled writable field', { disabled: ['Decision'] }],
  ['ambiguous writable field', { counts: { Decision: 2 } }],
  ['missing writable field', { counts: { Audience: 0 } }],
  ['ambiguous Record', { counts: { 'Record rule call': 2 } }],
]) test(`public rule recipe leaves ${label} unoffered without filling`, async () => {
  const f = await fixture(options), recipe = await f.getRecipe('authorFacilitatorRuleCall');
  if (label === 'endgame form') {
    assert.equal(await f.surface.page.getByRole('region', { name: 'Facilitator rule call', exact: true }).isEnabled(), true);
    assert.equal(await f.surface.page.getByLabel('Decision', { exact: true }).isEnabled(), false);
  }
  assert.equal((await f.prepare(recipe)).offered, false);
  assert.equal(f.fills.length, 0); assert.equal(f.writes.length, 0); f.close();
});

test('public rule recipe never clicks Record if it remains genuinely disabled after valid input', async () => {
  const f = await fixture({ recordStaysDisabled: true }), recipe = await f.getRecipe('authorFacilitatorRuleCall');
  const prepared = await f.prepare(recipe);
  assert.equal(prepared.offered, true, prepared.reason);
  await assert.rejects(prepared.click());
  assert.ok(f.fills.length > 0); assert.equal(f.writes.length, 0); f.close();
});

for (const [label, options] of [
  ['fully mounted access absent', { counts: { 'GM ship console read write access': 0 } }],
  ['fully mounted access ambiguous', { counts: { 'GM ship console read write access': 2 } }],
  ['fully mounted access disabled', { disabled: ['GM ship console read write access'] }],
  ['source lock absent', {}],
  ['source revision invalid', {}],
]) test(`public grant recipe leaves ${label} uncredited without mutation`, async () => {
  const f = await fixture(options);
  if (label === 'source lock absent') f.raw.session.shipConsoleLocks.aegis = false;
  if (label === 'source revision invalid') f.raw.session.vesselActionRevisions.aegis = null;
  const recipe = await f.getRecipe('setGmShipConsoleWriteGrant');
  assert.equal((await f.prepare(recipe)).offered, false);
  assert.equal(f.writes.length, 0); f.close();
});

test('observer mounting refuses changed original claim instead of restoring authority from a later actor', async () => {
  const f = await fixture({ mountReads: 1, onMountRead: ({ raw, mountReads }) => {
    if (mountReads === 1) raw.gmInstance.claimedAt = '2026-10-05T10:01:00.000Z';
  } });
  const recipe = await f.getRecipe('setGmShipConsoleWriteGrant');
  assert.equal((await f.prepare(recipe)).offered, false); assert.equal(f.writes.length, 0); f.close();
});

for (const endpoint of ['setFacilitatorCensusNote', 'authorFacilitatorRuleCall']) {
  test(`public ${endpoint} refuses an exact claim change during input before writing`, async () => {
    const f = await fixture({ onFill: ({ raw }) => { raw.gmInstance.claimedAt = '2026-10-05T10:01:00.000Z'; } });
    const recipe = await f.getRecipe(endpoint), prepared = await f.prepare(recipe);
    assert.equal(prepared.offered, true, prepared.reason);
    await assert.rejects(prepared.click()); assert.equal(f.writes.length, 0); f.close();
  });
  test(`public ${endpoint} refuses source revision change during input before writing`, async () => {
    const f = await fixture({ onFill: ({ raw }) => {
      if (endpoint === 'setFacilitatorCensusNote') raw.gmLoyaltyCensus.revision += 1;
      else raw.gmFacilitatorRuleCall = { sessionId: raw.session.id, revision: 1 };
    } });
    const recipe = await f.getRecipe(endpoint), prepared = await f.prepare(recipe);
    assert.equal(prepared.offered, true, prepared.reason);
    await assert.rejects(prepared.click()); assert.equal(f.writes.length, 0); f.close();
  });
}

for (const [reason, change] of [
  ['replaced exact claim', raw => { raw.gmInstance.claimedAt = '2026-10-05T10:01:00.000Z'; }],
  ['foreign private audience', raw => { raw.roleBrief = { assignmentUid: 'native-foreign-member' }; }],
  ['unaccepted hydration', raw => { raw.identityHydrationRevision = 0; }],
]) test(`public census reload never certifies ${reason}`, async () => {
  const f = await fixture({ onReload: ({ raw }) => change(raw) });
  let result, denial;
  try {
    result = await f.run('setFacilitatorCensusNote');
  } catch (error) {
    denial = error;
  }
  if (denial) assert.equal(denial.name, 'AssertionError');
  else assert.notEqual(result.inspected.sourceAfter.live, true);
  assert.equal(f.writes.length, 1, 'Only the original pre-reload authorized note was written.'); f.close();
});

for (const [reason, options] of [
  ['replaced exact claim', { onReload: ({ raw }) => { raw.gmInstance.claimedAt = '2026-10-05T10:01:00.000Z'; } }],
  ['foreign private audience', { onReload: ({ raw }) => { raw.roleBrief = { assignmentUid: 'native-foreign-member' }; } }],
  ['unaccepted hydration', { onReload: ({ raw }) => { raw.identityHydrationRevision = 0; } }],
  ['current accepted document generation changed during inspection', { onLifecycleActorRead: ({ raw, reloads }) => {
    if (reloads === 1) raw.me.connectionGeneration += 1;
  } }],
  ['current accepted hydration changed during inspection', { onLifecycleActorRead: ({ raw, reloads }) => {
    if (reloads === 1) raw.identityHydrationRevision += 1;
  } }],
]) test(`public rule reload never certifies ${reason}`, async () => {
  const f = await fixture(options), caseId = specs.authorFacilitatorRuleCall.id;
  const hooks = createPendingGmRulingsCountersCallbacks({ steps: { [caseId]: steps[caseId] }, gameFactory: () => f.game });
  const result = await hooks.onStarted(f.context);
  const row = result.evidence.cases.find(row => row.caseId === caseId);
  assert.notEqual(row.status, 'completed');
  assert.equal(result.observedProcedureCount, 0); assert.equal(result.familyAcceptanceClaimed, false);
  assert.equal(f.writes.length, 1, 'Only the original pre-reload authorized ruling was written.'); f.close();
});

test('public four-recipe callback preserves exact receipts, deferred grant/revoke and private evidence limits', async () => {
  const f = await fixture({ mountReads: 1 });
  const endpoints = ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote',
    'setGmShipConsoleWriteGrant', 'setShipConsoleLock'];
  const selected = Object.fromEntries(endpoints.map(endpoint => [specs[endpoint].id, steps[specs[endpoint].id]]));
  const hooks = createPendingGmRulingsCountersCallbacks({ steps: selected, gameFactory: () => f.game });
  const result = await hooks.onStarted(f.context);
  for (const endpoint of endpoints) {
    const row = result.evidence.cases.find(row => row.endpoint === endpoint);
    assert.equal(row.status, 'completed', `${endpoint}: ${row.reason}`);
  }
  assert.equal(result.observedProcedureCount, 4); assert.equal(result.familyAcceptanceClaimed, false);
  assert.equal(result.evidence.privateTextPersisted, false);
  assert.doesNotMatch(JSON.stringify(result), /native-original-gm|native-original-member|Automated virtual personas/);
  assert.equal(f.raw.gmInstance.shipConsoleWriteGrant, null);
  assert.equal(f.raw.session.shipConsoleLocks.aegis, false);
  f.close();
});
