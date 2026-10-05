import { createHash } from 'node:crypto';
import { PC10_PROOF_CALLABLE_ACTIONS, createPc10CallableTrace } from './pc10-proof-diagnostics.mjs';
import { parsePc10OriginRequest, parsePc10OriginResult } from './pc10-origin-callable-observer.mjs';
import { classifyPc10PresenceRequest } from './pc10-presence-functional-contract.mjs';

const MAX_BODY_BYTES = 512 * 1024;
const MAX_TOTAL_BODY_BYTES = 8 * 1024 * 1024;
const OBSERVATION_BUDGET_MS = 10_000;
const DOCUMENT_BINDING = '__pc10NativeDurableDocumentWitness';
const INIT_SOURCE = 'pc10-native-durable-init.js';
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,256}$/.test(value);
const canonical = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const digest = (kind, value) => canonical(value)
  ? createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex') : null;
const witnessHash = (kind, value) => createHash('sha256').update(`pc10-native-durable-${kind}\0${value}`).digest('hex');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
};
function checkConfiguration(projectId, functionsOrigin) {
  let url;
  try { url = new URL(functionsOrigin); } catch { /* Fixed error below. */ }
  if (typeof projectId !== 'string' || !/^demo-[a-z0-9-]+$/.test(projectId) || !url || url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || url.origin !== functionsOrigin ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('Native durable collector requires a local demo project and loopback Functions origin.');
  }
}
function safeBodyReadReason(error) {
  let message;
  try { message = error instanceof Error ? error.message : ''; } catch { return 'unknown'; }
  for (const prefix of ['Protocol error (Network.getResponseBody): ', 'cdpSession.send: Protocol error (Network.getResponseBody): ']) {
    if (message.startsWith(prefix)) { message = message.slice(prefix.length); break; }
  }
  return new Map([
    ['No resource with given identifier found', 'resource-not-found'],
    ['Request content was evicted from inspector cache', 'content-evicted'],
    ['No data found for resource with given identifier', 'body-unavailable'],
  ]).get(message) ?? 'unknown';
}

/** Init-only provenance witness. The wrapper returns the same original fetch
 * promise immediately, with the original receiver and argument references.
 * It never reads a response, adds headers, retries, pauses polling or routes it. */
export function installPc10NativeDurableWitness(configuration) {
  const installed = Symbol.for('pc10-proof-native-durable-fetch');
  if (globalThis[installed]) throw new Error('Native durable witness was installed twice.');
  const nativeFetch = globalThis.fetch, binding = globalThis[configuration.bindingName];
  if (typeof nativeFetch !== 'function' || typeof binding !== 'function' || typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Native durable witness APIs are unavailable.');
  }
  globalThis[installed] = true;
  const documentId = globalThis.crypto.randomUUID();
  Object.defineProperty(globalThis, Symbol.for('pc10-proof-native-durable-document'), { value: documentId });
  binding(JSON.stringify({ schemaVersion: 1, documentId }));
  globalThis.fetch = function pc10NativeDurableFetch(...args) { return Reflect.apply(nativeFetch, this, args); };
}

/** Exact native request IDs own the metadata, response and terminal state.
 * The complete supported protocol body read is mandatory for this declared
 * mode, never a fallback for another collector. Everything retained here is
 * in Node; destroyed documents need not deliver response bytes or metadata.
 * Private IDs/bodies are temporary comparison inputs, never evidence fields. */
export function createPc10NativeDurableObservationLedger({ label, projectId, functionsOrigin, observedCalls, failures,
  readBody, boundaryFactory, presenceInstrumentationLimitation, now = Date.now, timeoutPort = { setTimeout, clearTimeout } }) {
  checkConfiguration(projectId, functionsOrigin);
  if (typeof readBody !== 'function' || typeof boundaryFactory !== 'function') throw new TypeError('Native durable collector ports are required.');
  const configuration = { projectId, functionsOrigin, callableActions: PC10_PROOF_CALLABLE_ACTIONS };
  const networks = new Map(), ignored = new Set(), contexts = new Map(), contextIdentities = new Map(), scripts = new Map();
  const documents = new Map(), mainFrames = new Set(), reported = new WeakMap();
  let expectedActorHash = null, expectedSessionHash = null, retainedBytes = 0, activeSnapshot = null, snapshotNumber = 0;
  const eventTime = state => Math.max(now(), state.trace.issuedAt);
  const report = (state, category) => {
    if (state && category !== 'response-observation-unavailable') state.strictFailure = true;
    const entries = state ? reported.get(state) ?? new Map() : null;
    const key = `${category}\0${state?.trace.bodyFailureStage ?? ''}`;
    if (entries?.has(key)) return;
    const value = { roleId: label, name: state?.trace.name ?? null, requestHash: state?.trace.requestHash ?? null,
      protocolRequestHash: state?.trace.protocolRequestHash ?? null, status: state?.trace.status ?? null, category };
    for (const field of ['bodyFailureStage', 'bodyReadFailureReason', 'nativeDocumentHash', 'nativeContextHash',
      'nativeFrameHash', 'nativeLoaderHash', 'nativeRequestObservedAt', 'issuedAfterDrainSnapshot', 'drainSnapshotHash']) {
      if (state?.trace[field] !== undefined) value[field] = state.trace[field];
    }
    if (state) { entries.set(key, value); reported.set(state, entries); }
    failures.push(value);
  };
  const boundary = boundaryFactory({ now,
    onFailure: (life, category) => report(life.owner, category),
    onBodyUnavailable: life => {
      life.trace.bodyObservationFailedAt ??= eventTime(life.owner);
      life.trace.failureCategory = 'response-observation-unavailable';
    },
    onCancellation: life => {
      const state = life.owner;
      if (state.trace.bodyFailureStage !== 'native-transport-failed') return;
      for (const [key, entry] of reported.get(state) ?? []) {
        if (!['unexpected-request-failure', 'response-observation-unavailable'].includes(entry.category)) continue;
        const index = failures.indexOf(entry); if (index !== -1) failures.splice(index, 1);
        reported.get(state).delete(key);
      }
    },
  });
  const failBody = (state, stage, reason) => {
    state.trace.bodyFailureStage ??= stage;
    if (reason) state.trace.bodyReadFailureReason = reason;
    state.body.reject(new Error('Native durable body evidence is unavailable.'));
    report(state, 'response-observation-unavailable');
  };
  const identityCheck = state => {
    const trace = state.trace, session = trace.sessionHash ?? trace.resultSessionHash;
    if ((expectedActorHash && trace.actorHash && trace.actorHash !== expectedActorHash) ||
        (expectedSessionHash && session && session !== expectedSessionHash)) report(state, 'native-identity-mismatch');
  };
  const witnessConflict = state => {
    state.witnessInvalid = true;
    report(state, 'native-document-conflict');
    state.witness.reject(new Error('Native durable document evidence conflicts.'));
  };
  const resolveWitness = state => {
    if (state.witnessInvalid || !state.wrapperScriptId) return;
    const script = scripts.get(state.wrapperScriptId), context = script?.context;
    const document = context?.documentId ? documents.get(context.documentId) : null;
    if (!script || !context || !document) return;
    if (script.invalid || context.invalid || script.url !== INIT_SOURCE || !mainFrames.has(context.frameId) ||
        context.frameId !== state.frameId || (document.loaderId && document.loaderId !== state.loaderId)) {
      witnessConflict(state); return;
    }
    if (state.witnessReady && state.documentId !== context.documentId) { witnessConflict(state); return; }
    document.loaderId ??= state.loaderId;
    state.documentId = context.documentId;
    Object.assign(state.trace, { nativeDocumentHash: witnessHash('document', context.documentId),
      nativeContextHash: witnessHash('context', context.uniqueId), nativeFrameHash: witnessHash('frame', state.frameId),
      nativeLoaderHash: witnessHash('loader', state.loaderId), nativeDocumentWitnessObservedAt: document.witnessedAt });
    state.witnessReady = true; state.witness.resolve();
  };
  const reconcile = () => { for (const state of networks.values()) resolveWitness(state); };
  const incompleteCancellation = state => state.trace.bodyFailureStage === 'native-transport-failed' &&
    state.trace.requestFailedAt !== null && state.trace.requestFinishedAt === null && !state.bodyAccepted &&
    ['cancelled-during-planned-offline', 'cancelled-during-planned-navigation'].includes(state.trace.observationDisposition);
  // An optional FUTURE functional contract can acknowledge only this exact
  // instrumentation limitation. It never repairs/removes the original trace,
  // failure or null body, and cannot rescue another lifecycle/budget failure.
  const presenceLimitation = state => typeof presenceInstrumentationLimitation === 'function' &&
    state.witnessReady && !state.witnessInvalid && !state.metadataInvalid && !state.strictFailure && !state.bodyAccepted &&
    state.trace.name === 'refreshPresence' && state.trace.presenceRequestClassification === 'periodic-session-only' &&
    state.trace.status === 200 && state.trace.requestFinishedAt !== null && state.trace.requestFailedAt === null &&
    state.trace.bodyFailureStage === 'native-get-response-body' && state.trace.bodyReadFailureReason === 'body-unavailable' &&
    presenceInstrumentationLimitation(Object.freeze({ ...state.trace })) === true;
  const pending = state => !state.lifecycle.terminalDone || !state.lifecycle.bodyDone ||
    (!state.bodyAccepted && !incompleteCancellation(state)) || !state.witnessReady;
  const timeoutFailure = state => {
    if (!state.witnessReady) report(state, 'native-document-unavailable');
    if (!state.lifecycle.terminalDone) report(state, 'unknown-callable-lifecycle');
    else if (!state.bodyAccepted && !incompleteCancellation(state)) report(state, 'native-body-incomplete');
  };
  const drainSnapshot = async () => {
    const targets = [...networks.values()].filter(pending);
    const entry = { kind: 'issued-native-durable-drain', startedAt: now(), completedAt: null, outcome: 'pending',
      snapshotHash: witnessHash('snapshot', `${label}:${++snapshotNumber}:${now()}`), issuedNativeTransports: targets.length,
      postSnapshotNativeTransports: 0 };
    boundary.boundaries.push(entry); activeSnapshot = entry;
    let timer, instrumentationLimitations = 0;
    try {
      await Promise.race([Promise.all(targets.map(async state => {
        await state.terminal.promise; await state.lifecycle.body;
        if (!state.bodyAccepted && !incompleteCancellation(state) && typeof presenceInstrumentationLimitation !== 'function') {
          throw new Error('Native durable actual bytes are unavailable.');
        }
        await state.witness.promise;
        if (state.witnessInvalid || state.metadataInvalid) {
          throw new Error('Native durable issued-set evidence is incomplete.');
        }
        if (!state.bodyAccepted && !incompleteCancellation(state)) {
          if (!presenceLimitation(state)) throw new Error('Native durable actual bytes are unavailable.');
          instrumentationLimitations++;
        }
      })), new Promise((_, reject) => {
        timer = timeoutPort.setTimeout(() => { for (const state of targets) if (pending(state)) timeoutFailure(state);
          reject(new Error('Native durable issued-set census exceeded the observation budget.')); }, OBSERVATION_BUDGET_MS);
      })]);
      if (now() - entry.startedAt > OBSERVATION_BUDGET_MS) {
        for (const state of targets) report(state, 'observation-drain-timeout');
        throw new Error('Native durable issued-set census exceeded the observation budget.');
      }
      entry.outcome = instrumentationLimitations ? 'completed-with-instrumentation-limitations' : 'completed';
      if (instrumentationLimitations) entry.instrumentationLimitations = instrumentationLimitations;
    } catch { entry.outcome = 'failed'; throw new Error('Native durable issued-set evidence is unavailable.'); }
    finally { timeoutPort.clearTimeout(timer); entry.completedAt = now(); if (activeSnapshot === entry) activeSnapshot = null; }
  };
  const readActualBody = state => {
    // Dispatch in the actual loadingFinished callback, before any await. This
    // never waits for document replacement or asks another request for bytes.
    let operation;
    try { operation = readBody(state.protocolId); }
    catch (error) { operation = Promise.reject(error); }
    const startedAt = now();
    let timer, heldBytes = 0, stopped = false;
    const deadline = deferred();
    const stop = (stage, reason) => { stopped = true; failBody(state, stage, reason);
      if (stage === 'native-body-timeout' && !state.witnessReady) report(state, 'native-document-unavailable');
      deadline.reject(new Error('Native durable capture is unavailable.')); };
    timer = timeoutPort.setTimeout(() => stop('native-body-timeout'), OBSERVATION_BUDGET_MS);
    void (async () => {
      let response;
      try { response = await Promise.race([operation, deadline.promise]); }
      catch (error) { if (!stopped) stop('native-get-response-body', safeBodyReadReason(error)); return; }
      if (stopped || state.trace.bodyFailureStage) return;
      if (now() - startedAt > OBSERVATION_BUDGET_MS) { stop('native-body-timeout'); return; }
      let bytes, parsed;
      try {
        if (!response || typeof response.body !== 'string' || typeof response.base64Encoded !== 'boolean') { stop('native-body-shape'); return; }
        if (response.base64Encoded) {
          if (response.body.length > Math.ceil(MAX_BODY_BYTES / 3) * 4) { stop('native-body-too-large'); return; }
          if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(response.body)) { stop('native-body-decode'); return; }
          bytes = Buffer.from(response.body, 'base64');
          if (bytes.toString('base64') !== response.body) { stop('native-body-decode'); return; }
        } else {
          if (Buffer.byteLength(response.body, 'utf8') > MAX_BODY_BYTES) { stop('native-body-too-large'); return; }
          bytes = Buffer.from(response.body, 'utf8');
        }
        if (!bytes.length) { stop('native-body-empty'); return; }
        if (bytes.length > MAX_BODY_BYTES) { stop('native-body-too-large'); return; }
        if (retainedBytes + bytes.length > MAX_TOTAL_BODY_BYTES) { stop('native-total-body-too-large'); return; }
        heldBytes = bytes.length; retainedBytes += heldBytes;
        let json;
        try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
        catch { stop('native-json-parse'); return; }
        parsed = parsePc10OriginResult(json, state.metadata, state.trace.status);
        if (parsed.failureStage) { stop(parsed.failureStage.replace(/^origin-/, 'native-')); return; }
        await Promise.race([state.witness.promise, deadline.promise]);
        if (stopped || state.witnessInvalid || state.trace.bodyFailureStage || state.trace.requestFailedAt !== null || state.metadataInvalid) return;
        if (now() - startedAt > OBSERVATION_BUDGET_MS) { stop('native-body-timeout'); return; }
        Object.assign(state.trace, { byteLength: bytes.length, bodyHash: createHash('sha256').update(bytes).digest('hex'),
          resultActorHash: digest('actor', parsed.actorUid), resultSessionHash: digest('session', parsed.sessionId),
          resultRequestHash: digest('request', parsed.requestId), resultGroupHash: digest('group', parsed.groupId),
          httpOutcome: parsed.outcome, resultStatus: parsed.resultStatus, revision: parsed.revision,
          connectionGeneration: parsed.connectionGeneration, denialCode: parsed.denialCode,
          bodyCompletedAt: eventTime(state), completedAt: eventTime(state), bodyObservedAt: eventTime(state) });
        state.trace.durationMs = state.trace.completedAt - state.trace.issuedAt;
        state.bodyAccepted = true; identityCheck(state);
        if (state.trace.status >= 500) report(state, 'native-unexpected-http-status');
        state.body.resolve();
      } catch {
        if (!stopped) stop('native-body-validation');
      } finally { retainedBytes -= heldBytes; heldBytes = 0; }
    })().finally(() => timeoutPort.clearTimeout(timer));
  };
  const callableUrl = value => {
    try { const url = new URL(value); return url.origin === functionsOrigin &&
      Object.hasOwn(PC10_PROOF_CALLABLE_ACTIONS, url.pathname.split('/').at(-1)); } catch { return false; }
  };
  return {
    captureMode: 'native-durable', observationBudgetMs: OBSERVATION_BUDGET_MS, boundaries: boundary.boundaries,
    network(stage, event) {
      const protocolId = event?.requestId;
      if (stage === 'request') {
        const request = event?.request;
        const metadata = parsePc10OriginRequest({ url: request?.url, method: request?.method,
          headers: request?.headers, body: request?.postData }, configuration);
        if (!metadata.matched) { if (opaque(protocolId)) ignored.add(protocolId); return; }
        if (!opaque(protocolId) || networks.has(protocolId) || ignored.has(protocolId)) { report(networks.get(protocolId), 'unknown-callable-lifecycle'); return; }
        const trace = createPc10CallableTrace({ name: metadata.name, transport: 'independent-browser-SDK', startedAt: now() });
        Object.assign(trace, { roleId: label, captureMode: 'native-durable', actorHash: digest('actor', metadata.actorUid),
          sessionHash: digest('session', metadata.sessionId), requestHash: digest('request', metadata.requestId),
          groupHash: digest('group', metadata.groupId), projectHash: digest('project', metadata.projectId),
          protocolRequestHash: createHash('sha256').update(`pc10-cdp-request\0${protocolId}`).digest('hex'), nativeRequestObservedAt: now() });
        if (metadata.name === 'refreshPresence') trace.presenceRequestClassification = classifyPc10PresenceRequest(metadata, request?.postData);
        if (activeSnapshot) { trace.issuedAfterDrainSnapshot = true; trace.drainSnapshotHash = activeSnapshot.snapshotHash; activeSnapshot.postSnapshotNativeTransports++; }
        const state = { trace, metadata, protocolId, frameId: event.frameId, loaderId: event.loaderId,
          body: deferred(), witness: deferred(), terminal: deferred(), bodyAccepted: false, witnessReady: false,
          metadataInvalid: Boolean(metadata.failureStage), witnessInvalid: false };
        state.lifecycle = boundary.start(trace); state.lifecycle.owner = state; boundary.capture(state.lifecycle, state.body.promise);
        networks.set(protocolId, state); observedCalls.push(trace);
        if (metadata.failureStage) { trace.bodyFailureStage = metadata.failureStage.replace(/^origin-/, 'native-');
          report(state, 'request-metadata-unavailable'); state.body.reject(new Error('Native durable metadata is unavailable.')); }
        const frames = event.initiator?.type === 'script' ? event.initiator.stack?.callFrames : null;
        const wrapperIds = Array.isArray(frames) ? [...new Set(frames.filter(frame => frame.functionName === 'pc10NativeDurableFetch' && opaque(frame.scriptId)).map(frame => frame.scriptId))] : [];
        if (!opaque(state.frameId) || !opaque(state.loaderId) || wrapperIds.length !== 1) {
          state.witnessInvalid = true; report(state, 'native-document-unavailable'); state.witness.reject(new Error('Native durable document evidence is unavailable.'));
        } else state.wrapperScriptId = wrapperIds[0];
        identityCheck(state); resolveWitness(state); return;
      }
      if (ignored.has(protocolId)) return;
      const state = networks.get(protocolId);
      if (!state) { if (stage === 'headers' && callableUrl(event?.response?.url)) report(null, 'unknown-callable-lifecycle'); return; }
      if (stage === 'headers') {
        const response = event?.response;
        if (state.trace.headersReceivedAt !== null || state.lifecycle.terminalDone || !Number.isSafeInteger(response?.status) || response.status < 100 || response.status > 599) {
          report(state, 'unknown-callable-lifecycle'); return;
        }
        state.trace.status = response.status; state.trace.headersReceivedAt = eventTime(state);
        let valid = false;
        try { valid = response.url === state.metadata.url && /^application\/json(?:\s*;.*)?$/i.test(new Headers(response.headers).get('Content-Type') ?? ''); }
        catch { /* Fixed safe header failure below. */ }
        if (!valid) failBody(state, 'native-response-headers');
      } else if (stage === 'finished') {
        if (state.lifecycle.terminalDone || state.trace.headersReceivedAt === null) { report(state, 'unknown-callable-lifecycle'); return; }
        state.trace.requestFinishedAt = eventTime(state); readActualBody(state); boundary.finish(state.lifecycle); state.terminal.resolve();
      } else if (stage === 'failed') {
        if (state.lifecycle.terminalDone) { report(state, 'unknown-callable-lifecycle'); return; }
        state.trace.requestFailedAt = eventTime(state);
        state.trace.transportError = event.errorText === 'net::ERR_ABORTED' ? 'aborted'
          : event.errorText === 'net::ERR_INTERNET_DISCONNECTED' ? 'internet-disconnected' : 'unknown';
        state.trace.transportCancelled = typeof event.canceled === 'boolean' ? event.canceled : null;
        state.trace.bodyFailureStage ??= 'native-transport-failed';
        boundary.fail(state.lifecycle, event.errorText); state.body.reject(new Error('Native durable actual transport failed.')); state.terminal.resolve();
      } else report(state, 'unknown-callable-lifecycle');
    },
    nativeFrame(event) {
      const frame = event?.frame;
      if (frame?.parentId !== undefined) return;
      if (!opaque(frame?.id)) { report(null, 'native-document-conflict'); return; }
      mainFrames.add(frame.id); reconcile();
    },
    nativeContext(event) {
      const context = event?.context;
      if (context?.auxData?.isDefault !== true) return;
      if (!Number.isSafeInteger(context.id) || context.id < 1 || !opaque(context.uniqueId) || !opaque(context.auxData.frameId)) { report(null, 'native-document-conflict'); return; }
      const prior = contextIdentities.get(context.id);
      if (prior && (prior.uniqueId !== context.uniqueId || prior.frameId !== context.auxData.frameId)) {
        prior.invalid = true; report(null, 'native-document-conflict'); reconcile(); return;
      }
      if (contexts.has(context.id)) return;
      const value = { uniqueId: context.uniqueId, frameId: context.auxData.frameId, documentId: null };
      contextIdentities.set(context.id, value); contexts.set(context.id, value);
      for (const script of scripts.values()) if (!script.context && script.executionContextId === context.id) script.context = value;
      reconcile();
    },
    nativeScript(event) {
      if (!opaque(event?.scriptId) || !Number.isSafeInteger(event.executionContextId)) return;
      const context = contexts.get(event.executionContextId), prior = scripts.get(event.scriptId);
      if (prior && ((prior.context && context && prior.context !== context) || prior.url !== event.url)) {
        prior.invalid = true; report(null, 'native-document-conflict'); reconcile(); return;
      }
      scripts.set(event.scriptId, { executionContextId: event.executionContextId, context: prior?.context ?? context ?? null, url: event.url }); reconcile();
    },
    nativeContextDestroyed(event) { contexts.delete(event?.executionContextId); },
    nativeContextsCleared() { contexts.clear(); },
    nativeDocument(event) {
      if (event?.name !== DOCUMENT_BINDING) return;
      let payload;
      try { if (typeof event.payload !== 'string' || event.payload.length > 256) throw new Error('Invalid witness.'); payload = JSON.parse(event.payload); }
      catch { report(null, 'native-document-conflict'); return; }
      const context = contexts.get(event.executionContextId), document = documents.get(payload?.documentId);
      if (!context || context.invalid || !mainFrames.has(context.frameId) || payload?.schemaVersion !== 1 || !uuid(payload.documentId) ||
          Object.keys(payload).sort().join('|') !== 'documentId|schemaVersion' ||
          (context.documentId && context.documentId !== payload.documentId) || (document && document.context !== context)) {
        report(null, 'native-document-conflict'); return;
      }
      context.documentId = payload.documentId;
      if (!document) documents.set(payload.documentId, { context, loaderId: null, witnessedAt: now() });
      reconcile();
    },
    bindIdentity(actorUid, sessionId) {
      if (!canonical(actorUid) || (sessionId !== undefined && !canonical(sessionId))) throw new TypeError('Native durable identity binding is malformed.');
      expectedActorHash = digest('actor', actorUid); if (sessionId !== undefined) expectedSessionHash = digest('session', sessionId);
      for (const state of networks.values()) identityCheck(state);
    },
    drain: drainSnapshot,
    async transition(kind, operation) { if (kind === 'reload') await drainSnapshot(); return boundary.transition(kind, operation); },
  };
}

/** Explicit supported native-durable mode. Initialization must finish before
 * the actor starts app navigation. The per-context configured ceiling is8MiB
 * (21 contexts:168MiB); network-service global pressure may still evict bytes.
 * There is no retry or fallback. Protocol body provenance is an exact actual
 * getResponseBody result with durability configured; Chromium may internally
 * serve local data, so this code does not claim a particular backend store. */
export async function createPc10NativeDurableBrowserCapture({ context, page, label, projectId, functionsOrigin,
  observedCalls, failures, boundaryFactory, presenceInstrumentationLimitation }) {
  checkConfiguration(projectId, functionsOrigin);
  let cdp;
  try {
    cdp = await context.newCDPSession(page);
    const ledger = createPc10NativeDurableObservationLedger({ label, projectId, functionsOrigin, observedCalls, failures,
      boundaryFactory, presenceInstrumentationLimitation, readBody: requestId => cdp.send('Network.getResponseBody', { requestId }) });
    for (const [name, method] of [['Runtime.executionContextCreated', 'nativeContext'], ['Runtime.executionContextDestroyed', 'nativeContextDestroyed'],
      ['Runtime.executionContextsCleared', 'nativeContextsCleared'], ['Runtime.bindingCalled', 'nativeDocument'], ['Debugger.scriptParsed', 'nativeScript'], ['Page.frameNavigated', 'nativeFrame']]) {
      cdp.on(name, event => ledger[method](event));
    }
    for (const [name, stage] of [['Network.requestWillBeSent', 'request'], ['Network.responseReceived', 'headers'],
      ['Network.loadingFinished', 'finished'], ['Network.loadingFailed', 'failed']]) cdp.on(name, event => ledger.network(stage, event));
    const buffers = { maxTotalBufferSize: MAX_TOTAL_BODY_BYTES, maxResourceBufferSize: MAX_BODY_BYTES };
    await cdp.send('Network.enable', buffers);
    await cdp.send('Network.configureDurableMessages', buffers);
    await cdp.send('Runtime.enable'); await cdp.send('Debugger.enable');
    await cdp.send('Runtime.addBinding', { name: DOCUMENT_BINDING });
    await cdp.send('Page.enable');
    const tree = await cdp.send('Page.getFrameTree');
    if (!opaque(tree?.frameTree?.frame?.id) || tree.frameTree.frame.parentId !== undefined) throw new Error('Native frame unavailable.');
    ledger.nativeFrame({ frame: tree.frameTree.frame });
    await context.addInitScript({ content: `(${installPc10NativeDurableWitness.toString()})(${JSON.stringify({ bindingName: DOCUMENT_BINDING })});\n//# sourceURL=${INIT_SOURCE}` });
    return { ...ledger, close: () => cdp.detach() };
  } catch {
    await cdp?.detach().catch(() => undefined);
    throw new Error('Native durable collector setup is unavailable.');
  }
}
