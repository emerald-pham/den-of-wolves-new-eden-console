#!/usr/bin/env node
// PC10.3 L1.4 #242 and T2.1 #252 (P618/P620): a real browser member who lost
// station authority while away keeps safe unsent input, keeps membership and
// returns to the existing station chooser with the reselect instruction; the
// command it had queued is replayed once with its original request ID for the
// server to re-authorize, the server refuses it without a write, the player is
// told in the alert, and the reselect instruction stays on screen. The draft
// refills only after a deliberate reselect and is never submitted by it.
//
// Two members, one ordinary session, the same steps:
//   - the Shepherd Scientist claimed its station without a cast role (the
//     server's "no seat, unbound active console" resume branch);
//   - the Quellon Explorer was cast by the facilitator, then claimed its seat
//     (the ordinary PC07 casting path).
//
// Evidence class: normal authenticated local emulator gameplay on this
// worktree's own row. Real browser members (installed Chrome, headless
// automation profile) join through the ordinary UI; the GM, the rest of the
// crew and two uncast rivals are authenticated HTTP actors on the production
// callables (scripts/pc10-3-casting-session.mjs). Station release and claim are
// casting-window commands, so this proof runs in the casting window (setup
// confirmed, every seat claimed, game not started).
// Disclosed shortcuts, and nothing else:
//   1. the local GM access grant (dev-only fixture, as in every PC07 proof);
//   2. players have no own-seat release control, so each member's queued
//      command is the app's own `releaseSeat` service call (src/lib/sessionService)
//      invoked in the page; its request is dropped by the test network while
//      the backend is partitioned, so the app queues it as an unknown outcome;
//   3. the uncast member's own seat claim and console open during setup are
//      HTTP calls made with that browser's own Auth token (as the PC07 helper
//      does for browser players).
// No session, seat, player or event document is written by the fixture.
//
// Run: `npm run emulators:configure -- auto` (never row 6 on this machine),
// then `node scripts/test-pc10-3-station-loss.emulator.mjs`.
// Evidence JSON and screenshots go to PC10_3_STATION_LOSS_EVIDENCE_DIR
// (default: OS temp dir). Rendered-notice screenshots also go to
// PC10_3_NOTICE_SCREENS_DIR when it is set. PC10_3_DIAGNOSE=1 also records the
// app store's connection, freshness, notice and outbox transitions around the
// reconnect (read-only page subscription).
//
// Which reply reaches the returning browser first (resumeSession or the 10 s
// presence heartbeat) is fixed by holding the other request until the first has
// answered (a delayed packet; scripts/pc10-3-browser-proof-helpers.mjs
// holdCallable). The Wing Commander case holds the resume behind the heartbeat.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { enterReconnectRow, openReconnectMember, repository, startEmulatorApp } from './pc10-3-reconnect-harness.mjs';

const script = 'node scripts/test-pc10-3-station-loss.emulator.mjs';

if (await enterReconnectRow({ script, kind: 'pc10-3-station-loss' })) {
  const { chromium } = await import('playwright');
  const { createCastingSession } = await import('./pc10-3-casting-session.mjs');
  const { pendingCommands, appModule, trackAppModules, pollUntil, storedNotice, watchResumes, holdCallable, STATION_LOSS_NOTICE, QUEUED_NOT_COMPLETED } =
    await import('./pc10-3-browser-proof-helpers.mjs');
  const evidenceDirectory = process.env.PC10_3_STATION_LOSS_EVIDENCE_DIR ?? join(tmpdir(), 'dow-pc10-3-station-loss');
  const noticeScreens = process.env.PC10_3_NOTICE_SCREENS_DIR;
  const evidence = { kind: 'normal-authenticated-local-emulator-browser-station-loss',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
    worktreeClean: execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }).trim() === '',
    nodeVersion: process.version, preparedScene: false, productionGameplay: false,
    shortcuts: ['local GM access grant', "queued command is the app's releaseSeat service call invoked in the page (no player UI)",
      "uncast member's own setup seat claim/console open over HTTP with its browser token"],
    cases: {} };
  let app, browser, f;
  const members = {};
  const live = s => s.connection === 'live' && s.freshness === 'server';
  const quiet = new Set(['getCurrentMemberSession', 'listMyScoutReports']);

  async function proveStationLoss({ member, seatId, rival, shuttleId, shuttleLabel, linkName, firstReply = 'resumeSession', replayOnly = false,
    consoleRoute = `ships/${seatId.split('-')[0]}/roles/${seatId}` }) {
    const page = member.page;
    const ev = evidence.cases[seatId] = { firstReply, checks: {}, steps: [], resumeReplies: [] };
    const record = (step, details = {}) => ev.steps.push({ step, at: new Date().toISOString(), ...details });
    const scoutRegion = page.getByRole('region', { name: `${shuttleLabel} scouting request` });
    const coordinate = scoutRegion.getByLabel('Printed system coordinate', { exact: true });
    const seatDoc = async () => (await f.db.doc(`sessions/${f.sessionId}/seats/${seatId}`).get()).data();
    const timeline = from => member.callableResponses.filter(r => r.at >= from && !quiet.has(r.name))
      .map(r => ({ name: r.name, httpStatus: r.httpStatus, error: r.error?.status ?? null, msAfterHeal: r.at - from }));
    watchResumes(member, ev.resumeReplies);
    // Product-behaviour checks that do not gate later steps are collected and asserted at the end.
    const deferred = [];
    const check = (ok, message) => { if (!ok) deferred.push(message); return ok; };
    const releaseRequestIds = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.endsWith('/releaseSeat')) releaseRequestIds.push(request.postDataJSON()?.data?.requestId ?? null);
    });
    try {
      await page.goto(`${app.url}/#/${shuttleId ? `shuttles/${shuttleId}` : consoleRoute}`);
      const before = await member.until('live member at its held station', s => live(s) && s.sessionId === f.sessionId &&
        s.seatId === seatId && s.activeConsoleRoleId === seatId);
      const memberPath = `sessions/${f.sessionId}/players/${before.uid}`;
      ev.assignedRoleIdBefore = (await f.db.doc(memberPath).get()).get('assignedRoleId') ?? null;

      // Safe unsent input: the member types a scout coordinate and does not submit it.
      const draftKey = `pc10:scout-draft:${encodeURIComponent(f.sessionId)}:${encodeURIComponent(before.uid)}:${shuttleId}`;
      const draft = () => page.evaluate(key => JSON.parse(window.sessionStorage.getItem(key) ?? 'null'), draftKey);
      if (!replayOnly) {
        await coordinate.fill('4888');
        assert.equal((await draft())?.targetCoordinate, '4888', 'The unsent coordinate is kept as a per-tab draft.');
      }

      // A queued command: the member's own station release is sent; the link drops before it reaches the server.
      let sentRelease;
      await page.route(url => url.pathname.endsWith('/releaseSeat'), async route => {
        sentRelease = route.request().postDataJSON().data;
        await member.partition();
        await route.abort('internetdisconnected');
      }, { times: 1 });
      const disposition = await page.evaluate(async ({ moduleUrl, seatId }) => {
        const { releaseSeat } = await import(moduleUrl);
        return releaseSeat(seatId);
      }, { moduleUrl: appModule(member, '/src/lib/sessionService.ts'), seatId });
      assert.equal(disposition, 'queued', 'The dropped release is queued, not reported as committed or refused.');
      assert.deepEqual((await pendingCommands(page)).map(c => ({ kind: c.kind, requestId: c.payload.requestId, authority: c.queuedWithServerAuthority })),
        [{ kind: 'releaseSeat', requestId: sentRelease.requestId, authority: true }], 'The persisted outbox holds the original request.');
      assert.equal((await seatDoc()).holderUid, before.uid, 'The dropped release never reached the server.');
      record('queued-release', { requestId: sentRelease.requestId });

      // While the member is away the facilitator releases the station and a rival takes it.
      f.ok(await f.call(f.gm, 'releaseSeat', { sessionId: f.sessionId, seatId, requestId: randomUUID(),
        expectedSetupRevision: await f.setupRevision(), instanceId: f.instanceId, reason: 'Player stepped away' }), 'GM release');
      f.ok(await f.call(rival, 'claimSeat', { sessionId: f.sessionId, seatId, requestId: randomUUID(),
        expectedSetupRevision: await f.setupRevision() }), 'rival claim');
      const revisionAfterLoss = await f.setupRevision();
      assert.equal((await seatDoc()).holderUid, rival.localId);
      record('station-taken', { setupRevision: revisionAfterLoss });

      // Reload from the persisted cache, then the backend returns.
      await member.reload();
      const stale = await member.until('persisted station snapshot without server authority', s =>
        s.sessionId === f.sessionId && s.persistedSessionSnapshot && s.freshness !== 'server');
      assert.equal(stale.seatId, seatId, 'The reload rendered the stale cached station.');
      assert.equal((await pendingCommands(page)).length, 1, 'The queued release survived the reload.');
      const requestsBeforeHeal = member.callableRequests.length;
      const responsesBeforeHeal = member.callableResponses.length;
      // Which reply reaches the browser first is fixed by holding the other one (a delayed packet).
      const heldName = firstReply === 'resumeSession' ? 'refreshPresence' : 'resumeSession';
      const hold = await holdCallable(member, heldName);
      if (process.env.PC10_3_DIAGNOSE) {
        await page.evaluate(async moduleUrl => {
          const { useSessionStore } = await import(moduleUrl);
          window.__storeLog = [];
          const t0 = Date.now();
          useSessionStore.subscribe((state, prev) => {
            const pick = st => ({ pending: st.pendingCommands.length, freshness: st.sessionSnapshotFreshness, connection: st.connection,
              notice: st.communicationError?.kind ?? null, queuedFlag: st.communicationError?.queuedCommandNotCompleted ?? null,
              seat: st.me?.seatId ?? null, updatedAt: st.session?.updatedAt ?? null, setupRevision: st.session?.setupRevision ?? null });
            const now = pick(state), was = pick(prev);
            if (JSON.stringify(now) !== JSON.stringify(was)) window.__storeLog.push({ ms: Date.now() - t0, ...now });
          });
        }, appModule(member, '/src/store/useSessionStore.ts'));
      }
      hold.arm();
      ev.healedAt = Date.now();
      await member.heal();
      if (firstReply === 'refreshPresence') {
        // The presence heartbeat (every 10 s) answers before the resume.
        await pollUntil('a heartbeat reply after the backend returned', async () =>
          member.callableResponses.some(r => r.name === 'refreshPresence' && r.at >= ev.healedAt), 15_000);
      } else {
        await pollUntil('the resume reply and outbox replay', async () =>
          member.callableResponses.some(r => r.name === 'resumeSession' && r.at >= ev.healedAt) &&
          (await pendingCommands(page)).length === 0, 20_000).catch(() => {});
      }
      ev.heldUntilFirstReply = { held: heldName, requests: await hold.release(), releasedMsAfterHeal: Date.now() - ev.healedAt };
      // The resume retry runs every 6 s with a remembered session; allow for several.
      const fresh = await member.until('current membership without the lost station', s => live(s) && s.seatId === null, 30_000);
      await pollUntil('the outbox finished', async () => (await pendingCommands(page)).length === 0, 30_000).catch(() => {});
      if (process.env.PC10_3_DIAGNOSE) ev.storeLog = await page.evaluate(() => window.__storeLog);
      ev.afterReconnect = { notice: await storedNotice(member), pending: (await pendingCommands(page)).map(c => c.kind) };

      // Membership is kept: same Auth actor, same session, still a player.
      assert.equal(fresh.uid, before.uid);
      assert.equal(fresh.memberUid, before.uid);
      assert.equal(fresh.sessionId, f.sessionId);
      assert.equal(fresh.role, 'player');
      const memberDoc = (await f.db.doc(memberPath).get()).data();
      assert.equal(memberDoc.connected, true);
      assert.equal(memberDoc.seatId, null);
      assert.equal(memberDoc.assignedRoleId ?? null, ev.assignedRoleIdBefore, 'Membership and any cast role are kept; only the station was lost.');
      ev.checks.membershipKept = true;

      // The member lands on the existing chooser with the reselect instruction.
      const chooser = page.getByRole('heading', { name: 'Stations and consoles', exact: true });
      const reachedChooser = await chooser.waitFor({ timeout: 20_000 }).then(() => true, () => false);
      ev.timelineAfterHeal = timeline(ev.healedAt);
      if (!reachedChooser) {
        await page.screenshot({ path: join(evidenceDirectory, `${seatId}-no-chooser.png`), fullPage: true });
        ev.noChooser = { hash: new URL(page.url()).hash, storedNotice: await storedNotice(member),
          pending: (await pendingCommands(page)).map(c => c.kind), draftStillStored: (await draft())?.targetCoordinate ?? null,
          seat: { status: (await seatDoc()).status, heldByRival: (await seatDoc()).holderUid === rival.localId },
          serverPlayer: { seatId: memberDoc.seatId, activeConsoleRoleId: (await f.db.doc(memberPath).get()).get('activeConsoleRoleId') ?? null } };
      }
      assert.ok(reachedChooser, `${seatId}: the member reaches the station chooser after losing the station ` +
        `(resume replies ${JSON.stringify(ev.resumeReplies.filter(r => r.at >= ev.healedAt))}).`);
      assert.equal(new URL(page.url()).hash, '#/console', 'The member lands on the existing station chooser.');
      await page.getByRole('alert').filter({ hasText: STATION_LOSS_NOTICE }).waitFor();
      ev.checks.chooserWithReselectInstruction = true;

      // The queued release was replayed once with its original request ID; the server refused it and wrote nothing.
      const replays = member.callableRequests.slice(requestsBeforeHeal).filter(r => r.name === 'releaseSeat');
      const replayResponses = member.callableResponses.slice(responsesBeforeHeal).filter(r => r.name === 'releaseSeat');
      ev.replay = { requests: replays.length, requestIdsAfterOriginal: releaseRequestIds.slice(1),
        responses: replayResponses.map(r => ({ httpStatus: r.httpStatus, error: r.error })) };
      const replayed = check(replays.length === 1 && replayResponses.length === 1 &&
        releaseRequestIds.slice(1).every(id => id === sentRelease.requestId),
        `The queued command is replayed exactly once with its original request ID (requests ${replays.length}).`);
      if (replayed) check(replayResponses[0].error?.status === 'PERMISSION_DENIED', 'The server re-authorized and refused the stale release.');
      assert.deepEqual(await pendingCommands(page), [], 'The command left the outbox.');
      const seatNow = await seatDoc();
      assert.deepEqual({ status: seatNow.status, holderUid: seatNow.holderUid }, { status: 'claimed', holderUid: rival.localId },
        'The rival keeps the station.');
      assert.equal(await f.setupRevision(), revisionAfterLoss, 'No setup revision was written by the refused replay.');
      assert.equal((await f.db.doc(`sessions/${f.sessionId}/seatMutationRequests/${sentRelease.requestId}`).get()).exists, false,
        'No seat-mutation receipt exists for the refused request.');
      ev.checks.refusedOrUnsentCommandWroteNothing = true;
      ev.checks.queuedCommandReplayedOnceWithOriginalIdAndRefused = replayed;
      if (replayed) ev.queuedToReplayMs = replays[0].at - Date.parse(ev.steps.find(step => step.step === 'queued-release').at);

      // The reselect instruction is still showing and the refused queued action is reported in it.
      const notice = page.getByRole('alert').filter({ hasText: STATION_LOSS_NOTICE });
      assert.equal(await notice.count(), 1, 'The reselect instruction is not replaced by the refusal.');
      ev.alertText = await page.getByRole('alert').allInnerTexts();
      ev.checks.reselectNoticeKeptAndRefusalShown = check(
        ev.alertText.some(text => text.includes(STATION_LOSS_NOTICE) && text.includes(QUEUED_NOT_COMPLETED)),
        `The player is told in the reselect notice that the queued action was not completed (${JSON.stringify(ev.alertText)}).`);
      await page.screenshot({ path: join(evidenceDirectory, `${seatId}-chooser-after-reconnect.png`), fullPage: true });
      if (noticeScreens && !replayOnly) await captureNoticeScreens(page, seatId, ev, linkName);
      if (replayOnly) { assert.deepEqual(deferred, []); return; }

      // The draft is not on screen and was not sent, but is still kept.
      assert.equal(await scoutRegion.count(), 0);
      assert.equal((await draft())?.targetCoordinate, '4888');
      // T2.1: reopening the abandoned station route while the notice is pending sends nothing and returns to the chooser.
      const sentBeforeAbandoned = member.callableRequests.length;
      await page.goto(`${app.url}/#/${consoleRoute}`);
      await page.waitForURL(url => new URL(url).hash === '#/console');
      await page.getByRole('alert').filter({ hasText: STATION_LOSS_NOTICE }).waitFor();
      assert.equal((await f.db.doc(memberPath).get()).get('activeConsoleRoleId') ?? null, null, 'The abandoned route did not reopen the old station.');
      assert.equal(member.callableRequests.slice(sentBeforeAbandoned).filter(r => ['claimSeat', 'releaseSeat'].includes(r.name)).length, 0);
      ev.checks.abandonedRouteSendsNothing = true;

      // The station frees up again; only a deliberate reselect refills the draft, and nothing is submitted.
      f.ok(await f.call(rival, 'releaseSeat', { sessionId: f.sessionId, seatId, requestId: randomUUID(),
        expectedSetupRevision: await f.setupRevision() }), 'rival release');
      if (ev.assignedRoleIdBefore === null) {
        // An uncast member has no console claim path of its own: the facilitator casts it to the station first.
        f.ok(await f.call(f.gm, 'assignRole', { sessionId: f.sessionId, instanceId: f.instanceId, requestId: randomUUID(),
          targetUid: before.uid, roleId: seatId }), 'facilitator casts the returning member');
        record('facilitator-cast', { roleId: seatId });
      }
      await member.until('the chooser sees the open station', s => live(s) &&
        s.seats.some(seat => seat.id === seatId && seat.status === 'open'));
      await page.getByRole('button', { name: 'Dismiss error' }).click();
      const scoutRequestsBefore = member.callableRequests.filter(r => r.name === 'requestScout').length;
      ev.reselectAt = Date.now();
      await page.getByRole('link', { name: linkName }).click();
      await member.until('the member deliberately reselected the station', s => live(s) &&
        s.seatId === seatId && s.activeConsoleRoleId === seatId, 30_000);
      await page.getByRole('link', { name: new RegExp(`open ${shuttleLabel} shuttle console`, 'i') }).click();
      await coordinate.waitFor();
      assert.equal(await coordinate.inputValue(), '4888', 'The draft refills after the deliberate reselect.');
      assert.equal(member.callableRequests.filter(r => r.name === 'requestScout').length, scoutRequestsBefore,
        'Restoring the draft submits nothing.');
      ev.checks.draftRefillsOnlyAfterDeliberateReselect = true;
      await page.screenshot({ path: join(evidenceDirectory, `${seatId}-draft-after-reselect.png`), fullPage: true });
      assert.deepEqual(deferred, []);
    } finally {
      ev.timelineAfterHeal ??= ev.healedAt ? timeline(ev.healedAt) : [];
      ev.resumeReplies = ev.resumeReplies.filter(r => r.at >= (ev.healedAt ?? 0));
      if (ev.reselectAt) ev.timelineAfterReselect = timeline(ev.reselectAt);
      ev.deferredFailures = deferred;
    }
  }

  /** The rendered reselect notice at phone, desktop and short landscape sizes. */
  async function captureNoticeScreens(page, seatId, ev, linkName) {
    await mkdir(noticeScreens, { recursive: true });
    const original = page.viewportSize();
    ev.noticeScreens = [];
    for (const [name, size] of [['phone-375x812', { width: 375, height: 812 }], ['desktop-1440x900', { width: 1440, height: 900 }],
      ['landscape-812x375', { width: 812, height: 375 }]]) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.scrollTo(0, 0));
      const alert = page.getByRole('alert').filter({ hasText: STATION_LOSS_NOTICE });
      await alert.scrollIntoViewIfNeeded();
      const path = join(noticeScreens, `station-reselect-notice-${seatId}-${name}.png`);
      await page.screenshot({ path });
      const geometry = await alert.evaluate(node => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom),
          viewportWidth: innerWidth, viewportHeight: innerHeight, documentScrollWidth: document.documentElement.scrollWidth,
          fontSize: style.fontSize, fontFamily: style.fontFamily,
          clippedChildren: [...node.querySelectorAll('*')].filter(child => child.scrollWidth > child.clientWidth + 1).length };
      });
      const dismiss = page.getByRole('button', { name: 'Dismiss error' });
      const reselect = page.getByRole('link', { name: linkName });
      const reselectReachable = await reselect.scrollIntoViewIfNeeded().then(() => reselect.isVisible(), () => false);
      await page.screenshot({ path: path.replace('.png', '-reselect-control.png') });
      ev.noticeScreens.push({ name, path, geometry, dismissVisible: await dismiss.isVisible(), reselectReachable });
    }
    await page.setViewportSize(original);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  describe('PC10.3 station loss with a safe draft and a queued command (real browsers, real callables)', () => {
    before(async () => {
      await mkdir(evidenceDirectory, { recursive: true });
      app = await startEmulatorApp();
      browser = await chromium.launch({ headless: true, ...(process.env.PC10_3_BROWSER_CHANNEL === 'chromium' ? {} : { channel: 'chrome' }) });
      for (const label of ['shepherd-scientist', 'wing-commander', 'quellon-explorer']) {
        members[label] = await openReconnectMember(browser, { uiUrl: app.url, label });
        trackAppModules(members[label]);
      }
      f = await createCastingSession('PC10.3 station loss proof', 8, { rivals: 3, uncastBrowserRoles: ['shepherd-scientist', 'wing-commander'],
        joinBrowserPlayers: Object.fromEntries(Object.entries(members).map(([label, member]) => [label, member.join])) });
      evidence.roster = f.roles;
    });

    after(async () => {
      try {
        for (const member of Object.values(members)) {
          await member.page.screenshot({ path: join(evidenceDirectory, `final-${member.label}.png`), fullPage: true }).catch(() => {});
        }
        evidence.browserErrors = Object.fromEntries(Object.values(members).map(m => [m.label, m.errors]));
        evidence.heartbeatFailures = f?.heartbeatFailures;
        evidence.completedAt = new Date().toISOString();
        await writeFile(join(evidenceDirectory, 'pc10-3-station-loss.json'), `${JSON.stringify(evidence, null, 2)}\n`);
      } finally {
        await browser?.close();
        if (f) { await f.cleanup(); await f.db.terminate(); }
        await app?.stop();
      }
    });

    it('L1.4 #242 + T2.1 #252: a member who claimed its station uncast returns to the chooser, keeps its draft, and its queued command is refused without a write', async () => {
      await proveStationLoss({ member: members['shepherd-scientist'], seatId: 'shepherd-scientist', rival: f.rivals[0],
        shuttleId: 'endeavour', shuttleLabel: 'Endeavour', linkName: /shepherd \/\/ scientist/i });
    });

    it('T2.1 #252: the queued command is still replayed and refused when the presence heartbeat answers before the resume', async () => {
      await proveStationLoss({ member: members['wing-commander'], seatId: 'wing-commander', rival: f.rivals[1],
        consoleRoute: 'ships/aegis/roles/wing-commander', firstReply: 'refreshPresence', replayOnly: true });
    });

    it('L1.4 #242 + T2.1 #252: a cast member whose station was released and taken returns to the chooser the same way', async () => {
      await proveStationLoss({ member: members['quellon-explorer'], seatId: 'quellon-explorer', rival: f.rivals[2],
        shuttleId: 'hummingbird', shuttleLabel: 'Hummingbird', linkName: /quellon \/\/ explorer/i });
    });
  });
}
