import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { proofRuntimeFromViteSource, validateProofRuntime, assertSelectedActor, completePreparedCrew, isObservedGameEnding } from './pc10-full-game-demo-proof-helpers.mjs';

/** Real UI/SDK driver. Callbacks may compose later genuine game decisions. */
export async function runFreshFullGameDemoUi(options = {}) {
  const baseUrl = options.baseUrl ?? process.env.PC10_UI_URL ?? 'http://127.0.0.1:5174';
  const projectId = options.projectId ?? process.env.PC10_DEMO_PROJECT ?? 'demo-pc10-owner';
  const root = resolve(options.sourceRoot ?? process.env.PC10_SOURCE_ROOT ?? process.cwd());
  const directory = options.directory ?? process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence/full-game-demo-ui';
  const ports = options.ports ?? { auth: 9109, functions: 5011, firestore: 8090 };
  const runtime = validateProofRuntime(proofRuntimeFromViteSource(await (await fetch(`${baseUrl}/src/lib/firebaseConfig.ts`)).text()),
    { baseUrl, projectId, ports });
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const driverCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const builtRuntimeIndexSha256 = createHash('sha256').update(await readFile(`${root}/functions/lib/index.js`)).digest('hex');
  await mkdir(directory, { recursive: true });
  const browsers = [], surfaces = [], errors = [], calls = [], remoteRequests = [], transitions = [], roleSurfaces = [];
  const evidence = { schemaVersion: 1, sourceCommit, driverCommit, builtRuntimeIndexSha256, runtime,
    actualBrowserProcesses: 2, actualBrowserContexts: 2, actualHumans: 0, physicalAttendanceProof: false,
    callableFixtures: false, adminGameplayWrites: false, acceleratedClock: false, wholeGameProof: false,
    protocol: 'Fresh ordinary UI admission; normal consent and real Firebase SDK; controlled actual-response interruption disclosed.' };
  let stage = 'launch';
  const mark = async name => {
    stage = name; transitions.push({ stage, at: new Date().toISOString() });
    await writeFile(`${directory}/progress.json`, `${JSON.stringify({ sourceCommit, stage, transitions }, null, 2)}\n`);
    console.log(JSON.stringify({ stage, sourceCommit }));
    await options.onStage?.(name);
  };

  async function surface(label) {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
      if (['127.0.0.1', 'localhost'].includes(url.hostname) &&
        [new URL(baseUrl).port, ...Object.values(ports).map(String)].includes(url.port)) return route.continue();
      remoteRequests.push(`${url.origin}${url.pathname}`);
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(35_000); page.setDefaultNavigationTimeout(35_000);
    let storeUrl = '/src/store/useSessionStore.ts', sdkUrl = '/node_modules/.vite/deps/firebase_functions.js';
    page.on('pageerror', error => errors.push({ surface: label, message: error.message }));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/src/store/useSessionStore.ts') storeUrl = url.href;
      if (url.pathname.endsWith('/firebase_functions.js')) sdkUrl = url.href;
    });
    page.on('response', response => {
      const endpoint = new URL(response.url()).pathname.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
      if (endpoint && response.request().method() === 'POST') calls.push({ surface: label, endpoint,
        transport: 'actual browser Firebase SDK', status: response.status(), at: new Date().toISOString() });
    });
    async function observe() {
      return page.evaluate(async moduleUrl => {
        const { auth } = await import('/src/lib/firebase.ts');
        const { activeDemoActorProfile } = await import('/src/lib/demoActorContext.ts');
        const { useSessionStore } = await import(moduleUrl);
        const state = useSessionStore.getState(), user = auth().currentUser;
        const hash = async value => value ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
          .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
        return { hasAuth: !!user, sameActor: !!user && state.me?.uid === user.uid, uidHash: await hash(user?.uid),
          sessionId: state.session?.id ?? null, joinCode: state.session?.joinCode ?? null,
          cycle: state.session?.currentTurn ?? null, phase: state.session?.phase ?? null,
          playerRole: state.me?.role ?? null, profileRoleId: activeDemoActorProfile?.roleId ?? null,
          assignedRoleId: state.me?.assignedRoleId ?? null, activeConsoleRoleId: state.me?.activeConsoleRoleId ?? null,
          connection: state.connection, freshness: state.sessionSnapshotFreshness,
          gmInstanceOwned: !!state.gmInstance && state.gmInstance.uid === state.me?.uid && state.gmInstance.sessionId === state.session?.id,
          instanceId: state.gmInstance?.id ?? null, setupConfirmed: state.session?.setupConfirmed ?? false,
          setupRevision: state.session?.setupRevision ?? null, activeRoleIds: state.session?.activeRoleIds ?? [],
          fullGameDemo: state.session?.fullGameDemo ?? null, phaseProgression: state.session?.turnPhase?.progression ?? null,
          airspace: state.session?.turnPhase?.airspace.state ?? null, turnStatePhase: state.session?.turnState?.phase ?? null,
          gameOutcomeCause: state.session?.gameOutcome?.cause ?? null,
          debriefType: state.session?.debriefSnapshot?.type ?? null,
          debriefVersion: state.session?.debriefSnapshot?.version ?? null,
          debriefSource: state.session?.debriefSnapshot?.source ?? null,
          debriefResult: state.session?.debriefSnapshot?.result ?? null,
          debriefCause: state.session?.debriefSnapshot?.cause ?? null,
          debriefCycle: state.session?.debriefSnapshot?.cycle ?? null,
          privateLoyaltyPresent: !!state.privateLoyalty, briefRoleId: state.roleBrief?.roleId ?? null,
          briefMatchesActor: !!state.roleBrief && state.roleBrief.assignmentUid === user?.uid,
          pendingCommandCount: state.pendingCommands.length };
      }, storeUrl);
    }
    async function until(description, predicate, timeout = 60_000) {
      const deadline = Date.now() + timeout; let current;
      while (Date.now() < deadline) {
        current = await observe(); if (predicate(current)) return current; await delay(250);
      }
      throw new Error(`${description}: ${JSON.stringify(current)}`);
    }
    async function consent() {
      const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
      const admissionDeadline = Date.now() + 35_000;
      while (!(await waiver.isVisible()) && Date.now() < admissionDeadline) {
        const failed = calls.find(call => call.surface === label &&
          ['createSession', 'joinSession'].includes(call.endpoint) && call.status >= 400);
        if (failed) throw new Error(`Real ${failed.endpoint} returned HTTP ${failed.status} before consent mounted.`);
        await delay(100);
      }
      assert.equal(await waiver.isVisible(), true, 'Normal admission must mount the consent dialog.');
      const checks = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
      assert.equal(await checks.count(), 3);
      for (const checkbox of await checks.all()) await checkbox.check();
      const button = waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
      const deadline = Date.now() + 30_000;
      while (!(await button.isEnabled()) && Date.now() < deadline) await delay(100);
      assert.equal(await button.isEnabled(), true, 'Existing regulations and countdown are required.');
      await button.click(); await waiver.waitFor({ state: 'hidden' });
    }
    async function callable(name, data) {
      return page.evaluate(async ({ name, data, sdkUrl }) => {
        const { functions } = await import('/src/lib/firebase.ts');
        const { httpsCallable } = await import(sdkUrl);
        try { return { status: 'committed', result: (await httpsCallable(functions(), name)(data)).data }; }
        catch (error) { return { status: 'denied', code: error.code }; }
      }, { name, data, sdkUrl });
    }
    async function reducedMotion() {
      const button = page.getByRole('button', { name: /^REDUCED MOTION/i });
      if (await button.isVisible().catch(() => false)) await button.click();
    }
    const result = { label, page, context, observe, until, consent, callable, reducedMotion, storeModuleUrl: () => storeUrl };
    surfaces.push(result); return result;
  }

  try {
    const gm = await surface('browser-A-GM'), crew = await surface('browser-B-demo-crew');
    await mark('fresh create and normal consent');
    await gm.page.goto(baseUrl); await gm.reducedMotion();
    await gm.page.getByRole('button', { name: 'Create a session', exact: true }).click();
    await gm.consent();
    const initial = await gm.until('Fresh real Cycle 0', state => state.hasAuth && state.sameActor && state.sessionId && state.cycle === 0 && state.freshness === 'server');
    await mark('actual Settings local GM grant and named instance');
    await gm.page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = gm.page.getByRole('dialog', { name: 'Session settings', exact: true });
    await settings.getByRole('button', { name: 'Authorize local emulator GM', exact: true }).click();
    await settings.getByRole('button', { name: 'Revoke GM access', exact: true }).waitFor();
    await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
    await gm.page.getByRole('link', { name: /GM join$/i }).click();
    await gm.page.getByLabel('Input GM Name', { exact: true }).fill('PC10 full-game UI GM');
    await gm.page.getByRole('button', { name: 'Join as GM', exact: true }).click();
    const gmIdentity = await gm.until('Named live GM', state => state.gmInstanceOwned && state.playerRole === 'gm' && state.connection === 'live' && state.freshness === 'server');
    if (!(await gm.page.getByRole('region', { name: 'Setup', exact: true }).isVisible())) {
      await gm.page.getByRole('button', { name: /^Open station catalog/ }).click();
      await gm.page.getByRole('link', { name: 'GM Console', exact: true }).click();
    }
    await mark('confirm 20-role roster and prepare before ordinary admission');
    const setup = gm.page.getByRole('region', { name: 'Setup', exact: true });
    await setup.getByRole('button', { name: 'Setup', exact: true }).click();
    await setup.getByLabel('Recommended player count', { exact: true }).selectOption('20');
    await setup.getByRole('button', { name: 'Confirm setup // Confirm roster', exact: true }).click();
    const confirmed = await gm.until('Real locked 20 roles', state => state.setupConfirmed && state.activeRoleIds.length === 20 && state.cycle === 0);
    await setup.getByRole('button', { name: 'Prepare full-game demo', exact: true }).click();
    await setup.getByRole('button', { name: 'ARE YOU SURE? // PREPARE FULL-GAME DEMO', exact: true }).click();
    const prepared = await gm.until('Permanent preparation committed', state => state.fullGameDemo?.status === 'preparing');
    const manager = setup.getByRole('link', { name: 'Open demo actor manager', exact: true });
    const managerUrl = await manager.getAttribute('href');
    const parsed = new URL(managerUrl); assert.deepEqual([...parsed.searchParams.keys()], ['demoActor', 'demoJoin']);
    assert.equal(parsed.searchParams.get('demoActor'), `${initial.sessionId}~controller`);
    await gm.page.screenshot({ path: `${directory}/prepared-before-admission.png` });
    await mark('Browser B genuine controller join and ordinary consent');
    await crew.page.goto(managerUrl); await crew.reducedMotion(); await crew.consent();
    const controller = await crew.until('Real controller admitted', state => state.hasAuth && state.sameActor && state.sessionId === initial.sessionId && state.profileRoleId === 'controller' && state.connection === 'live' && state.freshness === 'server');
    assert.equal(controller.gmInstanceOwned, false);
    assert.notEqual(controller.uidHash, gmIdentity.uidHash);
    const controllerDenial = await crew.callable('prepareFullGameDemo', { sessionId: initial.sessionId,
      instanceId: gmIdentity.instanceId, requestId: randomUUID(), expectedSetupRevision: prepared.setupRevision });
    assert.equal(controllerDenial.status, 'denied', 'An ordinary controller cannot prepare or claim GM authority.');
    evidence.ordinaryControllerPreparationDenial = controllerDenial.code;

    await mark('real ordinary cohort admission with lost first seat acknowledgement');
    const claimPattern = `**/${projectId}/us-central1/claimSeat`;
    let interceptOnce = true, release;
    const hold = new Promise(resolveHold => { release = resolveHold; });
    let trapped;
    const firstClaim = new Promise(resolveClaim => { trapped = resolveClaim; });
    await crew.page.route(claimPattern, async route => {
      if (!interceptOnce) return route.continue(); interceptOnce = false;
      const response = await route.fetch();
      const receipt = (await response.json()).result;
      trapped({ status: receipt?.status, httpStatus: response.status() });
      await hold;
      await route.fulfill({ response }).catch(() => undefined);
    });
    const prepareCrew = crew.page.getByRole('button', { name: 'Prepare demo crew', exact: true });
    await prepareCrew.waitFor(); await prepareCrew.click();
    let receiptTimeout;
    const interruptedReceipt = await Promise.race([firstClaim, new Promise((_, reject) => {
      receiptTimeout = setTimeout(() => reject(new Error('No real first seat receipt.')), 60_000);
    })]).finally(() => clearTimeout(receiptTimeout));
    assert.equal(interruptedReceipt.status, 'committed');
    evidence.interruptedActualSeatReceipt = interruptedReceipt;
    const establishedUidHash = await crew.page.evaluate(async () => {
      const { readDemoActorAccountUid } = await import('/src/lib/demoActorContext.ts');
      const uid = readDemoActorAccountUid('admiral');
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid))))
        .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
    });
    await crew.page.reload(); release(); await crew.page.unroute(claimPattern);
    await crew.until('Interrupted controller restored', state => state.sameActor && state.uidHash === controller.uidHash && state.connection === 'live' && state.freshness === 'server');
    await mark('lost actual seat acknowledgement; same real controller restored');
    await crew.page.getByRole('button', { name: 'Prepare demo crew', exact: true }).click();
    const crewPanel = crew.page.getByRole('region', { name: 'Full-game demo crew', exact: true });
    evidence.preparationRetryCount = await completePreparedCrew({
      inspect: async () => {
        const current = await crew.observe();
        return { actorCount: await crewPanel.getByRole('list', { name: 'Prepared demo actors', exact: true }).getByRole('button').count(),
          live: current.sameActor && current.uidHash === controller.uidHash && current.profileRoleId === 'controller' &&
            current.sessionId === initial.sessionId && current.fullGameDemo?.status === 'preparing' &&
            current.connection === 'live' && current.freshness === 'server',
          retryEnabled: await crewPanel.getByRole('button', { name: 'Prepare demo crew', exact: true }).isEnabled().catch(() => false),
          error: (await crewPanel.getByRole('alert').allTextContents()).join('') };
      },
      retry: () => crewPanel.getByRole('button', { name: 'Prepare demo crew', exact: true }).click(),
      onRetry: async retry => {
        evidence.preparationRetries ??= []; evidence.preparationRetries.push(retry);
        await mark(`ordinary preparation retry ${retry.retry} after ${retry.actorCount} actors`);
      },
    });
    await crewPanel.getByRole('button', { name: /Open.*Press Officer$/ }).waitFor();
    const roster = await crew.page.evaluate(async sid => {
      const { readDemoActorRoster } = await import('/src/lib/demoActorProfiles.ts');
      return Promise.all(readDemoActorRoster(sid).map(async actor => ({ roleId: actor.roleId,
        uidHash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(actor.uid))))
          .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) })));
    }, initial.sessionId);
    assert.equal(roster.length, 21); assert.equal(new Set(roster.map(actor => actor.uidHash)).size, 21);
    assert.ok(roster.every(actor => ![gmIdentity.uidHash, controller.uidHash].includes(actor.uidHash)));
    assert.equal(roster.find(actor => actor.roleId === 'admiral').uidHash, establishedUidHash);
    assert.equal(await crew.page.getByLabel('Current actor', { exact: true }).locator('option').count(), 22);
    evidence.interruptedAdmissionSameRealUid = true;
    evidence.actualAuthenticatedActors = new Set([gmIdentity.uidHash, controller.uidHash, ...roster.map(actor => actor.uidHash)]).size;

    await mark('GM sequential normal role assignment');
    const casting = gm.page.getByRole('region', { name: 'Facilitator casting', exact: true });
    const firstRoleId = confirmed.activeRoleIds[0];
    const firstRole = casting.getByLabel(`Role for DEMO // ${firstRoleId}`, { exact: true });
    await firstRole.waitFor();
    evidence.castingViewports = [];
    for (const viewport of [{ width: 320, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      await gm.page.setViewportSize(viewport);
      await firstRole.scrollIntoViewIfNeeded();
      await firstRole.focus();
      await gm.page.keyboard.press('ArrowDown');
      assert.equal(await firstRole.inputValue(), firstRoleId, 'Keyboard selection offers only the canonical held role.');
      await gm.page.keyboard.press('Tab');
      const metrics = await gm.page.evaluate(({ label, viewport }) => {
        const select = [...document.querySelectorAll('select')].find(element =>
          [...element.labels ?? []].some(item => item.textContent === label));
        const row = select?.closest('.gm-casting-board__player');
        const assign = row?.querySelector('button');
        const box = element => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, width: rect.width, height: rect.height };
        };
        return { ...viewport, noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          select: box(select), action: box(assign), keyboardFocusReachedAssignment: document.activeElement === assign,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
      }, { label: `Role for DEMO // ${firstRoleId}`, viewport });
      assert.equal(metrics.noHorizontalOverflow, true);
      assert.equal(metrics.keyboardFocusReachedAssignment, true);
      assert.equal(metrics.reducedMotion, true);
      for (const control of [metrics.select, metrics.action]) {
        assert.ok(control.x >= 0 && control.x + control.width <= viewport.width + 1);
        assert.ok(control.height >= 44, 'Casting controls retain the shared touch target.');
      }
      evidence.castingViewports.push(metrics);
      await gm.page.screenshot({ path: `${directory}/casting-${viewport.width}x${viewport.height}.png` });
    }
    for (const roleId of confirmed.activeRoleIds) {
      const name = `DEMO // ${roleId}`;
      await casting.getByLabel(`Role for ${name}`, { exact: true }).selectOption(roleId);
      await casting.getByRole('button', { name: `Assign role to ${name}`, exact: true }).click();
      await casting.getByRole('button', { name: `Release role from ${name}`, exact: true }).waitFor();
    }
    await mark('GM UI actual manual Cycle 0 to 1');
    await setup.getByRole('button', { name: 'Start full-game demo // Advance to Cycle 1', exact: true }).click();
    await setup.getByRole('button', { name: 'ARE YOU SURE? // START FULL-GAME DEMO // CYCLE 1', exact: true }).click();
    const started = await gm.until('Actual manual Cycle 1 Team', state => state.cycle === 1 && state.phase === 'active' && state.fullGameDemo?.status === 'active' && state.phaseProgression === 'manual' && state.airspace === 'restricted');
    assert.equal(started.turnStatePhase, 'team');
    await gm.page.getByText('MANUAL', { exact: true }).first().waitFor();
    await gm.page.screenshot({ path: `${directory}/cycle-one-manual-team.png` });
    await options.onStarted?.({ gm, crew, initial, started, roster, directory });
    await mark('one crew browser reload-selects every confirmed role and Press');
    let priorActorDocument;
    let cacheProbe;
    for (const actor of roster) {
      const priorDocument = await crew.page.evaluate(() => {
        window.__pc10ProofDocument ??= crypto.randomUUID(); return window.__pc10ProofDocument;
      });
      await crew.page.getByLabel('Current actor', { exact: true }).selectOption(actor.roleId);
      await crew.page.waitForURL(url => url.searchParams.get('demoActor') === `${initial.sessionId}~${actor.roleId}`);
      let member = await crew.until(`Real ${actor.roleId} document`, state => state.sameActor && state.uidHash === actor.uidHash && state.profileRoleId === actor.roleId && state.connection === 'live' && state.freshness === 'server');
      assertSelectedActor(member, { ...actor, sessionId: initial.sessionId });
      assert.equal(member.pendingCommandCount, 0);
      const nextDocument = await crew.page.evaluate(() => {
        window.__pc10ProofDocument ??= crypto.randomUUID(); return window.__pc10ProofDocument;
      });
      assert.notEqual(nextDocument, priorDocument, 'Every actor change loads a fresh document.');
      if (priorActorDocument) assert.notEqual(nextDocument, priorActorDocument);
      priorActorDocument = nextDocument;
      if (cacheProbe) {
        const isolated = await crew.page.evaluate(async ({ storeUrl, cacheProbe }) => {
          const { useSessionStore } = await import(storeUrl);
          const state = useSessionStore.getState();
          const retained = JSON.parse(localStorage.getItem(cacheProbe.key));
          const result = { otherActorPendingCount: state.pendingCommands.length,
            otherActorPrivateProbeVisible: JSON.stringify([state.privateLoyalty, state.roleBrief]).includes('PC10 INACTIVE ACTOR CACHE PROBE'),
            originalActorOutboxRetained: retained.state.pendingCommands.some(command => command.id === 'pc10-inactive-actor-probe') };
          // Restore the original local envelope before any later actor revisit.
          localStorage.setItem(cacheProbe.key, cacheProbe.original);
          return result;
        }, { storeUrl: crew.storeModuleUrl(), cacheProbe });
        assert.equal(isolated.otherActorPendingCount, 0);
        assert.equal(isolated.otherActorPrivateProbeVisible, false);
        assert.equal(isolated.originalActorOutboxRetained, true);
        evidence.inactiveClientCacheProbe = { ...isolated, disclosedBrowserLocalInjection: true,
          serverCommandsFromProbe: false, restoredOriginalEnvelope: true };
        cacheProbe = null;
      }
      await crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true }).click();
      if (actor.roleId === 'press-officer') {
        await crew.page.getByRole('link', { name: 'Press Officer', exact: true }).click();
      } else {
        const brief = crew.page.getByRole('link', { name: 'Open private brief', exact: true });
        await brief.waitFor(); await brief.click();
        member = await crew.until(`Private ${actor.roleId} assignment belongs to current actor`, state => state.briefMatchesActor && state.briefRoleId === actor.roleId);
        await crew.page.getByRole('link', { name: 'Back to stations', exact: true }).first().click();
        await crew.page.locator(`a[href$="/roles/${actor.roleId}"]`).click();
      }
      member = await crew.until(`Current ${actor.roleId} station entered`, state => state.activeConsoleRoleId === actor.roleId && state.sameActor && state.connection === 'live');
      assertSelectedActor(member, { ...actor, sessionId: initial.sessionId });
      roleSurfaces.push({ roleId: actor.roleId, uidHash: actor.uidHash, path: new URL(crew.page.url()).hash,
        briefMatchesActor: member.briefMatchesActor, briefRoleId: member.briefRoleId,
        privateLoyaltyPresent: member.privateLoyaltyPresent, pendingCommandCount: member.pendingCommandCount });
      if (actor.roleId === 'admiral') {
        cacheProbe = await crew.page.evaluate(async sid => {
          const { demoActorSessionStorageKey } = await import('/src/lib/demoActorContext.ts');
          const key = demoActorSessionStorageKey('dow-new-eden-session', { sessionId: sid, roleId: 'admiral' });
          const original = localStorage.getItem(key), envelope = JSON.parse(original);
          envelope.state.pendingCommands.push({ id: 'pc10-inactive-actor-probe', kind: 'claimSeat', createdAt: new Date().toISOString(),
            payload: { sessionId: 'historical-inactive-probe', seatId: 'admiral', requestId: 'pc10-inactive-actor-probe', expectedSetupRevision: 0 } });
          envelope.state.privateLoyalty = { privateText: 'PC10 INACTIVE ACTOR CACHE PROBE' };
          // Only persisted inactive data is changed; no live store or server command is injected.
          localStorage.setItem(key, JSON.stringify(envelope));
          return { key, original };
        }, initial.sessionId);
      }
      console.log(JSON.stringify({ stage: 'confirmed role surface', roleId: actor.roleId }));
    }
    await mark('manual Team to Coordination through actual GM UI');
    const teamBeforeManualAdvance = await gm.observe();
    assert.equal(teamBeforeManualAdvance.cycle, 1);
    assert.equal(teamBeforeManualAdvance.turnStatePhase, 'team');
    assert.equal(teamBeforeManualAdvance.phaseProgression, 'manual');
    evidence.teamHeldThroughAllRoleSelections = true;
    await gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }).click();
    const coordination = await gm.until('Real manual Coordination', state => state.airspace === 'lifted' && state.phaseProgression === 'manual' && state.turnStatePhase === 'coordination');
    await delay(2_000);
    assert.equal((await gm.observe()).cycle, 1);
    assert.equal((await gm.observe()).turnStatePhase, 'coordination');
    await crew.page.reload();
    const refreshed = await crew.until('Last actual role refreshed unchanged', state => state.sameActor && state.profileRoleId === 'press-officer' && state.connection === 'live' && state.freshness === 'server');
    assertSelectedActor(refreshed, { ...roster.find(actor => actor.roleId === 'press-officer'), sessionId: initial.sessionId });
    await gm.page.screenshot({ path: `${directory}/manual-coordination.png` });
    if (options.runEnding) {
      await mark('supplied genuine gameplay ending');
      await options.runEnding({ gm, crew, initial, started, roster, directory });
      const ended = await gm.until('Server-produced immutable debrief ending', isObservedGameEnding);
      evidence.ending = ended; evidence.genuineEndingSupplied = true;
    } else evidence.genuineEndingSupplied = false;
    assert.equal((await gm.observe()).uidHash, gmIdentity.uidHash);
    assert.deepEqual(remoteRequests, []); assert.deepEqual(errors, []);
    Object.assign(evidence, { status: 'passed', initial, confirmed, prepared, controller, started, coordination,
      rolesVisited: roleSurfaces, roleSurfaceCount: roleSurfaces.length, transitions, calls, errors, remoteRequests,
      scope: 'Actual fresh full-demo admission, normal casting/start, 20 core role surfaces + Press, interrupted seat recovery and manual phase control. Every game-function branch and ending remain separately owned.' });
    evidence.sourceCommitAtCompletion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    evidence.builtRuntimeIndexSha256AtCompletion = createHash('sha256').update(await readFile(`${root}/functions/lib/index.js`)).digest('hex');
    evidence.sourceChangedDuringProof = evidence.sourceCommitAtCompletion !== sourceCommit || evidence.builtRuntimeIndexSha256AtCompletion !== builtRuntimeIndexSha256;
    await writeFile(`${directory}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ status: 'passed', sourceCommit, directory, roleSurfaceCount: roleSurfaces.length }));
    return evidence;
  } catch (error) {
    const states = await Promise.all(surfaces.map(async item => ({ surface: item.label, state: await item.observe().catch(() => null), path: new URL(item.page.url()).hash })));
    for (const item of surfaces) await item.page.screenshot({ path: `${directory}/${item.label}-failure.png` }).catch(() => undefined);
    evidence.sourceCommitAtCompletion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    evidence.builtRuntimeIndexSha256AtCompletion = createHash('sha256').update(await readFile(`${root}/functions/lib/index.js`)).digest('hex');
    evidence.sourceChangedDuringProof = evidence.sourceCommitAtCompletion !== sourceCommit || evidence.builtRuntimeIndexSha256AtCompletion !== builtRuntimeIndexSha256;
    await writeFile(`${directory}/failure.json`, `${JSON.stringify({ ...evidence, status: 'failed', stage, message: error.message, states, transitions, calls, errors, remoteRequests }, null, 2)}\n`);
    console.error(JSON.stringify({ status: 'failed', stage, message: error.message, directory }));
    throw error;
  } finally { for (const browser of browsers) await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const endingModule = process.env.PC10_DEMO_ENDING_DRIVER;
  const runEnding = endingModule ? (await import(pathToFileURL(resolve(endingModule)).href)).runEnding : undefined;
  runFreshFullGameDemoUi({ ...(runEnding ? { runEnding } : {}) }).catch(() => { process.exitCode = 1; });
}
