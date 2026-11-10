#!/usr/bin/env node
// PC10.3 L1.1-L1.3 (#239-#241, P618): a returning member replaces stale
// session, seat, role, ship, group and shuttle state with current entitled
// server state, and a resolved action stays resolved.
//
// Evidence class: normal authenticated local emulator gameplay. Two real
// browser members join through the ordinary UI; the GM and the other crew are
// authenticated HTTP actors on the production callables. The only privileged
// fixture write accelerates the disposable Team Phase deadline (as in the PC07
// split proof). This is not deployed or production gameplay.
//
// Each leaf partitions a member's browser from the backend, changes current
// server state through ordinary callables, reloads so the persisted cache
// renders first, then restores the backend and waits for the app's own
// recovery. `reconnects` in the evidence records whether a resumeSession reply
// or the live listeners/member feed alone replaced the cache.
//
// Run: `npm run emulators:configure -- auto`, then
//      `node scripts/test-pc10-3-reconnect.emulator.mjs`.
// Evidence JSON goes to PC10_3_RECONNECT_EVIDENCE_DIR (default: OS temp dir).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { enterReconnectRow, openReconnectMember, repository, startEmulatorApp } from './pc10-3-reconnect-harness.mjs';

const script = 'node scripts/test-pc10-3-reconnect.emulator.mjs';
if (await enterReconnectRow({ script, kind: 'pc10-3-reconnect' })) {
  const { chromium } = await import('playwright');
  const { createPc07AuthenticatedSession } = await import('./pc07-authenticated-session.mjs');
  const require = createRequire(join(repository, 'functions/package.json'));
  const { STAR_CHART_COORDINATES, jumpDistanceBetween } = require('../functions/lib/starChartGraph.js');
  const evidenceDirectory = process.env.PC10_3_RECONNECT_EVIDENCE_DIR ?? join(tmpdir(), 'dow-pc10-3-reconnect');
  const { execFileSync } = await import('node:child_process');
  const evidence = { kind: 'normal-authenticated-local-emulator-browser-reconnect',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
    worktreeClean: execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }).trim() === '',
    preparedScene: false,
    productionGameplay: false, fixtureChanges: ['disposable Team Phase deadline only'], checks: {}, steps: [] };
  let app, browser, f, explorer, miner;

  const record = (step, details = {}) => { evidence.steps.push({ step, at: new Date().toISOString(), ...details }); };
  const command = async (actor, name, data = {}) => {
    const reply = await f.call(actor, name, { sessionId: f.sessionId, ...data });
    const result = f.ok(reply, name);
    assert.notEqual(result?.status, 'stale', `${name} returned stale authority.`);
    record(name, { status: result?.status ?? 'committed' });
    return result;
  };
  const live = s => s.connection === 'live' && s.freshness === 'server';
  // Which recovery path replaced the cache: an ordinary resumeSession reply, or
  // the live listeners/member feed alone (the resume retry stops once live).
  const reconnectEvidence = (name, member, healedAt, generationBefore, fresh) => {
    const resumes = member.callableResponses.filter(r => r.name === 'resumeSession' && r.at >= healedAt);
    (evidence.reconnects ??= []).push({ name, resumeReplies: resumes.map(r => r.httpStatus),
      generationBefore, generationAfter: fresh.connectionGeneration });
  };

  describe('PC10.3 reconnect proofs on one ordinary authenticated session', () => {
    before(async () => {
      await mkdir(evidenceDirectory, { recursive: true });
      app = await startEmulatorApp();
      // Installed Chrome, as in the PC09 recovery proof; set PC10_3_BROWSER_CHANNEL=chromium for Playwright's build.
      browser = await chromium.launch({ headless: true, ...(process.env.PC10_3_BROWSER_CHANNEL === 'chromium' ? {} : { channel: 'chrome' }) });
      explorer = await openReconnectMember(browser, { uiUrl: app.url, label: 'quellon-explorer' });
      miner = await openReconnectMember(browser, { uiUrl: app.url, label: 'icebreaker-miner' });
      f = await createPc07AuthenticatedSession('PC10.3 reconnect proof', 8, { keepAlive: true, serializeFixtureCalls: true,
        joinBrowserPlayers: { 'quellon-explorer': explorer.join, 'icebreaker-miner': miner.join } });
      record('session', { roster: f.roles });
      for (const member of [explorer, miner]) {
        await member.page.goto(`${app.url}/#/console`);
        await member.until('live member after ordinary join and casting', s => live(s) && s.sessionId === f.sessionId);
      }
      // Coordination opens cargo and movement. Only this disposable deadline is edited.
      const clock = (await f.session.get()).get('turnPhase');
      await f.session.update({ turnPhase: { ...clock, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
        openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString() } });
      await command(f.byRole('wing-commander'), 'beginOpenAirspacePhase', { expectedTurn: 1 });
    });

    after(async () => {
      try {
        for (const member of [explorer, miner]) {
          await member?.page.screenshot({ path: join(evidenceDirectory, `final-${member.label}.png`), fullPage: true }).catch(() => {});
        }
        evidence.browserErrors = { explorer: explorer?.errors, miner: miner?.errors };
        evidence.callableResponses = { explorer: explorer?.callableResponses.filter(r => r.error), miner: miner?.callableResponses.filter(r => r.error) };
        evidence.heartbeatFailures = f?.heartbeatFailures;
        evidence.completedAt = new Date().toISOString();
        await writeFile(join(evidenceDirectory, 'pc10-3-reconnect.json'), `${JSON.stringify(evidence, null, 2)}\n`);
      } finally {
        await browser?.close();
        if (f) { await f.cleanup(); await f.db.terminate(); }
        await app?.stop();
      }
    });

    it('L1.3 #241: the shuttle holder sees the current shuttle and its resolved cargo action after reconnect and reload', async () => {
      const page = explorer.page;
      await page.goto(`${app.url}/#/shuttles/hummingbird`);
      const cargo = page.getByRole('region', { name: 'Shuttle cargo transfer' });
      await cargo.waitFor({ timeout: 60_000 });
      const before = await explorer.until('live Hummingbird holder', s => live(s) &&
        s.shuttleControl?.hummingbird?.holderUid === s.uid);
      const hostFood = before.shipResources.quellon.food, shuttleFood = before.shuttleCargo?.hummingbird?.food ?? 0;
      await cargo.getByLabel('Resource', { exact: true }).selectOption('food');
      await cargo.getByLabel('Amount', { exact: true }).fill('1');

      // The server commits the ordinary UI request, then the link drops before its reply arrives.
      let sent, receipt;
      await page.route(url => url.pathname.endsWith('/transferShuttleCargoCommand'), async route => {
        sent = route.request().postDataJSON().data;
        receipt = await (await route.fetch()).json();
        await explorer.partition();
        await route.abort('connectionreset');
      }, { times: 1 });
      await cargo.getByRole('button', { name: 'Load shuttle', exact: true }).click();
      await cargo.getByText('The cargo transfer result is uncertain. Retry the exact request to check its server receipt.',
        { exact: true }).waitFor();
      assert.equal(receipt?.result?.status, 'committed', 'The server committed the dropped request.');
      const committed = (await f.session.get()).data();
      assert.equal(committed.shuttleCargo.hummingbird.food, shuttleFood + 1);
      assert.equal(committed.shipResources.quellon.food, hostFood - 1);
      evidence.checks.droppedReplyLeavesUncertainUi = true;

      // Reconnect without reload: the retained exact request returns the original receipt, never a second load.
      await explorer.heal();
      await explorer.until('live after the dropped reply', live);
      const replies = [];
      const onResponse = async response => {
        if (new URL(response.url()).pathname.endsWith('/transferShuttleCargoCommand')) replies.push(await response.json());
      };
      page.on('response', onResponse);
      await cargo.getByRole('button', { name: 'Retry exact cargo request', exact: true }).click();
      await cargo.getByText('Loaded 1 Food.', { exact: true }).waitFor();
      page.off('response', onResponse);
      assert.equal(replies.length, 1);
      assert.equal(replies[0].result.requestId ?? sent.requestId, sent.requestId);
      const firstReceipt = { ...receipt.result };
      delete firstReceipt.status;
      const { status: replayStatus, ...replayReceipt } = replies[0].result;
      assert.deepEqual(replayReceipt, firstReceipt, 'The exact retry returns the original committed receipt.');
      const afterRetry = await explorer.until('fresh cargo after the exact retry', s => live(s) &&
        s.shuttleCargo?.hummingbird?.food === shuttleFood + 1);
      assert.equal(afterRetry.shipResources.quellon.food, hostFood - 1, 'The resolved load was applied exactly once.');
      evidence.checks.exactRetryAfterReconnectReturnsOriginalReceiptOnce = true;
      record('cargo-retry', { replayStatus });

      // While the holder is away the facilitator hands the shuttle to another quellon-group member.
      const admiral = f.byRole('admiral');
      const generationBefore = afterRetry.connectionGeneration;
      await explorer.partition();
      await command(f.gm, 'transferShuttleControlCommand', { instanceId: f.instanceId, requestId: randomUUID(),
        shuttleId: 'hummingbird', action: 'handoff', targetUid: admiral.localId,
        expectedRevision: (await f.session.get()).get('shuttleControl').hummingbird.revision });
      await explorer.reload();
      const stale = await explorer.until('persisted snapshot rendered without server authority', s =>
        s.sessionId === f.sessionId && s.persistedSessionSnapshot && s.freshness !== 'server');
      assert.equal(stale.shuttleControl.hummingbird.holderUid, before.memberUid, 'The reload rendered the stale cached holder.');
      assert.equal(stale.shuttleCargo.hummingbird.food, shuttleFood + 1);
      await page.getByText('Cargo transfers unlock when a fresh live server snapshot confirms the current shuttle holder and inventory.',
        { exact: true }).waitFor();
      evidence.checks.staleShuttleCacheRendersLocked = true;
      const requestsBeforeHeal = explorer.callableRequests.length;
      const healedAt = Date.now();
      await explorer.heal();
      const fresh = await explorer.until('current shuttle holder replaces the cache', s => live(s) &&
        s.shuttleControl?.hummingbird?.holderUid === admiral.localId);
      reconnectEvidence('l1-3-reload', explorer, healedAt, generationBefore, fresh);
      assert.equal(fresh.shuttleCargo.hummingbird.food, shuttleFood + 1, 'The resolved cargo result is current.');
      assert.equal(fresh.shipResources.quellon.food, hostFood - 1);
      await cargo.waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('button', { name: 'Load shuttle', exact: true }).count(), 0,
        'A former holder has no cargo control after reconnect.');
      assert.equal(explorer.callableRequests.slice(requestsBeforeHeal)
        .filter(request => request.name === 'transferShuttleCargoCommand').length, 0, 'Reload never replays the cargo command.');
      assert.equal((await explorer.persisted()).shuttleControl.hummingbird.holderUid, admiral.localId,
        'The persisted snapshot now holds the current holder.');
      const server = (await f.session.get()).data();
      assert.equal(server.shuttleCargo.hummingbird.food, shuttleFood + 1);
      evidence.checks.reloadReplacesStaleShuttleHolderAndKeepsResolvedCargo = true;
      evidence.cargoRequest = { requestId: sent.requestId, shuttleId: sent.shuttleId, resourceId: sent.resourceId,
        direction: sent.direction, amount: sent.amount, expectedControlRevision: sent.expectedControlRevision };
      await page.screenshot({ path: join(evidenceDirectory, 'l1-3-former-holder.png'), fullPage: true });
    });

    it('L1.2 #240: a returning member sees its current ship and group, and no other group survives in cache', async () => {
      await miner.page.goto(`${app.url}/#/ships/icebreaker/roles/icebreaker-miner`);
      const before = await miner.until('live miner in the whole fleet', s => live(s) &&
        s.scopeVesselIds?.includes('aegis') && s.shipResourceIds.includes('quellon'));
      const originalGroup = before.fleetGroupId;
      await miner.partition();
      // The facilitator moves Icebreaker one jump away and confirms the ordinary partition.
      const navigation = f.db.doc(`sessions/${f.sessionId}/serverState/navigation`);
      const origin = (await navigation.get()).get('shipGalacticCoordinates').aegis;
      const nearby = STAR_CHART_COORDINATES.find(coordinate => coordinate !== origin && jumpDistanceBetween(origin, coordinate) === 1);
      await command(f.gm, 'moveShipToLocation', { instanceId: f.instanceId, requestId: randomUUID(), shipId: 'icebreaker',
        destination: nearby, expectedRevision: (await f.session.get()).get('vesselActionRevisions')?.icebreaker ?? 0 });
      await command(f.gm, 'confirmFleetPartition', { instanceId: f.instanceId, requestId: randomUUID(),
        expectedNavigationRevision: (await navigation.get()).get('revision') });
      const minerGroup = (await f.db.doc(`sessions/${f.sessionId}/players/${before.memberUid}`).get()).get('fleetGroupId');
      const explorerGroup = (await f.db.doc(`sessions/${f.sessionId}/players/${f.byRole('quellon-explorer').localId}`).get()).get('fleetGroupId');
      assert.notEqual(minerGroup, explorerGroup, 'The server split the two members into different groups.');

      await miner.reload();
      const stale = await miner.until('persisted whole-fleet snapshot rendered without server authority', s =>
        s.sessionId === f.sessionId && s.persistedSessionSnapshot && s.freshness !== 'server');
      assert.equal(stale.fleetGroupId, originalGroup, 'The reload rendered the stale cached group.');
      assert.ok(stale.shipResourceIds.includes('aegis') && stale.shipResourceIds.includes('quellon'),
        'The stale cache still carried the other group\'s ships.');
      const healedAt = Date.now();
      await miner.heal();
      const fresh = await miner.until('current group replaces the cache', s => live(s) &&
        s.fleetGroupId === minerGroup && s.scopeGroupId === minerGroup && s.discoveryGroupId === minerGroup);
      assert.deepEqual(fresh.scopeVesselIds, ['icebreaker']);
      assert.deepEqual(fresh.shipResourceIds, ['icebreaker'], 'No other group\'s ship state is retained.');
      assert.deepEqual(fresh.discoveryVesselIds, ['icebreaker']);
      reconnectEvidence('l1-2-reload', miner, healedAt, before.connectionGeneration, fresh);
      assert.equal(fresh.seatId, 'icebreaker-miner');
      assert.equal(fresh.activeConsoleRoleId, 'icebreaker-miner');
      assert.ok(fresh.shuttleDockings.every(docking => docking.shipId === 'icebreaker'),
        'Only shuttles docked in the current group remain visible.');
      const stored = await miner.persisted();
      assert.equal(stored.scopeGroupId, minerGroup);
      assert.deepEqual(stored.shipResourceIds, ['icebreaker'], 'The persisted cache no longer holds the other group.');
      await miner.page.getByRole('heading', { name: /icebreaker/i }).first().waitFor();
      evidence.checks.reloadReplacesStaleShipAndGroup = true;

      // The connected peer in the other group never receives the moved ship.
      const peer = await explorer.until('peer current group', s => live(s) && s.fleetGroupId === explorerGroup &&
        !s.shipResourceIds.includes('icebreaker'));
      assert.ok(!peer.scopeVesselIds.includes('icebreaker'));
      assert.ok(peer.discoveryVesselIds === null || !peer.discoveryVesselIds.includes('icebreaker'));
      evidence.checks.peerGroupHasNoMovedShip = true;
      await miner.page.screenshot({ path: join(evidenceDirectory, 'l1-2-current-group.png'), fullPage: true });
    });

    it('L1.1 #239: a returning member replaces stale player, seat and role state; old and foreign seats stay locked', async () => {
      const page = explorer.page;
      const oldRoute = '#/ships/quellon/roles/quellon-explorer';
      await page.goto(`${app.url}/${oldRoute}`);
      const before = await explorer.until('live explorer at its held station', s => live(s) &&
        s.seatId === 'quellon-explorer' && s.activeConsoleRoleId === 'quellon-explorer' && s.hash === oldRoute);
      await explorer.partition();
      const setupRevision = (await f.session.get()).get('setupRevision');
      const eligibility = await command(f.gm, 'setReplacementEligibility', { instanceId: f.instanceId, requestId: randomUUID(),
        targetUid: before.memberUid, reason: 'removed', expectedRevision: 0, expectedSetupRevision: setupRevision });
      await command(f.gm, 'assignReplacementRole', { instanceId: f.instanceId, requestId: randomUUID(),
        targetUid: before.memberUid, replacementRoleId: 'comms-officer', expectedRevision: eligibility.revision,
        expectedSetupRevision: eligibility.setupRevision });

      await explorer.reload();
      const stale = await explorer.until('persisted station snapshot rendered without server authority', s =>
        s.sessionId === f.sessionId && s.persistedSessionSnapshot && s.freshness !== 'server');
      assert.equal(stale.seatId, 'quellon-explorer', 'The reload rendered the stale cached seat.');
      assert.equal(stale.replacementRoleId, null);
      const requestsBeforeHeal = explorer.callableRequests.length;
      const healedAt = Date.now();
      await explorer.heal();
      const fresh = await explorer.until('current player, seat and role replace the cache', s => live(s) &&
        s.replacementRoleId === 'comms-officer' && s.seatId === null && s.activeConsoleRoleId === null);
      reconnectEvidence('l1-1-reload', explorer, healedAt, before.connectionGeneration, fresh);
      assert.equal(fresh.memberUid, before.memberUid);
      assert.deepEqual(fresh.seats.find(seat => seat.id === 'quellon-explorer'),
        { id: 'quellon-explorer', status: 'open', holderUid: null }, 'The released seat is current, not the cached claim.');
      // The old station route no longer holds authority: only view controls remain enabled there.
      evidence.oldRouteEnabledButtons = await page.locator('button:enabled').evaluateAll(nodes =>
        nodes.map(node => node.textContent.trim()).filter(Boolean));
      await page.goto(`${app.url}/#/console`);
      await page.getByRole('heading', { name: 'Stations and consoles', exact: true }).waitFor();
      const replacementLink = page.locator('a[href="#/replacement/comms-officer"]');
      await replacementLink.waitFor();
      assert.match(await replacementLink.innerText(), /^comms officer[\s\S]*assigned to you$/i);
      assert.match(await page.locator('a[href="#/ships/quellon/roles/quellon-explorer"]').innerText(), /open$/i,
        'The chooser shows the old station as open, not held by this member.');
      assert.equal(await page.getByText(/held by you/i).count(), 0);
      const stored = await explorer.persisted();
      assert.equal(stored.me.seatId, null);
      assert.equal(stored.me.replacementRoleId, 'comms-officer');
      assert.equal(explorer.callableRequests.slice(requestsBeforeHeal).filter(request => request.name === 'claimSeat').length, 0,
        'Reconnect never reclaims the released seat.');
      evidence.checks.reloadReplacesStalePlayerSeatAndRole = true;

      // The old seat stays released and a seat another member holds cannot be taken.
      const admiralSeat = async () => (await f.db.doc(`sessions/${f.sessionId}/seats/admiral`).get()).data();
      const explorerSeat = async () => (await f.db.doc(`sessions/${f.sessionId}/seats/quellon-explorer`).get()).data();
      const heldAdmiral = await admiralSeat();
      const currentSetup = (await f.session.get()).get('setupRevision');
      for (const seatId of ['admiral', 'quellon-explorer']) {
        const reply = await explorer.callable('claimSeat', { sessionId: f.sessionId, seatId, requestId: randomUUID(),
          expectedSetupRevision: currentSetup });
        assert.equal(reply.ok, false, `A replaced member cannot claim ${seatId}.`);
        record('claimSeat-denied', { seatId, code: reply.code });
      }
      assert.deepEqual(await admiralSeat(), heldAdmiral, 'The foreign seat is unchanged.');
      assert.equal((await explorerSeat()).holderUid, null, 'The old seat stays released.');
      evidence.checks.oldAndForeignSeatsStayLocked = true;

      // The cargo action resolved before the role change stays resolved.
      const cargoBefore = (await f.session.get()).data();
      const replay = await explorer.callable('transferShuttleCargoCommand', { sessionId: f.sessionId, ...evidence.cargoRequest });
      const cargoAfter = (await f.session.get()).data();
      assert.deepEqual(cargoAfter.shuttleCargo.hummingbird, cargoBefore.shuttleCargo.hummingbird);
      assert.deepEqual(cargoAfter.shipResources.quellon, cargoBefore.shipResources.quellon);
      record('resolved-cargo-replay-after-role-change', { ok: replay.ok, status: replay.result?.status ?? null, code: replay.code ?? null });
      evidence.checks.resolvedActionStaysResolvedAfterRoleChange = true;
      await page.screenshot({ path: join(evidenceDirectory, 'l1-1-replaced-member.png'), fullPage: true });
    });
  });
}
