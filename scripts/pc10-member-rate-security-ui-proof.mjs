import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { captureLifecycleUiAction } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import {
  observeFullGameDemoPresentationMember, proofRuntimeFromViteSource, validateProofRuntime,
} from './pc10-full-game-demo-proof-helpers.mjs';
import { capturePc10Gate2SourceBinding } from './pc10-gate2-functional-proof.mjs';
import { retainProofFailure } from './pc10-proof-failure-evidence.mjs';
import {
  P631_MEMBER_READ_LIMIT,
  provePreparationRateLimit, proveCurrentMemberReadRateLimit,
  parseP631SecurityDenialRecords, assertP631RateDenialRecords,
  p631LoggerHash, runP631OwnedJourney,
} from './pc10-member-rate-security-ui-proof-core.mjs';

const RUNNER_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(process.env.PC10_SOURCE_ROOT ?? process.cwd());
const ROUTER_PATH = join(ROOT, 'scripts/pc10-security-http-proof.mjs');
const ROLE_ID = 'shepherd-scientist';
const EXPECTED_RUNTIME = Object.freeze({
  baseUrl: process.env.PC10_P631_BASE_URL ?? 'http://127.0.0.1:5174',
  projectId: process.env.PC10_P631_PROJECT_ID ?? 'demo-pc10-owner-integrated-2',
  ports: Object.freeze({
    auth: Number(process.env.PC10_P631_AUTH_PORT ?? 9109),
    functions: Number(process.env.PC10_P631_FUNCTIONS_PORT ?? 5011),
    firestore: Number(process.env.PC10_P631_FIRESTORE_PORT ?? 8090),
  }),
});
const PAGE_TIMEOUT_MS = 35_000;
const OPERATION_TIMEOUT_MS = 60_000;
const CLEANUP_RESERVE_MS = 60_000;
const MIN_BROWSER_START_REMAINING_MS = 120_000;
const hash = value => createHash('sha256').update(value).digest('hex');
const shortHash = value => hash(value).slice(0, 16);
const stable = value => value === null || typeof value !== 'object'
  ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(stable).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
const wire = value => value?.toDate instanceof Function ? value.toDate().toISOString()
  : Array.isArray(value) ? value.map(wire)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, wire(child)])) : value;
const normalizeCode = value => typeof value === 'string'
  ? value.replace(/^(?:functions|firestore)\//, '').toLowerCase().replaceAll('_', '-') : null;
const denialCodes = new Set(['unauthenticated', 'permission-denied', 'invalid-argument', 'resource-exhausted',
  'failed-precondition', 'not-found', 'aborted', 'unavailable', 'deadline-exceeded', 'internal']);
let activeRun;

function safeError(error) {
  const code = normalizeCode(error?.code);
  return { name: typeof error?.name === 'string' ? error.name.slice(0, 80) : 'Error',
    code: denialCodes.has(code) ? code : null,
    fingerprint: hash(`${String(error?.name ?? 'Error')}\0${String(error?.message ?? error)}\0${String(error?.stack ?? '')}`) };
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 5_000 }).trim();
}

async function shaFile(path) { return hash(await readFile(path)); }

async function requireAbsent(path, label) {
  try { await access(path); } catch { return; }
  throw new Error(`${label} must be a new exclusive path.`);
}

function requireAbsoluteEnvironmentPath(name) {
  const value = process.env[name];
  assert.ok(typeof value === 'string' && value.length > 0 && resolve(value) === value,
    `${name} must be an explicit absolute path.`);
  return value;
}

function assertRuntimeShape(runtime) {
  const url = new URL(runtime.baseUrl);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '5174');
  assert.equal(runtime.projectId, EXPECTED_RUNTIME.projectId);
  assert.deepEqual(runtime.ports, EXPECTED_RUNTIME.ports);
  assert.equal(runtime.ports.auth, 9109);
  assert.equal(runtime.ports.functions, 5011);
  assert.equal(runtime.ports.firestore, 8090);
}

async function verifySourceFreeze() {
  assertRuntimeShape(EXPECTED_RUNTIME);
  const evidenceDirectory = requireAbsoluteEnvironmentPath('PC10_P631_EVIDENCE_DIRECTORY');
  const preflightPath = requireAbsoluteEnvironmentPath('PC10_P631_LAUNCH_PREFLIGHT_PATH');
  const freezePath = requireAbsoluteEnvironmentPath('PC10_P631_SOURCE_FREEZE_PATH');
  const functionsLogPath = requireAbsoluteEnvironmentPath('PC10_P631_FUNCTIONS_LOG_PATH');
  const launcherPath = requireAbsoluteEnvironmentPath('PC10_P631_PINNED_LAUNCHER_PATH');
  const allocationDeadlineMs = Number(process.env.PC10_PARENT_ALLOCATION_DEADLINE_MS);
  assert.ok(Number.isSafeInteger(allocationDeadlineMs) && allocationDeadlineMs > Date.now(),
    'A fresh absolute parent runtime allocation is required before browser launch.');
  for (const path of [evidenceDirectory, preflightPath, freezePath, functionsLogPath, launcherPath]) {
    assert.equal(path.startsWith(ROOT + '/'), false, 'P631 artifacts and launcher metadata must remain outside the checkout.');
  }
  await requireAbsent(evidenceDirectory, 'P631 evidence directory');

  const suppliedSourceCommit = process.env.PC10_OWNER_SOURCE_COMMIT;
  assert.ok(suppliedSourceCommit, 'Bind this runner to the exact owner-supplied source commit.');
  const sourceCommit = git(['rev-parse', 'HEAD']);
  assert.equal(sourceCommit, suppliedSourceCommit);
  assert.equal(git(['status', '--porcelain']), '', 'Source must be frozen and clean before runtime.');
  const sourceTree = git(['rev-parse', 'HEAD^{tree}']);

  const preflightBytes = await readFile(preflightPath);
  const freezeBytes = await readFile(freezePath);
  const preflight = JSON.parse(preflightBytes.toString('utf8'));
  const freeze = JSON.parse(freezeBytes.toString('utf8'));
  const zeroScope = { sessions: 0, connectedPlayers: 0, connectedGmInstances: 0 };
  assert.equal(preflight.status, 'READY_FOR_P631_TWO_ACTOR');
  assert.equal(preflight.source?.sourceCommit, sourceCommit);
  assert.equal(preflight.source?.sourceTree, sourceTree);
  assert.deepEqual(preflight.runtime, EXPECTED_RUNTIME);
  assert.deepEqual(preflight.scope, zeroScope);
  assert.deepEqual(preflight.installedLauncher, { path: launcherPath, sha256: await shaFile(launcherPath) });

  assert.equal(freeze.status, 'FROZEN_BEFORE_EXECUTION');
  assert.equal(freeze.sourceCommit, sourceCommit);
  assert.equal(freeze.sourceTree, sourceTree);
  assert.deepEqual(freeze.runtime, EXPECTED_RUNTIME);
  assert.deepEqual(freeze.scope, zeroScope);
  assert.deepEqual(freeze.preflight, { path: preflightPath, sha256: hash(preflightBytes) });
  assert.deepEqual(freeze.installedLauncher, preflight.installedLauncher);
  assert.deepEqual(freeze.macAllocation, {
    status: 'EXPLICIT_PARENT_ALLOCATION_GRANTED', parentDeadlineEpochMs: allocationDeadlineMs,
  });
  assert.equal(freeze.review?.currentStatus, 'PASS_BOUNDED_SOURCE_ONLY');
  assert.equal(freeze.review?.sourceCommit, sourceCommit);
  assert.equal(freeze.runner?.path, relative(ROOT, RUNNER_PATH));
  assert.equal(freeze.runner?.sha256, hash(await readFile(RUNNER_PATH)));
  assert.equal(freeze.modeRouter?.path, relative(ROOT, ROUTER_PATH));
  assert.equal(freeze.modeRouter?.sha256, await shaFile(ROUTER_PATH));

  const build = freeze.compiledSourceBuild;
  assert.ok(build && build.exitCode === 0, 'A matched accepted Functions build is required.');
  assert.equal(build.compiledTreeSha256, preflight.source?.compiledTreeSha256);
  if (build.sourceCommit !== sourceCommit) assert.equal(build.functionsAndRulesSourceUnchanged, true);
  else assert.equal(build.sourceCommit, sourceCommit);

  const binding = await capturePc10Gate2SourceBinding(ROOT, relative(ROOT, RUNNER_PATH));
  assert.equal(binding.sourceCommit, sourceCommit);
  assert.equal(binding.trackedClean, true);
  for (const key of ['trackedTreeSha256', 'compiledTreeSha256', 'javascriptTreeSha256']) {
    assert.equal(binding[key], preflight.source?.[key], `Current ${key} must match the preflight. `);
    assert.equal(binding[key], freeze.sourceBinding?.[key], `Current ${key} must match the source freeze.`);
  }
  return { evidenceDirectory, functionsLogPath, allocationDeadlineMs, sourceCommit, sourceTree,
    binding, preflight, freeze };
}

async function bounded(operation, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded its original ${timeoutMs}ms budget.`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

function remainingUiMs(deadlineAt, label, maximumMs = PAGE_TIMEOUT_MS) {
  const remaining = Math.min(maximumMs, deadlineAt - Date.now());
  assert.ok(Number.isFinite(remaining) && remaining > 0,
    `${label} exceeded its original shared UI deadline.`);
  return remaining;
}

async function boundedUiAction(deadlineAt, label, action, maximumMs = PAGE_TIMEOUT_MS) {
  const timeout = remainingUiMs(deadlineAt, label, maximumMs);
  return bounded(() => action(timeout), timeout, label);
}

async function observeP631UiReceipt({ surface, endpoint, deadlineAt, timeoutMs, consumed, matches, choose, label }) {
  const operationLabel = label ?? `Original ${endpoint} UI receipt`;
  const deadline = deadlineAt ?? Date.now() + timeoutMs;
  const remaining = (maximumMs = PAGE_TIMEOUT_MS) => remainingUiMs(deadline, operationLabel, maximumMs);
  activeRun.budget.assertBefore(remaining(timeoutMs));
  const observation = observeUiReceipt({ page: surface.page,
    consumed: { ...consumed, endpoint, deadlineAt: deadline, originalTimeoutMs: timeoutMs },
    waitForResponse: () => surface.page.waitForResponse(response => matches(response),
      { timeout: remaining(timeoutMs) }),
    choose: () => bounded(() => choose({ deadlineAt: deadline, remaining }), remaining(),
      `${operationLabel} UI choices`),
  });
  return bounded(() => observation, remaining(timeoutMs), operationLabel);
}

function makeBudget(allocationDeadlineMs) {
  const workDeadlineMs = allocationDeadlineMs - CLEANUP_RESERVE_MS;
  const assertBefore = (maximumMs = OPERATION_TIMEOUT_MS) => {
    assert.ok(Date.now() + maximumMs <= workDeadlineMs,
      'Stop before beginning work that cannot preserve the original 60-second cleanup reserve.');
  };
  const remaining = () => Math.max(0, workDeadlineMs - Date.now());
  return { workDeadlineMs, assertBefore, remaining };
}

function proofLabelStage(stage, evidence, directory) {
  return async () => {
    evidence.stage = stage;
    evidence.stageAt = new Date().toISOString();
    await writeFile(join(directory, 'progress.json'), JSON.stringify({
      sourceCommit: evidence.sourceCommit, stage, stageAt: evidence.stageAt,
    }, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ stage, sourceCommit: evidence.sourceCommit }));
  };
}

function initializeAdmin(root, projectId, ports) {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${ports.auth}`;
  const adminRequire = createRequire(join(root, 'functions/package.json'));
  const { getApps, initializeApp } = adminRequire('firebase-admin/app');
  const { getFirestore } = adminRequire('firebase-admin/firestore');
  const { getAuth } = adminRequire('firebase-admin/auth');
  assert.equal(getApps().length, 0, 'This proof owns a fresh Admin app instance.');
  const app = initializeApp({ projectId });
  return { app, db: getFirestore(app), getAuth: () => getAuth(app), adminRequire };
}

async function assertEmptyOwnedRuntime(db) {
  const [sessions, players, gmInstances] = await Promise.all([
    db.collection('sessions').get(),
    db.collectionGroup('players').where('connected', '==', true).get(),
    db.collectionGroup('gmInstances').where('connected', '==', true).get(),
  ]);
  const scope = { sessions: sessions.size, connectedPlayers: players.size, connectedGmInstances: gmInstances.size };
  assert.deepEqual(scope, { sessions: 0, connectedPlayers: 0, connectedGmInstances: 0 },
    'P631 starts only from the owner-supplied empty loopback data scope.');
  return scope;
}

function summarizeCallable(name, reply) {
  if (reply?.status === 'committed') return { endpoint: name, status: 'committed', httpStatus: 200 };
  return { endpoint: name, status: normalizeCode(reply?.code) ?? 'other', httpStatus: null,
    retryAfterSeconds: Number.isSafeInteger(reply?.details?.retryAfterSeconds) ? reply.details.retryAfterSeconds : null };
}

export async function runP631MemberRateSecurityUiProof() {
  const startedAt = Date.now();
  let gate, admin, db, getAuth, budget, primaryFailure, failureStage = 'source-freeze', result;
  const browsers = [], surfaces = [], actorUids = new Map(), requests = [], calls = [], pageErrors = [], remoteRequests = [];
  const owned = { sessionId: null, joinCode: null, originalRequest: null, instanceId: null };
  const evidence = {
    schemaVersion: 1,
    type: 'p631-two-actor-member-rate-security-ui-proof',
    status: 'incomplete',
    sourceCommit: process.env.PC10_OWNER_SOURCE_COMMIT ?? null,
    actualAuthenticatedActors: 0,
    actualHumanDevices: 0,
    browserProcesses: 0,
    browserContexts: 0,
    claims: [],
    requests, calls, pageErrors, remoteRequests,
    clockAcceleration: false,
    adminGameplayWrites: 0,
    productRepair: false,
    closureCredit: 0,
  };
  assert.equal(activeRun, undefined, 'A single isolated P631 runner may own this Node process.');
  activeRun = { browsers, surfaces, actorUids, requests, calls, pageErrors, remoteRequests,
    owned, evidence, startedAt, gate: null, budget: null, db: null };

  const cleanup = async originalError => {
    const errors = [];
    let closedBrowsers = 0, deletedAuthActors = 0;
    let ownedJoinCodeRemoved = owned.sessionId === null, ownedSessionRemoved = owned.sessionId === null;
    const deadline = gate?.allocationDeadlineMs ?? Date.now() + CLEANUP_RESERVE_MS;
    const cleanupStep = async (label, operation) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { errors.push({ label, status: 'cleanup-deadline-expired' }); return null; }
      try { return await bounded(operation, Math.min(remaining, 15_000), `Owned cleanup ${label}`); }
      catch (error) { errors.push({ label, error: safeError(error) }); return null; }
    };
    for (const browser of browsers) await cleanupStep('close owned Chrome process', async () => {
      await browser.close();
      if (typeof browser.isConnected === 'function') assert.equal(browser.isConnected(), false);
      closedBrowsers++;
    });
    if (db && owned.sessionId) {
      await cleanupStep('remove exact owned join-code pointer', async () => {
        const pointers = await db.collection('joinCodes').where('sessionId', '==', owned.sessionId).get();
        assert.ok(pointers.size <= 1, 'Refuse cleanup if the owned session has multiple join pointers.');
        if (owned.joinCode) assert.ok(pointers.docs.every(doc => doc.id === owned.joinCode),
          'Refuse to delete a join pointer that does not match the original createSession receipt.');
        for (const pointer of pointers.docs) {
          assert.equal(pointer.get('sessionId'), owned.sessionId, 'Refuse to delete another session join pointer.');
          await pointer.ref.delete();
          assert.equal((await pointer.ref.get()).exists, false);
        }
        const remaining = await db.collection('joinCodes').where('sessionId', '==', owned.sessionId).get();
        assert.equal(remaining.size, 0);
        ownedJoinCodeRemoved = true;
      });
      await cleanupStep('delete exact owned session tree', async () => {
        const ref = db.doc(`sessions/${owned.sessionId}`), snapshot = await ref.get();
        if (snapshot.exists) await db.recursiveDelete(ref);
        assert.equal((await ref.get()).exists, false);
        ownedSessionRemoved = true;
      });
      await cleanupStep('remove only verified owned membership pointers', async () => {
        const pointers = await db.collection('activeMemberships').where('sessionId', '==', owned.sessionId).get();
        const known = new Set(actorUids.values());
        assert.ok(pointers.docs.every(doc => known.has(doc.id)) && pointers.size <= 2,
          'Refuse to delete a membership pointer for any unknown actor.');
        await db.runTransaction(async transaction => {
          const current = await Promise.all(pointers.docs.map(doc => transaction.get(doc.ref)));
          assert.ok(current.every(doc => doc.exists && doc.get('sessionId') === owned.sessionId));
          for (const doc of current) transaction.delete(doc.ref);
        });
        const remaining = await db.collection('activeMemberships').where('sessionId', '==', owned.sessionId).get();
        assert.equal(remaining.size, 0);
      });
    }
    if (getAuth) for (const uid of actorUids.values()) await cleanupStep('delete fresh owned Auth identity', async () => {
      const user = await getAuth().getUser(uid);
      const createdAt = Date.parse(user.metadata.creationTime);
      assert.ok(createdAt >= startedAt && createdAt <= Date.now(), 'Refuse to delete an identity not created by this run.');
      await getAuth().deleteUser(uid);
      deletedAuthActors++;
    });
    if (db) await cleanupStep('verify final empty owned scope', () => assertEmptyOwnedRuntime(db));
    if (db) await cleanupStep('terminate owned Admin client', () => db.terminate());
    evidence.cleanup = { closedBrowsers, deletedAuthActors, ownedJoinCodeRemoved,
      ownedSessionRemoved, errors };
    if (errors.length) evidence.status = 'cleanup-incomplete';
    if (originalError) evidence.primaryFailure = safeError(originalError);
    return errors;
  };
  activeRun.cleanup = cleanup;

  const retainPrimaryFailure = async error => {
    evidence.primaryFailure = safeError(error);
    evidence.primaryFailureStage = failureStage;
    if (!gate?.evidenceDirectory) return;
    const retained = await retainProofFailure(gate.evidenceDirectory, 'p631-primary', error, {
      failureStage, sourceCommit: gate.sourceCommit,
      lastReadinessTuple: activeRun.lastReadinessTuple ?? null,
      ...(error?.p631CleanupError ? { cleanupError: safeError(error.p631CleanupError) } : {}),
      cleanup: evidence.cleanup ?? null,
    });
    evidence.primaryFailureArtifact = { path: retained.path, retained: !retained.evidenceWriteFailed };
  };

  try {
    gate = await verifySourceFreeze();
    activeRun.gate = gate;
    evidence.sourceCommit = gate.sourceCommit;
    evidence.sourceTree = gate.sourceTree;
    evidence.sourceBinding = {
      trackedTreeSha256: gate.binding.trackedTreeSha256,
      compiledTreeSha256: gate.binding.compiledTreeSha256,
      javascriptTreeSha256: gate.binding.javascriptTreeSha256,
    };
    evidence.runtime = EXPECTED_RUNTIME;
    budget = makeBudget(gate.allocationDeadlineMs);
    activeRun.budget = budget;
    await mkdir(gate.evidenceDirectory, { recursive: false, mode: 0o700 });
    admin = initializeAdmin(ROOT, EXPECTED_RUNTIME.projectId, EXPECTED_RUNTIME.ports);
    db = admin.db; getAuth = admin.getAuth;
    activeRun.db = db;
    const { callableRateLimitDocumentId } = admin.adminRequire(join(ROOT, 'functions/lib/callableRateLimit.js'));
    activeRun.adminRateLimit = { callableRateLimitDocumentId };
    evidence.preflightScope = await bounded(() => assertEmptyOwnedRuntime(db), 15_000, 'Empty owned runtime scope');
    const configSource = await bounded(async () => {
      const response = await fetch(`${EXPECTED_RUNTIME.baseUrl}/src/lib/firebaseConfig.ts`, { signal: AbortSignal.timeout(15_000) });
      assert.equal(response.status, 200);
      return response.text();
    }, 15_000, 'Mounted Vite Firebase configuration read');
    evidence.liveRuntime = validateProofRuntime(proofRuntimeFromViteSource(configSource), EXPECTED_RUNTIME);
    assert.ok(Date.now() + MIN_BROWSER_START_REMAINING_MS <= gate.allocationDeadlineMs,
      'At least 120 seconds of the explicit parent allocation must remain before browser launch.');
    budget.assertBefore(60_000);
  } catch (error) {
    primaryFailure = error;
    failureStage = 'source-preflight';
    await retainPrimaryFailure(error);
  }

  if (!primaryFailure) {
    try {
      result = await runP631OwnedJourney({
        prepareGmAndOriginal: async () => {
          failureStage = 'normal GM create, consent, local authorization and original prepare';
          await proofLabelStage('launch normal GM Chrome process', evidence, gate.evidenceDirectory)();
          const gm = await createSurface('browser-A-normal-GM');
          const gmAdmissionDeadlineAt = Date.now() + OPERATION_TIMEOUT_MS;
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          const initialUrl = EXPECTED_RUNTIME.baseUrl;
          await boundedUiAction(gmAdmissionDeadlineAt, 'Normal GM page navigation', timeout =>
            gm.page.goto(initialUrl, { timeout }));
          await gm.reducedMotion(gmAdmissionDeadlineAt);
          const created = await observeP631UiReceipt({ surface: gm, endpoint: 'createSession',
            deadlineAt: gmAdmissionDeadlineAt, timeoutMs: PAGE_TIMEOUT_MS,
            label: 'Normal GM create and identity receipt',
            consumed: { stage: evidence.stage, ordinaryAdmission: true },
            matches: response => new URL(response.url()).pathname.endsWith('/us-central1/createSession') &&
              response.request().method() === 'POST',
            choose: async ({ deadlineAt, remaining }) => {
              await gm.page.getByRole('button', { name: 'Create a session', exact: true })
                .click({ timeout: remaining() });
              await registerActor(gm, 'GM', { deadlineAt });
            },
          });
          assert.equal(created.status(), 200);
          const body = await bounded(() => created.json(),
            remainingUiMs(gmAdmissionDeadlineAt, 'Normal GM create response body', OPERATION_TIMEOUT_MS),
            'Normal GM create response body');
          owned.sessionId = body.result?.session?.id;
          owned.joinCode = body.result?.session?.joinCode;
          assert.match(owned.sessionId ?? '', /^[\w-]{1,128}$/);
          assert.match(owned.joinCode ?? '', /^[\w-]{4,16}$/);
          failureStage = 'normal GM regulation consent';
          await gm.consent({ deadlineAt: gmAdmissionDeadlineAt });
          failureStage = 'normal GM admitted App/store authority';
          let live = await gm.until('Original normally admitted fresh GM', state => state.hasAuth && state.sameActor &&
            state.uidHash === shortHash(actorUids.get('GM')) && state.sessionId === owned.sessionId &&
            state.meSessionId === owned.sessionId && state.profileRoleId === null && state.profileSessionId === null &&
            state.invalidFields?.length === 0 && state.playerRole === 'player' && state.connected === true &&
            state.currentOwnPlayerConfirmed === true && state.connectionGeneration >= 1 &&
            state.connection === 'live' && state.freshness === 'server' && state.sdkHasServerAuthority === true &&
            state.sdkResumePending === false && state.kicked === false && state.escapeLocked === false &&
            state.replacementRoleId === null && state.replacementStatus === null && state.assignedRoleId === null &&
            state.activeConsoleRoleId === null && state.seatId === null && state.currentCanonicalSeatOwned === false &&
            state.instanceId === null && state.gmInstanceOwned === false,
          { deadlineAt: gmAdmissionDeadlineAt });
          failureStage = 'normal local GM authorization';
          await proofLabelStage('normal local GM authorization', evidence, gate.evidenceDirectory)();
          const normalPlayerAtAdmission = live;
          const authorizationDeadlineAt = Date.now() + OPERATION_TIMEOUT_MS;
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          await boundedUiAction(authorizationDeadlineAt, 'Open session settings', timeout =>
            gm.page.getByRole('button', { name: 'Settings', exact: true }).click({ timeout }));
          const settings = gm.page.getByRole('dialog', { name: 'Session settings', exact: true });
          await boundedUiAction(authorizationDeadlineAt, 'Wait for session settings', timeout =>
            settings.waitFor({ state: 'visible', timeout }));
          const authorize = settings.getByRole('button', { name: 'Authorize local emulator GM', exact: true });
          await boundedUiAction(authorizationDeadlineAt, 'Wait for local GM authorization control', timeout =>
            authorize.waitFor({ state: 'visible', timeout }));
          const origin = new URL(gm.page.url()).origin;
          const authorization = await observeP631UiReceipt({ surface: gm, endpoint: 'local GM authorization',
            deadlineAt: authorizationDeadlineAt, timeoutMs: OPERATION_TIMEOUT_MS,
            label: 'Normal local GM authorization receipt',
            consumed: { stage: evidence.stage, credentialPayloadRecorded: false },
            matches: response =>
              new URL(response.url()).origin === origin && new URL(response.url()).pathname === '/__local-gm-access' &&
              response.request().method() === 'POST',
            choose: ({ remaining }) => authorize.click({ timeout: remaining() }),
          });
          assert.equal(authorization.status(), 200);
          const authorizationBody = await bounded(() => authorization.json(),
            remainingUiMs(authorizationDeadlineAt, 'Local GM authorization response body', OPERATION_TIMEOUT_MS),
            'Local GM authorization response body');
          assert.equal(authorizationBody.authenticated, true);
          await boundedUiAction(authorizationDeadlineAt, 'Wait for local GM authorization state', timeout =>
            settings.getByRole('button', { name: 'Revoke GM access', exact: true }).waitFor({ timeout }));
          await boundedUiAction(authorizationDeadlineAt, 'Close session settings', timeout =>
            settings.getByRole('button', { name: 'Close settings', exact: true }).click({ timeout }));
          live = await gm.until('Original connected player after local GM authorization', state =>
            state.hasAuth && state.sameActor && state.uidHash === shortHash(actorUids.get('GM')) &&
            state.sessionId === owned.sessionId && state.meSessionId === owned.sessionId &&
            state.profileRoleId === null && state.profileSessionId === null && state.playerRole === 'player' &&
            state.connected === true && state.currentOwnPlayerConfirmed === true &&
            state.connectionGeneration === live.connectionGeneration && state.connection === 'live' &&
            state.freshness === 'server' && state.sdkHasServerAuthority === true && state.sdkResumePending === false &&
            state.kicked === false && state.instanceId === null && state.gmInstanceOwned === false,
          { deadlineAt: authorizationDeadlineAt });
          for (const key of ['uidHash', 'sessionId', 'meSessionId', 'playerRole', 'connectionGeneration']) {
            assert.equal(live[key], normalPlayerAtAdmission[key],
              `Local GM authorization must preserve the original connected player ${key}.`);
          }
          failureStage = 'normal live GM claim';
          const gmJoinDeadlineAt = Date.now() + OPERATION_TIMEOUT_MS;
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          await boundedUiAction(gmJoinDeadlineAt, 'Open GM join form', timeout =>
            gm.page.getByRole('link', { name: /GM join$/i }).click({ timeout }));
          await boundedUiAction(gmJoinDeadlineAt, 'Fill GM display name', timeout =>
            gm.page.getByLabel('Input GM Name', { exact: true }).fill('P631 rate-limit facilitator', { timeout }));
          const claimed = await action(gm, 'claimGmInstance', remaining =>
            gm.page.getByRole('button', { name: 'Join as GM', exact: true }).click({ timeout: remaining() }),
          { deadlineAt: gmJoinDeadlineAt });
          const claimedInstanceId = claimed.data.instanceId;
          assert.match(claimedInstanceId ?? '', /^[\w-]{1,128}$/);
          assert.equal(claimed.result.instance.id, claimedInstanceId);
          live = await gm.until('Original live GM authority', state => state.hasAuth && state.sameActor &&
            state.uidHash === shortHash(actorUids.get('GM')) && state.sessionId === owned.sessionId &&
            state.meSessionId === owned.sessionId && state.playerRole === 'gm' && state.connected === true &&
            state.currentOwnPlayerConfirmed === true && state.kicked === false && state.connectionGeneration >= 1 &&
            state.gmInstanceOwned && state.instanceId === claimedInstanceId &&
            state.connection === 'live' && state.freshness === 'server' &&
            state.sdkHasServerAuthority === true && state.sdkResumePending === false &&
            state.invalidFields?.length === 0 && state.profileRoleId === null && state.profileSessionId === null,
          { deadlineAt: gmJoinDeadlineAt });
          const claimedGeneration = live.connectionGeneration;
          owned.instanceId = claimedInstanceId;
          assert.match(owned.instanceId ?? '', /^[\w-]{1,128}$/);

          failureStage = 'legal roster configuration and setup';
          await proofLabelStage('legal roster configuration and setup', evidence, gate.evidenceDirectory)();
          const setupDeadlineAt = Date.now() + OPERATION_TIMEOUT_MS;
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          const setup = gm.page.getByRole('region', { name: 'Setup', exact: true });
          const setupVisible = await boundedUiAction(setupDeadlineAt, 'Check setup region', () => setup.isVisible());
          if (!setupVisible) {
            await boundedUiAction(setupDeadlineAt, 'Open station catalog', timeout =>
              gm.page.getByRole('button', { name: /^Open station catalog/ }).click({ timeout }));
            await boundedUiAction(setupDeadlineAt, 'Open GM console', timeout =>
              gm.page.getByRole('link', { name: 'GM Console', exact: true }).click({ timeout }));
          }
          await boundedUiAction(setupDeadlineAt, 'Open roster setup', timeout =>
            setup.getByRole('button', { name: 'Setup', exact: true }).click({ timeout }));
          await boundedUiAction(setupDeadlineAt, 'Select recommended player count', timeout =>
            setup.getByLabel('Recommended player count', { exact: true }).selectOption('16', { timeout }));
          await boundedUiAction(setupDeadlineAt, 'Select star chart', timeout =>
            setup.getByLabel('Star chart', { exact: true }).selectOption('A', { timeout }));
          const confirmed = await action(gm, 'confirmSetup', remaining =>
            setup.getByRole('button', { name: 'Confirm setup // Confirm roster', exact: true }).click({ timeout: remaining() }),
          { gm: true, deadlineAt: setupDeadlineAt });
          assert.equal(confirmed.result.status, 'committed');
          const setupState = await gm.until('Original legal Cycle 0 roster', state => state.hasAuth && state.sameActor &&
            state.setupConfirmed &&
            state.uidHash === shortHash(actorUids.get('GM')) && state.sessionId === owned.sessionId &&
            state.meSessionId === owned.sessionId && state.playerRole === 'gm' && state.connected === true &&
            state.currentOwnPlayerConfirmed === true && state.kicked === false &&
            state.connectionGeneration === claimedGeneration && state.cycle === 0 &&
            (state.phase === 'lobby' || state.phase === 'casting') &&
            state.gmInstanceOwned && state.instanceId === owned.instanceId &&
            state.connection === 'live' && state.freshness === 'server' && state.sdkHasServerAuthority === true &&
            state.sdkResumePending === false && state.profileRoleId === null && state.profileSessionId === null &&
            state.invalidFields?.length === 0 && state.fullGameDemo === null,
          { deadlineAt: setupDeadlineAt });
          assert.equal(setupState.playerRole, 'gm');

          failureStage = 'original UI preparation before ordinary join';
          await proofLabelStage('original UI preparation before ordinary join', evidence, gate.evidenceDirectory)();
          const training = gm.page.locator('fieldset[aria-label="Full-game demo preparation"]');
          const preparationDeadlineAt = Date.now() + OPERATION_TIMEOUT_MS;
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          const original = await action(gm, 'prepareFullGameDemo', async remaining => {
            await training.getByRole('button', { name: 'Prepare full-game demo', exact: true })
              .click({ timeout: remaining() });
            await training.getByRole('button', { name: 'ARE YOU SURE? // PREPARE FULL-GAME DEMO', exact: true })
              .click({ timeout: remaining() });
          }, { gm: true, deadlineAt: preparationDeadlineAt,
            matches: data => data?.sessionId === owned.sessionId && data?.instanceId === owned.instanceId });
          assert.equal(original.httpStatus, 200);
          assert.equal(original.result.status, 'committed');
          assert.deepEqual(original.result.fullGameDemo, { status: 'preparing', progression: 'manual' });
          const prepared = await gm.until('Original manual Cycle 0 preparation', state => state.hasAuth && state.sameActor &&
            state.cycle === 0 &&
            state.uidHash === shortHash(actorUids.get('GM')) && state.sessionId === owned.sessionId &&
            state.meSessionId === owned.sessionId && state.playerRole === 'gm' && state.connected === true &&
            state.currentOwnPlayerConfirmed === true && state.kicked === false &&
            state.connectionGeneration === claimedGeneration && state.phase === setupState.phase &&
            state.gmInstanceOwned && state.instanceId === owned.instanceId && state.connection === 'live' &&
            state.freshness === 'server' && state.fullGameDemo?.status === 'preparing' &&
            state.fullGameDemo?.progression === 'manual' && state.sdkHasServerAuthority === true &&
            state.sdkResumePending === false && state.invalidFields?.length === 0,
          { deadlineAt: preparationDeadlineAt });
          assert.equal(prepared.setupConfirmed, true);
          owned.originalRequest = original;
          evidence.claims.push('Normal GM create and consent, local UI authorization, live App/store/SDK authority, legal Cycle 0 setup, original preparation receipt before member join.');
          evidence.originalPreparationRequestHash = hash(original.data.requestId);
          evidence.originalPreparationResultHash = hash(stable(wire(original.result)));
          return { gm, sessionId: owned.sessionId, instanceId: owned.instanceId, original,
            actorUid: actorUids.get('GM'), training, adminRateLimit: activeRun.adminRateLimit };
        },
        saturatePreparation: async gmContext => {
          failureStage = 'six distinct GM prepares, seventh denial and exact original replay';
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          const identity = { callableName: 'prepareFullGameDemo', sessionId: gmContext.sessionId, uid: gmContext.actorUid };
          const { callableRateLimitDocumentId } = gmContext.adminRateLimit;
          const markerRef = db.doc(`sessions/${gmContext.sessionId}/serverState/callableRateLimit-${callableRateLimitDocumentId(identity)}`);
          const readMarker = async () => readRateMarker(markerRef, identity);
          const requestIdFactory = () => randomUUID();
          const readOriginalReceipt = async () => {
            const snapshot = await db.doc(`sessions/${gmContext.sessionId}/commandReceipts/${gmContext.original.data.requestId}`).get();
            return { exists: snapshot.exists, updateTimeMs: snapshot.updateTime?.toMillis() ?? null,
              valueHash: snapshot.exists ? hash(stable(wire(snapshot.data()))) : null };
          };
          const readEffect = async () => {
            const snapshot = await db.doc(`sessions/${gmContext.sessionId}`).get();
            assert.equal(snapshot.exists, true);
            const data = snapshot.data();
            return { updateTimeMs: snapshot.updateTime?.toMillis() ?? null,
              setupRevision: data.setupRevision,
              fullGameDemo: data.fullGameDemo,
              originalReceipt: await readOriginalReceipt() };
          };
          const proof = await bounded(() => provePreparationRateLimit({ gm: gmContext.gm,
            original: gmContext.original, readMarker, readEffect, readOriginalReceipt,
            makeRequestId: requestIdFactory }), OPERATION_TIMEOUT_MS, 'Original GM preparation budget and exact replay');
          gmContext.preparation = proof;
          gmContext.prepareMarkerRef = markerRef;
          gmContext.preparationIdentity = identity;
          evidence.claims.push('Six distinct original live-GM SDK preparation requests exhaust its 6/min session/UID bucket; the next fresh request is rate-denied and the captured UI receipt replays without charge or effect.');
          return proof;
        },
        admitMember: async gmContext => {
          failureStage = 'normal ordinary member join and consent';
          await proofLabelStage('normal ordinary member join after preparation replay', evidence, gate.evidenceDirectory)();
          const member = await createSurface('browser-B-normal-member');
          const memberAdmissionDeadlineAt = Date.now() + OPERATION_TIMEOUT_MS;
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          await boundedUiAction(memberAdmissionDeadlineAt, 'Normal member page navigation', timeout =>
            member.page.goto(EXPECTED_RUNTIME.baseUrl, { timeout }));
          await member.reducedMotion(memberAdmissionDeadlineAt);
          await boundedUiAction(memberAdmissionDeadlineAt, 'Fill normal member session code', timeout =>
            member.page.getByRole('textbox', { name: 'Session code', exact: true }).fill(owned.joinCode, { timeout }));
          const joined = await observeP631UiReceipt({ surface: member, endpoint: 'joinSession',
            deadlineAt: memberAdmissionDeadlineAt, timeoutMs: PAGE_TIMEOUT_MS,
            label: 'Normal member join and identity receipt',
            consumed: { stage: evidence.stage, ordinaryOrigin: EXPECTED_RUNTIME.baseUrl },
            matches: response => new URL(response.url()).pathname.endsWith('/us-central1/joinSession') &&
              response.request().method() === 'POST',
            choose: async ({ deadlineAt, remaining }) => {
              await member.page.getByRole('button', { name: 'Join a session', exact: true })
                .click({ timeout: remaining() });
              await registerActor(member, 'Member', { deadlineAt });
            },
          });
          assert.equal(joined.status(), 200);
          failureStage = 'normal ordinary member consent';
          await member.consent({ deadlineAt: memberAdmissionDeadlineAt });
          failureStage = 'normal ordinary member App/store admission';
          const admitted = await member.until('Original normal member join and current SDK authority', state =>
            state.hasAuth && state.sameActor && state.uidHash === shortHash(actorUids.get('Member')) &&
            state.sessionId === gmContext.sessionId && state.meSessionId === gmContext.sessionId &&
            state.playerRole === 'player' && state.connected === true && state.currentOwnPlayerConfirmed === true &&
            state.connectionGeneration >= 1 && state.connection === 'live' && state.freshness === 'server' &&
            state.sdkHasServerAuthority === true && state.sdkResumePending === false &&
            state.profileRoleId === null && state.profileSessionId === null && state.invalidFields?.length === 0 &&
            state.kicked === false && state.escapeLocked === false && state.replacementRoleId === null &&
            state.replacementStatus === null && state.assignedRoleId === null && state.activeConsoleRoleId === null &&
            state.seatId === null && state.currentCanonicalSeatOwned === false && state.instanceId === null &&
            state.gmInstanceOwned === false,
          { deadlineAt: memberAdmissionDeadlineAt });
          assert.notEqual(actorUids.get('Member'), gmContext.actorUid);
          assert.equal(admitted.playerRole, 'player');
          evidence.claims.push('A second original Auth identity joins through normal UI consent and current-member hydration on the same loopback network; no role-seat action is needed for this reader proof.');
          return { member, actorUid: actorUids.get('Member'), gm: gmContext.gm,
            sessionId: gmContext.sessionId, preparationIdentity: gmContext.preparationIdentity,
            prepareMarkerRef: gmContext.prepareMarkerRef, adminRateLimit: gmContext.adminRateLimit };
        },
        saturateMemberReads: async (_gmContext, memberContext) => {
          failureStage = 'ordinary current-member SDK read exhaustion and same-network GM read';
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          const memberIdentity = { callableName: 'getCurrentMemberSession', sessionId: memberContext.sessionId, uid: memberContext.actorUid };
          const gmIdentity = { ...memberIdentity, uid: actorUids.get('GM') };
          const getMarkerRef = identity => {
            const id = memberContext.adminRateLimit.callableRateLimitDocumentId(identity);
            return db.doc(`sessions/${memberContext.sessionId}/serverState/callableRateLimit-${id}`);
          };
          const proof = await bounded(() => proveCurrentMemberReadRateLimit({
            member: memberContext.member, gm: memberContext.gm, sessionId: memberContext.sessionId,
            readMemberMarker: () => readRateMarker(getMarkerRef(memberIdentity), memberIdentity),
            readGmMarker: () => readRateMarker(getMarkerRef(gmIdentity), gmIdentity),
            maxAttempts: P631_MEMBER_READ_LIMIT + 10,
          }), OPERATION_TIMEOUT_MS, 'Original member current-session read window');
          memberContext.memberIdentity = memberIdentity;
          memberContext.gmIdentity = gmIdentity;
          memberContext.readProof = proof;
          evidence.claims.push('The normal member SDK exhausts its actual 120/min marker with retryAfterSeconds while the other original same-network live GM still reads the same session under a distinct UID marker.');
          return proof;
        },
        verifyPrivateMarkerDenials: async (gmContext, memberContext) => {
          failureStage = 'private serverState marker document and query SDK denials';
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          const markerPaths = [gmContext.prepareMarkerRef.path,
            `sessions/${gmContext.sessionId}/serverState/callableRateLimit-${memberContext.memberIdentity &&
              memberContext.adminRateLimit.callableRateLimitDocumentId(memberContext.memberIdentity)}`];
          const results = [];
          for (const [surface, actor] of [[memberContext.gm, 'GM'], [memberContext.member, 'Member']]) {
            const attempts = await surface.privateMarkerReads(markerPaths, `sessions/${gmContext.sessionId}/serverState`);
            assert.equal(attempts.documents.length, 2);
            assert.ok(attempts.documents.every(item => item.status === 'denied' && item.code === 'permission-denied'));
            assert.equal(attempts.query.status, 'denied');
            assert.equal(attempts.query.code, 'permission-denied');
            results.push({ actor, documentReads: attempts.documents.length, deniedDocumentReads: 2,
              deniedCollectionQuery: true, codes: ['permission-denied'] });
          }
          evidence.claims.push('Ordinary member and live GM Firebase SDK reads of both populated private budget documents and the serverState query are denied.');
          return results;
        },
        verifyRateDenialLogs: async (gmContext, memberContext) => {
          failureStage = 'bounded P631 rate-denial log parsing';
          budget.assertBefore(OPERATION_TIMEOUT_MS);
          const expected = [
            { callableName: 'prepareFullGameDemo', actorHash: p631LoggerHash('actor', gmContext.actorUid),
              sessionHash: p631LoggerHash('session', gmContext.sessionId),
              requestHash: gmContext.preparation.freshRequestLoggerHash },
            { callableName: 'getCurrentMemberSession', actorHash: p631LoggerHash('actor', memberContext.actorUid),
              sessionHash: p631LoggerHash('session', memberContext.sessionId) },
          ];
          const deadlineAt = Date.now() + OPERATION_TIMEOUT_MS;
          let summaries = [];
          while (Date.now() < deadlineAt) {
            const logText = await readFile(gate.functionsLogPath, 'utf8').catch(() => '');
            const records = parseP631SecurityDenialRecords(logText);
            try { summaries = assertP631RateDenialRecords(records, expected); break; }
            catch { await delay(200); }
          }
          assert.equal(summaries.length, expected.length,
            'The Functions launcher log must contain the two scoped category/callable/hash-only rate denials.');
          evidence.claims.push('The two observed rate denials have only the source allowlisted callable/category/hash fields; this does not claim PC634 closure.');
          return summaries;
        },
        cleanup: async originalError => {
          evidence.cleanupStage = 'owned-only browser/Auth/session cleanup';
          if (!originalError) failureStage = evidence.cleanupStage;
          await cleanup(originalError);
        },
      });
      assert.equal(actorUids.size, 2);
      assert.equal(browsers.length, 2);
      assert.equal(surfaces.length, 2);
      assert.deepEqual(remoteRequests, [], 'All application and SDK traffic must remain on the assigned loopback endpoints.');
      assert.deepEqual(pageErrors, []);
      evidence.status = 'P631_NARROW_TWO_ACTOR_SOURCE_RUNNER_COMPLETED';
      evidence.result = result;
      evidence.actualAuthenticatedActors = actorUids.size;
      evidence.browserProcesses = browsers.length;
      evidence.browserContexts = surfaces.length;
      evidence.sessionHash = owned.sessionId ? shortHash(owned.sessionId) : null;
      evidence.actorHashes = Object.fromEntries([...actorUids].map(([label, uid]) => [label, shortHash(uid)]));
      evidence.elapsedIncludingCleanupMs = Date.now() - startedAt;
      evidence.cleanupDeadlineMs = gate.allocationDeadlineMs;
      evidence.p631ClosureCredit = 0;
      evidence.p634ClosureCredit = 0;
      if (evidence.cleanup?.errors?.length || Date.now() > gate.allocationDeadlineMs) evidence.status = 'cleanup-incomplete';
    } catch (error) {
      primaryFailure = error;
      await retainPrimaryFailure(error);
    }
  }

  if (!gate || !evidence.cleanup) {
    if (!evidence.cleanup) {
      evidence.cleanupStage = 'owned-only browser/Auth/session cleanup';
      try { await cleanup(primaryFailure); }
      catch (error) { evidence.secondaryCleanupFailure = safeError(error); }
    }
  }
  if (evidence.status === 'incomplete') evidence.status = 'P631_SOURCE_PREFLIGHT_BLOCKED';
  evidence.failureStage = primaryFailure ? failureStage : null;
  evidence.actualAuthenticatedActors = actorUids.size;
  evidence.browserProcesses = browsers.length;
  evidence.browserContexts = surfaces.length;
  evidence.elapsedIncludingCleanupMs = Date.now() - startedAt;
  if (gate?.evidenceDirectory) {
    await writeFile(join(gate.evidenceDirectory, 'OWNER_RESULT.json'), JSON.stringify(evidence, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ status: evidence.status, sourceCommit: evidence.sourceCommit,
    elapsedMs: evidence.elapsedIncludingCleanupMs, actualAuthenticatedActors: evidence.actualAuthenticatedActors,
    browserProcesses: evidence.browserProcesses, browserContexts: evidence.browserContexts,
    cleanupErrors: evidence.cleanup?.errors?.length ?? 0, primaryFailure: evidence.primaryFailure ?? null }));
  if (primaryFailure || evidence.cleanup?.errors?.length || evidence.status !== 'P631_NARROW_TWO_ACTOR_SOURCE_RUNNER_COMPLETED') {
    process.exitCode = 1;
  }
}

async function createSurface(label) {
  const { browsers, surfaces, requests, calls, pageErrors, remoteRequests, owned, budget } = activeRun;
  if (browsers.length === 0) {
    assert.ok(Date.now() + MIN_BROWSER_START_REMAINING_MS <= activeRun.gate.allocationDeadlineMs,
      'At least 120 seconds of the explicit parent allocation must remain at the first Chrome launch.');
  }
  budget.assertBefore(PAGE_TIMEOUT_MS);
  const pendingBrowser = chromium.launch({ channel: 'chrome', headless: true });
  let browser;
  try { browser = await bounded(() => pendingBrowser, PAGE_TIMEOUT_MS, `${label} Chrome launch`); }
  catch (error) {
    void pendingBrowser.then(value => value.close()).catch(() => {});
    throw error;
  }
  browsers.push(browser);
  const context = await bounded(() => browser.newContext({ viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce', serviceWorkers: 'block' }), PAGE_TIMEOUT_MS, `${label} Chrome context`);
  const surfacePorts = [5174, EXPECTED_RUNTIME.ports.auth, EXPECTED_RUNTIME.ports.functions, EXPECTED_RUNTIME.ports.firestore].map(String);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (['127.0.0.1', 'localhost'].includes(url.hostname) && surfacePorts.includes(url.port)) return route.continue();
    remoteRequests.push(`${url.origin}${url.pathname}`);
    return route.abort();
  });
  const page = await bounded(() => context.newPage(), PAGE_TIMEOUT_MS, `${label} page creation`);
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);
  let storeUrl = '/src/store/useSessionStore.ts';
  let authorityUrl = null, functionsSdkUrl = null, firestoreSdkUrl = null;
  page.on('pageerror', error => pageErrors.push({ surface: label, ...safeError(error) }));
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) authorityUrl = null;
    if (url.pathname === '/src/lib/sessionSnapshotAuthority.ts' && authorityUrl === null) authorityUrl = url.href;
    if (url.pathname === '/src/store/useSessionStore.ts') storeUrl = url.href;
    if (url.pathname.endsWith('/firebase_functions.js') && functionsSdkUrl === null) functionsSdkUrl = url.href;
    if (url.pathname.endsWith('/firebase_firestore.js') && firestoreSdkUrl === null) firestoreSdkUrl = url.href;
    const endpoint = url.pathname.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
    if (endpoint && request.method() === 'POST') requests.push({ surface: label, endpoint,
      transport: 'mounted-App Firebase SDK', at: new Date().toISOString() });
  });
  page.on('response', response => {
    const endpoint = new URL(response.url()).pathname.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
    if (endpoint && response.request().method() === 'POST') calls.push({ surface: label, endpoint,
      httpStatus: response.status(), at: new Date().toISOString() });
  });
  const surface = { label, browser, context, page,
    storeModuleUrl: () => storeUrl,
    sessionAuthorityModuleUrl: () => authorityUrl,
    async reducedMotion(deadlineAt = Date.now() + PAGE_TIMEOUT_MS) {
      budget.assertBefore(remainingUiMs(deadlineAt, `${label} reduced-motion UI action`));
      const button = page.getByRole('button', { name: /^REDUCED MOTION/i });
      const visible = await boundedUiAction(deadlineAt, `${label} reduced-motion visibility`,
        () => button.isVisible().catch(() => false));
      if (visible) await boundedUiAction(deadlineAt, `${label} reduced-motion UI action`, timeout =>
        button.click({ timeout }));
    },
    async observe() {
      return observeFullGameDemoPresentationMember(surface, { knownRoleIds: [ROLE_ID, 'icebreaker-miner'] });
    },
    async until(description, predicate, { deadlineAt = Date.now() + OPERATION_TIMEOUT_MS } = {}) {
      budget.assertBefore(remainingUiMs(deadlineAt, `${description} readiness`, OPERATION_TIMEOUT_MS));
      let current;
      while (Date.now() < deadlineAt) {
        const remaining = remainingUiMs(deadlineAt, `${description} readiness`, PAGE_TIMEOUT_MS);
        current = await bounded(() => surface.observe(), remaining, `${description} SDK/store observation`);
        activeRun.lastReadinessTuple = { surface: label, description,
          observedAt: new Date().toISOString(), state: current };
        remainingUiMs(deadlineAt, `${description} readiness`, OPERATION_TIMEOUT_MS);
        if (current.hasAuth && surface.originalUid && current.uidHash !== shortHash(surface.originalUid)) {
          throw new Error(`${description}: original registered Auth UID changed during readiness.`);
        }
        if (current.hasAuth && current.sessionId !== null && current.sessionId !== owned.sessionId) {
          throw new Error(`${description}: an unexpected session identity was mounted.`);
        }
        if (current.hasAuth && current.meSessionId !== null && current.meSessionId !== owned.sessionId) {
          throw new Error(`${description}: an unexpected current-member identity was mounted.`);
        }
        if (description === 'Original normally admitted fresh GM' && current.hasAuth && current.instanceId !== null) {
          throw new Error(`${description}: a pre-existing GM instance appeared before the explicit local GM claim.`);
        }
        if (predicate(current)) return current;
        const waitMs = Math.min(200, deadlineAt - Date.now());
        if (waitMs > 0) await delay(waitMs);
      }
      throw new Error(`${description}: original shared UI deadline expired before mounted App/store/SDK authority became ready.`);
    },
    async consent({ deadlineAt = Date.now() + PAGE_TIMEOUT_MS } = {}) {
      const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
      const consentDeadlineAt = Math.min(deadlineAt, Date.now() + PAGE_TIMEOUT_MS);
      budget.assertBefore(consentDeadlineAt - Date.now());
      let visible = false;
      while (!visible) {
        visible = await boundedUiAction(consentDeadlineAt, `${label} regulation consent visibility`, () => waiver.isVisible());
        if (!visible) await delay(Math.min(100, remainingUiMs(consentDeadlineAt, `${label} regulation consent visibility`)));
      }
      assert.equal(visible, true, 'Normal UI admission must mount existing regulation consent.');
      const checks = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
      assert.equal(await boundedUiAction(consentDeadlineAt, `${label} regulation checkbox count`, () => checks.count()), 3);
      const checkboxes = await boundedUiAction(consentDeadlineAt, `${label} regulation checkbox list`, () => checks.all());
      for (const checkbox of checkboxes) {
        await boundedUiAction(consentDeadlineAt, `${label} regulation checkbox action`, timeout => checkbox.check({ timeout }));
      }
      const continueButton = waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
      let enabled = false;
      while (!enabled) {
        enabled = await boundedUiAction(consentDeadlineAt, `${label} regulation continue visibility`, () => continueButton.isEnabled());
        if (!enabled) await delay(Math.min(100, remainingUiMs(consentDeadlineAt, `${label} regulation continue visibility`)));
      }
      assert.equal(enabled, true);
      await boundedUiAction(consentDeadlineAt, `${label} regulation consent`, async timeout => {
        await continueButton.click({ timeout });
        await waiver.waitFor({ state: 'hidden', timeout: remainingUiMs(consentDeadlineAt,
          `${label} regulation consent hide`) });
      });
    },
    async callable(name, data) {
      assert.ok(functionsSdkUrl, 'Capture the mounted App Firebase Functions SDK before proof calls.');
      budget.assertBefore(PAGE_TIMEOUT_MS);
      const value = await bounded(() => page.evaluate(async ({ name, data, sdkUrl }) => {
        const { auth, functions } = await import('/src/lib/firebase.ts');
        const { httpsCallable } = await import(sdkUrl);
        const uid = auth().currentUser?.uid;
        try {
          const raw = (await httpsCallable(functions(), name)(data)).data;
          if (name === 'prepareFullGameDemo') return { status: 'committed', result: {
            status: raw.status, sessionMatches: raw.sessionId === data.sessionId,
            requestMatches: raw.requestId === data.requestId,
            expectedSetupRevision: raw.expectedSetupRevision, currentSetupRevision: raw.currentSetupRevision,
            fullGameDemo: raw.fullGameDemo,
          } };
          if (name === 'getCurrentMemberSession') return { status: 'committed', result: {
            type: raw.type, sessionMatches: raw.sessionId === data.sessionId,
            actorMatches: raw.actorUid === uid,
          } };
          return { status: 'committed', result: { status: raw.status ?? 'committed' } };
        } catch (error) {
          const code = typeof error.code === 'string' ? error.code : 'other';
          const commandError = ['rate-limited', 'rate-limit-state-invalid'].includes(error.details?.commandError)
            ? error.details.commandError : null;
          return { status: 'denied', code,
            details: { commandError,
              retryAfterSeconds: Number.isSafeInteger(error.details?.retryAfterSeconds) ? error.details.retryAfterSeconds : null } };
        }
      }, { name, data, sdkUrl: functionsSdkUrl }), PAGE_TIMEOUT_MS, `${label} original ${name} SDK call`);
      calls.push(summarizeCallable(name, value));
      return value;
    },
    async privateMarkerReads(markerPaths, collectionPath) {
      assert.ok(firestoreSdkUrl, 'Capture the mounted App Firebase Firestore SDK before marker read attempts.');
      budget.assertBefore(PAGE_TIMEOUT_MS);
      return bounded(() => page.evaluate(async ({ markerPaths, collectionPath, firestoreSdkUrl }) => {
        const { app } = await import('/src/lib/firebase.ts');
        const { getFirestore, doc, getDoc, collection, getDocs } = await import(firestoreSdkUrl);
        const database = getFirestore(app());
        const code = error => typeof error?.code === 'string'
          ? error.code.replace(/^firestore\//, '').replaceAll('_', '-') : 'other';
        const documents = [];
        for (const path of markerPaths) {
          try { await getDoc(doc(database, path)); documents.push({ status: 'allowed', code: null }); }
          catch (error) { documents.push({ status: 'denied', code: code(error) }); }
        }
        let queryResult;
        try { await getDocs(collection(database, collectionPath)); queryResult = { status: 'allowed', code: null }; }
        catch (error) { queryResult = { status: 'denied', code: code(error) }; }
        return { documents, query: queryResult };
      }, { markerPaths, collectionPath, firestoreSdkUrl }), PAGE_TIMEOUT_MS, `${label} private marker SDK reads`);
    },
  };
  surfaces.push(surface);
  return surface;
}

async function registerActor(surface, label, { deadlineAt = Date.now() + PAGE_TIMEOUT_MS } = {}) {
  activeRun.budget.assertBefore(remainingUiMs(deadlineAt, `${surface.label} original Auth identity observation`));
  let uid = null;
  while (!uid) {
    const remaining = remainingUiMs(deadlineAt, `${surface.label} original Auth identity observation`);
    uid = await bounded(() => surface.page.evaluate(async () => {
      const { auth } = await import('/src/lib/firebase.ts');
      return auth().currentUser?.uid ?? null;
    }), remaining, `${surface.label} original Auth identity observation`);
    if (!uid) await delay(Math.min(100, remainingUiMs(deadlineAt, `${surface.label} original Auth identity observation`)));
  }
  assert.ok(uid, 'Normal UI admission must create an Auth identity before its callable response is consumed.');
  assert.ok(![...activeRun.actorUids.values()].includes(uid), 'Each actor needs an independent original Auth identity.');
  surface.originalUid = uid;
  activeRun.actorUids.set(label, uid);
  activeRun.evidence.actualAuthenticatedActors = activeRun.actorUids.size;
  return uid;
}

async function action(surface, endpoint, choose, options = {}) {
  const { budget } = activeRun;
  const timeout = options.timeout ?? OPERATION_TIMEOUT_MS;
  const deadlineAt = options.deadlineAt ?? Date.now() + timeout;
  const remaining = (maximumMs = timeout) => remainingUiMs(deadlineAt, `${endpoint} UI action`, maximumMs);
  budget.assertBefore(remaining(timeout));
  const capture = captureLifecycleUiAction(surface, endpoint, async () => {
    budget.assertBefore(remaining(timeout));
    return bounded(() => choose(() => remaining(PAGE_TIMEOUT_MS)), remaining(), `${endpoint} UI choices`);
  }, { ...options, timeout, deadlineAt });
  return bounded(() => capture, remaining(), `${endpoint} original UI receipt`);
}

async function readRateMarker(reference, identity) {
  const snapshot = await reference.get();
  if (!snapshot.exists) return null;
  const marker = snapshot.data();
  assert.equal(marker.callableName, identity.callableName);
  assert.equal(marker.identityHash, hash(`${identity.sessionId}\0${identity.uid}`),
    'The authoritative marker must bind its original session and Auth UID.');
  return { type: marker.type, version: marker.version, callableName: marker.callableName,
    identityHash: marker.identityHash, windowStartedAtMs: marker.windowStartedAtMs,
    requestCount: marker.requestCount };
}
