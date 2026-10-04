import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidencePath = process.env.PC08_ATTACK_EVIDENCE_PATH;
const uiUrl = process.env.PC08_UI_URL;
assert.ok(evidencePath && uiUrl, 'External evidence and the isolated app URL are required.');
await mkdir(dirname(evidencePath), { recursive: true });
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { MAINTENANCE_ORDERS } = require('../functions/lib/maintenanceOrder.js');
const { SHIP_DAMAGE_DECKS } = require('../functions/lib/shipDamage.js');
const { CALLABLE_RATE_LIMIT_POLICIES } = require('../functions/lib/callableRateLimit.js');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim();
const maintenanceIntervalMs = Math.ceil(CALLABLE_RATE_LIMIT_POLICIES.runMaintenance.windowMs /
  CALLABLE_RATE_LIMIT_POLICIES.runMaintenance.maxRequests) + 50;
let lastMaintenanceStartedAt = 0;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const browserErrors = [], checks = {}, actions = [], ranges = [], boarding = [], observations = [];
const attackTurn = 2;
let sessionStoreModuleUrl = '/src/store/useSessionStore.ts';
let firestoreModuleUrl = '/src/lib/firestore.ts';
page.on('request', request => {
  const url = new URL(request.url());
  if (url.pathname === '/src/store/useSessionStore.ts' &&
      (url.searchParams.has('t') || !new URL(sessionStoreModuleUrl, uiUrl).searchParams.has('t'))) {
    sessionStoreModuleUrl = url.href;
  }
  if (url.pathname === '/src/lib/firestore.ts' &&
      (url.searchParams.has('t') || !new URL(firestoreModuleUrl, uiUrl).searchParams.has('t'))) {
    firestoreModuleUrl = url.href;
  }
});
page.on('pageerror', error => browserErrors.push(error.message));
let f;
async function snapshotIdentity() {
  return page.evaluate(async storeModuleUrl => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(storeModuleUrl);
    const s = useSessionStore.getState();
    return { uid: auth().currentUser?.uid, memberUid: s.me?.uid, sessionId: s.session?.id,
      roleId: s.me?.assignedRoleId, connection: s.connection, freshness: s.sessionSnapshotFreshness };
  }, sessionStoreModuleUrl);
}
async function browserUntil(label, ready) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    last = await snapshotIdentity();
    if (ready(last)) return last;
    await delay(250);
  }
  throw new Error(`${label}: ${JSON.stringify(last)}`);
}
async function joinThroughUi(code) {
  await page.goto(uiUrl);
  await page.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(code);
  await page.getByRole('button', { name: 'Join a session', exact: true }).click();
  const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
  await waiver.waitFor();
  const acknowledgements = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
  await acknowledgements.first().waitFor();
  for (const checkbox of await acknowledgements.all()) await checkbox.check();
  await waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true })
    .and(page.locator(':enabled')).click();
  await browserUntil('ordinary UI join', s => Boolean(s.uid && s.uid === s.memberUid));
  return page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
  });
}
async function command(actor, name, data = {}) {
  if (name === 'runMaintenance') {
    await delay(Math.max(0, maintenanceIntervalMs - (Date.now() - lastMaintenanceStartedAt)));
    lastMaintenanceStartedAt = Date.now();
  }
  const result = f.ok(await f.call(actor, name, { sessionId: f.sessionId, ...data }), name);
  assert.notEqual(result?.status, 'stale', `${name} returned stale authority.`);
  actions.push({ name, status: result?.status ?? 'committed', revision: result?.revision ?? null });
  console.log(`${name}: ${result?.status ?? 'committed'}${result?.revision ? ` rev ${result.revision}` : ''}`);
  return result;
}
async function attackState() { return (await f.db.doc(`sessions/${f.sessionId}/wolfAttackState/current`).get()).data(); }
async function until(label, ready, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await attackState();
    if (ready(last)) return last;
    await delay(250);
  }
  throw new Error(`${label} did not become ready (step ${last?.currentStep}, revision ${last?.revision}).`);
}
async function replace(actor, replacementRoleId) {
  const eligibility = await command(f.gm, 'setReplacementEligibility', { instanceId: f.instanceId,
    requestId: randomUUID(), targetUid: actor.localId, reason: 'removed', expectedRevision: 0,
    expectedSetupRevision: (await f.session.get()).get('setupRevision') });
  await command(f.gm, 'assignReplacementRole', { instanceId: f.instanceId, requestId: randomUUID(),
    targetUid: actor.localId, replacementRoleId, expectedRevision: eligibility.revision,
    expectedSetupRevision: eligibility.setupRevision });
  await command(actor, 'refreshPresence', { activeConsoleRoleId: null });
}
async function grantCurrentShip(shipId) {
  const lease = (await f.db.doc(`sessions/${f.sessionId}/gmInstances/${f.instanceId}`).get()).data();
  const claimedAt = typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString();
  await command(f.gm, 'setGmShipConsoleWriteGrant', { instanceId: f.instanceId, shipId, enabled: true, claimedAt });
}
async function maintain(shipId, consoles, refuelCraftIds) {
  await grantCurrentShip(shipId);
  let bayIndex = 0;
  for (const action of ['begin', ...MAINTENANCE_ORDERS[shipId], 'end']) {
    const current = await f.session.get();
    if (action === 'reactor' && current.get('shipDamage')?.[shipId]?.damagedSystemIds?.length) {
      await command(f.gm, 'repairAllShipDamage', { instanceId: f.instanceId, shipId, requestId: randomUUID(),
        expectedRevision: current.get('vesselActionRevisions')?.[shipId] ?? 0 });
    }
    const bays = SHIP_DAMAGE_DECKS[shipId].filter(card => card.systemId.startsWith('shuttle-bay'));
    const craftId = action === 'bays' ? refuelCraftIds[bayIndex] : undefined;
    const bayId = shipId === 'aegis' ? bays[bayIndex]?.systemId : bays[0]?.systemId;
    await command(f.gm, 'runMaintenance', { instanceId: f.instanceId, shipId, action,
      requestId: randomUUID(), expectedRevision: (await f.session.get()).get('maintenanceCycles')?.[shipId]?.revision ?? 0,
      ...(action === 'rations' ? { foodLevel: 0, waterLevel: 0 } : {}),
      ...(action === 'reactor' ? { consoles } : {}),
      ...(action === 'bays' ? { refuels: craftId ? { [bayId]: craftId } : {} } : {}) });
    if (action === 'bays') bayIndex += 1;
  }
}
function withoutReplayStatus(result) { const rest = { ...result }; delete rest.status; return rest; }
async function exactRetry(actor, name, request) {
  const first = await command(actor, name, request);
  const replay = await command(actor, name, request);
  assert.deepEqual(withoutReplayStatus(replay), withoutReplayStatus(first), `${name} changed its exact receipt.`);
  return first;
}
async function sourceChoice(actor, sourceId, range, index = 0) {
  const view = await command(actor, 'getWolfRangeSupportActionChoice', { sourceId, range });
  assert.equal(JSON.stringify(view).includes('dice'), false, 'Source read must omit locked dice.');
  const use = view.eligible === true && view.actionAvailable === true;
  const scrapBefore = sourceId === 'boa' ? (await f.session.get()).get('shuttleCargo').boa.scrap : undefined;
  const availableContacts = view.contacts.filter(contact => contact.available);
  const target = availableContacts[index % Math.max(1, availableContacts.length)];
  await exactRetry(actor, 'commitWolfRangeSupportActionChoice', { sourceId, range, requestId: randomUUID(),
    expectedTurn: view.turn, expectedRevision: view.revision, use,
    ...(use && sourceId === 'boa' ? { targetContactId: target?.contactId } : {}) });
  const scrapAfter = sourceId === 'boa' ? (await f.session.get()).get('shuttleCargo').boa.scrap : undefined;
  if (sourceId === 'boa') assert.equal(scrapAfter, scrapBefore - (use ? 1 : 0), 'Boa spends exactly one scrap only on use, including the exact retry.');
  return { sourceId, use, ...(sourceId === 'boa' ? { scrapBefore, scrapAfter } : {}) };
}
async function chooseFlights(range) {
  const wing = f.byRole('wing-commander');
  for (const [sourceId, shortCount] of [['fighter-wing-alpha', 4], ['fighter-wing-bravo', 1]]) {
    const view = await command(wing, 'getWolfFighterRangeActionChoice', { sourceId, range });
    const selected = view.fighters.slice(0, shortCount).map(({ fighterIndex }) => fighterIndex);
    const medium = sourceId === 'fighter-wing-alpha' && view.fighters.length > 1 && view.targets.length > 1
      ? [{ fighterIndex: view.fighters[0].fighterIndex, kind: 'attack', targetContactId: view.targets[0].instanceId },
        { fighterIndex: view.fighters[1].fighterIndex, kind: 'target-shift', targetContactId: view.targets[1].instanceId, shift: 1 }]
      : [];
    await exactRetry(wing, 'commitWolfFighterRangeActionChoice', { sourceId, range, requestId: randomUUID(),
      expectedTurn: view.turn, expectedRevision: view.revision,
      ...(range === 'medium-range' ? { actions: medium } : { fighterIndexes: selected }) });
  }
  for (const [sourceId, roleId] of [['pdf-escort-fighter-wing', 'refinery-124-pdf-colonel'], ['maliades', 'dione-engineer']]) {
    const actor = f.byRole(roleId);
    const view = await command(actor, 'getWolfEscortRangeActionChoice', { sourceId, range });
    const targets = view.targets;
    const medium = targets.length > 1
      ? [{ ...(sourceId === 'maliades' ? {} : { fighterIndex: 0 }), kind: 'attack', targetContactId: targets[0].instanceId },
        { ...(sourceId === 'maliades' ? {} : { fighterIndex: 1 }), kind: 'target-shift', targetContactId: targets[1].instanceId, shift: -1 }]
      : [];
    await exactRetry(actor, 'commitWolfEscortRangeActionChoice', { sourceId, range, requestId: randomUUID(),
      expectedTurn: view.turn, expectedRevision: view.revision,
      ...(range === 'medium-range' ? { actions: medium }
        : sourceId === 'maliades' ? { targetContactIds: targets.slice(0, 2).map(target => target.instanceId) }
          : { fighterIndexes: view.fighters.slice(0, 2).map(({ fighterIndex }) => fighterIndex) }) });
  }
}
function safeTargetAssignments(view) {
  const available = view.contacts.filter(({ available }) => available);
  const covered = new Map(available.map(contact => [contact.contactId, 0]));
  return view.hitSlots.map(slot => {
    assert.ok(Number.isSafeInteger(slot.damagePerHit) && slot.damagePerHit > 0, 'The EO receives each locked hit’s safe damage amount.');
    const chosen = [];
    for (let index = 0; index < Math.min(slot.count, available.length); index += 1) {
      const candidates = available.filter(contact => !chosen.includes(contact.contactId));
      const required = candidates.find(contact => (contact.requiredCoverageDamage ?? 0) > covered.get(contact.contactId));
      const target = required ?? candidates.find(contact => covered.get(contact.contactId) === 0) ?? candidates[0];
      chosen.push(target.contactId);
      covered.set(target.contactId, covered.get(target.contactId) + slot.damagePerHit);
    }
    return { actionId: slot.actionId, contactIds: chosen };
  });
}
async function completeBoarding() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await attackState();
    if (state.status === 'resolved') return state;
    let committed = false;
    for (const actor of [f.gm, ...f.players]) {
      const reply = await f.call(actor, 'getWolfBoardingSpecialChoice', { sessionId: f.sessionId,
        ...(actor === f.gm ? { instanceId: f.instanceId } : {}) });
      observations.push({ type: reply.result?.type, kind: reply.result?.choice?.kind, reason: reply.result?.reason,
        status: reply.status });
      if (observations.length > 50) observations.shift();
      if (reply.status !== 200 || reply.result.type !== 'wolf-boarding-special-choice-view') continue;
      const view = reply.result, choice = view.choice;
      let decision;
      if (choice.kind === 'commander') decision = { kind: 'commander', targetShipId: choice.targets[0]?.targetShipId ?? null };
      else if (choice.kind === 'relocation') decision = { kind: 'relocation', craftId: choice.craftId,
        targetShipId: null, expectedControlRevision: choice.controlRevision };
      else if (choice.kind === 'militia') decision = { kind: 'militia', targetShipId: choice.targetShipId,
        militiaDoubleTeams: choice.doubleDiceAvailable, militiaFrontLineDice: 0 };
      else if (choice.kind === 'reroll') decision = { kind: 'reroll', source: choice.source,
        targetShipId: choice.targetShipId, dieIndexes: choice.dice.slice(0, choice.maxRerolls).map(die => die.dieIndex) };
      else decision = { kind: 'commander-ruling', targetShipId: choice.targetShipId,
        rulingText: 'The unresolved Commander consequence is contained for this disposable attack.' };
      await exactRetry(actor, 'commitWolfBoardingSpecialChoice', { requestId: randomUUID(), expectedTurn: view.turn,
        expectedRevision: view.revision, choice: decision, ...(choice.kind === 'commander-ruling' ? { instanceId: f.instanceId } : {}) });
      boarding.push({ kind: choice.kind }); committed = true; break;
    }
    if (committed) continue;
    for (const actor of f.players) {
      const reply = await f.call(actor, 'getWolfBoardingDefenceChoice', { sessionId: f.sessionId });
      if (reply.status !== 200 || reply.result.choiceStatus !== 'pending') continue;
      const view = reply.result;
      await exactRetry(actor, 'commitWolfBoardingDefenceChoice', { requestId: randomUUID(), expectedTurn: view.turn,
        expectedRevision: view.revision, targetShipId: view.targetShipId, securityTeams: Math.min(1, view.availableSecurityTeams) });
      boarding.push({ kind: 'defence', target: view.targetShipId }); committed = true; break;
    }
    if (!committed) await delay(250);
  }
  throw new Error('The genuine boarding choices did not reach atomic finalization.');
}
try {
  f = await createPc07AuthenticatedSession('PC08 normal composed range attack', 20, { keepAlive: true,
    expansion: 'capybara', browserRoleId: 'executive-officer', joinBrowserPlayer: joinThroughUi });
  console.log(`Disposable normal session: ${f.sessionId}`);
  const eo = f.byRole('executive-officer'), wing = f.byRole('wing-commander');
  const captain = f.byRole('admiral'), commander = f.byRole('shepherd-scientist');
  // Optional ships are admitted in Coordination, then the next normal Team
  // phase charges their systems. The GM explicitly defers the first window.
  const firstPhase = (await f.session.get()).get('turnPhase');
  await f.session.update({ turnPhase: { ...firstPhase, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString() } });
  await command(wing, 'beginOpenAirspacePhase', { expectedTurn: 1 });
  await command(f.gm, 'setSmallShipDocking', { instanceId: f.instanceId, requestId: randomUUID(),
    smallShipId: 'gorgoneion', hostShipId: 'aegis', docked: true, expectedRevision: 0 });
  await replace(captain, 'gorgoneion-captain');
  await replace(commander, 'wolf-commander');
  await command(f.gm, 'setWolfAttackWindow', { instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: 0, status: 'deferred' });
  await command(f.gm, 'advanceTurn', { instanceId: f.instanceId, requestId: randomUUID(), expectedTurn: 1, overridePhaseTimer: true });
  const hold = (await f.session.get()).get('turnPhase').timerPause;
  await command(eo, 'clearTurnAdvanceInterstitial', { requestId: randomUUID(), expectedCycle: attackTurn, expectedPausedAt: hold.pausedAt });
  await maintain('aegis', ['command-and-control', 'missile-launchers', 'point-defence-lasers', 'fighter-bay-alpha', 'fighter-bay-bravo'], ['pallas', 'starlight']);
  await maintain('dione', ['fighter-bay'], ['maliades']);
  await maintain('refinery-124', ['fighter-bay'], []);
  await maintain('icebreaker', ['mining-drone-control'], ['highwall']);
  await maintain('capybara', ['scrap-refinery'], []);
  // The printed full ration choice is funded normally by the docked AEGIS
  // host, so setup unrest cannot skip the two consoles this proof needs.
  for (const action of ['begin', 'rations', 'unrest', 'riot', 'reactor', 'end']) {
    await command(captain, 'runSmallShipMaintenance', { smallShipId: 'gorgoneion', action, requestId: randomUUID(),
      expectedRevision: (await f.session.get()).get('smallShipStates').gorgoneion.cycle.revision,
      ...(action === 'rations' ? { foodLevel: 3, waterLevel: 3 } : {}),
      ...(action === 'reactor' ? { consoles: ['missile-array', 'force-field-projector'] } : {}) });
  }
  await grantCurrentShip('aegis');
  let current = await f.session.get();
  while (current.get('shipResources').aegis.ore !== 9) {
    await command(f.gm, 'adjustShipResource', { instanceId: f.instanceId, requestId: randomUUID(), shipId: 'aegis',
      resourceId: 'ore', delta: current.get('shipResources').aegis.ore < 9 ? 1 : -1,
      expectedRevision: current.get('vesselActionRevisions').aegis });
    current = await f.session.get();
  }
  const phase = (await f.session.get()).get('turnPhase');
  // The only privileged fixture mutation accelerates this disposable clock.
  await f.session.update({ turnPhase: { ...phase, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString() } });
  await command(wing, 'beginOpenAirspacePhase', { expectedTurn: attackTurn });
  const cargoSession = await f.session.get();
  const boaCargo = await exactRetry(f.byRole('capybara-recycler'), 'transferShuttleCargoCommand', {
    requestId: randomUUID(), shuttleId: 'boa', resourceId: 'scrap', direction: 'load', amount: 3,
    expectedControlRevision: cargoSession.get('shuttleControl').boa.revision,
  });
  assert.equal(boaCargo.shuttleAmount, 3, 'Normal holder cargo transfer supplies three paid range opportunities.');
  checks.normalBoaCargoTransferAndRetry = true;
  await command(f.gm, 'unlockPressAirspace', { instanceId: f.instanceId });
  const phaseBefore = (await f.session.get()).get('turnPhase');
  const departureId = randomUUID();
  await command(wing, 'requestShuttleDeparture', { requestId: departureId, shuttleId: 'starlight', destinationShipId: 'icebreaker',
    expectedControlRevision: 0, expectedCycle: attackTurn });
  await command(wing, 'beginShuttleTransit', { requestId: randomUUID(), shuttleId: 'starlight',
    expectedDepartureRequestId: departureId, expectedControlRevision: 0, expectedCycle: attackTurn });
  await command(f.gm, 'setWolfAttackWindow', { instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: 1, status: 'due' });
  // Use the supported GM pre-rolled-target route for this full-capacity attack.
  // Spreading the transport targets keeps the source's undefined Capybara deck
  // exhaustion consequence outside this automatic-finalization scenario.
  const fleetTargets = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'];
  const shipIds = [...Array(14).fill('wolf-fighter-wing'), ...Array(3).fill('wolf-assault-transport')];
  const targetAssignments = [
    ...Array.from({ length: 14 }, (_, cardIndex) => ({ cardIndex, targetShipId: fleetTargets[cardIndex % fleetTargets.length] })),
    ...['aegis', 'dione', 'refinery-124'].map((targetShipId, index) => ({ cardIndex: 14 + index, targetShipId })),
  ];
  const prep = await command(f.gm, 'stageWolfAttackPreparation', { instanceId: f.instanceId, requestId: randomUUID(),
    expectedRevision: 0, turn: attackTurn, shipIds,
    targetMode: 'pre-rolled', targetAssignments, modifiers: [], notes: 'Disposable composed proof: explicit GM pre-rolled targets.' });
  const declareRequest = { instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: prep.revision };
  const declaration = await command(f.gm, 'declareWolfAttack', declareRequest);
  const declaredState = await attackState();
  assert.deepEqual(declaredState.combatRoster.map(({ shipId, target }, cardIndex) => ({ shipId, cardIndex, targetShipId: target })),
    targetAssignments.map(({ cardIndex, targetShipId }) => ({ shipId: shipIds[cardIndex], cardIndex, targetShipId })),
    'The current GM pre-rolled inputs enter the canonical combat roster through the ordinary declaration.');
  checks.normalFacilitatorPreRolledTargets = true;
  assert.equal((await f.db.doc(`sessions/${f.sessionId}/shuttleTransitChains/starlight`).get()).exists, false);
  checks.normalTwentyPlayerPreparationAndActualTransitParking = true;
  const force = await command(captain, 'getWolfForceFieldChoice');
  await exactRetry(captain, 'commitWolfForceFieldChoice', { requestId: randomUUID(), expectedTurn: force.turn,
    expectedRevision: force.revision, targetShipId: 'aegis' });
  await page.goto(`${uiUrl}/#/console`);
  await page.getByRole('heading', { name: 'Stations and consoles', exact: true }).waitFor();
  await browserUntil('fresh same-actor station choice', s => s.uid === eo.localId && s.sessionId === f.sessionId &&
    s.roleId === 'executive-officer' && s.connection === 'live' && s.freshness === 'server');
  await page.getByRole('link', { name: 'AEGIS // Executive Officer // HELD BY YOU', exact: true }).click();
  let warheadRequest;
  const capture = request => { if (request.url().endsWith('/commitAegisEnrichedWarheadChoice')) warheadRequest = request.postDataJSON().data; };
  page.on('request', capture);
  await page.getByRole('button', { name: 'Enrich warheads // 5 ore', exact: true }).click({ timeout: 30_000 });
  await until('ordinary live warhead purchase', state => state.enrichedWarheads?.status === 'enriched');
  page.off('request', capture);
  assert.ok(warheadRequest, 'The actual panel sent the ordinary actor purchase.');
  assert.equal((await f.session.get()).get('shipResources').aegis.ore, 4);
  await command(eo, 'commitAegisEnrichedWarheadChoice', warheadRequest);
  assert.equal((await f.session.get()).get('shipResources').aegis.ore, 4);
  await page.screenshot({ path: `${dirname(evidencePath)}/normal-phone-enriched-warheads.png`, fullPage: true });
  checks.livePhoneWarheadPanelAndExactFiveOreRetry = true;
  await until('private targeting after the purchase choice', state => state.calculationReceipt?.step === 'targeting');
  const launchSession = await f.session.get();
  const launchFuel = session => Object.fromEntries(Object.entries(session.get('shipResources')).map(([shipId, resources]) => [shipId, resources.fuel]));
  for (const wingId of ['fighter-wing-alpha', 'fighter-wing-bravo']) {
    const view = await command(wing, 'getAegisFighterWingLaunch', { wingId });
    await exactRetry(wing, 'launchAegisFighterWing', { wingId, requestId: randomUUID(), expectedTurn: view.turn,
      expectedRevision: view.revision, expectedWingRevision: view.wingRevision });
  }
  const pdf = await command(f.byRole('refinery-124-pdf-colonel'), 'getPdfEscortWingLaunch');
  await exactRetry(f.byRole('refinery-124-pdf-colonel'), 'launchPdfEscortWing', { requestId: randomUUID(),
    expectedTurn: pdf.turn, expectedRevision: pdf.revision, expectedWingRevision: pdf.wingRevision });
  const m = await command(f.byRole('dione-engineer'), 'getDioneMaliadesLaunch');
  await exactRetry(f.byRole('dione-engineer'), 'launchDioneMaliades', { requestId: randomUUID(), expectedTurn: m.turn, expectedRevision: m.revision });
  assert.deepEqual(launchFuel(await f.session.get()), launchFuel(launchSession), 'Current charged fighter launch consumes no extra ship fuel.');
  const target = await command(commander, 'getWolfCommanderTargeting');
  await command(commander, 'finishWolfCommanderTargetingRerolls', { requestId: randomUUID(), expectedTurn: target.turn, expectedRevision: target.revision });
  const cnc = await command(eo, 'getAegisCommandAndControl');
  await exactRetry(eo, 'passAegisCommandAndControl', { requestId: randomUUID(), expectedTurn: cnc.turn, expectedRevision: cnc.revision });
  checks.independentFourSourceLaunchesWithoutExtraFuel = true;
  for (const range of ['long-range', 'medium-range', 'short-range']) {
    await until(range, state => state.currentStep === range);
    const support = [];
    if (range !== 'long-range') {
      await command(wing, 'disconnectFromSession');
      await delay(300);
      assert.equal((await attackState()).currentStep, range);
      assert.equal((await attackState()).rangeDecisions?.[range]?.lock, undefined);
      await command(wing, 'resumeSession');
      await command(wing, 'refreshPresence', { activeConsoleRoleId: 'wing-commander' });
      await chooseFlights(range);
      support.push(await sourceChoice(f.byRole('icebreaker-miner'), 'highwall', range, 2));
    }
    support.push(await sourceChoice(captain, 'gorgoneion-missile-array', range));
    support.push(await sourceChoice(f.byRole('capybara-recycler'), 'boa', range, 3));
    const view = await command(eo, 'getWolfRangeActionChoice');
    const locked = await exactRetry(eo, 'commitWolfRangeActionChoice', { requestId: randomUUID(), expectedTurn: view.turn,
      expectedRevision: view.revision, range, actionIds: view.eligibleActions.map(action => action.actionId) });
    const lockedState = await attackState();
    const lockedDice = lockedState.rangeDecisions?.[range]?.lock?.dice;
    if (locked.choiceStatus === 'targets-required') {
      const assignmentView = await command(eo, 'getWolfRangeActionChoice');
      const assignments = safeTargetAssignments(assignmentView);
      observations.push({ range, assignmentView, assignments });
      await exactRetry(eo, 'assignWolfRangeTargets', { requestId: randomUUID(), expectedTurn: assignmentView.turn,
        expectedRevision: assignmentView.revision, range, assignments });
    }
    const resolved = await attackState();
    const receipt = resolved.rangeReceipts.find(item => item.range === range);
    assert.ok(receipt, 'Each range retains one committed immutable receipt.');
    if (lockedDice) assert.deepEqual(receipt.dice, lockedDice.map(die => ({ actionId: die.actionId, sourceId: die.sourceId,
      range: die.range, rolls: die.rolls, successes: die.successes, damage: die.damage })),
    'Assignment must consume the same source dice in the canonical final receipt.');
    ranges.push({ range, support, sourceIds: [...new Set(receipt.dice.map(die => die.sourceId))],
      diceCount: receipt.dice.reduce((sum, die) => sum + die.rolls.length, 0), targetShiftCount: receipt.targetShifts.length });
  }
  checks.allSourcesUseOneLockAndCurrentActorChoices = true;
  checks.disconnectedEntitledFlightsRemainPending = true;
  const finalState = await completeBoarding();
  for (const kind of ['commander', 'relocation', 'defence']) {
    assert.ok(boarding.some(choice => choice.kind === kind), `The ordinary attack traverses a genuine ${kind} decision.`);
  }
  const finalSession = (await f.session.get()).data();
  assert.equal(finalState.currentStep, 'resolved');
  assert.equal(finalState.airspaceLocked, false);
  assert.equal(finalSession.turnPhase.airspace.state, 'lifted');
  assert.equal(finalSession.turnPhase.airspace.pressAccess, phaseBefore.airspace.pressAccess);
  assert.ok(Date.parse(finalSession.turnPhase.openAirspaceEndsAt) >= Date.parse(phaseBefore.openAirspaceEndsAt));
  checks.genuineBoardingChoicesAndAtomicPressMovementClockReopening = true;
  const audience = await page.evaluate(async ({ moduleUrl, sessionId, attackId }) => {
    const { subscribeWolfAttackMemberView } = await import(moduleUrl);
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => { unsubscribe(); reject(new Error('Final member audience did not hydrate.')); }, 30_000);
      unsubscribe = subscribeWolfAttackMemberView(sessionId, view => {
        if (!view || view.attackId !== attackId || view.currentStep !== 'resolved') return;
        clearTimeout(timer); unsubscribe(); resolve(view);
      });
    });
  }, { moduleUrl: firestoreModuleUrl, sessionId: f.sessionId, attackId: finalState.attackId });
  assert.equal(audience.revision, finalState.revision);
  assert.equal(audience.status, 'resolved');
  assert.equal(JSON.stringify(audience).includes('rolls'), false);
  assert.equal(JSON.stringify(audience).includes('actorUid'), false);
  const targetlessResults = audience.results.filter(result => result.targetId === null);
  for (const result of targetlessResults) {
    assert.ok(['highwall', 'gorgoneion-missile-array', 'boa'].includes(result.sourceId));
    assert.deepEqual(result.outcome, { damage: 0 });
    assert.equal(result.bearing, null);
  }
  const storedTargetlessResults = finalState.memberResults.filter(result => result.targetId === null);
  assert.equal(targetlessResults.length, storedTargetlessResults.length, 'Ordinary hydration retains every committed support miss.');
  const supportResults = audience.results.filter(result =>
    ['highwall', 'gorgoneion-missile-array', 'boa'].includes(result.sourceId));
  assert.ok(supportResults.length > 0, 'The ordinary attack publishes real support outcomes.');
  assert.equal(supportResults.filter(result => result.effect.includes('AEGIS')).length, 0,
    'Support outcomes retain their printed source label.');
  assert.equal(new Set(supportResults.map(result => JSON.stringify([
    result.range, result.sourceId, result.contactReference,
  ]))).size, supportResults.length, 'Each source publishes each assigned contact once per range.');
  checks.supportResultsAreUniqueAndPrinted = true;
  checks.resolvedAudienceHydratesThroughActualMemberSubscription = true;
  const snapshot = { phase: finalSession.turnPhase, resources: finalSession.shipResources, damage: finalSession.shipDamage,
    population: finalSession.shipSurvivors, ticker: finalSession.fleetTicker };
  assert.deepEqual(await command(f.gm, 'declareWolfAttack', declareRequest), declaration);
  const replaySession = (await f.session.get()).data();
  assert.deepEqual({ phase: replaySession.turnPhase, resources: replaySession.shipResources, damage: replaySession.shipDamage,
    population: replaySession.shipSurvivors, ticker: replaySession.fleetTicker }, snapshot);
  await command(wing, 'requestShuttleDeparture', { requestId: randomUUID(), shuttleId: 'starlight', destinationShipId: 'icebreaker',
    expectedControlRevision: 0, expectedCycle: attackTurn });
  checks.finalReplayAndActualMovementAfterReopening = true;
  for (const path of ['', '/wolfAttackState/current', '/serverState/pdfEscortWing']) {
    const reply = await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${f.sessionId}${path}`,
      { headers: { Authorization: `Bearer ${eo.idToken}` } });
    assert.equal(reply.status, 403, 'Ordinary direct reads cannot disclose private authority.');
  }
  const member = await command(eo, 'getCurrentMemberSession');
  assert.ok(member.session);
  assert.equal(Object.hasOwn(member.session, 'wolfAttackState'), false);
  assert.equal(JSON.stringify(member.session.maliadesState).includes('rolls'), false);
  checks.privateRootEscortRulesAndMemberDurabilityAllowlist = true;
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(f.heartbeatFailures, []);
  await writeFile(evidencePath, `${JSON.stringify({ kind: 'normal-authenticated-local-emulator-ui-http-composed-gameplay',
    sourceCommit, ordinaryRoster: 20, preparedScene: false, productionGameplay: false,
    fixtureChanges: ['disposable clock deadlines only'], normalFacilitatorDecisions: ['Coordination-phase optional ship and replacement admission',
      'explicitly deferred first window and ordinary early cycle advance', 'explicit GM pre-rolled targets through the supported preparation callable',
      'current ship write grants', 'audited resource adjustment to nine AEGIS ore', 'audited maintenance damage correction if required',
      ...(boarding.some(item => item.kind === 'commander-ruling') ? ['explicit incomplete Commander consequence ruling'] : [])],
    checks, actions, ranges, boarding, audience, preparationInputs: { shipIds, targetAssignments }, targetlessResultCount: targetlessResults.length,
    sessionStoreModuleUrl, firestoreModuleUrl, browserErrors, heartbeatFailures: f.heartbeatFailures,
    identitiesRetained: false, completedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log('PC08 ordinary composed source attack and live phone warhead proof passed.');
} catch (error) {
  const state = f ? await attackState() : undefined;
  if (state) await writeFile(`${evidencePath}.private-state.json`, `${JSON.stringify({ sourceCommit, state }, null, 2)}\n`);
  await page.screenshot({ path: `${dirname(evidencePath)}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${evidencePath}.failure.json`, `${JSON.stringify({ sourceCommit, message: error.message, checks, actions, ranges, boarding,
    step: state?.currentStep, revision: state?.revision, status: state?.status, resolutionBlocker: state?.resolutionBlocker,
    decisionSummary: state?.decisionSummary, observations, browserErrors, sessionStoreModuleUrl }, null, 2)}\n`);
  throw error;
} finally {
  const keepCleanupAlive = setInterval(() => {}, 1000);
  try { await browser.close(); if (f) { await f.cleanup(); await f.db.terminate(); } }
  finally { clearInterval(keepCleanupAlive); }
}
