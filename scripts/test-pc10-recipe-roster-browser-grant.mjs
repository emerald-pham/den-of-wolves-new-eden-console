import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script, SyntheticModule } from 'node:vm';
import {
  CORE_CRAFT_PROCEDURES, GM_RULING_COUNTER_PROCEDURES,
  createPendingCoreCraftActionsCallback,
} from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';

// These native fixtures exercise the actual recipe factory and its serialized
// browser callback without creating a browser, session, actor, or gameplay write.
const steps = createPendingProcedureDefaultSteps();
const namedCoreRows = CORE_CRAFT_PROCEDURES.filter(row =>
  !['current-shuttle-holder', 'current-ally-holder'].includes(row.actorRoleId));
const capybaraRows = namedCoreRows.filter(row => row.actorRoleId.startsWith('capybara-'));
const uidHash = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const claimHash = claim => createHash('sha256').update(JSON.stringify(claim)).digest('hex').slice(0, 20);
const rolePresets = await readFile(new URL('../src/data/rolePresets.ts', import.meta.url), 'utf8');
const core18Source = rolePresets.match(/const CORE_18 = \[([\s\S]*?)\] as const;/);
assert.ok(core18Source, 'Use the actual source eighteen-role Base roster.');
const baseRoleIds = [...core18Source[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.equal(baseRoleIds.length, 18);
assert.ok(baseRoleIds.every(role => !role.startsWith('capybara-')));

function absentRoleFixture(roster = []) {
  const selected = [];
  return {
    context: { initial: { sessionId: 'recipe-session' }, roster },
    game: { select: async role => {
      selected.push(role);
      throw new Error(`Unadmitted actor selection: ${role}`);
    } },
    selected,
  };
}

for (const spec of namedCoreRows) {
  test(`absent exact admitted role stays unoffered before selection: ${spec.id}`, async () => {
    const fixture = absentRoleFixture([{ roleId: 'admiral', uidHash: 'original-admiral' }]);
    assert.equal(await steps[spec.id]({ ...fixture, spec }), null);
    assert.deepEqual(fixture.selected, [], 'A sparse roster cannot create or replace an actor.');
  });
}

for (const role of ['CAPYBARA-RECYCLER', 'capybara-recycler-extra', 'capybara-captain']) {
  test(`a different roster role does not admit Capybara Recycler: ${role}`, async () => {
    const spec = capybaraRows.find(row => row.endpoint === 'recycleWithBoa');
    const fixture = absentRoleFixture([{ roleId: role, uidHash: 'another-original-account' }]);
    assert.equal(await steps[spec.id]({ ...fixture, spec }), null);
    assert.deepEqual(fixture.selected, []);
  });
}

for (const [hook, checkpoint] of [['onCoordination', 'coordination'], ['beforeMissionDeal', 'before-mission-deal']]) {
  test(`absent Capybara roles preserve the existing pending checkpoint contract: ${checkpoint}`, async () => {
    const fixture = absentRoleFixture(baseRoleIds
      .map(roleId => ({ roleId, uidHash: uidHash(`original-${roleId}`) })));
    const hooks = createPendingCoreCraftActionsCallback({
      steps: Object.fromEntries(capybaraRows.map(row => [row.id, steps[row.id]])),
      gameFactory: () => fixture.game,
    });
    const outcome = await hooks[hook](fixture.context);
    assert.equal(outcome.status, 'pending');
    assert.equal(outcome.observedProcedureCount, 0);
    assert.equal(outcome.familyAcceptanceClaimed, false);
    assert.equal(outcome.pendingProcedureCount, outcome.evidence.cases.length);
    for (const row of outcome.evidence.cases) {
      assert.equal(row.status, 'pending');
      if (capybaraRows.some(spec => spec.id === row.caseId)) {
        assert.equal(row.reason, 'step-did-not-return-mounted-control-and-projection-inspector');
      }
    }
    assert.deepEqual(fixture.selected, [], 'Pending evidence must never select an absent account.');
  });
}

test('malformed original roster fails instead of becoming an absent-role skip', async () => {
  const spec = namedCoreRows[0];
  const fixture = absentRoleFixture(null);
  await assert.rejects(steps[spec.id]({ ...fixture, spec }));
});

function miningFixture() {
  const roleId = 'icebreaker-miner', originalUid = 'original-miner';
  let state = { live: true, sessionId: 'recipe-session', cycle: 2, phase: 'active',
    activeVesselIds: ['icebreaker'], highwallMining: { revision: 3 },
    shuttleControl: { highwall: { holderUid: originalUid, revision: 7 } },
    shuttleDockings: [{ shuttleId: 'highwall', shipId: 'icebreaker' }],
    shipFleetGroupIds: { icebreaker: 'fleet-1' } };
  const actor = { sameActor: true, sessionId: 'recipe-session', uidHash: uidHash(originalUid),
    playerRole: 'player', profileRoleId: roleId, activeConsoleRoleId: roleId,
    connection: 'live', freshness: 'server' };
  let clicks = 0;
  const action = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => { clicks += 1; } };
  const panel = { getByRole: (kind, options) => {
    assert.equal(kind, 'button');
    assert.deepEqual(options, { name: 'Roll 1d6 materials', exact: true });
    return action;
  } };
  const surface = {
    page: { url: () => 'http://localhost:5174/#/shuttles/highwall', evaluate: async () => state,
      getByRole: (kind, options) => {
        assert.equal(kind, 'region');
        assert.deepEqual(options, { name: 'Highwall mining operations', exact: true });
        return panel;
      } },
    storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => actor,
  };
  const selected = [];
  return { actor, surface,
    context: { initial: { sessionId: 'recipe-session' }, roster: [{ roleId, uidHash: actor.uidHash }] },
    game: { select: async role => { selected.push(role); assert.equal(role, roleId); return surface; } },
    selected, clicks: () => clicks, state: () => state, setState: next => { state = next; } };
}

const miningSpec = namedCoreRows.find(row => row.endpoint === 'runHighwallMining');
test('an admitted original named actor still uses the exact current mounted source option', async () => {
  const fixture = miningFixture();
  const recipe = await steps[miningSpec.id]({ ...fixture, spec: miningSpec });
  assert.deepEqual(fixture.selected, ['icebreaker-miner']);
  assert.deepEqual(recipe.expected, { sessionId: 'recipe-session', roleId: 'icebreaker-miner',
    uidHash: fixture.actor.uidHash, cycle: 2, shipId: 'icebreaker', shuttleId: 'highwall',
    groupId: 'fleet-1', controlRevision: 7, sourceRevision: 3 });
  const prepared = await recipe.prepare({ surface: fixture.surface, actor: fixture.actor, source: fixture.state() });
  assert.equal(prepared.offered, true);
  assert.equal(fixture.clicks(), 0);
  await prepared.click();
  assert.equal(fixture.clicks(), 1, 'This is an inert locator fixture, with no application write.');
});

for (const [label, change] of [
  ['original UID', input => { input.actor.uidHash = 'replacement-uid'; }],
  ['original session', input => { input.actor.sessionId = 'another-session'; }],
  ['original role', input => { input.actor.profileRoleId = 'icebreaker-engineer'; }],
  ['active console', input => { input.actor.activeConsoleRoleId = 'icebreaker-engineer'; }],
  ['current cycle', input => { input.source.cycle = 3; }],
  ['active phase', input => { input.source.phase = 'ended'; }],
  ['server source freshness', (input, fixture) => { fixture.setState({ ...fixture.state(), live: false }); }],
  ['source session', (input, fixture) => { fixture.setState({ ...fixture.state(), sessionId: 'another-session' }); }],
  ['source revision', (input, fixture) => {
    fixture.setState({ ...fixture.state(), highwallMining: { revision: 4 } });
  }],
]) {
  test(`an admitted role still refuses before a click when ${label} changes`, async () => {
    const fixture = miningFixture();
    const recipe = await steps[miningSpec.id]({ ...fixture, spec: miningSpec });
    const input = { surface: fixture.surface, actor: { ...fixture.actor }, source: { ...fixture.state() } };
    change(input, fixture);
    assert.equal((await recipe.prepare(input)).offered, false);
    assert.equal(fixture.clicks(), 0);
  });
}

for (const actorRoleId of ['current-shuttle-holder', 'current-ally-holder']) {
  test(`${actorRoleId} still requires the live owned GM custody read`, async () => {
    const spec = CORE_CRAFT_PROCEDURES.find(row => row.actorRoleId === actorRoleId);
    const selected = [];
    const gm = { page: { evaluate: async () => ({ live: true, sessionId: 'recipe-session', cycle: 2,
      phase: 'active', shuttleControl: {} }) }, storeModuleUrl: () => '/src/store/useSessionStore.ts',
      observe: async () => ({ sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server' }) };
    const recipe = await steps[spec.id]({ context: { initial: { sessionId: 'recipe-session' }, roster: [] }, spec,
      game: { select: async role => { selected.push(role); assert.equal(role, 'gm'); return gm; } } });
    assert.deepEqual(selected, ['gm']);
    assert.equal((await recipe.prepare()).offered, false);
  });
  test(`${actorRoleId} cannot use custody from an unowned GM instance`, async () => {
    const spec = CORE_CRAFT_PROCEDURES.find(row => row.actorRoleId === actorRoleId);
    const selected = [];
    const gm = { page: { evaluate: async () => ({ live: true, sessionId: 'recipe-session', cycle: 2,
      phase: 'active', shuttleControl: { ally: { holderUid: 'original-engineer' } } }) },
      storeModuleUrl: () => '/src/store/useSessionStore.ts',
      observe: async () => ({ sameActor: true, gmInstanceOwned: false, connection: 'live', freshness: 'server' }) };
    const recipe = await steps[spec.id]({ context: { initial: { sessionId: 'recipe-session' },
      roster: [{ roleId: 'icebreaker-engineer', uidHash: uidHash('original-engineer') }] }, spec,
      game: { select: async role => { selected.push(role); assert.equal(role, 'gm'); return gm; } } });
    assert.deepEqual(selected, ['gm']);
    assert.equal((await recipe.prepare()).offered, false);
  });
}

test('the GM remains outside the ordinary-role roster guard and must pass its original authority fences', async () => {
  const spec = GM_RULING_COUNTER_PROCEDURES.find(row => row.endpoint === 'setGmShipConsoleWriteGrant');
  const selected = [];
  const gm = { observe: async () => ({ sessionId: 'recipe-session', sameActor: false }) };
  const recipe = await steps[spec.id]({ context: { initial: { sessionId: 'recipe-session' }, roster: [] }, spec,
    game: { select: async role => { selected.push(role); assert.equal(role, 'gm'); return gm; } } });
  assert.deepEqual(selected, ['gm']);
  assert.equal((await recipe.prepare()).offered, false);
});

// Extract the private helper verbatim so page.evaluate receives the actual
// production callback. VM dynamic imports provide only its two browser modules;
// no Node hashing, globals, import rewriting, or production export is supplied.
const source = await readFile(new URL('./pc10-pending-procedure-ui-recipes.mjs', import.meta.url), 'utf8');
const helpers = [...source.matchAll(/async function readCurrentWriteGrant\(surface, expected\) \{[\s\S]*?\n\}/g)];
assert.equal(helpers.length, 1, 'The fixture must identify exactly the actual private grant reader.');
const readCurrentWriteGrant = Function(`return (${helpers[0][0]});`)();

function grantFixture() {
  const sessionId = 'recipe-session', instanceId = 'original-gm-instance', uid = 'original-GM-α';
  const claimedAt = '2026-10-05T10:00:00.000Z';
  const instance = { sessionId, id: instanceId, uid, claimedAt, shipConsoleWriteGrant: { shipId: 'aegis' } };
  return { state: { session: { id: sessionId, currentTurn: 2 }, me: { role: 'gm', uid },
    connection: 'live', sessionSnapshotFreshness: 'server', gmInstance: structuredClone(instance) },
    instances: [instance], expected: { sessionId, instanceId, uidHash: uidHash(uid) },
    reconciles: 0, lists: 0, browserGlobals: { crypto: webcrypto, TextEncoder } };
}

async function browserOnlyGrantRead(fixture) {
  const moduleUrl = '/src/store/useSessionStore.ts';
  const surface = { storeModuleUrl: () => moduleUrl, page: { evaluate: async (callback, input) => {
    const browser = createContext({ ...fixture.browserGlobals, input });
    assert.equal(new Script('[typeof createHash, typeof process, typeof Buffer, typeof require].join(",")')
      .runInContext(browser), 'undefined,undefined,undefined,undefined');
    const store = new SyntheticModule(['useSessionStore'], function () {
      this.setExport('useSessionStore', { getState: () => fixture.state });
    }, { context: browser });
    const service = new SyntheticModule(['listGmInstances', 'reconcileGmAuthority'], function () {
      this.setExport('reconcileGmAuthority', async () => { fixture.reconciles += 1; });
      this.setExport('listGmInstances', async () => { fixture.lists += 1; return fixture.instances; });
    }, { context: browser });
    const modules = new Map([[moduleUrl, store], ['/src/lib/sessionService.ts', service]]);
    for (const module of modules.values()) {
      await module.link(() => { throw new Error('No fixture module has imports.'); });
      await module.evaluate();
    }
    const script = new Script(`(${callback.toString()})(input)`, {
      importModuleDynamically: async name => {
        assert.ok(modules.has(name), `Only the actual browser source dependencies are allowed: ${name}`);
        return modules.get(name);
      },
    });
    return script.runInContext(browser);
  } } };
  const result = await readCurrentWriteGrant(surface, fixture.expected);
  return result === null ? null : JSON.parse(JSON.stringify(result));
}

function expectedGrant(fixture) {
  const instance = fixture.instances[0], enabled = instance.shipConsoleWriteGrant?.shipId === 'aegis';
  return { projection: { kind: 'gm-ship-console-write-grant', live: true,
    sessionId: fixture.expected.sessionId, cycle: fixture.state.session.currentTurn,
    uidHash: fixture.expected.uidHash, instanceId: fixture.expected.instanceId,
    shipId: enabled ? 'aegis' : null, targetShipId: 'aegis', enabled,
    claimedAtHash: claimHash(instance.claimedAt) }, claimedAt: instance.claimedAt };
}

for (const grantShipId of ['aegis', null, 'quellon']) {
  test(`actual serialized browser grant read retains exact private claim hash: ${grantShipId}`, async () => {
    const fixture = grantFixture();
    fixture.instances[0].shipConsoleWriteGrant = grantShipId === null ? null : { shipId: grantShipId };
    assert.deepEqual(await browserOnlyGrantRead(fixture), expectedGrant(fixture));
    assert.equal(fixture.reconciles, 1);
    assert.equal(fixture.lists, 1);
  });
}

test('claim hashing retains the exact JSON string, including equivalent instant spellings', async () => {
  const hashes = [];
  for (const claimedAt of ['2026-10-05T10:00:00.000Z', '2026-10-05T12:00:00.000+02:00']) {
    const fixture = grantFixture();
    fixture.state.gmInstance.claimedAt = fixture.instances[0].claimedAt = claimedAt;
    const result = await browserOnlyGrantRead(fixture);
    assert.deepEqual(result, expectedGrant(fixture));
    hashes.push(result.projection.claimedAtHash);
    assert.notEqual(result.projection.claimedAtHash,
      createHash('sha256').update(claimedAt).digest('hex').slice(0, 20), 'The private claim hash includes JSON quotes.');
  }
  assert.notEqual(hashes[0], hashes[1], 'Equivalent instants cannot replace the captured exact claim string.');
});

for (const [label, change] of [
  ['missing session', fixture => { fixture.state.session = null; }],
  ['missing actor', fixture => { fixture.state.me = null; }],
  ['offline connection', fixture => { fixture.state.connection = 'offline'; }],
  ['cached session', fixture => { fixture.state.sessionSnapshotFreshness = 'cache'; }],
  ['foreign session', fixture => { fixture.state.session.id = 'foreign-session'; }],
  ['ordinary player', fixture => { fixture.state.me.role = 'player'; }],
  ['foreign mounted instance session', fixture => { fixture.state.gmInstance.sessionId = 'foreign-session'; }],
  ['foreign mounted instance ID', fixture => { fixture.state.gmInstance.id = 'replacement-instance'; }],
  ['foreign mounted instance UID', fixture => { fixture.state.gmInstance.uid = 'replacement-uid'; }],
  ['missing mounted instance', fixture => { fixture.state.gmInstance = null; }],
  ['absent source instance', fixture => { fixture.instances = []; }],
  ['duplicate source instance', fixture => { fixture.instances.push({ ...fixture.instances[0] }); }],
  ['foreign source instance ID', fixture => { fixture.instances[0].id = 'replacement-instance'; }],
  ['foreign source session', fixture => { fixture.instances[0].sessionId = 'foreign-session'; }],
  ['foreign source UID', fixture => { fixture.instances[0].uid = 'replacement-uid'; }],
  ['foreign expected UID hash', fixture => { fixture.expected.uidHash = 'replacement-uid-hash'; }],
  ['missing claim', fixture => { delete fixture.instances[0].claimedAt; }],
  ['numeric claim', fixture => { fixture.instances[0].claimedAt = 123; }],
  ['empty claim', fixture => { fixture.instances[0].claimedAt = ''; }],
  ['invalid claim date', fixture => { fixture.instances[0].claimedAt = 'invalid-claim'; }],
  ['changed exact claim', fixture => { fixture.instances[0].claimedAt = '2026-10-05T10:01:00.000Z'; }],
]) {
  test(`browser grant read rejects ${label} under the unchanged original authority contract`, async () => {
    const fixture = grantFixture();
    change(fixture);
    assert.equal(await browserOnlyGrantRead(fixture), null);
  });
}

for (const missing of ['crypto', 'TextEncoder']) {
  test(`browser grant read fails closed without ${missing} and never uses Node globals`, async () => {
    const fixture = grantFixture();
    delete fixture.browserGlobals[missing];
    await assert.rejects(browserOnlyGrantRead(fixture), { name: 'ReferenceError', message: `${missing} is not defined` });
  });
}
