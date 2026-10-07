import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { originalProofError } from './pc10-proof-failure-evidence.mjs';

// Inert local transport/page counterexamples only. No browser or Auth request.
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-receipt-auth-native-'));
  const page = new EventEmitter(); page.url = () => 'http://127.0.0.1:5174/#/demo-actors';
  const diagnostics = { directory, label: 'native-auth-transport', inspectState: async () =>
    ({ hasAuth: true, connection: 'live', freshness: 'server', navigatorOnline: true, pendingCommandCount: 0 }) };
  async function packet() {
    const files = (await readdir(join(directory, 'callable-ui-operations'))).filter(n => n.endsWith('.json'));
    assert.equal(files.length, 1);
    return JSON.parse(await readFile(join(directory, 'callable-ui-operations', files[0]), 'utf8'));
  }
  return { page, directory, diagnostics, packet, close: () => rm(directory, { recursive: true, force: true }) };
}

test('an Auth transport failure before any Functions response is retained without reading credential-bearing headers or body', async () => {
  const f = await fixture(); const primary = Object.freeze(new Error('native callable response timeout'));
  let credentialReads = 0;
  const r = { url: () => 'http://127.0.0.1:9109/identitytoolkit.googleapis.com/v1/accounts:lookup?key=NATIVE-QUERY-OMIT',
    method: () => 'POST', postDataJSON: () => { credentialReads++; throw new Error('Do not read Auth tokens.'); },
    headers: () => { credentialReads++; throw new Error('Do not read Auth headers.'); },
    failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET' }) };
  try {
    await assert.rejects(observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => Promise.reject(primary), choose: async () => {
        f.page.emit('request', r); f.page.emit('requestfailed', r);
      } }), e => e === primary);
    const data = await f.packet(), failure = data.events.find(e => e.kind === 'requestfailed');
    assert.ok(failure, 'Retain Auth request failure when the Functions request never reaches its observer.');
    assert.equal(failure.transport, 'auth');
    assert.equal(failure.failure.errorText, 'net::ERR_CONNECTION_RESET');
    assert.equal(credentialReads, 0);
    assert.equal(JSON.stringify(data).includes('NATIVE-QUERY-OMIT'), false);
    assert.equal(data.noObservedRequestProvesNoRequest, false);
  } finally { await f.close(); }
});

test('a secure-token response is retained as transport metadata while its credential-bearing payload remains unread', async () => {
  const f = await fixture(); let bodyReads = 0;
  const r = { url: () => 'http://127.0.0.1:9109/securetoken.googleapis.com/v1/token?key=NATIVE-KEY-OMIT',
    method: () => 'POST', postDataJSON: () => { bodyReads++; return { refresh_token: 'NATIVE-SECRET-OMIT' }; } };
  const observed = { url: () => 'http://127.0.0.1:5011/demo-pc10-native/us-central1/logoutGmAccess',
    request: () => ({ url: () => 'http://127.0.0.1:5011/demo-pc10-native/us-central1/logoutGmAccess',
      method: () => 'POST', postDataJSON: () => ({ data: { sessionId: null, instanceId: null } }) }), status: () => 200 };
  try {
    await observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => Promise.resolve(observed), choose: async () => f.page.emit('response', {
        request: () => r, status: () => 503 }) });
    const data = await f.packet(), authResponse = data.events.find(e => e.kind === 'response' && e.transport === 'auth');
    assert.equal(authResponse?.httpStatus, 503);
    assert.equal(bodyReads, 0);
    for (const secret of ['NATIVE-KEY-OMIT', 'NATIVE-SECRET-OMIT']) assert.equal(JSON.stringify(data).includes(secret), false);
  } finally { await f.close(); }
});

test('a thrown browser handler error remains distinguishable from the original response timeout', async () => {
  const f = await fixture(), primary = Object.freeze(new Error('native original response timeout'));
  try {
    await assert.rejects(observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => Promise.reject(primary), choose: async () => f.page.emit('pageerror', new Error('native handler failed before dispatch')) }), e => e === primary);
    const data = await f.packet();
    assert.ok(data.events.some(e => e.kind === 'pageerror' && e.error.message === 'native handler failed before dispatch'));
    assert.equal(data.originalError.message, primary.message);
  } finally { await f.close(); }
});

test('a final artifact write failure cannot replace a frozen primary response error or leave diagnostic listeners attached', async () => {
  const f = await fixture(), primary = Object.freeze(new Error('native primary timeout before report failure'));
  try {
    await assert.rejects(observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => Promise.reject(primary), choose: async () => {
        await f.packet();
        const packetDir = join(f.directory, 'callable-ui-operations');
        await rm(packetDir, { recursive: true }); await writeFile(packetDir, 'native directory replaced by fixture file');
      } }), e => e === primary);
    assert.match(originalProofError(primary).heldObservationsInspect, /diagnosticFinalWriteError/);
    for (const name of ['request', 'response', 'requestfailed', 'framenavigated', 'close', 'crash', 'pageerror']) assert.equal(f.page.listenerCount(name), 0);
  } finally { await f.close(); }
});
