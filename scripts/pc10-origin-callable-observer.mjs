import { createHash } from 'node:crypto';
import { PC10_PROOF_CALLABLE_ACTIONS, createPc10CallableTrace } from './pc10-proof-diagnostics.mjs';

const MAX_BODY_BYTES = 512 * 1024;
const MAX_TOTAL_BODY_BYTES = 8 * 1024 * 1024;
const OBSERVATION_BUDGET_MS = 10_000;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = (kind, value) => id(value)
  ? createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex') : null;

/** Self-contained: this exact function also executes in the originating realm.
 * It returns private comparison metadata, never an evidence object. */
export function parsePc10OriginRequest(request, configuration) {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const canonical = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  let url;
  try { url = new URL(request.url); } catch { return { matched: false }; }
  const name = url.pathname.split('/').at(-1);
  if (url.origin !== configuration.functionsOrigin || !Object.hasOwn(configuration.callableActions, name) ||
      request.method !== 'POST') return { matched: false };
  const invalid = failureStage => ({ matched: true, name, failureStage });
  if (url.pathname !== `/${configuration.projectId}/us-central1/${name}` || url.search || url.hash ||
      url.username || url.password) return invalid('origin-project-mismatch');
  try {
    const headers = new Headers(request.headers);
    if (!/^application\/json(?:\s*;.*)?$/i.test(headers.get('Content-Type') ?? '')) return invalid('origin-request-headers');
    const authorization = headers.get('Authorization');
    if (typeof authorization !== 'string' || authorization.length > 32_768 ||
        !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(authorization)) return invalid('origin-bearer-invalid');
    const parts = authorization.slice(7).split('.');
    const decode = value => {
      const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0))));
    };
    const header = decode(parts[0]), claims = decode(parts[1]);
    if (!record(header) || !['none', 'RS256'].includes(header.alg) ||
        (header.alg === 'none' ? parts[2] !== '' : parts[2] === '') || !record(claims) ||
        claims.aud !== configuration.projectId || claims.iss !== `https://securetoken.google.com/${configuration.projectId}` ||
        !canonical(claims.sub) || claims.user_id !== claims.sub ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000) ||
        !Number.isSafeInteger(claims.iat) || claims.iat < 0) return invalid('origin-bearer-invalid');
    if (typeof request.body !== 'string' || new TextEncoder().encode(request.body).byteLength > 512 * 1024) {
      return invalid('origin-request-envelope');
    }
    const envelope = JSON.parse(request.body);
    if (!record(envelope) || Object.keys(envelope).length !== 1 || !Object.hasOwn(envelope, 'data') ||
        !record(envelope.data)) return invalid('origin-request-envelope');
    const data = envelope.data;
    for (const field of ['sessionId', 'requestId', 'expectedGroupId']) {
      if (Object.hasOwn(data, field) && !canonical(data[field])) return invalid('origin-request-envelope');
    }
    if (!['joinSession', 'createSession'].includes(name) && !canonical(data.sessionId)) return invalid('origin-request-envelope');
    if (['claimSeat', 'sendFleetGroupMessage', 'publishPressDispatch'].includes(name) && !canonical(data.requestId)) {
      return invalid('origin-request-envelope');
    }
    if (name === 'joinSession' && (typeof data.joinCode !== 'string' || !/^[0-9]{4,8}$/.test(data.joinCode))) {
      return invalid('origin-request-envelope');
    }
    return { matched: true, name, url: url.href, projectId: configuration.projectId, actorUid: claims.sub,
      sessionId: data.sessionId ?? null, requestId: data.requestId ?? null, groupId: data.expectedGroupId ?? null };
  } catch { return invalid('origin-request-envelope'); }
}

/** Self-contained result validation for the actual bytes read from the clone.
 * Private identities are compared here and hashed before the Node binding. */
export function parsePc10OriginResult(reply, metadata, status) {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const canonical = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  const invalid = failureStage => ({ failureStage });
  const codes = ['unauthenticated', 'permission-denied', 'invalid-argument', 'resource-exhausted',
    'failed-precondition', 'not-found', 'aborted', 'unavailable', 'deadline-exceeded', 'internal', 'cancelled'];
  if (!record(reply) || Object.keys(reply).length !== 1) return invalid('origin-reply-envelope');
  if (Object.hasOwn(reply, 'error')) {
    if (!record(reply.error)) return invalid('origin-reply-envelope');
    const code = reply.error.status ?? reply.error.code;
    const normalized = typeof code === 'string' ? code.replace(/^functions\//, '').toLowerCase().replaceAll('_', '-') : '';
    if (!codes.includes(normalized)) return invalid('origin-reply-envelope');
    return { outcome: 'error', denialCode: normalized, resultStatus: null, revision: null,
      connectionGeneration: null, actorUid: null, sessionId: null, requestId: null, groupId: null };
  }
  const result = Object.hasOwn(reply, 'data') ? reply.data : reply.result;
  if (status < 200 || status >= 300 || !record(result)) return invalid('origin-reply-envelope');
  const actors = [result.actorUid, result.player?.uid].filter(value => value !== undefined);
  const sessions = [result.sessionId, result.session?.id, result.player?.sessionId].filter(value => value !== undefined);
  const requests = [result.requestId, result.messageId, result.dispatchId].filter(value => value !== undefined);
  const groups = [result.groupId].filter(value => value !== undefined);
  if (actors.some(value => !canonical(value) || value !== metadata.actorUid)) return invalid('origin-actor-mismatch');
  if (sessions.some(value => !canonical(value) || (metadata.sessionId !== null && value !== metadata.sessionId)) ||
      new Set(sessions).size > 1) return invalid('origin-session-mismatch');
  if (requests.some(value => !canonical(value) || metadata.requestId === null || value !== metadata.requestId)) {
    return invalid('origin-request-mismatch');
  }
  if (groups.some(value => !canonical(value) || (metadata.groupId !== null && value !== metadata.groupId))) {
    return invalid('origin-group-mismatch');
  }
  if (metadata.name === 'getCurrentMemberSession' &&
      (result.actorUid !== metadata.actorUid || result.sessionId !== metadata.sessionId)) return invalid('origin-reply-identity-missing');
  if (['joinSession', 'resumeSession'].includes(metadata.name) &&
      (!record(result.player) || result.player.uid !== metadata.actorUid || !record(result.session) || !canonical(result.session.id))) {
    return invalid('origin-reply-identity-missing');
  }
  if (Object.hasOwn(result, 'revision') && (!Number.isSafeInteger(result.revision) || result.revision < 0)) {
    return invalid('origin-reply-envelope');
  }
  if (Object.hasOwn(result, 'connectionGeneration') &&
      (!Number.isSafeInteger(result.connectionGeneration) || result.connectionGeneration < 1)) return invalid('origin-reply-envelope');
  return { outcome: 'result', denialCode: null, resultStatus: ['committed', 'replayed'].includes(result.status) ? result.status : null,
    revision: result.revision ?? null, connectionGeneration: result.connectionGeneration ?? null,
    actorUid: actors[0] ?? null, sessionId: sessions[0] ?? null, requestId: requests[0] ?? null, groupId: groups[0] ?? null };
}

/** Installed before application modules. One unchanged native fetch per call.
 * Clone consumption and binding acknowledgement precede returning the original
 * Response. That ordering overhead is measured, not hidden as native latency. */
export function installPc10OriginCallableFetch(configuration, parseRequest, parseResult) {
  const installed = Symbol.for('pc10-proof-origin-fetch');
  if (globalThis[installed]) throw new Error('Origin collector was installed twice in one document.');
  const nativeFetch = globalThis.fetch;
  const binding = globalThis[configuration.bindingName];
  if (typeof nativeFetch !== 'function' || typeof binding !== 'function' || !globalThis.crypto?.subtle ||
      typeof globalThis.crypto.randomUUID !== 'function') throw new Error('Origin collector APIs are unavailable.');
  globalThis[installed] = true;
  const documentId = crypto.randomUUID();
  if (configuration.documentWitness) {
    Object.defineProperty(globalThis, Symbol.for('pc10-proof-origin-document'), { value: documentId });
    // Notification and witness observation never postpone the native fetch.
    void Promise.resolve(binding({ schemaVersion: 1, stage: 'document', documentId })).catch(() => undefined);
  }
  let counter = 0, retainedBytes = 0;
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(value => value.toString(16).padStart(2, '0')).join('');
  const hashed = (kind, value) => value === null ? Promise.resolve(null)
    : digest(new TextEncoder().encode(`security-denial-${kind}\0${value}`));
  globalThis.fetch = function pc10OriginFetch(...args) {
    const [input, options] = args;
    const privateRequest = { url: typeof input === 'string' ? input : input?.url ?? String(input),
      method: options?.method ?? input?.method ?? 'GET', headers: options?.headers ?? input?.headers,
      body: options?.body };
    const metadata = parseRequest(privateRequest, configuration);
    if (!metadata.matched) return Reflect.apply(nativeFetch, this, args);
    const originId = `${documentId}:${++counter}`;
    const issuedAt = Date.now();
    const send = packet => {
      try { return Promise.resolve(binding({ schemaVersion: 1, originId, name: metadata.name, ...packet })); }
      catch { return Promise.reject(new Error('Origin binding is unavailable.')); }
    };
    const issued = send({ stage: 'issued', at: issuedAt });
    // Dispatch without awaiting hashing, a binding acknowledgement or a clone.
    let nativeOperation;
    try { nativeOperation = Reflect.apply(nativeFetch, this, args); }
    catch (error) { nativeOperation = Promise.reject(error); }
    let stopped = false;
    const requestDelivery = (async () => {
      const values = metadata.failureStage ? [null, null, null, null, null] : await Promise.all([
        hashed('actor', metadata.actorUid), hashed('session', metadata.sessionId), hashed('request', metadata.requestId),
        hashed('group', metadata.groupId), hashed('project', metadata.projectId),
      ]);
      const acknowledgement = await issued;
      if (acknowledgement?.ok !== true) throw new Error('Origin binding rejected the issued record.');
      if (stopped) return;
      const accepted = await send({ stage: 'metadata', at: Date.now(), actorHash: values[0], sessionHash: values[1],
        requestHash: values[2], groupHash: values[3], projectHash: values[4], failureStage: metadata.failureStage ?? null });
      if (accepted?.ok !== true) throw new Error('Origin binding rejected request metadata.');
    })();
    void requestDelivery.catch(() => undefined);
    const safeFailure = async (stage, at) => {
      try { await requestDelivery; } catch { /* The census still requires this missing binding. */ }
      return send({ stage: 'failure', at, failureStage: stage }).catch(() => undefined);
    };
    return (async () => {
      let original;
      try { original = await nativeOperation; }
      catch (error) {
        let category = 'origin-fetch-failed';
        try { if (error?.name === 'AbortError') category = 'origin-fetch-aborted'; } catch { /* Safe fixed enum only. */ }
        void safeFailure(category, Date.now());
        throw error;
      }
      const headersAt = Date.now();
      let timer, reader, byteLength = 0, chunks = [], failureStage = null;
      const fail = stage => { failureStage = stage; throw new Error('Origin observation failed.'); };
      const capture = (async () => {
        await requestDelivery;
        if (stopped) return;
        if (metadata.failureStage) fail(metadata.failureStage);
        if (!Number.isSafeInteger(original?.status) || original.status < 100 || original.status > 599 ||
            original.url !== metadata.url || original.redirected || original.bodyUsed ||
            !/^application\/json(?:\s*;.*)?$/i.test(original.headers?.get('Content-Type') ?? '')) fail('origin-response-headers');
        const acknowledgement = await send({ stage: 'headers', at: headersAt, status: original.status });
        if (acknowledgement?.ok !== true) fail('origin-binding-unavailable');
        if (stopped) return;
        let clone;
        try { clone = original.clone(); reader = clone.body?.getReader(); } catch { fail('origin-clone-unavailable'); }
        if (!reader) fail('origin-clone-unavailable');
        while (!stopped) {
          let part;
          try { part = await reader.read(); } catch { fail('origin-body-read-failed'); }
          if (stopped) return;
          if (!part || typeof part.done !== 'boolean') fail('origin-body-read-failed');
          if (part.done) break;
          if (!(part.value instanceof Uint8Array)) fail('origin-body-read-failed');
          if (part.value.byteLength === 0) continue;
          byteLength += part.value.byteLength;
          if (byteLength > 512 * 1024) fail('origin-body-too-large');
          if (retainedBytes + part.value.byteLength > 8 * 1024 * 1024) fail('origin-total-body-too-large');
          retainedBytes += part.value.byteLength;
          chunks.push(part.value);
        }
        if (byteLength === 0) fail('origin-body-empty');
        const bytes = new Uint8Array(byteLength);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        let reply;
        try { reply = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
        catch { fail('origin-json-parse'); }
        const result = parseResult(reply, metadata, original.status);
        if (result.failureStage) fail(result.failureStage);
        const values = await Promise.all([digest(bytes), hashed('actor', result.actorUid),
          hashed('session', result.sessionId), hashed('request', result.requestId), hashed('group', result.groupId)]);
        if (stopped) return;
        const bodyCompletedAt = Date.now();
        const accepted = await send({ stage: 'body', at: bodyCompletedAt, byteLength, bodyHash: values[0],
          resultActorHash: values[1], resultSessionHash: values[2], resultRequestHash: values[3], resultGroupHash: values[4],
          outcome: result.outcome, resultStatus: result.resultStatus, revision: result.revision,
          connectionGeneration: result.connectionGeneration, denialCode: result.denialCode });
        if (accepted?.ok !== true) fail('origin-binding-unavailable');
      })();
      try {
        await Promise.race([capture, new Promise((_, reject) => {
          timer = setTimeout(() => { failureStage = 'origin-observation-timeout'; reject(new Error('Origin observation timed out.')); }, 10_000);
        })]);
      } catch {
        stopped = true;
        void safeFailure(failureStage ?? 'origin-binding-unavailable', Date.now());
        if (reader) void reader.cancel().catch(() => undefined); // Cancel only our tee branch, never the request or original body.
      } finally {
        clearTimeout(timer);
        retainedBytes -= chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        chunks = [];
      }
      if (!stopped) {
        const returnedAt = Date.now();
        // The required bytes and metadata have already been acknowledged. This
        // timestamp records return intent in the same turn as returning the
        // original Response; its diagnostic acknowledgement adds no new wait.
        void send({ stage: 'returned', at: returnedAt, overheadMs: returnedAt - headersAt })
          .catch(() => { void safeFailure('origin-binding-unavailable', Date.now()); });
      }
      return original;
    })();
  };
}

const stages = {
  issued: ['at'], metadata: ['at', 'actorHash', 'sessionHash', 'requestHash', 'groupHash', 'projectHash', 'failureStage'],
  headers: ['at', 'status'], body: ['at', 'byteLength', 'bodyHash', 'resultActorHash', 'resultSessionHash',
    'resultRequestHash', 'resultGroupHash', 'outcome', 'resultStatus', 'revision', 'connectionGeneration', 'denialCode'],
  returned: ['at', 'overheadMs'], failure: ['at', 'failureStage'],
};
const failureStages = new Set(['origin-project-mismatch', 'origin-request-headers', 'origin-bearer-invalid',
  'origin-request-envelope', 'origin-response-headers', 'origin-clone-unavailable', 'origin-body-read-failed',
  'origin-body-too-large', 'origin-total-body-too-large', 'origin-body-empty', 'origin-json-parse',
  'origin-reply-envelope', 'origin-actor-mismatch', 'origin-session-mismatch', 'origin-request-mismatch',
  'origin-group-mismatch', 'origin-reply-identity-missing', 'origin-fetch-failed', 'origin-fetch-aborted',
  'origin-observation-timeout', 'origin-binding-unavailable']);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
};

function checkConfiguration(projectId, functionsOrigin) {
  if (typeof projectId !== 'string' || !/^demo-[a-z0-9-]+$/.test(projectId)) throw new TypeError('Origin collector requires a local demo project.');
  let url;
  try { url = new URL(functionsOrigin); } catch { throw new TypeError('Origin collector requires a loopback Functions origin.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port ||
      url.origin !== functionsOrigin || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('Origin collector requires a loopback Functions origin.');
  }
}

/** Evidence and lifecycle state live in Node and therefore survive documents.
 * Origin result binding is its actual closure, not a guessed CDP body lookup.
 * Exact-ID CDP records independently reconcile the request metadata census.
 * Identical wire requests are paired in dispatch order for lifecycle accounting;
 * their result bytes remain bound independently by their unique origin IDs. */
export function createPc10OriginObservationLedger({ label, projectId, functionsOrigin, observedCalls, failures,
  boundaryFactory, now = Date.now, timeoutPort = { setTimeout, clearTimeout }, requireDocumentWitness = false }) {
  checkConfiguration(projectId, functionsOrigin);
  const configuration = { projectId, functionsOrigin, callableActions: PC10_PROOF_CALLABLE_ACTIONS };
  const origins = new Map(), networks = new Map(), ignored = new Set();
  const byState = new WeakMap();
  const originForProtocol = new WeakMap();
  const documents = new Map(), contexts = new Map(), contextIdentities = new Map(), scripts = new Map();
  const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,256}$/.test(value);
  const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
  const witnessHash = (kind, value) => createHash('sha256').update(`pc10-origin-${kind}\0${value}`).digest('hex');
  let navigationSnapshot = null, snapshotCounter = 0;
  let expectedActorHash = null, expectedSessionHash = null;
  const report = (state, category, extra = {}) => {
    const entries = state ? byState.get(state) ?? new Map() : null;
    const entryKey = `${category}\0${extra.bodyFailureStage ?? state?.bodyFailureStage ?? ''}`;
    if (entries?.has(entryKey)) return;
    const value = { roleId: label, name: state?.trace.name ?? null, requestHash: state?.trace.requestHash ?? null,
      originRequestHash: state?.trace.originRequestHash ?? null, status: state?.trace.status ?? null, category, ...extra };
    for (const field of ['originDocumentHash', 'nativeDocumentHash', 'nativeContextHash', 'nativeFrameHash',
      'nativeLoaderHash', 'originIssuedObservedAt', 'originMetadataObservedAt']) {
      if (state?.trace[field] !== undefined) value[field] = state.trace[field];
    }
    if (state?.bodyFailureStage) value.bodyFailureStage = state.bodyFailureStage;
    if (state) { entries.set(entryKey, value); byState.set(state, entries); }
    failures.push(value);
  };
  const boundary = boundaryFactory({ now,
    onFailure: (state, category) => report(originForProtocol.get(state) ?? state, category),
    onBodyUnavailable: ({ trace }) => { trace.bodyObservationFailedAt = now(); trace.failureCategory = 'response-observation-unavailable'; },
    onCancellation: state => {
      const observed = originForProtocol.get(state) ?? state;
      for (const [entryKey, failure] of byState.get(observed) ?? []) {
        if (!['unexpected-request-failure', 'response-observation-unavailable'].includes(failure.category) ||
            (failure.bodyFailureStage && !['origin-fetch-failed', 'origin-fetch-aborted'].includes(failure.bodyFailureStage))) continue;
        const index = failures.indexOf(failure);
        if (index !== -1) failures.splice(index, 1);
        byState.get(observed).delete(entryKey);
      }
    },
  });
  const key = value => JSON.stringify([value.name, value.actorHash, value.projectHash, value.sessionHash,
    value.requestHash, value.groupHash]);
  const networkDetails = network => ({ name: network.name, requestHash: network.requestHash,
    protocolRequestHash: network.protocolRequestHash, nativeRequestObservedAt: network.observedAt,
    ...(network.documentId ? { nativeDocumentHash: witnessHash('document', network.documentId) } : {}),
    ...(network.status !== undefined ? { nativeHeadersStatus: network.status } : {}) });
  const resolveWitness = network => {
    if (!requireDocumentWitness || network.documentId || network.witnessInvalid) return;
    const script = scripts.get(network.wrapperScriptId);
    const context = script?.context;
    const document = context?.documentId ? documents.get(context.documentId) : undefined;
    if (!document || !context) return;
    if (script.invalid || context.frameId !== network.frameId ||
        (document.loaderId && document.loaderId !== network.loaderId)) {
      network.witnessInvalid = true;
      report(null, 'origin-document-witness-conflict', networkDetails(network)); return;
    }
    document.loaderId ??= network.loaderId;
    network.documentId = context.documentId;
    network.contextHash = witnessHash('context', context.uniqueId);
  };
  const identityCheck = state => {
    const trace = state.trace;
    const actualSession = trace.sessionHash ?? trace.resultSessionHash;
    if ((expectedActorHash && trace.actorHash && trace.actorHash !== expectedActorHash) ||
        (expectedSessionHash && actualSession && actualSession !== expectedSessionHash)) report(state, 'origin-identity-mismatch');
  };
  const checkCompleteCancellation = state => {
    if (state.bodyAccepted && state.network?.failedAt !== null && state.network?.failedAt !== undefined) {
      // A late binding cannot keep an earlier incomplete-transport disposition
      // after it supplies complete bytes. Retain both observations as failure.
      delete state.trace.observationDisposition;
      delete state.trace.transitionStartedAt;
      report(state, 'origin-transport-mismatch');
    }
  };
  const applyNetwork = network => {
    const state = network.origin;
    if (!state) return;
    if (network.headersAt !== null && state.trace.networkHeadersObservedAt === undefined) {
      state.trace.networkHeadersObservedAt = network.headersAt;
      state.trace.nativeHeadersStatus = network.status;
      state.networkHeadersStatus = network.status;
      if (state.trace.status !== null && state.trace.status !== network.status) report(state, 'origin-transport-mismatch');
    }
    if (network.finishedAt !== null && state.trace.requestFinishedAt === null) {
      state.trace.requestFinishedAt = network.finishedAt;
    }
    if (network.failedAt !== null && state.trace.requestFailedAt === null) {
      state.trace.requestFailedAt = network.failedAt;
      state.trace.transportError = network.error === 'net::ERR_ABORTED' ? 'aborted'
        : network.error === 'net::ERR_INTERNET_DISCONNECTED' ? 'internet-disconnected' : 'unknown';
      state.trace.transportCancelled = network.canceled;
      state.bodyFailureStage ??= 'origin-fetch-failed';
      state.originBody.reject(new Error('Original callable fetch failed.'));
    }
    checkCompleteCancellation(state);
  };
  const reconcile = () => {
    for (const network of networks.values()) resolveWitness(network);
    for (const state of origins.values()) {
      if (!state.metadataReady || state.network || state.metadataInvalid) continue;
      // Hashing may complete out of order. Do not pair a later issued origin
      // before an earlier same-name metadata packet has arrived.
      const earlierUnknown = [...origins.values()].some(prior => prior.order < state.order &&
        prior.documentId === state.documentId && prior.trace.name === state.trace.name && !prior.metadataReady);
      if (earlierUnknown) continue;
      const match = [...networks.values()].find(network => !network.origin && !network.invalid && !network.witnessInvalid &&
        (!requireDocumentWitness || network.documentId === state.documentId) && key(network) === key(state.trace));
      if (!match) continue;
      match.origin = state; state.network = match;
      state.trace.protocolRequestHash = match.protocolRequestHash;
      if (requireDocumentWitness) {
        Object.assign(state.trace, { nativeDocumentHash: witnessHash('document', match.documentId),
          nativeContextHash: match.contextHash, nativeFrameHash: witnessHash('frame', match.frameId),
          nativeLoaderHash: witnessHash('loader', match.loaderId), nativeRequestObservedAt: match.observedAt,
          originDocumentWitnessObservedAt: documents.get(match.documentId).witnessedAt });
      }
      applyNetwork(match);
      // The boundary state was created at the actual exact-ID request event.
      // Its intent/failure observation survives a later metadata binding reply.
      const protocol = match.lifecycle;
      Object.assign(state.trace, { ...protocol.trace, ...state.trace });
      protocol.trace = state.trace;
      protocol.bodyFailureStage = state.bodyFailureStage;
      originForProtocol.set(protocol, state);
      state.originBody.promise.then(match.bodyCompletion.resolve, match.bodyCompletion.reject);
      state.networkReady.resolve(match); match.originReady.resolve(state);
    }
  };
  const genuineIncompleteCancellation = state => ['cancelled-during-planned-offline', 'cancelled-during-planned-navigation']
    .includes(state.trace.observationDisposition) && state.network?.failedAt !== null && state.network?.failedAt !== undefined &&
    (!state.failureReceived || ['origin-fetch-failed', 'origin-fetch-aborted'].includes(state.bodyFailureStage));
  const snapshotPending = () => {
    const pendingOrigins = [...origins.values()].filter(state => !state.network ||
      !state.network.lifecycle.terminalDone || !state.network.lifecycle.bodyDone || !state.metadataReady ||
      (!state.bodyAccepted && !genuineIncompleteCancellation(state)));
    const pendingNetworks = [...networks.values()].filter(network => !network.origin ||
      !network.lifecycle.terminalDone || !network.lifecycle.bodyDone);
    const value = { kind: 'issued-origin-pre-navigation-drain', startedAt: now(), completedAt: null,
      snapshotHash: witnessHash('navigation-snapshot', `${label}:${++snapshotCounter}:${now()}`),
      issuedOrigins: pendingOrigins.length, nativeTransports: pendingNetworks.length, postSnapshotOrigins: 0,
      outcome: 'pending' };
    boundary.boundaries.push(value);
    return { evidence: value, origins: pendingOrigins, networks: pendingNetworks };
  };
  const waitSnapshot = async snapshot => {
    const waitOrigin = async state => {
      await state.metadataDelivered.promise;
      if (state.metadataInvalid) throw new Error('Origin callable pre-navigation metadata is invalid.');
      const network = await state.networkReady.promise;
      await network.terminalReady.promise; await network.lifecycle.body;
      if ((!state.bodyAccepted && !genuineIncompleteCancellation(state)) || (state.failureReceived &&
          !['origin-fetch-failed', 'origin-fetch-aborted'].includes(state.bodyFailureStage))) {
        report(state, 'origin-body-incomplete');
        throw new Error('Origin callable pre-navigation body is unavailable.');
      }
    };
    let timer;
    try {
      await Promise.race([Promise.all([
        ...snapshot.origins.map(waitOrigin),
        ...snapshot.networks.map(async network => { const state = await network.originReady.promise; await waitOrigin(state); }),
      ]), new Promise((_, reject) => {
        timer = timeoutPort.setTimeout(() => {
          for (const state of snapshot.origins) {
            if (!state.metadataReady) report(state, 'origin-request-unaccounted');
            else if (!state.bodyAccepted) report(state, 'origin-body-incomplete');
            else if (!state.network || !state.network.lifecycle.terminalDone) report(state, 'unknown-callable-lifecycle');
          }
          for (const network of snapshot.networks) {
            if (!network.origin) report(null, !network.documentId && requireDocumentWitness
              ? 'origin-native-document-unavailable' : 'origin-request-unaccounted', networkDetails(network));
          }
          reject(new Error('Origin callable pre-navigation census exceeded the observation budget.'));
        }, OBSERVATION_BUDGET_MS);
      })]);
      snapshot.evidence.outcome = 'completed';
    } catch (error) { snapshot.evidence.outcome = 'failed'; throw error; }
    finally { timeoutPort.clearTimeout(timer); snapshot.evidence.completedAt = now(); }
  };
  const validPacket = packet => {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet) || packet.schemaVersion !== 1 ||
        typeof packet.originId !== 'string' || !/^[a-f0-9-]{36}:[1-9][0-9]*$/.test(packet.originId) ||
        !Object.hasOwn(PC10_PROOF_CALLABLE_ACTIONS, packet.name) || !Object.hasOwn(stages, packet.stage) ||
        !Number.isFinite(packet.at) || packet.at < 0) return false;
    const allowed = ['schemaVersion', 'originId', 'name', 'stage', ...stages[packet.stage]];
    if (Object.keys(packet).length !== allowed.length || Object.keys(packet).some(field => !allowed.includes(field))) return false;
    for (const field of ['actorHash', 'sessionHash', 'requestHash', 'groupHash', 'projectHash', 'bodyHash',
      'resultActorHash', 'resultSessionHash', 'resultRequestHash', 'resultGroupHash']) {
      if (Object.hasOwn(packet, field) && packet[field] !== null && !hex(packet[field])) return false;
    }
    if (Object.hasOwn(packet, 'failureStage') && packet.failureStage !== null && !failureStages.has(packet.failureStage)) return false;
    if (packet.stage === 'failure' && !failureStages.has(packet.failureStage)) return false;
    if (packet.stage === 'headers' && (!Number.isSafeInteger(packet.status) || packet.status < 100 || packet.status > 599)) return false;
    if (packet.stage === 'returned' && (!Number.isFinite(packet.overheadMs) || packet.overheadMs < 0)) return false;
    if (packet.stage === 'body' && (!Number.isSafeInteger(packet.byteLength) || packet.byteLength < 1 || packet.byteLength > MAX_BODY_BYTES ||
        !hex(packet.bodyHash) || !['result', 'error'].includes(packet.outcome) ||
        ![null, 'committed', 'replayed'].includes(packet.resultStatus) ||
        (packet.revision !== null && (!Number.isSafeInteger(packet.revision) || packet.revision < 0)) ||
        (packet.connectionGeneration !== null && (!Number.isSafeInteger(packet.connectionGeneration) || packet.connectionGeneration < 1)) ||
        ![null, 'unauthenticated', 'permission-denied', 'invalid-argument', 'resource-exhausted', 'failed-precondition',
          'not-found', 'aborted', 'unavailable', 'deadline-exceeded', 'internal', 'cancelled'].includes(packet.denialCode))) return false;
    return true;
  };
  return {
    boundaries: boundary.boundaries,
    receive(packet) {
      let valid = false;
      try {
        const descriptors = Object.getOwnPropertyDescriptors(packet);
        if (Object.values(descriptors).some(value => !Object.hasOwn(value, 'value'))) throw new Error('Non-data binding field.');
        packet = Object.fromEntries(Object.entries(descriptors).map(([field, value]) => [field, value.value]));
        valid = validPacket(packet);
      } catch { /* Never serialize a packet getter, Proxy trap or arbitrary error. */ }
      if (!valid) { report(null, 'origin-binding-schema'); return { ok: false }; }
      if (packet.stage === 'issued') {
        if (origins.has(packet.originId)) { report(origins.get(packet.originId), 'unknown-callable-lifecycle'); return { ok: false }; }
        const trace = createPc10CallableTrace({ name: packet.name, transport: 'independent-browser-SDK', startedAt: packet.at });
        Object.assign(trace, { roleId: label, captureMode: 'origin', originRequestHash: createHash('sha256')
          .update(`pc10-origin-request\0${packet.originId}`).digest('hex') });
        const documentId = packet.originId.split(':')[0];
        Object.assign(trace, { originDocumentHash: witnessHash('document', documentId), originIssuedObservedAt: now() });
        if (navigationSnapshot) {
          trace.originIssuedAfterNavigationSnapshot = true;
          trace.originNavigationSnapshotHash = navigationSnapshot.evidence.snapshotHash;
          navigationSnapshot.evidence.postSnapshotOrigins++;
        }
        const state = { trace, documentId, originBody: deferred(), order: origins.size, metadataDelivered: deferred() };
        state.networkReady = deferred();
        state.metadataReady = false; state.metadataInvalid = false; state.bodyAccepted = false; state.headersSeen = false;
        origins.set(packet.originId, state); observedCalls.push(trace);
        return { ok: true };
      }
      const state = origins.get(packet.originId);
      if (!state || state.trace.name !== packet.name || packet.at < state.trace.issuedAt) {
        report(state, 'unknown-callable-lifecycle'); return { ok: false };
      }
      if (packet.stage === 'metadata') {
        if (state.metadataReady) { report(state, 'unknown-callable-lifecycle'); return { ok: false }; }
        state.metadataReady = true; state.metadataInvalid = packet.failureStage !== null;
        state.trace.originMetadataObservedAt = now();
        if (navigationSnapshot) state.trace.originMetadataNavigationSnapshotHash = navigationSnapshot.evidence.snapshotHash;
        state.metadataDelivered.resolve();
        for (const field of ['actorHash', 'sessionHash', 'requestHash', 'groupHash', 'projectHash']) state.trace[field] = packet[field];
        if (packet.failureStage) {
          state.bodyFailureStage = packet.failureStage;
          report(state, 'request-metadata-unavailable');
        } else if (!hex(packet.actorHash) || packet.projectHash !== hash('project', projectId)) {
          state.metadataInvalid = true; report(state, 'origin-identity-mismatch');
        }
        identityCheck(state); reconcile();
      } else if (packet.stage === 'headers') {
        if (!state.metadataReady || state.metadataInvalid || state.headersSeen || state.failureReceived) {
          report(state, 'unknown-callable-lifecycle'); return { ok: false };
        }
        state.headersSeen = true; state.trace.headersReceivedAt = packet.at; state.trace.status = packet.status;
        if (state.networkHeadersStatus !== undefined && state.networkHeadersStatus !== packet.status) report(state, 'origin-transport-mismatch');
      } else if (packet.stage === 'body') {
        if (!state.headersSeen || state.bodyAccepted || state.failureReceived) {
          report(state, 'unknown-callable-lifecycle'); return { ok: false };
        }
        if ((packet.resultActorHash !== null && packet.resultActorHash !== state.trace.actorHash) ||
            (packet.resultSessionHash !== null && state.trace.sessionHash !== null && packet.resultSessionHash !== state.trace.sessionHash) ||
            (packet.resultRequestHash !== null && packet.resultRequestHash !== state.trace.requestHash) ||
            (packet.resultGroupHash !== null && state.trace.groupHash !== null && packet.resultGroupHash !== state.trace.groupHash) ||
            (packet.outcome === 'error' ? packet.denialCode === null : packet.denialCode !== null)) {
          report(state, 'origin-result-mismatch'); return { ok: false };
        }
        state.bodyAccepted = true;
        for (const field of ['byteLength', 'bodyHash', 'resultStatus', 'revision', 'connectionGeneration', 'denialCode', 'resultSessionHash']) {
          state.trace[field] = packet[field];
        }
        state.trace.bodyCompletedAt = packet.at; state.trace.bodyObservedAt = now(); state.trace.completedAt = packet.at;
        state.trace.durationMs = packet.at - state.trace.issuedAt; state.trace.httpOutcome = packet.outcome;
        if (state.trace.status >= 500) report(state, 'origin-unexpected-http-status');
        identityCheck(state); checkCompleteCancellation(state); state.originBody.resolve();
      } else if (packet.stage === 'failure') {
        if (state.failureReceived || (state.bodyAccepted && !['origin-observation-timeout', 'origin-binding-unavailable'].includes(packet.failureStage))) {
          report(state, 'unknown-callable-lifecycle'); return { ok: false };
        }
        state.failureReceived = true; state.bodyFailureStage = packet.failureStage;
        if (state.network) state.network.lifecycle.bodyFailureStage = packet.failureStage;
        state.trace.originFailureStage = packet.failureStage; state.trace.originFailureAt = packet.at;
        if (state.bodyAccepted) report(state, packet.failureStage === 'origin-observation-timeout'
          ? 'origin-observation-deadline' : 'origin-binding-schema');
        else if (!['origin-fetch-failed', 'origin-fetch-aborted'].includes(packet.failureStage)) {
          // A separately observed clone/parser/binding failure is never waived
          // by a transport cancellation, including a later failure packet.
          report(state, 'response-observation-unavailable');
        }
        state.originBody.reject(new Error('Origin callable observation is unavailable.'));
      } else if (packet.stage === 'returned') {
        if (!state.bodyAccepted || state.trace.originResponseReturnedAt !== undefined || packet.at < state.trace.bodyCompletedAt) {
          report(state, 'unknown-callable-lifecycle'); return { ok: false };
        }
        state.trace.originResponseReturnedAt = packet.at; state.trace.originOrderingOverheadMs = packet.overheadMs;
      }
      return { ok: true };
    },
    network(stage, event) {
      const protocolId = event?.requestId;
      if (typeof protocolId !== 'string' || protocolId.length === 0) { report(null, 'unknown-callable-lifecycle'); return; }
      if (stage === 'request') {
        const request = event.request;
        const parsed = parsePc10OriginRequest({ url: request?.url, method: request?.method,
          headers: request?.headers, body: request?.postData }, configuration);
        if (!parsed.matched) { ignored.add(protocolId); return; }
        if (networks.has(protocolId) || ignored.has(protocolId)) { report(null, 'unknown-callable-lifecycle'); return; }
        const value = { name: parsed.name, actorHash: hash('actor', parsed.actorUid), sessionHash: hash('session', parsed.sessionId),
          requestHash: hash('request', parsed.requestId), groupHash: hash('group', parsed.groupId), projectHash: hash('project', parsed.projectId),
          protocolRequestHash: createHash('sha256').update(`pc10-cdp-request\0${protocolId}`).digest('hex'),
          observedAt: now(), frameId: event.frameId, loaderId: event.loaderId,
          headersAt: null, finishedAt: null, failedAt: null, origin: null, invalid: Boolean(parsed.failureStage),
          originReady: deferred(), terminalReady: deferred(), bodyCompletion: deferred() };
        if (requireDocumentWitness) {
          const frames = event.initiator?.type === 'script' ? event.initiator?.stack?.callFrames : null;
          const wrappers = Array.isArray(frames) ? frames.filter(frame => frame.functionName === 'pc10OriginFetch' && opaque(frame.scriptId)) : [];
          const ids = [...new Set(wrappers.map(frame => frame.scriptId))];
          if (!opaque(event.frameId) || !opaque(event.loaderId) || ids.length !== 1) {
            value.witnessInvalid = true; report(null, 'origin-native-document-unavailable', networkDetails(value));
          } else value.wrapperScriptId = ids[0];
        }
        const protocolTrace = createPc10CallableTrace({ name: parsed.name, transport: 'independent-browser-SDK', startedAt: now() });
        Object.assign(protocolTrace, { roleId: label, actorHash: value.actorHash, sessionHash: value.sessionHash,
          requestHash: value.requestHash, groupHash: value.groupHash, protocolRequestHash: value.protocolRequestHash });
        value.lifecycle = boundary.start(protocolTrace);
        boundary.capture(value.lifecycle, value.bodyCompletion.promise);
        networks.set(protocolId, value);
        if (value.invalid) {
          value.lifecycle.bodyFailureStage = parsed.failureStage;
          value.bodyCompletion.reject(new Error('Callable request metadata is unavailable.'));
          report(null, 'request-metadata-unavailable');
        }
        reconcile(); return;
      }
      if (ignored.has(protocolId)) return;
      const value = networks.get(protocolId);
      if (!value) {
        // Unobserved image/font/etc completions have no callable identity. A
        // known loopback callable response without its POST event is a failure.
        if (stage === 'headers') {
          try {
            const url = new URL(event.response?.url);
            if (url.origin === functionsOrigin && url.pathname.includes('/us-central1/') &&
                Object.hasOwn(PC10_PROOF_CALLABLE_ACTIONS, url.pathname.split('/').at(-1))) {
              report(null, 'unknown-callable-lifecycle');
            }
          } catch { /* Nonmatching traffic remains untouched. */ }
        }
        return;
      }
      if (stage === 'headers') {
        if (value.headersAt !== null || value.finishedAt !== null || value.failedAt !== null ||
            !Number.isSafeInteger(event.response?.status) || event.response.status < 100 || event.response.status > 599) {
          report(value.origin, 'unknown-callable-lifecycle'); return;
        }
        value.headersAt = now(); value.status = event.response.status;
      } else if (stage === 'finished' || stage === 'failed') {
        if (value.finishedAt !== null || value.failedAt !== null || (stage === 'finished' && value.headersAt === null)) {
          report(value.origin, 'unknown-callable-lifecycle'); return;
        }
        if (stage === 'finished') {
          value.finishedAt = now();
          value.lifecycle.trace.requestFinishedAt = value.finishedAt;
          boundary.finish(value.lifecycle);
        } else {
          value.failedAt = now(); value.error = event.errorText; value.canceled = typeof event.canceled === 'boolean' ? event.canceled : null;
          value.lifecycle.trace.requestFailedAt = value.failedAt;
          value.lifecycle.bodyFailureStage ??= 'origin-fetch-failed';
          boundary.fail(value.lifecycle, value.error);
          value.bodyCompletion.reject(new Error('Actual callable transport failed.'));
        }
        value.terminalReady.resolve();
      } else { report(value.origin, 'unknown-callable-lifecycle'); return; }
      applyNetwork(value);
    },
    bindIdentity(actorUid, sessionId) {
      if (!id(actorUid) || (sessionId !== undefined && !id(sessionId))) throw new TypeError('Origin identity binding is malformed.');
      expectedActorHash = hash('actor', actorUid);
      if (sessionId !== undefined) expectedSessionHash = hash('session', sessionId);
      for (const state of origins.values()) identityCheck(state);
    },
    rejectBindingSource() { report(null, 'origin-binding-source'); return { ok: false }; },
    rejectBindingPacket() { report(null, 'origin-binding-schema'); return { ok: false }; },
    announceDocument(documentId) {
      if (!uuid(documentId)) { report(null, 'origin-document-witness-conflict'); return { ok: false }; }
      if (!documents.has(documentId)) documents.set(documentId, { announcedAt: now(), witnessedAt: null, loaderId: null });
      return { ok: true };
    },
    nativeContext(event) {
      const context = event?.context;
      if (context?.auxData?.isDefault !== true) return;
      if (!Number.isSafeInteger(context.id) || context.id < 1 || !opaque(context.uniqueId) || !opaque(context.auxData.frameId)) {
        report(null, 'origin-document-witness-conflict'); return;
      }
      // scriptParsed has only the numeric context ID. If that ID is reused
      // across processes, an as-yet-unseen old script cannot be distinguished
      // from a new one by that event. Never guess its system-unique context.
      const identity = contextIdentities.get(context.id);
      if (identity && (identity.uniqueId !== context.uniqueId || identity.frameId !== context.auxData.frameId)) {
        report(null, 'origin-document-witness-conflict'); return;
      }
      contextIdentities.set(context.id, { uniqueId: context.uniqueId, frameId: context.auxData.frameId });
      const prior = contexts.get(context.id);
      if (prior?.uniqueId === context.uniqueId) return;
      const value = { id: context.id, uniqueId: context.uniqueId, frameId: context.auxData.frameId, documentId: null };
      contexts.set(context.id, value);
      for (const script of scripts.values()) if (!script.context && script.executionContextId === context.id) script.context = value;
      reconcile();
    },
    nativeScript(event) {
      if (!opaque(event?.scriptId) || !Number.isSafeInteger(event.executionContextId)) return;
      const context = contexts.get(event.executionContextId), prior = scripts.get(event.scriptId);
      if (prior?.invalid) return;
      if (prior && prior.context && context && prior.context !== context) {
        prior.invalid = true; report(null, 'origin-document-witness-conflict'); reconcile(); return;
      }
      scripts.set(event.scriptId, { executionContextId: event.executionContextId, context: prior?.context ?? context ?? null });
      reconcile();
    },
    nativeContextDestroyed(event) {
      const context = contexts.get(event?.executionContextId);
      if (context) { context.destroyedAt = now(); contexts.delete(event.executionContextId); }
    },
    nativeContextsCleared() {
      for (const context of contexts.values()) context.destroyedAt = now();
      contexts.clear();
    },
    nativeDocument(event) {
      if (event?.name !== '__pc10OriginDocumentWitness') return;
      let payload;
      try { if (typeof event.payload !== 'string' || event.payload.length > 256) throw new Error('Invalid witness.'); payload = JSON.parse(event.payload); }
      catch { report(null, 'origin-document-witness-conflict'); return; }
      const context = contexts.get(event.executionContextId), document = documents.get(payload?.documentId);
      if (!context || !document || payload.schemaVersion !== 1 || Object.keys(payload).sort().join('|') !== 'documentId|schemaVersion' ||
          (context.documentId && context.documentId !== payload.documentId) || (document.context && document.context !== context)) {
        report(null, 'origin-document-witness-conflict'); return;
      }
      context.documentId = payload.documentId; document.context = context; document.witnessedAt ??= now(); reconcile();
    },
    rejectDocumentWitness() { report(null, 'origin-native-document-unavailable'); },
    async drainBeforeNavigation() {
      const snapshot = snapshotPending(); navigationSnapshot = snapshot;
      try { await waitSnapshot(snapshot); } finally { navigationSnapshot = null; }
    },
    async drain() {
      // Snapshot only current terminal transport and already captured bodies.
      // Metadata may arrive after a fast response, but future polling does not
      // enlarge this finite set or require a global quiet period.
      const targets = [...networks.values()].filter(value => !value.invalid &&
        (value.finishedAt !== null || value.failedAt !== null));
      const bodies = [...origins.values()].filter(state => state.bodyAccepted &&
        (!state.network || (state.network.finishedAt === null && state.network.failedAt === null)));
      const operation = Promise.all([boundary.drain(),
        ...targets.map(async network => { await network.originReady.promise; await network.lifecycle.body; }),
        ...bodies.map(async state => { const network = await state.networkReady.promise; await network.terminalReady.promise; }),
      ]);
      if (targets.length === 0 && bodies.length === 0) { await operation; return; }
      let timer;
      try {
        await Promise.race([operation, new Promise((_, reject) => {
          timer = timeoutPort.setTimeout(() => {
            for (const network of targets) {
              if (!network.origin) report(null, requireDocumentWitness && !network.documentId
                ? 'origin-native-document-unavailable' : 'origin-request-unaccounted', networkDetails(network));
              else if (!network.lifecycle.bodyDone) report(network.origin, 'origin-body-incomplete');
            }
            for (const state of bodies) {
              if (!state.network) report(state, 'origin-request-unaccounted');
              else if (state.network.finishedAt === null && state.network.failedAt === null) report(state, 'unknown-callable-lifecycle');
            }
            reject(new Error('Origin callable census exceeded the observation budget.'));
          }, OBSERVATION_BUDGET_MS);
        })]);
      } finally {
        timeoutPort.clearTimeout(timer);
        reconcile();
      }
      for (const network of targets) {
        if (!network.origin) {
          report(null, 'origin-request-unaccounted', { protocolRequestHash: network.protocolRequestHash });
        }
      }
      for (const state of bodies) {
        if (state.bodyAccepted && !state.network) report(state, 'origin-request-unaccounted');
      }
    },
    async transition(kind, operation) {
      if (kind !== 'reload' || !requireDocumentWitness) return boundary.transition(kind, operation);
      const snapshot = snapshotPending(); navigationSnapshot = snapshot;
      try { await waitSnapshot(snapshot); return await boundary.transition(kind, operation); }
      finally { navigationSnapshot = null; }
    },
  };
}

export async function createPc10OriginBrowserCapture({ context, page, label, projectId, functionsOrigin,
  observedCalls, failures, boundaryFactory }) {
  const ledger = createPc10OriginObservationLedger({ label, projectId, functionsOrigin, observedCalls, failures,
    boundaryFactory, requireDocumentWitness: true });
  const bindingName = '__pc10ProofOriginCapture';
  const documentBindingName = '__pc10OriginDocumentWitness';
  let cdp, witnessSetup;
  await context.exposeBinding(bindingName, async (source, packet) => {
    if (source.page !== page || source.frame !== page.mainFrame()) return ledger.rejectBindingSource();
    try {
      const descriptors = Object.getOwnPropertyDescriptors(packet);
      if (Object.values(descriptors).some(value => !Object.hasOwn(value, 'value'))) throw new Error('Non-data packet.');
      packet = Object.fromEntries(Object.entries(descriptors).map(([field, value]) => [field, value.value]));
    } catch { return ledger.rejectBindingPacket(); }
    if (packet?.stage !== 'document') return ledger.receive(packet);
    if (packet.schemaVersion !== 1 || Object.keys(packet).sort().join('|') !== 'documentId|schemaVersion|stage') {
      return ledger.rejectBindingPacket();
    }
    if (ledger.announceDocument(packet.documentId).ok !== true) return { ok: false };
    try {
      witnessSetup ??= (async () => {
        await cdp.send('Runtime.enable'); await cdp.send('Debugger.enable');
        await cdp.send('Runtime.addBinding', { name: documentBindingName });
      })();
      await witnessSetup;
      const called = await source.frame.evaluate(({ documentId, nativeBindingName }) => {
        const actual = globalThis[Symbol.for('pc10-proof-origin-document')];
        if (actual !== documentId || typeof globalThis[nativeBindingName] !== 'function') return false;
        globalThis[nativeBindingName](JSON.stringify({ schemaVersion: 1, documentId })); return true;
      }, { documentId: packet.documentId, nativeBindingName: documentBindingName });
      if (!called) throw new Error('Actual document witness is unavailable.');
      return { ok: true };
    } catch { ledger.rejectDocumentWitness(); return { ok: false }; }
  });
  const configuration = { bindingName, projectId, functionsOrigin, callableActions: PC10_PROOF_CALLABLE_ACTIONS, documentWitness: true };
  await context.addInitScript({ content: `(${installPc10OriginCallableFetch.toString()})(${JSON.stringify(configuration)},
    (${parsePc10OriginRequest.toString()}), (${parsePc10OriginResult.toString()}));` });
  cdp = await context.newCDPSession(page);
  cdp.on('Runtime.executionContextCreated', event => ledger.nativeContext(event));
  cdp.on('Runtime.executionContextDestroyed', event => ledger.nativeContextDestroyed(event));
  cdp.on('Runtime.executionContextsCleared', () => ledger.nativeContextsCleared());
  cdp.on('Runtime.bindingCalled', event => ledger.nativeDocument(event));
  cdp.on('Debugger.scriptParsed', event => ledger.nativeScript(event));
  cdp.on('Network.requestWillBeSent', event => ledger.network('request', event));
  cdp.on('Network.responseReceived', event => ledger.network('headers', event));
  cdp.on('Network.loadingFinished', event => ledger.network('finished', event));
  cdp.on('Network.loadingFailed', event => ledger.network('failed', event));
  await cdp.send('Network.enable', { maxTotalBufferSize: MAX_TOTAL_BODY_BYTES, maxResourceBufferSize: MAX_BODY_BYTES });
  return { ...ledger, close: () => cdp.detach(), observationBudgetMs: OBSERVATION_BUDGET_MS };
}
