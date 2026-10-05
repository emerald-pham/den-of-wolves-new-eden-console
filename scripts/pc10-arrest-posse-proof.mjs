import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  assertFreshManualStart,
  assertGmInstanceFence,
  assertSimulatedAttendanceRoster,
  blockedSourceBranch,
  captureMountedUiAction,
  privateSafeActionReceipt,
} from './pc10-political-crisis-arrest-proof-contracts.mjs';

const FAMILY = 'pending-arrest-posse-disposition';
const CALCULATION_BRANCH = 'arrest-posse-calculation';
const ATTENDANCE_BRANCH = 'arrest-posse-simulated-attendance';
const DISPOSITION_BRANCH = 'arrest-prisoner-disposition';
const REQUIRED_ARREST_BRANCHES = new Set([CALCULATION_BRANCH, ATTENDANCE_BRANCH, DISPOSITION_BRANCH]);

function required(options, branch) {
  return options?.required === true || Array.isArray(options?.requiredBranches) && options.requiredBranches.includes(branch);
}

function blocked(branch, blockerCodes, options = {}) {
  return blockedSourceBranch(FAMILY, branch, blockerCodes, { required: required(options, branch) });
}

function missing(branch, options) {
  return blocked(branch, ['explicit-current-source-choice-not-supplied'], options);
}

/** Reject any target or virtual attendance identity not named by the caller and current roster. */
export function validatePosseChoice(choice, currentRosterRoleIds) {
  assert.ok(choice && typeof choice === 'object' && !Array.isArray(choice));
  const allowed = new Set(['targetRoleId', 'defenders', 'adjustment', 'presentRoleIds', 'attendanceEvidence']);
  assert.ok(Object.keys(choice).every(key => allowed.has(key)), 'Unknown arrest-posse choice.');
  assert.ok(Array.isArray(currentRosterRoleIds) && currentRosterRoleIds.length > 0 &&
    currentRosterRoleIds.every(roleId => typeof roleId === 'string' && roleId.length > 0),
  'Use a current prepared role roster.');
  assert.equal(new Set(currentRosterRoleIds).size, currentRosterRoleIds.length);
  assert.ok(currentRosterRoleIds.includes(choice.targetRoleId), 'Choose the target from the current roster.');
  assert.ok(Number.isSafeInteger(choice.defenders) && choice.defenders >= 0,
    'Choose an explicit non-negative whole defender count.');
  assert.ok(choice.adjustment === 'none' || choice.adjustment === -1 || choice.adjustment === 1,
    'Choose no adjustment, subtract one, or add one.');
  if (choice.presentRoleIds !== undefined) {
    assert.ok(Array.isArray(choice.presentRoleIds), 'Simulated attendance needs an explicit role list.');
    assert.equal(new Set(choice.presentRoleIds).size, choice.presentRoleIds.length,
      'Simulated posse roles must be distinct.');
    assert.ok(choice.presentRoleIds.every(roleId => currentRosterRoleIds.includes(roleId)),
      'Every simulated posse member must be from the current roster.');
    assert.equal(choice.presentRoleIds.includes(choice.targetRoleId), false,
      'The target cannot be included in the simulated posse.');
    assert.equal(choice.attendanceEvidence, 'simulated-demo',
      'Only the source-audited simulated-demo route is available to this proof.');
  } else if (choice.attendanceEvidence !== undefined) {
    assert.equal(choice.attendanceEvidence, 'simulated-demo');
  }
  return true;
}

export function validateArrestDispositionChoice(choice) {
  assert.ok(choice && typeof choice === 'object' && !Array.isArray(choice),
    'An explicit prisoner disposition choice is required.');
  const allowed = new Set(['targetRoleId', 'disposition', 'ruling']);
  assert.ok(Object.keys(choice).every(key => allowed.has(key)));
  assert.ok(['released', 'executed', 'facilitator-resolution'].includes(choice.disposition),
    'Choose only a source-offered prisoner disposition.');
  if (choice.targetRoleId !== undefined) assert.ok(typeof choice.targetRoleId === 'string' && choice.targetRoleId.length > 0);
  if (choice.disposition === 'facilitator-resolution') {
    assert.ok(typeof choice.ruling === 'string' && choice.ruling.trim().length > 0 && choice.ruling.length <= 240,
      'A late facilitator resolution requires an explicit reasoned ruling of at most 240 characters.');
  } else assert.equal(choice.ruling, undefined, 'A facilitator rationale is only offered for an overdue case.');
  return true;
}

export function assertRequiredArrestChoices(choices = {}) {
  assert.ok(choices && typeof choices === 'object' && !Array.isArray(choices));
  const allowed = new Set(['posse', 'disposition', 'requiredBranches']);
  assert.ok(Object.keys(choices).every(key => allowed.has(key)), 'Unknown arrest proof choice.');
  if (choices.requiredBranches !== undefined) {
    assert.ok(Array.isArray(choices.requiredBranches));
    for (const branch of choices.requiredBranches) {
      assert.ok(REQUIRED_ARREST_BRANCHES.has(branch), `Unknown required arrest branch: ${branch}`);
      if (branch === CALCULATION_BRANCH) assert.ok(choices.posse, `${branch} is required but no explicit target choice was supplied.`);
      if (branch === ATTENDANCE_BRANCH) assert.ok(choices.posse?.presentRoleIds !== undefined,
        `${branch} is required but no explicit simulated attendance choice was supplied.`);
      if (branch === DISPOSITION_BRANCH) assert.ok(choices.disposition,
        `${branch} is required but no explicit ruling choice was supplied.`);
    }
  }
  if (choices.disposition !== undefined) validateArrestDispositionChoice(choices.disposition);
  return true;
}

async function readDemoRoster(surface, sessionId) {
  return surface.page.evaluate(async sid => {
    const [{ readDemoActorRoster }, { demoActorDisplayName }] = await Promise.all([
      import('/src/lib/demoActorProfiles.ts'), import('/src/lib/demoActorDisplayName.ts'),
    ]);
    return readDemoActorRoster(sid).map(actor => ({
      roleId: actor.roleId, uid: actor.uid, displayName: demoActorDisplayName(actor.roleId),
    }));
  }, sessionId);
}

function assertActiveManualGm(state, context) {
  assert.ok(context.started && typeof context.started.uidHash === 'string' &&
    typeof context.started.instanceId === 'string',
  'The proof must retain the original Cycle 1 GM and owned instance snapshot.');
  const expected = { actorKind: 'gm', sessionId: context.initial.sessionId,
    uidHash: context.started.uidHash,
    instanceId: context.started.instanceId,
    cycle: state.cycle, phase: state.phase, turnStatePhase: state.turnStatePhase };
  assertGmInstanceFence(state, expected);
  const blockedBy = [];
  if (state.phase !== 'active') blockedBy.push('gameplay-not-active');
  if (state.fullGameDemo?.status !== 'active' || state.fullGameDemo?.progression !== 'manual') {
    blockedBy.push('not-active-manual-demo');
  }
  if (state.connection !== 'live' || state.freshness !== 'server') blockedBy.push('not-live-server-backed');
  return blockedBy;
}

function gmActor(context, state) {
  return { actorKind: 'gm', sessionId: context.initial.sessionId, uidHash: state.uidHash,
    instanceId: state.instanceId, cycle: state.cycle, phase: state.phase,
    turnStatePhase: state.turnStatePhase };
}

async function safeReceipt({ branch, endpoint, context, state, request, result, replay,
  simulatedAttendance = false }) {
  return privateSafeActionReceipt({ family: FAMILY, branch, endpoint,
    actor: { uidHash: state.uidHash, roleId: 'gm' }, sessionId: context.initial.sessionId,
    cycle: state.cycle, phase: state.phase, request, result, replay, simulatedAttendance });
}

function uidByRole(roster) {
  return new Map(roster.map(actor => [actor.roleId, actor.uid]));
}

async function selectTargetFromLiveCensus(region, choice, roster) {
  const targetSelect = region.getByLabel('Target player', { exact: true });
  const targetUid = uidByRole(roster).get(choice.targetRoleId);
  if (!targetUid) return { blocker: 'target-role-has-no-current-demo-auth-account' };
  const visibleTargetUids = await targetSelect.locator('option').evaluateAll(options =>
    options.map(option => option.value).filter(Boolean));
  if (!visibleTargetUids.includes(targetUid)) return { blocker: 'target-not-in-current-facilitator-census-options' };
  await targetSelect.selectOption(targetUid);
  return { targetUid, visibleTargetUids };
}

async function runCalculation(context, choice, options) {
  const branch = CALCULATION_BRANCH;
  const state = await context.gm.observe();
  const blockedBy = assertActiveManualGm(state, context);
  if (blockedBy.length) return blocked(branch, blockedBy, options);
  const roster = await readDemoRoster(context.gm, context.initial.sessionId);
  const roleIds = roster.map(actor => actor.roleId);
  validatePosseChoice({ ...choice, presentRoleIds: undefined, attendanceEvidence: undefined }, roleIds);
  const panel = context.gm.page.getByRole('region', { name: 'Arrest posse calculator', exact: true });
  if (!(await panel.isVisible().catch(() => false))) return blocked(branch,
    ['verified-current-GM-census-and-arrest-calculator-not-mounted'], options);
  const target = await selectTargetFromLiveCensus(panel, choice, roster);
  if (target.blocker) return blocked(branch, [target.blocker], options);
  await panel.getByLabel('Defenders', { exact: true }).fill(String(choice.defenders));
  await panel.getByLabel('Optional adjustment', { exact: true }).selectOption(String(choice.adjustment));
  const currentCalculation = panel.getByText(/\d+ players needed$/, { exact: false });
  if (await currentCalculation.isVisible().catch(() => false)) return blocked(branch,
    ['matching-server-posse-calculation-already-exists-no-new-revision-created'], options);
  const button = panel.getByRole('button', { name: 'Calculate required players', exact: true });
  if (!(await button.isEnabled().catch(() => false))) return blocked(branch,
    ['source-calculation-disabled-by-live-census-or-authority'], options);
  const { request, result, replay } = await captureMountedUiAction({ surface: context.gm,
    endpoint: 'calculateArrestPosse', expectedActor: gmActor(context, state), executeUi: () => button.click() });
  return { receipt: await safeReceipt({ branch, endpoint: 'calculateArrestPosse', context, state, request, result, replay }),
    roster, targetUid: target.targetUid };
}

async function runSimulatedAttendance(context, choice, options, roster, targetUid) {
  const branch = ATTENDANCE_BRANCH;
  const state = await context.gm.observe();
  const blockedBy = assertActiveManualGm(state, context);
  if (blockedBy.length) return blocked(branch, blockedBy, options);
  if (state.fullGameDemo?.status !== 'active' || state.fullGameDemo?.progression !== 'manual') {
    return blocked(branch, ['source-simulated-attendance-requires-active-manual-demo'], options);
  }
  const panel = context.gm.page.getByRole('region', { name: 'Arrest posse calculator', exact: true });
  const calculation = panel.getByText(/^\d+ players needed$/, { exact: false });
  if (!(await calculation.isVisible().catch(() => false))) return blocked(branch,
    ['current-census-posse-calculation-required-before-attendance'], options);
  const group = panel.getByRole('group', { name: 'Simulated posse attendance', exact: true });
  if (!(await group.isVisible().catch(() => false))) return blocked(branch,
    ['source-simulated-attendance-control-not-mounted'], options);
  if (await panel.getByText('Demo result based on simulated attendance.', { exact: true }).isVisible().catch(() => false)) {
    return blocked(branch, ['simulated-posse-result-already-exists-no-new-attendance-created'], options);
  }
  const roleByDisplayName = new Map();
  for (const actor of roster) {
    assert.equal(roleByDisplayName.has(actor.displayName), false,
      'The actual demo display names must uniquely identify visible simulated actors.');
    roleByDisplayName.set(actor.displayName, actor);
  }
  const labels = await group.locator('label').all();
  const offeredUids = [];
  const offeredRoleIds = [];
  const controlsByRole = new Map();
  for (const label of labels) {
    const shownName = (await label.innerText()).trim();
    const actor = roleByDisplayName.get(shownName);
    assert.ok(actor, 'Every virtual attendance option must match the current demo actor roster.');
    const checkbox = label.locator('input[type="checkbox"]');
    assert.equal(await checkbox.count(), 1);
    controlsByRole.set(actor.roleId, checkbox);
    offeredUids.push(actor.uid);
    offeredRoleIds.push(actor.roleId);
  }
  const currentPlayerUids = [...new Set([targetUid, ...offeredUids])];
  assertSimulatedAttendanceRoster({ demo: state.fullGameDemo, currentPlayerUids, targetUid,
    presentPlayerUids: choice.presentRoleIds.map(roleId => {
      const actor = roster.find(entry => entry.roleId === roleId);
      assert.ok(actor && offeredRoleIds.includes(roleId),
        'Every simulated posse actor must be a currently offered source checkbox.');
      return actor.uid;
    }), attendanceEvidence: 'simulated-demo', physicalAttendance: false });
  const selectedRoles = new Set(choice.presentRoleIds);
  for (const [roleId, checkbox] of controlsByRole) {
    if (selectedRoles.has(roleId)) await checkbox.check();
    else if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  if (await panel.getByLabel('Target player', { exact: true }).inputValue() !== targetUid) {
    return blocked(branch, ['current-target-select-no-longer-matches-the-posse-calculation-target'], options);
  }
  const button = panel.getByRole('button', { name: 'Simulate attendance', exact: true });
  if (!(await button.isEnabled().catch(() => false))) return blocked(branch,
    ['source-attendance-disabled-until-calculation-and-current-inputs-match'], options);
  const { request, result, replay } = await captureMountedUiAction({ surface: context.gm,
    endpoint: 'resolveArrestPosse', expectedActor: gmActor(context, state), executeUi: () => button.click() });
  return safeReceipt({ branch, endpoint: 'resolveArrestPosse', context, state, request, result, replay,
    simulatedAttendance: true });
}

/** Calculate and optionally submit only explicitly selected simulated attendance. */
export async function proveArrestPosse(context, choice = undefined, options = {}) {
  if (required(options, ATTENDANCE_BRANCH) && choice?.presentRoleIds === undefined) {
    return missing(ATTENDANCE_BRANCH, options);
  }
  if (choice === undefined) return missing(CALCULATION_BRANCH, options);
  const roster = await readDemoRoster(context.gm, context.initial.sessionId);
  const roleIds = roster.map(actor => actor.roleId);
  validatePosseChoice(choice, roleIds);
  const calculated = await runCalculation(context, choice, options);
  if (calculated?.accepted === false) return calculated;
  const result = [calculated.receipt];
  if (choice.presentRoleIds !== undefined) {
    const attendance = await runSimulatedAttendance(context, choice, options, calculated.roster, calculated.targetUid);
    if (attendance.accepted === false) result.push(attendance); else result.push(attendance);
  } else result.push(missing(ATTENDANCE_BRANCH, options));
  return saveEvidence(context, { family: FAMILY, accepted: result.filter(row => row.accepted !== false),
    blocked: result.filter(row => row.accepted === false), actualHumanAttendance: false,
    simulatedAttendanceOnly: true, privatePosseResultPersisted: false });
}

async function runDisposition(context, choice, options) {
  const branch = DISPOSITION_BRANCH;
  const state = await context.gm.observe();
  const blockedBy = assertActiveManualGm(state, context);
  if (blockedBy.length) return blocked(branch, blockedBy, options);
  const roster = await readDemoRoster(context.gm, context.initial.sessionId);
  const targetRoleId = choice.targetRoleId;
  if (!roster.some(actor => actor.roleId === targetRoleId)) return blocked(branch,
    ['target-role-not-in-current-demo-roster'], options);
  const panel = context.gm.page.getByRole('region', { name: 'Arrest posse calculator', exact: true });
  if (!(await panel.isVisible().catch(() => false))) return blocked(branch,
    ['verified-current-GM-census-and-arrest-calculator-not-mounted'], options);
  const target = await selectTargetFromLiveCensus(panel, { targetRoleId }, roster);
  if (target.blocker) return blocked(branch, [target.blocker], options);
  const casePanel = panel.getByRole('region', { name: 'Arrested prisoner case', exact: true });
  if (!(await casePanel.isVisible().catch(() => false))) return blocked(branch,
    ['no-current-server-backed-pending-prisoner-case-for-selected-target'], options);
  let button;
  if (choice.disposition === 'released') button = casePanel.getByRole('button', { name: 'Release prisoner', exact: true });
  if (choice.disposition === 'executed') button = casePanel.getByRole('button', { name: 'Execute prisoner', exact: true });
  if (choice.disposition === 'facilitator-resolution') {
    await casePanel.getByLabel('Facilitator ruling', { exact: true }).fill(choice.ruling);
    button = casePanel.getByRole('button', { name: 'Record facilitator resolution', exact: true });
  }
  if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) {
    return blocked(branch, [choice.disposition === 'facilitator-resolution'
      ? 'reasoned-facilitator-ruling-not-in-current-overdue-window'
      : 'selected-release-or-execution-control-not-in-current-deadline-team-window'], options);
  }
  const { request, result, replay } = await captureMountedUiAction({ surface: context.gm,
    endpoint: 'resolveArrestCaseDisposition', expectedActor: gmActor(context, state), executeUi: () => button.click() });
  return safeReceipt({ branch, endpoint: 'resolveArrestCaseDisposition', context, state, request, result, replay });
}

/** Record a current source-offered case decision; this never advances a cycle or creates an arrest. */
export async function proveArrestCaseDisposition(context, choice = undefined, options = {}) {
  if (choice === undefined) return missing(DISPOSITION_BRANCH, options);
  validateArrestDispositionChoice(choice);
  if (typeof choice.targetRoleId !== 'string') return blocked(DISPOSITION_BRANCH,
    ['explicit-original-target-role-not-selected'], options);
  const receipt = await runDisposition(context, choice, options);
  if (receipt.accepted === false) return receipt;
  return saveEvidence(context, { family: FAMILY, accepted: [receipt], blocked: [],
    rawTargetIdentityPersisted: false, facilitatorRulingPersisted: false, physicalAttendanceProof: false });
}

async function saveEvidence(context, report) {
  const directory = resolve(context.directory ?? process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence');
  const outputDirectory = resolve(directory, 'finite-action-families');
  await mkdir(outputDirectory, { recursive: true });
  const output = resolve(outputDirectory, `arrest-posse-${randomUUID()}.json`);
  const safe = { schemaVersion: 1, ...report, runtimeBinding: 'Parent-owned fresh run must bind the actual product and compiled runtime before and after execution.' };
  await writeFile(output, `${JSON.stringify(safe, null, 2)}\n`, { flag: 'wx' });
  return { ...safe, evidencePath: output };
}

/** Called at actual start and later only after the real GM advances the case to an offered ruling window. */
export async function proveArrestPosseAndDisposition(context, choices = {}) {
  assertRequiredArrestChoices(choices);
  if (context.started) {
    const current = await context.gm.observe();
    assertFreshManualStart({ gm: current, started: context.started, initial: context.initial });
  }
  const posse = await proveArrestPosse(context, choices.posse, choices);
  return posse;
}

export function createArrestPosseCallbacks(choices = {}) {
  return Object.freeze({ onStarted: context => proveArrestPosseAndDisposition(context, choices),
    onArrestPosse: context => proveArrestPosse(context, choices.posse, choices),
    onArrestDisposition: context => proveArrestCaseDisposition(context, choices.disposition, choices) });
}
