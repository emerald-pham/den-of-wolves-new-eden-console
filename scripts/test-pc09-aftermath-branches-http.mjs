import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';
import { runPc09AftermathProof } from './pc09-aftermath-proof.mjs';

const evidencePath = process.env.PC09_AFTER_BRANCH_EVIDENCE_PATH ?? '/tmp/pc09-aftermath-row4.json';
const requiredBranches = (process.env.PC09_AFTER_BRANCHES ??
  'doctor,warrior-salvage,macaw-scrap,boa-scrap,macaw-repair,press-publication,member-audience,fighter-build')
  .split(',').map((branch) => branch.trim()).filter(Boolean);
const needsBranch = (branch) => requiredBranches.includes(branch);
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { MAINTENANCE_ORDERS } = require('../functions/lib/maintenanceOrder.js');
const { SHIP_DAMAGE_DECKS } = require('../functions/lib/shipDamage.js');
const { INITIAL_SHIP_SURVIVORS, shipRationSchedule } = require('../functions/lib/shipPopulation.js');
let f;
const actions = [];
const ordinaryAllocations = [];
const extraActors = [];
let sessionJoinCode;

function restValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.hasOwn(value, 'nullValue')) return null;
  if (Object.hasOwn(value, 'stringValue')) return value.stringValue;
  if (Object.hasOwn(value, 'integerValue')) return Number(value.integerValue);
  if (Object.hasOwn(value, 'doubleValue')) return value.doubleValue;
  if (Object.hasOwn(value, 'booleanValue')) return value.booleanValue;
  if (Object.hasOwn(value, 'timestampValue')) return value.timestampValue;
  if (Array.isArray(value.arrayValue?.values)) return value.arrayValue.values.map(restValue);
  if (value.mapValue?.fields) return Object.fromEntries(Object.entries(value.mapValue.fields).map(([key, item]) => [key, restValue(item)]));
  return undefined;
}
function decodeDocument(document) {
  return document?.fields ? Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, restValue(value)])) : undefined;
}
function restDocumentUrl(path) {
  return `http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${f.sessionId}${path}`;
}
async function authenticatedGet(actor, path) {
  assert.ok(actor?.idToken, 'A normal authenticated actor is required for the Rules read.');
  const response = await fetch(restDocumentUrl(path), { headers: { Authorization: `Bearer ${actor.idToken}` } });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, data: response.ok ? decodeDocument(body) : undefined };
}
async function command(actor, name, data = {}) {
  const result = f.ok(await f.call(actor, name, { sessionId: f.sessionId, ...data }), name);
  assert.notEqual(result?.status, 'stale', `${name} returned stale authority.`);
  actions.push({ name, status: result?.status ?? 'committed', revision: result?.revision ?? null });
  return result;
}
function withoutReplayStatus(value) { const copy = { ...value }; delete copy.status; return copy; }
async function exactRetry(actor, name, request) {
  const first = await command(actor, name, request);
  const replay = await command(actor, name, request);
  assert.deepEqual(withoutReplayStatus(replay), withoutReplayStatus(first), `${name} exact retry changed its result.`);
  return first;
}
async function replace(actor, replacementRoleId) {
  const current = (await f.session.get()).data();
  const eligibilityDoc = await f.db.doc(`sessions/${f.sessionId}/replacementEligibility/${actor.localId}`).get();
  const eligibility = await command(f.gm, 'setReplacementEligibility', { instanceId: f.instanceId,
    requestId: randomUUID(), targetUid: actor.localId, reason: 'removed', expectedRevision: eligibilityDoc.exists ? eligibilityDoc.get('revision') : 0,
    expectedSetupRevision: current.setupRevision });
  await command(f.gm, 'assignReplacementRole', { instanceId: f.instanceId, requestId: randomUUID(),
    targetUid: actor.localId, replacementRoleId, expectedRevision: eligibility.revision,
    expectedSetupRevision: eligibility.setupRevision });
  await command(actor, 'refreshPresence', { activeConsoleRoleId: null });
}
async function joinUnassignedActor(label) {
  const env = Object.fromEntries((await readFile('.env.emulators.local', 'utf8')).trim().split('\n').map(line => line.split('=')));
  const project = process.env.VITE_FIREBASE_PROJECT_ID;
  const authPort = Number(env.VITE_FIREBASE_AUTH_EMULATOR_PORT);
  const functionsPort = Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT);
  const signup = await fetch(`http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${project}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  });
  assert.equal(signup.status, 200, `Normal Auth actor creation failed for ${label}.`);
  const actor = await signup.json();
  const joined = await fetch(`http://127.0.0.1:${functionsPort}/${project}/us-central1/joinSession`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.idToken}` },
    body: JSON.stringify({ data: { joinCode: sessionJoinCode, displayName: label } }),
  });
  const joinedReply = await joined.json().catch(() => ({}));
  assert.equal(joined.status, 200, `Normal session join failed for ${label}: ${joinedReply.error?.message ?? joined.status}`);
  const result = { localId: actor.localId, idToken: actor.idToken };
  extraActors.push(result);
  return result;
}
async function assignUnassignedReplacement(actor, replacementRoleId) {
  const current = (await f.session.get()).data();
  const eligibility = await command(f.gm, 'setReplacementEligibility', { instanceId: f.instanceId,
    requestId: randomUUID(), targetUid: actor.localId, reason: 'removed', expectedRevision: 0,
    expectedSetupRevision: current.setupRevision });
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
async function fundResource(shipId, resourceId, minimum) {
  await grantCurrentShip(shipId);
  const before = (await f.session.get()).get('shipResources')[shipId][resourceId];
  while (true) {
    const current = await f.session.get();
    const amount = current.get('shipResources')[shipId][resourceId];
    if (amount >= minimum) break;
    await command(f.gm, 'applyShipCounterSteps', { instanceId: f.instanceId, shipId, counter: 'resource', resourceId,
      steps: Array(Math.min(12, minimum - amount)).fill(1), requestId: randomUUID(),
      expectedRevision: current.get('vesselActionRevisions')?.[shipId] ?? 0 });
  }
  const after = (await f.session.get()).get('shipResources')[shipId][resourceId];
  ordinaryAllocations.push({ shipId, resourceId, before, after,
    boundary: 'Authenticated disposable-fixture resource allocation; ordinary costs and all damage/dice remain server-owned.' });
}
async function maintain(shipId, consoles, refuelCraftIds = []) {
  const roleId = { aegis: 'executive-officer', dione: 'dione-engineer', 'refinery-124': 'refinery-124-engineer',
    icebreaker: 'icebreaker-engineer', capybara: 'capybara-captain' }[shipId];
  const actor = f.byRole(roleId);
  assert.ok(actor, `Current ${roleId} is needed for ordinary ${shipId} maintenance.`);
  let bayIndex = 0;
  for (const action of ['begin', ...MAINTENANCE_ORDERS[shipId], 'end']) {
    if (action === 'runMaintenance') continue;
    const bays = SHIP_DAMAGE_DECKS[shipId].filter(card => card.systemId.startsWith('shuttle-bay'));
    const craftId = action === 'bays' ? refuelCraftIds[bayIndex] : undefined;
    const bayId = shipId === 'aegis' ? bays[bayIndex]?.systemId : bays[0]?.systemId;
    await command(actor, 'runMaintenance', { consoleRoleId: roleId, shipId, action, requestId: randomUUID(),
      expectedRevision: (await f.session.get()).get('maintenanceCycles')?.[shipId]?.revision ?? 0,
      ...(action === 'rations' ? { foodLevel: 3, waterLevel: 3 } : {}),
      ...(action === 'reactor' ? { consoles } : {}),
      ...(action === 'bays' ? { refuels: craftId ? { [bayId]: craftId } : {} } : {}) });
    if (action === 'bays') bayIndex += 1;
  }
}
async function maintainSmallShip(smallShipId, actor, consoles) {
  for (const action of ['begin','rations','unrest','riot','reactor','end']) {
    await command(actor, 'runSmallShipMaintenance', { smallShipId, action, requestId: randomUUID(),
      expectedRevision: (await f.session.get()).get('smallShipStates')[smallShipId].cycle.revision,
      ...(action === 'rations' ? { foodLevel: 3, waterLevel: 3 } : {}),
      ...(action === 'reactor' ? { consoles } : {}) });
  }
}
async function attackState() {
  const read = await authenticatedGet(f.gm, '/wolfAttackState/current');
  assert.equal(read.status, 200, 'Current GM must read the private combat state through Firestore Rules.');
  return read.data;
}
async function until(label, ready, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await attackState();
    if (ready(last)) return last;
    await delay(250);
  }
  throw new Error(`${label} not ready (step=${last?.currentStep}, revision=${last?.revision}).`);
}
async function sourceChoice(actor, sourceId, range, contactIndex = 0) {
  const view = await command(actor, 'getWolfRangeSupportActionChoice', { sourceId, range });
  const use = view.eligible === true && view.actionAvailable === true;
  const contacts = view.contacts.filter(contact => contact.available);
  await exactRetry(actor, 'commitWolfRangeSupportActionChoice', { sourceId, range, requestId: randomUUID(),
    expectedTurn: view.turn, expectedRevision: view.revision, use,
    ...(use && sourceId === 'boa' ? { targetContactId: contacts[contactIndex % Math.max(1, contacts.length)]?.contactId } : {}) });
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
    let committedSpecial = false;
    for (const actor of [f.gm, ...f.players]) {
      const reply = await f.call(actor, 'getWolfBoardingSpecialChoice', { sessionId: f.sessionId,
        ...(actor === f.gm ? { instanceId: f.instanceId } : {}) });
      if (reply.status !== 200 || reply.result?.type !== 'wolf-boarding-special-choice-view') continue;
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
        rulingText: 'No additional Commander consequence; continuing the disposable proof.' };
      await exactRetry(actor, 'commitWolfBoardingSpecialChoice', { requestId: randomUUID(), expectedTurn: view.turn,
        expectedRevision: view.revision, choice: decision, ...(choice.kind === 'commander-ruling' ? { instanceId: f.instanceId } : {}) });
      committedSpecial = true;
      break;
    }
    if (!committedSpecial) for (const actor of f.players) {
      const reply = await f.call(actor, 'getWolfBoardingDefenceChoice', { sessionId: f.sessionId });
      if (reply.status !== 200 || reply.result?.choiceStatus !== 'pending') continue;
      const view = reply.result;
      await exactRetry(actor, 'commitWolfBoardingDefenceChoice', { requestId: randomUUID(), expectedTurn: view.turn,
        expectedRevision: view.revision, targetShipId: view.targetShipId,
        securityTeams: Math.min(1, view.availableSecurityTeams) });
      break;
    }
    await delay(250);
  }
  throw new Error('Ordinary boarding choices did not reach finalization.');
}
async function routeShuttle(actor, shuttleId, destinationShipId, cycle) {
  let current = (await f.session.get()).data();
  const controlRevision = current.shuttleControl[shuttleId].revision;
  const departure = await command(actor, 'requestShuttleDeparture', { requestId: randomUUID(), shuttleId,
    destinationShipId, expectedControlRevision: controlRevision, expectedCycle: cycle });
  await command(actor, 'beginShuttleTransit', { requestId: randomUUID(), shuttleId,
    expectedDepartureRequestId: departure.requestId, expectedControlRevision: controlRevision, expectedCycle: cycle });
  const ref = f.db.doc(`sessions/${f.sessionId}/shuttleDepartures/${shuttleId}`);
  const deadline = Date.now() + 90_000;
  let route;
  while (Date.now() < deadline) {
    route = (await ref.get()).data();
    if (route?.status === 'in-transit' && Date.now() >= Date.parse(route.arrivesAt)) break;
    await delay(500);
  }
  assert.ok(route?.status === 'in-transit' && Date.now() >= Date.parse(route.arrivesAt), `${shuttleId} completed its normal 60-second transit.`);
  current = (await f.session.get()).data();
  return exactRetry(actor, 'completeShuttleArrival', { shuttleId, transitRequestId: route.transitRequestId,
    expectedControlRevision: current.shuttleControl[shuttleId].revision });
}

try {
  async function joinPressPlayer(joinCode) {
    sessionJoinCode = joinCode;
    const env = Object.fromEntries((await readFile('.env.emulators.local', 'utf8')).trim().split('\n').map(line => line.split('=')));
    const project = process.env.VITE_FIREBASE_PROJECT_ID;
    const authPort = Number(env.VITE_FIREBASE_AUTH_EMULATOR_PORT);
    const functionsPort = Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT);
    const signup = await fetch(`http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${project}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
    });
    assert.equal(signup.status, 200, 'Normal Auth actor creation failed for Press.');
    const actor = await signup.json();
    const joined = await fetch(`http://127.0.0.1:${functionsPort}/${project}/us-central1/joinSession`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.idToken}` },
      body: JSON.stringify({ data: { joinCode, displayName: 'PC09 row-4 Press' } }),
    });
    const reply = await joined.json().catch(() => ({}));
    assert.equal(joined.status, 200, `Normal Press join failed: ${reply.error?.message ?? joined.status}`);
    return { localId: actor.localId, idToken: actor.idToken };
  }
  f = await createPc07AuthenticatedSession('PC09 row-4 ordinary aftermath branches', 20,
    { keepAlive: true, expansion: 'capybara', joinPressPlayer });
  const eo = f.byRole('executive-officer'), wing = f.byRole('wing-commander');
  const admiral = f.byRole('admiral'), commander = f.byRole('shepherd-scientist'), warrior = f.byRole('quellon-captain');
  const firstTurn = (await f.session.get()).get('turnPhase');
  const setupCycle = (await f.session.get()).get('currentTurn');
  await f.session.update({ turnPhase: { ...firstTurn,
    teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 900_000).toISOString() } });
  await command(wing, 'beginOpenAirspacePhase', { expectedTurn: setupCycle });
  for (const smallShipId of ['gorgoneion', ...(needsBranch('warrior-salvage') ? ['warrior'] : [])]) {
    await command(f.gm, 'setSmallShipDocking', { instanceId: f.instanceId, requestId: randomUUID(), smallShipId,
      hostShipId: 'aegis', docked: true, expectedRevision: 0 });
  }
  await replace(admiral, 'gorgoneion-captain');
  await replace(commander, 'wolf-commander');
  if (needsBranch('warrior-salvage')) await replace(warrior, 'warrior-captain');
  const deferredWindow = await command(f.gm, 'setWolfAttackWindow', { instanceId: f.instanceId, requestId: randomUUID(),
    expectedRevision: 0, status: 'deferred' });
  await command(f.gm, 'advanceTurn', { instanceId: f.instanceId, requestId: randomUUID(), expectedTurn: setupCycle,
    overridePhaseTimer: true });
  let current = (await f.session.get()).data();
  const attackTurn = current.currentTurn;
  const hold = current.turnPhase.timerPause;
  await command(eo, 'clearTurnAdvanceInterstitial', { requestId: randomUUID(), expectedCycle: attackTurn, expectedPausedAt: hold.pausedAt });
  const rationInputs = (await f.session.get()).data();
  for (const shipId of ['aegis','dione','refinery-124','icebreaker','capybara']) {
    const population = rationInputs.shipSurvivors?.[shipId] ?? INITIAL_SHIP_SURVIVORS[shipId];
    const rations = shipRationSchedule(shipId, population);
    await fundResource(shipId, 'food', rations.food[3] * (shipId === 'aegis' ? 2 : 1) + (shipId === 'aegis' ? 16 : 0));
    await fundResource(shipId, 'water', rations.water[3] * (shipId === 'aegis' ? 2 : 1) + (shipId === 'aegis' ? 12 : 0));
  }
  await fundResource('aegis','materials',6);
  await fundResource('aegis','ore',9);
  await fundResource('capybara','scrap',4);
  await maintain('aegis',['command-and-control','missile-launchers','point-defence-lasers','fighter-bay-alpha','fighter-bay-bravo'],['pallas','starlight']);
  await maintain('dione',['fighter-bay'],['maliades']);
  await maintain('refinery-124',['fighter-bay'],[]);
  await maintain('icebreaker',['mining-drone-control'],['highwall']);
  if (needsBranch('macaw-repair') || needsBranch('macaw-scrap') || needsBranch('boa-scrap')) {
    await maintain('capybara',['scrap-refinery'],['macaw']);
  }
  await maintainSmallShip('gorgoneion',admiral,['missile-array','force-field-projector']);
  if (needsBranch('warrior-salvage')) await maintainSmallShip('warrior',warrior,['salvage-drones']);
  current = (await f.session.get()).data();
  await f.session.update({ turnPhase: { ...current.turnPhase,
    teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 900_000).toISOString() } });
  await command(wing,'beginOpenAirspacePhase',{expectedTurn:attackTurn});
  current = (await f.session.get()).data();
  if (needsBranch('boa-scrap')) {
    await exactRetry(f.byRole('capybara-recycler'),'transferShuttleCargoCommand',{requestId:randomUUID(),
      shuttleId:'boa',resourceId:'scrap',direction:'load',amount:3,expectedControlRevision:current.shuttleControl.boa.revision});
  }
  await grantCurrentShip('aegis');
  await command(f.gm,'unlockPressAirspace',{instanceId:f.instanceId});
  await command(f.gm, 'setWolfAttackWindow', { instanceId: f.instanceId, requestId: randomUUID(),
    expectedRevision: deferredWindow.revision, status: 'due' });

  const shipIds = Array(8).fill('wolf-cruiser'); // legal later force: 8 × printed capacity 3 = 24.
  const preparation = await command(f.gm,'stageWolfAttackPreparation',{instanceId:f.instanceId,requestId:randomUUID(),
    expectedRevision:0,turn:attackTurn,shipIds,targetMode:'pre-rolled',targetAssignments:[],modifiers:[],notes:'Bounded row-4 authenticated aftermath proof; server targeting and all combat dice remain random.'});
  const declaration = await command(f.gm,'declareWolfAttack',{instanceId:f.instanceId,requestId:randomUUID(),expectedRevision:preparation.revision});
  const field = await command(admiral,'getWolfForceFieldChoice');
  if (field.choiceStatus === 'pending') await exactRetry(admiral,'commitWolfForceFieldChoice',{requestId:randomUUID(),
    expectedTurn:field.turn,expectedRevision:field.revision,targetShipId:'aegis'});
  const warhead = await command(eo,'getAegisEnrichedWarheadChoice');
  if (warhead.choiceStatus === 'pending') await exactRetry(eo,'commitAegisEnrichedWarheadChoice',{requestId:randomUUID(),
    expectedTurn:warhead.turn,expectedRevision:warhead.revision,choice:warhead.eligible?'enrich':'pass'});
  for (const wingId of ['fighter-wing-alpha','fighter-wing-bravo']) {
    const launch = await command(wing,'getAegisFighterWingLaunch',{wingId});
    await exactRetry(wing,'launchAegisFighterWing',{wingId,requestId:randomUUID(),expectedTurn:launch.turn,
      expectedRevision:launch.revision,expectedWingRevision:launch.wingRevision});
  }
  const pdf = f.byRole('refinery-124-pdf-colonel');
  const pdfView = await command(pdf,'getPdfEscortWingLaunch');
  await exactRetry(pdf,'launchPdfEscortWing',{requestId:randomUUID(),expectedTurn:pdfView.turn,
    expectedRevision:pdfView.revision,expectedWingRevision:pdfView.wingRevision});
  const dioneEngineer = f.byRole('dione-engineer');
  const maliades = await command(dioneEngineer,'getDioneMaliadesLaunch');
  await exactRetry(dioneEngineer,'launchDioneMaliades',{requestId:randomUUID(),expectedTurn:maliades.turn,expectedRevision:maliades.revision});
  await until('targeting',state=>state.currentStep==='targeting');
  const commanderView = await command(commander,'getWolfCommanderTargeting');
  await command(commander,'finishWolfCommanderTargetingRerolls',{requestId:randomUUID(),expectedTurn:commanderView.turn,
    expectedRevision:commanderView.revision});
  const cnc = await command(eo,'getAegisCommandAndControl');
  await exactRetry(eo,'passAegisCommandAndControl',{requestId:randomUUID(),expectedTurn:cnc.turn,expectedRevision:cnc.revision});
  for (const range of ['long-range','medium-range','short-range']) {
    await until(range,state=>state.currentStep===range);
    if (range !== 'long-range') {
      await chooseFlights(range);
      await sourceChoice(f.byRole('icebreaker-miner'),'highwall',range,2);
    }
    await sourceChoice(admiral,'gorgoneion-missile-array',range);
    await sourceChoice(f.byRole('capybara-recycler'),'boa',range,3);
    const choice = await command(eo,'getWolfRangeActionChoice');
    const lock = await exactRetry(eo,'commitWolfRangeActionChoice',{requestId:randomUUID(),expectedTurn:choice.turn,
      expectedRevision:choice.revision,range,actionIds:choice.eligibleActions.map(action=>action.actionId)});
    if (lock.choiceStatus === 'targets-required') {
      const targetView = await command(eo,'getWolfRangeActionChoice');
      const assignments = safeTargetAssignments(targetView);
      await exactRetry(eo,'assignWolfRangeTargets',{requestId:randomUUID(),expectedTurn:targetView.turn,
        expectedRevision:targetView.revision,range,assignments});
    }
    await until(`completed ${range}`,state=>state.currentStep!==range || state.status==='resolved');
  }
  const finalState = await completeBoarding();
  assert.equal(finalState.status,'resolved');
  assert.equal(finalState.currentStep,'resolved');
  assert.match(finalState.attackId, /^wolf-attack-[a-f0-9-]+$/, 'Atomic finalization must retain the declared attack identity.');
  const receipt = finalState.calculationReceipt;
  assert.ok(Array.isArray(receipt.fleetDamage) && receipt.fleetDamage.length > 0);
  current = (await f.session.get()).data();

  const damageRows = receipt.fleetDamage;
  const scrapCandidates = damageRows.filter(row=>row.amount>=3 && row.state?.destroyed===false && current.shipDamage?.[row.target]?.destroyed!==true);
  const scrapHostMacaw = scrapCandidates[0]?.target;
  const scrapHostBoa = scrapCandidates.find(row=>row.target!==scrapHostMacaw)?.target;
  if (needsBranch('macaw-scrap') && scrapHostMacaw) await routeShuttle(f.byRole('capybara-captain'),'macaw',scrapHostMacaw,attackTurn);
  if (needsBranch('boa-scrap') && scrapHostBoa) await routeShuttle(f.byRole('capybara-recycler'),'boa',scrapHostBoa,attackTurn);
  const casualtyHosts = damageRows.filter(row=>row.draws?.some(draw=>draw.casualty) && row.state?.destroyed===false && current.shipDamage?.[row.target]?.destroyed!==true).map(row=>row.target);
  if (needsBranch('doctor')) {
    for (const shipId of new Set(casualtyHosts)) {
      await fundResource(shipId,'food',3);
      await fundResource(shipId,'water',3);
    }
  }
  const doctor = needsBranch('doctor') ? await joinUnassignedActor('PC09 row-4 Doctor') : undefined;
  if (doctor) await assignUnassignedReplacement(doctor, 'doctor');
  const press = f.press;
  assert.ok(press?.localId && press?.idToken, 'A separate normally joined Press actor is required.');
  const aegisDamage = current.shipDamage?.aegis;
  const repairHostShipId = aegisDamage?.destroyed !== true && aegisDamage?.damagedSystemIds?.includes('construction-bay')
    ? 'aegis' : scrapHostMacaw ?? damageRows.find(row=>row.state?.destroyed===false && row.state?.damagedSystemIds?.length)?.target;
  if (needsBranch('macaw-repair') && scrapHostMacaw && scrapHostMacaw !== repairHostShipId) {
    await routeShuttle(f.byRole('capybara-captain'),'macaw',repairHostShipId,attackTurn);
  }
  if (needsBranch('macaw-repair') && !scrapHostMacaw && repairHostShipId) {
    await routeShuttle(f.byRole('capybara-captain'),'macaw',repairHostShipId,attackTurn);
  }
  const branchActors = { doctor, warrior, macaw:f.byRole('capybara-captain'), boa:f.byRole('capybara-recycler'),
    wingCommander:wing, press, repairHostShipId,
    requiredBranches };
  let aftermath;
  try {
    aftermath = await runPc09AftermathProof(f,{directory:join(dirname(evidencePath),basename(evidencePath,'.json')),finalState,actorAllocations:branchActors,
      advanceNextTeam:async({attackTurn:completedTurn})=>{
        await command(f.gm,'advanceTurn',{instanceId:f.instanceId,requestId:randomUUID(),expectedTurn:completedTurn,overridePhaseTimer:true});
        const next=(await f.session.get()).data();
        if(next.turnPhase.timerPause?.reason==='turn-interstitial') await command(eo,'clearTurnAdvanceInterstitial',{requestId:randomUUID(),
          expectedCycle:next.currentTurn,expectedPausedAt:next.turnPhase.timerPause.pausedAt});
        await maintain('aegis',['construction-bay'],[]);
        return {status:'complete'};
      }});
  } catch (error) {
    if (error?.code !== 'PC09_ORDINARY_BRANCH_MISSING') throw error;
    const blocked = { kind:'normal-authenticated-pc09-aftermath-branch-proof',status:'blocked',sessionDeletedAfterRun:true,
      attack:{attackId:finalState.attackId,cycle:attackTurn,legalLaterCapacity:24,shipCount:8},
      observed:{damagedHostCount:damageRows.filter(row=>row.amount>0).length,
        casualtyHostIds:casualtyHosts,qualifyingScrapHostIds:scrapCandidates.map(row=>row.target),
        currentUniqueDockings:(await f.session.get()).get('shuttleDockings')},
      blockers:error.blockers,ordinaryResourceAllocations:ordinaryAllocations,
      noAdminDamageOrReceiptSeeding:true,noGmRepairAll:true,allCombatResultsServerGenerated:true};
    await mkdir(dirname(evidencePath),{recursive:true});
    await writeFile(evidencePath,`${JSON.stringify(blocked,null,2)}\n`);
    throw error;
  }
  const proof={kind:'normal-authenticated-pc09-aftermath-branch-http-proof',status:'complete',
    attackId:finalState.attackId,cycle:attackTurn,legalLaterForce:{shipCount:8,shipId:'wolf-cruiser',damageCapacity:24},
    targetMode:'pre-rolled-server-targeting',ordinaryManualRangeAssignments:true,actions,ordinaryResourceAllocations:ordinaryAllocations,
    observed:{damagedHostCount:damageRows.filter(row=>row.amount>0).length,
      casualtyHostIds:casualtyHosts,qualifyingScrapHostIds:scrapCandidates.map(row=>row.target)},
    aftermath,productionGameplay:false,preparedScene:false,identitiesRetained:false,completedAt:new Date().toISOString()};
  await mkdir(dirname(evidencePath),{recursive:true});
  await writeFile(evidencePath,`${JSON.stringify(proof,null,2)}\n`);
  console.log(`PC09 aftermath HTTP proof complete: ${evidencePath}`);
} catch (error) {
  const minimal={kind:'normal-authenticated-pc09-aftermath-branch-http-proof',status:'failed',message:error.message,
    code:error.code??null,blockers:error.blockers??[],actions,ordinaryResourceAllocations:ordinaryAllocations};
  await mkdir(dirname(evidencePath),{recursive:true});
  await writeFile(evidencePath,`${JSON.stringify(minimal,null,2)}\n`).catch(()=>{});
  throw error;
} finally {
  if (f) { await f.cleanup(); await f.db.terminate(); }
}
