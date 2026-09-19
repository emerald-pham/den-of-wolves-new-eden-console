#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { arch, cpus, platform, totalmem } from 'node:os';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(new URL('..', import.meta.url).pathname);
const projectId = 'dow-new-eden-console';
const arg = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const clientCount = Number(arg('clients', '60'));
const durationMs = Number(arg('duration-ms', '900000'));
const evidencePath = arg('evidence', process.env.P639_EVIDENCE_PATH ?? '/tmp/p639-browser-capacity.json');
const thresholds = JSON.parse(await readFile(resolve(root, 'config/capacity-60-browser-thresholds.json'), 'utf8'));
const firebaseConfig = JSON.parse(await readFile(resolve(root, 'firebase.local.json'), 'utf8'));
const ports = {
  auth: firebaseConfig.emulators.auth.port,
  functions: firebaseConfig.emulators.functions.port,
  firestore: firebaseConfig.emulators.firestore.port,
  firestoreWebsocket: firebaseConfig.emulators.firestore.websocketPort,
};
assert(Number.isSafeInteger(clientCount) && clientCount >= 20 && clientCount % 20 === 0,
  '--clients must be a multiple of 20 and at least 20.');
assert(Number.isSafeInteger(durationMs) && durationMs >= 30_000, '--duration-ms must be at least 30000.');
const tabsPerIdentity = clientCount / 20;
const closureRun = clientCount === thresholds.clientCount && durationMs === thresholds.durationMs;
const smokeRun = process.argv.includes('--smoke');
assert(closureRun || smokeRun, 'Non-closure parameters require the explicit --smoke flag.');
const apps = [];
const nodeCalls = [];
let browser;
let vite;
let stopGmLeaseRenewals;

function errorCode(error) {
  return String(error?.code ?? error?.message ?? error ?? 'unknown')
    .replace(/^functions\//, '')
    .slice(0, 120);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function stats(values) {
  return {
    count: values.length,
    min: Math.round((values.length === 0 ? 0 : Math.min(...values)) * 100) / 100,
    p50: Math.round(percentile(values, 0.5) * 100) / 100,
    p95: Math.round(percentile(values, 0.95) * 100) / 100,
    max: Math.round(Math.max(...values, 0) * 100) / 100,
  };
}

async function nodeClient(label) {
  const app = initializeApp({ apiKey: 'demo-api-key', projectId, appId: `p639-${label}-${randomUUID()}` }, `p639-${label}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
  await signInAnonymously(auth);
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', ports.functions);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', ports.firestore);
  return {
    uid: auth.currentUser.uid,
    firestore,
    async call(name, data) {
      const startedAt = performance.now();
      try {
        const result = (await httpsCallable(functions, name)(data)).data;
        nodeCalls.push({ name, label, outcome: result?.status === 'stale' ? 'contention' : 'success', durationMs: performance.now() - startedAt });
        return result;
      } catch (error) {
        nodeCalls.push({ name, label, outcome: errorCode(error), durationMs: performance.now() - startedAt });
        throw error;
      }
    },
  };
}

function scheduleGmLeaseRenewals(owner, gm2, sessionId, intervalMs, offsetMs) {
  let interval;
  let inFlight;
  const pulse = () => {
    if (inFlight) return;
    inFlight = owner.call('refreshPresence', { sessionId, instanceId: 'p639-bridge' })
      .then(() => gm2.call('refreshPresence', { sessionId, instanceId: 'p639-observer' }))
      .catch(() => undefined)
      .finally(() => { inFlight = undefined; });
  };
  const timeout = setTimeout(() => {
    pulse();
    interval = setInterval(pulse, intervalMs);
  }, offsetMs);
  return async () => {
    clearTimeout(timeout);
    clearInterval(interval);
    if (inFlight) await inFlight;
  };
}

async function browserPage(context, baseUrl, config) {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/scripts/fixtures/p639-browser-client.html`);
    await page.waitForFunction(() => window.p639Ready === true);
    const initialized = await page.evaluate((value) => window.p639.initialize(value), config);
    return { page, initialized, config };
  } catch (error) {
    await page.close().catch(() => undefined);
    throw error;
  }
}

async function reconnectBrowserPage(context, baseUrl, config) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return { client: await browserPage(context, baseUrl, config), attempts: attempt }; }
    catch (error) {
      lastError = error;
      if (attempt >= 3 || !/internal|unavailable/i.test(errorCode(error))) throw error;
      await delay(attempt * 100);
    }
  }
  throw lastError;
}

async function pageCall(client, name, data, source = 'browser') {
  return client.page.evaluate(([callName, callData, callSource]) => window.p639.call(callName, callData, callSource), [name, data, source]);
}

async function waitForRevision(clients, revision, startedAt, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const observed = await Promise.all(clients.map(({ page }) => page.evaluate(([target, after]) => {
      const event = window.p639.summary().sessionEvents.find((item) => item.at >= after && item.resourceRevision >= target);
      return event?.at;
    }, [revision, startedAt])));
    if (observed.every(Number.isFinite)) return observed.map((at) => at - startedAt);
    await delay(100);
  }
  throw new Error(`Timed out waiting for revision ${revision} on all ${clients.length} browser clients.`);
}

async function injectTransient(client, status, firebaseStatus) {
  const origin = new URL(client.page.url()).origin;
  let injectedPost = false;
  const handler = async (route) => {
    if (route.request().method() !== 'POST' || injectedPost) return route.continue();
    injectedPost = true;
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' },
      body: JSON.stringify({ error: { status: firebaseStatus, message: 'Injected capacity transport probe.' } }),
    });
  };
  await client.page.route('**/refreshPresence', handler);
  const injected = await client.page.evaluate(([sessionId, source]) => window.p639
    .call('refreshPresence', { sessionId }, source)
    .then(() => ({ unexpectedlySucceeded: true }), (error) => ({ code: String(error?.code ?? error) })),
  [client.config.sessionId, 'injected-transport']);
  await client.page.unroute('**/refreshPresence', handler);
  const startedAt = performance.now();
  await pageCall(client, 'refreshPresence', { sessionId: client.config.sessionId }, 'browser-recovery');
  return { injected, recoveryMs: performance.now() - startedAt };
}

const evidence = {
  prompt: '639', status: 'failed', testedSourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  environment: {
    kind: 'isolated-local-firebase-emulator',
    projectId,
    ports,
    host: { platform: platform(), arch: arch(), node: process.version, cpuModel: cpus()[0]?.model ?? 'unknown', cpuCount: cpus().length, memoryBytes: totalmem() },
  },
  scenario: { clientCount, identityCount: 20, tabsPerIdentity, durationMs, closureRun },
  thresholds,
  stage: 'initializing',
};

try {
  vite = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await vite.listen();
  const baseUrl = vite.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await chromium.launch({ headless: true });
  const owner = await nodeClient('owner');
  const gm2 = await nodeClient('gm-2');
  const created = await owner.call('createSession', {
    requestId: `p639-create-${randomUUID()}`, name: 'P639 browser capacity', displayName: 'P639 facilitator',
    playerCount: 20, chartId: 'A', expansion: 'capybara', turnLimit: 8,
  });
  const sessionId = created.session.id;
  const joinCode = created.session.joinCode;
  const roles = created.session.activeRoleIds;
  await gm2.call('joinSession', { joinCode, displayName: 'P639 second GM' });

  const browserContexts = [];
  const leaders = [];
  evidence.stage = 'joining-browser-identities';
  for (let index = 0; index < 20; index += 1) {
    const context = await browser.newContext();
    browserContexts.push(context);
    leaders.push(await browserPage(context, baseUrl, {
      projectId, ports, sessionId, joinCode, displayName: `P639 player ${index + 1}`, clientLabel: `identity-${index + 1}`,
    }));
  }

  await owner.call('elevateToGm', { sessionId, targetUid: owner.uid });
  evidence.stage = 'configuring-session';
  await owner.call('loginGmAccess', { password: 'bananasplit' });
  await owner.call('claimGmInstance', { sessionId, instanceId: 'p639-bridge', name: 'P639 Bridge', deviceLabel: 'P639 capacity' });
  await owner.call('elevateToGm', { sessionId, targetUid: gm2.uid });
  await gm2.call('loginGmAccess', { password: 'bananasplit' });
  await gm2.call('claimGmInstance', { sessionId, instanceId: 'p639-observer', name: 'P639 Observer', deviceLabel: 'P639 capacity' });
  const setup = await owner.call('confirmSetup', {
    sessionId, instanceId: 'p639-bridge', requestId: `p639-setup-${randomUUID()}`, expectedSetupRevision: 0,
    playerCount: 20, chartId: 'A', expansion: 'capybara', turnLimit: 8, dioneEnabled: true, capybaraEnabled: true, activeRoleIds: roles,
  });
  let setupRevision = setup.setupRevision;
  for (let index = 0; index < leaders.length; index += 1) {
    const targetUid = leaders[index].initialized.uid;
    const assigned = await owner.call('assignRole', {
      sessionId, instanceId: 'p639-bridge', requestId: `p639-role-${index}-${randomUUID()}`, targetUid, roleId: roles[index],
    });
    setupRevision = assigned.setupRevision;
    const seat = await pageCall(leaders[index], 'claimSeat', {
      sessionId, seatId: roles[index], requestId: `p639-seat-${index}-${randomUUID()}`, expectedSetupRevision: setupRevision,
    });
    setupRevision = seat.setupRevision;
  }
  const startRequest = { sessionId, requestId: `p639-start-${randomUUID()}`, expectedSetupRevision: setupRevision };
  const starts = await Promise.all([
    owner.call('startGame', { ...startRequest, instanceId: 'p639-bridge' }),
    gm2.call('startGame', { ...startRequest, instanceId: 'p639-observer', requestId: `p639-start-2-${randomUUID()}` }),
  ]);
  assert.deepEqual(new Set(starts.map((result) => result.status)), new Set(['committed', 'stale']));

  const clients = [...leaders];
  evidence.stage = 'opening-browser-tabs';
  for (let identity = 0; identity < browserContexts.length; identity += 1) {
    for (let tab = 1; tab < tabsPerIdentity; tab += 1) {
      clients.push(await browserPage(browserContexts[identity], baseUrl, {
        projectId, ports, sessionId, displayName: `P639 player ${identity + 1}`, clientLabel: `identity-${identity + 1}`,
      }));
    }
  }
  assert.equal(clients.length, clientCount);
  await delay(1_000);

  evidence.stage = 'transient-recovery';
  const unavailable = await injectTransient(clients[1], 503, 'UNAVAILABLE');
  const throttled = await injectTransient(clients[2], 429, 'RESOURCE_EXHAUSTED');
  assert.match(unavailable.injected.code, /unavailable/i);
  assert.match(throttled.injected.code, /resource-exhausted/i);

  const intervalMs = thresholds.heartbeatIntervalMs;
  // Establish each GM's reconciliation record before the sustained window.
  // Otherwise the emulator's pessimistic transaction locks make both GMs scan
  // the full player set while the first staggered player renewals are starting.
  await owner.call('refreshPresence', { sessionId, instanceId: 'p639-bridge' });
  await gm2.call('refreshPresence', { sessionId, instanceId: 'p639-observer' });
  for (let index = 0; index < clients.length; index += 1) {
    await clients[index].page.evaluate(([interval, offset]) => window.p639.scheduleHeartbeat(interval, offset),
      [intervalMs, Math.round(index * intervalMs / clients.length)]);
  }
  stopGmLeaseRenewals = scheduleGmLeaseRenewals(
    owner,
    gm2,
    sessionId,
    20_000,
    smokeRun ? 2_000 : 10_000,
  );
  evidence.stage = 'timed-load';
  const runStartedAt = Date.now();
  const runEndsAt = runStartedAt + durationMs;
  const actionDelays = [];
  const actionResults = [];
  const timedErrors = [];
  const retiredSummaries = [];
  let revision = 0;
  let actionIndex = 0;
  let nextActionAt = runStartedAt + Math.min(thresholds.actionIntervalMs, Math.floor(durationMs / 3));
  let reconnect;
  let reconnectDone = false;
  while (Date.now() < runEndsAt) {
    const reconnectOffsetMs = smokeRun && durationMs <= 30_000 ? 0 : 15_000;
    if (!reconnectDone && Date.now() >= runStartedAt + Math.floor(durationMs / 2) + reconnectOffsetMs) {
      reconnectDone = true;
      const identityClientIndexes = clients
        .map((client, index) => client.config.clientLabel === 'identity-1' ? index : -1)
        .filter((index) => index >= 0);
      const identityClients = identityClientIndexes.map((index) => clients[index]);
      for (const client of identityClients) await client.page.evaluate(() => window.p639.stopHeartbeats());
      retiredSummaries.push(...await Promise.all(identityClients.map(({ page }) => page.evaluate(() => window.p639.summary()))));
      const generation = leaders[0].initialized.membership.player.connectionGeneration;
      const reconnectStartedAt = performance.now();
      let disconnectAttempts = 0;
      let disconnected = false;
      while (!disconnected && disconnectAttempts < 4) {
        disconnectAttempts += 1;
        try {
          await pageCall(leaders[0], 'disconnectFromSession', { sessionId, connectionGeneration: generation });
          disconnected = true;
        } catch (error) {
          if (disconnectAttempts >= 4 || !/internal|unavailable/i.test(String(error?.code ?? error))) throw error;
          await delay(disconnectAttempts * 100);
        }
      }
      await Promise.all(identityClients.map((client) => client.page.close()));
      const restoredClients = [];
      let resumeAttempts = 0;
      for (let index = 0; index < identityClients.length; index += 1) {
        const restoredResult = await reconnectBrowserPage(browserContexts[0], baseUrl, {
          ...identityClients[index].config,
          joinCode: undefined,
        });
        const restored = restoredResult.client;
        resumeAttempts += restoredResult.attempts;
        await restored.page.evaluate(([interval, offset]) => window.p639.scheduleHeartbeat(interval, offset),
          [intervalMs, Math.round(index * intervalMs / identityClients.length)]);
        restoredClients.push(restored);
      }
      for (let index = 0; index < identityClientIndexes.length; index += 1) {
        clients[identityClientIndexes[index]] = restoredClients[index];
      }
      leaders[0] = restoredClients[0];
      reconnect = {
        durationMs: performance.now() - reconnectStartedAt,
        disconnectAttempts,
        resumeAttempts,
        restoredPages: restoredClients.length,
      };
    }
    if (Date.now() >= nextActionAt) {
      const delta = actionIndex % 2 === 0 ? 1 : -1;
      const startedAt = Date.now();
      const base = { sessionId, shipId: 'capybara', resourceId: 'scrap', delta, expectedRevision: revision };
      const settled = await Promise.allSettled([
        owner.call('adjustShipResource', { ...base, instanceId: 'p639-bridge', requestId: `p639-action-${actionIndex}-a-${randomUUID()}` }),
        gm2.call('adjustShipResource', { ...base, instanceId: 'p639-observer', requestId: `p639-action-${actionIndex}-b-${randomUUID()}` }),
      ]);
      const dispositions = settled.map((result) => result.status === 'fulfilled'
        ? (result.value.status ?? 'committed')
        : errorCode(result.reason));
      const results = settled.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const rejected = settled.filter((result) => result.status === 'rejected');
      const staleCount = results.filter((result) => result.status === 'stale').length;
      const committed = results.find((result) => result.status !== 'stale');
      if (rejected.length > 0 || staleCount !== 1 || !committed) {
        timedErrors.push({ stage: 'action-race', outcomes: dispositions });
        const snapshot = await getDoc(doc(owner.firestore, 'sessions', sessionId));
        revision = Number(snapshot.data()?.vesselActionRevisions?.capybara ?? revision);
      } else {
        revision = committed.revision;
      }
      actionResults.push({ revision, dispositions });
      if (committed) {
        try { actionDelays.push(...await waitForRevision(clients, revision, startedAt)); }
        catch { timedErrors.push({ stage: 'action-listener-delivery', revision }); }
      }
      actionIndex += 1;
      nextActionAt += thresholds.actionIntervalMs;
    }
    await delay(Math.min(250, Math.max(0, runEndsAt - Date.now())));
  }
  for (const client of clients) await client.page.evaluate(() => window.p639.stopHeartbeats());
  await stopGmLeaseRenewals();
  stopGmLeaseRenewals = undefined;
  const activeSummaries = await Promise.all(clients.map(({ page }) => page.evaluate(() => window.p639.summary())));
  const summaries = [...retiredSummaries, ...activeSummaries];
  const browserCalls = summaries.flatMap((summary) => summary.calls);
  const heartbeats = browserCalls.filter((call) => call.name === 'refreshPresence' && call.source === 'browser');
  const heartbeatSuccesses = heartbeats.filter((call) => call.outcome === 'success');
  const heartbeatErrors = heartbeats.length - heartbeatSuccesses.length;
  const heartbeatErrorRate = heartbeats.length === 0 ? 1 : heartbeatErrors / heartbeats.length;
  const expectedHeartbeats = clientCount * durationMs / intervalMs;
  const heartbeatCoverage = heartbeats.length / expectedHeartbeats;
  const heartbeatLatency = stats(heartbeatSuccesses.map((call) => call.durationMs));
  const listenerActionLatency = stats(actionDelays);
  const listenerDeliveries = summaries.reduce((sum, summary) => sum + summary.sessionEvents.length + summary.playerEvents.length, 0);
  const listenerErrors = summaries.flatMap((summary) => summary.listenerErrors);
  const contentionCount = nodeCalls.filter((call) => call.outcome === 'contention').length;
  const gmLeaseRenewals = nodeCalls.filter((call) => call.name === 'refreshPresence');
  const gmLeaseRenewalSuccesses = gmLeaseRenewals.filter((call) => call.outcome === 'success');
  const thresholdResults = {
    clientCount: smokeRun || clientCount === thresholds.clientCount,
    duration: smokeRun || durationMs === thresholds.durationMs,
    heartbeatCoverage: heartbeatCoverage >= thresholds.heartbeatCoverageMin,
    heartbeatErrorRate: heartbeatErrorRate <= thresholds.heartbeatErrorRateMax,
    gmLeaseRenewals: (smokeRun || gmLeaseRenewals.length >= 90) &&
      gmLeaseRenewalSuccesses.length === gmLeaseRenewals.length,
    heartbeatP95: heartbeatLatency.p95 <= thresholds.heartbeatP95MsMax,
    listenerActionP95: listenerActionLatency.p95 <= thresholds.listenerActionP95MsMax,
    reconnect: reconnect?.durationMs <= thresholds.reconnectMsMax,
    transientRecovery: Math.max(unavailable.recoveryMs, throttled.recoveryMs) <= thresholds.transientRecoveryMsMax,
    contention: contentionCount >= 2,
    listenerErrors: listenerErrors.length === 0,
    actionCoverage: smokeRun || actionResults.length >= thresholds.actionRacesMin,
    timedErrors: timedErrors.length === 0,
  };
  evidence.status = Object.values(thresholdResults).every(Boolean) ? 'passed' : 'failed';
  evidence.browser = { engine: 'chromium', version: browser.version(), contexts: 20, pages: clientCount };
  evidence.results = {
    runStartedAt: new Date(runStartedAt).toISOString(), runEndedAt: new Date().toISOString(),
    heartbeat: { attempts: heartbeats.length, expectedAttempts: expectedHeartbeats, coverage: heartbeatCoverage, successes: heartbeatSuccesses.length, errors: heartbeatErrors, errorRate: heartbeatErrorRate, latencyMs: heartbeatLatency },
    gmLeaseRenewals: {
      attempts: gmLeaseRenewals.length,
      successes: gmLeaseRenewalSuccesses.length,
      errors: gmLeaseRenewals.length - gmLeaseRenewalSuccesses.length,
      latencyMs: stats(gmLeaseRenewalSuccesses.map((call) => call.durationMs)),
    },
    listeners: {
      subscriptions: clientCount * 2,
      lifecycleSubscriptions: summaries.length * 2,
      deliveries: listenerDeliveries,
      errors: listenerErrors.length,
      errorCodes: [...new Set(listenerErrors)].sort(),
      actionLatencyMs: listenerActionLatency,
    },
    actions: { races: actionResults.length, contentionCount, revisions: actionResults },
    reconnect,
    transientRecovery: { unavailable, throttled },
    timedErrors,
    saturation: { maxPerPageHeartbeatInFlight: Math.max(...summaries.map((summary) => summary.maxHeartbeatInFlight)), heartbeatP95ToIntervalRatio: heartbeatLatency.p95 / intervalMs },
    usage: { browserCallableAttempts: browserCalls.length, nodeCallableAttempts: nodeCalls.length, listenerDocumentDeliveries: listenerDeliveries },
    cost: { actualUsd: 0, basis: 'Local Firebase Emulator and local Chromium; no billable production services used.' },
    thresholdResults,
  };
  assert.equal(evidence.status, 'passed', `P639 thresholds failed: ${JSON.stringify(thresholdResults)}`);
  console.log(`P639 ${clientCount}-browser ${durationMs}ms capacity proof passed.`);
} catch (error) {
  evidence.error = { code: String(error?.code ?? 'unknown'), message: String(error?.message ?? error).slice(0, 1000) };
  throw error;
} finally {
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  if (browser) await browser.close().catch(() => undefined);
  if (vite) await vite.close().catch(() => undefined);
  if (stopGmLeaseRenewals) await stopGmLeaseRenewals().catch(() => undefined);
  await Promise.all(apps.map((app) => deleteApp(app).catch(() => undefined)));
  console.log(`P639 evidence: ${evidencePath}`);
}
