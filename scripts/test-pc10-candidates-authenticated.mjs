import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const output = process.env.PC10_CANDIDATE_EVIDENCE_PATH;
const origin = process.env.PC10_CANDIDATE_UI_URL;
assert.ok(output && origin, 'Use an external evidence path and the isolated app URL.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { MAINTENANCE_ORDERS } = require('../functions/lib/maintenanceOrder.js');
const { shipForRole } = require('../functions/lib/crewAccess.js');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const evidence = { kind: 'pc10-fresh-normal-auth-candidate-nebula-and-ui', actions: [], checks: {}, geometry: [],
  fixtureChanges: ['normal create/join/casting/explicit loyalty/GM grant/start handlers',
    'normal GM counter adjustments supply fuel/food/water for this bounded proof',
    'only Team clock deadlines are accelerated; no chart, navigation, scout, candidate, dice, attack, or terminal state is seeded'],
  credentialsRetained: false, sessionCleanup: 'recursiveDelete in finally' };
let f;
async function command(actor, name, data = {}) {
  const reply = await f.call(actor, name, { sessionId: f.sessionId, ...data });
  evidence.actions.push({ name, status: reply.status, ...(reply.error?.status ? { error: reply.error.status } : {}) });
  assert.equal(reply.status, 200, `${name}: ${reply.error?.message}`);
  assert.notEqual(reply.result?.status, 'stale', `${name}: stale`);
  return reply.result;
}
async function joinedUi(code) {
  await page.goto(origin);
  await page.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(code);
  await page.getByRole('button', { name: 'Join a session', exact: true }).click();
  const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
  await waiver.waitFor();
  for (const checkbox of await waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ }).all()) await checkbox.check();
  await waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true }).click();
  await page.waitForFunction(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    return auth().currentUser?.uid === useSessionStore.getState().me?.uid;
  });
  return page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
  });
}
async function gmGrant(shipId) {
  const lease = (await f.db.doc(`sessions/${f.sessionId}/gmInstances/${f.instanceId}`).get()).data();
  const claimedAt = typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString();
  await command(f.gm, 'setGmShipConsoleWriteGrant', { instanceId: f.instanceId, claimedAt, shipId, enabled: true });
}
async function repair(shipId) {
  await gmGrant(shipId);
  const snapshot = await f.session.get();
  await command(f.gm, 'repairAllShipDamage', { instanceId: f.instanceId, shipId, requestId: randomUUID(),
    expectedRevision: snapshot.get('vesselActionRevisions')?.[shipId] ?? 0 });
}
async function maintenance(shipId) {
  const roleId = shipId === 'aegis' ? 'executive-officer' : `${shipId}-engineer`;
  const actor = f.byRole(roleId);
  await command(actor, 'refreshPresence', { activeConsoleRoleId: roleId });
  let revision = (await f.session.get()).get('maintenanceCycles')?.[shipId]?.revision ?? 0;
  const bayCraft = shipId === 'aegis' ? 'starlight' : shipId === 'quellon' ? 'hummingbird' : undefined;
  for (const [i, action] of ['begin', ...MAINTENANCE_ORDERS[shipId], 'end'].entries()) {
    const result = await command(actor, 'runMaintenance', { shipId, action, requestId: randomUUID(), expectedRevision: revision,
      ...(action === 'rations' ? { foodLevel: 3, waterLevel: 3 } : {}),
      ...(action === 'reactor' ? { consoles: ['jump-drive'] } : {}),
      ...(action === 'bays' ? { refuels: bayCraft && (shipId !== 'aegis' || i === 6)
        ? { [shipId === 'aegis' ? 'shuttle-bay-zeta' : 'shuttle-bay']: bayCraft } : {} } : {}) });
    revision = result.cycle.revision;
    if (action === 'begin' || action === 'riot') await repair(shipId);
  }
}
async function coordination() {
  const snapshot = await f.session.get(); const phase = snapshot.get('turnPhase');
  // Clock acceleration is disclosed and separate from gameplay state; the integrated
  // full-game demo can replace this with its ordinary manual phase command.
  await f.session.update({ turnPhase: { ...phase, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString() } });
  await command(f.byRole('wing-commander'), 'beginOpenAirspacePhase', { expectedTurn: snapshot.get('currentTurn') });
}
async function scouts(coordinate) {
  for (const [roleId, entitlementId] of [['shepherd-scientist', 'endeavour'], ['wing-commander', 'starlight'], ['quellon-explorer', 'hummingbird']]) {
    const actor = f.byRole(roleId);
    await command(actor, 'refreshPresence', { activeConsoleRoleId: roleId });
    const requestId = randomUUID();
    const data = { requestId, entitlementId, targetCoordinate: coordinate };
    await command(actor, 'requestScout', data);
    await command(actor, 'requestScout', data);
    const ref = f.db.doc(`sessions/${f.sessionId}/deepNebulaScans/${requestId}`);
    for (let i = 0; i < 100 && !(await ref.get()).exists; i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await ref.get()).exists, true, 'The real automatic scout resolver must create one protected marker.');
  }
}
try {
  await mkdir(dirname(output), { recursive: true });
  f = await createPc07AuthenticatedSession('PC10 candidate authenticated proof', 18, {
    keepAlive: true, browserRoleId: 'admiral', joinBrowserPlayer: joinedUi,
  });
  const snapshot = await f.session.get(); const ships = snapshot.get('activeVesselIds');
  const gmSource = await f.db.doc(`sessions/${f.sessionId}/gmDiscovery/current`).get();
  const coordinate = Object.entries(gmSource.get('organiserSites')).find(([, site]) => site.code === 'O')?.[0];
  assert.ok(coordinate, 'Use the current entitled GM chart projection.');
  for (const shipId of ships) {
    for (const resourceId of ['fuel', 'food', 'water']) {
      for (const count of [12, 12, 6]) {
        const current = await f.session.get();
        await command(f.gm, 'applyShipCounterSteps', { instanceId: f.instanceId, shipId, counter: 'resource', resourceId,
          steps: Array(count).fill(1), expectedRevision: current.get('vesselActionRevisions')?.[shipId] ?? 0,
          requestId: randomUUID() });
      }
    }
    await repair(shipId); await maintenance(shipId);
  }
  await coordination();
  for (const shipId of ships) {
    const roleId = shipId === 'aegis' ? 'admiral' : `${shipId}-captain`; const actor = f.byRole(roleId);
    await command(actor, 'refreshPresence', { activeConsoleRoleId: roleId });
    const current = await f.session.get();
    const jumped = await command(actor, 'jumpShip', { shipId, destination: coordinate, requestId: randomUUID(),
      expectedRevision: current.get('vesselActionRevisions')?.[shipId] ?? 0 });
    assert.equal(jumped.status, 'jumped');
  }
  await scouts(coordinate);
  const navigation = await f.db.doc(`sessions/${f.sessionId}/serverState/navigation`).get();
  await command(f.gm, 'confirmFleetPartition', { instanceId: f.instanceId, requestId: randomUUID(), expectedNavigationRevision: navigation.get('revision') });
  await command(f.gm, 'advanceTurn', { instanceId: f.instanceId, requestId: randomUUID(), expectedTurn: 1,
    overridePhaseTimer: true, skipTurnStartAnnouncement: true });
  const phase = (await f.session.get()).get('turnPhase');
  if (phase.timerPause) await command(f.byRole('admiral'), 'clearTurnAdvanceInterstitial', {
    requestId: randomUUID(), expectedCycle: 2, expectedPausedAt: phase.timerPause.pausedAt });
  for (const shipId of ships) await maintenance(shipId);
  await coordination(); await scouts(coordinate);
  const markers = await f.db.collection(`sessions/${f.sessionId}/deepNebulaScans`).get();
  assert.equal(markers.size, 6, 'Exact request retries must not repeat the hidden scout increment.');
  evidence.checks.sixSourceProducedHiddenScouts = true;
  await page.goto(`${origin}/#/console`);
  const panel = page.getByRole('region', { name: 'Candidate preparation and actions' }).first();
  await panel.getByRole('heading', { name: 'Deep Nebula', exact: true }).waitFor();
  await panel.getByText('Cycle 2 // candidate revision 0', { exact: true }).waitFor();
  const text = await panel.innerText(); assert.doesNotMatch(text, /scout bonus|scouts:|priorLosses|threshold|hiddenScoutCount/);
  for (const [name, viewport] of [['phone320', { width: 320, height: 844 }], ['phone390', { width: 390, height: 844 }],
    ['desktop', { width: 1440, height: 900 }], ['landscape', { width: 844, height: 390 }]]) {
    await page.setViewportSize(viewport); await panel.scrollIntoViewIfNeeded();
    const geometry = await panel.evaluate(element => ({ width: element.getBoundingClientRect().width,
      overflow: element.scrollWidth > element.clientWidth + 1, font: getComputedStyle(element.querySelector('h2')).fontFamily,
      buttons: [...element.querySelectorAll('button')].map(button => ({ text: button.innerText,
        height: button.getBoundingClientRect().height, enabled: !button.disabled })) }));
    assert.equal(geometry.overflow, false); assert.ok(geometry.buttons.every(button => button.height >= 44));
    evidence.geometry.push({ name, viewport, ...geometry });
    await page.screenshot({ path: `${dirname(output)}/candidate-${name}.png`, fullPage: true });
    await panel.screenshot({ path: `${dirname(output)}/candidate-panel-${name}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await command(f.byRole('admiral'), 'refreshPresence', { activeConsoleRoleId: 'admiral' });
  await panel.getByRole('button', { name: /Long jump into Nebula.*aegis/ }).click();
  await panel.getByRole('status').filter({ hasText: /Long jump committed/ }).waitFor();
  const first = await f.db.collection(`sessions/${f.sessionId}/candidateActionReceipts`).get();
  const original = first.docs.find(doc => doc.get('fingerprint.actorUid') === f.byRole('admiral').localId);
  assert.ok(original, 'The actual browser button must commit one ordinary callable request.');
  for (const shipId of ships.filter(id => id !== 'aegis')) {
    const roleId = `${shipId}-captain`; const actor = f.byRole(roleId);
    await command(actor, 'refreshPresence', { activeConsoleRoleId: roleId });
    const groupId = (await f.db.doc(`sessions/${f.sessionId}/players/${actor.localId}`).get()).get('fleetGroupId');
    const view = await command(actor, 'readCandidateWorkspace', { expectedGroupId: groupId });
    const data = { requestId: randomUUID(), expectedRevision: view.revision, expectedGroupId: groupId, code: 'O',
      coordinate, action: 'nebula-jump', shipId };
    const committed = await command(actor, 'executeCandidateAction', data);
    const replay = await command(actor, 'executeCandidateAction', data);
    assert.deepEqual(replay, { ...committed, status: 'replayed' });
  }
  const final = await f.session.get(); assert.equal(final.get('phase'), 'debrief');
  assert.ok(final.get('debriefSnapshot')); assert.ok(final.get('survivorOutcome'));
  const receipt = original.get('fingerprint');
  const data = { requestId: receipt.requestId, expectedRevision: receipt.expectedRevision,
    expectedGroupId: receipt.payload.groupId, code: receipt.payload.code, coordinate: receipt.payload.coordinate,
    action: receipt.payload.action, shipId: receipt.payload.shipId };
  const replay = await command(f.byRole('admiral'), 'executeCandidateAction', data);
  assert.deepEqual(replay, { ...original.get('result'), status: 'replayed' });
  const audits = await f.db.collection(`sessions/${f.sessionId}/candidateCalculationAudits`).get();
  assert.equal(audits.size, ships.length);
  for (const audit of audits.docs) {
    const calculation = audit.get('calculation');
    assert.ok(calculation.die >= 1 && calculation.die <= 6);
    assert.equal(calculation.total, calculation.die + 6 + calculation.priorLosses);
    assert.equal(audit.get('result'), calculation.total >= 9 ? 'reached' : 'lost');
  }
  const metadata = await f.db.collection(`sessions/${f.sessionId}/actionAudits`).get();
  assert.equal(metadata.docs.filter(doc => doc.get('action') === 'candidate-nebula-jump').length, ships.length);
  evidence.checks = { ...evidence.checks, freshNormalSetupAndChargedJumps: true, actualBrowserCandidateChoice: true,
    serverDiceAndThresholdVerifiedPrivately: true, terminalFrozenOnceAfterAllVessels: true, originalReplayAfterDebrief: true,
    result: final.get('gameOutcome').result, shipCount: ships.length };
  evidence.completedAt = new Date().toISOString();
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('Fresh normal Auth, maintenance, scout, jump, candidate UI, terminal and replay proof passed.');
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  if (f) {
    const session = await f.session.get(); const attack = await f.db.doc(`sessions/${f.sessionId}/wolfAttackState/current`).get();
    evidence.failureAuthority = { phase: session.get('phase'), cycle: session.get('currentTurn'),
      turnPhase: session.get('turnPhase'), pursuitEmergencyWindow: session.get('pursuitEmergencyWindow') ?? null,
      maintenanceCycles: session.get('maintenanceCycles'), shipDamage: session.get('shipDamage'),
      attack: attack.exists ? { status: attack.get('status'), currentStep: attack.get('currentStep'),
        threatSiteCode: attack.get('threatSiteCode') ?? null } : null };
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(`${output}.failure.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  if (f) { await f.cleanup(); await f.db.terminate(); }
  await context.close(); await browser.close();
}
