#!/usr/bin/env node
// PC10.3 L2.1 #243 (P618): the original away-mission participant returns in a
// real browser after the mission was resolved by other real actors while it was
// offline. Its mission projection is replaced by the current resolved state and
// private result, its committed choice stays locked (an exact retry is a replay,
// a new request is refused without a write), and peers are denied its hand.
//
// Evidence class: normal authenticated local emulator gameplay on this
// worktree's own row. The Quellon Explorer is a real browser member (installed
// Chrome, headless automation profile) that joins through the ordinary UI; the
// GM and the other crew are authenticated HTTP actors on the production
// callables (scripts/pc07-authenticated-session.mjs). The mission is real: the
// facilitator moves Quellon to an organiser site with moveShipToLocation (which
// creates the first-arrival opportunity), deals with dealPrivateInitialCards,
// and every lifecycle step is commitAwayMissionLifecycleCommand. The deck and
// the facilitator draw are unseeded.
// Disclosed shortcuts, and nothing else:
//   1. the local GM access grant (dev-only fixture, as in every PC07 proof);
//   2. one privileged write moves the disposable Team Phase deadline into the
//      past so the Wing Commander can open Coordination (openCoordinationPhase,
//      as in the PC07/PC10.3 proofs);
//   3. the member's own lifecycle commands are sent through its page's own
//      Firebase SDK and Auth (the app's callable), not by clicking the mission
//      workspace; the mission projection is read through the app's own
//      subscribeToOwnAwayMissionLifecycles in the page (rules-enforced);
//   4. the proof reads the server-only mission revision and hand card IDs with
//      the Admin SDK to address the next command (read-only);
//   5. the peer-denial reads are Firestore REST reads with each peer's own ID
//      token, so the real rules decide.
// No session, mission, hand or event document is written by the fixture.
//
// Run: `npm run emulators:configure -- auto` (never row 6 on this machine),
// then `node scripts/test-pc10-3-mission-reconnect.emulator.mjs`.
// Evidence JSON goes to PC10_3_MISSION_RECONNECT_EVIDENCE_DIR (default: OS temp dir).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { emulatorEnvironment, enterReconnectRow, openReconnectMember, repository, startEmulatorApp } from './pc10-3-reconnect-harness.mjs';

const script = 'node scripts/test-pc10-3-mission-reconnect.emulator.mjs';

if (await enterReconnectRow({ script, kind: 'pc10-3-mission-reconnect' })) {
  const { chromium } = await import('playwright');
  const { createPc07AuthenticatedSession } = await import('./pc07-authenticated-session.mjs');
  const { openCoordinationPhase, documentState } = await import('./pc10-3-stale-action-proof.mjs');
  const { appModule, trackAppModules, pollUntil } = await import('./pc10-3-browser-proof-helpers.mjs');
  const require = createRequire(join(repository, 'functions/package.json'));
  const { organiserSitesForChart } = require('../functions/lib/starChartLookup.js');
  const { awayMissionHandId } = require('../functions/lib/awayMissionCards.js');
  const evidenceDirectory = process.env.PC10_3_MISSION_RECONNECT_EVIDENCE_DIR ?? join(tmpdir(), 'dow-pc10-3-mission-reconnect');
  const evidence = { kind: 'normal-authenticated-local-emulator-browser-mission-reconnect',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
    worktreeClean: execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }).trim() === '',
    nodeVersion: process.version, preparedScene: false, productionGameplay: false,
    shortcuts: ['local GM access grant', 'Team Phase deadline moved into the past (openCoordinationPhase)',
      "member's lifecycle commands via its page's own SDK, not the workspace UI", 'Admin SDK read-only for mission revision and card IDs',
      'peer denial via Firestore REST with each peer token'],
    checks: {}, steps: [] };
  let app, browser, f, explorer;
  const live = s => s.connection === 'live' && s.freshness === 'server';
  const record = (step, details = {}) => evidence.steps.push({ step, at: new Date().toISOString(), ...details });

  /** Install the app's own mission projection subscription in the page; the latest feed lands on window. */
  const watchFeed = (member, sessionId, uid) => member.page.evaluate(async ({ moduleUrl, sessionId, uid }) => {
    const { subscribeToOwnAwayMissionLifecycles } = await import(moduleUrl);
    window.__missionFeedUpdates = 0;
    window.__missionFeedStop?.();
    window.__missionFeedStop = subscribeToOwnAwayMissionLifecycles(sessionId, uid, state => {
      window.__missionFeedUpdates += 1;
      window.__missionFeed = JSON.parse(JSON.stringify(state));
    });
  }, { moduleUrl: appModule(member, '/src/lib/awayMissionLifecycleService.ts'), sessionId, uid });
  const feed = member => member.page.evaluate(() => window.__missionFeed ?? null);
  const summary = state => state && { status: state.status, missions: (state.missions ?? []).map(m => ({
    phase: m.publicState?.phase, revision: m.publicState?.revision, privatePhase: m.privateState?.phase,
    assignmentCommitted: m.privateState?.assignmentCommitted, cards: m.privateState?.cards,
    outcomes: m.publicState?.outcomes })) };

  describe('PC10.3 mission projection after a reconnect (real browser, real callables)', () => {
    before(async () => {
      await mkdir(evidenceDirectory, { recursive: true });
      app = await startEmulatorApp();
      browser = await chromium.launch({ headless: true, ...(process.env.PC10_3_BROWSER_CHANNEL === 'chromium' ? {} : { channel: 'chrome' }) });
      explorer = await openReconnectMember(browser, { uiUrl: app.url, label: 'quellon-explorer' });
      trackAppModules(explorer);
      f = await createPc07AuthenticatedSession('PC10.3 mission reconnect proof', 8, { keepAlive: true, serializeFixtureCalls: true,
        joinBrowserPlayers: { 'quellon-explorer': explorer.join } });
      await explorer.page.goto(`${app.url}/#/ships/quellon/roles/quellon-explorer`);
      await explorer.until('live explorer at its station', s => live(s) && s.seatId === 'quellon-explorer');
      evidence.fixtureClock = await openCoordinationPhase(f);
    });

    after(async () => {
      try {
        await explorer?.page.screenshot({ path: join(evidenceDirectory, 'final-quellon-explorer.png'), fullPage: true }).catch(() => {});
        evidence.browserErrors = explorer?.errors;
        evidence.heartbeatFailures = f?.heartbeatFailures;
        evidence.completedAt = new Date().toISOString();
        await writeFile(join(evidenceDirectory, 'pc10-3-mission-reconnect.json'), `${JSON.stringify(evidence, null, 2)}\n`);
      } finally {
        await browser?.close();
        if (f) { await f.cleanup(); await f.db.terminate(); }
        await app?.stop();
      }
    });

    it('L2.1 #243: the returning participant sees the resolved mission and private result; its choice stays locked; peers are denied', async () => {
      const page = explorer.page;
      const member = await explorer.token();
      const leader = f.byRole('wing-commander');
      const outsider = f.byRole('admiral');

      // The facilitator moves Quellon to an organiser site: the first arrival creates the mission opportunity.
      const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'A')[0];
      const moved = f.ok(await f.call(f.gm, 'moveShipToLocation', { sessionId: f.sessionId, instanceId: f.instanceId, requestId: randomUUID(),
        shipId: 'quellon', destination: coordinate, expectedRevision: (await f.session.get()).get('vesselActionRevisions')?.quellon ?? 0 }), 'move to site');
      const opportunity = (await f.db.doc(`sessions/${f.sessionId}/missionOpportunities/${moved.missionOpportunityId}`).get()).data();
      assert.equal(opportunity.siteCode, 'A');
      const current = (await f.session.get()).data();
      f.ok(await f.call(f.gm, 'dealPrivateInitialCards', { sessionId: f.sessionId, instanceId: f.instanceId, requestId: randomUUID(),
        expectedSetupRevision: current.setupRevision, expectedPhaseRevision: current.turnState.phaseRevision, expectedCycle: current.currentTurn,
        opportunityId: opportunity.id, groupId: opportunity.groupId, chart: 'A', coordinate: opportunity.coordinate,
        sourceCycle: opportunity.sourceCycle, missionLeaderUid: leader.localId, participantUids: [leader.localId, member.localId] }), 'deal');
      const missionId = `mission-${opportunity.id}`;
      const missionRef = f.db.doc(`sessions/${f.sessionId}/serverState/awayMissions/instances/${missionId}`);
      const handPath = uid => `sessions/${f.sessionId}/awayMissionHands/${awayMissionHandId(missionId, uid)}`;
      const hand = async uid => (await f.db.doc(handPath(uid)).get()).data();
      const revision = async () => (await missionRef.get()).get('revision');
      const httpStep = async (who, type, fields = {}) => f.ok(await f.call(who, 'commitAwayMissionLifecycleCommand', { sessionId: f.sessionId,
        missionId, requestId: randomUUID(), expectedRevision: await revision(), type, ...fields, ...(who === f.gm ? { instanceId: f.instanceId } : {}) }), type);
      const memberStep = async (type, fields = {}, requestId = randomUUID()) => {
        const payload = { sessionId: f.sessionId, missionId, requestId, expectedRevision: await revision(), type, ...fields };
        return { payload, reply: await explorer.callable('commitAwayMissionLifecycleCommand', payload) };
      };
      const ok = ({ reply }, step) => { assert.equal(reply.ok, true, `${step}: ${reply.code} ${reply.message}`); return reply.result; };

      ok(await memberStep('requestExtraCards', { count: 1 }), 'member requests an extra card');
      await httpStep(leader, 'distributeExtraCard', { participantUid: member.localId, opportunityId: 'A-1' });
      await httpStep(f.gm, 'openDiscards');
      const initialCard = (await hand(member.localId)).cardId;
      ok(await memberStep('discardCard', { cardId: initialCard }), 'member discards');
      await httpStep(leader, 'discardCard', { cardId: (await hand(leader.localId)).cardId });
      const kept = (await hand(member.localId)).lifecyclePrivateState.cards.find(card => card.id !== initialCard);
      // The member's committed choice: its remaining card face down on A-1.
      const choice = await memberStep('assignCards', { placements: [{ cardId: kept.id, opportunityId: 'A-1' }] });
      const committedChoice = ok(choice, 'member assigns');
      assert.equal(committedChoice.status, 'committed');
      record('member-choice-committed', { phase: committedChoice.publicState.phase, revision: committedChoice.revision });

      // The browser's own projection shows the assigning state before it goes away.
      await watchFeed(explorer, f.sessionId, member.localId);
      const before = await pollUntil('the live projection shows the committed choice', async () => {
        const state = await feed(explorer);
        return state?.status === 'ready' && state.missions[0]?.publicState.phase === 'assigning' &&
          state.missions[0].privateState.assignmentCommitted === true ? state : null;
      }, 30_000);
      evidence.projectionBefore = summary(before);

      // The member goes away; the leader's final assignment resolves the mission.
      await explorer.partition();
      await httpStep(leader, 'assignCards', { placements: [] });
      const resolved = (await missionRef.get()).get('lifecycleRecord');
      assert.equal(resolved.status, 'resolved');
      const serverOutcome = resolved.outcomes.find(entry => entry.opportunityId === 'A-1');
      const resolvedRevision = await revision();
      record('mission-resolved-while-away', { revision: resolvedRevision, outcome: serverOutcome.outcome, total: serverOutcome.total });
      // While partitioned the browser can only hold what it had.
      const whileAway = summary(await feed(explorer));
      evidence.projectionWhileAway = whileAway;
      assert.notEqual(whileAway.missions[0]?.phase, 'resolved', 'The partitioned browser still holds the earlier projection.');

      // Reload from the persisted session cache while still offline, then the backend returns.
      await explorer.reload();
      await explorer.until('persisted snapshot without server authority', s => s.persistedSessionSnapshot && s.freshness !== 'server');
      await watchFeed(explorer, f.sessionId, member.localId);
      await page.waitForTimeout(1_000);
      evidence.projectionAfterOfflineReload = summary(await feed(explorer));
      assert.ok(!(evidence.projectionAfterOfflineReload?.missions ?? []).some(m => m.phase === 'resolved' || m.phase === 'assigning' && m.privatePhase === 'resolved'),
        'Nothing resolved is invented from cache.');
      const healedAt = Date.now();
      await explorer.heal();
      await explorer.until('live after the reconnect', live, 30_000);
      const after = await pollUntil('the current resolved projection replaces the cache', async () => {
        const state = await feed(explorer);
        return state?.status === 'ready' && state.missions[0]?.publicState.phase === 'resolved' &&
          state.missions[0].privateState.phase === 'resolved' ? state : null;
      }, 30_000);
      evidence.projectionAfterReconnect = summary(after);
      evidence.reconnectMs = Date.now() - healedAt;
      const mine = after.missions[0];
      assert.equal(mine.publicState.revision, resolvedRevision);
      assert.equal(mine.privateState.participantUid, member.localId);
      assert.equal(mine.privateState.assignmentCommitted, true);
      assert.deepEqual(mine.privateState.cards.find(card => card.id === kept.id), { id: kept.id, value: kept.value, status: 'assigned', opportunityId: 'A-1' },
        'The private result shows the member\'s own committed card.');
      const shownOutcome = mine.publicState.outcomes.find(entry => entry.opportunityId === 'A-1');
      assert.equal(shownOutcome.total, serverOutcome.total);
      assert.equal(shownOutcome.outcome, serverOutcome.outcome);
      assert.doesNotMatch(JSON.stringify(mine.publicState), /bonusBreakdown|cardTotal|hummingbird/, 'Hidden bonus details stay hidden.');
      evidence.checks.resolvedProjectionReplacesCache = true;

      // The committed choice stays locked: the exact retry is a replay; a new request is refused; nothing is written.
      const watched = await documentState(f.db, [missionRef.path, handPath(member.localId)]);
      const retry = await explorer.callable('commitAwayMissionLifecycleCommand', choice.payload);
      assert.equal(retry.ok, true, retry.message);
      assert.equal(retry.result.status, 'replayed');
      assert.equal(retry.result.requestId, choice.payload.requestId, 'The replay answers the original request.');
      evidence.exactRetry = { status: retry.result.status, revision: retry.result.revision, committedRevision: committedChoice.revision,
        privatePhase: retry.result.privateState?.phase ?? null };
      const fresh = await explorer.callable('commitAwayMissionLifecycleCommand', { ...choice.payload, requestId: randomUUID(),
        expectedRevision: resolvedRevision });
      evidence.newRequestAfterResolution = fresh.ok ? { status: fresh.result.status } : { code: fresh.code };
      assert.ok(!fresh.ok || fresh.result.status === 'stale', 'A new assignment request after resolution is refused.');
      assert.deepEqual(await documentState(f.db, [missionRef.path, handPath(member.localId)]), watched, 'Neither request wrote anything.');
      evidence.checks.committedChoiceLocked = true;

      // Peers are denied the member's private hand; the member itself can read it (positive control).
      const env = await emulatorEnvironment();
      const restRead = async (idToken, path) => (await fetch(`http://127.0.0.1:${env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT}/v1/projects/${f.project}/databases/(default)/documents/${path}`,
        { headers: { Authorization: `Bearer ${idToken}` } })).status;
      const ownToken = (await explorer.token()).idToken;
      evidence.handReads = { member: await restRead(ownToken, handPath(member.localId)), leader: await restRead(leader.idToken, handPath(member.localId)),
        outsider: await restRead(outsider.idToken, handPath(member.localId)), memberReadsLeader: await restRead(ownToken, handPath(leader.localId)) };
      assert.equal(evidence.handReads.member, 200);
      assert.equal(evidence.handReads.leader, 403, 'Another participant is denied the private hand.');
      assert.equal(evidence.handReads.outsider, 403, 'A non-participant is denied the private hand.');
      assert.equal(evidence.handReads.memberReadsLeader, 403, 'The member is denied the peer\'s hand.');
      evidence.checks.peersDeniedPrivateHand = true;
      await page.screenshot({ path: join(evidenceDirectory, 'l2-1-after-reconnect.png'), fullPage: true });
    });
  });
}
