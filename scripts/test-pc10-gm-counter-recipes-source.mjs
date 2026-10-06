import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import { GM_RULING_COUNTER_PROCEDURES } from './pc10-pending-procedure-ui-proof.mjs';

const SESSION_ID = 'native-counter-recipe-session';
const GM_UID = 'native-counter-recipe-gm';
const GM_UID_HASH = createHash('sha256').update(GM_UID).digest('hex').slice(0, 16);
const GM_INSTANCE_ID = 'native-original-gm-instance';
const CLAIMED_AT = '2026-10-06T05:00:00.000Z';

function roleMatches(expected, actual) {
  if (expected instanceof RegExp) return expected.test(actual ?? '');
  return actual === expected;
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function locatorFor(nodes, onRead = () => {}) {
  const locator = {
    count: async () => nodes.length,
    nth: index => locatorFor(nodes.slice(index, index + 1), onRead),
    first: () => locatorFor(nodes.slice(0, 1), onRead),
    getByRole(role, { name, exact = false } = {}) {
      const matches = nodes.flatMap(node => descendants(node)).filter(node => node.role === role &&
        (name === undefined || (exact ? node.name === name : roleMatches(name, node.name))));
      return locatorFor(matches, onRead);
    },
    async getAttribute(name) {
      assert.equal(nodes.length, 1, `Expected one fixture element before reading ${name}.`);
      onRead(nodes[0], 'getAttribute', name);
      return nodes[0].attributes[name] ?? null;
    },
    async isVisible() {
      assert.equal(nodes.length, 1, 'Expected one fixture element before checking visibility.');
      return nodes[0].visible !== false;
    },
    async isEnabled() {
      assert.equal(nodes.length, 1, 'Expected one fixture element before checking enablement.');
      return typeof nodes[0].enabled === 'function' ? nodes[0].enabled() : nodes[0].enabled !== false;
    },
    async inputValue() {
      assert.equal(nodes.length, 1, 'Expected one fixture input before reading its value.');
      return nodes[0].value;
    },
    async fill(value) {
      assert.equal(nodes.length, 1, 'Expected one fixture input before filling it.');
      assert.equal(await locator.isEnabled(), true, 'The actual fixture input must stay writable.');
      nodes[0].value = value;
      onRead(nodes[0], 'fill', value);
    },
    async click() {
      assert.equal(nodes.length, 1, 'Expected one source control before clicking it.');
      assert.equal(await locator.isVisible(), true);
      assert.equal(await locator.isEnabled(), true, `Source control ${nodes[0].name} must be enabled.`);
      onRead(nodes[0], 'click');
      nodes[0].click?.();
    },
  };
  return locator;
}

function element(role, name, { attributes = {}, children = [], enabled = true, value, click } = {}) {
  return { role, name, attributes, children, enabled, value, click };
}

function makeMountedSourceFixture({ wingCounts = {
  'fighter-wing-alpha': { count: 3, capacity: 4, revision: 8 },
  'fighter-wing-bravo': { count: 3, capacity: 4, revision: 9 },
} } = {}) {
  let shipNumberWrite = false;
  const actions = [];
  const modeButton = element('button', 'Ship numbers write mode', {
    attributes: { 'aria-pressed': 'false' },
    click() {
      shipNumberWrite = !shipNumberWrite;
      this.attributes['aria-pressed'] = String(shipNumberWrite);
      actions.push('write-mode');
    },
  });
  const counter = (name, direction) => element('button', `${direction} ${name}`, {
    enabled: () => shipNumberWrite,
    click() { actions.push(`${direction}:${name}`); },
  });
  const fighterWing = wingId => element('listitem', `${wingId} fighter count ${wingCounts[wingId].count}`, {
      children: [
        element('spinbutton', `Set ${wingId} fighter count`, {
        attributes: { 'aria-label': `Set ${wingId} fighter count`, max: String(wingCounts[wingId].capacity) },
        value: String(wingCounts[wingId].count),
      }),
      element('button', `Apply ${wingId} fighter count`, {
        enabled: () => shipNumberWrite,
        click() { actions.push(`apply:${wingId}`); },
      }),
    ],
  });
  const aegis = element('group', 'Aegis resource controls', {
    children: [counter('Materials', 'Increase'), counter('Materials', 'Decrease'),
      fighterWing('fighter-wing-alpha'), fighterWing('fighter-wing-bravo')],
  });
  const quellon = element('group', 'Quellon resource controls', {
    children: [counter('Materials', 'Increase'), counter('Materials', 'Decrease')],
  });
  const fleet = element('region', 'Fleet resource controls', {
    children: [
      element('generic', 'Fleet resource access', { children: [modeButton] }),
      element('generic', 'Fleet resource ships', { children: [aegis, quellon] }),
    ],
  });
  const all = descendants(fleet);
  const record = (node, operation, value) => actions.push({ operation, name: node.name, value });
  const page = {
    url: () => 'http://localhost:5174/#/gm',
    getByRole(role, { name, exact = false } = {}) {
      const matches = all.filter(node => node.role === role &&
        (name === undefined || (exact ? node.name === name : roleMatches(name, node.name))));
      return locatorFor(matches, record);
    },
    evaluate: async () => ({
      live: true,
      sessionId: SESSION_ID,
      cycle: 1,
      phase: 'active',
      activeVesselIds: ['aegis'],
      vesselActionRevisions: { aegis: 14 },
      shipFleetGroupIds: { aegis: 'native-fleet' },
      shipResources: { aegis: { materials: 4 } },
      fighterWingCounts: Object.fromEntries(Object.entries(wingCounts).map(([wingId, current]) =>
        [wingId, { count: current.count, revision: current.revision }])),
    }),
  };
  const actor = {
    sameActor: true,
    sessionId: SESSION_ID,
    uidHash: GM_UID_HASH,
    playerRole: 'gm',
    profileRoleId: null,
    activeConsoleRoleId: null,
    connection: 'live',
    freshness: 'server',
    instanceId: GM_INSTANCE_ID,
    gmInstanceOwned: true,
    claimedAt: CLAIMED_AT,
    connectionGeneration: 7,
    hydrationRevision: 11,
  };
  const surface = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ({ ...actor }) };
  const context = {
    initial: { sessionId: SESSION_ID, uidHash: GM_UID_HASH },
    started: { uidHash: GM_UID_HASH, instanceId: GM_INSTANCE_ID },
  };
  const game = { select: async role => {
    assert.equal(role, 'gm');
    return surface;
  } };
  return { actions, actor, context, game, surface };
}

const recipeForEndpoint = async (endpoint, fixture) => {
  const spec = GM_RULING_COUNTER_PROCEDURES.find(row => row.endpoint === endpoint);
  assert.ok(spec, `The existing public procedure map must contain ${endpoint}.`);
  const recipe = await createPendingProcedureDefaultSteps()[spec.id]({ context: fixture.context, game: fixture.game });
  const planned = await recipe.prepare({ surface: fixture.surface, actor: fixture.actor,
    source: { cycle: 1, phase: 'active' } });
  return { recipe, planned };
};

test('the mounted GM source keeps fleet write mode at the parent of both ship groups', async () => {
  const gmSource = await readFile(new URL('../src/routes/GmConsole.tsx', import.meta.url), 'utf8');
  const shipsSource = await readFile(new URL('../src/data/ships.ts', import.meta.url), 'utf8');
  const fleetRegion = gmSource.indexOf('aria-label="Fleet resource controls"');
  const mode = gmSource.indexOf('aria-label="Ship numbers write mode"', fleetRegion);
  const shipList = gmSource.indexOf('<div className="gm-fleet-resources__ships">', mode);
  const shipGroup = gmSource.indexOf('role="group"', shipList);
  const wingInput = gmSource.indexOf('aria-label={`Set ${wingId} fighter count`}', shipGroup);
  assert.ok(fleetRegion >= 0 && mode > fleetRegion && shipList > mode && shipGroup > shipList && wingInput > shipGroup,
    'The actual source places the only write-mode button at the fleet parent, then mounts named ship groups and AEGIS wing fields beneath it.');
  assert.match(gmSource.slice(shipGroup, wingInput), /aria-label=\{`\$\{ship\.name\} resource controls`\}/);
  assert.match(gmSource.slice(wingInput, wingInput + 1_400), /aria-label=\{`Apply \$\{wingId\} fighter count`\}/);
  assert.match(gmSource.slice(wingInput, wingInput + 1_400), /disabled=\{!shipNumberWrite \|\| !validDraft/);
  assert.match(shipsSource, /export const SHIPS:[\s\S]*?= \[\s*aegis,/,
    'The GM resolves to AEGIS, and its real resource group is first in the mounted SHIPS order.');
});

test('the default GM ship-counter recipe follows the parent write toggle and reaches its mounted control', async () => {
  const fixture = makeMountedSourceFixture();
  const { recipe, planned } = await recipeForEndpoint('applyShipCounterSteps', fixture);

  assert.equal(planned.offered, true, planned.reason);
  assert.equal(await fixture.surface.page.getByRole('button', { name: 'Ship numbers write mode', exact: true })
    .getAttribute('aria-pressed'), 'true');
  assert.equal(recipe.expected.sessionId, SESSION_ID);
  assert.equal(recipe.expected.uidHash, GM_UID_HASH);
  assert.equal(recipe.expected.instanceId, GM_INSTANCE_ID);
  assert.equal(recipe.expected.shipId, 'aegis');
  assert.equal(recipe.expected.sourceRevision, 14);

  await planned.click();
  assert.deepEqual(fixture.actions.filter(value => typeof value === 'string'), ['write-mode', 'Increase:Materials']);
  assert.equal(fixture.actor.connectionGeneration, 7);
  assert.equal(fixture.actor.hydrationRevision, 11);
});

test('the default GM fighter-count recipe follows parent mode and binds the matching wing action', async () => {
  const fixture = makeMountedSourceFixture();
  const { recipe, planned } = await recipeForEndpoint('setFighterWingCount', fixture);

  assert.equal(planned.offered, true, planned.reason);
  assert.equal(await fixture.surface.page.getByRole('button', { name: 'Ship numbers write mode', exact: true })
    .getAttribute('aria-pressed'), 'true');
  assert.equal(recipe.expected.sessionId, SESSION_ID);
  assert.equal(recipe.expected.uidHash, GM_UID_HASH);
  assert.equal(recipe.expected.instanceId, GM_INSTANCE_ID);
  assert.equal(recipe.expected.shipId, 'aegis');
  assert.equal(recipe.expected.sourceRevision, 8);

  await planned.click();
  assert.deepEqual(fixture.actions.filter(value => typeof value === 'string'), [
    'write-mode', 'apply:fighter-wing-alpha',
  ]);
  assert.equal(await fixture.surface.page.getByRole('spinbutton', {
    name: 'Set fighter-wing-alpha fighter count', exact: true,
  }).inputValue(), '4');
  assert.equal(fixture.actor.connectionGeneration, 7);
  assert.equal(fixture.actor.hydrationRevision, 11);
});

test('the default GM fighter-count recipe finds a wing with capacity when the first wing is full', async () => {
  const fixture = makeMountedSourceFixture({ wingCounts: {
    'fighter-wing-alpha': { count: 4, capacity: 4, revision: 12 },
    'fighter-wing-bravo': { count: 3, capacity: 4, revision: 15 },
  } });
  const { recipe, planned } = await recipeForEndpoint('setFighterWingCount', fixture);

  assert.equal(planned.offered, true, planned.reason);
  assert.equal(recipe.expected.sourceRevision, 15);
  await planned.click();
  assert.equal(await fixture.surface.page.getByRole('spinbutton', {
    name: 'Set fighter-wing-bravo fighter count', exact: true,
  }).inputValue(), '4');
  assert.deepEqual(fixture.actions.filter(value => typeof value === 'string'), [
    'write-mode', 'apply:fighter-wing-bravo',
  ]);
});
