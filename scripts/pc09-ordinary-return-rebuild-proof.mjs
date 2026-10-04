import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const runtimeDirectory = '/tmp/pc09-owner-functions-74ab27b1';
const runtimeManifest = JSON.parse(await readFile(join(runtimeDirectory, 'PC09_SOURCE.json'), 'utf8'));
assert.equal(runtimeManifest.sourceCommit, process.env.PC09_OWNER_SOURCE_SHA,
  'The assigned Functions runtime must match the requested immutable source commit.');
assert.equal(runtimeManifest.libSha256, '6d5526483cf6b3e0c4a240aec686699b18fcd0d5d42f847ed224d9e5080bb956');
assert.equal(runtimeManifest.hashEncoding, 'sorted relative JS path NUL bytes NUL');
const runtimeRequire = createRequire(join(runtimeDirectory, 'package.json'));
const { populationForShip, shipRationSchedule } = runtimeRequire('./lib/shipPopulation.js');

const evidencePath = process.env.PC09_REBUILD_EVIDENCE_PATH;
assert.ok(evidencePath, 'An external evidence path is required.');
const uiDirectory = process.env.PC09_REBUILD_UI_DIR;
assert.ok(uiDirectory, 'A separate two-browser UI evidence directory is required.');
await mkdir(dirname(evidencePath), { recursive: true });
async function runtimeJavaScriptFiles(directory, prefix = '') {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await runtimeJavaScriptFiles(directory, relativePath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(relativePath);
  }
  return files;
}
const runtimeLib = join(runtimeDirectory, 'lib');
const runtimeFiles = (await runtimeJavaScriptFiles(runtimeLib)).sort();
const runtimeHash = createHash('sha256');
for (const relativePath of runtimeFiles) {
  runtimeHash.update(relativePath.split('/').join(sep));
  runtimeHash.update('\0');
  runtimeHash.update(await readFile(join(runtimeLib, relativePath)));
  runtimeHash.update('\0');
}
const verifiedRuntimeHash = runtimeHash.digest('hex');
assert.equal(runtimeFiles.length, 207);
assert.equal(verifiedRuntimeHash, runtimeManifest.libSha256,
  'The immutable Functions JavaScript tree hash must match its recorded manifest.');
let browser, commanderPage, pressContext, pressPage;
const browserErrors = [];
const f = await createPc07AuthenticatedSession('PC09 ordinary fighter loss, return and rebuild', 20, {
  keepAlive: true, expansion: 'capybara',
  browserRoleId: 'wing-commander', joinBrowserPlayer: normalBrowserCommander, joinPressPlayer: normalBrowserPress });
const { db, session, sessionId, gm, instanceId, call, ok } = f;
console.log(`Disposable normal session: ${sessionId}`);
const stateRef = db.doc(`sessions/${sessionId}/wolfAttackState/current`);
const checks = {};
const actions = [];
const boarding = [];
const boardingSpecials = [];
const boardingChoiceObservations = [];
const maintenanceRations = [];
const alertAcknowledgements = [];
const attackTurn = 2;
async function normalBrowserCommander(joinCode) {
  await mkdir(uiDirectory, { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  commanderPage = await context.newPage();
  commanderPage.on('pageerror', error => browserErrors.push(error.message));
  commanderPage.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await commanderPage.goto(process.env.PC07_LOCAL_GM_ORIGIN ?? 'http://127.0.0.1:5178');
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
async function normalBrowserPress(joinCode) {
  pressContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  pressPage = await pressContext.newPage();
  pressPage.on('pageerror', error => browserErrors.push(error.message));
  pressPage.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await pressPage.goto(process.env.PC07_LOCAL_GM_ORIGIN ?? 'http://127.0.0.1:5178');
  await pressPage.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  await pressPage.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
  await pressPage.getByRole('button', { name: 'Join a session', exact: true }).click();
  await pressPage.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true }).waitFor();
  for (const checkbox of await pressPage.getByRole('checkbox', { name: /^Acknowledge regulation/ }).all()) await checkbox.check();
  const acknowledge = pressPage.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
  await acknowledge.and(pressPage.locator(':enabled')).waitFor();
  await acknowledge.click();
  await pressPage.waitForFunction(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    return Boolean(useSessionStore.getState().me);
  });
  return pressPage.evaluate(async () => {
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
    sourceCommit: process.env.PC09_OWNER_SOURCE_SHA, state,
    session: Object.fromEntries(['phase', 'currentTurn', 'turnPhase', 'activeRoleIds', 'activeVesselIds',
      'shipDamage', 'shipSurvivors', 'shipResources', 'shuttleDockings', 'shuttleVisitLog',
      'shuttleControl', 'shuttleFuelled', 'retainedShuttles', 'smallShipStates', 'maintenanceCycles',
      'maliadesState', 'populationAlerts', 'unrestAlerts', 'vesselActionRevisions']
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
async function affordableRations(shipId) {
  const current = (await session.get()).data();
  const resources = current.shipResources?.[shipId];
  const population = populationForShip(shipId, current.shipSurvivors);
  assert.ok(resources && Number.isSafeInteger(population), `Current ${shipId} maintenance needs live inventory and population.`);
  const schedule = shipRationSchedule(shipId, population);
  const highestAffordable = (costs, available) => {
    const level = costs.reduce((chosen, cost, candidate) => cost <= available ? candidate : chosen, -1);
    assert.notEqual(level, -1, 'The printed zero-ration level must always be affordable.');
    return level;
  };
  const choice = {
    foodLevel: highestAffordable(schedule.food, resources.food),
    waterLevel: highestAffordable(schedule.water, resources.water),
  };
  maintenanceRations.push({ shipId, cycle: current.currentTurn, ...choice,
    availableFood: resources.food, availableWater: resources.water,
    populationBand: schedule.populationBand });
  return choice;
}
async function acknowledgeShipAlerts(shipId, cycle) {
  const dismissed = [];
  for (const [field, action] of [['unrestAlerts', 'dismissUnrestAlert'],
    ['populationAlerts', 'dismissPopulationAlert']]) {
    const current = (await session.get()).data();
    if (!current[field]?.[shipId]) continue;
    const request = { instanceId, shipId, requestId: randomUUID(),
      expectedRevision: current.vesselActionRevisions?.[shipId] ?? 0 };
    const result = await command(gm, action, request);
    assert.equal(result.dismissed, true, 'The facilitator must acknowledge the current ship alert.');
    const replay = await command(gm, action, request);
    assert.deepEqual(replay, result, 'An exact alert-dismissal retry returns the stored receipt without advancing its revision.');
    dismissed.push(action);
    alertAcknowledgements.push({ cycle, shipId, action, expectedRevision: request.expectedRevision,
      nextRevision: result.revision });
  }
  return dismissed;
}
let lastMaintenanceStartedAt = 0;
const maintenanceIntervalMs = 2050;
async function maintenance(cycle) {
  let revision = (await session.get()).get('maintenanceCycles')?.aegis?.revision ?? 0;
  let bay = 0;
  for (const action of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays', 'end']) {
    await acknowledgeShipAlerts('aegis', cycle);
    const damage = (await session.get()).get('shipDamage')?.aegis;
    const materials = (await session.get()).get('shipResources')?.aegis?.materials ?? 0;
    if (action === 'reactor' && damage?.damagedSystemIds?.length &&
        materials >= damage.damagedSystemIds.length * 4 + 1) {
      await command(gm, 'repairAllShipDamage', { instanceId, shipId: 'aegis', requestId: randomUUID(),
        expectedRevision: (await session.get()).get('vesselActionRevisions')?.aegis ?? 0 });
    }
    if (Date.now() - lastMaintenanceStartedAt < maintenanceIntervalMs)
      await new Promise(resolve => setTimeout(resolve, maintenanceIntervalMs - (Date.now() - lastMaintenanceStartedAt)));
    lastMaintenanceStartedAt = Date.now();
    const rationChoice = action === 'rations' ? await affordableRations('aegis') : {};
    const reactorCandidates = cycle === 4 ? ['construction-bay'] :
      ['command-and-control', 'missile-launchers', 'point-defence-lasers', 'fighter-bay-alpha', 'fighter-bay-bravo'];
    const reactorDamage = (await session.get()).get('shipDamage')?.aegis;
    const reactorConsoles = reactorCandidates.filter(consoleId => !reactorDamage?.damagedSystemIds?.includes(consoleId));
    const result = await command(gm, 'runMaintenance', { instanceId, shipId: 'aegis', action, expectedRevision: revision,
      requestId: randomUUID(), ...rationChoice,
      ...(action === 'reactor' ? { consoles: reactorConsoles } : {}),
      // Shuttle refuelling is part of the first transit proof only. Later
      // cycles preserve live fuel and do not block the independent fighter
      // rebuild proof on an optional shuttle choice.
      ...(action === 'bays' ? { refuels: bay++ === 0
        ? (cycle >= 3 ? {} : { 'shuttle-bay-zeta': 'starlight' })
        : (cycle >= 3 ? {} : { 'shuttle-bay-omega': 'pallas' }) } : {}) });
    revision = result.cycle.revision;
  }
  assert.equal((await session.get()).get('maintenanceCycles').aegis.turn, cycle);
}
async function launchHostMaintenance(cycle) {
  for (const shipId of ['dione', 'refinery-124']) {
    const actor = f.byRole(`${shipId}-captain`);
    let revision = (await session.get()).get('maintenanceCycles')?.[shipId]?.revision ?? 0;
    for (const action of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'end']) {
      await acknowledgeShipAlerts(shipId, cycle);
      const rationChoice = action === 'rations' ? await affordableRations(shipId) : {};
      const result = await command(actor, 'runMaintenance', { shipId, action, expectedRevision: revision,
        requestId: randomUUID(), ...rationChoice,
        ...(action === 'reactor' ? { consoles: [] } : {}),
        ...(action === 'bays' ? { refuels: {} } : {}) });
      revision = result.cycle.revision;
    }
    assert.equal((await session.get()).get('maintenanceCycles')[shipId].turn, cycle);
  }
}
async function gorgoneionMaintenance(captain) {
  const current = (await session.get()).get('smallShipStates')?.gorgoneion?.cycle;
  let revision = current?.revision ?? 0;
  for (const action of ['begin', 'rations', 'unrest', 'riot', 'reactor', 'end']) {
    const result = await command(captain, 'runSmallShipMaintenance', {
      smallShipId: 'gorgoneion', action, requestId: randomUUID(), expectedRevision: revision,
      ...(action === 'rations' ? { foodLevel: 0, waterLevel: 0 } : {}),
      ...(action === 'reactor' ? { consoles: ['force-field-projector'] } : {}),
    });
    revision = result.cycle.revision;
  }
}
async function settleBoarding(turn, { commander, captain, eo }) {
  const actors = [...new Set([commander, eo, captain, f.byRole('rosal-militia-leader'), gm].filter(Boolean))];
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const state = (await stateRef.get()).data();
    if (state?.status === 'resolved' && state.currentStep === 'resolved') return state;
    let specialActor, specialView;
    for (const actor of actors) {
      const response = await call(actor, 'getWolfBoardingSpecialChoice', {
        sessionId, ...(actor === gm ? { instanceId } : {}),
      });
      if (response.status === 200 && response.result?.type === 'wolf-boarding-special-choice-view') {
        specialActor = actor;
        specialView = response.result;
        break;
      }
    }
    if (specialView) {
      const choice = specialView.choice;
      let commandChoice;
      if (choice.kind === 'commander') commandChoice = { kind: 'commander',
        targetShipId: choice.targets.some(target => target.targetShipId === 'aegis') ? 'aegis' : choice.targets[0]?.targetShipId ?? null };
      else if (choice.kind === 'relocation') commandChoice = { kind: 'relocation', craftId: choice.craftId,
        targetShipId: choice.fuelled ? choice.legalHostIds.find(host => host !== choice.currentHostId) ?? null : null,
        expectedControlRevision: choice.controlRevision };
      else if (choice.kind === 'militia') commandChoice = { kind: 'militia', targetShipId: choice.targetShipId,
        militiaDoubleTeams: choice.doubleDiceAvailable, militiaFrontLineDice: choice.maxFrontLineDice > 0 ? 1 : 0 };
      else if (choice.kind === 'reroll') {
        const spent = choice.alreadyRerolled.map(index => typeof index === 'number' ? index : index.dieIndex);
        commandChoice = { kind: 'reroll', source: choice.source, targetShipId: choice.targetShipId,
          dieIndexes: choice.dice.filter(die => !spent.includes(die.dieIndex)).slice(0, choice.maxRerolls).map(die => die.dieIndex) };
      } else commandChoice = { kind: 'commander-ruling', targetShipId: choice.targetShipId,
        rulingText: 'Contain the unresolved Commander consequence for this disposable proof attack.' };
      const request = { requestId: randomUUID(), expectedTurn: turn, expectedRevision: specialView.revision,
        choice: commandChoice, ...(choice.kind === 'commander-ruling' ? { instanceId } : {}) };
      const result = await command(specialActor, 'commitWolfBoardingSpecialChoice', request);
      assert.deepEqual(await command(specialActor, 'commitWolfBoardingSpecialChoice', request), result);
      boardingSpecials.push({ attackTurn: turn, kind: choice.kind });
      continue;
    }
    const pending = state.decisionSummary?.boarding?.targets?.find(choice => choice.status === 'pending' &&
      !state.boardingDefenceChoices?.[choice.targetShipId]);
    if (!pending) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
    let crew, view;
    for (const actor of f.players.filter(candidate => pending.actors?.some(holder => holder.uid === candidate.localId))) {
      const response = await call(actor, 'getWolfBoardingDefenceChoice', { sessionId });
      if (response.status === 200 && response.result?.choiceStatus === 'pending' &&
          response.result.targetShipId === pending.targetShipId) { crew = actor; view = response.result; break; }
    }
    assert.ok(crew && view, 'A currently assigned crew member must resolve each pending boarding defense.');
    const request = { requestId: randomUUID(), expectedTurn: turn, expectedRevision: view.revision,
      targetShipId: view.targetShipId, securityTeams: view.availableSecurityTeams };
    const result = await command(crew, 'commitWolfBoardingDefenceChoice', request);
    assert.deepEqual(await command(crew, 'commitWolfBoardingDefenceChoice', request), result);
    boarding.push({ attackTurn: turn, shipId: view.targetShipId, securityTeams: request.securityTeams });
  }
  throw new Error(`Authenticated boarding actions did not finalize attack cycle ${turn}.`);
}
async function resolveFollowupAttack(turn, { commander, captain, wing, eo }) {
  const force = await command(captain, 'getWolfForceFieldChoice', {});
  assert.equal(force.type, 'wolf-force-field-choice-view');
  assert.equal(force.choiceStatus, 'pending', `The current Gorgoneion Captain must have an ordinary Force Field choice in cycle ${turn}.`);
  assert.ok(force.targetShipIds.includes('aegis'), 'The active target ring must include AEGIS.');
  const forceRequest = { requestId: randomUUID(), expectedTurn: turn, expectedRevision: force.revision,
    targetShipId: 'aegis' };
  const forceResult = await command(captain, 'commitWolfForceFieldChoice', forceRequest);
  assert.deepEqual(await command(captain, 'commitWolfForceFieldChoice', forceRequest), forceResult);
  await until(s => s?.calculationReceipt?.step === 'targeting' && s?.forceFieldChoice?.status === 'selected', 'second targeting');
  const targeting = await command(commander, 'getWolfCommanderTargeting', {});
  await command(commander, 'finishWolfCommanderTargetingRerolls', {
    requestId: randomUUID(), expectedTurn: turn, expectedRevision: targeting.revision,
  });
  const launchProof = [];
  for (const [sourceId, actor, getter, query] of [
    ['fighter-wing-alpha', wing, 'getAegisFighterWingLaunch', { wingId: 'fighter-wing-alpha' }],
    ['fighter-wing-bravo', wing, 'getAegisFighterWingLaunch', { wingId: 'fighter-wing-bravo' }],
    ['pdf-escort-fighter-wing', f.byRole('refinery-124-pdf-colonel'), 'getPdfEscortWingLaunch', {}],
    ['maliades', f.byRole('dione-engineer'), 'getDioneMaliadesLaunch', {}],
  ]) {
    const view = await command(actor, getter, query);
    if (sourceId === 'fighter-wing-alpha') {
      assert.equal(view.eligible, true, 'Alpha must still be launchable in the later cycle after its durable loss.');
      assert.equal(view.fighters, 3, 'A later launch reads the persistent three-fighter count.');
      const request = { wingId: sourceId, requestId: randomUUID(), expectedTurn: view.turn,
        expectedRevision: view.revision, expectedWingRevision: view.wingRevision };
      const launched = await command(actor, 'launchAegisFighterWing', request);
      launchProof.push({ sourceId, launched: true, fighters: launched.fighters });
    } else if (view.eligible) {
      const request = { sourceId, requestId: randomUUID(), expectedTurn: view.turn,
        expectedRevision: view.revision, ...(sourceId === 'maliades' ? {} : { expectedWingRevision: view.wingRevision }) };
      const passed = await command(actor, 'passWolfFighterLaunchChoice', request);
      launchProof.push({ sourceId, eligible: true, choiceStatus: passed.choiceStatus });
    } else launchProof.push({ sourceId, eligible: false, reason: view.reason });
  }
  const countAfterLaunch = (await command(eo, 'getCurrentMemberSession', {})).session.fighterWingCounts['fighter-wing-alpha'].count;
  assert.equal(countAfterLaunch, 3, 'A second attack launch cannot restore an already lost fighter.');
  checks.laterOrdinaryLaunchUsesDurableThreeFighterCount = true;
  const cnc = await command(eo, 'getAegisCommandAndControl', {});
  assert.equal(cnc.eligible, true);
  await command(eo, 'passAegisCommandAndControl', { requestId: randomUUID(), expectedTurn: turn,
    expectedRevision: cnc.revision });
  const laterRanges = [];
  for (const range of ['long-range', 'medium-range', 'short-range']) {
    await until(state => state?.currentStep === range, `cycle ${turn} ${range}`);
    if (range !== 'long-range') {
      const fighterView = await command(wing, 'getWolfFighterRangeActionChoice', {
        sourceId: 'fighter-wing-alpha', range,
      });
      const pass = { sourceId: 'fighter-wing-alpha', range, requestId: randomUUID(), expectedTurn: turn,
        expectedRevision: fighterView.revision,
        ...(range === 'medium-range' ? { actions: [] } : { fighterIndexes: [] }) };
      await command(wing, 'commitWolfFighterRangeActionChoice', pass);
    }
    const view = await command(eo, 'getWolfRangeActionChoice', {});
    const actionIds = range === 'long-range' ? view.eligibleActions.slice(0, 1).map(action => action.actionId) : [];
    const request = { requestId: randomUUID(), expectedTurn: turn, expectedRevision: view.revision, range, actionIds };
    const locked = await command(eo, 'commitWolfRangeActionChoice', request);
    if (locked.choiceStatus === 'targets-required') {
      const targets = await command(eo, 'getWolfRangeActionChoice', {});
      const preferred = targets.contacts.filter(contact => contact.available &&
        Number(contact.contactId.slice('contact-'.length)) >= 9).map(contact => contact.contactId);
      const fallback = targets.contacts.filter(contact => contact.available).map(contact => contact.contactId);
      const choices = preferred.length ? preferred : fallback;
      const assignments = targets.hitSlots.map(slot => ({ actionId: slot.actionId, contactIds: choices.slice(0, slot.count) }));
      await command(eo, 'assignWolfRangeTargets', { requestId: randomUUID(), expectedTurn: turn,
        expectedRevision: targets.revision, range, assignments });
    }
    const committed = (await stateRef.get()).data().rangeReceipts?.find(receipt => receipt.range === range);
    laterRanges.push({ range, actionIds, receiptRevision: committed?.revision ?? null });
  }
  const final = await settleBoarding(turn, { commander, captain, eo });
  return { final, launchProof, ranges: laterRanges };
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
  const ace = f.byRole('refinery-124-engineer');
  await replace(captain, 'gorgoneion-captain');
  await replace(commander, 'wolf-commander');
  await replace(ace, 'pdf-fighter-ace');
  await command(gm, 'setWolfAttackWindow', { instanceId, requestId: randomUUID(), expectedRevision: 0, status: 'deferred' });
  await command(gm, 'advanceTurn', { instanceId, requestId: randomUUID(), expectedTurn: 1,
    overridePhaseTimer: true });
  const held = (await session.get()).get('turnPhase').timerPause;
  await command(f.byRole('executive-officer'), 'clearTurnAdvanceInterstitial', { requestId: randomUUID(),
    expectedCycle: 2, expectedPausedAt: held.pausedAt });
  await maintenance(2);
  await launchHostMaintenance(2);
  await gorgoneionMaintenance(captain);
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
  const force = await command(captain, 'getWolfForceFieldChoice', {});
  assert.equal(force.type, 'wolf-force-field-choice-view');
  assert.equal(force.choiceStatus, 'pending');
  assert.ok(force.targetShipIds.includes('aegis'), 'The active target ring must include AEGIS.');
  const protectedRequest = { requestId: randomUUID(), expectedTurn: 2, expectedRevision: force.revision, targetShipId: 'aegis' };
  const protectedResult = await command(captain, 'commitWolfForceFieldChoice', protectedRequest);
  assert.deepEqual(await command(captain, 'commitWolfForceFieldChoice', protectedRequest), protectedResult);
  checks.currentGorgoneionCaptainForceFieldChoiceAndRetry = true;
  await until(s => s?.calculationReceipt?.step === 'targeting' && s?.forceFieldChoice?.status === 'selected', 'server targeting');
  const targeting = await command(commander, 'getWolfCommanderTargeting', {});
  await denied(wing, 'getWolfCommanderTargeting', {});
  await command(commander, 'finishWolfCommanderTargetingRerolls', {
    requestId: randomUUID(), expectedTurn: 2, expectedRevision: targeting.revision,
  });
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
      assert.notEqual(sourceId, 'fighter-wing-alpha',
        'The current AEGIS Alpha must be eligible after ordinary maintenance before we can prove its later launch.');
      launchPasses.push({ sourceId, eligible: false, reason: view.reason, choiceStatus: view.choiceStatus });
      continue;
    }
    const request = { sourceId, requestId: randomUUID(), expectedTurn: view.turn,
      expectedRevision: view.revision,
      ...(sourceId === 'maliades' ? {} : { expectedWingRevision: view.wingRevision }) };
    if (sourceId === 'fighter-wing-alpha') {
      assert.equal(view.eligible, true, 'The current AEGIS Alpha must be available after the charged maintenance bay.');
      const launchRequest = { wingId: 'fighter-wing-alpha', requestId: request.requestId,
        expectedTurn: view.turn, expectedRevision: view.revision, expectedWingRevision: view.wingRevision };
      const result = await command(actor, 'launchAegisFighterWing', launchRequest);
      const replay = await command(actor, 'launchAegisFighterWing', launchRequest);
      assert.equal(replay.status, 'replayed');
      assert.deepEqual({ ...replay, status: 'committed' }, result);
      launchPasses.push({ sourceId, launched: true, fighters: result.fighters, revision: result.revision });
      continue;
    }
    const result = await command(actor, 'passWolfFighterLaunchChoice', request);
    const replay = await command(actor, 'passWolfFighterLaunchChoice', request);
    assert.equal(replay.status, 'replayed');
    assert.deepEqual({ ...replay, status: 'committed' }, result);
    launchPasses.push({ sourceId, eligible: true, choiceStatus: result.choiceStatus, revision: result.revision });
  }
  checks.alphaLaunchedAndEveryOtherEligibleSourceExplicitlyPassed = true;
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
    if (range === 'short-range' && attackTurn === 2) {
      const currentAttack = (await stateRef.get()).data();
      const permission = await command(wing, 'grantPdfFighterAcePermission', {
        attackId: currentAttack.attackId, requestId: randomUUID(), expectedRevision: currentAttack.revision,
        sourceId: 'fighter-wing-alpha', fighterIndex: 0,
      });
      const aceView = await command(ace, 'getPdfFighterAceCombatView', {});
      assert.equal(aceView.status, 'ready');
      assert.equal(aceView.attackId, currentAttack.attackId);
      assert.equal(aceView.range, 'short');
      const targets = aceView.targets.filter(target => target.available).slice(0, 2);
      assert.equal(targets.length, 2, 'The ordinary current attack must present two live Short contacts.');
      const request = { attackId: currentAttack.attackId, requestId: randomUUID(), expectedRevision: aceView.revision,
        targetId: targets[0].targetId, extraTargetId: targets[1].targetId, range: 'short',
        sourceId: 'fighter-wing-alpha', fighterIndex: aceView.fighterSources[0].fighterIndex,
        permissionRequestId: permission.requestId, permissionRevision: permission.permissionRevision };
      const aceResult = await command(ace, 'commitPdfFighterAceCombat', request);
      const aceReplay = await command(ace, 'commitPdfFighterAceCombat', request);
      assert.equal(aceResult.fighterDestroyed, true);
      assert.equal(aceResult.escaped, true);
      assert.equal(aceReplay.status, 'replayed');
      assert.deepEqual({ ...aceReplay, status: 'committed' }, aceResult);
      const afterLoss = await command(eo, 'getCurrentMemberSession', {});
      assert.equal(afterLoss.session.fighterWingCounts['fighter-wing-alpha'].count, 3);
      checks.attackBoundShortAceLossIsDurableAndMemberVisible = true;
    }
    if (range !== 'long-range') {
      const alphaRange = await command(wing, 'getWolfFighterRangeActionChoice', {
        sourceId: 'fighter-wing-alpha', range,
      });
      const alphaPass = { sourceId: 'fighter-wing-alpha', range, requestId: randomUUID(),
        expectedTurn: alphaRange.turn, expectedRevision: alphaRange.revision,
        ...(range === 'medium-range' ? { actions: [] } : { fighterIndexes: [] }) };
      await command(wing, 'commitWolfFighterRangeActionChoice', alphaPass);
    }
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
      const transports = targets.contacts.filter(contact => contact.available &&
        Number(contact.contactId.slice('contact-'.length)) >= 11).map(contact => contact.contactId);
      const assignments = targets.hitSlots.map(slot => ({ actionId: slot.actionId,
        contactIds: (transports.length > 0 ? transports : targets.contacts.filter(contact => contact.available)
          .map(contact => contact.contactId)).slice(0, slot.count) }));
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
  await launchHostMaintenance(3);
  await gorgoneionMaintenance(captain);
  await open(3);
  const currentWindow = (await db.doc(`sessions/${sessionId}/wolfAttackWindow/current`).get()).data();
  const laterDue = await command(gm, 'setWolfAttackWindow', { instanceId, requestId: randomUUID(),
    expectedRevision: currentWindow.revision, status: 'due' });
  assert.equal(laterDue.turn, 3);
  const currentPreparation = (await db.doc(`sessions/${sessionId}/wolfAttackPreparation/current`).get()).data();
  const extraWings = Math.max(0, 15 - returningWings.length - 6);
  const secondComposition = [
    ...returningWings.map(() => 'wolf-fighter-wing'),
    'wolf-battlestation',
    ...Array(extraWings).fill('wolf-fighter-wing'),
  ];
  const compositionCapacity = returningWings.length + 6 + extraWings;
  assert.ok(compositionCapacity >= 15 && compositionCapacity <= 24);
  assert.ok(secondComposition.filter(shipId => shipId === 'wolf-fighter-wing').length >= returningWings.length);
  const preparation2 = await command(gm, 'stageWolfAttackPreparation', { instanceId, requestId: randomUUID(),
    expectedRevision: currentPreparation.revision, turn: 3, shipIds: secondComposition,
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: 'Authenticated survivor carryover with a legal Battlestation' });
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

  const secondAttackResult = await resolveFollowupAttack(3, { commander, captain, wing, eo });
  assert.equal(secondAttackResult.final.status, 'resolved');
  const secondFinalizationAudit = (await db.doc(`sessions/${sessionId}/wolfAttackState/current/audit/wolf-finalized-3`).get()).data();
  assert.equal(secondFinalizationAudit?.type, 'wolf-attack-finalization');
  const battlestationReturns = secondFinalizationAudit.receipt.survivingWolfShips?.filter(ship =>
    ship.shipId === 'wolf-battlestation').map(ship => ship.instanceId) ?? [];
  assert.ok(battlestationReturns.length > 0,
    'The legal Battlestation included in the next ordinary composition must appear in its authenticated final return receipt.');
  const memberAfterSecondAttack = await command(eo, 'getCurrentMemberSession', {});
  assert.equal(memberAfterSecondAttack.session.fighterWingCounts['fighter-wing-alpha'].count, 3);
  checks.nextAttackConsumesReturnManifestAndReturnsBattlestation = true;

  await command(gm, 'advanceTurn', { instanceId, requestId: randomUUID(), expectedTurn: 3, overridePhaseTimer: true });
  const fourthCycleHold = (await session.get()).get('turnPhase').timerPause;
  await command(eo, 'clearTurnAdvanceInterstitial', { requestId: randomUUID(), expectedCycle: 4,
    expectedPausedAt: fourthCycleHold.pausedAt });
  await maintenance(4);
  const cycle4Session = (await session.get()).data();
  assert.equal(cycle4Session.currentTurn, 4);
  assert.ok(cycle4Session.maintenanceCycles.aegis.charges.includes('construction-bay'),
    'The live cycle-4 Construction Bay charge is required before the normal paid fighter build.');
  assert.equal(cycle4Session.fighterWingCounts['fighter-wing-alpha'].count, 3);
  assert.ok(!cycle4Session.shipDamage.aegis?.destroyed);
  assert.ok(!cycle4Session.shipDamage.aegis?.damagedSystemIds?.includes('construction-bay'));
  assert.ok(cycle4Session.shipResources.aegis.materials >= 1);
  checks.ordinaryFourthCycleConstructionBayReadinessAndPaidMaterial = true;

  const wingIdentity = await commanderPage.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    const store = useSessionStore.getState();
    return { uid: auth().currentUser?.uid, memberUid: store.me?.uid, sessionId: store.session?.id,
      assignedRoleId: store.me?.assignedRoleId, activeConsoleRoleId: store.me?.activeConsoleRoleId,
      connection: store.connection, freshness: store.sessionSnapshotFreshness };
  });
  assert.equal(wingIdentity.uid, wing.localId);
  assert.equal(wingIdentity.memberUid, wing.localId);
  assert.equal(wingIdentity.sessionId, sessionId);
  assert.equal(wingIdentity.assignedRoleId, 'wing-commander');
  assert.equal(wingIdentity.activeConsoleRoleId, 'wing-commander');
  assert.equal(wingIdentity.connection, 'live');
  assert.equal(wingIdentity.freshness, 'server');
  const pressIdentity = await pressPage.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    const store = useSessionStore.getState();
    return { uid: auth().currentUser?.uid, memberUid: store.me?.uid, sessionId: store.session?.id,
      activeConsoleRoleId: store.me?.activeConsoleRoleId, connection: store.connection };
  });
  assert.equal(pressIdentity.uid, f.press.localId);
  assert.equal(pressIdentity.memberUid, f.press.localId);
  assert.equal(pressIdentity.sessionId, sessionId);
  assert.equal(pressIdentity.activeConsoleRoleId, 'press-officer');
  checks.twoAuthenticatedBrowserContextsAndCurrentRoleAuthority = true;

  await commanderPage.goto(`${process.env.PC07_LOCAL_GM_ORIGIN ?? 'http://127.0.0.1:5178'}/#/console`);
  await commanderPage.getByRole('heading', { name: 'Stations and consoles', exact: true }).waitFor();
  await commanderPage.getByRole('link', { name: 'AEGIS // Wing Commander // HELD BY YOU', exact: true }).click();
  await commanderPage.getByRole('button', { name: /Build 1 fighter \/\/ 1 material/i }).waitFor({ state: 'visible', timeout: 30_000 });
  const uiMemberBefore = await command(wing, 'getCurrentMemberSession', {});
  assert.equal(uiMemberBefore.session.fighterWingCounts['fighter-wing-alpha'].count, 3);
  assert.equal(uiMemberBefore.session.shipResources.aegis.materials, cycle4Session.shipResources.aegis.materials);
  const layouts = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 844, height: 390 }]) {
    await commanderPage.setViewportSize(viewport);
    await commanderPage.waitForTimeout(150);
    const geometry = await commanderPage.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
        clientHeight: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight },
      bodyFont: getComputedStyle(document.body).fontFamily,
      consoleFont: getComputedStyle(document.querySelector('.aegis-console-workspace') ?? document.body).fontFamily,
      fontStatus: document.fonts.status,
      externalFonts: [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.href)
        .filter(href => new URL(href, location.href).origin !== location.origin),
    }));
    assert.ok(geometry.document.scrollWidth <= geometry.document.clientWidth,
      `Wing Commander console must fit ${viewport.width}x${viewport.height}: ${JSON.stringify(geometry.document)}`);
    assert.ok(/monospace/i.test(geometry.consoleFont), `The current console must use the system monospace stack: ${geometry.consoleFont}`);
    assert.deepEqual(geometry.externalFonts, [], 'The local proof page must not load remote stylesheet fonts.');
    layouts.push(geometry);
    await commanderPage.screenshot({ path: `${uiDirectory}/wing-commander-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  checks.wingCommanderResponsiveGeometrySystemMonoAndNoRemoteFonts = true;
  const button = commanderPage.getByRole('button', { name: /Build 1 fighter \/\/ 1 material/i });
  assert.equal(await button.isEnabled(), true, 'A charged, intact Construction Bay and one material must enable the actual build control.');
  let buildRequest;
  const captureBuildRequest = request => {
    if (new URL(request.url()).pathname.endsWith('/buildFighter')) buildRequest = request.postDataJSON()?.data;
  };
  commanderPage.on('request', captureBuildRequest);
  await button.click();
  const buildDeadline = Date.now() + 30_000;
  let memberAfterBuild;
  while (Date.now() < buildDeadline) {
    memberAfterBuild = await f.ok(await f.call(wing, 'getCurrentMemberSession', { sessionId }), 'post-build member read');
    if (memberAfterBuild.session.fighterWingCounts['fighter-wing-alpha']?.count === 4) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  commanderPage.off('request', captureBuildRequest);
  assert.ok(buildRequest, 'The actual Wing Commander UI must send a normal authenticated buildFighter request.');
  assert.equal(memberAfterBuild.session.fighterWingCounts['fighter-wing-alpha'].count, 4);
  assert.equal(memberAfterBuild.session.shipResources.aegis.materials, cycle4Session.shipResources.aegis.materials - 1);
  const replay = await command(wing, 'buildFighter', buildRequest);
  assert.equal(replay.status, 'replayed', 'The exact browser request must resolve to its stored server receipt.');
  const memberAfterRetry = await command(wing, 'getCurrentMemberSession', {});
  assert.equal(memberAfterRetry.session.fighterWingCounts['fighter-wing-alpha'].count, 4);
  assert.equal(memberAfterRetry.session.shipResources.aegis.materials, cycle4Session.shipResources.aegis.materials - 1,
    'The exact build retry cannot spend a second material or add a second fighter.');
  await commanderPage.waitForFunction(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    return useSessionStore.getState().session?.fighterWingCounts?.['fighter-wing-alpha']?.count === 4;
  }, { timeout: 30_000 });
  assert.deepEqual(browserErrors, []);
  checks.actualWingCommanderBuildAndExactHttpRetrySpendOneMaterialOnce = true;

  const specialKinds = [...new Set(boardingSpecials.map(choice => choice.kind))];
    const source = { commit: runtimeManifest.sourceCommit,
    runtimeDirectory, libSha256: verifiedRuntimeHash, compiledFiles: runtimeFiles.length };
    await writeFile(evidencePath, JSON.stringify({ kind: 'PC09 ordinary authenticated fighter loss return and rebuild',
    source, ordinaryRoster: 20, checks, actions, firstAttackRanges: ranges,
    secondAttack: secondAttackResult, boarding, boardingSpecials, boardingChoiceObservations, launchPasses, specialKinds, finalBoardingGate,
    maintenanceRations, alertAcknowledgements,
    firstAttack: { attackNumber: priorAttackState.attackNumber, turn: priorAttackState.turn,
      survivingWingIds: returningWings, destroyedWingIds: destroyedWings,
      destroyedFleetShipIds: Object.entries(finalSession.shipDamage).filter(([, damage]) => damage.destroyed)
        .map(([shipId]) => shipId), retainedShuttleIds: Object.keys(finalSession.retainedShuttles ?? {}) },
    followupDeclaration: { attackNumber: secondState.attackNumber, turn: secondState.turn,
      previousAttackId: secondState.previousAttackId, consumedWingIds: secondState.carryover.sourceInstanceIds,
      newWingInstanceIds: secondState.carryover.rosterInstanceIds, compositionCapacity,
      composition: secondComposition, survivingBattlestationInstanceIds: battlestationReturns },
    browserEvidence: { contexts: 2, wingIdentity, pressIdentity, layouts,
      initialAlphaCount: 4, afterLossAlphaCount: 3, secondLaunchAlphaCount: 3,
      afterBuildAlphaCount: 4, materialsBeforeBuild: cycle4Session.shipResources.aegis.materials,
      materialsAfterBuild: memberAfterRetry.session.shipResources.aegis.materials,
      exactUiBuildRequest: buildRequest, buildReplayStatus: replay.status },
    fixtureChanges: ['disposable cycle deadlines only'], normalFacilitatorDecisions: [
      'role replacement for the disposable 20-player game', 'initial deferred timing window',
      'facilitator selected the later due window after complete finalization',
      'ordinary composition selected ten Fighter Wings and five Assault Transports for attack one',
      'ordinary next-cycle composition consumed every authenticated return and included a Battlestation',
      'Wing Commander permitted a Fighter Ace Short action against two current opaque contacts',
      ...(specialKinds.includes('commander-ruling') ? ['explicit Commander consequence ruling'] : []),
    ], preparedScene: false, productionGameplay: false, identitiesRetained: false,
    browserErrors, heartbeatFailures: f.heartbeatFailures, sessionCleanedUp: true,
    completedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('PC09 ordinary authenticated AEGIS fighter loss, return, and paid rebuild proof passed.');
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
  await writeFile(`${evidencePath}.failure.json`, JSON.stringify({ sourceCommit: process.env.PC09_OWNER_SOURCE_SHA,
    checks, actions, boardingChoiceObservations, maintenanceRations, alertAcknowledgements,
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
