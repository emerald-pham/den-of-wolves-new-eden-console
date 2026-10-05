import assert from 'node:assert/strict';
import test from 'node:test';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';

// Native timing/authority counterexamples only; no browser, Auth or gameplay credit.
const moduleUnderTest = async () => {
  const module = await import('./pc10-combat-choice-readiness.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof module.waitForWolfChoiceReadiness, 'function', 'Expose the bounded current choice wait.');
  return module;
};
const actor = (change = {}) => ({ hasAuth: true, sameActor: true, sessionId: 'native-session',
  uidHash: 'native-executive', profileRoleId: 'executive-officer', assignedRoleId: 'executive-officer',
  activeConsoleRoleId: 'executive-officer', playerRole: 'player', phase: 'active', cycle: 1,
  connection: 'live', freshness: 'server', ...change });
const attack = (change = {}) => ({ sessionId: 'native-session', attackId: 'native-attack',
  turn: 1, revision: 4, status: 'declared', currentStep: 'targeting', ...change });
const choice = (change = {}) => ({ sessionId: 'native-session', attackId: 'native-attack',
  turn: 1, revision: 4, eligible: true, choiceStatus: 'pending', ...change });

function waitFixture({ paints = [{ status: 'eligible', reason: 'Current offered pass is enabled.' }],
  actorRead = () => actor(), attackRead = () => attack(), choiceRead = () => choice(), deadlineAt = 60_000 } = {}) {
  let time = 0, paintReads = 0, choiceReads = 0, attackReads = 0;
  return { counters: () => ({ time, paintReads, choiceReads, attackReads }), options: {
    original: actor(), expected: attack(), timeoutMs: 60_000, deadlineAt,
    now: () => time, wait: async () => { time += 200; },
    inspectActor: async () => actorRead(),
    inspectAttack: async () => { attackReads++; return attackRead(); },
    readChoice: async () => { choiceReads++; return choiceRead(); },
    inspectPaint: async () => paints[Math.min(paintReads++, paints.length - 1)],
  } };
}

test('delayed member/private read/control paint stays on one original actor until the current choice is offered', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  const f = waitFixture({ paints: [{ status: 'pending', reason: 'Panel not mounted.' },
    { status: 'pending', reason: 'Checking current authority.' },
    { status: 'pending', reason: 'Current pass still disabled.' },
    { status: 'eligible', reason: 'Current offered pass is enabled.' }] });
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'eligible'); assert.equal(result.expected.revision, 4);
  assert.deepEqual(f.counters(), { time: 600, paintReads: 4, choiceReads: 1, attackReads: 2 });
});

test('an eligible source with a disabled/busy paint is not recast as a legitimate unavailable choice', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  const f = waitFixture({ paints: [{ status: 'blocked', reason: 'disabled' }], deadlineAt: 600 });
  await assert.rejects(waitForWolfChoiceReadiness(f.options), /eligible.*blocked|explicit.*blocker/i);
  assert.equal(f.counters().choiceReads, 1);
});

test('a source-matched explicit blocker can finish the wait without crediting a missing control', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  const f = waitFixture({ choiceRead: () => choice({ eligible: false, reason: 'uncharged' }),
    paints: [{ status: 'pending', reason: 'Checking authority.' },
      { status: 'blocked', reason: 'uncharged', explicit: true }] });
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'blocked'); assert.equal(result.reason, 'uncharged');
  assert.equal(result.gameplayCredit, false); assert.equal(f.counters().time, 200);
});

test('paint cannot substitute a different source reason or source choice status', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  const f = waitFixture({ choiceRead: () => choice({ eligible: false, reason: 'uncharged' }),
    paints: [{ status: 'blocked', reason: 'damaged', explicit: true }] });
  await assert.rejects(waitForWolfChoiceReadiness(f.options), /source.*reason|blocker.*match/i);
});

test('a source and paint deadline cannot be renewed by delayed polls or an eight-minute outer stage', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  const f = waitFixture({ paints: [{ status: 'pending', reason: 'Still checking.' }], deadlineAt: 600 });
  await assert.rejects(waitForWolfChoiceReadiness(f.options), /deadline.*current|current.*deadline/i);
  assert.equal(f.counters().time, 600); assert.equal(f.counters().choiceReads, 1);
  const extended = waitFixture();
  await assert.rejects(waitForWolfChoiceReadiness({ ...extended.options, timeoutMs: 60_001 }), /60|budget/i);
  assert.equal(extended.counters().choiceReads, 0);
});

test('an awaited source reply finishing outside its original budget cannot qualify a painted choice', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  let time = 0, paints = 0;
  const f = waitFixture();
  await assert.rejects(waitForWolfChoiceReadiness({ ...f.options, deadlineAt: 400,
    now: () => time, readChoice: async () => { time = 401; return choice(); },
    inspectPaint: async () => { paints++; return { status: 'eligible' }; } }), /deadline/i);
  assert.equal(paints, 0);
});

test('original actor, private audience and active console changes fail before another read or choice', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  for (const changed of [{ uidHash: 'foreign' }, { playerRole: 'gm' }, { profileRoleId: 'admiral' },
    { activeConsoleRoleId: 'admiral' }, { assignedRoleId: 'admiral' }, { sessionId: 'foreign' },
    { hasAuth: false }, { sameActor: false }, { cycle: 2 }, { phase: 'debrief' }]) {
    const f = waitFixture({ actorRead: () => actor(changed) });
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.counters().choiceReads, 0);
  }
});

test('connection/cache readiness can wait read-only while the original identity remains bound', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  let count = 0;
  const f = waitFixture({ actorRead: () => actor(++count === 1 ? { connection: 'offline', freshness: 'cache' } : {}) });
  assert.equal((await waitForWolfChoiceReadiness(f.options)).status, 'eligible');
  assert.equal(f.counters().time, 200); assert.equal(f.counters().choiceReads, 1);
});

test('same UID demotion or original GM-instance replacement prevents private attack acceptance', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  const originalGm = actor({ uidHash: 'native-gm', profileRoleId: 'gm', assignedRoleId: null,
    activeConsoleRoleId: null, playerRole: 'gm', instanceId: 'original-instance', gmInstanceOwned: true });
  for (const changed of [{ playerRole: 'player' }, { instanceId: 'other-instance' }, { gmInstanceOwned: false }]) {
    const f = waitFixture();
    await assert.rejects(waitForWolfChoiceReadiness({ ...f.options, originalGm,
      inspectGm: async () => ({ ...originalGm, ...changed }) }));
    assert.equal(f.counters().attackReads, 0); assert.equal(f.counters().choiceReads, 0);
  }
});

test('an attack/revision/stage change after paint returns to source inspection without an available-choice result', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  for (const changed of [{ revision: 5 }, { attackId: 'different' }, { currentStep: 'long-range' }, { status: 'resolved' }]) {
    let reads = 0;
    const f = waitFixture({ attackRead: () => attack(++reads === 1 ? {} : changed) });
    const result = await waitForWolfChoiceReadiness(f.options);
    assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  }
});

test('wrong or stale actor-private reply cannot be accepted under a matching current GM attack', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  for (const changed of [{ revision: 3 }, { attackId: 'foreign' }, { sessionId: 'foreign' }, { turn: 2 }]) {
    const f = waitFixture({ choiceRead: () => choice(changed) });
    await assert.rejects(waitForWolfChoiceReadiness(f.options), /current|source|sessionId|revision|attackId|turn/i);
    assert.equal(f.counters().paintReads, 0);
  }
});

test('source-unavailable without a painted explicit blocker times out without silently passing the branch', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  const f = waitFixture({ choiceRead: () => choice({ eligible: false, reason: 'uncharged' }),
    paints: [{ status: 'pending', reason: 'Panel absent.' }], deadlineAt: 400 });
  await assert.rejects(waitForWolfChoiceReadiness(f.options), /deadline/i);
  assert.equal(f.counters().time, 400);
});

test('automatic source progress during a missing panel is resampled within the same deadline without another actor read', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  let reads = 0;
  const f = waitFixture({ deadlineAt: 2_000, paints: [{ status: 'pending', reason: 'No old-stage panel.' }],
    attackRead: () => attack(++reads === 1 ? {} : { revision: 5, currentStep: 'long-range' }) });
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  assert.equal(f.counters().choiceReads, 1); assert.ok(f.counters().time < 2_000);
});

test('same original UID moving group or hydration generation invalidates pending choice acceptance', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  for (const changed of [{ fleetGroupId: 'new-group' }, { connectionGeneration: 7 },
    { identityHydrationRevision: 12 }, { replacementRoleId: 'replacement' }]) {
    const original = actor({ fleetGroupId: 'original-group', connectionGeneration: 6, identityHydrationRevision: 11, replacementRoleId: null });
    const f = waitFixture({ actorRead: () => ({ ...original, ...changed }) });
    await assert.rejects(waitForWolfChoiceReadiness({ ...f.options, original }));
    assert.equal(f.counters().choiceReads, 0);
  }
});

function paintFixture({ text = '', visible = true, controls = {}, articleText = text } = {}) {
  function node(name, isArticle = false) {
    return {
      isVisible: async () => visible && (name in controls ? controls[name] !== null : true),
      isEnabled: async () => controls[name] === true,
      innerText: async () => isArticle ? articleText : text,
      getByRole: (kind, options) => node(options.name, kind === 'article'),
      locator: () => node('control'),
      first() { return this; },
    };
  }
  return { getByRole: (_kind, options) => node(options.name), locator: () => node('panel') };
}

test('the actual launch checking paint cannot establish an unavailable wing, even with a disabled launch button', async () => {
  const { inspectWolfChoicePaint } = await moduleUnderTest();
  assert.equal(typeof inspectWolfChoicePaint, 'function');
  const view = choice({ wingId: 'fighter-wing-alpha', launched: false });
  const pending = paintFixture({ text: 'Cycle 1 // flight control Checking launch authority…',
    controls: { 'Launch Fighter Wing Alpha': false, 'Pass Fighter Wing Alpha': null } });
  assert.equal((await inspectWolfChoicePaint(pending, { kind: 'aegis-launch', sourceId: view.wingId }, view)).status, 'pending');
  const ready = paintFixture({ text: 'Cycle 1 // flight control', controls: { 'Pass Fighter Wing Alpha': true } });
  assert.equal((await inspectWolfChoicePaint(ready, { kind: 'aegis-launch', sourceId: view.wingId }, view)).status, 'eligible');
});

test('an older rendered EO revision remains pending although its pass is visibly enabled', async () => {
  const { inspectWolfChoicePaint } = await moduleUnderTest();
  const stale = paintFixture({ text: 'Command and Control Cycle 1 // Rev 3', controls: { 'Pass Command and Control': true } });
  assert.equal((await inspectWolfChoicePaint(stale, { kind: 'command-and-control' }, choice())).status, 'pending');
  const current = paintFixture({ text: 'Command and Control Cycle 1 // Rev 4', controls: { 'Pass Command and Control': true } });
  assert.equal((await inspectWolfChoicePaint(current, { kind: 'command-and-control' }, choice())).status, 'eligible');
});

test('target-assignment readiness uses the actual assignments region and enabled selectors before an intended choice', async () => {
  const { inspectWolfChoicePaint } = await moduleUnderTest();
  const names = [];
  const panel = { isVisible: async () => true, innerText: async () => 'Cycle 1 // weapon control Target assignment',
    getByRole: (kind, options = {}) => {
      if (kind === 'button') return { isVisible: async () => options.name === 'Commit target assignments', isEnabled: async () => false };
      assert.equal(kind, 'combobox');
      return { count: async () => 1, first: () => ({ isEnabled: async () => true }) };
    } };
  const page = { getByRole: (_kind, options) => { names.push(options.name); return panel; } };
  const result = await inspectWolfChoicePaint(page, { kind: 'range-actions' }, choice({ choiceStatus: 'targets-required', range: 'long-range' }));
  assert.equal(result.status, 'eligible'); assert.deepEqual(names, ['Wolf range assignments']);
});

function routeFixture({ route = '#/brief', changed = {}, entering = true } = {}) {
  const calls = []; let path = route;
  const original = actor(changed);
  const widget = (name, target, visible = () => true) => ({
    isVisible: async () => visible(),
    waitFor: async () => { calls.push(`wait:${name}`); assert.ok(visible(), 'Normal visible navigation exists.'); },
    click: async () => { calls.push(`click:${name}`); path = target; },
    first() { return this; },
  });
  const page = {
    url: () => `http://127.0.0.1:5174/${path}`,
    goto: async url => { calls.push(`reload:${new URL(url).hash}`); path = new URL(url).hash; },
    waitForURL: async predicate => { assert.equal(predicate(new URL(page.url())), true); },
    getByRole: (_kind, { name }) => {
      if (name === "Enter this actor's stations") return widget(name, '#/console', () => path === '#/demo-actors');
      if (name === 'Back to stations') return widget(name, '#/console', () => path === '#/brief');
      if (name instanceof RegExp && name.test('Back to assigned console'))
        return widget('Back to assigned console', '#/ships/aegis/roles/executive-officer', () => path === '#/shuttles/highwall');
      if (name === 'Back to assigned console')
        return widget(name, '#/ships/aegis/roles/executive-officer', () => path === '#/shuttles/highwall');
      throw new Error(`Unexpected navigation control: ${String(name)}`);
    },
    locator: selector => {
      assert.equal(selector, 'a[href$="/roles/executive-officer"]');
      return widget('original role chooser', '#/ships/aegis/roles/executive-officer', () => path === '#/console');
    },
  };
  const crew = { page, observe: async () => ({ ...original }),
    until: async (_description, predicate) => { assert.ok(predicate(original)); return { ...original }; } };
  const gm = { observe: async () => ({ ...original, playerRole: 'gm' }) };
  const tools = createTwoBrowserGameplay({ gm, crew, initial: { sessionId: 'native-session', joinCode: 'NATIVE' },
    roster: [{ roleId: 'executive-officer', uidHash: 'native-executive' }], directory: '/tmp/native-unused' });
  return { select: () => tools.select('executive-officer', { enter: entering }), calls, path: () => path };
}

test('same original role on private brief enters its actual console through Back and the current chooser', async () => {
  const f = routeFixture(); await f.select();
  assert.equal(f.path(), '#/ships/aegis/roles/executive-officer');
  assert.deepEqual(f.calls.filter(value => value.startsWith('click:')), ['click:Back to stations', 'click:original role chooser']);
  assert.equal(f.calls.some(value => value.startsWith('reload:')), false);
});

test('same original role on a shuttle follows its actual assigned-console Back link without reloading Auth', async () => {
  const f = routeFixture({ route: '#/shuttles/highwall' }); await f.select();
  assert.equal(f.path(), '#/ships/aegis/roles/executive-officer');
  assert.deepEqual(f.calls.filter(value => value.startsWith('click:')), ['click:Back to assigned console']);
  assert.equal(f.calls.some(value => value.startsWith('reload:')), false);
});

test('enter:false deliberately preserves the original private route, and an already correct console does not navigate', async () => {
  for (const options of [{ entering: false }, { route: '#/ships/aegis/roles/executive-officer' }]) {
    const f = routeFixture(options), before = f.path(); await f.select();
    assert.equal(f.path(), before); assert.deepEqual(f.calls, []);
  }
});

test('same-role routing cannot navigate with a substituted original Auth account', async () => {
  const f = routeFixture({ changed: { uidHash: 'new-account' } });
  await assert.rejects(f.select(), /original|identity|account/i); assert.deepEqual(f.calls, []);
});

test('the fallback resolver waits for a delayed mounted Wing choice without cycling to EO or reloading that actor', async () => {
  const selections = [], clicks = [];
  let selectedRole, probeCount = 0, resolved = false;
  const current = () => attack({ status: resolved ? 'resolved' : 'declared', revision: resolved ? 5 : 4,
    currentStep: resolved ? 'resolved' : 'targeting' });
  const originalGm = actor({ uidHash: 'native-gm', profileRoleId: 'gm', assignedRoleId: null,
    activeConsoleRoleId: null, playerRole: 'gm', instanceId: 'native-instance', gmInstanceOwned: true });
  const crewActor = () => actor({ profileRoleId: selectedRole, assignedRoleId: selectedRole,
    activeConsoleRoleId: selectedRole, uidHash: `native-${selectedRole}` });
  const visible = name => selectedRole === 'wing-commander' &&
    (name === 'AEGIS fighter wing launches' || name === 'Fighter Wing Alpha' ||
      name === 'Launch Fighter Wing Alpha' || name === 'Pass Fighter Wing Alpha') && ++probeCount >= 3;
  const widget = name => ({
    isVisible: async () => visible(name), isEnabled: async () => true,
    innerText: async () => 'Cycle 1 // flight control',
    click: async () => { clicks.push(name); resolved = true; },
    getByRole: (_kind, options) => widget(options.name),
  });
  const page = { getByRole: (_kind, options) => widget(options.name), waitForResponse: async () => ({
    request: () => ({ postDataJSON: () => ({ data: { sessionId: 'native-session', requestId: 'native-request',
      expectedTurn: 1, expectedRevision: 4 } }) }),
  }) };
  const gm = { page, observe: async () => originalGm };
  const crew = { page, observe: async () => crewActor(), callable: async endpoint => {
    assert.equal(endpoint, 'getAegisFighterWingLaunch');
    return { status: 'committed', result: choice({ wingId: 'fighter-wing-alpha', launched: false }) };
  } };
  const context = { gm, crew, initial: { sessionId: 'native-session' },
    started: { uidHash: 'native-gm', instanceId: 'native-instance' },
    roster: ['wing-commander', 'executive-officer'].map(roleId => ({ roleId, uidHash: `native-${roleId}` })) };
  const tools = { read: async () => current(), state: async () => ({ phase: 'active', cycle: 1 }), record: async () => {},
    select: async role => { selectedRole = role; selections.push(role); return role === 'gm' ? gm : crew; },
    receipt: async (_surface, _endpoint, choose) => { await choose(); return { status: 'committed' }; } };
  const result = await resolveLiveWolfAttack(context, { tools, verifyReplay: false, timeoutMs: 5_000 });
  assert.equal(result.status, 'resolved'); assert.deepEqual(clicks, ['Launch Fighter Wing Alpha']);
  assert.deepEqual(selections, ['wing-commander'], 'Missing lazy paint must not visit EO or reload the same Wing account.');
});
