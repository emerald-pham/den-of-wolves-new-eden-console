import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';

// Finite fixtures execute the actual callback's normal local authorization
// block. They use synthetic mounted controls and transport, never a browser,
// Auth, SDK, network, timer, process or gameplay mutation. Existing tests stay
// unchanged. This qualifies proof-contract RED, not product or gameplay RED.
const source = await readFile(new URL('./pc10-two-live-gm-responsibility-proof.mjs', import.meta.url), 'utf8');
const begin = source.indexOf("      stage = 'normal local authorization';");
const end = source.indexOf('      const authorized = await observeLifecycleActor(context.crew);', begin);
assert.ok(begin >= 0 && end > begin, 'The existing normal authorization block must be present.');
const body = source.slice(begin, end);
const originalPageSource = await readFile(new URL('./pc10-full-game-demo-ui-proof.mjs', import.meta.url), 'utf8');
assert.ok(originalPageSource.includes('page.setDefaultTimeout(35_000)'), 'Use the existing actual page readiness budget.');

function fixture({ openedAt = 0, mountedAt = 0, present = true, visible = true,
  count = 1, enabled = true, status = 200, authenticated = true,
  responseOrigin = 'http://127.0.0.1:5174', responsePath = '/__local-gm-access', method = 'POST' } = {}) {
  let now = 0, pending;
  const calls = { settings: 0, controlQueries: [], waits: [], counts: 0,
    visibilityReads: 0, enabledReads: 0, clicks: 0, responseObservers: 0,
    responseTimeouts: [], responseJsonReads: 0, revokedWaits: 0, events: [],
    extraSdkCalls: 0, extraAuthActors: 0, storesRead: 0, fallbackControls: 0 };
  const failure = { guard: 'normal-original-preceding-guard', held: {} };
  const timeout = () => Object.assign(new Error('The exact normal control did not mount before its original deadline.'), { name: 'TimeoutError' });
  const response = { url: () => responseOrigin + responsePath,
    request: () => ({ method: () => method }), status: () => status,
    json: async () => { calls.responseJsonReads++; return { authenticated }; } };
  const authorize = {
    async waitFor(options) {
      calls.waits.push({ ...options, invokedAt: now });
      assert.equal(options.state, 'visible');
      assert.ok(options.timeout > 0 && options.timeout <= 35_000 - openedAt,
        'Readiness may use only the remaining original 35-second Settings budget.');
      if (!present || !visible || mountedAt > now + options.timeout) {
        now += options.timeout; throw timeout();
      }
      now = Math.max(now, mountedAt);
      if (count !== 1) throw Object.assign(new Error('Exact authorization control is ambiguous.'), { name: 'StrictModeError' });
    },
    async count() { calls.counts++; return present && now >= mountedAt ? count : 0; },
    async isVisible() { calls.visibilityReads++; return visible && present && now >= mountedAt; },
    async isEnabled() { calls.enabledReads++; return enabled; },
    async click() {
      calls.clicks++; calls.events.push('click');
      assert.ok(pending, 'The actual transport observer is armed before the single normal click.');
      if (pending.predicate(response)) pending.resolve(response);
      else pending.reject(Object.assign(new Error('The actual response predicate rejected an unrelated transport.'), { name: 'TimeoutError' }));
    },
  };
  const dialog = { getByRole(role, options) {
    assert.equal(role, 'button'); assert.equal(options.exact, true);
    calls.controlQueries.push(options.name);
    if (options.name === 'Authorize local emulator GM') return authorize;
    assert.equal(options.name, 'Revoke GM access', 'No alternative authorization control is permitted.');
    return { async waitFor(options) { assert.equal(options.state, 'visible'); calls.revokedWaits++; } };
  } };
  const context = { crew: { page: { waitForResponse(predicate, options) {
    calls.responseObservers++; calls.responseTimeouts.push(options.timeout); calls.events.push('arm');
    assert.equal(options.timeout, 60_000, 'Preserve the existing actual POST response budget.');
    return new Promise((resolve, reject) => { pending = { resolve, reject, predicate }; });
  } } } };
  const scope = vm.createContext({ assert, URL, Date: { now: () => now } });
  const invoke = new vm.Script('(async function(context, failure, savedUrl, openLifecycleSettings, ui) { let stage;\n' + body + '\nreturn {stage, localResponse};\n})',
    { filename: 'actual-normal-local-authorization-block.mjs' }).runInContext(scope);
  return { calls, failure, async run() { return invoke(context, failure, new URL('http://127.0.0.1:5174/?demoActor=synthetic-original-controller'),
    async surface => { assert.equal(surface, context.crew); calls.settings++; now = openedAt; return dialog; }, { observeUiReceipt }); } };
}
function noBypass(value) {
  assert.equal(value.calls.extraSdkCalls, 0); assert.equal(value.calls.extraAuthActors, 0);
  assert.equal(value.calls.storesRead, 0); assert.equal(value.calls.fallbackControls, 0);
  assert.equal(value.calls.settings, 1);
}

test('bridge: the actual normal local authorization block arms one original POST and clicks once', async () => {
  const value = fixture(); const result = await value.run();
  assert.equal(result.stage, 'normal local authorization');
  assert.equal(result.localResponse.status(), 200);
  assert.deepEqual(value.calls.events, ['arm', 'click']);
  assert.deepEqual(value.calls.responseTimeouts, [60_000]);
  assert.equal(value.calls.clicks, 1); assert.equal(value.calls.revokedWaits, 1);
  assert.equal(value.calls.responseJsonReads, 1); noBypass(value);
});

test('the legitimate lazy Settings control may mount after the dialog within its original deadline', async () => {
  const value = fixture({ openedAt: 12_000, mountedAt: 27_000 });
  await value.run();
  assert.equal(value.calls.waits.length, 1);
  assert.equal(value.calls.waits[0].timeout, 23_000);
  assert.equal(value.calls.clicks, 1); assert.equal(value.calls.revokedWaits, 1); noBypass(value);
});

test('opening Settings consumes the same original budget; a later mount cannot extend it', async () => {
  const value = fixture({ openedAt: 29_000, mountedAt: 36_000 });
  await assert.rejects(() => value.run(), error => error.name === 'TimeoutError');
  assert.equal(value.calls.waits.length, 1); assert.equal(value.calls.waits[0].timeout, 6_000);
  assert.equal(value.calls.clicks, 0); assert.equal(value.calls.responseObservers, 0); noBypass(value);
});

for (const [name, options] of [['absent', { present: false }], ['hidden', { visible: false }],
  ['duplicate', { count: 2 }], ['disabled', { enabled: false }]]) {
  test('an ' + name + ' normal authorization control fails closed without a transport or alternate control', async () => {
    const value = fixture(options);
    await assert.rejects(() => value.run());
    assert.equal(value.failure.guard, 'local-authorization.normal-settings-button-offered');
    assert.equal(value.calls.clicks, 0); assert.equal(value.calls.responseObservers, 0); noBypass(value);
  });
}

for (const [name, options] of [['foreign origin', { responseOrigin: 'http://localhost:9999' }],
  ['foreign endpoint', { responsePath: '/alternate-authority' }], ['GET', { method: 'GET' }]]) {
  test('the original response predicate rejects ' + name + ' even after the normal click', async () => {
    const value = fixture(options);
    await assert.rejects(() => value.run(), error => error.name === 'TimeoutError');
    assert.equal(value.calls.clicks, 1); assert.equal(value.calls.revokedWaits, 0); noBypass(value);
  });
}
for (const [name, options] of [['an unauthorized body', { authenticated: false }], ['HTTP500', { status: 500 }]]) {
  test('the actual local response guard rejects ' + name, async () => {
    const value = fixture(options);
    await assert.rejects(() => value.run(), error => error.name === 'AssertionError');
    assert.equal(value.failure.guard, 'local-authorization.actual-local-response-authorized');
    assert.equal(value.calls.clicks, 1); assert.equal(value.calls.revokedWaits, 0); noBypass(value);
  });
}
