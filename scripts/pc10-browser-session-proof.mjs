import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession, buildFixtureCallableObservation } from './pc07-authenticated-session.mjs';
import { runPc10NaturalDisconnectAcceptance } from './pc10-natural-disconnect.mjs';
import { createPc10OriginBrowserCapture } from './pc10-origin-callable-observer.mjs';
import { createPc10NativeDurableBrowserCapture } from './pc10-native-durable-observer.mjs';
import { validatePc10PresenceFunctionalContract, buildPc10PresenceSdkRenewal, capturePc10PresenceAuthority,
  assertPc10PresenceCohortWitnesses, evaluatePc10PresenceInstrumentationContract } from './pc10-presence-functional-contract.mjs';
import { PC10_PROOF_CALLABLE_ACTIONS, createPc10CallableTrace, observePc10CallableTrace,
  pc10SafeCallableOutcome, pc10MessageCohortSize, capturePc10AuthoritativeFailureSnapshot,
  observePc10FailureBeforeCleanup } from './pc10-proof-diagnostics.mjs';
export { createPc10CallableTrace, observePc10CallableTrace, pc10MessageCohortSize,
  capturePc10AuthoritativeFailureSnapshot, observePc10FailureBeforeCleanup } from './pc10-proof-diagnostics.mjs';

const PC10_MAX_RESPONSE_BYTES = 512 * 1024;
const PC10_MAX_BASE64_RESPONSE_CHARS = Math.ceil(PC10_MAX_RESPONSE_BYTES / 3) * 4;
const PC10_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodePc10CdpBinary(value) {
  if (typeof value !== 'string') return { failure: 'stream-bytes-missing' };
  if (value.length > PC10_MAX_BASE64_RESPONSE_CHARS) return { failure: 'stream-body-too-large' };
  if (!PC10_BASE64_PATTERN.test(value)) return { failure: 'stream-bytes-malformed' };
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) return { failure: 'stream-bytes-malformed' };
  if (bytes.length > PC10_MAX_RESPONSE_BYTES) return { failure: 'stream-body-too-large' };
  return { bytes };
}

async function compiledFunctionsBinding() {
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
  const javascriptHash = createHash('sha256');
  let javascriptFileCount = 0;
  for (const path of files.sort()) {
    const relativePath = path.slice(base.length + 1);
    const bytes = await readFile(path);
    hash.update(relativePath + '\0').update(bytes);
    if (path.endsWith('.js')) {
      javascriptFileCount++;
      javascriptHash.update(relativePath + '\0').update(bytes);
    }
  }
  return { sha256: hash.digest('hex'), compiledFileCount: files.length,
    javascriptFileCount, javascriptSha256: javascriptHash.digest('hex') };
}

export function isFreshPc10BrowserRole(state, role) {
  return state.hasAuth && state.sameActor && state.hasSession && state.cycle === 1 &&
    state.connection === 'live' && state.freshness === 'server' &&
    state.activeConsoleRoleId === role && (role === 'press-officer' || state.roleId === role);
}

/** Cache module setup per document, never the live identity or session values. */
export function createPc10LiveObserver(auth, useSessionStore) {
  return () => {
    const currentUser = auth().currentUser;
    const state = useSessionStore.getState();
    return { hasAuth: Boolean(currentUser), sameActor: currentUser?.uid === state.me?.uid,
      hasSession: Boolean(state.session?.id), roleId: state.me?.assignedRoleId ?? null,
      activeConsoleRoleId: state.me?.activeConsoleRoleId ?? null,
      seatId: state.me?.seatId ?? null, connection: state.connection,
      freshness: state.sessionSnapshotFreshness, phase: state.session?.phase ?? null,
      cycle: state.session?.currentTurn ?? null };
  };
}

/** Runs inside the actual page. Console markers contain scheduling metadata only. */
export async function observePc10PageIdentity({ observationId, moduleUrl, observerSource }) {
  const key = Symbol.for('pc10-proof-live-observer');
  const started = performance.now();
  const bootstrapRequired = !window[key];
  const documentState = () => ({ visibility: document.visibilityState,
    focused: document.hasFocus(), online: navigator.onLine });
  const report = (stage, details = {}) => console.debug(`PC10_IDENTITY_OBSERVATION:${JSON.stringify({
    observationId, stage, browserAt: Date.now(), bootstrapRequired,
    bootstrapCount: window[key]?.bootstrapCount ?? 0, ...documentState(), ...details,
  })}`);
  report('entry');
  let bootstrapDurationMs = 0;
  if (bootstrapRequired) {
    const [{ auth }, { useSessionStore }] = await Promise.all([
      import('/src/lib/firebase.ts'), import(moduleUrl),
    ]);
    const createObserver = new Function(`return (${observerSource});`)();
    window[key] = { read: createObserver(auth, useSessionStore), bootstrapCount: 1 };
    bootstrapDurationMs = performance.now() - started;
  }
  const getterStarted = performance.now();
  const state = window[key].read();
  const getterDurationMs = performance.now() - getterStarted;
  report('read', { bootstrapDurationMs, getterDurationMs, totalDurationMs: performance.now() - started });
  return state;
}

/** Never copy arbitrary browser console content into evidence. */
export function parsePc10IdentityObservationEvent(value) {
  const prefix = 'PC10_IDENTITY_OBSERVATION:';
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
  let event;
  try { event = JSON.parse(value.slice(prefix.length)); } catch { return null; }
  if (!Number.isSafeInteger(event?.observationId) || event.observationId < 1 ||
      !['entry', 'read'].includes(event.stage) || !Number.isFinite(event.browserAt) || event.browserAt < 0 ||
      typeof event.bootstrapRequired !== 'boolean' || !Number.isSafeInteger(event.bootstrapCount) || event.bootstrapCount < 0 ||
      !['visible', 'hidden', 'prerender'].includes(event.visibility) ||
      typeof event.focused !== 'boolean' || typeof event.online !== 'boolean') return null;
  const safe = { observationId: event.observationId, stage: event.stage, browserAt: event.browserAt,
    bootstrapRequired: event.bootstrapRequired, bootstrapCount: event.bootstrapCount,
    visibility: event.visibility, focused: event.focused, online: event.online };
  for (const field of ['bootstrapDurationMs', 'getterDurationMs', 'totalDurationMs']) {
    if (Number.isFinite(event[field]) && event[field] >= 0) safe[field] = event[field];
  }
  return safe;
}

/** The real same-UID normal member read is evidence of server readiness only. */
export function buildPc10ServerIdentityDiagnostic({ roleId, actor, sessionId, reply, startedAt, completedAt }) {
  const timing = buildFixtureCallableObservation({ name: 'getCurrentMemberSession',
    transport: 'authenticated-emulator-HTTP', actorUid: actor.localId, sessionId,
    reply, startedAt, completedAt, status: reply.status });
  const projection = reply.status === 200 ? reply.result : null;
  const sameActor = Boolean(projection && projection.actorUid === actor.localId);
  const sameSession = Boolean(projection && projection.sessionId === sessionId);
  const roleMatches = Boolean(projection && (roleId === 'press-officer' || projection.assignedRoleId === roleId));
  const consoleMatches = Boolean(projection && projection.activeConsoleRoleId === roleId);
  const phase = ['lobby', 'setup', 'active', 'debrief', 'closed'].includes(projection?.session?.phase)
    ? projection.session.phase : null;
  const cycle = Number.isSafeInteger(projection?.session?.currentTurn) ? projection.session.currentTurn : null;
  return { ...timing, roleId, projectionAvailable: Boolean(projection), sameActor, sameSession,
    roleMatches, consoleMatches, phase, cycle,
    serverReady: sameActor && sameSession && roleMatches && consoleMatches && phase === 'active' && cycle === 1 };
}

/** Evaluate only the own private marker's validated metadata against the real current clock. */
export function buildPc10RateLimitStateDiagnostic({ identity, stored, observedAt, requestObservation }) {
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { CALLABLE_RATE_LIMIT_POLICIES, evaluateCallableRateLimit } = require('../functions/lib/callableRateLimit.js');
  const policy = CALLABLE_RATE_LIMIT_POLICIES[identity.callableName];
  const value = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const decision = evaluateCallableRateLimit(stored, identity, policy, observedAt);
  const hashes = buildFixtureCallableObservation({ name: identity.callableName,
    transport: 'authenticated-emulator-HTTP', actorUid: identity.uid, sessionId: identity.sessionId,
    startedAt: 0, completedAt: 0, status: 429 });
  const windowStartedAtMs = Number.isSafeInteger(value.windowStartedAtMs) && value.windowStartedAtMs >= 0
    ? value.windowStartedAtMs : null;
  const requestCount = Number.isSafeInteger(value.requestCount) && value.requestCount >= 1 ? value.requestCount : null;
  const clientRequestStartedAt = Number.isSafeInteger(requestObservation.startedAt) && requestObservation.startedAt >= 0
    ? requestObservation.startedAt : null;
  return { callableName: identity.callableName, actorHash: hashes.actorHash, sessionHash: hashes.sessionHash,
    observedAt, clientRequestStartedAt, maxRequests: policy.maxRequests, windowMs: policy.windowMs,
    markerExists: stored !== undefined,
    markerHasExactKeys: Object.keys(value).sort().join('|') ===
      'callableName|identityHash|requestCount|type|version|windowStartedAtMs',
    markerTypeMatches: value.type === 'callable-rate-limit', markerVersionMatches: value.version === 1,
    markerCallableMatches: value.callableName === identity.callableName,
    markerIdentityMatches: value.identityHash === createHash('sha256').update(`${identity.sessionId}\0${identity.uid}`).digest('hex'),
    windowStartedAtMs, requestCount,
    markerWindowAfterClientRequestStarted: windowStartedAtMs !== null && clientRequestStartedAt !== null &&
      windowStartedAtMs > clientRequestStartedAt,
    markerWindowAfterFreshTime: windowStartedAtMs !== null && windowStartedAtMs > observedAt,
    freshClockDecision: decision.allowed ? 'allowed' : decision.reason,
    denialCategory: ['rate-limit-state-invalid', 'rate-limited'].includes(requestObservation.denialCategory)
      ? requestObservation.denialCategory : null };
}

/** Compose the actual acceptance on this live table before caller-owned cleanup.
 * A failed follow-up, browser error, source change or rebuilt runtime remains a failure. */
export async function completePc10BrowserProof(table, { afterOverlappingProof, details = {} } = {}) {
  const errors = [...table.clients.values()].flatMap(client => client.errors);
  assert.equal(errors.length, 0, 'No browser runtime errors may be ignored.');
  if (validatePc10PresenceFunctionalContract(table.presenceFunctionalContract)) {
    await table.capturePresenceAuthority();
    assert.equal(table.evaluatePresenceFunctionalContract().hardFailures.length, 0,
      'Only fully witnessed background presence instrumentation limitations may use the explicit functional contract.');
  } else {
    assert.equal([...table.clients.values()].flatMap(client => client.callableObservationFailures ?? []).length, 0,
      'No missing callable observations may be ignored.');
  }
  if (afterOverlappingProof) await afterOverlappingProof(table);
  const evidence = await table.writeEvidence('overlapping-recovery.json', {
    ...details, completedAfterOverlappingProof: Boolean(afterOverlappingProof),
  });
  assert.equal(evidence.errors.length, 0, 'No browser runtime errors may be ignored.');
  if (validatePc10PresenceFunctionalContract(table.presenceFunctionalContract)) {
    assert.equal(evidence.presenceFunctionalAssessment.hardFailures.length, 0,
      'Only fully witnessed background presence instrumentation limitations may use the explicit functional contract.');
  } else {
    assert.equal(evidence.callableObservationFailures?.length ?? 0, 0, 'No missing callable observations may be ignored.');
  }
  assert.equal(evidence.sourceCommit, evidence.sourceCommitAtStart, 'The source must stay unchanged throughout the proof.');
  assert.equal(evidence.runtimeIndexSha256AtEnd, evidence.runtimeIndexSha256AtStart,
    'The Functions runtime index must stay unchanged throughout the proof.');
  assert.equal(evidence.runtimeCompiledTreeSha256AtEnd, evidence.runtimeCompiledTreeSha256AtStart,
    'Every compiled Functions runtime byte must stay unchanged throughout the proof.');
  return evidence;
}

/** Finish real request/body observations before caller-owned document teardown.
 * The quiet interval records late events; it changes no transport or game clock. */
export async function drainPc10CallableObservations({ pending, revision, quietMs = 300, wait = delay }) {
  assert.ok(pending instanceof Set && typeof revision === 'function');
  assert.ok(Number.isFinite(quietMs) && quietMs > 0);
  for (;;) {
    if (pending.size) {
      await Promise.all([...pending]);
      continue;
    }
    const before = revision();
    await wait(quietMs);
    if (!pending.size && revision() === before) return;
  }
}

/** A live client never becomes globally quiet while normal polling continues.
 * Drain the finite set of already network-finished bodies. Unfinished requests
 * stay in the evidence and may be cancelled only by an observed real transition. */
export function createPc10CallableObservationBoundary({ onFailure, onCancellation, onBodyUnavailable, now = Date.now }) {
  const pending = new Set();
  const boundaries = [];
  let offline = null;
  function release(state) {
    if (state.terminalDone && state.bodyDone && state.intent?.outcome !== 'pending') pending.delete(state);
  }
  function cancelled(state) {
    const intent = state.intent;
    if (!intent || intent.outcome !== 'completed' || !state.failedDuringIntent || state.trace.requestFinishedAt !== null ||
        state.trace.bodyCompletedAt !== null || state.trace.requestFailedAt === null ||
        state.trace.requestFailedAt < intent.startedAt) return false;
    if (intent.kind === 'offline') return state.failureCode === 'net::ERR_INTERNET_DISCONNECTED' &&
      (intent.endedAt == null || state.trace.requestFailedAt <= intent.endedAt);
    return intent.kind === 'reload' && state.failureCode === 'net::ERR_ABORTED' &&
      (intent.completedAt === null || state.trace.requestFailedAt <= intent.completedAt);
  }
  function classify(state) {
    if (cancelled(state)) {
      state.trace.observationDisposition = state.intent.kind === 'offline'
        ? 'cancelled-during-planned-offline' : 'cancelled-during-planned-navigation';
      state.trace.transitionStartedAt = state.intent.startedAt;
      // Both raw failure timestamps remain. Resolve only this request's
      // provisional errors after the actual matching transition succeeds.
      onCancellation(state);
    } else {
      delete state.trace.observationDisposition;
      delete state.trace.transitionStartedAt;
      if (state.trace.requestFailedAt !== null) onFailure(state, 'unexpected-request-failure');
      if (state.bodyRejected) onFailure(state, 'response-observation-unavailable');
    }
  }
  return {
    boundaries,
    start(trace) {
      const state = { trace, terminalDone: false, bodyDone: true, bodyRejected: false,
        body: null, intent: offline, failureCode: null, failedDuringIntent: false };
      pending.add(state);
      return state;
    },
    finish(state) {
      state.terminalDone = true;
      if (!state.body) {
        state.bodyRejected = true;
        onBodyUnavailable(state);
      }
      classify(state);
      release(state);
    },
    fail(state, code) {
      state.failureCode = code;
      state.failedDuringIntent = state.intent?.kind === 'offline' ? offline === state.intent
        : state.intent?.kind === 'reload' && state.intent.outcome === 'pending';
      state.terminalDone = true;
      classify(state);
      release(state);
    },
    capture(state, body) {
      pending.add(state);
      state.bodyDone = false;
      state.body = body.catch(() => {
        // A missing terminal event cannot hide a rejected body indefinitely.
        // Only a later actual requestfailed matching successful intent may
        // reclassify this failure as incomplete cancelled transport.
        state.bodyRejected = true;
        onBodyUnavailable(state);
        classify(state);
      }).finally(() => {
        state.bodyDone = true;
        classify(state);
        release(state);
      });
    },
    async drain() {
      const targets = [...pending].filter(state => state.terminalDone && state.body && !state.bodyDone);
      const boundary = { kind: 'completed-body-drain', startedAt: now(), completedAt: null,
        finishedBodies: targets.length, inFlightRequests: [...pending].filter(state => !state.terminalDone).length,
        outcome: 'pending' };
      boundaries.push(boundary);
      try {
        await Promise.all(targets.map(state => state.body));
        boundary.outcome = 'completed';
      } catch (error) {
        boundary.outcome = 'failed';
        throw error;
      } finally { boundary.completedAt = now(); }
    },
    async transition(kind, operation) {
      assert.ok(['offline', 'online', 'reload'].includes(kind));
      const boundary = { kind, startedAt: now(), completedAt: null, outcome: 'pending' };
      boundaries.push(boundary);
      if (kind === 'offline') offline = boundary;
      if (kind !== 'online') {
        for (const state of pending) if (!state.terminalDone) state.intent = boundary;
      }
      try {
        const result = await operation(); // The original Playwright API, exactly once.
        boundary.outcome = 'completed';
        return result;
      } catch (error) {
        boundary.outcome = 'failed';
        throw error;
      } finally {
        boundary.completedAt = now();
        if (kind === 'online' && boundary.outcome === 'completed') {
          if (offline) offline.endedAt = boundary.completedAt;
          offline = null;
        }
        for (const state of pending) {
          classify(state);
          release(state);
        }
      }
    },
  };
}

/** The consent UI requires a committed session identity. Keep the original
 * total admission budget and every explicit regulation/timer acknowledgement. */
export async function completePc10OrdinaryUiAdmission({ join, consent, inspect }) {
  const joined = await join();
  assert.ok(joined?.hasAuth && joined.sameActor && joined.hasSession, 'Require the real joined identity before consent.');
  await consent();
  const current = await inspect();
  assert.ok(current?.hasAuth && current.sameActor && current.hasSession, 'Retain the real joined identity after consent.');
}

/** An isolated browser context has its own Firebase Auth identity/storage.
 * Tokens remain in memory. Evidence records role/action/state categories only.
 * These are automated browser clients, never a human/device playtest claim. */
export async function createPc10BrowserActor(browser, baseUrl, label, viewport = { width: 390, height: 844 },
  { captureMode = 'durable', originProjectId = process.env.VITE_FIREBASE_PROJECT_ID, originFunctionsOrigin,
    presenceFunctionalContract, presenceInstrumentationLimitation } = {}) {
  const retainPresenceWitnesses = validatePc10PresenceFunctionalContract(presenceFunctionalContract);
  if (retainPresenceWitnesses && captureMode !== 'native-durable') throw new TypeError('Presence functional contract requires native-durable observations.');
  if (!['durable', 'stream', 'origin', 'native-durable'].includes(captureMode)) throw new TypeError('Unsupported callable body capture mode.');
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(20_000);
  const errors = [];
  const observedCalls = [];
  const callableObservationFailures = [];
  const explicitSdkInvocations = [];
  const sdkInvocationsByReply = new WeakMap();
  const failuresByRequest = new WeakMap();
  const protocolRequestHashFor = requestId => typeof requestId === 'string' && requestId.length > 0
    ? createHash('sha256').update(`pc10-cdp-request\0${requestId}`).digest('hex') : null;
  const safeTransportError = errorText => {
    switch (errorText) {
      case 'net::ERR_ABORTED': return 'aborted';
      case 'net::ERR_INTERNET_DISCONNECTED': return 'internet-disconnected';
      case 'net::ERR_TIMED_OUT': return 'timed-out';
      default: return 'unknown';
    }
  };
  const chromiumBodyReadReasons = new Map([
    ['No resource with given identifier found', 'resource-not-found'],
    ['Request content was evicted from inspector cache', 'content-evicted'],
    ['No data found for resource with given identifier', 'body-unavailable'],
  ]);
  const safeBodyReadReason = error => {
    let message;
    try { message = error instanceof Error ? error.message : ''; }
    catch { return 'unknown'; }
    const playwrightPrefix = 'Protocol error (Network.getResponseBody): ';
    if (message.startsWith(playwrightPrefix)) message = message.slice(playwrightPrefix.length);
    return chromiumBodyReadReasons.get(message) ?? 'unknown';
  };
  const chromiumStreamStartReasons = new Map([
    ['Request with the provided ID does not exists', 'resource-not-found'],
    ['Request with the provided ID has already finished loading', 'already-finished'],
  ]);
  const safeStreamStartReason = error => {
    let message;
    try { message = error instanceof Error ? error.message : ''; }
    catch { return 'unknown'; }
    if (typeof message !== 'string') return 'unknown';
    const prefixes = ['Protocol error (Network.streamResourceContent): ',
      'cdpSession.send: Protocol error (Network.streamResourceContent): '];
    const prefix = prefixes.find(value => message.startsWith(value));
    if (prefix) message = message.slice(prefix.length);
    return chromiumStreamStartReasons.get(message) ?? 'unknown';
  };
  function recordDetachedCallableFailure(name, requestId, category) {
    const failure = { roleId: label, name, category };
    const protocolRequestHash = protocolRequestHashFor(requestId);
    if (protocolRequestHash) failure.protocolRequestHash = protocolRequestHash;
    callableObservationFailures.push(failure);
  }
  function recordCallableObservationFailure(state, category) {
    const byCategory = failuresByRequest.get(state) ?? new Map();
    if (byCategory.has(category)) return;
    const failure = { roleId: label, name: state.trace.name, requestHash: state.trace.requestHash,
      status: state.trace.status, category };
    const protocolRequestHash = protocolRequestHashFor(state.protocolRequestId);
    if (protocolRequestHash) failure.protocolRequestHash = protocolRequestHash;
    if (state.transportFailure) {
      failure.transportError = state.transportFailure.error;
      failure.transportCancelled = state.transportFailure.canceled;
    }
    if (state.bodyFailureStage) failure.bodyFailureStage = state.bodyFailureStage;
    if (state.bodyFailureReason) failure.bodyFailureReason = state.bodyFailureReason;
    byCategory.set(category, failure);
    failuresByRequest.set(state, byCategory);
    callableObservationFailures.push(failure);
  }
  const observationBoundary = createPc10CallableObservationBoundary({
    onFailure: recordCallableObservationFailure,
    onCancellation: state => {
      // An observed cancellation keeps its raw trace. No unrelated request,
      // completed HTTP200 body loss, metadata error or drain timeout is removed.
      for (const failure of failuresByRequest.get(state)?.values() ?? []) {
        const index = callableObservationFailures.indexOf(failure);
        if (index !== -1) callableObservationFailures.splice(index, 1);
      }
      failuresByRequest.delete(state);
    },
    onBodyUnavailable: ({ trace }) => observePc10CallableTrace(trace, { stage: 'body-unavailable', at: Date.now() }),
  });
  const observedRequests = new Map();
  const ignoredNonPostRequests = new Map();
  const identityObservations = [];
  const identityRecords = new Map();
  let observationId = 0;
  let actorHash;
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
  const durableBuffer = { maxTotalBufferSize: 8 * 1024 * 1024, maxResourceBufferSize: 512 * 1024 };
  let cdpSession, originCapture;
  try {
    if (captureMode === 'origin' || captureMode === 'native-durable') {
      const port = process.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT ?? '5001';
      if (!originFunctionsOrigin && (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65_535)) {
        throw new TypeError('Origin collector requires a valid local Functions port.');
      }
      const createCapture = captureMode === 'native-durable' ? createPc10NativeDurableBrowserCapture : createPc10OriginBrowserCapture;
      originCapture = await createCapture({ context, page, label, projectId: originProjectId,
        functionsOrigin: originFunctionsOrigin ?? `http://127.0.0.1:${port}`, observedCalls,
        failures: callableObservationFailures, boundaryFactory: createPc10CallableObservationBoundary,
        ...(retainPresenceWitnesses ? { presenceInstrumentationLimitation } : {}) });
    } else {
    cdpSession = await context.newCDPSession(page);
    const callableNameFor = urlValue => {
      if (typeof urlValue !== 'string') return null;
      try {
        const url = new URL(urlValue);
        const name = url.pathname.split('/').at(-1);
        return url.pathname.includes('/us-central1/') && Object.hasOwn(PC10_PROOF_CALLABLE_ACTIONS, name)
          ? name : null;
      } catch { return null; }
    };
    const unboundFailure = (name, requestId) => recordDetachedCallableFailure(name, requestId,
      'unknown-callable-lifecycle');
    const eventTime = trace => Math.max(Date.now(), trace.issuedAt);
    const recordCallableReply = (state, reply) => {
      if (!state.headersSeen) recordCallableObservationFailure(state, 'unknown-callable-lifecycle');
      const completedAt = eventTime(state.trace);
      observePc10CallableTrace(state.trace, { stage: 'body', at: completedAt, reply });
      const value = buildFixtureCallableObservation({ ...state.trace, completedAt, status: state.trace.status,
        transport: 'independent-browser-SDK', reply });
      Object.assign(state.trace, { actorHash: state.trace.actorHash ?? value.actorHash ?? actorHash ?? null,
        sessionHash: state.trace.sessionHash ?? value.sessionHash, groupHash: state.trace.groupHash ?? value.groupHash,
        connectionGeneration: value.connectionGeneration, denialCategory: value.denialCategory });
    };
    const releaseStreamBytes = stream => {
      stream.bufferedData = null;
      stream.chunks.length = 0;
      stream.chunkByteLength = 0;
      stream.byteLength = 0;
      stream.preActivationByteLength = 0;
    };
    const failStreamCapture = (stream, stage) => {
      if (stream.failureStage) return;
      stream.failureStage = stage;
      releaseStreamBytes(stream);
    };
    const settleStreamCapture = state => {
      const stream = state.streamCapture;
      if (!stream || stream.settled || !stream.startCompleted || !stream.terminal) return;
      if (stream.terminal === 'failed') {
        stream.settled = true;
        releaseStreamBytes(stream);
        stream.resolve(null);
        return;
      }
      if (stream.failureStage) {
        state.bodyFailureStage = stream.failureStage;
        stream.settled = true;
        releaseStreamBytes(stream);
        stream.reject(new Error('Callable streamed response body unavailable.'));
        return;
      }
      const bytes = Buffer.concat([stream.bufferedData, ...stream.chunks], stream.byteLength);
      stream.settled = true;
      releaseStreamBytes(stream);
      stream.resolve(bytes);
    };
    const startStreamCapture = state => {
      let resolveBytes, rejectBytes;
      const stream = { bufferedData: null, chunks: [], chunkByteLength: 0, byteLength: 0,
        preActivationByteLength: 0, activationObserved: false,
        startCompleted: false, terminal: null, failureStage: state.streamLifecycleInvalid ? 'stream-lifecycle' : null,
        settled: false,
        resolve: null, reject: null };
      const bytesPromise = new Promise((resolve, reject) => { resolveBytes = resolve; rejectBytes = reject; });
      stream.resolve = resolveBytes;
      stream.reject = rejectBytes;
      state.streamCapture = stream;
      const capture = bytesPromise.then(bytes => {
        if (bytes === null) return;
        if (bytes.length === 0) {
          state.bodyFailureStage = 'stream-body-empty';
          throw new Error('Callable streamed response body was empty.');
        }
        let reply;
        try { reply = JSON.parse(bytes.toString('utf8')); }
        catch {
          state.bodyFailureStage = 'json-parse';
          throw new Error('Callable streamed response JSON was malformed.');
        }
        if (!reply || typeof reply !== 'object' || Array.isArray(reply)) {
          state.bodyFailureStage = 'reply-shape';
          throw new Error('Callable streamed response reply shape was malformed.');
        }
        recordCallableReply(state, reply);
      });
      observationBoundary.capture(state, capture);
      // Dispatch at the request event, not a later microtask. The async wrapper
      // still converts a synchronous port error into the same rejected promise.
      (async () => cdpSession.send('Network.streamResourceContent', {
        requestId: state.protocolRequestId,
      }))().then(response => {
        if (stream.failureStage || stream.settled) return;
        stream.activationObserved = true;
        if (!response || typeof response.bufferedData !== 'string') {
          failStreamCapture(stream, 'stream-buffer-missing');
          return;
        }
        const decoded = decodePc10CdpBinary(response.bufferedData);
        if (decoded.failure) {
          failStreamCapture(stream, decoded.failure === 'stream-body-too-large'
            ? decoded.failure : 'stream-buffer-malformed');
          return;
        }
        // Metadata received before activation describes bytes that must exist
        // in this request's actual returned buffer; later chunks cannot fill it.
        if (decoded.bytes.length < stream.preActivationByteLength) {
          failStreamCapture(stream, 'stream-buffer-incomplete');
          return;
        }
        stream.bufferedData = decoded.bytes;
        stream.byteLength = decoded.bytes.length + stream.chunkByteLength;
        if (stream.byteLength > PC10_MAX_RESPONSE_BYTES) failStreamCapture(stream, 'stream-body-too-large');
      }, error => {
        if (!stream.failureStage) state.bodyFailureReason = safeStreamStartReason(error);
        failStreamCapture(stream, 'stream-start');
      }).finally(() => {
        stream.startCompleted = true;
        settleStreamCapture(state);
      });
    };
    cdpSession.on('Network.requestWillBeSent', event => {
      const name = callableNameFor(event?.request?.url);
      if (!name) return;
      const method = event?.request?.method;
      if (typeof method !== 'string' || method.length === 0 ||
          typeof event.requestId !== 'string' || event.requestId.length === 0) {
        recordDetachedCallableFailure(name, event?.requestId, 'request-metadata-unavailable');
        return;
      }
      const ignoredPrior = ignoredNonPostRequests.get(event.requestId);
      if (ignoredPrior) {
        unboundFailure(name);
        return;
      }
      const prior = observedRequests.get(event.requestId);
      if (prior) {
        recordCallableObservationFailure(prior, 'unknown-callable-lifecycle');
        return;
      }
      if (method !== 'POST') {
        // Correlate known GET/preflight IDs explicitly; response URLs alone
        // cannot distinguish those from an unbound callable POST response.
        ignoredNonPostRequests.set(event.requestId, { method });
        return;
      }
      let data;
      let requestMetadataUnavailable = false;
      try {
        if (typeof event.request.postData !== 'string') throw new Error('Callable post data is unavailable.');
        const envelope = JSON.parse(event.request.postData);
        if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
            !envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
          throw new Error('Callable post data is malformed.');
        }
        data = envelope.data;
      } catch {
        requestMetadataUnavailable = true;
      }
      const trace = createPc10CallableTrace({ name, data, actorUid: undefined,
        transport: 'independent-browser-SDK', startedAt: Date.now() });
      trace.roleId = label;
      trace.actorHash = actorHash ?? null;
      const state = observationBoundary.start(trace);
      state.protocolRequestId = event.requestId;
      state.headersSeen = false;
      observedRequests.set(event.requestId, state);
      observedCalls.push(trace);
      if (requestMetadataUnavailable) recordCallableObservationFailure(state, 'request-metadata-unavailable');
      // Chromium creates Fetch/XHR ResourceData before requestWillBeSent, making
      // this validated POST event the earliest supported activation point.
      else if (captureMode === 'stream') startStreamCapture(state);
    });
    cdpSession.on('Network.responseReceived', event => {
      const ignoredNonPost = ignoredNonPostRequests.get(event?.requestId);
      if (ignoredNonPost?.method && ignoredNonPost.method !== 'POST') return;
      const state = observedRequests.get(event?.requestId);
      if (!state) {
        const name = callableNameFor(event?.response?.url);
        if (name) unboundFailure(name, event?.requestId);
        return;
      }
      if (state.headersSeen || state.trace.requestFinishedAt !== null || state.trace.requestFailedAt !== null) {
        recordCallableObservationFailure(state, 'unknown-callable-lifecycle');
        return;
      }
      state.headersSeen = true;
      if (!Number.isSafeInteger(event.response?.status) || event.response.status < 100 || event.response.status > 599) {
        recordCallableObservationFailure(state, 'unknown-callable-lifecycle');
      }
      observePc10CallableTrace(state.trace, { stage: 'headers', at: eventTime(state.trace), status: event.response?.status });
    });
    if (captureMode === 'stream') cdpSession.on('Network.dataReceived', event => {
      if (ignoredNonPostRequests.has(event?.requestId)) return;
      const state = observedRequests.get(event?.requestId);
      if (!state) return;
      const stream = state.streamCapture;
      if (!stream || !state.headersSeen || stream.terminal ||
          state.trace.requestFinishedAt !== null || state.trace.requestFailedAt !== null) {
        state.streamLifecycleInvalid = true;
        if (stream && !stream.terminal) failStreamCapture(stream, 'stream-lifecycle');
        recordCallableObservationFailure(state, 'unknown-callable-lifecycle');
        return;
      }
      if (stream.failureStage) return;
      if (!Number.isSafeInteger(event.dataLength) || event.dataLength < 0 ||
          !Number.isSafeInteger(event.encodedDataLength) || event.encodedDataLength < 0) {
        failStreamCapture(stream, 'stream-metadata-malformed');
        return;
      }
      if (!Object.hasOwn(event, 'data')) {
        // Chromium also flushes pending encoded lengths with dataLength=0 at
        // loadingFinished. This event carries no body bytes, even while active.
        if (event.dataLength === 0) return;
        if (stream.activationObserved) {
          failStreamCapture(stream, 'stream-chunk-missing');
          return;
        }
        stream.preActivationByteLength += event.dataLength;
        if (stream.preActivationByteLength + stream.chunkByteLength > PC10_MAX_RESPONSE_BYTES) {
          failStreamCapture(stream, 'stream-body-too-large');
        }
        return;
      }
      const decoded = decodePc10CdpBinary(event?.data);
      if (decoded.failure) {
        const stage = decoded.failure === 'stream-bytes-missing' ? 'stream-chunk-missing'
          : decoded.failure === 'stream-body-too-large' ? 'stream-body-too-large' : 'stream-chunk-malformed';
        failStreamCapture(stream, stage);
        return;
      }
      if (decoded.bytes.length !== event.dataLength) {
        failStreamCapture(stream, 'stream-chunk-length');
        return;
      }
      // A data-bearing event proves Chromium already enabled streaming, even
      // when the command's reply is still pending on this client.
      stream.activationObserved = true;
      stream.chunks.push(decoded.bytes);
      stream.chunkByteLength += decoded.bytes.length;
      stream.byteLength = (stream.bufferedData?.length ?? 0) + stream.chunkByteLength;
      if (stream.chunkByteLength > PC10_MAX_RESPONSE_BYTES ||
          stream.chunkByteLength + (stream.bufferedData?.length ?? stream.preActivationByteLength) > PC10_MAX_RESPONSE_BYTES) {
        failStreamCapture(stream, 'stream-body-too-large');
      }
    });
    cdpSession.on('Network.loadingFinished', event => {
      if (ignoredNonPostRequests.delete(event?.requestId)) return;
      const state = observedRequests.get(event?.requestId);
      if (!state) return;
      if (state.trace.requestFinishedAt !== null || state.trace.requestFailedAt !== null) {
        recordCallableObservationFailure(state, 'unknown-callable-lifecycle');
        return;
      }
      observePc10CallableTrace(state.trace, { stage: 'finished', at: eventTime(state.trace) });
      if (captureMode === 'stream') {
        if (!state.headersSeen) {
          if (state.streamCapture) failStreamCapture(state.streamCapture, 'stream-lifecycle');
          recordCallableObservationFailure(state, 'unknown-callable-lifecycle');
        }
        if (!state.streamCapture) {
          state.bodyFailureStage = 'stream-not-started';
          recordCallableObservationFailure(state, 'unknown-callable-lifecycle');
        } else {
          state.streamCapture.terminal = 'finished';
          settleStreamCapture(state);
        }
        observationBoundary.finish(state);
        return;
      }
      const capture = Promise.resolve().then(async () => {
        let response;
        try {
          response = await cdpSession.send('Network.getResponseBody', { requestId: state.protocolRequestId });
        } catch (error) {
          state.bodyFailureStage = 'get-response-body';
          state.bodyFailureReason = safeBodyReadReason(error);
          throw new Error('Callable response body read failed.');
        }
        if (!response || typeof response.body !== 'string' || typeof response.base64Encoded !== 'boolean') {
          state.bodyFailureStage = 'response-shape';
          throw new Error('Callable response body shape is malformed.');
        }
        let bytes;
        try {
          bytes = response.base64Encoded ? Buffer.from(response.body, 'base64') : Buffer.from(response.body, 'utf8');
        } catch {
          state.bodyFailureStage = 'body-decode';
          throw new Error('Callable response body decoding failed.');
        }
        let reply;
        try { reply = JSON.parse(bytes.toString('utf8')); }
        catch {
          state.bodyFailureStage = 'json-parse';
          throw new Error('Callable response body JSON was malformed.');
        }
        if (!reply || typeof reply !== 'object' || Array.isArray(reply)) {
          state.bodyFailureStage = 'reply-shape';
          throw new Error('Callable response body reply shape was malformed.');
        }
        recordCallableReply(state, reply);
      });
      observationBoundary.capture(state, capture);
      observationBoundary.finish(state);
    });
    cdpSession.on('Network.loadingFailed', event => {
      if (ignoredNonPostRequests.delete(event?.requestId)) return;
      const state = observedRequests.get(event?.requestId);
      if (!state) return;
      if (state.trace.requestFinishedAt !== null || state.trace.requestFailedAt !== null) {
        recordCallableObservationFailure(state, 'unknown-callable-lifecycle');
        return;
      }
      observePc10CallableTrace(state.trace, { stage: 'failed', at: eventTime(state.trace) });
      state.transportFailure = {
        error: safeTransportError(event?.errorText),
        canceled: typeof event?.canceled === 'boolean' ? event.canceled : null,
      };
      if (captureMode === 'stream' && state.streamCapture) {
        state.streamCapture.terminal = 'failed';
        settleStreamCapture(state);
      }
      observationBoundary.fail(state, event.errorText);
    });
    await cdpSession.send('Network.enable', durableBuffer);
    if (captureMode === 'durable') await cdpSession.send('Network.configureDurableMessages', durableBuffer);
    }
  } catch (error) {
    await originCapture?.close().catch(() => undefined);
    await cdpSession?.detach().catch(() => undefined);
    await context.close().catch(() => undefined);
    throw error;
  }
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    const event = parsePc10IdentityObservationEvent(message.text());
    if (!event) return;
    const record = identityRecords.get(event.observationId);
    if (record) record.pageEvents.push({ ...event, observedAt: Date.now() });
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/src/store/useSessionStore.ts') storeModule = url.href;
    if (url.pathname.endsWith('/firebase_functions.js')) functionsSdkModule = url.href;
    if (url.pathname.endsWith('/firebase_firestore.js')) firestoreSdkModule = url.href;
  });
  async function observe() {
    const record = { roleId: label, observationId: ++observationId, issuedAt: Date.now(), pageEvents: [] };
    identityObservations.push(record);
    identityRecords.set(record.observationId, record);
    const operation = page.evaluate(observePc10PageIdentity, { observationId: record.observationId,
      moduleUrl: storeModule, observerSource: createPc10LiveObserver.toString() });
    // A late completion is recorded, never substituted for the deadline failure.
    void operation.then(state => {
      record.completedAt = Date.now();
      record.roundTripMs = record.completedAt - record.issuedAt;
      record.completedAfterTimeout = record.deadlineExceeded === true;
      record.readiness = { hasAuth: state.hasAuth, sameActor: state.sameActor, hasSession: state.hasSession,
        roleMatches: label === 'press-officer' || state.roleId === label,
        consoleMatches: state.activeConsoleRoleId === label, connection: state.connection,
        freshness: state.freshness, phase: state.phase, cycle: state.cycle };
    }, () => { record.operationFailureAt = Date.now(); });
    try { return await bounded(operation, 10_000, 'identity observation'); }
    catch (error) {
      record.rejectedAt = Date.now();
      record.deadlineExceeded = error.message === `${label}: identity observation exceeded 10000ms`;
      error.pc10IdentityRole = label;
      throw error;
    }
  }
  async function until(description, ready, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    let state;
    while (Date.now() < deadline) {
      state = await observe();
      if (ready(state)) return state;
      await delay(250);
    }
    const error = new Error(`${description}: ${JSON.stringify(state)}`);
    error.pc10IdentityRole = label;
    throw error;
  }
  async function enter(joinCode) {
    console.log(`${label}: ordinary UI join started`);
    joinStage = 'launcher navigation';
    await page.goto(baseUrl);
    console.log(`${label}: launcher loaded`);
    const motion = page.getByRole('button', { name: /^REDUCED MOTION/i });
    if (await motion.isVisible()) await motion.click();
    await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
    await completePc10OrdinaryUiAdmission({
      join: async () => {
        await page.getByRole('button', { name: 'Join a session', exact: true }).click();
        joinStage = 'authoritative joined identity';
        return until(`${label} ordinary Auth join`, state => state.hasAuth && state.sameActor && state.hasSession);
      },
      inspect: observe,
      consent: async () => {
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
      },
    });
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
    try {
      const actor = await bounded(enter(joinCode), 60_000, `ordinary join at ${joinStage}`);
      actorHash = buildFixtureCallableObservation({ name: 'joinSession', transport: 'independent-browser-SDK',
        actorUid: actor.localId, startedAt: 0, completedAt: 0, status: 200 }).actorHash;
      originCapture?.bindIdentity(actor.localId);
      return actor;
    }
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
  async function callable(name, data, { retainPresenceAuthority = false } = {}) {
    const retainSdkWitness = retainPresenceWitnesses || (retainPresenceAuthority === true && captureMode === 'native-durable');
    const invocation = { kind: 'explicit-sdk-invocation', roleId: label,
      name: Object.hasOwn(PC10_PROOF_CALLABLE_ACTIONS, name) ? name : null, startedAt: Date.now(), completedAt: null,
      nativeDocumentHash: null };
    if (retainSdkWitness) explicitSdkInvocations.push(invocation);
    const result = await page.evaluate(async ({ sdkUrl, name, data, retainPresenceWitnesses }) => {
      const { functions } = await import('/src/lib/firebase.ts');
      const { httpsCallable } = await import(sdkUrl);
      // Read the existing actual document witness in this SAME SDK invocation;
      // no new getter, request, document lookup or guessed native correlation.
      const documentId = retainPresenceWitnesses ? globalThis[Symbol.for('pc10-proof-native-durable-document')] : null;
      let originalReply;
      try {
        const reply = await httpsCallable(functions(), name)(data);
        originalReply = { status: 200, result: reply.data };
      } catch (error) {
        originalReply = { status: 'denied', error: { code: error.code } };
      }
      return retainPresenceWitnesses ? { originalReply, documentId } : originalReply;
    }, { sdkUrl: functionsSdkModule, name, data, retainPresenceWitnesses: retainSdkWitness });
    if (!retainSdkWitness) return result;
    invocation.completedAt = Date.now();
    if (typeof result.documentId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(result.documentId)) {
      invocation.nativeDocumentHash = createHash('sha256').update(`pc10-native-durable-document\0${result.documentId}`).digest('hex');
    }
    sdkInvocationsByReply.set(result.originalReply, invocation);
    return result.originalReply;
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
    observedCalls, callableObservationFailures, identityObservations, explicitSdkInvocations,
    sdkInvocationForReply: reply => sdkInvocationsByReply.get(reply),
    callableObservationBoundaries: (originCapture ?? observationBoundary).boundaries,
    drainObservedCalls: () => bounded((originCapture ?? observationBoundary).drain(), 10_000, 'callable observations'),
    setOffline: value => (originCapture ?? observationBoundary).transition(value ? 'offline' : 'online', () => context.setOffline(value)),
    reload: () => (originCapture ?? observationBoundary).transition('reload', () => page.reload()),
    bindOriginIdentity: (uid, sessionId) => originCapture?.bindIdentity(uid, sessionId),
    close: async () => { try { if (originCapture) await originCapture.close(); else await cdpSession.detach(); }
      finally { await context.close(); } } };
}

/** Fresh, normal authenticated full roster. All ordinary players join and
 * acknowledge consent through UI; setup/start stay on existing GM authority.
 * No admin gameplay seeding or result injection is performed. */
export async function createPc10BrowserTable({ baseUrl, directory, expansion = 'capybara', coreCount = 20,
  captureMode = 'durable', presenceFunctionalContract } = {}) {
  const functionalPresence = presenceFunctionalContract !== undefined && validatePc10PresenceFunctionalContract(presenceFunctionalContract);
  if (functionalPresence && captureMode !== 'native-durable') throw new TypeError('Presence functional contract requires native-durable observations.');
  if (!['durable', 'stream', 'origin', 'native-durable'].includes(captureMode)) throw new TypeError('Unsupported callable body capture mode.');
  assert.ok(baseUrl && directory, 'An isolated UI URL and evidence directory are required.');
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname), 'Local browser proof only.');
  assert.match(process.env.VITE_FIREBASE_PROJECT_ID ?? '', /^demo-[a-z0-9-]+$/, 'Local demo project only.');
  await mkdir(directory, { recursive: true });
  const sourceCommitAtStart = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const runtimeIndexSha256AtStart = createHash('sha256').update(await readFile('functions/lib/index.js')).digest('hex');
  const runtimeCompiledBindingAtStart = await compiledFunctionsBinding();
  const runtimeCompiledTreeSha256AtStart = runtimeCompiledBindingAtStart.sha256;
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const roles = recommendedRoleIds(coreCount);
  assert.equal(roles.length, coreCount, 'Use the actual supported full roster.');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const clients = new Map();
  const actions = [];
  const receiptWitnesses = [];
  const fixtureCallableIssued = [];
  const fixtureCallableObservations = [];
  const serverIdentityDiagnostics = [];
  const rateLimitStateDiagnostics = [];
  const authoritativeFailureSnapshots = [];
  const failureDiagnosticFailures = [];
  const presenceSdkRenewals = [];
  const presenceRenewalsByReply = new WeakMap();
  const presenceAuthoritySnapshots = [];
  const presenceGenerations = new Map();
  const activePresenceCohortRoles = new Set();
  let retainPresenceAuthorityWitnesses = false;
  const evaluatePresenceFunctionalContract = () => evaluatePc10PresenceInstrumentationContract({ option: presenceFunctionalContract,
    observations: [...clients.values()].flatMap(client => client.observedCalls),
    failures: [...clients.values()].flatMap(client => client.callableObservationFailures),
    renewals: presenceSdkRenewals, authoritySnapshots: presenceAuthoritySnapshots,
    explicitSdkInvocations: [...clients.values()].flatMap(client => client.explicitSdkInvocations), actions });
  const presenceInstrumentationLimitation = trace => {
    const assessment = evaluatePresenceFunctionalContract();
    return assessment.hardFailures.length === 0 && assessment.instrumentationLimitations.some(value =>
      value.roleId === trace.roleId && value.protocolRequestHash === trace.protocolRequestHash);
  };
  let fixture;
  let startupBrowserClose;
  let startupBrowserCloseState = 'not-requested';
  const closeStartupBrowser = () => {
    // Cache the original close, including rejection. An outer failure handler
    // cannot quietly retry a failed close and then delete the fixture.
    if (!startupBrowserClose) {
      startupBrowserCloseState = 'pending';
      startupBrowserClose = Promise.resolve().then(() => browser.close()).then(
        () => { startupBrowserCloseState = 'fulfilled'; },
        error => { startupBrowserCloseState = 'failed'; throw error; });
    }
    return startupBrowserClose;
  };
  async function diagnoseAuthoritativeFailure(context = fixture) {
    const setupRequests = Object.entries(context.seatClaimRequests ?? {}).map(([roleId, data]) => ({
      name: 'claimSeat', actorUid: context.players[context.roles.indexOf(roleId)].localId, data,
    }));
    const snapshot = await capturePc10AuthoritativeFailureSnapshot({ ...context,
      project: context.project ?? process.env.VITE_FIREBASE_PROJECT_ID,
      requests: [...setupRequests, ...receiptWitnesses],
    });
    authoritativeFailureSnapshots.push(snapshot);
    await writeFile(`${directory}/authoritative-failure-snapshots.json`,
      `${JSON.stringify(authoritativeFailureSnapshots, null, 2)}\n`);
  }
  async function diagnoseRateFailure({ db, sessionId, gm, players, press, roles }) {
    const actorRoles = new Map(players.map((actor, index) => [actor.localId, roles[index]]));
    actorRoles.set(gm.localId, 'gm');
    if (press) actorRoles.set(press.localId, 'press-officer');
    const actors = new Map([gm, ...players, ...(press ? [press] : [])].map(actor => [buildFixtureCallableObservation({
      name: 'resumeSession', transport: 'authenticated-emulator-HTTP', actorUid: actor.localId,
      startedAt: 0, completedAt: 0, status: 200 }).actorHash, actor]));
    const require = createRequire(new URL('../functions/package.json', import.meta.url));
    const { CALLABLE_RATE_LIMIT_POLICIES, callableRateLimitDocumentId } = require('../functions/lib/callableRateLimit.js');
    const denials = [...fixtureCallableObservations, ...[...clients.values()].flatMap(client => client.observedCalls)]
      .filter(value => value.status === 429 && CALLABLE_RATE_LIMIT_POLICIES[value.name] && actors.has(value.actorHash));
    const unique = new Map(denials.map(value => [`${value.name}/${value.actorHash}`, value]));
    for (const denial of unique.values()) {
      const actor = actors.get(denial.actorHash);
      const identity = { callableName: denial.name, sessionId, uid: actor.localId };
      const marker = await db.doc(`sessions/${sessionId}/serverState/callableRateLimit-${callableRateLimitDocumentId(identity)}`).get();
      rateLimitStateDiagnostics.push({ roleId: actorRoles.get(actor.localId), ...buildPc10RateLimitStateDiagnostic({
        identity, stored: marker.data(), observedAt: Date.now(), requestObservation: denial,
      }) });
    }
  }
  try {
    const joins = {};
    for (const roleId of roles) {
      const client = await createPc10BrowserActor(browser, baseUrl, roleId, undefined,
        { captureMode, presenceFunctionalContract, presenceInstrumentationLimitation });
      clients.set(roleId, client);
      joins[roleId] = client.join;
    }
    const press = await createPc10BrowserActor(browser, baseUrl, 'press-officer', undefined,
      { captureMode, presenceFunctionalContract, presenceInstrumentationLimitation });
    clients.set('press-officer', press);
    fixture = await createPc07AuthenticatedSession('PC10 fresh overlapping browser rehearsal', coreCount, {
      clearBriefing: true, keepAlive: true, serializeFixtureCalls: false, browserOwnsPresence: true, expansion,
      capybaraEnabled: true, joinBrowserPlayers: joins, joinPressPlayer: press.join,
      onCallableIssued: observation => fixtureCallableIssued.push(observation),
      onCallableObservation: observation => fixtureCallableObservations.push(observation),
      beforeFailureCleanup: (context, error) => observePc10FailureBeforeCleanup(error, {
        snapshot: () => diagnoseAuthoritativeFailure(context), rate: () => diagnoseRateFailure(context),
        writeEvidence: async ({ diagnosticFailures }) => {
          failureDiagnosticFailures.push(...diagnosticFailures);
          await writeFile(`${directory}/startup-pre-cleanup-diagnostics.json`,
            `${JSON.stringify({ authoritativeFailureSnapshots, diagnosticFailures }, null, 2)}\n`);
        },
      }),
      beforeCleanup: closeStartupBrowser,
      beforeFailureDeletion: closeStartupBrowser,
    });
    const actorRoles = new Map(fixture.players.map((actor, index) => [actor.localId, roles[index]]));
    for (const [index, actor] of fixture.players.entries()) clients.get(roles[index]).bindOriginIdentity?.(actor.localId, fixture.sessionId);
    clients.get('press-officer').bindOriginIdentity?.(fixture.press.localId, fixture.sessionId);
    actorRoles.set(fixture.press.localId, 'press-officer');
    actorRoles.set(fixture.gm.localId, 'gm');
    const originalCall = fixture.call;
    fixture.call = async (actor, name, data) => {
      const roleId = actorRoles.get(actor.localId) ?? 'unassigned';
      const client = clients.get(roleId);
      const startedAt = Date.now();
      const trace = createPc10CallableTrace({ name, data, actorUid: actor.localId, startedAt,
        transport: client ? 'independent-browser-SDK' : 'authenticated-emulator-HTTP' });
      const entry = { ...trace, roleId, kind: 'proof-command', commandIssuedAt: startedAt,
        commandCompletedAt: null, commandFailedAt: null };
      actions.push(entry); // Retain even a command that never produces HTTP/SDK completion.
      const witness = ['claimSeat', 'sendFleetGroupMessage', 'publishPressDispatch'].includes(name)
        ? { name, actorUid: actor.localId, data: { ...data } } : null;
      if (witness) receiptWitnesses.push(witness); // Private comparison material stays in memory.
      try {
        const scopedPresence = functionalPresence && name === 'refreshPresence' && client && !activePresenceCohortRoles.has(roleId);
        const authorityBefore = scopedPresence ? await capturePresenceAuthority([roleId]) : null;
        // Freeze THIS invocation's baseline. Another legitimate source sequence
        // may capture a newer generation while this original SDK call is live.
        const generationBefore = presenceGenerations.get(roleId);
        const reply = client ? await client.callable(name, data,
          retainPresenceAuthorityWitnesses && name === 'refreshPresence' ? { retainPresenceAuthority: true } : undefined)
          : await originalCall(actor, name, data);
        entry.commandCompletedAt = Date.now();
        entry.completedAt = entry.commandCompletedAt;
        entry.durationMs = entry.completedAt - startedAt;
        Object.assign(entry, pc10SafeCallableOutcome(reply));
        if ((functionalPresence || retainPresenceAuthorityWitnesses) && name === 'refreshPresence' && client) {
          const invocation = client.sdkInvocationForReply(reply);
          const renewal = buildPc10PresenceSdkRenewal({ roleId, actorUid: actor.localId,
            sessionId: fixture.sessionId, project: fixture.project, startedAt: invocation?.startedAt,
            completedAt: invocation?.completedAt, nativeDocumentHash: invocation?.nativeDocumentHash,
            generationBefore, reply });
          presenceSdkRenewals.push(renewal); presenceRenewalsByReply.set(reply, renewal);
          if (scopedPresence) {
            const authorityAfter = await capturePresenceAuthority([roleId]);
            assertPc10PresenceCohortWitnesses({ roleIds: [roleId], before: authorityBefore, renewals: [renewal], after: authorityAfter });
          }
        }
        if (witness) witness.reply = reply;
        return reply;
      } catch (error) {
        entry.commandFailedAt = Date.now();
        entry.failureCategory = 'proof-command-unavailable';
        throw error;
      }
    };
    const command = async (roleId, name, payload = {}) => {
      const actor = roleId === 'gm' ? fixture.gm : roleId === 'press-officer' ? fixture.press : fixture.byRole(roleId);
      assert.ok(actor, `${roleId} must have an independently authenticated actor.`);
      return fixture.call(actor, name, { sessionId: fixture.sessionId, ...payload });
    };
    const capturePresenceAuthority = async (roleIds = [...clients.keys()]) => {
      assert.ok(Array.isArray(roleIds) && roleIds.length > 0 && new Set(roleIds).size === roleIds.length &&
        roleIds.every(roleId => clients.has(roleId)), 'Presence cohort must contain original independently authenticated fixture roles.');
      const snapshots = await capturePc10PresenceAuthority({ db: fixture.db, project: fixture.project,
        emulatorHost: `127.0.0.1:${fixture.config.firestorePort}`, sessionId: fixture.sessionId,
        actors: roleIds.map(roleId => ({ roleId, actorUid: (roleId === 'press-officer' ? fixture.press : fixture.byRole(roleId)).localId })) });
      presenceAuthoritySnapshots.push(...snapshots);
      for (const value of snapshots) presenceGenerations.set(value.roleId, value.generation);
      return snapshots;
    };
    // Optional evidence around the SAME parallel original SDK calls. It does
    // not lower the existing21-context stage or manufacture a background reply.
    const renewPresenceCohort = async (roleIds = [...clients.keys()]) => {
      assert.equal(captureMode, 'native-durable', 'SDK cohort document evidence requires the declared native-durable witness.');
      retainPresenceAuthorityWitnesses = true;
      const before = await capturePresenceAuthority(roleIds);
      for (const roleId of roleIds) activePresenceCohortRoles.add(roleId);
      let replies;
      try { replies = await Promise.all(roleIds.map(roleId => command(roleId, 'refreshPresence', { activeConsoleRoleId: roleId }))); }
      finally { for (const roleId of roleIds) activePresenceCohortRoles.delete(roleId); }
      const after = await capturePresenceAuthority(roleIds);
      for (const reply of replies) assert.equal(reply.status, 200, 'Every original SDK cohort renewal must succeed.');
      assertPc10PresenceCohortWitnesses({ roleIds, before, renewals: replies.map(reply => presenceRenewalsByReply.get(reply)), after });
      return replies;
    };
    const diagnoseIdentityFailure = async error => {
      const roleId = error.pc10IdentityRole;
      if (!clients.has(roleId)) return;
      const actor = roleId === 'press-officer' ? fixture.press : fixture.byRole(roleId);
      const startedAt = Date.now();
      try {
        const reply = await originalCall(actor, 'getCurrentMemberSession', { sessionId: fixture.sessionId });
        serverIdentityDiagnostics.push(buildPc10ServerIdentityDiagnostic({ roleId, actor,
          sessionId: fixture.sessionId, reply, startedAt, completedAt: Date.now() }));
      } catch {
        serverIdentityDiagnostics.push({ roleId, startedAt, completedAt: Date.now(),
          category: 'normal-authenticated-member-read-unavailable', serverReady: false });
      }
    };
    const writeEvidence = async (filename, details = {}) => {
      if (functionalPresence) await capturePresenceAuthority();
      await Promise.all([...clients.values()].map(client => client.drainObservedCalls().catch(() => {
        client.callableObservationFailures.push({ roleId: client.label, category: 'observation-drain-timeout' });
      })));
      const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const runtimeCompiledBindingAtEnd = await compiledFunctionsBinding();
      const errors = [...clients.values()].flatMap(client => client.errors.map(message => ({ roleId: client.label, message })));
      const evidence = { schemaVersion: 1, sourceCommit, recordedAt: new Date().toISOString(), expansion, captureMode,
        sourceCommitAtStart, runtimeIndexSha256AtStart,
        runtimeCompiledTreeSha256AtStart, runtimeCompiledTreeSha256AtEnd: runtimeCompiledBindingAtEnd.sha256,
        runtimeCompiledBindingAtStart, runtimeCompiledBindingAtEnd,
        runtimeIndexSha256AtEnd: createHash('sha256').update(await readFile('functions/lib/index.js')).digest('hex'),
        freshCreatedSession: true, adminGameplayWrites: false,
        callableTraceAllowlist: Object.keys(PC10_PROOF_CALLABLE_ACTIONS), fixtureCallableIssued, fixtureCallableObservations,
        identityObservations: [...clients.values()].flatMap(client => client.identityObservations),
        serverIdentityDiagnostics,
        rateLimitStateDiagnostics,
        authoritativeFailureSnapshots,
        observedBrowserCalls: [...clients.values()].flatMap(client => client.observedCalls),
        callableObservationFailures: [...clients.values()].flatMap(client => client.callableObservationFailures),
        ...(functionalPresence || retainPresenceAuthorityWitnesses ? { presenceFunctionalContract: presenceFunctionalContract ?? null,
          strictTransportStatus: evaluatePresenceFunctionalContract().strictTransportStatus,
          presenceFunctionalAssessment: evaluatePresenceFunctionalContract(), presenceSdkRenewals, presenceAuthoritySnapshots,
          explicitSdkInvocations: [...clients.values()].flatMap(client => client.explicitSdkInvocations) } : {}),
        callableObservationBoundaries: [...clients.values()].flatMap(client =>
          client.callableObservationBoundaries.map(boundary => ({ roleId: client.label, ...boundary }))),
        independentCorePlayerAuthSessions: fixture.players.length,
        additionalIndependentPressAuthSessions: 1, gmAuthSessions: 1,
        actualIndependentBrowserContexts: clients.size, browserProcesses: 1,
        browserScheduling: 'overlapping Promise.all batches on independent contexts',
        humanDevicePlaytest: false, tokensOrCredentialsRecorded: false, actions, errors, ...details };
      await writeFile(`${directory}/${filename}`, `${JSON.stringify(evidence, null, 2)}\n`);
      return evidence;
    };
    return { fixture, clients, actions, command, writeEvidence, diagnoseIdentityFailure, diagnoseAuthoritativeFailure,
      presenceFunctionalContract, renewPresenceCohort, capturePresenceAuthority, evaluatePresenceFunctionalContract,
      diagnoseRateFailure: () => diagnoseRateFailure(fixture), cleanup: async () => {
      // The original fixture owns a referenced cleanup lifetime and awaits
      // this table's browser-close hook before its own heartbeat drain/deletion.
      await fixture.cleanup();
    } };
  } catch (error) {
    try {
      await Promise.all([...clients.values()].map(client => client.drainObservedCalls().catch(() => {
        client.callableObservationFailures.push({ roleId: client.label, category: 'observation-drain-timeout' });
      })));
      const runtimeCompiledBindingAtEnd = await compiledFunctionsBinding();
      await writeFile(`${directory}/startup-failure.json`, `${JSON.stringify({ status: 'failed', captureMode,
        sourceCommitAtStart, runtimeIndexSha256AtStart, runtimeCompiledTreeSha256AtStart,
        sourceCommitAtEnd: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        runtimeIndexSha256AtEnd: createHash('sha256').update(await readFile('functions/lib/index.js')).digest('hex'),
        runtimeCompiledTreeSha256AtEnd: runtimeCompiledBindingAtEnd.sha256,
        runtimeCompiledBindingAtStart, runtimeCompiledBindingAtEnd,
        stage: 'fresh normal Auth/UI setup', message: error.message, contextsOpened: clients.size,
        callableTraceAllowlist: Object.keys(PC10_PROOF_CALLABLE_ACTIONS), fixtureCallableIssued,
        fixtureCallableObservations, observedBrowserCalls: [...clients.values()].flatMap(client => client.observedCalls),
        identityObservations: [...clients.values()].flatMap(client => client.identityObservations),
        serverIdentityDiagnostics,
        rateLimitStateDiagnostics, failureObservationUnavailable: error.pc07FailureObservationUnavailable === true,
        authoritativeFailureSnapshots, diagnosticFailures: failureDiagnosticFailures,
        callableObservationFailures: [...clients.values()].flatMap(client => client.callableObservationFailures),
        callableObservationBoundaries: [...clients.values()].flatMap(client =>
          client.callableObservationBoundaries.map(boundary => ({ roleId: client.label, ...boundary }))),
        browserErrors: [...clients.values()].flatMap(client => client.errors.map(message => ({ roleId: client.label, message }))),
      }, null, 2)}\n`);
    } catch (evidenceError) {
      error.pc10StartupFailureEvidenceUnavailable = true;
      error.pc10StartupFailureEvidenceError = evidenceError;
    }
    if (fixture) {
      try { await fixture.stopHeartbeats(); }
      catch (heartbeatError) {
        error.pc10StartupHeartbeatStopUnavailable = true;
        error.pc10StartupHeartbeatStopError = heartbeatError;
      }
    }
    let fixtureCleanup = error.pc07FailureCleanupComplete === true ? 'completed-by-PC07' :
      error.pc07FailureCleanupUnavailable === true ? 'unavailable-from-PC07' : 'not-requested';
    try { await closeStartupBrowser(); }
    catch (closeError) {
      error.pc10StartupBrowserCloseUnavailable = true;
      error.pc10StartupBrowserCloseError = closeError;
      fixtureCleanup = 'blocked-before-deletion';
    }
    if (fixture && startupBrowserCloseState === 'fulfilled') {
      try { await fixture.cleanup(); fixtureCleanup = 'completed'; }
      catch (cleanupError) {
        fixtureCleanup = 'unavailable';
        error.pc10StartupFixtureCleanupUnavailable = true;
        error.pc10StartupFixtureCleanupError = cleanupError;
      }
    }
    try {
      await writeFile(`${directory}/startup-cleanup-boundary.json`, `${JSON.stringify({ status: 'failed',
        browserClose: startupBrowserCloseState, fixtureCleanup, primaryFailurePreserved: true,
        pc07FailureCleanupComplete: error.pc07FailureCleanupComplete === true,
        pc07FailureCleanupUnavailable: error.pc07FailureCleanupUnavailable === true,
        startupFailureEvidenceUnavailable: error.pc10StartupFailureEvidenceUnavailable === true,
        heartbeatStopUnavailable: error.pc10StartupHeartbeatStopUnavailable === true,
      }, null, 2)}\n`);
    } catch (evidenceError) {
      error.pc10StartupCleanupEvidenceUnavailable = true;
      error.pc10StartupCleanupEvidenceError = evidenceError;
    }
    throw error;
  }
}

export async function runPc10OverlappingRecoveryProof(options) {
  const messageCohortSize = pc10MessageCohortSize(options.messageCohortSize);
  const messageCohortSizes = [];
  const completedStages = [];
  const table = await createPc10BrowserTable(options);
  const { fixture, clients, command } = table;
  const roles = [...clients.keys()];
  try {
    const states = await Promise.all(roles.map(role => clients.get(role).until('Fresh active held role', state =>
      isFreshPc10BrowserRole(state, role))));
    assert.equal(states.length, 21);
    completedStages.push('21-fresh-active-browser-identities');
    const before = await fixture.session.get();
    const requests = new Map(fixture.roles.map(roleId => {
      const originalClaim = fixture.seatClaimRequests[roleId];
      assert.ok(originalClaim?.requestId, 'Retry the actual ordinary Cycle 0 claim, preserving casting authority.');
      return [roleId, originalClaim];
    }));
    const resumes = await Promise.all(roles.map(role => command(role, 'resumeSession')));
    for (const reply of resumes) assert.equal(reply.status, 200, 'Every independent browser resumes its own current projection.');
    completedStages.push('21-simultaneous-sdk-resumes');
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
    completedStages.push('42-private-sdk-and-21-gm-read-denials');
    const messages = [];
    // The default seven simultaneous legitimate group writes are repeated
    // across the full core roster. This is explicit overlapping scheduling,
    // not a hidden transport retry or a limit change.
    for (let offset = 0; offset < fixture.roles.length; offset += messageCohortSize) {
      const batch = fixture.roles.slice(offset, offset + messageCohortSize);
      messageCohortSizes.push(batch.length);
      const choices = batch.map(role => ({ role,
        payload: { requestId: randomUUID(), expectedGroupId: resumes[roles.indexOf(role)].result.player.fleetGroupId,
          text: `PC10 automated browser overlap // ${role}` } }));
      const committed = await Promise.all(choices.map(({ role, payload }) => command(role, 'sendFleetGroupMessage', payload)));
      for (let index = 0; index < choices.length; index++) {
        assert.equal(committed[index].status, 200, `${choices[index].role} legitimate group note must commit.`);
      }
      const replays = await Promise.all(choices.map(({ role, payload }) => command(role, 'sendFleetGroupMessage', payload)));
      assert.deepEqual(replays, committed, 'Exact group-note retries preserve the committed results.');
      messages.push(...choices.map(({ role, payload }) => ({ roleId: role,
        requestHash: createPc10CallableTrace({ name: 'sendFleetGroupMessage', data: payload,
          transport: 'independent-browser-SDK', startedAt: 0 }).requestHash })));
    }
    completedStages.push('20-cohorted-group-notes-and-exact-replays');
    const pressPayload = { requestId: randomUUID(), text: 'PC10 automated overlapping-session rehearsal',
      expectedRevision: (await fixture.session.get()).get('pressDispatch')?.revision ?? 0 };
    const pressDispatch = await command('press-officer', 'publishPressDispatch', pressPayload);
    assert.equal(pressDispatch.status, 200, 'The independent Press audience can publish its own ordinary dispatch.');
    assert.deepEqual(await command('press-officer', 'publishPressDispatch', pressPayload), pressDispatch);
    completedStages.push('press-dispatch-and-exact-replay');
    const claims = await Promise.all(fixture.roles.map(role => command(role, 'claimSeat', requests.get(role))));
    for (const reply of claims) assert.equal(reply.status, 200, 'Distinct held seats support legitimate simultaneous exact retries.');
    const replayClaims = await Promise.all(fixture.roles.map(role => command(role, 'claimSeat', requests.get(role))));
    for (let index = 0; index < claims.length; index++) assert.deepEqual(replayClaims[index], claims[index]);
    completedStages.push('20-simultaneous-original-seat-retries-and-replays');
    const allPresence = validatePc10PresenceFunctionalContract(table.presenceFunctionalContract)
      ? await table.renewPresenceCohort(roles)
      : await Promise.all(roles.map(role => command(role, 'refreshPresence', { activeConsoleRoleId: role })));
    for (const reply of allPresence) assert.equal(reply.status, 200);
    completedStages.push('21-simultaneous-presence');
    const outsider = await clients.get(fixture.roles[1]).callable('startGame', { sessionId: fixture.sessionId,
      instanceId: fixture.instanceId, requestId: randomUUID(), expectedSetupRevision: before.get('setupRevision') });
    assert.notEqual(outsider.status, 200, 'Ordinary authenticated browsers cannot become GM/start the game.');
    completedStages.push('ordinary-gm-start-denied');
    const recoveryRoles = [...fixture.roles, 'press-officer'];
    if (validatePc10PresenceFunctionalContract(table.presenceFunctionalContract)) await table.capturePresenceAuthority(recoveryRoles);
    await Promise.all(recoveryRoles.map(role => clients.get(role).drainObservedCalls()));
    await Promise.all(recoveryRoles.map(role => clients.get(role).setOffline(true)));
    const disconnectedObservations = await Promise.all(recoveryRoles.map(role => clients.get(role).observe()));
    await Promise.all(recoveryRoles.map(role => clients.get(role).setOffline(false)));
    if (validatePc10PresenceFunctionalContract(table.presenceFunctionalContract)) await table.capturePresenceAuthority(recoveryRoles);
    await Promise.all(recoveryRoles.map(async role => {
      const client = clients.get(role);
      await client.observe();
      await client.drainObservedCalls();
      await client.reload();
    }));
    const recovered = await Promise.all(recoveryRoles.map(role => clients.get(role).until('reload/reconnect same authoritative role', state =>
      isFreshPc10BrowserRole(state, role))));
    const after = await fixture.session.get();
    assert.equal(after.get('currentTurn'), before.get('currentTurn'), 'Reconnect must not advance the authoritative cycle.');
    completedStages.push('21-simultaneous-offline-reload-same-uid-recoveries');
    const geometry = await Promise.all(roles.map(role => clients.get(role).geometry()));
    for (const metrics of geometry) assert.ok(metrics.document <= metrics.viewport && metrics.body <= metrics.viewport);
    const evidence = await completePc10BrowserProof(table, { afterOverlappingProof: options.afterOverlappingProof, details: {
      checks: { freshFullRosterViaOrdinaryUiConsent: true, independentBrowserContexts: 21,
        overlappingResumePresenceAndSeatRetries: true, exactSeatReplayStable: true,
        ordinaryActorGmMutationDenied: true, everyNonGmRoleOfflineReloadRecovery: true,
        overlappingOrdinaryGameplayNotesAndPress: true, exactGameplayReplayStable: true,
        everyBrowserPrivateRulesAndGmReadDenied: true,
        cyclePreserved: true, browserGeometryContained: true },
      messageCohortSize, messageCohortSizes, completedStages,
      privateAudience, messages, disconnectedObservations, recovered,
      limitations: ['This focused concurrency proof alone is not a complete game-through-ending proof.',
        'Actor/browser automation does not establish human-device attendance.',
        'Timer all-player disconnect/remaining-time pause requires its distinct controlled presence-expiry check.'],
    } });
    return evidence;
  } catch (error) {
    await observePc10FailureBeforeCleanup(error, {
      snapshot: table.diagnoseAuthoritativeFailure,
      identity: () => table.diagnoseIdentityFailure(error), rate: table.diagnoseRateFailure,
      writeEvidence: details => table.writeEvidence('overlapping-recovery-failure.json', {
        status: 'failed', message: error.message, messageCohortSize, messageCohortSizes, completedStages, ...details,
      }),
    });
    throw error;
  } finally {
    await table.cleanup();
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const evidence = await runPc10OverlappingRecoveryProof({ baseUrl: process.env.PC10_UI_URL,
    directory: process.env.PC10_EVIDENCE_DIRECTORY, expansion: process.env.PC10_EXPANSION ?? 'capybara',
    messageCohortSize: process.env.PC10_MESSAGE_COHORT_SIZE,
    ...(process.env.PC10_NATURAL_DISCONNECT === '1' ? { afterOverlappingProof: table =>
      runPc10NaturalDisconnectAcceptance(table, {
        directory: join(process.env.PC10_EVIDENCE_DIRECTORY, 'natural-disconnect'), expectBrowserContexts: 21,
      }) } : {}),
  });
  console.log(JSON.stringify({ checks: evidence.checks, browserContexts: evidence.actualIndependentBrowserContexts,
    actions: evidence.actions.length, humanDevicePlaytest: false }));
}
