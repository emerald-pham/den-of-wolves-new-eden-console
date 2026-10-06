import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createContext, Script, SyntheticModule } from 'node:vm';
import test from 'node:test';
import { createArrestPosseCallbacks, resolveSimulatedAttendanceActors } from './pc10-arrest-posse-proof.mjs';

const SESSION_ID = 'arrest-current-source-session';
const GM_UID = 'original-authenticated-gm';
const ROLE_IDS = ['admiral', 'executive-officer', 'wing-commander', 'dione-captain', 'dione-engineer',
  'dione-president', 'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist', 'quellon-captain',
  'quellon-engineer', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer',
  'refinery-124-pdf-colonel'];
const TARGET_ROLE = 'dione-president';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const plain = value => JSON.parse(JSON.stringify(value));

function fixture({ initial = 'pending', subsequent = 'ready', deadlineAt = Date.now() + 35_000,
  onPoll = () => {}, afterSelection = () => {}, currentCensus = false } = {}) {
  const roster = [...ROLE_IDS, 'press-officer'].map(roleId => ({ sessionId: SESSION_ID, roleId,
    uid: `original-${roleId}-uid`, displayName: `DEMO // ${roleId}` }));
  const target = roster.find(actor => actor.roleId === TARGET_ROLE);
  const controller = { sessionId: SESSION_ID, memberSessionId: SESSION_ID, profileRoleId: 'controller',
    uid: 'original-ordinary-controller', accountUid: 'original-ordinary-controller',
    currentUid: 'original-ordinary-controller', displayName: 'DEMO // controller', role: 'player',
    sameActor: true, connection: 'live', freshness: 'server', connected: true,
    seatId: null, assignedRoleId: null, activeConsoleRoleId: null,
    replacementRoleId: null, replacementStatus: null };
  const choice = { targetRoleId: TARGET_ROLE, defenders: 0, adjustment: 'none',
    presentRoleIds: ROLE_IDS.filter(roleId => roleId !== TARGET_ROLE), attendanceEvidence: 'simulated-demo' };
  const state = { session: { id: SESSION_ID, currentTurn: 1, phase: 'active', setupRevision: 38,
    turnState: { phase: 'team' }, turnPhase: { progression: 'manual', airspace: { state: 'restricted' } },
    fullGameDemo: { status: 'active', progression: 'manual' } },
  me: { uid: GM_UID, sessionId: SESSION_ID, role: 'gm', connectionGeneration: 4, connected: true },
  gmInstance: { id: 'original-instance', uid: GM_UID, sessionId: SESSION_ID,
    claimedAt: '2026-10-06T00:10:00.000Z' },
  connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 2,
  privateLoyalty: null, roleBrief: null, gmAccessAuthenticatedAt: 1, pendingCommands: [],
  gmLoyaltyCensus: null, gmLoyaltyCensusStatus: 'loading' };
  const user = { uid: GM_UID };
  const counts = { crewReads: 0, gmEvaluations: 0, serializedCallbacks: 0, sourcePolls: 0,
    selections: [], waits: [], fields: [], gameplayCalls: 0, reloads: 0 };
  let selectedValue = '', visibleOptions = [], disabled = true, labelText = 'Target player';
  const entries = () => roster.map(actor => ({ uid: actor.uid, kind: 'fleet-loyalist', suspicion: 0 }));
  function paint(kind) {
    state.gmLoyaltyCensusStatus = 'present';
    state.gmLoyaltyCensus = { revision: kind === 'pending' ? 37 : 38, entries: entries() };
    if (kind === 'loading') { state.gmLoyaltyCensusStatus = 'loading'; state.gmLoyaltyCensus = null; }
    if (kind === 'absent') state.gmLoyaltyCensus.entries = entries().filter(entry => entry.uid !== target.uid);
    if (kind === 'ineligible') state.gmLoyaltyCensus.entries.find(entry => entry.uid === target.uid).suspicion = null;
    if (kind === 'error') { state.gmLoyaltyCensusStatus = 'error'; state.gmLoyaltyCensus = null; }
    visibleOptions = ['pending', 'loading'].includes(kind) ? [] : state.gmLoyaltyCensus?.entries
      .filter(entry => Number.isSafeInteger(entry.suspicion) && entry.suspicion >= 0)
      .map(entry => ({ value: entry.uid, textContent: `${roster.find(actor => actor.uid === entry.uid).displayName} (${entry.uid})`,
        label: `${roster.find(actor => actor.uid === entry.uid).displayName} (${entry.uid})`, disabled: false })) ?? [];
    if (kind === 'dom-pending') visibleOptions = visibleOptions.filter(option => option.value !== target.uid);
    if (kind === 'wrong-value') visibleOptions.find(option => option.value === target.uid).value = TARGET_ROLE;
    if (kind === 'wrong-label') labelText = 'Arrest target';
    if (kind === 'duplicate') visibleOptions.push({ ...visibleOptions.find(option => option.value === target.uid) });
    disabled = visibleOptions.length === 0;
    selectedValue ||= visibleOptions[0]?.value ?? '';
  }
  paint(initial);
  if (currentCensus) state.gmLoyaltyCensus.revision = 38;
  const selectElement = {
    get value() { return selectedValue; }, get disabled() { return disabled; },
    get options() { return visibleOptions; }, get labels() { return [{
      textContent: `${labelText} ${visibleOptions.map(option => option.textContent).join(' ')}`,
      childNodes: [{ nodeType: 3, textContent: `\n ${labelText}\n ` },
        { nodeType: 1, textContent: visibleOptions.map(option => option.textContent).join(' ') }],
    }]; },
  };
  const panelElement = { querySelectorAll(selector) {
    assert.equal(selector, '#arrest-posse-target'); return [selectElement];
  } };
  const document = { querySelectorAll(selector) {
    if (selector === '[aria-label="Arrest posse calculator"]') return [panelElement];
    assert.fail(`Unexpected document query: ${selector}`);
  }, querySelector: () => null };
  async function runBrowserCallback(callback, input, browser) {
    counts.serializedCallbacks++;
    const realm = createContext({ input, crypto: webcrypto, TextEncoder, document, Node: { TEXT_NODE: 3 } });
    assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(realm),
      'undefined,undefined,undefined');
    const exportsByModule = new Map([
      ['/src/lib/firebase.ts', { auth: () => ({ currentUser: user }) }],
      ['/src/store/useSessionStore.ts', { useSessionStore: { getState: () => state } }],
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: null }],
      ['/src/lib/demoActorProfiles.ts', { readDemoActorRoster: sid => {
        assert.equal(sid, SESSION_ID); assert.equal(browser, 'crew', 'GM-local roster is intentionally empty.');
        counts.crewReads++; return roster;
      } }],
      ['/src/lib/demoActorDisplayName.ts', { demoActorDisplayName: roleId => roster.find(actor => actor.roleId === roleId)?.displayName }],
    ]);
    const modules = new Map();
    for (const [name, exports] of exportsByModule) {
      const module = new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context: realm });
      await module.link(() => assert.fail('Fixture source modules have no imports.'));
      await module.evaluate(); modules.set(name, module);
    }
    return new Script(`(${callback.toString()})(input)`, { importModuleDynamically: async name => {
      assert.ok(modules.has(name), `Only mounted-source modules may be read: ${name}`); return modules.get(name);
    } }).runInContext(realm);
  }
  const targetSelect = {
    locator: selector => {
      assert.equal(selector, 'option');
      return { evaluateAll: async callback => callback(visibleOptions) };
    },
    selectOption: async (uid, options) => {
      counts.selections.push({ uid, timeout: options?.timeout });
      assert.equal(uid, target.uid, 'Never select a label/role alias or another current account.');
      selectedValue = uid; afterSelection({ state, user, target, paint, counts });
    },
    inputValue: async () => selectedValue,
  };
  const panel = { isVisible: async () => true,
    locator: sourceId => {
      assert.ok(['#arrest-posse-target', '#arrest-posse-adjustment'].includes(sourceId));
      return { sourceId };
    },
    getByLabel: label => {
      if (label === 'Target player') return targetSelect;
      if (label === 'Defenders') return { fill: async value => { counts.fields.push([label, value]); } };
      if (label === 'Optional adjustment') return { selectOption: async value => { counts.fields.push([label, value]); } };
      assert.fail(`Unexpected accessible control: ${label}`);
    },
    getByText: () => ({ isVisible: async () => false }),
    getByRole: (role, options) => {
      if (role === 'combobox') {
        assert.equal(options.exact, true);
        assert.ok(['Target player', 'Optional adjustment'].includes(options.name));
        return { and: locator => {
          const sourceId = options.name === 'Target player' ? '#arrest-posse-target' : '#arrest-posse-adjustment';
          assert.equal(locator.sourceId, sourceId, 'The exact accessible control must also match its source ID.');
          return options.name === 'Target player' ? targetSelect : {
            selectOption: async value => { counts.fields.push(['Optional adjustment', value]); },
          };
        } };
      }
      assert.equal(role, 'button'); assert.equal(options.name, 'Calculate required players');
      return { isEnabled: async () => false, click: async () => { counts.gameplayCalls++; assert.fail('Native regression never mutates gameplay.'); } };
    },
  };
  const observe = async () => ({ hasAuth: true, sameActor: true, uidHash: hash(user.uid), sessionId: state.session.id,
    instanceId: state.gmInstance?.id, gmInstanceOwned: state.gmInstance?.uid === user.uid,
    playerRole: state.me.role, cycle: state.session.currentTurn, phase: state.session.phase,
    turnStatePhase: state.session.turnState.phase, connection: state.connection, freshness: state.sessionSnapshotFreshness,
    fullGameDemo: state.session.fullGameDemo, setupRevision: state.session.setupRevision });
  const gm = { observe, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async () => { counts.gameplayCalls++; assert.fail('No native SDK gameplay requests.'); }, page: {
      evaluate: async (callback, input) => { counts.gmEvaluations++; return runBrowserCallback(callback, input, 'gm'); },
      waitForFunction: async (callback, input, options) => {
        counts.waits.push(options.timeout);
        assert.equal(options.polling, 'raf', 'Source/DOM delivery is observed without an arbitrary stabilization sleep.');
        for (let poll = 0; poll < 3; poll++) {
          counts.sourcePolls++;
          if (poll === 1) paint(subsequent);
          onPoll({ poll, state, user, target, paint, counts });
          const value = await runBrowserCallback(callback, input, 'gm');
          if (value) return { jsonValue: async () => plain(value), dispose: async () => {} };
        }
        throw Object.assign(new Error('Original target source deadline expired.'), { name: 'TimeoutError' });
      },
      getByRole: (role, options) => {
        assert.equal(role, 'region'); assert.equal(options.name, 'Arrest posse calculator'); return panel;
      },
      reload: async () => { counts.reloads++; assert.fail('Pending target readiness never reloads.'); },
    } };
  const context = { initial: { sessionId: SESSION_ID }, started: null, gm,
    crew: { page: { evaluate: (callback, input) => runBrowserCallback(callback, input, 'crew') } }, deadlineAt };
  const run = async ({ required = false } = {}) => {
    context.started = await observe();
    return createArrestPosseCallbacks({ posse: choice,
      ...(required ? { requiredBranches: ['arrest-posse-calculation'] } : {}) }).onStarted(context);
  };
  return { context, state, user, roster, target, controller, choice, counts, paint, run };
}

test('the public onStarted factory observes the actual serialized pending source, then selects the original UID within the existing deadline', async () => {
  const f = fixture();
  await assert.rejects(f.run({ required: true }), /source-calculation-disabled-by-live-census-or-authority/);
  assert.equal(f.counts.selections.length, 1, 'A pending old census must not become permanent target absence.');
  assert.equal(f.counts.selections[0].uid, f.target.uid);
  assert.equal(f.counts.sourcePolls, 2);
  assert.equal(f.counts.waits.length, 1);
  assert.ok(f.counts.waits[0] > 0 && f.counts.waits[0] <= 35_000);
  assert.ok(f.counts.selections[0].timeout > 0 && f.counts.selections[0].timeout <= f.counts.waits[0]);
  assert.deepEqual(f.counts.fields, [['Defenders', '0'], ['Optional adjustment', 'none']]);
  assert.equal(f.counts.gameplayCalls, 0); assert.equal(f.counts.reloads, 0);
});

test('a current exact mounted target preserves the immediate path and reads original Crew identities', async () => {
  const f = fixture({ initial: 'ready' });
  const result = await f.run();
  assert.equal(result.accepted, false);
  assert.deepEqual(result.blockerCodes, ['source-calculation-disabled-by-live-census-or-authority']);
  assert.equal(f.counts.selections[0].uid, f.target.uid);
  assert.equal(f.counts.crewReads, 2); assert.deepEqual(f.counts.waits, []);
});

for (const initial of ['loading', 'dom-pending']) {
  test(`${initial} target source may finish inside the same original deadline`, async () => {
    const f = fixture({ initial });
    const result = await f.run();
    assert.equal(result.accepted, false); assert.equal(f.counts.selections[0].uid, f.target.uid);
    assert.equal(f.counts.waits.length, 1); assert.equal(f.counts.gameplayCalls, 0);
  });
}

for (const initial of ['absent', 'ineligible', 'error', 'wrong-value', 'wrong-label', 'duplicate']) {
  test(`current ${initial} target remains explicitly blocked and uncredited without aliases or a new wait`, async () => {
    const f = fixture({ initial });
    const result = await f.run();
    assert.equal(result.accepted, false); assert.equal(result.status, 'blocked');
    assert.ok(result.blockerCodes.length > 0); assert.deepEqual(f.counts.selections, []);
    assert.deepEqual(f.counts.waits, []); assert.equal(f.counts.gameplayCalls, 0);
  });
}

test('a persistently pending original source spends only its original remaining budget and stays uncredited', async () => {
  const f = fixture({ initial: 'pending', subsequent: 'pending', deadlineAt: Date.now() + 500 });
  const result = await f.run();
  assert.equal(result.accepted, false); assert.ok(result.blockerCodes.some(code => /deadline|current.*census/.test(code)));
  assert.equal(f.counts.waits.length, 1); assert.ok(f.counts.waits[0] > 0 && f.counts.waits[0] <= 500);
  assert.deepEqual(f.counts.selections, []); assert.equal(f.counts.reloads, 0);
});

test('an already exhausted operation cannot acquire a replacement deadline or inspect a target', async () => {
  const f = fixture({ deadlineAt: Date.now() - 1 });
  const result = await f.run();
  assert.equal(result.accepted, false); assert.deepEqual(f.counts.waits, []);
  assert.equal(f.counts.gmEvaluations, 0); assert.deepEqual(f.counts.selections, []);
});

const changed = {
  uid: f => { f.user.uid = 'replacement-auth-account'; },
  session: f => { f.state.session.id = 'another-session'; },
  role: f => { f.state.me.role = 'player'; },
  instance: f => { f.state.gmInstance.id = 'replacement-instance'; },
  claimedAt: f => { f.state.gmInstance.claimedAt = 'new-claim'; },
  generation: f => { f.state.me.connectionGeneration++; },
  hydration: f => { f.state.identityHydrationRevision++; },
  connection: f => { f.state.connection = 'offline'; },
  freshness: f => { f.state.sessionSnapshotFreshness = 'cache'; },
  audience: f => { f.state.roleBrief = { assignmentUid: 'foreign-private-audience' }; },
  foreignPending: f => { f.state.pendingCommands.push({ payload: { sessionId: 'foreign-session' } }); },
  cycle: f => { f.state.session.currentTurn++; },
  phase: f => { f.state.session.phase = 'debrief'; },
};
for (const [name, change] of Object.entries(changed)) {
  test(`the pending source rejects original ${name} changing during delivery before any target action`, async () => {
    const f = fixture({ onPoll: value => { if (value.poll === 1) change(value); } });
    await assert.rejects(f.run());
    assert.deepEqual(f.counts.selections, []); assert.equal(f.counts.gameplayCalls, 0);
  });
  test(`the selected target rechecks original ${name} after control selection before any arrest request`, async () => {
    const f = fixture({ initial: 'ready', afterSelection: change });
    await assert.rejects(f.run());
    assert.equal(f.counts.selections.length, 1); assert.equal(f.counts.gameplayCalls, 0);
    assert.deepEqual(f.counts.fields, []);
  });
}

test('target/census identity changing after selection cannot acquire arrest credit', async () => {
  for (const afterSelection of [f => f.paint('absent'), f => { f.state.gmLoyaltyCensus.revision++; },
    f => f.paint('wrong-value')]) {
    const f = fixture({ initial: 'ready', afterSelection });
    const result = await f.run();
    assert.equal(result.accepted, false); assert.equal(f.counts.gameplayCalls, 0); assert.deepEqual(f.counts.fields, []);
  }
});

test('the exact census mapping preserves all 17 selected cores and keeps original Press/controller/target/GM excluded', () => {
  const f = fixture({ initial: 'ready' });
  const currentPlayers = [...f.roster.map(actor => ({ ...actor, role: 'player', connected: true,
    assignedRoleId: actor.roleId === 'press-officer' ? null : actor.roleId,
    replacementRoleId: null, replacementStatus: null })), f.controller,
  { sessionId: SESSION_ID, uid: GM_UID, displayName: 'Original GM', role: 'gm', connected: true }];
  const visibleLabels = currentPlayers.filter(actor => actor.role === 'player' && actor.uid !== f.target.uid)
    .map(actor => actor.displayName);
  const mapped = resolveSimulatedAttendanceActors({ sessionId: SESSION_ID, roster: f.roster, currentPlayers,
    visibleLabels, controller: f.controller, choice: f.choice, targetUid: f.target.uid });
  assert.equal(mapped.presentPlayerUids.length, 17);
  for (const uid of [f.target.uid, GM_UID, f.controller.uid, f.roster.find(actor => actor.roleId === 'press-officer').uid])
    assert.equal(mapped.presentPlayerUids.includes(uid), false);
  assert.deepEqual(mapped.presentPlayerUids, f.choice.presentRoleIds.map(roleId => f.roster.find(actor => actor.roleId === roleId).uid));
});
