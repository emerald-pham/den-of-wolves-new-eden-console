#!/usr/bin/env node
// PC10.3 L3.2 #248, T2.3 #254 and L3.3 #249 (P618/P620): every member of one
// ordinary session disconnects, the server's natural presence expiry holds the
// cycle clock, real browsers return to the authoritative remaining time and
// their resolved choice, and the sparse returning roster continues play.
//
// Evidence class: normal authenticated local emulator gameplay on this
// worktree's own row. Two real browser members (installed Chrome) join through
// the ordinary UI; the GM and six other crew are authenticated HTTP actors on
// the production callables. Disclosed fixture steps, and nothing else:
//   1. one privileged write moves the disposable Team Phase deadline to 100 s
//      ahead, so the hold, a passed cached deadline and the Coordination
//      handoff all fit in one run (as in the PC07 split proof);
//   2. the HTTP actors' fixture keep-alive is stopped (they simply go silent);
//   3. the Functions emulator never fires Cloud Scheduler, so the compiled
//      `expireStalePlayers` handler is invoked by
//      scripts/pc10-3-expire-stale-players.mjs twice: once after the miner's
//      real 45 s lease only (the rest are still live, so the clock must keep
//      running) and once after everyone else's;
//   4. the miner's grievance request reaches the server and commits, but its
//      reply is dropped by the test network as the miner loses the backend, so
//      the app holds it as a queued command across the whole outage.
// Browsers go silent by losing the backend (no disconnect call is sent). No
// presence, seat, clock or event document is written by the fixture.
// This is not deployed or production gameplay, and Chrome here is a headless
// automation profile, not the owner's browser.
//
// Run: `npm run emulators:configure -- auto` (never row 6 on this machine),
// then `node scripts/test-pc10-3-all-player-disconnect.emulator.mjs`.
// Evidence JSON and screenshots go to PC10_3_DISCONNECT_EVIDENCE_DIR (default:
// OS temp dir). The run takes about four minutes because the lease is real.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, it } from 'node:test';
import { enterReconnectRow, openReconnectMember, repository, startEmulatorApp } from './pc10-3-reconnect-harness.mjs';

const script = 'node scripts/test-pc10-3-all-player-disconnect.emulator.mjs';
if (await enterReconnectRow({ script, kind: 'pc10-3-all-player-disconnect' })) {
  const { chromium } = await import('playwright');
  const { createPc07AuthenticatedSession } = await import('./pc07-authenticated-session.mjs');
  const { openCivilUnrestCrisis, documentState, assertNoWrite } = await import('./pc10-3-stale-action-proof.mjs');
  const PRESENCE_LEASE_MS = 45_000;
  const TEAM_WINDOW_AFTER_FIXTURE_MS = 100_000;
  // The miner goes silent this long before everyone else, so its lease ends in an earlier handler run.
  const STAGGER_MS = 15_000;
  const evidenceDirectory = process.env.PC10_3_DISCONNECT_EVIDENCE_DIR ?? join(tmpdir(), 'dow-pc10-3-all-player-disconnect');
  const evidence = { kind: 'normal-authenticated-local-emulator-browser-all-player-disconnect',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
    worktreeClean: execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }).trim() === '',
    nodeVersion: process.version, preparedScene: false, productionGameplay: false,
    fixtureChanges: ['Team Phase deadline moved to 100 s ahead (one privileged write)',
      'HTTP fixture keep-alive stopped', 'compiled expireStalePlayers handler invoked twice after the real leases (miner first, then the rest)',
      'grievance reply dropped by the test network as the miner goes silent'],
    checks: {}, steps: [] };
  let app, browser, f, explorer, miner;
  const record = (step, details = {}) => { evidence.steps.push({ step, at: new Date().toISOString(), ...details }); };
  const live = s => s.connection === 'live' && s.freshness === 'server';
  const sessionData = async () => (await f.session.get()).data();
  const events = async type => (await f.db.collection(`sessions/${f.sessionId}/events`).where('type', '==', type).get())
    .docs.map(doc => doc.data());
  // Presence holds only; the opening cycle-briefing hold also records timer-pause events.
  const pauseEvents = async () => (await events('timer-pause'))
    .filter(event => (event.reason ?? event.payload?.reason) === 'empty-session')
    .map(event => event.action ?? event.payload?.action);
  const seat = async roleId => (await f.db.doc(`sessions/${f.sessionId}/seats/${roleId}`).get()).data();
  const player = async uid => (await f.db.doc(`sessions/${f.sessionId}/players/${uid}`).get()).data();
  /** The clock this browser would render from its persisted snapshot. */
  const cachedClock = member => member.page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem('dow-new-eden-session') ?? '{}').state ?? {};
    return state.session?.turnPhase ?? null;
  });
  /** The DRADIS airspace timer the member actually sees, if any. */
  const visibleTimer = async member => {
    const timer = member.page.getByRole('status', { name: /^Airspace (closed|open) \/\/ / });
    if (await timer.count() === 0) return null;
    const label = await timer.first().getAttribute('aria-label');
    const match = /^Airspace (closed|open) \/\/ (\d\d):(\d\d) remaining/.exec(label ?? '');
    return { label, window: match?.[1] ?? null, seconds: match ? Number(match[2]) * 60 + Number(match[3]) : null };
  };
  const until = async (description, ready, timeout = 60_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await ready();
      if (value) return value;
      await delay(500);
    }
    throw new Error(`Timed out: ${description}`);
  };

  describe('PC10.3 all-player disconnect, stale clock and sparse continuation on one ordinary session', () => {
    before(async () => {
      await mkdir(evidenceDirectory, { recursive: true });
      app = await startEmulatorApp();
      browser = await chromium.launch({ headless: true, ...(process.env.PC10_3_BROWSER_CHANNEL === 'chromium' ? {} : { channel: 'chrome' }) });
      explorer = await openReconnectMember(browser, { uiUrl: app.url, label: 'quellon-explorer' });
      miner = await openReconnectMember(browser, { uiUrl: app.url, label: 'icebreaker-miner' });
      f = await createPc07AuthenticatedSession('PC10.3 all-player disconnect', 8, { keepAlive: true, serializeFixtureCalls: true,
        joinBrowserPlayers: { 'quellon-explorer': explorer.join, 'icebreaker-miner': miner.join } });
      record('session', { roster: f.roles, browsers: ['quellon-explorer', 'icebreaker-miner'], gm: 'HTTP', httpCrew: 6 });
      await explorer.page.goto(`${app.url}/#/ships/quellon/roles/quellon-explorer`);
      await miner.page.goto(`${app.url}/#/ships/icebreaker/roles/icebreaker-miner`);
      for (const member of [explorer, miner]) {
        await member.until('live member at its station', s => live(s) && s.sessionId === f.sessionId && s.seatId !== null);
      }
    });

    after(async () => {
      try {
        for (const member of [explorer, miner]) {
          await member?.page.screenshot({ path: join(evidenceDirectory, `final-${member.label}.png`), fullPage: true }).catch(() => {});
        }
        evidence.browserErrors = { explorer: explorer?.errors, miner: miner?.errors };
        evidence.callableErrors = { explorer: explorer?.callableResponses.filter(r => r.error || r.httpStatus !== 200),
          miner: miner?.callableResponses.filter(r => r.error || r.httpStatus !== 200) };
        evidence.resumeRateLimited = [explorer, miner].flatMap(member => (member?.callableResponses ?? [])
          .filter(r => r.name === 'resumeSession' && (r.httpStatus === 429 || r.error?.status === 'RESOURCE_EXHAUSTED'))
          .map(r => ({ member: member.label, at: r.at })));
        // Reconnect traffic per browser: resume attempts and the heartbeats that keep presence alive while one is outstanding.
        evidence.reconnectTraffic = Object.fromEntries([explorer, miner].filter(Boolean).map(member => [member.label,
          ['resumeSession', 'refreshPresence'].map(name => ({ name,
            sent: member.callableRequests.filter(r => r.name === name && !r.partitioned).map(r => r.at),
            statuses: member.callableResponses.filter(r => r.name === name).map(r => r.httpStatus) }))]));
        evidence.heartbeatFailures = f?.heartbeatFailures;
        evidence.completedAt = new Date().toISOString();
        await writeFile(join(evidenceDirectory, 'pc10-3-all-player-disconnect.json'), `${JSON.stringify(evidence, null, 2)}\n`);
      } finally {
        await browser?.close();
        if (f) { await f.cleanup(); await f.db.terminate(); }
        await app?.stop();
      }
    });

    it('L3.2 #248 + T2.3 #254: natural expiry holds the clock; returning browsers get the server remaining time and their resolved choice', async () => {
      const crisis = await openCivilUnrestCrisis(f);
      // Disclosed fixture step 1: Team Phase ends 100 s from now.
      const clock = (await sessionData()).turnPhase;
      const teamPhaseEndsAt = new Date(Date.now() + TEAM_WINDOW_AFTER_FIXTURE_MS).toISOString();
      const current = await sessionData();
      await f.session.update({ turnPhase: { ...clock, teamPhaseEndsAt },
        ...(current.turnState ? { turnState: { ...current.turnState, endsAt: teamPhaseEndsAt } } : {}) });
      for (const member of [explorer, miner]) {
        await until(`${member.label} caches the accelerated deadline`, async () =>
          (await cachedClock(member))?.teamPhaseEndsAt === teamPhaseEndsAt);
      }
      const wolfPaths = [`sessions/${f.sessionId}/secrets/wolf-assignment`, `sessions/${f.sessionId}/loyaltyCensus/current`];
      evidence.loyaltyBeforeDisconnect = await documentState(f.db, wolfPaths);
      assert.deepEqual(await pauseEvents(), [], 'No presence hold exists before the disconnect.');

      // A resolved choice that the miner's app still holds as queued: the grievance commits on the
      // server, then the reply is lost as the miner loses the backend (the miner is the first to go silent).
      const grievance = miner.page.getByRole('region', { name: 'Civil Unrest team grievances' });
      await grievance.getByLabel("Your team's grievance", { exact: true }).fill('Icebreaker night crews need relief.');
      let submitted, receipt;
      const grievanceRequestIds = [];
      miner.page.on('request', request => {
        if (new URL(request.url()).pathname.endsWith('/submitCivilUnrestGrievance')) grievanceRequestIds.push(request.postDataJSON()?.data?.requestId ?? null);
      });
      await miner.page.route(url => url.pathname.endsWith('/submitCivilUnrestGrievance'), async route => {
        submitted = route.request().postDataJSON().data;
        receipt = await (await route.fetch()).json();
        await miner.partition();
        await route.abort('connectionreset');
      }, { times: 1 });
      await grievance.getByRole('button', { name: 'Submit grievance', exact: true }).click();
      await grievance.getByText('Saved to send when the connection returns.', { exact: true }).waitFor();
      const minerSilentAt = Date.now();
      const queued = JSON.parse(await miner.page.evaluate(() => window.localStorage.getItem('dow-new-eden-session'))).state.pendingCommands;
      assert.deepEqual(queued.map(command => ({ kind: command.kind, requestId: command.payload.requestId })),
        [{ kind: 'submitCivilUnrestGrievance', requestId: submitted.requestId }], 'The app holds the committed grievance as queued.');
      assert.equal(receipt?.result?.revision, 1, 'The server committed the grievance before the reply was lost.');
      const grievancePath = `sessions/${f.sessionId}/civilUnrestGrievances/icebreaker`;
      const committedGrievance = (await f.db.doc(grievancePath).get()).data();
      assert.equal(committedGrievance.revision, 1);
      record('grievance-committed-reply-lost', { crisisId: crisis.crisisId, revision: committedGrievance.revision, queued: true });

      // Everyone else stays live a while longer, then goes silent: HTTP actors stop, the explorer loses the backend.
      await delay(STAGGER_MS);
      const disconnectedAt = Date.now();
      await f.stopHeartbeats();
      await explorer.partition();
      const requestsAtDisconnect = { explorer: explorer.callableRequests.length, miner: miner.callableRequests.length };
      record('all-members-silent', { teamPhaseEndsAt, minerSilentForMs: disconnectedAt - minerSilentAt });

      // Wait out the real leases; no member was explicitly disconnected.
      const connected = async () => (await f.db.collection(`sessions/${f.sessionId}/players`).where('connected', '==', true).get()).docs;
      const expire = () => {
        const output = execFileSync('node', ['scripts/pc10-3-expire-stale-players.mjs', f.sessionId],
          { cwd: repository, encoding: 'utf8', env: process.env });
        return JSON.parse(output.trim().split('\n').at(-1));
      };
      const beforeExpiry = await connected();
      assert.equal(beforeExpiry.length, 9, 'GM and all eight crew are still connected before the first lease ends.');
      const minerUid = (await miner.observe()).uid;
      const minerLastSeen = beforeExpiry.find(doc => doc.id === minerUid).get('lastSeenAt').toMillis();
      const othersLastSeen = Math.max(...beforeExpiry.filter(doc => doc.id !== minerUid).map(doc => doc.get('lastSeenAt').toMillis()));
      assert.ok(othersLastSeen - minerLastSeen > 10_000, 'The rest of the roster was seen well after the miner went silent.');

      // First handler run: only the miner's lease has ended. The clock keeps running for the live members.
      await delay(Math.max(0, minerLastSeen + PRESENCE_LEASE_MS + 2_000 - Date.now()));
      assert.ok(Date.now() < othersLastSeen + PRESENCE_LEASE_MS - 3_000, 'The first run happens while the others are still within their lease.');
      const firstRun = expire();
      const afterFirst = await connected();
      assert.deepEqual(afterFirst.map(doc => doc.id).includes(minerUid), false, 'The first run expired the silent miner.');
      assert.equal(afterFirst.length, 8, 'Everyone else is still connected after the first run.');
      assert.equal((await seat('icebreaker-miner')).holderUid, null, 'The miner\'s seat is released by its own expiry.');
      assert.equal((await sessionData()).turnPhase.timerPause, undefined, 'The clock runs until the last member expires.');
      assert.deepEqual(await pauseEvents(), [], 'No hold while members remain.');
      evidence.staggeredExpiry = { firstRun: { ...firstRun, expired: ['icebreaker-miner'], stillConnected: afterFirst.length, clockHeld: false } };
      evidence.checks.clockRunsUntilLastMemberExpires = true;

      // Second handler run: everyone else's lease has ended.
      const lastSeen = othersLastSeen;
      await delay(Math.max(0, lastSeen + PRESENCE_LEASE_MS + 2_000 - Date.now()));
      assert.equal((await connected()).length, 8, 'Silence alone has not changed presence.');
      assert.equal((await sessionData()).turnPhase.timerPause, undefined, 'The clock runs until the server expires the last member.');
      const run = expire();
      evidence.staggeredExpiry.secondRun = { ...run, msAfterFirst: run.startedAt - firstRun.startedAt };
      evidence.naturalExpiry = { leaseMs: PRESENCE_LEASE_MS, silentForMs: run.startedAt - disconnectedAt,
        sinceLastSeenMs: run.startedAt - lastSeen, ...run };

      // The server released every member and seat and held the remaining Team window.
      assert.equal((await connected()).length, 0, 'Every member expired naturally.');
      for (const roleId of f.roles) {
        assert.deepEqual({ status: (await seat(roleId)).status, holderUid: (await seat(roleId)).holderUid },
          { status: 'open', holderUid: null }, `${roleId} seat is released only by expiry.`);
      }
      const held = (await sessionData()).turnPhase;
      assert.equal(held.timerPause?.reason, 'empty-session');
      assert.equal(held.timerPause.window, 'restricted');
      assert.equal(held.airspace.state, 'restricted');
      const remainingMs = held.timerPause.remainingMs;
      assert.ok(remainingMs > 0 && remainingMs < TEAM_WINDOW_AFTER_FIXTURE_MS - PRESENCE_LEASE_MS,
        'The hold kept only the time left when the last member expired.');
      assert.deepEqual(await pauseEvents(), ['paused']);
      evidence.hold = { remainingMs, pausedAt: held.timerPause.pausedAt };
      evidence.checks.naturalExpiryHoldsRemainingTime = true;

      // Hold past the cached deadline: the server clock does not move.
      await delay(Math.max(0, Date.parse(teamPhaseEndsAt) + 5_000 - Date.now()));
      const stillHeld = (await sessionData()).turnPhase;
      assert.deepEqual(stillHeld.timerPause, held.timerPause, 'The held remaining time is unchanged while everyone is away.');
      assert.equal((await events('airspace-opened')).length, 0);
      evidence.checks.holdOutlastsCachedDeadline = true;

      // T2.3: the miner reloads while still offline; its cache shows the passed deadline.
      await miner.reload();
      await miner.until('persisted snapshot without server authority', s =>
        s.sessionId === f.sessionId && s.persistedSessionSnapshot && s.freshness !== 'server');
      const cached = await cachedClock(miner);
      assert.equal(cached.teamPhaseEndsAt, teamPhaseEndsAt);
      assert.ok(Date.parse(cached.teamPhaseEndsAt) < Date.now(), 'The cached deadline has already passed.');
      evidence.cachedRender = { teamPhaseEndsAt: cached.teamPhaseEndsAt, timerPause: cached.timerPause ?? null,
        visibleTimer: await visibleTimer(miner) };
      await miner.page.screenshot({ path: join(evidenceDirectory, 't2-3-cached-clock.png'), fullPage: true });

      // The first member returns: resume releases the hold and the browser shows the server time.
      const healedAt = Date.now();
      await miner.heal();
      const fresh = await miner.until('server clock replaces the cache', s => live(s) && s.seatId === 'icebreaker-miner');
      const resumed = await until('the hold is released', async () => {
        const phase = (await sessionData()).turnPhase;
        return phase.timerPause ? null : phase;
      });
      assert.deepEqual((await pauseEvents()).sort(), ['paused', 'resumed'], 'One pause and one resume.');
      const observedResumeAt = Date.now();
      // The resume event is written in the same server transaction that shifted the deadlines.
      const resumeEvent = (await events('timer-pause')).find(event =>
        (event.reason ?? event.payload?.reason) === 'empty-session' && (event.action ?? event.payload?.action) === 'resumed');
      const resumedAtMs = resumeEvent.createdAt.toMillis();
      const shiftMs = Date.parse(resumed.teamPhaseEndsAt) - Date.parse(teamPhaseEndsAt);
      const heldForMs = resumedAtMs - Date.parse(held.timerPause.pausedAt);
      assert.ok(Math.abs(shiftMs - heldForMs) < 1_000, `Deadlines shift by the held time (${shiftMs} vs ${heldForMs} ms).`);
      assert.ok(Math.abs(Date.parse(resumed.teamPhaseEndsAt) - resumedAtMs - remainingMs) < 1_000,
        'The resumed window is the held remainder, not a restart.');
      assert.ok(resumedAtMs >= healedAt - 1_000 && resumedAtMs <= observedResumeAt + 1_000,
        'The hold was released by this member\'s reconnect.');
      await until('miner caches the resumed deadline', async () =>
        (await cachedClock(miner))?.teamPhaseEndsAt === resumed.teamPhaseEndsAt);
      const shown = await until('miner DRADIS shows the closed-airspace timer', async () => {
        const timer = await visibleTimer(miner);
        return timer?.window === 'closed' ? timer : null;
      });
      const serverSeconds = Math.ceil((Date.parse(resumed.teamPhaseEndsAt) - Date.now()) / 1000);
      assert.ok(Math.abs(shown.seconds - serverSeconds) <= 2, `Shown ${shown.seconds}s vs server ${serverSeconds}s.`);
      assert.ok(shown.seconds <= Math.ceil(remainingMs / 1000) + 1);
      evidence.resume = { healedAt, resumedAtMs, heldForMs, resumedTeamPhaseEndsAt: resumed.teamPhaseEndsAt, shiftMs, shown,
        resumeReplies: miner.callableResponses.filter(r => r.name === 'resumeSession' && r.at >= healedAt).map(r => r.httpStatus),
        generationAfter: fresh.connectionGeneration };
      assert.equal(resumed.airspace.state, 'restricted');
      const earlyOpen = miner.callableResponses.filter(r => r.name === 'beginOpenAirspacePhase' && r.at >= healedAt);
      evidence.resume.beginOpenAirspaceBeforeDeadline = earlyOpen.map(r => ({ httpStatus: r.httpStatus, error: r.error }));
      assert.equal(earlyOpen.filter(r => r.httpStatus === 200).length, 0, 'The passed cached deadline opened nothing.');
      const minerSeat = await seat('icebreaker-miner');
      assert.deepEqual({ status: minerSeat.status, holderUid: minerSeat.holderUid }, { status: 'claimed', holderUid: fresh.uid },
        'Reconnect reclaimed the open seat it still pointed at.');
      evidence.checks.browserShowsServerRemainingTimeAfterHold = true;
      evidence.checks.cachedPassedDeadlineOpenedNothing = true;

      // The resolved choice stays resolved: shown as current, never re-sent, exact replay writes nothing.
      const panel = miner.page.getByRole('region', { name: 'Civil Unrest team grievances' });
      const shownAfterReconnect = await panel.getByRole('article', { name: 'Your current team grievance' })
        .getByText('Icebreaker night crews need relief.', { exact: true }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
      evidence.grievanceShownAfterReconnect = shownAfterReconnect;
      if (!shownAfterReconnect) {
        await miner.page.screenshot({ path: join(evidenceDirectory, 'l3-2-grievance-missing.png'), fullPage: true });
        evidence.crisisReportShownAfterReconnect = await miner.page.getByRole('region', { name: 'Fleet crisis report' }).count() > 0;
      }
      const reviseControls = await panel.getByRole('button', { name: 'Revise grievance', exact: true }).count();
      // The grievance was still queued when the miner returned: the app may replay it once with its
      // original request ID (a receipt replay) or drop it as expired, but never send it twice or as new.
      const outbox = JSON.parse(await miner.page.evaluate(() => window.localStorage.getItem('dow-new-eden-session'))).state.pendingCommands;
      evidence.queuedGrievanceAfterReconnect = { resent: grievanceRequestIds.slice(1), outboxLeft: outbox.map(command => command.kind),
        notice: await miner.page.getByRole('alert').allInnerTexts().catch(() => []) };
      assert.deepEqual(outbox, [], 'The queued grievance left the outbox.');
      assert.ok(grievanceRequestIds.length <= 2 && grievanceRequestIds.every(id => id === submitted.requestId),
        `The queued grievance is sent at most once more, with its original request ID (${JSON.stringify(grievanceRequestIds)}).`);
      assert.equal((await f.db.doc(grievancePath).get()).get('revision'), 1, 'The queued grievance never wrote a second revision.');
      evidence.checks.queuedChoiceNeverResentTwiceOrAsNew = true;
      const beforeReplay = await documentState(f.db, [grievancePath]);
      const replay = await miner.callable('submitCivilUnrestGrievance', submitted);
      assert.equal(replay.ok, true, replay.message);
      assert.equal(replay.result.revision, 1);
      await assertNoWrite(f.db, beforeReplay, 'An exact grievance replay after the hold');
      evidence.checks.resolvedChoiceNotResentAndReplayWritesNothing = true;
      await miner.page.screenshot({ path: join(evidenceDirectory, 'l3-2-miner-resumed.png'), fullPage: true });

      // The second member returns to the already-running clock: no second resume, same deadline.
      await explorer.reload();
      await explorer.until('explorer cache rendered', s => s.persistedSessionSnapshot && s.freshness !== 'server');
      await explorer.heal();
      await explorer.until('explorer live at its station', s => live(s) && s.seatId === 'quellon-explorer');
      await until('explorer caches the resumed deadline', async () =>
        (await cachedClock(explorer))?.teamPhaseEndsAt === resumed.teamPhaseEndsAt);
      assert.deepEqual((await pauseEvents()).sort(), ['paused', 'resumed'], 'A later reconnect does not resume twice.');
      assert.equal((await sessionData()).turnPhase.teamPhaseEndsAt, resumed.teamPhaseEndsAt);
      const explorerShown = await until('explorer timer', async () => {
        const timer = await visibleTimer(explorer);
        return timer?.window === 'closed' ? timer : null;
      });
      evidence.secondReturn = { shown: explorerShown };
      evidence.checks.laterReconnectKeepsTheSameClock = true;

      // Absent members stay absent; nobody's seat was overwritten.
      for (const actor of [f.gm, ...f.players.filter((_, index) => !['quellon-explorer', 'icebreaker-miner'].includes(f.roles[index]))]) {
        assert.equal((await player(actor.localId)).connected, false);
      }
      for (const roleId of f.roles.filter(roleId => !['quellon-explorer', 'icebreaker-miner'].includes(roleId))) {
        assert.equal((await seat(roleId)).holderUid, null, `${roleId} stays open for its own member.`);
      }
      evidence.checks.absentSeatsStayOpen = true;

      // Diagnose before failing: does a fresh mount on the live connection show the resolved choice?
      if (!shownAfterReconnect) {
        await miner.reload();
        await miner.until('miner live after a plain reload', live);
        evidence.grievanceShownAfterLiveReload = await panel.getByRole('article', { name: 'Your current team grievance' })
          .getByText('Icebreaker night crews need relief.', { exact: true }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
      }
      assert.equal(shownAfterReconnect, true, 'The resolved grievance is shown as current after the all-player reconnect.');
      assert.equal(reviseControls, 1, 'The resolved grievance is offered for revision, not as a new submission.');
      evidence.checks.resolvedChoiceShownAfterReconnect = true;
    });

    it('L3.3 #249: the sparse returning roster continues into Coordination and an ordinary role action', async () => {
      // No facilitator and six crew remain away. The returning members' own apps
      // perform the ordinary deadline handoff when the resumed window ends.
      const handoffStart = Date.now();
      const lifted = await until('Coordination opens without the absent roster', async () => {
        const phase = (await sessionData()).turnPhase;
        return phase.airspace.state === 'lifted' ? phase : null;
      }, 150_000);
      const opened = [explorer, miner].flatMap(member => member.callableResponses
        .filter(r => r.name === 'beginOpenAirspacePhase' && r.at >= handoffStart && r.httpStatus === 200)
        .map(() => member.label));
      assert.ok(opened.length >= 1, 'A returning member opened Coordination through the ordinary callable.');
      assert.equal((await events('airspace-opened')).length, 1, 'Coordination opened once.');
      evidence.coordination = { openedBy: opened, openAirspaceEndsAt: lifted.openAirspaceEndsAt };

      // An ordinary role action by a returning member commits: the Explorer loads the Hummingbird.
      const page = explorer.page;
      await page.goto(`${app.url}/#/shuttles/hummingbird`);
      const cargo = page.getByRole('region', { name: 'Shuttle cargo transfer' });
      await cargo.waitFor({ timeout: 60_000 });
      const before = await sessionData();
      const shuttleFood = before.shuttleCargo?.hummingbird?.food ?? 0;
      await cargo.getByLabel('Resource', { exact: true }).selectOption('food');
      await cargo.getByLabel('Amount', { exact: true }).fill('1');
      await cargo.getByRole('button', { name: 'Load shuttle', exact: true }).click();
      await cargo.getByText('Loaded 1 Food.', { exact: true }).waitFor();
      const after = await sessionData();
      assert.equal(after.shuttleCargo.hummingbird.food, shuttleFood + 1);
      assert.equal(after.shipResources.quellon.food, before.shipResources.quellon.food - 1);
      evidence.checks.sparseRosterCompletesOrdinaryRoleAction = true;

      // The approved real-roster Wolf policy is unchanged: no Wolf invented or reassigned.
      const wolfPaths = Object.keys(evidence.loyaltyBeforeDisconnect);
      const loyaltyNow = await documentState(f.db, wolfPaths);
      assert.deepEqual(loyaltyNow, evidence.loyaltyBeforeDisconnect, 'Dropout and return left Wolf assignment untouched.');
      evidence.checks.wolfAssignmentUnchanged = true;
      const absent = f.roles.filter(roleId => !['quellon-explorer', 'icebreaker-miner'].includes(roleId));
      evidence.sparseRoster = { returned: ['quellon-explorer', 'icebreaker-miner'], absent, gmPresent: false };
      for (const roleId of absent) assert.equal((await seat(roleId)).holderUid, null);
      await page.screenshot({ path: join(evidenceDirectory, 'l3-3-sparse-cargo.png'), fullPage: true });
    });
  });
}
