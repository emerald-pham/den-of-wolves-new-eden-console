import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

/** Root can supply a fresh six-core-vessel manual fixture and its Dione Engineering page. */
export async function runCandidateAvailabilityProof({ fixture: suppliedFixture, page: suppliedPage,
  output = process.env.PC10_CANDIDATE_EVIDENCE_PATH, origin = process.env.PC10_CANDIDATE_UI_URL,
  fullGameManual = process.env.PC10_CANDIDATE_FULL_GAME_MANUAL === '1',
  ringContribution = process.env.PC10_CANDIDATE_RING_CONTRIBUTION ?? 'button',
  chartId = process.env.PC10_CANDIDATE_CHART_ID ?? 'A',
  turnLimit = Number(process.env.PC10_CANDIDATE_TURN_LIMIT ?? 6), evidenceCounts } = {}) {
  assert.ok(output && origin, 'Use an external evidence path and the owned local UI URL.');
  assert.ok(['A', 'B', 'C'].includes(chartId) && [6, 7, 8].includes(turnLimit));
  assert.ok(['button', 'sdk'].includes(ringContribution));
  assert.ok(!suppliedFixture || suppliedPage, 'A supplied fixture requires its actual Dione Engineering browser page.');
  assert.ok(!suppliedFixture || evidenceCounts, 'Record actual actor and browser counts for a supplied fixture.');
  const counts = evidenceCounts ?? { joinedAuthActors: 19, issuedAuthIdentities: 20, realBrowserContexts: 1 };
  assert.deepEqual(Object.keys(counts).sort(), ['issuedAuthIdentities', 'joinedAuthActors', 'realBrowserContexts']);
  for (const count of Object.values(counts)) assert.ok(Number.isSafeInteger(count) && count > 0);
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { MAINTENANCE_ORDERS } = require('../functions/lib/maintenanceOrder.js');
  const browser = suppliedPage ? undefined : await chromium.launch({ channel: 'chrome', headless: true });
  const context = browser ? await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }) : undefined;
  const page = suppliedPage ?? await context.newPage();
  page.setDefaultTimeout(60_000);
  const evidence = { kind: 'fresh-authenticated-candidate-availability-counterexamples', actions: [], checks: {},
    sourceChoices: ['ordinary create/join/casting/seat/loyalty/GM lease/start handlers',
      'ordinary GM resource counters supply fuel and rations for this bounded rehearsal',
      fullGameManual ? 'ordinary unlimited manual Team and Coordination controls; no clock writes' :
        'only Team deadlines are accelerated before ordinary Coordination entry; bounded rehearsal only',
      'AEGIS crew chooses the Nebula; the other crews choose the Ring, creating two real groups',
      'one genuine Starlight scout; one real server-dice Nebula attempt in the following cycle',
      ringContribution === 'button' ? 'the real Engineering holder commits Philia through the connected Ring button' :
        'the real Engineering holder commits Philia through the ordinary browser SDK; no panel presentation claim'],
    seededCandidateOrNavigationState: false, adminClockAcceleration: !fullGameManual,
    credentialsRetained: false, fullRingTerminalClaim: false, ...counts,
    fullGameManual, chartId, turnLimit,
    ringContribution, connectedRingButtonClaim: false,
    cleanup: suppliedFixture ? 'supplied fixture retained for the root owner' : 'recursiveDelete in finally' };
  let f;
  async function command(actor, name, data = {}) {
    const reply = await f.call(actor, name, { sessionId: f.sessionId, ...data });
    evidence.actions.push({ name, transport: 'authenticated-http', status: reply.status,
      ...(reply.error ? { code: reply.error.status, message: reply.error.message } : {}) });
    assert.equal(reply.status, 200, `${name}: ${reply.error?.message}`);
    assert.notEqual(reply.result?.status, 'stale', `${name}: stale`);
    return reply.result;
  }
  async function denied(actor, name, data, expected) {
    const reply = await f.call(actor, name, { sessionId: f.sessionId, ...data });
    evidence.actions.push({ name, transport: 'authenticated-http', status: reply.status, code: reply.error?.status,
      message: reply.error?.message });
    assert.equal(reply.error?.status, 'FAILED_PRECONDITION', `${name}: must deny fresh availability`);
    assert.match(reply.error.message, expected);
  }
  async function sdkReply(name, data) {
    const reply = await page.evaluate(async ({ name, data }) => {
      const { functions } = await import('/src/lib/firebase.ts');
      const source = await (await fetch('/src/lib/sessionService.ts')).text();
      const sdkUrl = source.match(/from\s*["']([^"']*firebase_functions[^"']*)["']/)?.[1];
      if (!sdkUrl) throw new Error('The served session adapter must provide its actual SDK import URL.');
      const { httpsCallable } = await import(sdkUrl);
      try { return { result: (await httpsCallable(functions(), name)(data)).data }; }
      catch (error) { return { code: error.code, message: error.message }; }
    }, { name, data: { sessionId: f.sessionId, ...data } });
    evidence.actions.push({ name, transport: 'real-browser-sdk', ...reply });
    return reply;
  }
  async function sdkDenied(name, data, expected) {
    const reply = await sdkReply(name, data);
    assert.equal(reply.code, 'functions/failed-precondition');
    assert.match(reply.message, expected);
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
  async function grant(shipId) {
    const lease = (await f.db.doc(`sessions/${f.sessionId}/gmInstances/${f.instanceId}`).get()).data();
    const claimedAt = typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString();
    await command(f.gm, 'setGmShipConsoleWriteGrant', { instanceId: f.instanceId, claimedAt, shipId, enabled: true });
  }
  async function repair(shipId) {
    await grant(shipId);
    await command(f.gm, 'repairAllShipDamage', { instanceId: f.instanceId, shipId, requestId: randomUUID(),
      expectedRevision: (await f.session.get()).get('vesselActionRevisions')?.[shipId] ?? 0 });
  }
  async function maintenance(shipId) {
    const roleId = shipId === 'aegis' ? 'executive-officer' : `${shipId}-engineer`;
    const actor = f.byRole(roleId);
    await command(actor, 'refreshPresence', { activeConsoleRoleId: roleId });
    let revision = (await f.session.get()).get('maintenanceCycles')?.[shipId]?.revision ?? 0;
    for (const [index, action] of ['begin', ...MAINTENANCE_ORDERS[shipId], 'end'].entries()) {
      const reply = await command(actor, 'runMaintenance', { shipId, action, requestId: randomUUID(), expectedRevision: revision,
        ...(action === 'rations' ? { foodLevel: 3, waterLevel: 3 } : {}),
        ...(action === 'reactor' ? { consoles: ['jump-drive'] } : {}),
        ...(action === 'bays' ? { refuels: shipId === 'aegis' && index === 6 ? { 'shuttle-bay-zeta': 'starlight' } : {} } : {}) });
      revision = reply.cycle.revision;
      if (action === 'begin' || action === 'riot') await repair(shipId);
    }
  }
  async function coordination() {
    const snapshot = await f.session.get();
    if (!fullGameManual) await f.session.update({ turnPhase: { ...snapshot.get('turnPhase'),
      teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(), openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString() } });
    await command(f.byRole('wing-commander'), 'beginOpenAirspacePhase', { expectedTurn: snapshot.get('currentTurn') });
  }
  try {
    await mkdir(dirname(output), { recursive: true });
    f = suppliedFixture ?? await createPc07AuthenticatedSession('PC10 candidate availability source rehearsal', 18, {
      keepAlive: true, serializeFixtureCalls: true, browserRoleId: 'dione-engineer', joinBrowserPlayer: joinedUi,
      fullGameManual, chartId, turnLimit,
    });
    const initial = await f.session.get();
    assert.equal(initial.get('phase'), 'active');
    assert.equal(initial.get('currentTurn'), 1, 'This bounded route starts with fresh ordinary Cycle 1.');
    assert.deepEqual(initial.get('candidateVesselOutcomes') ?? {}, {});
    assert.deepEqual(initial.get('candidateCraftReservations') ?? {}, {});
    if (fullGameManual) assert.deepEqual(initial.get('fullGameDemo'),
      { status: 'active', progression: 'manual' }, 'Manual proof requires the real protected full-game setup producer.');
    const ships = initial.get('activeVesselIds');
    assert.deepEqual([...ships].sort(), ['aegis', 'dione', 'icebreaker', 'quellon', 'refinery-124', 'shepherd'],
      'This bounded driver requires the six ordinary core vessels and their occupied maintenance roles.');
    const sites = (await f.db.doc(`sessions/${f.sessionId}/gmDiscovery/current`).get()).get('organiserSites');
    const coordinate = code => Object.entries(sites).find(([, site]) => site.code === code)?.[0];
    const ring = coordinate('N'); const nebula = coordinate('O');
    assert.ok(ring && nebula, 'Read candidate targets only from this session’s entitled GM chart.');
    for (const shipId of ships) {
      for (const resourceId of ['fuel', 'food', 'water']) for (const count of [12, 12, 6]) {
        await command(f.gm, 'applyShipCounterSteps', { instanceId: f.instanceId, shipId, counter: 'resource', resourceId,
          steps: Array(count).fill(1), expectedRevision: (await f.session.get()).get('vesselActionRevisions')?.[shipId] ?? 0,
          requestId: randomUUID() });
      }
      await repair(shipId); await maintenance(shipId);
    }
    await coordination();
    for (const shipId of ships) {
      const actor = f.byRole(shipId === 'aegis' ? 'admiral' : `${shipId}-captain`);
      await command(actor, 'refreshPresence', { activeConsoleRoleId: shipId === 'aegis' ? 'admiral' : `${shipId}-captain` });
      const reply = await command(actor, 'jumpShip', { shipId, destination: shipId === 'aegis' ? nebula : ring,
        requestId: randomUUID(), expectedRevision: (await f.session.get()).get('vesselActionRevisions')?.[shipId] ?? 0 });
      assert.equal(reply.status, 'jumped');
    }
    const navigation = await f.db.doc(`sessions/${f.sessionId}/serverState/navigation`).get();
    await command(f.gm, 'confirmFleetPartition', { instanceId: f.instanceId, requestId: randomUUID(), expectedNavigationRevision: navigation.get('revision') });
    await page.goto(`${origin}/#/console`);
    if (ringContribution === 'button') {
      const panel = page.getByRole('region', { name: 'Candidate preparation and actions' }).first();
      await panel.getByRole('heading', { name: 'Ancient Jump Ring', exact: true }).waitFor();
      await panel.getByRole('button', { name: 'Commit Engineering Shuttle', exact: true }).click();
      await panel.getByRole('status').filter({ hasText: /permanently consumed/ }).waitFor();
      await panel.getByText(/permanently consumes.*Engineering Shuttle.*cannot.*launch.*mission/i).waitFor();
      await panel.screenshot({ path: `${dirname(output)}/fresh-ring-consumed-ui.png` });
      evidence.connectedRingButtonClaim = true;
    } else {
      const engineer = f.byRole('dione-engineer');
      const groupId = (await f.db.doc(`sessions/${f.sessionId}/players/${engineer.localId}`).get()).get('fleetGroupId');
      const read = await sdkReply('readCandidateWorkspace', { expectedGroupId: groupId });
      assert.ok(read.result?.paths.some(path => path.code === 'N' && path.coordinate === ring));
      const committed = await sdkReply('executeCandidateAction', { expectedGroupId: groupId, expectedRevision: read.result.revision,
        requestId: randomUUID(), code: 'N', coordinate: ring, action: 'commit-engineering-shuttle', shuttleId: 'philia' });
      assert.equal(committed.result?.status, 'committed');
      assert.match(committed.result.summary, /permanently consumed/);
    }
    const afterCraft = await f.session.get();
    assert.ok(afterCraft.get('candidateCraftReservations.philia'));
    assert.equal(afterCraft.get('shuttleDockings').some(docking => docking.shuttleId === 'philia'), false);
    const control = afterCraft.get('shuttleControl.philia');
    await sdkDenied('requestShuttleDeparture', { requestId: randomUUID(), shuttleId: 'philia', destinationShipId: 'icebreaker',
      expectedControlRevision: control.revision, expectedCycle: 1 }, /permanently consumed/);
    await sdkDenied('transferShuttleControlCommand', { requestId: randomUUID(), shuttleId: 'philia', action: 'handoff',
      targetUid: f.byRole('icebreaker-engineer').localId, expectedRevision: control.revision }, /permanently consumed/);
    await sdkDenied('repairConsolesFromPhilia', { requestId: randomUUID(), expectedControlRevision: control.revision,
      expectedRepairRevision: 0, expectedHostShipId: 'dione', expectedCycle: 1, systemIds: ['jump-drive'] }, /permanently consumed/);
    evidence.checks.actualRingContributionAndSdkReuseDenials = true;
    const scout = f.byRole('wing-commander');
    await command(scout, 'refreshPresence', { activeConsoleRoleId: 'wing-commander' });
    const scoutId = randomUUID();
    await command(scout, 'requestScout', { requestId: scoutId, entitlementId: 'starlight', targetCoordinate: nebula });
    const marker = f.db.doc(`sessions/${f.sessionId}/deepNebulaScans/${scoutId}`);
    for (let i = 0; i < 300 && !(await marker.get()).exists; i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await marker.get()).exists, true, 'Only the actual automatic scout resolver creates the hidden marker.');
    await command(f.gm, 'advanceTurn', { instanceId: f.instanceId, requestId: randomUUID(), expectedTurn: 1,
      overridePhaseTimer: !fullGameManual, skipTurnStartAnnouncement: true });
    const pause = (await f.session.get()).get('turnPhase.timerPause');
    if (pause) await command(f.byRole('admiral'), 'clearTurnAdvanceInterstitial', {
      requestId: randomUUID(), expectedCycle: 2, expectedPausedAt: pause.pausedAt });
    await maintenance('aegis'); await coordination(); await grant('aegis');
    const counter = { instanceId: f.instanceId, shipId: 'aegis', counter: 'resource', resourceId: 'fuel', steps: [1],
      requestId: randomUUID(), expectedRevision: (await f.session.get()).get('vesselActionRevisions.aegis') ?? 0 };
    const originalCounter = await command(f.gm, 'applyShipCounterSteps', counter);
    const captain = f.byRole('admiral');
    await command(captain, 'refreshPresence', { activeConsoleRoleId: 'admiral' });
    const groupId = (await f.db.doc(`sessions/${f.sessionId}/players/${captain.localId}`).get()).get('fleetGroupId');
    const workspace = await command(captain, 'readCandidateWorkspace', { expectedGroupId: groupId });
    const attempt = { requestId: randomUUID(), expectedRevision: workspace.revision, expectedGroupId: groupId,
      code: 'O', coordinate: nebula, action: 'nebula-jump', shipId: 'aegis' };
    const result = await command(captain, 'executeCandidateAction', attempt);
    assert.ok(['reached', 'lost'].includes(result.outcome));
    const settled = await f.session.get();
    assert.equal(settled.get('phase'), 'active', 'The other actual fleet group still chooses its Ring path.');
    assert.ok(settled.get('candidateVesselOutcomes.aegis'));
    assert.equal(Object.keys(settled.get('candidateVesselOutcomes')).length, 1);
    assert.deepEqual(await command(f.gm, 'applyShipCounterSteps', counter), originalCounter);
    assert.deepEqual(await command(captain, 'executeCandidateAction', attempt), { ...result, status: 'replayed' });
    const revision = settled.get('vesselActionRevisions.aegis') ?? 0;
    await denied(f.gm, 'applyShipCounterSteps', { ...counter, requestId: randomUUID(), expectedRevision: revision }, /candidate disposition/);
    await denied(f.gm, 'repairAllShipDamage', { instanceId: f.instanceId, shipId: 'aegis', requestId: randomUUID(), expectedRevision: revision }, /candidate disposition/);
    await denied(f.gm, 'addShipDamage', { instanceId: f.instanceId, shipId: 'aegis', requestId: randomUUID(), expectedRevision: revision }, /candidate disposition/);
    await denied(f.gm, 'moveShipToLocation', { instanceId: f.instanceId, shipId: 'aegis', destination: ring, requestId: randomUUID(), expectedRevision: revision }, /candidate disposition/);
    await denied(f.gm, 'jumpShip', { instanceId: f.instanceId, shipId: 'aegis', destination: ring, requestId: randomUUID(), expectedRevision: revision }, /candidate disposition/);
    await denied(f.gm, 'setWolfAttackWindow', { instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: 0,
      status: 'due', targetGroupId: groupId }, /candidate disposition/);
    const afterDenials = await f.session.get();
    assert.deepEqual(afterDenials.get('shipResources.aegis'), settled.get('shipResources.aegis'));
    assert.deepEqual(afterDenials.get('candidateVesselOutcomes'), settled.get('candidateVesselOutcomes'));
    evidence.checks = { ...evidence.checks, freshChargedJumpsAndRealPartition: true, genuineScoutAndServerDie: true,
      exactGmAndCandidateReceiptsRecovered: true, remainingGroupStillActive: true, settledSourceAndTargetDenials: true,
      paidAttemptOutcome: result.outcome, paidAttemptFuel: result.fuelSpent, fleetVessels: ships.length };
    evidence.completedAt = new Date().toISOString();
    await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log('Fresh authenticated Ring consumption, SDK reuse denial and split-group availability proof passed.');
    return evidence;
  } catch (error) {
    evidence.failure = error instanceof Error ? error.message : String(error);
    evidence.browserAuthority = await page.evaluate(async () => {
      const { useSessionStore } = await import('/src/store/useSessionStore.ts');
      const s = useSessionStore.getState();
      return { url: location.hash, connection: s.connection, freshness: s.sessionSnapshotFreshness,
        assignedRole: s.me?.assignedRoleId, seatRole: s.me?.seatId, group: s.me?.fleetGroupId,
        candidateReveals: s.session?.currentGroupCandidateReveals, communicationError: s.communicationError };
    }).catch(() => undefined);
    await page.screenshot({ path: `${output}.failure.png`, fullPage: true }).catch(() => undefined);
    if (f) { const snapshot = await f.session.get(); evidence.failureAuthority = {
      phase: snapshot.get('phase'), cycle: snapshot.get('currentTurn'), turnPhase: snapshot.get('turnPhase'),
      candidateDispositionCount: Object.keys(snapshot.get('candidateVesselOutcomes') ?? {}).length }; }
    await mkdir(dirname(output), { recursive: true });
    await writeFile(`${output}.failure.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    throw error;
  } finally {
    if (f && !suppliedFixture) { await f.cleanup(); await f.db.terminate(); }
    await context?.close(); await browser?.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCandidateAvailabilityProof();
}
