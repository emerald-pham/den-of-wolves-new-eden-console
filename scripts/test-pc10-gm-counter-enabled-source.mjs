import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import { GM_RULING_COUNTER_PROCEDURES } from './pc10-pending-procedure-ui-proof.mjs';

const SESSION_ID = 'native-counter-enabled-session';
const GM_UID = 'native-counter-enabled-gm';
const GM_UID_HASH = createHash('sha256').update(GM_UID).digest('hex').slice(0, 16);
const INSTANCE_ID = 'native-counter-enabled-original-instance';
const CLAIMED_AT = '2026-10-06T06:00:00.000Z';

function matches(expected, actual) {
  return expected instanceof RegExp ? expected.test(actual ?? '') : actual === expected;
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function locatorFor(nodes) {
  const locator = {
    count: async () => nodes.length,
    nth: index => locatorFor(nodes.slice(index, index + 1)),
    first: () => locatorFor(nodes.slice(0, 1)),
    locator(selector) {
      return locatorFor(nodes.flatMap(node => descendants(node)).filter(node => node.tag === selector));
    },
    getByRole(role, { name, exact = false } = {}) {
      return locatorFor(nodes.flatMap(node => descendants(node)).filter(node => node.role === role &&
        (name === undefined || (exact ? node.name === name : matches(name, node.name)))));
    },
    async getAttribute(name) {
      assert.equal(nodes.length, 1, `Expected one fixture node before reading ${name}.`);
      return nodes[0].attributes[name] ?? null;
    },
    async isVisible() {
      assert.equal(nodes.length, 1, 'Expected one fixture node before checking visibility.');
      return nodes[0].visible !== false;
    },
    async isEnabled() {
      assert.equal(nodes.length, 1, 'Expected one fixture node before checking enablement.');
      return typeof nodes[0].enabled === 'function' ? nodes[0].enabled() : nodes[0].enabled !== false;
    },
    async innerText() {
      return nodes[0].text ?? nodes[0].name;
    },
    async click() {
      assert.equal(nodes.length, 1, 'Expected one source control before clicking it.');
      assert.equal(await locator.isVisible(), true);
      assert.equal(await locator.isEnabled(), true, `Source control ${nodes[0].name} must be enabled.`);
      nodes[0].click?.();
    },
  };
  return locator;
}

function element(role, name, { attributes = {}, children = [], enabled = true, click, tag, text } = {}) {
  return { role, name, attributes, children, enabled, click, tag, text };
}

function makeFixture({ aegisFood = 0, aegisDecreaseEnabled = false, aegisIncreaseEnabled = true,
  dioneDecreaseEnabled = true, dioneIncreaseEnabled = true } = {}) {
  let writeMode = false;
  const actions = [];
  const mode = element('button', 'Ship numbers write mode', {
    attributes: { 'aria-pressed': 'false' },
    click() {
      writeMode = !writeMode;
      this.attributes['aria-pressed'] = String(writeMode);
      actions.push('write-mode');
    },
  });
  const counter = (shipId, direction, enabledInSource, currentAmount) => element('button', `${direction} Food`, {
    attributes: { 'aria-label': `${direction} Food` },
    enabled: () => writeMode && enabledInSource && (direction !== 'Decrease' || currentAmount > 0),
    click() { actions.push(`${shipId}:${direction}:Food`); },
  });
  // This mirrors the mounted GmConsole order: each resource's Decrease button
  // precedes Increase in the first list; later lists/buttons hold other counters.
  const shipGroup = (shipId, shipName, currentAmount, decreaseEnabled, increaseEnabled) => element('group', `${shipName} resource controls`, {
    attributes: { 'aria-label': `${shipName} resource controls` },
    children: [
      element('list', 'Resource stores', { children: [element('listitem', `Food: ${currentAmount}`, {
        attributes: { 'aria-label': `Food: ${currentAmount}` }, children: [
        counter(shipId, 'Decrease', decreaseEnabled, currentAmount),
        element('generic', String(currentAmount), { tag: 'strong', text: String(currentAmount) }),
        counter(shipId, 'Increase', increaseEnabled, currentAmount),
      ] })] }),
      element('list', 'Survivor population', { children: [element('listitem', 'Survivor Population', { children: [
        element('button', 'Increase Survivor Population', {
          enabled: () => writeMode, click() { actions.push(`${shipId}:Increase:Population`); },
        }),
      ] })] }),
      element('generic', 'Civil unrest', { children: [element('button', 'Increase Civil Unrest', {
        enabled: () => writeMode, click() { actions.push(`${shipId}:Increase:Unrest`); },
      })] }),
    ],
  });
  const fleet = element('region', 'Fleet resource controls', { children: [
    element('generic', 'Fleet resource access', { children: [mode] }),
    element('generic', 'Fleet resource ships', { children: [
      shipGroup('aegis', 'AEGIS', aegisFood, aegisDecreaseEnabled, aegisIncreaseEnabled),
      shipGroup('dione', 'Dione', 4, dioneDecreaseEnabled, dioneIncreaseEnabled),
    ] }),
  ] });
  const all = descendants(fleet);
  const state = {
    live: true, sessionId: SESSION_ID, cycle: 1, phase: 'active', activeVesselIds: ['aegis'],
    vesselActionRevisions: { aegis: 14 }, shipFleetGroupIds: { aegis: 'native-fleet', dione: 'foreign-fleet' },
    shipResources: { aegis: { food: aegisFood } },
  };
  const actor = {
    sameActor: true, sessionId: SESSION_ID, uidHash: GM_UID_HASH, playerRole: 'gm',
    connection: 'live', freshness: 'server', gmInstanceOwned: true, instanceId: INSTANCE_ID,
    claimedAt: CLAIMED_AT, connectionGeneration: 7, hydrationRevision: 11,
    activeConsoleRoleId: null, phase: 'active', cycle: 1,
  };
  const page = {
    url: () => 'http://localhost:5174/#/gm',
    getByRole(role, { name, exact = false } = {}) {
      return locatorFor(all.filter(node => node.role === role &&
        (name === undefined || (exact ? node.name === name : matches(name, node.name)))));
    },
    async evaluate(callback) {
      const code = callback.toString();
      if (code.includes('activeDemoActorProfile')) {
        return {
          sessionId: actor.sessionId, uidHash: actor.uidHash, sameActor: actor.sameActor,
          playerRole: actor.playerRole, instanceId: actor.instanceId, gmInstanceOwned: actor.gmInstanceOwned,
          connection: actor.connection, freshness: actor.freshness, claimedAt: actor.claimedAt,
          generation: actor.connectionGeneration, hydrationRevision: actor.hydrationRevision,
          hasAuth: true, profileRoleId: null, assignedRoleId: null,
          activeConsoleRoleId: actor.activeConsoleRoleId,
          phase: state.phase, cycle: state.cycle,
        };
      }
      return structuredClone(state);
    },
  };
  const surface = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ({ ...actor }) };
  const context = {
    initial: { sessionId: SESSION_ID, uidHash: GM_UID_HASH },
    started: { uidHash: GM_UID_HASH, instanceId: INSTANCE_ID },
  };
  const game = { select: async role => {
    assert.equal(role, 'gm');
    return surface;
  } };
  return { actions, actor, context, game, surface, state, mode };
}

async function prepareCounter(fixture) {
  const spec = GM_RULING_COUNTER_PROCEDURES.find(row => row.endpoint === 'applyShipCounterSteps');
  assert.ok(spec, 'The public counter procedure remains registered.');
  const recipe = await createPendingProcedureDefaultSteps()[spec.id]({ context: fixture.context, game: fixture.game });
  const planned = await recipe.prepare({ surface: fixture.surface, actor: fixture.actor,
    source: { cycle: 1, phase: 'active' } });
  return { recipe, planned };
}

// Reason: the public default factory must select a currently enabled mounted
// one-step button after a disabled earlier button, without leaving the pinned ship group.
test('the default counter recipe chooses the first enabled control in the exact mounted ship group', async () => {
  const gmSource = await readFile(new URL('../src/routes/GmConsole.tsx', import.meta.url), 'utf8');
  const resourcesSource = await readFile(new URL('../src/data/resources.ts', import.meta.url), 'utf8');
  const recipeSource = await readFile(new URL('./pc10-pending-procedure-ui-recipes.mjs', import.meta.url), 'utf8');
  const fleet = gmSource.indexOf('aria-label="Fleet resource controls"');
  const mode = gmSource.indexOf('aria-label="Ship numbers write mode"', fleet);
  const group = gmSource.indexOf('aria-label={`${ship.name} resource controls`}', mode);
  const resourceList = gmSource.indexOf('<ul>', group);
  const decrease = gmSource.indexOf('aria-label={`Decrease ${resource.label}`}', resourceList);
  const increase = gmSource.indexOf('aria-label={`Increase ${resource.label}`}', decrease);
  const resourceListEnd = gmSource.indexOf('</ul>', resourceList);
  const populationList = gmSource.indexOf('<ul>', resourceListEnd + 5);
  assert.ok(fleet >= 0 && mode > fleet && group > mode && resourceList > group && decrease > resourceList &&
    increase > decrease && increase < resourceListEnd && populationList > resourceListEnd,
  'The source has one parent write-mode toggle, then a named ship group whose resource list precedes population.');
  assert.match(gmSource.slice(decrease, increase), /disabled=\{!shipNumberWrite[^}]*visibleAmount === 0\}/,
    'A zero-valued resource disables only its mounted decrease control.');
  const resourceLabels = [...resourcesSource.matchAll(/\{ id: '[^']+', label: '([^']+)'/g)].map(match => match[1]);
  assert.ok(resourceLabels.length > 0);
  assert.ok(recipeSource.includes(`const GM_RESOURCE_COUNTER_BUTTON = /^(?:Increase|Decrease) (?:${resourceLabels.join('|')})$/;`),
    'The factory candidate names stay aligned with the actual mounted resource definitions.');

  const fixture = makeFixture();
  const { recipe, planned } = await prepareCounter(fixture);
  assert.equal(planned.offered, true, planned.reason);
  assert.equal(await fixture.surface.page.getByRole('button', { name: 'Ship numbers write mode', exact: true })
    .getAttribute('aria-pressed'), 'true');
  assert.equal(recipe.expected.sessionId, SESSION_ID);
  assert.equal(recipe.expected.uidHash, GM_UID_HASH);
  assert.equal(recipe.expected.instanceId, INSTANCE_ID);
  assert.equal(recipe.expected.shipId, 'aegis');
  assert.equal(recipe.expected.groupId, 'native-fleet');
  assert.equal(recipe.expected.cycle, 1);
  assert.equal(recipe.expected.sourceRevision, 14);

  await planned.click();
  assert.deepEqual(fixture.actions, ['write-mode', 'aegis:Increase:Food']);
  assert.equal(fixture.actor.connectionGeneration, 7);
  assert.equal(fixture.actor.hydrationRevision, 11);
});

// Reason: another mounted ship may have an enabled counter, but it cannot
// substitute for a selected ship whose own resource group has no enabled control.
test('the counter recipe does not borrow an enabled counter from a different ship group', async () => {
  const fixture = makeFixture({ aegisDecreaseEnabled: false, aegisIncreaseEnabled: false });
  const { planned } = await prepareCounter(fixture);
  assert.equal(planned.offered, false);
  assert.match(planned.reason, /no actual one-step GM resource control currently enabled/);
  assert.deepEqual(fixture.actions, ['write-mode']);
});

test('the counter recipe does not substitute population or unrest controls for disabled resources', async () => {
  const fixture = makeFixture({ aegisDecreaseEnabled: false, aegisIncreaseEnabled: false });
  const { planned } = await prepareCounter(fixture);
  assert.equal(planned.offered, false);
  assert.match(planned.reason, /no actual one-step GM resource control currently enabled/);
  assert.deepEqual(fixture.actions, ['write-mode']);
});

// Reason: choosing another direction must retain every source/actor guard that
// was pinned before the actual mounted counter becomes the click target.
test('a selected counter is rejected before click if its original GM generation or hydration changes', async () => {
  for (const field of ['connectionGeneration', 'hydrationRevision']) {
    const fixture = makeFixture({ aegisFood: 1, aegisDecreaseEnabled: true });
    const { planned } = await prepareCounter(fixture);
    assert.equal(planned.offered, true, planned.reason);
    fixture.actor[field] += 1;
    await assert.rejects(planned.click(), /changed before the click/);
    assert.deepEqual(fixture.actions, ['write-mode'], `${field} drift blocks the mounted counter click`);
  }
});

test('a selected counter is rejected before click if its pinned source revision or group changes', async () => {
  for (const change of [
    state => { state.vesselActionRevisions.aegis += 1; },
    state => { state.shipFleetGroupIds.aegis = 'different-fleet'; },
  ]) {
    const fixture = makeFixture({ aegisFood: 1, aegisDecreaseEnabled: true });
    const { planned } = await prepareCounter(fixture);
    assert.equal(planned.offered, true, planned.reason);
    change(fixture.state);
    await assert.rejects(planned.click(), /changed before the click/);
    assert.deepEqual(fixture.actions, ['write-mode']);
  }
});
