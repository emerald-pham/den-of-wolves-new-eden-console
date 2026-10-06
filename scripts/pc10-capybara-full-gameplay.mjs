import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';
import { advanceBaseDetectorResearch, runBaseCombatAndDeduction } from './pc10-base-combat-deduction-ui-proof.mjs';
import { completeOfferedTurnAdvance } from './pc10-full-game-demo-proof-helpers.mjs';
import { PC10_SPECIALIST_ACTIONS, runPc10SpecialistAction } from './pc10-specialist-phases.mjs';
import { createSpecialistGameplayDriver, sameActionReceipt, validateScoutRequestRecord,
  isRecordedScoutRequestEvidence } from './pc10-specialist-gameplay.mjs';
import { runPursuitLimitEnding } from './pc10-full-game-cycle-ending.mjs';

const SUCCESS_RESULT_STATUSES = new Set([
  'committed', 'arrived', 'requested', 'built', 'launched', 'selected', 'applied', 'repaired',
  'recycled', 'collected', 'allocated', 'advanced', 'sent', 'resolved', 'rolled', 'complete', 'replayed',
]);

const BASE_PLUS_CAPYBARA_SHIPS = Object.freeze([
  ['aegis', 'executive-officer', 'AEGIS', ['Jump Drive', 'Construction Bay', 'Command and Control', 'Missile Launchers', 'Point Defence Lasers'], { 'Shuttle Bay Zeta': 'starlight' }],
  ['dione', 'dione-engineer', 'Dione', ['Jump Drive', 'Hydroponics', 'Water Reclamation', 'Fighter Bay'], {}],
  ['icebreaker', 'icebreaker-engineer', 'Icebreaker', ['Jump Drive', 'Mining Drone Control', 'Ram Scoop', 'Hydroponics'], {}],
  ['shepherd', 'shepherd-engineer', 'Shepherd', ['Jump Drive', 'Advanced Hydroponics', 'Water Reclamation'], { 'Shuttle Bay': 'endeavour' }],
  ['quellon', 'quellon-engineer', 'Quellon', ['Jump Drive', 'Water Production', 'Water Production II'], { 'Shuttle Bay': 'hummingbird' }],
  ['refinery-124', 'refinery-124-engineer', 'Refinery 124', ['Jump Drive', 'Fuel Refinery', 'Fuel Refinery II', 'Water Reclamation'], {}],
  ['capybara', 'capybara-recycler', 'Capybara', ['Jump Drive', 'Shuttle Bay', 'Scrap Refinery'], {}],
]);

function normalizeReceipt(value) {
  const copy = value && typeof value === 'object' ? { ...value } : value;
  if (copy && typeof copy === 'object') delete copy.status;
  return copy;
}

export const CAPYBARA_REQUIRED_STAGES = Object.freeze([
  'capybara-maintenance-production', 'wing-scout', 'wing-construction', 'wing-combat-launch',
  'scientist-research', 'scientist-device', 'scientist-field-upgrade', 'explorer-harvest',
  'pdf-group-relay', 'pdf-escort-launch', 'macaw-dismantle-consent', 'macaw-repair',
  'boa-recycling', 'boa-mission-reclamation', 'macaw-wolf-scrap', 'boa-wolf-scrap',
  'mission-successful-delivery', 'genuine-ending',
]);

/** Source-backed insertion points; these never advance time or create an opportunity. */
export const CAPYBARA_STAGE_SCHEDULE = Object.freeze([
  { id: 'capybara-maintenance-production', before: 'team-advance', roles: ['capybara-recycler'], repeat: 'each-source-offered-cycle' },
  { id: 'wing-scout', before: 'team-advance', roles: ['wing-commander'], repeat: 'source-entitled-coordination' },
  { id: 'wing-construction', before: 'team-advance', roles: ['wing-commander'], availability: 'real-vacant-wing-capacity-and-charged-bay' },
  { id: 'wing-combat-launch', before: 'wolf-range-choice', roles: ['wing-commander'], availability: 'actual-offered-attack-window' },
  { id: 'scientist-research', before: 'team-advance', roles: ['shepherd-scientist'], availability: 'current-standard-research-slot-and-source-track' },
  { id: 'scientist-device', before: 'team-advance', roles: ['shepherd-scientist'], availability: 'actual-enabled-ECM-control' },
  { id: 'scientist-field-upgrade', before: 'team-advance', roles: ['shepherd-scientist'], availability: 'actual-live-targets-and-displayed-cost' },
  { id: 'explorer-harvest', before: 'team-advance', roles: ['quellon-explorer'], availability: 'actual-two-die-server-roll' },
  { id: 'pdf-group-relay', before: 'team-advance', roles: ['refinery-124-pdf-colonel'], availability: 'current-authenticated-group' },
  { id: 'pdf-escort-launch', before: 'wolf-range-choice', roles: ['refinery-124-pdf-colonel'], availability: 'actual-offered-escort-control' },
  { id: 'macaw-dismantle-consent', before: 'team-advance', roles: ['capybara-captain', 'target-player'], availability: 'real-docked-undamaged-console-and-distinct-target-consent' },
  { id: 'macaw-repair', before: 'team-advance', roles: ['capybara-captain'], availability: 'real-docked-host-damage-and-current-scrap' },
  { id: 'boa-recycling', before: 'team-advance', roles: ['capybara-recycler'], availability: 'fuelled-Boa-and-affordable-printed-host-recipe' },
  { id: 'boa-mission-reclamation', before: 'mission-deal', roles: ['capybara-recycler'], availability: 'actual-unstarted-mission-task-at-current-group-location' },
  { id: 'macaw-wolf-scrap', before: 'post-wolf-recovery', roles: ['capybara-captain'], availability: 'actual-post-wolf-three-damage-only' },
  { id: 'boa-wolf-scrap', before: 'post-wolf-recovery', roles: ['capybara-recycler'], availability: 'actual-post-wolf-three-damage-only' },
  { id: 'mission-successful-delivery', before: 'team-advance', roles: ['wing-commander'], availability: 'real-server-resolved-and-successful-custody-task' },
  { id: 'genuine-ending', before: 'return', roles: ['gm'], availability: 'immutable-server-debrief-and-closed-history' },
]);

export function assertCapybaraRunContext(context) {
  const roster = context?.roster;
  const started = context?.started;
  assert.ok(context?.initial?.sessionId && context.initial.joinCode, 'A fresh ordinarily joined session is required.');
  assert.ok(Array.isArray(roster), 'Use the current real admitted demo roster.');
  const roles = roster.map(actor => actor?.roleId);
  const identities = roster.map(actor => actor?.uidHash);
  assert.ok(roles.every(roleId => typeof roleId === 'string' && roleId.length > 0), 'Every actor needs its original role profile.');
  assert.ok(identities.every(uidHash => typeof uidHash === 'string' && uidHash.length > 0), 'Every actor needs a distinct authenticated identity fingerprint.');
  assert.equal(new Set(roles).size, roles.length, 'A role cannot be represented by duplicate actors.');
  assert.equal(new Set(identities).size, identities.length, 'Every role must use a distinct original account.');
  assert.ok(roles.includes('capybara-captain'), 'The Capybara Captain is part of the confirmed core roster.');
  assert.ok(roles.includes('capybara-recycler'), 'The Capybara Recycler is part of the confirmed core roster.');
  assert.ok(roles.includes('press-officer'), 'Press remains an independently admitted optional role.');
  assert.equal(roles.filter(roleId => roleId !== 'press-officer').length, 20, 'Use the actual full twenty-role core cast.');
  assert.equal(started?.sessionId, context.initial.sessionId);
  assert.equal(started?.phase, 'active');
  assert.equal(started?.cycle, 1);
  assert.equal(started?.phaseProgression, 'manual');
  assert.deepEqual(started?.fullGameDemo, { status: 'active', progression: 'manual' }, 'Use the protected unlimited manual mode.');
  assert.equal(started?.capybaraEnabled, true, 'Capybara must be enabled in the real confirmed game configuration.');
  assert.equal(started?.activeRoleIds?.length, 20);
  assert.equal(started?.activeRoleIds?.includes('press-officer'), false, 'Press stays outside the core role count.');
  for (const roleId of started.activeRoleIds) assert.ok(roles.includes(roleId), 'Started core roles must come from real roster accounts.');
  return { sessionId: context.initial.sessionId, coreRoleCount: started.activeRoleIds.length,
    roleAccountCount: roster.length, pressRolePresent: true, manualProgression: true, capybaraEnabled: true };
}

function safeCost(value) {
  if (!value || typeof value !== 'object') return null;
  const cost = {};
  for (const key of ['resource', 'amount', 'unit', 'result']) {
    if (['string', 'number'].includes(typeof value[key])) cost[key] = typeof value[key] === 'string' ? value[key].slice(0, 80) : value[key];
  }
  return Object.keys(cost).length ? cost : null;
}

export function capybaraStageOutcome(outcome) {
  const evidence = outcome?.evidence, actor = evidence?.actor, response = evidence?.response, projection = evidence?.projection;
  const currentRole = typeof outcome?.roleId === 'string' && actor?.activeConsoleRoleId === outcome.roleId;
  const actionCaptured = outcome?.status === 'captured' && outcome.failed !== true;
  if (evidence?.endpoint === 'requestScout') {
    if (!actionCaptured || outcome.endpoint !== 'requestScout' || !currentRole || typeof actor?.uidHash !== 'string' ||
        actor.connection !== 'live' || actor.freshness !== 'server' ||
        !isRecordedScoutRequestEvidence({ roleId: outcome.roleId, actor, request: evidence.request, response, projection })) {
      return { status: 'pending', reason: 'original-scout-request-record-and-visible-current-source-not-confirmed' };
    }
    return { status: 'completed', endpoint: 'requestScout', roleId: outcome.roleId, cost: safeCost(evidence.cost),
      cycle: projection.scoutRequest.cycle, scope: 'request-recorded' };
  }
  const exactUiAndReplay = response?.httpStatus === 200 && SUCCESS_RESULT_STATUSES.has(response.resultStatus) &&
    response.exactReplay === true && Number.isSafeInteger(response.revision) &&
    response.replayRevision === response.revision;
  const sameLiveActor = typeof actor?.uidHash === 'string' && actor.connection === 'live' && actor.freshness === 'server';
  const freshRenderedProjection = Number.isSafeInteger(response?.projectionRevision) && response.projectionRevision >= 0 &&
    Number.isSafeInteger(projection?.gm?.revision) && Number.isSafeInteger(projection?.crew?.revision) &&
    ['public-result-visible', 'private-result-visible', 'current-group-note-visible', 'mission-choice-visible', 'post-attack-scrap-visible'].includes(projection?.renderedStatus);
  if (!actionCaptured || !exactUiAndReplay || !sameLiveActor || !currentRole || !freshRenderedProjection) {
    return { status: 'pending', reason: actionCaptured ? 'source-receipt-projection-or-current-role-not-confirmed' :
      outcome?.reason ?? outcome?.error ?? 'source-control-unavailable' };
  }
  return { status: 'completed', endpoint: String(outcome.endpoint ?? evidence.endpoint ?? '').slice(0, 80),
    roleId: outcome.roleId, cost: safeCost(evidence.cost), cycle: projection.gm.cycle,
    sourceRevision: response.projectionRevision };
}

/**
 * Adapt an existing source-specific UI callback report without inferring from a
 * static import or the callable name alone. The source callback must attest its
 * current rendered result, the real visible POST, and exact same-actor retry.
 */
export function sourceActionStageOutcome({ branch, requests, endpoint, roleId, cycle }) {
  const requestConfirmed = Array.isArray(requests) && requests.some(request =>
    request?.endpoint === endpoint && request?.roleId === roleId && request?.consoleRoleId === roleId &&
    request?.cycle === cycle && request?.httpStatus === 200 &&
    SUCCESS_RESULT_STATUSES.has(request?.resultStatus) && request?.exactOriginalSdkReplay === true);
  if (branch?.status !== 'committed' || branch?.exactSourceAndRenderedReceipt !== true || !requestConfirmed) {
    return { status: 'pending', reason: 'source-callback-rendered-receipt-or-exact-replay-not-confirmed' };
  }
  const sourceRevision = [branch.researchRevision, branch.revision, branch.currentRevision]
    .find(Number.isSafeInteger);
  return { status: 'completed', endpoint, roleId, cycle,
    ...(Number.isSafeInteger(sourceRevision) ? { sourceRevision } : {}) };
}

/**
 * Credit Macaw's dismantling only after its current holder proposes through the
 * normal UI, a different admitted host player consents through their own UI,
 * and the original holder applies the exact consent with the printed effect.
 * Only aggregate evidence escapes this predicate; request IDs, host choice,
 * console choice, and consent IDs stay in the in-memory browser workflow.
 */
export function macawDismantlingStageOutcome(input) {
  const pending = { status: 'pending', reason: 'proposal-consent-apply-or-authoritative-effect-not-confirmed' };
  const sessionId = input?.sessionId, cycle = input?.cycle;
  const proposer = input?.proposer, target = input?.target;
  const proposal = input?.proposal, consent = input?.consent, applied = input?.applied;
  const proposalId = proposal?.proposalId, consentId = consent?.consentId;
  if (typeof sessionId !== 'string' || !sessionId || !Number.isSafeInteger(cycle) || cycle < 1 ||
      proposer?.roleId !== 'capybara-captain' || target?.roleId === 'capybara-captain' ||
      typeof target?.roleId !== 'string' || !target.roleId ||
      typeof proposer?.uidHash !== 'string' || !proposer.uidHash ||
      typeof target?.uidHash !== 'string' || !target.uidHash || proposer.uidHash === target.uidHash ||
      typeof proposalId !== 'string' || !proposalId || typeof consentId !== 'string' || !consentId) return pending;

  const proofMatches = (proof, roleId, uidHash, renderedStatus) => {
    const actor = proof?.actor, projection = proof?.projection;
    const gm = projection?.gm, crew = projection?.crew;
    return proof?.httpStatus === 200 && proof.exactReplay === true &&
      actor?.roleId === roleId && actor.activeConsoleRoleId === roleId && actor.uidHash === uidHash &&
      actor.connection === 'live' && actor.freshness === 'server' &&
      gm?.sessionId === sessionId && crew?.sessionId === sessionId && gm.live === true && crew.live === true &&
      gm.cycle === cycle && crew.cycle === cycle &&
      Number.isSafeInteger(gm.revision) && Number.isSafeInteger(crew.revision) &&
      projection.renderedStatus === renderedStatus;
  };
  if (!proofMatches(input?.proposalProof, 'capybara-captain', proposer.uidHash, 'proposal-visible') ||
      !proofMatches(input?.consentProof, target.roleId, target.uidHash, 'consent-visible') ||
      !proofMatches(input?.applyProof, 'capybara-captain', proposer.uidHash, 'applied-visible')) return pending;

  const targetShipId = proposal.targetShipId, targetConsoleId = proposal.targetConsoleId;
  const targetRevision = proposal.targetRevision;
  if (proposal.status !== 'proposed' || proposal.sessionId !== sessionId || proposal.craftId !== 'macaw' ||
      typeof targetShipId !== 'string' || !targetShipId || targetShipId === 'capybara' ||
      typeof targetConsoleId !== 'string' || !targetConsoleId || !Number.isSafeInteger(targetRevision) ||
      targetRevision < 0 || proposal.scrapGain !== 1 ||
      consent.status !== 'consented' || consent.consentStatus !== 'granted' || consent.sessionId !== sessionId ||
      consent.proposalId !== proposalId || consent.targetRevision !== targetRevision ||
      applied.status !== 'applied' || applied.sessionId !== sessionId || applied.proposalId !== proposalId ||
      applied.consentId !== consentId || applied.targetShipId !== targetShipId ||
      applied.targetConsoleId !== targetConsoleId || applied.targetRevision !== targetRevision + 1 ||
      applied.scrapGain !== 1 || !Number.isSafeInteger(applied.scrapAfter) || applied.scrapAfter < 0 ||
      input?.consentInbox?.sessionId !== sessionId || input.consentInbox.targetShipId !== targetShipId ||
      input.consentInbox.proposalId !== proposalId || input.consentInbox.craftId !== 'macaw' ||
      input.consentInbox.status !== 'consented' || input.consentInbox.consentId !== consentId ||
      input.consentInbox.targetRevision !== targetRevision || input.consentInbox.scrapGain !== 1 ||
      input?.finalInbox?.sessionId !== sessionId || input.finalInbox.targetShipId !== targetShipId ||
      input.finalInbox.proposalId !== proposalId || input.finalInbox.craftId !== 'macaw' ||
      input.finalInbox.status !== 'applied' || input.finalInbox.consentId !== consentId ||
      input.finalInbox.targetRevision !== targetRevision || input.finalInbox.scrapGain !== 1 ||
      input.finalInbox.scrapAfter !== applied.scrapAfter) return pending;

  const beforeDamage = input?.before?.shipDamage?.[targetShipId]?.damagedSystemIds;
  const afterDamage = input?.after?.shipDamage?.[targetShipId]?.damagedSystemIds;
  const beforeScrap = input?.before?.shipResources?.capybara?.scrap;
  const afterScrap = input?.after?.shipResources?.capybara?.scrap;
  if (!Array.isArray(beforeDamage) || !Array.isArray(afterDamage) || beforeDamage.includes(targetConsoleId) ||
      !afterDamage.includes(targetConsoleId) || !Number.isSafeInteger(beforeScrap) || beforeScrap < 0 ||
      afterScrap !== applied.scrapAfter || afterScrap !== beforeScrap + 1) return pending;

  return { status: 'completed', roleId: 'capybara-captain',
    endpoint: 'permissioned Macaw proposal, consent, and apply', cycle,
    sourceRevision: input.applyProof.projection.gm.revision,
    cost: { resource: 'undamaged target console', amount: 1, result: '+1 Capybara Scrap after target approval' } };
}

export function assessCapybaraGameplay({ context, stages, coreGameplay, terminal }) {
  assertCapybaraRunContext(context);
  const pendingStages = CAPYBARA_REQUIRED_STAGES.filter(id => stages?.[id]?.status !== 'completed');
  const ended = terminal?.status === 'debrief' && terminal.immutable === true &&
    ['final-cycle', 'failure-review', 'candidate'].includes(terminal.source);
  const corePassed = coreGameplay?.status === 'passed' && coreGameplay.manualProgression === true &&
    coreGameplay.serverActions === true && coreGameplay.missionDelivered === true;
  return { status: pendingStages.length === 0 && ended && corePassed ? 'passed' : 'pending',
    pendingStages, terminalObserved: ended, coreGameplayPassed: corePassed };
}

export function projectCapybaraEvidence(report) {
  const stages = {};
  for (const id of CAPYBARA_REQUIRED_STAGES) {
    const stage = report?.stages?.[id];
    if (!stage) { stages[id] = { status: 'pending', reason: 'not-observed' }; continue; }
    stages[id] = { status: stage.status === 'completed' ? 'completed' : 'pending',
      ...(typeof stage.roleId === 'string' ? { roleId: stage.roleId.slice(0, 80) } : {}),
      ...(typeof stage.endpoint === 'string' ? { endpoint: stage.endpoint.slice(0, 80) } : {}),
      ...(safeCost(stage.cost) ? { cost: safeCost(stage.cost) } : {}),
      ...(Number.isSafeInteger(stage.cycle) ? { cycle: stage.cycle } : {}),
      ...(Number.isSafeInteger(stage.sourceRevision) ? { sourceRevision: stage.sourceRevision } : {}),
      ...(stage.endpoint === 'requestScout' && stage.scope === 'request-recorded' ? { scope: stage.scope } : {}),
      ...(stage.status === 'completed' ? {} : { reason: typeof stage.reason === 'string' ? stage.reason.slice(0, 120) : 'source-action-not-confirmed' }),
    };
  }
  return { schemaVersion: 1, status: report?.status === 'passed' ? 'passed' : 'pending', stages,
    terminalObserved: report?.terminalObserved === true, coreGameplayPassed: report?.coreGameplayPassed === true,
    noAdminGameplayWrites: true, noInjectedClock: true, noFabricatedChoices: true };
}

/**
 * Add the expansion pair to the canonical real-account full-game setup. The
 * callback is deliberately fail-closed: ending successfully is insufficient
 * while a genuine required action remains unavailable or unverified.
 */
export function capybaraFullGameDemoOptions(options = {}) {
  if (options.runFinalEnding !== undefined) assert.equal(typeof options.runFinalEnding, 'function');
  assert.equal(options.runEnding, undefined, 'Supply a final ending decision, not a competing gameplay runner.');
  let cycleOnePreparation = null;
  return {
    ...options,
    playerCount: 20,
    includePress: true,
    capybaraEnabled: true,
    chartId: options.chartId ?? 'A',
    gameplayOnly: true,
    onStarted: async context => {
      await options.onStarted?.(context);
      cycleOnePreparation = await prepareCycleOneCapybaraFleet(context, options);
    },
    runEnding: context => runCapybaraFullGameGameplay(context, {
      ...options,
      runFinalEnding: options.runFinalEnding ?? runPursuitLimitEnding,
      cycleOnePreparation,
    }),
  };
}

/** Lazy-loads Playwright only when an owner explicitly starts the real runner. */
export async function runFreshCapybaraFullGameUi(options = {}) {
  const { runFreshFullGameDemoUi } = await import('./pc10-full-game-demo-ui-proof.mjs');
  return runFreshFullGameDemoUi(capybaraFullGameDemoOptions(options));
}

/** Cycle 1 is still the normal Team phase in the generic runner's onStarted hook. */
async function runCapybaraMaintenanceWithExactReplay(context, cycle, { refuelBoa = false, gmRepair } = {}) {
  const game = createTwoBrowserGameplay(context), { gm, initial } = context;
  const before = await game.state(gm);
  assert.equal(before.sessionId, initial.sessionId);
  assert.equal(before.live, true); assert.equal(before.phase, 'active');
  assert.equal(before.cycle, cycle); assert.equal(before.turnPhase?.airspace?.state, 'restricted');
  assert.equal(before.fullGameDemo?.status, 'active');
  assert.equal(before.fullGameDemo?.progression, 'manual');
  assert.ok(before.activeVesselIds?.includes('capybara'));
  let maintenanceRevision = before.maintenanceCycles?.capybara?.revision ?? 0;
  assert.ok(Number.isSafeInteger(maintenanceRevision) && maintenanceRevision >= 0);
  const reactorConsoleIds = ['jump-drive', 'scrap-refinery'];
  const roleId = 'capybara-recycler', surface = await game.select(roleId);
  const originalActor = await surface.observe();
  assert.equal(originalActor.sameActor, true); assert.equal(originalActor.connection, 'live');
  assert.equal(originalActor.freshness, 'server'); assert.equal(originalActor.activeConsoleRoleId, roleId);
  const maintenanceNav = surface.page.getByRole('button', { name: 'Maintenance', exact: true });
  const panel = surface.page.getByRole('region', { name: / maintenance cycle$/i }).first();
  await maintenanceNav.or(panel).first().waitFor();
  if (!(await panel.isVisible()) && await maintenanceNav.isVisible()) await maintenanceNav.click();
  await panel.waitFor();
  const completedSteps = [];
  let productionReceipt = null;

  async function execute(button, actionName) {
    const response = await observeUiReceipt({
      waitForResponse: () => surface.page.waitForResponse(value => value.request().method() === 'POST' &&
        new URL(value.url()).pathname.endsWith('/us-central1/runMaintenance')),
      choose: () => button.click(),
    });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    const request = response.request().postDataJSON()?.data;
    assert.equal(response.status(), 200, `Capybara ${actionName}: ${body.error?.message ?? response.status()}`);
    assert.equal(request?.sessionId, initial.sessionId);
    assert.equal(request?.shipId, 'capybara');
    assert.equal(request?.expectedRevision, maintenanceRevision, 'Capybara request expectedRevision must match the original source.');
    assert.ok(typeof request?.requestId === 'string' && request.requestId.length > 0);
    assert.equal(body.result?.status, 'committed');
    assert.equal(body.result?.sessionId, initial.sessionId, 'Capybara receipt sessionId must match the original session.');
    assert.equal(body.result?.shipId, 'capybara', 'Capybara receipt shipId must match the original ship.');
    assert.equal(body.result?.requestId, request.requestId, 'Capybara receipt requestId must echo the original command.');
    assert.equal(body.result?.action, request.action, 'Capybara receipt action must echo the original command.');
    assert.equal(body.result?.expectedRevision, request.expectedRevision, 'Capybara receipt expectedRevision must echo the original command.');
    assert.equal(body.result?.currentTurn, cycle, 'Capybara receipt currentTurn must match the original cycle.');
    const resultCycle = body.result?.cycle;
    assert.equal(resultCycle?.turn, cycle, 'Capybara receipt cycle.turn must match the original cycle.');
    assert.equal(resultCycle?.revision, maintenanceRevision + 1, 'Capybara receipt revision must advance the original source by one.');
    assert.equal(body.result?.committedRevision, resultCycle.revision, 'Capybara committedRevision must match the receipt cycle.');
    if (request.action === 'reactor') {
      assert.deepEqual(request.consoles, reactorConsoleIds, 'The normal reactor request must retain the selected source console IDs.');
      assert.deepEqual(resultCycle.charges, reactorConsoleIds, 'The normal reactor receipt must commit the selected source charges.');
    }
    assert.equal((await surface.observe()).uidHash, originalActor.uidHash);
    assert.equal((await surface.observe()).activeConsoleRoleId, roleId);
    const replay = await surface.callable('runMaintenance', request);
    assert.equal(replay.status, 'committed');
    assert.deepEqual(normalizeReceipt(replay.result), normalizeReceipt(body.result),
      `The unchanged ${actionName} receipt must replay exactly for its original actor.`);
    assert.ok(Number.isSafeInteger(resultCycle?.revision));
    const deadline = Date.now() + 25_000;
    let gmState, crewState, gmCycle, crewCycle;
    while (Date.now() < deadline) {
      [gmState, crewState] = await Promise.all([game.state(gm), game.state(surface)]);
      gmCycle = gmState.maintenanceCycles?.capybara;
      crewCycle = crewState.maintenanceCycles?.capybara;
      if (gmState.sessionId === initial.sessionId && crewState.sessionId === initial.sessionId &&
          gmState.live && crewState.live && gmState.cycle === cycle && crewState.cycle === cycle &&
          gmCycle?.revision === resultCycle.revision && crewCycle?.revision === resultCycle.revision &&
          gmCycle?.step === resultCycle.step && crewCycle?.step === resultCycle.step) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(gmCycle?.revision, resultCycle.revision, 'The current GM server projection must match the receipt.');
    assert.equal(crewCycle?.revision, resultCycle.revision, 'The current Recycler server projection must match the receipt.');
    if (request.action === 'reactor') {
      assert.deepEqual(gmCycle.charges, reactorConsoleIds);
      assert.deepEqual(crewCycle.charges, reactorConsoleIds);
    }
    maintenanceRevision = resultCycle.revision;
    const actor = await surface.observe();
    for (const key of ['uidHash', 'sessionId', 'profileRoleId', 'activeConsoleRoleId'])
      assert.equal(actor[key], originalActor[key]);
    const statusVisible = await panel.getByRole('status').evaluateAll(nodes => nodes.some(node =>
      node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' && (node.textContent ?? '').trim().length > 0));
    completedSteps.push({ action: actionName, revision: resultCycle.revision, exactReplay: true,
      gmAndCrewServerViews: true, renderedStatus: statusVisible });
    if (actionName === 'Run Scrap Refinery') {
      assert.equal(statusVisible, true, 'The real Scrap Refinery result must render in the current Recycler panel.');
      productionReceipt = { actor, result: body.result, replay: replay.result, gmState, crewState };
    }
    return body.result;
  }

  await panel.getByRole('button', { name: `Begin Maintenance Cycle: Cycle ${cycle}`, exact: true }).click();
  await execute(panel.getByRole('button', { name: 'ARE YOU SURE?', exact: true }), 'Begin maintenance');
  await gmRepair?.('capybara');
  await execute(panel.getByRole('button', { name: 'Check storage', exact: true }), 'Check storage');
  for (const [label, resource] of [['Food', 'food'], ['Water', 'water']]) {
    const choices = await panel.getByLabel(`${label} ration level`, { exact: true }).locator('option').evaluateAll(nodes =>
      nodes.map(node => ({ value: node.value, cost: Number(node.textContent.split('//')[1]?.trim()) })));
    const current = (await game.state()).shipResources?.capybara?.[resource];
    const affordable = choices.filter(option => Number.isFinite(option.cost) && option.cost <= current).at(-1);
    assert.ok(affordable, `Choose an actually displayed affordable ${label.toLowerCase()} ration.`);
    await panel.getByLabel(`${label} ration level`, { exact: true }).selectOption(affordable.value);
  }
  await execute(panel.getByRole('button', { name: 'Proceed with rations', exact: true }), 'Proceed with actual rations');
  await execute(panel.getByRole('button', { name: 'Run unrest check', exact: true }), 'Run unrest check');
  await execute(panel.getByRole('button', { name: 'Run riot check', exact: true }), 'Run riot check');
  await gmRepair?.('capybara');
  for (const consoleName of ['Jump Drive', 'Scrap Refinery'])
    await panel.getByRole('checkbox', { name: new RegExp(`^${consoleName}(?: // Charged)?$`, 'i') }).check();
  await panel.getByRole('button', { name: 'Power up reactor', exact: true }).click();
  await execute(panel.getByRole('button', { name: 'ARE YOU SURE?', exact: true }), 'Confirm actual reactor power');
  const production = panel.getByRole('group', { name: / production consoles$/i });
  const scrapChoice = production.getByRole('radio', { name: 'Generate 1 Scrap', exact: true });
  await scrapChoice.waitFor({ state: 'visible' });
  await scrapChoice.check();
  for (const consoleName of ['Scrap Refinery']) {
    const run = production.getByRole('button', { name: `Run ${consoleName}`, exact: true });
    if (await run.isEnabled()) await execute(run, `Run ${consoleName}`);
    else {
      const skip = production.getByRole('button', { name: `Skip ${consoleName}`, exact: true });
      if (await skip.isEnabled()) await execute(skip, `Skip ${consoleName}`);
    }
  }
  if (refuelBoa) {
    const selector = panel.getByLabel('Shuttle Bay refuelling', { exact: true });
    await selector.selectOption('boa');
  }
  await execute(panel.getByRole('button', { name: 'Proceed with refuelling', exact: true }).and(surface.page.locator(':enabled')).first(),
    'Proceed with actual refuelling');
  await execute(panel.getByRole('button', { name: 'End maintenance cycle', exact: true }), 'End maintenance cycle');
  const after = await game.state(gm), crewAfter = await game.state(surface);
  assert.equal(after.maintenanceCycles?.capybara?.turn, cycle);
  assert.equal(after.maintenanceCycles?.capybara?.step, 0);
  assert.ok(after.maintenanceCycles?.capybara?.completedAt);
  assert.deepEqual(crewAfter.maintenanceCycles?.capybara, after.maintenanceCycles?.capybara);
  const scrapBefore = before.shipResources?.capybara?.scrap;
  const scrapAfter = after.shipResources?.capybara?.scrap;
  assert.equal(scrapAfter, scrapBefore + 1, 'The selected printed production console must actually generate one Scrap.');
  assert.ok(productionReceipt);
  const revision = after.maintenanceCycles.capybara.revision;
  return {
    status: 'completed', roleId, cycle, refueledBoa: refuelBoa,
    evidence: { status: 'captured', roleId, endpoint: 'runMaintenance',
      evidence: { endpoint: 'runMaintenance',
        actor: { uidHash: productionReceipt.actor.uidHash, activeConsoleRoleId: productionReceipt.actor.activeConsoleRoleId,
          connection: productionReceipt.actor.connection, freshness: productionReceipt.actor.freshness },
        response: { httpStatus: 200, resultStatus: 'committed', exactReplay: true,
          revision: productionReceipt.result.cycle.revision, replayRevision: productionReceipt.replay.cycle.revision,
          projectionRevision: revision },
        projection: { gm: { source: 'server', cycle, revision, status: 'committed' },
          crew: { source: 'server', cycle, revision, status: 'committed' }, renderedStatus: 'public-result-visible' },
        cost: { resource: 'Reactor charges', amount: reactorConsoleIds.length, result: '1 Scrap from the printed Scrap Refinery choice' } } },
    stageEvidence: { status: 'captured', roleId, endpoint: 'runMaintenance',
      evidence: { endpoint: 'runMaintenance',
        actor: { uidHash: productionReceipt.actor.uidHash, activeConsoleRoleId: productionReceipt.actor.activeConsoleRoleId,
          connection: productionReceipt.actor.connection, freshness: productionReceipt.actor.freshness },
        response: { httpStatus: 200, resultStatus: 'committed', exactReplay: true,
          revision: productionReceipt.result.cycle.revision, replayRevision: productionReceipt.replay.cycle.revision,
          projectionRevision: revision },
        projection: { gm: { source: 'server', cycle, revision, status: 'committed' },
          crew: { source: 'server', cycle, revision, status: 'committed' }, renderedStatus: 'public-result-visible' },
        cost: { resource: 'Reactor charges', amount: reactorConsoleIds.length, result: '1 Scrap from the printed Scrap Refinery choice' } } },
    before: { scrap: scrapBefore }, after: { scrap: scrapAfter, fuelledBoa: after.shuttleFuelled?.boa === true },
    actions: completedSteps, source: 'ordinary live Capybara Recycler maintenance UI plus exact same-actor SDK replays',
  };
}

async function prepareCycleOneCapybaraFleet(context, options = {}) {
  const game = createTwoBrowserGameplay(context), tools = candidateGameplayTools(context);
  const current = await game.state(context.gm);
  assert.equal(current.sessionId, context.initial.sessionId); assert.equal(current.live, true);
  assert.equal(current.phase, 'active'); assert.equal(current.cycle, 1);
  assert.equal(current.turnPhase?.airspace?.state, 'restricted');
  assert.equal(current.fullGameDemo?.status, 'active'); assert.equal(current.fullGameDemo?.progression, 'manual');
  const budget = await tools.printedRationBudget(Object.fromEntries(BASE_PLUS_CAPYBARA_SHIPS.map(([id]) => [id, 4])));
  for (const [shipId] of BASE_PLUS_CAPYBARA_SHIPS) {
    await tools.gmSupplies(shipId, 'food', budget[shipId].food);
    await tools.gmSupplies(shipId, 'water', budget[shipId].water);
    await tools.gmSupplies(shipId, 'fuel', 30);
  }
  await tools.gmSupplies('aegis', 'ore', 5);
  const combatConsoles = ['Fighter Bay Alpha', 'Fighter Bay Bravo', 'Command and Control', 'Missile Launchers', 'Point Defence Lasers'];
  const completed = [];
  for (const [shipId, roleId, , consoles, refuels] of BASE_PLUS_CAPYBARA_SHIPS) {
    if (shipId === 'capybara') {
      const result = await runCapybaraMaintenanceWithExactReplay(context, 1, { refuelBoa: true,
        gmRepair: shipId => tools.gmRepair(shipId) });
      completed.push({ shipId, cycle: 1, exactUiReplays: result.actions.length,
        production: result.after.scrap - result.before.scrap, refueledBoa: result.after.fuelledBoa,
        evidence: result.stageEvidence });
    } else {
      await game.maintenanceUi(shipId, roleId, { consoles: shipId === 'aegis' ? combatConsoles : consoles,
        refuels, afterBegin: () => options.gmRepair?.(shipId), afterRiot: () => options.gmRepair?.(shipId) });
      completed.push({ shipId, cycle: 1, transport: 'ordinary source maintenance UI' });
    }
  }
  const after = await game.state(context.gm);
  for (const [shipId] of BASE_PLUS_CAPYBARA_SHIPS) {
    assert.equal(after.maintenanceCycles?.[shipId]?.turn, 1, `${shipId} must complete its actual Cycle 1 maintenance.`);
    assert.equal(after.maintenanceCycles?.[shipId]?.step, 0);
    assert.ok(after.maintenanceCycles?.[shipId]?.completedAt);
  }
  assert.equal(after.shuttleFuelled?.boa, true, 'Boa must be fueled through the printed Capybara shuttle bay.');
  await game.save('capybara-cycle-one-maintenance.json', { status: 'completed', cycle: 1,
    source: 'ordinary GM supply and fleet maintenance UI; exact SDK receipt/replay recorded for Capybara production',
    capybaraStage: { status: 'completed', roleId: 'capybara-recycler', scrap: after.shipResources.capybara.scrap,
      boaFueled: true }, hosts: completed, noAdminGameplayWrites: true, noClockManipulation: true });
  return { status: 'completed', cycle: 1, hosts: completed, capybara: { status: 'completed',
    roleId: 'capybara-recycler', cycle: 1, scrap: after.shipResources.capybara.scrap,
    refueledBoa: true, exactUiReplays: completed.find(entry => entry.shipId === 'capybara')?.exactUiReplays,
    evidence: completed.find(entry => entry.shipId === 'capybara')?.evidence } };
}

/** Derivation of the frozen ordinary base loop with a real expansion Capybara host. */
export async function runCapybaraFullGameGameplay(context, options = {}) {
  assertCapybaraRunContext(context);
  const finalEnding = options.runFinalEnding ?? context.runFinalEnding;
  assert.equal(typeof finalEnding, 'function', 'Compose a genuine server-owned ending callback.');
  const cycleOnePreparation = options.cycleOnePreparation;
  assert.equal(cycleOnePreparation?.status, 'completed',
    'Run the real seven-host Cycle 1 Team maintenance from the canonical onStarted hook before Coordination opens.');
  assert.equal(cycleOnePreparation?.capybara?.status, 'completed');
  const a = createTwoBrowserGameplay(context);
  const specialistDriver = createSpecialistGameplayDriver(a);
  const sourceTools = candidateGameplayTools(context);
  const { gm, initial, roster, directory } = context;
  const stages = [], checks = {}, costs = [];
  const capybaraStages = Object.fromEntries(CAPYBARA_REQUIRED_STAGES.map(id =>
    [id, { status: 'pending', reason: 'not-yet-observed-at-source-checkpoint' }]));
  const capybaraObservations = [];
  async function mark(stage) {
    stages.push({ stage, at: new Date().toISOString() });
    await writeFile(`${directory}/capybara-gameplay-progress.json`, `${JSON.stringify(projectCapybaraEvidence({
      stages: capybaraStages, status: 'pending', terminalObserved: false, coreGameplayPassed: false,
    }), null, 2)}\n`);
    console.log(JSON.stringify({ stage }));
  }
  async function updateCapybaraStage(id, next) {
    assert.ok(Object.hasOwn(capybaraStages, id), `Unknown Capybara proof stage ${id}.`);
    capybaraStages[id] = { status: next.status === 'completed' ? 'completed' : 'pending',
      ...(next.roleId ? { roleId: next.roleId } : {}), ...(next.endpoint ? { endpoint: next.endpoint } : {}),
      ...(next.cost ? { cost: safeCost(next.cost) } : {}), ...(Number.isSafeInteger(next.cycle) ? { cycle: next.cycle } : {}),
      ...(Number.isSafeInteger(next.sourceRevision) ? { sourceRevision: next.sourceRevision } : {}),
      ...(next.endpoint === 'requestScout' && next.scope === 'request-recorded' ? { scope: next.scope } : {}),
      ...(next.status === 'completed' ? {} : { reason: next.reason ?? 'current-source-control-or-outcome-not-confirmed' }) };
    capybaraObservations.push({ id, status: capybaraStages[id].status,
      ...(next.roleId ? { roleId: next.roleId } : {}), ...(next.endpoint ? { endpoint: next.endpoint } : {}),
      ...(Number.isSafeInteger(next.cycle) ? { cycle: next.cycle } : {}),
      ...(Number.isSafeInteger(next.sourceRevision) ? { sourceRevision: next.sourceRevision } : {}),
      ...(next.endpoint === 'requestScout' && next.scope === 'request-recorded' ? { scope: next.scope } : {}),
      ...(next.status === 'completed' && next.cost ? { cost: safeCost(next.cost) } : {}),
      ...(next.status === 'completed' ? {} : { reason: next.reason ?? 'current-source-control-or-outcome-not-confirmed' }) });
    await writeFile(`${directory}/capybara-gameplay-progress.json`, `${JSON.stringify(projectCapybaraEvidence({
      stages: capybaraStages, status: 'pending', terminalObserved: false, coreGameplayPassed: false,
    }), null, 2)}\n`);
  }
  async function updateBestCapybaraStage(id, next) {
    if (capybaraStages[id]?.status === 'completed' && next.status !== 'completed') return;
    return updateCapybaraStage(id, next);
  }
  async function attemptSpecialist(id, actionId, inputs = {}, { roleId, cost, verify, record = true } = {}) {
    const specRole = roleId ?? inputs.roleId;
    if (typeof specRole !== 'string' || typeof verify !== 'function') {
      if (record) await updateCapybaraStage(id, { status: 'pending', reason: 'source-choice-or-projection-verifier-not-supplied' });
      return null;
    }
    const before = await a.state(gm);
    assert.equal(before.sessionId, initial.sessionId);
    assert.equal(before.live, true); assert.equal(before.phase, 'active');
    assert.equal(before.fullGameDemo?.status, 'active');
    assert.equal(before.fullGameDemo?.progression, 'manual');
    const enterConsole = async ({ page }) => {
      const shuttleId = inputs.shuttleId ?? ({
        'wing-starlight-scout': 'starlight', 'scientist-scout': 'endeavour',
        'scientist-ecm': 'endeavour', 'scientist-field-upgrade': 'endeavour',
        'explorer-scout': 'hummingbird', 'explorer-harvest-roll': 'hummingbird',
        'explorer-harvest-allocation': 'hummingbird', 'boa-recycle': 'boa',
        'boa-reclamation': 'boa', 'boa-scrap-collection': 'boa',
        'macaw-repair': 'macaw', 'macaw-salvage-propose': 'macaw',
        'macaw-salvage-apply': 'macaw', 'macaw-scrap-collection': 'macaw',
      })[actionId];
      if (!shuttleId) return true;
      if (new URL(page.url()).hash.endsWith(`/shuttles/${shuttleId}`)) return true;
      const label = ({ starlight: 'Starlight', endeavour: 'Endeavour', hummingbird: 'Hummingbird',
        boa: 'Boa', macaw: 'Macaw' })[shuttleId];
      const link = page.getByRole('link', { name: `Open ${label} shuttle console`, exact: true });
      try { await link.waitFor({ state: 'visible', timeout: 15_000 }); }
      catch { return false; }
      if (!(await link.isEnabled())) return false;
      await link.click();
      try { await page.waitForURL(url => url.hash.endsWith(`/shuttles/${shuttleId}`), { timeout: 15_000 }); }
      catch { return false; }
      return true;
    };
    const outcome = await runPc10SpecialistAction({ game: a, driver: specialistDriver, actionId,
      ...inputs, enterConsole, inspect: async context => {
        const source = await verify({ ...context, before, game: a });
        if (source?.ready !== true) return { ready: false };
        const scoutChoice = PC10_SPECIALIST_ACTIONS[actionId]?.endpoint === 'requestScout' ? {
          entitlementId: PC10_SPECIALIST_ACTIONS[actionId].shuttleId, ownerRoleId: specRole,
          targetCoordinate: inputs.targetCoordinate,
        } : null;
        const scoutRequest = scoutChoice ? validateScoutRequestRecord({ ...context, before, choice: scoutChoice }) : null;
        const responseRevision = [context.result?.revision, context.result?.repairRevision,
          context.result?.choiceRevision, context.result?.upgradeRevision, context.result?.wingRevision,
          context.result?.fighterWingRevision, context.result?.currentRevision].find(value => Number.isSafeInteger(value) && value >= 0);
        const panel = source.regionName ? context.surface.page.getByRole('region', { name: source.regionName, exact: true }) : null;
        const rendered = panel ? await panel.getByRole('status').evaluateAll(nodes =>
          nodes.some(node => /committed|recorded|recycled|collected|applied|launched|built|requested|harvest|selected|repair|choice/i.test(node.textContent ?? '')))
          : await context.surface.page.getByRole('status').evaluateAll(nodes => nodes.length > 0);
        if (scoutChoice) {
          if (!scoutRequest || !rendered || !sameActionReceipt(scoutRequest, source.scoutRequest) ||
              source.renderedStatusCode !== 'scout-request-recorded-visible') return { ready: false };
          return { ready: true, scoutRequest, renderedStatusCode: source.renderedStatusCode };
        }
        if (!Number.isSafeInteger(responseRevision) || !rendered) return { ready: false };
        return { ready: true, gmRevision: source.gmRevision ?? responseRevision,
          crewRevision: source.crewRevision ?? responseRevision,
          renderedStatusCode: source.privateResultVisible ? 'private-result-visible' : source.renderedStatusCode ?? 'public-result-visible',
          ...(source.privateResultVisible ? { privateResultVisible: true } : {}) };
      }, cost });
    const projected = capybaraStageOutcome({ ...outcome, roleId: specRole,
      endpoint: outcome?.evidence?.endpoint, status: outcome?.status });
    if (record) await updateCapybaraStage(id, { ...projected, roleId: specRole, cost: cost ?? outcome?.evidence?.cost,
      cycle: outcome?.evidence?.projection?.gm?.cycle ?? before.cycle,
      endpoint: outcome?.evidence?.endpoint });
    return outcome;
  }
  async function runSpecialist(id, actionId, inputs = {}, { roleId, cost, record = true, verify } = {}) {
    const spec = PC10_SPECIALIST_ACTIONS[actionId];
    const projectionVerifier = verify ?? (spec ? inspectRenderedAction({
      regionName: spec.regionName,
      resultStatuses: [...SUCCESS_RESULT_STATUSES],
      renderedStatusCode: ['boa-reclamation'].includes(actionId) ? 'mission-choice-visible' : 'public-result-visible',
      ...(spec.endpoint === 'requestScout' ? { scoutChoice: {
        entitlementId: spec.shuttleId, ownerRoleId: roleId ?? inputs.roleId ?? spec.roleId,
        targetCoordinate: inputs.targetCoordinate,
      } } : {}),
    }) : null);
    if (typeof projectionVerifier !== 'function') {
      if (record) await updateCapybaraStage(id, { status: 'pending', reason: 'ordinary-source-action-not-in-proof-catalog' });
      return null;
    }
    return attemptSpecialist(id, actionId, inputs, { roleId, cost, record, verify: projectionVerifier });
  }
  function inspectRenderedAction({ regionName, resultStatuses, renderedStatusCode = 'public-result-visible', check, scoutChoice }) {
    return async ({ surface, result, gmState, crewState, request, actor, before }) => {
      if (!result || !resultStatuses.includes(result.status) || check && !check(result, { gmState, crewState }))
        return { ready: false };
      const panel = regionName ? surface.page.getByRole('region', { name: regionName, exact: true }) : surface.page;
      const scoutRequest = scoutChoice ? validateScoutRequestRecord({ request, result, actor, before, gmState, crewState,
        choice: scoutChoice }) : null;
      if (scoutChoice && !scoutRequest) return { ready: false };
      const rendered = await panel.getByRole('status').evaluateAll((nodes, scout) => scout
        ? nodes.filter(node => node.matches('.scout-request__notice') && node.getClientRects().length > 0 &&
          getComputedStyle(node).visibility !== 'hidden' && (node.textContent ?? '').trim() ===
          'Request recorded. Your private scouting report will arrive automatically.').length === 1
        : nodes.some(node =>
        node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' &&
        (node.textContent ?? '').trim().length > 0), Boolean(scoutChoice));
      if (!rendered) return { ready: false };
      if (scoutChoice) return { ready: true, regionName, scoutRequest, renderedStatusCode: 'scout-request-recorded-visible' };
      const resultRevision = [result.revision, result.repairRevision, result.choiceRevision,
        result.upgradeRevision, result.wingRevision, result.fighterWingRevision, result.currentRevision]
        .find(value => Number.isSafeInteger(value) && value >= 0);
      if (!Number.isSafeInteger(resultRevision)) return { ready: false };
      return { ready: true, regionName,
        gmRevision: gmState?.revision ?? gmState?.setupRevision ?? resultRevision,
        crewRevision: crewState?.revision ?? crewState?.setupRevision ?? resultRevision,
        renderedStatusCode };
    };
  }
  async function captureOrdinaryUiMutation({ roleId, endpoint, regionName, expectedStatus,
    renderedStatus, prepare, sourceCheck, automatic = false, timeoutMs = 30_000 }) {
    const surface = await a.select(roleId);
    const actor = await surface.observe();
    if (actor?.sameActor !== true || actor.sessionId !== initial.sessionId ||
        actor.profileRoleId !== roleId || actor.activeConsoleRoleId !== roleId ||
        actor.connection !== 'live' || actor.freshness !== 'server') {
      return { confirmed: false, reason: 'original-authenticated-role-console-not-current' };
    }
    if (prepare) {
      let action;
      try { action = await prepare({ surface, page: surface.page }); }
      catch { return { confirmed: false, reason: 'ordinary-source-control-not-currently-offered' }; }
      if (action === false || (!automatic && typeof action !== 'function')) {
        return { confirmed: false, reason: 'ordinary-source-control-not-currently-offered' };
      }
      const observed = surface.page.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith(`/us-central1/${endpoint}`), { timeout: timeoutMs }).then(
          response => ({ response }), error => ({ error }));
      if (!automatic) {
        try { await action(); }
        catch { return { confirmed: false, reason: 'ordinary-source-control-click-did-not-complete' }; }
      }
      const settled = await observed;
      if (settled.error) return { confirmed: false, reason: 'ordinary-source-response-not-observed' };
      const response = settled.response;
      let body;
      try { body = await response.json(); } catch { body = {}; }
      if (!response.ok() || !body?.result || body.result.status !== expectedStatus) {
        return { confirmed: false, reason: 'normal-server-result-not-confirmed' };
      }
      const request = response.request().postDataJSON()?.data;
      if (request?.sessionId !== initial.sessionId) {
        return { confirmed: false, reason: 'captured-request-session-mismatch' };
      }
      const currentActor = await surface.observe();
      for (const key of ['uidHash', 'sessionId', 'profileRoleId', 'activeConsoleRoleId']) {
        assert.equal(currentActor?.[key], actor[key], `Original ${roleId} authority remains bound for ${endpoint}.`);
      }
      assert.equal(currentActor?.sameActor, true);
      assert.equal(currentActor?.connection, 'live');
      assert.equal(currentActor?.freshness, 'server');
      const replay = await surface.callable(endpoint, request);
      assert.equal(replay.status, 'committed', `Exact original ${endpoint} request remains recoverable.`);
      assert.equal(sameActionReceipt(body.result, replay.result), true,
        `The actual ${endpoint} response and same-actor SDK replay agree.`);
      let projection;
      try {
        projection = await specialistDriver.waitForCommit({ surface, actor, timeoutMs,
          inspect: async ({ gmState, crewState }) => {
            if (body.result.status !== expectedStatus) return { ready: false };
            if (sourceCheck && !sourceCheck({ gmState, crewState, result: body.result })) return { ready: false };
            const panel = regionName ? surface.page.getByRole('region', { name: regionName, exact: true }) : surface.page;
            const visibleResult = await panel.getByRole('status').evaluateAll((nodes, expectedText) =>
              nodes.some(node => node.getClientRects().length > 0 &&
                getComputedStyle(node).visibility !== 'hidden' &&
                (node.textContent ?? '').includes(expectedText)), renderedStatus);
            if (!visibleResult) return { ready: false };
            const revision = Number.isSafeInteger(body.result.revision) ? body.result.revision
              : Number.isSafeInteger(body.result.targetRevision) ? body.result.targetRevision
                : Number.isSafeInteger(gmState?.setupRevision) ? gmState.setupRevision : 0;
            const gmRevision = gmState?.revision ?? gmState?.setupRevision ?? revision;
            const crewRevision = crewState?.revision ?? crewState?.setupRevision ?? revision;
            if (!Number.isSafeInteger(gmRevision) || !Number.isSafeInteger(crewRevision)) return { ready: false };
            return { ready: true, gmRevision, crewRevision, renderedStatusCode: 'public-result-visible' };
          } });
      } catch {
        return { confirmed: false, reason: 'fresh-live-projection-or-rendered-receipt-not-confirmed' };
      }
      return { confirmed: true, result: body.result, request, replay: replay.result,
        actor, projection, httpStatus: response.status(), exactReplay: true };
    }
    return { confirmed: false, reason: 'ordinary-source-preparation-required' };
  }
  async function openMacawConsole(roleId = 'capybara-captain') {
    const surface = await a.select(roleId);
    if (new URL(surface.page.url()).hash.endsWith('/shuttles/macaw')) return surface;
    const link = surface.page.getByRole('link', { name: 'Open Macaw shuttle console', exact: true });
    try { await link.waitFor({ state: 'visible', timeout: 15_000 }); }
    catch { return null; }
    if (!(await link.isEnabled())) return null;
    await link.click();
    try { await surface.page.waitForURL(url => url.hash.endsWith('/shuttles/macaw'), { timeout: 15_000 }); }
    catch { return null; }
    return surface;
  }
  function proofForAction(action, roleId, renderedStatus) {
    return action?.confirmed ? { httpStatus: action.httpStatus, exactReplay: action.exactReplay,
      actor: { roleId, uidHash: action.actor.uidHash, activeConsoleRoleId: action.actor.activeConsoleRoleId,
        connection: action.actor.connection, freshness: action.actor.freshness },
      projection: {
        gm: { ...action.projection.gm, sessionId: initial.sessionId, live: true },
        crew: { ...action.projection.crew, sessionId: initial.sessionId, live: true },
        renderedStatus,
      } } : null;
  }
  async function performMacawRoute(targetShipId) {
    const surface = await openMacawConsole();
    if (!surface) return { confirmed: false, reason: 'Macaw shuttle console is not currently offered.' };
    const state = await a.state(gm);
    const docking = state.shuttleDockings?.find(entry => entry.shuttleId === 'macaw');
    if (!docking || !state.activeVesselIds?.includes(targetShipId)) {
      return { confirmed: false, reason: 'No current Macaw docking or eligible destination is available.' };
    }
    if (docking.shipId === targetShipId) return { confirmed: true, hostShipId: targetShipId };
    const departurePanel = surface.page.getByRole('region', { name: 'Shuttle departure', exact: true });
    const targetName = BASE_PLUS_CAPYBARA_SHIPS.find(([shipId]) => shipId === targetShipId)?.[2] ?? targetShipId;
    const requested = await captureOrdinaryUiMutation({ roleId: 'capybara-captain',
      endpoint: 'requestShuttleDeparture', regionName: 'Shuttle departure', expectedStatus: 'requested',
      renderedStatus: `Departure requested to ${targetName}`,
      prepare: async ({ page }) => {
        if (new URL(page.url()).hash.endsWith('/shuttles/macaw') !== true) return false;
        const selector = departurePanel.getByLabel('Destination ship', { exact: true });
        const options = await selector.locator('option').evaluateAll(nodes => nodes
          .filter(node => node.value && !node.disabled).map(node => node.value));
        if (!options.includes(targetShipId)) return false;
        await selector.selectOption(targetShipId);
        const button = departurePanel.getByRole('button', { name: 'Request departure', exact: true });
        if (!(await button.isVisible()) || !(await button.isEnabled())) return false;
        return () => button.click();
      } });
    if (!requested.confirmed) return requested;
    const inTransit = await captureOrdinaryUiMutation({ roleId: 'capybara-captain',
      endpoint: 'beginShuttleTransit', regionName: 'Shuttle departure', expectedStatus: 'in-transit',
      renderedStatus: `Transit begun to ${targetName}`,
      prepare: async () => {
        const button = departurePanel.getByRole('button', { name: 'Begin transit', exact: true });
        if (!(await button.isVisible()) || !(await button.isEnabled())) return false;
        return () => button.click();
      } });
    if (!inTransit.confirmed) return inTransit;
    // The source-defined transit lasts 60 seconds. ShuttleControl observes that
    // real server time and completes arrival through its ordinary UI effect.
    // Keep the same admitted Macaw holder and route mounted until its actual POST.
    const arrived = await captureOrdinaryUiMutation({ roleId: 'capybara-captain',
      endpoint: 'completeShuttleArrival', regionName: 'Shuttle departure', expectedStatus: 'arrived',
      renderedStatus: `Shuttle arrived at ${targetName}`, automatic: true, timeoutMs: 90_000,
      prepare: async () => true });
    if (!arrived.confirmed || arrived.result.hostShipId !== targetShipId) return { confirmed: false,
      reason: arrived.reason ?? 'Normal server arrival did not reach the selected host.' };
    const after = await a.state(gm);
    if (after.shuttleDockings?.filter(entry => entry.shuttleId === 'macaw').length !== 1 ||
        after.shuttleDockings.find(entry => entry.shuttleId === 'macaw')?.shipId !== targetShipId) {
      return { confirmed: false, reason: 'Authoritative Macaw docking projection did not reach the selected host.' };
    }
    return { confirmed: true, hostShipId: targetShipId };
  }
  async function chooseMacawConsentTarget() {
    const live = await a.state(gm), active = new Set(live.activeVesselIds ?? []);
    for (const [shipId, roleId] of BASE_PLUS_CAPYBARA_SHIPS) {
      if (shipId === 'capybara' || !active.has(shipId) || live.shipDamage?.[shipId]?.destroyed === true ||
          !roster.some(actor => actor.roleId === roleId)) continue;
      const damage = live.shipDamage?.[shipId];
      let systems = [];
      try {
        systems = await gm.page.evaluate(async id => {
          const module = await import(`/src/data/vessels/${id}.ts`);
          return (module.default?.systems ?? []).map(({ id: systemId }) => systemId);
        }, shipId);
      } catch { continue; }
      if (systems.some(systemId => !damage?.damagedSystemIds?.includes(systemId))) return { shipId, roleId };
    }
    return null;
  }
  async function performMacawDismantling() {
    try {
      const target = await chooseMacawConsentTarget();
      if (!target) return { status: 'pending', reason: 'No current active host has an undamaged printed console and admitted target-role account.' };
      const movement = await performMacawRoute(target.shipId);
      if (!movement.confirmed) return { status: 'pending', reason: movement.reason };
      const before = await a.state(gm);
      const proposerSurface = await openMacawConsole();
      if (!proposerSurface) return { status: 'pending', reason: 'Macaw did not expose its current docked-host proposal panel.' };
      const proposalRegion = proposerSurface.page.getByRole('region', { name: 'Permissioned dismantling proposal', exact: true });
      const proposal = await captureOrdinaryUiMutation({ roleId: 'capybara-captain',
        endpoint: 'proposePermissionedDismantling', regionName: 'Permissioned dismantling proposal',
        expectedStatus: 'proposed', renderedStatus: `Awaiting the ${target.shipId} player’s approval`,
        prepare: async () => {
          const selector = proposalRegion.getByLabel('Undamaged target console', { exact: true });
          const options = await selector.locator('option').evaluateAll(nodes => nodes
            .filter(node => node.value && !node.disabled).map(node => node.value));
          if (!options.length) return false;
          await selector.selectOption(options[0]);
          const request = proposalRegion.getByRole('button', { name: 'Request target-player permission', exact: true });
          if (!(await request.isVisible()) || !(await request.isEnabled())) return false;
          return () => request.click();
        } });
      if (!proposal.confirmed || proposal.result.targetShipId !== target.shipId ||
          proposal.result.craftId !== 'macaw') {
        return { status: 'pending', reason: proposal.reason ?? 'Normal Macaw proposal was not current for the selected host.' };
      }
      const targetSurface = await a.select(target.roleId);
      const targetRegion = targetSurface.page.getByRole('region', { name: 'Permissioned dismantling request', exact: true });
      const consent = await captureOrdinaryUiMutation({ roleId: target.roleId,
        endpoint: 'consentToPermissionedDismantling', regionName: 'Permissioned dismantling request',
        expectedStatus: 'consented', renderedStatus: 'Consent recorded // waiting for the engineering-craft holder to apply',
        timeoutMs: 30_000,
        prepare: async () => {
          const grant = targetRegion.getByRole('button', { name: 'Grant permission', exact: true });
          try { await grant.waitFor({ state: 'visible', timeout: 20_000 }); } catch { return false; }
          if (!(await grant.isEnabled())) return false;
          return () => grant.click();
        } });
      if (!consent.confirmed || consent.result.proposalId !== proposal.result.proposalId ||
          consent.result.targetRevision !== proposal.result.targetRevision) {
        return { status: 'pending', reason: consent.reason ?? 'The distinct current host player did not return exact consent.' };
      }
      const consentInbox = await a.read(target.roleId, `permissionedDismantlingInboxes/${target.shipId}`);
      if (!consentInbox || consentInbox.status !== 'consented' ||
          consentInbox.proposalId !== proposal.result.proposalId || consentInbox.consentId !== consent.result.consentId ||
          consentInbox.targetRevision !== proposal.result.targetRevision) {
        return { status: 'pending', reason: 'Target-player entitled server inbox did not confirm this exact consent.' };
      }
      const applySurface = await openMacawConsole();
      if (!applySurface) return { status: 'pending', reason: 'The original Macaw holder could not return to the live host.' };
      const applyRegion = applySurface.page.getByRole('region', { name: 'Permissioned dismantling proposal', exact: true });
      const applied = await captureOrdinaryUiMutation({ roleId: 'capybara-captain',
        endpoint: 'applyPermissionedDismantling', regionName: 'Permissioned dismantling proposal',
        expectedStatus: 'applied', renderedStatus: 'Applied //',
        sourceCheck: ({ gmState, crewState, result }) => [gmState, crewState].every(state =>
          state?.shipDamage?.[result.targetShipId]?.damagedSystemIds?.includes(result.targetConsoleId) &&
          state?.shipResources?.capybara?.scrap === result.scrapAfter),
        prepare: async () => {
          const apply = applyRegion.getByRole('button', { name: 'Apply consented dismantling', exact: true });
          try { await apply.waitFor({ state: 'visible', timeout: 20_000 }); } catch { return false; }
          if (!(await apply.isEnabled())) return false;
          return () => apply.click();
        } });
      if (!applied.confirmed) return { status: 'pending', reason: applied.reason };
      const after = await a.state(gm);
      const finalInbox = await a.read(target.roleId, `permissionedDismantlingInboxes/${target.shipId}`);
      const outcome = macawDismantlingStageOutcome({ sessionId: initial.sessionId, cycle: after.cycle,
        proposer: { roleId: 'capybara-captain', uidHash: proposal.actor.uidHash },
        target: { roleId: target.roleId, uidHash: consent.actor.uidHash },
        proposal: proposal.result, proposalProof: proofForAction(proposal, 'capybara-captain', 'proposal-visible'),
        consent: consent.result, consentProof: proofForAction(consent, target.roleId, 'consent-visible'),
        consentInbox, applied: applied.result,
        applyProof: proofForAction(applied, 'capybara-captain', 'applied-visible'),
        finalInbox,
        before: { shipDamage: before.shipDamage, shipResources: before.shipResources },
        after: { shipDamage: after.shipDamage, shipResources: after.shipResources },
      });
      await updateCapybaraStage('macaw-dismantle-consent', outcome);
      if (outcome.status === 'completed') await attemptMacawRepair();
      return outcome;
    } catch {
      return { status: 'pending', reason: 'Ordinary Macaw consent, exact replay, or live projection was not confirmed.' };
    }
  }
  async function uiRpc(role, name, choose, { replay = true } = {}) {
    const surface = await a.select(role);
    const before = await surface.observe();
    const response = await observeUiReceipt({
      waitForResponse: () => surface.page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith(`/us-central1/${name}`) && response.request().method() === 'POST'),
      choose: () => choose(surface.page),
    });
    const body = await response.json();
    assert.equal(response.ok(), true, `${name}: ${body.error?.message ?? response.status()}`);
    const request = response.request().postDataJSON()?.data;
    assert.equal(request.sessionId, initial.sessionId);
    assert.equal((await surface.observe()).uidHash, before.uidHash);
    if (replay) {
      const again = await surface.callable(name, request);
      assert.equal(again.status, 'committed', `Exact ${name} UI acknowledgement retry`);
      const clean = value => { const result = { ...value }; delete result.status; return result; };
      assert.deepEqual(clean(again.result), clean(body.result));
    }
    a.actions.push({ roleId: role, name, transport: 'actual connected UI control', exactBrowserSdkReplay: replay,
      requestFingerprint: createHash('sha256').update(JSON.stringify(request)).digest('hex'), status: response.status() });
    return body.result;
  }
  async function coordination() {
    const s = await gm.observe();
    assert.equal(s.phaseProgression, 'manual');
    if (s.airspace === 'restricted') {
      await gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }).click();
      await gm.until('Genuine manual Coordination', value => value.airspace === 'lifted' && value.cycle === s.cycle);
    }
  }
  async function advance() {
    await coordination();
    const before = await gm.observe();
    await uiRpc('gm', 'advanceTurn', async page => {
      const offered = page.getByRole('button', { name: `ARE YOU SURE? // Advance to Cycle ${before.cycle + 1}`, exact: true });
      await completeOfferedTurnAdvance({
        expected: { sessionId: initial.sessionId, uidHash: before.uidHash,
          instanceId: before.instanceId, cycle: before.cycle },
        inspect: async () => ({ ...(await gm.observe()), confirmationOffered: await offered.isVisible() }),
        clickAdvance: () => page.getByRole('button', { name: `Advance to Cycle ${before.cycle + 1}`, exact: true }).click(),
        clickConfirmation: () => offered.click(),
      });
    });
    await gm.until('Committed next manual Team', value => value.cycle === before.cycle + 1 || value.phase === 'debrief');
    const after = await a.state();
    if (after.turnPhase?.timerPause?.reason === 'turn-interstitial') {
      // The same normal server announcement control acknowledges the actual
      // held presentation; it neither sets a deadline nor advances gameplay.
      await a.command('executive-officer', 'clearTurnAdvanceInterstitial', {
        requestId: randomUUID(), expectedCycle: after.cycle,
        expectedPausedAt: after.turnPhase.timerPause.pausedAt,
      });
    }
  }
  async function jump(ship, role, name, destination) {
    const before = (await a.state()).shipResources[ship].fuel;
    const result = await uiRpc(role, 'jumpShip', async page => {
      const panel = page.getByRole('region', { name: `${name} Jump Drive control`, exact: true });
      for (let index = 0; index < 4; index++) {
        const current = Number(await panel.getByLabel(`Coordinate digit ${index + 1} value`, { exact: true }).textContent());
        const required = Number(destination[index]);
        for (let count = 0; count < (required - current + 10) % 10; count++)
          await panel.getByRole('button', { name: `Increase coordinate digit ${index + 1}`, exact: true }).click();
      }
      await panel.getByRole('button', { name: 'Lock destination coordinates', exact: true }).click();
      const power = panel.getByRole('slider', { name: 'Jump drive power', exact: true });
      await power.focus(); await power.press('End');
      await panel.getByRole('button', { name: `Jump to ${destination}`, exact: true }).click();
    });
    assert.equal(result.status, 'jumped'); assert.equal(result.destination, destination);
    costs.push({ ship, action: 'normal charged jump', beforeFuel: before, chargedFuel: result.fuelCost,
      expectedAfterFuel: before - result.fuelCost });
    return result;
  }
  async function missionPanel(role, missionId) {
    const surface = await a.select(role, { enter: false });
    if (role !== 'gm') {
      await surface.page.getByRole('link', { name: 'Demo crew', exact: true }).click();
      await surface.until('The same admitted actor returns to the normal manager', value =>
        value.sameActor && value.sessionId === initial.sessionId && value.connection === 'live' && value.freshness === 'server');
      await surface.page.getByRole('link', { name: "Enter this actor's stations", exact: true }).click();
      await surface.page.getByRole('link', { name: 'Open private brief', exact: true }).click();
      await surface.until('The same normally admitted participant opens their private brief', value =>
        value.sameActor && value.sessionId === initial.sessionId && value.connection === 'live' && value.freshness === 'server');
    }
    const panel = surface.page.getByRole('region', { name: `Away mission // ${missionId}`, exact: true });
    await panel.waitFor();
    return { surface, panel };
  }
  async function missionUi(role, missionId, choose) {
    const { surface, panel } = await missionPanel(role, missionId);
    const response = await observeUiReceipt({
      waitForResponse: () => surface.page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith('/us-central1/commitAwayMissionLifecycleCommand') && response.request().method() === 'POST'),
      choose: () => choose(panel),
    });
    const body = await response.json();
    assert.equal(response.ok(), true, `Actual mission UI: ${body.error?.message ?? response.status()}`);
    const request = response.request().postDataJSON()?.data;
    const replay = await surface.callable('commitAwayMissionLifecycleCommand', request);
    assert.equal(replay.status, 'committed');
    assert.equal(replay.result.revision, body.result.revision);
    assert.deepEqual(replay.result.publicState, body.result.publicState);
    a.actions.push({ roleId: role, name: 'commitAwayMissionLifecycleCommand', actionType: request.type,
      transport: 'actual connected UI control', exactBrowserSdkReplay: true, revision: body.result.revision,
      privateCardContentsRecorded: false });
    return body.result;
  }
  async function selectBoaReclamationChoice() {
    const surface = await a.select('capybara-recycler');
    const open = surface.page.getByRole('link', { name: 'Open Boa shuttle console', exact: true });
    try { await open.waitFor({ state: 'visible', timeout: 12_000 }); }
    catch { await updateCapybaraStage('boa-mission-reclamation', { status: 'pending', reason: 'Boa shuttle console is not currently offered.' }); return null; }
    await open.click();
    try {
      const panel = surface.page.getByRole('region', { name: 'Boa mission reclamation', exact: true });
      await panel.waitFor({ state: 'visible', timeout: 12_000 });
      const locations = panel.getByRole('region', { name: 'Current fleet mission locations', exact: true });
      await locations.waitFor({ state: 'visible', timeout: 12_000 });
      const choices = locations.getByRole('button', { name: /^Review .* mission tasks$/ });
      const count = await choices.count();
      if (count === 0) {
        await updateCapybaraStage('boa-mission-reclamation', { status: 'pending', reason: 'No unstarted mission-card task is offered at Boa’s current group location.' });
        return null;
      }
      const choice = choices.first();
      const opportunityLabel = (await choice.innerText()).trim();
      await choice.click();
      const task = panel.getByRole('radio').first();
      await task.waitFor({ state: 'visible', timeout: 12_000 });
      const label = (await task.getAttribute('value'))?.trim();
      if (!label) {
        await updateCapybaraStage('boa-mission-reclamation', { status: 'pending', reason: 'The source task option has no stable current identifier.' });
        return null;
      }
      await panel.getByRole('button', { name: 'Back to mission locations', exact: true }).click();
      return { opportunityLabel, taskOpportunityId: label };
    } catch (error) {
      await updateCapybaraStage('boa-mission-reclamation', { status: 'pending', reason: `Current Boa mission choice unavailable: ${error.message}` });
      return null;
    }
  }
  async function attemptBoaRecycle() {
    const live = await a.state(gm);
    const docking = live.shuttleDockings?.find(entry => entry.shuttleId === 'boa');
    const host = docking?.shipId;
    const hostResources = host && live.shipResources?.[host];
    if (!host || !hostResources || live.shuttleFuelled?.boa !== true) {
      await updateCapybaraStage('boa-recycling', { status: 'pending', reason: 'Boa must be fueled and docked to a live resource host first.' });
      return null;
    }
    const surface = await a.select('capybara-recycler');
    const open = surface.page.getByRole('link', { name: 'Open Boa shuttle console', exact: true });
    try { await open.waitFor({ state: 'visible', timeout: 12_000 }); }
    catch { await updateCapybaraStage('boa-recycling', { status: 'pending', reason: 'Boa recycling console is not currently offered.' }); return null; }
    await open.click();
    const panel = surface.page.getByRole('region', { name: 'Boa recycling', exact: true });
    try { await panel.waitFor({ state: 'visible', timeout: 12_000 }); }
    catch { await updateCapybaraStage('boa-recycling', { status: 'pending', reason: 'Boa recycling workspace is not currently rendered.' }); return null; }
    const selector = panel.getByLabel('Resource to recycle', { exact: true });
    const offered = await selector.locator('option').evaluateAll(nodes => nodes
      .filter(node => node.value && !node.disabled).map(node => node.value));
    const recipes = [['materials', 'materials', 3], ['fuel', 'fuel', 6], ['food', 'food', 6],
      ['water', 'water', 6], ['ore', 'ore', 6]];
    const available = recipes.find(([id, resource, amount]) => offered.includes(id) &&
      Number(hostResources[resource] ?? 0) >= amount);
    if (!available) {
      await updateCapybaraStage('boa-recycling', { status: 'pending', reason: 'No displayed Boa recipe is currently affordable at its live host.' });
      return null;
    }
    const [recipe, , amount] = available;
    return runSpecialist('boa-recycling', 'boa-recycle', { roleId: 'capybara-recycler', recipe, amount },
      { roleId: 'capybara-recycler' });
  }
  async function attemptMacawRepair() {
    const live = await a.state(gm), docking = live.shuttleDockings?.find(entry => entry.shuttleId === 'macaw');
    const host = docking?.shipId;
    if (!host || !BASE_PLUS_CAPYBARA_SHIPS.some(([id]) => id === host) || !live.shipDamage?.[host] ||
        Number(live.shipResources?.capybara?.scrap ?? 0) < 1) {
      await updateCapybaraStage('macaw-repair', { status: 'pending', reason: 'No live eligible docked host damage and repair Scrap are jointly available.' });
      return null;
    }
    const surface = await a.select('capybara-captain');
    const open = surface.page.getByRole('link', { name: 'Open Macaw shuttle console', exact: true });
    try { await open.waitFor({ state: 'visible', timeout: 12_000 }); }
    catch { await updateCapybaraStage('macaw-repair', { status: 'pending', reason: 'Macaw repair console is not currently offered.' }); return null; }
    await open.click();
    const panel = surface.page.getByRole('region', { name: 'Macaw console repair', exact: true });
    try { await panel.waitFor({ state: 'visible', timeout: 12_000 }); }
    catch { await updateCapybaraStage('macaw-repair', { status: 'pending', reason: 'Macaw repair workspace is not currently rendered.' }); return null; }
    let systemCatalog;
    try {
      systemCatalog = await surface.page.evaluate(async id => {
        const module = await import(`/src/data/vessels/${id}.ts`);
        return (module.default?.systems ?? []).map(({ id: systemId, name }) => ({ id: systemId, name }));
      }, host);
    } catch {
      await updateCapybaraStage('macaw-repair', { status: 'pending', reason: 'Printed host console systems are not currently available.' });
      return null;
    }
    const eligible = [];
    for (const system of systemCatalog) {
      const checkbox = panel.getByRole('checkbox', { name: system.name, exact: true });
      if (await checkbox.count() && await checkbox.isVisible() && await checkbox.isEnabled()) eligible.push(system);
      if (eligible.length >= 1) break;
    }
    if (!eligible.length) {
      await updateCapybaraStage('macaw-repair', { status: 'pending', reason: 'No genuinely damaged, live eligible host console is offered for Macaw repair.' });
      return null;
    }
    const systemLabels = Object.fromEntries(eligible.map(value => [value.id, value.name]));
    return runSpecialist('macaw-repair', 'macaw-repair', { roleId: 'capybara-captain', systemIds: eligible.map(value => value.id), systemLabels },
      { roleId: 'capybara-captain', cost: { resource: 'Capybara Scrap', amount: eligible.length, result: 'current damaged console repair' } });
  }
  async function attemptRealWolfScrap(stageId, actionId, roleId) {
    const surface = await a.select(roleId);
    const link = surface.page.getByRole('link', { name: actionId === 'macaw-scrap-collection'
      ? 'Open Macaw shuttle console' : 'Open Boa shuttle console', exact: true });
    try { await link.waitFor({ state: 'visible', timeout: 12_000 }); }
    catch { await updateCapybaraStage(stageId, { status: 'pending', reason: 'Current scrap shuttle console is not offered.' }); return null; }
    await link.click();
    const regionName = actionId === 'macaw-scrap-collection' ? 'Macaw Scrap collection' : 'Boa Scrap collection';
    const region = surface.page.getByRole('region', { name: regionName, exact: true });
    try { await region.waitFor({ state: 'visible', timeout: 12_000 }); }
    catch { await updateCapybaraStage(stageId, { status: 'pending', reason: 'No current actual post-attack Scrap collection control is rendered.' }); return null; }
    const offered = region.getByRole('button', { name: /^Collect Scrap from / });
    const buttons = await offered.all();
    for (const button of buttons) {
      if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
      const text = (await button.innerText()).trim();
      const targetName = text.replace(/^Collect Scrap from\s+/i, '').toLowerCase();
      const targetShipId = BASE_PLUS_CAPYBARA_SHIPS.find(([, , name]) => name.toLowerCase() === targetName)?.[0];
      if (!targetShipId) continue;
      return runSpecialist(stageId, actionId, { roleId, targetShipId }, { roleId, verify: inspectRenderedAction({
        regionName, resultStatuses: [...SUCCESS_RESULT_STATUSES], renderedStatusCode: 'post-attack-scrap-visible' }) });
    }
    await updateCapybaraStage(stageId, { status: 'pending', reason: 'No actual eligible three-damage post-Wolf Scrap target is offered.' });
    return null;
  }
  const ships = BASE_PLUS_CAPYBARA_SHIPS;
  try {
    const preparedEvidence = capybaraStageOutcome(cycleOnePreparation.capybara.evidence);
    await updateCapybaraStage('capybara-maintenance-production', { ...preparedEvidence,
      cycle: 1, roleId: 'capybara-recycler', endpoint: 'runMaintenance' });
    checks.cycleOneSevenHostMaintenance = true;
    await mark('seven actual host Cycle 1 maintenance sessions; Capy production and Boa refuel replayed by Recycler');
    const combatConsoles = ['Fighter Bay Alpha', 'Fighter Bay Bravo', 'Command and Control', 'Missile Launchers', 'Point Defence Lasers'];
    const paidMaintenance = async (cycle, combat = false) => {
      for (const [ship, role, , consoles, refuels] of ships) {
        const live = await a.state(gm), previous = live.maintenanceCycles?.[ship];
        if (previous?.turn === cycle && previous.step === 0 && previous.completedAt) {
          checks[`${ship}MaintenanceCycle${cycle}`] = true;
          continue;
        }
        if (ship === 'capybara') {
          const result = await runCapybaraMaintenanceWithExactReplay(context, cycle, {
            refuelBoa: live.shuttleFuelled?.boa !== true,
            gmRepair: shipId => sourceTools.gmRepair(shipId),
          });
          if (cycle === 1) assert.equal(result.after.fuelledBoa, true);
        } else await a.maintenanceUi(ship, role, { consoles: combat && ship === 'aegis' ? combatConsoles : consoles,
          refuels: combat && ship === 'aegis' ? {} : refuels,
          afterBegin: () => sourceTools.gmRepair(ship), afterRiot: () => sourceTools.gmRepair(ship) });
        checks[`${ship}MaintenanceCycle${cycle}`] = true;
      }
    };
    const research1 = await advanceBaseDetectorResearch(context, { expectedCycle: 1, evidenceName: 'base-research-cycle-1.json' });
    await updateBestCapybaraStage('scientist-research', sourceActionStageOutcome({
      branch: research1.branches?.['detector-research-cross'], requests: research1.requests,
      endpoint: 'advanceEndeavourResearchTrack', roleId: 'shepherd-scientist', cycle: 1,
    }));
    await mark('real Team1 five-slot AEGIS combat and six original paid maintenance accounts');
    await paidMaintenance(1, true);
    await coordination();
    await runSpecialist('wing-scout', 'wing-starlight-scout', { roleId: 'wing-commander', targetCoordinate: '1413' },
      { roleId: 'wing-commander', cost: { resource: 'printed Starlight sortie fuel' } });
    await runSpecialist('pdf-group-relay', 'pdf-group-relay', { roleId: 'refinery-124-pdf-colonel',
      message: 'Training relay: the current group has acknowledged its live route.' },
    { roleId: 'refinery-124-pdf-colonel' });
    await mark('genuine offered opening Wolf composition and all natural combat procedures');
    const openingCombat = await runBaseCombatAndDeduction(context, { combat: 'opening', expectedCycle: 1, deduction: false,
      commandAndControl: 'redirect', evidenceName: 'base-opening-combat.json' });
    checks.openingCombatAndPublicAftermath = true;
    const aegisLaunchBranch = ['aegis-alpha-launch', 'aegis-bravo-launch']
      .map(id => openingCombat.branches?.[id]).find(branch => branch?.status === 'committed');
    const aegisLaunchRequest = openingCombat.requests?.find(request => request.endpoint === 'launchAegisFighterWing' &&
      request.roleId === 'wing-commander' && request.httpStatus === 200 && request.exactOriginalSdkReplay === true);
    if (aegisLaunchBranch?.exactSourceAndRenderedReceipt === true && aegisLaunchRequest) {
      await updateCapybaraStage('wing-combat-launch', sourceActionStageOutcome({ branch: aegisLaunchBranch,
        requests: openingCombat.requests, endpoint: 'launchAegisFighterWing', roleId: 'wing-commander', cycle: 1 }));
    } else await updateCapybaraStage('wing-combat-launch', { status: 'pending',
      reason: aegisLaunchRequest ? 'The normal Wolf callback recorded a replayed launch but lacks the Capy stage rendered-receipt contract.' :
        'No actual Fighter Wing launch was committed in the offered Cycle 1 attack window.' });
    const pdfLaunch = openingCombat.requests?.some(request => request.endpoint === 'launchPdfEscortWing' &&
      request.roleId === 'refinery-124-pdf-colonel' && request.httpStatus === 200 && request.exactOriginalSdkReplay === true);
    await updateCapybaraStage('pdf-escort-launch', { status: 'pending',
      reason: pdfLaunch ? 'The base report does not expose the required current PDF server projection and rendered launch result.' :
        'No replayed PDF Escort launch was recorded for the current attack.' });
    await attemptMacawRepair();
    await attemptRealWolfScrap('macaw-wolf-scrap', 'macaw-scrap-collection', 'capybara-captain');
    await attemptRealWolfScrap('boa-wolf-scrap', 'boa-scrap-collection', 'capybara-recycler');
    await advance();
    const research2 = await advanceBaseDetectorResearch(context, { expectedCycle: 2, evidenceName: 'base-research-cycle-2.json' });
    await updateBestCapybaraStage('scientist-research', sourceActionStageOutcome({
      branch: research2.branches?.['detector-research-cross'], requests: research2.requests,
      endpoint: 'advanceEndeavourResearchTrack', roleId: 'shepherd-scientist', cycle: 2,
    }));
    await mark('real Team2 replaces prior five-slot combat allocation with paid Jump Drive and bays');
    await paidMaintenance(2);
    await mark('manual Coordination2 and actual source-owner scouting');
    await coordination();
    const macawDismantling = await performMacawDismantling();
    if (macawDismantling.status !== 'completed') {
      await updateCapybaraStage('macaw-dismantle-consent', { status: 'pending',
        reason: macawDismantling.reason ?? 'The real docked host, different current player, or exact applied receipt was unavailable.' });
    }
    await runSpecialist('wing-scout', 'wing-starlight-scout', { roleId: 'wing-commander', targetCoordinate: '1413' },
      { roleId: 'wing-commander', cost: { resource: 'printed Starlight sortie fuel' } });
    await runSpecialist('explorer-harvest', 'explorer-scout', { roleId: 'quellon-explorer', targetCoordinate: '1413' },
      { roleId: 'quellon-explorer', cost: { resource: 'printed Hummingbird sortie fuel' } });
    await runSpecialist('pdf-group-relay', 'pdf-group-relay', { roleId: 'refinery-124-pdf-colonel',
      message: 'Training relay: the current group has acknowledged its live route.' },
    { roleId: 'refinery-124-pdf-colonel' });
    const harvestRoll = await runSpecialist('explorer-harvest', 'explorer-harvest-roll',
      { roleId: 'quellon-explorer' }, { roleId: 'quellon-explorer', record: false });
    if (harvestRoll?.status === 'captured' && harvestRoll.evidence?.response?.exactReplay === true) {
      await runSpecialist('explorer-harvest', 'explorer-harvest-allocation',
        { roleId: 'quellon-explorer', foodDieIndex: 0 }, { roleId: 'quellon-explorer' });
    } else await updateCapybaraStage('explorer-harvest', { status: 'pending',
      reason: 'A current two-die server harvest roll was not confirmed; no allocation was attempted.' });
    await runSpecialist('pdf-escort-launch', 'pdf-escort-launch', { roleId: 'refinery-124-pdf-colonel' },
      { roleId: 'refinery-124-pdf-colonel' });
    await runSpecialist('scientist-device', 'scientist-ecm', { roleId: 'shepherd-scientist' },
      { roleId: 'shepherd-scientist' });
    await runSpecialist('scientist-field-upgrade', 'scientist-field-upgrade', { roleId: 'shepherd-scientist',
      targets: [], prepare: async ({ region }) => {
        const choices = region.getByRole('list', { name: 'Available Endeavour field upgrades', exact: true }).getByRole('checkbox');
        for (const checkbox of await choices.all()) {
          if (!(await checkbox.isVisible()) || !(await checkbox.isEnabled())) continue;
          const label = (await checkbox.locator('..').innerText()).trim();
          if (!/\/\/\s*\d+\s+materials$/i.test(label)) continue;
          await checkbox.check();
          return true;
        }
        return false;
      } }, { roleId: 'shepherd-scientist' });
    await runSpecialist('wing-construction', 'wing-build', { roleId: 'wing-commander', wingId: 'fighter-wing-alpha' },
      { roleId: 'wing-commander', cost: { resource: 'AEGIS materials', amount: 1, result: 'one current Alpha fighter' } });
    await attemptBoaRecycle();
    await mark('manual Coordination2 and actual source-owner scouting, tactics and source-offered expansion choices');
    checks.scoutRequestsAndExactRetries = true;
    await mark('seven ordinary officer charged jumps to actual ChartA mission location');
    for (const [ship, , name] of ships) {
      const captain = ship === 'aegis' ? 'admiral' : `${ship}-captain`;
      await jump(ship, captain, name, '1413');
    }
    checks.sevenChargedJumpsAndExactRetries = true;
    const boaChoice = await selectBoaReclamationChoice();
    const boaTaskOpportunityId = boaChoice?.taskOpportunityId ?? null;
    if (boaChoice) await runSpecialist('boa-mission-reclamation', 'boa-reclamation',
      { roleId: 'capybara-recycler', ...boaChoice },
      { roleId: 'capybara-recycler', verify: inspectRenderedAction({ regionName: 'Boa mission reclamation',
        resultStatuses: [...SUCCESS_RESULT_STATUSES], renderedStatusCode: 'mission-choice-visible' }) });
    await mark('normal GM UI selects connected mission participants and leader');
    const dealt = await uiRpc('gm', 'dealPrivateInitialCards', async page => {
      const panel = page.getByRole('region', { name: 'New-location mission start', exact: true });
      const labelFor = role => {
        const actor = roster.find(value => value.roleId === role);
        assert.ok(actor?.displayName, 'Choose the actual admitted participant name.');
        return `${actor.displayName} // ${role}`;
      };
      for (const role of ['wing-commander', 'shepherd-scientist', 'quellon-explorer', 'capybara-recycler'])
        await panel.getByRole('checkbox', { name: labelFor(role), exact: true }).check();
      await panel.getByRole('combobox', { name: 'Mission Leader', exact: true }).selectOption({ label: labelFor('wing-commander') });
      await panel.getByRole('button', { name: 'Start mission', exact: true }).click();
    });
    checks.realMissionStartAndExactRetry = true;
    await mark('normal mission private requests, discard and assignment');
    const missionId = dealt.missionId;
    const participants = ['wing-commander', 'shepherd-scientist', 'quellon-explorer', 'capybara-recycler'];
    for (const role of participants)
      await missionUi(role, missionId, panel => panel.getByRole('button', { name: 'Request extra cards privately', exact: true }).click());
    for (let count = 0; count < participants.length; count++) {
      await missionUi('wing-commander', missionId, async panel => {
        const recipient = panel.getByRole('combobox', { name: 'Participant for extra card', exact: true });
        const recipients = await recipient.locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
        assert.ok(recipients.length, 'Only actual current private request counts offer a recipient.');
        await recipient.selectOption(recipients[0]);
        const opportunity = panel.getByRole('combobox', { name: 'Opportunity for blind extra card', exact: true });
        const offered = await opportunity.locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
        await opportunity.selectOption(offered[0]);
        await panel.getByRole('button', { name: 'Distribute one card blindly', exact: true }).click();
      });
    }
    await missionUi('gm', missionId, panel => panel.getByRole('button', { name: 'Open private discards', exact: true }).click());
    for (const role of participants)
      await missionUi(role, missionId, panel => panel.getByRole('button', { name: /^Discard .* secretly$/ }).first().click());
    for (const role of participants) {
      await missionUi(role, missionId, async panel => {
        const choices = await panel.getByRole('combobox', { name: /^Opportunity for / }).all();
        const used = new Set();
        for (const choice of choices) {
          const offered = await choice.locator('option').evaluateAll(nodes => nodes
            .filter(node => node.value && !node.disabled).map(node => node.value));
          const selected = role === 'capybara-recycler' && boaTaskOpportunityId && offered.includes(boaTaskOpportunityId)
            ? boaTaskOpportunityId : offered.find(value => !used.has(value));
          if (selected) { await choice.selectOption(selected); used.add(selected); }
        }
        await panel.getByRole('button', { name: 'Submit mission assignments', exact: true }).click();
      });
    }
    checks.privateMissionCardsAndLeaderChoices = true;
    await mark('real next Team resolves and delivers server-produced mission results');
    await advance();
    await missionUi('gm', missionId, panel => panel.getByRole('button', { name: 'Add facilitator cards', exact: true }).click());
    const resolved = await missionUi('gm', missionId, panel => panel.getByRole('button', { name: 'Resolve away mission', exact: true }).click());
    assert.equal(resolved.publicState.status, 'resolved');
    const boaMissionOutcome = boaTaskOpportunityId && resolved.publicState.outcomes?.find(entry =>
      entry.opportunityId === boaTaskOpportunityId);
    const boaMissionReward = boaTaskOpportunityId && resolved.publicState.rewards?.find(entry =>
      entry.opportunityId === boaTaskOpportunityId);
    const delivered = await missionUi('wing-commander', missionId, panel =>
      panel.getByRole('button', { name: 'Drop mission rewards at selected ship', exact: true }).click());
    assert.equal(delivered.publicState.status, 'complete');
    const boaDeliveredReward = boaTaskOpportunityId && delivered.publicState.rewards?.find(entry =>
      entry.opportunityId === boaTaskOpportunityId);
    if (boaTaskOpportunityId && boaMissionOutcome &&
        ['success', 'critical-success'].includes(boaMissionOutcome.outcome) &&
        resolved.missionId === missionId && resolved.publicState.missionId === missionId &&
        delivered.missionId === missionId && delivered.publicState.missionId === missionId &&
        delivered.publicState.groupId === resolved.publicState.groupId &&
        delivered.publicState.missionLeaderUid === resolved.publicState.missionLeaderUid &&
        delivered.publicState.custody?.status === 'dropped-off' &&
        delivered.publicState.custody.holderUid === resolved.publicState.missionLeaderUid &&
        typeof delivered.publicState.custody.shipId === 'string' && delivered.publicState.custody.shipId.length > 0 &&
        boaMissionReward?.branch === (boaMissionOutcome.outcome === 'success' ? 'success' : 'critical') &&
        boaMissionReward.resources?.scrap === 1 && Object.keys(boaMissionReward.resources).length === 1 &&
        boaDeliveredReward?.branch === boaMissionReward.branch &&
        boaDeliveredReward.resources?.scrap === 1 && Object.keys(boaDeliveredReward.resources).length === 1 &&
        capybaraStages['boa-mission-reclamation'].status === 'completed') {
      await updateCapybaraStage('mission-successful-delivery', { status: 'completed', roleId: 'wing-commander',
        endpoint: 'commitAwayMissionLifecycleCommand', cycle: 3 });
    } else await updateCapybaraStage('mission-successful-delivery', { status: 'pending',
      reason: boaTaskOpportunityId
        ? 'The actual Boa-reclaimed task did not resolve to server success plus completed custody delivery.'
        : 'Boa reclamation was not committed for an offered pre-deal task; delivery alone does not count.' });
    checks.serverMissionResolutionAndCustodyDelivery = true;
    const research3 = await advanceBaseDetectorResearch(context, { expectedCycle: 3, evidenceName: 'base-research-cycle-3.json' });
    await updateBestCapybaraStage('scientist-research', sourceActionStageOutcome({
      branch: research3.branches?.['detector-research-cross'], requests: research3.requests,
      endpoint: 'advanceEndeavourResearchTrack', roleId: 'shepherd-scientist', cycle: 3,
    }));
    await mark('real Team3 source research and six paid maintenance accounts after private mission delivery');
    await paidMaintenance(3);
    await coordination();
    await advance();
    const research4 = await advanceBaseDetectorResearch(context, { expectedCycle: 4, evidenceName: 'base-research-cycle-4.json' });
    await updateBestCapybaraStage('scientist-research', sourceActionStageOutcome({
      branch: research4.branches?.['detector-research-cross'], requests: research4.requests,
      endpoint: 'advanceEndeavourResearchTrack', roleId: 'shepherd-scientist', cycle: 4,
    }));
    await mark('real Team4 fourth detector cross and six paid maintenance accounts');
    await paidMaintenance(4);
    await coordination();
    await mark('actual original private Scientist Intelligence Wolf and GM deduction procedures');
    await runBaseCombatAndDeduction(context, { combat: 'none', expectedCycle: 4, detectorTest: true,
      investigate: true, sendWolfIntelligence: true,
      requiredBranches: ['agent-detector', 'intelligence-investigation', 'wolf-intelligence', 'suspicion-guidance'],
      evidenceName: 'base-private-deduction-cycle-4.json' });
    checks.sourceResearchAndPrivateDeduction = true;
    await mark('normal GM-authored crisis with authoritative resolution and exact retries');
    let revision = (await a.read('gm', 'crisisState/current'))?.revision ?? 0;
    const crisisId = `pc10-crisis-${randomUUID()}`;
    for (const state of ['draft', 'delivered', 'debated', 'resolved', 'announced', 'closed']) {
      const request = { requestId: randomUUID(), expectedRevision: revision, crisisId,
        crisisKind: 'custom', title: 'Training supply debate', details: 'The virtual fleet considers its actual post-mission supply result.',
        state, ...(state === 'delivered' ? { deliveryPressure: 'hold' } : {}) };
      const result = await a.command('gm', 'transitionCrisis', request);
      const replay = await a.command('gm', 'transitionCrisis', request);
      assert.deepEqual(replay, result); revision = result.revision;
    }
    checks.realGmCrisisLifecycleAndRetries = true;
    await a.save('base-gameplay-actions.json', { status: 'gameplay-committed-ending-pending', stages, checks, costs,
      missionOutcomes: delivered.publicState.outcomes?.map(({ outcome }) => outcome),
      scope: 'Fresh twenty-role Capybara-plus-Press game; seven source-backed host maintenance, actual UI actions, charged jumps, private mission decisions, actual resolved mission and custody delivery. Every disconnected or unobserved requirement remains pending.' });
    await finalEnding(context);
    const afterEnding = await a.state(gm), snapshot = afterEnding.debriefSnapshot;
    const terminal = { status: afterEnding.phase, immutable: snapshot?.type === 'session-debrief' && snapshot.version === 1,
      source: snapshot?.source, result: snapshot?.result, cause: snapshot?.cause };
    if (terminal.immutable) await updateCapybaraStage('genuine-ending', { status: 'completed', roleId: 'gm',
      endpoint: 'immutable session debrief', cycle: snapshot.cycle, sourceRevision: snapshot.version });
    const coreGameplay = { status: checks.serverMissionResolutionAndCustodyDelivery === true &&
      checks.openingCombatAndPublicAftermath === true ? 'passed' : 'pending',
      manualProgression: true, serverActions: true, missionDelivered: checks.serverMissionResolutionAndCustodyDelivery === true };
    const assessment = assessCapybaraGameplay({ context, stages: capybaraStages, coreGameplay, terminal });
    await a.save('capybara-gameplay-report.json', projectCapybaraEvidence({ status: assessment.status,
      stages: capybaraStages, terminalObserved: assessment.terminalObserved, coreGameplayPassed: assessment.coreGameplayPassed }));
    await a.save('base-gameplay-actions.json', { status: assessment.status, stages, checks, costs,
      terminal, capybaraRequired: assessment.pendingStages, missionOutcomes: delivered.publicState.outcomes?.map(({ outcome }) => outcome),
      scope: 'An ending alone cannot pass Capybara gameplay; every required current UI, authenticated actor receipt/replay, rendered result, current GM/crew projection and source-resolved mission branch must be confirmed.' });
    assert.equal(assessment.status, 'passed', `Capybara full-game stages remain pending: ${assessment.pendingStages.join(', ')}`);
  } catch (error) {
    await a.save('base-gameplay-actions.json', { status: 'failed-or-incomplete', stages, checks, costs,
      capybara: projectCapybaraEvidence({ status: 'pending', stages: capybaraStages,
        terminalObserved: false, coreGameplayPassed: false }), message: error.message });
    throw error;
  }
}
