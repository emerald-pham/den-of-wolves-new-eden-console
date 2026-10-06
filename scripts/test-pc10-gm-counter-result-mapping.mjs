import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import { evaluateProcedureCapture, GM_RULING_COUNTER_PROCEDURES } from './pc10-pending-procedure-ui-proof.mjs';

const SESSION_ID = 'native-gm-counter-result-session';
const GM_UID = 'native-gm-counter-result-gm';
const GM_UID_HASH = createHash('sha256').update(GM_UID).digest('hex').slice(0, 16);
const INSTANCE_ID = 'native-original-gm-counter-instance';
const CLAIMED_AT = '2026-10-06T12:00:00.000Z';
const RESOURCE_LABELS = [
  ['ore', 'Strytium Ore'], ['fuel', 'Strytium Fuel'], ['food', 'Food'], ['water', 'Water'],
  ['materials', 'Materials'], ['securityTeams', 'Security Teams'], ['scrap', 'Scrap'],
];

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
    getByRole(role, { name, exact = false } = {}) {
      return locatorFor(nodes.flatMap(node => descendants(node)).filter(node => node.role === role &&
        (name === undefined || (exact ? node.name === name : matches(name, node.name)))));
    },
    async getAttribute(name) {
      assert.equal(nodes.length, 1, 'Expected one source node before reading ' + name + '.');
      return nodes[0].attributes[name] ?? null;
    },
    async isVisible() {
      assert.equal(nodes.length, 1, 'Expected one source node before checking visibility.');
      return nodes[0].visible !== false;
    },
    async isEnabled() {
      assert.equal(nodes.length, 1, 'Expected one source node before checking enablement.');
      return typeof nodes[0].enabled === 'function' ? nodes[0].enabled() : nodes[0].enabled !== false;
    },
    async click() {
      assert.equal(nodes.length, 1, 'Expected one mounted source control before click.');
      assert.equal(await locator.isVisible(), true);
      assert.equal(await locator.isEnabled(), true);
      nodes[0].click?.();
    },
    async allTextContents() {
      return nodes.map(node => node.textContent ?? node.name);
    },
  };
  return locator;
}

function element(role, name, { attributes = {}, children = [], enabled = true, click, textContent } = {}) {
  return { role, name, attributes, children, enabled, click, textContent };
}

function makeFixture() {
  let writeMode = false;
  const actions = [];
  const selected = { counter: null };
  const state = {
    live: true, sessionId: SESSION_ID, phase: 'active', cycle: 1,
    activeVesselIds: ['aegis'],
    vesselActionRevisions: { aegis: 14 },
    shipFleetGroupIds: { aegis: 'native-fleet-7' },
    shipResources: { aegis: {
      ore: 4, fuel: 8, food: 6, water: 6, materials: 1, securityTeams: 9, scrap: 0,
    } },
  };
  const actor = {
    sameActor: true, sessionId: SESSION_ID, uidHash: GM_UID_HASH, playerRole: 'gm',
    profileRoleId: null, assignedRoleId: null, activeConsoleRoleId: null,
    connection: 'live', freshness: 'server', instanceId: INSTANCE_ID, gmInstanceOwned: true,
  };
  const lifecycle = {
    hasAuth: true, sameActor: true, sessionId: SESSION_ID, uidHash: GM_UID_HASH,
    connection: 'live', freshness: 'server', generation: 7, hydrationRevision: 11,
    playerRole: 'gm', profileRoleId: null, assignedRoleId: null, activeConsoleRoleId: null,
    instanceId: INSTANCE_ID, claimedAt: CLAIMED_AT, gmInstanceOwned: true,
    phase: 'active', cycle: 1, privateAudienceMatches: true, foreignPendingCount: 0,
    pendingCount: 0,
  };
  const mode = element('button', 'Ship numbers write mode', {
    attributes: { 'aria-pressed': 'false' },
    click() {
      writeMode = !writeMode;
      this.attributes['aria-pressed'] = String(writeMode);
      actions.push('write-mode');
    },
  });
  const counter = (resourceId, label, direction) => element('button', direction + ' ' + label, {
    enabled: () => writeMode && (direction === 'Increase' || state.shipResources.aegis[resourceId] > 0),
    click() {
      const step = direction === 'Increase' ? 1 : -1;
      selected.counter = { resourceId, label, step, before: state.shipResources.aegis[resourceId] };
      actions.push(direction + ':' + label);
      state.shipResources.aegis[resourceId] += step;
      state.vesselActionRevisions.aegis += 1;
    },
  });
  const resourceButtons = RESOURCE_LABELS.flatMap(([resourceId, label]) => [
    counter(resourceId, label, 'Decrease'), counter(resourceId, label, 'Increase'),
  ]);
  const group = element('group', 'AEGIS resource controls', {
    attributes: { 'aria-label': 'AEGIS resource controls' },
    children: resourceButtons,
  });
  const fleet = element('region', 'Fleet resource controls', {
    children: [
      element('generic', 'Fleet resource access', { children: [mode] }),
      element('generic', 'Fleet resource ships', { children: [group] }),
    ],
  });
  const all = [fleet, ...descendants(fleet)];
  const page = {
    url: () => 'http://localhost:5174/#/gm',
    getByRole(role, { name, exact = false } = {}) {
      return locatorFor(all.filter(node => node.role === role &&
        (name === undefined || (exact ? node.name === name : matches(name, node.name)))));
    },
    evaluate: async callback => callback.toString().includes('privateKeys = Object.keys(s)')
      ? { ...lifecycle }
      : structuredClone(state),
  };
  const surface = {
    page,
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    // The actual generic surface observer omits lifecycle-only claim/generation fields.
    observe: async () => ({ ...actor }),
  };
  const context = {
    initial: { sessionId: SESSION_ID, uidHash: GM_UID_HASH },
    started: { uidHash: GM_UID_HASH, instanceId: INSTANCE_ID },
  };
  const game = { select: async role => {
    assert.equal(role, 'gm');
    return surface;
  } };
  return { actions, actor, context, game, surface, state, selected };
}

async function makePreparedCounter(fixture) {
  const spec = GM_RULING_COUNTER_PROCEDURES.find(row => row.endpoint === 'applyShipCounterSteps');
  assert.ok(spec, 'The existing public GM counter procedure remains registered.');
  const recipe = await createPendingProcedureDefaultSteps()[spec.id]({
    context: fixture.context, game: fixture.game,
  });
  const sourceBefore = structuredClone(fixture.state);
  const planned = await recipe.prepare({
    surface: fixture.surface, actor: fixture.actor, source: { cycle: 1, phase: 'active' },
  });
  assert.equal(planned.offered, true, planned.reason);
  assert.equal(recipe.expected.shipId, 'aegis');
  assert.equal(recipe.expected.sourceRevision, 14);
  assert.equal(recipe.expected.groupId, 'native-fleet-7');
  await planned.click();
  return { recipe, planned, sourceBefore };
}

test('the statusless result fixture matches the current GM UI, service, and callable source contract', async () => {
  const gmUi = await readFile(new URL('../src/routes/GmConsole.tsx', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/lib/sessionService.ts', import.meta.url), 'utf8');
  const functionsSource = await readFile(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  const batchSource = await readFile(new URL('../functions/src/shipCounterBatch.ts', import.meta.url), 'utf8');
  const resources = await readFile(new URL('../src/data/resources.ts', import.meta.url), 'utf8');

  assert.match(gmUi, /onClick=\{\(\) => stageCounterChange\(target, amount, -1\)\}/);
  assert.match(gmUi, /onClick=\{\(\) => stageCounterChange\(target, amount, 1\)\}/);
  assert.match(service, /steps: \[\.\.\.steps\],\s*requestId: commandId\(\),\s*expectedRevision,/);
  assert.match(service, /counter: target\.counter,[\s\S]{0,160}resourceId: target\.resourceId/);
  assert.match(service, /actorRoleId: raw\.actorRoleId/);
  assert.match(resources, /\{ id: 'ore', label: 'Strytium Ore', notes:/);

  const callableStart = functionsSource.indexOf("export const applyShipCounterSteps = auditedOnCall");
  const resourceStart = functionsSource.indexOf("if (change.counter === 'resource')", callableStart);
  const unrestStart = functionsSource.indexOf("if (change.counter === 'unrest')", resourceStart);
  assert.ok(callableStart >= 0 && resourceStart > callableStart && unrestStart > resourceStart);
  const resourceReply = functionsSource.slice(resourceStart, unrestStart);
  assert.match(resourceReply, /const reply = \{\s*\.\.\.result,\s*\.\.\.batchContext,\s*\.\.\.vesselActionEnvelope/);
  assert.doesNotMatch(resourceReply, /\bstatus\s*:/,
    'Successful resource-counter receipts have no status field in the current callable response.');
  assert.match(batchSource, /return \{\s*amount: steps\.reduce[\s\S]*?appliedSteps: \[\.\.\.steps\],[\s\S]*?alertRaised: false,/);
});

test('the current default mounted recipe and statusless source receipt map to completed', async () => {
  const fixture = makeFixture();
  const { recipe, sourceBefore } = await makePreparedCounter(fixture);
  assert.deepEqual(fixture.actions, ['write-mode', 'Decrease:Strytium Ore']);
  assert.deepEqual(fixture.selected.counter, { resourceId: 'ore', label: 'Strytium Ore', step: -1, before: 4 });

  const requestId = 'native-gm-counter-one-step';
  const { resourceId, step, before } = fixture.selected.counter;
  const request = {
    sessionId: SESSION_ID,
    instanceId: INSTANCE_ID,
    shipId: 'aegis',
    counter: 'resource',
    steps: [step],
    requestId,
    expectedRevision: recipe.expected.sourceRevision,
    resourceId,
  };
  assert.equal(request.shipId, recipe.expected.shipId);
  assert.equal(request.instanceId, recipe.expected.instanceId);
  assert.equal(request.expectedRevision, recipe.expected.sourceRevision);

  // Mirrors applyResourceSteps + the successful applyShipCounterSteps resource
  // transaction's batchContext and vesselActionEnvelope. Success is statusless.
  const result = {
    amount: before + step,
    appliedSteps: [step],
    alertRaised: false,
    sessionId: SESSION_ID,
    instanceId: INSTANCE_ID,
    shipId: 'aegis',
    counter: 'resource',
    resourceId,
    requestId,
    expectedRevision: recipe.expected.sourceRevision,
    actorUid: GM_UID,
    actorRoleId: null,
    vesselId: recipe.expected.shipId,
    turn: recipe.expected.cycle,
    phase: 'active',
    revision: recipe.expected.sourceRevision + 1,
    idempotencyKey: requestId,
    auditId: 'counter-batch-' + requestId,
  };
  assert.equal(Object.hasOwn(result, 'status'), false);
  assert.deepEqual(Object.keys(result).sort(), [
    'actorRoleId', 'actorUid', 'alertRaised', 'amount', 'appliedSteps', 'auditId', 'counter',
    'expectedRevision', 'idempotencyKey', 'instanceId', 'phase', 'requestId', 'resourceId',
    'revision', 'sessionId', 'shipId', 'turn', 'vesselId',
  ]);

  const inspected = await recipe.inspect({
    surface: fixture.surface,
    result,
    request,
    actorAfter: { ...fixture.actor },
  });
  assert.deepEqual(inspected.sourceAfter, {
    live: true, sessionId: SESSION_ID, cycle: 1, revision: 15, groupId: 'native-fleet-7',
  });
  assert.equal(inspected.rendered.resultStatus, 'committed');
  assert.equal(inspected.rendered.visible, false,
    'The real successful counter source currently has no status message that this fixture can render.');

  const outcome = evaluateProcedureCapture({
    caseId: 'gm:applyShipCounterSteps',
    expected: recipe.expected,
    offered: true,
    mountedUi: true,
    actorBefore: { ...fixture.actor },
    actorAfter: { ...fixture.actor },
    sourceBefore: {
      live: true, sessionId: SESSION_ID, cycle: sourceBefore.cycle,
      revision: sourceBefore.vesselActionRevisions.aegis, groupId: sourceBefore.shipFleetGroupIds.aegis,
    },
    sourceAfter: inspected.sourceAfter,
    request,
    response: { httpStatus: 200, result, exactReplay: true },
    replay: { status: 'committed', result: structuredClone(result) },
    rendered: inspected.rendered,
    trainingChoice: recipe.trainingChoice,
    randomOutcomeForced: false,
    randomOutcomeRecorded: false,
  });
  assert.equal(outcome.status, 'completed',
    'A source-shaped successful one-step counter receipt remained pending: ' + JSON.stringify(outcome));
});
