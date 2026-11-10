#!/usr/bin/env node
// PC10.3 T2.2 #253 (P620): a member's role is reassigned by the facilitator
// while their browser is away with a queued action. On return the browser
// refreshes the actual entitled state (the replacement role), the queued action
// is replayed once with its original request ID and the server re-authorizes it
// under the current role: it commits when the new role still covers the same
// team, and is refused without a write (shown in the alert) when it does not.
//
// Evidence class: normal authenticated local emulator gameplay on this
// worktree's own row, after start (Team Phase, cycle 1). Two real browser
// members (installed Chrome, headless automation profile) join through the
// ordinary UI and submit their grievance through the ordinary Civil Unrest
// panel; the GM and the other crew are authenticated HTTP actors on the
// production callables (scripts/pc07-authenticated-session.mjs). The
// facilitator opens the crisis and reassigns roles with the ordinary callables
// (setReplacementEligibility + assignReplacementRole).
// Disclosed shortcuts, and nothing else:
//   1. the local GM access grant (dev-only fixture, as in every PC07 proof);
//   2. each grievance request is dropped by the test network while the backend
//      is partitioned, so the app queues it as an unknown outcome.
// No session, player, crisis or grievance document is written by the fixture.
//
// Run: `npm run emulators:configure -- auto` (never row 6 on this machine),
// then `node scripts/test-pc10-3-role-reassignment.emulator.mjs`.
// Evidence JSON goes to PC10_3_ROLE_REASSIGNMENT_EVIDENCE_DIR (default: OS temp dir).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { enterReconnectRow, openReconnectMember, repository, startEmulatorApp } from './pc10-3-reconnect-harness.mjs';

const script = 'node scripts/test-pc10-3-role-reassignment.emulator.mjs';

if (await enterReconnectRow({ script, kind: 'pc10-3-role-reassignment' })) {
  const { chromium } = await import('playwright');
  const { createPc07AuthenticatedSession } = await import('./pc07-authenticated-session.mjs');
  const { openCivilUnrestCrisis, moveToReplacementRole, documentState } = await import('./pc10-3-stale-action-proof.mjs');
  const { pendingCommands, pollUntil, storedNotice } = await import('./pc10-3-browser-proof-helpers.mjs');
  const evidenceDirectory = process.env.PC10_3_ROLE_REASSIGNMENT_EVIDENCE_DIR ?? join(tmpdir(), 'dow-pc10-3-role-reassignment');
  const evidence = { kind: 'normal-authenticated-local-emulator-browser-role-reassignment',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
    worktreeClean: execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }).trim() === '',
    nodeVersion: process.version, preparedScene: false, productionGameplay: false,
    shortcuts: ['local GM access grant', 'grievance request dropped by the test network during the partition'], cases: {} };
  let app, browser, f, crisis;
  const members = {};
  const live = s => s.connection === 'live' && s.freshness === 'server';
  const quiet = new Set(['getCurrentMemberSession', 'listMyScoutReports']);

  async function proveReassignment({ member, roleId, shipId, replacementRoleId, expectAccepted, text }) {
    const page = member.page;
    const ev = evidence.cases[roleId] = { replacementRoleId, expectAccepted, checks: {} };
    const deferred = [];
    const check = (ok, message) => { if (!ok) deferred.push(message); return ok; };
    const grievanceIds = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.endsWith('/submitCivilUnrestGrievance')) grievanceIds.push(request.postDataJSON()?.data?.requestId ?? null);
    });
    try {
      await page.goto(`${app.url}/#/ships/${shipId}/roles/${roleId}`);
      const before = await member.until('live member at its station', s => live(s) && s.seatId === roleId && s.activeConsoleRoleId === roleId);
      const grievancePath = `sessions/${f.sessionId}/civilUnrestGrievances/${shipId}`;
      const watched = await documentState(f.db, [grievancePath]);
      assert.equal(watched[grievancePath].exists, false, 'No grievance exists for this team yet.');

      // The member submits a grievance through the ordinary panel; the link drops before it reaches the server.
      const panel = page.getByRole('region', { name: 'Civil Unrest team grievances' });
      await panel.getByLabel("Your team's grievance", { exact: true }).fill(text);
      let sent;
      await page.route(url => url.pathname.endsWith('/submitCivilUnrestGrievance'), async route => {
        sent = route.request().postDataJSON().data;
        await member.partition();
        await route.abort('internetdisconnected');
      }, { times: 1 });
      await panel.getByRole('button', { name: 'Submit grievance', exact: true }).click();
      await panel.getByText('Saved to send when the connection returns.', { exact: true }).waitFor();
      assert.deepEqual((await pendingCommands(page)).map(c => ({ kind: c.kind, requestId: c.payload.requestId, authority: c.queuedWithServerAuthority })),
        [{ kind: 'submitCivilUnrestGrievance', requestId: sent.requestId, authority: true }]);
      assert.equal(sent.affectedShipId, shipId);
      const queuedAt = Date.now();

      // While the member is away the facilitator moves them to a replacement role.
      await moveToReplacementRole(f, { uid: before.uid, label: roleId }, replacementRoleId);
      const serverPlayer = (await f.db.doc(`sessions/${f.sessionId}/players/${before.uid}`).get()).data();
      assert.equal(serverPlayer.replacementRoleId, replacementRoleId);

      await member.reload();
      const stale = await member.until('persisted snapshot without server authority', s =>
        s.persistedSessionSnapshot && s.freshness !== 'server');
      assert.equal(stale.replacementRoleId, null, 'The reload rendered the stale cached role.');
      assert.equal((await pendingCommands(page)).length, 1, 'The queued grievance survived the reload.');
      const healedAt = Date.now();
      const requestsBefore = member.callableRequests.length;
      await member.heal();
      const fresh = await member.until('the current replacement role replaces the cache', s => live(s) &&
        s.replacementRoleId === replacementRoleId && s.seatId === null && s.activeConsoleRoleId === null, 30_000);
      assert.equal(fresh.uid, before.uid, 'Same member, refreshed entitled state.');
      ev.checks.entitledStateRefreshed = true;
      await pollUntil('the outbox finished', async () => (await pendingCommands(page)).length === 0, 30_000).catch(() => {});
      ev.notice = await storedNotice(member);
      ev.timelineAfterHeal = member.callableResponses.filter(r => r.at >= healedAt && !quiet.has(r.name))
        .map(r => ({ name: r.name, httpStatus: r.httpStatus, error: r.error?.status ?? null, msAfterHeal: r.at - healedAt }));
      assert.deepEqual(await pendingCommands(page), [], 'The queued grievance left the outbox.');

      // Replayed once with the original request ID; the server re-authorized it under the current role.
      const replays = member.callableRequests.slice(requestsBefore).filter(r => r.name === 'submitCivilUnrestGrievance');
      const replies = member.callableResponses.filter(r => r.at >= healedAt && r.name === 'submitCivilUnrestGrievance');
      ev.replay = { requests: replays.length, requestIdsAfterOriginal: grievanceIds.slice(1), msQueuedToReplay: replays[0] ? replays[0].at - queuedAt : null,
        replies: replies.map(r => ({ httpStatus: r.httpStatus, error: r.error })) };
      const replayed = check(replays.length === 1 && replies.length === 1 && grievanceIds.slice(1).every(id => id === sent.requestId),
        `The queued grievance is replayed exactly once with its original request ID (requests ${replays.length}).`);
      ev.checks.replayedOnceWithOriginalRequestId = replayed;

      const after = (await f.db.doc(grievancePath).get());
      if (expectAccepted) {
        if (replayed) check(replies[0].httpStatus === 200, `The server accepts the replay under the same-team role (${JSON.stringify(replies[0])}).`);
        if (check(after.exists && after.get('text') === text && after.get('revision') === 1,
          'The accepted grievance is committed once for the same team.')) {
          // An exact retry of the committed request returns its receipt and writes nothing.
          const beforeRetry = await documentState(f.db, [grievancePath]);
          const retry = await member.callable('submitCivilUnrestGrievance', sent);
          assert.equal(retry.ok, true, retry.message);
          assert.equal(retry.result.revision, 1);
          assert.deepEqual(await documentState(f.db, [grievancePath]), beforeRetry, 'An exact retry writes nothing.');
          ev.checks.acceptedOnceAndExactRetryIsReplay = true;
        }
      } else {
        if (replayed) check(replies[0].error?.status === 'PERMISSION_DENIED', `The server refuses the replay under the other-team role (${JSON.stringify(replies[0])}).`);
        assert.deepEqual(await documentState(f.db, [grievancePath]), watched, 'The refused grievance wrote nothing.');
        ev.checks.refusedWithoutWrite = true;
        // The refusal is shown to the player.
        ev.alertText = await page.getByRole('alert').allInnerTexts().catch(() => []);
        if (replayed) check(ev.alertText.length > 0, 'The refusal is shown to the player in the alert.');
        ev.checks.refusalShownInAlert = ev.alertText.length > 0;
        // The former actor cannot replay it either.
        const retry = await member.callable('submitCivilUnrestGrievance', sent);
        assert.equal(retry.ok, false);
        assert.deepEqual(await documentState(f.db, [grievancePath]), watched, 'A retry by the former actor writes nothing.');
        ev.checks.formerActorRetryRefused = true;
      }
      await page.screenshot({ path: join(evidenceDirectory, `${roleId}-after-reassignment.png`), fullPage: true });
      assert.deepEqual(deferred, []);
    } finally {
      ev.deferredFailures = deferred;
    }
  }

  describe('PC10.3 role reassignment with a queued action (real browsers, real callables)', () => {
    before(async () => {
      await mkdir(evidenceDirectory, { recursive: true });
      app = await startEmulatorApp();
      browser = await chromium.launch({ headless: true, ...(process.env.PC10_3_BROWSER_CHANNEL === 'chromium' ? {} : { channel: 'chrome' }) });
      for (const label of ['icebreaker-miner', 'quellon-explorer']) members[label] = await openReconnectMember(browser, { uiUrl: app.url, label });
      f = await createPc07AuthenticatedSession('PC10.3 role reassignment proof', 8, { keepAlive: true, serializeFixtureCalls: true,
        joinBrowserPlayers: Object.fromEntries(Object.entries(members).map(([label, member]) => [label, member.join])) });
      crisis = await openCivilUnrestCrisis(f);
      evidence.crisisRevision = crisis.crisisRevision;
    });

    after(async () => {
      try {
        evidence.browserErrors = Object.fromEntries(Object.values(members).map(m => [m.label, m.errors]));
        evidence.heartbeatFailures = f?.heartbeatFailures;
        evidence.completedAt = new Date().toISOString();
        await writeFile(join(evidenceDirectory, 'pc10-3-role-reassignment.json'), `${JSON.stringify(evidence, null, 2)}\n`);
      } finally {
        await browser?.close();
        if (f) { await f.cleanup(); await f.db.terminate(); }
        await app?.stop();
      }
    });

    it('T2.2 #253: reassigned to a same-team role, the queued grievance is replayed and the server accepts it once', async () => {
      await proveReassignment({ member: members['icebreaker-miner'], roleId: 'icebreaker-miner', shipId: 'icebreaker',
        replacementRoleId: 'commissar', expectAccepted: true, text: 'Icebreaker night crews need relief.' });
    });

    it('T2.2 #253: reassigned to another team, the queued grievance is replayed and refused without a write', async () => {
      await proveReassignment({ member: members['quellon-explorer'], roleId: 'quellon-explorer', shipId: 'quellon',
        replacementRoleId: 'rosal-militia-leader', expectAccepted: false, text: 'Quellon water rations are too thin.' });
    });
  });
}
