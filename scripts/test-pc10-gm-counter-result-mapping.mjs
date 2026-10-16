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
    locator(selector) {
      const tagName = String(selector).toLowerCase();
      return locatorFor(nodes.flatMap(node => descendants(node)).filter(node =>
        node.tagName?.toLowerCase() === tagName));
    },
    async innerText() {
      assert.equal(nodes.length, 1, 'Expected one mounted source node before reading visible text.');
      return nodes[0].textContent ?? nodes[0].name;
    },
    async waitFor({ state = 'visible' } = {}) {
      assert.equal(state, 'visible');
      assert.equal(nodes.length, 1, 'Expected one mounted source node while waiting for visible text.');
      assert.equal(nodes[0].visible !== false, true);
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

function element(role, name, { attributes = {}, children = [], enabled = true, click, textContent,
  tagName = role === 'listitem' ? 'LI' : role === 'strong' ? 'STRONG' : undefined } = {}) {
  return { role, name, attributes, children, enabled, click, textContent, tagName };
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
  const resourceRows = new Map();
  const counter = (resourceId, label, direction, row, amountNode) => element('button', direction + ' ' + label, {
    attributes: { 'aria-label': direction + ' ' + label },
    enabled: () => writeMode && (direction === 'Increase' || state.shipResources.aegis[resourceId] > 0),
    click() {
      const step = direction === 'Increase' ? 1 : -1;
      const beforeVisible = row.attributes['aria-label']?.match(/^.+: ([0-9,]+)$/)?.[1];
      selected.counter = {
        resourceId, label, step, before: state.shipResources.aegis[resourceId],
        beforeVisibleAmount: Number(beforeVisible?.replaceAll(',', '')),
        beforeRevision: state.vesselActionRevisions.aegis,
        groupId: state.shipFleetGroupIds.aegis,
        groupLabel: 'AEGIS resource controls',
      };
      actions.push(direction + ':' + label);
      state.shipResources.aegis[resourceId] += step;
      state.vesselActionRevisions.aegis += 1;
      const amount = String(state.shipResources.aegis[resourceId]);
      row.name = label + ': ' + amount;
      row.attributes['aria-label'] = row.name;
      amountNode.name = amount;
      amountNode.textContent = amount;
    },
  });
  const resourceRowElements = RESOURCE_LABELS.map(([resourceId, label]) => {
    const amount = String(state.shipResources.aegis[resourceId]);
    const row = element('listitem', label + ': ' + amount, {
      attributes: { 'aria-label': label + ': ' + amount },
    });
    const amountNode = element('strong', amount, { textContent: amount });
    const buttons = [counter(resourceId, label, 'Decrease', row, amountNode),
      counter(resourceId, label, 'Increase', row, amountNode)];
    row.children = [
      element('generic', label, { textContent: label }),
      element('generic', 'Strytium counter controls', { children: [buttons[0], amountNode, buttons[1]] }),
    ];
    resourceRows.set(resourceId, row);
    return row;
  });
  const group = element('group', 'AEGIS resource controls', {
    attributes: { 'aria-label': 'AEGIS resource controls' },
    children: resourceRowElements,
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
  return { actions, actor, context, game, lifecycle, surface, state, selected, resourceRows };
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

function fixtureCounterSourceWitness(fixture, sourceBefore, recipe) {
  const selected = fixture.selected.counter;
  const row = fixture.resourceRows.get(selected.resourceId);
  const afterVisible = row.attributes['aria-label']?.match(/^.+: ([0-9,]+)$/)?.[1];
  return {
    kind: 'gm-counter-source-witness-v1',
    sessionId: SESSION_ID,
    instanceId: INSTANCE_ID,
    uidHash: GM_UID_HASH,
    claimedAt: CLAIMED_AT,
    connectionGeneration: fixture.lifecycle.generation,
    hydrationRevision: fixture.lifecycle.hydrationRevision,
    actorRoleId: fixture.lifecycle.activeConsoleRoleId,
    phase: sourceBefore.phase,
    cycle: sourceBefore.cycle,
    shipId: recipe.expected.shipId,
    groupId: selected.groupId,
    groupLabel: selected.groupLabel,
    resourceId: selected.resourceId,
    resourceLabel: selected.label,
    step: selected.step,
    beforeAmount: sourceBefore.shipResources.aegis[selected.resourceId],
    beforeVisibleAmount: selected.beforeVisibleAmount,
    beforeRevision: selected.beforeRevision,
    afterAmount: fixture.state.shipResources.aegis[selected.resourceId],
    afterVisibleAmount: Number(afterVisible?.replaceAll(',', '')),
    afterRevision: fixture.state.vesselActionRevisions.aegis,
  };
}

async function makeCounterCapture() {
  const fixture = makeFixture();
  const { recipe, sourceBefore } = await makePreparedCounter(fixture);
  const selected = fixture.selected.counter;
  const requestId = 'native-gm-counter-one-step';
  const request = {
    sessionId: SESSION_ID,
    instanceId: INSTANCE_ID,
    shipId: recipe.expected.shipId,
    counter: 'resource',
    steps: [selected.step],
    requestId,
    expectedRevision: recipe.expected.sourceRevision,
    resourceId: selected.resourceId,
  };
  const result = {
    amount: selected.before + selected.step,
    appliedSteps: [selected.step],
    alertRaised: false,
    sessionId: SESSION_ID,
    instanceId: INSTANCE_ID,
    shipId: recipe.expected.shipId,
    counter: 'resource',
    resourceId: selected.resourceId,
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
  const inspected = await recipe.inspect({
    surface: fixture.surface,
    result,
    request,
    actorAfter: { ...fixture.actor },
  });
  const counterSourceWitness = fixtureCounterSourceWitness(fixture, sourceBefore, recipe);
  const proofInput = {
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
    counterSourceWitness,
    request,
    response: { httpStatus: 200, result, exactReplay: true },
    replay: { status: 'committed', result: structuredClone(result) },
    rendered: inspected.rendered,
    trainingChoice: recipe.trainingChoice,
    randomOutcomeForced: false,
    randomOutcomeRecorded: false,
  };
  return { fixture, recipe, selected, request, result, inspected, counterSourceWitness, proofInput };
}

test('the statusless result fixture matches the current GM UI, service, and callable source contract', async () => {
  const gmUi = await readFile(new URL('../src/routes/GmConsole.tsx', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/lib/sessionService.ts', import.meta.url), 'utf8');
  const functionsSource = await readFile(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  const batchSource = await readFile(new URL('../functions/src/shipCounterBatch.ts', import.meta.url), 'utf8');
  const resources = await readFile(new URL('../src/data/resources.ts', import.meta.url), 'utf8');

  assert.match(gmUi, /onClick=\{\(\) => stageCounterChange\(target, amount, -1\)\}/);
  assert.match(gmUi, /onClick=\{\(\) => stageCounterChange\(target, amount, 1\)\}/);
  assert.match(gmUi, /aria-label=\{counter\.staged\?\.stale[\s\S]*?visibleAmount\}/);
  assert.match(gmUi, /<strong>\{visibleAmount\}<\/strong>/);
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

test('the default counter recipe binds the selected mounted counter and visible source result', async () => {
  const { fixture, recipe, selected, inspected, counterSourceWitness, proofInput } = await makeCounterCapture();
  assert.deepEqual(fixture.actions, ['write-mode', 'Decrease:Strytium Ore']);
  assert.deepEqual(selected, {
    resourceId: 'ore', label: 'Strytium Ore', step: -1, before: 4,
    beforeVisibleAmount: 4, beforeRevision: 14, groupId: 'native-fleet-7',
    groupLabel: 'AEGIS resource controls',
  });
  assert.equal(proofInput.request.shipId, recipe.expected.shipId);
  assert.equal(proofInput.request.instanceId, recipe.expected.instanceId);
  assert.equal(proofInput.request.expectedRevision, recipe.expected.sourceRevision);
  assert.deepEqual(Object.keys(proofInput.response.result).sort(), [
    'actorRoleId', 'actorUid', 'alertRaised', 'amount', 'appliedSteps', 'auditId', 'counter',
    'expectedRevision', 'idempotencyKey', 'instanceId', 'phase', 'requestId', 'resourceId',
    'revision', 'sessionId', 'shipId', 'turn', 'vesselId',
  ]);
  assert.equal(Object.hasOwn(proofInput.response.result, 'status'), false);
  assert.deepEqual(inspected.sourceAfter, {
    live: true, sessionId: SESSION_ID, cycle: 1, revision: 15, groupId: 'native-fleet-7',
  });
  assert.deepEqual(inspected.counterSourceWitness, counterSourceWitness);
  assert.deepEqual(inspected.rendered, {
    kind: 'gm-counter-rendered-source-v1', visible: true, resultStatus: 'committed',
    shipId: 'aegis', groupId: 'native-fleet-7', resourceId: 'ore',
    resourceLabel: 'Strytium Ore', beforeAmount: 4, amount: 3,
  });
});

test('the source-shaped statusless one-step counter receipt is accepted only with its original mounted witness', async () => {
  const { proofInput } = await makeCounterCapture();
  if (proofInput.expected.counterSelection) {
    assert.equal(proofInput.expected.counterSelection.kind, 'gm-counter-selection-v1');
    for (const key of Object.keys(proofInput.expected.counterSelection)) {
      if (key === 'kind') continue;
      assert.equal(proofInput.counterSourceWitness[key], proofInput.expected.counterSelection[key],
        'The post-receipt source witness must retain the initial selected value for ' + key + '.');
    }
  }
  const outcome = evaluateProcedureCapture(proofInput);
  assert.equal(outcome.status, 'completed',
    'A source-shaped successful one-step counter receipt remained pending: ' + JSON.stringify(outcome));
});

test('counter result negatives reject changed tuple, actor, revision, UI, and replay fields', async t => {
  const { proofInput } = await makeCounterCapture();
  const cases = [
    ['request group is not a callable field', input => { input.request.groupId = 'native-fleet-7'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['request session changes', input => { input.request.sessionId = 'foreign-session'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['request GM instance changes', input => { input.request.instanceId = 'foreign-instance'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['request vessel changes', input => { input.request.shipId = 'dione'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['request counter changes', input => { input.request.counter = 'unrest'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['request resource changes', input => { input.request.resourceId = 'water'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['request selected step changes', input => { input.request.steps = [1]; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['request adds a second step', input => { input.request.steps = [-1, -1]; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['request expected revision changes', input => { input.request.expectedRevision += 1; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['request identity changes', input => { input.request.requestId = 'other-request'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['statusful generic committed result cannot bypass the exact counter DTO', input => {
      input.response.result.status = 'committed';
      const witness = input.counterSourceWitness;
      input.rendered = {
        kind: 'gm-counter-rendered-source-v1', visible: true, resultStatus: 'committed',
        shipId: witness.shipId, groupId: witness.groupId, resourceId: witness.resourceId,
        resourceLabel: witness.resourceLabel, beforeAmount: witness.beforeAmount,
        amount: witness.afterAmount,
      };
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result loses the actor UID and cannot fall back to role metadata', input => {
      delete input.response.result.actorUid;
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result has a foreign actor UID', input => { input.response.result.actorUid = 'foreign-actor'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result actor role metadata is malformed', input => { input.response.result.actorRoleId = {}; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result instance changes', input => { input.response.result.instanceId = 'foreign-instance'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result ship and vessel envelope diverge', input => { input.response.result.shipId = 'dione'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result resource changes', input => { input.response.result.resourceId = 'water'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result request identity changes', input => { input.response.result.requestId = 'other-request'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result expected revision changes', input => {
      input.response.result.expectedRevision += 1;
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result reports a different applied step array', input => { input.response.result.appliedSteps = [1]; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result amount differs from the independent visible source amount', input => {
      input.response.result.amount += 1;
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result revision is not the next source revision', input => {
      input.response.result.revision += 1;
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result idempotency key changes', input => { input.response.result.idempotencyKey = 'other'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result audit identity changes', input => { input.response.result.auditId = 'counter-batch-other'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result turn changes', input => { input.response.result.turn += 1; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['result phase changes', input => { input.response.result.phase = 'briefing'; },
      'captured-request-or-server-result-does-not-match-the-source-case'],
    ['source counter witness is for another group', input => {
      input.counterSourceWitness.groupId = 'foreign-group';
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['source counter witness is for another resource label', input => {
      input.counterSourceWitness.resourceLabel = 'Water';
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['source counter witness loses original amount', input => {
      input.counterSourceWitness.beforeAmount += 1;
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['source counter witness current visible amount changes', input => {
      input.counterSourceWitness.afterVisibleAmount += 1;
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['source counter witness GM lifecycle generation changes', input => {
      input.counterSourceWitness.connectionGeneration += 1;
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['source counter witness actor UID changes', input => {
      input.counterSourceWitness.uidHash = '0000000000000000';
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['source counter witness hydration authority changes', input => {
      input.counterSourceWitness.hydrationRevision += 1;
    }, 'captured-request-or-server-result-does-not-match-the-source-case'],
    ['mounted actor loses original GM instance ownership', input => {
      input.actorAfter.gmInstanceOwned = false;
    }, 'original-authenticated-role-or-mounted-control-not-current'],
    ['mounted actor changes GM instance', input => {
      input.actorAfter.instanceId = 'foreign-instance';
    }, 'original-authenticated-role-or-mounted-control-not-current'],
    ['live source changes selected ship group', input => {
      input.sourceAfter.groupId = 'foreign-group';
    }, 'live-source-cycle-revision-or-group-changed'],
    ['exact SDK replay is missing', input => { input.response.exactReplay = false; },
      'exact-original-sdk-retry-not-confirmed'],
    ['exact SDK replay receipt differs', input => { input.replay.result.amount += 1; },
      'exact-retry-receipt-differs'],
    ['source-bound mounted counter value is not visible', input => {
      input.rendered.visible = false;
    }, 'current-result-not-visible-in-the-mounted-control'],
    ['generic status text cannot replace the mounted counter value', input => {
      input.rendered = { visible: true, resultStatus: 'committed' };
    }, 'current-result-not-visible-in-the-mounted-control'],
    ['rendered value cannot diverge from the selected resource witness', input => {
      input.rendered.amount += 1;
    }, 'current-result-not-visible-in-the-mounted-control'],
  ];
  for (const [name, mutate, reason] of cases) {
    await t.test(name, () => {
      const input = structuredClone(proofInput);
      mutate(input);
      const outcome = evaluateProcedureCapture(input);
      assert.equal(outcome.status, 'pending', JSON.stringify(outcome));
      assert.equal(outcome.reason, reason);
    });
  }
});
