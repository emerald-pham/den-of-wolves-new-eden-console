import assert from 'node:assert/strict';
import { inspectWolfChoicePaint, observeWolfChoiceActor, waitForWolfChoiceReadiness } from './pc10-combat-choice-readiness.mjs';

const rangeSteps = new Set(['long-range', 'medium-range', 'short-range']);
const escortRangeSteps = new Set(['medium-range', 'short-range']);
const attackKeys = ['attackId', 'turn', 'revision', 'status', 'currentStep'];
class SourceAttackChanged extends Error {
  constructor() { super('The original Station attack changed during its current source read.'); }
}

function assertBudget(deadlineAt) {
  assert.ok(Number.isFinite(deadlineAt), 'Station crew dispatch requires the original combat deadline.');
  assert.ok(Date.now() < deadlineAt, 'Original Station crew choice deadline expired; no reload, mutation, or new deadline.');
}

function sameAttack(current, expected) {
  return current && attackKeys.every(key => current[key] === expected[key]) && current.threatSiteCode === 'P';
}

function routePath(page) {
  const url = new URL(page.url());
  return url.hash.startsWith('#/') ? new URL(url.hash.slice(1), url.origin).pathname : url.pathname;
}

function roleActor(actors, roleId) {
  return actors.find(actor => actor.roleId === roleId);
}

function button(panel, name) {
  return panel.getByRole('button', { name, ...(typeof name === 'string' ? { exact: true } : {}) });
}

async function enabledControl(control) {
  return await control.isVisible() && await control.isEnabled();
}

function sourceFor(spec) {
  return {
    'pdf-launch': { endpoint: 'getPdfEscortWingLaunch', fields: {} },
    'escort-range': { endpoint: 'getWolfEscortRangeActionChoice', fields: { range: spec.range, sourceId: spec.sourceId } },
    'range-support': { endpoint: 'getWolfRangeSupportActionChoice', fields: { range: spec.range, sourceId: spec.sourceId } },
    'boarding-special': { endpoint: 'getWolfBoardingSpecialChoice', fields: {} },
    'boarding-defence': { endpoint: 'getWolfBoardingDefenceChoice', fields: {} },
  }[spec.kind];
}

function validateSourceView(view, spec, current, sessionId) {
  assert.ok(view && typeof view === 'object', `Current ${spec.kind} browser SDK view is required.`);
  assert.equal(view.sessionId, sessionId, `Current ${spec.kind} source session must match the original session.`);
  if (view.type?.endsWith('-unavailable')) {
    const reasons = spec.kind === 'boarding-special'
      ? ['not-your-choice', 'automatic-progress-pending', 'no-special-choice']
      : spec.kind === 'boarding-defence' ? ['no-boarders', 'not-your-choice'] : [];
    assert.ok(reasons.includes(view.reason), `Unknown ${spec.kind} unavailable reason: ${view.reason ?? '(missing)'}.`);
    return view;
  }
  assert.equal(view.turn, current.turn, `Current ${spec.kind} source turn must match the original attack.`);
  assert.equal(view.revision, current.revision, `Current ${spec.kind} source revision must match the original attack.`);
  if (Object.hasOwn(view, 'attackId')) assert.equal(view.attackId, current.attackId,
    `Current ${spec.kind} source attackId must match the original attack.`);
  if (Object.hasOwn(view, 'currentStep')) assert.equal(view.currentStep, current.currentStep);
  if (Object.hasOwn(view, 'range')) assert.equal(view.range, current.currentStep,
    `Current ${spec.kind} source range must match the original attack step.`);

  if (spec.kind === 'pdf-launch') {
    assert.equal(view.type, 'pdf-escort-wing-launch-view', 'Unknown current PDF Escort Wing launch view type.');
    assert.equal(typeof view.eligible, 'boolean'); assert.equal(typeof view.launched, 'boolean');
    assert.ok(Number.isSafeInteger(view.wingRevision) && view.wingRevision >= 0,
      'Current PDF Escort Wing revision is required.');
    const reasons = ['waiting', 'uncharged', 'damaged', 'destroyed', 'no-fighters', 'already-launched', 'passed'];
    if (view.reason !== undefined) assert.ok(reasons.includes(view.reason), `Unknown current PDF launch reason: ${view.reason}.`);
    const statuses = ['launched', 'passed', 'unavailable'];
    if (view.choiceStatus !== undefined) assert.ok(statuses.includes(view.choiceStatus),
      `Unknown current PDF launch status: ${view.choiceStatus}.`);
  } else if (spec.kind === 'escort-range') {
    assert.equal(view.type, 'wolf-fighter-range-action-view', 'Unknown current PDF escort range view type.');
    assert.equal(view.wingId, 'pdf-escort-fighter-wing', 'Current escort view must belong to the P.D.F. wing.');
    assert.equal(view.wingLabel, 'P.D.F. Escort Fighter Wing');
    assert.ok(['pending', 'committed'].includes(view.choiceStatus), `Unknown current PDF escort choice status: ${view.choiceStatus}.`);
    assert.ok(Array.isArray(view.fighters) && Array.isArray(view.targets), 'Current PDF escort fighters and targets are required.');
  } else if (spec.kind === 'range-support') {
    assert.equal(view.type, 'wolf-range-support-action-choice-view', 'Unknown current Highwall range view type.');
    assert.equal(view.sourceId, 'highwall', 'Current range support view must belong to Highwall.');
    assert.equal(view.actorRoleId, 'icebreaker-miner', 'Current Highwall view must name its printed Miner owner.');
    assert.ok(['pending', 'used', 'passed'].includes(view.choiceStatus), `Unknown current Highwall choice status: ${view.choiceStatus}.`);
    assert.equal(typeof view.eligible, 'boolean'); assert.equal(typeof view.actionAvailable, 'boolean');
  } else if (spec.kind === 'boarding-special') {
    assert.equal(view.type, 'wolf-boarding-special-choice-view', 'Unknown current boarding special view type.');
    const kinds = ['commander', 'relocation', 'militia', 'reroll', 'commander-ruling'];
    assert.ok(kinds.includes(view.choice?.kind),
      `Unknown current boarding special choice kind: ${view.choice?.kind ?? '(missing)'}`);
    if (view.choice.kind === 'commander-ruling') {
      assert.ok(typeof view.choice.targetShipId === 'string' && view.choice.targetShipId,
        'Current facilitator ruling target is required.');
    }
  } else if (spec.kind === 'boarding-defence') {
    assert.equal(view.type, 'wolf-boarding-defence-choice-view', 'Unknown current boarding defence view type.');
    assert.ok(['pending', 'committed'].includes(view.choiceStatus),
      `Unknown current boarding defence choice status: ${view.choiceStatus}.`);
    assert.ok(Number.isSafeInteger(view.availableSecurityTeams) && view.availableSecurityTeams >= 0,
      'Current boarding Security Team inventory is required.');
  }
  return view;
}

async function inspectSourcePaint(page, spec, view) {
  const painted = await inspectWolfChoicePaint(page, spec, view);
  if (painted.status !== 'pending') return painted;

  // The reviewed shared painter does not yet name these two known, inert
  // notices. They are still real current views and can be skipped only when
  // the matching text is actually painted by the corresponding source panel.
  if (spec.kind === 'pdf-launch' && view.reason === 'waiting') {
    const panel = page.locator('[aria-label="PDF Escort Wing launch control"]');
    if (await panel.isVisible() && /Waiting for an active Wolf Attack targeting window\./.test(await panel.innerText()))
      return { status: 'blocked', reason: 'waiting', explicit: true };
  }
  if (spec.kind === 'boarding-special' && view.reason === 'automatic-progress-pending') {
    const panel = page.getByRole('region', { name: 'Boarding decision', exact: true });
    if (await panel.isVisible() && /server is locking the committed defence dice/i.test(await panel.innerText()))
      return { status: 'blocked', reason: 'automatic-progress-pending', explicit: true };
  }
  return painted;
}

async function readySource(current, actor, spec, { sessionId, deadlineAt, assertActor, readAttack }) {
  const surface = actor.surface;
  const source = sourceFor(spec);
  assert.ok(source && typeof surface.callable === 'function', 'An original browser SDK source reader is required.');
  const fence = async () => {
    assertBudget(deadlineAt);
    await assertActor(actor, { current, deadlineAt });
    assertBudget(deadlineAt);
  };
  const inspectActor = async () => {
    await fence();
    const observed = await observeWolfChoiceActor(surface);
    assertBudget(deadlineAt);
    return observed;
  };
  const original = await inspectActor();
  const expected = { ...current, sessionId };
  const inspectAttack = async () => {
    assertBudget(deadlineAt);
    const attack = await readAttack();
    assertBudget(deadlineAt);
    return attack;
  };
  const readChoice = async () => {
    await fence();
    if (!sameAttack(await inspectAttack(), current)) throw new SourceAttackChanged();
    const timeoutMs = Math.min(35_000, deadlineAt - Date.now());
    assert.ok(timeoutMs > 0, 'Original Station deadline expired before its browser SDK source read.');
    const payload = { sessionId, ...source.fields,
      ...(spec.kind === 'boarding-special' && original.playerRole === 'gm'
        ? { instanceId: original.instanceId } : {}) };
    if (spec.kind === 'boarding-special' && original.playerRole === 'gm')
      assert.ok(typeof original.instanceId === 'string' && original.instanceId,
        'Original facilitator instance is required for the source read.');
    const reply = await surface.callable(source.endpoint, payload, timeoutMs);
    assertBudget(deadlineAt);
    await fence();
    if (!sameAttack(await inspectAttack(), current)) throw new SourceAttackChanged();
    if (reply?.status !== 'committed') {
      throw new Error(typeof reply?.message === 'string' ? reply.message
        : `Read-only ${source.endpoint} did not return a successful original-browser SDK reply.`);
    }
    return validateSourceView(reply.result, spec, current, sessionId);
  };
  try {
    return await waitForWolfChoiceReadiness({ original, expected,
      inspectActor, inspectAttack, readChoice, deadlineAt,
      requireBoardingDiscovery: spec.kind === 'boarding-defence',
      inspectPaint: view => inspectSourcePaint(surface.page, spec, view),
    });
  } catch (error) {
    if (error instanceof SourceAttackChanged) return { status: 'source-changed', expected, gameplayCredit: false };
    throw error;
  }
}

function resultStatus(capture) {
  return capture?.result?.status;
}

async function commitUiChoice(current, actor, endpoint, choose, expectedRequest, context) {
  const { sessionId, deadlineAt, assertActor, readAttack, action } = context;
  const surface = actor.surface;
  assertBudget(deadlineAt);
  await assertActor(actor, { current, deadlineAt });
  if (!sameAttack(await readAttack(), current)) return { sourceChanged: true };
  assertBudget(deadlineAt);
  const capture = await action(surface, endpoint, async () => {
    assertBudget(deadlineAt);
    await choose({ timeout: Math.max(1, deadlineAt - Date.now()) });
    assertBudget(deadlineAt);
  }, { deadlineAt, expectedRequest, roleId: actor.roleId, current });
  assertBudget(deadlineAt);
  await assertActor(actor, { current, deadlineAt });
  if (capture?.endpoint !== undefined) assert.equal(capture.endpoint, endpoint, 'Captured Station UI endpoint changed.');
  if (capture?.data && typeof capture.data === 'object') {
    for (const [key, value] of Object.entries(expectedRequest))
      assert.deepEqual(capture.data[key], value, `Captured Station UI request ${key} changed from its current source view.`);
  }
  assert.ok(['committed', 'replayed'].includes(resultStatus(capture)),
    `Actual ${endpoint} UI result did not carry a committed or replayed source receipt.`);
  return { committed: true };
}

async function dispatchPdfLaunch(current, actor, context) {
  const ready = await readySource(current, actor, { kind: 'pdf-launch' }, context);
  if (ready.status === 'source-changed') return { sourceChanged: true };
  if (ready.status !== 'eligible') return undefined;
  const panel = actor.surface.page.locator('[aria-label="PDF Escort Wing launch control"]');
  const launch = button(panel, 'Launch PDF Escort Wing');
  const pass = button(panel, 'Pass PDF Escort Wing');
  const selected = await enabledControl(launch) ? launch : await enabledControl(pass) ? pass : null;
  assert.ok(selected, 'Current eligible PDF Escort Wing launch has no enabled Launch or explicit Pass control.');
  const isLaunch = selected === launch;
  const endpoint = isLaunch ? 'launchPdfEscortWing' : 'passWolfFighterLaunchChoice';
  const view = ready.choice;
  const expectedRequest = { sessionId: context.sessionId, expectedTurn: view.turn,
    expectedRevision: view.revision, expectedWingRevision: view.wingRevision,
    ...(isLaunch ? {} : { sourceId: 'pdf-escort-fighter-wing' }) };
  return commitUiChoice(current, actor, endpoint, ({ timeout }) => selected.click({ timeout }), expectedRequest, context);
}

async function selectHighwallConsole(current, actor, context) {
  const page = actor.surface.page;
  const pathname = routePath(page);
  if (pathname === '/shuttles/highwall') return;
  const link = page.getByRole('link', { name: 'Open Highwall shuttle console', exact: true });
  assertBudget(context.deadlineAt);
  await actorFence(actor, current, context);
  await link.waitFor({ state: 'visible', timeout: Math.max(1, context.deadlineAt - Date.now()) });
  assertBudget(context.deadlineAt);
  await link.click({ timeout: Math.max(1, context.deadlineAt - Date.now()) });
  assertBudget(context.deadlineAt);
  await actorFence(actor, current, context);
}

async function returnFromHighwallConsole(current, actor, context) {
  const page = actor.surface.page;
  if (actor.roleId !== 'icebreaker-miner' || routePath(page) !== '/shuttles/highwall') return;
  const link = page.getByRole('link', { name: 'Back to assigned console', exact: true });
  await actorFence(actor, current, context);
  await link.waitFor({ state: 'visible', timeout: Math.max(1, context.deadlineAt - Date.now()) });
  assertBudget(context.deadlineAt);
  await link.click({ timeout: Math.max(1, context.deadlineAt - Date.now()) });
  assertBudget(context.deadlineAt);
  await actorFence(actor, current, context);
}

async function actorFence(actor, current, context) {
  assertBudget(context.deadlineAt);
  await context.assertActor(actor, { current, deadlineAt: context.deadlineAt });
  assertBudget(context.deadlineAt);
}

async function dispatchHighwallRange(current, actor, context) {
  await selectHighwallConsole(current, actor, context);
  const spec = { kind: 'range-support', sourceId: 'highwall', range: current.currentStep };
  const ready = await readySource(current, actor, spec, context);
  if (ready.status === 'source-changed') return { sourceChanged: true };
  if (ready.status !== 'eligible') return undefined;
  const rangeLabel = { 'long-range': 'Long Range', 'medium-range': 'Medium Range', 'short-range': 'Short Range' }[current.currentStep];
  assert.ok(rangeLabel, `Unknown current Highwall range: ${current.currentStep}.`);
  const panel = actor.surface.page.getByRole('region', { name: `Highwall Cannon ${rangeLabel} choice`, exact: true });
  const use = button(panel, 'Use Highwall Cannon');
  const pass = button(panel, 'Pass this range');
  const canUse = ready.choice.actionAvailable && await enabledControl(use);
  const selected = canUse ? use : await enabledControl(pass) ? pass : null;
  assert.ok(selected, 'Current eligible Highwall range has no enabled Use or explicit Pass control.');
  const using = selected === use;
  return commitUiChoice(current, actor, 'commitWolfRangeSupportActionChoice',
    ({ timeout }) => selected.click({ timeout }),
    { sessionId: context.sessionId, expectedTurn: ready.choice.turn, expectedRevision: ready.choice.revision,
      range: ready.choice.range, sourceId: ready.choice.sourceId, use: using }, context);
}

async function dispatchPdfEscortRange(current, actor, context) {
  if (!escortRangeSteps.has(current.currentStep)) return undefined;
  const spec = { kind: 'escort-range', sourceId: 'pdf-escort-fighter-wing', range: current.currentStep };
  const ready = await readySource(current, actor, spec, context);
  if (ready.status === 'source-changed') return { sourceChanged: true };
  if (ready.status !== 'eligible') return undefined;
  const rangeLabel = current.currentStep === 'medium-range' ? 'Medium Range' : 'Short Range';
  const panel = actor.surface.page.getByRole('region', {
    name: `P.D.F. Escort Fighter Wing ${rangeLabel} actions`, exact: true,
  });
  const pass = button(panel, `Pass ${rangeLabel}`);
  const view = ready.choice;
  if (current.currentStep === 'medium-range') {
    assert.ok(Array.isArray(view.fighters) && Array.isArray(view.targets), 'Current PDF Medium fighter and target rows are required.');
    const actionControls = panel.getByRole('combobox', { name: /^Fighter \d+ action$/ });
    const count = await actionControls.count();
    assert.equal(count, view.fighters.length, 'Rendered PDF Medium fighter controls must match the current source view.');
    let canResolve = view.fighters.length > 0 && view.targets.length > 0;
    const actions = [];
    for (let index = 0; index < view.fighters.length && canResolve; index++) {
      const fighter = view.fighters[index];
      assert.ok(Number.isSafeInteger(fighter?.fighterIndex) && fighter.fighterIndex >= 0,
        'Current PDF fighter index is malformed.');
      const actionControl = actionControls.nth(index);
      const targetControl = panel.getByRole('combobox', {
        name: `Fighter ${fighter.fighterIndex + 1} target`, exact: true,
      });
      if (!(await enabledControl(actionControl)))
        throw new Error(`Current PDF Medium action control for fighter ${fighter.fighterIndex + 1} is not enabled.`);
      const target = view.targets[index % view.targets.length];
      assert.ok(typeof target?.instanceId === 'string' && target.instanceId,
        'Current PDF Medium target must come from the ordinary escort source view.');
      await actionControl.selectOption('attack', { timeout: Math.max(1, context.deadlineAt - Date.now()) });
      if (!(await enabledControl(targetControl)))
        throw new Error(`Current PDF Medium target control for fighter ${fighter.fighterIndex + 1} did not enable after choosing an action.`);
      await targetControl.selectOption(target.instanceId, { timeout: Math.max(1, context.deadlineAt - Date.now()) });
      actions.push({ kind: 'attack', targetContactId: target.instanceId, fighterIndex: fighter.fighterIndex });
      assertBudget(context.deadlineAt);
    }
    const resolve = button(panel, 'Resolve Medium actions');
    if (canResolve) assert.ok(await enabledControl(resolve), 'Current selected PDF Medium actions need their enabled resolution control.');
    const selected = canResolve ? resolve : pass;
    assert.ok(await enabledControl(selected), 'Current PDF Medium choice has no enabled resolution or explicit Pass control.');
    return commitUiChoice(current, actor, 'commitWolfEscortRangeActionChoice',
      ({ timeout }) => selected.click({ timeout }),
      { sessionId: context.sessionId, expectedTurn: view.turn, expectedRevision: view.revision,
        range: view.range, sourceId: 'pdf-escort-fighter-wing', actions: canResolve ? actions : [] }, context);
  }

  assert.ok(Array.isArray(view.fighters), 'Current PDF Short fighter rows are required.');
  const boxes = await panel.getByRole('checkbox', { name: /^Fighter \d+ Short attack$/ }).all();
  assert.equal(boxes.length, view.fighters.length, 'Rendered PDF Short fighter controls must match the current source view.');
  if (view.fighters.length === 0) {
    assert.ok(await enabledControl(pass), 'Current PDF Short range needs its explicit pass control.');
    return commitUiChoice(current, actor, 'commitWolfEscortRangeActionChoice',
      ({ timeout }) => pass.click({ timeout }),
      { sessionId: context.sessionId, expectedTurn: view.turn, expectedRevision: view.revision,
        range: view.range, sourceId: 'pdf-escort-fighter-wing', fighterIndexes: [] }, context);
  }
  const fighterIndexes = view.fighters.map(({ fighterIndex }) => fighterIndex);
  assert.ok(fighterIndexes.every(index => Number.isSafeInteger(index) && index >= 0) &&
    new Set(fighterIndexes).size === fighterIndexes.length, 'Current PDF Short fighter indexes must be distinct non-negative integers.');
  for (const box of boxes) {
    if (!(await enabledControl(box))) throw new Error('Current PDF Short fighter control is not enabled.');
    await box.check({ timeout: Math.max(1, context.deadlineAt - Date.now()) });
    assertBudget(context.deadlineAt);
  }
  const resolve = button(panel, 'Resolve selected Short attacks');
  assert.ok(await enabledControl(resolve), 'Selected current PDF Short fighters need their visible resolution control.');
  return commitUiChoice(current, actor, 'commitWolfEscortRangeActionChoice',
    ({ timeout }) => resolve.click({ timeout }),
    { sessionId: context.sessionId, expectedTurn: view.turn, expectedRevision: view.revision,
      range: view.range, sourceId: 'pdf-escort-fighter-wing', fighterIndexes: fighterIndexes.sort((a, b) => a - b) }, context);
}

function specialChoice(view) {
  const choice = view.choice;
  switch (choice.kind) {
    case 'commander':
      return { label: 'Do not lead', command: { kind: 'commander', targetShipId: null } };
    case 'relocation':
      return { label: /^Stay at /, command: { kind: 'relocation', craftId: choice.craftId,
        targetShipId: null, expectedControlRevision: choice.controlRevision } };
    case 'militia':
      return { label: 'Commit Militia risk', command: { kind: 'militia', targetShipId: choice.targetShipId,
        militiaDoubleTeams: false, militiaFrontLineDice: 0 } };
    case 'reroll':
      return { label: 'Pass rerolls', command: { kind: 'reroll', source: choice.source,
        targetShipId: choice.targetShipId, dieIndexes: [] } };
    case 'commander-ruling':
      throw new Error('Current boarding requires an explicit facilitator ruling; the dispatcher cannot invent one.');
    default:
      throw new Error(`Unknown current boarding special choice kind: ${choice?.kind ?? '(missing)'}.`);
  }
}

async function dispatchBoardingSpecial(current, actor, context) {
  await returnFromHighwallConsole(current, actor, context);
  const ready = await readySource(current, actor, { kind: 'boarding-special' }, context);
  if (ready.status === 'source-changed') return { sourceChanged: true };
  if (ready.status !== 'eligible') return undefined;
  const selected = specialChoice(ready.choice);
  const panel = actor.surface.page.getByRole('region', { name: 'Current boarding special choice', exact: true });
  const control = button(panel, selected.label);
  assert.ok(await enabledControl(control), `Current ${ready.choice.choice.kind} boarding control is not enabled.`);
  return commitUiChoice(current, actor, 'commitWolfBoardingSpecialChoice',
    ({ timeout }) => control.click({ timeout }),
    { sessionId: context.sessionId, expectedTurn: ready.choice.turn, expectedRevision: ready.choice.revision,
      choice: selected.command }, context);
}

async function dispatchBoardingDefence(current, actor, context) {
  const ready = await readySource(current, actor, { kind: 'boarding-defence' }, context);
  if (ready.status === 'source-changed') return { sourceChanged: true };
  if (ready.status !== 'eligible') return undefined;
  const view = ready.choice;
  const panel = actor.surface.page.getByRole('region', {
    name: `${view.targetShipId.replaceAll('-', ' ').toUpperCase()} boarding defence`, exact: true,
  });
  const teams = panel.getByRole('combobox');
  assert.ok(await teams.count(), 'Current discovered boarding ship needs a visible Security Teams choice.');
  assert.ok(await enabledControl(teams), 'Current boarding Security Teams choice is not enabled.');
  const available = await teams.locator('option').evaluateAll(nodes => nodes.filter(node => node.value && !node.disabled)
    .map(node => ({ value: node.value, count: Number(node.value) })));
  assert.ok(available.length > 0, 'Current boarding view must offer an explicit Security Teams count including zero.');
  assert.ok(available.every(option => Number.isSafeInteger(option.count) && String(option.count) === option.value &&
    option.count >= 0 && option.count <= view.availableSecurityTeams),
  `Boarding options exceed current source inventory: ${JSON.stringify({ available, inventory: view.availableSecurityTeams })}.`);
  const offeredCounts = [...new Set(available.map(option => option.count))].sort((a, b) => a - b);
  assert.deepEqual(offeredCounts, Array.from({ length: view.availableSecurityTeams + 1 }, (_, count) => count),
    'Boarding must offer every explicit Security Teams count from zero through current inventory.');
  const securityTeams = offeredCounts.at(-1);
  await teams.selectOption(String(securityTeams), { timeout: Math.max(1, context.deadlineAt - Date.now()) });
  assertBudget(context.deadlineAt);
  const commit = button(panel, 'Commit defence');
  assert.ok(await enabledControl(commit), 'Selected current boarding defence needs its enabled commit control.');
  return commitUiChoice(current, actor, 'commitWolfBoardingDefenceChoice',
    ({ timeout }) => commit.click({ timeout }),
    { sessionId: context.sessionId, expectedTurn: view.turn, expectedRevision: view.revision,
      targetShipId: view.targetShipId, securityTeams }, context);
}

/**
 * Make at most one ordinary UI choice on a live P attack. The existing
 * Wing-owned launch/range route remains with the caller; this extension covers
 * the PDF escort, Highwall, and every supplied current boarding actor.
 *
 * `assertActor(actor, { current, deadlineAt })` must fence that cohort member.
 * `action(surface, endpoint, choose, { deadlineAt, expectedRequest, ... })`
 * must return its captured actual UI receipt; only a committed receipt earns
 * `{ committed: true }` here.
 */
export async function dispatchStationCrewChoice(current, {
  actors = [], sessionId, deadlineAt, assertActor, readAttack, action,
} = {}) {
  if (!current || current.status !== 'declared' || current.threatSiteCode !== 'P') return undefined;
  assert.ok(['targeting', ...rangeSteps, 'boarding'].includes(current.currentStep),
    `Unknown current P attack step: ${current.currentStep ?? '(missing)'}.`);
  assert.ok(typeof sessionId === 'string' && sessionId, 'The original Station session ID is required.');
  assert.ok(Number.isSafeInteger(current.turn) && Number.isSafeInteger(current.revision) && current.revision >= 1,
    'The original Station attack turn and revision are required.');
  assertBudget(deadlineAt);
  assert.ok(Array.isArray(actors), 'Station crew actors must be an array.');
  assert.ok(typeof assertActor === 'function', 'The parent-owned current-member actor fence is required.');
  assert.ok(typeof readAttack === 'function', 'The original live Station attack reader is required.');
  assert.ok(typeof action === 'function', 'The original UI action receipt callback is required.');
  const context = { sessionId, deadlineAt, assertActor, readAttack, action };
  const live = await readAttack();
  assertBudget(deadlineAt);
  if (!sameAttack(live, current)) return undefined;

  if (current.currentStep === 'targeting') {
    const pdf = roleActor(actors, 'refinery-124-pdf-colonel');
    if (!pdf) return undefined;
    const result = await dispatchPdfLaunch(current, pdf, context);
    return result?.sourceChanged ? undefined : result;
  }
  if (rangeSteps.has(current.currentStep)) {
    if (current.currentStep !== 'long-range') {
      const pdf = roleActor(actors, 'refinery-124-pdf-colonel');
      if (pdf) {
        const result = await dispatchPdfEscortRange(current, pdf, context);
        if (result?.sourceChanged) return undefined;
        if (result?.committed || result === undefined && Date.now() >= deadlineAt) return result;
      }
    }
    const miner = roleActor(actors, 'icebreaker-miner');
    if (!miner) return undefined;
    const result = await dispatchHighwallRange(current, miner, context);
    return result?.sourceChanged ? undefined : result;
  }

  for (const actor of actors) {
    if (!actor || typeof actor.roleId !== 'string' || !actor.roleId || !actor.surface)
      throw new TypeError('Each supplied Station combat actor needs a roleId and its original browser surface.');
    if (actor.roleId === 'press-officer') continue;
    const special = await dispatchBoardingSpecial(current, actor, context);
    if (special?.sourceChanged) return undefined;
    if (special?.committed) return special;
    const defence = await dispatchBoardingDefence(current, actor, context);
    if (defence?.sourceChanged) return undefined;
    if (defence?.committed) return defence;
  }
  return undefined;
}
