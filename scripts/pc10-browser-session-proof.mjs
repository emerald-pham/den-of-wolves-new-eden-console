import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';
import { runPc10NaturalDisconnectAcceptance } from './pc10-natural-disconnect.mjs';

async function compiledFunctionsHash() {
  const base = 'functions/lib';
  const files = [];
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) await visit(path);
      else files.push(path);
    }
  }
  await visit(base);
  const hash = createHash('sha256');
  for (const path of files.sort()) hash.update(path.slice(base.length + 1) + '\0').update(await readFile(path));
  return hash.digest('hex');
}

export function isFreshPc10BrowserRole(state, role) {
  return state.hasAuth && state.sameActor && state.hasSession && state.cycle === 1 &&
    state.connection === 'live' && state.freshness === 'server' &&
    state.activeConsoleRoleId === role && (role === 'press-officer' || state.roleId === role);
}

/** Compose the actual acceptance on this live table before caller-owned cleanup.
 * A failed follow-up, browser error, source change or rebuilt runtime remains a failure. */
export async function completePc10BrowserProof(table, { afterOverlappingProof, details = {} } = {}) {
  const errors = [...table.clients.values()].flatMap(client => client.errors);
  assert.equal(errors.length, 0, 'No browser runtime errors may be ignored.');
  if (afterOverlappingProof) await afterOverlappingProof(table);
  const evidence = await table.writeEvidence('overlapping-recovery.json', {
    ...details, completedAfterOverlappingProof: Boolean(afterOverlappingProof),
  });
  assert.equal(evidence.errors.length, 0, 'No browser runtime errors may be ignored.');
  assert.equal(evidence.sourceCommit, evidence.sourceCommitAtStart, 'The source must stay unchanged throughout the proof.');
  assert.equal(evidence.runtimeIndexSha256AtEnd, evidence.runtimeIndexSha256AtStart,
    'The Functions runtime index must stay unchanged throughout the proof.');
  assert.equal(evidence.runtimeCompiledTreeSha256AtEnd, evidence.runtimeCompiledTreeSha256AtStart,
    'Every compiled Functions runtime byte must stay unchanged throughout the proof.');
  return evidence;
}

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
  let firestoreSdkModule = '/node_modules/.vite/deps/firebase_firestore.js';
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/src/store/useSessionStore.ts') storeModule = url.href;
    if (url.pathname.endsWith('/firebase_functions.js')) functionsSdkModule = url.href;
    if (url.pathname.endsWith('/firebase_firestore.js')) firestoreSdkModule = url.href;
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
  async function privateRead(sessionId, suffix) {
    return bounded(page.evaluate(async ({ moduleUrl, sessionId, suffix }) => {
      const { db } = await import('/src/lib/firestore.ts');
      const { doc, getDocFromServer } = await import(moduleUrl);
      try {
        const reply = await getDocFromServer(doc(db(), `sessions/${sessionId}/${suffix}`));
        return { status: 'read', exists: reply.exists() };
      } catch (error) { return { status: 'denied', code: error.code }; }
    }, { moduleUrl: firestoreSdkModule, sessionId, suffix }), 15_000, 'private SDK read');
  }
  return { context, page, errors, label, observe, until, join, callable, privateRead, geometry,
    close: () => context.close() };
}

/** Fresh, normal authenticated full roster. All ordinary players join and
 * acknowledge consent through UI; setup/start stay on existing GM authority.
 * No admin gameplay seeding or result injection is performed. */
export async function createPc10BrowserTable({ baseUrl, directory, expansion = 'capybara', coreCount = 20 } = {}) {
  assert.ok(baseUrl && directory, 'An isolated UI URL and evidence directory are required.');
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname), 'Local browser proof only.');
  assert.match(process.env.VITE_FIREBASE_PROJECT_ID ?? '', /^demo-[a-z0-9-]+$/, 'Local demo project only.');
  await mkdir(directory, { recursive: true });
  const sourceCommitAtStart = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const runtimeIndexSha256AtStart = createHash('sha256').update(await readFile('functions/lib/index.js')).digest('hex');
  const runtimeCompiledTreeSha256AtStart = await compiledFunctionsHash();
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
        sourceCommitAtStart, runtimeIndexSha256AtStart,
        runtimeCompiledTreeSha256AtStart, runtimeCompiledTreeSha256AtEnd: await compiledFunctionsHash(),
        runtimeIndexSha256AtEnd: createHash('sha256').update(await readFile('functions/lib/index.js')).digest('hex'),
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
      // Stop real client rereads before deleting their fixture. Otherwise a
      // failed run can keep retrying a partially deleted session during cleanup.
      try { await browser.close(); } finally { await fixture.cleanup(); }
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
      isFreshPc10BrowserRole(state, role))));
    assert.equal(states.length, 21);
    const before = await fixture.session.get();
    const requests = new Map(fixture.roles.map(roleId => {
      const originalClaim = fixture.seatClaimRequests[roleId];
      assert.ok(originalClaim?.requestId, 'Retry the actual ordinary Cycle 0 claim, preserving casting authority.');
      return [roleId, originalClaim];
    }));
    const resumes = await Promise.all(roles.map(role => command(role, 'resumeSession')));
    for (const reply of resumes) assert.equal(reply.status, 200, 'Every independent browser resumes its own current projection.');
    const privateAudience = await Promise.all(roles.map(async role => {
      const deniedCalls = await Promise.all([
        clients.get(role).privateRead(fixture.sessionId, 'secrets/wolf-assignment'),
        clients.get(role).privateRead(fixture.sessionId, 'serverState/candidates'),
        command(role, 'listGmScoutResolutionLog', { instanceId: fixture.instanceId }),
      ]);
      for (const reply of deniedCalls) {
        assert.equal(reply.status, 'denied', `${role} must not obtain organiser-only scout or candidate information.`);
        assert.match(reply.code ?? reply.error?.code ?? '', /^(functions\/)?permission-denied$/,
          'Private reads deny actual authenticated audiences.');
      }
      return { roleId: role, deniedPrivateSdkReads: 2, deniedGmCallableReads: 1 };
    }));
    const messages = [];
    // Seven simultaneous legitimate writes to the same group are repeated
    // across the full core roster. This is explicit overlapping scheduling,
    // not a hidden transport retry or a limit change.
    for (let offset = 0; offset < fixture.roles.length; offset += 7) {
      const batch = fixture.roles.slice(offset, offset + 7);
      const choices = batch.map(role => ({ role,
        payload: { requestId: randomUUID(), expectedGroupId: resumes[roles.indexOf(role)].result.player.fleetGroupId,
          text: `PC10 automated browser overlap // ${role}` } }));
      const committed = await Promise.all(choices.map(({ role, payload }) => command(role, 'sendFleetGroupMessage', payload)));
      for (let index = 0; index < choices.length; index++) {
        assert.equal(committed[index].status, 200, `${choices[index].role} legitimate group note must commit.`);
      }
      const replays = await Promise.all(choices.map(({ role, payload }) => command(role, 'sendFleetGroupMessage', payload)));
      assert.deepEqual(replays, committed, 'Exact group-note retries preserve the committed results.');
      messages.push(...choices.map(({ role, payload }) => ({ roleId: role, requestId: payload.requestId })));
    }
    const pressPayload = { requestId: randomUUID(), text: 'PC10 automated overlapping-session rehearsal',
      expectedRevision: (await fixture.session.get()).get('pressDispatch')?.revision ?? 0 };
    const pressDispatch = await command('press-officer', 'publishPressDispatch', pressPayload);
    assert.equal(pressDispatch.status, 200, 'The independent Press audience can publish its own ordinary dispatch.');
    assert.deepEqual(await command('press-officer', 'publishPressDispatch', pressPayload), pressDispatch);
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
      isFreshPc10BrowserRole(state, role))));
    const after = await fixture.session.get();
    assert.equal(after.get('currentTurn'), before.get('currentTurn'), 'Reconnect must not advance the authoritative cycle.');
    const geometry = await Promise.all(roles.map(role => clients.get(role).geometry()));
    for (const metrics of geometry) assert.ok(metrics.document <= metrics.viewport && metrics.body <= metrics.viewport);
    const evidence = await completePc10BrowserProof(table, { afterOverlappingProof: options.afterOverlappingProof, details: {
      checks: { freshFullRosterViaOrdinaryUiConsent: true, independentBrowserContexts: 21,
        overlappingResumePresenceAndSeatRetries: true, exactSeatReplayStable: true,
        ordinaryActorGmMutationDenied: true, everyNonGmRoleOfflineReloadRecovery: true,
        overlappingOrdinaryGameplayNotesAndPress: true, exactGameplayReplayStable: true,
        everyBrowserPrivateRulesAndGmReadDenied: true,
        cyclePreserved: true, browserGeometryContained: true },
      privateAudience, messages, disconnectedObservations, recovered,
      limitations: ['This focused concurrency proof alone is not a complete game-through-ending proof.',
        'Actor/browser automation does not establish human-device attendance.',
        'Timer all-player disconnect/remaining-time pause requires its distinct controlled presence-expiry check.'],
    } });
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
    directory: process.env.PC10_EVIDENCE_DIRECTORY, expansion: process.env.PC10_EXPANSION ?? 'capybara',
    ...(process.env.PC10_NATURAL_DISCONNECT === '1' ? { afterOverlappingProof: table =>
      runPc10NaturalDisconnectAcceptance(table, {
        directory: join(process.env.PC10_EVIDENCE_DIRECTORY, 'natural-disconnect'), expectBrowserContexts: 21,
      }) } : {}),
  });
  console.log(JSON.stringify({ checks: evidence.checks, browserContexts: evidence.actualIndependentBrowserContexts,
    actions: evidence.actions.length, humanDevicePlaytest: false }));
}
