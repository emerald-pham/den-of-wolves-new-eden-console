import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidencePath = process.env.PC08_BOARDING_CARRYOVER_EVIDENCE_PATH;
assert.ok(evidencePath, 'An external evidence path is required.');
const uiDirectory = process.env.PC07_ATTACK_UI_DIR;
let browser, commanderPage;
const browserErrors = [];
const f = await createPc07AuthenticatedSession('PC08 ordinary boarding and carryover', 18, { keepAlive: true,
  ...(uiDirectory ? { browserRoleId: 'shepherd-scientist', joinBrowserPlayer: normalBrowserCommander } : {}) });
const { db, session, sessionId, gm, instanceId, call, ok } = f;
console.log(`Disposable normal session: ${sessionId}`);
const stateRef = db.doc(`sessions/${sessionId}/wolfAttackState/current`);
const checks = {};
const actions = [];
const boarding = [];
const boardingSpecials = [];
const boardingChoiceObservations = [];
async function normalBrowserCommander(joinCode) {
  await mkdir(uiDirectory, { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  commanderPage = await context.newPage();
  commanderPage.on('pageerror', error => browserErrors.push(error.message));
  await commanderPage.goto(process.env.PC07_LOCAL_GM_ORIGIN ?? 'http://127.0.0.1:5177');
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
  const status = result?.status ?? (name.startsWith('get') ? 'read' : 'committed');
  actions.push({ name, status, revision: result?.revision ?? null });
  console.log(`${name}: ${status}${result?.revision ? ` rev ${result.revision}` : ''}`);
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
async function capturePredicateInputs(state, sessionState) {
  const [pdfWing, players, fleetGroups] = await Promise.all([
    db.doc(`sessions/${sessionId}/serverState/pdfEscortWing`).get(),
    db.collection(`sessions/${sessionId}/players`).get(),
    db.collection(`sessions/${sessionId}/fleetGroups`).get(),
  ]);
  await writeFile(`${evidencePath}.predicate-inputs.json`, JSON.stringify({
    sourceCommit: process.env.PC08_SOURCE_COMMIT, state,
    session: Object.fromEntries(['phase', 'currentTurn', 'turnPhase', 'activeRoleIds', 'activeVesselIds',
      'shipDamage', 'shipSurvivors', 'shipResources', 'shuttleDockings', 'shuttleVisitLog',
      'shuttleControl', 'shuttleFuelled', 'retainedShuttles', 'smallShipStates', 'maintenanceCycles', 'maliadesState']
      .map(key => [key, sessionState[key]])),
    pdfWing: pdfWing.data(),
    players: players.docs.map(doc => ({ id: doc.id, data: doc.data() })),
    fleetGroups: fleetGroups.docs.map(doc => ({ id: doc.id, data: doc.data() })),
    authTokensRetained: false,
  }, null, 2) + '\n');
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
    if (action === 'reactor' && cycle !== 3 && (await session.get()).get('shipDamage')?.aegis?.damagedSystemIds?.length) {
      await command(gm, 'repairAllShipDamage', { instanceId, shipId: 'aegis', requestId: randomUUID(),
        expectedRevision: (await session.get()).get('vesselActionRevisions')?.aegis ?? 0 });
    }
    const result = await command(gm, 'runMaintenance', { instanceId, shipId: 'aegis', action, expectedRevision: revision,
      requestId: randomUUID(), ...(action === 'rations' ? { foodLevel: cycle === 2 ? 1 : 0, waterLevel: cycle === 2 ? 1 : 0 } : {}),
      ...(action === 'reactor' ? { consoles: cycle === 3 ? [] : ['jump-drive', 'command-and-control', 'missile-launchers', 'point-defence-lasers'] } : {}),
      ...(action === 'bays' ? { refuels: bay++ === 0
        ? (cycle === 3 ? {} : { 'shuttle-bay-zeta': 'starlight' })
        : (cycle === 3 ? {} : { 'shuttle-bay-omega': 'pallas' }) } : {}) });
    revision = result.cycle.revision;
  }
  assert.equal((await session.get()).get('maintenanceCycles').aegis.turn, cycle);
}
async function launchHostMaintenance(cycle) {
  for (const shipId of ['dione', 'refinery-124']) {
    const actor = f.byRole(`${shipId}-captain`);
    let revision = (await session.get()).get('maintenanceCycles')?.[shipId]?.revision ?? 0;
    for (const action of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'end']) {
      const result = await command(actor, 'runMaintenance', { shipId, action, expectedRevision: revision,
        requestId: randomUUID(), ...(action === 'rations' ? { foodLevel: 1, waterLevel: 1 } : {}),
        ...(action === 'reactor' ? { consoles: shipId === 'refinery-124' ? ['fighter-bay'] : [] } : {}),
        ...(action === 'bays' ? { refuels: {} } : {}) });
      revision = result.cycle.revision;
    }
    assert.equal((await session.get()).get('maintenanceCycles')[shipId].turn, cycle);
  }
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
  await launchHostMaintenance(2);
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
  const launchPasses = [];
  for (const [sourceId, actor, getter, query] of [
    ['fighter-wing-alpha', wing, 'getAegisFighterWingLaunch', { wingId: 'fighter-wing-alpha' }],
    ['fighter-wing-bravo', wing, 'getAegisFighterWingLaunch', { wingId: 'fighter-wing-bravo' }],
    ['pdf-escort-fighter-wing', f.byRole('refinery-124-pdf-colonel'), 'getPdfEscortWingLaunch', {}],
    ['maliades', f.byRole('dione-engineer'), 'getDioneMaliadesLaunch', {}],
  ]) {
    const view = await command(actor, getter, query);
    if (!view.eligible) {
      launchPasses.push({ sourceId, eligible: false, reason: view.reason, choiceStatus: view.choiceStatus });
      continue;
    }
    const request = { sourceId, requestId: randomUUID(), expectedTurn: view.turn,
      expectedRevision: view.revision,
      ...(sourceId === 'maliades' ? {} : { expectedWingRevision: view.wingRevision }) };
    const result = await command(actor, 'passWolfFighterLaunchChoice', request);
    const replay = await command(actor, 'passWolfFighterLaunchChoice', request);
    assert.equal(replay.status, 'replayed');
    assert.deepEqual({ ...replay, status: 'committed' }, result);
    launchPasses.push({ sourceId, eligible: true, choiceStatus: result.choiceStatus, revision: result.revision });
  }
  checks.allEligibleCurrentFighterLaunchOwnersExplicitlyPass = true;
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
    // Commit one ordinary Long Range action so the proof exercises a real
    // damage assignment while leaving enough Wings to demonstrate carryover.
    // The remaining ranges are explicitly passed through the live EO choice.
    const actionIds = range === 'long-range' ? view.eligibleActions.slice(0, 1).map(action => action.actionId) : [];
    const choiceRequest = { requestId: randomUUID(), expectedTurn: 2, expectedRevision: view.revision,
      range, actionIds };
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
  checks.allThreeAuthenticatedRangeWindows = true;
  await until(s => s?.currentStep === 'boarding' || s?.status === 'resolved', 'boarding');
  const boardingChoiceActors = [...new Set([commander, f.byRole('executive-officer'), captain,
    f.byRole('rosal-militia-leader'), gm].filter(Boolean))];
  let idleBoardingPasses = 0;
  for (let i = 0; i < 600 && (await stateRef.get()).get('status') !== 'resolved'; i++) {
    const state = (await stateRef.get()).data();
    let specialActor, specialView;
    for (const actor of boardingChoiceActors) {
      const response = await call(actor, 'getWolfBoardingSpecialChoice', {
        sessionId, ...(actor === gm ? { instanceId } : {}),
      });
      const observedChoice = response.result?.choice;
      boardingChoiceObservations.push({
        actorRoleId: actor === gm ? 'gm' : f.roles[f.players.indexOf(actor)] ?? 'unknown',
        status: response.status,
        type: response.result?.type,
        reason: response.result?.reason,
        kind: observedChoice?.kind,
        targetShipId: observedChoice?.targetShipId ?? null,
      });
      if (boardingChoiceObservations.length > 40) boardingChoiceObservations.shift();
      if (response.status === 200 && response.result.type === 'wolf-boarding-special-choice-view') {
        specialActor = actor;
        specialView = response.result;
        break;
      }
    }
    if (specialView) {
      const choice = specialView.choice;
      let commandChoice;
      if (choice.kind === 'commander') {
        commandChoice = { kind: 'commander', targetShipId: choice.targets.some(target => target.targetShipId === 'aegis')
          ? 'aegis' : choice.targets[0]?.targetShipId ?? null };
      } else if (choice.kind === 'relocation') {
        const nextHost = choice.fuelled ? choice.legalHostIds.find(host => host !== choice.currentHostId) : undefined;
        commandChoice = { kind: 'relocation', craftId: choice.craftId,
          targetShipId: nextHost ?? null, expectedControlRevision: choice.controlRevision };
      } else if (choice.kind === 'militia') {
        commandChoice = { kind: 'militia', targetShipId: choice.targetShipId,
          militiaDoubleTeams: choice.doubleDiceAvailable, militiaFrontLineDice: choice.maxFrontLineDice > 0 ? 1 : 0 };
      } else if (choice.kind === 'reroll') {
        const sourceSpent = choice.alreadyRerolled.map(index => typeof index === 'number' ? index : index.dieIndex);
        commandChoice = { kind: 'reroll', source: choice.source, targetShipId: choice.targetShipId,
          dieIndexes: choice.dice.filter(die => !sourceSpent.includes(die.dieIndex))
            .slice(0, choice.maxRerolls).map(die => die.dieIndex) };
      } else {
        commandChoice = { kind: 'commander-ruling', targetShipId: choice.targetShipId,
          rulingText: 'For this attack, treat the unresolved Commander consequence as contained.' };
      }
      const request = { requestId: randomUUID(), expectedTurn: specialView.turn,
        expectedRevision: specialView.revision, choice: commandChoice,
        ...(choice.kind === 'commander-ruling' ? { instanceId } : {}) };
      const result = await command(specialActor, 'commitWolfBoardingSpecialChoice', request);
      assert.deepEqual(await command(specialActor, 'commitWolfBoardingSpecialChoice', request), result);
      boardingSpecials.push({ kind: choice.kind, ...(choice.kind === 'relocation' ? { craftId: choice.craftId,
        moved: commandChoice.targetShipId !== null } : {}), ...(choice.kind === 'reroll' ? { source: choice.source,
        dieCount: commandChoice.dieIndexes.length } : {}) });
      await new Promise(resolve => setTimeout(resolve, 200));
      continue;
    }
    // The projected target list identifies only the currently pending crew;
    // the server callable remains authoritative for berth and stage checks.
    const pending = state.decisionSummary?.boarding?.targets?.find(choice => choice.status === 'pending' &&
      !state.boardingDefenceChoices?.[choice.targetShipId]);
    if (!pending) {
      if (++idleBoardingPasses >= 8) break;
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }
    idleBoardingPasses = 0;
    let crew, view;
    for (const actor of f.players.filter(candidate => pending.actors.some(holder => holder.uid === candidate.localId))) {
      const response = await call(actor, 'getWolfBoardingDefenceChoice', { sessionId });
      if (response.status === 200 && response.result.choiceStatus === 'pending' &&
          response.result.targetShipId === pending.targetShipId) { crew = actor; view = response.result; break; }
    }
    assert.ok(crew && view, 'A connected current crew actor must own each pending boarding choice.');
    const request = { requestId: randomUUID(), expectedTurn: 2, expectedRevision: view.revision,
      targetShipId: view.targetShipId, securityTeams: view.availableSecurityTeams };
    const result = await command(crew, 'commitWolfBoardingDefenceChoice', request);
    assert.deepEqual(await command(crew, 'commitWolfBoardingDefenceChoice', request), result);
    boarding.push({ shipId: view.targetShipId, securityTeams: request.securityTeams });
  }
  const predicateState = (await stateRef.get()).data();
  const predicateSession = (await session.get()).data();
  await capturePredicateInputs(predicateState, predicateSession);
  finalState = await until(s => s?.status === 'resolved' && s?.currentStep === 'resolved', 'final atomic reduction');
  const finalBoardingState = (await stateRef.get()).data();
  const finalSpecialChoiceResponses = [];
  for (const actor of [...new Set([...boardingChoiceActors, gm])]) {
    const response = await call(actor, 'getWolfBoardingSpecialChoice', {
      sessionId, ...(actor === gm ? { instanceId } : {}),
    });
    finalSpecialChoiceResponses.push({ actorRoleId: actor === gm ? 'gm' : f.roles[f.players.indexOf(actor)] ?? 'unknown',
      status: response.status, type: response.result?.type, reason: response.result?.reason,
      kind: response.result?.choice?.kind, condition: response.result?.choice?.condition,
      errorStatus: response.error?.status, errorMessage: response.error?.message });
  }
  assert.ok(finalSpecialChoiceResponses.every(response =>
    response.status === 400 && response.errorStatus === 'FAILED_PRECONDITION' &&
    response.errorMessage === 'Wolf boarding defence is not currently open.'),
  'The server must report no pending special actor after all required stages, including any Commander ruling.');
  const commanderRulingCommitted = boardingSpecials.some(choice => choice.kind === 'commander-ruling');
  if (commanderRulingCommitted) {
    assert.equal(finalBoardingState.boardingCommanderRuling?.targetShipId,
      finalBoardingState.boardingCommanderRulingRequiredTarget);
    assert.ok(finalBoardingState.boardingCommanderRuling?.text);
  } else {
    assert.equal(finalBoardingState.boardingCommanderRulingRequiredTarget, undefined,
      'A Commander ruling is required only when all Commander-led Wolf Boarding Parties were destroyed.');
    assert.equal(finalBoardingState.boardingCommanderRuling, undefined);
  }
  const finalBoardingTargets = finalBoardingState.decisionSummary?.boarding?.targets ?? [];
  assert.ok(finalBoardingTargets.every(target => target.status !== 'pending'));
  const finalBoardingGate = { nextWolfBoardingStage: 'complete', specialChoiceResponses: finalSpecialChoiceResponses,
    commanderRulingRequiredTarget: finalBoardingState.boardingCommanderRulingRequiredTarget ?? null,
    commanderRulingRequirement: 'All Commander-led Wolf Boarding Parties were destroyed.',
    commanderRulingCommitted: Boolean(finalBoardingState.boardingCommanderRuling),
    defenceChoices: Object.fromEntries(Object.entries(finalBoardingState.boardingDefenceChoices ?? {})
      .map(([target, choice]) => [target, { securityTeams: choice.securityTeams,
        availableBefore: choice.availableBefore, status: choice.status }])),
    militiaTargets: Object.keys(finalBoardingState.boardingMilitiaChoices ?? {}),
    pendingTargets: finalBoardingTargets.filter(target => target.status === 'pending').map(target => target.targetShipId) };
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
  const finalizationAuditRef = db.doc(`sessions/${sessionId}/wolfAttackState/current/audit/wolf-finalized-2`);
  const priorFinalizationAudit = (await finalizationAuditRef.get()).data();
  assert.equal(priorFinalizationAudit?.type, 'wolf-attack-finalization');
  const priorAttackState = (await stateRef.get()).data();
  const returningWings = priorFinalizationAudit.receipt.returningInstanceIds;
  const destroyedWings = priorAttackState.combatRoster.filter(ship =>
    ship.shipId === 'wolf-fighter-wing' && ship.destroyed).map(ship => ship.instanceId);
  const allWings = priorAttackState.combatRoster.filter(ship => ship.shipId === 'wolf-fighter-wing');
  assert.ok(returningWings.length > 0, 'The finalized first attack must have at least one surviving Fighter Wing.');
  assert.ok(destroyedWings.length > 0, 'The first attack must destroy at least one Wing to prove it is excluded.');
  assert.deepEqual(returningWings, allWings.filter(ship => !ship.destroyed).map(ship => ship.instanceId));
  assert.ok(destroyedWings.every(id => !returningWings.includes(id)));
  checks.finalizerReturnsOnlySurvivingFighterWings = true;

  const member = await command(eo, 'getCurrentMemberSession', {});
  assert.ok(member.session);
  assert.equal(Object.hasOwn(member.session, 'wolfAttackState'), false);
  for (const path of ['', '/wolfAttackState/current']) {
    const response = await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${sessionId}${path}`,
      { headers: { Authorization: `Bearer ${eo.idToken}` } });
    assert.equal(response.status, 403, 'Ordinary direct reads cannot disclose private authority.');
  }
  checks.currentMemberProjectionAndPrivateRootRulesDenials = true;
  await command(gm, 'advanceTurn', { instanceId, requestId: randomUUID(), expectedTurn: 2,
    overridePhaseTimer: true });
  const thirdCycleHold = (await session.get()).get('turnPhase').timerPause;
  await command(eo, 'clearTurnAdvanceInterstitial', { requestId: randomUUID(), expectedCycle: 3,
    expectedPausedAt: thirdCycleHold.pausedAt });
  await maintenance(3);
  await open(3);
  const currentWindow = (await db.doc(`sessions/${sessionId}/wolfAttackWindow/current`).get()).data();
  const laterDue = await command(gm, 'setWolfAttackWindow', { instanceId, requestId: randomUUID(),
    expectedRevision: currentWindow.revision, status: 'due' });
  assert.equal(laterDue.turn, 3);
  const currentPreparation = (await db.doc(`sessions/${sessionId}/wolfAttackPreparation/current`).get()).data();
  const transportsNeeded = Math.ceil(Math.max(0, 15 - returningWings.length) / 2);
  const secondComposition = [
    ...returningWings.map(() => 'wolf-fighter-wing'),
    ...Array(transportsNeeded).fill('wolf-assault-transport'),
  ];
  const compositionCapacity = returningWings.length + transportsNeeded * 2;
  assert.ok(compositionCapacity >= 15 && compositionCapacity <= 24);
  assert.ok(secondComposition.filter(shipId => shipId === 'wolf-fighter-wing').length >= returningWings.length);
  const preparation2 = await command(gm, 'stageWolfAttackPreparation', { instanceId, requestId: randomUUID(),
    expectedRevision: currentPreparation.revision, turn: 3, shipIds: secondComposition,
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: 'Authenticated surviving-Wing carryover proof' });
  const beforeSecondDeclaration = (await session.get()).data();
  const retainedBeforeDeclaration = beforeSecondDeclaration.retainedShuttles ?? {};
  const declaration2Request = { instanceId, requestId: randomUUID(), expectedRevision: preparation2.revision };
  const declaration2 = await command(gm, 'declareWolfAttack', declaration2Request);
  assert.equal(declaration2.turn, 3);
  const secondState = (await stateRef.get()).data();
  const afterSecondDeclaration = (await session.get()).data();
  assert.deepEqual(afterSecondDeclaration.retainedShuttles ?? {}, retainedBeforeDeclaration);
  for (const retainedId of Object.keys(retainedBeforeDeclaration)) {
    assert.deepEqual(afterSecondDeclaration.shuttleControl[retainedId],
      beforeSecondDeclaration.shuttleControl[retainedId], 'Retained craft custody must not change.');
    assert.ok(!afterSecondDeclaration.shuttleDockings.some(row => row.shuttleId === retainedId),
      'Declaring the next attack must not redock retained craft.');
    assert.ok(!secondState.parkedCraftIds.includes(retainedId));
    assert.ok(!secondState.parkedShuttleDockings.some(row => row.shuttleId === retainedId));
    assert.ok(!secondState.battleTableCraftActions.some(row => row.craftId === retainedId));
  }
  if (Object.keys(retainedBeforeDeclaration).length > 0) checks.retainedCustodyPreservedWithoutNewParkingOrCombat = true;
  assert.equal(secondState.attackNumber, 2);
  assert.equal(secondState.previousAttackId, priorAttackState.attackId);
  assert.deepEqual(secondState.carryover.sourceInstanceIds, returningWings);
  assert.deepEqual(secondState.carryover.rosterInstanceIds,
    returningWings.map((_, index) => `${index}:wolf-fighter-wing`));
  const archivedState = (await db.doc(`sessions/${sessionId}/wolfAttackState/current/archives/${priorAttackState.attackId}`).get()).data();
  assert.ok(archivedState, 'Declaring the second attack must archive the prior attack once.');
  for (const key of ['attackId', 'turn', 'revision', 'calculationReceipt', 'rangeReceipts', 'combatRoster']) {
    assert.deepEqual(archivedState[key], priorAttackState[key], `The archived prior ${key} must remain unchanged.`);
  }
  assert.deepEqual((await finalizationAuditRef.get()).data(), priorFinalizationAudit,
    'The immutable finalization receipt must remain unchanged after carryover is consumed.');
  const beforeReplay = { attackId: secondState.attackId, carryover: secondState.carryover,
    revision: secondState.revision, currentStep: secondState.currentStep };
  assert.deepEqual(await command(gm, 'declareWolfAttack', declaration2Request), declaration2);
  const replayedSecond = (await stateRef.get()).data();
  assert.deepEqual({ attackId: replayedSecond.attackId, carryover: replayedSecond.carryover,
    revision: replayedSecond.revision, currentStep: replayedSecond.currentStep }, beforeReplay);
  const secondWindow = (await db.doc(`sessions/${sessionId}/wolfAttackWindow/current`).get()).data();
  await denied(gm, 'setWolfAttackWindow', { instanceId, requestId: randomUUID(),
    expectedRevision: secondWindow.revision, status: 'due' });
  checks.facilitatorSelectedLaterWindowConsumesSurvivorsOnce = true;
  checks.destroyedWingsExcludedAndPriorReceiptImmutable = true;

  const specialKinds = [...new Set(boardingSpecials.map(choice => choice.kind))];
  await writeFile(evidencePath, JSON.stringify({ kind: 'normal-authenticated-local-emulator-http-pc08-boarding-carryover',
    sourceCommit: process.env.PC08_SOURCE_COMMIT, ordinaryRoster: 18, checks, actions, ranges,
    boarding, boardingSpecials, boardingChoiceObservations, launchPasses, specialKinds, finalBoardingGate,
    firstAttack: { attackNumber: priorAttackState.attackNumber, turn: priorAttackState.turn,
      survivingWingIds: returningWings, destroyedWingIds: destroyedWings,
      destroyedFleetShipIds: Object.entries(finalSession.shipDamage).filter(([, damage]) => damage.destroyed)
        .map(([shipId]) => shipId), retainedShuttleIds: Object.keys(finalSession.retainedShuttles ?? {}) },
    secondAttack: { attackNumber: secondState.attackNumber, turn: secondState.turn,
      previousAttackId: secondState.previousAttackId, consumedWingIds: secondState.carryover.sourceInstanceIds,
      newWingInstanceIds: secondState.carryover.rosterInstanceIds, compositionCapacity },
    fixtureChanges: ['disposable cycle deadlines only'], normalFacilitatorDecisions: [
      'role replacement for the disposable 18-player game', 'initial deferred timing window',
      'facilitator selected the later due window after complete finalization',
      ...(specialKinds.includes('commander-ruling') ? ['explicit Commander consequence ruling'] : []),
    ], preparedScene: false, productionGameplay: false, identitiesRetained: false,
    completedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('PC08 ordinary-authenticated boarding finalization and survivor carryover proof passed.');
} catch (error) {
  if (commanderPage) {
    await commanderPage.screenshot({ path: `${uiDirectory}/failure.png`, fullPage: true });
    await writeFile(`${uiDirectory}/failure-state.json`, JSON.stringify({ message: error.message, errors: browserErrors,
      body: await commanderPage.locator('body').innerText() }, null, 2) + '\n');
  }
  const state = (await stateRef.get()).data();
  const sessionState = (await session.get()).data();
  await capturePredicateInputs(state, sessionState);
  const rerolls = state?.boardingRerollChoices ?? {};
  const defenceChoices = state?.boardingDefenceChoices ?? {};
  await writeFile(`${evidencePath}.failure.json`, JSON.stringify({ sourceCommit: process.env.PC08_SOURCE_COMMIT,
    checks, actions, boardingChoiceObservations,
    message: error.message, currentStep: state?.currentStep, status: state?.status,
    revision: state?.revision, decisionSummary: state?.decisionSummary ? {
      boardingStatus: state.decisionSummary.boarding?.status,
      boardingTargets: state.decisionSummary.boarding?.targets?.map(({ targetShipId, status, boardingParties }) =>
        ({ targetShipId, status, boardingParties })) ?? [],
    } : undefined, calculationStep: state?.calculationReceipt?.step,
    boarding, boardingSpecials,
    boardingState: state ? {
      keys: Object.keys(state),
      commanderTarget: state.boardingCommanderChoice?.targetShipId,
      rerolls: Object.fromEntries(Object.entries(rerolls).map(([source, choice]) => [source, {
        targetShipId: choice?.targetShipId, dieIndexes: choice?.dieIndexes,
      }])),
      relocationHosts: Object.fromEntries(Object.entries(state.boardingRelocationChoices ?? {})
        .map(([craftId, choice]) => [craftId, { hostBefore: choice?.hostBefore, hostAfter: choice?.hostAfter }])),
      defenceChoices: Object.fromEntries(Object.entries(defenceChoices).map(([target, choice]) => [target, {
        status: choice?.status, securityTeams: choice?.securityTeams, availableBefore: choice?.availableBefore,
      }])),
      lockedTargets: Array.isArray(state.boardingLockedDefence)
        ? state.boardingLockedDefence.map(choice => ({ target: choice.target, rolls: choice.lockedRolls?.length })) : null,
      militiaTargets: Object.keys(state.boardingMilitiaChoices ?? {}),
      commanderRulingRequiredTarget: state.boardingCommanderRulingRequiredTarget,
      hasCommanderRuling: Boolean(state.boardingCommanderRuling),
      resolutionBlocker: state.resolutionBlocker?.message,
    } : undefined,
    shuttleState: sessionState ? {
      activeRoleIds: sessionState.activeRoleIds,
      activeVesselIds: sessionState.activeVesselIds,
      shuttleDockings: sessionState.shuttleDockings,
      retainedShuttleIds: Object.keys(sessionState.retainedShuttles ?? {}),
      smallShipStates: sessionState.smallShipStates,
    } : undefined,
  }, null, 2) + '\n');
  throw error;
} finally {
  const keepCleanupAlive = setInterval(() => {}, 1000);
  try { await browser?.close(); await f.cleanup(); await db.terminate(); }
  finally { clearInterval(keepCleanupAlive); }
}
