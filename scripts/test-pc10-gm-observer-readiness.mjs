import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordLifecycleAffordance, captureLifecycleUiAction } from './pc10-member-gm-lifecycle-ui-proof.mjs';

const original = () => ({ sessionId: 'native-session', uidHash: 'a'.repeat(16), hasAuth: true,
  sameActor: true, connection: 'live', freshness: 'server', generation: 4, hydrationRevision: 2,
  playerRole: 'gm', instanceId: 'original-instance', claimedAt: 'original-claim', gmInstanceOwned: true,
  privateAudienceMatches: true, foreignPendingCount: 0, activeConsoleRoleId: null, phase: 'active', cycle: 1 });
const mounted = (change = {}) => ({ routePath: '/ships/aegis/observer', observerMainCount: 1,
  observerMode: 'read', shipId: 'aegis', roleControlCount: 1, selectedRoleId: 'admiral',
  selectedRoleValid: true, loading: false, failed: false, controlCount: 1, visible: true, enabled: true, ...change });
const loading = (change = {}) => mounted({ observerMainCount: 0, observerMode: null, shipId: null,
  roleControlCount: 0, selectedRoleId: null, selectedRoleValid: false, loading: true, controlCount: 0, ...change });

function fixture({ paints = [mounted()], actorRead = () => original(), deadlineAt = 600 } = {}) {
  let time = 0, paintReads = 0, actorReads = 0;
  let current = paints[0];
  const waits = [];
  const locator = {
    count: async () => current.controlCount,
    isVisible: async () => current.visible,
    isEnabled: async () => current.enabled,
    innerText: async () => 'GM ship console read write access // Read only',
    getAttribute: async () => null,
    evaluate: async () => '',
  };
  return { locator, counters: () => ({ time, paintReads, actorReads, waits }), options: {
    original: original(), shipId: 'aegis', deadlineAt,
    now: () => time,
    wait: async ms => { waits.push(ms); time += ms; },
    inspectActor: async () => actorRead(++actorReads),
    inspectMount: async () => { current = paints[Math.min(paintReads++, paints.length - 1)]; return current; },
  } };
}

test('one view click may finish while the lazy observer route is still mounting; wait for its actual ship, role and control', async () => {
  const f = fixture({ paints: [loading({ routePath: '/ships/aegis/roles', loading: false }), loading(), mounted()] });
  const result = await recordLifecycleAffordance(f.locator, f.options);
  assert.equal(result.offered, true);
  assert.equal(result.mountStatus, 'mounted-offered');
  assert.equal(result.mount.shipId, 'aegis');
  assert.equal(result.mount.selectedRoleId, 'admiral');
  assert.deepEqual(f.counters().waits, [200, 200]);
  assert.equal(f.counters().paintReads, 3);
});

test('an already mounted source observer keeps the immediate affordance path and rechecks original authority after inspection', async () => {
  const f = fixture();
  const result = await recordLifecycleAffordance(f.locator, f.options);
  assert.equal(result.offered, true);
  assert.equal(result.mountStatus, 'mounted-offered');
  assert.equal(f.counters().actorReads, 2);
  assert.deepEqual(f.counters().waits, []);
});

test('an unrelated ship control never qualifies the requested observer even if the button name matches', async () => {
  const f = fixture({ paints: [mounted({ routePath: '/ships/dione/observer', shipId: 'dione' })] });
  const result = await recordLifecycleAffordance(f.locator, f.options);
  assert.equal(result.offered, false);
  assert.equal(result.deadlineReached, true);
  assert.equal(result.mount.shipId, 'dione');
  assert.equal(result.mountStatus, 'expected-observer-absent');
});

test('a matching route without the actual observer role selector stays uncredited', async () => {
  const f = fixture({ paints: [mounted({ roleControlCount: 0, selectedRoleId: null, selectedRoleValid: false })] });
  const result = await recordLifecycleAffordance(f.locator, f.options);
  assert.equal(result.offered, false);
  assert.equal(result.deadlineReached, true);
  assert.equal(result.mountStatus, 'observer-role-pending');
});

test('a selected role must be an actual current option in the mounted ship view', async () => {
  const f = fixture({ paints: [mounted({ selectedRoleId: 'foreign-role', selectedRoleValid: false })] });
  const result = await recordLifecycleAffordance(f.locator, f.options);
  assert.equal(result.offered, false);
  assert.equal(result.deadlineReached, true);
});

for (const [count, status] of [[0, 'mounted-control-absent'], [2, 'mounted-control-ambiguous']]) {
  test(`a complete mounted observer with ${count} exact controls remains blocked, distinct from still mounting`, async () => {
    const f = fixture({ paints: [mounted({ controlCount: count })] });
    const result = await recordLifecycleAffordance(f.locator, f.options);
    assert.equal(result.offered, false);
    assert.equal(result.mountStatus, status);
    assert.equal(result.controlCount, count);
    assert.equal(result.deadlineReached, false);
    assert.deepEqual(f.counters().waits, []);
  });
}

for (const state of [{ enabled: false }, { visible: false }]) {
  test(`a mounted unavailable control keeps its denial behavior: ${JSON.stringify(state)}`, async () => {
    const f = fixture({ paints: [mounted(state)] });
    const result = await recordLifecycleAffordance(f.locator, f.options);
    assert.equal(result.offered, false);
    assert.equal(result.mountStatus, 'mounted-control-unavailable');
    assert.deepEqual(f.counters().waits, []);
  });
}

test('a failed lazy import is retained as a blocker and is never retried or reloaded', async () => {
  const f = fixture({ paints: [loading({ loading: false, failed: true })] });
  const result = await recordLifecycleAffordance(f.locator, f.options);
  assert.equal(result.offered, false);
  assert.equal(result.mountStatus, 'route-load-failed');
  assert.deepEqual(f.counters().waits, []);
});

test('a mounting wait spends only the original absolute deadline, including the last partial interval', async () => {
  const f = fixture({ paints: [loading()], deadlineAt: 500 });
  const result = await recordLifecycleAffordance(f.locator, f.options);
  assert.equal(result.offered, false);
  assert.equal(result.mountStatus, 'still-mounting');
  assert.equal(result.deadlineReached, true);
  assert.deepEqual(f.counters(), { time: 500, paintReads: 3, actorReads: 6, waits: [200, 200, 100] });
});

test('an already spent original operation budget creates no new observation or wait budget', async () => {
  const f = fixture({ deadlineAt: 0 });
  const result = await recordLifecycleAffordance(f.locator, f.options);
  assert.equal(result.offered, false);
  assert.equal(result.mountStatus, 'not-observed-before-deadline');
  assert.equal(result.deadlineReached, true);
  assert.deepEqual(f.counters(), { time: 0, paintReads: 0, actorReads: 0, waits: [] });
});

for (const [field, value] of Object.entries({ hasAuth: false, sameActor: false, uidHash: 'b'.repeat(16),
  sessionId: 'foreign-session', connection: 'offline', freshness: 'cache', generation: 5,
  playerRole: 'player', gmInstanceOwned: false, instanceId: 'replacement-instance', claimedAt: 'replacement-claim',
  privateAudienceMatches: false, foreignPendingCount: 1, phase: 'debrief', cycle: 2 })) {
  test(`the mounting reader cannot infer original permission after ${field} changes`, async () => {
    const f = fixture({ actorRead: () => ({ ...original(), [field]: value }) });
    await assert.rejects(recordLifecycleAffordance(f.locator, f.options));
    assert.equal(f.counters().paintReads, 0);
  });
}

test('authority changing during mount/control inspection is rejected before returning an offered control', async () => {
  const f = fixture({ actorRead: read => read === 1 ? original() : { ...original(), instanceId: 'replacement-instance' } });
  await assert.rejects(recordLifecycleAffordance(f.locator, f.options));
  assert.equal(f.counters().paintReads, 1);
});

test('waiting for paint never allows the next cycle to become the original operation', async () => {
  const f = fixture({ paints: [loading(), mounted()], actorRead: read => read <= 2 ? original() : { ...original(), cycle: 2 } });
  await assert.rejects(recordLifecycleAffordance(f.locator, f.options));
  assert.deepEqual(f.counters().waits, [200]);
  assert.equal(f.counters().paintReads, 1);
});

test('the existing single-argument affordance retains its immediate unavailable-control behavior', async () => {
  const f = fixture({ paints: [mounted({ enabled: false })] });
  const result = await recordLifecycleAffordance(f.locator);
  assert.equal(result.offered, false);
  assert.equal(Object.hasOwn(result, 'mountStatus'), false);
  assert.deepEqual(f.counters().waits, []);
});

function receiptSurface(actor = original(), { httpStatus = 200, body = { result: { enabled: true } } } = {}) {
  const waits = [];
  const request = { method: () => 'POST', postDataJSON: () => ({ data: {
    sessionId: actor.sessionId, instanceId: actor.instanceId, shipId: 'aegis', enabled: true,
  } }) };
  const response = { url: () => 'http://127.0.0.1:5011/demo/us-central1/setGmShipConsoleWriteGrant',
    request: () => request, status: () => httpStatus, json: async () => body };
  return { waits, surface: { storeModuleUrl: () => '/src/store/useSessionStore.ts', page: {
    evaluate: async () => actor,
    waitForResponse: async (predicate, options) => { waits.push(options.timeout); assert.equal(predicate(response), true); return response; },
  } } };
}

test('the actual UI receipt uses the remaining shared operation deadline, never a fresh sixty seconds', async () => {
  const f = receiptSurface();
  const deadlineAt = Date.now() + 500;
  const result = await captureLifecycleUiAction(f.surface, 'setGmShipConsoleWriteGrant', async () => {},
    { gm: true, original: original(), deadlineAt });
  assert.equal(result.httpStatus, 200);
  assert.ok(f.waits[0] > 0 && f.waits[0] <= 500, 'The mounted wait and UI receipt share the original budget.');
});

test('an expired operation never clicks or arms an unrelated fresh receipt wait', async () => {
  const f = receiptSurface();
  let clicks = 0;
  await assert.rejects(captureLifecycleUiAction(f.surface, 'setGmShipConsoleWriteGrant', async () => { clicks++; },
    { gm: true, original: original(), deadlineAt: Date.now() - 1 }));
  assert.equal(clicks, 0);
  assert.deepEqual(f.waits, []);
});

test('the receipt chooser remains bound to the original pre-navigation GM rather than self-authorizing a replacement', async () => {
  const f = receiptSurface({ ...original(), uidHash: 'b'.repeat(16) });
  let clicks = 0;
  await assert.rejects(captureLifecycleUiAction(f.surface, 'setGmShipConsoleWriteGrant', async () => { clicks++; },
    { gm: true, original: original(), deadlineAt: Date.now() + 500 }));
  assert.equal(clicks, 0);
  assert.deepEqual(f.waits, []);
});

for (const outcome of [{ httpStatus: 403, body: { error: { status: 'PERMISSION_DENIED' } } },
  { body: { error: { status: 'UNAVAILABLE' } } }, { body: {} },
  ...['denied', 'queued', 'stale'].map(status => ({ body: { result: { status } } }))]) {
  test(`the shared deadline never credits a rejected actual UI receipt: ${JSON.stringify(outcome)}`, async () => {
    const f = receiptSurface(original(), outcome);
    await assert.rejects(captureLifecycleUiAction(f.surface, 'setGmShipConsoleWriteGrant', async () => {},
      { gm: true, original: original(), deadlineAt: Date.now() + 500 }));
  });
}
