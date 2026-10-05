import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  assertFreshManualStart,
  assertGmInstanceFence,
  assertPlayerActorFence,
  blockedSourceBranch,
  captureMountedUiAction,
  enterPreparedRoleStation,
  privateSafeActionReceipt,
  sha256,
} from './pc10-political-crisis-arrest-proof-contracts.mjs';

const FAMILY = 'pending-crisis-voyage';
const RESPONSE_LABELS = Object.freeze({
  'jump-away-soon': 'Jump away as soon as possible',
  'wait-briefly-then-leave': 'Wait briefly, then leave',
  'prepare-attack-or-jump': 'Prepare to attack or jump when something arrives',
  'prepare-medical-and-wait': 'Prepare immediate medical assistance and wait as long as possible',
});
const COORDINATION_LABELS = Object.freeze({
  security: 'Coordinate security personnel', medical: 'Coordinate medical personnel',
  research: 'Coordinate research personnel', quarantine: 'Enact quarantine',
  'contingency-objectives': 'Set actionable objectives for stated conditions',
});
const ZEALOTRY_ACTIONS = ['leave', 'pressure', 'investigate', 'arrest'];
const ZEALOTRY_LABELS = Object.freeze({ leave: 'Leave', pressure: 'Pressure', investigate: 'Investigate', arrest: 'Arrest' });
const RESPONSE_BRANCH = 'approaching-vessel-response';

function required(options, branch) {
  return Array.isArray(options.requiredBranches) && options.requiredBranches.includes(branch);
}

function blocked(branch, blockerCodes, options = {}) {
  return blockedSourceBranch(FAMILY, branch, blockerCodes, { required: required(options, branch) });
}

function missing(branch, options) {
  return blocked(branch, ['explicit-current-source-choice-not-supplied'], options);
}

function requireShortText(value, label, maxLength) {
  assert.ok(typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength,
    `An explicit, non-empty source-bounded choice is required for ${label}.`);
}

/** Exact allowlist for human decisions. It never creates a crisis or manufactures a game fact. */
export function validateCrisisChoice(choice) {
  assert.ok(choice && typeof choice === 'object' && !Array.isArray(choice));
  const allowedKeys = new Set(['approachingVessel', 'diseaseQuarantine', 'zealotry', 'civilUnrest',
    'grievance', 'voyageMovement', 'voyageMaintenance', 'requiredBranches']);
  assert.ok(Object.keys(choice).every(key => allowedKeys.has(key)), 'Unknown crisis/voyage proof choice.');
  if (choice.requiredBranches !== undefined) assert.ok(Array.isArray(choice.requiredBranches) &&
    choice.requiredBranches.every(value => typeof value === 'string'));

  if (choice.approachingVessel !== undefined) {
    const value = choice.approachingVessel;
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    assert.ok(value.vesselReality === 'real' || value.vesselReality === 'trap',
      'The facilitator must make an explicit real-vessel or trap ruling.');
    assert.ok(Array.isArray(value.responseChoices) && value.responseChoices.length > 0 &&
      value.responseChoices.every(item => Object.hasOwn(RESPONSE_LABELS, item)) &&
      new Set(value.responseChoices).size === value.responseChoices.length,
    'Choose at least one distinct source-defined Approaching Vessel response.');
    assert.ok(Array.isArray(value.coordinationActions) &&
      value.coordinationActions.every(item => Object.hasOwn(COORDINATION_LABELS, item)) &&
      new Set(value.coordinationActions).size === value.coordinationActions.length,
    'Use only source-defined response coordination choices.');
    requireShortText(value.responseInstructions, 'Fleet response instructions', 1200);
    if (value.coordinationActions.includes('quarantine')) requireShortText(value.quarantineInstructions,
      'Quarantine instructions', 700);
    if (value.coordinationActions.includes('contingency-objectives')) requireShortText(value.contingencyObjectives,
      'Contingency objectives', 700);
    if (value.quarantineInstructions !== undefined) {
      requireShortText(value.quarantineInstructions, 'Quarantine instructions', 700);
      assert.ok(value.coordinationActions.includes('quarantine'));
    }
    if (value.contingencyObjectives !== undefined) {
      requireShortText(value.contingencyObjectives, 'Contingency objectives', 700);
      assert.ok(value.coordinationActions.includes('contingency-objectives'));
    }
    if (value.rationale !== undefined) assert.ok(typeof value.rationale === 'string' && value.rationale.length <= 2000);
    if (value.replaceExisting !== undefined) assert.equal(typeof value.replaceExisting, 'boolean');
    if (value.admitVoyage !== undefined) assert.equal(typeof value.admitVoyage, 'boolean');
    if (value.admitVoyage === true) assert.equal(value.vesselReality, 'real',
      'Voyage admission requires the deliberate real-vessel ruling.');
  }
  if (choice.diseaseQuarantine !== undefined) assert.ok(['activate', 'release'].includes(choice.diseaseQuarantine),
    'Disease quarantine only supports the source actions activate or release.');
  if (choice.zealotry !== undefined) {
    const value = choice.zealotry;
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    assert.ok(Array.isArray(value.actions) && value.actions.every(action => ZEALOTRY_ACTIONS.includes(action)) &&
      new Set(value.actions).size === value.actions.length, 'Use only distinct source-defined Zealotry responses.');
    if (value.customResponse !== undefined) assert.ok(typeof value.customResponse === 'string' && value.customResponse.length <= 1000);
    if (value.rationale !== undefined) assert.ok(typeof value.rationale === 'string' && value.rationale.length <= 2000);
    assert.ok(value.actions.length > 0 || value.customResponse?.trim(),
      'Record at least one source response or explicit custom response.');
    if (value.replaceExisting !== undefined) assert.equal(typeof value.replaceExisting, 'boolean');
  }
  if (choice.civilUnrest !== undefined) {
    const value = choice.civilUnrest;
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    requireShortText(value.presidentResponse, 'Facilitator-recorded President response', 1000);
    requireShortText(value.consequence, 'Facilitator-recorded consequence', 1000);
    if (value.rationale !== undefined) assert.ok(typeof value.rationale === 'string' && value.rationale.length <= 2000);
    if (value.replaceExisting !== undefined) assert.equal(typeof value.replaceExisting, 'boolean');
  }
  if (choice.grievance !== undefined) {
    const value = choice.grievance;
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    assert.ok(typeof value.roleId === 'string' && value.roleId.length > 0);
    requireShortText(value.text, 'Current ship team grievance', 2000);
    assert.ok(value.visibility === 'private' || value.visibility === 'public');
    if (value.reviseExisting !== undefined) assert.equal(typeof value.reviseExisting, 'boolean');
  }
  if (choice.voyageMovement !== undefined) {
    const value = choice.voyageMovement;
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    if (value.action === 'dock') requireShortText(value.hostName, 'Server-listed Voyage host', 100);
    else if (value.action === 'jump') requireShortText(value.destinationLabel, 'Server-listed Voyage destination', 120);
    else assert.fail('Choose only a currently offered Voyage dock or jump control.');
  }
  if (choice.voyageMaintenance !== undefined) validateVoyageMaintenanceChoice(choice.voyageMaintenance);
  return true;
}

const REQUIRED_BRANCH_SUPPLIERS = Object.freeze({
  'approaching-vessel-response': choices => Boolean(choices.approachingVessel),
  'voyage-admission': choices => choices.approachingVessel?.admitVoyage === true,
  'disease-quarantine': choices => Boolean(choices.diseaseQuarantine),
  'zealotry-response': choices => Boolean(choices.zealotry),
  'civil-unrest-resolution': choices => Boolean(choices.civilUnrest),
  'civil-unrest-team-grievance': choices => Boolean(choices.grievance),
  'voyage-host-docking': choices => choices.voyageMovement?.action === 'dock',
  'voyage-jump': choices => choices.voyageMovement?.action === 'jump',
  'voyage-maintenance-begin': choices => choices.voyageMaintenance?.action === 'begin',
  'voyage-maintenance-rations': choices => choices.voyageMaintenance?.action === 'rations',
  'voyage-maintenance-unrest': choices => choices.voyageMaintenance?.action === 'unrest',
  'voyage-maintenance-riot': choices => choices.voyageMaintenance?.action === 'riot',
  'voyage-maintenance-reactor': choices => choices.voyageMaintenance?.action === 'reactor',
  'voyage-maintenance-end': choices => choices.voyageMaintenance?.action === 'end',
});

/** Required branches fail before touching the UI unless their exact source choice was supplied. */
export function assertRequiredCrisisChoices(choices = {}) {
  validateCrisisChoice(choices);
  for (const branch of choices.requiredBranches ?? []) {
    const supplies = REQUIRED_BRANCH_SUPPLIERS[branch];
    assert.equal(typeof supplies, 'function', `Unknown required crisis/voyage branch: ${branch}`);
    assert.ok(supplies(choices), `Required current-source choice is missing for ${branch}.`);
  }
  return true;
}

function validateVoyageMaintenanceChoice(choice) {
  assert.ok(choice && typeof choice === 'object' && !Array.isArray(choice));
  assert.ok(['begin', 'rations', 'unrest', 'riot', 'reactor', 'end'].includes(choice.action),
    'Choose only a source-offered Voyage maintenance step.');
  if (choice.action === 'rations') assert.ok([choice.foodLevel, choice.waterLevel].every(level =>
    Number.isSafeInteger(level) && level >= 0 && level <= 3),
  'Choose explicit printed food and water ration levels from 0 to 3.');
  if (choice.action === 'reactor') {
    assert.ok(Object.hasOwn(choice, 'consoleId') &&
      (choice.consoleId === null || ['water-reclamation', 'hydroponics'].includes(choice.consoleId)),
    'Choose a source-offered reactor console or explicitly choose no console.');
    if (choice.confirmSkippedCharging !== undefined) assert.equal(typeof choice.confirmSkippedCharging, 'boolean');
  }
  return true;
}

async function readWorkflow(surface) {
  return surface.page.evaluate(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    const state = useSessionStore.getState();
    const session = state.session;
    const crisis = state.gmCrisisState;
    const maintenance = session?.voyage33Maintenance;
    return {
      sessionId: session?.id ?? null,
      phase: session?.phase ?? null,
      cycle: session?.currentTurn ?? null,
      turnStatePhase: session?.turnState?.phase ?? null,
      connection: state.connection ?? null,
      freshness: state.sessionSnapshotFreshness ?? null,
      playerRole: state.me?.role ?? null,
      sameActor: !!state.me?.uid && !!state.gmInstance && state.gmInstance.uid === state.me.uid &&
        state.gmInstance.sessionId === session?.id,
      uidHash: state.me?.uid ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(state.me.uid)))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null,
      instanceId: state.gmInstance?.id ?? null,
      gmInstanceOwned: !!state.gmInstance && state.gmInstance.uid === state.me?.uid && state.gmInstance.sessionId === session?.id,
      fullGameDemo: session?.fullGameDemo ?? null,
      crisis: crisis ? { kind: crisis.crisisKind ?? null, state: crisis.state ?? null, revision: crisis.revision ?? null } : null,
      voyageAdmitted: session?.voyage33Admission?.status === 'admitted',
      maintenance: maintenance && typeof maintenance === 'object' ? {
        dockingRevision: maintenance.dockingRevision ?? null,
        hostAssigned: typeof maintenance.hostShipId === 'string' && maintenance.hostShipId.length > 0,
        step: maintenance.cycle?.step ?? null,
        cycleRevision: maintenance.cycle?.revision ?? null,
        cycleTurn: maintenance.cycle?.turn ?? null,
      } : null,
    };
  });
}

function assertManualGmStage(state, context, expectedPhase) {
  assertGmInstanceFence(state, { actorKind: 'gm', sessionId: context.initial.sessionId,
    uidHash: context.started.uidHash, instanceId: context.started.instanceId,
    cycle: state.cycle, phase: 'active', turnStatePhase: state.turnStatePhase });
  assert.equal(state.fullGameDemo?.status, 'active');
  assert.equal(state.fullGameDemo?.progression, 'manual');
  if (expectedPhase) assert.equal(state.turnStatePhase, expectedPhase,
    `This source action requires the current ${expectedPhase} stage.`);
}

function gmActor(context, state) {
  return { actorKind: 'gm', sessionId: context.initial.sessionId, uidHash: state.uidHash,
    instanceId: state.instanceId, cycle: state.cycle, phase: state.phase,
    turnStatePhase: state.turnStatePhase };
}

async function commitGmUi({ context, surface, state, branch, endpoint, button, requiredBranches, statusPairs }) {
  assertManualGmStage(state, context);
  const shown = await button.isVisible().catch(() => false);
  if (!shown || !(await button.isEnabled().catch(() => false))) {
    return blocked(branch, [shown ? 'source-control-disabled-by-live-game-state' : 'source-control-not-mounted'],
      { requiredBranches });
  }
  const { request, result, replay } = await captureMountedUiAction({ surface, endpoint,
    expectedActor: gmActor(context, state), executeUi: () => button.click(), statusPairs });
  return privateSafeActionReceipt({ family: FAMILY, branch, endpoint, actor: { uidHash: state.uidHash, roleId: 'gm' },
    sessionId: context.initial.sessionId, cycle: state.cycle, phase: state.phase, request, result, replay, statusPairs });
}

async function runApproachingVessel(context, choice, options) {
  const branch = RESPONSE_BRANCH;
  const state = await readWorkflow(context.gm);
  if (state.crisis?.kind !== 'approaching-vessel' || state.crisis.state !== 'debated') {
    return blocked(branch, ['no-current-debated-approaching-vessel-crisis'], options);
  }
  const region = context.gm.page.getByRole('region', { name: 'Approaching Vessel adjudication', exact: true });
  if (!(await region.isVisible().catch(() => false))) return blocked(branch, ['adjudication-control-not-mounted'], options);
  const existing = region.getByRole('region', { name: 'Committed private adjudication', exact: true });
  if (await existing.isVisible().catch(() => false) && choice.replaceExisting !== true) {
    return blocked(branch, ['private-adjudication-already-exists-explicit-revision-required'], options);
  }
  const form = region.getByRole('form', { name: 'Record Approaching Vessel response', exact: true });
  await form.getByLabel('Vessel reality', { exact: true }).selectOption(choice.vesselReality);
  for (const [value, label] of Object.entries(RESPONSE_LABELS)) {
    const checkbox = form.getByRole('checkbox', { name: label, exact: true });
    if (choice.responseChoices.includes(value)) await checkbox.check(); else await checkbox.uncheck();
  }
  for (const [value, label] of Object.entries(COORDINATION_LABELS)) {
    const checkbox = form.getByRole('checkbox', { name: label, exact: true });
    if (choice.coordinationActions.includes(value)) await checkbox.check(); else await checkbox.uncheck();
  }
  if (choice.coordinationActions.includes('quarantine')) {
    await form.getByLabel('Quarantine staffing and enforcement', { exact: true }).fill(choice.quarantineInstructions);
  }
  if (choice.coordinationActions.includes('contingency-objectives')) {
    await form.getByLabel('Actionable contingency objectives', { exact: true }).fill(choice.contingencyObjectives);
  }
  await form.getByLabel('Fleet response instructions', { exact: true }).fill(choice.responseInstructions);
  await form.getByLabel('Private facilitator rationale', { exact: true }).fill(choice.rationale ?? '');
  return commitGmUi({ context, surface: context.gm, state, branch, endpoint: 'recordApproachingVesselResponse',
    button: form.getByRole('button', { name: 'Commit adjudication and response', exact: true }),
    requiredBranches: options.requiredBranches });
}

async function runVoyageAdmission(context, options) {
  const branch = 'voyage-admission';
  const state = await readWorkflow(context.gm);
  if (state.crisis?.kind !== 'approaching-vessel' || !state.crisis.state ||
      ['draft', 'closed'].includes(state.crisis.state)) return blocked(branch,
    ['no-active-approaching-vessel-crisis'], options);
  if (state.voyageAdmitted) return blocked(branch, ['voyage-33-0-already-admitted'], options);
  const region = context.gm.page.getByRole('region', { name: 'Voyage 33-0 admission', exact: true });
  const button = region.getByRole('button', { name: 'Admit Voyage 33-0', exact: true });
  return commitGmUi({ context, surface: context.gm, state, branch, endpoint: 'admitVoyage33', button,
    requiredBranches: options.requiredBranches });
}

async function runDiseaseQuarantine(context, action, options) {
  const branch = 'disease-quarantine';
  const state = await readWorkflow(context.gm);
  if (state.crisis?.kind !== 'disease-outbreak' || !state.crisis.state || ['draft', 'closed'].includes(state.crisis.state)) {
    return blocked(branch, ['no-current-delivered-disease-outbreak'], options);
  }
  const region = context.gm.page.getByRole('region', { name: 'Disease quarantine docking policy', exact: true });
  const expectedLabel = action === 'activate' ? 'Activate quarantine' : 'Release quarantine';
  const button = region.getByRole('button', { name: expectedLabel, exact: true });
  return commitGmUi({ context, surface: context.gm, state, branch, endpoint: 'setDiseaseQuarantine', button,
    requiredBranches: options.requiredBranches });
}

async function runZealotry(context, choice, options) {
  const branch = 'zealotry-response';
  const state = await readWorkflow(context.gm);
  if (state.crisis?.kind !== 'religious-zealotry' || state.crisis.state !== 'debated') {
    return blocked(branch, ['no-current-debated-religious-zealotry-crisis'], options);
  }
  const region = context.gm.page.getByRole('region', { name: 'Private Religious Zealotry response', exact: true });
  if (!(await region.isVisible().catch(() => false))) return blocked(branch, ['private-response-control-not-mounted'], options);
  const current = await region.locator('[role="status"]').last().textContent().catch(() => '');
  if (current?.includes('Recorded response') && choice.replaceExisting !== true) {
    return blocked(branch, ['private-response-already-exists-explicit-revision-required'], options);
  }
  for (const action of ZEALOTRY_ACTIONS) {
    const checkbox = region.getByRole('checkbox', { name: ZEALOTRY_LABELS[action], exact: true });
    if (choice.actions.includes(action)) await checkbox.check(); else await checkbox.uncheck();
  }
  await region.getByLabel('Custom Religious Zealotry response', { exact: true }).fill(choice.customResponse ?? '');
  await region.getByLabel('Private Religious Zealotry rationale', { exact: true }).fill(choice.rationale ?? '');
  return commitGmUi({ context, surface: context.gm, state, branch, endpoint: 'recordZealotryResponse',
    button: region.getByRole('button', { name: 'Record private response', exact: true }),
    requiredBranches: options.requiredBranches });
}

async function runCivilUnrestResolution(context, choice, options) {
  const branch = 'civil-unrest-resolution';
  const state = await readWorkflow(context.gm);
  if (state.crisis?.kind !== 'civil-unrest' || state.crisis.state !== 'debated') {
    return blocked(branch, ['no-current-debated-civil-unrest-crisis'], options);
  }
  const region = context.gm.page.getByRole('region', { name: 'Private Civil Unrest resolution', exact: true });
  if (!(await region.isVisible().catch(() => false))) return blocked(branch, ['private-resolution-control-not-mounted'], options);
  const existing = region.locator('[aria-label="Current Civil Unrest grievance links"]');
  if (await existing.isVisible().catch(() => false) && choice.replaceExisting !== true) {
    return blocked(branch, ['private-resolution-already-exists-explicit-revision-required'], options);
  }
  await region.getByLabel('Facilitator-recorded President response', { exact: true }).fill(choice.presidentResponse);
  await region.getByLabel('Facilitator-recorded consequence', { exact: true }).fill(choice.consequence);
  await region.getByLabel('Private Civil Unrest rationale', { exact: true }).fill(choice.rationale ?? '');
  return commitGmUi({ context, surface: context.gm, state, branch, endpoint: 'recordCivilUnrestResolution',
    button: region.getByRole('button', { name: 'Record private Civil Unrest resolution', exact: true }),
    requiredBranches: options.requiredBranches });
}

async function runGrievance(context, choice, options) {
  const branch = 'civil-unrest-team-grievance';
  const actorInfo = await enterPreparedRoleStation({ crew: context.crew, initial: context.initial,
    roster: context.roster, roleId: choice.roleId });
  const state = await context.crew.observe();
  assertPlayerActorFence(state, actorInfo.actor);
  if (state.turnStatePhase !== 'team') return blocked(branch, ['current-source-phase-is-not-team'], options);
  const report = context.crew.page.getByRole('region', { name: 'Fleet crisis report', exact: true });
  const panel = context.crew.page.getByRole('region', { name: 'Civil Unrest team grievances', exact: true });
  if (!(await report.isVisible().catch(() => false)) || !(await panel.isVisible().catch(() => false))) {
    return blocked(branch, ['no-current-delivered-debated-or-escalated-civil-unrest-report'], options);
  }
  const current = panel.getByRole('article', { name: 'Your current team grievance', exact: true });
  const hasCurrent = await current.isVisible().catch(() => false);
  if (hasCurrent && choice.reviseExisting !== true) return blocked(branch,
    ['current-team-grievance-exists-explicit-revision-required'], options);
  if (!hasCurrent && choice.reviseExisting === true) return blocked(branch,
    ['no-current-team-grievance-to-revise'], options);
  const field = panel.getByLabel("Your team's grievance", { exact: true });
  await field.fill(choice.text);
  await panel.locator(`input[name="civil-unrest-audience"][value="${choice.visibility}"]`).check();
  const button = panel.getByRole('button', { name: hasCurrent ? 'Revise grievance' : 'Submit grievance', exact: true });
  if (!(await button.isEnabled().catch(() => false))) return blocked(branch,
    ['current-grievance-control-disabled-by-live-source-state'], options);
  const { request, result, replay } = await captureMountedUiAction({ surface: context.crew,
    endpoint: 'submitCivilUnrestGrievance', expectedActor: actorInfo.actor, executeUi: () => button.click() });
  return privateSafeActionReceipt({ family: FAMILY, branch, endpoint: 'submitCivilUnrestGrievance',
    actor: { uidHash: actorInfo.actor.uidHash, roleId: choice.roleId }, sessionId: context.initial.sessionId,
    cycle: actorInfo.actor.cycle, phase: actorInfo.actor.phase, request, result, replay });
}

const VOYAGE_STATUS_PAIRS = Object.freeze([
  ['jumped', 'replayed'], ['drive-failure', 'replayed'], ['integrity-locked', 'replayed'], ['integrity-lockout', 'replayed'],
]);

/** One real, current GM-owned dock/jump choice. Destinations and hosts come only from visible server controls. */
export async function proveVoyage33Movement(context, choice = {}, options = {}) {
  if (!choice || typeof choice !== 'object' || !['dock', 'jump'].includes(choice.action)) {
    const branch = options.requiredBranches?.includes('voyage-jump') ? 'voyage-jump' : 'voyage-host-docking';
    return missing(branch, options);
  }
  const state = await context.gm.observe();
  const branch = choice.action === 'dock' ? 'voyage-host-docking' : 'voyage-jump';
  const blockerCodes = [];
  if (state.phase !== 'active') blockerCodes.push('gameplay-not-active');
  if (state.fullGameDemo?.status !== 'active' || state.fullGameDemo?.progression !== 'manual') blockerCodes.push('not-active-manual-demo');
  if (state.connection !== 'live' || state.freshness !== 'server') blockerCodes.push('not-live-server-backed');
  if (state.turnStatePhase !== (choice.action === 'dock' ? 'team' : 'coordination')) blockerCodes.push('not-source-required-current-turn-stage');
  if (blockerCodes.length) return blocked(branch, blockerCodes, options);
  assertManualGmStage(state, context, choice.action === 'dock' ? 'team' : 'coordination');
  const workspace = context.gm.page.getByRole('region', { name: 'Voyage 33-0 movement workspace', exact: true });
  if (!(await workspace.isVisible().catch(() => false))) return blocked(branch,
    ['voyage-not-admitted-or-current-movement-projection-unavailable'], options);
  if (choice.action === 'dock') {
    const button = workspace.getByRole('button', { name: `Dock with ${choice.hostName}`, exact: true });
    const offered = await button.isVisible().catch(() => false);
    if (!offered) return blocked(branch, ['chosen-host-not-in-current-server-listed-dock-options'], options);
    const { request, result, replay } = await captureMountedUiAction({ surface: context.gm,
      endpoint: 'dockVoyage33', expectedActor: gmActor(context, state), executeUi: () => button.click(),
      statusPairs: [['committed', 'replayed']] });
    return privateSafeActionReceipt({ family: FAMILY, branch, endpoint: 'dockVoyage33',
      actor: { uidHash: state.uidHash, roleId: 'gm' }, sessionId: context.initial.sessionId,
      cycle: state.cycle, phase: state.phase, request, result, replay, statusPairs: [['committed', 'replayed']] });
  }
  const buttons = workspace.getByRole('button', { name: /^Jump to .* \/\/ (short|medium|long) \/\/ [0-9]+ host fuel$/i });
  const matches = await buttons.all();
  let button;
  for (const candidate of matches) {
    const name = await candidate.getAttribute('aria-label').catch(() => null) ?? await candidate.textContent();
    if (name?.includes(choice.destinationLabel)) {
      assert.equal(button, undefined, 'The selected destination label must be unique among the source-offered routes.');
      button = candidate;
    }
  }
  if (!button || !(await button.isVisible().catch(() => false))) return blocked(branch,
    ['chosen-destination-not-in-current-server-listed-routes'], options);
  const { request, result, replay } = await captureMountedUiAction({ surface: context.gm,
    endpoint: 'jumpVoyage33', expectedActor: gmActor(context, state), executeUi: () => button.click(),
    statusPairs: VOYAGE_STATUS_PAIRS });
  return privateSafeActionReceipt({ family: FAMILY, branch, endpoint: 'jumpVoyage33',
    actor: { uidHash: state.uidHash, roleId: 'gm' }, sessionId: context.initial.sessionId,
    cycle: state.cycle, phase: state.phase, request, result, replay, statusPairs: VOYAGE_STATUS_PAIRS });
}

/** One explicit current maintenance step; random results are generated only by the ordinary server button. */
export async function proveVoyage33Maintenance(context, choice = {}, options = {}) {
  if (!choice || typeof choice !== 'object' || !['begin', 'rations', 'unrest', 'riot', 'reactor', 'end'].includes(choice.action)) {
    const branch = options.requiredBranches?.find(value => value.startsWith('voyage-maintenance-')) ?? 'voyage-maintenance-begin';
    return missing(branch, options);
  }
  validateVoyageMaintenanceChoice(choice);
  const state = await context.gm.observe();
  const branch = `voyage-maintenance-${choice.action}`;
  const blockedBy = [];
  if (state.phase !== 'active') blockedBy.push('gameplay-not-active');
  if (state.fullGameDemo?.status !== 'active' || state.fullGameDemo?.progression !== 'manual') blockedBy.push('not-active-manual-demo');
  if (state.connection !== 'live' || state.freshness !== 'server') blockedBy.push('not-live-server-backed');
  if (state.turnStatePhase !== 'team') blockedBy.push('voyage-maintenance-is-team-phase-only');
  if (blockedBy.length) return blocked(branch, blockedBy, options);
  assertManualGmStage(state, context, 'team');
  const workspace = context.gm.page.getByRole('region', { name: 'Voyage 33-0 movement workspace', exact: true });
  const panel = workspace.getByRole('region', { name: 'Voyage 33-0 maintenance', exact: true });
  if (!(await panel.isVisible().catch(() => false))) return blocked(branch,
    ['no-current-admission-and-docked-host-maintenance-panel'], options);
  const current = await readWorkflow(context.gm);
  if (!current.maintenance?.hostAssigned || !Number.isSafeInteger(current.maintenance.step)) return blocked(branch,
    ['server-confirmed-docked-host-maintenance-projection-unavailable'], options);
  const currentStep = current.maintenance.step;
  const expectedStepByAction = { begin: 0, rations: 1, unrest: 2, riot: 3, reactor: 4, end: 5 };
  if (currentStep !== expectedStepByAction[choice.action]) return blocked(branch,
    [`source-current-maintenance-step-${currentStep}-does-not-offer-${choice.action}`], options);
  let button;
  if (choice.action === 'begin') button = panel.getByRole('button', { name: /^Begin maintenance cycle \/\/ Cycle \d+$/ });
  if (choice.action === 'rations') {
    await panel.getByLabel('Voyage 33-0 food ration level', { exact: true }).selectOption(String(choice.foodLevel));
    await panel.getByLabel('Voyage 33-0 water ration level', { exact: true }).selectOption(String(choice.waterLevel));
    button = panel.getByRole('button', { name: 'Apply host-funded rations', exact: true });
  }
  if (choice.action === 'unrest') button = panel.getByRole('button', { name: 'Roll unrest // server dice', exact: true });
  if (choice.action === 'riot') button = panel.getByRole('button', { name: 'Roll population / riot // server dice', exact: true });
  if (choice.action === 'reactor') {
    const skipped = await panel.getByRole('button', { name: 'Confirm skipped console charging', exact: true }).isVisible().catch(() => false);
    if (skipped) {
      if (choice.confirmSkippedCharging !== true) return blocked(branch,
        ['source-population-loss-skipped-charging-explicit-confirmation-required'], options);
      button = panel.getByRole('button', { name: 'Confirm skipped console charging', exact: true });
    } else {
      if (choice.consoleId === null) {
        const selection = panel.locator('input[name="voyage33-console"]:checked');
        if (await selection.count()) return blocked(branch,
          ['a-selected-console-cannot-be-cleared-through-the-mounted-source-control'], options);
      } else await panel.locator(`input[name="voyage33-console"][value="${choice.consoleId}"]`).check();
      button = panel.getByRole('button', { name: 'Resolve console charging', exact: true });
    }
  }
  if (choice.action === 'end') button = panel.getByRole('button', { name: 'End maintenance cycle', exact: true });
  const shown = await button.isVisible().catch(() => false);
  if (!shown || !(await button.isEnabled().catch(() => false))) return blocked(branch,
    [shown ? 'maintenance-control-disabled-by-current-ledger-or-authority' : 'source-maintenance-control-not-mounted'], options);
  const { request, result, replay } = await captureMountedUiAction({ surface: context.gm,
    endpoint: 'runVoyage33Maintenance', expectedActor: gmActor(context, state), executeUi: () => button.click() });
  return privateSafeActionReceipt({ family: FAMILY, branch, endpoint: 'runVoyage33Maintenance',
    actor: { uidHash: state.uidHash, roleId: 'gm' }, sessionId: context.initial.sessionId,
    cycle: state.cycle, phase: state.phase, request, result, replay });
}

async function saveEvidence(context, report) {
  const directory = resolve(context.directory ?? process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence');
  const outputDirectory = resolve(directory, 'finite-action-families');
  await mkdir(outputDirectory, { recursive: true });
  const output = resolve(outputDirectory, `crisis-voyage-${randomUUID()}.json`);
  const safe = { schemaVersion: 1, ...report, rawCrisisIdsPersisted: false, privateRationalePersisted: false,
    grievanceTextPersisted: false, hiddenRollsPersisted: false, physicalAttendanceProof: false,
    runtimeBinding: 'Parent-owned fresh run must bind actual product and compiled runtime before and after execution.' };
  await writeFile(output, `${JSON.stringify(safe, null, 2)}\n`, { flag: 'wx' });
  return { ...safe, evidencePath: output };
}

/** Actual current GM controls only; an absent crisis stays blocked and no draft is created here. */
export async function proveCrisisVoyageAndUnrest(context, choices = {}) {
  assertRequiredCrisisChoices(choices);
  const gmState = await context.gm.observe();
  const gate = assertFreshManualStart({ gm: gmState, started: context.started, initial: context.initial });
  const report = { family: FAMILY, sessionIdHash: sha256(gate.sessionId), cycle: gate.cycle,
    accepted: [], blocked: [], pending: [], crisisCreationAttempted: false, hiddenResultsPersisted: false };
  for (const branch of Object.keys(REQUIRED_BRANCH_SUPPLIERS)) {
    if (!REQUIRED_BRANCH_SUPPLIERS[branch](choices)) report.blocked.push(missing(branch, choices));
  }
  if (choices.approachingVessel) {
    const response = await runApproachingVessel(context, choices.approachingVessel, choices);
    if (response.accepted === false) report.blocked.push(response); else report.accepted.push(response);
    if (choices.approachingVessel.admitVoyage === true) {
      const admission = await runVoyageAdmission(context, choices);
      if (admission.accepted === false) report.blocked.push(admission); else report.accepted.push(admission);
    }
  }
  if (choices.diseaseQuarantine) {
    const result = await runDiseaseQuarantine(context, choices.diseaseQuarantine, choices);
    if (result.accepted === false) report.blocked.push(result); else report.accepted.push(result);
  } else report.blocked.push(missing('disease-quarantine', choices));
  if (choices.zealotry) {
    const result = await runZealotry(context, choices.zealotry, choices);
    if (result.accepted === false) report.blocked.push(result); else report.accepted.push(result);
  } else report.blocked.push(missing('zealotry-response', choices));
  if (choices.civilUnrest) {
    const result = await runCivilUnrestResolution(context, choices.civilUnrest, choices);
    if (result.accepted === false) report.blocked.push(result); else report.accepted.push(result);
  } else report.blocked.push(missing('civil-unrest-resolution', choices));
  if (choices.grievance) {
    const result = await runGrievance(context, choices.grievance, choices);
    if (result.accepted === false) report.blocked.push(result); else report.accepted.push(result);
  } else report.blocked.push(missing('civil-unrest-team-grievance', choices));
  if (choices.voyageMovement || choices.requiredBranches?.some(branch => ['voyage-host-docking', 'voyage-jump'].includes(branch))) {
    report.pending.push('voyage-movement-requires-onVoyageMovement-at-the-source Team-or-Coordination-stage');
  }
  if (choices.voyageMaintenance || choices.requiredBranches?.some(branch => branch.startsWith('voyage-maintenance-'))) {
    report.pending.push('voyage-maintenance-requires-onVoyageMaintenance-after-a-real-admission-and-docking');
  }
  return saveEvidence(context, report);
}

function requiredMissingMovementBranch(choices) {
  return choices.requiredBranches?.find(branch => ['voyage-host-docking', 'voyage-jump'].includes(branch)) ?? 'voyage-host-docking';
}

function requiredMissingMaintenanceBranch(choices) {
  return choices.requiredBranches?.find(branch => branch.startsWith('voyage-maintenance-')) ?? 'voyage-maintenance-begin';
}

export function createCrisisVoyageCallbacks(choices = {}) {
  return Object.freeze({ onStarted: context => proveCrisisVoyageAndUnrest(context, choices),
    onVoyageMovement: context => choices.voyageMovement
      ? proveVoyage33Movement(context, choices.voyageMovement, choices)
      : Promise.resolve(missing(requiredMissingMovementBranch(choices), choices)),
    onVoyageMaintenance: context => choices.voyageMaintenance
      ? proveVoyage33Maintenance(context, choices.voyageMaintenance, choices)
      : Promise.resolve(missing(requiredMissingMaintenanceBranch(choices), choices)) });
}

const BASE_C4_TRAINING_CRISIS_STATES = Object.freeze([
  'draft', 'delivered', 'debated', 'resolved', 'announced', 'closed',
]);
const BASE_C4_TRAINING_CRISIS_CHOICE = Object.freeze({
  crisisKind: 'custom',
  title: 'Training supply debate',
  details: 'The virtual fleet considers its actual post-mission supply result.',
  deliveryPressure: 'hold',
});
function validateBaseC4TrainingCrisisChoice(choice) {
  assert.ok(choice && typeof choice === 'object' && !Array.isArray(choice),
    'An explicit root GM custom-crisis choice is required.');
  const allowed = new Set(['crisisId', 'crisisKind', 'title', 'details', 'deliveryPressure']);
  assert.ok(Object.keys(choice).every(key => allowed.has(key)), 'Unknown Base C4 training-crisis choice.');
  assert.ok(typeof choice.crisisId === 'string' && choice.crisisId === choice.crisisId.trim() &&
    /^[A-Za-z0-9_-]{1,80}$/.test(choice.crisisId), 'Supply a new, explicit source-valid crisis identifier.');
  for (const key of ['crisisKind', 'title', 'details', 'deliveryPressure']) {
    assert.equal(choice[key], BASE_C4_TRAINING_CRISIS_CHOICE[key], `Use the explicitly approved ${key} choice.`);
  }
  return true;
}

function baseC4CrisisPending(blockerCodes, completedStates = [], nextActor =
  'The original authenticated GM at the current Crisis state machine control.') {
  return Object.freeze({ family: 'base-c4-custom-crisis', status: 'pending', accepted: false,
    blockerCodes: [...new Set(blockerCodes)], completedStates: [...completedStates], nextActor,
    physicalAttendanceProof: false, gameplayAcceptance: false });
}

async function readMountedGmCrisis(surface) {
  assert.ok(typeof surface?.storeModuleUrl === 'function', 'The ordinary GM store projection is required.');
  return surface.page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const store = useSessionStore.getState();
    const crisis = store.gmCrisisState;
    return {
      sessionId: store.session?.id ?? null,
      live: store.connection === 'live' && store.sessionSnapshotFreshness === 'server',
      crisis: crisis ? {
        crisisId: crisis.crisisId,
        state: crisis.state,
        revision: crisis.revision,
        title: crisis.title,
        details: crisis.details,
        crisisKind: crisis.crisisKind,
        deliveryPressure: crisis.deliveryPressure,
      } : null,
    };
  }, surface.storeModuleUrl());
}

function baseC4GmBlockers(identity, context) {
  const blockers = [];
  if (!context.initial?.sessionId || identity?.sessionId !== context.initial.sessionId) blockers.push('not-original-session');
  if (identity?.cycle !== 4) blockers.push('not-actual-cycle-four');
  if (identity?.phase !== 'active') blockers.push('gameplay-not-active');
  if (identity?.turnStatePhase !== 'coordination') blockers.push('not-actual-coordination-phase');
  if (identity?.playerRole !== 'gm' || identity?.sameActor !== true) blockers.push('not-original-authenticated-gm');
  if (identity?.connection !== 'live' || identity?.freshness !== 'server') blockers.push('gm-snapshot-not-live-server-backed');
  if (identity?.gmInstanceOwned !== true) blockers.push('original-gm-instance-not-owned');
  if (!context.started?.uidHash || identity?.uidHash !== context.started.uidHash) blockers.push('original-gm-account-changed');
  if (!context.started?.instanceId || identity?.instanceId !== context.started.instanceId) blockers.push('original-gm-instance-changed');
  return blockers;
}

async function fillBaseC4TrainingDraft(region, choice) {
  const controls = [
    [region.getByRole('combobox', { name: 'Crisis kind', exact: true }), choice.crisisKind, 'crisis-kind'],
    [region.getByRole('combobox', { name: /Crisis delivery pressure/ }), choice.deliveryPressure, 'delivery-pressure'],
    [region.getByLabel('Crisis identifier', { exact: true }), choice.crisisId, 'crisis-identifier'],
    [region.getByLabel('Crisis title', { exact: true }), choice.title, 'crisis-title'],
    [region.getByLabel('Crisis facilitator notes', { exact: true }), choice.details, 'crisis-facilitator-notes'],
  ];
  for (const [control, value, field] of controls) {
    if (!(await control.isVisible().catch(() => false)) || !(await control.isEnabled().catch(() => false))) {
      return `current-crisis-${field}-control-not-visible-and-enabled`;
    }
    if (field === 'crisis-kind' || field === 'delivery-pressure') await control.selectOption(value);
    else await control.fill(value);
  }
  return null;
}

/**
 * Commit the approved C4 training debate only through the normal GM crisis UI.
 * The caller must provide the actual C4 Coordination context and all explicit
 * choice fields. Every transition must be source-projected and offered; a
 * missing transition leaves the remainder pending without synthesizing it.
 */
export async function runBaseC4CustomCrisisLifecycle(context, choice = undefined) {
  if (choice === undefined) return baseC4CrisisPending(['explicit-root-gm-crisis-choice-not-supplied']);
  validateBaseC4TrainingCrisisChoice(choice);
  if (!context?.gm || !context?.started || !context?.initial?.sessionId) {
    return baseC4CrisisPending(['original-gm-session-context-unavailable'], [],
      'The Base gameplay caller must supply its original started GM and session context.');
  }
  const initialIdentity = await context.gm.observe();
  const initialBlockers = baseC4GmBlockers(initialIdentity, context);
  if (initialBlockers.length) return baseC4CrisisPending(initialBlockers, [],
    'The root-owned normal turn driver must reach the original live GM at actual Cycle 4 Coordination.');
  const initialExpectedActor = { actorKind: 'gm', sessionId: context.initial.sessionId,
    uidHash: context.started.uidHash, instanceId: context.started.instanceId,
    cycle: 4, phase: 'active', turnStatePhase: 'coordination' };
  assertGmInstanceFence(initialIdentity, initialExpectedActor);

  const initialProjection = await readMountedGmCrisis(context.gm);
  if (!initialProjection?.live || initialProjection.sessionId !== context.initial.sessionId) {
    return baseC4CrisisPending(['current-gm-crisis-projection-not-live-for-original-session']);
  }
  const currentCrisis = initialProjection.crisis;
  if (currentCrisis && currentCrisis.state !== 'closed') {
    return baseC4CrisisPending(['another-crisis-is-still-open', `current-crisis-state-${currentCrisis.state}`], [],
      'The original GM must close the existing source crisis through its offered lifecycle before starting a new one.');
  }
  if (currentCrisis && (!Number.isSafeInteger(currentCrisis.revision) || currentCrisis.revision < 1)) {
    return baseC4CrisisPending(['closed-crisis-source-revision-is-malformed']);
  }
  if (currentCrisis?.crisisId === choice.crisisId) {
    return baseC4CrisisPending(['new-crisis-identifier-must-differ-from-closed-record'], [],
      'The original GM must choose a fresh crisis identifier before creating a new lifecycle.');
  }

  const completedStates = [];
  const safeReceipts = [];
  for (const state of BASE_C4_TRAINING_CRISIS_STATES) {
    const currentProjection = await readMountedGmCrisis(context.gm);
    if (!currentProjection?.live || currentProjection.sessionId !== context.initial.sessionId) {
      return baseC4CrisisPending(['current-gm-crisis-projection-became-stale'], completedStates);
    }
    const current = currentProjection.crisis;
    if (state === 'draft') {
      if (current && (current.state !== 'closed' || current.crisisId === choice.crisisId)) {
        return baseC4CrisisPending(['source-no-longer-offers-a-new-crisis-draft'], completedStates);
      }
    } else {
      const previousState = BASE_C4_TRAINING_CRISIS_STATES[BASE_C4_TRAINING_CRISIS_STATES.indexOf(state) - 1];
      if (!current || current.crisisId !== choice.crisisId || current.state !== previousState ||
          !Number.isSafeInteger(current.revision) || current.revision < 1 ||
          current.title !== choice.title || current.details !== choice.details ||
          current.crisisKind !== choice.crisisKind || current.deliveryPressure !== choice.deliveryPressure) {
        return baseC4CrisisPending(['current-source-crisis-state-or-revision-does-not-match-expected-next-step'], completedStates);
      }
    }

    const observed = await context.gm.observe();
    const blockers = baseC4GmBlockers(observed, context);
    if (blockers.length) return baseC4CrisisPending(blockers, completedStates,
      'The original GM must remain live in Cycle 4 Coordination for each offered transition.');
    assertGmInstanceFence(observed, initialExpectedActor);
    const region = context.gm.page.getByRole('region', { name: 'Crisis state machine', exact: true });
    const button = region.getByRole('button', { name: `Mark ${state}`, exact: true });
    const visible = await button.isVisible().catch(() => false);
    const enabled = visible && await button.isEnabled().catch(() => false);
    if (!enabled) return baseC4CrisisPending([visible
      ? `source-disabled-mark-${state}-transition` : `source-does-not-offer-mark-${state}-transition`], completedStates);

    const preparationBlocker = state === 'draft' ? await fillBaseC4TrainingDraft(region, choice) : null;
    if (preparationBlocker) return baseC4CrisisPending([preparationBlocker], completedStates);
    const expectedRevision = current?.revision ?? 0;
    const { request, result, replay } = await captureMountedUiAction({
      surface: context.gm,
      endpoint: 'transitionCrisis',
      expectedActor: initialExpectedActor,
      executeUi: () => button.click(),
    });
    assert.equal(result.sessionId, context.initial.sessionId);
    assert.equal(result.crisisId, choice.crisisId);
    assert.equal(result.state, state);
    assert.equal(result.revision, expectedRevision + 1);
    assert.equal(result.title, choice.title);
    assert.equal(result.deliveryPressure, choice.deliveryPressure);
    const projectedText = `${choice.crisisId} // ${state} // revision ${result.revision}`;
    await context.gm.page.getByText(projectedText, { exact: true }).waitFor({ state: 'visible' });
    const afterProjection = await readMountedGmCrisis(context.gm);
    if (!afterProjection?.live || afterProjection.sessionId !== context.initial.sessionId ||
        afterProjection.crisis?.crisisId !== choice.crisisId || afterProjection.crisis?.state !== state ||
        afterProjection.crisis?.revision !== result.revision || afterProjection.crisis?.title !== choice.title ||
        afterProjection.crisis?.details !== choice.details || afterProjection.crisis?.crisisKind !== choice.crisisKind ||
        afterProjection.crisis?.deliveryPressure !== choice.deliveryPressure) {
      return baseC4CrisisPending(['committed-transition-not-yet-confirmed-in-current-gm-projection'], completedStates,
        'The original GM must wait for the live crisis projection before the next state transition.');
    }
    const identity = await context.gm.observe();
    assertGmInstanceFence(identity, initialExpectedActor);
    safeReceipts.push(privateSafeActionReceipt({ family: 'base-c4-custom-crisis', branch: `transition-${state}`,
      endpoint: 'transitionCrisis', actor: { uidHash: identity.uidHash, roleId: 'gm' },
      sessionId: context.initial.sessionId, cycle: 4, phase: 'active', request, result, replay }));
    completedStates.push(state);
  }
  return Object.freeze({ family: 'base-c4-custom-crisis', status: 'source-actions-committed', accepted: true,
    completedStates: Object.freeze(completedStates), receipts: Object.freeze(safeReceipts),
    physicalAttendanceProof: false, gameplayAcceptance: false });
}
