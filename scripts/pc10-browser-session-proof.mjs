import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

/** An isolated browser context has its own Firebase Auth identity/storage.
 * Tokens remain in memory. Evidence records role/action/state categories only.
 * These are automated browser clients, never a human/device playtest claim. */
export async function createPc10BrowserActor(browser, baseUrl, label, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(20_000);
  const errors = [];
  let joinStage = 'not started';
  async function bounded(operation, timeoutMs, name) {
    let timer;
    try {
      return await Promise.race([operation, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: ${name} exceeded ${timeoutMs}ms`)), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  let storeModule = '/src/store/useSessionStore.ts';
  let functionsSdkModule = '/node_modules/.vite/deps/firebase_functions.js';
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/src/store/useSessionStore.ts') storeModule = url.href;
    if (url.pathname.endsWith('/firebase_functions.js')) functionsSdkModule = url.href;
  });
  async function observe() {
    return bounded(page.evaluate(async moduleUrl => {
      const { auth } = await import('/src/lib/firebase.ts');
      const { useSessionStore } = await import(moduleUrl);
      const state = useSessionStore.getState();
      return { hasAuth: Boolean(auth().currentUser), sameActor: auth().currentUser?.uid === state.me?.uid,
        hasSession: Boolean(state.session?.id), roleId: state.me?.assignedRoleId ?? null,
        activeConsoleRoleId: state.me?.activeConsoleRoleId ?? null,
        seatId: state.me?.seatId ?? null, connection: state.connection,
        freshness: state.sessionSnapshotFreshness, phase: state.session?.phase ?? null,
        cycle: state.session?.currentTurn ?? null };
    }, storeModule), 10_000, 'identity observation');
  }
  async function until(label, ready, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    let state;
    while (Date.now() < deadline) {
      state = await observe();
      if (ready(state)) return state;
      await delay(250);
    }
    throw new Error(`${label}: ${JSON.stringify(state)}`);
  }
  async function enter(joinCode) {
    console.log(`${label}: ordinary UI join started`);
    joinStage = 'launcher navigation';
    await page.goto(baseUrl);
    console.log(`${label}: launcher loaded`);
    const motion = page.getByRole('button', { name: /^REDUCED MOTION/i });
    if (await motion.isVisible()) await motion.click();
    await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
    await page.getByRole('button', { name: 'Join a session', exact: true }).click();
    joinStage = 'waiver admission';
    const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
    await waiver.waitFor();
    console.log(`${label}: consent displayed`);
    const regulations = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
    await regulations.first().waitFor();
    assert.equal(await regulations.count(), 3, 'All existing admission regulations must be present.');
    for (const checkbox of await regulations.all()) {
      await checkbox.check();
      assert.equal(await checkbox.isChecked(), true, 'Every regulation must be explicitly acknowledged.');
    }
    const acknowledge = waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
    try {
      const deadline = Date.now() + 30_000;
      while (!(await acknowledge.isEnabled()) && Date.now() < deadline) await delay(100);
      assert.equal(await acknowledge.isEnabled(), true, 'The unchanged consent timer and all regulations must enable confirmation.');
      await acknowledge.click();
    } catch (error) {
      const captureDirectory = process.env.PC10_EVIDENCE_DIRECTORY;
      if (captureDirectory) {
        await mkdir(captureDirectory, { recursive: true });
        await bounded(page.screenshot({ path: `${captureDirectory}/${label}-consent-failure.png` }), 5_000,
          'failure screenshot').catch(() => undefined);
        await writeFile(`${captureDirectory}/${label}-consent-failure.json`, `${JSON.stringify({
          label, message: error.message, regulationChecks: await regulations.evaluateAll(inputs => inputs.map(input => input.checked)),
          consentStatus: await waiver.getByRole('status').allTextContents(),
          buttonDisabled: await acknowledge.isDisabled({ timeout: 1_000 }).catch(() => null),
          waiverVisible: await waiver.isVisible(),
          documentUrl: page.url(),
          identity: await observe().catch(error => ({ unavailable: error.message })), browserErrors: errors,
        }, null, 2)}\n`);
      }
      throw error;
    }
    joinStage = 'authoritative joined identity';
    await until(`${label} ordinary Auth join`, state => state.hasAuth && state.sameActor && state.hasSession);
    console.log(`${label}: ordinary UI admission and consent passed`);
    return page.evaluate(async () => {
      const { auth } = await import('/src/lib/firebase.ts');
      const current = auth().currentUser;
      assertIdentity(current);
      function assertIdentity(value) { if (!value) throw new Error('Joined browser has no Firebase Auth identity.'); }
      return { localId: current.uid, idToken: await current.getIdToken() };
    });
  }
  async function join(joinCode) {
    try { return await bounded(enter(joinCode), 60_000, `ordinary join at ${joinStage}`); }
    catch (error) {
      const directory = process.env.PC10_EVIDENCE_DIRECTORY;
      if (directory) {
        await mkdir(directory, { recursive: true });
        await writeFile(`${directory}/${label}-join-diagnostic.json`, `${JSON.stringify({
          roleId: label, status: 'failed', stage: joinStage, message: error.message,
          documentUrl: page.url(), browserErrors: errors,
        }, null, 2)}\n`);
      }
      await bounded(context.close(), 5_000, 'failed join context cleanup').catch(() => undefined);
      throw error;
    }
  }
  async function callable(name, data) {
    return page.evaluate(async ({ sdkUrl, name, data }) => {
      const { functions } = await import('/src/lib/firebase.ts');
      const { httpsCallable } = await import(sdkUrl);
      try {
        const reply = await httpsCallable(functions(), name)(data);
        return { status: 200, result: reply.data };
      } catch (error) {
        return { status: 'denied', error: { code: error.code } };
      }
    }, { sdkUrl: functionsSdkModule, name, data });
  }
  async function geometry() {
    return page.evaluate(() => ({ viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  }
  return { context, page, errors, label, observe, until, join, callable, geometry,
    close: () => context.close() };
}

/** Fresh, normal authenticated full roster. All ordinary players join and
 * acknowledge consent through UI; setup/start stay on existing GM authority.
 * No admin gameplay seeding or result injection is performed. */
export async function createPc10BrowserTable({ baseUrl, directory, expansion = 'capybara', coreCount = 20 } = {}) {
  assert.ok(baseUrl && directory, 'An isolated UI URL and evidence directory are required.');
  await mkdir(directory, { recursive: true });
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const roles = recommendedRoleIds(coreCount);
  assert.equal(roles.length, coreCount, 'Use the actual supported full roster.');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const clients = new Map();
  const actions = [];
  let fixture;
  try {
    const joins = {};
    for (const roleId of roles) {
      const client = await createPc10BrowserActor(browser, baseUrl, roleId);
      clients.set(roleId, client);
      joins[roleId] = client.join;
    }
    const press = await createPc10BrowserActor(browser, baseUrl, 'press-officer');
    clients.set('press-officer', press);
    fixture = await createPc07AuthenticatedSession('PC10 fresh overlapping browser rehearsal', coreCount, {
      clearBriefing: true, keepAlive: true, serializeFixtureCalls: false, browserOwnsPresence: true, expansion,
      capybaraEnabled: true, joinBrowserPlayers: joins, joinPressPlayer: press.join,
    });
    const actorRoles = new Map(fixture.players.map((actor, index) => [actor.localId, roles[index]]));
    actorRoles.set(fixture.press.localId, 'press-officer');
    actorRoles.set(fixture.gm.localId, 'gm');
    const originalCall = fixture.call;
    fixture.call = async (actor, name, data) => {
      const roleId = actorRoles.get(actor.localId) ?? 'unassigned';
      const client = clients.get(roleId);
      const startedAt = Date.now();
      const reply = client ? await client.callable(name, data) : await originalCall(actor, name, data);
      actions.push({ roleId, name, transport: client ? 'independent-browser-SDK' : 'authenticated-emulator-HTTP',
        startedAt, completedAt: Date.now(), requestId: data.requestId ?? null,
        status: reply.status, resultStatus: reply.result?.status ?? null,
        revision: reply.result?.revision ?? null, denialCode: reply.error?.code ?? reply.error?.status ?? null });
      return reply;
    };
    async function command(roleId, name, payload = {}) {
      const actor = roleId === 'gm' ? fixture.gm : roleId === 'press-officer' ? fixture.press : fixture.byRole(roleId);
      assert.ok(actor, `${roleId} must have an independently authenticated actor.`);
      return fixture.call(actor, name, { sessionId: fixture.sessionId, ...payload });
    }
    async function writeEvidence(filename, details = {}) {
      const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const errors = [...clients.values()].flatMap(client => client.errors.map(message => ({ roleId: client.label, message })));
      const evidence = { schemaVersion: 1, sourceCommit, recordedAt: new Date().toISOString(), expansion,
        freshCreatedSession: true, adminGameplayWrites: false,
        independentCorePlayerAuthSessions: fixture.players.length,
        additionalIndependentPressAuthSessions: 1, gmAuthSessions: 1,
        actualIndependentBrowserContexts: clients.size, browserProcesses: 1,
        browserScheduling: 'overlapping Promise.all batches on independent contexts',
        humanDevicePlaytest: false, tokensOrCredentialsRecorded: false, actions, errors, ...details };
      await writeFile(`${directory}/${filename}`, `${JSON.stringify(evidence, null, 2)}\n`);
      return evidence;
    }
    return { fixture, clients, actions, command, writeEvidence, cleanup: async () => {
      try { await fixture.cleanup(); } finally { await browser.close(); }
    } };
  } catch (error) {
    await writeFile(`${directory}/startup-failure.json`, `${JSON.stringify({ status: 'failed',
      stage: 'fresh normal Auth/UI setup', message: error.message, contextsOpened: clients.size }, null, 2)}\n`);
    if (fixture) await fixture.cleanup();
    await browser.close();
    throw error;
  }
}

export async function runPc10OverlappingRecoveryProof(options) {
  const table = await createPc10BrowserTable(options);
  const { fixture, clients, command } = table;
  const roles = [...clients.keys()];
  try {
    const states = await Promise.all(roles.map(role => clients.get(role).until('Fresh active held role', state =>
      state.hasAuth && state.sameActor && state.cycle === 1 &&
      (role === 'press-officer' || state.roleId === role))));
    assert.equal(states.length, 21);
    const before = await fixture.session.get();
    const requests = new Map(fixture.roles.map(roleId => [roleId, { requestId: randomUUID(),
      seatId: roleId, expectedSetupRevision: before.get('setupRevision') }]));
    const resumes = await Promise.all(roles.map(role => command(role, 'resumeSession')));
    for (const reply of resumes) assert.equal(reply.status, 200, 'Every independent browser resumes its own current projection.');
    const claims = await Promise.all(fixture.roles.map(role => command(role, 'claimSeat', requests.get(role))));
    for (const reply of claims) assert.equal(reply.status, 200, 'Distinct held seats support legitimate simultaneous exact retries.');
    const replayClaims = await Promise.all(fixture.roles.map(role => command(role, 'claimSeat', requests.get(role))));
    for (let index = 0; index < claims.length; index++) assert.deepEqual(replayClaims[index], claims[index]);
    const allPresence = await Promise.all(roles.map(role => command(role, 'refreshPresence', { activeConsoleRoleId: role })));
    for (const reply of allPresence) assert.equal(reply.status, 200);
    const outsider = await clients.get(fixture.roles[1]).callable('startGame', { sessionId: fixture.sessionId,
      instanceId: fixture.instanceId, requestId: randomUUID(), expectedSetupRevision: before.get('setupRevision') });
    assert.notEqual(outsider.status, 200, 'Ordinary authenticated browsers cannot become GM/start the game.');
    const recoveryRoles = [...fixture.roles, 'press-officer'];
    await Promise.all(recoveryRoles.map(role => clients.get(role).context.setOffline(true)));
    const disconnectedObservations = await Promise.all(recoveryRoles.map(role => clients.get(role).observe()));
    await Promise.all(recoveryRoles.map(role => clients.get(role).context.setOffline(false)));
    await Promise.all(recoveryRoles.map(role => clients.get(role).page.reload()));
    const recovered = await Promise.all(recoveryRoles.map(role => clients.get(role).until('reload/reconnect same authoritative role', state =>
      state.hasAuth && state.sameActor && state.hasSession && state.cycle === 1 &&
      (role === 'press-officer' || state.roleId === role))));
    const after = await fixture.session.get();
    assert.equal(after.get('currentTurn'), before.get('currentTurn'), 'Reconnect must not advance the authoritative cycle.');
    const geometry = await Promise.all(roles.map(role => clients.get(role).geometry()));
    for (const metrics of geometry) assert.ok(metrics.document <= metrics.viewport && metrics.body <= metrics.viewport);
    const evidence = await table.writeEvidence('overlapping-recovery.json', {
      checks: { freshFullRosterViaOrdinaryUiConsent: true, independentBrowserContexts: 21,
        overlappingResumePresenceAndSeatRetries: true, exactSeatReplayStable: true,
        ordinaryActorGmMutationDenied: true, everyNonGmRoleOfflineReloadRecovery: true,
        cyclePreserved: true, browserGeometryContained: true },
      disconnectedObservations, recovered,
      limitations: ['This focused concurrency proof alone is not a complete game-through-ending proof.',
        'Actor/browser automation does not establish human-device attendance.',
        'Timer all-player disconnect/remaining-time pause requires its distinct controlled presence-expiry check.'],
    });
    assert.equal(evidence.errors.length, 0, 'No browser runtime errors may be ignored.');
    return evidence;
  } catch (error) {
    await table.writeEvidence('overlapping-recovery-failure.json', { status: 'failed', message: error.message });
    throw error;
  } finally {
    await table.cleanup();
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const evidence = await runPc10OverlappingRecoveryProof({ baseUrl: process.env.PC10_UI_URL,
    directory: process.env.PC10_EVIDENCE_DIRECTORY, expansion: process.env.PC10_EXPANSION ?? 'capybara' });
  console.log(JSON.stringify({ checks: evidence.checks, browserContexts: evidence.actualIndependentBrowserContexts,
    actions: evidence.actions.length, humanDevicePlaytest: false }));
}
