import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';
import { createPc09BrowserProof } from './pc09-browser-proof.mjs';
import { runPc09DeductionPrelude } from './pc09-deduction-prelude.mjs';
import { runPc09AftermathProof } from './pc09-aftermath-proof.mjs';

const evidencePath = process.env.PC09_ATTACK_EVIDENCE_PATH;
const uiUrl = process.env.PC09_UI_URL;
assert.ok(evidencePath && uiUrl, 'External evidence and the isolated app URL are required.');
await mkdir(dirname(evidencePath), { recursive: true });
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { MAINTENANCE_ORDERS } = require('../functions/lib/maintenanceOrder.js');
const { SHIP_DAMAGE_DECKS } = require('../functions/lib/shipDamage.js');
const { shipRationSchedule, INITIAL_SHIP_SURVIVORS } = require('../functions/lib/shipPopulation.js');
const { CALLABLE_RATE_LIMIT_POLICIES } = require('../functions/lib/callableRateLimit.js');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim();
const maintenanceIntervalMs = Math.ceil(CALLABLE_RATE_LIMIT_POLICIES.runMaintenance.windowMs /
  CALLABLE_RATE_LIMIT_POLICIES.runMaintenance.maxRequests) + 50;
let lastMaintenanceStartedAt = 0;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const wingBrowser = await createPc09BrowserProof(uiUrl);
const aceBrowser = await createPc09BrowserProof(uiUrl);
const pressBrowser = await createPc09BrowserProof(uiUrl);
const browserErrors = [], checks = {}, actions = [], ranges = [], boarding = [], observations = [];
const setupResourceAllocations = [];
let attackTurn;
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
      roleId: s.me?.assignedRoleId, activeConsoleRoleId: s.me?.activeConsoleRoleId,
      connection: s.connection, freshness: s.sessionSnapshotFreshness };
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
  const currentEligibility = await f.db.doc(`sessions/${f.sessionId}/replacementEligibility/${actor.localId}`).get();
  const eligibility = await command(f.gm, 'setReplacementEligibility', { instanceId: f.instanceId,
    requestId: randomUUID(), targetUid: actor.localId, reason: 'removed', expectedRevision: currentEligibility.get('revision') ?? 0,
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
async function fundFixtureResource(shipId, resourceId, minimum) {
  await grantCurrentShip(shipId);
  const initial = (await f.session.get()).get('shipResources')[shipId][resourceId];
  while (true) {
    const current = await f.session.get();
    const amount = current.get('shipResources')[shipId][resourceId];
    if (amount >= minimum) break;
    await command(f.gm, 'applyShipCounterSteps', {instanceId: f.instanceId, shipId, counter: 'resource', resourceId,
      steps: Array(Math.min(12, minimum - amount)).fill(1), requestId: randomUUID(),
      expectedRevision: current.get('vesselActionRevisions')[shipId] ?? 0});
  }
  setupResourceAllocations.push({shipId, resourceId, initial,
    allocated: (await f.session.get()).get('shipResources')[shipId][resourceId],
    boundary: 'Authenticated disposable-fixture allocation; not ordinary production or cargo proof'});
}
async function maintain(shipId, consoles, refuelCraftIds) {
  const maintenanceRole = { aegis: 'executive-officer', dione: 'dione-engineer',
    'refinery-124': 'refinery-124-engineer', icebreaker: 'icebreaker-engineer', capybara: 'capybara-captain' }[shipId];
  const maintenanceActor = f.byRole(maintenanceRole);
  assert.ok(maintenanceActor, 'Each maintenance lane has its ordinary held ship officer.');
  let bayIndex = 0;
  for (const action of ['begin', ...MAINTENANCE_ORDERS[shipId], 'end']) {
    const bays = SHIP_DAMAGE_DECKS[shipId].filter(card => card.systemId.startsWith('shuttle-bay'));
    const craftId = action === 'bays' ? refuelCraftIds[bayIndex] : undefined;
    const bayId = shipId === 'aegis' ? bays[bayIndex]?.systemId : bays[0]?.systemId;
    await command(maintenanceActor, 'runMaintenance', { consoleRoleId: maintenanceRole, shipId, action,
      requestId: randomUUID(), expectedRevision: (await f.session.get()).get('maintenanceCycles')?.[shipId]?.revision ?? 0,
      ...(action === 'rations' ? { foodLevel: 3, waterLevel: 3 } : {}),
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
      ? [{ ...(sourceId === 'maliades' ? {} : { fighterIndex: view.fighters[0].fighterIndex }), kind: 'attack', targetContactId: targets[0].instanceId },
        { ...(sourceId === 'maliades' ? {} : { fighterIndex: view.fighters[1].fighterIndex }), kind: 'target-shift', targetContactId: targets[1].instanceId, shift: -1 }]
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
  f = await createPc07AuthenticatedSession('PC09 ordinary deduction and complete Wolf attack', 20, { keepAlive: true,
    expansion: 'capybara', capybaraEnabled: true, browserRoleId: 'executive-officer', joinBrowserPlayer: joinThroughUi,
    joinBrowserPlayers: { 'wing-commander': wingBrowser.join, 'refinery-124-captain': aceBrowser.join },
    joinPressPlayer: pressBrowser.join,
    explicitLoyaltySetup: { wolfAgentRoleId: 'refinery-124-pdf-colonel', wolfCultRoleId: 'wing-commander',
      intelligenceAgentRoleId: 'quellon-explorer' } });
  console.log('Disposable PC09 normal authenticated session created.');
  const deduction = await runPc09DeductionPrelude(f, { directory: dirname(evidencePath) });
  checks.deduction = deduction.checks;
  assert.ok(deduction.checks, 'The ordinary deduction prelude must return its committed proof checks.');
  const eo = f.byRole('executive-officer'), wing = f.byRole('wing-commander');
  const captain = f.byRole('admiral'), commander = f.byRole('shepherd-scientist');
  const warrior = f.byRole('quellon-captain');
  const ace = f.byRole('refinery-124-captain');
  assert.ok(ace && f.press, 'The Ace starts with an ordinary Refinery berth; Press joins independently.');
  assert.ok(warrior, 'The initially filled Quellon Captain station supplies the disclosed Warrior replacement.');
  // Optional ships are admitted in Coordination, then the next normal Team
  // phase charges their systems. The GM explicitly defers the first window.
  const setupCycle = (await f.session.get()).get('currentTurn');
  const firstPhase = (await f.session.get()).get('turnPhase');
  await f.session.update({ turnPhase: { ...firstPhase, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString() } });
  await command(wing, 'beginOpenAirspacePhase', { expectedTurn: setupCycle });
  await command(f.gm, 'setSmallShipDocking', { instanceId: f.instanceId, requestId: randomUUID(),
    smallShipId: 'gorgoneion', hostShipId: 'aegis', docked: true, expectedRevision: 0 });
  await command(f.gm, 'setSmallShipDocking', { instanceId: f.instanceId, requestId: randomUUID(),
    smallShipId: 'warrior', hostShipId: 'aegis', docked: true, expectedRevision: 0 });
  await replace(captain, 'gorgoneion-captain');
  await replace(commander, 'wolf-commander');
  await replace(warrior, 'warrior-captain');
  await command(f.gm, 'setWolfAttackWindow', { instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: 0, status: 'deferred' });
  await command(f.gm, 'advanceTurn', { instanceId: f.instanceId, requestId: randomUUID(), expectedTurn: setupCycle, overridePhaseTimer: true });
  attackTurn = (await f.session.get()).get('currentTurn');
  const hold = (await f.session.get()).get('turnPhase').timerPause;
  await command(eo, 'clearTurnAdvanceInterstitial', { requestId: randomUUID(), expectedCycle: attackTurn, expectedPausedAt: hold.pausedAt });
  // One explicit fixture allocation supplies printed full rations; ordinary
  // officers still make and pay every maintenance choice. No GM damage repair
  // or deterministic random result stands in for a player recovery action.
  const rationSession = await f.session.get();
  for (const shipId of ['aegis', 'dione', 'refinery-124', 'icebreaker', 'capybara']) {
    const population = rationSession.get('shipSurvivors')?.[shipId] ?? INITIAL_SHIP_SURVIVORS[shipId];
    const rations = shipRationSchedule(shipId, population);
    await fundFixtureResource(shipId, 'food', rations.food[3] * (shipId === 'aegis' ? 2 : 1) + (shipId === 'aegis' ? 16 : 0));
    await fundFixtureResource(shipId, 'water', rations.water[3] * (shipId === 'aegis' ? 2 : 1) + (shipId === 'aegis' ? 12 : 0));
  }
  await fundFixtureResource('aegis', 'materials', 6);
  await fundFixtureResource('aegis', 'ore', 9);
  await fundFixtureResource('capybara', 'scrap', 4);
  await maintain('aegis', ['command-and-control', 'missile-launchers', 'point-defence-lasers', 'fighter-bay-alpha', 'fighter-bay-bravo'], ['pallas', 'starlight']);
  await maintain('dione', ['fighter-bay'], ['maliades']);
  await maintain('refinery-124', ['fighter-bay'], []);
  await replace(ace, 'pdf-fighter-ace');
  await maintain('icebreaker', ['mining-drone-control'], ['highwall']);
  await maintain('capybara', ['scrap-refinery'], ['macaw']);
  // The printed full ration choice is funded normally by the docked AEGIS
  // host, so setup unrest cannot skip the two consoles this proof needs.
  for (const [smallShipId, actor, consoles] of [
    ['gorgoneion', captain, ['missile-array', 'force-field-projector']], ['warrior', warrior, ['salvage-drones']],
  ]) {
    for (const action of ['begin', 'rations', 'unrest', 'riot', 'reactor', 'end']) {
      await command(actor, 'runSmallShipMaintenance', { smallShipId, action, requestId: randomUUID(),
        expectedRevision: (await f.session.get()).get('smallShipStates')[smallShipId].cycle.revision,
        ...(action === 'rations' ? { foodLevel: 3, waterLevel: 3 } : {}),
        ...(action === 'reactor' ? { consoles } : {}) });
    }
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
  await grantCurrentShip('aegis');
  await command(f.gm, 'unlockPressAirspace', { instanceId: f.instanceId });
  const phaseBefore = (await f.session.get()).get('turnPhase');
  const departureId = randomUUID();
  await command(wing, 'requestShuttleDeparture', { requestId: departureId, shuttleId: 'starlight', destinationShipId: 'icebreaker',
    expectedControlRevision: 0, expectedCycle: attackTurn });
  await command(wing, 'beginShuttleTransit', { requestId: randomUUID(), shuttleId: 'starlight',
    expectedDepartureRequestId: departureId, expectedControlRevision: 0, expectedCycle: attackTurn });
  await command(f.gm, 'setWolfAttackWindow', { instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: 1, status: 'due' });
  // Keep the full printed capacity while using three Transports in this
  // automatic-finalization branch. Targeting and all other dice remain server-owned.
  const shipIds = [...Array(14).fill('wolf-fighter-wing'), ...Array(3).fill('wolf-assault-transport')];
  const prep = await command(f.gm, 'stageWolfAttackPreparation', { instanceId: f.instanceId, requestId: randomUUID(),
    expectedRevision: 0, turn: attackTurn, shipIds,
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' });
  const declareRequest = { instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: prep.revision };
  const declaration = await command(f.gm, 'declareWolfAttack', declareRequest);
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
  await browserUntil('fresh same-actor Executive Officer console', s => s.uid === eo.localId &&
    s.sessionId === f.sessionId && s.activeConsoleRoleId === 'executive-officer' &&
    s.connection === 'live' && s.freshness === 'server');
  const purchaseButton = page.getByRole('button', { name: 'Enrich warheads // 5 ore', exact: true });
  const hydrationNotice = page.getByText('The Executive Officer authority changed before this response arrived.', { exact: true }).first();
  await Promise.race([purchaseButton.waitFor({ state: 'visible', timeout: 30_000 }),
    hydrationNotice.waitFor({ state: 'visible', timeout: 30_000 })]);
  if (!await purchaseButton.isVisible()) {
    observations.push({ kind: 'ordinary-warhead-read-refresh', reason: await hydrationNotice.innerText(),
      identity: await snapshotIdentity() });
    await page.getByRole('button', { name: 'Refresh enriched warheads', exact: true }).click();
  }
  let warheadRequest;
  const capture = request => { if (request.url().endsWith('/commitAegisEnrichedWarheadChoice')) warheadRequest = request.postDataJSON().data; };
  page.on('request', capture);
  await purchaseButton.click({ timeout: 30_000 });
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
      await context.setOffline(true);
      await browserUntil('actual EO browser network interruption', s => s.connection === 'offline');
      await delay(300);
      assert.equal((await attackState()).currentStep, range);
      assert.equal((await attackState()).rangeDecisions?.[range]?.lock, undefined);
      await context.setOffline(false);
      await command(eo, 'resumeSession');
      await command(eo, 'refreshPresence', { activeConsoleRoleId: 'executive-officer' });
      await page.reload();
      await browserUntil('same EO identity restored before range choices', s => s.uid === eo.localId &&
        s.uid === s.memberUid && s.sessionId === f.sessionId && s.connection === 'live' && s.freshness === 'server');
      if (range === 'medium-range') {
        const aceView = await command(ace, 'getPdfFighterAceCombatView');
        const chosen = aceView.targets.find(target => target.available);
        assert.ok(chosen, 'The normal Ace chooses one current opaque live contact.');
        await exactRetry(commander, 'applyWolfCommanderRangeTargetAdjustment', { requestId: randomUUID(),
          attackId: aceView.attackId, expectedTurn: aceView.turn, expectedRevision: aceView.revision,
          range, rosterIndex: Number(chosen.targetId.slice('contact-'.length)) - 1, delta: 1 });
        const current = await attackState();
        await exactRetry(f.byRole('refinery-124-pdf-colonel'), 'grantPdfFighterAcePermission', {
          requestId: randomUUID(), attackId: current.attackId, expectedRevision: current.revision,
          sourceId: 'pdf-escort-fighter-wing', fighterIndex: 0 });
        await command(ace, 'resumeSession');
        await aceBrowser.untilIdentity('current ordinary Ace identity', s => s.uid === ace.localId && s.uid === s.memberUid &&
          s.replacementRoleId === 'pdf-fighter-ace' && s.connection === 'live' && s.freshness === 'server');
        await aceBrowser.page.goto(`${uiUrl}/#/replacement/pdf-fighter-ace`);
        const aceButton = aceBrowser.page.getByRole('button', { name: 'Commit Fighter Ace action', exact: true });
        await aceButton.waitFor();
        await aceBrowser.page.getByLabel('Wolf contact', { exact: true }).selectOption(chosen.targetId);
        await aceBrowser.page.getByLabel('Optional targeting shift', { exact: true }).selectOption('1');
        let aceRequest;
        const captureAce = request => { if (request.url().endsWith('/commitPdfFighterAceCombat')) aceRequest = request.postDataJSON().data; };
        aceBrowser.page.on('request', captureAce);
        await aceButton.click();
        await until('ordinary Ace action committed', state => state.pdfFighterAceAction?.actorUid === ace.localId);
        aceBrowser.page.off('request', captureAce);
        assert.ok(aceRequest, 'The actual Ace panel must issue its normal permission-bound request.');
        const afterAce = await attackState();
        const beforeRetry = JSON.stringify(afterAce);
        await command(ace, 'commitPdfFighterAceCombat', aceRequest);
        assert.equal(JSON.stringify(await attackState()), beforeRetry, 'The Ace exact retry cannot write, roll or shift twice.');
        const adjustment = afterAce.commanderRangeAdjustments[range];
        const index = adjustment.rosterIndex;
        assert.equal(afterAce.pdfFighterAceAction.rosterBefore[index].target, adjustment.toTarget);
        assert.equal(afterAce.pdfFighterAceAction.sourceStateAfter.fighters, afterAce.pdfFighterAceAction.sourceStateBefore.fighters);
        assert.deepEqual(afterAce.pdfFighterAceAction.sourceStateAfter, afterAce.pdfFighterAceAction.sourceStateBefore);
        await aceBrowser.page.getByText('The Fighter Ace has already acted in this attack.', { exact: true }).waitFor();
        await aceBrowser.assertGeometry();
        await aceBrowser.page.screenshot({ path: `${dirname(evidencePath)}/ordinary-ace-medium-result.png`, fullPage: true });
        const pdfOrdinary = await command(f.byRole('refinery-124-pdf-colonel'), 'getWolfEscortRangeActionChoice', {
          sourceId: 'pdf-escort-fighter-wing', range });
        assert.deepEqual(pdfOrdinary.fighters.map(row => row.fighterIndex), [1, 2, 3]);
        checks.actualAceUiPermissionCommanderOrderAndExactRetry = true;
      }
      await chooseFlights(range);
      support.push(await sourceChoice(f.byRole('icebreaker-miner'), 'highwall', range, 2));
    }
    support.push(await sourceChoice(captain, 'gorgoneion-missile-array', range));
    support.push(await sourceChoice(f.byRole('capybara-recycler'), 'boa', range, 3));
    const view = await command(eo, 'getWolfRangeActionChoice');
    const locked = await exactRetry(eo, 'commitWolfRangeActionChoice', { requestId: randomUUID(), expectedTurn: view.turn,
      expectedRevision: view.revision, range, actionIds: view.eligibleActions.filter(action => action.sourceId.startsWith('aegis-')).map(action => action.actionId) });
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
    if (range === 'long-range') {
      const targeting = resolved.calculationReceipt.targeting;
      assert.equal(resolved.calculationReceipt.composition.damageCapacity, 20);
      assert.deepEqual(receipt.targetSnapshot, targeting.rolls.map(({ shipId, target }, index) => ({
        instanceId: `${index}:${shipId}`, target,
      })), 'The canonical Long Range targets match the actual immutable server targeting receipt.');
      checks.normalCanonicalTargetingReceipt = true;
    }
    if (lockedDice) assert.deepEqual(receipt.dice, lockedDice.map(die => ({ actionId: die.actionId, sourceId: die.sourceId,
      range: die.range, rolls: die.rolls, successes: die.successes, damage: die.damage })),
    'Assignment must consume the same source dice in the canonical final receipt.');
    ranges.push({ range, support, sourceIds: [...new Set(receipt.dice.map(die => die.sourceId))],
      diceCount: receipt.dice.reduce((sum, die) => sum + die.rolls.length, 0), targetShiftCount: receipt.targetShifts.length });
  }
  checks.allSourcesUseOneLockAndCurrentActorChoices = true;
  checks.actualEOConnectivityRecoveryDuringPendingRanges = true;
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
  const escortResults = audience.results.filter(result => ['pdf-escort-wing', 'maliades'].includes(result.sourceId));
  assert.equal(escortResults.filter(result => result.effect.includes('AEGIS')).length, 0,
    'Escort outcomes retain their printed source label.');
  const shortReceipt = finalState.rangeReceipts.find(receipt => receipt.range === 'short-range');
  const expectedPdfHits = shortReceipt.assignments
    .filter(assignment => assignment.actionId.startsWith('pdf-escort-wing-short-'))
    .reduce((count, assignment) => count + assignment.targetInstanceIds.length, 0);
  assert.equal(audience.results.filter(result => result.sourceId === 'pdf-escort-wing' &&
    result.range === 'short' && result.effect === 'PDF Escort Wing attack hit').length, expectedPdfHits,
  'Each committed PDF Short assigned hit publishes its printed result exactly once.');
  checks.escortResultsArePrintedAndMatchCommittedHits = true;
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
  // A server-selected damage card may disable the Construction Bay. Recover
  // that actual damage through a paid current-holder trip and Macaw repair
  // before the next Team maintenance; never clear it with a fixture write.
  const repairBefore = (await f.session.get()).data();
  assert.equal(repairBefore.shipDamage.aegis.destroyed, false,
    'The ordinary next-Team fighter branch requires a surviving AEGIS.');
  if (repairBefore.shipDamage.aegis.damagedSystemIds.includes('construction-bay')) {
    const macaw = f.byRole('capybara-captain');
    assert.ok(repairBefore.shuttleFuelled.macaw);
    assert.ok(repairBefore.shipResources.capybara.scrap >= 1);
    const destination = repairBefore.shuttleDockings.find(row => row.shuttleId === 'macaw')?.shipId;
    if (destination !== 'aegis') {
      await command(macaw, 'requestShuttleDeparture', { requestId: randomUUID(), shuttleId: 'macaw',
        destinationShipId: 'aegis', expectedControlRevision: repairBefore.shuttleControl.macaw.revision,
        expectedCycle: attackTurn });
      const routeRef = f.db.doc(`sessions/${f.sessionId}/shuttleDepartures/macaw`);
      const arrivalDeadline = Date.now() + 90_000;
      let route;
      while (Date.now() < arrivalDeadline) {
        route = (await routeRef.get()).data();
        if (route?.status === 'in-transit' && Date.now() >= Date.parse(route.arrivesAt)) break;
        await delay(250);
      }
      assert.ok(route?.status === 'in-transit' && Date.now() >= Date.parse(route.arrivesAt),
        'The normal Macaw trip must reach its authoritative arrival time.');
      const current = (await f.session.get()).data();
      await exactRetry(macaw, 'completeShuttleArrival', { shuttleId: 'macaw',
        transitRequestId: route.transitRequestId, expectedControlRevision: current.shuttleControl.macaw.revision });
    }
    const current = (await f.session.get()).data();
    const beforeScrap = current.shipResources.capybara.scrap;
    await exactRetry(macaw, 'repairConsolesFromMacaw', { requestId: randomUUID(),
      expectedControlRevision: current.shuttleControl.macaw.revision,
      expectedRepairRevision: current.macawRepairs.revision, expectedCycle: attackTurn,
      expectedHostShipId: 'aegis', systemIds: ['construction-bay'] });
    const repaired = (await f.session.get()).data();
    assert.equal(repaired.shipResources.capybara.scrap, beforeScrap - 1);
    assert.equal(repaired.shipDamage.aegis.damagedSystemIds.includes('construction-bay'), false);
    checks.normalPaidMacawConstructionBayRecovery = true;
  }
  await replace(captain, 'doctor');
  const arrestTarget = deduction.actors.wolfAgent;
  const priorPosse = await f.db.doc(`sessions/${f.sessionId}/arrestPosseCalculations/current`).get();
  const calculation = await command(f.gm, 'calculateArrestPosse', { instanceId: f.instanceId,
    requestId: randomUUID(), expectedRevision: priorPosse.get('revision') ?? deduction.arrestCalculation.revision,
    targetUid: arrestTarget.localId, defenders: 0 });
  const candidates = await Promise.all(f.players.filter(actor => actor.localId !== arrestTarget.localId).map(async actor => ({
    actor, player: await f.db.doc(`sessions/${f.sessionId}/players/${actor.localId}`).get(),
  })));
  const simulatedAttendance = candidates.filter(({ player }) => player.get('connected') === true &&
    player.get('replacementStatus') == null && player.get('role') === 'player').map(({ actor }) => actor.localId).sort();
  assert.ok(simulatedAttendance.length >= calculation.requiredPlayers);
  const arrested = await exactRetry(f.gm, 'resolveArrestPosse', { instanceId: f.instanceId,
    requestId: randomUUID(), expectedCycle: attackTurn, expectedRevision: calculation.revision,
    targetUid: arrestTarget.localId, presentPlayerUids: simulatedAttendance });
  assert.equal(arrested.outcome, 'arrested');
  assert.equal(arrested.deadlineCycle, attackTurn + 1);
  const caseRef = f.db.doc(`sessions/${f.sessionId}/arrestCases/${arrestTarget.localId}`);
  const beforeEarly = JSON.stringify((await caseRef.get()).data());
  const early = await f.call(f.gm, 'resolveArrestCaseDisposition', { sessionId: f.sessionId, instanceId: f.instanceId,
    requestId: randomUUID(), targetUid: arrestTarget.localId, expectedCycle: attackTurn,
    expectedRevision: arrested.revision, expectedSetupRevision: (await f.session.get()).get('setupRevision'), disposition: 'executed' });
  assert.notEqual(early.status, 200, 'Execution cannot be recorded before the next-Team deadline.');
  assert.equal(JSON.stringify((await caseRef.get()).data()), beforeEarly);
  checks.arrestAttendanceBoundary = 'authenticated simulated GM input; no physical attendance claim';
  checks.arrestEarlyDispositionDenied = true;
  const aftermath = await runPc09AftermathProof(f, { directory: dirname(evidencePath), finalState,
    actorAllocations: {doctor: captain, warrior, macaw: f.byRole('capybara-captain'), boa: f.byRole('capybara-recycler'),
      wingCommander: wing, press: f.press,
      // Doctor and the two unique docked Scrap/repair opportunities are proved
      // by a separate finite ordinary scenario. This attack preserves its own
      // server-selected targets and outcomes instead of manufacturing them.
      requiredBranches: ['warrior-salvage', 'press-publication', 'member-audience', 'fighter-build'] },
    advanceNextTeam: async ({attackTurn: completedTurn}) => {
        await command(f.gm, 'advanceTurn', {instanceId: f.instanceId, requestId: randomUUID(),
          expectedTurn: completedTurn, overridePhaseTimer: true});
        const next = (await f.session.get()).data();
        if (next.turnPhase.timerPause?.reason === 'turn-interstitial') {
          await command(eo, 'clearTurnAdvanceInterstitial', {requestId: randomUUID(),
            expectedCycle: next.currentTurn, expectedPausedAt: next.turnPhase.timerPause.pausedAt});
        }
        assert.equal(next.currentTurn, arrested.deadlineCycle);
        const disposition = await exactRetry(f.gm, 'resolveArrestCaseDisposition', { instanceId: f.instanceId,
          requestId: randomUUID(), targetUid: arrestTarget.localId, expectedCycle: next.currentTurn,
          expectedRevision: (await caseRef.get()).get('revision'), expectedSetupRevision: next.setupRevision, disposition: 'executed' });
        assert.equal(disposition.deadlineMet, true);
        const eligibility = await f.db.doc(`sessions/${f.sessionId}/replacementEligibility/${arrestTarget.localId}`).get();
        assert.equal(eligibility.get('eligible'), true);
        assert.equal(eligibility.get('reason'), 'arrested');
        await command(f.gm, 'assignReplacementRole', { instanceId: f.instanceId, requestId: randomUUID(),
          targetUid: arrestTarget.localId, replacementRoleId: 'rosal-militia-leader', expectedRevision: eligibility.get('revision'),
          expectedSetupRevision: (await f.session.get()).get('setupRevision') });
        await command(arrestTarget, 'refreshPresence', { activeConsoleRoleId: null });
        checks.arrestNextTeamDispositionAndNormalReplacement = true;
        await maintain('aegis', ['construction-bay'], []);
        return {status: 'complete'};
      } });
  checks.aftermath = aftermath.checks;
  assert.ok(aftermath.checks, 'The ordinary aftermath workflow must return its committed proof checks.');
  await wingBrowser.page.goto(`${uiUrl}/#/console`);
  await wingBrowser.page.getByRole('heading', {name: 'Stations and consoles', exact: true}).waitFor();
  await wingBrowser.untilIdentity('fresh current Wing station', s => s.uid === wing.localId &&
    s.memberUid === wing.localId && s.roleId === 'wing-commander' && s.connection === 'live' && s.freshness === 'server');
  await wingBrowser.page.getByRole('link', {name: 'AEGIS // Wing Commander // HELD BY YOU', exact: true}).click();
  await wingBrowser.untilIdentity('current Wing Commander console', s => s.uid === wing.localId &&
    s.activeConsoleRoleId === 'wing-commander' && s.connection === 'live' && s.freshness === 'server');
  const beforeUiBuild = (await f.session.get()).data();
  const beforeUiCount = Object.values(beforeUiBuild.fighterWingCounts).reduce((sum, item) => sum + item.count, 0);
  await wingBrowser.page.getByRole('button', {name: /Build 1 fighter.*1 material/i}).and(wingBrowser.page.locator(':enabled')).first().click();
  const uiDeadline = Date.now() + 30_000;
  let afterUiBuild;
  while (Date.now() < uiDeadline) {
    afterUiBuild = (await f.session.get()).data();
    if (Object.values(afterUiBuild.fighterWingCounts).reduce((sum, item) => sum + item.count, 0) === beforeUiCount + 1) break;
    await delay(250);
  }
  assert.equal(Object.values(afterUiBuild.fighterWingCounts).reduce((sum, item) => sum + item.count, 0), beforeUiCount + 1);
  assert.equal(afterUiBuild.shipResources.aegis.materials, beforeUiBuild.shipResources.aegis.materials - 1);
  await wingBrowser.assertGeometry();
  assert.deepEqual(wingBrowser.errors, []);
  assert.deepEqual(aceBrowser.errors, []);
  assert.deepEqual(pressBrowser.errors, []);
  checks.normalNextTeamWingUiBuildSpendsOneMaterial = true;
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(f.heartbeatFailures, []);
  await writeFile(evidencePath, `${JSON.stringify({ kind: 'normal-authenticated-local-emulator-ui-http-composed-gameplay',
    sourceCommit, ordinaryRoster: 20, preparedScene: false, productionGameplay: false,
    fixtureChanges: ['disposable clock deadlines only'], normalFacilitatorDecisions: ['Coordination-phase optional ship and replacement admission',
      'explicitly deferred first window and ordinary early cycle advance',
      'explicit optional Wolf/Intel loyalty mode', 'current authenticated fixture resource allocation before printed full rations',
      ...(boarding.some(item => item.kind === 'commander-ruling') ? ['explicit incomplete Commander consequence ruling'] : [])],
    checks, actions, setupResourceAllocations, ranges, boarding, audience, preparationInputs: { shipIds, targetAssignments: [] }, targetlessResultCount: targetlessResults.length,
    sessionStoreModuleUrl, firestoreModuleUrl, browserErrors, aceBrowserErrors: aceBrowser.errors,
    pressBrowserErrors: pressBrowser.errors, heartbeatFailures: f.heartbeatFailures,
    identitiesRetained: false, completedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log('PC09 ordinary deduction, composed attack and aftermath proof passed.');
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
  try { await browser.close(); await wingBrowser.browser.close(); await aceBrowser.browser.close();
    await pressBrowser.browser.close(); if (f) { await f.cleanup(); await f.db.terminate(); } }
  finally { clearInterval(keepCleanupAlive); }
}
