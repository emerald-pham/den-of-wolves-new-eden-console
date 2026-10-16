import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

if (process.argv[2] === '--member-rate') {
  const { runP631MemberRateSecurityUiProof } = await import('./pc10-member-rate-security-ui-proof.mjs');
  await runP631MemberRateSecurityUiProof();
} else {
const evidencePath = process.env.PC10_SECURITY_EVIDENCE_PATH;
assert.ok(evidencePath, 'An external evidence path is required.');
const origin = process.env.PC07_LOCAL_GM_ORIGIN;
assert.ok(origin && new URL(origin).hostname === '127.0.0.1', 'Use the owned loopback Vite server.');
const uiDirectory = process.env.PC10_SECURITY_UI_DIR;
assert.ok(uiDirectory, 'An external UI evidence directory is required.');
const localEnvironment = Object.fromEntries((await readFile('.env.emulators.local', 'utf8')).trim().split('\n').map(line => line.split('=')));
const functionsPort = Number(localEnvironment.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT);
assert.ok(Number.isInteger(functionsPort) && functionsPort > 0, 'Use the explicitly reserved Functions port.');
const checks = {};
const calls = [];
const browserErrors = [];
let browser, context, page, fixture;
let sessionStoreUrl = '/src/store/useSessionStore.ts';
const sha = value => createHash('sha256').update(value).digest('hex');
async function compiledTreeSha256() {
  const files = [];
  const walk = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path); else files.push(path);
    }
  };
  await walk('functions/lib');
  const hash = createHash('sha256');
  for (const path of files.sort()) hash.update(path.replace('functions/lib/', '') + '\0').update(await readFile(path));
  return hash.digest('hex');
}
const functionsCompiledTreeSha256 = await compiledTreeSha256();
const functionsSourceCommit = process.env.PC10_FUNCTIONS_SOURCE_COMMIT
  ? execFileSync('git', ['rev-parse', '--verify', process.env.PC10_FUNCTIONS_SOURCE_COMMIT], { encoding: 'utf8' }).trim()
  : null;

async function joinBrowserPlayer(joinCode) {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/src/store/useSessionStore.ts') sessionStoreUrl = url.href;
  });
  await page.goto(origin);
  await page.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
  await page.getByRole('button', { name: 'Join a session', exact: true }).click();
  await page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true }).waitFor();
  for (const checkbox of await page.getByRole('checkbox', { name: /^Acknowledge regulation/ }).all()) await checkbox.check();
  await page.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true }).and(page.locator(':enabled')).click();
  await page.waitForFunction(async url => {
    const { useSessionStore } = await import(url);
    return Boolean(useSessionStore.getState().me);
  }, sessionStoreUrl);
  const actor = await page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
  });
  return actor;
}

async function command(actor, name, data = {}) {
  const reply = await fixture.call(actor, name, { sessionId: fixture.sessionId, ...data });
  calls.push({ name, httpStatus: reply.status, status: reply.result?.status ?? reply.error?.status ?? 'ok' });
  return reply;
}
async function accepted(actor, name, data = {}) {
  const reply = await command(actor, name, data);
  assert.equal(reply.status, 200, `${name}: ${reply.error?.status ?? 'failed'}`);
  return reply.result;
}
async function denied(actor, name, data, errorStatus) {
  const reply = await command(actor, name, data);
  assert.equal(reply.error?.status, errorStatus, `${name} denial category`);
  return reply;
}
async function directRead(actor, suffix, expectedStatus) {
  const response = await fetch(`http://127.0.0.1:${fixture.config.firestorePort}/v1/projects/${fixture.project}/databases/(default)/documents/sessions/${fixture.sessionId}/${suffix}`,
    { headers: { Authorization: `Bearer ${actor.idToken}` } });
  assert.equal(response.status, expectedStatus, `Private direct-read audience for ${suffix.split('/')[0]}`);
}

try {
  fixture = await createPc07AuthenticatedSession('PC10 private boundary proof', 8, {
    keepAlive: true, browserRoleId: 'wing-commander', joinBrowserPlayer,
  });
  const { db, session, sessionId, gm, players, instanceId } = fixture;
  const wing = fixture.byRole('wing-commander');
  assert.ok(wing, 'The real occupied Wing Commander seat is required.');
  checks.ordinaryAuthSetupStart = true;
  const snapshot = await accepted(players[0], 'getCurrentMemberSession');
  const forbidden = ['loyalty', 'loyalties', 'wolfAssignment', 'wolfAssignments', 'shipGalacticCoordinates',
    'gmDiscovery', 'missionDeck', 'deckOrder', 'awayMissionHands', 'facilitatorNotes', 'deepNebulaScans'];
  for (const key of forbidden) assert.equal(Object.hasOwn(snapshot.session, key), false, `Public session omits ${key}`);
  await directRead(players[0], `secrets/loyalty-${players[0].localId}`, 200);
  await directRead(players[1], `secrets/loyalty-${players[0].localId}`, 403);
  await directRead(gm, 'secrets/wolf-assignment', 200);
  await directRead(players[0], 'secrets/wolf-assignment', 403);
  await directRead(gm, 'gmDiscovery/current', 200);
  await directRead(players[0], 'gmDiscovery/current', 403);
  for (const actor of [players[0], gm]) await directRead(actor, 'serverState/missionDeck', 403);
  checks.realSetupPrivateProjections = true;

  const noAuth = await fetch(`http://127.0.0.1:${functionsPort}/${fixture.project}/us-central1/getCurrentMemberSession`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { sessionId } }),
  });
  assert.equal(noAuth.status, 401);
  assert.equal((await noAuth.json()).error.status, 'UNAUTHENTICATED');
  await denied(players[0], 'getCurrentMemberSession', { notes: 'PC10-PRIVATE-NOTE-CANARY' }, 'INVALID_ARGUMENT');
  await denied(players[0], 'buildFighter', {
    requestId: randomUUID(), wingId: 'fighter-wing-alpha', expectedRevision: 0,
  }, 'PERMISSION_DENIED');
  const eventsBefore = (await db.collection(`sessions/${sessionId}/events`).where('type', '==', 'roll').get()).size;
  for (const key of ['rolls', 'outcome', 'seed', 'bonus', 'deckOrder']) {
    await denied(players[0], 'rollDice', { sides: 6, count: 1, [key]: 'PC10-CLIENT-OUTCOME-CANARY' }, 'INVALID_ARGUMENT');
  }
  assert.equal((await db.collection(`sessions/${sessionId}/events`).where('type', '==', 'roll').get()).size, eventsBefore);
  const rolled = await accepted(players[0], 'rollDice', { sides: 6, count: 4 });
  assert.equal(rolled.rolls.length, 4);
  assert.ok(rolled.rolls.every(value => Number.isInteger(value) && value >= 1 && value <= 6));
  assert.deepEqual((await db.doc(`sessions/${sessionId}/events/${rolled.id}`).get()).get('rolls'), rolled.rolls);
  checks.serverRollsRecordedAndClientInjectionHasNoMutation = true;

  const lease = (await db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`).get()).data();
  const claimedAt = typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString();
  await accepted(gm, 'setGmShipConsoleWriteGrant', { instanceId, shipId: 'aegis', enabled: true, claimedAt });
  let maintenanceRevision = 0;
  for (const action of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays', 'end']) {
    const reply = await accepted(gm, 'runMaintenance', { instanceId, shipId: 'aegis', action,
      expectedRevision: maintenanceRevision, requestId: randomUUID(),
      ...(action === 'rations' ? { foodLevel: 1, waterLevel: 1 } : {}),
      ...(action === 'reactor' ? { consoles: ['construction-bay'] } : {}),
      ...(action === 'bays' ? { refuels: {} } : {}),
    });
    maintenanceRevision = reply.cycle.revision;
  }
  // An explicit genuine facilitator correction creates a replacement deficit;
  // no admin seeding of resources, charges, results, roles, receipts or audits occurs.
  const initialWing = (await session.get()).get('fighterWingCounts')['fighter-wing-alpha'];
  await accepted(gm, 'setFighterWingCount', { instanceId, requestId: randomUUID(), wingId: 'fighter-wing-alpha', count: 2,
    expectedRevision: initialWing.revision });
  const before = (await session.get()).data();
  const expectedRevision = before.vesselActionRevisions?.aegis ?? 0;
  const attempts = [
    { actor: wing, data: { requestId: randomUUID(), wingId: 'fighter-wing-alpha', expectedRevision } },
    { actor: gm, data: { instanceId, requestId: randomUUID(), wingId: 'fighter-wing-alpha', expectedRevision } },
  ];
  const racing = await Promise.all(attempts.map(attempt => command(attempt.actor, 'buildFighter', attempt.data)));
  assert.equal(racing.filter(reply => reply.result?.status === 'committed').length, 1);
  assert.equal(racing.filter(reply => reply.result?.status === 'stale').length, 1);
  const winnerIndex = racing.findIndex(reply => reply.result?.status === 'committed');
  const winner = attempts[winnerIndex];
  const loser = attempts[1 - winnerIndex];
  const auditRef = db.doc(`sessions/${sessionId}/actionAudits/${winner.data.requestId}`);
  const procedureRef = db.doc(`sessions/${sessionId}/procedureAudits/${winner.data.requestId}`);
  const auditBefore = await auditRef.get();
  const procedureBefore = await procedureRef.get();
  assert.ok(auditBefore.exists && procedureBefore.exists);
  assert.equal((await db.doc(`sessions/${sessionId}/procedureAudits/${loser.data.requestId}`).get()).exists, false);
  assert.equal(procedureBefore.get('calculation').materialsSpent, 1);
  assert.equal(procedureBefore.get('calculation').fighterDelta, 1);
  assert.deepEqual(procedureBefore.get('requiredChoices').map(choice => choice.kind), ['wing']);
  const replay = await accepted(winner.actor, 'buildFighter', winner.data);
  assert.deepEqual(replay, racing[winnerIndex].result, 'An exact retry preserves the established committed reply contract.');
  assert.ok(auditBefore.updateTime.isEqual((await auditRef.get()).updateTime));
  assert.ok(procedureBefore.updateTime.isEqual((await procedureRef.get()).updateTime));
  const after = (await session.get()).data();
  assert.equal(after.shipResources.aegis.materials, before.shipResources.aegis.materials - 1);
  assert.equal(after.fighterWingCounts['fighter-wing-alpha'].count, 3);
  assert.equal(after.vesselActionRevisions.aegis, expectedRevision + 1);
  await denied(loser.actor, 'buildFighter', { ...loser.data, requestId: winner.data.requestId }, 'PERMISSION_DENIED');
  await directRead(gm, `procedureAudits/${winner.data.requestId}`, 200);
  await directRead(wing, `procedureAudits/${winner.data.requestId}`, 403);
  await directRead(wing, `actionAudits/${winner.data.requestId}`, 403);
  await accepted(gm, 'setGmShipConsoleWriteGrant', { instanceId, shipId: 'aegis', enabled: false, claimedAt });
  await denied(gm, 'buildFighter', { instanceId, requestId: randomUUID(), wingId: 'fighter-wing-alpha', expectedRevision: expectedRevision + 1 }, 'PERMISSION_DENIED');
  checks.optionalGmRaceSingleCostAndSinglePrivateAudit = true;
  checks.exactReplayPreservesAuditAndRevokedGrantDenies = true;

  await page.reload();
  await page.waitForFunction(async ({ url, uid }) => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(url);
    const current = useSessionStore.getState();
    return auth().currentUser?.uid === uid && current.me?.uid === uid && current.connection === 'live' &&
      current.sessionSnapshotFreshness === 'server' && current.session?.currentTurn === 1;
  }, { url: sessionStoreUrl, uid: wing.localId }, { timeout: 30000 });
  await page.getByRole('link', { name: /AEGIS.*Wing Commander.*HELD BY YOU/i }).click();
  await page.waitForFunction(async ({ url, uid }) => {
    const { useSessionStore } = await import(url);
    const current = useSessionStore.getState();
    return current.me?.uid === uid && current.me.assignedRoleId === 'wing-commander' &&
      current.me.seatId === 'wing-commander' && current.me.activeConsoleRoleId === 'wing-commander' &&
      current.session?.currentTurn === 1 && current.connection === 'live' && current.sessionSnapshotFreshness === 'server';
  }, { url: sessionStoreUrl, uid: wing.localId }, { timeout: 30000 });
  await page.getByRole('heading', { name: 'AEGIS', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Stations and consoles', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Build 1 fighter // 1 material', exact: true }).first().waitFor();
  await page.waitForFunction(async url => {
    const { useSessionStore } = await import(url);
    const current = useSessionStore.getState();
    return current.session?.playerDiscovery?.shipId === 'aegis' &&
      current.session.playerDiscovery.groupId === current.me?.fleetGroupId &&
      Object.hasOwn(current.session.shipGalacticCoordinates ?? {}, 'aegis');
  }, sessionStoreUrl, { timeout: 30000 });
  const ui = await page.evaluate(async url => {
    const { useSessionStore, SESSION_STORAGE_KEY } = await import(url);
    const current = useSessionStore.getState();
    const envelope = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    const navigation = current.session.playerDiscovery;
    const privateFields = ['loyalty', 'loyalties', 'wolfAssignments', 'gmDiscovery', 'missionDeck',
      'deckOrder', 'awayMissionHands', 'deepNebulaScans', 'hiddenRolls', 'privateBonuses',
      'facilitatorNotes', 'gmNotes', 'organiserSites', 'organiserSystems', 'organiserSystemHistory',
      'pursuitDistances', 'pursuitGroups', 'shipFleetGroupIds', 'candidatePlanCheckpoint'];
    return { route: location.hash, role: current.me.activeConsoleRoleId, cycle: current.session.currentTurn,
      persistedKeys: Object.keys(envelope.state ?? {}).sort(),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      forbiddenSnapshotFields: privateFields.filter(key => Object.hasOwn(current.session, key)),
      forbiddenPersistedFields: [...privateFields, 'playerDiscovery', 'currentGroupCandidateReveals',
        'shipGalacticCoordinates', 'shipNavigationLogs', 'voyage33Movement']
        .filter(key => Object.hasOwn(envelope.state?.session ?? {}, key)),
      navigation: { ownShipId: navigation?.shipId,
        currentGroupMatches: navigation?.groupId === current.me.fleetGroupId,
        coordinateShipIds: Object.keys(current.session.shipGalacticCoordinates ?? {}),
        logShipIds: Object.keys(current.session.shipNavigationLogs ?? {}),
        coordinateMatchesEntitledDiscovery: navigation?.currentCoordinate === current.session.shipGalacticCoordinates?.aegis,
      } };
  }, sessionStoreUrl);
  assert.equal(ui.overflow, false);
  assert.equal(ui.cycle, 1, 'The browser must finish genuine cycle-one authenticated hydration.');
  assert.equal(ui.role, 'wing-commander');
  assert.deepEqual(ui.forbiddenSnapshotFields, []);
  assert.deepEqual(ui.forbiddenPersistedFields, []);
  assert.deepEqual(ui.navigation, { ownShipId: 'aegis', currentGroupMatches: true,
    coordinateShipIds: ['aegis'], logShipIds: ['aegis'], coordinateMatchesEntitledDiscovery: true });
  assert.deepEqual(ui.persistedKeys, ['gmAccessAuthenticatedAt', 'gmInstance', 'lastRoute', 'me', 'mode', 'pendingCommands', 'session']);
  await mkdir(uiDirectory, { recursive: true });
  await page.screenshot({ path: `${uiDirectory}/ordinary-player-390.png`, fullPage: true });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: 'Build 1 fighter // 1 material', exact: true }).first().scrollIntoViewIfNeeded();
  ui.landscapeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.equal(ui.landscapeOverflow, false);
  // Full-page Chromium capture repeats fixed overlays while stitching short
  // landscape pages; the native viewport is the actual visible UI evidence.
  await page.screenshot({ path: `${uiDirectory}/ordinary-player-landscape.png` });
  checks.realBrowserResumePrivateProjection = ui;

  // Each actor has its own budget even though these clients share one loopback network.
  await browser.close();
  browser = undefined;
  const limitedActor = players.find(actor => actor.localId !== wing.localId);
  let successfulReads = 0;
  let rateDenied;
  for (let index = 0; index < 122; index++) {
    const reply = await command(limitedActor, 'getCurrentMemberSession');
    if (reply.status === 200) successfulReads++;
    else { rateDenied = reply; break; }
  }
  assert.ok(successfulReads >= 100 && successfulReads <= 120);
  assert.equal(rateDenied?.error?.status, 'RESOURCE_EXHAUSTED');
  assert.ok(rateDenied.error.details.retryAfterSeconds >= 1);
  await accepted(wing, 'getCurrentMemberSession');
  await accepted(gm, 'getCurrentMemberSession');
  checks.sessionIdentityBudgetPreservesSharedNetworkActors = { successfulReads, separatePlayerAccepted: true, gmAccepted: true };
  assert.deepEqual(browserErrors, []);
  const report = { type: 'pc10-security-native-proof', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    functionsSourceCommit,
    functionsCompiledTreeSha256,
    sessionHash: sha(sessionId), actorClients: 9, browserContexts: 1,
    overlappingActionClients: 2, actualHumanDevices: 0,
    adminGameplaySeeds: [], facilitatorFixtureChoices: ['AEGIS wing deficit correction through setFighterWingCount'],
    checks, calls, browserErrors, localEmulatorOnly: true };
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: Object.keys(checks), successfulReads }));
} finally {
  await browser?.close();
  await fixture?.cleanup();
}
}
