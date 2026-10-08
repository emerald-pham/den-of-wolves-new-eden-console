import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rememberProofFailure } from './pc10-proof-failure-evidence.mjs';

const configurations = new WeakMap();
const active = new WeakMap();
const credentialKey = /password|credential|authorization|(?:access|refresh|id)[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?key/i;
const errorRecord = error => ({ name: error?.name, message: error?.message, stack: error?.stack, code: error?.code });

// New diagnostic files are private and omit credentials. Never inspect request
// headers, Auth tokens, or a raw Firebase User. Missing values stay explicit.
function serializable(value, seen = new WeakSet()) {
  if (value === undefined) return '[undefined]';
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'function') return '[Function]';
  if (typeof value !== 'object') return String(value);
  if (value instanceof Error) return serializable(errorRecord(value), seen);
  if (seen.has(value)) return '[Circular reference]';
  seen.add(value);
  const result = Array.isArray(value) ? value.map(item => serializable(item, seen))
    : Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, credentialKey.test(key) ? '[credential omitted]' : serializable(item, seen)]));
  seen.delete(value);
  return result;
}
function route(value) {
  try { const url = new URL(value); return { origin: url.origin, pathname: url.pathname, hash: url.hash }; }
  catch { return { invalidUrl: true }; }
}
function requestRecord(request) {
  const location = route(request.url()), method = request.method();
  const endpoint = location.pathname?.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
  if (/\/(?:identitytoolkit|securetoken)\.googleapis\.com\//.test(location.pathname ?? '')) {
    // Auth requests can fail before Functions dispatch. Keep timing/status/
    // failure and a query-free location, never their token-bearing payload.
    return { transport: 'auth', method, location, credentialPayloadOmitted: true };
  }
  if (!endpoint || method !== 'POST') return null;
  let data, requestReadError;
  try { data = serializable(request.postDataJSON()?.data); }
  catch (error) { requestReadError = errorRecord(error); }
  return { transport: 'functions', endpoint, method, location, data, ...(requestReadError ? { requestReadError } : {}) };
}

export function attachUiReceiptDiagnostics(page, configuration) {
  if (!page || typeof configuration?.inspectState !== 'function' || typeof configuration.directory !== 'string')
    throw new Error('Callable diagnostics require an owned page, explicit directory and read-only actor-state observer.');
  configurations.set(page, configuration);
}

export function createUiReceiptDiagnostic(page, explicit, consumed) {
  const configuration = explicit ?? (page && configurations.get(page));
  if (!configuration) return null;
  if (!page || typeof page.on !== 'function' || typeof page.off !== 'function')
    throw new Error('Callable diagnostic page must support its own removable event listeners.');
  const directory = resolve(configuration.directory, 'callable-ui-operations');
  const id = randomUUID(), path = resolve(directory, `${id}.json`);
  const record = { schemaVersion: 1, operationId: id, surface: configuration.label,
    createdAt: new Date().toISOString(), callerStack: new Error('Callable UI operation').stack,
    status: 'created-before-observer',
    pageAtStart: route(page.url()), consumed: consumed ?? {}, events: [],
    noObservedRequestProvesNoRequest: false, noSdkOrGameplayActionIssuedByDiagnostics: true };
  const set = active.get(page) ?? new Set(); set.add(record); active.set(page, set);
  let writes = Promise.resolve(), closed = false;
  const listeners = [];
  function persist() {
    const bytes = JSON.stringify(serializable(record), null, 2) + '\n';
    const next = writes.catch(() => undefined).then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = resolve(directory, `.${id}-${randomUUID()}.tmp`);
      await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
      await rename(temporary, path);
    });
    writes = next;
    return next;
  }
  function append(kind, read) {
    if (closed) return;
    try {
      const detail = read?.();
      if (detail === null) return;
      record.events.push({ kind, at: new Date().toISOString(), ...detail });
    } catch (error) {
      record.events.push({ kind: 'diagnostic-event-read-error', eventKind: kind,
        at: new Date().toISOString(), error: errorRecord(error) });
    }
    // Every observed event is queued for a durable write. Rejections remain
    // handled and are attached to the primary operation if one exists.
    void persist().catch(error => {
      (record.diagnosticWriteErrors ??= []).push(errorRecord(error));
    });
  }
  const on = (name, callback) => { page.on(name, callback); listeners.push([name, callback]); };
  on('request', request => append('request', () => requestRecord(request)));
  on('response', response => append('response', () => {
    const request = requestRecord(response.request());
    return request && { ...request, httpStatus: response.status() };
  }));
  on('requestfailed', request => append('requestfailed', () => {
    const detail = requestRecord(request);
    return detail && { ...detail, failure: serializable(request.failure()) };
  }));
  on('framenavigated', frame => append('framenavigated', () => ({ route: route(frame.url()),
    mainFrame: typeof page.mainFrame === 'function' ? frame === page.mainFrame() : '[unavailable]' })));
  on('close', () => append('close'));
  on('crash', () => append('crash'));
  on('pageerror', error => append('pageerror', () => ({ error: errorRecord(error) })));
  Object.defineProperty(record, 'persistBeforeAction', { configurable: true, value: async detail => {
    record.consumed = { ...record.consumed, ...detail };
    record.immediatelyPreActionContextAt = new Date().toISOString();
    await persist();
  } });
  return {
    record, path,
    observerArmed() { record.observerArmedAt = new Date().toISOString(); },
    async prepare() {
      record.stateBefore = await configuration.inspectState();
      record.stateBeforeObservedAt = new Date().toISOString();
      record.status = 'prepared-before-choice';
      await persist();
    },
    choiceStarted() { record.choiceStartedAt = new Date().toISOString(); },
    choiceCompleted() { record.choiceCompleted = true; record.choiceCompletedAt = new Date().toISOString(); },
    responseObserved(response) {
      const detail = requestRecord(response.request());
      record.matchedResponse = { ...detail, httpStatus: response.status() };
      record.responseObservedAt = new Date().toISOString();
    },
    async finish(status, error) {
      record.status = status;
      if (error) record.originalError = errorRecord(error);
      try {
        record.stateAfter = await configuration.inspectState();
        record.stateAfterObservedAt = new Date().toISOString();
      } catch (stateError) {
        record.stateAfterError = errorRecord(stateError);
        if (error) rememberProofFailure(error, { diagnosticStateAfterError: stateError });
      }
      closed = true;
      for (const [name, callback] of listeners) page.off(name, callback);
      set.delete(record);
      record.listenersRemovedAt = new Date().toISOString();
      // The function property is only an in-memory bridge, never an artifact.
      delete record.persistBeforeAction;
      if (error) rememberProofFailure(error, { operation: 'observeUiReceipt', diagnosticPath: path,
        callableOperation: serializable(record) });
      try { await persist(); }
      catch (writeError) {
        if (!error) throw writeError;
        rememberProofFailure(error, { diagnosticFinalWriteError: writeError });
      }
    },
  };
}

export async function retainUiReceiptContext(page, detail) {
  const records = page && active.get(page);
  if (!records?.size) return;
  const record = [...records].reverse().find(row => !detail.endpoint || !row.consumed?.endpoint ||
    row.consumed.endpoint === detail.endpoint);
  if (record) await record.persistBeforeAction(detail);
}
