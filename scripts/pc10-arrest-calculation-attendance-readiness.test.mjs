import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createContext, Script, SyntheticModule } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createArrestPosseCallbacks } from './pc10-arrest-posse-proof.mjs';

const SID = 'current-arrest-calculation-session';
const GM_UID = 'original-gm-account';
const ROLES = ['admiral', 'executive-officer', 'wing-commander', 'dione-captain', 'dione-engineer',
  'dione-president', 'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist', 'quellon-captain',
  'quellon-engineer', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer',
  'refinery-124-pdf-colonel'];
const TARGET_ROLE = 'dione-president';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const plain = value => JSON.parse(JSON.stringify(value));
const source = await readFile(new URL('../src/lib/firestore.ts', import.meta.url), 'utf8');
const identifiers = await readFile(new URL('../src/types/identifiers.ts', import.meta.url), 'utf8');
const sourceFunction = name => {
  const start = source.indexOf(`export function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n/**', start);
  assert.ok(end > start);
  return source.slice(start, end);
};
const sourceJs = ts.transpileModule([identifiers, sourceFunction('parseArrestPosseCalculation'),
  sourceFunction('subscribeGmArrestPosseCalculation')].join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace(/\bexport /g, '');

function fixture({ projection = 'ready', paintAt = 2, onFrame = () => {}, afterChecks = () => {},
  afterReload = () => {}, resultChange = () => {}, deadlineOffset = 35_000 } = {}) {
  const roster = [...ROLES, 'press-officer'].map(roleId => ({ sessionId: SID, roleId,
    uid: `original-${roleId}`, displayName: `DEMO // ${roleId}` }));
  const target = roster.find(actor => actor.roleId === TARGET_ROLE);
  const controllerUid = 'original-ordinary-controller';
  const currentPlayers = [...roster.map(actor => ({ ...actor, role: 'player', connected: true,
    assignedRoleId: actor.roleId, activeConsoleRoleId: actor.roleId, seatId: `seat-${actor.roleId}` })),
  { sessionId: SID, uid: controllerUid, displayName: 'DEMO // controller', role: 'player', connected: true,
    assignedRoleId: null, activeConsoleRoleId: null, seatId: null }];
  const state = { session: { id: SID, phase: 'active', currentTurn: 1, setupRevision: 38,
    turnState: { phase: 'team' }, fullGameDemo: { status: 'active', progression: 'manual' } },
  me: { sessionId: SID, uid: GM_UID, role: 'gm', connectionGeneration: 4 },
  gmInstance: { id: 'original-owned-instance', uid: GM_UID, sessionId: SID, claimedAt: 'original-claim' },
  identityHydrationRevision: 2, connection: 'live', sessionSnapshotFreshness: 'server', pendingCommands: [],
  roleBrief: null, gmLoyaltyCensusStatus: 'present',
  gmLoyaltyCensus: { revision: 38, entries: roster.map(actor => ({ uid: actor.uid, kind: 'fleet-loyalist', suspicion: 0 })) } };
  const user = { uid: GM_UID };
  const request = { sessionId: SID, instanceId: state.gmInstance.id, requestId: 'actual-ui-calculation-request',
    expectedRevision: 0, targetUid: target.uid, defenders: 0 };
  const result = { type: 'arrest-posse-calculation', sessionId: SID, requestId: request.requestId,
    revision: 1, targetUid: target.uid, defenders: 0, requiredPlayers: 1, censusRevision: 38 };
  resultChange(result);
  const counts = { calculationClicks: 0, replayCalls: [], reloads: 0, subscriptions: 0, unsubscribes: 0,
    connectedSubscriptions: 0, connectedStops: 0, frames: 0, checkboxes: [], attendanceClicks: 0,
    sourceCallbacks: 0, timeouts: [], timerClears: 0, cancelledFrames: 0 };
  const deadlineAt = Date.now() + deadlineOffset;
  let selectedTarget = roster[0].uid, defenders = '0', adjustment = 'none', reloaded = false;
  let painted = false, groupMounted = false, resultText = '', callbacks, frameId = 0;
  const selected = new Map(currentPlayers.filter(player => player.uid !== target.uid).map(player =>
    [player.uid, player.uid === controllerUid || player.roleId === 'press-officer']));
  function paint() { painted = true; groupMounted = true; selectedTarget = target.uid; resultText = `${result.requiredPlayers} players needed`; }
  const label = name => [{ childNodes: [{ nodeType: 3, textContent: name }, { nodeType: 1, textContent: 'wrapped options' }] }];
  const targetElement = { get value() { return selectedTarget; }, disabled: false,
    labels: label('Target player'), options: roster.map(actor => ({ value: actor.uid,
      textContent: `${actor.displayName} (${actor.uid})`, disabled: false })) };
  const defenderElement = { get value() { return defenders; }, disabled: false, labels: label('Defenders') };
  const adjustmentElement = { get value() { return adjustment; }, disabled: false, labels: label('Optional adjustment') };
  const resultElement = { get textContent() { return resultText; }, getAttribute: key => key === 'role' ? 'status' : null,
    getClientRects: () => painted ? [{}] : [] };
  const groupElement = { disabled: false, getAttribute: key => key === 'role' ? 'group' :
    key === 'aria-label' ? 'Simulated posse attendance' : null, getClientRects: () => groupMounted ? [{}] : [] };
  const panelElement = { getClientRects: () => [{}], querySelectorAll: selector => {
    if (selector === '#arrest-posse-target') return [targetElement];
    if (selector === '#arrest-posse-defenders') return [defenderElement];
    if (selector === '#arrest-posse-adjustment') return [adjustmentElement];
    if (selector === '.gm-arrest-posse__result') return painted ? [resultElement] : [];
    if (selector === '.gm-arrest-posse__attendance') return groupMounted ? [groupElement] : [];
    assert.fail(`Unexpected source panel selector: ${selector}`);
  } };
  const document = { querySelector: () => null, querySelectorAll: selector => {
    assert.equal(selector, '[aria-label="Arrest posse calculator"]'); return [panelElement];
  } };
  const snapshot = (value, fromCache = false) => ({ metadata: { fromCache }, exists: () => value !== null,
    data: () => value });
  function emitProjection() {
    if (!callbacks) return;
    if (projection === 'pending') return;
    if (projection === 'error') { callbacks.error(); return; }
    if (projection === 'missing') { callbacks.next(snapshot(null)); return; }
    const next = { ...result };
    if (projection === 'stale') next.revision = 0;
    if (projection === 'old-valid') { next.revision = 1; next.requestId = 'different-old-request'; }
    if (projection === 'newer') next.revision = 2;
    if (projection === 'wrong-target') next.targetUid = roster[0].uid;
    if (projection === 'wrong-session') next.sessionId = 'foreign-session';
    if (projection === 'wrong-defenders') next.defenders = 1;
    if (projection === 'wrong-adjustment') next.adjustment = 1;
    if (projection === 'wrong-census') next.censusRevision = 37;
    if (projection === 'wrong-count') next.requiredPlayers = 2;
    if (projection === 'private-extra') next.suspicion = 0;
    callbacks.next(snapshot(next, projection === 'cache-only'));
  }
  async function browserCallback(callback, input, browser) {
    counts.sourceCallbacks++;
    let logicalTime = Date.now();
    const frameTasks = new Map();
    const clock = class extends Date { static now() { return logicalTime; } };
    const window = { setTimeout: (fn, timeout) => { counts.timeouts.push(timeout); return { fn, timeout }; },
      clearTimeout: () => { counts.timerClears++; },
      requestAnimationFrame: fn => {
        const id = ++frameId; frameTasks.set(id, fn);
        queueMicrotask(() => {
          if (!frameTasks.has(id)) return;
          frameTasks.delete(id); counts.frames++;
          if (counts.frames === 1) emitProjection();
          if (counts.frames === paintAt) paint();
          onFrame({ state, user, target, counts, resultElement, groupElement, panelElement,
            setResultText: value => { resultText = value; }, setSelectedTarget: value => { selectedTarget = value; },
            setDefenders: value => { defenders = value; }, setAdjustment: value => { adjustment = value; } });
          logicalTime = counts.frames >= 4 ? deadlineAt : logicalTime + 1;
          fn(logicalTime);
        });
        return id;
      }, cancelAnimationFrame: id => { counts.cancelledFrames++; frameTasks.delete(id); } };
    const realm = createContext({ input, crypto: webcrypto, TextEncoder, document, window,
      Date: clock, Node: { TEXT_NODE: 3 }, requestAnimationFrame: window.requestAnimationFrame,
      cancelAnimationFrame: window.cancelAnimationFrame,
      db: () => 'inert-db', doc: (database, path) => {
        assert.equal(database, 'inert-db'); assert.equal(path, `sessions/${SID}/arrestPosseCalculations/current`); return path;
      }, onSnapshot: (path, options, next, error) => {
        assert.equal(path, `sessions/${SID}/arrestPosseCalculations/current`);
        assert.equal(options.includeMetadataChanges, true); counts.subscriptions++;
        callbacks = { next, error }; if (projection === 'immediate') { paint(); emitProjection(); }
        return () => { counts.unsubscribes++; callbacks = null; };
      } });
    assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(realm),
      'undefined,undefined,undefined');
    new Script(sourceJs).runInContext(realm);
    const sourceExports = new Script('({parseArrestPosseCalculation,subscribeGmArrestPosseCalculation})').runInContext(realm);
    const crewState = { ...state, me: { uid: controllerUid, sessionId: SID, role: 'player', connected: true,
      displayName: 'DEMO // controller', assignedRoleId: null, activeConsoleRoleId: null, seatId: null } };
    const exportsByModule = new Map([
      ['/src/lib/firebase.ts', { auth: () => ({ currentUser: browser === 'gm' ? user : { uid: controllerUid } }) }],
      ['/src/store/useSessionStore.ts', { useSessionStore: { getState: () => browser === 'gm' ? state : crewState } }],
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: browser === 'gm' ? null : { roleId: 'controller', sessionId: SID },
        readDemoActorAccountUid: roleId => { assert.equal(roleId, 'controller'); return controllerUid; } }],
      ['/src/lib/demoActorProfiles.ts', { readDemoActorRoster: sid => {
        assert.equal(sid, SID); assert.equal(browser, 'crew'); return roster;
      } }],
      ['/src/lib/demoActorDisplayName.ts', { demoActorDisplayName: roleId => roster.find(actor => actor.roleId === roleId)?.displayName }],
      ['/src/lib/firestore.ts', { ...sourceExports, subscribeConnectedPlayers: (sid, next) => {
        assert.equal(sid, SID); counts.connectedSubscriptions++; next(currentPlayers);
        return () => { counts.connectedStops++; };
      } }],
    ]);
    const modules = new Map();
    for (const [name, exports] of exportsByModule) {
      const module = new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context: realm });
      await module.link(() => assert.fail('No native source-module imports.')); await module.evaluate(); modules.set(name, module);
    }
    return new Script(`(${callback.toString()})(input)`, { importModuleDynamically: async name => {
      assert.ok(modules.has(name), `Use the existing mounted source contract: ${name}`); return modules.get(name);
    } }).runInContext(realm);
  }
  const checkbox = player => ({ count: async () => 1, isChecked: async () => selected.get(player.uid),
    check: async options => { counts.checkboxes.push(['check', player.uid, options?.timeout]); selected.set(player.uid, true);
      afterChecks({ state, user, target, counts }); },
    uncheck: async options => { counts.checkboxes.push(['uncheck', player.uid, options?.timeout]); selected.set(player.uid, false);
      afterChecks({ state, user, target, counts }); } });
  const group = { isVisible: async () => groupMounted, locator: selector => {
    assert.equal(selector, 'label'); return { all: async () => currentPlayers.filter(player => player.uid !== target.uid).map(player => ({
      innerText: async () => player.displayName, locator: selector => {
        assert.equal(selector, 'input[type="checkbox"]'); return checkbox(player);
      } })) };
  } };
  const panel = { isVisible: async () => true, locator: selector => ({ selector }),
    getByLabel: (name, options) => { assert.equal(name, 'Defenders'); assert.equal(options.exact, true);
      return { fill: async (value, options) => { defenders = value; assert.ok(options.timeout > 0 && options.timeout <= deadlineOffset); } }; },
    getByText: (text) => ({ isVisible: async () => reloaded && painted && text instanceof RegExp && text.test(resultText) }),
    getByRole: (role, options) => {
      assert.equal(options.exact, true);
      if (role === 'group') { assert.equal(options.name, 'Simulated posse attendance'); return group; }
      if (role === 'combobox') return { and: locator => {
        assert.ok(['Target player', 'Optional adjustment'].includes(options.name));
        assert.equal(locator.selector, options.name === 'Target player' ? '#arrest-posse-target' : '#arrest-posse-adjustment');
        return { selectOption: async (value, options) => {
          assert.ok(options.timeout > 0 && options.timeout <= deadlineOffset);
          if (locator.selector === '#arrest-posse-target') { assert.equal(value, target.uid); selectedTarget = value; }
          else { assert.equal(value, 'none'); adjustment = value; }
        }, inputValue: async () => selectedTarget };
      } };
      assert.equal(role, 'button');
      if (options.name === 'Calculate required players') return { isEnabled: async () => true, click: async options => {
        assert.ok(options.timeout > 0 && options.timeout <= deadlineOffset); counts.calculationClicks++;
      } };
      assert.equal(options.name, 'Simulate attendance'); return { isEnabled: async () => false,
        click: async () => { counts.attendanceClicks++; assert.fail('The native qualification stops before attendance mutation.'); } };
    } };
  const observe = () => ({ hasAuth: true, sameActor: true, uidHash: hash(user.uid), sessionId: state.session.id,
    phase: state.session.phase, cycle: state.session.currentTurn, setupRevision: state.session.setupRevision,
    playerRole: state.me.role, instanceId: state.gmInstance.id, gmInstanceOwned: state.gmInstance.uid === user.uid,
    turnStatePhase: state.session.turnState.phase, connection: state.connection, freshness: state.sessionSnapshotFreshness,
    fullGameDemo: state.session.fullGameDemo });
  const response = { url: () => 'http://127.0.0.1:5011/demo-pc10-owner/us-central1/calculateArrestPosse',
    ok: () => true, request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: request }) }),
    json: async () => ({ result }) };
  const context = { initial: { sessionId: SID }, started: observe(), deadlineAt,
    gm: { observe: async () => observe(), storeModuleUrl: () => '/src/store/useSessionStore.ts',
      until: async (description, predicate) => { assert.ok(description.includes('restored after reload')); assert.equal(predicate(observe()), true); },
      callable: async (endpoint, payload) => {
        assert.equal(endpoint, 'calculateArrestPosse'); assert.deepEqual(payload, request);
        counts.replayCalls.push(endpoint); return { status: 'committed', result };
      }, page: { evaluate: (callback, input) => browserCallback(callback, input, 'gm'),
        getByRole: (role, options) => { assert.equal(role, 'region'); assert.deepEqual(options, { name: 'Arrest posse calculator', exact: true }); return panel; },
        waitForResponse: async predicate => { assert.equal(predicate(response), true); return response; },
        reload: async () => { counts.reloads++; reloaded = true;
          state.me.connectionGeneration++; state.identityHydrationRevision = 1;
          afterReload({ state, user, target, counts }); } } },
    crew: { page: { evaluate: (callback, input) => browserCallback(callback, input, 'crew') } } };
  const run = () => createArrestPosseCallbacks({ posse: { targetRoleId: TARGET_ROLE, defenders: 0, adjustment: 'none',
    presentRoleIds: ROLES.filter(roleId => roleId !== TARGET_ROLE), attendanceEvidence: 'simulated-demo' },
  requiredBranches: ['arrest-posse-calculation', 'arrest-posse-simulated-attendance'] }).onStarted(context);
  return { run, counts, state, user, result, roster, target, selected, deadlineAt, paint };
}

function assertFiniteRead(f) {
  assert.equal(f.counts.calculationClicks, 1); assert.equal(f.counts.replayCalls.length, 2);
  assert.equal(f.counts.reloads, 1, 'Only the original capture reload is permitted.');
  assert.equal(f.counts.subscriptions, 1); assert.equal(f.counts.unsubscribes, 1);
  assert.equal(f.counts.attendanceClicks, 0); assert.ok(f.counts.timeouts.every(timeout => timeout > 0 && timeout <= 35_000));
}

test('the public factory waits for the exact server calculation and its mounted attendance under the original deadline', async () => {
  const f = fixture();
  await assert.rejects(f.run(), /source-attendance-disabled-until-calculation-and-current-inputs-match/);
  assertFiniteRead(f); assert.equal(f.counts.frames, 2);
  assert.equal(f.counts.connectedSubscriptions, 1); assert.equal(f.counts.connectedStops, 1);
  assert.equal(f.counts.checkboxes.filter(([action]) => action === 'check').length, 17);
  assert.equal(f.counts.checkboxes.filter(([action]) => action === 'uncheck').length, 2);
  assert.equal(f.selected.get('original-press-officer'), false); assert.equal(f.selected.get('original-ordinary-controller'), false);
});

test('an immediately current projection and mounted result require no frame wait or additional mutation', async () => {
  const f = fixture({ projection: 'immediate' });
  await assert.rejects(f.run(), /source-attendance-disabled-until-calculation-and-current-inputs-match/);
  assertFiniteRead(f); assert.equal(f.counts.frames, 0);
});

for (const projection of ['missing', 'stale', 'old-valid', 'newer', 'wrong-target', 'wrong-session',
  'wrong-defenders', 'wrong-adjustment', 'wrong-census', 'wrong-count', 'private-extra', 'error', 'pending', 'cache-only']) {
  test(`HTTP200 and exact replays cannot grant attendance when the current private projection is ${projection}`, async () => {
    const f = fixture({ projection });
    await assert.rejects(f.run(), /current-arrest-calculation-(?:source|projection|readiness)/);
    assertFiniteRead(f); assert.equal(f.counts.connectedSubscriptions, 0); assert.equal(f.counts.checkboxes.length, 0);
  });
}

const drift = {
  auth: f => { f.user.uid = 'foreign-auth'; },
  membership: f => { f.state.me.sessionId = 'foreign-membership'; },
  session: f => { f.state.session.id = 'foreign-session'; },
  instance: f => { f.state.gmInstance.id = 'foreign-instance'; },
  claim: f => { f.state.gmInstance.claimedAt = 'new-claim'; },
  generation: f => { f.state.me.connectionGeneration++; },
  hydration: f => { f.state.identityHydrationRevision++; },
  privateAudience: f => { f.state.roleBrief = { assignmentUid: 'foreign-auth' }; },
  connection: f => { f.state.connection = 'reconnecting'; },
  freshness: f => { f.state.sessionSnapshotFreshness = 'cache'; },
  phase: f => { f.state.session.phase = 'ended'; },
  cycle: f => { f.state.session.currentTurn++; },
  setup: f => { f.state.session.setupRevision++; },
  turnStage: f => { f.state.session.turnState.phase = 'open'; },
  foreignPending: f => { f.state.pendingCommands.push({ payload: { sessionId: 'foreign-session' } }); },
  demo: f => { f.state.session.fullGameDemo.progression = 'automatic'; },
};
for (const [name, change] of Object.entries(drift)) {
  test(`the accepted reloaded document cannot drift during calculation readiness: ${name}`, async () => {
    const f = fixture({ onFrame: change });
    await assert.rejects(f.run(), /original|Original|Never|changed|fresh|session|same|live|true|gm|manual|foreign/i);
    assertFiniteRead(f); assert.equal(f.counts.checkboxes.length, 0);
  });
}

for (const [name, change] of Object.entries(drift)) {
  test(`current calculation authority is checked again after checkbox selection: ${name}`, async () => {
    const f = fixture({ afterChecks: change });
    await assert.rejects(f.run(), /original|Original|Never|changed|fresh|session|same|live|true|gm|manual|foreign/i);
    assertFiniteRead(f); assert.equal(f.counts.attendanceClicks, 0);
  });
}

for (const [name, change] of Object.entries({
  census: f => { f.state.gmLoyaltyCensus.revision++; },
  target: f => { f.setSelectedTarget('unknown-target'); },
  defenders: f => { f.setDefenders('1'); },
  adjustment: f => { f.setAdjustment('1'); },
  count: f => { f.setResultText('2 players needed'); },
})) {
  test(`a mounted stale ${name} never satisfies the exact current calculation`, async () => {
    const f = fixture({ onFrame: change });
    await assert.rejects(f.run(), /current-arrest-calculation-(?:source|projection|readiness|mount|inputs|census)/);
    assertFiniteRead(f); assert.equal(f.counts.checkboxes.length, 0);
  });
}

test('an unchanged HTTP200 receipt cannot extend an already exhausted calculation-to-attendance deadline', async () => {
  const f = fixture({ afterReload: () => { /* No extra document mutation is needed to exhaust the native deadline. */ }, deadlineOffset: 1 });
  await assert.rejects(f.run(), /deadline.*exhausted|original.*deadline/i);
  assert.equal(f.counts.attendanceClicks, 0); assert.ok(f.counts.subscriptions <= 1);
});
