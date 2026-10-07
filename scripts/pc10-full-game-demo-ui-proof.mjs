import { observeUiReceipt, attachUiReceiptDiagnostics } from './pc10-browser-ui-receipt.mjs';
import { originalProofError, retainProofFailure } from './pc10-proof-failure-evidence.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { proofRuntimeFromViteSource, validateProofRuntime, assertSelectedActor, waitForFullGameDemoPresentationActor, completePreparedCrew, confirmPreparedSetup, isObservedGameEnding, assertExactFullGameStartRecovery, waitForFullGamePresentationReady } from './pc10-full-game-demo-proof-helpers.mjs';

const PRESENTATION_READINESS_SOURCE_FILES = Object.freeze([
  'scripts/pc10-full-game-demo-proof-helpers.mjs',
  'scripts/pc10-full-game-demo-ui-proof.mjs',
  'src/components/TurnStartAnnouncement.tsx',
  'src/components/Intrusion.tsx',
  'src/components/CycleBriefingClearanceView.tsx',
  'src/styles/intrusion.css',
  'src/lib/turnInterstitialService.ts',
  'functions/src/turnInterstitial.ts',
]);

async function presentationReadinessSourceHashes(root) {
  const entries = await Promise.all(PRESENTATION_READINESS_SOURCE_FILES.map(async path => [
    path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
  ]));
  return Object.fromEntries(entries);
}

/** Diagnostic-only samples stay separate from the established generic actor
 * projection. Both reads are passive; unknown values stay unknown and neither
 * sample grants authority or changes the caller's original response deadline. */
export async function observeFullGameCallableDiagnostics(surface) {
  const ordinaryActor = await surface.observe();
  const runtimeState = await surface.page.evaluate(async moduleUrl => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(moduleUrl);
    const originalUid = auth().currentUser?.uid;
    const uidHash = originalUid ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(originalUid)))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
    const state = useSessionStore.getState(), user = auth().currentUser;
    if (user?.uid !== originalUid) throw new Error('Original Auth UID changed during callable diagnostic observation.');
    return { hasAuth: !!user, sameActor: !!user && state.me?.uid === user.uid, uidHash,
      sessionId: state.session?.id ?? null, documentTimeOrigin: performance.timeOrigin,
      connection: state.connection, freshness: state.sessionSnapshotFreshness,
      navigatorOnline: globalThis.navigator?.onLine,
      connectionGeneration: state.me?.connectionGeneration,
      identityHydrationRevision: state.identityHydrationRevision,
      gmAccessCached: state.gmAccessAuthenticatedAt === undefined ? undefined : state.gmAccessAuthenticatedAt !== null,
      gmInstanceOwned: !!state.gmInstance && state.gmInstance.uid === user?.uid && state.gmInstance.sessionId === state.session?.id,
      communicationError: state.communicationError ? { code: state.communicationError.code,
        kind: state.communicationError.kind ?? null } : null,
      pendingCommandCount: state.pendingCommands.length,
      pendingCommandDetails: state.pendingCommands.map(command => ({
        id: command.id, kind: command.kind, createdAt: command.createdAt,
        queuedWithServerAuthority: command.queuedWithServerAuthority,
        actorMatchesCurrentAuth: command.actorUid === undefined ? undefined : command.actorUid === user?.uid,
        payloadFields: Object.keys(command.payload ?? {}),
        payloadAuthorityContext: Object.fromEntries(['sessionId', 'instanceId', 'requestId', 'roleId',
          'targetInstanceId', 'expectedCycle', 'expectedTurn', 'expectedRevision', 'connectionGeneration',
          'expectedSetupRevision'].filter(key => Object.hasOwn(command.payload ?? {}, key))
          .map(key => [key, command.payload[key]])),
      })) };
  }, surface.storeModuleUrl());
  return { ordinaryActor, runtimeState };
}

/** Real UI/SDK driver. Callbacks may compose later genuine game decisions. */
export async function runFreshFullGameDemoUi(options = {}) {
  const playerCount = options.playerCount ?? 20, includePress = options.includePress ?? true;
  const chartId = options.chartId ?? 'A', gameplayOnly = options.gameplayOnly ?? false;
  const gameplayManagesPhases = options.gameplayManagesPhases === undefined ? false : options.gameplayManagesPhases;
  assert.ok(Number.isSafeInteger(playerCount) && playerCount >= 8 && playerCount <= 20);
  assert.equal(typeof includePress, 'boolean'); assert.equal(typeof gameplayOnly, 'boolean');
  assert.equal(typeof gameplayManagesPhases, 'boolean');
  assert.ok(['A', 'B', 'C'].includes(chartId));
  if (options.capybaraEnabled !== undefined) assert.equal(typeof options.capybaraEnabled, 'boolean');
  if (gameplayOnly) assert.equal(typeof options.runEnding, 'function', 'Supply the genuine manual gameplay callback.');
  if (gameplayManagesPhases) {
    assert.equal(gameplayOnly, false, 'Keep the ordinary role loop when supplied gameplay owns phase advances.');
    assert.equal(typeof options.runEnding, 'function', 'Supply the genuine gameplay callback to own manual phase advances.');
  }
  const baseUrl = options.baseUrl ?? process.env.PC10_UI_URL ?? 'http://127.0.0.1:5174';
  const projectId = options.projectId ?? process.env.PC10_DEMO_PROJECT ?? 'demo-pc10-owner';
  const root = resolve(options.sourceRoot ?? process.env.PC10_SOURCE_ROOT ?? process.cwd());
  const directory = options.directory ?? process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence/full-game-demo-ui';
  const ports = options.ports ?? { auth: 9109, functions: 5011, firestore: 8090 };
  const runtime = validateProofRuntime(proofRuntimeFromViteSource(await (await fetch(`${baseUrl}/src/lib/firebaseConfig.ts`)).text()),
    { baseUrl, projectId, ports });
  const presentationSourceHashes = await presentationReadinessSourceHashes(root);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const driverCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const builtRuntimeIndexSha256 = createHash('sha256').update(await readFile(`${root}/functions/lib/index.js`)).digest('hex');
  await mkdir(directory, { recursive: true });
  const browsers = [], surfaces = [], errors = [], calls = [], requests = [], remoteRequests = [], transitions = [], roleSurfaces = [];
  const evidence = { schemaVersion: 1, sourceCommit, driverCommit, builtRuntimeIndexSha256, runtime,
    presentationReadinessSourceSha256: presentationSourceHashes,
    actualBrowserProcesses: 2, actualBrowserContexts: 2, actualHumans: 0, physicalAttendanceProof: false,
    callableFixtures: false, adminGameplayWrites: false, acceleratedClock: false, wholeGameProof: false,
    playerCount, includePress, chartId, gameplayOnly, gameplayManagesPhases,
    protocol: gameplayOnly ? 'Fresh ordinary UI admission; normal consent and real Firebase SDK; no fault or cache probe.' :
      'Fresh ordinary UI admission; normal consent and real Firebase SDK; controlled actual-response interruption disclosed.' };
  let stage = 'launch', primaryFailure;
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
    page.on('pageerror', error => errors.push({ surface: label, message: error.message, originalError: originalProofError(error) }));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/src/store/useSessionStore.ts') storeUrl = url.href;
      if (url.pathname.endsWith('/firebase_functions.js')) sdkUrl = url.href;
      const endpoint = url.pathname.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
      if (endpoint && request.method() === 'POST') requests.push({ surface: label, endpoint,
        transport: 'actual browser Firebase SDK', at: new Date().toISOString() });
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
        const originalUid = auth().currentUser?.uid;
        const hash = async value => value ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
          .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
        const uidHash = await hash(originalUid);
        // Digest first so this observation's store and Auth tuple is current.
        const state = useSessionStore.getState(), user = auth().currentUser;
        if (user?.uid !== originalUid) throw new Error('Original Auth UID changed during full-game actor observation.');
        return { hasAuth: !!user, sameActor: !!user && state.me?.uid === user.uid, uidHash,
          documentTimeOrigin: performance.timeOrigin,
          sessionId: state.session?.id ?? null, joinCode: state.session?.joinCode ?? null,
          cycle: state.session?.currentTurn ?? null, phase: state.session?.phase ?? null,
          announcementTurn: state.session?.turnStartAnnouncement?.turn ?? null,
          announcementRevision: state.session?.turnStartAnnouncement
            ? state.session.turnStartAnnouncement.revision ?? 0 : null,
          naturalTransmissionMounted: document.querySelector('.intrusion--fleet .turn-start-announcement__console')?.isConnected === true,
          ordinaryBriefingMounted: document.querySelector('[aria-label="Cycle briefing clearance"]')?.isConnected === true,
          ordinaryBriefingHeld: state.session?.turnPhase?.timerPause?.reason === 'turn-interstitial',
          playerRole: state.me?.role ?? null, profileRoleId: activeDemoActorProfile?.roleId ?? null,
          profileSessionId: activeDemoActorProfile?.sessionId ?? null,
          assignedRoleId: state.me?.assignedRoleId ?? null, activeConsoleRoleId: state.me?.activeConsoleRoleId ?? null,
          connection: state.connection, freshness: state.sessionSnapshotFreshness,
          communicationError: state.communicationError ? { code: state.communicationError.code,
            kind: state.communicationError.kind ?? null } : null,
          setupUi: { confirmEnabled: [...document.querySelectorAll('button')].some(button =>
            button.getAttribute('aria-label') === 'Confirm setup // Confirm roster' && !button.disabled),
            rosterStatus: document.querySelector('[aria-label="Roster confirmation status"]')?.textContent ?? '',
            authorityStatus: document.querySelector('[aria-label="Setup authority status"]')?.textContent ?? '' },
          gmInstanceOwned: !!state.gmInstance && state.gmInstance.uid === state.me?.uid && state.gmInstance.sessionId === state.session?.id,
          instanceId: state.gmInstance?.id ?? null, setupConfirmed: state.session?.setupConfirmed ?? false,
          setupRevision: state.session?.setupRevision ?? null, activeRoleIds: state.session?.activeRoleIds ?? [],
          activeVesselIds: state.session?.activeVesselIds ?? [], pressEnabled: state.session?.pressEnabled !== false,
          capybaraEnabled: state.session?.capybaraEnabled !== false,
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
        catch (error) { return { status: 'denied', code: error.code, message: error.message }; }
      }, { name, data, sdkUrl });
    }
    async function reducedMotion() {
      const button = page.getByRole('button', { name: /^REDUCED MOTION/i });
      if (await button.isVisible().catch(() => false)) await button.click();
    }
    async function paintTwoFrames() {
      await page.evaluate(() => new Promise(resolveFrame => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame(true)));
      }));
    }
    const result = { label, page, context, observe, until, consent, callable, reducedMotion, paintTwoFrames,
      storeModuleUrl: () => storeUrl };
    attachUiReceiptDiagnostics(page, { directory, label, inspectState: () => observeFullGameCallableDiagnostics(result) });
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
    await mark(`confirm ${playerCount}-role roster and prepare before ordinary admission`);
    const setup = gm.page.getByRole('region', { name: 'Setup', exact: true });
    await setup.getByRole('button', { name: 'Setup', exact: true }).click();
    await setup.getByLabel('Recommended player count', { exact: true }).selectOption(String(playerCount));
    await setup.getByLabel('Star chart', { exact: true }).selectOption(chartId);
    if (!gameplayOnly) {
      evidence.modalViewports = [];
      const beforeModalRequests = requests.filter(request => ['setCapybaraEnabled', 'setDioneEnabled', 'setPressEnabled'].includes(request.endpoint)).length;
      for (const name of ['Capybara', 'Dione', 'Press']) {
        for (const viewport of [{ width: 320, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
          await gm.page.setViewportSize(viewport);
          const trigger = setup.getByRole('button', { name: `Disable ${name}`, exact: true });
          await trigger.click();
          const dialog = gm.page.getByRole('alertdialog', { name: name === 'Press' ? 'Change Press availability' : 'Change convoy manifest', exact: true });
          const cancel = dialog.getByRole('button', { name: name === 'Press' ? 'Cancel Press change' : 'Cancel convoy change', exact: true });
          assert.equal(await cancel.evaluate(button => document.activeElement === button), true);
          await gm.page.keyboard.press('Tab');
          assert.equal(await dialog.getByRole('button').last().evaluate(button => document.activeElement === button), true);
          await gm.page.keyboard.press('Tab');
          assert.equal(await cancel.evaluate(button => document.activeElement === button), true);
          const metrics = await dialog.evaluate((element, viewport) => ({ ...viewport,
            portalledOutsideRoute: !element.closest('.gm-console, .screen-fade'),
            buttons: [...element.querySelectorAll('button')].map(button => {
              const rect = button.getBoundingClientRect();
              const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
              return { name: button.textContent.trim(), height: rect.height,
                withinViewport: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
                pointerTarget: hit === button || button.contains(hit) };
            }) }), viewport);
          assert.equal(metrics.portalledOutsideRoute, true);
          for (const button of metrics.buttons) {
            assert.equal(button.withinViewport, true); assert.equal(button.pointerTarget, true);
            assert.ok(button.height >= 44);
          }
          evidence.modalViewports.push({ name, ...metrics });
          await gm.page.screenshot({ path: `${directory}/modal-${name.toLowerCase()}-${viewport.width}x${viewport.height}.png` });
          await cancel.click(); await dialog.waitFor({ state: 'hidden' });
          assert.equal(await trigger.evaluate(button => document.activeElement === button), true);
        }
      }
      assert.equal(requests.filter(request => ['setCapybaraEnabled', 'setDioneEnabled', 'setPressEnabled'].includes(request.endpoint)).length,
        beforeModalRequests, 'Read-only geometry capture cancels every local confirmation.');
    }
    if (options.capybaraEnabled !== undefined) {
      const change = setup.getByRole('button', { name: options.capybaraEnabled ? 'Enable Capybara' : 'Disable Capybara', exact: true });
      if (await change.isVisible()) {
        await change.click();
        await gm.page.getByRole('alertdialog', { name: 'Change convoy manifest', exact: true })
          .getByRole('button', { name: options.capybaraEnabled ? 'Confirm add Capybara' : 'Confirm remove Capybara', exact: true }).click();
      }
    }
    if (!includePress) {
      await setup.getByRole('button', { name: 'Disable Press', exact: true }).click();
      await gm.page.getByRole('button', { name: 'ARE YOU SURE? // Disable Press', exact: true }).click();
      await gm.until('Ordinary Press availability choice committed', state => state.pressEnabled === false);
    }
    await options.onSetup?.({ gm, crew, initial, directory });
    const confirmControl = setup.getByRole('button', { name: 'Confirm setup // Confirm roster', exact: true });
    evidence.setupReadiness = [];
    let lastReadiness;
    const setupConfirmation = await confirmPreparedSetup({ expected: gmIdentity,
      inspect: async () => {
        const current = await gm.observe();
        return { ...current, confirmEnabled: await confirmControl.isEnabled(), rosterStatus: current.setupUi.rosterStatus,
          setupRequestCount: requests.filter(request => request.surface === gm.label && request.endpoint === 'confirmSetup').length,
          confirmed: current.setupConfirmed && current.activeRoleIds.length === playerCount };
      },
      click: () => confirmControl.click(),
      onObserve: current => {
        const readiness = { sameActor: current.sameActor, connection: current.connection, freshness: current.freshness,
          gmInstanceOwned: current.gmInstanceOwned, confirmEnabled: current.confirmEnabled,
          setupRequestCount: current.setupRequestCount, setupConfirmed: current.setupConfirmed,
          rosterStatus: current.rosterStatus, authorityStatus: current.setupUi.authorityStatus,
          communicationError: current.communicationError };
        const serialized = JSON.stringify(readiness);
        if (serialized !== lastReadiness) { evidence.setupReadiness.push(readiness); lastReadiness = serialized; }
      } });
    evidence.setupConfirmationClicks = setupConfirmation.clicks;
    const confirmed = await gm.until('Real confirmed roles', state => state.setupConfirmed && state.activeRoleIds.length === playerCount && state.cycle === 0);
    assert.equal(confirmed.pressEnabled, includePress);
    if (options.capybaraEnabled !== undefined) assert.equal(confirmed.capybaraEnabled, options.capybaraEnabled);
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

    let establishedUidHash;
    if (gameplayOnly) {
      await mark('ordinary cohort admission without fault or cache probes');
      await crew.page.getByRole('button', { name: 'Prepare demo crew', exact: true }).click();
    } else {
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
      establishedUidHash = await crew.page.evaluate(async () => {
        const { readDemoActorAccountUid } = await import('/src/lib/demoActorContext.ts');
        const uid = readDemoActorAccountUid('admiral');
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid))))
          .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
      });
      await crew.page.reload(); release(); await crew.page.unroute(claimPattern);
      await crew.until('Interrupted controller restored', state => state.sameActor && state.uidHash === controller.uidHash && state.connection === 'live' && state.freshness === 'server');
      await mark('lost actual seat acknowledgement; same real controller restored');
      await crew.page.getByRole('button', { name: 'Prepare demo crew', exact: true }).click();
    }
    const crewPanel = crew.page.getByRole('region', { name: 'Full-game demo crew', exact: true });
    evidence.preparationRetryCount = await completePreparedCrew({
      expectedActorCount: confirmed.activeRoleIds.length + (includePress ? 1 : 0),
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
    if (includePress) await crewPanel.getByRole('button', { name: /Open.*Press Officer$/ }).waitFor();
    const roster = await crew.page.evaluate(async sid => {
      const { readDemoActorRoster } = await import('/src/lib/demoActorProfiles.ts');
      const { demoActorDisplayName } = await import('/src/lib/demoActorDisplayName.ts');
      return Promise.all(readDemoActorRoster(sid).map(async actor => ({ roleId: actor.roleId,
        displayName: demoActorDisplayName(actor.roleId),
        uidHash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(actor.uid))))
          .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) })));
    }, initial.sessionId);
    assert.equal(roster.length, confirmed.activeRoleIds.length + (includePress ? 1 : 0));
    assert.equal(new Set(roster.map(actor => actor.uidHash)).size, roster.length);
    assert.ok(roster.every(actor => ![gmIdentity.uidHash, controller.uidHash].includes(actor.uidHash)));
    if (!gameplayOnly) assert.equal(roster.find(actor => actor.roleId === 'admiral').uidHash, establishedUidHash);
    assert.equal(await crew.page.getByLabel('Current actor', { exact: true }).locator('option').count(), roster.length + 1);
    evidence.interruptedAdmissionSameRealUid = !gameplayOnly;
    evidence.actualAuthenticatedActors = new Set([gmIdentity.uidHash, controller.uidHash, ...roster.map(actor => actor.uidHash)]).size;

    await mark('authenticated manager keyboard Back and browser Back');
    const managerBack = crewPanel.getByRole('link', { name: 'Back to stations', exact: true });
    await managerBack.focus();
    await managerBack.press('Enter');
    await crew.page.waitForURL(url => url.hash === '#/console');
    const returnedController = await crew.until('Manager Back preserves actual controller membership', state =>
      state.sameActor && state.uidHash === controller.uidHash && state.sessionId === initial.sessionId);
    assert.equal(returnedController.profileRoleId, 'controller');
    await crew.page.goBack();
    await crew.page.waitForURL(url => url.hash === '#/demo-actors');
    await crewPanel.getByRole('link', { name: 'Back to stations', exact: true }).waitFor();
    evidence.authenticatedManagerReturn = { keyboardBackToStations: true, browserBackRestoredManager: true,
      sameRealUidAndSession: true };

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
      const name = roster.find(actor => actor.roleId === roleId).displayName;
      await casting.getByLabel(`Role for ${name}`, { exact: true }).selectOption(roleId);
      await casting.getByRole('button', { name: `Assign role to ${name}`, exact: true }).click();
      await casting.getByRole('button', { name: `Release role from ${name}`, exact: true }).waitFor();
    }
    await options.onBeforeStart?.({ gm, crew, initial, confirmed, prepared, roster, directory });
    await mark('current Browser B account readiness before actual Cycle 1');
    const presentationDeadlineAt = Date.now() + 60_000;
    evidence.presentationStartReadiness = { status: 'pending', deadlineAt: presentationDeadlineAt, samples: [] };
    const presentationReady = await waitForFullGameDemoPresentationActor({ surface: crew,
      sessionId: initial.sessionId, controller, roster,
      confirmedRoleIds: confirmed.activeRoleIds, pressIncluded: includePress,
      deadlineAt: presentationDeadlineAt,
      onSample: current => {
        const samples = evidence.presentationStartReadiness.samples;
        if (samples.length < 256) samples.push(current);
      },
    });
    evidence.presentationStartReadiness = { ...evidence.presentationStartReadiness, ...presentationReady, status: 'ready' };
    const presentationCrew = presentationReady.actor;
    evidence.presentationStartCrewIdentity = {
      profileRoleId: presentationCrew.profileRoleId,
      uidHash: presentationCrew.uidHash,
      assignedRoleId: presentationCrew.assignedRoleId,
      activeConsoleRoleId: presentationCrew.activeConsoleRoleId,
    };
    await mark('GM UI actual manual Cycle 0 to 1');
    const startIdentity = await gm.observe();
    const startResponse = await observeUiReceipt({ page: gm.page,
      waitForResponse: () => gm.page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith('/us-central1/startGame') && response.request().method() === 'POST'),
      choose: async () => {
        await setup.getByRole('button', { name: 'Start full-game demo // Advance to Cycle 1', exact: true }).click();
        await setup.getByRole('button', { name: 'ARE YOU SURE? // START FULL-GAME DEMO // CYCLE 1', exact: true }).click();
      },
    });
    assert.equal(startResponse.ok(), true, 'The ordinary full-game UI start must actually commit.');
    const startPayload = startResponse.request().postDataJSON()?.data;
    const originalStart = (await startResponse.json()).result;
    const started = await gm.until('Actual manual Cycle 1 Team', state => state.cycle === 1 && state.phase === 'active' && state.fullGameDemo?.status === 'active' && state.phaseProgression === 'manual' && state.airspace === 'restricted');
    assert.equal(started.turnStatePhase, 'team');
    assert.equal(started.uidHash, startIdentity.uidHash);
    assert.equal(started.instanceId, startIdentity.instanceId);
    assert.equal(started.gmInstanceOwned, true);
    const repeatedStart = await gm.callable('startGame', startPayload);
    assert.equal(repeatedStart.status, 'committed', 'The current real GM must recover the exact original start.');
    assertExactFullGameStartRecovery({ payload: startPayload, original: originalStart,
      replay: repeatedStart.result, expected: startIdentity });
    evidence.exactUiStartRecovery = { committedViaUi: true, replayedViaOriginalGmSdk: true,
      requestFingerprint: createHash('sha256').update(JSON.stringify(startPayload)).digest('hex'),
      sameOriginalActor: true, sameOwnedInstance: true };
    evidence.presentationReadiness = await waitForFullGamePresentationReady({
      expectedAnnouncement: { turn: started.announcementTurn, revision: started.announcementRevision },
      actors: [
        { name: 'original GM browser', expected: startIdentity, inspect: gm.observe, paintTwoFrames: gm.paintTwoFrames },
        { name: 'original crew browser', expected: presentationCrew, inspect: crew.observe, paintTwoFrames: crew.paintTwoFrames },
      ],
    });
    await gm.page.getByText('MANUAL', { exact: true }).first().waitFor();
    await gm.page.screenshot({ path: `${directory}/cycle-one-manual-team.png` });
    await options.onStarted?.({ gm, crew, initial, started, roster, directory });
    let coordination;
    if (!gameplayOnly) {
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
          await crew.page.locator('.role-brief-screen').getByRole('link', { name: /^(?:←\s*)?Back to stations$/ }).click();
          await crew.page.locator(`a[href$="/roles/${actor.roleId}"]`).click();
        }
        member = await crew.until(`Current ${actor.roleId} station entered`, state => state.activeConsoleRoleId === actor.roleId && state.sameActor && state.connection === 'live');
        assertSelectedActor(member, { ...actor, sessionId: initial.sessionId });
        const affordances = await crew.page.evaluate(() => {
          const privatePanels = '.private-loyalty-flow, .private-loyalty-panel, .role-brief, [data-private-loyalty-flow], [aria-label="Private loyalty card"]';
          const visible = element => !element.closest(privatePanels) &&
            !element.closest('[hidden], [aria-hidden="true"], [inert]') && element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none';
          const text = element => (element?.innerText ?? element?.textContent ?? '').trim();
          const describedBy = element => (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
            .map(id => document.getElementById(id)).filter(element => element && visible(element)).map(text);
          return {
            privateBriefAndLoyaltyRedacted: true,
            headings: [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].filter(visible).map(text),
            regions: [...document.querySelectorAll('section[aria-label],section[aria-labelledby],[role="region"]')].filter(visible)
              .map(element => element.getAttribute('aria-label') ?? (element.getAttribute('aria-labelledby') ?? '')
                .split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(text).join(' ')),
            buttons: [...document.querySelectorAll('button,[role="button"]')].filter(visible).map(element => ({
              text: element.getAttribute('aria-label') ?? text(element),
              enabled: !element.disabled && element.getAttribute('aria-disabled') !== 'true',
              title: element.getAttribute('title'), describedBlockers: describedBy(element),
            })),
            pageText: [...new Set([...document.querySelectorAll('h1,h2,h3,h4,p,label,legend,summary')]
              .filter(visible).map(text).filter(Boolean))].join('\n'),
          };
        });
        roleSurfaces.push({ roleId: actor.roleId, uidHash: actor.uidHash, path: new URL(crew.page.url()).hash,
          briefMatchesActor: member.briefMatchesActor, briefRoleId: member.briefRoleId,
          privateLoyaltyPresent: member.privateLoyaltyPresent, pendingCommandCount: member.pendingCommandCount,
          affordances });
        await writeFile(`${directory}/role-affordances.json`, `${JSON.stringify({ status: 'in-progress',
          sourceCommit, builtRuntimeIndexSha256, decisionsExecuted: false, roles: roleSurfaces }, null, 2)}\n`);
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
      await mark(gameplayManagesPhases ? 'ordinary role loop retains Team for supplied gameplay' :
        'manual Team to Coordination through actual GM UI');
      const teamBeforeManualAdvance = await gm.observe();
      assert.equal(teamBeforeManualAdvance.cycle, 1);
      assert.equal(teamBeforeManualAdvance.turnStatePhase, 'team');
      assert.equal(teamBeforeManualAdvance.phaseProgression, 'manual');
      evidence.teamHeldThroughAllRoleSelections = true;
      // A composed game performs its original Team work before its own normal
      // manual Coordination control. The generic role-only flow keeps its
      // existing advance, delay and assertions.
      if (!gameplayManagesPhases) {
        await gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }).click();
        coordination = await gm.until('Real manual Coordination', state => state.airspace === 'lifted' && state.phaseProgression === 'manual' && state.turnStatePhase === 'coordination');
        await delay(2_000);
        assert.equal((await gm.observe()).cycle, 1);
        assert.equal((await gm.observe()).turnStatePhase, 'coordination');
      }
      await crew.page.reload();
      const refreshed = await crew.until('Last actual role refreshed unchanged', state => state.sameActor && state.profileRoleId === roster.at(-1).roleId && state.connection === 'live' && state.freshness === 'server');
      assertSelectedActor(refreshed, { ...roster.at(-1), sessionId: initial.sessionId });
      evidence.lastActorRefreshSameRealUid = true;
      await mark('repeat ordinary selection of the first and last prepared identities');
      evidence.repeatedActorSelections = [];
      for (const actor of [roster[0], roster.at(-1)]) {
        assert.ok(actor, 'Repeat only an already prepared real actor.');
        const roleId = actor.roleId;
        await crew.page.getByLabel('Current actor', { exact: true }).selectOption(roleId);
        await crew.page.waitForURL(url => url.searchParams.get('demoActor') === `${initial.sessionId}~${roleId}`);
        let repeated = await crew.until(`Existing ${roleId} reselected`, state => state.sameActor && state.uidHash === actor.uidHash &&
          state.profileRoleId === roleId && state.connection === 'live' && state.freshness === 'server');
        assertSelectedActor(repeated, { ...actor, sessionId: initial.sessionId });
        assert.equal(repeated.pendingCommandCount, 0);
        await crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true }).click();
        if (roleId !== 'press-officer') {
          await crew.page.getByRole('link', { name: 'Open private brief', exact: true }).click();
          repeated = await crew.until(`Repeated ${roleId} private assignment belongs to the same real UID`, state => state.briefMatchesActor && state.briefRoleId === roleId);
          await crew.page.locator('.role-brief-screen').getByRole('link', { name: /^(?:←\s*)?Back to stations$/ }).click();
          await crew.page.locator(`a[href$="/roles/${roleId}"]`).click();
        } else await crew.page.getByRole('link', { name: 'Press Officer', exact: true }).click();
        await crew.until(`Repeated ${roleId} station entered`, state => state.activeConsoleRoleId === roleId && state.sameActor && state.connection === 'live');
        evidence.repeatedActorSelections.push({ roleId, uidHash: actor.uidHash, pendingCommandCount: repeated.pendingCommandCount,
          briefMatchesActor: repeated.briefMatchesActor, briefRoleId: repeated.briefRoleId });
      }
      await gm.page.screenshot({ path: `${directory}/${gameplayManagesPhases ? 'team-before-gameplay' : 'manual-coordination'}.png` });
    }
    if (options.runEnding) {
      await mark('supplied genuine gameplay ending');
      await options.runEnding({ gm, crew, initial, started, roster, directory });
      const ended = await gm.until('Server-produced immutable debrief ending', isObservedGameEnding);
      evidence.ending = ended; evidence.genuineEndingSupplied = true;
    } else evidence.genuineEndingSupplied = false;
    assert.equal((await gm.observe()).uidHash, gmIdentity.uidHash);
    assert.deepEqual(remoteRequests, []); assert.deepEqual(errors, []);
    Object.assign(evidence, { status: 'passed', initial, confirmed, prepared, controller, started, coordination,
      rolesVisited: roleSurfaces, roleSurfaceCount: roleSurfaces.length, transitions, calls, requests, errors, remoteRequests,
      scope: gameplayOnly ? 'Actual fresh full-demo admission, normal casting/start and a supplied genuine manual candidate gameplay callback; no client cache or fault probes.' :
        'Actual fresh full-demo admission, normal casting/start, confirmed role surfaces, interrupted seat recovery and manual phase control. Every game-function branch and ending remain separately owned.' });
    evidence.sourceCommitAtCompletion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    evidence.builtRuntimeIndexSha256AtCompletion = createHash('sha256').update(await readFile(`${root}/functions/lib/index.js`)).digest('hex');
    evidence.presentationReadinessSourceSha256AtCompletion = await presentationReadinessSourceHashes(root);
    evidence.presentationReadinessSourceChangedDuringProof = JSON.stringify(evidence.presentationReadinessSourceSha256AtCompletion) !== JSON.stringify(presentationSourceHashes);
    evidence.sourceChangedDuringProof = evidence.sourceCommitAtCompletion !== sourceCommit ||
      evidence.builtRuntimeIndexSha256AtCompletion !== builtRuntimeIndexSha256 || evidence.presentationReadinessSourceChangedDuringProof;
    await writeFile(`${directory}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ status: 'passed', sourceCommit, directory, roleSurfaceCount: roleSurfaces.length }));
    return evidence;
  } catch (error) {
    primaryFailure = error;
    const originalFailure = await retainProofFailure(directory, 'full-game', error, { stage, transitions, errors });
    try {
      const states = await Promise.all(surfaces.map(async item => ({ surface: item.label, state: await item.observe().catch(() => null), path: new URL(item.page.url()).hash })));
      for (const item of surfaces) await item.page.screenshot({ path: `${directory}/${item.label}-failure.png` }).catch(() => undefined);
      evidence.sourceCommitAtCompletion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
      evidence.builtRuntimeIndexSha256AtCompletion = createHash('sha256').update(await readFile(`${root}/functions/lib/index.js`)).digest('hex');
      evidence.presentationReadinessSourceSha256AtCompletion = await presentationReadinessSourceHashes(root);
      evidence.presentationReadinessSourceChangedDuringProof = JSON.stringify(evidence.presentationReadinessSourceSha256AtCompletion) !== JSON.stringify(presentationSourceHashes);
      evidence.sourceChangedDuringProof = evidence.sourceCommitAtCompletion !== sourceCommit ||
        evidence.builtRuntimeIndexSha256AtCompletion !== builtRuntimeIndexSha256 || evidence.presentationReadinessSourceChangedDuringProof;
      await writeFile(`${directory}/failure.json`, `${JSON.stringify({ ...evidence, status: 'failed', stage, message: error.message, originalFailure, rolesVisited: roleSurfaces, roleSurfaceCount: roleSurfaces.length, states, transitions, calls, requests, errors, remoteRequests }, null, 2)}\n`, { mode: 0o600 });
      console.error(JSON.stringify({ status: 'failed', stage, message: error.message, directory }));
    } catch (reportError) {
      await retainProofFailure(directory, 'full-game-report', reportError, { stage, primaryError: error });
    }
    throw error;
  } finally {
    let closeFailure;
    for (const browser of browsers) {
      try { await browser.close(); }
      catch (closeError) {
        await retainProofFailure(directory, 'browser-close', closeError, { stage, primaryError: primaryFailure });
        closeFailure ??= closeError;
      }
    }
    if (!primaryFailure && closeFailure) throw closeFailure;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const endingModule = process.env.PC10_DEMO_ENDING_DRIVER;
  const runEnding = endingModule ? (await import(pathToFileURL(resolve(endingModule)).href)).runEnding : undefined;
  runFreshFullGameDemoUi({ ...(runEnding ? { runEnding } : {}) }).catch(async error => {
    await retainProofFailure(process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence/full-game-demo-ui', 'cli', error);
    process.exitCode = 1;
  });
}
