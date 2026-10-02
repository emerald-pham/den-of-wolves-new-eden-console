import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localGmAccessConfiguration, grantLocalGmAccess } from './local-gm-access.mjs';

const env = {
  VITE_LOCAL_GM_ACCESS: '1', VITE_USE_EMULATORS: '1',
  VITE_FIREBASE_PROJECT_ID: 'demo-pc06-local',
  VITE_FIREBASE_AUTH_EMULATOR_PORT: '9119',
  VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: '8100',
};
const request = { method: 'POST', origin: 'http://127.0.0.1:5175', host: '127.0.0.1:5175', remoteAddress: '127.0.0.1', token: `e30.${Buffer.from(JSON.stringify({aud:'demo-pc06-local',iss:'https://securetoken.google.com/demo-pc06-local'})).toString('base64url')}.` };
test('requires explicit emulator configuration and a demo project, never a production build', () => {
  assert.ok(localGmAccessConfiguration('serve', env));
  for (const [command, overrides] of [
    ['build', {}], ['serve', { VITE_LOCAL_GM_ACCESS: '0' }],
    ['serve', { VITE_USE_EMULATORS: '0' }],
    ['serve', { VITE_FIREBASE_PROJECT_ID: 'dow-new-eden-console' }],
    ['serve', { VITE_FIREBASE_AUTH_EMULATOR_PORT: '9119/path' }],
  ]) assert.equal(localGmAccessConfiguration(command, { ...env, ...overrides }), null);
});
test('rejects remote, cross-origin, absent origin, and unauthenticated requests with no writes', async () => {
  const config = localGmAccessConfiguration('serve', env);
  for (const overrides of [
    { remoteAddress: '192.168.1.10' }, { host: 'evil.test:5175' },
    { origin: 'https://evil.test' }, { origin: undefined },
    { origin: 'http://localhost:5175' }, { method: 'GET' }, { token: '' },
  ]) {
    let calls = 0;
    await assert.rejects(grantLocalGmAccess(config, { ...request, ...overrides }, async () => { calls++; throw Error('unexpected network'); }));
    assert.equal(calls, 0);
  }
  let calls = 0;
  await assert.rejects(grantLocalGmAccess(config, request, async () => { calls++; return { ok: false }; }));
  assert.equal(calls, 1);
});
test('only the verified Auth emulator identity receives a normal Firestore lease', async () => {
  const calls = [];
  const result = await grantLocalGmAccess(localGmAccessConfiguration('serve', env), request, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ users: [{ localId: 'local-test-actor' }] }) };
  }, () => new Date('2026-10-02T20:00:00.000Z'));
  assert.deepEqual(result, { authenticated: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^http:\/\/127\.0\.0\.1:9119\//);
  assert.match(calls[1].url, /^http:\/\/127\.0\.0\.1:8100\/v1\/projects\/demo-pc06-local\/databases\/\(default\)\/documents\/gmAccess\/local-test-actor$/);
  assert.equal(JSON.parse(calls[1].options.body).fields.authenticatedAt.timestampValue, '2026-10-02T20:00:00.000Z');
});
test('rejects malformed emulator identity and storage errors without claiming success', async () => {
  for (const users of [[], [{localId: '../other'}], [{localId: ''}], [{localId: 'one'}, {localId: 'two'}]]) {
    let calls = 0;
    await assert.rejects(grantLocalGmAccess(localGmAccessConfiguration('serve', env), request, async () => { calls++; return {ok: true, json: async () => ({users})}; }));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(grantLocalGmAccess(localGmAccessConfiguration('serve', env), request, async () => { calls++; return calls === 1 ? {ok:true,json:async()=>({users:[{localId:'actor'}]})} : {ok:false}; }));
});

test('rejects an emulator token for a different project before lookup or write', async () => {
  let calls = 0;
  const token = `e30.${Buffer.from(JSON.stringify({aud:'dow-new-eden-console',iss:'https://securetoken.google.com/dow-new-eden-console'})).toString('base64url')}.`;
  await assert.rejects(grantLocalGmAccess(localGmAccessConfiguration('serve', env), {...request,token}, async () => {calls++;return {ok:true,json:async()=>({users:[{localId:'actor'}]})};}));
  assert.equal(calls, 0);
});
