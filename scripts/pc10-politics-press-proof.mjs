import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  assertGmInstanceFence,
  assertFreshManualStart,
  captureMountedUiAction,
  blockedSourceBranch,
  enterPreparedRoleStation,
  privateSafeActionReceipt,
  sha256,
} from './pc10-political-crisis-arrest-proof-contracts.mjs';

const ACTION_LABELS = Object.freeze({
  'fleet-policy': 'fleet policy',
  crisis: 'crisis decision',
  'political-capital': 'political capital',
  address: 'presidential address',
  visit: 'presidential visit',
  election: 'election action',
});
const ELECTION_VALUES = Object.freeze({
  votingSystem: ['plurality', 'majority'],
  populationWeighting: ['equal', 'ship-population'],
  campaigning: ['open', 'structured', 'prohibited'],
  supplyUse: ['prohibited', 'facilitator-approved'],
  tieRule: ['current-office-remains', 'facilitator-choice'],
});

/** Validate the human policy and private ballots before opening any one-use control. */
export function validateElectionPlan(choice) {
  assert.ok(choice && typeof choice === 'object' && !Array.isArray(choice));
  const policy = choice.policy;
  assert.ok(policy && typeof policy === 'object' && !Array.isArray(policy),
    'Election choices need an explicit policy object.');
  for (const key of Object.keys(ELECTION_VALUES)) {
    assert.ok(ELECTION_VALUES[key].includes(policy[key]), `Choose a source-defined election ${key}.`);
  }
  assert.equal(typeof policy.vicePresidentEnabled, 'boolean', 'Choose whether to elect a Vice President explicitly.');
  assert.ok(Number.isSafeInteger(policy.openCycle) && policy.openCycle >= 1 &&
    Number.isSafeInteger(policy.closeCycle) && policy.closeCycle >= policy.openCycle,
  'Election cycles must be explicit positive whole cycles with close at or after open.');
  assert.ok(typeof policy.campaignInstructions === 'string' && policy.campaignInstructions.trim().length > 0 &&
    policy.campaignInstructions.length <= 1200, 'Campaign instructions must be an explicit source-bounded decision.');
  const voters = choice.voterRoleIds;
  assert.ok(Array.isArray(voters) && voters.length >= (policy.vicePresidentEnabled ? 3 : 2) &&
    voters.every(value => typeof value === 'string' && value.length > 0) && new Set(voters).size === voters.length,
  'Select distinct real voters; the source requires two voters, or three when electing a Vice President.');
  if (choice.ballotsByRole === undefined) return true;
  const ballots = choice.ballotsByRole;
  assert.ok(ballots && typeof ballots === 'object' && !Array.isArray(ballots));
  assert.deepEqual(Object.keys(ballots).sort(), [...voters].sort(),
    'Provide one independent explicit ballot choice for every configured voter before any ballot is submitted.');
  for (const roleId of voters) {
    const ballot = ballots[roleId];
    assert.ok(ballot && voters.includes(ballot.presidentCandidateRoleId),
      'Every President ballot choice must name an eligible candidate from the current voter set.');
    if (policy.vicePresidentEnabled) {
      assert.ok(voters.includes(ballot.vicePresidentCandidateRoleId) &&
        ballot.vicePresidentCandidateRoleId !== ballot.presidentCandidateRoleId,
      'Each Vice President ballot must select a different eligible candidate.');
    } else assert.equal(ballot.vicePresidentCandidateRoleId, undefined,
      'Do not choose a Vice President when the explicit policy does not elect one.');
  }
  return true;
}

export function validateElectionTieDecision(choice) {
  assert.ok(choice && typeof choice === 'object' && !Array.isArray(choice));
  const allowed = new Set(['presidentCandidateRoleId', 'vicePresidentCandidateRoleId']);
  assert.ok(Object.keys(choice).every(key => allowed.has(key)), 'Unknown election tie decision field.');
  const selected = Object.values(choice);
  assert.ok(selected.length > 0 && selected.every(value => typeof value === 'string' && value.length > 0),
    'Choose an explicit tied candidate role for every offered tie decision.');
  if (choice.presidentCandidateRoleId && choice.vicePresidentCandidateRoleId) {
    assert.notEqual(choice.presidentCandidateRoleId, choice.vicePresidentCandidateRoleId,
      'President and Vice President tie decisions must select distinct candidates.');
  }
  return true;
}

/** Validate the current source-controlled ballot or close window before using its UI. */
export function validateElectionActionCycle(policy, currentCycle, action, currentTurnStatePhase) {
  assert.ok(policy && typeof policy === 'object' && Number.isSafeInteger(policy.openCycle) &&
    Number.isSafeInteger(policy.closeCycle) && policy.openCycle >= 1 && policy.closeCycle >= policy.openCycle,
  'A valid configured election cycle window is required.');
  assert.ok(Number.isSafeInteger(currentCycle) && currentCycle >= 1, 'The current source cycle must be a positive whole cycle.');
  if (action === 'ballot') {
    assert.ok(currentCycle >= policy.openCycle && currentCycle <= policy.closeCycle,
      'The current cycle is outside the configured election ballot window.');
    return true;
  }
  if (action === 'resolve') {
    assert.ok(currentCycle >= policy.closeCycle, 'Election resolution is unavailable before its configured close cycle.');
    if (currentCycle === policy.closeCycle && currentTurnStatePhase === 'team') {
      assert.fail('Election resolution is unavailable until the configured close-cycle Team window ends.');
    }
    return true;
  }
  assert.fail(`Unknown election action: ${action}`);
}

/** Read only an approved public election outcome label from the private command reply. */
export function allowlistedElectionResultState(result) {
  const allowed = new Set(['scheduled', 'open', 'tie-pending', 'resolved', 'no-winner']);
  assert.ok(result && typeof result === 'object' && allowed.has(result.state), 'Unknown election outcome state.');
  return result.state;
}

function required(options, branch) {
  return Array.isArray(options.requiredBranches) && options.requiredBranches.includes(branch);
}

function missingChoice(family, branch, options) {
  return blockedSourceBranch(family, branch, ['explicit-human-choice-not-supplied'], { required: required(options, branch) });
}

async function observedMutation({ family, branch, surface, endpoint, expectedActor, executeUi, groupIdHash,
  simulatedAttendance = false, includeElectionState = false }) {
  const { request, result, replay } = await captureMountedUiAction({ surface, endpoint, expectedActor, executeUi });
  const receipt = privateSafeActionReceipt({ family, branch, endpoint, actor: { uidHash: expectedActor.uidHash, roleId: expectedActor.roleId ?? 'gm' },
    sessionId: expectedActor.sessionId, cycle: expectedActor.cycle, phase: expectedActor.phase,
    request, result, replay, simulatedAttendance, ...(groupIdHash ? { groupIdHash } : {}) });
  return includeElectionState ? Object.freeze({ ...receipt,
    sourceOutcomeState: allowlistedElectionResultState(result) }) : receipt;
}

async function enterSelectedRole(context, roleId) {
  return enterPreparedRoleStation({ crew: context.crew, initial: context.initial, roster: context.roster, roleId });
}

async function demandButton(button, family, branch, options) {
  const shown = await button.isVisible().catch(() => false);
  const enabled = shown && await button.isEnabled().catch(() => false);
  if (!enabled) return blockedSourceBranch(family, branch,
    [shown ? 'source-control-currently-disabled' : 'source-control-not-mounted'],
    { required: required(options, branch) });
  return null;
}

async function runAdmiralDirective(context, text, options) {
  const branch = 'admiral-directive';
  if (!text) return missingChoice('pending-politics-press', branch, options);
  assert.equal(typeof text, 'string'); assert.ok(text.trim().length > 0 && text.length <= 500);
  const { actor } = await enterSelectedRole(context, 'admiral');
  await context.crew.page.getByRole('button', { name: 'Fleet directives', exact: true }).click();
  const section = context.crew.page.getByRole('region', { name: 'Admiral policy and defence coordination', exact: true });
  await section.waitFor();
  const field = section.getByLabel('Fleet policy', { exact: true });
  const button = section.getByRole('button', { name: 'Publish fleet policy', exact: true });
  await field.fill(text);
  const blocked = await demandButton(button, 'pending-politics-press', branch, options);
  if (blocked) return blocked;
  return observedMutation({ family: 'pending-politics-press', branch, surface: context.crew,
    endpoint: 'publishAdmiralDirectiveCommand', expectedActor: actor,
    executeUi: () => button.click() });
}

async function runFleetAlert(context, choice, options) {
  const branch = 'fleet-red-alert';
  if (!choice) return missingChoice('pending-politics-press', branch, options);
  assert.ok(choice === 'raise' || choice === 'stand-down', 'Choose the visible Red Alert action explicitly.');
  const { actor } = await enterSelectedRole(context, 'admiral');
  const section = context.crew.page.getByRole('region', { name: 'FLEETWIDE RED ALERT', exact: true });
  if (!(await section.isVisible().catch(() => false))) {
    return blockedSourceBranch('pending-politics-press', branch, ['admiral-red-alert-control-not-mounted'],
      { required: required(options, branch) });
  }
  const cover = section.getByRole('button', { name: /^(?:OPEN|CLOSE) RED ALERT COMMAND COVER$/ });
  const trigger = section.getByRole('button', { name: choice === 'raise' ? 'RAISE FLEETWIDE RED ALERT' : 'STAND DOWN', exact: true });
  const blocked = await demandButton(cover, 'pending-politics-press', branch, options);
  if (blocked) return blocked;
  if (!(await cover.getAttribute('aria-pressed') === 'true')) await cover.click();
  if (choice === 'raise') {
    const message = options.redAlertMessage;
    if (typeof message !== 'string' || !message.trim()) return missingChoice('pending-politics-press', branch, options);
    await section.getByRole('textbox', { name: 'ALERT MESSAGE', exact: true }).fill(message);
  }
  const triggerBlocked = await demandButton(trigger, 'pending-politics-press', branch, options);
  if (triggerBlocked) return triggerBlocked;
  return observedMutation({ family: 'pending-politics-press', branch, surface: context.crew,
    endpoint: 'setFleetRedAlert', expectedActor: actor,
    executeUi: () => trigger.click() });
}

async function runPresidentAction(context, choice, options) {
  const branch = 'president-action';
  if (!choice) return missingChoice('pending-politics-press', branch, options);
  assert.ok(Object.hasOwn(ACTION_LABELS, choice.kind), 'Use a source-defined President action family.');
  assert.ok(typeof choice.text === 'string' && choice.text.trim().length > 0 && choice.text.length <= 500);
  const roleId = choice.roleId ?? 'dione-president';
  const { actor } = await enterSelectedRole(context, roleId);
  const section = context.crew.page.getByRole('region', { name: 'President workspace', exact: true });
  if (!(await section.isVisible().catch(() => false))) {
    return blockedSourceBranch('pending-politics-press', branch, ['president-workspace-not-mounted-for-current-authority'],
      { required: required(options, branch) });
  }
  const button = section.getByRole('button', { name: `Record ${ACTION_LABELS[choice.kind]}`, exact: true });
  await section.getByLabel('Action family', { exact: true }).selectOption(choice.kind);
  const text = section.getByLabel('Decision record', { exact: true });
  await text.fill(choice.text);
  const blocked = await demandButton(button, 'pending-politics-press', branch, options);
  if (blocked) return blocked;
  return observedMutation({ family: 'pending-politics-press', branch, surface: context.crew,
    endpoint: 'recordPresidentActionCommand', expectedActor: actor,
    executeUi: () => button.click() });
}

async function runPressDispatch(context, choice, options) {
  const branch = 'press-publish-dismiss';
  if (!choice || typeof choice.text !== 'string' || !choice.text.trim()) {
    return missingChoice('pending-politics-press', branch, options);
  }
  assert.ok(choice.text.length <= 220);
  const { actor } = await enterSelectedRole(context, 'press-officer');
  const desk = context.crew.page.getByRole('region', { name: 'Press dispatch desk', exact: true });
  if (!(await desk.isVisible().catch(() => false))) {
    return blockedSourceBranch('pending-politics-press', branch, ['claimed-press-desk-not-currently-mounted'],
      { required: required(options, branch) });
  }
  const publish = desk.getByRole('button', { name: 'Publish dispatch', exact: true });
  await desk.getByLabel('Dispatch', { exact: true }).fill(choice.text);
  const blocked = await demandButton(publish, 'pending-politics-press', branch, options);
  if (blocked) return blocked;
  const published = await observedMutation({ family: 'pending-politics-press', branch, surface: context.crew,
    endpoint: 'publishPressDispatch', expectedActor: actor, executeUi: () => publish.click() });
  const dismiss = desk.getByRole('button', { name: `Dismiss dispatch: SNN // ${choice.text}`, exact: true });
  const dismissBlocked = await demandButton(dismiss, 'pending-politics-press', 'press-dismiss', options);
  if (dismissBlocked) {
    if (required(options, 'press-dismiss')) throw new Error('The newly published Press dispatch did not expose its current dismiss control.');
    return { publish: published, dismiss: dismissBlocked };
  }
  const dismissed = await observedMutation({ family: 'pending-politics-press', branch: 'press-dismiss', surface: context.crew,
    endpoint: 'dismissPressDispatch', expectedActor: actor, executeUi: () => dismiss.click() });
  return { publish: published, dismiss: dismissed };
}

async function actorRosterUids(surface, sessionId) {
  return surface.page.evaluate(async sid => {
    const { readDemoActorRoster } = await import('/src/lib/demoActorProfiles.ts');
    return readDemoActorRoster(sid).map(actor => ({ roleId: actor.roleId, uid: actor.uid }));
  }, sessionId);
}

async function selectVoterActor(context, roleId, expectedCycle) {
  const actor = context.roster.find(entry => entry.roleId === roleId);
  assert.ok(actor, `The voter ${roleId} must be an original prepared roster actor.`);
  await context.crew.page.getByLabel('Current actor', { exact: true }).selectOption(roleId);
  await context.crew.page.waitForURL(url => url.searchParams.get('demoActor') === `${context.initial.sessionId}~${roleId}`);
  const current = await context.crew.until(`Current original election voter ${roleId}`, state => state.sameActor &&
    state.sessionId === context.initial.sessionId && state.uidHash === actor.uidHash && state.profileRoleId === roleId &&
    state.connection === 'live' && state.freshness === 'server' && state.cycle === expectedCycle &&
    state.phase === 'active' && state.turnStatePhase === 'team');
  return { actor: { actorKind: 'player', stationRequired: false, sessionId: context.initial.sessionId,
    uidHash: actor.uidHash, roleId, cycle: expectedCycle, phase: 'active', turnStatePhase: 'team' }, current };
}

async function electionGmRegion(context, expectedGm) {
  const { gm } = context, { page } = gm;
  const deadlineAt = Date.now() + 35_000;
  const remaining = () => {
    const milliseconds = deadlineAt - Date.now();
    assert.ok(milliseconds > 0, 'The original election navigation deadline expired.');
    return milliseconds;
  };
  const verify = async () => {
    remaining();
    const current = await gm.observe();
    assertGmInstanceFence(current, expectedGm);
    if (expectedGm.documentTimeOrigin !== undefined) assert.equal(current.documentTimeOrigin,
      expectedGm.documentTimeOrigin, 'Election navigation retains the original GM document.');
    remaining();
  };
  const route = () => new URL(page.url()).hash.slice(1).split('?')[0];
  const follow = async control => {
    await verify();
    const before = route();
    await control.click({ timeout: remaining() });
    await page.waitForURL(url => url.hash.slice(1).split('?')[0] !== before, { timeout: remaining() });
    await verify();
  };
  await verify();
  const observer = route().match(/^\/ships\/([a-z0-9-]+)\/(?:observer|roles\/[^/]+)$/);
  if (observer) await follow(page.getByRole('link', { name: /^(?:←\s*)?Change role$/ }).and(
    page.locator(`a.ship-console__back[href="#/ships/${observer[1]}/roles"]`)));
  if (/^\/ships\/[^/]+\/roles$/.test(route())) await follow(page.getByRole('link', {
    name: /^(?:←\s*)?Back to fleet$/,
  }).and(page.locator('main.ship-role-select a.session-mode__back[href="#/console"]')));
  if (route() === '/console') await follow(page.getByRole('link', { name: 'GM Console', exact: true }).and(
    page.locator('a.role-card[href="#/gm"]')));
  assert.equal(route(), '/gm', 'Use the normal GM return controls before opening election procedures.');
  const region = page.getByRole('region', { name: 'Election procedure and outcome', exact: true });
  await region.waitFor({ state: 'visible', timeout: remaining() });
  await verify();
  return region;
}

async function configureElection(context, choice, options) {
  const branch = 'election-policy';
  if (!choice) return missingChoice('pending-politics-press', branch, options);
  validateElectionPlan(choice);
  const voters = choice.voterRoleIds;
  assert.ok(voters.every(roleId => context.roster.some(actor => actor.roleId === roleId)),
    'Every voter choice must resolve to a role in the current authentic demo roster.');

  // A displayed roster entry does not prove its original actor still has a
  // live lease after other roles have played. Re-enter each chosen voter via
  // ordinary controls before fixing the current eligible electorate.
  for (const roleId of voters) {
    const { actor, current } = await enterSelectedRole(context, roleId);
    assert.equal(current.sameActor, true);
    assert.equal(current.sessionId, context.initial.sessionId);
    assert.equal(current.profileRoleId, roleId);
    assert.equal(current.uidHash, actor.uidHash);
  }

  const gmNow = await context.gm.observe();
  assertGmInstanceFence(gmNow, { actorKind: 'gm', sessionId: context.initial.sessionId,
    uidHash: context.started.uidHash, instanceId: context.started.instanceId,
    cycle: 1, phase: 'active', turnStatePhase: 'team' });
  const expectedGm = { actorKind: 'gm', sessionId: context.initial.sessionId, uidHash: gmNow.uidHash,
    instanceId: gmNow.instanceId, cycle: gmNow.cycle, phase: gmNow.phase,
    turnStatePhase: gmNow.turnStatePhase, documentTimeOrigin: gmNow.documentTimeOrigin };
  const region = await electionGmRegion(context, expectedGm);
  const form = region.getByRole('form', { name: 'Configure election procedure', exact: true });
  if (!(await form.isVisible().catch(() => false))) {
    return blockedSourceBranch('pending-politics-press', branch, ['election-procedure-already-configured-or-not-offered'],
      { required: required(options, branch) });
  }
  const rawRoster = await actorRosterUids(context.crew, context.initial.sessionId);
  const rosterUidByRole = new Map(rawRoster.map(entry => [entry.roleId, entry.uid]));
  const voterUids = voters.map(roleId => {
    const uid = rosterUidByRole.get(roleId);
    assert.ok(uid, `No current Auth account is available for voter role ${roleId}.`);
    return uid;
  });
  assert.equal(new Set(voterUids).size, voterUids.length);
  const electorate = form.getByRole('group', { name: 'Eligible voters', exact: true });
  const selected = [];
  for (const roleId of voters) {
    const actor = context.roster.find(entry => entry.roleId === roleId);
    assert.ok(typeof actor.displayName === 'string' && actor.displayName.length > 0,
      'Use the original admitted voter’s displayed name.');
    const control = electorate.getByRole('checkbox', { name: actor.displayName, exact: true });
    if (await control.count() !== 1) return blockedSourceBranch('pending-politics-press', branch,
      ['selected-voter-is-not-uniquely-offered-in-the-current-electorate'], { required: required(options, branch) });
    selected.push(control);
  }
  assert.equal(new Set(voters.map(roleId => context.roster.find(entry => entry.roleId === roleId).displayName)).size,
    voterUids.length, 'Visible voter labels must uniquely identify the selected original accounts.');
  const checkboxes = electorate.getByRole('checkbox');
  for (const checkbox of await checkboxes.all()) {
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  for (const checkbox of selected) await checkbox.check();
  const policy = choice.policy;
  await form.getByRole('combobox', { name: 'Voting system', exact: true }).selectOption(policy.votingSystem);
  await form.getByRole('combobox', { name: 'Population weighting', exact: true }).selectOption(policy.populationWeighting);
  await form.getByLabel('Open cycle', { exact: true }).fill(String(policy.openCycle));
  await form.getByLabel('Close cycle', { exact: true }).fill(String(policy.closeCycle));
  const vicePresident = form.getByLabel('Elect a Vice President', { exact: true });
  if (policy.vicePresidentEnabled) await vicePresident.check(); else await vicePresident.uncheck();
  await form.getByRole('combobox', { name: 'Campaigning', exact: true }).selectOption(policy.campaigning);
  await form.getByRole('combobox', { name: 'Supply use', exact: true }).selectOption(policy.supplyUse);
  await form.getByRole('textbox', { name: 'Campaign instructions', exact: true }).fill(policy.campaignInstructions);
  await form.getByRole('combobox', { name: 'Tie rule', exact: true }).selectOption(policy.tieRule);
  const configure = form.getByRole('button', { name: 'Fix procedure before ballots', exact: true });
  const blocked = await demandButton(configure, 'pending-politics-press', branch, options);
  if (blocked) return blocked;
  return observedMutation({ family: 'pending-politics-press', branch, surface: context.gm,
    endpoint: 'configurePresidentialElection', expectedActor: expectedGm,
    executeUi: () => configure.click() });
}

function currentElectionGmBlockers(state, context, expectedTurnStatePhase) {
  const blockers = [];
  if (state.sessionId !== context.initial.sessionId) blockers.push('session-changed-from-original-election');
  if (state.phase !== 'active') blockers.push('gameplay-not-active');
  if (state.fullGameDemo?.status !== 'active' || state.fullGameDemo?.progression !== 'manual') {
    blockers.push('not-active-manual-demo');
  }
  if (state.connection !== 'live' || state.freshness !== 'server') blockers.push('not-live-server-backed');
  if (state.turnStatePhase !== expectedTurnStatePhase) blockers.push(`not-current-${expectedTurnStatePhase}-stage`);
  if (!context.started?.instanceId || !context.started?.uidHash) blockers.push('original-gm-instance-snapshot-unavailable');
  if (!blockers.length) assertGmInstanceFence(state, { actorKind: 'gm', sessionId: context.initial.sessionId,
    uidHash: context.started.uidHash, instanceId: context.started.instanceId, cycle: state.cycle,
    phase: 'active', turnStatePhase: expectedTurnStatePhase });
  return blockers;
}

async function castSecretBallots(context, choice, options) {
  const branch = 'secret-election-ballots';
  if (!choice) return [missingChoice('pending-politics-press', branch, options)];
  if (!choice.ballotsByRole) return [missingChoice('pending-politics-press', branch, options)];
  validateElectionPlan(choice);
  const state = await context.gm.observe();
  const blockers = currentElectionGmBlockers(state, context, 'team');
  if (blockers.length) return [blockedSourceBranch('pending-politics-press', branch, blockers,
    { required: required(options, branch) })];
  try { validateElectionActionCycle(choice.policy, state.cycle, 'ballot'); }
  catch { return [blockedSourceBranch('pending-politics-press', branch,
    ['current-cycle-outside-configured-election-ballot-window'], { required: required(options, branch) })]; }
  const rosterByRole = new Map(context.roster.map(actor => [actor.roleId, actor]));
  for (const roleId of choice.voterRoleIds) {
    const ballot = choice.ballotsByRole[roleId];
    assert.ok(rosterByRole.has(ballot.presidentCandidateRoleId), 'Every candidate must be an original roster actor.');
    if (choice.policy.vicePresidentEnabled) assert.ok(rosterByRole.has(ballot.vicePresidentCandidateRoleId));
  }
  const result = [];
  for (const roleId of choice.voterRoleIds) {
    const ballot = choice.ballotsByRole[roleId];
    const { actor } = await selectVoterActor(context, roleId, state.cycle);
    const electionButton = context.crew.page.getByRole('button', { name: 'Election', exact: true });
    const deadlineAt = Date.now() + 35_000;
    const remaining = () => {
      const milliseconds = deadlineAt - Date.now();
      assert.ok(milliseconds > 0, 'The original secret-ballot navigation deadline expired.');
      return milliseconds;
    };
    await electionButton.waitFor({ state: 'visible', timeout: remaining() });
    await electionButton.click({ timeout: remaining() });
    await context.crew.page.waitForURL(url => url.hash.split('?')[0] === '#/election', { timeout: remaining() });
    const form = context.crew.page.getByRole('form', { name: 'Secret election ballot', exact: true });
    const mounted = await form.waitFor({ state: 'visible', timeout: remaining() }).then(() => true, () => false);
    if (!mounted) {
      const blocker = blockedSourceBranch('pending-politics-press', branch,
        ['current-voter-has-no-mounted-secret-ballot'], { required: required(options, branch) });
      result.push({ roleId, ...blocker });
      break;
    }
    const selectCandidate = async (office, candidateRoleId) => {
      const select = form.getByLabel(office, { exact: true });
      const candidate = rosterByRole.get(candidateRoleId);
      assert.ok(candidate, 'Every ballot candidate must be an original eligible roster actor.');
      const matchingValues = await select.locator('option').evaluateAll((nodes, displayName) =>
        nodes.filter(node => node.textContent?.trim() === displayName).map(node => node.value), candidate.displayName);
      assert.equal(matchingValues.length, 1, 'The candidate must match exactly one source-offered choice.');
      await select.selectOption(matchingValues[0]);
    };
    await selectCandidate('President', ballot.presidentCandidateRoleId);
    if (choice.policy.vicePresidentEnabled) await selectCandidate('Vice President', ballot.vicePresidentCandidateRoleId);
    const submit = form.getByRole('button', { name: 'Submit secret ballot', exact: true });
    const blocked = await demandButton(submit, 'pending-politics-press', branch, options);
    if (blocked) { result.push({ roleId, ...blocked }); break; }
    const receipt = await observedMutation({ family: 'pending-politics-press', branch, surface: context.crew,
      endpoint: 'castPresidentialBallot', expectedActor: actor, executeUi: () => submit.click() });
    result.push(receipt);
  }
  return result;
}

function assertRequiredElectionChoices(choices = {}) {
  for (const branch of choices.requiredBranches ?? []) {
    if (branch === 'election-policy' || branch === 'secret-election-ballots' || branch === 'election-server-resolution') {
      assert.ok(choices.election, `Required ${branch} needs an explicit election procedure choice.`);
    }
    if (branch === 'secret-election-ballots') assert.ok(choices.election.ballotsByRole,
      'Required secret-election-ballots needs one explicit ballot for each configured voter.');
    if (branch === 'election-facilitator-tie-decision') assert.ok(choices.electionTieDecision,
      'Required election-facilitator-tie-decision needs explicit tied-candidate choices.');
  }
}

async function commitElectionTieDecision(context, options, tieChoice) {
  const branch = 'election-facilitator-tie-decision';
  if (!tieChoice) return blockedSourceBranch('pending-politics-press', branch,
    ['explicit-choice-for-current-source-tie-not-supplied'],
    { required: required(options, branch) || required(options, 'election-server-resolution') });
  validateElectionTieDecision(tieChoice);
  const region = context.gm.page.getByRole('region', { name: 'Election procedure and outcome', exact: true });
  const tieRegion = region.getByRole('region', { name: 'Facilitator tie decisions', exact: true });
  if (!(await tieRegion.isVisible().catch(() => false))) return blockedSourceBranch('pending-politics-press', branch,
    ['no-current-server-tally-offers-facilitator-tie-decision'],
    { required: required(options, branch) });
  const chooseCandidate = async (label, roleId) => {
    const select = tieRegion.getByLabel(label, { exact: true });
    const visible = await select.isVisible().catch(() => false);
    if (!visible) return roleId ? 'selected-role-not-offered-for-this-office' : null;
    if (!roleId) return 'explicit-role-choice-not-supplied-for-current-tie';
    const actor = context.roster.find(entry => entry.roleId === roleId);
    if (!actor) return 'selected-role-not-in-current-original-roster';
    const values = await select.locator('option').evaluateAll((nodes, displayName) =>
      nodes.filter(node => node.textContent?.trim() === displayName).map(node => node.value), actor.displayName);
    if (values.length !== 1) return 'selected-role-not-in-current-server-tied-candidate-options';
    await select.selectOption(values[0]);
    return null;
  };
  const presidentBlocker = await chooseCandidate('President tie choice', tieChoice.presidentCandidateRoleId);
  if (presidentBlocker) return blockedSourceBranch('pending-politics-press', branch, [presidentBlocker],
    { required: required(options, branch) || required(options, 'election-server-resolution') });
  const vicePresidentBlocker = await chooseCandidate('Vice President tie choice', tieChoice.vicePresidentCandidateRoleId);
  if (vicePresidentBlocker) return blockedSourceBranch('pending-politics-press', branch, [vicePresidentBlocker],
    { required: required(options, branch) || required(options, 'election-server-resolution') });
  const button = tieRegion.getByRole('button', { name: 'Commit tie decision', exact: true });
  const shown = await button.isVisible().catch(() => false);
  if (!shown || !(await button.isEnabled().catch(() => false))) return blockedSourceBranch('pending-politics-press', branch,
    [shown ? 'current-source-requires-a-choice-for-every-visible-tied-office' : 'current-tie-commit-control-not-mounted'],
    { required: required(options, branch) || required(options, 'election-server-resolution') });
  const identity = await context.gm.observe();
  const blockers = currentElectionGmBlockers(identity, context, identity.turnStatePhase);
  if (blockers.length) return blockedSourceBranch('pending-politics-press', branch, blockers,
    { required: required(options, branch) || required(options, 'election-server-resolution') });
  const expectedGm = { actorKind: 'gm', sessionId: context.initial.sessionId, uidHash: identity.uidHash,
    instanceId: identity.instanceId, cycle: identity.cycle, phase: identity.phase,
    turnStatePhase: identity.turnStatePhase };
  return observedMutation({ family: 'pending-politics-press', branch, surface: context.gm,
    endpoint: 'resolvePresidentialElection', expectedActor: expectedGm, executeUi: () => button.click() });
}

async function resolveElection(context, options, tieDecision) {
  const branch = 'election-server-resolution';
  const identity = await context.gm.observe();
  if (!options.election?.policy) return missingChoice('pending-politics-press', branch, options);
  validateElectionPlan(options.election);
  const blockers = currentElectionGmBlockers(identity, context, identity.turnStatePhase);
  if (blockers.length) return blockedSourceBranch('pending-politics-press', branch, blockers,
    { required: required(options, branch) });
  if (!['team', 'coordination'].includes(identity.turnStatePhase)) return blockedSourceBranch('pending-politics-press', branch,
    ['current-stage-does-not-offer-election-resolution'], { required: required(options, branch) });
  try { validateElectionActionCycle(options.election.policy, identity.cycle, 'resolve', identity.turnStatePhase); }
  catch { return blockedSourceBranch('pending-politics-press', branch,
    ['configured-close-cycle-has-not-finished'], { required: required(options, branch) }); }
  const expectedGm = { actorKind: 'gm', sessionId: context.initial.sessionId, uidHash: identity.uidHash,
    instanceId: identity.instanceId, cycle: identity.cycle, phase: identity.phase,
    turnStatePhase: identity.turnStatePhase, documentTimeOrigin: identity.documentTimeOrigin };
  const region = await electionGmRegion(context, expectedGm);
  const tieRegion = region.getByRole('region', { name: 'Facilitator tie decisions', exact: true });
  if (await tieRegion.isVisible().catch(() => false)) {
    const tieReceipt = await commitElectionTieDecision(context, options, tieDecision);
    if (tieReceipt?.accepted === false) return tieReceipt;
    const currentStatus = await region.getByRole('status').allTextContents();
    const finalVisible = currentStatus.some(text => /^President:/.test(text.trim()));
    if (!finalVisible) return { ...blockedSourceBranch('pending-politics-press', branch,
      ['source-election-still-has-unresolved-office-ties-after-the-explicit-ruling'],
      { required: required(options, branch) }), tieReceipt };
    return { family: 'pending-politics-press', branch, accepted: true,
      sourceResolvedOutcomeVisible: true, receipts: [tieReceipt] };
  }
  const button = region.getByRole('button', { name: 'Calculate and resolve election', exact: true });
  const blocked = await demandButton(button, 'pending-politics-press', branch, options);
  if (blocked) return blocked;
  const receipt = await observedMutation({ family: 'pending-politics-press', branch, surface: context.gm,
    endpoint: 'resolvePresidentialElection', expectedActor: expectedGm, executeUi: () => button.click(), includeElectionState: true });
  if (receipt.sourceOutcomeState === 'tie-pending') {
    const tieReceipt = await commitElectionTieDecision(context, options, tieDecision);
    if (tieReceipt?.accepted === false) return { ...tieReceipt, sourceTallyCommitted: true, tallyReceipt: receipt };
    const currentStatus = await region.getByRole('status').allTextContents();
    if (!currentStatus.some(text => /^President:/.test(text.trim()))) return {
      ...blockedSourceBranch('pending-politics-press', branch,
        ['source-election-still-has-unresolved-office-ties-after-the-explicit-ruling'],
        { required: required(options, branch) }), sourceTallyCommitted: true,
      tallyReceipt: receipt, tieReceipt,
    };
    return { family: 'pending-politics-press', branch, accepted: true,
      sourceResolvedOutcomeVisible: true, receipts: [receipt, tieReceipt] };
  }
  if (receipt.sourceOutcomeState === 'resolved') {
    await region.getByText(/^President:/).first().waitFor();
    return { family: 'pending-politics-press', branch, accepted: true,
      sourceResolvedOutcomeVisible: true, receipts: [receipt] };
  }
  if (receipt.sourceOutcomeState === 'no-winner') {
    await region.getByRole('heading', { name: 'No Winner', exact: true }).waitFor();
    return { family: 'pending-politics-press', branch, accepted: true,
      sourceNoWinnerOutcomeVisible: true, receipts: [receipt] };
  }
  return { ...blockedSourceBranch('pending-politics-press', branch,
    ['current-server-result-did-not-resolve-the-election'], { required: required(options, branch) }),
  tallyReceipt: receipt };
}

export async function provePresidentialElectionResolution(context, choices = {}) {
  return resolveElection(context, choices, choices.electionTieDecision);
}

/** Submit explicit independent ballots only while the current server cycle is in the configured Team window. */
export async function provePresidentialElectionBallots(context, choices = {}) {
  assertRequiredElectionChoices(choices);
  return castSecretBallots(context, choices.election, choices);
}

/**
 * Opt-in real UI source actions for the current active manual fresh game.
 * No choices are supplied by default, so importing this module or invoking an empty callback is inert.
 */
export async function provePoliticsAndPress(context, choices = {}) {
  assertRequiredElectionChoices(choices);
  const gmState = await context.gm.observe();
  const gate = assertFreshManualStart({ gm: gmState, started: context.started, initial: context.initial });
  const result = { family: 'pending-politics-press', sessionIdHash: sha256(gate.sessionId), cycle: 1,
    accepted: [], blocked: [], pending: [], physicalAttendanceProof: false, ballotsPersisted: false };

  for (const [name, value] of [
    ['admiralDirective', choices.admiralDirective],
    ['redAlert', choices.redAlert],
    ['presidentAction', choices.presidentAction],
    ['pressDispatch', choices.pressDispatch],
  ]) {
    const branch = name === 'admiralDirective' ? 'admiral-directive'
      : name === 'redAlert' ? 'fleet-red-alert'
        : name === 'presidentAction' ? 'president-action' : 'press-publish-dismiss';
    if (value === undefined) {
      const missing = missingChoice('pending-politics-press', branch, choices);
      result.blocked.push(missing);
      continue;
    }
    const receipt = name === 'admiralDirective' ? await runAdmiralDirective(context, value, choices)
      : name === 'redAlert' ? await runFleetAlert(context, value, choices)
        : name === 'presidentAction' ? await runPresidentAction(context, value, choices)
          : await runPressDispatch(context, value, choices);
    if (Array.isArray(receipt)) result.blocked.push(...receipt.filter(row => row.status === 'blocked'));
    else if (receipt?.accepted === false) result.blocked.push(receipt);
    else result.accepted.push(receipt);
  }

  if (choices.groupMessage !== undefined) {
    const roleId = choices.groupMessage.roleId;
    const text = choices.groupMessage.text;
    if (!roleId || typeof text !== 'string' || !text.trim() || text.length > 240) {
      result.blocked.push(blockedSourceBranch('pending-politics-press', 'fleet-group-note',
        ['explicit-current-group-member-and-note-required'], { required: required(choices, 'fleet-group-note') }));
    } else {
      const { actor } = await enterSelectedRole(context, roleId);
      const panel = context.crew.page.getByRole('region', { name: 'Fleet group communication', exact: true });
      if (!(await panel.isVisible().catch(() => false))) {
        result.blocked.push(blockedSourceBranch('pending-politics-press', 'fleet-group-note',
          ['current-member-has-no-mounted-group-communication'], { required: required(choices, 'fleet-group-note') }));
      } else {
        const button = panel.getByRole('button', { name: 'Send group note', exact: true });
        await panel.getByLabel('Note to your fleet group', { exact: true }).fill(text);
        const afterFill = await demandButton(button, 'pending-politics-press', 'fleet-group-note', choices);
        if (afterFill) result.blocked.push(afterFill);
        else {
          result.accepted.push(await observedMutation({ family: 'pending-politics-press', branch: 'fleet-group-note',
            surface: context.crew, endpoint: 'sendFleetGroupMessage', expectedActor: actor,
            executeUi: () => button.click() }));
        }
      }
    }
  } else result.blocked.push(missingChoice('pending-politics-press', 'fleet-group-note', choices));

  if (choices.election !== undefined) {
    const config = await configureElection(context, choices.election, choices);
    if (config?.accepted === false) result.blocked.push(config);
    else {
      result.accepted.push(config);
      if (choices.election.ballotsByRole && choices.election.policy.openCycle === gmState.cycle) {
        const ballots = await castSecretBallots(context, choices.election, choices);
        for (const ballot of ballots) {
          if (ballot.accepted === false) result.blocked.push(ballot);
          else result.accepted.push(ballot);
        }
      } else result.pending.push('secret-election-ballots-at-configured-open-cycle');
      result.pending.push('election-resolution-after-configured-close-cycle');
    }
  } else {
    for (const branch of ['election-policy', 'secret-election-ballots', 'election-server-resolution']) {
      result.blocked.push(missingChoice('pending-politics-press', branch, choices));
    }
  }

  const directory = resolve(context.directory ?? process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence');
  const outputDirectory = resolve(directory, 'finite-action-families');
  await mkdir(outputDirectory, { recursive: true });
  const output = resolve(outputDirectory, `politics-press-${randomUUID()}.json`);
  const safe = { schemaVersion: 1, ...result, rawBallotsPersisted: false,
    actorUidValuesPersisted: false, privateTextPersisted: false, outcomeSelectionPersisted: false,
    runtimeBinding: 'Parent-owned fresh run must bind the actual source and compiled runtime before/after execution.' };
  await writeFile(output, `${JSON.stringify(safe, null, 2)}\n`, { flag: 'wx' });
  return { ...safe, evidencePath: output };
}

/** Parent can call this only after the real GM advances the existing game to its source Coordination stage. */
export async function provePresidentialCoordinationVisit(context, choice = {}) {
  const current = await context.crew.observe();
  const blockedBy = [];
  if (current.phase !== 'active') blockedBy.push('gameplay-not-active');
  if (current.cycle !== choice.expectedCycle) blockedBy.push('not-at-explicit-current-coordination-cycle');
  if (current.turnStatePhase !== 'coordination') blockedBy.push('not-current-coordination-stage');
  if (current.connection !== 'live' || current.freshness !== 'server') blockedBy.push('not-live-server-backed');
  if (blockedBy.length) return blockedSourceBranch('pending-politics-press', 'president-coordination-visit', blockedBy,
    { required: choice.required === true });
  const roleId = choice.presidentRoleId;
  if (typeof roleId !== 'string') return blockedSourceBranch('pending-politics-press', 'president-coordination-visit',
    ['explicit-current-president-actor-not-selected'], { required: choice.required === true });
  const { actor } = await enterSelectedRole(context, roleId);
  const section = context.crew.page.getByRole('region', { name: 'President workspace', exact: true });
  const button = section.getByRole('button', { name: 'Spend 1 and reduce unrest', exact: true });
  if (!(await section.isVisible().catch(() => false))) {
    return blockedSourceBranch('pending-politics-press', 'president-coordination-visit',
      ['president-workspace-not-mounted-for-current-authority'], { required: choice.required === true });
  }
  const shipSelect = section.getByLabel('Ship to visit', { exact: true });
  if (typeof choice.shipId !== 'string') return blockedSourceBranch('pending-politics-press', 'president-coordination-visit',
    ['explicit-source-offered-ship-not-selected'], { required: choice.required === true });
  const validShipIds = await shipSelect.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
  if (!validShipIds.includes(choice.shipId)) return blockedSourceBranch('pending-politics-press', 'president-coordination-visit',
    ['selected-ship-not-currently-offered-by-president-visit-control'], { required: choice.required === true });
  await shipSelect.selectOption(choice.shipId);
  if (!(await button.isEnabled().catch(() => false))) return blockedSourceBranch('pending-politics-press', 'president-coordination-visit',
    ['source-blocked-no-capital-unrest-or-visit-authority'], { required: choice.required === true });
  const receipt = await observedMutation({ family: 'pending-politics-press', branch: 'president-coordination-visit',
    surface: context.crew, endpoint: 'recordPresidentialVisit', expectedActor: actor,
    executeUi: () => button.click() });
  return { ...receipt, politicalCapitalSpend: 1, physicalVisit: false };
}

export function createPoliticsPressCallbacks(choices = {}) {
  return Object.freeze({ onStarted: context => provePoliticsAndPress(context, choices),
    onElectionBallot: context => provePresidentialElectionBallots(context, choices),
    onElectionClose: context => provePresidentialElectionResolution(context, choices),
    onCoordination: context => provePresidentialCoordinationVisit(context, choices.coordinationVisit ?? {}) });
}
