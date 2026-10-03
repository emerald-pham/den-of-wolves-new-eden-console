import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidencePath = process.env.PC07_FULL_ATTACK_EVIDENCE_PATH;
assert.ok(evidencePath, 'An external evidence path is required.');
const uiDirectory = process.env.PC07_ATTACK_UI_DIR;
let browser, commanderPage;
const browserErrors = [];
const f = await createPc07AuthenticatedSession('PC07 ordinary complete attack', 18, { keepAlive: true,
  ...(uiDirectory ? { browserRoleId: 'shepherd-scientist', joinBrowserPlayer: normalBrowserCommander } : {}) });
const { db, session, sessionId, gm, instanceId, call, ok } = f;
console.log(`Disposable normal session: ${sessionId}`);
const stateRef = db.doc(`sessions/${sessionId}/wolfAttackState/current`);
const checks = {};
const actions = [];
async function normalBrowserCommander(joinCode) {
  await mkdir(uiDirectory, { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  commanderPage = await context.newPage();
  commanderPage.on('pageerror', error => browserErrors.push(error.message));
  await commanderPage.goto('http://127.0.0.1:5174');
  await commanderPage.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  await commanderPage.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
  await commanderPage.getByRole('button', { name: 'Join a session', exact: true }).click();
  await commanderPage.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true }).waitFor();
  for (const checkbox of await commanderPage.getByRole('checkbox', { name: /^Acknowledge regulation/ }).all()) await checkbox.check();
  const acknowledge = commanderPage.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
  await acknowledge.and(commanderPage.locator(':enabled')).waitFor(); await acknowledge.click();
  await commanderPage.waitForFunction(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    return Boolean(useSessionStore.getState().me);
  });
  // Observe the identity created by the ordinary UI join. It is never injected
  // into browser storage, and its token stays in this process only.
  return commanderPage.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
  });
}
async function command(actor, name, data) {
  const result = ok(await call(actor, name, { sessionId, ...data }), name);
  assert.notEqual(result?.status, 'stale', `${name} returned stale authority`);
  actions.push({ name, status: result?.status ?? 'committed', revision: result?.revision ?? null });
  console.log(`${name}: ${result?.status ?? 'committed'}${result?.revision ? ` rev ${result.revision}` : ''}`);
  return result;
}
async function denied(actor, name, data) {
  const result = await call(actor, name, { sessionId, ...data });
  assert.notEqual(result.status, 200, `${name} unexpectedly committed`);
  assert.ok(['FAILED_PRECONDITION', 'PERMISSION_DENIED', 'INVALID_ARGUMENT'].includes(result.error.status));
}
async function until(predicate, label) {
  for (let i = 0; i < 120; i++) {
    const value = (await stateRef.get()).data();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Automatic attack did not reach ${label}.`);
}
async function open(cycle) {
  const phase = (await session.get()).get('turnPhase');
  // Accelerate only this disposable clock; dice, roles, resources and results
  // are obtained through normal authenticated game commands.
  await session.update({ turnPhase: { ...phase, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600000).toISOString() } });
  await command(f.byRole('wing-commander'), 'beginOpenAirspacePhase', { expectedTurn: cycle });
}
async function replace(actor, role) {
  const current = (await session.get()).get('setupRevision');
  const eligibility = await command(gm, 'setReplacementEligibility', { instanceId, requestId: randomUUID(),
    targetUid: actor.localId, reason: 'removed', expectedRevision: 0, expectedSetupRevision: current });
  await command(gm, 'assignReplacementRole', { instanceId, requestId: randomUUID(), targetUid: actor.localId,
    replacementRoleId: role, expectedRevision: eligibility.revision, expectedSetupRevision: eligibility.setupRevision });
  await command(actor, 'refreshPresence', { activeConsoleRoleId: null });
}
async function maintenance(cycle) {
  let revision = (await session.get()).get('maintenanceCycles')?.aegis?.revision ?? 0;
  let bay = 0;
  for (const action of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays', 'end']) {
    if (action === 'reactor' && (await session.get()).get('shipDamage')?.aegis?.damagedSystemIds?.length) {
      await command(gm, 'repairAllShipDamage', { instanceId, shipId: 'aegis', requestId: randomUUID(),
        expectedRevision: (await session.get()).get('vesselActionRevisions')?.aegis ?? 0 });
    }
    const result = await command(gm, 'runMaintenance', { instanceId, shipId: 'aegis', action, expectedRevision: revision,
      requestId: randomUUID(), ...(action === 'rations' ? { foodLevel: cycle === 1 ? 0 : 1, waterLevel: cycle === 1 ? 0 : 1 } : {}),
      ...(action === 'reactor' ? { consoles: ['jump-drive', 'command-and-control', 'missile-launchers', 'point-defence-lasers'] } : {}),
      ...(action === 'bays' ? { refuels: bay++ === 0 ? { 'shuttle-bay-zeta': 'starlight' } : {} } : {}) });
    revision = result.cycle.revision;
  }
  assert.equal((await session.get()).get('maintenanceCycles').aegis.turn, cycle);
}
let finalState;
try {
  const lease = (await db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`).get()).data();
  const claimedAt = typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString();
  await command(gm, 'setGmShipConsoleWriteGrant', { instanceId, shipId: 'aegis', enabled: true, claimedAt });
  await maintenance(1);
  await open(1);
  await command(gm, 'setSmallShipDocking', { instanceId, requestId: randomUUID(), smallShipId: 'gorgoneion',
    hostShipId: 'aegis', docked: true, expectedRevision: 0 });
  // Replacement assignment preserves a passenger's physical berth. Use a
  // current AEGIS passenger for the docked Gorgoneion Captain.
  const captain = f.byRole('admiral');
  const commander = f.byRole('shepherd-scientist');
  await replace(captain, 'gorgoneion-captain');
  await replace(commander, 'wolf-commander');
  await command(gm, 'setWolfAttackWindow', { instanceId, requestId: randomUUID(), expectedRevision: 0, status: 'deferred' });
  await command(gm, 'advanceTurn', { instanceId, requestId: randomUUID(), expectedTurn: 1,
    overridePhaseTimer: true });
  const held = (await session.get()).get('turnPhase').timerPause;
  await command(f.byRole('executive-officer'), 'clearTurnAdvanceInterstitial', { requestId: randomUUID(),
    expectedCycle: 2, expectedPausedAt: held.pausedAt });
  await maintenance(2);
  let smallRevision = 0;
  for (const action of ['begin', 'rations', 'unrest', 'riot', 'reactor', 'end']) {
    const result = await command(captain, 'runSmallShipMaintenance', { smallShipId: 'gorgoneion', action,
      requestId: randomUUID(), expectedRevision: smallRevision,
      ...(action === 'rations' ? { foodLevel: 1, waterLevel: 1 } : {}),
      ...(action === 'reactor' ? { consoles: ['force-field-projector'] } : {}) });
    smallRevision = result.cycle.revision;
  }
  checks.normalAdmissionReplacementAndMaintenance = true;
  await open(2);
  await command(gm, 'unlockPressAirspace', { instanceId });
  const phaseBefore = (await session.get()).get('turnPhase');
  const wing = f.byRole('wing-commander');
  const departureId = randomUUID();
  await command(wing, 'requestShuttleDeparture', { requestId: departureId, shuttleId: 'starlight',
    destinationShipId: 'icebreaker', expectedControlRevision: 0, expectedCycle: 2 });
  await command(wing, 'beginShuttleTransit', { requestId: randomUUID(), shuttleId: 'starlight',
    expectedDepartureRequestId: departureId, expectedControlRevision: 0, expectedCycle: 2 });
  await command(gm, 'setWolfAttackWindow', { instanceId, requestId: randomUUID(), expectedRevision: 1, status: 'due' });
  const preparation = await command(gm, 'stageWolfAttackPreparation', { instanceId, requestId: randomUUID(),
    expectedRevision: 0, turn: 2, shipIds: [...Array(10).fill('wolf-fighter-wing'), ...Array(5).fill('wolf-assault-transport')],
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' });
  const declarationRequest = { instanceId, requestId: randomUUID(), expectedRevision: preparation.revision };
  const declaration = await command(gm, 'declareWolfAttack', declarationRequest);
  assert.equal((await session.get()).get('turnPhase').airspace.state, 'restricted');
  assert.equal((await db.doc(`sessions/${sessionId}/shuttleTransitChains/starlight`).get()).exists, false);
  assert.equal((await db.doc(`sessions/${sessionId}/shuttleDepartures/starlight`).get()).exists, false);
  checks.authoritativeDeclarationAndActualTransitParking = true;
  await until(s => s?.forceFieldChoice?.status === 'pending', 'Captain before targeting');
  await command(captain, 'disconnectFromSession', {});
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal((await stateRef.get()).get('forceFieldChoice').status, 'pending');
  checks.disconnectedConfiguredChoiceRemainsPending = true;
  await command(captain, 'resumeSession', {});
  await command(captain, 'refreshPresence', { activeConsoleRoleId: null });
  const force = await command(captain, 'getWolfForceFieldChoice', {});
  await denied(wing, 'getWolfForceFieldChoice', {});
  const pauseData = { instanceId, expectedTurn: 2, paused: true };
  await denied(gm, 'setEmergencyTimerPaused', pauseData);
  await command(gm, 'setEmergencyTimerPaused', { ...pauseData, requestId: randomUUID(),
    expectedAttackRevision: force.revision, reason: 'Pause for local recovery verification', dangerConfirmed: true });
  await denied(captain, 'getWolfForceFieldChoice', {});
  await denied(captain, 'commitWolfForceFieldChoice', { requestId: randomUUID(), expectedTurn: 2,
    expectedRevision: force.revision, targetShipId: 'aegis' });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok((await session.get()).get('turnPhase').timerPause);
  assert.equal((await stateRef.get()).get('forceFieldChoice').status, 'pending');
  const pausedState = (await stateRef.get()).data();
  await command(gm, 'setEmergencyTimerPaused', { instanceId, expectedTurn: 2, paused: false, requestId: randomUUID(),
    expectedAttackRevision: pausedState.revision, reason: 'Resume after local recovery verification', dangerConfirmed: true });
  const resumedForce = await command(captain, 'getWolfForceFieldChoice', {});
  const protectedRequest = { requestId: randomUUID(), expectedTurn: 2, expectedRevision: resumedForce.revision, targetShipId: 'aegis' };
  const protectedResult = await command(captain, 'commitWolfForceFieldChoice', protectedRequest);
  assert.deepEqual(await command(captain, 'commitWolfForceFieldChoice', protectedRequest), protectedResult);
  checks.reasonedSharedHoldAndCaptainChoiceRetry = true;
  await until(s => s?.calculationReceipt?.step === 'targeting' && s?.forceFieldChoice?.status === 'selected', 'server targeting');
  const targeting = await command(commander, 'getWolfCommanderTargeting', {});
  await denied(wing, 'getWolfCommanderTargeting', {});
  if (commanderPage) {
    await commanderPage.getByRole('link', { name: 'Open private brief', exact: true }).waitFor({ timeout: 30000 });
    await commanderPage.getByRole('link', { name: 'Open private brief', exact: true }).click();
    const callDialog = commanderPage.getByRole('dialog', { name: 'Facilitator call', exact: true });
    if (await callDialog.count()) await callDialog.getByRole('button', { name: /close/i }).click();
    const panel = commanderPage.getByRole('region', { name: 'Targeting dice', exact: true });
    await panel.getByRole('checkbox').first().waitFor({ timeout: 30000 });
    assert.ok(await commanderPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await commanderPage.screenshot({ path: `${uiDirectory}/phone-normal-commander-choice.png`, fullPage: true });
    await panel.getByRole('checkbox').first().check();
    await panel.getByRole('button', { name: 'Reroll selected dice', exact: true }).click();
    await until(s => s?.commanderRerollIndexes?.length === 1, 'ordinary UI Commander reroll');
    await panel.getByRole('button', { name: 'Finish rerolls', exact: true }).and(commanderPage.locator(':enabled')).waitFor({ timeout: 30000 });
    await panel.getByRole('button', { name: 'Finish rerolls', exact: true }).click();
    await until(s => s?.commanderRerollCompletion?.status === 'finished', 'ordinary UI Commander finish');
    assert.deepEqual(browserErrors, []);
    checks.normalPhoneCommanderUiJoinRerollFinishAndAuthority = true;
    await commanderPage.screenshot({ path: `${uiDirectory}/phone-normal-commander-committed.png`, fullPage: true });
  } else {
    const reroll = await command(commander, 'applyWolfCommanderTargetRerolls', { requestId: randomUUID(), expectedTurn: 2,
      expectedRevision: targeting.revision, rosterIndexes: [targeting.eligibleRerollIndexes[0]] });
    await command(commander, 'finishWolfCommanderTargetingRerolls', { requestId: randomUUID(), expectedTurn: 2, expectedRevision: reroll.revision });
  }
  const eo = f.byRole('executive-officer');
  const cnc = await command(eo, 'getAegisCommandAndControl', {});
  assert.equal(cnc.eligible, true);
  const passRequest = { requestId: randomUUID(), expectedTurn: 2, expectedRevision: cnc.revision };
  const pass = await command(eo, 'passAegisCommandAndControl', passRequest);
  assert.equal(pass.view.reason, 'passed');
  assert.deepEqual(await command(eo, 'passAegisCommandAndControl', passRequest), pass);
  checks.privateCommanderRerollFinishAndExplicitCncPass = true;
  const ranges = [];
  for (const range of ['long-range', 'medium-range', 'short-range']) {
    await until(s => s?.currentStep === range, range);
    const view = await command(eo, 'getWolfRangeActionChoice', {});
    const choiceRequest = { requestId: randomUUID(), expectedTurn: 2, expectedRevision: view.revision,
      range, actionIds: view.eligibleActions.map(action => action.actionId) };
    const locked = await command(eo, 'commitWolfRangeActionChoice', choiceRequest);
    assert.deepEqual(await command(eo, 'commitWolfRangeActionChoice', choiceRequest), locked);
    if (locked.choiceStatus === 'targets-required') {
      const targets = await command(eo, 'getWolfRangeActionChoice', {});
      const assignments = targets.hitSlots.map(slot => ({ actionId: slot.actionId,
        contactIds: targets.contacts.filter(contact => contact.available).slice(0, slot.count).map(contact => contact.contactId) }));
      const request = { requestId: randomUUID(), expectedTurn: 2, expectedRevision: targets.revision, range, assignments };
      const result = await command(eo, 'assignWolfRangeTargets', request);
      assert.deepEqual(await command(eo, 'assignWolfRangeTargets', request), result);
    }
    ranges.push({ range, actions: choiceRequest.actionIds, targetsRequired: locked.choiceStatus === 'targets-required' });
  }
  checks.threeSimultaneousSourceRangesAndExactLockedRollRetries = true;
  await until(s => s?.currentStep === 'boarding' || s?.status === 'resolved', 'boarding');
  const boarding = [];
  for (let i = 0; i < 120 && (await stateRef.get()).get('status') !== 'resolved'; i++) {
    const state = (await stateRef.get()).data();
    // The GM summary is refreshed by the continuation trigger. A just-committed
    // choice is already authoritative even before that projection catches up.
    const pending = state.decisionSummary?.boarding?.targets?.find(choice => choice.status === 'pending' &&
      !state.boardingDefenceChoices?.[choice.targetShipId]);
    if (!pending) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
    let crew, view;
    for (const actor of f.players.filter(actor => pending.actors.some(candidate => candidate.uid === actor.localId))) {
      const response = await call(actor, 'getWolfBoardingDefenceChoice', { sessionId });
      if (response.status === 200 && response.result.choiceStatus === 'pending' &&
          response.result.targetShipId === pending.targetShipId) { crew = actor; view = response.result; break; }
    }
    assert.ok(crew && view, 'A current crew actor must own each pending boarding choice.');
    const request = { requestId: randomUUID(), expectedTurn: 2, expectedRevision: view.revision,
      targetShipId: view.targetShipId, securityTeams: Math.min(1, view.availableSecurityTeams) };
    const result = await command(crew, 'commitWolfBoardingDefenceChoice', request);
    assert.deepEqual(await command(crew, 'commitWolfBoardingDefenceChoice', request), result);
    boarding.push({ shipId: view.targetShipId, securityTeams: request.securityTeams });
  }
  finalState = await until(s => s?.status === 'resolved' && s?.currentStep === 'resolved', 'final atomic reduction');
  assert.equal(finalState.airspaceLocked, false);
  const finalSession = (await session.get()).data();
  assert.equal(finalSession.turnPhase.airspace.state, 'lifted');
  assert.equal(finalSession.turnPhase.airspace.pressAccess, phaseBefore.airspace.pressAccess);
  assert.ok(Date.parse(finalSession.turnPhase.openAirspaceEndsAt) >= Date.parse(phaseBefore.openAirspaceEndsAt));
  checks.boardingChoicesAndAtomicMovementPressClockReopening = true;
  const snapshot = { phase: finalSession.turnPhase, resources: finalSession.shipResources,
    damage: finalSession.shipDamage, population: finalSession.shipSurvivors, ticker: finalSession.fleetTicker };
  assert.deepEqual(await command(gm, 'declareWolfAttack', declarationRequest), declaration);
  const replaySession = (await session.get()).data();
  assert.deepEqual({ phase: replaySession.turnPhase, resources: replaySession.shipResources,
    damage: replaySession.shipDamage, population: replaySession.shipSurvivors, ticker: replaySession.fleetTicker }, snapshot);
  checks.finalDeclarationReplayDoesNotDamageParkOrResetClock = true;
  const member = await command(eo, 'getCurrentMemberSession', {});
  assert.ok(member.session);
  assert.equal(Object.hasOwn(member.session, 'wolfAttackState'), false);
  for (const path of ['', '/wolfAttackState/current']) {
    const response = await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${sessionId}${path}`,
      { headers: { Authorization: `Bearer ${eo.idToken}` } });
    assert.equal(response.status, 403, 'Ordinary direct reads cannot disclose private authority.');
  }
  checks.currentMemberProjectionAndPrivateRootRulesDenials = true;
  await command(wing, 'requestShuttleDeparture', { requestId: randomUUID(), shuttleId: 'starlight',
    destinationShipId: 'icebreaker', expectedControlRevision: 0, expectedCycle: 2 });
  checks.actualMovementRequestAcceptedAfterAttack = true;
  await writeFile(evidencePath, JSON.stringify({ kind: 'normal-authenticated-local-emulator-http-composed-gameplay',
    sourceCommit: process.env.PC07_SOURCE_COMMIT, ordinaryRoster: 18, checks, actions, ranges, boarding,
    finalStatus: finalState.status, finalRevision: finalState.revision, finalStep: finalState.currentStep,
    fixtureChanges: ['disposable clock deadlines only'], normalFacilitatorDecisions: ['replacement eligibility and admission', 'early cycle advancement', 'reasoned timer hold', 'audited damage correction when random maintenance damages a required console'],
    preparedScene: false, productionGameplay: false, identitiesRetained: false, completedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('PC07 complete normal authenticated attack, retry and movement proof passed.');
} catch (error) {
  if (commanderPage) {
    await commanderPage.screenshot({ path: `${uiDirectory}/failure.png`, fullPage: true });
    await writeFile(`${uiDirectory}/failure-state.json`, JSON.stringify({ message: error.message, errors: browserErrors,
      body: await commanderPage.locator('body').innerText() }, null, 2) + '\n');
  }
  const state = (await stateRef.get()).data();
  await writeFile(`${evidencePath}.failure.json`, JSON.stringify({ checks, actions,
    message: error.message, currentStep: state?.currentStep, status: state?.status,
    revision: state?.revision, decisionSummary: state?.decisionSummary,
    forceFieldChoice: state?.forceFieldChoice, calculationStep: state?.calculationReceipt?.step }, null, 2) + '\n');
  throw error;
} finally {
  const keepCleanupAlive = setInterval(() => {}, 1000);
  try { await browser?.close(); await f.cleanup(); await db.terminate(); }
  finally { clearInterval(keepCleanupAlive); }
}
