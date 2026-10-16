import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { createContext, Script, SyntheticModule } from 'node:vm';
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

// Attempt 5: declaration/GM listener revision 1 preceded the ordinary
// Wing read at revision 2. A newer reply is never an accepted choice.
function newerSourceFixture({ sourceChange = {}, actorChange = {}, gmChange = {}, late = false } = {}) {
  const f = waitFixture({ choiceRead: () => choice({ revision: 5 }) });
  const originalGm = actor({ uidHash: 'native-gm', profileRoleId: 'gm', playerRole: 'gm',
    assignedRoleId: null, activeConsoleRoleId: null, instanceId: 'original-instance', gmInstanceOwned: true });
  let reinspected = false, time = 0;
  const reads = [];
  return { f, reads, options: { ...f.options, originalGm,
    now: () => time,
    inspectActor: async () => actor(reinspected ? actorChange : {}),
    inspectGm: async () => ({ ...originalGm, ...(reinspected ? gmChange : {}) }),
    inspectAttack: async options => {
      reads.push(options);
      if (!options?.serverOnly) return attack();
      reinspected = true;
      if (late) time = 60_000;
      return attack({ type: 'wolf-attack-state', revision: 5, airspaceLocked: true, ...sourceChange });
    },
  } };
}

test('a newer original actor reply retires the obsolete choice only after one independent server source reinspection', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  const f = newerSourceFixture();
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'source-changed');
  assert.deepEqual(result.expected, attack(), 'Do not replace the original expected tuple with the private reply.');
  assert.equal(result.gameplayCredit, false);
  assert.equal(result.choice, undefined);
  assert.equal(f.f.counters().paintReads, 0);
  assert.equal(f.f.counters().choiceReads, 1);
  assert.equal(f.reads.filter(value => value?.serverOnly === true).length, 1);
  const reinspection = f.reads.find(value => value?.serverOnly === true);
  assert.equal(reinspection.singleDocument, true, 'Newer-choice progress uses the single-fetch adapter mode.');
  assert.deepEqual(reinspection.expectedAuthorityAtRead, {
    actor: { sameAccount: true, sameRole: true, sameSession: true, sameTurn: true, liveServer: true },
    gm: { sameAccount: true, sameInstance: true, sameSession: true, sameTurn: true, liveServer: true },
  }, 'The exact authority checks preceding the read must also accompany its diagnostic outcome.');
});

test('newer private replies cannot retire a choice on unproved, foreign, regressed, malformed or late source data', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  for (const sourceChange of [{ revision: 4 }, { revision: 3 }, { revision: undefined },
    { attackId: 'foreign' }, { sessionId: 'foreign' }, { turn: 2 }, { type: 'foreign' },
    { status: 'due' }, { currentStep: 'unknown' }, { airspaceLocked: false }]) {
    const f = newerSourceFixture({ sourceChange });
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.f.counters().paintReads, 0);
  }
  const late = newerSourceFixture({ late: true });
  await assert.rejects(waitForWolfChoiceReadiness(late.options), /deadline/);
});

test('newer-source reinspection preserves original actor audience, GM lease and live freshness after the read', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  for (const actorChange of [{ uidHash: 'foreign' }, { fleetGroupId: 'foreign' }, { cycle: 2 },
    { activeConsoleRoleId: 'admiral' }, { identityHydrationRevision: 8 }, { freshness: 'cache' }]) {
    const f = newerSourceFixture({ actorChange });
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.f.counters().paintReads, 0);
  }
  for (const gmChange of [{ uidHash: 'foreign' }, { instanceId: 'foreign' },
    { gmInstanceOwned: false }, { playerRole: 'player' }, { freshness: 'cache' }]) {
    const f = newerSourceFixture({ gmChange });
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.f.counters().paintReads, 0);
  }
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

test('a normal actor-private reply without its cycle/revision cannot stand in for the actual current source', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  for (const field of ['turn', 'revision']) {
    const reply = choice(); delete reply[field];
    const f = waitFixture({ choiceRead: () => reply });
    await assert.rejects(waitForWolfChoiceReadiness(f.options), /current|source|turn|revision/i);
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

test('the actual no-target boarding envelope waits for its printed current-ship blocker without inventing source fields', async () => {
  const { inspectWolfChoicePaint, waitForWolfChoiceReadiness } = await moduleUnderTest();
  const reply = { type: 'wolf-boarding-defence-choice-unavailable', sessionId: 'native-session', reason: 'not-your-choice' };
  const current = attack({ currentStep: 'boarding' });
  const f = waitFixture({ attackRead: () => current, choiceRead: () => reply, deadlineAt: 600 });
  const names = []; let paintReads = 0;
  const originalGm = actor({ uidHash: 'native-gm', profileRoleId: 'gm', assignedRoleId: null,
    activeConsoleRoleId: null, playerRole: 'gm', instanceId: 'original-instance', gmInstanceOwned: true });
  const result = await waitForWolfChoiceReadiness({ ...f.options, expected: current, originalGm,
    inspectGm: async () => originalGm, inspectPaint: async view => {
      assert.deepEqual(view, reply);
      const page = paintFixture({ text: ++paintReads === 1 ? 'Checking the current server boarding choice…'
        : 'Cycle // boarding Waiting for this ship’s choice This ship’s defence choice is not open yet. It will remain pending for the current assigned crew when its stage begins.' });
      const get = page.getByRole;
      page.getByRole = (kind, options) => {
        assert.equal(kind, 'region'); assert.equal(options.name, 'Boarding defence'); assert.equal(options.exact, true);
        names.push(options.name); return get(kind, options);
      };
      return inspectWolfChoicePaint(page, { kind: 'boarding-defence' }, view);
    } });
  assert.equal(result.status, 'blocked'); assert.equal(result.reason, 'not-your-choice');
  assert.equal(result.explicit, true); assert.equal(result.gameplayCredit, false);
  assert.deepEqual(result.choice, reply);
  assert.deepEqual(Object.keys(result.choice).sort(), ['reason', 'sessionId', 'type']);
  assert.deepEqual(names, ['Boarding defence', 'Boarding defence']);
  assert.equal(paintReads, 2); assert.equal(f.counters().time, 200);
  assert.equal(f.counters().choiceReads, 1); assert.equal(f.counters().attackReads, 2);
});

test('an unknown boarding reason, missing generic panel or foreign ship panel cannot satisfy the actual waiting blocker', async () => {
  const { inspectWolfChoicePaint, waitForWolfChoiceReadiness } = await moduleUnderTest();
  const reply = { type: 'wolf-boarding-defence-choice-unavailable', sessionId: 'native-session', reason: 'not-your-choice' };
  const waiting = 'This ship’s defence choice is not open yet. It will remain pending for the current assigned crew when its stage begins.';
  for (const reason of ['not-your-ship', 'unknown-source-reason']) {
    assert.equal((await inspectWolfChoicePaint(paintFixture({ text: waiting }), { kind: 'boarding-defence' }, { ...reply, reason })).status, 'pending');
  }
  const normalShipOnly = { getByRole: (kind, options) => {
    assert.equal(kind, 'region');
    return { isVisible: async () => options.name === 'AEGIS boarding defence', innerText: async () => waiting };
  } };
  for (const page of [paintFixture({ text: waiting, visible: false }), normalShipOnly]) {
    const f = waitFixture({ attackRead: () => attack({ currentStep: 'boarding' }), choiceRead: () => reply, deadlineAt: 400 });
    await assert.rejects(waitForWolfChoiceReadiness({ ...f.options, expected: attack({ currentStep: 'boarding' }),
      inspectPaint: view => inspectWolfChoicePaint(page, { kind: 'boarding-defence' }, view) }), /deadline/);
    assert.equal(f.counters().time, 400); assert.equal(f.counters().choiceReads, 1);
  }
});

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

test('a printed old EO blocker cannot qualify the same blocker for the current source revision', async () => {
  const { inspectWolfChoicePaint } = await moduleUnderTest();
  const view = choice({ eligible: false, reason: 'uncharged' });
  const stale = paintFixture({ text: 'Command and Control Cycle 1 // Rev 3 Unavailable // charge Command and Control for this cycle.' });
  assert.equal((await inspectWolfChoicePaint(stale, { kind: 'command-and-control' }, view)).status, 'pending');
  const current = paintFixture({ text: 'Command and Control Cycle 1 // Rev 4 Unavailable // charge Command and Control for this cycle.' });
  assert.equal((await inspectWolfChoicePaint(current, { kind: 'command-and-control' }, view)).status, 'blocked');
});

test('the current manual phase and airspace cannot change while an original actor choice waits', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  for (const changed of [{ airspace: 'lifted' }, { turnStatePhase: 'team' }, { phaseProgression: 'automatic' }]) {
    const original = actor({ airspace: 'restricted', turnStatePhase: 'coordination', phaseProgression: 'manual' });
    const f = waitFixture({ actorRead: () => ({ ...original, ...changed }) });
    await assert.rejects(waitForWolfChoiceReadiness({ ...f.options, original }));
    assert.equal(f.counters().choiceReads, 0);
  }
});

test('target-assignment readiness uses the actual range-actions region and enabled selectors before an intended choice', async () => {
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
  assert.equal(result.status, 'eligible'); assert.deepEqual(names, ['Wolf range actions']);
});

test('actual terminal launch receipts paint as explicit blockers after a previous wing launched once', async () => {
  const { inspectWolfChoicePaint, wolfChoiceSourceReason } = await moduleUnderTest();
  for (const [kind, text] of [['aegis-launch', 'Cycle 1 // flight control Fighter Wing Alpha is launched for this attack.'],
    ['maliades-launch', 'Maliades launched // Cycle 1'], ['pdf-launch', 'Launched // Cycle 1']]) {
    const view = choice({ wingId: 'fighter-wing-alpha', eligible: false, launched: true,
      choiceStatus: 'launched', reason: 'already-launched' });
    assert.equal(wolfChoiceSourceReason(view), 'already-launched');
    assert.equal((await inspectWolfChoicePaint(paintFixture({ text }), { kind, sourceId: view.wingId }, view)).status, 'blocked');
  }
});

test('Maliades source nonlaunch/destruction and a committed EO range retain their actual blocker controls', async () => {
  const { inspectWolfChoicePaint } = await moduleUnderTest();
  const maliades = choice({ range: 'short-range', launched: false });
  const nonlaunch = paintFixture({ text: 'Cycle 1 // Dione craft Launch Maliades before choosing range actions.' });
  assert.equal((await inspectWolfChoicePaint(nonlaunch, { kind: 'escort-range', sourceId: 'maliades' }, maliades)).status, 'blocked');
  const destroyed = paintFixture({ text: 'Cycle 1 // Dione craft Maliades is destroyed and cannot act.' });
  assert.equal((await inspectWolfChoicePaint(destroyed, { kind: 'escort-range', sourceId: 'maliades' }, { ...maliades, launched: true, destroyed: true })).status, 'blocked');
  const names = [], page = paintFixture({ text: 'Cycle 1 // weapon control This range decision is committed. The next attack step is server controlled.' });
  const get = page.getByRole; page.getByRole = (role, options) => { names.push(options.name); return get(role, options); };
  assert.equal((await inspectWolfChoicePaint(page, { kind: 'range-actions' }, choice({ range: 'medium-range', choiceStatus: 'committed' }))).status, 'blocked');
  assert.deepEqual(names, ['Wolf range assignments']);
});

test('a mounted Commander presenter uses its actual Targeting dice name after the loading region disappears', async () => {
  const { inspectWolfChoicePaint } = await moduleUnderTest();
  const names = [], page = paintFixture({ text: 'Private Wolf action Cycle 1 // Rev 4', controls: { 'Finish rerolls': true } });
  const get = page.getByRole; page.getByRole = (role, options) => { names.push(options.name); return get(role, options); };
  assert.equal((await inspectWolfChoicePaint(page, { kind: 'commander-targeting' }, choice({ type: 'wolf-commander-targeting-view' }))).status, 'eligible');
  assert.deepEqual(names, ['Targeting dice']);
});

test('Bravo cannot proceed while the same actor still paints the pre-Alpha launch state', async () => {
  const { inspectWolfChoicePaint } = await moduleUnderTest();
  let alphaText = 'Launch Fighter Wing Alpha Pass Fighter Wing Alpha';
  const buttons = { isVisible: async () => true, isEnabled: async () => true };
  const panel = { isVisible: async () => true, innerText: async () => 'Cycle 1 // flight control',
    getByRole: (role, options) => role === 'article' ? {
      innerText: async () => options.name === 'Fighter Wing Alpha' ? alphaText : 'Launch Fighter Wing Bravo Pass Fighter Wing Bravo',
      getByRole: () => buttons,
    } : buttons };
  const page = { getByRole: () => panel };
  const spec = { kind: 'aegis-launch', sourceId: 'fighter-wing-bravo', settledLaunchChoices: [{ sourceId: 'fighter-wing-alpha', status: 'launched' }] };
  assert.equal((await inspectWolfChoicePaint(page, spec, choice())).status, 'pending');
  alphaText = 'Fighter Wing Alpha is launched for this attack.';
  assert.equal((await inspectWolfChoicePaint(page, spec, choice())).status, 'eligible');
});

function routeFixture({ route = '#/brief', changed = {}, entering = true } = {}) {
  const calls = [], navigationTimeouts = []; let path = route;
  const admittedUid = 'native-original-route-account';
  const admittedUidHash = createHash('sha256').update(admittedUid).digest('hex').slice(0, 16);
  const original = actor({ uidHash: admittedUidHash, connectionGeneration: 1, identityHydrationRevision: 1, ...changed });
  const widget = (name, target, visible = () => true) => ({
    isVisible: async () => visible(),
    waitFor: async options => { calls.push(`wait:${name}`); navigationTimeouts.push(options?.timeout); assert.ok(visible(), 'Normal visible navigation exists.'); },
    click: async () => { calls.push(`click:${name}`); path = target; },
    first() { return this; },
  });
  const page = {
    evaluate: async (callback, moduleUrl) => {
      assert.equal(moduleUrl, '/native-route-store');
      const uid = original.uidHash === admittedUidHash ? admittedUid : 'native-substituted-route-account';
      const snapshot = { session: { id: original.sessionId },
        me: { uid, sessionId: original.sessionId, role: original.playerRole,
          assignedRoleId: original.assignedRoleId, activeConsoleRoleId: original.activeConsoleRoleId,
          seatId: original.activeConsoleRoleId,
          connectionGeneration: original.connectionGeneration, fleetGroupId: 'native-fleet', connected: true },
        identityHydrationRevision: original.identityHydrationRevision,
        connection: original.connection, sessionSnapshotFreshness: original.freshness };
      const browser = createContext({ moduleUrl, crypto: webcrypto, TextEncoder, performance: { timeOrigin: 1 } });
      const definitions = [
        ['/native-route-store', { useSessionStore: { getState: () => snapshot } }],
        ['/src/lib/firebase.ts', { auth: () => ({ currentUser: { uid } }) }],
        ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: { roleId: original.profileRoleId, sessionId: original.sessionId } }],
      ];
      const modules = new Map();
      for (const [name, exports] of definitions) {
        const module = new SyntheticModule(Object.keys(exports), function () {
          for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context: browser });
        await module.link(() => assert.fail('No fixture imports.')); await module.evaluate(); modules.set(name, module);
      }
      return new Script(`(${callback.toString()})(moduleUrl)`, {
        importModuleDynamically: async name => { assert.ok(modules.has(name)); return modules.get(name); },
      }).runInContext(browser);
    },
    url: () => `http://127.0.0.1:5174/${path}`,
    goto: async url => { calls.push(`reload:${new URL(url).hash}`); path = new URL(url).hash; },
    waitForURL: async (predicate, options) => { navigationTimeouts.push(options?.timeout); assert.equal(predicate(new URL(page.url())), true); },
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
  const crew = { page, storeModuleUrl: () => '/native-route-store', observe: async () => ({ ...original }),
    until: async (_description, predicate) => { assert.ok(predicate(original)); return { ...original }; } };
  const gm = { observe: async () => ({ ...original, playerRole: 'gm' }) };
  const tools = createTwoBrowserGameplay({ gm, crew, initial: { sessionId: 'native-session', joinCode: 'NATIVE' },
    roster: [{ roleId: 'executive-officer', uidHash: admittedUidHash }], directory: '/tmp/native-unused' });
  return { select: () => tools.select('executive-officer', { enter: entering }), calls, navigationTimeouts, path: () => path };
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

test('normal Back and chooser navigation keeps the canonical35s UI timeout inside the shared60s decision budget', async () => {
  const f = routeFixture(); await f.select();
  assert.ok(f.navigationTimeouts.length);
  assert.ok(f.navigationTimeouts.every(timeout => Number.isFinite(timeout) && timeout > 0 && timeout <= 35_000));
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
  const page = { getByRole: (_kind, options) => widget(options.name),
    evaluate: async () => ({ sessionId: 'native-session', fleetGroupId: 'native-group', connectionGeneration: 1,
      identityHydrationRevision: 1, replacementRoleId: null, replacementStatus: null, seatId: null, connected: true }),
    waitForResponse: async () => ({
    request: () => ({ postDataJSON: () => ({ data: { sessionId: 'native-session', requestId: 'native-request',
      expectedTurn: 1, expectedRevision: 4 } }) }),
  }) };
  const gm = { page, observe: async () => originalGm };
  const crew = { page, storeModuleUrl: () => '/native-observer', observe: async () => crewActor(), callable: async endpoint => {
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

test('explicit current UI blockers wait once for automatic source progress instead of starting a duplicate actor scan', async () => {
  let reads = 0, scans = 0;
  const current = () => attack(++reads >= 3 ? { status: 'resolved', currentStep: 'resolved', revision: 5 } : {});
  const originalGm = actor({ uidHash: 'native-gm', profileRoleId: 'gm', activeConsoleRoleId: null,
    playerRole: 'gm', instanceId: 'native-instance', gmInstanceOwned: true });
  const tools = { read: async () => current(), state: async () => ({ phase: 'active', cycle: 1 }), record: async () => {} };
  const result = await resolveLiveWolfAttack({ gm: { observe: async () => originalGm }, roster: [],
    initial: { sessionId: 'native-session' } }, { tools, timeoutMs: 1_000, verifyReplay: false,
    chooseNext: async () => { scans++; return { status: 'current-ui-blocked', reason: 'Current sources explicitly blocked.' }; } });
  assert.equal(result.status, 'resolved'); assert.equal(scans, 1);
});

// Native SDK-denial/lifecycle counterexamples only. Combat12 did not retain its
// actual denied code; these tests do not infer it or establish gameplay credit.
function closedChoiceReadFixture({ code = 'functions/failed-precondition', message = 'Native closed boarding query',
  kind = 'boarding-special', after = {}, actorDrift = {}, gmDrift = {}, afterSourceActor = {}, afterSourceGm = {},
  thrown, onDenied = () => {}, onResolved = () => {} } = {}) {
  let denied = false, sourceDone = false, sourceReads = 0, sdkReads = 0, paints = 0;
  const records = [];
  const current = attack({ revision: 26, currentStep: 'boarding', airspaceLocked: true });
  const closed = { ...current, revision: 27, status: 'resolved', currentStep: 'resolved', airspaceLocked: false, ...after };
  const discovery = { groupId: 'native-group', shipId: 'aegis', revision: 3, fleetGroupVesselIds: ['aegis', 'dione'] };
  const member = actor({ fleetGroupId: 'native-group', connectionGeneration: 3, identityHydrationRevision: 2,
    replacementRoleId: null, replacementStatus: null, seatId: 'original-seat', discoveryAuthority: discovery,
    airspace: 'restricted', turnStatePhase: 'team', phaseProgression: 'manual' });
  const facilitator = { ...member, uidHash: 'native-gm', profileRoleId: 'gm', assignedRoleId: null,
    activeConsoleRoleId: null, playerRole: 'gm', instanceId: 'original-gm-instance', gmInstanceOwned: true,
    fleetGroupId: null, seatId: null, discoveryAuthority: null };
  const observed = gm => ({ ...(gm ? facilitator : member),
    ...(denied ? gm ? gmDrift : actorDrift : {}), ...(sourceDone ? gm ? afterSourceGm : afterSourceActor : {}) });
  const surface = gm => ({ label: gm ? 'original GM' : 'original EO', storeModuleUrl: () => '/native-store',
    observe: async () => observed(gm), page: {
      evaluate: async () => ({ ...observed(gm), connected: true }),
      getByRole: () => { paints++; throw new Error('A denied closed read must never inspect or accept a UI choice.'); },
    } });
  const gm = surface(true), crew = surface(false);
  const reply = { status: 'denied', code, message, details: { nativeEvidence: 'Keep the available SDK detail unchanged.' } };
  crew.callable = async (endpoint, request) => {
    sdkReads++; assert.equal(request.sessionId, 'native-session');
    assert.equal(endpoint, kind === 'boarding-special' ? 'getWolfBoardingSpecialChoice' : 'getAegisEnrichedWarheadChoice');
    if (thrown) throw thrown;
    denied = true; onDenied(); return reply;
  };
  const context = { gm, crew, initial: { sessionId: 'native-session' },
    started: { uidHash: facilitator.uidHash, instanceId: facilitator.instanceId },
    roster: [{ roleId: member.profileRoleId, uidHash: member.uidHash }] };
  const tools = { read: async (role, path) => {
    assert.equal(role, 'gm'); assert.equal(path, 'wolfAttackState/current'); sourceReads++;
    if (!denied) return current;
    sourceDone = true; onResolved(); return closed;
  }, record: async (stage, detail) => { records.push({ stage, ...detail }); } };
  return { context, tools, current, reply, records,
    counts: () => ({ sourceReads, sdkReads, paints }),
    run: async options => (await moduleUnderTest()).createWolfChoiceWaiter(context, { tools, ...options })(crew, current, { kind }),
  };
}

function retainedSdkError(error, reply) {
  for (let current = error; current; current = current.cause)
    if (current.code === reply.code && current.message === reply.message && current.cause === reply) return true;
  return false;
}

test('a tagged actual SDK closed boarding denial reinspects one same newer resolved/unlocked attack with zero UI credit', async () => {
  const f = closedChoiceReadFixture();
  const result = await f.run();
  assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  assert.deepEqual(result.expected, f.current); assert.deepEqual(result.readDenial.reply, f.reply);
  assert.equal(result.readDenial.endpoint, 'getWolfBoardingSpecialChoice');
  assert.deepEqual(f.counts(), { sourceReads: 2, sdkReads: 1, paints: 0 });
  assert.ok(f.records.some(record => record.readDenial?.reply === f.reply), 'Retain the native SDK response before lifecycle recovery.');
});

for (const code of ['functions/permission-denied', 'functions/unauthenticated', 'functions/invalid-argument',
  'functions/internal', 'functions/deadline-exceeded', 'failed-precondition', undefined])
  test(`a ${code ?? 'missing-code'} SDK denial remains hard even after real source finalization`, async () => {
    const f = closedChoiceReadFixture({ code });
    if (code === undefined) delete f.reply.code;
    await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
    assert.deepEqual(f.counts(), { sourceReads: 1, sdkReads: 1, paints: 0 });
    assert.ok(f.records.some(record => record.readDenial?.reply === f.reply));
  });

test('missing or empty SDK message/body does not acquire closed-read classification', async () => {
  for (const message of ['', undefined]) {
    const f = closedChoiceReadFixture({ message });
    if (message === undefined) delete f.reply.message;
    await assert.rejects(f.run()); assert.deepEqual(f.counts(), { sourceReads: 1, sdkReads: 1, paints: 0 });
  }
});

test('a different readonly endpoint cannot turn its failed-precondition into closed boarding recovery', async () => {
  const f = closedChoiceReadFixture({ kind: 'warheads' });
  await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
  assert.deepEqual(f.counts(), { sourceReads: 1, sdkReads: 1, paints: 0 });
});

for (const [reason, after] of Object.entries({ unchanged: { revision: 26, status: 'declared', currentStep: 'boarding', airspaceLocked: true },
  'wrong attack': { attackId: 'different-attack' }, 'wrong session': { sessionId: 'different-session' },
  'wrong cycle': { turn: 2 }, 'same revision': { revision: 26 }, 'unsafe revision': { revision: 27.5 },
  'unresolved state': { status: 'declared' }, 'unresolved step': { currentStep: 'boarding' },
  'locked airspace': { airspaceLocked: true }, 'missing lock evidence': { airspaceLocked: undefined } }))
  test(`a tagged denied read with ${reason} reinspection remains an evidenced hard failure`, async () => {
    const f = closedChoiceReadFixture({ after });
    await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
    assert.deepEqual(f.counts(), { sourceReads: 2, sdkReads: 1, paints: 0 });
  });

for (const [reason, actorDrift] of Object.entries({ UID: { uidHash: 'other-uid' }, group: { fleetGroupId: 'other-group' },
  generation: { connectionGeneration: 4 }, seat: { seatId: 'new-seat' }, console: { activeConsoleRoleId: 'admiral' },
  role: { playerRole: 'gm' }, cycle: { cycle: 2 }, phase: { phase: 'debrief' },
  airspace: { airspace: 'lifted' }, cache: { freshness: 'cache' },
  discovery: { discoveryAuthority: { groupId: 'other-group', shipId: 'aegis', revision: 3, fleetGroupVesselIds: ['aegis'] } } }))
  test(`the original actor ${reason} cannot drift while the tagged read is pending`, async () => {
    const f = closedChoiceReadFixture({ actorDrift });
    await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
    assert.equal(f.counts().paints, 0); assert.equal(f.counts().sdkReads, 1);
  });

for (const [reason, gmDrift] of Object.entries({ UID: { uidHash: 'other-gm' }, instance: { instanceId: 'other-instance' },
  ownership: { gmInstanceOwned: false }, role: { playerRole: 'player' }, group: { fleetGroupId: 'other-group' },
  generation: { connectionGeneration: 4 }, seat: { seatId: 'other-seat' }, cycle: { cycle: 2 },
  discovery: { discoveryAuthority: { groupId: 'foreign', revision: 1, shipId: 'dione', fleetGroupVesselIds: ['dione'] } } }))
  test(`the original GM ${reason} stays fenced throughout closed-read recovery`, async () => {
    const f = closedChoiceReadFixture({ gmDrift });
    await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
    assert.equal(f.counts().paints, 0); assert.equal(f.counts().sdkReads, 1);
  });

test('actor or GM authority changing during final source reinspection remains withdrawn', async () => {
  for (const change of [{ afterSourceActor: { connectionGeneration: 4 } }, { afterSourceGm: { instanceId: 'other-instance' } }]) {
    const f = closedChoiceReadFixture(change);
    await assert.rejects(f.run(), error => retainedSdkError(error, f.reply));
    assert.deepEqual(f.counts(), { sourceReads: 2, sdkReads: 1, paints: 0 });
  }
});

test('a caller-owned coded error or thrown SDK timeout is not an independently tagged native denied response', async () => {
  const { waitForWolfChoiceReadiness } = await moduleUnderTest();
  const coded = Object.assign(new Error('Forged failed-precondition'), { code: 'functions/failed-precondition',
    endpoint: 'getWolfBoardingSpecialChoice', transport: 'actual-browser-sdk' });
  const direct = waitFixture({ choiceRead: () => { throw coded; } });
  await assert.rejects(waitForWolfChoiceReadiness(direct.options), error => error === coded);
  assert.equal(direct.counters().attackReads, 1); assert.equal(direct.counters().paintReads, 0);
  const timeout = new Error('Native browser read timed out.');
  const f = closedChoiceReadFixture({ thrown: timeout });
  await assert.rejects(f.run(), error => error === timeout);
  assert.deepEqual(f.counts(), { sourceReads: 1, sdkReads: 1, paints: 0 });
});

test('SDK denial and source reinspection consume the unchanged stage deadline without a new poll/read budget', async t => {
  let time = 0; t.mock.method(Date, 'now', () => time);
  for (const when of ['reply', 'source']) {
    time = 0;
    const f = closedChoiceReadFixture(when === 'reply' ? { onDenied: () => { time = 600; } }
      : { onResolved: () => { time = 600; } });
    await assert.rejects(f.run({ deadlineAt: 600 }), error => /deadline/i.test(error.message) && retainedSdkError(error, f.reply));
    assert.equal(f.counts().sdkReads, 1); assert.equal(f.counts().paints, 0);
    assert.equal(f.counts().sourceReads, when === 'reply' ? 1 : 2);
  }
});
