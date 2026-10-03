import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidencePath = process.env.PC07_UNAVAILABLE_EVIDENCE_PATH;
const uiDirectory = process.env.PC07_PRESS_UI_DIR;
assert.ok(evidencePath && uiDirectory, 'External HTTP and rendered evidence paths are required.');
await mkdir(uiDirectory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })).newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function joinPressPlayer(joinCode) {
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
  await page.getByRole('button', { name: 'Join a session', exact: true }).click();
  await page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true }).waitFor();
  for (const checkbox of await page.getByRole('checkbox', { name: /^Acknowledge regulation/ }).all()) await checkbox.check();
  await page.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true }).and(page.locator(':enabled')).click();
  await page.waitForFunction(async () => Boolean((await import('/src/store/useSessionStore.ts')).useSessionStore.getState().me));
  // Observe the identity made by normal UI join; never inject or retain tokens.
  return page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
  });
}
const f = await createPc07AuthenticatedSession('PC07 unavailable EO and normal Press', 8, { keepAlive: true, joinPressPlayer });
const { session, sessionId, db, gm, instanceId, press, call, ok } = f;
const stateRef = db.doc(`sessions/${sessionId}/wolfAttackState/current`);
const checks = {};
const actions = [];
async function command(actor, name, data = {}) {
  let reply = await call(actor, name, { sessionId, ...data });
  for (let retry = 0; reply.status === 429 && retry < 12; retry++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    reply = await call(actor, name, { sessionId, ...data });
  }
  const result = ok(reply, name);
  assert.notEqual(result?.status, 'stale', `${name} returned stale authority`);
  actions.push({ name, status: result?.status ?? 'committed' });
  return result;
}
async function until(predicate, label) {
  for (let i = 0; i < 180; i++) {
    const state = (await stateRef.get()).data();
    if (predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error(`Automatic unavailable attack did not reach ${label}.`);
}
async function open(cycle) {
  const phase = (await session.get()).get('turnPhase');
  await session.update({ turnPhase: { ...phase, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600000).toISOString() } });
  await command(f.byRole('wing-commander'), 'beginOpenAirspacePhase', { expectedTurn: cycle });
}
async function maintenance(cycle) {
  let revision = (await session.get()).get('maintenanceCycles')?.aegis?.revision ?? 0;
  for (const action of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays', 'end']) {
    if (action === 'reactor' && (await session.get()).get('shipDamage')?.aegis?.damagedSystemIds?.length) {
      await command(gm, 'repairAllShipDamage', { instanceId, shipId: 'aegis', requestId: randomUUID(),
        expectedRevision: (await session.get()).get('vesselActionRevisions')?.aegis ?? 0 });
    }
    const result = await command(gm, 'runMaintenance', { instanceId, shipId: 'aegis', action, expectedRevision: revision,
      requestId: randomUUID(), ...(action === 'rations' ? { foodLevel: cycle === 1 ? 0 : 1, waterLevel: cycle === 1 ? 0 : 1 } : {}),
      ...(action === 'reactor' ? { consoles: ['jump-drive', 'command-and-control', 'missile-launchers', 'point-defence-lasers'] } : {}),
      ...(action === 'bays' ? { refuels: {} } : {}) });
    revision = result.cycle.revision;
  }
}
try {
  assert.ok(!f.roles.includes('executive-officer'));
  const lease = (await db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`).get()).data();
  await command(gm, 'setGmShipConsoleWriteGrant', { instanceId, shipId: 'aegis', enabled: true,
    claimedAt: typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString() });
  await maintenance(1);
  await open(1);
  await command(gm, 'unlockPressAirspace', { instanceId });
  const before = await command(press, 'getCurrentMemberSession');
  assert.deepEqual(before.session.shipResources, {});
  assert.deepEqual(Object.keys(before.session.shuttleControl), ['snn-press-shuttle']);
  assert.equal(before.session.shuttleDockings.length, 1);
  assert.equal(before.session.shuttleDockings[0].shuttleId, 'snn-press-shuttle');
  await page.goto('http://127.0.0.1:5174/console');
  await page.getByRole('link', { name: 'Press Officer', exact: true }).click();
  await page.getByRole('region', { name: 'Shuttle control', exact: true }).waitFor();
  await page.waitForTimeout(5500); // Allow an ordinary member poll.
  await page.getByLabel('Destination ship', { exact: true }).selectOption('icebreaker');
  await page.getByRole('button', { name: 'Request departure', exact: true }).click();
  await page.getByRole('button', { name: 'Begin transit', exact: true }).and(page.locator(':enabled')).click();
  await page.waitForFunction(async () => (await import('/src/store/useSessionStore.ts')).useSessionStore.getState().session
    ?.shuttleDockings?.some(dock => dock.shuttleId === 'snn-press-shuttle' && dock.shipId === 'icebreaker'), undefined, { timeout: 30000 });
  await page.waitForTimeout(5500);
  await page.getByRole('region', { name: 'Shuttle control', exact: true }).waitFor();
  const after = await command(press, 'getCurrentMemberSession');
  assert.deepEqual(after.session.shipResources, {});
  assert.equal(after.session.shuttleControl['snn-press-shuttle'].holderUid, press.localId);
  assert.equal(after.session.shuttleDockings[0].shipId, 'icebreaker');
  assert.deepEqual(errors, []);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${uiDirectory}/normal-press-after-poll-and-movement.png`, fullPage: true });
  checks.normalPressOwnConsolePersistsAcrossPollAndUiMovementWithoutVesselMaps = true;

  await command(gm, 'setWolfAttackWindow', { instanceId, requestId: randomUUID(), expectedRevision: 0, status: 'deferred' });
  await command(gm, 'advanceTurn', { instanceId, requestId: randomUUID(), expectedTurn: 1, overridePhaseTimer: true });
  const hold = (await session.get()).get('turnPhase').timerPause;
  await command(f.byRole('wing-commander'), 'clearTurnAdvanceInterstitial', { expectedCycle: 2, expectedPausedAt: hold.pausedAt, requestId: randomUUID() });
  await maintenance(2);
  await open(2);
  await command(gm, 'unlockPressAirspace', { instanceId });
  const phaseBefore = (await session.get()).get('turnPhase');
  await command(gm, 'setWolfAttackWindow', { instanceId, requestId: randomUUID(), expectedRevision: 1, status: 'due' });
  const preparation = await command(gm, 'stageWolfAttackPreparation', { instanceId, requestId: randomUUID(), expectedRevision: 0, turn: 2,
    shipIds: ['wolf-fighter-wing', 'wolf-fighter-wing', 'wolf-assault-transport'], targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' });
  const declarationRequest = { instanceId, requestId: randomUUID(), expectedRevision: preparation.revision };
  const declaration = await command(gm, 'declareWolfAttack', declarationRequest);
  await until(state => state?.currentStep === 'boarding' || state?.status === 'resolved', 'automatic ranges and boarding');
  for (let i = 0; i < 150 && (await stateRef.get()).get('status') !== 'resolved'; i++) {
    const state = (await stateRef.get()).data();
    const pending = state.decisionSummary?.boarding?.targets?.find(choice => choice.status === 'pending' && !state.boardingDefenceChoices?.[choice.targetShipId]);
    if (!pending) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
    const actor = f.players.find(actor => pending.actors.some(candidate => candidate.uid === actor.localId));
    assert.ok(actor, 'A current printed crew owns boarding.');
    const choice = await command(actor, 'getWolfBoardingDefenceChoice');
    const request = { requestId: randomUUID(), expectedTurn: 2, expectedRevision: choice.revision, targetShipId: choice.targetShipId,
      securityTeams: Math.min(1, choice.availableSecurityTeams) };
    const committed = await command(actor, 'commitWolfBoardingDefenceChoice', request);
    assert.deepEqual(await command(actor, 'commitWolfBoardingDefenceChoice', request), committed);
  }
  const finalState = await until(state => state?.status === 'resolved' && state?.currentStep === 'resolved', 'atomic finalization');
  for (const range of ['long-range', 'medium-range', 'short-range']) assert.equal(finalState.rangeDecisions[range].status, 'unavailable');
  const published = (await db.doc(`sessions/${sessionId}/wolfAttackAudience/current`).get()).data();
  assert.ok(published, 'Automatic unavailable results must publish a member view.');
  assert.equal(published.status, 'resolved');
  assert.equal(published.results.filter(result => result.effect.includes('unavailable')).length, 3);
  checks.allUnavailableChargedRangesPublishAndCompleteBoarding = true;
  const finalSession = (await session.get()).data();
  assert.equal(finalState.airspaceLocked, false);
  assert.equal(finalSession.turnPhase.airspace.state, 'lifted');
  assert.equal(finalSession.turnPhase.airspace.pressAccess, phaseBefore.airspace.pressAccess);
  assert.ok(Date.parse(finalSession.turnPhase.openAirspaceEndsAt) >= Date.parse(phaseBefore.openAirspaceEndsAt));
  const once = { phase: finalSession.turnPhase, damage: finalSession.shipDamage, resources: finalSession.shipResources, population: finalSession.shipSurvivors };
  assert.deepEqual(await command(gm, 'declareWolfAttack', declarationRequest), declaration);
  await page.waitForTimeout(1000);
  const replay = (await session.get()).data();
  assert.deepEqual({ phase: replay.turnPhase, damage: replay.shipDamage, resources: replay.shipResources, population: replay.shipSurvivors }, once);
  checks.unavailableAttackReducesOnceAndRestoresSharedClockPressAndMovement = true;
  await command(press, 'requestShuttleDeparture', { requestId: randomUUID(), shuttleId: 'snn-press-shuttle', destinationShipId: 'quellon',
    expectedControlRevision: finalSession.shuttleControl['snn-press-shuttle'].revision, expectedCycle: 2 });
  checks.normalPressMovementAcceptedAfterUnavailableAttack = true;
  await writeFile(evidencePath, JSON.stringify({ kind: 'normal-authenticated-local-emulator-http-ui-unavailable-eo-and-press',
    sourceCommit: process.env.PC07_SOURCE_COMMIT, checks, actions, ordinaryRoster: 8, independentPress: true,
    fixtureChanges: ['disposable clock deadlines only'], normalFacilitatorDecisions: ['scoped AEGIS console grant', 'early cycle advancement', 'audited damage correction if required'],
    preparedScene: false, productionGameplay: false, identitiesRetained: false, completedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('Normal unavailable EO attack and Press UI movement proof passed.');
} catch (error) {
  await page.screenshot({ path: `${uiDirectory}/failure.png`, fullPage: true });
  await writeFile(`${evidencePath}.failure.json`, JSON.stringify({ checks, actions, error: error.message, browserErrors: errors,
    currentAttack: (await stateRef.get()).data(), body: await page.locator('body').innerText() }, null, 2) + '\n');
  throw error;
} finally {
  const keepCleanupAlive = setInterval(() => {}, 1000);
  try { await browser.close(); await f.cleanup(); await db.terminate(); }
  finally { clearInterval(keepCleanupAlive); }
}
